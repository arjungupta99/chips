import { agoWords, clockOf } from "./agents.js";
import type { AskSeen } from "./directAsks.js";
import type { LinkKind, LinkStretch } from "./link.js";
import type { ConnectionState } from "./transport.js";

/**
 * Which way a device reaches its server, in the words both clients say it in (ADR 0211): the
 * phone's Connection page and the Connection card on You on the web and the Mac. What the way
 * means, how long a round trip takes, and since when it has gone that way.
 */

/** The way shown: through the relay, straight to the server, on its way, or not there. */
export type Way = "relay" | "direct" | "connecting" | "lost";

export function wayOf(connection: ConnectionState, link: LinkKind | undefined): Way {
  if (connection === "connecting") return "connecting";
  if (connection !== "open") return "lost";
  return link === "relay" ? "relay" : "direct";
}

/** The way at the right of You's Connection row, which opens the page that says the rest. */
export const WAY_VALUE: Readonly<Record<Way, string>> = {
  direct: "Direct",
  relay: "Relay",
  connecting: "Connecting…",
  lost: "Not connected",
};

/** The tailnet a server's address is on, `tail2f9c1e` from `….tail2f9c1e.ts.net`, or nothing. */
export function tailnetOf(serverUrl: string | undefined): string | undefined {
  if (serverUrl === undefined || serverUrl === "") return undefined;
  try {
    return /\.([a-z0-9-]+)\.ts\.net$/i.exec(new URL(serverUrl).hostname)?.[1];
  } catch {
    return undefined;
  }
}

/** How a direct way goes, as the line on the route says it. */
export function overWhat(serverUrl: string | undefined): string {
  return tailnetOf(serverUrl) === undefined ? "on its network" : "over Tailscale";
}

/** The title line for the way. */
export function wayTitle(way: Way, machine: string): string {
  switch (way) {
    case "relay":
      return "Through the relay";
    case "direct":
      return "Direct";
    case "connecting":
      return "Connecting…";
    case "lost":
      return `Can't reach ${machine}`;
  }
}

/**
 * What the way means, in a sentence or two under the round trip. `relayed` is whether there is a
 * relay to go through at all: a browser on the server's own page has none.
 */
export function wayWords(
  way: Way,
  machine: string,
  serverUrl: string | undefined,
  relayed = true,
): string {
  switch (way) {
    case "relay":
      return "Encrypted end to end. The relay passes sealed traffic along. It sees that this device connected and when, never what's said.";
    case "direct":
      return tailnetOf(serverUrl) === undefined
        ? `Straight to ${machine} on its own network, encrypted end to end. Nothing else is in the path.`
        : `Straight to ${machine} over Tailscale, encrypted end to end. Nothing else is in the path.`;
    case "connecting":
      return relayed
        ? `Finding ${machine}: on its own network first, then through the relay.`
        : `Finding ${machine} on its own network.`;
    case "lost":
      return `${relayed ? "Neither its network nor the relay answered" : "Its network did not answer"}. What you send waits here and goes once it is connected.`;
  }
}

/** A round trip, in whole milliseconds; nothing measured yet is an ellipsis. */
export function tripWords(ms: number | undefined): string {
  return ms === undefined ? "…" : `${Math.round(ms)} ms`;
}

/** The middle of a few round trips, which one slow read does not move. */
export function middleOf(trips: readonly number[]): number | undefined {
  if (trips.length === 0) return undefined;
  const sorted = [...trips].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * When the way began, by the clock: `9:43 AM` today, `Oct 18` before. The way itself is the
 * title above it, so the row says only when.
 */
export function sinceWords(since: string, now: number = Date.now()): string {
  return clockOf(since, now);
}

/** The way before, and for how long: `Relay, 2 h`, `Tailscale, briefly` under a minute. */
export function beforeWords(before: LinkStretch, serverUrl: string | undefined): string {
  const how =
    before.kind === "relay"
      ? "Relay"
      : tailnetOf(serverUrl) === undefined
        ? "Its network"
        : "Tailscale";
  const lasted = Date.parse(before.until) - Date.parse(before.since);
  return `${how}, ${lasted < 60_000 ? "briefly" : agoWords(lasted)}`;
}

/** What is said when the device has just left the relay: the time now, and what it was. */
export function wentDirectWords(now: number | undefined, was: number | undefined): string {
  if (now === undefined) return "Direct now";
  return was === undefined
    ? `Direct now · ${tripWords(now)}`
    : `Direct now · ${tripWords(now)}, was ${tripWords(was)}`;
}

/** Which device the words are said on: "this phone", or "this computer". */
export type Here = "phone" | "computer";

/** Where the way off the relay goes, in a word: Tailscale for a tailnet address, else its network. */
function awayFrom(serverUrl: string | undefined): string {
  return tailnetOf(serverUrl) === undefined ? "its network" : "Tailscale";
}

/** The Go direct row, under the route while on the relay (ADR 0211, Phase 2). */
export function goDirectWords(here: Here): string {
  return `Faster, nothing in between, and it keeps working if the relay is down. Needs Tailscale on this ${here}.`;
}

export interface GuideStep {
  readonly title: string;
  readonly words: string;
}

/** What the Go direct guide says above its steps. */
export const GUIDE_LEAD =
  "Three steps, and Chips does the rest. You can leave this open while you go to Tailscale.";

/**
 * The Go direct guide's three steps, for a server on a tailnet. The last waits on the server's
 * own address and says when it answers; Chips cannot see the first two, so they are said, not
 * ticked, until the last is done.
 */
export function guideSteps(
  machine: string,
  tailnet: string,
  here: Here,
  answered: boolean,
): readonly GuideStep[] {
  return [
    {
      title: "Get Tailscale",
      words:
        here === "phone"
          ? "On this phone, from the App Store."
          : "On this computer, from tailscale.com.",
    },
    {
      title: "Sign in with your server's account",
      words: `${machine} is in ${tailnet}. Sign in to the same one.`,
    },
    {
      title: "Turn Tailscale on",
      words: answered
        ? `${machine} answered directly. Moving over…`
        : `Waiting for ${machine} to answer directly…`,
    },
  ];
}

/** Where a step of a guide is: to do, being waited on, or done. */
export type StepState = "said" | "waiting" | "done";

export interface GuestStep extends GuideStep {
  readonly state: StepState;
}

/** Tailscale's machines, where an owner shares one. */
export const TAILSCALE_MACHINES = "https://login.tailscale.com/admin/machines";

/**
 * The Go direct row for somebody who is not an owner (ADR 0211, Phase 3): they cannot sign in to
 * the owner's Tailscale, so an owner shares the server with them first.
 */
export function askDirectWords(here: Here): string {
  return `Faster, nothing in between, and it keeps working if the relay is down. An owner shares the server with you in Tailscale on this ${here}.`;
}

/** What the guest's guide says above its steps. */
export const GUEST_GUIDE_LEAD =
  "An owner shares the server with you in Tailscale, and Chips does the rest. You can leave this open.";

/**
 * The guest's guide (ADR 0211, Phase 3): ask an owner, get Tailscale and open the invite they
 * send, turn Tailscale on. The ask is ticked when an owner has shared; the last step waits on the
 * server's own address once there is something to open, as the owner's guide does.
 */
export function guestGuideSteps(
  machine: string,
  ask: AskSeen | undefined,
  here: Here,
  answered: boolean,
  now: number = Date.now(),
): readonly GuestStep[] {
  const shared = ask !== undefined && ask.state !== "asked";
  const done = (state: StepState): StepState => (answered ? "done" : state);
  return [
    {
      title: "Ask an owner",
      words: askStepWords(machine, ask, now),
      state: done(shared ? "done" : ask === undefined ? "said" : "waiting"),
    },
    {
      title: "Get Tailscale, open the invite",
      words: shared
        ? "Open the invite, then sign in to Tailscale or make an account."
        : `On this ${here}, from ${here === "phone" ? "the App Store" : "tailscale.com"}. The invite comes with the share.`,
      state: done("said"),
    },
    {
      title: "Turn Tailscale on",
      words: answered
        ? `${machine} answered directly. Moving over…`
        : shared
          ? `Waiting for ${machine} to answer directly…`
          : `Then ${machine} answers at its own address.`,
      state: done(shared ? "waiting" : "said"),
    },
  ];
}

/** The ask's step: to make, made at a time, or shared by somebody. */
function askStepWords(machine: string, ask: AskSeen | undefined, now: number): string {
  if (ask === undefined) return `Chips asks the owners to share ${machine} with you.`;
  if (ask.state === "asked") {
    return `Asked at ${clockOf(ask.askedAt, now)}. You'll hear when it's shared.`;
  }
  return `${ask.sharer ?? "An owner"} shared it.`;
}

/** The owner's sheet for an ask: who wants to connect directly. */
export function askTitle(name: string): string {
  return `${name} wants to connect directly`;
}

/** How slow the relay is for them, when they said, under the title. */
export function askTripWords(tripMs: number | undefined): string {
  return tripMs === undefined
    ? "They go through the relay now."
    : `They go through the relay now, ${tripWords(tripMs)} a round trip.`;
}

/** How an owner makes the link, in Tailscale's own words for its buttons. */
export function shareHowWords(machine: string): string {
  return `In Tailscale's Machines, open ${machine}'s menu, then Share, Copy invite link. Paste it here.`;
}

/** What sharing gives: the one machine, but all of it. */
export function shareWarning(machine: string): string {
  return `Sharing gives them ${machine} and nothing else on your tailnet, but all of it: anything else it serves there, they can reach too, unless your Tailscale access rules limit them.`;
}

/** The tick under the link, offered once there is a link (Arjun's pick), and what it needs. */
export const KEEP_LINK_LABEL = "Give this same link to the next guest";
export const KEEP_LINK_FOOT = "Turn on Reusable link in Tailscale's Share for this.";

/** After an ask is answered: by this owner, or by another first. */
export function sharedWords(
  name: string,
  sharer: string | undefined,
  byMe: boolean,
): { readonly title: string; readonly line: string } {
  return byMe
    ? { title: `Sent to ${name}`, line: "You'll hear when they're direct." }
    : { title: "Already answered", line: `${sharer ?? "Another owner"} shared it with ${name}.` };
}

/** Under Only direct: what it does once offered, and how it comes to be offered before then. */
export function onlyDirectFoot(
  offered: boolean,
  here: Here,
  serverUrl: string | undefined,
): string {
  return offered
    ? `When it's on, this ${here} never uses the relay. Away from ${awayFrom(serverUrl)}, Chips won't connect.`
    : "Connect directly once to turn this on.";
}

/** Why a device with Only direct on is not connected, and the two ways out. */
export function onlyDirectLostWords(
  machine: string,
  here: Here,
  serverUrl: string | undefined,
): string {
  const way = tailnetOf(serverUrl) === undefined ? "Join its network" : "Turn Tailscale on";
  return `Only direct is on, so this ${here} won't use the relay, and ${machine} didn't answer at its own address. ${way}, or turn Only direct off.`;
}
