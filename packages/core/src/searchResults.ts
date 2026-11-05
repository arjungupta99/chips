/**
 * What a Search page lists, and what each of its rows says (ADR 0132), for the phone's tab and the
 * desktop's page alike: one list of rows, so either scrolls it as one and draws only what is in
 * view, however many rooms a search finds.
 *
 * - **Nothing typed:** the recent searches, or a line on what search looks at.
 * - **All:** Spaces and Agents, three each, then *See all N*; then Messages, paged.
 * - **A chip:** that kind alone, all of it.
 * - **Messages** come from the server, so they also have its states: two placeholder rows the
 *   first time, a line when the server can't be reached or the ask failed, and a row while the
 *   next page comes. A hit in a room this client no longer has is left out.
 * - **Nothing at all** found says so, and what search looks at: in All with one letter, the names
 *   alone, since messages are searched from two letters on.
 *
 * Pure: a page hands it what was found (`findSpaces`, `findAgents`, `messageSearch`) and draws
 * what comes back. Each client draws the rows its own way, and says the same words in them.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { type Directory, faceKind, faceOf, nameOf } from "./events.js";
import { hitKey, type MessageResults } from "./messageSearch.js";
import { spaceById, spaceTitle } from "./model/readers.js";
import type { Line, Space, WorkspaceModel } from "./model/types.js";
import { type AgentFound, markedParts, type SearchPart, type SpaceFound } from "./search.js";
import type { SearchHit } from "./store.js";

export type SearchScope = "all" | "spaces" | "agents" | "messages";

/** The chips under the field, in order. */
export const SEARCH_SCOPES: readonly { readonly scope: SearchScope; readonly title: string }[] = [
  { scope: "all", title: "All" },
  { scope: "spaces", title: "Spaces" },
  { scope: "agents", title: "Agents" },
  { scope: "messages", title: "Messages" },
];

/** How many spaces, and how many agents, All shows before *See all*. */
export const SEARCH_IN_ALL = 3;

export type SearchItem =
  | { readonly kind: "heading"; readonly key: string; readonly title: string }
  | { readonly kind: "recents"; readonly key: string }
  | {
      readonly kind: "recent";
      readonly key: string;
      readonly text: string;
      readonly first: boolean;
    }
  | { readonly kind: "hint"; readonly key: string }
  | {
      readonly kind: "space";
      readonly key: string;
      readonly found: SpaceFound;
      readonly first: boolean;
    }
  | {
      readonly kind: "agent";
      readonly key: string;
      readonly found: AgentFound;
      readonly first: boolean;
    }
  | {
      readonly kind: "seeAll";
      readonly key: string;
      readonly scope: "spaces" | "agents";
      readonly count: number;
    }
  | {
      readonly kind: "message";
      readonly key: string;
      readonly hit: SearchHit;
      readonly space: Space;
      readonly first: boolean;
    }
  | { readonly kind: "placeholder"; readonly key: string; readonly first: boolean }
  | { readonly kind: "offline"; readonly key: string }
  | { readonly kind: "failed"; readonly key: string }
  | { readonly kind: "fewLetters"; readonly key: string }
  | { readonly kind: "fetching"; readonly key: string }
  | {
      readonly kind: "nothing";
      readonly key: string;
      readonly text: string;
      readonly scope: SearchScope;
      /** What the search looked at, said under the line (`SEARCH_LOOKS_AT`, or the names alone). */
      readonly looksAt: string;
    };

export interface SearchFound {
  /** What is typed, as typed: the nothing-found line quotes it. */
  readonly text: string;
  /** Whether anything is typed that search reads as words (`searchTerms`). */
  readonly typed: boolean;
  readonly scope: SearchScope;
  readonly spaces: readonly SpaceFound[];
  readonly agents: readonly AgentFound[];
  readonly messages: MessageResults;
  /** Whether the server can be reached: spaces and agents are found here either way. */
  readonly online: boolean;
  readonly model: WorkspaceModel;
  readonly recent: readonly string[];
}

export function searchItems(found: SearchFound): readonly SearchItem[] {
  if (!found.typed) return recentItems(found.recent);
  const { scope } = found;
  const items = [
    ...(scope === "all" || scope === "spaces" ? spaceItems(found.spaces, scope === "all") : []),
    ...(scope === "all" || scope === "agents" ? agentItems(found.agents, scope === "all") : []),
    ...(scope === "all" || scope === "messages" ? messageItems(found, scope === "all") : []),
  ];
  return items.length > 0 ? items : [nothing(found)];
}

/**
 * Nothing found, and what was looked at. In All before the messages are asked for (one letter),
 * only the names were: it says so rather than that everything said was searched.
 */
function nothing(found: SearchFound): SearchItem {
  const { scope, text } = found;
  const namesAlone = scope === "all" && found.online && found.messages.status === "idle";
  const looksAt = namesAlone ? SEARCH_LOOKS_AT_NAMES : SEARCH_LOOKS_AT[scope];
  return { kind: "nothing", key: "nothing", text, scope, looksAt };
}

function recentItems(recent: readonly string[]): readonly SearchItem[] {
  if (recent.length === 0) return [{ kind: "hint", key: "hint" }];
  return [
    { kind: "recents", key: "recents" },
    ...recent.map((text, at) => ({
      kind: "recent" as const,
      key: `recent:${text}`,
      text,
      first: at === 0,
    })),
  ];
}

function spaceItems(spaces: readonly SpaceFound[], capped: boolean): readonly SearchItem[] {
  if (spaces.length === 0) return [];
  const shown = capped ? spaces.slice(0, SEARCH_IN_ALL) : spaces;
  return [
    { kind: "heading", key: "heading:spaces", title: "Spaces" },
    ...shown.map((found, at) => ({
      kind: "space" as const,
      key: `space:${found.space.id}`,
      found,
      first: at === 0,
    })),
    ...(shown.length < spaces.length
      ? [
          {
            kind: "seeAll" as const,
            key: "all:spaces",
            scope: "spaces" as const,
            count: spaces.length,
          },
        ]
      : []),
  ];
}

function agentItems(agents: readonly AgentFound[], capped: boolean): readonly SearchItem[] {
  if (agents.length === 0) return [];
  const shown = capped ? agents.slice(0, SEARCH_IN_ALL) : agents;
  return [
    { kind: "heading", key: "heading:agents", title: "Agents" },
    ...shown.map((found, at) => ({
      kind: "agent" as const,
      key: `agent:${found.row.id}`,
      found,
      first: at === 0,
    })),
    ...(shown.length < agents.length
      ? [
          {
            kind: "seeAll" as const,
            key: "all:agents",
            scope: "agents" as const,
            count: agents.length,
          },
        ]
      : []),
  ];
}

const HEADING: SearchItem = { kind: "heading", key: "heading:messages", title: "Messages" };

/**
 * The messages, or what stands for them. In All, a search the server has answered with nothing
 * leaves the section out rather than heading an empty one; under the chip, it falls to the
 * nothing-found line.
 */
function messageItems(found: SearchFound, inAll: boolean): readonly SearchItem[] {
  const { messages } = found;
  if (!found.online) return [HEADING, { kind: "offline", key: "offline" }];
  if (messages.status === "failed") return [HEADING, { kind: "failed", key: "failed" }];
  if (messages.status === "idle") return inAll ? [] : [{ kind: "fewLetters", key: "few" }];
  if (!messages.answered) {
    return [
      HEADING,
      { kind: "placeholder", key: "placeholder:1", first: true },
      { kind: "placeholder", key: "placeholder:2", first: false },
    ];
  }
  const rows = messages.hits.flatMap((hit) => {
    const space = spaceById(found.model, hit.spaceId);
    return space === undefined ? [] : [{ hit, space }];
  });
  if (rows.length === 0) return [];
  return [
    HEADING,
    ...rows.map(({ hit, space }, at) => ({
      kind: "message" as const,
      key: `message:${hitKey(hit)}`,
      hit,
      space,
      first: at === 0,
    })),
    ...(messages.fetchingMore ? [{ kind: "fetching" as const, key: "fetching" }] : []),
  ];
}

/** What a search looks at, said under a search that found nothing. */
export const SEARCH_LOOKS_AT: Readonly<Record<SearchScope, string>> = {
  all: "Search looks at the names of spaces and agents, and at everything said in the spaces you're in, voice notes too.",
  spaces: "Spaces are found by their names, and by who is in them.",
  agents: "Agents are found by their names, and by their harness's.",
  messages: "Messages are everything said in the spaces you're in, voice notes too.",
};

/** Under nothing found in All with one letter typed: the names were looked at, not the messages. */
export const SEARCH_LOOKS_AT_NAMES =
  "Spaces and agents are found by their names. Messages are found from two letters on.";

/**
 * Beside the results on a wide window, with something typed and nothing opened yet (ADR 0256 on
 * the iPad, `search/Found.tsx`; ADR 0269 on the Mac and the web).
 */
export const SEARCH_NOTHING_OPEN = {
  title: "Nothing open",
  words: "Choose a result on the left.",
} as const;

/**
 * Who a titled room is with, for the line under its name: the others in it, two by name. A room
 * with no title is already named after them.
 */
function withWhom(space: Space, directory: Directory, selfId: string): string | undefined {
  if (space.title === undefined) return undefined;
  const others = space.members.filter((id) => id !== selfId && directory[id] !== undefined);
  if (others.length === 0) return undefined;
  const named = others.slice(0, 2).map((id) => nameOf(directory, id));
  const more = others.length - named.length;
  return `With ${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

/**
 * The line under a space found: who it was found by, marked, or who is in it; then when it last
 * spoke, as the client says a time (`when`, empty for never).
 */
export function spaceFoundLine(
  found: SpaceFound,
  directory: Directory,
  selfId: string,
  when: string,
): readonly SearchPart[] {
  const tail = when === "" ? "" : ` · ${when}`;
  if (found.member !== undefined) {
    const lead = "With ";
    const marks = found.member.marks.map((mark) => ({
      start: mark.start + lead.length,
      end: mark.end + lead.length,
    }));
    return markedParts(`${lead}${found.member.name}${tail}`, marks);
  }
  const who = withWhom(found.space, directory, selfId);
  return markedParts(who === undefined ? when : `${who}${tail}`, []);
}

/** Who said a hit, as its row names them and its face is drawn. */
export interface HitAuthor {
  /** As the row says it: *You* for the reader. */
  readonly name: string;
  /** Whose name the face is drawn from. */
  readonly face: string;
  /** The kind of face drawn (`faceKind`). */
  readonly kind: ReturnType<typeof faceKind>;
  /** The face chosen for them, an agent's (ADR 0089) or a person's own (ADR 0139), when there is one. */
  readonly icon?: SpaceIcon | undefined;
}

/** Who said a hit: a step's is its run's agent. */
export function hitAuthor(
  hit: SearchHit,
  space: Space,
  directory: Directory,
  selfId: string,
): HitAuthor {
  const id =
    hit.kind === "receipt"
      ? space.runs.find((run) => run.runId === hit.runId)?.harnessId
      : hit.authorId;
  if (id === undefined) return { name: "Someone", face: "?", kind: "person" };
  const icon = faceOf(directory, id);
  return {
    name: id === selfId ? "You" : nameOf(directory, id),
    face: nameOf(directory, id),
    kind: faceKind(directory, id),
    ...(icon === undefined ? {} : { icon }),
  };
}

/** Where a hit was said: its room, or the room a thread hangs off. */
export function hitPlace(
  space: Space,
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): string {
  const parent =
    space.parentSpaceId === undefined ? undefined : spaceById(model, space.parentSpaceId);
  if (parent === undefined) return spaceTitle(space, directory, selfId);
  return `${spaceTitle(parent, directory, selfId)} · thread`;
}

/**
 * Whether a hit was said in an archived space, or in a thread off one: still found and opened, to
 * read, and its row says so (Arjun, 3 November 2026).
 */
export function hitArchived(space: Space, model: WorkspaceModel): boolean {
  if (space.state === "closed") return true;
  const parent =
    space.parentSpaceId === undefined ? undefined : spaceById(model, space.parentSpaceId);
  return parent?.state === "closed";
}

/**
 * The words a hit's room marks where it lands (ADR 0133): what was searched for, to a message. A
 * voice note's words were heard, not typed, and its bubble does not draw them; a step's are not
 * in the line its run lands on. Neither takes them.
 */
export function hitWords(hit: SearchHit, searched: string): string | undefined {
  const words = searched.trim();
  return hit.kind === "message" && hit.snippetFrom !== "transcript" && words !== ""
    ? words
    : undefined;
}

/** Whether a line is the one that closed a run: its summary, or the status a failure left. */
export function closesRun(line: Line, runId: string): boolean {
  return line.runId === runId && (line.kind === "summary" || line.kind === "status");
}
