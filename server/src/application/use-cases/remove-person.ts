/**
 * Take a person out of the workspace (ADR 0160). Until now a person could lose their devices and
 * be made a guest, and never leave: a passkey or a code minted before brought them back.
 *
 * Who may: a workspace owner or admin, and an admin not an owner, by the rank that keeps an admin
 * from changing an owner's role (Gate 5). Nobody removes themselves: an owner who wants out hands
 * the workspace on first. What happens, in this order:
 *
 * - the registry marks them removed, which the door reads from then on: a device of theirs is
 *   refused as `person_removed`, and a code or a passkey pairs no device for them;
 * - every way back in is closed: their sockets now, every device (with its push token), every
 *   passkey, every pairing code they hold and every open invite they made;
 * - the harnesses they own are handed to whoever removed them, each by `harness.transferred`, so
 *   approvals and tokens keep a living owner;
 * - every room they are in has its own `membership.removed`, `reason: "person_removed"`, so the
 *   people still there see them go as any removal is seen;
 * - an approval only they could answer is handed to whoever removed them (`approval.routed`), so
 *   no run waits on somebody who can't come back; one somebody else may answer is left to them;
 * - `person.removed` goes in the log, naming the rooms and the harnesses.
 *
 * The row stays, and so does every word they said: it keeps their name. Their name is free for
 * somebody else, and coming back takes a new invite, which makes a new person. Removing them again
 * records nothing; it still closes anything somehow live, so a second try is always safe.
 *
 * A person deleting their own account (ADR 0243) goes the same way, by `createDeleteAccount` below.
 */

import { administers, outranks } from "../../domain/index.js";
import type { Principal } from "../ports/identity.js";
import type {
  AwaitingApproval,
  Clock,
  EventStore,
  IdGenerator,
  InviteRegistry,
  ParticipantView,
  PasskeyRegistry,
  PushRegistry,
  ReadModels,
} from "../ports/index.js";
import type { PeopleRegistry } from "../ports/people.js";
import type { Sessions } from "../ports/sessions.js";
import type { DeviceRegistry, PairingCodes } from "./pair-device.js";
import type { SetPersonFace } from "./person-face.js";
import type { SubmitEvent } from "./submit-event.js";
import type { TransferHarness } from "./transfer-harness.js";

export interface RemovePersonDeps {
  readonly people: Pick<PeopleRegistry, "markRemoved">;
  readonly devices: Pick<DeviceRegistry, "devicesOf" | "revokeDevice">;
  readonly passkeys: Pick<PasskeyRegistry, "passkeysOf" | "revokePasskey">;
  readonly invites: Pick<InviteRegistry, "invitesIn" | "revokeInvite">;
  readonly push: Pick<PushRegistry, "remove">;
  /** The codes held in memory for pairing (`pair-device.ts`). Absent where none are issued. */
  readonly codes?: Pick<PairingCodes, "dropFor"> | undefined;
  readonly sessions: Pick<Sessions, "closePerson">;
  readonly transferHarness: TransferHarness;
  /** How an approval is handed on, as a person would hand it: the door fills in the rest. */
  readonly submitEvent: SubmitEvent;
  readonly store: EventStore;
  readonly readModels: Pick<
    ReadModels,
    "participant" | "participantsIn" | "spacesForMember" | "isMember" | "approvalsAwaiting"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type RemovePersonFailure = {
  readonly kind: "not_allowed" | "unknown_person" | "yourself" | "only_owner";
  readonly message: string;
};

export interface PersonRemoved {
  readonly participantId: string;
  /** When they were removed: now, or the first time for somebody removed already. */
  readonly removedAt: string;
  /** True when they had been removed before this call, which changed nothing but strays. */
  readonly alreadyRemoved: boolean;
  /** The rooms they were taken out of. */
  readonly spaces: readonly string[];
  /** The harnesses handed to the person who removed them. */
  readonly harnesses: readonly string[];
  /** The approvals only they could answer, handed to the person who removed them. */
  readonly approvals: readonly string[];
  readonly devicesWithdrawn: number;
  readonly passkeysWithdrawn: number;
  readonly invitesWithdrawn: number;
  readonly socketsClosed: number;
  /** The `person.removed`, when this call wrote one. */
  readonly eventId?: string | undefined;
}

type Answer = { ok: true; value: PersonRemoved } | { ok: false; error: RemovePersonFailure };
type Refused = { ok: false; error: RemovePersonFailure };

const refuse = (kind: RemovePersonFailure["kind"], message: string): Refused => ({
  ok: false,
  error: { kind, message },
});

/** The person named, when the caller may remove them. */
async function removable(
  deps: RemovePersonDeps,
  principal: Principal,
  participantId: string,
): Promise<Refused | { ok: true; person: ParticipantView }> {
  if (principal.kind !== "person" || !administers(principal.role)) {
    return refuse("not_allowed", "Only an owner or an admin removes somebody from the workspace.");
  }
  const person = await deps.readModels.participant(principal.workspaceId, participantId);
  if (person === undefined || person.kind !== "person") {
    return refuse("unknown_person", "No person by that id here.");
  }
  if (person.id === principal.participantId) {
    return refuse("yourself", "You can't remove yourself. Hand the workspace on first.");
  }
  if (outranks(person.role ?? "member", principal.role ?? "member")) {
    return refuse("not_allowed", "An admin does not remove an owner.");
  }
  return { ok: true, person };
}

type Shut = Pick<
  PersonRemoved,
  "devicesWithdrawn" | "passkeysWithdrawn" | "invitesWithdrawn" | "socketsClosed"
>;

/** Whose, where and when: what each withdrawal below is told. */
interface Whose {
  readonly workspaceId: string;
  readonly participantId: string;
  readonly at: string;
}

/** Each live device withdrawn, and where it could be reached with it: a phone told nothing now. */
async function withdrawDevices(deps: RemovePersonDeps, whose: Whose): Promise<number> {
  const { workspaceId, at } = whose;
  let withdrawn = 0;
  for (const device of await deps.devices.devicesOf(workspaceId, whose.participantId)) {
    if (device.revokedAt !== null) continue;
    if (await deps.devices.revokeDevice({ workspaceId, deviceId: device.deviceId, at })) {
      withdrawn += 1;
    }
    await deps.push.remove(device.deviceId);
  }
  return withdrawn;
}

/** Each live passkey withdrawn: a sign-in with one pairs nothing for them again. */
async function withdrawPasskeys(deps: RemovePersonDeps, whose: Whose): Promise<number> {
  const { workspaceId, participantId, at } = whose;
  let withdrawn = 0;
  for (const passkey of await deps.passkeys.passkeysOf(workspaceId, participantId)) {
    if (passkey.revokedAt !== null) continue;
    const passkeyId = passkey.id;
    if (await deps.passkeys.revokePasskey({ workspaceId, participantId, passkeyId, at })) {
      withdrawn += 1;
    }
  }
  return withdrawn;
}

/** Each invite they made that could still let somebody in, withdrawn. */
async function withdrawInvites(deps: RemovePersonDeps, whose: Whose): Promise<number> {
  const { workspaceId, at } = whose;
  const live = (await deps.invites.invitesIn(workspaceId)).filter(
    (invite) =>
      invite.createdBy === whose.participantId &&
      invite.revokedAt === null &&
      invite.expiresAt > at,
  );
  let withdrawn = 0;
  for (const invite of live) {
    if (await deps.invites.revokeInvite({ workspaceId, inviteId: invite.id, at })) withdrawn += 1;
  }
  return withdrawn;
}

/** Every way back in, closed: sockets, devices and their push tokens, passkeys, codes, invites. */
async function closeEveryWayIn(deps: RemovePersonDeps, whose: Whose): Promise<Shut> {
  const socketsClosed = deps.sessions.closePerson(whose.workspaceId, whose.participantId);
  const devicesWithdrawn = await withdrawDevices(deps, whose);
  const passkeysWithdrawn = await withdrawPasskeys(deps, whose);
  deps.codes?.dropFor(whose.workspaceId, whose.participantId);
  const invitesWithdrawn = await withdrawInvites(deps, whose);
  return { devicesWithdrawn, passkeysWithdrawn, invitesWithdrawn, socketsClosed };
}

/**
 * A person going, and who takes on what they leave. Removed, the remover acts and inherits; leaving
 * by deleting their own account (ADR 0243), they act themselves and an owner inherits.
 */
interface Going {
  /** Who acts: the remover, or the person themselves. */
  readonly principal: Principal;
  readonly person: ParticipantView;
  /** Who the harnesses and the asks only they could answer go to. */
  readonly heir: string;
  /** They deleted their own account, rather than being removed. */
  readonly left: boolean;
}

/** Why they went, as a harness's or an approval's new owner is told. */
const goneWords = (going: Going): string =>
  going.left
    ? `${going.person.display_name} deleted their account.`
    : `${going.person.display_name} was removed from the workspace.`;

/** The harnesses they own, each handed to the heir. */
async function handOn(deps: RemovePersonDeps, going: Going): Promise<string[]> {
  const { principal, person } = going;
  const handed: string[] = [];
  for (const each of await deps.readModels.participantsIn(principal.workspaceId)) {
    if (each.kind !== "harness" || each.owner_id !== person.id || each.removed_at !== null) {
      continue;
    }
    const result = await deps.transferHarness({
      principal,
      harnessId: each.id,
      ownerId: going.heir,
      reason: going.left
        ? "Its owner deleted their account."
        : "Its owner was removed from the workspace.",
    });
    if (result.ok) handed.push(each.id);
  }
  return handed;
}

/** Out of every room they are in, each with its own line: threads have no members of their own. */
async function takeOutOfRooms(deps: RemovePersonDeps, going: Going): Promise<string[]> {
  const { principal, person } = going;
  const { workspaceId } = principal;
  const rooms: string[] = [];
  for (const spaceId of await deps.readModels.spacesForMember(workspaceId, person.id)) {
    if (!(await deps.readModels.isMember(workspaceId, spaceId, person.id))) continue;
    await deps.store.append({
      v: 1,
      type: "membership.removed",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: principal.participantId },
      idempotency_key: `person-removed-${person.id}-${spaceId}`,
      participant_id: person.id,
      // Nobody removed somebody who left: the schema keeps `removed_by` for somebody else.
      ...(going.left ? {} : { removed_by: principal.participantId }),
      reason: going.left ? "person_left" : "person_removed",
    });
    rooms.push(spaceId);
  }
  return rooms;
}

/** The approvals nobody but them could answer, each handed to the heir. */
async function handOnAsks(deps: RemovePersonDeps, going: Going): Promise<string[]> {
  const { principal, person } = going;
  const handed: string[] = [];
  for (const ask of await deps.readModels.approvalsAwaiting(principal.workspaceId, person.id)) {
    if (ask.approvers.some((id) => id !== person.id)) continue;
    const event = handedToHeir(going, ask, deps);
    const result = await deps.submitEvent({ principal, event });
    if (result.ok) handed.push(ask.approval_id);
  }
  return handed;
}

/** The line in the log: who went, by whose hand, and what went with them. */
async function record(
  deps: RemovePersonDeps,
  going: Going,
  spaces: readonly string[],
  harnesses: readonly string[],
): Promise<string> {
  const { principal, person } = going;
  const eventId = deps.ids.next("event");
  await deps.store.append({
    v: 1,
    type: "person.removed",
    id: eventId,
    ts: deps.clock.nowIso(),
    workspace_id: principal.workspaceId,
    actor: { kind: "person", id: principal.participantId },
    // A person is removed once: coming back makes a new one. A retry finds the first line.
    idempotency_key: `remove-person-${person.id}`,
    participant_id: person.id,
    display_name: person.display_name,
    removed_by: principal.participantId,
    ...(spaces.length === 0 ? {} : { spaces: [...spaces] }),
    ...(harnesses.length === 0 ? {} : { harnesses: [...harnesses] }),
  });
  return eventId;
}

export function createRemovePerson(deps: RemovePersonDeps) {
  return async function removePerson(input: {
    principal: Principal;
    participantId: string;
  }): Promise<Answer> {
    const { principal, participantId } = input;
    const { workspaceId } = principal;
    const found = await removable(deps, principal, participantId);
    if (!found.ok) return found;
    const { person } = found;

    const at = deps.clock.nowIso();
    // Marked first, so nothing the door lets in between here and the withdrawals speaks for them.
    const marked = await deps.people.markRemoved({ workspaceId, participantId, at });
    const shut = await closeEveryWayIn(deps, { workspaceId, participantId, at });
    if (!marked) {
      const value = {
        participantId,
        alreadyRemoved: true,
        spaces: [],
        harnesses: [],
        approvals: [],
        ...shut,
      };
      return { ok: true, value: { ...value, removedAt: person.removed_at ?? at } };
    }

    const going = { principal, person, heir: principal.participantId, left: false };
    const harnesses = await handOn(deps, going);
    const spaces = await takeOutOfRooms(deps, going);
    const approvals = await handOnAsks(deps, going);
    const eventId = await record(deps, going, spaces, harnesses);
    return {
      ok: true,
      value: {
        participantId,
        removedAt: at,
        alreadyRemoved: false,
        spaces,
        harnesses,
        approvals,
        eventId,
        ...shut,
      },
    };
  };
}

export type RemovePerson = ReturnType<typeof createRemovePerson>;

export interface DeleteAccountDeps extends RemovePersonDeps {
  readonly setPersonFace: SetPersonFace;
}

/**
 * A person deletes their own account (ADR 0243, App Review's guideline 5.1.1(v)): they leave the
 * workspace on every device, as a removal takes somebody out, but by their own hand. What differs
 * from a removal:
 *
 * - anybody may, a guest too, of themselves only, and nobody else's;
 * - an owner may only while another owner stays: the workspace is theirs otherwise, on the
 *   computer it runs on, and deleting it is `chips uninstall --remove-data` there;
 * - their face goes, so what they said shows their initials;
 * - what they own and the asks only they could answer go to an owner, since nobody removed them,
 *   and handed on first, while they may still hand things on;
 * - each room's line says they left the workspace (`person_left`), not that somebody removed them.
 *
 * What they said stays, under their name, as for a removal (ADR 0160).
 */
/** Who is going, and the owner who takes on what they leave; or why they can't go this way. */
async function leaving(
  deps: DeleteAccountDeps,
  principal: Principal,
): Promise<{ ok: true; going: Going } | Refused> {
  if (principal.kind !== "person") {
    return refuse("not_allowed", "Only a person has an account to delete.");
  }
  const { workspaceId, participantId } = principal;
  const person = await deps.readModels.participant(workspaceId, participantId);
  if (person === undefined || person.kind !== "person") {
    return refuse("unknown_person", "No person by that id here.");
  }
  const heir = (await deps.readModels.participantsIn(workspaceId)).find(
    (each) =>
      each.kind === "person" &&
      each.role === "owner" &&
      each.id !== participantId &&
      each.removed_at === null,
  );
  if (heir === undefined) {
    return refuse(
      "only_owner",
      "You own this workspace and nobody else does. Make someone else an owner first, or delete the workspace on the computer it runs on: chips uninstall --remove-data.",
    );
  }
  return { ok: true, going: { principal, person, heir: heir.id, left: true } };
}

export function createDeleteAccount(deps: DeleteAccountDeps) {
  return async function deleteAccount(input: { principal: Principal }): Promise<Answer> {
    const found = await leaving(deps, input.principal);
    if (!found.ok) return found;
    const { going } = found;
    const { principal, person } = going;
    const { workspaceId, participantId } = principal;
    // Handed on while they still may: once marked, nothing speaks for them.
    const harnesses = await handOn(deps, going);
    const approvals = await handOnAsks(deps, going);
    if (person.face !== undefined && person.face !== null) {
      await deps.setPersonFace({ principal, participantId, face: null });
    }
    const at = deps.clock.nowIso();
    const marked = await deps.people.markRemoved({ workspaceId, participantId, at });
    const shut = await closeEveryWayIn(deps, { workspaceId, participantId, at });
    const spaces = marked ? await takeOutOfRooms(deps, going) : [];
    const eventId = marked ? await record(deps, going, spaces, harnesses) : undefined;
    return {
      ok: true,
      value: {
        participantId,
        removedAt: marked ? at : (person.removed_at ?? at),
        alreadyRemoved: !marked,
        spaces,
        harnesses,
        approvals,
        eventId,
        ...shut,
      },
    };
  };
}

export type DeleteAccount = ReturnType<typeof createDeleteAccount>;

/** An approval handed to the heir of the one person who could answer it, as they'd hand it. */
function handedToHeir(
  going: Going,
  ask: AwaitingApproval,
  deps: Pick<RemovePersonDeps, "clock" | "ids">,
): Record<string, unknown> {
  const { principal, person } = going;
  return {
    v: 1,
    type: "approval.routed",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: principal.workspaceId,
    ...(ask.space_id === null ? {} : { space_id: ask.space_id }),
    ...(ask.run_id === null ? {} : { run_id: ask.run_id }),
    actor: { kind: "person", id: principal.participantId },
    idempotency_key: `person-removed-${person.id}-${ask.approval_id}`,
    approval_id: ask.approval_id,
    to: [going.heir],
    reason: goneWords(going),
  };
}
