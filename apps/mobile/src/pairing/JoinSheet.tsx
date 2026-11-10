/**
 * An invite opened on a phone that is in a workspace already (ADR 0164): a sheet over whatever
 * was on the screen, reading the link and then saying what it means here.
 *
 * - The workspace the phone is in: it says so and opens it. The link is left unused, so it can go
 *   to somebody else; one person to a phone.
 * - A workspace the phone holds behind the one in front: it says so and switches to it.
 * - Another workspace: joined alongside (ADR 0197), the one it is in staying. Until then the phone
 *   held one at a time and joining signed it out of this one. The name is the one you go by here;
 *   one somebody there goes by already is asked for again, in a field holding it, on the same link.
 * - A link that can't be used, or a server that can't be reached: why, and OK.
 *
 * A space's link (ADR 0168) in the workspace the phone is in asks about the space instead: one
 * the person is in opens; one they are not in asks, and lets them in as the link's maker would
 * add them (his "A" of 15 October), the link left unused; a guest in a space already is told a
 * guest is in one. Whatever opens, opens once the sheet has gone (`app/join.tsx`).
 */

import type { Device, InvitePeek, Snapshot } from "@chipschat/core";
import {
  alreadyInAsking,
  DEAD_INVITE,
  invitedWords,
  isDemo,
  joinAlongsideAsking,
  nameTaken,
  nameTakenWords,
  type Store,
  spaceLinkAsking,
  workspaceLabel,
} from "@chipschat/core";
import { type ReactNode, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { deviceWord } from "../device/word";
import { ConfirmBody } from "../spaces/ConfirmSheet";
import { useChips, useSnapshot } from "../store/provider";
import { Button } from "../ui/Button";
import { ChipPulse } from "../ui/ChipPulse";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { Big } from "./JoinCard";
import { type InviteOffer, troubleOf, useInvite } from "./useInvite";

export function JoinSheet({
  offer,
  paired,
  onDone,
}: {
  readonly offer: InviteOffer | undefined;
  /** The workspace this phone is in when the link arrives. */
  readonly paired: { readonly device: Device; readonly store: Store };
  /**
   * When the sheet has gone: back to what was under it, or, with the device `joined` by or held
   * already, into that workspace, at Spaces. A space's link names its space, to open in either
   * (ADR 0168).
   */
  readonly onDone: (joined: Device | undefined, spaceId?: string) => void;
}) {
  const palette = usePalette();
  const { devices } = useChips();
  // The workspace it opened in, held: once joined, the provider names the new one, and the sheet
  // on its way down must not turn into "You're already in" the one just joined.
  const [here] = useState(paired);
  const [joinedThere, setJoinedThere] = useState<Device | undefined>(undefined);
  // A space here to open once the sheet has gone (ADR 0168): one the person is in, or let into.
  const [landing, setLanding] = useState<string | undefined>(undefined);
  const snapshot = useSnapshot(here.store);
  const { opened, join } = useInvite(offer);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // The name to join under, typed, once the one you go by here was taken there (ADR 0197). From
  // Look around it is asked at once: the demo calls everybody "You" (the onboarding audit, item 27).
  const [naming, setNaming] = useState<string | undefined>(() =>
    isDemo(paired.device) ? "" : undefined,
  );
  const workspace = workspaceLabel(here.device);
  const name =
    snapshot.directory[here.device.participantId]?.displayName ?? here.device.displayName;
  const close = () => {
    if (!busy) setOpen(false);
  };

  // Joined first, and the sheet goes down over the workspace it opened in, untouched. Only once it
  // has gone does the phone change workspace (`onDone`, as the card does): changing it rebuilds
  // every screen, and a sheet still up would be rebuilt with them.
  const joinThere = () => {
    const as = (naming ?? name).trim();
    if (as === "" || opened.kind !== "ready") return;
    setBusy(true);
    setFailed(undefined);
    join(as)
      .then((joined) => {
        setJoinedThere(joined);
        setOpen(false);
      })
      .catch((error: unknown) => {
        if (!nameTaken(error)) {
          setFailed(troubleOf(error));
          return;
        }
        // Nothing was spent: the same link takes another name, typed where this one is.
        setNaming(as);
        setFailed(nameTakenWords({ name: as, workspace: opened.invite.workspaceName }));
      })
      .finally(() => setBusy(false));
  };

  // Let into a space of this workspace by its link (ADR 0168), as its maker would add them.
  const enter = () => {
    if (offer === undefined) return;
    setBusy(true);
    setFailed(undefined);
    here.store
      .enterByInvite(offer.token)
      .then((entered) => {
        setLanding(entered.spaceId);
        setOpen(false);
      })
      .catch((error: unknown) =>
        setFailed(error instanceof Error ? error.message : troubleOf(error)),
      )
      .finally(() => setBusy(false));
  };
  const openSpace = (spaceId: string) => {
    setLanding(spaceId);
    close();
  };

  // A workspace this phone holds behind the one in front, which the link is for.
  const behind =
    opened.kind === "ready"
      ? devices.find(
          (device) =>
            device.workspaceId === opened.invite.workspaceId &&
            device.deviceId !== here.device.deviceId,
        )
      : undefined;
  const [switching, setSwitching] = useState(false);

  // The one it was in stays (ADR 0197): the workspace joined, or held already, comes in front.
  const gone = () => {
    const into = joinedThere ?? (switching ? behind : undefined);
    if (into === undefined) {
      onDone(undefined, landing);
      return;
    }
    onDone(into, opened.kind === "ready" ? opened.invite.spaceId : undefined);
  };

  const mark = (working: boolean) => (
    <Big scale={1.8}>
      <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working={working} />
    </Big>
  );

  let body: ReactNode;
  if (opened.kind === "asking") {
    body = (
      <Said mark={mark(true)} title="Reading the invite…" words="" testID="join-sheet-asking" />
    );
  } else if (opened.kind === "dead") {
    body = (
      <Said
        mark={mark(false)}
        title={DEAD_INVITE.title}
        words={DEAD_INVITE.body}
        act="OK"
        onAct={close}
        testID="join-sheet-dead"
      />
    );
  } else if (opened.kind === "trouble") {
    body = (
      <Said
        mark={mark(false)}
        title="Couldn't read the invite"
        words={opened.message}
        act="OK"
        onAct={close}
        testID="join-sheet-trouble"
      />
    );
  } else if (
    opened.invite.workspaceId === here.device.workspaceId &&
    opened.invite.spaceId !== undefined
  ) {
    body = (
      <IntoSpace
        invite={opened.invite}
        spaceId={opened.invite.spaceId}
        snapshot={snapshot}
        selfId={here.device.participantId}
        name={name}
        mark={mark(busy)}
        busy={busy}
        failed={failed}
        onEnter={enter}
        onOpen={openSpace}
        onClose={close}
      />
    );
  } else if (opened.invite.workspaceId === here.device.workspaceId) {
    const asking = alreadyInAsking({ workspace, name, here: deviceWord() });
    body = (
      <Said
        mark={mark(false)}
        title={asking.title}
        words={asking.body}
        act={asking.confirm}
        gold
        onAct={close}
        testID="join-sheet-already"
      />
    );
  } else if (behind !== undefined) {
    const there = workspaceLabel(behind);
    body = (
      <Said
        mark={mark(false)}
        title={`You're in ${there} on this ${deviceWord()}`}
        words={`It's behind ${workspace}. The link stays unused, so it can go to somebody else.`}
        act={`Switch to ${there}`}
        gold
        onAct={() => {
          setSwitching(true);
          close();
        }}
        testID="join-sheet-behind"
      />
    );
  } else {
    body = (
      <View testID="join-sheet-other">
        <ConfirmBody
          room={{
            face: mark(busy),
            name: opened.invite.workspaceName,
            last: invitedWords(opened.invite),
          }}
          confirming={{
            asking: joinAlongsideAsking({
              invite: opened.invite,
              here: workspace,
              name,
              on: { device: deviceWord(), place: "Spaces" },
              naming: naming !== undefined,
            }),
            // Nothing is signed out, so it is gold rather than red.
            tone: palette.gold,
            ink: "#14161b",
            busy,
            failed,
          }}
          onConfirm={joinThere}
          onCancel={close}
          cancel="Not now"
          field={
            naming === undefined
              ? undefined
              : {
                  label: `Your name in ${opened.invite.workspaceName}`,
                  value: naming,
                  onChange: setNaming,
                  testID: "join-sheet-name",
                }
          }
        />
      </View>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      closable={!busy}
      onGone={gone}
      keyboard={naming !== undefined}
      testID="join-sheet"
    >
      {body}
    </Sheet>
  );
}

/**
 * A space's link in the workspace the phone is in (ADR 0168): open the space they are in, let them
 * into one they are not, or tell a guest in a space already why not.
 */
function IntoSpace({
  invite,
  spaceId,
  snapshot,
  selfId,
  name,
  mark,
  busy,
  failed,
  onEnter,
  onOpen,
  onClose,
}: {
  readonly invite: InvitePeek;
  readonly spaceId: string;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly name: string;
  readonly mark: ReactNode;
  readonly busy: boolean;
  readonly failed: string | undefined;
  readonly onEnter: () => void;
  readonly onOpen: (spaceId: string) => void;
  readonly onClose: () => void;
}) {
  const { kind, asking } = spaceLinkAsking({
    invite,
    spaceId,
    model: snapshot.model,
    directory: snapshot.directory,
    selfId,
    name,
  });
  if (kind === "in") {
    return (
      <Said
        mark={mark}
        title={asking.title}
        words={asking.body}
        act={asking.confirm}
        gold
        onAct={() => onOpen(spaceId)}
        testID="join-sheet-in-space"
      />
    );
  }
  if (kind === "guest_elsewhere") {
    return (
      <Said
        mark={mark}
        title={asking.title}
        words={asking.body}
        act={asking.confirm}
        onAct={onClose}
        testID="join-sheet-guest-elsewhere"
      />
    );
  }
  return (
    <Said
      mark={mark}
      title={asking.title}
      words={asking.body}
      act={busy ? "Joining…" : asking.confirm}
      gold
      onAct={onEnter}
      cancel="Not now"
      onCancel={onClose}
      busy={busy}
      failed={failed}
      testID="join-sheet-enter"
    />
  );
}

/** A sheet that says one thing: the mark, a title, why, and a button on, or two. */
function Said({
  mark,
  title,
  words,
  act,
  gold = false,
  onAct,
  cancel,
  onCancel,
  busy = false,
  failed,
  testID,
}: {
  readonly mark: ReactNode;
  readonly title: string;
  readonly words: string;
  readonly act?: string;
  readonly gold?: boolean;
  readonly onAct?: () => void;
  readonly cancel?: string;
  readonly onCancel?: () => void;
  readonly busy?: boolean;
  readonly failed?: string | undefined;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.said} testID={testID}>
      <View style={styles.mark}>{mark}</View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {title}
      </Text>
      {words === "" ? null : <Text style={[styles.words, { color: palette.ink2 }]}>{words}</Text>}
      {failed === undefined ? null : (
        <Text style={[styles.words, { color: palette.red }]} testID={`${testID}-failed`}>
          {failed}
        </Text>
      )}
      {act === undefined || onAct === undefined ? null : (
        <Button
          label={act}
          variant={gold ? "gold" : "default"}
          onPress={onAct}
          busy={busy}
          disabled={busy}
          style={styles.act}
        />
      )}
      {cancel === undefined || onCancel === undefined ? null : (
        <Button label={cancel} onPress={onCancel} disabled={busy} style={styles.second} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  said: { gap: SPACE.xs, paddingTop: SPACE.sm },
  mark: { alignItems: "flex-start", marginBottom: SPACE.sm },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3 },
  words: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
  act: { marginTop: SPACE.xl },
  second: { marginTop: SPACE.sm },
});
