/**
 * Join requests on a person's screen (ADR 0122): the request itself, what each capability is
 * called where a person decides, and the card that follows a request from asked to hello.
 *
 * The card's five steps, each read from something the client already holds:
 * 1. waiting — for the harness to take up a link, or for the requester's ask to arrive;
 * 2. asked — it named itself, from somewhere, running something;
 * 3. allowed — by whom;
 * 4. connected — a socket of its harness is open (ADR 0083's presence);
 * 5. said hello — its first message in its direct room.
 *
 * And what stops it, said so a person can do something about it: the request expired; somebody
 * said no; it asked from an address that cannot reach the address it was given; its harness was
 * removed, so the key it holds is no good; or it connected and has said nothing for a while.
 */

import {
  type AgentState,
  HARNESS_CAPABILITIES,
  isLinkKind,
  type JoinRequestView,
  keyCodeShown,
  pairingCodeTyped,
} from "@chipschat/protocol";
import type { Directory } from "./events.js";
import type { Space, WorkspaceModel } from "./model/types.js";

export interface JoinRequest {
  readonly requestId: string;
  readonly kind: JoinRequestView["kind"];
  readonly state: JoinRequestView["state"];
  readonly startedBy: JoinRequestView["started_by"];
  readonly code?: string | undefined;
  readonly name?: string | undefined;
  readonly software?: string | undefined;
  readonly machine?: string | undefined;
  readonly fromAddr?: string | undefined;
  readonly wants: readonly string[];
  readonly capabilities: readonly string[];
  readonly url: string;
  readonly decidedBy?: string | undefined;
  readonly decidedAt?: string | undefined;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly harnessId?: string | undefined;
  readonly spaceId?: string | undefined;
  readonly deviceId?: string | undefined;
  /** Whom a device is paired as, when an owner chose somebody already here (ADR 0206). */
  readonly pairAs?: string | undefined;
  /** For an invite's request (ADR 0232): the role the person joins with. */
  readonly role?: JoinRequestView["role"];
}

/**
 * What Allow sends for a request, on the phone and the desktop alike: what it may do, and for a
 * device the code typed, read as a code reads (SEC-6), and whom it is paired as when an owner chose
 * somebody already here rather than themselves (ADR 0206).
 */
export function allowArgs(
  request: Pick<JoinRequest, "requestId" | "kind">,
  granted: readonly string[],
  code: string,
  as: string | undefined,
  selfId: string | undefined,
): [string, readonly string[], string | undefined, string | undefined] {
  if (request.kind !== "device") return [request.requestId, granted, undefined, undefined];
  return [request.requestId, granted, pairingCodeTyped(code), as === selfId ? undefined : as];
}

/** How far on a request is: it waits, it is allowed, and then it is done one way or another. */
export function joinStage(state: JoinRequest["state"]): number {
  if (state === "waiting") return 0;
  return state === "allowed" ? 1 : 2;
}

/** A request off the wire, in the client's words. */
export function joinRequestOf(wire: JoinRequestView): JoinRequest {
  return {
    requestId: wire.request_id,
    kind: wire.kind,
    state: wire.state,
    startedBy: wire.started_by,
    code: wire.code,
    name: wire.name,
    software: wire.software,
    machine: wire.machine,
    fromAddr: wire.from_addr,
    wants: wire.wants,
    capabilities: wire.capabilities,
    url: wire.url,
    decidedBy: wire.decided_by,
    decidedAt: wire.decided_at,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
    harnessId: wire.harness_id,
    spaceId: wire.space_id,
    deviceId: wire.device_id,
    pairAs: wire.pair_as,
    role: wire.role,
  };
}

/** What a link's Allow says (ADR 0232): who asks, for what, and the six digits to compare. */
export interface LinkAskWords {
  readonly title: string;
  readonly line: string;
  /** Over the code: whose screen shows it too. */
  readonly shows: string;
  /** The code, as people read it: `742 913`. */
  readonly code: string;
  /** Under it: what to check before Allow. */
  readonly check: string;
}

const AS_ROLE: Readonly<Record<NonNullable<JoinRequest["role"]>, string>> = {
  owner: "As an owner",
  admin: "As an admin",
  member: "As a member",
  guest: "As a guest",
};

/**
 * A link's request in the words of its sheet (ADR 0232): "Priya is asking to join Japan trip", for
 * an invite, the room it brings her into or else the workspace; "Studio is asking to pair as you",
 * for a pairing code, or as the person an owner made the code for.
 */
export function linkAskWords(
  request: Pick<JoinRequest, "kind" | "name" | "code" | "role" | "spaceId">,
  place: {
    readonly spaces?: readonly Pick<Space, "id" | "title">[] | undefined;
    readonly workspaceName?: string | undefined;
    /** Whom a pairing code pairs the device as, by name, when not the person deciding. */
    readonly pairAsName?: string | undefined;
  },
): LinkAskWords {
  const code = keyCodeShown(request.code ?? "");
  if (request.kind === "pairing") {
    const name = request.name ?? "A device";
    return {
      title: `${name} is asking to pair as ${place.pairAsName ?? "you"}`,
      line: "From a pairing code you made",
      shows: `${name} shows`,
      code,
      check: `Allow only if ${name} shows this code.`,
    };
  }
  const name = request.name ?? "Somebody";
  const room = place.spaces?.find((each) => each.id === request.spaceId)?.title;
  const where = room ?? place.workspaceName ?? "your workspace";
  return {
    title: `${name} is asking to join ${where}`,
    line: `${AS_ROLE[request.role ?? "member"]} · from your invite`,
    shows: `${name}'s screen shows`,
    code,
    check: `Ask ${name} what code they see. Allow only if it's this one.`,
  };
}

/** What a device says while its link waits for an Allow (ADR 0232). */
export interface LinkWaitingWords {
  readonly title: string;
  readonly line: string;
  readonly code: string;
  readonly foot: string;
}

/**
 * The joining device's words while it waits (ADR 0232): whom for, the six digits the other screen
 * shows too, and how long Chips waits. `inviter` and `place` are an invite's; a pairing code has
 * neither.
 */
export function linkWaitingWords(input: {
  readonly kind: "invite" | "pairing";
  readonly code: string;
  readonly minutes: number;
  readonly inviter?: string | undefined;
  readonly place?: string | undefined;
}): LinkWaitingWords {
  const code = keyCodeShown(input.code);
  const waits = `Chips waits ${input.minutes} ${input.minutes === 1 ? "minute" : "minutes"}.`;
  if (input.kind === "pairing") {
    return {
      title: "Waiting for your other device",
      line: "Allow this one on the device that made the code. It shows this code too:",
      code,
      foot: `Allow it there only if the codes match. ${waits}`,
    };
  }
  const who = input.inviter ?? "Whoever invited you";
  const place = input.place ?? "the workspace";
  return {
    title: `Waiting for ${input.inviter ?? "whoever invited you"}`,
    line: `${who} lets you into ${place}. Their screen shows this code too:`,
    code,
    foot: `It comes from the key this device just made. ${place} opens here once ${who} allows it. ${waits}`,
  };
}

/**
 * What a person is asked to allow, in their words: a switch's label, a line under it where it has
 * room (a harness's page), and a short sentence for where it has none: the connect card's two
 * columns show it when the pointer rests on the row (Arjun, 1 November 2026: "all the switch
 * options should have a very short explainer on hover"; ADR 0257).
 */
export interface CapabilityWords {
  readonly name: string;
  readonly label: string;
  readonly detail?: string | undefined;
  readonly hint?: string | undefined;
}

const WORDS: Readonly<Record<string, Omit<CapabilityWords, "name">>> = {
  [HARNESS_CAPABILITIES.autonomy]: {
    label: "Take the autonomy dial",
    detail: "it asks you first as the dial says",
    hint: "You choose how often it asks before it acts.",
  },
  [HARNESS_CAPABILITIES.newSpaces]: {
    label: "Start new spaces",
    detail: "when you ask it for one",
    hint: "It opens a new space when you ask for one.",
  },
  [HARNESS_CAPABILITIES.followsRooms]: {
    label: "Follow the spaces you open",
    hint: "When you archive or delete a space, it does too.",
  },
  [HARNESS_CAPABILITIES.agents]: {
    label: "Speak as several agents",
    hint: "Each of its agents talks under its own name.",
  },
  [HARNESS_CAPABILITIES.forks]: {
    label: "Copy an agent",
    detail: "when you fork one",
    hint: "It makes a copy when you fork an agent.",
  },
  [HARNESS_CAPABILITIES.newAgents]: {
    label: "Make new agents",
    detail: "when you ask from a space",
    hint: "It adds an agent when you ask for one in a space.",
  },
  [HARNESS_CAPABILITIES.restarts]: {
    label: "Be restarted from Chips",
    hint: "Its page gets a Restart button.",
  },
  [HARNESS_CAPABILITIES.contextFiles]: {
    label: "Share its agents' files",
    detail: "you read and edit them in Chips",
    hint: "You read and edit its agents' files in Chips.",
  },
  [HARNESS_CAPABILITIES.models]: {
    label: "Change models from Chips",
    detail: "and how hard each agent thinks",
    hint: "You pick each agent's model and how hard it thinks.",
  },
  [HARNESS_CAPABILITIES.heartbeats]: {
    label: "Keep a heartbeat",
    detail: "a turn of its own, every so often",
    hint: "It takes a turn of its own every so often.",
  },
  [HARNESS_CAPABILITIES.contextWindows]: {
    label: "Show its context windows",
    detail: "and compact one when you ask",
    hint: "You see how full each agent's context is, and can compact it.",
  },
  [HARNESS_CAPABILITIES.jobs]: {
    label: "Show the jobs it runs itself",
    detail: "what they cost, and a switch for each",
    hint: "You see the jobs it runs on a schedule, and what each one costs.",
  },
};

/**
 * The order capabilities are shown in, and what a link and a harness's page offer to grant: every
 * one Chips draws something for (`HARNESS_CAPABILITIES`), so nothing a harness can do needs the CLI.
 */
export const OFFERED: readonly string[] = [
  HARNESS_CAPABILITIES.autonomy,
  HARNESS_CAPABILITIES.newSpaces,
  HARNESS_CAPABILITIES.followsRooms,
  HARNESS_CAPABILITIES.newAgents,
  HARNESS_CAPABILITIES.restarts,
  HARNESS_CAPABILITIES.agents,
  HARNESS_CAPABILITIES.forks,
  HARNESS_CAPABILITIES.contextFiles,
  HARNESS_CAPABILITIES.models,
  HARNESS_CAPABILITIES.heartbeats,
  HARNESS_CAPABILITIES.contextWindows,
  HARNESS_CAPABILITIES.jobs,
];

/** A link's switches as they start: the dial on, as for any harness on the SDK, the rest off. */
export const LINK_DEFAULTS: readonly string[] = [HARNESS_CAPABILITIES.autonomy];

/**
 * A link's switches as they start for a gallery card (ADR 0171): what its connector needs, in the
 * order they are shown, so it joins able to do its job; the defaults for a card that says nothing.
 */
export function linkStarts(card?: {
  readonly capabilities?: readonly string[] | undefined;
}): readonly string[] {
  const needs = card?.capabilities?.filter((name) => OFFERED.includes(name)) ?? [];
  if (needs.length === 0) return LINK_DEFAULTS;
  return OFFERED.filter((name) => needs.includes(name));
}

export function capabilityWords(name: string): CapabilityWords {
  return { name, ...(WORDS[name] ?? { label: name }) };
}

/** The switches for a request: what it asked for, in the order a person reads them. */
export function switchesFor(request: Pick<JoinRequest, "kind" | "wants">): CapabilityWords[] {
  if (request.kind === "device") return [];
  const asked = new Set(request.wants);
  return [
    ...OFFERED.filter((name) => asked.has(name)),
    ...request.wants.filter((name) => !OFFERED.includes(name)),
  ].map(capabilityWords);
}

/** The card's steps, in order. */
export const JOIN_STEPS = ["waiting", "asked", "allowed", "connected", "hello"] as const;
export type JoinStep = (typeof JOIN_STEPS)[number];

export type JoinStall =
  | { readonly kind: "expired" }
  | { readonly kind: "denied"; readonly by?: string | undefined }
  | { readonly kind: "unreachable"; readonly from: string; readonly url: string }
  | { readonly kind: "revoked" }
  /** It took its key, and nothing of it has been connected for a while since. */
  | { readonly kind: "unstarted" }
  | { readonly kind: "silent" };

export interface JoinCard {
  /** How many steps are done, nought to five; the next one is the one under way. */
  readonly done: number;
  readonly stall?: JoinStall | undefined;
}

/** How long a connected harness may say nothing before the card says so. */
export const SILENT_AFTER_MS = 120_000;

const V4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/;

type Place = "loopback" | "lan" | "tailnet" | "elsewhere";

/** Where an address is: this machine, a home or office network, a tailnet, or anywhere else. */
export function placeOf(address: string): Place {
  const bare = address.replace(/^::ffff:/i, "").replace(/^\[|\]$/g, "");
  if (bare === "localhost" || bare === "::1") return "loopback";
  const match = V4.exec(bare);
  if (match === null) return /^f[cd]/i.test(bare) ? "tailnet" : "elsewhere";
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 127) return "loopback";
  if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return "lan";
  if (a === 100 && b >= 64 && b <= 127) return "tailnet";
  return "elsewhere";
}

/**
 * Whether something that asked from `from` can reach `url`. Only the plain cases are judged: an
 * address on this machine is reachable only from it, and one on a home network only from that
 * network or this machine. A name, a tailnet or a public address is taken to be reachable.
 */
export function unreachableFrom(from: string | undefined, url: string): boolean {
  if (from === undefined) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  const there = placeOf(host);
  const here = placeOf(from);
  if (there === "loopback") return here !== "loopback";
  if (there === "lan") return here !== "lan" && here !== "loopback";
  return false;
}

/** Whether a harness has said anything in its direct room: the card's last step. */
export function saidHello(
  model: Pick<WorkspaceModel, "spaces">,
  directory: Directory,
  request: Pick<JoinRequest, "harnessId" | "spaceId">,
): boolean {
  const { harnessId, spaceId } = request;
  if (harnessId === undefined || spaceId === undefined) return false;
  const room = model.spaces.find((space) => space.id === spaceId);
  return (room?.lines ?? []).some(
    (line) =>
      line.kind === "text" &&
      (line.authorId === harnessId || directory[line.authorId]?.harnessId === harnessId),
  );
}

export interface JoinCardInput {
  readonly request: JoinRequest;
  /** The state of the harness it made, from presence; nothing until there is one. */
  readonly state?: AgentState | undefined;
  /** Whether that harness is gone from the workspace. */
  readonly removed?: boolean | undefined;
  readonly hello: boolean;
  readonly nowMs: number;
}

/** Steps done before anything is connected: the request's own state, read now. */
function stepsOfTheRequest(request: JoinRequest, nowMs: number): JoinCard {
  const expired = Date.parse(request.expiresAt) <= nowMs;
  if (request.state === "denied")
    return { done: 0, stall: { kind: "denied", by: request.decidedBy } };
  if (request.state === "expired" || (request.state !== "redeemed" && expired)) {
    return { done: request.startedBy === "requester" ? 2 : 0, stall: { kind: "expired" } };
  }
  if (request.state === "waiting") return { done: 2 };
  if (request.state === "allowed") return { done: request.startedBy === "person" ? 0 : 3 };
  return { done: 3 };
}

/**
 * Whether a socket of the harness opened after the request was decided. Only then can it be its:
 * it had no key before. The server takes every harness as connected for its first seconds, since
 * it started (ADR 0083), which is before any request it has since decided.
 */
function connectedSince(state: AgentState | undefined, request: JoinRequest): state is AgentState {
  if (state?.connected !== true) return false;
  return Date.parse(state.since) >= Date.parse(request.decidedAt ?? request.createdAt);
}

/** The card for a request, with where it stopped when it has. */
export function joinCardState(input: JoinCardInput): JoinCard {
  const { request, state, hello, nowMs } = input;
  const asked = stepsOfTheRequest(request, nowMs);
  if (asked.stall !== undefined) return asked;
  const unreachable =
    asked.done >= 2 &&
    request.fromAddr !== undefined &&
    unreachableFrom(request.fromAddr, request.url);
  if (unreachable && request.fromAddr !== undefined) {
    return { ...asked, stall: { kind: "unreachable", from: request.fromAddr, url: request.url } };
  }
  if (request.state !== "redeemed") return asked;
  if (input.removed === true) return { done: 3, stall: { kind: "revoked" } };
  if (hello) return { done: 5 };
  if (!connectedSince(state, request)) {
    // Took its key and isn't connected: said once that has lasted, rather than spinning on
    // "starting up" for ever (the onboarding audit, Part 2, item 9).
    const seen = input.state;
    const away =
      seen !== undefined && !seen.connected && nowMs - Date.parse(seen.since) >= SILENT_AFTER_MS;
    return away ? { done: 3, stall: { kind: "unstarted" } } : { done: 3 };
  }
  const quiet = nowMs - Date.parse(state.since) >= SILENT_AFTER_MS;
  return quiet ? { done: 4, stall: { kind: "silent" } } : { done: 4 };
}

/** What a stall says, and the one thing to do about it. */
export function stallWords(stall: JoinStall, name = "It"): { says: string; doing: string } {
  switch (stall.kind) {
    case "expired":
      return { says: "The link expired before it was used.", doing: "Make a new link" };
    case "denied":
      return { says: "Somebody said no, or the link was withdrawn.", doing: "Make a new link" };
    case "unreachable":
      // A running server is asked nothing by `chips up`; `--reach` is what changes it (the
      // onboarding audit, item 32).
      return {
        says: `${name} asked from ${stall.from}, but Chips can't be reached from there at ${stall.url}.`,
        doing:
          "On the computer Chips runs on, run chips up --reach lan to let this Wi-Fi in, or chips up --reach tailnet for Tailscale",
      };
    case "revoked":
      return {
        says: `${name} was removed, so the key it holds is no good.`,
        doing: "Make a new link",
      };
    case "unstarted":
      return {
        says: `${name} took its key but isn't connected.`,
        doing:
          "Check it on the computer it runs on: its bridge may have stopped, and its log says why",
      };
    case "silent":
      // There is no checklist to open from here (item 32). A harness of one's own has no hello
      // of its own: it speaks when it first sends a message.
      return {
        says: `${name} connected but hasn't said anything yet.`,
        doing:
          "Check on its computer that it's running and signed in. A harness of your own speaks when it first sends a message",
      };
  }
}

/**
 * The request a person is asked about next: the oldest one waiting that a requester started and
 * this device has not shown yet. Somebody who may not decide a harness's or a device's is asked
 * only about the links they handed out (ADR 0232), which are all the server tells them of.
 */
export function nextJoinAsk(
  joins: ReadonlyMap<string, JoinRequest> | undefined,
  shown: ReadonlySet<string>,
  mayDecide: boolean,
): JoinRequest | undefined {
  // A link's request is held only by the person it is asked of (ADR 0232), whatever their role.
  return [...(joins?.values() ?? [])]
    .filter((each) => mayDecide || isLinkKind(each.kind))
    .filter((each) => each.state === "waiting" && each.startedBy === "requester")
    .filter((each) => !shown.has(each.requestId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

/**
 * What a link is sent with, from the phone's share sheet to the computer the harness runs on: the
 * link, how long it lasts, and the two ways to use it. Nothing in it is a secret beyond the link,
 * which is good once.
 */
export function joinShareText(link: string, minutes = 15): string {
  return [
    `Connect a harness to my Chips with this link. It works once, for ${minutes} minutes:`,
    "",
    link,
    "",
    'In code: join({ link }) from @chipschat/harness. In a shell: eval "$(chips join <link>)".',
  ].join("\n");
}

/**
 * What a request says once it is decided, on the phone's sheet and the desktop's dialog alike
 * (ADR 0271): a tick and who joined, or that it was allowed and is on its way, or that it was
 * refused or ran out. `name` is how the request names itself; `pairedAs`, whom a device was paired
 * as when an owner chose somebody else (ADR 0206).
 */
export function decidedWords(
  request: JoinRequest,
  name: string,
  pairedAs?: string,
): { readonly ok: boolean; readonly title: string; readonly line: string } {
  switch (request.state) {
    case "redeemed":
      if (request.kind === "invite") {
        return { ok: true, title: `${name} joined`, line: "They're in People now." };
      }
      if (request.kind === "device" || request.kind === "pairing") {
        return pairedAs === undefined
          ? { ok: true, title: `${name} is paired`, line: "It opens on your Spaces." }
          : { ok: true, title: `${name} is paired`, line: `It opens on ${pairedAs}'s Spaces.` };
      }
      return { ok: true, title: `${name} joined`, line: "Its space is on your Spaces." };
    case "allowed":
      return {
        ok: true,
        title: "Allowed",
        line:
          request.kind === "invite"
            ? `${name} is on the way in.`
            : `${name} is collecting its key.`,
      };
    case "denied":
      return { ok: false, title: "Not allowed", line: "Somebody said no." };
    case "expired":
      return { ok: false, title: "It expired", line: "It can ask again." };
    default:
      return { ok: false, title: "Waiting", line: "" };
  }
}

/**
 * What the allow sheet says around a request, on the phone's sheet and the desktop's dialog alike
 * (ADR 0271): the labels over its parts, the note under them, and its two buttons.
 */
export const ALLOW_WORDS = {
  asksTo: "It asks to",
  pairAs: "Pair it as",
  agentsNote: "Every agent can talk in the spaces it's in, and asks you before anything risky.",
  codeLabel: "The code on the device",
  codePlaceholder: "ABC-234",
  allow: "Allow",
  deny: "Don't allow",
} as const;

/** How a request is named on its sheet: its own name, or what kind of thing it is. */
export function askingName(request: JoinRequest): string {
  return request.name ?? (request.kind === "device" ? "A device" : "A harness");
}

/** The sheet's title for a request that asks by itself: "Tide wants to join", "iPad wants to pair". */
export function askingTitle(request: JoinRequest, name: string): string {
  return `${name} wants to ${request.kind === "device" ? "pair" : "join"}`;
}

/** The line under the code: a device's is typed from its screen, a harness's compared. */
export function codeWords(name: string, typed: boolean): string {
  return typed ? `Type the code ${name} shows.` : `Check it matches the code ${name} printed.`;
}
