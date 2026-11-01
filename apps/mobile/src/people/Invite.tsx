/**
 * Invite someone, from You (people review, Phase 1), an owner's alone (ADR 0034's addendum of 14
 * October 2026): the form (`InviteForm`), and the open links under it, each sliding left on a red
 * Withdraw, as the desktop's card lists them with a button. A link made from a space's Add page
 * names its space here (ADR 0168).
 *
 * Each open link wears a ring of the time it has left, amber near its end (`linkEnding`), and says
 * how long that is; the one just made comes in lit gold and fades to the others. Under them, the
 * links somebody joined by, with their faces: who came by which (ADR 0209).
 *
 * The page glides down to the link it makes, its QR code too, as a space's Invite page does
 * (`useScrollGlide`): drawn under the form, it was left below the foot of the screen.
 */

import {
  type Invite as InviteRow,
  inviteRowWords,
  joinedBy,
  leftWords,
  lifeLeft,
  linkEnding,
  liveInvites,
  nameOf,
  namesWords,
  type Store,
  spaceTitle,
  usedInvites,
} from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { SwipeRow } from "../spaces/SwipeRow";
import { useSnapshot } from "../store/provider";
import { Group, GroupFoot, GroupHeading, GroupRow } from "../ui/Group";
import { UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE } from "../ui/tokens";
import { useScrollGlide } from "../ui/useScrollGlide";
import { FaceStack } from "./Faces";
import { InviteForm } from "./InviteForm";
import { LifeRing } from "./LifeRing";
import { Lit } from "./PeopleMotion";
import { shortDayWords, untilWords } from "./words";

export function Invite({
  store,
  selfId,
  workspace,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** The workspace as a sentence names it. */
  readonly workspace: string;
}) {
  const snapshot = useSnapshot(store);
  const palette = usePalette();
  const column = useColumn();
  const [gone, setGone] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // The link just made, lit as it lands in the list.
  const [fresh, setFresh] = useState<string | undefined>(undefined);
  const { all, links, reload } = useInvites(store, snapshot.directory);
  const now = Date.now();
  const used = all === undefined ? [] : usedInvites(snapshot.model, all);
  const open = useRef<SwipeableMethods | undefined>(undefined);
  const glide = useScrollGlide();

  const withdraw = async (inviteId: string) => {
    setError(undefined);
    try {
      await store.revokeInvite(inviteId);
      setGone((now) => [...now, inviteId]);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The server would not do it.");
    }
  };
  // A space's link names its space (ADR 0168), as the room is called here.
  const spaceOf = (link: InviteRow) => {
    if (link.spaceId === undefined) return undefined;
    const space = snapshot.model.spaces.find((each) => each.id === link.spaceId);
    return space === undefined ? "a space" : spaceTitle(space, snapshot.directory, selfId);
  };

  return (
    <UnderName
      contentContainerStyle={[styles.page, column]}
      keyboardShouldPersistTaps="handled"
      testID="invite-page"
      {...glide.list}
    >
      <InviteForm
        store={store}
        selfId={selfId}
        workspace={workspace}
        gone={gone}
        onMade={(made) => {
          setFresh(made);
          void reload();
        }}
        onShown={glide.down}
      />
      {error === undefined ? null : (
        <GroupFoot tone={palette.red} testID="invite-error">
          {error}
        </GroupFoot>
      )}
      <GroupHeading>Open links</GroupHeading>
      {links === undefined || links.length === 0 ? (
        <GroupFoot testID="no-links">
          {links === undefined
            ? "Reading…"
            : "None. A link made here shows until it's used up, lapses or is withdrawn."}
        </GroupFoot>
      ) : (
        <GestureHandlerRootView>
          <Group testID="invite-links">
            {links.map((link) => (
              <SwipeRow
                key={link.inviteId}
                acts={["withdraw"] as const}
                palette={palette}
                onAct={() => void withdraw(link.inviteId)}
                onOpen={(swiped) => {
                  if (open.current !== swiped) open.current?.close();
                  open.current = swiped;
                }}
                onClose={(swiped) => {
                  if (open.current === swiped) open.current = undefined;
                }}
                testID={`invite-swipe-${link.inviteId}`}
              >
                {/* A screen reader can't swipe: the row offers Withdraw as an action. */}
                <View
                  accessible
                  accessibilityLabel={`${inviteRowWords(link, spaceOf(link))} link, ${untilWords(link.expiresAt)}`}
                  accessibilityActions={[{ name: "withdraw", label: "Withdraw" }]}
                  onAccessibilityAction={() => void withdraw(link.inviteId)}
                  testID={`invite-row-${link.inviteId}`}
                >
                  <Lit on={link.inviteId === fresh} colour={palette.gold}>
                    <GroupRow
                      mark={<LifeRing left={lifeLeft(link, now)} ending={linkEnding(link, now)} />}
                      label={inviteRowWords(link, spaceOf(link))}
                      sub={`${leftWords(link.expiresAt, now)} · ${untilWords(link.expiresAt)} · by ${byWords(link, selfId, snapshot.directory)}`}
                    />
                  </Lit>
                </View>
              </SwipeRow>
            ))}
          </Group>
        </GestureHandlerRootView>
      )}
      {used.length === 0 ? null : (
        <>
          <GroupHeading>Used</GroupHeading>
          <Group testID="used-links" inset={SPACE.lg + 52 + SPACE.md}>
            {used.map((link) => {
              const came = joinedBy(snapshot.model, link);
              const names = came.map((each) => nameOf(snapshot.directory, each.participantId));
              return (
                <GroupRow
                  key={link.inviteId}
                  mark={
                    <View style={styles.came}>
                      <FaceStack
                        directory={snapshot.directory}
                        ids={came.map((each) => each.participantId)}
                        size="sm"
                        most={2}
                      />
                    </View>
                  }
                  label={inviteRowWords(link, spaceOf(link))}
                  sub={`${namesWords(names)} joined by it, ${shortDayWords(came[0]?.joinedAt ?? link.createdAt)}`}
                  testID={`used-${link.inviteId}`}
                />
              );
            })}
          </Group>
          <GroupFoot>Each link somebody joined by, and who came by it.</GroupFoot>
        </>
      )}
    </UnderName>
  );
}

function byWords(link: InviteRow, selfId: string, directory: Parameters<typeof nameOf>[0]) {
  return link.createdBy === selfId ? "you" : nameOf(directory, link.createdBy);
}

/**
 * The open links, read as the page comes up, after each change made here, and again when somebody
 * joins: a join spends a link or counts a use.
 */
function useInvites(store: Store, directory: Parameters<typeof nameOf>[0]) {
  const [all, setAll] = useState<InviteRow[] | undefined>(undefined);
  const reload = useCallback(async () => {
    try {
      setAll(await store.invites());
    } catch {
      setAll((now) => now ?? []);
    }
  }, [store]);
  const people = Object.values(directory).filter((each) => each.kind === "person").length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `people` is when to read again.
  useEffect(() => {
    void reload();
  }, [reload, people]);
  const links = all === undefined ? undefined : liveInvites(all, Date.now());
  return { all, links, reload };
}

const styles = StyleSheet.create({
  page: { paddingBottom: SPACE.xxl * 2 },
  came: { width: 52, alignItems: "flex-start" },
});
