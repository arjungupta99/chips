/**
 * The client. A paired device goes straight to the shell; an unpaired one pairs first.
 *
 * The same build runs in a browser tab and inside the desktop window (M2.2). What the window
 * adds is found once, on arrival: if there is a shell, it is handed to the pairing screen —
 * which then has a server to find rather than one it was served by — and to the bridge that
 * keeps the menu bar and the notification centre in step with what needs a person.
 *
 * One app, several workspaces (M5.3): the device module holds a key per pairing, and this holds
 * which one is in front. The others keep a store of their own in the background — so the
 * switcher can say what each needs and the menu bar can count them all — unless a workspace is
 * muted on this device, in which case it is left alone until it is chosen.
 *
 * The demo (ADR 0213) is a workspace held here beside the paired ones and never kept with them:
 * the first screen plays the film's video (ADR 0217's addendum of 26 October), the switcher's
 * Watch Chips work plays it over the page, and Look around from its end card makes the demo and
 * keeps it in the switcher as Chips demo until it is removed.
 */

import {
  DEMO_DEVICE_ID,
  type DemoPlayer,
  type Device,
  deleteCache,
  demoDevice,
  forgetDevice,
  isDemo,
  type Store,
  setDeviceMuted,
  switchDevice,
  workspaceLabel,
} from "@chipschat/core";
import { type InviteLink, inviteFromLink } from "@chipschat/protocol";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Desktop, desktop as findDesktop, inDesktop } from "../native.ts";
import { FilmSourceStage } from "./demo/FilmSourceStage.tsx";
import { filmSourceStart } from "./demo/filmSource.ts";
import { SetUpOwn } from "./demo/NotInDemo.tsx";
import { type DemoRun, FIRST_FILM, makeStore } from "./demo/store.ts";
import { type DemoHold, useHeldDemo } from "./demo/useHeldDemo.ts";
import { FilmPlayer } from "./film/FilmPlayer.tsx";
import { VIDEOS, videoNamed } from "./film/videos.ts";
import { InviteArrived } from "./InviteArrived.tsx";
import { Pair } from "./Pairing.tsx";
import { Removed } from "./Removed.tsx";
import { Shell, type WorkspaceTab } from "./Shell.tsx";
import { useDesktop } from "./useDesktop.ts";
import { desktopNotifier, useBrowserNotifier, useNotifications } from "./useNotifications.ts";
import { useWorkspaces } from "./useWorkspaces.ts";
import type { Way } from "./Welcome.tsx";

export function App({
  devices: initial,
  device: single,
  desktop: given,
  demo: atLaunch,
}: {
  /** Every workspace this browser is paired with, the one in front first. */
  readonly devices?: readonly Device[] | undefined;
  /** One device, for a test that has only one. */
  readonly device?: Device | undefined;
  /** Injected by a test; found for itself otherwise. */
  readonly desktop?: Desktop | undefined;
  /**
   * The demo Look around kept (ADR 0213), built again for this launch, and whether it was in
   * front. Never one of `devices`.
   */
  readonly demo?: { readonly device: Device; readonly front: boolean } | undefined;
}) {
  const [devices, setDevices] = useState<readonly Device[]>(
    initial ?? (single === undefined ? [] : [single]),
  );
  const demo = useHeldDemo(atLaunch?.device);
  const [currentId, setCurrentId] = useState<string | undefined>(() =>
    frontAtLaunch(devices, atLaunch),
  );
  /** Pairing with another server while one is already in front (the desktop shell). */
  const [pairingAnother, setPairingAnother] = useState(false);
  /** The way the pairing page opens on, when the demo's end card sent the person there. */
  const [pairingWay, setPairingWay] = useState<Way | undefined>(undefined);
  const [desktop, setDesktop] = useState<Desktop | undefined>(given);
  /**
   * Whether the shell has been looked for. In a tab the answer is known at once; in the window
   * it arrives a moment later, and the pairing screen waits for it, since it decides on arrival
   * whether there is a server to find or only the one that served the page.
   */
  const [looked, setLooked] = useState(given !== undefined || !inDesktop());
  /** Set when the server turned this device's key away, so the screen can say so. */
  const [rejected, setRejected] = useState(false);
  const landing = useLandingRoom();
  useEffect(() => {
    if (given !== undefined) return;
    void findDesktop()
      .then(setDesktop)
      .finally(() => setLooked(true));
  }, [given]);

  // The paired workspaces and the demo beside them, last.
  const demoDeviceHeld = demo.held?.device;
  const all = useMemo(() => besideDemo(devices, demoDeviceHeld), [devices, demoDeviceHeld]);
  const current = all.find((device) => device.deviceId === currentId);
  const { forgetDemo, watch, setUpOwn, toPairing, lookAround } = useDemoFlow({
    demo,
    devices,
    setCurrentId,
    setPairingAnother,
    setPairingWay,
  });
  // The render mode (ADR 0217): the chapter the page's address names, at once.
  const filmStarted = useRef(false);
  useEffect(() => {
    const start = filmSourceStart();
    if (start === undefined || filmStarted.current) return;
    filmStarted.current = true;
    void watch(start.film, start.from);
  }, [watch]);

  /** A device is gone — turned away, or signed out — and the next one, if any, comes forward. */
  const drop = useCallback(
    async (deviceId: string) => {
      // The demo is in no storage: Sign out on it is its Remove.
      if (isDemo({ deviceId })) return forgetDemo();
      // Its history goes with its key (SEC-32): a shared browser shows the next person nothing of it.
      const next = await forgetDevice(deviceId, undefined, { delete: deleteCache });
      setDevices((was) => was.filter((device) => device.deviceId !== deviceId));
      setCurrentId(next?.deviceId ?? demoDeviceHeld?.deviceId);
    },
    [forgetDemo, demoDeviceHeld],
  );

  const unpair = useCallback(() => {
    if (currentId === undefined) return;
    setRejected(true);
    void drop(currentId);
  }, [currentId, drop]);
  const signOut = useCallback(() => {
    if (currentId === undefined) return;
    setRejected(false);
    void drop(currentId);
  }, [currentId, drop]);

  const paired = (device: Device, spaceId?: string) => {
    setRejected(false);
    landing.set(device.deviceId, spaceId);
    setPairingAnother(false);
    setPairingWay(undefined);
    demo.standing(false);
    // One device per workspace on one server: a pairing again replaces the old one.
    setDevices((was) => [
      device,
      ...was.filter(
        (each) => !(each.workspaceId === device.workspaceId && each.serverUrl === device.serverUrl),
      ),
    ]);
    setCurrentId(device.deviceId);
  };

  const switchTo = (deviceId: string) => switchWorkspace(deviceId, demo, setCurrentId);

  // Into a room of a workspace here, switched to first when it is not the one in front.
  const land = (deviceId: string, spaceId: string) => {
    landing.set(deviceId, spaceId);
    if (deviceId !== currentId) void switchTo(deviceId);
  };

  // The demo's device is in no storage, so muting it changes nothing kept (it is heard by nothing).
  const mute = async (deviceId: string, muted: boolean) => {
    const changed = await setDeviceMuted(deviceId, muted);
    if (changed === undefined) return;
    setDevices((was) => was.map((device) => (device.deviceId === deviceId ? changed : device)));
  };

  // The film's video over whatever is here (ADR 0217): the switcher's Watch Chips work, and More
  // walkthroughs after it.
  const [watching, setWatching] = useState<string | undefined>(undefined);
  const filmOver = (
    <FilmOver
      watching={watching}
      onWatching={setWatching}
      toPairing={toPairing}
      lookAround={lookAround}
    />
  );
  const watchFilm = () => setWatching(FIRST_FILM);

  if (current === undefined || pairingAnother) {
    if (!looked) return null;
    const cancel = () => {
      setPairingAnother(false);
      setPairingWay(undefined);
    };
    return (
      <>
        <Pair
          key={pairingWay ?? "first"}
          onPaired={paired}
          desktop={desktop}
          onLookAround={() => void lookAround()}
          opensOn={pairingWay}
          {...(rejected
            ? { reason: "This server does not know this browser. Pair it again." }
            : {})}
          {...(current === undefined
            ? {}
            : { onCancel: cancel, cancelLabel: `Back to ${workspaceLabel(current)}` })}
        />
        {filmOver}
      </>
    );
  }
  return (
    <>
      <Paired
        device={current}
        devices={all}
        desktop={desktop}
        onRejected={unpair}
        onSignOut={signOut}
        onSwitch={(deviceId) => void switchTo(deviceId)}
        onMute={(deviceId, muted) => void mute(deviceId, muted)}
        onJoined={paired}
        onLand={land}
        landIn={landing.of(current.deviceId)}
        onLanded={landing.clear}
        onRemoveDemo={forgetDemo}
        onWatchDemo={watchFilm}
        demoRun={runIn(current, demo)}
        onSetUpOwn={setUpOwn}
        onPairAnother={pairsAnother(desktop, current, () => setPairingAnother(true))}
      />
      {filmOver}
    </>
  );
}

/**
 * The film's video over the page while one is watched (ADR 0217). Leave is back to the page as it
 * was; the end card's Set up and invite go to the pairing page on that way in, and Look around
 * makes the demo and puts it in front.
 */
function FilmOver({
  watching,
  onWatching,
  toPairing,
  lookAround,
}: {
  readonly watching: string | undefined;
  readonly onWatching: (film: string | undefined) => void;
  readonly toPairing: (way: Way) => void;
  readonly lookAround: () => Promise<void>;
}) {
  if (watching === undefined) return null;
  const film = videoNamed(watching) ?? VIDEOS[0];
  if (film === undefined) return null;
  const off = (then: () => void) => () => {
    onWatching(undefined);
    then();
  };
  return (
    <FilmPlayer
      key={film.key}
      video={film}
      ways={{
        onLeave: off(() => undefined),
        onSetUp: off(() => toPairing("own")),
        onInvite: off(() => toPairing("invite")),
        onFilm: onWatching,
        onLookAround: off(() => void lookAround()),
      }}
    />
  );
}

/**
 * Put a workspace in front. The demo is in no storage to switch in: it is put in front here, and
 * kept there for the next launch; any other is put in front where it is kept.
 */
async function switchWorkspace(
  deviceId: string,
  demo: DemoHold,
  setCurrentId: (deviceId: string) => void,
): Promise<void> {
  if (isDemo({ deviceId })) {
    demo.standing(true);
    setCurrentId(deviceId);
    return;
  }
  const chosen = await switchDevice(deviceId);
  if (chosen === undefined) return;
  demo.standing(false);
  setCurrentId(chosen.deviceId);
}

/** What the demo's store plays, when the workspace in front is the demo's. */
function runIn(current: Device, demo: DemoHold): DemoRun | undefined {
  return isDemo(current) ? demo.held?.run : undefined;
}

/**
 * Pairing another while a workspace is in front: the desktop shell's, and in a browser only from
 * the demo, where it is setting up your own.
 */
function pairsAnother(
  desktop: Desktop | undefined,
  current: Device,
  pair: () => void,
): (() => void) | undefined {
  return desktop !== undefined || isDemo(current) ? pair : undefined;
}

/** The workspace in front at launch: the demo when it was kept in front or is all there is. */
function frontAtLaunch(
  devices: readonly Device[],
  demo: { readonly device: Device; readonly front: boolean } | undefined,
): string | undefined {
  const first = devices[0]?.deviceId;
  if (demo === undefined) return first;
  return demo.front || first === undefined ? demo.device.deviceId : first;
}

/** The paired workspaces, and the demo after them when there is one. */
function besideDemo(devices: readonly Device[], demo: Device | undefined): readonly Device[] {
  return demo === undefined ? devices : [...devices, demo];
}

/**
 * The demo's ways in and out, at the app's level (ADR 0213): Watch, in the render mode alone (ADR
 * 0217), makes it if it is not here and plays a film in front; Look around from the video's end
 * card makes it, played whole and kept; Set up and invite go to the pairing page on that way in.
 */
function useDemoFlow(input: {
  readonly demo: DemoHold;
  readonly devices: readonly Device[];
  readonly setCurrentId: Dispatch<SetStateAction<string | undefined>>;
  readonly setPairingAnother: (on: boolean) => void;
  readonly setPairingWay: (way: Way | undefined) => void;
}) {
  const { demo, devices, setCurrentId, setPairingAnother, setPairingWay } = input;

  /** The demo gone: the workspace that is kept comes forward, or the pairing page. */
  const forgetDemo = useCallback(() => {
    demo.forget();
    setCurrentId((now) => (now === DEMO_DEVICE_ID ? devices[0]?.deviceId : now));
  }, [demo.forget, devices, setCurrentId]);

  /** Watch a film: the demo made if it is not here yet, put in front, its film from `from`. */
  const watch = async (film: string = FIRST_FILM, from = 0) => {
    let device = demo.held?.device;
    try {
      device ??= await demoDevice();
    } catch {
      // A browser that cannot make a key in memory has no demo to show.
      return;
    }
    demo.play(device, film, from);
    setPairingAnother(false);
    setPairingWay(undefined);
    setCurrentId(device.deviceId);
  };

  /**
   * Look around from any film's video (ADR 0217), which made no demo: made here if it is not, the
   * first film played whole, kept and in front.
   */
  const lookAround = async () => {
    let device = demo.held?.device;
    try {
      device ??= await demoDevice();
    } catch {
      return;
    }
    demo.lookAround(device);
    setPairingAnother(false);
    setPairingWay(undefined);
    setCurrentId(device.deviceId);
  };

  /**
   * To the pairing page, open on one of its ways in: from the video's end card, or from Not in
   * the demo while looking around, with the demo left as it is behind the page.
   */
  const toPairing = (way: Way) => {
    setPairingWay(way);
    setPairingAnother(true);
  };

  return { forgetDemo, watch, setUpOwn: () => toPairing("own"), toPairing, lookAround };
}

/** A room to open in a workspace once its shell is up (ADR 0168). */
interface Landing {
  readonly deviceId: string;
  readonly spaceId: string;
}

/**
 * The room a link let this person into (ADR 0168), and in which workspace: kept here, above the
 * shell, because joining or switching to that workspace draws the shell again.
 */
function useLandingRoom() {
  const [landing, setLanding] = useState<Landing | undefined>(undefined);
  const set = useCallback((deviceId: string, spaceId: string | undefined) => {
    if (spaceId !== undefined) setLanding({ deviceId, spaceId });
  }, []);
  const clear = useCallback(() => setLanding(undefined), []);
  /** The room waiting for this workspace's shell, if any. */
  const of = (deviceId: string) => (landing?.deviceId === deviceId ? landing.spaceId : undefined);
  return { set, clear, of };
}

interface PairedProps {
  readonly device: Device;
  readonly devices: readonly Device[];
  readonly desktop: Desktop | undefined;
  readonly onRejected: () => void;
  readonly onSignOut: () => void;
  readonly onSwitch: (deviceId: string) => void;
  readonly onMute: (deviceId: string, muted: boolean) => void;
  readonly onPairAnother?: (() => void) | undefined;
  /**
   * A workspace joined by an invite while paired (ADR 0164): kept, and put in front; and for a
   * space's link, the room it brought them into (ADR 0168).
   */
  readonly onJoined: (device: Device, spaceId?: string) => void;
  /** Open a room in a workspace here, switching to it first (ADR 0168). */
  readonly onLand: (deviceId: string, spaceId: string) => void;
  /** The room to open as this shell comes up, and that it has been taken. */
  readonly landIn: string | undefined;
  readonly onLanded: () => void;
  /** Remove the demo from the switcher (ADR 0213). */
  readonly onRemoveDemo: () => void;
  /** The demo's films again, from the switcher, once Look around has kept it (ADR 0213). */
  readonly onWatchDemo: () => void;
  /** What the demo's store plays, when the device in front is the demo's. */
  readonly demoRun?: DemoRun | undefined;
  /** Set up my own Chips, beside what is not in the demo (ADR 0213, point 7). */
  readonly onSetUpOwn: () => void;
}

/** The store in front, and the demo's player when it is the demo's. */
interface Held {
  readonly device: Device;
  readonly run: DemoRun | undefined;
  readonly store: Store;
  readonly player: DemoPlayer | undefined;
}

/**
 * The store for the device in front: made in an effect and closed in its cleanup, so a device
 * that changes, or leaves, takes its socket with it. The demo's is made again for each run of it:
 * a chapter of the bar, a film, Look around.
 *
 * Not `useMemo`. A store opens a socket as it is made, and nothing closed a memoised one: Strict
 * Mode makes the value twice and keeps one, and a switch left the old store running behind the
 * background store `useWorkspaces` makes for the same device. Two stores for one device are two
 * sockets, and through the relay two tunnels, each closing the other's (CI, 13 September 2026).
 * A layout effect, so the frame without a store is never painted.
 */
function useStoreFor(device: Device, run: DemoRun | undefined): Held | undefined {
  const [held, setHeld] = useState<Held>();
  useLayoutEffect(() => {
    const made = makeStore(device, run);
    setHeld({ device, run, store: made.store, player: made.player });
    return made.close;
  }, [device, run]);
  return held?.device === device && held.run === run ? held : undefined;
}

function Paired(props: PairedProps) {
  const held = useStoreFor(props.device, props.demoRun);
  if (held === undefined) return null;
  // A fresh shell for each run of the demo, as it is a fresh store.
  const shell = <PairedWith key={props.demoRun?.n ?? 0} {...props} store={held.store} />;
  if (held.player === undefined || props.demoRun?.playing !== true) return shell;
  // Only the render mode plays a film live (ADR 0217).
  return (
    <FilmSourceStage player={held.player} store={held.store}>
      {shell}
    </FilmSourceStage>
  );
}

function PairedWith({
  device,
  devices,
  desktop,
  onRejected,
  onSignOut,
  onSwitch,
  onMute,
  onPairAnother,
  onJoined,
  onLand,
  landIn,
  onLanded,
  onRemoveDemo,
  onWatchDemo,
  onSetUpOwn,
  store,
}: PairedProps & {
  readonly store: Store;
}) {
  const [link, setLink] = useState<string | undefined>(undefined);
  const arrived = useArrivedInvite(desktop);
  // The other workspaces, in the background, unless muted here.
  const others = useWorkspaces(devices, device.deviceId);
  // The demo is heard by nothing outside it: no banner, no count in the menu bar (ADR 0213).
  const watched = useMemo(
    () => [
      ...(device.muted === true || isDemo(device) ? [] : [store]),
      ...devices
        .filter((each) => each.deviceId !== device.deviceId && each.muted !== true && !isDemo(each))
        .flatMap((each) => {
          const background = others.stores.get(each.deviceId);
          return background === undefined ? [] : [background];
        }),
    ],
    [store, device, devices, others.stores],
  );
  useDesktop({
    stores: watched,
    desktop,
    // A pairing link is for the pairing screen: paired, the app keeps the key it holds, as the
    // phone does when `pnpm phone` launches it with a code it does not need.
    onOpen: (opened) => {
      if (opened.kind === "join") arrived.set(opened.invite);
      else if (opened.kind !== "pair") setLink(opened.id);
    },
  });
  // Banners go to the shell when there is one, else to the browser when it has been allowed —
  // from the moment it is, with no reload (ADR 0085).
  const browser = useBrowserNotifier();
  const notifier = useMemo(
    () => (desktop === undefined ? browser : desktopNotifier(desktop)),
    [desktop, browser],
  );
  useNotifications({ stores: watched, notifier });

  // A key the server has never heard of is not a connection problem, and no shell can be drawn
  // from it. Rather than an empty room that retries for ever, go back and say so.
  const connection = useSyncExternalStore(store.subscribe, () => store.getSnapshot().connection);
  // What the one in front is called now (ADR 0193): the list was read from storage at launch,
  // under the name each device paired with.
  const called = useSyncExternalStore(store.subscribe, () => store.getSnapshot().workspaceName);
  // Removed by their own hand, from here (ADR 0243): said as their leaving.
  const left = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().deletedAccount === true,
  );
  useEffect(() => {
    if (connection === "rejected") onRejected();
  }, [connection, onRejected]);
  if (connection === "rejected") return null;
  // Removed from the workspace (ADR 0160), or gone by deleting their account here (ADR 0243): said
  // here, in place of everything, until OK.
  if (connection === "removed") {
    return <Removed workspace={workspaceLabel(device)} left={left} onSeen={onSignOut} />;
  }

  // Each behind by what its own store last heard its server say, as the one in front is.
  const heard = (each: Device) =>
    each.deviceId === device.deviceId
      ? called
      : others.stores.get(each.deviceId)?.getSnapshot().workspaceName;
  const workspaces: WorkspaceTab[] = devices.map((each) => ({
    deviceId: each.deviceId,
    label: heard(each) ?? workspaceLabel(each),
    current: each.deviceId === device.deviceId,
    muted: each.muted === true,
    needsYou: each.deviceId === device.deviceId ? undefined : others.needs[each.deviceId],
    ...(isDemo(each) ? { demo: true } : {}),
  }));

  return (
    <>
      <SetUpOwn.Provider value={isDemo(device) ? onSetUpOwn : undefined}>
        <Shell
          store={store}
          device={device}
          onSignOut={onSignOut}
          workspaces={workspaces}
          onSwitch={onSwitch}
          onMute={onMute}
          {...(onPairAnother === undefined ? {} : { onPairAnother })}
          {...(link === undefined ? {} : { openId: link })}
          landIn={landIn}
          onLanded={onLanded}
          onRemoveDemo={onRemoveDemo}
          onWatchDemo={onWatchDemo}
        />
      </SetUpOwn.Provider>
      {arrived.invite !== undefined && (
        <InviteArrived
          key={arrived.invite.token}
          invite={arrived.invite}
          inShell={desktop !== undefined}
          devices={devices.filter((each) => !isDemo(each))}
          current={device}
          name={
            store.getSnapshot().directory[device.participantId]?.displayName ?? device.displayName
          }
          storeOf={(deviceId) =>
            deviceId === device.deviceId ? store : others.stores.get(deviceId)
          }
          onOpen={onSwitch}
          onLand={onLand}
          onJoined={onJoined}
          onDone={arrived.clear}
        />
      )}
    </>
  );
}

/**
 * An invite that reaches a paired tab or the Mac app (ADR 0164): in the address the tab was opened
 * at, in one pasted into the address of a tab already open, or a `chips://join` link the app was
 * handed (`set`, from the shell's links). Taken out of the address once it is read, so a reload
 * doesn't ask again.
 */
function useArrivedInvite(desktop: Desktop | undefined): {
  readonly invite: InviteLink | undefined;
  readonly set: (invite: InviteLink) => void;
  readonly clear: () => void;
} {
  const [invite, setInvite] = useState<InviteLink | undefined>(() =>
    typeof location === "undefined" || desktop !== undefined
      ? undefined
      : inviteFromLink(location.href),
  );
  useEffect(() => {
    if (typeof window === "undefined" || desktop !== undefined) return;
    const read = () => {
      const sent = inviteFromLink(location.href);
      if (sent !== undefined) setInvite(sent);
    };
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [desktop]);
  const clear = useCallback(() => {
    setInvite(undefined);
    if (typeof history !== "undefined" && desktop === undefined && location.hash !== "") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, [desktop]);
  return { invite, set: setInvite, clear };
}
