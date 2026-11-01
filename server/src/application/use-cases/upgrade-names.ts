/**
 * The upgrade to names nobody shares (ADR 0091, point 6): every active agent whose name another
 * agent or a person here answers to, case and spaces aside, is numbered once by an appended
 * `agent.updated`, as Chips numbers a new one from now on.
 *
 * - **A name nobody else has** stays as it is.
 * - **Agents that share a name**: the oldest keeps it, and the others are numbered in the order
 *   they were made, each taking the smallest number free.
 * - **An agent that shares a person's name** is numbered. People are never renamed.
 *
 * A dry run first, and `--apply` on his word. Run twice, it adds nothing. Written by `system`, so a
 * name a person gave an agent stays theirs (`name_by`).
 */

import { clashKey, freeAgentName } from "@chipschat/protocol";
import { holdsItsName, updateAgent } from "../agents.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";

export interface UpgradeNamesDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly readModels: Pick<ReadModels, "participantsIn">;
}

/** One agent the upgrade numbers. */
export interface PlannedRename {
  readonly agent_id: string;
  readonly from: string;
  readonly to: string;
}

export interface NamesPlan {
  readonly renames: readonly PlannedRename[];
}

export function createUpgradeNames(deps: UpgradeNamesDeps) {
  /** What `apply` would append, read from the workspace as it is. */
  async function plan(workspaceId: string): Promise<NamesPlan> {
    // Oldest first, as the directory is kept: the oldest of a name keeps it.
    const everyone = (await deps.readModels.participantsIn(workspaceId)).filter(holdsItsName);
    const holders = new Map<string, number>();
    for (const each of everyone) {
      const key = clashKey(each.display_name);
      holders.set(key, (holders.get(key) ?? 0) + 1);
    }
    const people = new Set(
      everyone.filter((each) => each.kind === "person").map((each) => clashKey(each.display_name)),
    );
    // Whoever keeps a name: a person always; an agent alone with its name; the oldest agent of a
    // name only agents share.
    const taken = new Set<string>(people);
    const clashing = everyone.filter((each) => {
      if (each.kind !== "agent") return false;
      const key = clashKey(each.display_name);
      if (holders.get(key) === 1) {
        taken.add(key);
        return false;
      }
      if (people.has(key) || taken.has(key)) return true;
      taken.add(key);
      return false;
    });
    const renames = clashing.map((agent) => {
      const to = freeAgentName(agent.display_name, taken);
      taken.add(clashKey(to));
      return { agent_id: agent.id, from: agent.display_name, to };
    });
    return { renames };
  }

  /** The plan, appended: one `agent.updated` per agent numbered. */
  async function apply(workspaceId: string): Promise<{ plan: NamesPlan; appended: number }> {
    const planned = await plan(workspaceId);
    for (const rename of planned.renames) {
      await updateAgent(
        deps,
        workspaceId,
        rename.agent_id,
        { kind: "system", id: "system" },
        {
          name: rename.to,
        },
      );
    }
    return { plan: planned, appended: planned.renames.length };
  }

  return { plan, apply };
}

export type UpgradeNames = ReturnType<typeof createUpgradeNames>;

/** The plan as the command prints it. */
export function describeNames(plan: NamesPlan): string {
  if (plan.renames.length === 0) return "  Nothing to number: no two agents share a name.";
  return [
    `  ${plan.renames.length} agents to number:`,
    ...plan.renames.map((each) => `    ${each.agent_id}  ${each.from} → ${each.to}`),
  ].join("\n");
}
