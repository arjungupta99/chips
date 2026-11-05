/**
 * What is open beside a tab's list on a wide screen, kept by the tabs rather than by the tab's
 * route (ADR 0177): the room beside Spaces and the card over it, the agent or the harness beside
 * Agents, a result beside Search's and a page beside You (ADR 0256).
 *
 * It was a search param on the tab's route until 16 October 2026, and a room open beside Spaces
 * was gone the moment Agents had been looked at: a tab that is pressed is jumped to, and React
 * Navigation's tab router gives a route jumped to without params its first params again, which
 * were none (`TabRouter`'s `JUMP_TO`, `createParamsFromAction`; seen on the iPad simulator, 15
 * October 2026). A param is still how a link, a push or a search result asks for something to be
 * opened there: the tab takes what it asks into this, and takes the param off its route, so the
 * next ask is a change however alike it is.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** What is open beside one tab's list: a room, an agent, a harness, and how far into it. */
export type Opened = Readonly<Record<string, string | undefined>>;

type Tab = "spaces" | "agents" | "search" | "you";

interface Kept {
  readonly opened: Readonly<Record<Tab, Opened>>;
  readonly set: (tab: Tab, next: Opened) => void;
}

const NOTHING: Opened = {};
const KeptContext = createContext<Kept | undefined>(undefined);

/** Keeps what is open beside each tab's list: put round the tabs, which outlive their visits. */
export function OpenedProvider({ children }: { readonly children: ReactNode }) {
  const [opened, setOpened] = useState<Readonly<Record<Tab, Opened>>>({
    spaces: NOTHING,
    agents: NOTHING,
    search: NOTHING,
    you: NOTHING,
  });
  const set = useCallback(
    (tab: Tab, next: Opened) => setOpened((now) => ({ ...now, [tab]: next })),
    [],
  );
  const kept = useMemo(() => ({ opened, set }), [opened, set]);
  return <KeptContext.Provider value={kept}>{children}</KeptContext.Provider>;
}

/**
 * What is open beside this tab's list, and how to open something else there. `keys` are the
 * params that say what is open; one of them arriving on the route opens what they say, in place
 * of whatever was open, and they are taken off the route. Outside a provider, as in a test, it is
 * kept by the component.
 */
export function useOpened(
  tab: Tab,
  keys: readonly string[],
): readonly [Opened, (next: Opened) => void] {
  const kept = useContext(KeptContext);
  const [own, setOwn] = useState<Opened>(NOTHING);
  const opened = kept?.opened[tab] ?? own;
  const set = useCallback(
    (next: Opened) => (kept === undefined ? setOwn(next) : kept.set(tab, next)),
    [kept, tab],
  );
  const params: Readonly<Record<string, unknown>> = useLocalSearchParams();
  const router = useRouter();
  const asked = pick(params, keys);
  const asking = Object.values(asked).some((value) => value !== undefined);
  const key = JSON.stringify(asked);
  const taken = asking && JSON.stringify(pick(opened, keys)) === key;
  // What was asked is kept first, and taken off the route only once it is: the two are separate
  // states, and the route's word gone a render before the keeping would show what was open before
  // for a frame, and draw the room asked for twice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is what was asked, by value.
  useEffect(() => {
    if (asking && !taken) set(asked);
  }, [key, taken]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when what was asked is kept.
  useEffect(() => {
    if (taken) router.setParams(Object.fromEntries(keys.map((name) => [name, undefined])));
  }, [taken]);
  // What a param asks is shown from the render it arrives in, not one later.
  return [asking ? asked : opened, set] as const;
}

function pick(params: Readonly<Record<string, unknown>>, keys: readonly string[]): Opened {
  const out: Record<string, string | undefined> = {};
  for (const name of keys) {
    const value = params[name];
    out[name] = typeof value === "string" ? value : undefined;
  }
  return out;
}
