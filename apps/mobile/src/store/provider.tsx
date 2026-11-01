/**
 * The devices this phone holds, one in front, and a store for each (ADR 0197).
 *
 * The web app does this in `App.tsx` and threads the store down; here it is a context,
 * because Expo Router mounts each screen itself and there is nowhere to thread it from. The
 * store is the same one the web app runs — `@chipschat/core`'s — with two things swapped for the
 * phone: the SQLite cache and the SQLite-and-Keychain device storage.
 *
 * A phone holds a workspace for each server it is paired with or has joined by a link, as the Mac
 * does: one in front, whose store every screen reads, and the rest behind. Each has one store while
 * the app is open, in front or behind (`useWorkspaces`), so the switcher can say what waits in each,
 * a decision made on the lock screen reaches the server it came from, and a switch hands the front
 * to a store that is ready. Until ADR 0197 it held one, and joining another workspace signed it out
 * of the first.
 *
 * `useSyncExternalStore` over `store.subscribe`/`getSnapshot` is what makes a screen re-render
 * when an event arrives, and it is React's own answer for a store outside React, so nothing
 * here has to think about tearing.
 *
 * Beside the workspaces the device storage holds, it holds the demo's (ADR 0213), made up and
 * played on this phone: put in front by Watch Chips work, with its film over it, and kept by Look
 * around. It is never written where the device keeps its workspaces, each with a key in the
 * Keychain, and it has none: Look around is a word in this app's preferences, and a launch that
 * finds it builds the demo again from its script, played whole.
 */

import {
  type DemoPlayer,
  type Device,
  demoDevice,
  FILMS,
  isDemo,
  type Snapshot,
  type Store,
  setDeviceMuted,
  switchDevice,
} from "@chipschat/core";
import { useIsFocused } from "expo-router";
import {
  createContext,
  type ReactNode,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { readAgain, readWhenOpen } from "../device/held";
import { deviceStorage } from "../device/storage";
import { readSetting, SETTINGS, writeSetting } from "../prefs";
import type { FileService } from "../spaces/files";
import {
  type BackgroundWorkspaces,
  type Held,
  playedWhole,
  type Stores,
  useStores,
  useWorkspaces,
} from "./workspaces";

export { deviceStorage };

interface Paired {
  readonly device: Device;
  readonly store: Store;
  /** How files are uploaded, fetched and opened on this phone (M4.4), one per workspace. */
  readonly files: FileService;
  /** The demo's film, for the demo's device alone (ADR 0213). */
  readonly player?: DemoPlayer | undefined;
}

/** What the demo's word in this app's preferences says once Look around has been chosen. */
export const LOOK_AROUND = "look-around";

/** The made-up workspace (ADR 0213), held beside the stored ones and never written with them. */
export interface DemoSession {
  /** The film playing over the app, by its key, while it plays; nothing once it is off. */
  readonly film: string | undefined;
  /** Look around was chosen: the demo stays in the switcher, and a launch builds it again. */
  readonly kept: boolean;
  /**
   * A film played live from a chapter, the demo in front: the render mode alone (ADR 0217), which
   * starts where the page's address says. A person watches the film's video (`app/film.tsx`).
   */
  readonly watch: (film?: string, from?: number) => Promise<void>;
  /**
   * The film off and the demo kept, in front: in the switcher as Chips demo, and built again at a
   * launch. After a film's video, which made no demo, it is made here, as the first film leaves it.
   */
  readonly lookAround: () => Promise<void>;
  /**
   * The film off: Leave, Set up my own Chips, I have an invite. A demo not kept goes, and the
   * workspace in front before the film comes back; a kept one stays, played whole. Answers what is
   * in front after it.
   */
  readonly leave: () => Device | undefined;
  /** The demo gone from this phone, and its word with it: the switcher's Remove, Sign out. */
  readonly remove: () => Device | undefined;
}

const NO_DEMO: DemoSession = {
  film: undefined,
  kept: false,
  watch: async () => {},
  lookAround: async () => {},
  leave: () => undefined,
  remove: () => undefined,
};

interface Chips {
  /**
   * False until the storage has been read once, and again while a device's store is being made
   * and reads its cache: a screen that sees `ready` with no `paired` may take the phone for
   * unpaired, and send it to Pair, so it must never see that for the frame between `began` and
   * the store. The launch picture stays up until it is true (`app/_layout.tsx`).
   */
  readonly ready: boolean;
  /**
   * The device in front and its open store, or nothing when unpaired. While a workspace switched
   * to reads its cache, this is still the one it replaces, drawn and open until the next takes over.
   */
  readonly paired: Paired | undefined;
  /**
   * A workspace on its way to the front: switched to, and reading its cache, while the one it
   * replaces stays drawn. Spaces is named for it at once and dims what it shows (ADR 0197's
   * addendum, his "hold, then the rows rise"). Nothing otherwise.
   */
  readonly arriving: Device | undefined;
  /** When the one in front last took over from another by a switch: its rows rise as they come. */
  readonly arrival: Arrival | undefined;
  /** Every workspace this phone holds, the one in front first. */
  readonly devices: readonly Device[];
  /** The workspaces behind the one in front: a store for each, and what waits in each. */
  readonly others: BackgroundWorkspaces;
  /**
   * Bring a device to the front: one just paired or joined, which the storage holds already
   * (`pairDevice`, `joinByInvite`), or one switched to. The others stay.
   */
  readonly began: (device: Device) => void;
  /**
   * After `forgetHere`: the device in front is gone, and `next` (what `forgetHere` answered) comes
   * forward, or nothing when it was the last.
   */
  readonly ended: (next?: Device | undefined) => void;
  /**
   * Put another workspace this phone holds in front, and then, once its store is the one in
   * front, do `then` with it: a push tapped or a banner pressed in a workspace behind
   * (`useBringForward`). Held here, because a switch draws everything under the providers that
   * need a store afresh, and anything kept below would go with it.
   */
  readonly switchTo: (deviceId: string, then?: (store: Store) => void) => Promise<void>;
  /**
   * Quiet a workspace on this phone, or hear from it again: one muted has no store behind the one
   * in front, and is not told where this phone is. Its server is told by the caller.
   */
  readonly mute: (deviceId: string, muted: boolean) => Promise<void>;
  /** The made-up workspace and its film (ADR 0213). */
  readonly demo: DemoSession;
}

/** A workspace that took over the front from another, and when. */
export interface Arrival {
  readonly deviceId: string;
  readonly at: number;
}

/**
 * How long after a switch handed it the front a list drawn for the first time takes its workspace to be
 * the one arriving, rather than one opened later: the tabs are drawn afresh in the same frame.
 */
const ARRIVAL_FRESH_MS = 1000;

/** Whether this list is drawn as its workspace takes the front from another, `now`. */
export function justArrived(
  arrival: Arrival | undefined,
  deviceId: string | undefined,
  now: number,
): boolean {
  return (
    arrival !== undefined && arrival.deviceId === deviceId && now - arrival.at < ARRIVAL_FRESH_MS
  );
}

const NOBODY_BEHIND: BackgroundWorkspaces = { stores: new Map(), needs: {}, decides: {} };

const ChipsContext = createContext<Chips>({
  ready: false,
  paired: undefined,
  arriving: undefined,
  arrival: undefined,
  devices: [],
  others: NOBODY_BEHIND,
  began: () => {},
  ended: () => {},
  switchTo: async () => {},
  mute: async () => {},
  demo: NO_DEMO,
});

/** What this phone holds: its workspaces' devices, and whether the demo was kept (ADR 0213). */
type OnThisPhone = readonly [readonly Device[], string | undefined];

function readHeld(signal?: AbortSignal): Promise<OnThisPhone> {
  return Promise.all([readWhenOpen(signal), readSetting(SETTINGS.demo).catch(() => undefined)]);
}

/** The launch's read, begun before the provider is drawn (`beginReadingHeld`), until it takes it. */
let readAtLaunch: Promise<OnThisPhone> | undefined;

/**
 * Begin reading what this phone holds now, beside the root's read of the appearance, rather than
 * once the provider is drawn after it (ADR 0253): the store, the history and the connection all
 * wait on it, so a launch is that much sooner.
 */
export function beginReadingHeld(): void {
  readAtLaunch ??= readHeld();
}

export function ChipsProvider({ children }: { readonly children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  // What the device storage holds, and the demo beside it (ADR 0213), which is never stored there.
  const [stored, setStored] = useState<readonly Device[]>([]);
  const [demo, setDemo] = useState<Device | undefined>(undefined);
  const [device, setDevice] = useState<Device | undefined>(undefined);
  // The film over the demo (ADR 0213), and whether Look around keeps the demo when it ends.
  const [film, setFilm] = useState<string | undefined>(undefined);
  const [kept, setKept] = useState(false);
  // Counted up each time the demo's store is made again, so the front takes the new one.
  const [demoRun, setDemoRun] = useState(0);

  useEffect(() => {
    let live = true;
    // Read once the phone lets it be (ADR 0228): a Keychain shut while the phone is locked is not
    // a phone with nothing paired, and the tabs send a phone with nothing paired to Welcome.
    const reading = new AbortController();
    const begun = readAtLaunch;
    readAtLaunch = undefined;
    void (begun ?? readHeld(reading.signal)).then(async ([found, word]) => {
      // Looked around in last time: the demo made again from its script, played whole.
      const looked = word === LOOK_AROUND ? await demoDevice().catch(() => undefined) : undefined;
      if (!live) return;
      setStored(found);
      setDemo(looked);
      setKept(looked !== undefined);
      // A workspace of the person's own comes first; the demo, when it is all there is.
      setDevice(found[0] ?? looked);
      setLoaded(true);
    });
    return () => {
      live = false;
      reading.abort();
    };
  }, []);

  // One store a workspace, whichever is in front (ADR 0197's addendum): a switch hands the front
  // to the one kept, and the one it replaces stays, behind.
  const stores = useStores();
  const { shown: paired, arrival, drop } = usePairedFor(device, stores.take, demoRun);
  const arriving =
    device !== undefined && paired !== undefined && device.deviceId !== paired.device.deviceId
      ? device
      : undefined;
  // The one in front first, the demo with the rest when it is behind.
  const devices = useMemo<readonly Device[]>(() => {
    if (demo === undefined) return stored;
    return isDemo(device) ? [demo, ...stored] : [...stored, demo];
  }, [stored, demo, device]);
  const others = useWorkspaces(stores, devices, device?.deviceId, paired?.device.deviceId);
  const ready = loaded && (device === undefined || paired !== undefined);

  // The list read again after every change, so it says what the storage says: a pairing again
  // with one server replaces its device there (`pairDevice`), and a forgotten one is gone. A read
  // that could not open every key leaves the list as it was (ADR 0228).
  const reread = useCallback(() => {
    void readAgain().then((found) => {
      if (found !== undefined) setStored(found);
    });
  }, []);
  // Read where state is not: in the demo's callbacks, which keep one identity.
  const now = useRef({ device, stored, kept, film });
  now.current = { device, stored, kept, film };
  const began = useCallback((next: Device) => {
    setDevice(next);
    // The demo is never written where the device keeps its workspaces (ADR 0213).
    if (isDemo(next)) return;
    // Another workspace in front ends the film, and a demo nobody kept goes with it.
    setFilm(undefined);
    if (!now.current.kept) setDemo(undefined);
    setStored((was) => [next, ...was.filter((each) => each.deviceId !== next.deviceId)]);
    // In front at the next launch too. A pairing or a join has said so already; a switch has not.
    void switchDevice(next.deviceId, deviceStorage)
      .catch(() => undefined)
      .then(() => readAgain())
      .then((found) => {
        if (found !== undefined) setStored(found);
      });
  }, []);
  const ended = useCallback(
    (next?: Device | undefined) => {
      // Forgotten, so not drawn while the next reads its cache, and its store closed now, not
      // kept behind: nothing of it stays.
      const gone = device?.deviceId;
      drop();
      if (gone !== undefined) stores.close(gone);
      setDevice(next);
      setStored((was) => was.filter((each) => each.deviceId !== gone));
      reread();
    },
    [device, drop, stores, reread],
  );
  const demoSession = useDemoSession({
    stores,
    demo,
    film,
    kept,
    now,
    drop,
    set: { setDemo, setDevice, setFilm, setKept, setDemoRun },
  });
  // What to do once a workspace switched to is in front.
  const owed = useRef<{ readonly deviceId: string; readonly then: (store: Store) => void }>(
    undefined,
  );
  useEffect(() => {
    const due = owed.current;
    if (due === undefined || paired === undefined || due.deviceId !== paired.device.deviceId) {
      return;
    }
    owed.current = undefined;
    due.then(paired.store);
  }, [paired]);
  const switchTo = useCallback(
    async (deviceId: string, then?: (store: Store) => void) => {
      if (deviceId === device?.deviceId) {
        if (paired !== undefined) then?.(paired.store);
        return;
      }
      const chosen = devices.find((each) => each.deviceId === deviceId);
      if (chosen === undefined) return;
      owed.current = then === undefined ? undefined : { deviceId, then };
      began(chosen);
    },
    [device, devices, paired, began],
  );
  const mute = useCallback(
    async (deviceId: string, muted: boolean) => {
      await setDeviceMuted(deviceId, muted, deviceStorage);
      reread();
    },
    [reread],
  );
  const value = useMemo<Chips>(
    () => ({
      ready,
      paired,
      arriving,
      arrival,
      devices,
      others,
      began,
      ended,
      switchTo,
      mute,
      demo: demoSession,
    }),
    [ready, paired, arriving, arrival, devices, others, began, ended, switchTo, mute, demoSession],
  );
  return <ChipsContext.Provider value={value}>{children}</ChipsContext.Provider>;
}

/** What the demo's session reads of the provider as it is now, and the setters it changes. */
interface DemoParts {
  readonly stores: Stores;
  readonly demo: Device | undefined;
  readonly film: string | undefined;
  readonly kept: boolean;
  readonly now: {
    readonly current: {
      readonly device: Device | undefined;
      readonly stored: readonly Device[];
      readonly kept: boolean;
      readonly film: string | undefined;
    };
  };
  readonly drop: () => void;
  readonly set: {
    readonly setDemo: (demo: Device | undefined) => void;
    readonly setDevice: (device: Device | undefined) => void;
    readonly setFilm: (film: string | undefined) => void;
    readonly setKept: (kept: boolean) => void;
    readonly setDemoRun: (bump: (run: number) => number) => void;
  };
}

/**
 * The demo's session (ADR 0213): the film started, jumped, left, and the demo kept or gone. The
 * workspace in front before a film started is come back to when a demo nobody kept is left.
 */
function useDemoSession({ stores, demo, film, kept, now, drop, set }: DemoParts): DemoSession {
  const { setDemo, setDevice, setFilm, setKept, setDemoRun } = set;
  const before = useRef<string | undefined>(undefined);
  const made = useRef(demo);
  made.current = demo;
  // Gone from this phone: its store closed, the film off, and the workspace before it in front.
  const forget = useCallback((): Device | undefined => {
    const { device, stored } = now.current;
    const wasFront = isDemo(device);
    const next = wasFront
      ? (stored.find((each) => each.deviceId === before.current) ?? stored[0])
      : device;
    before.current = undefined;
    // Not drawn while the next reads its cache, as a forgotten workspace is not (`ended`).
    if (wasFront) drop();
    stores.restartDemo(playedWhole());
    setDemo(undefined);
    setFilm(undefined);
    setKept(false);
    setDevice(next);
    return next;
  }, [now, drop, stores, setDemo, setFilm, setKept, setDevice]);
  const watch = useCallback(
    async (key: string = FILMS[0]?.key ?? "watch", from = 0) => {
      const device = made.current ?? (await demoDevice());
      const front = now.current.device;
      if (front !== undefined && !isDemo(front)) before.current = front.deviceId;
      stores.restartDemo({ film: key, from });
      setDemo(device);
      setFilm(key);
      setDemoRun((run) => run + 1);
      setDevice(device);
    },
    [now, stores, setDemo, setFilm, setDemoRun, setDevice],
  );
  const lookAround = useCallback(async () => {
    // From the video's end card, the demo is not here yet, or is kept behind another workspace.
    if (made.current === undefined) stores.restartDemo(playedWhole());
    const device = made.current ?? (await demoDevice());
    const front = now.current.device;
    if (!isDemo(front)) {
      if (front !== undefined) before.current = front.deviceId;
      setDemo(device);
      setDemoRun((run) => run + 1);
      setDevice(device);
    }
    setKept(true);
    setFilm(undefined);
    void writeSetting(SETTINGS.demo, LOOK_AROUND).catch(() => undefined);
  }, [now, stores, setDemo, setDemoRun, setDevice, setKept, setFilm]);
  const leave = useCallback((): Device | undefined => {
    if (!now.current.kept) return forget();
    // Kept: it stays where it was, played whole, as Look around left it.
    setFilm(undefined);
    stores.restartDemo(playedWhole());
    setDemoRun((run) => run + 1);
    return now.current.device;
  }, [now, forget, stores, setFilm, setDemoRun]);
  const remove = useCallback((): Device | undefined => {
    void writeSetting(SETTINGS.demo, "").catch(() => undefined);
    return forget();
  }, [forget]);
  return useMemo(
    () => ({ film, kept, watch, lookAround, leave, remove }),
    [film, kept, watch, lookAround, leave, remove],
  );
}

/**
 * The longest a launch waits for the cache before drawing the app without it. A read is tens of
 * milliseconds; a cache that will not open answers with nothing rather than hanging, so this is
 * only for a phone in a very bad way.
 */
export const CACHE_WAIT_MS = 1500;

/**
 * The least a switch holds the workspace it replaces, dimmed under the next one's name, however
 * ready the next one's store is: long enough for the dim to land and the gold line to start
 * sweeping (`Settling`, `Sweep`; the dim takes 220 ms). Both run on the UI thread, and carry on
 * while the JS thread draws the next workspace, which is the most of a switch now that no store is
 * made for one. Handed over at once, the screen stood still at full strength under the old name for
 * as long as that took, up to a second on the simulator, as if the tap had not been heard.
 */
export const HOLD_MS = 250;

/** What `usePairedFor` holds. */
interface Front {
  /** The workspace drawn: the device in front once its store has read its cache, else the last. */
  readonly shown: Paired | undefined;
  /** When the one drawn took over from another. */
  readonly arrival: Arrival | undefined;
  /** Let the one drawn go now, before the next is ready: it was forgotten. */
  readonly drop: () => void;
}

/**
 * The workspace drawn: the device in front, once its store has read its cache. The store is the one
 * kept for that workspace (`useStores`), made the first time it is asked for and never again while
 * the app is open, so a switch back to a workspace held behind hands over at once (ADR 0197's
 * addendum, 19 October 2026), and the one it replaces stays open behind it. A device forgotten is
 * let go of now (`drop`), and its store closed by `useWorkspaces` once it is out of the list.
 *
 * A switch hands over rather than drops. The workspace drawn stays drawn until the next one's store
 * has read its cache. Dropped at once, the tabs drew nothing for as long as the read took: a blank
 * screen for up to a second and a half on the way back to a workspace with a long history (Arjun,
 * 19 October 2026: "the screen goes blank").
 *
 * A layout effect, so the frame without a store is never drawn: until it has run, `ready` is false
 * rather than the phone looking unpaired. A store answers a new listener at once, so one that has
 * read its cache already takes over a launch before its first frame, and a switch once the one it
 * replaces has been held `HOLD_MS`.
 *
 * It is handed over once the store has read its cache, so every tab's first frame is what this
 * phone last saw rather than an empty model. Handed over at once, the tabs drew "No spaces yet"
 * and then every room in one drop when the cache came in (6 October 2026) — longer since the
 * tabs read the store at transition priority (ADR 0116).
 *
 * Never a store made in `useMemo`, which is what this was, and what the web app had until 13
 * September 2026. A store opens a socket as it is made, and through the relay a tunnel; nothing
 * closed a memoised one, so a re-pair left the old store running. Core keeps one link per device id
 * and each new link closes the last, so two stores for one device close each other's tunnels about
 * once a second (the web app's CI, commit 34a515c; `useStoreFor` in `apps/web/src/app/App.tsx`).
 * Kept by device id, one device never has two.
 *
 * The demo's store is made again when its film starts or jumps to a chapter (ADR 0213), under the
 * same device: `run` counts those, and the one made takes over as a launch's does, with no hold.
 */
function usePairedFor(device: Device | undefined, take: Stores["take"], run: number): Front {
  const [held, setHeld] = useState<{ readonly paired: Paired; readonly arrival?: Arrival }>();
  // The one drawn, read where state is not: in a store's callback.
  const shown = useRef<Paired | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` is the demo's store made again.
  useLayoutEffect(() => {
    if (device === undefined) return;
    const drawn = shown.current;
    const kept: Held = take(device);
    const same = drawn?.device.deviceId === device.deviceId;
    if (same && drawn?.store === kept.store) {
      // Back to the one still drawn before the next was ready: it stays. Or its record read again,
      // a name or a way to its server learnt: the same store, which knows already.
      if (drawn.device === device) return;
      const paired = { ...drawn, device };
      shown.current = paired;
      setHeld((was) => ({ ...was, paired }));
      return;
    }
    const paired = { device, ...kept };
    // A launch, a forgotten workspace's successor, or the demo made again, is drawn as soon as it
    // can be; a switch holds the one it replaces a moment first (`HOLD_MS`).
    const from = drawn === undefined || same ? 0 : Date.now() + HOLD_MS;
    let handed = false;
    const hand = () => {
      if (handed) return;
      handed = true;
      const was = shown.current;
      shown.current = paired;
      setHeld(
        was === undefined || was.device.deviceId === device.deviceId
          ? { paired }
          : { paired, arrival: { deviceId: device.deviceId, at: Date.now() } },
      );
    };
    let soon: ReturnType<typeof setTimeout> | undefined;
    const stop = kept.store.subscribe((snapshot) => {
      if (snapshot.readingCache === true || soon !== undefined) return;
      const wait = from - Date.now();
      if (wait > 0) soon = setTimeout(hand, wait);
      else hand();
    });
    const waited = setTimeout(hand, CACHE_WAIT_MS);
    return () => {
      stop();
      clearTimeout(waited);
      clearTimeout(soon);
    };
  }, [device, take, run]);
  const drop = useCallback(() => {
    shown.current = undefined;
    setHeld(undefined);
  }, []);
  return { shown: held?.paired, arrival: held?.arrival, drop };
}

export function useChips(): Chips {
  return useContext(ChipsContext);
}

/** The snapshot of the paired store, re-read whenever it changes. Throws when unpaired. */
export function useSnapshot(store: Store): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * The snapshot for a tab — Spaces, Agents, You — re-read whenever it changes, but drawn after
 * whatever is urgent, in slices React can set aside (`startTransition`), and while the screen is
 * out of sight at most once in `OUT_OF_SIGHT_MS`.
 *
 * The tabs stay in the tree under a room opened from them, so that a swipe back finds them drawn,
 * and every word the store hears drew all of them again in the same pass as the room: some 4,400
 * components for each event, against the room's 600, in front of the line a send had just put in
 * the room (the simulator, 4 October 2026: a send's line reached the room 110 ms after the store
 * had it). Drawn after it, they are still up to date by the time anyone looks — and a room, or a
 * tab in front, is drawn the moment its news arrives.
 *
 * Drawn after it was still drawn: each message sent in a room drew Spaces, Agents and You six times
 * over, unseen, some 640 animated views and 43 MB, and an agent's answer as it streamed drew them
 * at every frame (the simulator, 19 October 2026, on a copy of Primal). Out of sight, a screen now
 * takes the store's news once a second, which a swipe back finds no more than a second behind,
 * and takes what the store holds the moment it is back in sight, before that frame is painted.
 */
export function useDeferredSnapshot(store: Store): Snapshot {
  const inSight = useIsFocused();
  const [snapshot, setSnapshot] = useState(store.getSnapshot);
  // Read in the store's callback, where state is not.
  const seen = useRef(inSight);
  const held = useRef(snapshot);
  useLayoutEffect(() => {
    seen.current = inSight;
    if (!inSight) return;
    // Back in sight: what the store holds now, in the frame it comes back in.
    const now = store.getSnapshot();
    if (now === held.current) return;
    held.current = now;
    setSnapshot(now);
  }, [inSight, store]);
  useEffect(() => {
    let later: ReturnType<typeof setTimeout> | undefined;
    const take = (next: Snapshot) => {
      later = undefined;
      if (next === held.current) return;
      held.current = next;
      startTransition(() => setSnapshot(next));
    };
    // A store answers a new listener at once, with what it holds already.
    const stop = store.subscribe((next) => {
      if (seen.current) {
        clearTimeout(later);
        take(next);
        return;
      }
      later ??= setTimeout(() => take(store.getSnapshot()), OUT_OF_SIGHT_MS);
    });
    return () => {
      stop();
      clearTimeout(later);
    };
  }, [store]);
  return snapshot;
}

/** How often a screen out of sight is drawn again while the store hears things. */
export const OUT_OF_SIGHT_MS = 1000;
