/**
 * A room's name and its sheet, the same wherever the room is drawn (ADR 0177): pushed on a phone
 * under the navigation bar (`app/spaces/[id].tsx`), and beside the list on an iPad, under a bar
 * of its own (`RoomPane.tsx`).
 *
 * Until 16 October 2026 the iPad's room had a bar with its bare name in it and nothing else: no
 * who-is-here under the name, no way to the room's sheet, so nobody there could see who was in a
 * room, add an agent, rename it, lock it or reach its media, and a room made empty from the + never
 * opened on its Add (the iPad simulator, 15 October 2026). What the phone's room knows about its
 * name and its sheet lives here now, and both draw it.
 */

import {
  cantAnswerIn,
  cantAnswerWords,
  roomSnapshot,
  type Snapshot,
  type Space,
  type Store,
  spaceSubtitle,
  spaceTitle,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet } from "react-native";
import { ArrivingTitle, Sweep } from "../newSpace/Naming";
import { useDrawnUnderWindow, useUnderWindow } from "../newSpace/NewSpace";
import { useNamed } from "../newSpace/useNamed";
import { useSnapshot } from "../store/provider";
import { Capsule } from "../ui/Glass";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE } from "../ui/tokens";
import { UniverseMark } from "../ui/UniverseMark";
import type { RoomPage } from "./RoomSheet";

export type { RoomPage };

export interface Room {
  /** The workspace as this room reads it: a harness waiting here goes by its agent's first name (ADR 0150). */
  readonly snapshot: Snapshot;
  readonly space: Space | undefined;
  /** The room's name, as the sheet titles it. */
  readonly name: string;
  /** The name as the bar says it: a thread's says so. */
  readonly title: string;
  /** Who is in there with you, under the name (WP3). */
  readonly subtitle: string | undefined;
  /** How many of its agents can't answer now, in amber beside it (ADR 0083). */
  readonly warning: string | undefined;
  /** A room asked of a harness without a name, named when the harness claims it. */
  readonly named: number;
  /** Still under the new-space window that made it: an Empty room's Add waits for it to go. */
  readonly held: boolean;
  /** Says, once the room has drawn itself, that the window can go into it. */
  readonly drawn: () => void;
  /** The room's sheet: who is here, and adding somebody (ADR 0087, Phase 4). */
  readonly sheet: {
    readonly open: boolean;
    readonly opensOn: RoomPage;
    readonly show: (page?: RoomPage) => void;
    readonly close: () => void;
  };
}

/**
 * The room's name and its sheet, and the two ways a route opens the sheet for it: on Add, for a
 * room made empty from the + once the window that made it has gone (ADR 0148); and on its first
 * page, where the lock is, for a locked room's Locked on Spaces once the room has `landed` (ADR
 * 0156). Each only the once: the route's word is taken off it as it is used.
 */
export function useRoom({
  store,
  spaceId,
  selfId,
  add,
  sheet,
  landed,
}: {
  readonly store: Store;
  readonly spaceId: string;
  readonly selfId: string;
  readonly add: boolean;
  readonly sheet: boolean;
  /** The room has come to rest where it is drawn: slid in on a phone, there at once in a pane. */
  readonly landed: boolean;
}): Room {
  const whole = useSnapshot(store);
  const snapshot = useMemo(() => roomSnapshot(whole, spaceId), [whole, spaceId]);
  const router = useRouter();
  const space = snapshot.model.spaces.find((each) => each.id === spaceId);
  // A thread is a space with a parent, so one the log holds opens through this same route —
  // from a link, since neither client offers to open one (ADR 0035's addendum). What it needs
  // is the word: a screen that looks exactly like the space it grew from, and is not it, is the
  // one place somebody can send a reply to the wrong audience without noticing.
  // A room somebody took this reader out of keeps its name in the bar over the notice (JR-6).
  const name =
    space === undefined
      ? (snapshot.model.takenOut[spaceId]?.title ?? "Space")
      : spaceTitle(space, snapshot.directory, selfId);
  const title = space?.parentSpaceId === undefined ? name : `Thread · ${name}`;
  // Who is in there with you, under the name of the room (WP3). The bar is the only place it is
  // said now that a room of two draws no faces, and it is said where a person looks before they
  // send: at the top of the screen they are about to send from.
  // A room the reader hid says so first (ADR 0205): it came from Hidden, and is quiet.
  const subtitle =
    space === undefined
      ? undefined
      : hiddenWords(
          snapshot.hiddenSpaces?.has(space.id) === true,
          spaceSubtitle(space, snapshot.directory),
        );
  const warning =
    space === undefined
      ? undefined
      : cantAnswerWords(cantAnswerIn(space, snapshot.directory).length);
  const held = useUnderWindow(spaceId);
  const drawn = useDrawnUnderWindow(spaceId);
  const named = useNamed(space);

  const [open, setOpen] = useState(false);
  const [opensOn, setOpensOn] = useState<RoomPage>("who");
  const show = useCallback((page: RoomPage = "who") => {
    // The keys go before the sheet comes up, as they do for the room's other sheets: iOS hands the
    // caret back to a field that held it under a sheet as the sheet leaves, and the keys jumped
    // back up with it (Arjun, 19 October 2026).
    Keyboard.dismiss();
    setOpensOn(page);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  // A room made empty from the + comes up on its Add once the window that made it has gone, and
  // only the once (ADR 0148).
  useEffect(() => {
    if (!add || held) return;
    show("add");
    router.setParams({ add: undefined });
  }, [add, held, router, show]);
  // A locked room's Locked on Spaces comes up on the sheet's first page, where the lock is, once
  // the room has come to rest rather than while it slides, and only the once (ADR 0156).
  useEffect(() => {
    if (!sheet || !landed) return;
    show("who");
    router.setParams({ sheet: undefined });
  }, [sheet, landed, router, show]);

  return {
    snapshot,
    space,
    name,
    title,
    subtitle,
    warning,
    named,
    held,
    drawn,
    sheet: { open, opensOn, show, close },
  };
}

/**
 * The room's name, pressed for its sheet: in a glass capsule where there is glass, with the gold
 * sweep a harness's naming draws across it (`newSpace/Naming.tsx`), and bare where there is not.
 */
export function RoomName({
  room,
  glassy,
}: {
  readonly room: Room;
  /** Whether the name floats on glass over the room, or stands in an opaque bar. */
  readonly glassy: boolean;
}) {
  const { title, subtitle, warning, named } = room;
  const words = <ArrivingTitle title={title} subtitle={subtitle} warning={warning} named={named} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, who is here`}
      accessibilityHint="Shows who is in this space, and adds somebody to it"
      onPress={() => room.sheet.show()}
      testID="room-capsule"
    >
      {glassy ? (
        <Capsule style={styles.name}>
          <Sweep named={named} />
          {words}
        </Capsule>
      ) : (
        words
      )}
    </Pressable>
  );
}

/** The mark is 22 points wide over a line's height; this brings its target up to Apple's 44. */
const SLOP = { top: 11, bottom: 11, left: 11, right: 11 };

/**
 * Universe from the room's bar, at the top right (ADR 0227): what the space made, to read on the
 * phone and to open or run on the Mac. Only for a room that has a project.
 */
export function UniverseButton({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Universe"
      hitSlop={SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.universe, pressed ? styles.pressed : null]}
      testID="room-universe-button"
    >
      <UniverseMark size={22} ink={palette.ink} ground={palette.bg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  universe: { alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.5 },
  // The name's own capsule: the bar's title box, with the glass round it. The padding is what
  // makes it a capsule rather than a rectangle behind two lines of text — and in the system's
  // glass, which has no hairline to mark its edge, six points over and under read as the words
  // touching the rim (Arjun, 23 September 2026: "a bit more margin all around").
  name: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.xl, paddingVertical: 9 },
});

/** The line under a room's name, with Hidden before it for a room the reader hid (ADR 0205). */
function hiddenWords(hidden: boolean, subtitle: string | undefined): string | undefined {
  if (!hidden) return subtitle;
  return subtitle === undefined || subtitle === "" ? "Hidden" : `Hidden \u00b7 ${subtitle}`;
}
