/**
 * Invites (ADR 0034): how a person joins a workspace that is not theirs.
 *
 * An owner or admin makes one — 256 bits of randomness in a link, kept here only as a digest,
 * with a role, an expiry and whether it is good once or until it is revoked. Whoever opens the
 * link is shown what it is for, names themselves, and joins with the invite's role; the device
 * that redeemed it is paired in the same breath, because the invite is that device's pairing
 * code. Every joining is a `person.joined` naming the invite and who issued it.
 *
 * A link may name a space (ADR 0168): whoever joins by it is put in that space in the same step,
 * as its maker would add them, and somebody already in the workspace who opens it is let into the
 * space without spending it. Such a link is good only while its space would take them from its
 * maker: open, and the maker still in it. Each use asks, and a link found wanting is withdrawn
 * then, so leaving the space, archiving it, erasing it or a harness closing it all end its links
 * without each having to know about them.
 *
 * A link lives 30 minutes at most, counted again when it is used (ADR 0232). One that went out as
 * the relay's page asks: redeeming it makes a request that waits for its maker's Allow, and the
 * person is made, the device paired and the link spent only when that request is collected.
 */

import { FIRST_PERSON_NAME, nameProblem } from "@chipschat/protocol";
import { mayInvite, type WorkspaceRole } from "../../domain/index.js";
import type { EventStore } from "../ports/event-store.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, IdGenerator, ReadModels } from "../ports/index.js";
import type { InviteRegistry, InviteView } from "../ports/invites.js";
import { cleanDisplayName, type JoinWorkspace, nameTakenBy, takenWords } from "./join-workspace.js";
import type { DeviceRegistry, PairedDevice } from "./pair-device.js";

export interface InvitesDeps {
  readonly registry: InviteRegistry;
  readonly devices: DeviceRegistry;
  readonly join: JoinWorkspace;
  readonly readModels: Pick<
    ReadModels,
    "workspace" | "participant" | "participantsIn" | "space" | "isMember" | "spaceCountFor"
  >;
  /** Where the line that puts somebody in a link's space is written, as Chips writes a fork's. */
  readonly store: Pick<EventStore, "append">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Mints a token and its digest. Injected so a test can read the token it will get. */
  readonly mint: () => { readonly token: string; readonly hash: string };
  readonly hash: (token: string) => string;
  /**
   * Make the request a link that asks waits on (ADR 0232): the join requests' `waitForLink`.
   * Without it, such a link lets its person in at once, as every link did before.
   */
  readonly wait?:
    | ((ask: {
        readonly workspaceId: string;
        readonly askedOf: string;
        readonly name: string;
        readonly machine: string;
        readonly publicKey: string;
        readonly inviteId: string;
        readonly role: WorkspaceRole;
        readonly spaceId: string | null;
      }) => Promise<
        | { ok: true; value: InviteWaiting["waiting"] }
        | { ok: false; error: { kind: string; message: string } }
      >)
    | undefined;
}

/** A link that asks, redeemed: the request that waits for its maker (ADR 0232). */
export interface InviteWaiting {
  readonly waiting: {
    readonly requestId: string;
    readonly secret: string;
    readonly code: string;
    readonly interval: number;
    readonly expiresIn: number;
  };
}

/** What a person answers a link with: their name, and the device they join from. */
interface Answered {
  readonly displayName: string;
  readonly publicKey: string;
  readonly deviceName: string;
}

export type InviteFailure = {
  readonly kind:
    | "not_allowed"
    | "invalid"
    /** A name somebody here goes by already: told apart from `invalid`, so the door counts it (SEC-24). */
    | "taken"
    | "unknown_invite"
    | "spent"
    | "expired"
    | "revoked"
    | "guest_elsewhere"
    /** Five requests wait already, so a link that asks can't make a sixth (ADR 0232). */
    | "too_many";
  readonly message: string;
};

type Answer<T> = { ok: true; value: T } | { ok: false; error: InviteFailure };

/** Thirty minutes, and never more (ADR 0232): a link is for sending now, not for keeping. */
export const DEFAULT_INVITE_TTL_SECONDS = 30 * 60;
export const MAX_INVITE_TTL_SECONDS = 30 * 60;

export interface IssuedInvite extends InviteView {
  /** Shown once, in the link. Chips keeps the digest. */
  readonly token: string;
}

export interface InvitePeek {
  readonly inviteId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: WorkspaceRole;
  readonly singleUse: boolean;
  readonly expiresAt: string;
  /** Who made the link, as they go by now: the name a person who opens it knows (JR-13). */
  readonly invitedByName: string | null;
  /** The space it brings them into, and what it is called (ADR 0168); `null` for none. */
  readonly spaceId: string | null;
  readonly spaceName: string | null;
}

export interface RedeemedInvite extends PairedDevice {
  readonly role: WorkspaceRole;
  readonly workspaceName: string;
  /** The space they were put in by the link (ADR 0168), or `null`. */
  readonly spaceId: string | null;
}

/** Somebody already in the workspace, let into a link's space (ADR 0168). */
export interface EnteredSpace {
  readonly spaceId: string;
  readonly workspaceId: string;
  /** They were in it already: nothing was written. */
  readonly already: boolean;
}

const NOT_ALLOWED: InviteFailure = {
  kind: "not_allowed",
  message: "Only an owner of the workspace invites people.",
};

/** Whether a link may last this long: a whole number of seconds, a minute to 30 minutes. */
function lastsRightly(ttl: number): boolean {
  return Number.isInteger(ttl) && ttl >= 60 && ttl <= MAX_INVITE_TTL_SECONDS;
}

/** The one answer for a link that is no good, whatever is wrong with it (ADR 0034). */
const NOT_VALID: InviteFailure = { kind: "unknown_invite", message: "That invite is not valid." };

/** The roles a space's link may give: a guest of that space, or a member who starts there. */
const SPACE_ROLES: readonly WorkspaceRole[] = ["guest", "member"];

/** The shape of a device's public key: 32 bytes of Ed25519 in SPKI DER, base64. */
const PUBLIC_KEY = /^[A-Za-z0-9+/]{40,64}={0,2}$/;

export function createInvites(deps: InvitesDeps) {
  /**
   * What is wrong with an answer to a link, before the link is spent (Gate 5): a key that is
   * not one, a name that is nothing or somebody's already (JR-1), a device paired already.
   * Nothing, when it may go on.
   */
  async function wrongAnswer(
    invite: Pick<InviteView, "workspaceId" | "createdBy">,
    input: { displayName: string; publicKey: string },
  ): Promise<InviteFailure | undefined> {
    if (!PUBLIC_KEY.test(input.publicKey)) {
      return { kind: "invalid", message: "That is not an Ed25519 public key." };
    }
    const name = cleanDisplayName(input.displayName);
    if (name === undefined) {
      return { kind: "invalid", message: "Give the person a name, up to 120 characters." };
    }
    const problem = nameProblem(name);
    if (problem !== undefined) return { kind: "invalid", message: problem };
    const holder = await nameTakenBy(deps.readModels, invite.workspaceId, name);
    if (holder !== undefined) return { kind: "taken", message: await takenFor(holder, invite) };
    const existing = await deps.devices.deviceByPublicKey(invite.workspaceId, input.publicKey);
    if (existing !== undefined) {
      return { kind: "invalid", message: "That device is paired already." };
    }
    return undefined;
  }

  /**
   * Why the name is somebody's already, and, when it is a person's, the way back for a person
   * whose phone is new (ADR 0206): Natalie's own invite was refused by her own name, with nothing
   * on the screen to say what she could do instead.
   */
  async function takenFor(
    holder: Parameters<typeof takenWords>[0],
    invite: Pick<InviteView, "workspaceId" | "createdBy">,
  ): Promise<string> {
    const words = takenWords(holder);
    if (holder.kind !== "person") return words;
    const maker = await deps.readModels.participant(invite.workspaceId, invite.createdBy);
    const who =
      maker === undefined || maker.display_name === FIRST_PERSON_NAME
        ? "whoever invited you"
        : maker.display_name;
    return `${words} If that's you on a new phone, ask ${who} to choose Pair a new phone on your page in People.`;
  }

  /** The invite a token names, if it is still good: not revoked, not expired, not spent. */
  async function live(token: string): Promise<Answer<InviteView>> {
    const invite = await deps.registry.inviteByHash(deps.hash(token.trim()));
    if (invite === undefined) {
      return { ok: false, error: { kind: "unknown_invite", message: "That invite is not valid." } };
    }
    return goodNow(invite);
  }

  /**
   * Whether an invite is still good: not withdrawn; not past its expiry, nor older than 30 minutes
   * whatever it was made to last (ADR 0232), so a link made for a week before the limit stops too;
   * not spent; and its space still taking people. Its age is judged `at` a time other than now
   * for a request made from it, which is judged by when it was used, not by when its maker allowed
   * it: an invite opened at its 25th minute and allowed at its 31st let nobody in, though its maker
   * had said yes (the stranger review, 4 November 2026).
   */
  async function goodNow(invite: InviteView, at = deps.clock.nowMs()): Promise<Answer<InviteView>> {
    if (invite.revokedAt !== null) {
      return { ok: false, error: { kind: "revoked", message: "That invite was withdrawn." } };
    }
    const nowMs = at;
    const tooOld = Date.parse(invite.createdAt) + MAX_INVITE_TTL_SECONDS * 1000 <= nowMs;
    if (Date.parse(invite.expiresAt) <= nowMs || tooOld) {
      return { ok: false, error: { kind: "expired", message: "That invite has expired." } };
    }
    if (invite.singleUse && invite.uses > 0) {
      return { ok: false, error: { kind: "spent", message: "That invite was already used." } };
    }
    if (!(await stillTaken(invite))) {
      return { ok: false, error: { kind: "revoked", message: "That invite was withdrawn." } };
    }
    return { ok: true, value: invite };
  }

  /**
   * Why a space would not take somebody by its maker's link, or nothing when it would (ADR 0168):
   * it is an open room, not a thread, and the maker is in it. A room of one agent, which the wire
   * calls direct, takes a link like any other (ADR 0168's addendum).
   */
  async function spaceRefusal(
    workspaceId: string,
    spaceId: string,
    makerId: string,
  ): Promise<string | undefined> {
    const space = await deps.readModels.space(workspaceId, spaceId);
    if (space === undefined || space.parent_space_id !== null) {
      return "A link brings people into a space, and there is no such space here.";
    }
    if (space.state !== "open") return "That space is archived: a link can't bring anybody in.";
    if (!(await deps.readModels.isMember(workspaceId, spaceId, makerId))) {
      return "A link brings people into a space you're in.";
    }
    return undefined;
  }

  /**
   * Whether a link is still good for who made it and what it names. Its maker is still somebody
   * who may make one: an owner another owner made a member kept every link they had handed out,
   * each good for up to 30 minutes more (the stranger review, 4 November 2026). Then a
   * workspace's link always is, and a space's while the space takes people. A link found wanting
   * is withdrawn the first time, so its maker's list no longer offers it.
   */
  async function stillTaken(invite: InviteView): Promise<boolean> {
    if (invite.revokedAt !== null || (await stillGood(invite))) return true;
    await deps.registry.revokeInvite({
      workspaceId: invite.workspaceId,
      inviteId: invite.id,
      at: deps.clock.nowIso(),
    });
    return false;
  }

  async function stillGood(invite: InviteView): Promise<boolean> {
    const maker = await deps.readModels.participant(invite.workspaceId, invite.createdBy);
    if (maker === undefined || maker.removed_at !== null || !mayInvite(maker.role ?? undefined)) {
      return false;
    }
    if (invite.spaceId === null) return true;
    return (await spaceRefusal(invite.workspaceId, invite.spaceId, invite.createdBy)) === undefined;
  }

  /**
   * The line that puts somebody in a link's space: by its maker, naming the link. A guest of the
   * workspace is a guest of the room, as the door marks one a person adds.
   */
  async function putInSpace(
    invite: InviteView,
    person: { readonly id: string; readonly role: WorkspaceRole | undefined },
    spaceId: string,
  ) {
    const participantId = person.id;
    await deps.store.append({
      v: 1,
      type: "membership.added",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: invite.workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: invite.createdBy },
      // Once per person per link: a retry adds nothing.
      idempotency_key: `invite-${invite.id}-${participantId}`,
      participant_id: participantId,
      participant_kind: "person",
      role: person.role === "guest" ? "guest" : "member",
      invite_id: invite.id,
    });
  }

  /** Why this link may not be made, or nothing when it may. */
  async function refuseMaking(input: {
    principal: Principal;
    role: WorkspaceRole;
    expiresInSeconds?: number | undefined;
    spaceId?: string | undefined;
  }): Promise<InviteFailure | undefined> {
    const { principal, spaceId } = input;
    if (principal.kind !== "person" || !mayInvite(principal.role)) return NOT_ALLOWED;
    if (!lastsRightly(input.expiresInSeconds ?? DEFAULT_INVITE_TTL_SECONDS)) {
      return {
        kind: "invalid",
        message: "An invite lasts between a minute and 30 minutes, in whole seconds.",
      };
    }
    if (spaceId === undefined) return undefined;
    if (!SPACE_ROLES.includes(input.role)) {
      return { kind: "invalid", message: "A space's link makes a guest or a member." };
    }
    const why = await spaceRefusal(principal.workspaceId, spaceId, principal.participantId);
    return why === undefined ? undefined : { kind: "invalid", message: why };
  }

  /** The space a link lets this person into, or why it does not. */
  async function enterable(
    principal: Principal,
    token: string,
  ): Promise<Answer<{ invite: InviteView; spaceId: string }>> {
    if (principal.kind !== "person") {
      return {
        ok: false,
        error: { kind: "not_allowed", message: "A person is let into a space by its link." },
      };
    }
    const invite = await live(token);
    if (!invite.ok) return invite;
    const { workspaceId, spaceId } = invite.value;
    // Another workspace's link says nothing here about whether it exists.
    if (workspaceId !== principal.workspaceId) return { ok: false, error: NOT_VALID };
    if (spaceId === null) {
      return {
        ok: false,
        error: { kind: "invalid", message: "That link is to the workspace, and you're in it." },
      };
    }
    return { ok: true, value: { invite: invite.value, spaceId } };
  }

  /** A link that asks, redeemed: the request that waits for its maker's Allow (ADR 0232). */
  async function waitFor(invite: InviteView, input: Answered): Promise<Answer<InviteWaiting>> {
    const waited = await deps.wait?.({
      workspaceId: invite.workspaceId,
      askedOf: invite.createdBy,
      name: cleanDisplayName(input.displayName) ?? input.displayName,
      machine: input.deviceName.slice(0, 120) || "A device",
      publicKey: input.publicKey,
      inviteId: invite.id,
      role: invite.role,
      spaceId: invite.spaceId,
    });
    if (waited === undefined) return { ok: false, error: NOT_VALID };
    if (!waited.ok) {
      return { ok: false, error: { kind: "too_many", message: waited.error.message } };
    }
    return { ok: true, value: { waiting: waited.value } };
  }

  /**
   * Let a person in by a link that is good and an answer that is right: the link spent inside the
   * database, so two people opening one link do not both get in; the person made with its role;
   * their device paired; and, for a space's link, the person put in it.
   */
  async function admit(invite: InviteView, input: Answered): Promise<Answer<RedeemedInvite>> {
    const { workspaceId } = invite;
    const spent = await deps.registry.noteUse({
      workspaceId,
      inviteId: invite.id,
      singleUse: invite.singleUse,
    });
    if (!spent) {
      return { ok: false, error: { kind: "spent", message: "That invite was already used." } };
    }
    const joined = await deps.join({
      workspaceId,
      displayName: input.displayName,
      role: invite.role,
      invite: { inviteId: invite.id, invitedBy: invite.createdBy },
    });
    // A name somebody took between the check and here: the link is spent, and says why.
    if (!joined.ok) return { ok: false, error: { kind: "invalid", message: joined.error.message } };

    const deviceId = deps.ids.next("device");
    await deps.devices.addDevice({
      deviceId,
      workspaceId,
      participantId: joined.value.participantId,
      publicKey: input.publicKey,
      name: input.deviceName.slice(0, 120) || "A device",
      pairedAt: deps.clock.nowIso(),
    });
    // In the link's space in the same step, so nobody joins to an empty welcome (ADR 0168).
    const { spaceId } = invite;
    if (spaceId !== null) {
      const person = { id: joined.value.participantId, role: joined.value.role };
      await putInSpace(invite, person, spaceId);
    }
    const workspace = await deps.readModels.workspace(workspaceId);
    return {
      ok: true,
      value: {
        deviceId,
        participantId: joined.value.participantId,
        workspaceId,
        displayName: joined.value.displayName,
        role: joined.value.role,
        workspaceName: workspace?.name ?? "Chips",
        spaceId,
      },
    };
  }

  return {
    async create(input: {
      principal: Principal;
      role: WorkspaceRole;
      singleUse?: boolean | undefined;
      expiresInSeconds?: number | undefined;
      /** The space whoever joins by it is put in (ADR 0168). */
      spaceId?: string | undefined;
      /** It goes out as the relay's page, so redeeming it waits for an Allow (ADR 0232). */
      asks?: boolean | undefined;
    }): Promise<Answer<IssuedInvite>> {
      const { principal, spaceId } = input;
      const refused = await refuseMaking(input);
      if (refused !== undefined) return { ok: false, error: refused };
      const ttl = input.expiresInSeconds ?? DEFAULT_INVITE_TTL_SECONDS;
      const at = deps.clock.nowIso();
      const minted = deps.mint();
      const invite = {
        id: deps.ids.next("invite"),
        workspaceId: principal.workspaceId,
        role: input.role,
        singleUse: input.singleUse ?? true,
        createdBy: principal.participantId,
        createdAt: at,
        expiresAt: new Date(deps.clock.nowMs() + ttl * 1000).toISOString(),
        asks: input.asks ?? false,
      };
      await deps.registry.addInvite({ ...invite, spaceId, tokenHash: minted.hash });
      return {
        ok: true,
        value: {
          ...invite,
          uses: 0,
          revokedAt: null,
          spaceId: spaceId ?? null,
          token: minted.token,
        },
      };
    },

    async list(principal: Principal): Promise<Answer<InviteView[]>> {
      if (principal.kind !== "person" || !mayInvite(principal.role)) {
        return { ok: false, error: NOT_ALLOWED };
      }
      // A space's link its space no longer takes is withdrawn here too, so the list says so.
      const listed: InviteView[] = [];
      for (const invite of await deps.registry.invitesIn(principal.workspaceId)) {
        const live = invite.revokedAt !== null || (await stillTaken(invite));
        listed.push(live ? invite : { ...invite, revokedAt: deps.clock.nowIso() });
      }
      return { ok: true, value: listed };
    },

    async revoke(input: {
      principal: Principal;
      inviteId: string;
    }): Promise<Answer<{ inviteId: string; revokedAt: string }>> {
      const { principal } = input;
      if (principal.kind !== "person" || !mayInvite(principal.role)) {
        return { ok: false, error: NOT_ALLOWED };
      }
      const at = deps.clock.nowIso();
      const revoked = await deps.registry.revokeInvite({
        workspaceId: principal.workspaceId,
        inviteId: input.inviteId,
        at,
      });
      if (!revoked) {
        return {
          ok: false,
          error: { kind: "unknown_invite", message: "No live invite of that id here." },
        };
      }
      return { ok: true, value: { inviteId: input.inviteId, revokedAt: at } };
    },

    /**
     * What a link is for, before the person has a name here: the workspace, the role, and who
     * sent it. The name is no secret from whoever holds a live link: they are about to see it on
     * every line that person writes.
     */
    async peek(token: string): Promise<Answer<InvitePeek>> {
      const invite = await live(token);
      if (!invite.ok) return invite;
      const workspace = await deps.readModels.workspace(invite.value.workspaceId);
      const maker = await deps.readModels.participant(
        invite.value.workspaceId,
        invite.value.createdBy,
      );
      const { spaceId } = invite.value;
      const space =
        spaceId === null
          ? undefined
          : await deps.readModels.space(invite.value.workspaceId, spaceId);
      return {
        ok: true,
        value: {
          inviteId: invite.value.id,
          workspaceId: invite.value.workspaceId,
          workspaceName: workspace?.name ?? "Chips",
          role: invite.value.role,
          singleUse: invite.value.singleUse,
          expiresAt: invite.value.expiresAt,
          // Not a name nobody gave: "You invited you" would say nothing (JR-17).
          invitedByName:
            maker === undefined || maker.display_name === FIRST_PERSON_NAME
              ? null
              : maker.display_name,
          spaceId,
          spaceName: spaceId === null ? null : (space?.title ?? "a space"),
        },
      };
    },

    /**
     * Join by the link: the person is made with the invite's role, and the device that
     * redeemed it is paired. Everything that can be wrong with the answer is refused before a
     * single-use invite is spent — the name included (Gate 5), so a blank one costs the person
     * a second try and not the link — and then it is spent inside the database, so two people
     * opening one link do not both get in.
     */
    async redeem(
      input: Answered & { readonly token: string },
    ): Promise<Answer<RedeemedInvite | InviteWaiting>> {
      const invite = await live(input.token);
      if (!invite.ok) return invite;
      const wrong = await wrongAnswer(invite.value, input);
      if (wrong !== undefined) return { ok: false, error: wrong };
      if (invite.value.asks && deps.wait !== undefined) return waitFor(invite.value, input);
      return admit(invite.value, input);
    },

    /**
     * An invite's request, allowed by its maker, collected by the device that asked (ADR 0232):
     * the invite asked again whether it is good, and the answer whether it is still free, since
     * a name may have been taken while it waited; then everything redeeming did.
     */
    async collect(request: {
      readonly workspaceId: string;
      readonly inviteId: string;
      readonly answer: Answered;
      /** When the request was made from the invite: its life is judged then. */
      readonly askedAt: string;
    }): Promise<Answer<RedeemedInvite>> {
      const found = await deps.registry.invite(request.workspaceId, request.inviteId);
      if (found === undefined) return { ok: false, error: NOT_VALID };
      const invite = await goodNow(found, Date.parse(request.askedAt));
      if (!invite.ok) return invite;
      const wrong = await wrongAnswer(invite.value, request.answer);
      if (wrong !== undefined) return { ok: false, error: wrong };
      return admit(invite.value, request.answer);
    },

    /**
     * Somebody already in the workspace, given a space's link, let into the space (ADR 0168), as
     * its maker would add them. The link is not spent: it was made for somebody new, and stays
     * theirs. A guest is in one open room at most, so one in an open room already is told so; an
     * archived room is not counted (JR-24).
     */
    async enter(input: { principal: Principal; token: string }): Promise<Answer<EnteredSpace>> {
      const { principal } = input;
      const found = await enterable(principal, input.token);
      if (!found.ok) return found;
      const { invite, spaceId } = found.value;
      const { workspaceId } = principal;
      const who = principal.participantId;
      if (await deps.readModels.isMember(workspaceId, spaceId, who)) {
        return { ok: true, value: { spaceId, workspaceId, already: true } };
      }
      if (
        principal.role === "guest" &&
        (await deps.readModels.spaceCountFor(workspaceId, who)) > 0
      ) {
        return {
          ok: false,
          error: { kind: "guest_elsewhere", message: "A guest is in one space at most." },
        };
      }
      await putInSpace(invite, { id: who, role: principal.role }, spaceId);
      return { ok: true, value: { spaceId, workspaceId, already: false } };
    },
  };
}

export type Invites = ReturnType<typeof createInvites>;
