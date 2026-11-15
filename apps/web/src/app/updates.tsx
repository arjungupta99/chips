/**
 * What waits to be updated on the Mac or in this browser, and the gold dot that says so (ADR 0296).
 *
 * One provider over the shell, so the dot, About's Updates group and the small dot on You's About
 * Chips row read the same facts. It reads `GET /v1/server` as the shell opens, again when the page
 * comes back into view after ten minutes or more, and whenever About opens (`opened`), which is
 * also how About says what the computer runs and what puts the dot out. Nothing else reads it: the
 * shell hands in new names whenever the directory changes, and that is no reason to ask again.
 * What is asked, kept and put back is core's (`readComputer`), as are the dot's rules; whether the
 * dot is on here, and when About last put it out, are this browser's (`localStorage`).
 *
 * The dot stands at the right end of a bar, never over a title. In Chips for Mac's window it is the
 * strip the overlay title bar leaves over the columns (`bar`); with no strip, in a browser or in
 * full screen, the rail's top row, before the + (`rail`); at a phone's width, the bar over the page
 * (`narrow`). Each place draws its own and the stylesheet shows the one that fits (styles.css).
 */

import {
  aboutRowLit,
  type ComputerRead,
  type ComputerReader,
  type ComputerSays,
  computerFollowsApp,
  DOT_LABEL,
  type DotSeen,
  type MacUpdate,
  macUpdatesItself,
  type NeedsUpdateRow,
  NOTHING_SAID,
  needsUpdate,
  ownerDotKey,
  ownerDotLit,
  readComputer,
  type SelfUpdateFacts,
  type ServerFacts,
  type Software,
  sameNeeds,
  type UpdateDevice,
  type UpdatesWaiting,
  updateDot,
  updatesAsking,
  updatesWaiting,
} from "@chipschat/core";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** The computer as About says it: being read, read, or not reached. */
export type Computer = ComputerRead;

export interface Updates {
  readonly device: UpdateDevice;
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
  /** What everything runs, read again: a harness's page asks as it opens. */
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
  /** How Chips for Mac's own update stands (ADR 0298); undefined in a browser. */
  readonly macUpdate: MacUpdate | undefined;
  /** Restart now: the Mac's release waiting goes in, and the app opens again. */
  readonly restartNow: () => void;
}

/** Chips for Mac's own update, as the shell says it (ADR 0298). */
export interface MacUpdater {
  readonly onUpdate: (listen: (update: MacUpdate) => void) => Promise<() => void>;
  readonly updateNow: () => Promise<void>;
}

/** What the provider reads and writes besides `GET /v1/server`; none in a test that needs none. */
export interface UpdatesServer {
  readonly software: () => Promise<Software | undefined>;
  readonly setSelfUpdate: (automatic: boolean) => Promise<SelfUpdateFacts | undefined>;
  readonly keepBridgeCurrent: (harnessId: string, keepCurrent: boolean) => Promise<void>;
  /** This person, and this device, which About's Updates group shows already. */
  readonly me: string;
  readonly thisDevice: string;
  readonly harnessName: (harnessId: string) => string | undefined;
  readonly personName: (personId: string) => string | undefined;
}

const NOTHING: Updates = {
  device: "browser",
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
  macUpdate: undefined,
  restartNow: () => {},
};

const UpdatesContext = createContext<Updates>(NOTHING);

export function useUpdates(): Updates {
  return useContext(UpdatesContext);
}

/** Opens About, for a room's line that says something there needs a newer Chips (ADR 0297). */
export const OpenAbout = createContext<(() => void) | undefined>(undefined);

/** Where this browser keeps whether the dot is on, and what About last put it out for. */
export const DOT_KEY = "chips.update.dot";
export const SEEN_KEY = "chips.update.seen";
/** What needed the owner when About last put the dot out for it. */
export const SEEN_NEEDS_KEY = "chips.update.seen-needs";
/** How long the page is away before coming back reads the computer again. */
export const READ_AGAIN_MS = 10 * 60 * 1000;

function kept(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function keep(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // A browser that keeps nothing forgets it at the next load, which is all that is lost.
  }
}

function keptSeen(): DotSeen | undefined {
  const raw = kept(SEEN_KEY);
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

/** What the provider is handed to ask the computer through, as of the last render. */
interface Through {
  readonly read: () => Promise<ServerFacts>;
  readonly server: UpdatesServer | undefined;
}

/**
 * What the computer says, read as the shell opens and when the page comes back into view after a
 * while, and `read` to ask again. The reader is made at the first ask and closed with the shell,
 * so an answer that lands after the workspace was switched, which remounts the shell, is dropped.
 * It asks through whatever the shell hands in now (`through`), so a new `server` object for the
 * same computer asks nothing again.
 */
function useComputerSays(through: { readonly current: Through }): {
  readonly says: ComputerSays;
  readonly now: number;
  readonly read: () => void;
  readonly reader: () => ComputerReader;
} {
  const [says, setSays] = useState<ComputerSays>(NOTHING_SAID);
  const [now, setNow] = useState(() => Date.now());
  const readAt = useRef(0);
  const made = useRef<ComputerReader | undefined>(undefined);
  const reader = useCallback(() => {
    made.current ??= readComputer(
      {
        serverFacts: () => through.current.read(),
        software: async () => through.current.server?.software(),
        setSelfUpdate: async (automatic) => through.current.server?.setSelfUpdate(automatic),
        keepBridgeCurrent: async (harnessId, keepCurrent) =>
          through.current.server?.keepBridgeCurrent(harnessId, keepCurrent),
      },
      setSays,
    );
    return made.current;
  }, [through]);

  const read = useCallback(() => {
    readAt.current = Date.now();
    setNow(readAt.current);
    reader().read();
  }, [reader]);

  useEffect(() => {
    read();
    const back = () => {
      if (document.visibilityState === "visible" && Date.now() - readAt.current >= READ_AGAIN_MS)
        read();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      made.current?.close();
      made.current = undefined;
    };
  }, [read]);

  return { says, now, read, reader };
}

/** Chips for Mac's own update as the shell says it, and Restart now (ADR 0298). */
function useMacUpdate(mac: Promise<MacUpdater | undefined> | undefined): {
  readonly macUpdate: MacUpdate | undefined;
  readonly restartNow: () => void;
} {
  const [macUpdate, setMacUpdate] = useState<MacUpdate | undefined>(undefined);
  useEffect(() => {
    if (mac === undefined) return;
    let stop: (() => void) | undefined;
    let gone = false;
    void mac
      .then((shell) => shell?.onUpdate(setMacUpdate))
      .then((unlisten) => {
        if (gone) unlisten?.();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      stop?.();
    };
  }, [mac]);
  const restartNow = useCallback(() => {
    void mac?.then((shell) => shell?.updateNow()).catch(() => undefined);
  }, [mac]);
  return { macUpdate, restartNow };
}

/** The dot while it is lit: the version it names. */
type Dot = { readonly version: string } | undefined;

/**
 * The dot as About has left it, and `opened`, which About calls as it comes into view. What About
 * last put the dot out for is kept here. For as long as About is in view, whatever lights the dot
 * is seen as it comes: opening About puts the dot out, and so does something new arriving with
 * About already open. `dotFor` is the release's dot given what was seen; `needsKey` is what needs
 * the owner now.
 */
function useSeen(
  dotFor: (seen: DotSeen | undefined) => Dot,
  needsKey: string | undefined,
  read: () => void,
): {
  readonly dot: Dot;
  /** Whether something needs the owner that wasn't there when About last put the dot out. */
  readonly needsNew: boolean;
  readonly opened: () => () => void;
} {
  const [seen, setSeen] = useState<DotSeen | undefined>(keptSeen);
  const [seenNeeds, setSeenNeeds] = useState(() => kept(SEEN_NEEDS_KEY));
  // How many Abouts are in view: one, or none.
  const [shown, setShown] = useState(0);
  const opened = useCallback(() => {
    read();
    setShown((count) => count + 1);
    return () => setShown((count) => count - 1);
  }, [read]);

  const dot = useMemo(() => dotFor(seen), [dotFor, seen]);
  const version = dot?.version;
  const needsNew = ownerDotLit(needsKey, seenNeeds);
  useEffect(() => {
    if (shown === 0) return;
    if (needsKey !== undefined && needsNew) {
      setSeenNeeds(needsKey);
      keep(SEEN_NEEDS_KEY, needsKey);
    }
    if (version === undefined) return;
    const next = { version, at: Date.now() };
    setSeen(next);
    keep(SEEN_KEY, JSON.stringify(next));
  }, [shown, version, needsKey, needsNew]);

  return { dot, needsNew, opened };
}

export function UpdatesProvider(props: {
  readonly read: () => Promise<ServerFacts>;
  readonly owner: boolean;
  readonly device: UpdateDevice;
  /** This app's version: the web build's, which is Chips for Mac's own. */
  readonly app?: string;
  readonly server?: UpdatesServer | undefined;
  /** Chips for Mac's own update; none in a browser, or from a shell older than it. */
  readonly mac?: Promise<MacUpdater | undefined> | undefined;
  readonly children: ReactNode;
}) {
  const { owner, device, server } = props;
  const app = props.app ?? __CHIPS_VERSION__;
  const through = useRef<Through>({ read: props.read, server });
  through.current = { read: props.read, server };
  const { says, now, read, reader } = useComputerSays(through);
  const { computer, feed, selfUpdate, software } = says;
  const { macUpdate, restartNow } = useMacUpdate(props.mac);
  const [enabled, setOn] = useState(() => kept(DOT_KEY) !== "off");

  const facts = useMemo(
    () => ({
      device,
      app,
      computer: computer.kind === "read" ? computer.facts.version : undefined,
      owner,
      feed,
      appUpdatesItself: device === "mac" && macUpdatesItself(macUpdate),
      computerFollowsApp: computerFollowsApp(selfUpdate),
    }),
    [device, app, computer, owner, feed, macUpdate, selfUpdate],
  );
  const waiting = useMemo(() => updatesWaiting(facts), [facts]);
  const asking = useMemo(() => updatesAsking(facts), [facts]);

  // The list a screen has drawn is kept while a new one says the same: the names come from the
  // directory, which changes far more often than what needs an update does.
  const drawn = useRef<readonly NeedsUpdateRow[]>([]);
  const needs = useMemo(() => {
    const next =
      !owner || server === undefined
        ? []
        : needsUpdate({
            software,
            feed,
            now,
            me: server.me,
            thisDevice: server.thisDevice,
            harnessName: server.harnessName,
            personName: server.personName,
          });
    if (!sameNeeds(drawn.current, next)) drawn.current = next;
    return drawn.current;
  }, [owner, server, software, feed, now]);
  const needsKey = owner ? ownerDotKey(needs, selfUpdate) : undefined;

  const dotFor = useCallback(
    (seen: DotSeen | undefined) => updateDot(facts, { now, enabled, seen }),
    [facts, now, enabled],
  );
  const { dot, needsNew, opened } = useSeen(dotFor, needsKey, read);
  const ownerLit = enabled && needsNew;
  const rowLit = aboutRowLit(asking, needs);

  const setNightly = useCallback(
    (on: boolean) => {
      if (through.current.server !== undefined) reader().setNightly(on);
    },
    [reader],
  );
  const keepBridge = useCallback(
    (harnessId: string, on: boolean) => {
      if (through.current.server !== undefined) reader().keepBridge(harnessId, on);
    },
    [reader],
  );
  const readSoftware = useCallback(() => reader().readSoftware(), [reader]);

  const setEnabled = useCallback((on: boolean) => {
    setOn(on);
    keep(DOT_KEY, on ? "on" : "off");
  }, []);

  const value = useMemo<Updates>(
    () => ({
      device,
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
      macUpdate,
      restartNow,
    }),
    [
      device,
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
      macUpdate,
      restartNow,
    ],
  );
  return <UpdatesContext.Provider value={value}>{props.children}</UpdatesContext.Provider>;
}

/** Where a dot is drawn: the Mac's title strip, the rail's top row, or the bar at a phone's width. */
export type DotPlace = "bar" | "rail" | "narrow";

/**
 * The dot: lands with one ring, then swells about every three seconds while it is lit, and opens
 * About when clicked. Still with reduced motion (styles.css). The Mac's strip is the page's, over
 * everything, so its dot is drawn at the page's end, out of any column's layer.
 */
export function UpdateDot(props: { readonly place: DotPlace; readonly onOpen: () => void }) {
  const { dot, ownerLit } = useUpdates();
  if (dot === undefined && !ownerLit) return null;
  const button = (
    <button
      key={dot?.version ?? "needs"}
      type="button"
      className="update-dot"
      aria-label={DOT_LABEL}
      title={dot === undefined ? "Something needs an update" : `Chips ${dot.version} is out`}
      onClick={props.onOpen}
      data-place={props.place}
      data-testid="update-dot"
    >
      <span className="update-dot-core" aria-hidden="true" />
    </button>
  );
  return props.place === "bar" ? createPortal(button, document.body) : button;
}

/** The wait before an Update button's first ring as About opens, and the beat between two. */
export const RING_WAIT_MS = 280;
export const RING_BEAT_MS = 160;

/**
 * About's Update button: a gold capsule, solid for this app and soft for the computer. As About
 * opens it sends out the dot's ring twice, a glow that widens from behind it and fades; `order`
 * starts each a beat after the one above it. Still with reduced motion (styles.css).
 */
export function UpdateButton(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly soft?: boolean;
  readonly order?: number;
  readonly testId?: string;
}) {
  const at = RING_WAIT_MS + (props.order ?? 0) * RING_BEAT_MS;
  return (
    <span className="update-ring" style={{ "--ring-at": `${at}ms` } as CSSProperties}>
      <button
        type="button"
        className={props.soft === true ? "update-btn is-soft" : "update-btn"}
        onClick={props.onClick}
        data-testid={props.testId}
      >
        {props.label}
      </button>
    </span>
  );
}

/**
 * The dot at the end of a row in About's Needs update list (ADR 0297): the update dot's own,
 * landing and breathing, kept clear of the row's chevron. Still with reduced motion (styles.css).
 */
export function NeedsDot() {
  return (
    <span className="update-dot needs-dot" role="img" aria-label="Needs update">
      <span className="update-dot-core" aria-hidden="true" />
    </span>
  );
}
