/**
 * The workspace's own settings, for the people who run it (ADR 0085): a group under the
 * workspace's name that only an owner or an admin sees, which its heading says at its right.
 * Everything else on You is this person's or this phone's; this is everyone's, which is why it
 * stands apart, between how You looks and what this phone holds (ADR 0085, 20 October 2026). Each
 * row wears a mark, as every row on You does, so the words of every card start at one edge.
 *
 * People opens everyone in the workspace, each opening a page where their role changes or they
 * are removed; Invite someone, an owner's alone, opens the page that makes a link (people review,
 * Phase 1). People's row counts who is here by role, with their faces; Invite someone's says how
 * many links are open and when the next runs out, read each time the connection opens (ADR 0209).
 *
 * Connect a harness does what the Agents shelf's last tile does (ADR 0185's addendum): it opens
 * the sheet that walks a harness to its hello (ADR 0190), and says so while a link waits. Arjun, 17 October 2026: "I do not
 * expect connect a harness to be use a whole lot, so let's keep it as the last tile. Also show it
 * as an option in the You section."
 *
 * What may be attached (ADR 0047) is the one such setting a phone carries, because the phone is
 * where a file too big is met. The row says the limit; its sheet holds three sizes in megabytes,
 * blank for the server's own, and refuses one above what the server takes in the server's own
 * words. The server's ceiling is read each time the connection opens — a tab stays mounted, and
 * a server that came back, or was restarted onto a build that answers, is asked again.
 *
 * When Chips steps in on agents talking to each other (ADR 0187) is the other: the row says the
 * stop and the hold, and its sheet (`ExchangeLimitsSheet.tsx`) sets them and the circles switch.
 *
 * Allowed always (ADR 0195) is the shortcut to what a person's Always let each harness go ahead
 * with: the row says how many are on, and its sheet (`AlwaysSheet.tsx`) switches and removes them
 * as each harness's page does.
 *
 * Relay (ADR 0211, Phase 4), an owner's alone and only where the server has one, opens the page
 * that turns it off and on (`RelayPage.tsx`); the row says which it is.
 *
 * The workspace's name is changed from the Workspace row under your name (ADR 0194), in the sheet
 * Spaces' name opens too; a Name row here said it a second time.
 *
 * The sheets stand beside You's scroll, not in it (`You.tsx`).
 */

import {
  alwaysSummary,
  capsDraft,
  capsFromDraft,
  capsSentence,
  type Invite,
  limitsWords,
  liveInvites,
  openLinksWords,
  peopleOf,
  roleCountWords,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import {
  type AttachmentCaps,
  CAP_KINDS,
  CAP_WORDS,
  type CapKind,
  capsOverCeiling,
  type ExchangeLimits,
} from "@chipschat/protocol";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { useConnect } from "../harnesses/Connect";
import { FaceStack } from "../people/Faces";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { AVATAR_HUES, TEXT } from "../ui/tokens";
import { AlwaysSheet } from "./AlwaysSheet";
import { ExchangeLimitsSheet } from "./ExchangeLimitsSheet";
import { SheetHead } from "./SheetHead";
import type { YouSection } from "./section";
import { capsWords } from "./words";

export function useWorkspaceGroup({
  store,
  name,
  caps,
  limits,
  connected,
  may,
  invites,
  people,
  snapshot,
  selfId,
  relay,
}: {
  readonly store: Store;
  /** What each harness is allowed always (ADR 0195), for the row and its sheet. */
  readonly snapshot: Snapshot;
  readonly selfId: string;
  /** The workspace's name, which heads the group. */
  readonly name: string;
  readonly caps: AttachmentCaps;
  /** When Chips steps in on agents talking to each other (ADR 0187). */
  readonly limits: ExchangeLimits;
  readonly connected: boolean;
  /** An owner or an admin: nobody else sees the group, and nothing is read for them. */
  readonly may: boolean;
  /** An owner: only they invite (ADR 0034's addendum of 14 October 2026). */
  readonly invites: boolean;
  /** How many people are in the workspace, which People's row says. */
  readonly people: number;
  /** For an owner: whether the relay is on. Nothing for anyone else, and there is no row. */
  readonly relay?: boolean | undefined;
}): YouSection {
  const router = useRouter();
  const palette = usePalette();
  const [ceiling, setCeiling] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [talk, setTalk] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [links, setLinks] = useState<readonly Invite[] | undefined>(undefined);
  const connecting = useConnect();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `people` is when to read again.
  useEffect(() => {
    if (!invites || !connected) return;
    let live = true;
    store.invites().then(
      (found) => {
        if (live) setLinks(liveInvites(found, Date.now()));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, connected, invites, people]);
  useEffect(() => {
    if (!may || !connected) return;
    let live = true;
    store.serverLimits().then(
      (found) => {
        if (live) setCeiling(found.maxAttachmentBytes);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, connected, may]);
  if (!may) return { group: null, overlays: null };
  const linksSaid = links === undefined ? undefined : openLinksWords(links, Date.now());
  const group = (
    <>
      <GroupHeading
        trailing={
          <Text style={[styles.whose, { color: palette.ink3 }]} numberOfLines={1}>
            Owners and admins
          </Text>
        }
      >
        {name}
      </GroupHeading>
      <Group inset={MARKED_INSET} testID="workspace">
        <GroupRow
          label="People"
          sub={roleCountWords(snapshot.model)}
          mark={<RowMark icon="user" tint={AVATAR_HUES[7]} ink="#ffffff" />}
          trailing={
            <FaceStack
              directory={snapshot.directory}
              ids={peopleOf(snapshot.model).map((each) => each.participantId)}
              size="xs"
              most={4}
            />
          }
          accessibilityLabel={`People: ${roleCountWords(snapshot.model)}`}
          onPress={() => router.push("/people")}
          testID="people-row"
        />
        {invites ? (
          <GroupRow
            label="Invite someone"
            sub={linksSaid}
            mark={<RowMark icon="mail" tint={AVATAR_HUES[1]} ink="#ffffff" />}
            accessibilityLabel={
              linksSaid === undefined ? "Invite someone" : `Invite someone: ${linksSaid}`
            }
            onPress={() => router.push("/invite")}
            testID="invite-row"
          />
        ) : null}
        {relay === undefined ? null : (
          <GroupRow
            label="Relay"
            value={relay ? "On" : "Off"}
            mark={<RowMark icon="route" tint={AVATAR_HUES[5]} ink="#ffffff" />}
            onPress={() => router.push("/relay")}
            testID="relay-row"
          />
        )}
        <GroupRow
          label="Connect a harness"
          mark={<RowMark icon="terminal" tint={HARNESS_TILE} ink="#ffffff" />}
          value={
            connecting.waiting === undefined
              ? undefined
              : connecting.waiting.taken
                ? "Connecting…"
                : `Waiting, ${connecting.waiting.left}`
          }
          onPress={connecting.open}
          testID="connect-harness-row"
        />
        <GroupRow
          label="Attachment limits"
          value={capsWords(caps, ceiling)}
          mark={<RowMark icon="clip" tint={AVATAR_HUES[2]} ink="#ffffff" />}
          onPress={() => setOpen(true)}
          testID="caps-row"
        />
        <GroupRow
          label="Messages between agents"
          sub={limitsWords(limits)}
          mark={<RowMark icon="chat" tint={AVATAR_HUES[0]} ink="#ffffff" />}
          accessibilityLabel={`Messages between agents, ${limitsWords(limits)}`}
          onPress={() => setTalk(true)}
          testID="exchange-limits-row"
        />
        <GroupRow
          label="Allowed always"
          value={alwaysSummary(snapshot.model, snapshot.directory)}
          mark={<RowMark icon="unlock" tint={AVATAR_HUES[3]} ink="#ffffff" />}
          onPress={() => setAllowed(true)}
          testID="allowed-always-row"
        />
      </Group>
    </>
  );
  const overlays = (
    <>
      <CapsSheet
        open={open}
        onClose={() => setOpen(false)}
        caps={caps}
        ceiling={ceiling}
        onSave={(next) => store.setAttachmentCaps(next)}
      />
      <ExchangeLimitsSheet
        open={talk}
        onClose={() => setTalk(false)}
        limits={limits}
        onSave={(next) => store.setExchangeLimits(next)}
      />
      <AlwaysSheet
        open={allowed}
        onClose={() => setAllowed(false)}
        store={store}
        snapshot={snapshot}
        selfId={selfId}
      />
    </>
  );
  return { group, overlays };
}

const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Connect a harness's mark: a terminal's grey, since a harness is a program that runs itself. */
const HARNESS_TILE = "#494d54";

function CapsSheet({
  open,
  onClose,
  caps,
  ceiling,
  onSave,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly caps: AttachmentCaps;
  readonly ceiling: number | undefined;
  readonly onSave: (caps: AttachmentCaps) => void;
}) {
  const palette = usePalette();
  const [draft, setDraft] = useState<Record<CapKind, string>>(() => capsDraft(caps));
  const [error, setError] = useState<string | undefined>(undefined);
  // The server's word replaces the draft: what was saved, on any device, is what the fields show.
  useEffect(() => setDraft(capsDraft(caps)), [caps]);
  // Each opening starts clean.
  useEffect(() => {
    if (open) setError(undefined);
  }, [open]);

  const save = () => {
    const read = capsFromDraft(draft);
    if ("error" in read) {
      setError(read.error);
      return;
    }
    const over = ceiling === undefined ? undefined : capsOverCeiling(read.caps, ceiling);
    if (over !== undefined) {
      setError(over);
      return;
    }
    onSave(read.caps);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} keyboard testID="caps-sheet">
      <SheetHead title="Attachment limits" action={{ label: "Save", onPress: save }} />
      <Group>
        {CAP_KINDS.map((kind) => (
          <GroupRow
            key={kind}
            label={capitalised(CAP_WORDS[kind].many)}
            trailing={
              <>
                <TextInput
                  accessibilityLabel={capitalised(CAP_WORDS[kind].many)}
                  testID={`cap-${kind}`}
                  value={draft[kind]}
                  onChangeText={(typed) => {
                    setDraft({ ...draft, [kind]: typed });
                    setError(undefined);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={
                    ceiling === undefined ? "server's" : String(Math.round(ceiling / 1024 / 1024))
                  }
                  placeholderTextColor={palette.ink3}
                  style={[styles.field, { color: palette.ink }]}
                />
                <Text style={[styles.unit, { color: palette.ink3 }]}>MB</Text>
              </>
            }
          />
        ))}
      </Group>
      {error === undefined ? (
        <GroupFoot testID="caps-words">
          {capsSentence(caps, ceiling)} Blank is the server's own limit.
        </GroupFoot>
      ) : (
        <GroupFoot tone={palette.red} testID="caps-error">
          {error}
        </GroupFoot>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  whose: { fontSize: TEXT.sm },
  field: { fontSize: TEXT.body, textAlign: "right", minWidth: 72, paddingVertical: 4 },
  unit: { fontSize: TEXT.body },
});
