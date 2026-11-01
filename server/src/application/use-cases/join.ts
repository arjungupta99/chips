/**
 * Join requests (ADR 0122): a harness or a device asks to join, and a person allows it. No token is
 * copied by hand.
 *
 * Two ways in, one request. A requester asks with no credential, shows the code it is answered
 * with, and polls with its secret; an owner or admin compares the code and allows it, choosing
 * which of what it asked for it may have, or refuses it. Or an owner or admin makes a link first,
 * already allowed, with what the harness may do chosen before it exists; whoever holds the link
 * redeems it. Either way the requester is handed its credential once, and the request is spent.
 *
 * What it is handed is made the way it would be by hand, as the person who allowed it: a harness by
 * `addHarness`, with its direct room, and what it may do written by `declareCapabilities` (ADR
 * 0046: the harness asks, a person declares); a device by `pairDevice`, with a code issued for the
 * person and spent in the same breath.
 *
 * The guards: ten minutes for a code and fifteen for a link; five waiting at most; ten asks a
 * minute from one address; only owners and admins see or decide; one redeem; a device asks only
 * from this machine or its network, never through the relay; and a device is allowed with the code
 * it shows, typed by the person allowing it (SEC-6).
 *
 * And a third way in (ADR 0232): an invite, or a pairing code a person's device made, that went
 * out as the relay's page. Using one makes a request that waits for the one person who handed it
 * out, with six digits from the joining device's key to compare; no other owner or admin sees it.
 * Collected, it does what the link would have: the invite spent and the person made, or the device
 * paired.
 */

import {
  isLinkKind,
  JOIN_CODE_SECONDS,
  JOIN_LINK_SECONDS,
  JOIN_POLL_SECONDS,
  JOIN_WAITING_MAX,
  type JoinedDevice,
  type JoinedHarness,
  type JoinKind,
  type JoinRequestView,
  type JoinState,
  pairingCodeTyped,
  withoutHidden,
} from "@chipschat/protocol";
import {
  administers,
  createAskCounter,
  granted,
  onThisNetwork,
  stateAt,
  unknownCapabilities,
  type WorkspaceRole,
} from "../../domain/index.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";
import type { JoinChange, JoinRegistry, JoinRequest } from "../ports/join-requests.js";
import type { AddHarness } from "./add-harness.js";
import type { DeclareCapabilities } from "./declare-capabilities.js";
import type { PairDevice, PairingCodes } from "./pair-device.js";
import { pairingFor } from "./pair-for.js";

export type JoinRequestRefusal =
  | "not_allowed"
  | "invalid"
  | "unknown"
  | "denied"
  | "expired"
  | "spent"
  | "too_many"
  | "too_fast"
  | "not_here"
  | "not_pairing"
  | "decided"
  | "wrong_code";

export interface JoinRequestFailure {
  readonly kind: JoinRequestRefusal;
  readonly message: string;
  readonly retryAfterSeconds?: number;
}

type Answer<T> = { ok: true; value: T } | { ok: false; error: JoinRequestFailure };

export type Joined = JoinedHarness | JoinedDevice;

export interface JoinRequestsDeps {
  readonly registry: JoinRegistry;
  readonly addHarness: AddHarness;
  readonly declareCapabilities: DeclareCapabilities;
  /** Present when this server pairs devices. Without it, a device's request is refused. */
  readonly pairDevice?: PairDevice | undefined;
  readonly pairingCodes?: PairingCodes | undefined;
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "participant" | "anyPerson">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Makes a secret and its digest. Injected so a test can read the secret it will get. */
  readonly mint: () => { readonly secret: string; readonly hash: string };
  readonly hash: (secret: string) => string;
  /** Constant-time equality of two digests. */
  readonly matches: (a: string, b: string) => boolean;
  /** The code a requester shows: six characters, pairing's alphabet. */
  readonly code: () => string;
  /** The six digits a link's request shows, from the joining device's key (ADR 0232). */
  readonly keyCode: (publicKey: string) => string;
  /**
   * Told of every change, to tell the people who may decide: the frame to their sockets, and for a
   * request that has just started waiting, a push. `to` is the one person a link's request is
   * asked of (ADR 0232); every owner and admin otherwise. Best effort: nothing it does is awaited.
   */
  readonly tell?:
    | ((workspaceId: string, request: JoinRequestView, to: string | undefined) => void)
    | undefined;
  /**
   * What an allowed invite's request does when it is collected (ADR 0232): the invite spent, the
   * person made with its role, this device paired as them and put in the invite's room. Without
   * it, an invite's request is refused.
   */
  readonly collectInvite?: ((request: JoinRequest) => Promise<Collected>) | undefined;
  /**
   * The server's tunnel key, base64url (ADR 0191), handed to a device with its credential so it
   * reaches the server through the tunnel from then on. Absent only in a test.
   */
  readonly serverKey?: (() => Promise<string>) | undefined;
}

export interface AskInput {
  readonly kind: JoinKind;
  readonly name: string;
  readonly software?: string | undefined;
  readonly machine?: string | undefined;
  readonly wants?: readonly string[] | undefined;
  readonly publicKey?: string | undefined;
  /** The address it asked from, as people are shown it. */
  readonly fromAddr?: string | undefined;
  /** What it is counted as, for ten asks a minute. */
  readonly countedAs: string;
  /** It came through the relay's tunnel. */
  readonly viaRelay: boolean;
  /** Where to tell it Chips is. */
  readonly url: string;
}

export interface Asked {
  readonly request: JoinRequest;
  readonly secret: string;
  readonly interval: number;
  readonly expiresIn: number;
}

export type Polled = { readonly waiting: true; readonly interval: number } | Joined;

/**
 * What collecting an invite answers: the device it paired, which the request hands on with where
 * Chips is and its key, or why not, in the invite's words.
 */
export type Collected =
  | { readonly ok: true; readonly value: Omit<JoinedDevice, "kind" | "url" | "server_key"> }
  | { readonly ok: false; readonly error: { readonly kind: string; readonly message: string } };

/**
 * A link used (ADR 0232): an invite redeemed or a pairing code used, with the relay on as it went
 * out, so it waits for the one person who handed it out.
 */
export interface LinkAsk {
  readonly kind: "invite" | "pairing";
  readonly workspaceId: string;
  /** Who handed the link out, and alone decides. */
  readonly askedOf: string;
  /** The person's name, for an invite; the device's, for a pairing code. */
  readonly name: string;
  /** The device's name, for an invite. */
  readonly machine?: string | undefined;
  readonly publicKey: string;
  readonly inviteId?: string | undefined;
  readonly role?: WorkspaceRole | undefined;
  /** The room an invite brings the person into. */
  readonly spaceId?: string | null | undefined;
  /** Whom a pairing code pairs the device as, when not the person who made it (ADR 0206). */
  readonly pairAs?: string | null | undefined;
  /** The device of theirs a pairing code was made to replace (ADR 0236). */
  readonly replaces?: string | null | undefined;
  readonly url: string;
}

/** What the joining device is answered while its link's request waits. */
export interface LinkWait {
  readonly requestId: string;
  readonly secret: string;
  readonly code: string;
  readonly interval: number;
  readonly expiresIn: number;
}

const fail = (
  kind: JoinRequestRefusal,
  message: string,
): { ok: false; error: JoinRequestFailure } => ({
  ok: false,
  error: { kind, message },
});

const NOT_ALLOWED = fail("not_allowed", "Only an owner or an admin lets something join.");
const UNKNOWN = fail("unknown", "That join request is not valid.");
const DECIDED = fail("decided", "Somebody has decided it already.");

/** Why a request that is not good is not, in words a requester can act on. */
function refusalFor(state: JoinState): { ok: false; error: JoinRequestFailure } {
  switch (state) {
    case "denied":
      return fail("denied", "A person said no, or withdrew the link.");
    case "expired":
      return fail("expired", "It expired before it was used. Ask for a new one.");
    case "redeemed":
      return fail("spent", "It was used already. Ask for a new one.");
    default:
      return UNKNOWN;
  }
}

/**
 * A device is allowed with the code it shows, typed by the person allowing it (SEC-6): proof that
 * they are looking at the device, and not only at a card a stranger on the Wi-Fi put in front of
 * them. The code is for comparing, not a secret, so a plain comparison is the right one.
 */
function wrongCode(
  typed: string | undefined,
  shown: string | null,
): { ok: false; error: JoinRequestFailure } | undefined {
  if (typed === undefined || typed.trim() === "") {
    return fail("wrong_code", "Type the code the device shows.");
  }
  if (shown === null || pairingCodeTyped(typed) !== shown) {
    return fail(
      "wrong_code",
      "That is not the code the device shows. Look at it, and type what it says.",
    );
  }
  return undefined;
}

/**
 * Why a request may not be allowed as asked: it is not in the state the decision needs, or it is a
 * device's and the code was not typed right (SEC-6). Nothing when it may.
 */
function refusedAllow(
  request: JoinRequest,
  state: JoinState,
  from: JoinState,
  code: string | undefined,
): { ok: false; error: JoinRequestFailure } | undefined {
  if (state !== from) return state === "allowed" ? DECIDED : refusalFor(state);
  // A link's six digits are compared on the sheet, not typed (ADR 0232's A).
  return request.kind === "device" ? wrongCode(code, request.code) : undefined;
}

/** An invite's refusal, in a join request's words, for the device collecting it (ADR 0232). */
function collectRefusal(error: {
  readonly kind: string;
  readonly message: string;
}): JoinRequestFailure {
  switch (error.kind) {
    case "spent":
      return { kind: "spent", message: "The invite was used already. Ask for a new one." };
    case "expired":
      return { kind: "expired", message: "The invite expired. Ask for a new one." };
    case "taken":
    case "invalid":
      return { kind: "invalid", message: error.message };
    default:
      return { kind: "denied", message: "The invite was withdrawn." };
  }
}

/** Whether a request pairs a device when it is collected: one that asked, or a code's (ADR 0232). */
function pairsADevice(kind: JoinKind): boolean {
  return kind === "device" || kind === "pairing";
}

/** Whom a link's request pairs as: settled when the link was made, and not chosen (ADR 0232). */
function linkPairedAs(
  request: JoinRequest,
  as: string | undefined,
): { ok: true; value: string | null } | { ok: false; error: JoinRequestFailure } {
  if (as === undefined) return { ok: true, value: request.pairAs };
  return fail("invalid", "A link's device is paired as the person the link was for.");
}

/**
 * One line of words, with what nobody sees taken out (SEC-33), trimmed and cut to a length; nothing
 * when there are none.
 */
function line(words: string | undefined, most = 120): string | null {
  const trimmed = withoutHidden(words ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed === "" ? null : trimmed.slice(0, most);
}

/**
 * A request as an owner's or admin's client sees it: never the secret, nor a device's key, nor a
 * device's code. A device's code is the device's to show and the person's to type (SEC-6): a card
 * that showed it would be allowed from itself. A harness's is printed where it runs, and compared.
 */
export function viewOf(request: JoinRequest, nowMs: number): JoinRequestView {
  const optional = {
    code: request.kind === "device" ? null : request.code,
    name: request.name,
    software: request.software,
    machine: request.machine,
    from_addr: request.fromAddr,
    decided_by: request.decidedBy,
    decided_at: request.decidedAt,
    harness_id: request.harnessId,
    space_id: request.spaceId,
    device_id: request.deviceId,
    pair_as: request.pairAs,
    role: request.role,
  };
  return {
    request_id: request.id,
    kind: request.kind,
    state: stateAt(request, nowMs),
    started_by: request.startedBy,
    wants: [...request.wants],
    capabilities: [...request.capabilities],
    url: request.url,
    created_at: request.createdAt,
    expires_at: request.expiresAt,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== null)),
  } as JoinRequestView;
}

export function createJoinRequests(deps: JoinRequestsDeps) {
  const asks = createAskCounter();
  const now = () => deps.clock.nowIso();
  const later = (seconds: number) => new Date(deps.clock.nowMs() + seconds * 1000).toISOString();
  const tell = (request: JoinRequest) =>
    deps.tell?.(
      request.workspaceId,
      viewOf(request, deps.clock.nowMs()),
      request.askedOf ?? undefined,
    );

  /**
   * A person who may decide, as a principal: an owner or admin, still; for a link's request, the
   * person who handed it out, still here, whatever their role (ADR 0232).
   */
  async function decider(workspaceId: string, personId: string | null, link = false) {
    if (personId === null) return undefined;
    const person = await deps.readModels.participant(workspaceId, personId);
    if (person?.kind !== "person") return undefined;
    if (!link && !administers(person.role ?? undefined)) return undefined;
    return {
      kind: "person",
      participantId: personId,
      workspaceId,
      displayName: person.display_name,
      role: person.role ?? undefined,
      via: "device_key",
    } satisfies Principal as Principal;
  }

  /**
   * The request a person names, in their workspace, if they may see it: a link's for the one
   * person it is asked of (ADR 0232), and a harness's or a device's for an owner or admin, to whom
   * somebody else's link is not there at all. Anybody else may not ask.
   */
  async function decidable(principal: Principal, id: string): Promise<Answer<JoinRequest>> {
    if (principal.kind !== "person") return NOT_ALLOWED;
    const found = await deps.registry.byId(id);
    const request = found?.workspaceId === principal.workspaceId ? found : undefined;
    if (request !== undefined && sees(principal, request) && isLinkKind(request.kind)) {
      return { ok: true, value: request };
    }
    if (!administers(principal.role)) return NOT_ALLOWED;
    if (request === undefined || !sees(principal, request)) return UNKNOWN;
    return { ok: true, value: request };
  }

  /** Whether a person sees a request in their list: as `decidable` decides, without the lookup. */
  function sees(principal: Principal, request: JoinRequest): boolean {
    if (isLinkKind(request.kind)) return request.askedOf === principal.participantId;
    return administers(principal.role);
  }

  async function audit(
    type: "join.allowed" | "join.denied",
    request: JoinRequest,
    by: string,
    extra: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    const said = {
      name: request.name,
      software: request.software,
      machine: request.machine,
      from_addr: request.fromAddr,
    };
    await deps.store.append({
      v: 1,
      type,
      id: deps.ids.next("event"),
      ts: now(),
      workspace_id: request.workspaceId,
      actor: { kind: "person", id: by },
      idempotency_key: `${request.id}-${type}`,
      request_id: request.id,
      kind: request.kind,
      started_by: request.startedBy,
      ...Object.fromEntries(Object.entries(said).filter(([, value]) => value !== null)),
      by,
      ...extra,
    });
  }

  /** What is wrong with a device's ask: where it came from, and whether this server pairs. */
  function wrongDevice(input: AskInput): JoinRequestFailure | undefined {
    if (input.viaRelay || !onThisNetwork(input.fromAddr)) {
      return fail(
        "not_here",
        "A device asks to join from this network. Away from it, scan the code instead.",
      ).error;
    }
    if (deps.pairDevice === undefined || deps.pairingCodes === undefined) {
      return fail("not_pairing", "This server is not pairing devices.").error;
    }
    if (input.publicKey === undefined) return fail("invalid", "Send the device's key.").error;
    return undefined;
  }

  /** What is wrong with an ask before it is a request; nothing when it may go on. */
  function wrongAsk(input: AskInput): JoinRequestFailure | undefined {
    const wait = asks.note(input.countedAs, deps.clock.nowMs());
    if (wait !== undefined) {
      return {
        kind: "too_fast",
        message: "Too many requests from this address. Try again in a minute.",
        retryAfterSeconds: wait,
      };
    }
    if (line(input.name) === null) return fail("invalid", "Say what it is called.").error;
    return input.kind === "device" ? wrongDevice(input) : undefined;
  }

  /** Write an allowing, in the log when it was a request that waited, and tell who may decide. */
  async function settleAllow(
    request: JoinRequest,
    from: JoinState,
    change: JoinChange,
    by: string,
  ): Promise<Answer<JoinRequest>> {
    const changed = await deps.registry.change({ id: request.id, from, now: now(), change });
    if (!changed) return DECIDED;
    const after = { ...request, ...change };
    if (from === "waiting") {
      const whom =
        after.pairAs === null || after.pairAs === undefined ? {} : { pair_as: after.pairAs };
      await audit("join.allowed", after, by, { capabilities: [...after.capabilities], ...whom });
    }
    tell(after);
    return { ok: true, value: after };
  }

  /**
   * Whom a device is to be paired as when the one allowing it names somebody (ADR 0206): `null`
   * for themselves, as every request was before. A harness is added as the person who allows it.
   */
  async function pairedAs(
    request: JoinRequest,
    principal: Principal,
    as: string | undefined,
  ): Promise<Answer<string | null>> {
    if (as === undefined) return { ok: true, value: null };
    if (request.kind !== "device") {
      return fail("invalid", "A harness joins as the person who allows it.");
    }
    const chosen = await pairingFor(deps.readModels, principal, as);
    if (!chosen.ok) {
      return fail(
        chosen.error.kind === "unknown" ? "invalid" : "not_allowed",
        chosen.error.message,
      );
    }
    return {
      ok: true,
      value: chosen.participantId === principal.participantId ? null : chosen.participantId,
    };
  }

  /**
   * What allowing a request changes. A link is allowed already: allowing it again changes what it
   * will be granted. A request a requester started is allowed with what it asked for, at most.
   */
  function decisionFor(request: JoinRequest, chosen: readonly string[], by: string) {
    const link = request.startedBy === "person";
    const asked = link ? undefined : request.wants;
    const capabilities = request.kind === "harness" ? granted(chosen, asked) : [];
    return link
      ? { from: "allowed" as const, change: { capabilities } }
      : {
          from: "waiting" as const,
          change: { state: "allowed" as const, capabilities, decidedBy: by, decidedAt: now() },
        };
  }

  /** Whether the person a device is to be paired as may still be let in by whoever allowed it. */
  async function pairable(request: JoinRequest, by: Principal): Promise<boolean> {
    return (await pairingFor(deps.readModels, by, request.pairAs ?? undefined)).ok;
  }

  /** Spend an allowed request, and make what it was for, as the person who allowed it. */
  async function redeem(
    request: JoinRequest,
    taken: Partial<Pick<JoinRequest, "name" | "software" | "machine" | "fromAddr">> = {},
  ): Promise<Answer<Joined>> {
    const by = await decider(request.workspaceId, request.decidedBy, isLinkKind(request.kind));
    if (by === undefined) {
      return fail("denied", "The person who allowed it can no longer let anything in.");
    }
    // Whom a device is paired as, asked before the request is spent: spent first, a device whose
    // person was taken out since the allow was told "denied" once and then "used already",
    // though nothing was paired (JR-21). Asked again below, as the code is issued.
    if (pairsADevice(request.kind) && !(await pairable(request, by))) {
      return fail("denied", "The person it was to be paired as can't be let in now.");
    }
    const spent = await deps.registry.change({
      id: request.id,
      from: "allowed",
      now: now(),
      change: { state: "redeemed", ...taken },
    });
    if (!spent) {
      const after = await deps.registry.byId(request.id);
      return refusalFor(after === undefined ? "denied" : stateAt(after, deps.clock.nowMs()));
    }
    return makeWhatItIsFor({ ...request, ...taken, state: "redeemed" }, by);
  }

  /** What a spent request was for: a harness, a device paired, or an invite's person let in. */
  function makeWhatItIsFor(request: JoinRequest, by: Principal): Promise<Answer<Joined>> {
    if (request.kind === "invite") return collectTheInvite(request);
    return pairsADevice(request.kind) ? pairTheDevice(request, by) : addTheHarness(request, by);
  }

  /**
   * An invite's request, allowed and collected (ADR 0232): what redeeming the invite did before,
   * done now, as the invite says. The invite may have been used, withdrawn or run out since.
   */
  async function collectTheInvite(request: JoinRequest): Promise<Answer<Joined>> {
    if (deps.collectInvite === undefined) {
      return fail("not_pairing", "This server is not pairing devices.");
    }
    const collected = await deps.collectInvite(request);
    if (!collected.ok) return { ok: false, error: collectRefusal(collected.error) };
    const joined = collected.value;
    await deps.registry.made(request.id, { deviceId: joined.device_id });
    tell({ ...request, deviceId: joined.device_id });
    return {
      ok: true,
      value: {
        kind: "device",
        ...joined,
        url: request.url,
        ...(deps.serverKey === undefined ? {} : { server_key: await deps.serverKey() }),
      },
    };
  }

  async function addTheHarness(request: JoinRequest, by: Principal): Promise<Answer<Joined>> {
    const added = await deps.addHarness({
      principal: by,
      displayName: request.name ?? "A harness",
      openDirectSpace: true,
    });
    if (!added.ok) return fail("invalid", added.error.message);
    const { harnessId, spaceId, token } = added.value;
    const declared = await deps.declareCapabilities({
      principal: by,
      harnessId,
      capabilities: request.capabilities,
    });
    if (!declared.ok) return fail("invalid", declared.error.message);
    const made = { harnessId, ...(spaceId === undefined ? {} : { spaceId }) };
    await deps.registry.made(request.id, made);
    if (request.startedBy === "person") {
      await audit("join.allowed", request, by.participantId, {
        capabilities: [...request.capabilities],
        harness_id: harnessId,
      });
    }
    tell({ ...request, ...made });
    return {
      ok: true,
      value: {
        kind: "harness",
        url: request.url,
        harness_id: harnessId,
        token,
        ...(spaceId === undefined ? {} : { space_id: spaceId }),
        capabilities: [...request.capabilities],
      } as JoinedHarness,
    };
  }

  /**
   * A one-minute code that pairs the device as whom it is to be: asked again as the device
   * collects it, since the owner who chose somebody may be an owner no longer, or the person they
   * chose taken out since (ADR 0206).
   */
  async function codeForTheDevice(
    request: JoinRequest,
    by: Principal,
  ): Promise<
    Answer<{ readonly pairDevice: PairDevice; readonly code: string; readonly key: string }>
  > {
    const { pairDevice, pairingCodes } = deps;
    if (pairDevice === undefined || pairingCodes === undefined || request.publicKey === null) {
      return fail("not_pairing", "This server is not pairing devices.");
    }
    const as = await pairingFor(deps.readModels, by, request.pairAs ?? undefined);
    if (!as.ok) return fail("denied", "The person it was to be paired as can't be let in now.");
    const issued = pairingCodes.issue({
      workspaceId: request.workspaceId,
      participantId: as.participantId,
      ttlSeconds: 60,
      // A reconnecting phone takes the place of the one its code named (ADR 0236).
      ...(request.replaces === null ? {} : { replaces: request.replaces }),
    });
    return { ok: true, value: { pairDevice, code: issued.code, key: request.publicKey } };
  }

  async function pairTheDevice(request: JoinRequest, by: Principal): Promise<Answer<Joined>> {
    const ready = await codeForTheDevice(request, by);
    if (!ready.ok) return ready;
    const paired = await ready.value.pairDevice({
      code: ready.value.code,
      publicKey: ready.value.key,
      name: request.name ?? "A device",
    });
    // The code it pairs by is one minute's, made here and asked of nobody: it never waits.
    if (!paired.ok || "waiting" in paired.value) {
      return fail("invalid", "That device is paired already, or its key is not one.");
    }
    await deps.registry.made(request.id, { deviceId: paired.value.deviceId });
    tell({ ...request, deviceId: paired.value.deviceId });
    const device = paired.value;
    return {
      ok: true,
      value: {
        kind: "device",
        url: request.url,
        device_id: device.deviceId,
        participant_id: device.participantId,
        workspace_id: device.workspaceId,
        display_name: device.displayName,
        ...(device.workspaceName === undefined ? {} : { workspace_name: device.workspaceName }),
        ...(deps.serverKey === undefined ? {} : { server_key: await deps.serverKey() }),
      } as JoinedDevice,
    };
  }

  return {
    /** `POST /v1/join`: somebody asks to join, with no credential. */
    async ask(input: AskInput): Promise<Answer<Asked>> {
      const wrong = wrongAsk(input);
      if (wrong !== undefined) return { ok: false, error: wrong };
      const workspace = await deps.readModels.anyPerson();
      if (workspace === undefined) return fail("unknown", "Nobody is here yet to let it in.");
      const { workspaceId } = workspace;
      if ((await deps.registry.waitingCount(workspaceId, now())) >= JOIN_WAITING_MAX) {
        return fail(
          "too_many",
          `${JOIN_WAITING_MAX} requests are waiting already. Ask again once one is decided.`,
        );
      }
      const minted = deps.mint();
      const request: JoinRequest = {
        id: deps.ids.next("join"),
        workspaceId,
        kind: input.kind,
        code: deps.code(),
        name: line(input.name),
        software: line(input.software),
        machine: line(input.machine),
        fromAddr: line(input.fromAddr),
        wants: input.kind === "harness" ? granted(input.wants ?? [], undefined) : [],
        publicKey: input.kind === "device" ? (input.publicKey ?? null) : null,
        state: "waiting",
        capabilities: [],
        startedBy: "requester",
        url: input.url,
        decidedBy: null,
        decidedAt: null,
        createdAt: now(),
        expiresAt: later(JOIN_CODE_SECONDS),
        harnessId: null,
        spaceId: null,
        deviceId: null,
        pairAs: null,
        askedOf: null,
        inviteId: null,
        role: null,
        replaces: null,
      };
      await deps.registry.add({ ...request, secretHash: minted.hash });
      tell(request);
      return {
        ok: true,
        value: {
          request,
          secret: minted.secret,
          interval: JOIN_POLL_SECONDS,
          expiresIn: JOIN_CODE_SECONDS,
        },
      };
    },

    /**
     * A link used, with the relay on as it went out (ADR 0232): a request that waits for the one
     * person who handed it out, showing six digits from the joining device's key. What the link
     * may be refused for was refused before this, by the invite or the pairing code.
     */
    async waitForLink(input: LinkAsk): Promise<Answer<LinkWait>> {
      if ((await deps.registry.waitingCount(input.workspaceId, now())) >= JOIN_WAITING_MAX) {
        return fail(
          "too_many",
          `${JOIN_WAITING_MAX} requests are waiting already. Ask again in a few minutes.`,
        );
      }
      const minted = deps.mint();
      const request: JoinRequest = {
        id: deps.ids.next("join"),
        workspaceId: input.workspaceId,
        kind: input.kind,
        code: deps.keyCode(input.publicKey),
        name: line(input.name),
        software: null,
        machine: line(input.machine),
        fromAddr: null,
        wants: [],
        publicKey: input.publicKey,
        state: "waiting",
        capabilities: [],
        startedBy: "requester",
        url: input.url,
        decidedBy: null,
        decidedAt: null,
        createdAt: now(),
        expiresAt: later(JOIN_CODE_SECONDS),
        harnessId: null,
        spaceId: input.spaceId ?? null,
        deviceId: null,
        pairAs: input.pairAs ?? null,
        askedOf: input.askedOf,
        inviteId: input.inviteId ?? null,
        role: input.role ?? null,
        replaces: input.replaces ?? null,
      };
      await deps.registry.add({ ...request, secretHash: minted.hash });
      tell(request);
      return {
        ok: true,
        value: {
          requestId: request.id,
          secret: minted.secret,
          code: request.code ?? "",
          interval: JOIN_POLL_SECONDS,
          expiresIn: JOIN_CODE_SECONDS,
        },
      };
    },

    /** `POST /v1/join/:id/redeem`: the requester asks whether it was allowed, with its secret. */
    async poll(input: { id: string; secret: string }): Promise<Answer<Polled>> {
      const [request, kept] = await Promise.all([
        deps.registry.byId(input.id),
        deps.registry.secretHashOf(input.id),
      ]);
      if (request === undefined || kept === undefined) return UNKNOWN;
      if (!deps.matches(deps.hash(input.secret.trim()), kept)) return UNKNOWN;
      const state = stateAt(request, deps.clock.nowMs());
      if (state === "waiting")
        return { ok: true, value: { waiting: true, interval: JOIN_POLL_SECONDS } };
      if (state !== "allowed") return refusalFor(state);
      return redeem(request);
    },

    /** `POST /v1/join/redeem`: whoever holds a link takes it up. */
    async redeemLink(input: {
      secret: string;
      name: string;
      software?: string | undefined;
      machine?: string | undefined;
      fromAddr?: string | undefined;
    }): Promise<Answer<Joined>> {
      const request = await deps.registry.bySecretHash(deps.hash(input.secret.trim()));
      if (request === undefined || request.startedBy !== "person") return UNKNOWN;
      const state = stateAt(request, deps.clock.nowMs());
      if (state !== "allowed") return refusalFor(state);
      const name = line(input.name);
      if (name === null) return fail("invalid", "Say what it is called.");
      return redeem(request, {
        name,
        software: line(input.software),
        machine: line(input.machine),
        fromAddr: line(input.fromAddr),
      });
    },

    /** `POST /v1/join/links`: an owner or admin makes a link, allowed already. */
    async makeLink(input: {
      principal: Principal;
      capabilities: readonly string[];
      url: string;
    }): Promise<Answer<{ request: JoinRequest; secret: string }>> {
      const { principal } = input;
      if (principal.kind !== "person" || !administers(principal.role)) return NOT_ALLOWED;
      const unknown = unknownCapabilities(input.capabilities);
      if (unknown.length > 0) return fail("invalid", `Nothing called ${unknown.join(", ")}.`);
      const minted = deps.mint();
      const request: JoinRequest = {
        id: deps.ids.next("join"),
        workspaceId: principal.workspaceId,
        kind: "harness",
        code: null,
        name: null,
        software: null,
        machine: null,
        fromAddr: null,
        wants: [],
        publicKey: null,
        state: "allowed",
        capabilities: granted(input.capabilities, undefined),
        startedBy: "person",
        url: input.url,
        decidedBy: principal.participantId,
        decidedAt: now(),
        createdAt: now(),
        expiresAt: later(JOIN_LINK_SECONDS),
        harnessId: null,
        spaceId: null,
        deviceId: null,
        pairAs: null,
        askedOf: null,
        inviteId: null,
        role: null,
        replaces: null,
      };
      await deps.registry.add({ ...request, secretHash: minted.hash });
      tell(request);
      return { ok: true, value: { request, secret: minted.secret } };
    },

    /**
     * `POST /v1/join/:id/allow`: an owner or admin allows a request, with what they grant of what it
     * asked, and for a device with the code it shows, typed (SEC-6). On a link not yet taken up,
     * the same call changes what it will be granted.
     */
    async allow(input: {
      principal: Principal;
      id: string;
      capabilities: readonly string[];
      code?: string | undefined;
      /** For a device, an owner's choice of somebody already here to pair it as (ADR 0206). */
      as?: string | undefined;
    }): Promise<Answer<JoinRequest>> {
      const found = await decidable(input.principal, input.id);
      if (!found.ok) return found;
      const request = found.value;
      const by = input.principal.participantId;
      const decision = decisionFor(request, input.capabilities, by);
      const { from } = decision;
      const refused = refusedAllow(request, stateAt(request, deps.clock.nowMs()), from, input.code);
      if (refused !== undefined) return refused;
      const chosen = isLinkKind(request.kind)
        ? linkPairedAs(request, input.as)
        : await pairedAs(request, input.principal, input.as);
      if (!chosen.ok) return chosen;
      const change =
        chosen.value === null ? decision.change : { ...decision.change, pairAs: chosen.value };
      return settleAllow(request, from, change, by);
    },

    /** `DELETE /v1/join/:id`: an owner or admin refuses a request, or withdraws a link. */
    async deny(input: { principal: Principal; id: string }): Promise<Answer<JoinRequest>> {
      const found = await decidable(input.principal, input.id);
      if (!found.ok) return found;
      const request = found.value;
      const state = stateAt(request, deps.clock.nowMs());
      if (state !== "waiting" && state !== "allowed") return refusalFor(state);
      const by = input.principal.participantId;
      const decision = { state: "denied" as const, decidedBy: by, decidedAt: now() };
      const changed = await deps.registry.change({
        id: request.id,
        from: state,
        now: now(),
        change: decision,
      });
      if (!changed) return DECIDED;
      const after = { ...request, ...decision };
      await audit("join.denied", after, by);
      tell(after);
      return { ok: true, value: after };
    },

    /**
     * `GET /v1/join?state=`: what a person may decide, or has: an owner's or admin's harnesses and
     * devices, and anybody's links (ADR 0232).
     */
    async list(principal: Principal, states: readonly JoinState[]): Promise<Answer<JoinRequest[]>> {
      if (principal.kind !== "person") return NOT_ALLOWED;
      const nowMs = deps.clock.nowMs();
      // Stored states, read as they stand now: one past its expiry is expired before the sweep.
      const stored = new Set<JoinState>(
        states.includes("expired") ? [...states, "waiting", "allowed"] : states,
      );
      const rows = await deps.registry.inStates(principal.workspaceId, [...stored]);
      return {
        ok: true,
        value: rows.filter((row) => sees(principal, row) && states.includes(stateAt(row, nowMs))),
      };
    },

    /** `GET /v1/join/:id`: one request, for the card that follows it. */
    async get(principal: Principal, id: string): Promise<Answer<JoinRequest>> {
      return decidable(principal, id);
    },

    /** The sweep: requests past their expiry are expired, and the people who could decide are told. */
    async expire(): Promise<number> {
      const expired = await deps.registry.expire(now());
      for (const request of expired) tell(request);
      return expired.length;
    },
  };
}

export type JoinRequests = ReturnType<typeof createJoinRequests>;
