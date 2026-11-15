/**
 * What waits to be updated on this phone or iPad, and whether the gold dot is lit (ADR 0296).
 *
 * One provider over every screen, so the dot on the tabs, About's Updates group and the dot on You's
 * About Chips row read the same facts. It reads `GET /v1/server` when the paired store is there,
 * again when the app comes back to the front after ten minutes or more, and whenever About comes
 * into view (`opened`), which is also how About says what the computer runs. What is asked, kept
 * and put back is core's (`readComputer`), as are the dot's rules (`updateDot`, `updatesWaiting`),
 * so the Mac and the web do the same. Whether the dot is on here, and when About last put it out,
 * are this device's settings (`prefs.ts`).
 */

import {
  aboutRowLit,
  type ComputerRead,
  type ComputerReader,
  type ComputerSays,
  computerFollowsApp,
  type Directory,
  type DotSeen,
  myRole,
  type NeedsUpdateRow,
  NOTHING_SAID,
  needsUpdate,
  ownerDotKey,
  ownerDotLit,
  readComputer,
  type SelfUpdateFacts,
  type Software,
  type Store,
  sameNeeds,
  type UpdatesWaiting,
  updateDot,
  updatesAsking,
  updatesWaiting,
} from "@chipschat/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { appBuild } from "../about/build";
import { readSetting, SETTINGS, writeSetting } from "../prefs";
import { useChips } from "../store/provider";

/** The computer as About says it: being read, read, or not reached. */
export type Computer = ComputerRead;

export interface Updates {
  readonly computer: Computer;
  /** What waits, whether or not anybody has to act: About's rows say it. */
  readonly waiting: UpdatesWaiting;
  /** What waits that asks something of somebody: About's Update buttons. */
  readonly asking: UpdatesWaiting;
  /** The version the dot names while it is lit. */
  readonly dot: { readonly version: string } | undefined;
  readonly enabled: boolean;
  readonly setEnabled: (on: boolean) => void;
  /**
   * About came into view: the computer is read again, and for as long as About stays in view the
   * dot is out for whatever lights it. What it returns says About has gone.
   */
  readonly opened: () => () => void;
  /** What each harness and device runs (everything in step), where the computer says. */
  readonly software: Software | undefined;
  /** What everything runs, read again: a harness's page asks as it comes into view. */
  readonly readSoftware: () => void;
  /** For the owner: what needs someone, About's Needs update list (ADR 0297). */
  readonly needs: readonly NeedsUpdateRow[];
  /** Whether the dot is lit for the owner by a bridge or a failed night, beside a release. */
  readonly ownerLit: boolean;
  /** Whether the About Chips row in You wears its small dot: something asks somebody. */
  readonly rowLit: boolean;
  /** For the owner of a computer from the install line: its night switch and last update. */
  readonly selfUpdate: SelfUpdateFacts | undefined;
  readonly setNightly: (on: boolean) => void;
  /** The owner's switch "Keep this bridge up to date". */
  readonly keepBridge: (harnessId: string, on: boolean) => void;
}

const NOTHING: Updates = {
  computer: { kind: "reading" },
  waiting: {},
  asking: {},
  dot: undefined,
  enabled: true,
  setEnabled: () => {},
  opened: () => () => {},
  software: undefined,
  readSoftware: () => {},
  needs: [],
  ownerLit: false,
  rowLit: false,
  selfUpdate: undefined,
  setNightly: () => {},
  keepBridge: () => {},
};

const UpdatesContext = createContext<Updates>(NOTHING);

export function useUpdates(): Updates {
  return useContext(UpdatesContext);
}

/** How long the app is away before coming back reads the computer again. */
export const READ_AGAIN_MS = 10 * 60 * 1000;

/** Whether this person owns the workspace, re-read only when that changes. */
function useOwner(store: Store | undefined, self: string | undefined): boolean {
  const subscribe = useCallback(
    (listen: () => void) => (store === undefined ? () => {} : store.subscribe(listen)),
    [store],
  );
  const owner = useCallback(
    () =>
      store !== undefined &&
      self !== undefined &&
      myRole(store.getSnapshot().model, self) === "owner",
    [store, self],
  );
  return useSyncExternalStore(subscribe, owner, owner);
}

/**
 * Who is who, as the paired store says now. The names in About's Needs update list follow it:
 * what everything runs can land before the directory does, and a name can change after.
 */
function useDirectory(store: Store | undefined): Directory | undefined {
  const subscribe = useCallback(
    (listen: () => void) => (store === undefined ? () => {} : store.subscribe(listen)),
    [store],
  );
  const directory = useCallback(() => store?.getSnapshot().directory, [store]);
  return useSyncExternalStore(subscribe, directory, directory);
}

function readSeen(raw: string | undefined): DotSeen | undefined {
  if (raw === undefined) return undefined;
  try {
    const seen = JSON.parse(raw) as { version?: unknown; at?: unknown };
    return typeof seen.version === "string" && typeof seen.at === "number"
      ? { version: seen.version, at: seen.at }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Over every screen: the paired store's, and whether this person owns its workspace. */
export function UpdatesRoot({ children }: { readonly children: ReactNode }) {
  const { paired } = useChips();
  const owner = useOwner(paired?.store, paired?.device.participantId);
  const directory = useDirectory(paired?.store);
  return (
    <UpdatesProvider
      store={paired?.store}
      owner={owner}
      me={paired?.device.participantId}
      thisDevice={paired?.device.deviceId}
      directory={directory}
    >
      {children}
    </UpdatesProvider>
  );
}

/**
 * What the computer of the workspace in front says, read when there is one to ask and when the
 * app comes back after a while, and `read` to ask again. Each workspace has a reader of its own,
 * made at the first ask and closed when another takes its place: what the one before said is put
 * away, and an answer from it that lands late is dropped.
 */
function useComputerSays(store: Store | undefined): {
  readonly says: ComputerSays;
  readonly now: number;
  readonly read: () => void;
  readonly reader: () => ComputerReader | undefined;
} {
  const [says, setSays] = useState<ComputerSays>(NOTHING_SAID);
  const [now, setNow] = useState(() => Date.now());
  const readAt = useRef(0);
  const made = useRef<{ readonly of: Store; readonly reader: ComputerReader } | undefined>(
    undefined,
  );
  const reader = useCallback(() => {
    if (store === undefined) return undefined;
    if (made.current?.of !== store) {
      made.current?.reader.close();
      const through = {
        serverFacts: () => store.serverFacts(),
        software: () => store.software(),
        setSelfUpdate: (automatic: boolean) => store.setSelfUpdate(automatic),
        keepBridgeCurrent: (harnessId: string, keepCurrent: boolean) =>
          store.keepBridgeCurrent(harnessId, keepCurrent),
      };
      made.current = { of: store, reader: readComputer(through, setSays) };
    }
    return made.current.reader;
  }, [store]);

  const read = useCallback(() => {
    const asking = reader();
    if (asking === undefined) return;
    readAt.current = Date.now();
    setNow(readAt.current);
    asking.read();
  }, [reader]);

  useEffect(() => {
    // Another workspace starts from nothing known.
    setSays(NOTHING_SAID);
    read();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - readAt.current >= READ_AGAIN_MS) read();
    });
    return () => {
      subscription.remove();
      made.current?.reader.close();
      made.current = undefined;
    };
  }, [read]);

  return { says, now, read, reader };
}

/** The dot while it is lit: the version it names. */
type Dot = { readonly version: string } | undefined;

/** What this device keeps of the dot: whether it is on, and what About last put it out for. */
interface Kept {
  readonly enabled: boolean;
  readonly seen: DotSeen | undefined;
  readonly seenNeeds: string | undefined;
}

/**
 * The dot as About has left it, the switch that turns it off, and `opened`, which About calls as
 * it comes into view. Until this device's settings are read the dot stays out, rather than
 * flashing on. For as long as About is in view, whatever lights the dot is seen as it comes:
 * opening About puts the dot out, and so does something new arriving with About already open.
 * `dotFor` is the release's dot given what was seen; `needsKey` is what needs the owner now.
 */
function useSeen(
  dotFor: (seen: DotSeen | undefined, enabled: boolean) => Dot,
  needsKey: string | undefined,
  read: () => void,
): {
  readonly dot: Dot;
  /** Whether something needs the owner that wasn't there when About last put the dot out. */
  readonly needsNew: boolean;
  readonly enabled: boolean | undefined;
  readonly setEnabled: (on: boolean) => void;
  readonly opened: () => () => void;
} {
  const [kept, setKept] = useState<Kept | undefined>(undefined);
  useEffect(() => {
    void Promise.all([
      readSetting(SETTINGS.updateDot),
      readSetting(SETTINGS.updateSeen),
      readSetting(SETTINGS.updateSeenNeeds),
    ]).then(
      ([dot, seen, seenNeeds]) =>
        setKept({ enabled: dot !== "off", seen: readSeen(seen), seenNeeds }),
      () => setKept({ enabled: true, seen: undefined, seenNeeds: undefined }),
    );
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setKept((was) => ({ enabled: on, seen: was?.seen, seenNeeds: was?.seenNeeds }));
    void writeSetting(SETTINGS.updateDot, on ? "on" : "off");
  }, []);

  // How many Abouts are in view: one, or none.
  const [shown, setShown] = useState(0);
  const opened = useCallback(() => {
    read();
    setShown((count) => count + 1);
    return () => setShown((count) => count - 1);
  }, [read]);

  const loaded = kept !== undefined;
  const dot = useMemo(
    () => (kept === undefined ? undefined : dotFor(kept.seen, kept.enabled)),
    [dotFor, kept],
  );
  const version = dot?.version;
  const needsNew = kept !== undefined && ownerDotLit(needsKey, kept.seenNeeds);
  useEffect(() => {
    if (shown === 0 || !loaded) return;
    if (needsKey !== undefined && needsNew) {
      setKept((was) => (was === undefined ? was : { ...was, seenNeeds: needsKey }));
      void writeSetting(SETTINGS.updateSeenNeeds, needsKey);
    }
    if (version === undefined) return;
    const seen = { version, at: Date.now() };
    setKept((was) => (was === undefined ? was : { ...was, seen }));
    void writeSetting(SETTINGS.updateSeen, JSON.stringify(seen));
  }, [shown, loaded, version, needsKey, needsNew]);

  return { dot, needsNew, enabled: kept?.enabled, setEnabled, opened };
}

export function UpdatesProvider({
  store,
  owner,
  me,
  thisDevice,
  directory,
  children,
}: {
  readonly store: Store | undefined;
  readonly owner: boolean;
  /** This person, and this device, which About's Updates group shows already. */
  readonly me?: string | undefined;
  readonly thisDevice?: string | undefined;
  /** Who is who, for the names in About's Needs update list. */
  readonly directory?: Directory | undefined;
  readonly children: ReactNode;
}) {
  const { says, now, read, reader } = useComputerSays(store);
  const { computer, feed, selfUpdate, software } = says;

  const facts = useMemo(
    () => ({
      device: "phone" as const,
      app: appBuild().version,
      computer: computer.kind === "read" ? computer.facts.version : undefined,
      owner,
      feed,
      computerFollowsApp: computerFollowsApp(selfUpdate),
    }),
    [computer, owner, feed, selfUpdate],
  );
  const waiting = useMemo(() => updatesWaiting(facts), [facts]);
  const asking = useMemo(() => updatesAsking(facts), [facts]);

  // The list a screen has drawn is kept while a new one says the same: the directory changes far
  // more often than what needs an update does.
  const drawn = useRef<readonly NeedsUpdateRow[]>([]);
  const needs = useMemo(() => {
    const next =
      !owner || me === undefined
        ? []
        : needsUpdate({
            software,
            feed,
            now,
            me,
            thisDevice,
            harnessName: (id) => directory?.[id]?.displayName,
            personName: (id) => directory?.[id]?.displayName.split(" ")[0],
          });
    if (!sameNeeds(drawn.current, next)) drawn.current = next;
    return drawn.current;
  }, [owner, me, thisDevice, directory, software, feed, now]);
  const needsKey = owner ? ownerDotKey(needs, selfUpdate) : undefined;

  const dotFor = useCallback(
    (seen: DotSeen | undefined, enabled: boolean) => updateDot(facts, { now, enabled, seen }),
    [facts, now],
  );
  const { dot, needsNew, enabled, setEnabled, opened } = useSeen(dotFor, needsKey, read);
  const ownerLit = enabled === true && needsNew;
  const rowLit = aboutRowLit(asking, needs);

  const setNightly = useCallback((on: boolean) => reader()?.setNightly(on), [reader]);
  const keepBridge = useCallback(
    (harnessId: string, on: boolean) => reader()?.keepBridge(harnessId, on),
    [reader],
  );
  const readSoftware = useCallback(() => reader()?.readSoftware(), [reader]);

  const value = useMemo<Updates>(
    () => ({
      computer,
      waiting,
      asking,
      dot,
      enabled: enabled ?? true,
      setEnabled,
      opened,
      software,
      readSoftware,
      needs,
      ownerLit,
      rowLit,
      selfUpdate,
      setNightly,
      keepBridge,
    }),
    [
      computer,
      waiting,
      asking,
      dot,
      enabled,
      setEnabled,
      opened,
      software,
      readSoftware,
      needs,
      ownerLit,
      rowLit,
      selfUpdate,
      setNightly,
      keepBridge,
    ],
  );
  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}
