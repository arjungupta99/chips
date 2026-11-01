/**
 * A person names themselves again (ADR 0082). Everyone arrives with a name — the one the demo
 * gave its first person was "You", which every harness then called them — and nothing changed it
 * until now (the OpenClaw test, finding 29).
 *
 * Who may: the person, of themselves. Nobody renames somebody else: a name is how a person is
 * known, and a workspace owner who could change it could put words under a name its owner never
 * chose. The name is the people registry's, as a joining is (ADR 0018), so the registry row is
 * written first, and `person.renamed` records the change for the audit, for the screens that
 * keep names, and for the harnesses that do.
 *
 * What it may be: something, and not a paragraph, the rule a joining has (`cleanDisplayName`);
 * and nobody else's in this workspace, case and spaces aside, which is a name's @ (ADR 0091). An
 * agent whose name clashes is numbered; a person is never numbered, so a person is refused.
 */

import { nameProblem } from "@chipschat/protocol";
import { nameHolder } from "../agents.js";
import type { Principal } from "../ports/identity.js";
import type {
  Clock,
  EventStore,
  IdGenerator,
  ParticipantView,
  ReadModels,
} from "../ports/index.js";
import type { PeopleRegistry } from "../ports/people.js";
import { cleanDisplayName, takenWords } from "./join-workspace.js";

export interface RenamePersonDeps {
  readonly people: Pick<PeopleRegistry, "rename">;
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "participant" | "participantsIn">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type RenameFailure = {
  readonly kind: "not_yourself" | "unknown_person" | "invalid" | "taken";
  readonly message: string;
};

export interface Renamed {
  readonly participantId: string;
  readonly displayName: string;
  readonly previousName: string;
  /** The `person.renamed`, when the name changed; nothing when it was the name already. */
  readonly eventId?: string;
}

type Answer = { ok: true; value: Renamed } | { ok: false; error: RenameFailure };

const refuse = (kind: RenameFailure["kind"], message: string): Answer => ({
  ok: false,
  error: { kind, message },
});

/** The person being renamed, when the caller may rename them: themselves, and a person. */
async function renamedBy(
  deps: RenamePersonDeps,
  principal: Principal,
  participantId: string,
): Promise<Answer | ParticipantView> {
  if (principal.kind !== "person" || principal.participantId !== participantId) {
    return refuse("not_yourself", "A person changes their own name, and nobody else's.");
  }
  const person = await deps.readModels.participant(principal.workspaceId, participantId);
  if (person === undefined || person.kind !== "person") {
    return refuse("unknown_person", "No person by that id here.");
  }
  return person;
}

export function createRenamePerson(deps: RenamePersonDeps) {
  return async function renamePerson(input: {
    principal: Principal;
    participantId: string;
    displayName: string;
  }): Promise<Answer> {
    const { principal, participantId } = input;
    const { workspaceId } = principal;
    const person = await renamedBy(deps, principal, participantId);
    if ("ok" in person) return person;
    const displayName = cleanDisplayName(input.displayName);
    if (displayName === undefined) {
      return refuse("invalid", "A name is something, up to 120 characters.");
    }
    const previousName = person.display_name;
    if (displayName === previousName) {
      return { ok: true, value: { participantId, displayName, previousName } };
    }
    const problem = nameProblem(displayName);
    if (problem !== undefined) return refuse("invalid", problem);
    const everyone = await deps.readModels.participantsIn(workspaceId);
    const holder = nameHolder(everyone, participantId, displayName, { harnesses: true });
    if (holder !== undefined) return refuse("taken", takenWords(holder));

    await deps.people.rename({ workspaceId, participantId, displayName });
    const eventId = deps.ids.next("event");
    await deps.store.append({
      v: 1,
      type: "person.renamed",
      id: eventId,
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `rename-${participantId}-${eventId}`,
      participant_id: participantId,
      display_name: displayName,
      previous_name: previousName,
    });
    return { ok: true, value: { participantId, displayName, previousName, eventId } };
  };
}

export type RenamePerson = ReturnType<typeof createRenamePerson>;
