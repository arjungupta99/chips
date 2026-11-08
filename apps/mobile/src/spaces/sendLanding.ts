/**
 * What the room knows of a message whose words are on their way from the field to their bubble
 * (`SendFlight.tsx`), and whose photos are on their way from the staged strip to their tiles:
 * which of its lines they are for, so that line's bubble and tiles are kept out of sight until
 * they are on them and do not rise in on their own (`Arrive`, in `Motion.tsx`), and what the
 * watch on each says of where it is (`BubbleWatch.tsx`).
 *
 * The words take off at the tap; the line is found a frame later, when the store says what the
 * room holds — it builds what it says on the next frame, not in the send (`notify`, in core's
 * store) — and it is held then, as the store says so and before the room draws it: a bubble drawn
 * once before it was known to be held is a bubble seen for a frame where the words were about to
 * land. It is found by what it says and not by whether it is still on its way: on a good
 * connection the server answers inside that frame, and the store's first word of the line is
 * the confirmed one, under the send's key. Looking for a pending line missed it, the bubble rose
 * in on its own, and the words flew beside it — two bubbles (Arjun's phone, 25 September 2026).
 * Each bubble asks whether it is the one held — a small store rather than a context value, so a
 * send redraws that bubble and not every bubble in the room (ADR 0061's fourth rule).
 *
 * A photo is found the same way: the line's attachments carry the ids the upload gave them, and
 * the staged chip knew those before the send. Its tile is watched as the bubble is, one watch per
 * tile up to the album's four (`GRID_MAX`), so each picture goes for its own tile.
 *
 * Not every send flies. With Reduce Motion on, on a wide screen and on the web a message lands as
 * it always did; so does one sent from far enough up the history that its line lands off the
 * glass.
 */

import type { Line, Snapshot, Store } from "@chipschat/core";
import type { ImageRef } from "expo-image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Rect } from "../newSpace/geometry";
import { type Told, useTold } from "./BubbleWatch";

/** How many of a message's photos fly: the album draws that many tiles (`Attachments.tsx`). */
export const PICTURES = 4;

/** A photo going with a message: which attachment it is, and where its thumbnail stood. */
export interface Picture {
  readonly attachmentId: string;
  /** The picture the copy draws: the room's own thumbnail of it, when that has come (`Composer.tsx`). */
  readonly uri: string;
  /** That thumbnail decoded, drawn from the copy's first frame, when it has been (`useStaged`). */
  readonly picture?: ImageRef | undefined;
  /** The chip's thumbnail, in window points: the picture's start. */
  readonly from: Rect;
}

/**
 * Where a message is going, when its line will wear a route (ADR 0081): the harnesses, and where
 * the capsule over the field drew its arrow and their faces — which fly up with the words and
 * become the route over the bubble.
 */
export interface RouteLaunch {
  readonly to: readonly string[];
  /** The capsule's arrow and faces, in window points: the route's start. */
  readonly from: Rect;
  /** The capsule said Everyone, so its faces fly up as the mark they were drawn as. */
  readonly everyone?: boolean | undefined;
}

/** A message sent, and where its words and photos were in the composer: the flight's start. */
export interface Launch {
  readonly text: string;
  /** Where the words were in the field, in window points; nothing for a send with no words. */
  readonly words: Rect | undefined;
  /** Where the field reckons the bubble's foot will come to rest, in the window, if it can say. */
  readonly rest: number | undefined;
  /** The photos going with it, in the order the message carries them. */
  readonly pictures: readonly Picture[];
  /** The route it will wear, when the capsule changed where messages here go (ADR 0081). */
  readonly route?: RouteLaunch | undefined;
}

/** A flight: its words and photos, where they left from, and the line they are going to, once known. */
export interface Flying extends Launch {
  readonly id: number;
  readonly key: string | undefined;
}

/** Which line's bubble and tiles are held, if any, and what their watches tell. */
export interface Landing {
  readonly told: Told;
  /** The tiles' watches, one per picture that may fly, in the pictures' order. */
  readonly tolds: readonly Told[];
  /** The route's watch, for a message whose route flies up from the capsule (ADR 0081). */
  readonly routeTold: Told | undefined;
  readonly held: () => string | undefined;
  /** The attachment ids of the pictures flying to the held line. */
  readonly pictures: () => readonly string[];
  /** Whether the held line's route is flying to it too. */
  readonly routed: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly hold: (key: string | undefined, pictures?: readonly string[], routed?: boolean) => void;
}

export function makeLanding(
  told: Told,
  tolds: readonly Told[] = [],
  routeTold: Told | undefined = undefined,
): Landing {
  let held: string | undefined;
  let pictures: readonly string[] = [];
  let routed = false;
  const listeners = new Set<() => void>();
  return {
    told,
    tolds,
    routeTold,
    held: () => held,
    pictures: () => pictures,
    routed: () => routed,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hold(key, flying = [], route = false) {
      const next = key !== undefined && route;
      if (key === held && flying.length === pictures.length && next === routed) return;
      held = key;
      pictures = key === undefined ? [] : flying;
      routed = next;
      for (const listener of listeners) listener();
    },
  };
}

export const SendLandingContext = createContext<Landing | undefined>(undefined);

const UNHEARD = () => () => undefined;

/**
 * For a bubble of your own, by its line's key: whether it is kept out of sight while its words
 * fly to it, and if so what its watch is to tell.
 */
export function useSendLanding(key: string | undefined): {
  readonly held: boolean;
  readonly told: Told | undefined;
} {
  const landing = useContext(SendLandingContext);
  const held = useSyncExternalStore(
    landing?.subscribe ?? UNHEARD,
    () => key !== undefined && landing !== undefined && landing.held() === key,
  );
  return { held, told: held ? landing?.told : undefined };
}

/**
 * For the route over a line of your own (ADR 0081), by its line's key: whether it is kept out of
 * sight while the capsule's arrow and faces fly up to it, and if so what its watch is to tell.
 */
export function useRouteLanding(key: string | undefined): {
  readonly held: boolean;
  readonly told: Told | undefined;
} {
  const landing = useContext(SendLandingContext);
  const held = useSyncExternalStore(
    landing?.subscribe ?? UNHEARD,
    () => key !== undefined && landing !== undefined && landing.held() === key && landing.routed(),
  );
  return { held, told: held ? landing?.routeTold : undefined };
}

/**
 * For a photo's tile under a line of your own: whether it is kept out of sight while the picture
 * flies to it from the strip, and if so what its watch is to tell.
 */
export function useTileLanding(
  lineKey: string | undefined,
  attachmentId: string,
): {
  readonly held: boolean;
  readonly told: Told | undefined;
} {
  const landing = useContext(SendLandingContext);
  const index = useSyncExternalStore(landing?.subscribe ?? UNHEARD, () =>
    lineKey !== undefined && landing !== undefined && landing.held() === lineKey
      ? landing.pictures().indexOf(attachmentId)
      : -1,
  );
  const told = index >= 0 ? landing?.tolds[index] : undefined;
  return { held: told !== undefined, told };
}

/**
 * How much of the room's foot the composer covers while a send is on its way in: what it measures,
 * except that it does not drop until the line is in the room.
 *
 * Sending empties the composer — a message of several lines leaves a field of one, a photo leaves
 * no strip of staged chips — and the room's foot follows the composer down a frame or two before
 * the store has the line for the room to draw: the room dropped by the space the composer gave up,
 * and then rose for the line, a dip of six points under a message of three lines and of twenty-six
 * under a photo (the simulator, 4 October 2026). Held until the line is in, the two are one change
 * to the room, drawn in one frame, and the room moves once: up by what the line takes, less what
 * the composer gave up. Meanwhile the words, or the photo, fill the space the composer left.
 * Anything that makes the composer taller is taken at once.
 */
export function useSendFoot(measured: number, landing: Landing, flying: boolean): number {
  const lineIn = useSyncExternalStore(landing.subscribe, () => landing.held() !== undefined);
  const waiting = flying && !lineIn;
  // What the foot stood at before the send, as last drawn with nothing on its way in.
  const before = useRef(measured);
  useEffect(() => {
    if (!waiting) before.current = measured;
  });
  return waiting ? Math.max(measured, before.current) : measured;
}

/**
 * What the room draws while a send is in the air: what it drew before, and the sender's own lines
 * — the one the words are for among them. Anyone else's line that lands meanwhile waits for the
 * words to be on their bubble, and lands then, as it would have.
 *
 * A reply landing in the middle of the flight is a mount in the middle of the spring: the room's
 * rise took a double step, with a frame repeated where the row went in (the simulator, 25
 * September 2026, a harness answering 0.3 s after the send — which Arjun's does when its answer
 * is quick, and the sends he called jerky were some and not all). The wait is the rest of the
 * flight, half a second at most, and a reply that came inside it reads as one that came after.
 */
export function heldBack<T extends { readonly line: Pick<Line, "id" | "key" | "authorId"> }>(
  drawn: readonly T[],
  known: ReadonlySet<string>,
  selfId: string,
): T[] {
  return drawn.filter(({ line }) => line.authorId === selfId || known.has(line.key ?? line.id));
}

/**
 * The keys of your lines that say `text`, oldest first, on their way or confirmed. The same words
 * can be in the room twice — sent again, or kept from a spell with no connection — so the line a
 * send made is the one whose key was not there before it.
 */
export function keysSaying(lines: readonly Line[], selfId: string, text: string): string[] {
  const keys: string[] = [];
  for (const line of lines) {
    if (line.authorId === selfId && line.text === text && line.key) keys.push(line.key);
  }
  return keys;
}

/** The key of the line a send put in the room: the newest saying its words that was not there before. */
export function sentKey(
  lines: readonly Line[],
  selfId: string,
  text: string,
  before: ReadonlySet<string>,
): string | undefined {
  return keysSaying(lines, selfId, text)
    .filter((key) => !before.has(key))
    .at(-1);
}

/**
 * The room's side of a send's flight: what is in the air, and what the room is to hold.
 *
 * A send made while one is still in the air lands that one where it is — its bubble shows there,
 * and the room carries it the rest of the way — and the new one takes off. Only one flight is
 * followed at a time, because the room watches one bubble.
 */
export function useSendFlight({
  store,
  spaceId,
  selfId,
  enabled,
  far,
}: {
  readonly store: Store;
  readonly spaceId: string;
  readonly selfId: string;
  /** Whether a send flies here at all. */
  readonly enabled: boolean;
  /** Whether the room is too far up its history for the new line to land on the glass. */
  readonly far: () => boolean;
}) {
  const told = useTold();
  // One watch per tile that may fly: hooks are counted, so the album's four are made up front.
  const first = useTold();
  const second = useTold();
  const third = useTold();
  const fourth = useTold();
  const tolds = useMemo(() => [first, second, third, fourth], [first, second, third, fourth]);
  const routeTold = useTold();
  const landing = useMemo(() => makeLanding(told, tolds, routeTold), [told, tolds, routeTold]);
  const [flying, setFlying] = useState<Flying | undefined>(undefined);
  const count = useRef(0);
  // The flight whose landing still counts: a landing heard from one already overtaken does not.
  const current = useRef<number | undefined>(undefined);
  // Listening for the line a flight is for, until the store says it is there.
  const listening = useRef<(() => void) | undefined>(undefined);

  // Whatever the room is doing when it goes, it stops listening.
  useEffect(() => () => listening.current?.(), []);

  // Whether the send flew: a room that follows a line in itself does so only for one that did not.
  const launch = useCallback(
    (sent: Launch | undefined): boolean => {
      landing.hold(undefined);
      current.current = undefined;
      listening.current?.();
      const flies = sent !== undefined && (sent.words !== undefined || sent.pictures.length > 0);
      if (!flies || !enabled || far()) {
        setFlying(undefined);
        return false;
      }
      // Nothing seen of the last bubble or tiles flown to is anything to this one.
      told.aim.value = undefined;
      told.settled.value = 0;
      for (const each of [...tolds, routeTold]) {
        each.aim.value = undefined;
        each.settled.value = 0;
      }
      const pictures = sent.pictures.slice(0, PICTURES);
      count.current += 1;
      const id = count.current;
      current.current = id;
      setFlying({ ...sent, pictures, id, key: undefined });
      // What the store says the room holds now is from before the send.
      const lines = (snapshot: Snapshot) =>
        snapshot.model.spaces.find((each) => each.id === spaceId)?.lines ?? [];
      const before = new Set(keysSaying(lines(store.getSnapshot()), selfId, sent.text));
      // Held as the store says the line is there: in its flush, before the room draws it.
      let heard = false;
      let unhear: (() => void) | undefined;
      const hear = (snapshot: Snapshot) => {
        if (heard || current.current !== id) return;
        const key = sentKey(lines(snapshot), selfId, sent.text, before);
        if (key === undefined) return;
        heard = true;
        unhear?.();
        landing.hold(
          key,
          pictures.map((each) => each.attachmentId),
          sent.route !== undefined,
        );
        setFlying((now) => (now?.id === id ? { ...now, key } : now));
      };
      // A store answers a new listener at once, with what it holds already.
      unhear = store.subscribe(hear);
      if (heard) unhear();
      listening.current = unhear;
      return true;
    },
    [landing, told, tolds, routeTold, enabled, far, store, spaceId, selfId],
  );

  // The words and pictures are on the bubble and tiles: those are drawn where the copies are, and
  // the copies go. In that order, never the other: the hold is let go through the store, which
  // React draws at once, and the flight through state, which it draws with or after that — so for
  // no frame is neither there, and the copies need not fade (they once dissolved into the bubble
  // over an eighth of a second, which on a busy phone was the copy fading before the bubble under it
  // had been drawn). The lines held back from the room meanwhile land with the flight's going.
  const landed = useCallback(
    (id: number) => {
      if (current.current !== id) return;
      current.current = undefined;
      listening.current?.();
      landing.hold(undefined);
      setFlying((now) => (now?.id === id ? undefined : now));
    },
    [landing],
  );

  return { landing, told, routeTold, flying, launch, landed };
}
