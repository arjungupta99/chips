/**
 * The harnesses' shelf at the head of the Agents tab (ADR 0185; Arjun, 17 October 2026: "Let's do
 * B shelf of harness"): a tile for each harness, its name and one line under it, and View all for
 * their cards in a list of their own. The cards stood at the foot of the tab until then, under
 * every agent: on his server that was three screens down, and Claude Code and Codex, with no agents
 * yet, showed nowhere else.
 *
 * The tiles run in the order their agents' rooms last spoke, as the rows under them do, so the
 * harness at work is the one in reach; a harness none of whose rooms has spoken comes after, by
 * name. The line under a name is, first, why it can't answer, in a word (its page says the rest,
 * ADR 0083); then what it is doing, in the status words each app already draws; and otherwise how
 * many agents it has. The first and the last are here, so the phone and the desktop say them alike.
 */

import { type CantAnswer, cantAnswer } from "./agents.js";
import type { AgentsTab } from "./agentsTab.js";
import type { Directory } from "./events.js";

/** One harness on the shelf. */
export interface HarnessTile {
  readonly id: string;
  readonly name: string;
  /** Its agents in the tab's sections, its Main agent with them; not the archived ones. */
  readonly agents: number;
  /** Why it can't answer now, in a word a tile has room for; absent while it can. */
  readonly trouble?: TroubleWord | undefined;
}

/** What a tile says while its harness can't answer. */
export type TroubleWord = "Offline" | "Restarting" | "Can't answer";

/** The harnesses of the tab, as tiles, in the order their rooms last spoke. */
export function harnessShelf(tab: AgentsTab, directory: Directory): readonly HarnessTile[] {
  const rows = [...tab.leads, ...tab.agents];
  const latest = (harnessId: string) =>
    rows
      .filter((row) => row.harnessId === harnessId)
      .reduce((was, row) => (row.at !== undefined && row.at > was ? row.at : was), "");
  return tab.harnesses
    .map((harness) => ({
      tile: {
        id: harness.id,
        name: harness.displayName,
        agents: rows.filter((row) => row.harnessId === harness.id).length,
        trouble: troubleWord(cantAnswer(directory, harness.id)),
      },
      at: latest(harness.id),
    }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.tile.name.localeCompare(b.tile.name))
    .map(({ tile }) => tile);
}

/** Why a harness can't answer, in a word: offline, asked to restart, or in its own trouble. */
export function troubleWord(why: CantAnswer | undefined): TroubleWord | undefined {
  if (why === undefined) return undefined;
  if (why.kind === "offline") return "Offline";
  if (why.kind === "restarting") return "Restarting";
  return "Can't answer";
}

/** How many agents a harness has, under its name: "21 agents", "1 agent", "No agents yet". */
export function agentCountWords(count: number): string {
  if (count === 0) return "No agents yet";
  return `${count} ${count === 1 ? "agent" : "agents"}`;
}
