/**
 * Who a caller is told is here, for every route that names participants (M3.3, ADR 0034): the
 * directory, and what each harness runs.
 */

import type { Principal } from "../../application/ports/identity.js";
import type { ParticipantView } from "../../application/ports/index.js";
import { seesEveryAgent, seesWholeDirectory } from "../../domain/index.js";
import type { GatewayDeps } from "./context.js";

/**
 * Who a caller is told is here (M3.3, ADR 0034). An owner or admin is told everybody. Anybody else
 * who is a person is told every person, or, as a guest, whoever is or was in their rooms; and of
 * the agents, those that are or were in their rooms and those of a harness they own, with the
 * harness behind each (his call of 19 October 2026, ADR 0034's addendum). An agent that has left
 * one of their rooms is named so what it said there keeps its name; the apps list only the ones
 * with them now. A harness is told whom it shares a room with, the same scope as its reads.
 */
export async function directoryFor(
  deps: GatewayDeps,
  principal: Principal,
): Promise<readonly ParticipantView[]> {
  const { workspaceId, participantId } = principal;
  if (principal.kind !== "person") {
    return deps.readModels.participantsVisibleTo(workspaceId, participantId);
  }
  const everyone = await deps.readModels.participantsIn(workspaceId);
  if (seesEveryAgent(principal.role)) return everyone;
  const met = new Set(await deps.readModels.participantsMet(workspaceId, participantId));
  const people = seesWholeDirectory(principal.role);
  // A harness's agents are its owner's, and so is the harness (ADR 0023).
  const owned = (each: ParticipantView) => each.owner_id === participantId;
  const agents = everyone.filter(
    (each) => each.kind === "agent" && (met.has(each.id) || owned(each)),
  );
  const behind = new Set(agents.map((each) => each.harness_id));
  const known = new Set(agents.map((each) => each.id));
  return everyone.filter((each) => {
    if (each.kind === "agent") return known.has(each.id);
    if (each.kind === "harness") return behind.has(each.id) || owned(each) || met.has(each.id);
    return people || met.has(each.id);
  });
}
