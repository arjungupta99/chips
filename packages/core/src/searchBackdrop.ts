/**
 * Search's backdrop (ADR 0136, ADR 0138): with nothing typed, the faces of your spaces and your
 * agents rise slowly behind the recent searches and the empty part of the Search page under them,
 * at three depths, each swaying and tipping a little as it goes, in a glow of its own colour that
 * breathes. Arjun asked for something "cool and not overdone" in that empty space, picked the
 * drift from four mocks, and picked faces repeated round and round over leaving places empty or
 * filling them with library marks (7 October 2026). That evening he asked for the agents to float
 * as well, with their pins, and for a halo behind the faces, and picked the breathing glow.
 *
 * What is the same everywhere lives here: which spaces and agents lend their faces, the eighteen
 * places and their pace, which face each place wears, and the glow's size and breath. How a face
 * moves through its place is each client's: the phone reads it off one native clock
 * (`apps/mobile/src/search/drift.ts`), the web runs it as CSS animations.
 */

import { type AgentRow, agentsTab } from "./agentsTab.js";
import type { Directory } from "./events.js";
import { spaceList } from "./model/readers.js";
import type { Space, WorkspaceModel } from "./model/types.js";

/**
 * One round: the time in which every climb and every sway comes back to where it started. Every
 * pace below goes a whole number of times round in it.
 */
export const BACKDROP_ROUND_MS = 240_000;

export type BackdropDepth = "near" | "mid" | "far";

/**
 * Each depth's look and pace: the nearer, the stronger and the quicker (and, as each client draws
 * it, the bigger), which is what makes the same faces read as distance rather than as three sizes.
 * `opacity` is how strong a face is drawn over its own silhouette in the page's colour, so a far
 * face is dim but hides what is behind it: faces seen through one another looked wrong (Arjun, 7
 * October 2026). `climbs` is how many times a face goes from the foot to the top in a round.
 */
export const BACKDROP_DEPTHS: Readonly<
  Record<BackdropDepth, { readonly opacity: number; readonly climbs: number }>
> = {
  // Forty seconds from the foot to the top.
  near: { opacity: 1, climbs: 6 },
  // A minute.
  mid: { opacity: 0.72, climbs: 4 },
  // Eighty seconds.
  far: { opacity: 0.46, climbs: 3 },
};

/** A place a face drifts in. */
export interface BackdropPlace {
  readonly depth: BackdropDepth;
  /** Across the backdrop: nought with the face at the left edge, one with it at the right. */
  readonly across: number;
  /** How far up its climb the face is when the round starts: nought at the foot, one at the top. */
  readonly start: number;
  /** How many times it sways there and back in a round, and how far into a sway it starts. */
  readonly sways: number;
  readonly swayStart: number;
}

/**
 * The eighteen places, written out rather than drawn at random so the backdrop is the same every
 * time and in every test. Neighbours across the width are at different depths, and the starts are
 * a golden-ratio step apart, so no two faces climb side by side. Sixteen until Arjun asked for the
 * faces 15% denser (7 October 2026).
 */
export const BACKDROP_PLACES: readonly BackdropPlace[] = [
  { depth: "near", across: 0.62, start: 0.35, sways: 12, swayStart: 0 },
  { depth: "mid", across: 0.08, start: 0.97, sways: 10, swayStart: 0.37 },
  { depth: "far", across: 0.44, start: 0.59, sways: 8, swayStart: 0.74 },
  { depth: "mid", across: 0.9, start: 0.2, sways: 9, swayStart: 0.11 },
  { depth: "far", across: 0.26, start: 0.82, sways: 9, swayStart: 0.48 },
  { depth: "near", across: 0.14, start: 0.44, sways: 11, swayStart: 0.85 },
  { depth: "far", across: 0.74, start: 0.06, sways: 10, swayStart: 0.22 },
  { depth: "mid", across: 0.52, start: 0.68, sways: 11, swayStart: 0.59 },
  { depth: "far", across: 0.96, start: 0.29, sways: 8, swayStart: 0.96 },
  { depth: "near", across: 0.86, start: 0.91, sways: 13, swayStart: 0.33 },
  { depth: "mid", across: 0.32, start: 0.53, sways: 10, swayStart: 0.7 },
  { depth: "far", across: 0.02, start: 0.15, sways: 9, swayStart: 0.07 },
  { depth: "mid", across: 0.7, start: 0.77, sways: 9, swayStart: 0.44 },
  { depth: "far", across: 0.56, start: 0.38, sways: 10, swayStart: 0.81 },
  { depth: "near", across: 0.38, start: 0.01, sways: 10, swayStart: 0.18 },
  { depth: "mid", across: 0.2, start: 0.62, sways: 11, swayStart: 0.55 },
  // Two more, 15% denser (ADR 0138's revision): in the two widest gaps across, the same steps on.
  { depth: "mid", across: 0.8, start: 0.24, sways: 12, swayStart: 0.92 },
  { depth: "near", across: 0.48, start: 0.86, sways: 9, swayStart: 0.29 },
];

/** How far a face sways each way, in points, and how far it tips, in degrees. */
export const BACKDROP_SWAY = 9;
export const BACKDROP_TIP = 7;

/**
 * Where the faces come clear: a face is gone with its middle this close under the backdrop's top,
 * which is just under the field, and whole this far under it.
 */
export const BACKDROP_FADE = { from: 8, to: 96 } as const;

/**
 * Each face's glow (ADR 0138): a round light in the face's own colour behind it, `across` times
 * the face's side, that swells from `small` of that to `full` and from `faint` to its whole
 * strength, and settles back, `breaths` times a round: a breath in a little over thirteen
 * seconds. Each place starts at its own point in a breath (its `start`), so no two swell together.
 */
export const BACKDROP_GLOW = {
  across: 2.3,
  breaths: 18,
  small: 0.72,
  full: 1.1,
  faint: 0.3,
} as const;

/** What lends the backdrop a face: an open space, or an agent that isn't archived (ADR 0138). */
export type BackdropLender =
  | { readonly kind: "space"; readonly space: Space }
  | { readonly kind: "agent"; readonly agent: AgentRow };

/**
 * The spaces and the agents that lend their faces, the most recently active first: the open
 * spaces by their last line, the agents by their room's, as the Agents tab orders them. On a tie a
 * room goes before its agent, and an agent in no room goes after every one that is in one.
 */
export function backdropLenders(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): readonly BackdropLender[] {
  const spaces = spaceList(model)
    .filter((space) => space.state !== "closed")
    .map((space) => ({
      at: space.lastActivityAt ?? "",
      lender: { kind: "space", space } as const,
    }));
  const tab = agentsTab(model, directory, selfId);
  const agents = [...tab.leads, ...tab.agents].map((agent) => ({
    at: agent.at ?? "",
    lender: { kind: "agent", agent } as const,
  }));
  return [...spaces, ...agents]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, BACKDROP_PLACES.length)
    .map(({ lender }) => lender);
}

const DEPTH_ORDER: Readonly<Record<BackdropDepth, number>> = { near: 0, mid: 1, far: 2 };

/** The places nearest first: where the most recent spaces go. */
const NEAREST = BACKDROP_PLACES.map((place, index) => ({ place, index }))
  .sort((a, b) => DEPTH_ORDER[a.place.depth] - DEPTH_ORDER[b.place.depth] || a.index - b.index)
  .map(({ index }) => index);

/**
 * Which face each place wears, by the place's index: the faces given, most recent first, round
 * and round until every place has one, the first in the nearest places. No faces, no places.
 */
export function backdropFill<T>(faces: readonly T[]): readonly T[] {
  if (faces.length === 0) return [];
  const worn = new Array<T>(BACKDROP_PLACES.length);
  NEAREST.forEach((place, rank) => {
    worn[place] = faces[rank % faces.length] as T;
  });
  return worn;
}
