/**
 * What stands beside Search's results on an iPad (ADR 0256), so a result is looked at before the
 * tab is left for it: the room it was found in, at the line, the words ringed in gold as Spaces
 * rings them, with Open in Spaces to go there; an agent's card, for an agent; a room's own agent's
 * card over the room, with the way back to it, as beside Spaces. Before anything is typed or
 * opened, the faces of your spaces drift there, as they do under the field on a phone (`Backdrop`).
 *
 * What is open is kept by the tabs (`ui/opened.tsx`): Spaces looked at and Search come back to, the
 * result is still open beside the results.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AgentPane } from "../agents/AgentPane";
import { RoomPane } from "../spaces/RoomPane";
import type { Opened } from "../ui/opened";
import { PaneEmpty } from "../ui/Pane";
import { usePalette } from "../ui/theme";
import { useTabTop } from "../ui/windowInsets";
import { Backdrop, type BackdropFace } from "./Backdrop";
import { spaceHref } from "./items";

/** What says what is open beside Search: a room and where in it, and an agent's card. */
export const SEARCH_OPEN = ["space", "at", "words", "agent", "history"] as const;

export function Found({
  store,
  snapshot,
  selfId,
  opened,
  go,
  faces,
  typed,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly opened: Opened;
  readonly go: (next: Opened) => void;
  readonly faces: readonly BackdropFace[];
  /** Something is typed: the faces have gone, as they go from under the field. */
  readonly typed: boolean;
}) {
  const router = useRouter();
  const palette = usePalette();
  const { at, words, agent, history } = opened;
  // A room gone from under the reader leaves nothing to look at.
  const space = snapshot.model.spaces.some((each) => each.id === opened["space"])
    ? opened["space"]
    : undefined;
  const room = { space, at, words };
  const card =
    agent === undefined ? null : (
      <Card
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        agent={agent}
        history={history !== undefined}
        room={room}
        go={go}
      />
    );
  if (space === undefined) {
    if (card !== null) return card;
    if (typed) {
      return (
        <PaneEmpty icon="search" title="Nothing open">
          Choose a result on the left.
        </PaneEmpty>
      );
    }
    return <Drifting faces={faces} />;
  }
  return (
    <View style={styles.fill}>
      <RoomPane
        key={space}
        store={store}
        spaceId={space}
        selfId={selfId}
        at={at}
        words={words}
        onOpen={(id) => go({ space: id })}
        onOpenAgent={(id) => go({ ...room, agent: id })}
        onClose={() => go({})}
        onDetails={(item) => router.push(`/needs/${item.id}`)}
        preview={() => router.push(spaceHref(space, at, words))}
      />
      {card === null ? null : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>{card}</View>
      )}
    </View>
  );
}

/**
 * An agent's card, or its history: over the room it was opened from, with the way back to it, or
 * the top of the pane for an agent found by name.
 */
function Card({
  store,
  snapshot,
  selfId,
  agent,
  history,
  room,
  go,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly agent: string;
  readonly history: boolean;
  readonly room: Opened;
  readonly go: (next: Opened) => void;
}) {
  const router = useRouter();
  const over = room["space"] !== undefined;
  const back = history ? () => go({ ...room, agent }) : over ? () => go(room) : undefined;
  return (
    <AgentPane
      store={store}
      snapshot={snapshot}
      agentId={agent}
      selfId={selfId}
      history={history}
      onBack={back}
      onHistory={() => go({ ...room, agent, history: "1" })}
      onOpenRoom={(id) => go(id === room["space"] ? room : { space: id })}
      onOpenAgent={(other) => go({ ...room, agent: other })}
      onOpenHarness={(harnessId) => router.push(`/harnesses/${harnessId}`)}
      onDeleted={() => go(over ? room : {})}
    />
  );
}

/** The faces of your spaces, drifting up the pane from under the tab's bar. */
function Drifting({ faces }: { readonly faces: readonly BackdropFace[] }) {
  const palette = usePalette();
  const top = useTabTop();
  return (
    <View
      style={[styles.fill, { backgroundColor: palette.bg, paddingTop: top }]}
      testID="search-drifting"
    >
      <Backdrop faces={faces} shown />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
