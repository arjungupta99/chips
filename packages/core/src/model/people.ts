/** Who is in the workspace, what they may do, and whose harness is whose. */

import type { WorkspaceRole } from "@chipschat/protocol";
import { type FoldStep, field, required } from "./state.js";

export const PEOPLE_FOLDS: Readonly<Record<string, FoldStep>> = {
  // A person entered the workspace with a role (ADR 0034). Their name here is as they joined;
  // the directory carries the current one.
  "person.joined": (state, event) => {
    const participantId = required<string>(event, "participant_id");
    const role = required<WorkspaceRole>(event, "role");
    const invitedBy = field<string>(event, "invited_by");
    const displayName = required<string>(event, "display_name");
    state.people.set(participantId, {
      participantId,
      displayName,
      role,
      joinedAt: event.ts,
      invitedBy,
      inviteId: field<string>(event, "invite_id"),
    });
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "people",
      who: invitedBy ?? participantId,
      what:
        invitedBy === undefined
          ? `${displayName} joined as ${role}`
          : `invited ${displayName}, who joined as ${role}`,
    });
  },

  // A person named themselves again (ADR 0082): the people list says the new name at once, and
  // the directory, which every screen names participants from, is read again (`REREAD_DIRECTORY`).
  "person.renamed": (state, event) => {
    const participantId = required<string>(event, "participant_id");
    const displayName = required<string>(event, "display_name");
    const person = state.people.get(participantId);
    if (person !== undefined) state.people.set(participantId, { ...person, displayName });
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "people",
      who: participantId,
      what: `${required<string>(event, "previous_name")} goes by ${displayName} now`,
    });
  },

  // A harness handed to another person (M5.2): the directory carries the new owner once it is
  // fetched again; the audit says who handed what to whom.
  "harness.transferred": (state, event) => {
    const harnessId = required<string>(event, "harness_id");
    const to = required<string>(event, "to_owner_id");
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "people",
      who: event.actor.id,
      what: `handed ${harnessId} to ${state.people.get(to)?.displayName ?? to}`,
      reason: field<string>(event, "reason"),
    });
  },

  // A harness removed from the workspace (ADR 0078): the directory marks it once it is fetched
  // again, and the lists leave it out; the audit says who removed it. The rooms that were its
  // homes stop being homes here as on the server, so they may be archived or deleted.
  "harness.removed": (state, event) => {
    for (const spaceId of field<string[]>(event, "homes") ?? []) {
      const space = state.spaces.get(spaceId);
      if (space === undefined) continue;
      space.home = false;
      state.dirty.add(spaceId);
    }
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "people",
      who: event.actor.id,
      what: `removed ${required<string>(event, "display_name")}`,
      reason: field<string>(event, "reason"),
    });
  },

  // A person removed from the workspace (ADR 0160), or gone by deleting their account (ADR 0243),
  // when they removed themselves: off the people list, as on the server. Their rooms each had a
  // `membership.removed` before this, drawn with their name while it was here; what they said keeps
  // it through the directory, which marks them once fetched again.
  "person.removed": (state, event) => {
    const participantId = required<string>(event, "participant_id");
    state.people.delete(participantId);
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "people",
      who: event.actor.id,
      what:
        field<string>(event, "removed_by") === participantId
          ? "deleted their account"
          : `removed ${required<string>(event, "display_name")} from the workspace`,
    });
  },

  "role.changed": (state, event) => {
    const participantId = required<string>(event, "participant_id");
    const role = required<WorkspaceRole>(event, "role");
    const person = state.people.get(participantId);
    if (person !== undefined) state.people.set(participantId, { ...person, role });
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "people",
      who: event.actor.id,
      what: `made ${person?.displayName ?? participantId} ${role === "owner" || role === "admin" ? "an" : "a"} ${role}`,
      reason: field<string>(event, "reason"),
    });
  },
};
