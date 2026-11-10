/**
 * The owner's relay switch, as the client holds it (ADR 0211, Phase 4): whether the server dials
 * its relay, and every device of the workspace with its way in, which is who would be cut off.
 * The wire's shape, the client's, the lists the Relay page draws, and the words it says them in.
 */

import { FIRST_PERSON_NAME, inviteFromLink } from "@chipschat/protocol";
import { agoWords, clockOf } from "./agents.js";
import { deviceKind } from "./deviceKind.js";
import { type Directory, nameOf } from "./events.js";
import { tailnetOf } from "./wayWords.js";

/** The way a socket came: the port, the tunnel door on the network, or the relay. */
export type SocketWay = "socket" | "lan" | "relay";

interface RelayDeviceView {
  readonly device_id: string;
  readonly participant_id: string;
  readonly name: string;
  readonly now: SocketWay | null;
  readonly last_via: SocketWay | null;
  readonly last_via_at: string | null;
  readonly direct_at: string | null;
}

/**
 * Why a server with its relay on isn't connected to it, as the server kept it: the relay turned it
 * away as `busy` (as many servers from its internet address as it lists), or for not being on the
 * list it serves, or for another reason (`refused`); or the server couldn't reach the relay.
 */
export type RelayTrouble = "busy" | "not_allowed" | "refused" | "unreachable";

/** The switch as the server says it (`/v1/relay`). */
export interface RelayView {
  readonly configured: boolean;
  /** The relay it dials when on (ADR 0245). Absent from a server older than the field. */
  readonly url?: string | undefined;
  readonly on: boolean;
  /** Whether the server is connected to it now, and why not. Absent from an older server. */
  readonly status?: "off" | "connecting" | "connected" | undefined;
  readonly why?: RelayTrouble | null | undefined;
  readonly set_by: string | null;
  readonly set_at: string | null;
  readonly devices: readonly RelayDeviceView[];
  readonly kept_link: string | null;
}

export interface RelayDevice {
  readonly deviceId: string;
  readonly participantId: string;
  readonly name: string;
  /** The way its socket goes now; nothing when it has none. */
  readonly now: SocketWay | undefined;
  /** The way its newest socket came, and when; nothing before the server kept it. */
  readonly lastVia: SocketWay | undefined;
  readonly lastViaAt: string | undefined;
  /** When it last came other than through the relay; never, when nothing. */
  readonly directAt: string | undefined;
}

export interface RelayFacts {
  /** Whether the server has a relay set up at all. */
  readonly configured: boolean;
  /** Which relay, on or off: its own, or Chips's (ADR 0245). Unknown to an older server. */
  readonly url?: string | undefined;
  readonly on: boolean;
  /** Whether the server is connected to the relay now; unknown to an older server. */
  readonly status?: "off" | "connecting" | "connected" | undefined;
  /** Why it isn't, while it is on and isn't, once a try has failed. */
  readonly why?: RelayTrouble | undefined;
  readonly setBy: string | undefined;
  readonly setAt: string | undefined;
  readonly devices: readonly RelayDevice[];
  /** The Tailscale share link kept for the next guest (Phase 3). */
  readonly keptLink: string | undefined;
}

export function relayFactsOf(view: RelayView): RelayFacts {
  return {
    configured: view.configured,
    ...(view.url === undefined ? {} : { url: view.url }),
    on: view.on,
    ...(view.status === undefined ? {} : { status: view.status }),
    ...(view.why === undefined || view.why === null ? {} : { why: view.why }),
    setBy: view.set_by ?? undefined,
    setAt: view.set_at ?? undefined,
    devices: view.devices.map((device) => ({
      deviceId: device.device_id,
      participantId: device.participant_id,
      name: device.name,
      now: device.now ?? undefined,
      lastVia: device.last_via ?? undefined,
      lastViaAt: device.last_via_at ?? undefined,
      directAt: device.direct_at ?? undefined,
    })),
    keptLink: view.kept_link ?? undefined,
  };
}

/** The Relay page's three lists: through the relay now, direct now, and not connected. */
export function relayLists(all: readonly RelayDevice[]) {
  // A terminal's `chips` asks its server directly and never keeps a connection open, so it is in
  // no list here: it read "not seen yet" beside You's "Seen 2m ago" (the onboarding audit, item 34).
  const devices = all.filter((device) => deviceKind(device.name) !== "terminal");
  return {
    relayed: devices.filter((device) => device.now === "relay"),
    direct: devices.filter((device) => device.now !== undefined && device.now !== "relay"),
    away: devices.filter((device) => device.now === undefined),
  };
}

/** Who the switch would cut off: the devices whose newest socket came through the relay. */
export function wouldLose(devices: readonly RelayDevice[]): readonly RelayDevice[] {
  return devices.filter((device) => device.lastVia === "relay");
}

/** The device reading the list, and what it calls itself there ("This phone", "This computer"). */
export interface HereDevice {
  readonly deviceId: string;
  readonly word: string;
}

/**
 * A device's name in a list, with whose it is when it is somebody else's, and the reader's own
 * as itself: an owner turning the relay off from a phone on it sees that phone among the lost.
 */
export function deviceLabel(
  device: RelayDevice,
  directory: Directory,
  selfId: string,
  here?: HereDevice,
): string {
  if (here !== undefined && device.deviceId === here.deviceId) return here.word;
  return device.participantId === selfId
    ? device.name
    : `${device.name} · ${nameOf(directory, device.participantId)}`;
}

/** What a device on the relay, or away, says beside its name: when it was last direct. */
export function directSince(device: RelayDevice, now: number = Date.now()): string {
  if (device.directAt === undefined) return "never direct";
  return `direct ${agoWords(now - Date.parse(device.directAt))} ago`;
}

/** What a device with no socket says: the way it came last, and how long ago. */
export function lastWay(device: RelayDevice, now: number = Date.now()): string {
  if (device.lastVia === undefined || device.lastViaAt === undefined) return "not seen yet";
  const ago = agoWords(now - Date.parse(device.lastViaAt));
  return device.lastVia === "relay" ? `relay, ${ago} ago` : `direct, ${ago} ago`;
}

/** Where a server off the relay is still reached, in a phrase. */
function onlyWhere(serverUrl: string | undefined): string {
  return tailnetOf(serverUrl) === undefined ? "only on its own network" : "only over Tailscale";
}

/** Under the switch: what the relay does, and what off means. */
export function relayFoot(relayHost: string, machine: string, serverUrl: string | undefined) {
  return `${relayHost} carries sealed traffic for devices that can't reach ${machine} directly. With it off, Chips is reachable ${onlyWhere(serverUrl)}.`;
}

/** The relay Chips runs, the one whose day counts Chips keeps (ADR 0208). */
const HOSTED_RELAY_HOST = "relay.chipschat.ai";

/** The docs page that says what that relay counts, and that the server and apps send nothing. */
export const WHAT_CHIPS_COUNTS = "https://chipschat.ai/operate/what-chips-counts/";

/**
 * The foot as phone and web draw it. Chips's own relay adds that it counts each day, and links the
 * page that says what. Another relay's counts are its runner's, so its foot says nothing of them.
 * The shape is `LinkedWords`, which the phone's `LinkedFoot` draws; named here, context.ts would
 * be a cycle.
 */
export function relayFootWords(
  relayHost: string,
  machine: string,
  serverUrl: string | undefined,
): { readonly before: string; readonly link?: string } {
  const foot = relayFoot(relayHost, machine, serverUrl);
  if (relayHost !== HOSTED_RELAY_HOST) return { before: foot };
  return {
    before: `${foot} Each day the relay writes down how many servers and connections it carried. `,
    link: "What Chips counts ›",
  };
}

const TROUBLE_WORDS: Readonly<Record<RelayTrouble, string>> = {
  busy: "the relay already lists as many servers from your internet address as it takes",
  not_allowed: "the relay serves a list of servers, and this one isn't on it",
  refused: "the relay turned the server away",
  unreachable: "the server can't reach the relay",
};

/**
 * Under the switch, while it is on and the server isn't connected to the relay: why, as the
 * server kept it. The switch alone read On while phones said the server was asleep (the new-person
 * sweep's finding 12). Nothing while it is connected, off, or still making its first try.
 */
export function relayNotConnectedWords(
  facts: Pick<RelayFacts, "on" | "status" | "why">,
): string | undefined {
  if (!facts.on || facts.status === "connected" || facts.why === undefined) return undefined;
  return `On, but not connected: ${TROUBLE_WORDS[facts.why]}.`;
}

/** The turn-off sheet's lead: how many devices would lose the server. */
export function turnOffLead(losing: number): string {
  if (losing === 0) return "Every device reached Chips directly last time. None would lose it.";
  return losing === 1
    ? "One device last reached Chips through the relay. It would lose its connection until it goes direct."
    : `${losing} devices last reached Chips through the relay. They would lose their connection until they go direct.`;
}

/** Under the list on the turn-off sheet: links, and the telling. */
export function turnOffNote(serverUrl: string | undefined): string {
  const where =
    tailnetOf(serverUrl) === undefined ? "on the server's own network" : "on your tailnet";
  return `New invite and pairing links will open only ${where}. Devices on the relay now are told why before it goes.`;
}

/** After asking: how many people were asked to go direct. */
export function askedWords(asked: number): string {
  if (asked === 0) return "Nobody to ask: nobody else came through the relay last.";
  return asked === 1 ? "Asked 1 person to go direct" : `Asked ${asked} people to go direct`;
}

/**
 * Who turned the relay, as the reader says it: "You" for themselves, else their name, and "An
 * owner" for one still under the name the server first gave them (JR-17).
 */
export function turnedBy(by: string, directory: Directory, selfId: string): string {
  if (by === selfId) return "You";
  const name = nameOf(directory, by);
  return name === FIRST_PERSON_NAME ? "An owner" : name;
}

/**
 * Why a device cannot connect while an owner has the relay off: who turned it off and when, and
 * where the server is still reached.
 */
export function relayOffWords(
  who: string,
  at: string,
  machine: string,
  serverUrl: string | undefined,
  now: number = Date.now(),
): string {
  return `${who} turned the relay off at ${clockOf(at, now)}, so Chips reaches ${machine} ${onlyWhere(serverUrl)} now. What you send waits here and goes once it is connected.`;
}

/**
 * Whether an invite link opens from anywhere: the relay's page carries the relay (ADR 0207). A
 * link without one is the server's own address, made while the relay is off or never turned on
 * (ADR 0245), and opens only where that address does. The link itself says, so the sheet needn't
 * know how the switch stands.
 */
export function inviteOpensAnywhere(url: string): boolean {
  return inviteFromLink(url)?.relay !== undefined;
}

const LOOPBACK = /^https?:\/\/(?:127\.\d+\.\d+\.\d+|localhost|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

/** On an invite sheet for a link that doesn't open from anywhere: where it does. */
export function inviteRelayOffWords(url: string | undefined): string {
  const where =
    url !== undefined && LOOPBACK.test(url)
      ? "on the computer Chips runs on"
      : tailnetOf(url) === undefined
        ? "on the server's own network"
        : "on your tailnet";
  return `The relay is off, so this link opens only ${where}.`;
}

/** Beside that note, for an owner: what makes a link that opens from anywhere. */
export const INVITE_TURN_ON_RELAY = "Turn on the relay";

/**
 * Asked before the phone card turns the relay on itself (the onboarding audit, Part 2, item 35):
 * what it then does, and where it is turned off. It used to open You, then Relay, and leave the
 * switch to be found there.
 */
export function relayTurnOnAsk(machine: string | undefined): {
  readonly says: string;
  readonly yes: string;
  readonly busy: string;
} {
  const there = machine ?? "this computer";
  return {
    says: `The relay carries sealed traffic for devices that can't reach ${there} directly, so your phone reaches Chips from anywhere. You can turn it off in You, then Relay.`,
    yes: "Turn it on",
    busy: "Turning it on…",
  };
}

/**
 * On an invite sheet for a link that opens from anywhere: it asks (ADR 0232). Whoever opens it
 * waits for the person who made it, and the Allow comes up on that person's devices with Chips
 * open, so the maker learns it here rather than when somebody is left waiting.
 */
export const INVITE_ASKS_WORDS =
  "When somebody opens it, you'll be asked to allow them wherever you have Chips open.";
