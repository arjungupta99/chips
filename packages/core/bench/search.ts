/**
 * Search's benchmark (docs/proposals/search-plan.md §3.2): what finding spaces and agents by name
 * costs a key, and what keeping the index costs a model change, in a workspace far bigger than
 * any there is.
 *
 *   pnpm bench:search [rooms]
 *
 * It builds `rooms` rooms (ten thousand by default), a tenth as many agents and half as many
 * people, then times, each the median of many runs:
 * - the index built from nothing, which happens once and again only when the directory changes;
 * - the index after a message in one room, handed the last one: what every model change costs;
 * - each key of "chin tour" typed, finding spaces and agents.
 * A key has a frame to spend, at 120 Hz 8 ms, and the phone is slower than this Mac: the budget
 * is 4 ms a key and 4 ms a change, up to ten thousand rooms, and grows with the rooms past that.
 * Both are a walk of every room's folded words, so they grow as the rooms do: on 6 October 2026,
 * on the Mac mini, the worst key was 2.3 ms at ten thousand rooms and 38 ms at a hundred thousand.
 */

import type { Directory, Participant } from "../src/events.js";
import type { Space, WorkspaceModel } from "../src/model/types.js";
import { findAgents, findSpaces, searchIndex, searchTerms } from "../src/search.js";

const rooms = Number.parseInt(process.argv[2] ?? "10000", 10);
const budgetMs = Math.max(4, (4 * rooms) / 10_000);
const SELF = "usr_self";

const WORDS = ["chinatown", "walking", "tour", "dinner", "café", "plan", "kitchen", "trip"];
const word = (index: number) => WORDS[index % WORDS.length] ?? "room";

const directory: Record<string, Participant> = {
  [SELF]: { id: SELF, kind: "person", displayName: "Self" },
  hrn_1: { id: "hrn_1", kind: "harness", displayName: "Harbor" },
};
for (let index = 0; index < rooms / 2; index += 1) {
  const id = `usr_${index}`;
  directory[id] = { id, kind: "person", displayName: `${word(index)} Person ${index}` };
}
for (let index = 0; index < rooms / 10; index += 1) {
  const id = `agt_${index}`;
  directory[id] = {
    id,
    kind: "agent",
    harnessId: "hrn_1",
    displayName: `${word(index + 3)} Agent ${index}`,
    room: `spc_${index}`,
  };
}

function room(index: number, extra: Partial<Space> = {}): Space {
  return {
    id: `spc_${index}`,
    kind: "room",
    // An untitled room in every five, named after who is in it.
    ...(index % 5 === 0 ? {} : { title: `${word(index)} ${word(index + 1)} ${word(index + 2)}` }),
    members: [SELF, `usr_${index % (rooms / 2)}`, ...(index < rooms / 10 ? [`agt_${index}`] : [])],
    roles: {},
    state: index % 7 === 0 ? "closed" : "open",
    lastEventSeq: index,
    lastActivityAt: new Date(1_790_000_000_000 + index * 60_000).toISOString(),
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...extra,
  };
}

const spaces = Array.from({ length: rooms }, (_, index) => room(index));
const model = { spaces } as unknown as WorkspaceModel;
const people = directory as Directory;

/** The median of `runs` timings of `work`, in milliseconds. */
function median(runs: number, work: () => unknown): number {
  const took: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    work();
    took.push(performance.now() - started);
  }
  took.sort((a, b) => a - b);
  return took[Math.floor(runs / 2)] ?? 0;
}

const cold = median(11, () => searchIndex(model, people, SELF));
const index = searchIndex(model, people, SELF);

// A message in one room: the fold hands that room back as a new object, the rest as they were.
let changed = 0;
const change = median(51, () => {
  changed = (changed + 1) % rooms;
  const next = spaces.slice();
  next[changed] = room(changed, { lastEventSeq: rooms + changed });
  return searchIndex({ spaces: next } as unknown as WorkspaceModel, people, SELF, index);
});

const keys: { typed: string; ms: number; spaces: number; agents: number }[] = [];
const typing = "chin tour";
for (let at = 1; at <= typing.length; at += 1) {
  const typed = typing.slice(0, at);
  if (typed.endsWith(" ")) continue;
  const terms = searchTerms(typed);
  const ms = median(21, () => [findSpaces(index, terms), findAgents(index, terms)]);
  keys.push({
    typed,
    ms,
    spaces: findSpaces(index, terms).length,
    agents: findAgents(index, terms).length,
  });
}

const write = (line: string) => process.stdout.write(`${line}\n`);
write(`search: ${rooms} rooms, ${rooms / 10} agents, ${rooms / 2} people (budget ${budgetMs} ms)`);
write(`  index from nothing  ${cold.toFixed(2)} ms`);
write(`  index after a change ${change.toFixed(2)} ms`);
for (const key of keys) {
  write(
    `  "${key.typed}"`.padEnd(14) +
      `${key.ms.toFixed(2)} ms  ${key.spaces} spaces, ${key.agents} agents`,
  );
}
const worst = Math.max(change, ...keys.map((key) => key.ms));
if (worst > budgetMs) {
  write("search: over budget");
  process.exit(1);
}
