/**
 * A person chooses the face they wear (ADR 0139): a mark from Chips' library or a letter or two,
 * on one of its grounds, in place of the initials of their name; or the initials back.
 *
 * Who may: the person, of themselves, as with their name (ADR 0082). Nobody gives somebody else a
 * face: it is how they are seen beside their words. A guest too, since it changes nothing about
 * the workspace, only how they look in the one room they are in.
 *
 * It is one face for everybody, as an agent's is (ADR 0089), so it is the log's: `person.face_set`
 * carries it, the person's row keeps it, and every screen reads the directory again.
 */

import { createHash } from "node:crypto";
import type { SpaceIcon } from "@chipschat/protocol";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";
import { sameFace } from "./agent-face.js";

export interface PersonFaceDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "participant">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface PersonFaceRefusal {
  readonly kind: "not_yourself" | "unknown_person";
  readonly message: string;
}

export type PersonFaceResult =
  | { readonly ok: true; readonly changed: boolean; readonly face: SpaceIcon | null }
  | { readonly ok: false; readonly error: PersonFaceRefusal };

export function createSetPersonFace(deps: PersonFaceDeps) {
  return async function setPersonFace(input: {
    readonly principal: Principal;
    readonly participantId: string;
    /** `null` takes the choice back: they wear their initials again. */
    readonly face: SpaceIcon | null;
  }): Promise<PersonFaceResult> {
    const { principal, participantId, face } = input;
    if (principal.kind !== "person" || principal.participantId !== participantId) {
      return {
        ok: false,
        error: { kind: "not_yourself", message: "A person chooses their own face, nobody else's." },
      };
    }
    const { workspaceId } = principal;
    const person = await deps.readModels.participant(workspaceId, participantId);
    if (person?.kind !== "person") {
      return {
        ok: false,
        error: { kind: "unknown_person", message: "No person by that id here." },
      };
    }
    if (sameFace(person.face ?? null, face)) return { ok: true, changed: false, face };
    const head = await deps.store.head(workspaceId);
    const change = createHash("sha256").update(JSON.stringify(face)).digest("hex").slice(0, 32);
    await deps.store.append({
      v: 1,
      type: "person.face_set",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: participantId },
      // The same face twice at once is one event; the same face again later is a new one.
      idempotency_key: `person-face-${participantId}-${change}-at-${head}`,
      participant_id: participantId,
      face,
    });
    return { ok: true, changed: true, face };
  };
}

export type SetPersonFace = ReturnType<typeof createSetPersonFace>;
