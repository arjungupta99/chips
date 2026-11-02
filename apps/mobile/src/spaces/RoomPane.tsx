/**
 * A space in the detail half of a wide screen's split: the phone's room, beside the list (ADR
 * 0177).
 *
 * The same room as a phone's in everything but where it stands. Its name floats in the room's
 * glass capsule with who is in there under it, and opens the room's sheet; the connection's mark
 * stands at the bar's trailing end; the conversation runs up under both on the band of blur a
 * phone's room stands its bar on. It stops short of the iPad's own tab bar, above them
 * (`useTabTop`): a list that runs under the system's bar is given the system's edge effect, and on
 * a room's list, which is drawn upside down, that washed the whole conversation pale (the iPad
 * simulator, 16 October 2026; the phone's room turns it off on its own bar, `app/spaces/[id].tsx`,
 * which a tab's bar has no option for). Its band of blur still runs on up under the tab bar to the
 * window's top (`bandReach`), so what passes under the name is not cut off in a line there.
 *
 * A room made empty from the + opens on its Add, a locked room's Locked opens its sheet, and the
 * new-space window dissolves into the room once it has drawn itself, as on a phone
 * (`RoomHead.tsx`). Where there is no glass the bar stands above the room, ruled, as a pane's
 * does.
 *
 * A thread the log holds — opened before 15 September 2026, or by a harness — is named as one,
 * with a way back to the space it grew from: the same words the pushed screen uses on a phone,
 * because a screen that looks exactly like the space it grew from, and is not it, is the one
 * place somebody can send a reply to the wrong audience without noticing. Neither client offers
 * to open one (ADR 0035's addendum).
 */

import { type NeedsYouItem, ownsWorkspace, type Store, serverHost } from "@chipschat/core";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChips } from "../store/provider";
import { ConnectionMark, useMarking } from "../ui/Connection";
import { Capsule, useGlassy } from "../ui/Glass";
import { MarkBeside } from "../ui/MarkBeside";
import { PANE_BAR, PaneBar } from "../ui/Pane";
import { usePalette } from "../ui/theme";
import { useTabTop } from "../ui/windowInsets";
import { RoomName, UniverseButton, useRoom } from "./RoomHead";
import { RoomSheet } from "./RoomSheet";
import { SpaceView } from "./SpaceView";
import { UniverseSheet } from "./Universe";

export function RoomPane({
  store,
  spaceId,
  selfId,
  onOpen,
  onOpenAgent,
  onClose,
  at,
  words,
  add = false,
  sheet = false,
  onDetails,
}: {
  readonly store: Store;
  readonly spaceId: string;
  readonly selfId: string;
  /** Open another space in this same pane: a lane's other end, or the space a thread grew from. */
  readonly onOpen: (spaceId: string) => void;
  /** Open an agent's card over the room, in this same pane, with the way back to the room. */
  readonly onOpenAgent: (agentId: string) => void;
  /** The room is gone from under the reader: left, or taken out and seen. The pane empties. */
  readonly onClose: () => void;
  /** Where to land in it, as a link or a push says it. */
  readonly at?: string | undefined;
  /** What a search looked for, when it opened the room at a message (ADR 0133). */
  readonly words?: string | undefined;
  /** A room made empty from the +: it opens on its Add (ADR 0148). */
  readonly add?: boolean | undefined;
  /** A locked room's Locked on Spaces: it opens on its sheet (ADR 0156). */
  readonly sheet?: boolean | undefined;
  readonly onDetails?: ((item: NeedsYouItem) => void) | undefined;
}) {
  const palette = usePalette();
  const router = useRouter();
  const { paired } = useChips();
  // Beside the list the room does not slide in: it has landed as it is drawn.
  const room = useRoom({ store, spaceId, selfId, add, sheet, landed: true });
  const { snapshot, space, name } = room;
  const glassy = useGlassy();
  const {
    marking,
    room: markRoom,
    markedBy,
  } = useMarking(snapshot.connection, space?.project !== undefined);
  const top = useTabTop();
  // The bar's own height, measured, as the phone's is: a larger text size makes it taller.
  const [bar, setBar] = useState(PANE_BAR);
  // Universe, from the bar's right (ADR 0227).
  const [universe, setUniverse] = useState(false);
  const parent = space?.parentSpaceId;
  const head = (
    <PaneBar
      onBack={parent === undefined ? undefined : () => onOpen(parent)}
      ruled={!glassy}
      trailing={
        <Marks
          room={markRoom}
          mark={
            marking ? (
              <ConnectionMark
                state={snapshot.connection}
                link={snapshot.link}
                lostAt={snapshot.lostAt}
                server={serverHost(paired?.device.serverUrl)}
                noRelay={paired !== undefined && paired.device.relayUrl === undefined}
                owner={ownsWorkspace(snapshot.directory, selfId)}
                onRetry={store.wake}
                {...markedBy}
              />
            ) : null
          }
          onUniverse={space?.project === undefined ? undefined : () => setUniverse(true)}
        />
      }
    >
      <RoomName room={room} glassy={glassy} />
    </PaneBar>
  );
  const body = (
    <SpaceView
      store={store}
      snapshot={snapshot}
      spaceId={spaceId}
      selfId={selfId}
      onOpenSpace={onOpen}
      onOpenAgent={onOpenAgent}
      at={at}
      words={words}
      onDetails={onDetails}
      onTakenSeen={onClose}
      headHeight={glassy ? bar : 0}
      bandReach={glassy ? top : 0}
      onOpenRoom={room.sheet.show}
      // A frame on, so what was laid out has been drawn, and the new-space window can go into it.
      onListed={() => requestAnimationFrame(room.drawn)}
      onDrawn={() => requestAnimationFrame(room.drawn)}
    />
  );
  const sheetUp =
    space === undefined ? null : (
      <RoomSheet
        store={store}
        snapshot={snapshot}
        space={space}
        title={name}
        selfId={selfId}
        open={room.sheet.open}
        opensOn={room.sheet.opensOn}
        onClose={room.sheet.close}
        files={paired?.files}
        workspace={paired?.device.workspaceName ?? "the workspace"}
        onGoTo={(lineId) => router.setParams({ at: `line:${lineId}`, words: undefined })}
        // An agent's row opens its card over the room, in this pane (ADR 0111's addendum).
        onOpenAgent={onOpenAgent}
        onOpenMedia={() => router.push(`/media?space=${encodeURIComponent(space.id)}`)}
        onLeft={onClose}
      />
    );
  const universeUp = (
    <UniverseSheet
      store={store}
      space={space}
      selfId={selfId}
      title={name}
      open={universe}
      onClose={() => setUniverse(false)}
    />
  );
  if (!glassy) {
    return (
      <SafeAreaView edges={TOP_AND_RIGHT} style={[styles.pane, { backgroundColor: palette.bg }]}>
        {head}
        <View style={styles.pane}>{body}</View>
        {sheetUp}
        {universeUp}
      </SafeAreaView>
    );
  }
  return (
    <View style={[styles.pane, { backgroundColor: palette.bg, paddingTop: top }]}>
      <View style={styles.pane}>
        {body}
        <View
          style={styles.floating}
          pointerEvents="box-none"
          onLayout={(event) => setBar(event.nativeEvent.layout.height)}
        >
          {head}
        </View>
      </View>
      {sheetUp}
      {universeUp}
    </View>
  );
}

const TOP_AND_RIGHT = ["top", "right"] as const;

/** The bar's capsule: the connection's mark while it shows, and Universe for a room with a project. */
function Marks({
  mark,
  room,
  onUniverse,
}: {
  readonly mark: ReactNode;
  readonly room: boolean;
  readonly onUniverse: (() => void) | undefined;
}) {
  if (mark === null && onUniverse === undefined) return null;
  return (
    <Capsule style={styles.mark}>
      <MarkBeside mark={mark} open={room}>
        {onUniverse === undefined ? null : <UniverseButton onPress={onUniverse} />}
      </MarkBeside>
    </Capsule>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  floating: { position: "absolute", top: 0, left: 0, right: 0 },
  mark: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // The connection's mark and Universe's sit apart as on a phone's bar (`MarkBeside`).
    paddingHorizontal: 12,
  },
});
