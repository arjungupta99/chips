/**
 * A person's own name (ADR 0082) and face (ADR 0139).
 *
 * `POST /v1/people/:id/name` — change what you go by. Yours only; a name nobody else here has,
 * of up to 120 characters. The registry is written and `person.renamed` recorded, and every
 * screen and harness that keeps names reads them again. The same name again changes nothing and
 * records nothing.
 *
 * `PUT /v1/people/:id/face` — choose the face you wear, `{icon, ground}` or `{icon: "", ground,
 * letters}` as a space's or an agent's is; `DELETE` gives you your initials back. Yours only. It
 * is recorded as `person.face_set`, and the directory carries it as `face`. The same face again
 * changes nothing and records nothing.
 *
 * `DELETE /v1/people/:id` — take a person out of the workspace (ADR 0160). An owner's or an
 * admin's, and an admin's never on an owner; never on yourself. They are signed out everywhere at
 * once, taken out of every room, and their harnesses are handed to you. Removing them again records
 * nothing and says when it was done.
 *
 * `DELETE /v1/people/me` — delete your own account (ADR 0243): you leave the workspace as a removal
 * would take you out, on every device, your face goes, and an owner takes on your harnesses and the
 * asks only you could answer. Anybody's, of themselves; an owner's only while another owner stays,
 * refused as `only_owner` otherwise. The answer is a removal's.
 */

import { parseSpaceIcon } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { PersonFaceRefusal, PersonRemoved } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

/** What a removal, or an account deleted, answers: who, when, and what went with them. */
function removedBody(removed: PersonRemoved) {
  return {
    participant_id: removed.participantId,
    removed_at: removed.removedAt,
    already_removed: removed.alreadyRemoved,
    spaces: removed.spaces,
    harnesses: removed.harnesses,
    approvals: removed.approvals,
    devices_withdrawn: removed.devicesWithdrawn,
    passkeys_withdrawn: removed.passkeysWithdrawn,
    invites_withdrawn: removed.invitesWithdrawn,
    sockets_closed: removed.socketsClosed,
    ...(removed.eventId === undefined ? {} : { event_id: removed.eventId }),
  };
}

function readName(raw: string): string {
  let body: { display_name?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.display_name !== "string") {
    throw new HttpError("invalid_event", "Send the `display_name` to go by.");
  }
  return body.display_name;
}

function readFace(raw: string) {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const parsed = parseSpaceIcon(body);
  if (!parsed.ok) throw new HttpError("invalid_event", `Not a face: ${parsed.message}`);
  return parsed.value;
}

function faceRefusal(error: PersonFaceRefusal): HttpError {
  return new HttpError(error.kind === "not_yourself" ? "forbidden" : "not_found", error.message);
}

export function registerPeopleRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/people/:id/face", async (c) => {
    const participantId = c.req.param("id");
    const face = readFace(c.get("rawBody"));
    const result = await deps.setPersonFace({ principal: c.get("principal"), participantId, face });
    if (!result.ok) throw faceRefusal(result.error);
    if (result.changed) c.get("logger").info({ participantId }, "person face set");
    return c.json({ participant_id: participantId, face: result.face });
  });

  app.delete("/v1/people/:id/face", async (c) => {
    const participantId = c.req.param("id");
    const result = await deps.setPersonFace({
      principal: c.get("principal"),
      participantId,
      face: null,
    });
    if (!result.ok) throw faceRefusal(result.error);
    if (result.changed) c.get("logger").info({ participantId }, "person face cleared");
    return c.body(null, 204);
  });

  // Before `/v1/people/:id`, which would take `me` for an id.
  app.delete("/v1/people/me", async (c) => {
    const result = await deps.deleteAccount({ principal: c.get("principal") });
    if (!result.ok) {
      const refusal = result.error.kind === "only_owner" ? "only_owner" : undefined;
      throw new HttpError("forbidden", result.error.message, undefined, undefined, refusal);
    }
    const removed = result.value;
    c.get("logger").info(
      {
        participantId: removed.participantId,
        spaces: removed.spaces.length,
        harnesses: removed.harnesses.length,
        approvals: removed.approvals.length,
        devices: removed.devicesWithdrawn,
      },
      "account deleted",
    );
    return c.json(removedBody(removed));
  });

  app.delete("/v1/people/:id", async (c) => {
    const participantId = c.req.param("id");
    const result = await deps.removePerson({ principal: c.get("principal"), participantId });
    if (!result.ok) {
      if (result.error.kind === "unknown_person") {
        throw new HttpError("not_found", result.error.message);
      }
      throw new HttpError("forbidden", result.error.message);
    }
    const removed = result.value;
    c.get("logger").info(
      {
        participantId,
        spaces: removed.spaces.length,
        harnesses: removed.harnesses.length,
        approvals: removed.approvals.length,
        devices: removed.devicesWithdrawn,
        socketsClosed: removed.socketsClosed,
        already: removed.alreadyRemoved,
      },
      "person removed",
    );
    return c.json(removedBody(removed));
  });

  app.post("/v1/people/:id/name", async (c) => {
    const participantId = c.req.param("id");
    const result = await deps.renamePerson({
      principal: c.get("principal"),
      participantId,
      displayName: readName(c.get("rawBody")),
    });
    if (!result.ok) {
      if (result.error.kind === "not_yourself")
        throw new HttpError("forbidden", result.error.message);
      if (result.error.kind === "unknown_person")
        throw new HttpError("not_found", result.error.message);
      throw new HttpError("invalid_event", result.error.message);
    }
    const renamed = result.value;
    if (renamed.eventId !== undefined) c.get("logger").info({ participantId }, "person renamed");
    return c.json({
      participant_id: renamed.participantId,
      display_name: renamed.displayName,
      previous_name: renamed.previousName,
      ...(renamed.eventId === undefined ? {} : { event_id: renamed.eventId }),
    });
  });
}
