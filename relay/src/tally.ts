/**
 * The relay's day, counted (ADR 0208): how many servers it listed, how many of them a phone came
 * through to, how many sessions it opened, the most it held at once, the bytes it moved each
 * way, and the pushes it sent for servers (ADR 0246). How many, never which. The keys it counts by are held in memory for the day, as the
 * switchboard already holds them while they are connected, and forgotten when the day is written;
 * what is written is numbers. A phone is counted by its session, never by its address.
 *
 * A day is a UTC day. Its counts are written once, when it ends, and when the relay stops, so a
 * day the relay restarted in is two lines, each saying the stretch it covers. Neither line knows
 * the servers the other saw, so the day's servers are at least the larger of the two.
 *
 * A new day starts with whatever is still connected: a server listed at midnight is a server of
 * both days, and a phone through to it then has reached it in both.
 *
 * A day holds at most `MOST_KEYS` keys in each of its two sets (SEC-54). A relay with no list
 * lists any key proved to it, and a key costs nothing to make, so a stranger proving new ones all
 * day would otherwise grow the sets for as long as they kept at it. A day that fills one says so:
 * its count is the most, and `at_least` names it.
 */

/** One stretch of one day, as written. Snake case: a line in a file, read by `jq`. */
export interface DayCounts {
  /** The UTC day, `2026-10-20`. */
  readonly day: string;
  /** What it covers: from midnight, or the relay's start; to the next midnight, or its stop. */
  readonly from: string;
  readonly to: string;
  /** Servers listed at any time in it. */
  readonly servers: number;
  /** Servers a phone came through to. */
  readonly reached: number;
  /** Sessions opened: a phone put through to a server. */
  readonly sessions: number;
  /** The most servers listed, and the most sessions open, at once. */
  readonly peak_servers: number;
  readonly peak_sessions: number;
  /** Bytes forwarded, each way. */
  readonly bytes_to_servers: number;
  readonly bytes_to_phones: number;
  /** Pushes sent for servers through the push door, as Expo took them (ADR 0246). */
  readonly pushes: number;
  /** The counts that reached `MOST_KEYS`, so are at least what they say. Absent on other days. */
  readonly at_least?: readonly ("servers" | "reached")[];
}

export interface TallyOptions {
  readonly clock: () => number;
  /** How many are connected now. */
  readonly stats: () => { readonly servers: number; readonly sessions: number };
  /** Each server listed now, by key, with its open sessions: what a new day starts with. */
  readonly listing: () => Iterable<readonly [key: string, sessions: number]>;
  /** A stretch is over. */
  readonly write: (counts: DayCounts) => void;
}

export interface Tally {
  /** A server proved its key and was listed. */
  readonly listed: (key: string) => void;
  /** A phone was put through to the server with this key. */
  readonly opened: (key: string) => void;
  readonly moved: (direction: "to_server" | "to_client", bytes: number) => void;
  /** Pushes Expo took, sent through the push door. */
  readonly pushed: (count: number) => void;
  /** Writes the day once it has ended: called once a minute, so a quiet relay's day is written. */
  readonly tick: () => void;
  /** The relay is stopping: the stretch so far, written. */
  readonly stop: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** The most keys each of a day's sets holds: some ten megabytes a set, full. */
export const MOST_KEYS = 100_000;

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const nextMidnight = (ms: number) => (Math.floor(ms / DAY_MS) + 1) * DAY_MS;

/** A key counted, unless the set is full. A key it already holds is counted already. */
const count = (keys: Set<string>, key: string) => {
  if (keys.size < MOST_KEYS) keys.add(key);
};

export function createTally(options: TallyOptions): Tally {
  const { clock, stats, listing, write } = options;
  let from = clock();
  let endsAt = nextMidnight(from);
  let servers = new Set<string>();
  let reached = new Set<string>();
  let sessions = 0;
  let peakServers = 0;
  let peakSessions = 0;
  let toServers = 0;
  let toPhones = 0;
  let pushes = 0;

  const peak = () => {
    const now = stats();
    peakServers = Math.max(peakServers, now.servers);
    peakSessions = Math.max(peakSessions, now.sessions);
  };

  /** What is connected at the start of a stretch counts in it. */
  const begin = (at: number) => {
    from = at;
    endsAt = nextMidnight(at);
    servers = new Set();
    reached = new Set();
    sessions = 0;
    peakServers = 0;
    peakSessions = 0;
    toServers = 0;
    toPhones = 0;
    pushes = 0;
    for (const [key, open] of listing()) {
      count(servers, key);
      if (open > 0) count(reached, key);
    }
    peak();
  };

  const end = (at: number) => {
    const atLeast: ("servers" | "reached")[] = [];
    if (servers.size >= MOST_KEYS) atLeast.push("servers");
    if (reached.size >= MOST_KEYS) atLeast.push("reached");
    write({
      day: dayOf(from),
      from: new Date(from).toISOString(),
      to: new Date(at).toISOString(),
      servers: servers.size,
      reached: reached.size,
      sessions,
      peak_servers: peakServers,
      peak_sessions: peakSessions,
      bytes_to_servers: toServers,
      bytes_to_phones: toPhones,
      pushes,
      ...(atLeast.length > 0 ? { at_least: atLeast } : {}),
    });
  };

  /** Every midnight passed since the last look: each day written, the next one begun. */
  const turn = () => {
    const now = clock();
    while (now >= endsAt) {
      const midnight = endsAt;
      end(midnight);
      begin(midnight);
    }
  };

  begin(from);

  return {
    listed(key) {
      turn();
      count(servers, key);
      peak();
    },
    opened(key) {
      turn();
      count(reached, key);
      sessions += 1;
      peak();
    },
    moved(direction, bytes) {
      turn();
      if (direction === "to_server") toServers += bytes;
      else toPhones += bytes;
    },
    pushed(count) {
      turn();
      pushes += count;
    },
    tick: turn,
    stop() {
      turn();
      end(clock());
    },
  };
}
