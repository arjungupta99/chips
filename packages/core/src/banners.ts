/**
 * The gold banner a space shows while an agent works there without asking (ADR 0286): which ones a
 * person sees, and the words for putting one away.
 *
 * A person can close a banner for now, which holds for that yes in that space, or say they don't
 * want it for an agent, or for a harness and so for all its agents. An agent with no word of its own
 * follows its harness, and a harness with none shows it: a choice that matches its harness is no
 * choice, and is let go. Every one of these changes only what that person sees, on all their
 * devices. None changes what an agent may do.
 */

import { type Directory, harnessOf, nameOf } from "./events.js";
import { lettingWork } from "./model/readers.js";
import type { LetWork, Space } from "./model/types.js";

export interface ClosedBanner {
  readonly spaceId: string;
  readonly asker: string;
  /** When the yes it stood for was given: a later yes is a new one, and shows. */
  readonly since: string;
}

export interface Banners {
  /** Whether this person wants the banner, by agent or harness. */
  readonly choices: Readonly<Record<string, boolean>>;
  readonly closed: readonly ClosedBanner[];
}

export const NO_BANNERS: Banners = { choices: {}, closed: [] };

/** How long `Hidden for now` stands, with Disable banner and Undo, before it folds away. */
export const BANNER_HIDDEN_MS = 5000;
/** How long `Banner off for Jiro` stands, with Undo. */
export const BANNER_OFF_MS = 3200;
/** How long Undo stands after the harness's switch. */
export const BANNERS_UNDO_MS = 5000;

export const BANNER_HIDDEN_WORDS = "Hidden for now";
export const BANNER_DISABLE_WORDS = "Disable banner";
export const BANNER_UNDO_WORDS = "Undo";

export function bannerOffWords(name: string): string {
  return `Banner off for ${name}`;
}

/** What this person wants for one agent: its own word, else its harness's, else the banner. */
export function bannerWanted(banners: Banners, directory: Directory, asker: string): boolean {
  return banners.choices[asker] ?? banners.choices[harnessOf(directory, asker)] ?? true;
}

/** Closed for now, for this very yes. */
export function bannerClosed(banners: Banners, spaceId: string, held: LetWork): boolean {
  return banners.closed.some(
    (each) => each.spaceId === spaceId && each.asker === held.asker && each.since === held.since,
  );
}

/** The agents whose banner a space shows this person now, against the clock. */
export function bannersToShow(
  space: Space | undefined,
  directory: Directory,
  banners: Banners,
  now: number = Date.now(),
): readonly LetWork[] {
  if (space === undefined) return [];
  return lettingWork(space, now).filter(
    (held) =>
      bannerWanted(banners, directory, held.asker) && !bannerClosed(banners, space.id, held),
  );
}

/** A harness's agents still going, as the words under its switch count them. */
export function harnessAgentIds(directory: Directory, harnessId: string): readonly string[] {
  return Object.entries(directory)
    .filter(
      ([, each]) =>
        each.kind === "agent" &&
        each.harnessId === harnessId &&
        each.archived !== true &&
        each.removedAt === undefined,
    )
    .map(([id]) => id);
}

/** An agent's switch, and the line under it. */
export interface AgentBannerRow {
  readonly shown: boolean;
  /** Its own word differs from its harness's. */
  readonly apart: boolean;
  /** `Same as Claude Code`, `Off for Jiro only`. */
  readonly sub: string;
}

export function agentBannerRow(
  banners: Banners,
  directory: Directory,
  agentId: string,
): AgentBannerRow {
  const shown = bannerWanted(banners, directory, agentId);
  const apart = banners.choices[agentId] !== undefined;
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const name = nameOf(directory, agentId);
  const sub = apart
    ? `${shown ? "On" : "Off"} for ${name} only`
    : shown
      ? `Same as ${harness}`
      : `Off for all of ${harness}`;
  return { shown, apart, sub };
}

/** A harness's switch, and the line under it. */
export interface HarnessBannerRow {
  readonly shown: boolean;
  /** `On for all 4 agents`, `On for 3, off for Jiro`. */
  readonly sub: string;
}

function countWords(count: number): string {
  return `${count} ${count === 1 ? "agent" : "agents"}`;
}

export function harnessBannerRow(
  banners: Banners,
  directory: Directory,
  harnessId: string,
): HarnessBannerRow {
  const setting = banners.choices[harnessId] ?? true;
  const agents = harnessAgentIds(directory, harnessId);
  const apart = agents.filter(
    (id) => banners.choices[id] !== undefined && banners.choices[id] !== setting,
  );
  // Every one of them set apart reads as what they are, and the switch says the same.
  const shown = agents.length > 0 && apart.length === agents.length ? !setting : setting;
  const word = (on: boolean) => (on ? "On" : "Off");
  if (agents.length === 0) return { shown, sub: `${word(shown)} for its agents` };
  if (apart.length === 0 || apart.length === agents.length) {
    const whom = agents.length === 1 ? "its agent" : `all ${countWords(agents.length)}`;
    return { shown, sub: `${word(shown)} for ${whom}` };
  }
  const named = apart.length === 1 ? nameOf(directory, apart[0] as string) : String(apart.length);
  const others = agents.length - apart.length;
  return {
    shown,
    sub: `${word(setting)} for ${others}, ${word(!setting).toLowerCase()} for ${named}`,
  };
}

/** Undo after the harness's switch: what it said, and who was set apart. */
export interface HarnessBannersBefore {
  readonly harnessId: string;
  readonly shown: boolean | undefined;
  readonly apart: Readonly<Record<string, boolean>>;
}

/** The words on Undo's pill: `Banners off for all 4 agents`. */
export function harnessBannersWords(
  directory: Directory,
  harnessId: string,
  shown: boolean,
): string {
  const count = harnessAgentIds(directory, harnessId).length;
  const on = shown ? "on" : "off";
  if (count === 0) return `Banners ${on} for its agents`;
  return count === 1 ? `Banners ${on} for its agent` : `Banners ${on} for all ${countWords(count)}`;
}

/** What is said for one agent or harness, and for one banner closed. */
export type BannerChange =
  | { readonly kind: "choice"; readonly target: string; readonly shown: boolean | undefined }
  | {
      readonly kind: "all";
      readonly harnessId: string;
      readonly agentIds: readonly string[];
      readonly shown: boolean;
    }
  | {
      readonly kind: "closed";
      readonly spaceId: string;
      readonly asker: string;
      readonly since: string | undefined;
    };

function withChoice(
  choices: Record<string, boolean>,
  change: Exclude<BannerChange, { kind: "closed" }>,
): void {
  if (change.kind === "all") {
    for (const id of change.agentIds) delete choices[id];
    choices[change.harnessId] = change.shown;
  } else if (change.shown === undefined) {
    delete choices[change.target];
  } else {
    choices[change.target] = change.shown;
  }
}

function withClosed(
  closed: readonly ClosedBanner[],
  change: Extract<BannerChange, { kind: "closed" }>,
): readonly ClosedBanner[] {
  const others = closed.filter(
    (each) => each.spaceId !== change.spaceId || each.asker !== change.asker,
  );
  return change.since === undefined
    ? others
    : [...others, { spaceId: change.spaceId, asker: change.asker, since: change.since }];
}

/** The banners as the server holds them, with the changes still on their way drawn over them. */
export function withBannerChanges(
  held: Banners,
  asked: ReadonlyMap<string, BannerChange>,
): Banners {
  if (asked.size === 0) return held;
  const choices: Record<string, boolean> = { ...held.choices };
  let closed = held.closed;
  for (const change of asked.values()) {
    if (change.kind === "closed") closed = withClosed(closed, change);
    else withChoice(choices, change);
  }
  return { choices, closed };
}

/** The server's words for them, or nothing when they are not what it should have said. */
export function bannersOf(wire: unknown): Banners | undefined {
  if (typeof wire !== "object" || wire === null) return undefined;
  const { choices, closed } = wire as { choices?: unknown; closed?: unknown };
  if (typeof choices !== "object" || choices === null || !Array.isArray(closed)) return undefined;
  return {
    choices: Object.fromEntries(
      Object.entries(choices).filter(
        (each): each is [string, boolean] => typeof each[1] === "boolean",
      ),
    ),
    closed: closed.flatMap((each: unknown): ClosedBanner[] => {
      const row = each as { space_id?: unknown; asker?: unknown; since?: unknown };
      return typeof row?.space_id === "string" &&
        typeof row.asker === "string" &&
        typeof row.since === "string"
        ? [{ spaceId: row.space_id, asker: row.asker, since: row.since }]
        : [];
    }),
  };
}

/** The same, as the cache keeps them: what `bannersOf` reads back. */
export function bannersToKeep(banners: Banners): unknown {
  return {
    choices: { ...banners.choices },
    closed: banners.closed.map((each) => ({
      space_id: each.spaceId,
      asker: each.asker,
      since: each.since,
    })),
  };
}
