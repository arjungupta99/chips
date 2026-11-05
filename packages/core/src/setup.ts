/**
 * The first run (ADR 0170): who is walked through setup, and the card that says what is left.
 *
 * **The welcome** is for the workspace's owner, on a device that hasn't been through it, while
 * no agent has joined: it says where Chips is running, asks their name once, and offers the
 * gallery. A person invited into somebody else's workspace has their own welcome (`welcomeFor`),
 * and an owner pairing a new phone to a workspace full of agents needs none.
 *
 * **The setup card** sits at the top of Spaces on every client, for the owner, until its six steps
 * are done or it is hidden on that device. Every step is read from what the client already knows,
 * so the server keeps no "setup" state that could disagree with what is true:
 *
 * 1. Chips is running, on the machine `GET /v1/server` names.
 * 2. A computer is paired: a Mac app or a browser.
 * 3. An agent has said hello: an agent's line in any room.
 * 4. A phone is paired.
 * 5. Notifications are on, on this device.
 * 6. Chips is reachable away from home: its relay is up and switched on, or the address it hands
 *    out is a tailnet's or a public one.
 */

import { DEMO_PERSON_ID } from "./demo/device.js";
import { type DeviceKind, deviceKind } from "./devices.js";
import { type Directory, isAgent, nameOf } from "./events.js";
import type { RelayState, WorkspaceModel } from "./model/types.js";
import { type PairedDeviceRecord, type ServerFacts, serverCantPush } from "./store.js";

export type SetupStepId = "running" | "computer" | "hello" | "phone" | "notify" | "away";

export const SETUP_ORDER: readonly SetupStepId[] = [
  "running",
  "computer",
  "hello",
  "phone",
  "notify",
  "away",
];

export interface SetupStep {
  readonly id: SetupStepId;
  readonly title: string;
  /** The small words after the title: which machine, which agent, how it is reached. */
  readonly detail?: string | undefined;
  readonly done: boolean;
  /** Undone, and nothing on this device can do it, so no action is offered beside it. */
  readonly blocked?: true | undefined;
}

/** What a client knows, for the card. Anything not yet read is `undefined`, and its step waits. */
export interface SetupFacts {
  readonly server: ServerFacts | undefined;
  /**
   * What this device is, so its own row can say "This iPhone" or "This Mac". An iPad is the
   * phone's step, done, as "This iPad" (ADR 0177): it said "This iPhone" until 16 October 2026.
   * An Android phone is "android", and says "This phone": it said "This iPhone" too.
   */
  readonly here: "phone" | "android" | "ipad" | "mac" | "browser";
  /** This person's devices, from `GET /v1/devices`. */
  readonly devices: readonly PairedDeviceRecord[] | undefined;
  /** Its rooms, and the relay as an owner last turned it, heard the moment they did. */
  readonly model: Pick<WorkspaceModel, "spaces" | "relay">;
  readonly directory: Directory;
  /** Whether this device will be told when an agent needs this person. */
  readonly notifications: boolean;
}

/** The agent whose line came first, in any room: the hello the card is waiting for. */
export function firstHello(
  model: Pick<WorkspaceModel, "spaces">,
  directory: Directory,
): string | undefined {
  let first: { ts: string; name: string } | undefined;
  for (const space of model.spaces) {
    // A room's lines are in order, so its first agent's line is the only one to look at.
    const line = space.lines.find(
      (each) => each.kind === "text" && isAgent(directory, each.authorId),
    );
    if (line === undefined || (first !== undefined && line.ts >= first.ts)) continue;
    first = { ts: line.ts, name: nameOf(directory, line.authorId) };
  }
  return first?.name;
}

const TAILNET = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/;
const PRIVATE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)|^localhost$|\.local$/;

/**
 * How another device reaches Chips away from home, in a few words, or nothing when it can't. The
 * relay counts while it is up, unless an owner has just switched it off (`switched`, from
 * `relay.set`): a device hears that at once, while the server's facts are read once a minute and
 * the server lets the relay go two seconds after the switch. So "through your relay" never stands
 * beside a switch that is off (Arjun's screenshot, 1 November 2026).
 */
export function awayHow(server: ServerFacts, switched?: RelayState): string | undefined {
  if (
    server.relay.url !== undefined &&
    server.relay.status === "connected" &&
    switched?.on !== false
  ) {
    return "through your relay";
  }
  let host: string;
  let https: boolean;
  try {
    const url = new URL(server.publicUrl);
    host = url.hostname;
    https = url.protocol === "https:";
  } catch {
    return undefined;
  }
  if (TAILNET.test(host) || host.endsWith(".ts.net")) return "over Tailscale";
  if (https && !PRIVATE.test(host)) return `at ${host}`;
  return undefined;
}

const HERE_NAMES: Readonly<Record<SetupFacts["here"], string>> = {
  phone: "This iPhone",
  android: "This phone",
  ipad: "This iPad",
  mac: "This Mac",
  browser: "This browser",
};

function pairedOf(devices: readonly PairedDeviceRecord[], kinds: readonly DeviceKind[]) {
  return devices.find(
    (each) => each.revokedAt === undefined && kinds.includes(deviceKind(each.name)),
  );
}

/**
 * Notifications: this device's own, done once they are on. A phone's come from its server, and a
 * server that can't push (ADR 0244) leaves them undone however the phone is set, and says so.
 */
function notifyStep(on: boolean, pushes: ServerFacts["pushes"]): SetupStep {
  if (!serverCantPush(pushes)) return { id: "notify", title: "Notifications", done: on };
  return {
    id: "notify",
    title: "Notifications",
    detail: "your server can't send them yet",
    done: false,
    blocked: true,
  };
}

/** The six steps, each done or not, in the card's order. */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const { server, here, devices } = facts;
  const hello = firstHello(facts.model, facts.directory);
  const away = server === undefined ? undefined : awayHow(server, facts.model.relay);
  const computer = devices === undefined ? undefined : pairedOf(devices, ["computer", "browser"]);
  // A phone or an iPad: either is Chips in a hand, which is what the step is for.
  const phone = devices === undefined ? undefined : pairedOf(devices, ["phone", "tablet"]);
  const handHere = here === "phone" || here === "android" || here === "ipad";
  const computerHere = !handHere;
  return [
    {
      id: "running",
      title: "Chips is running",
      detail: server === undefined ? undefined : `on ${server.machine}`,
      done: server !== undefined,
    },
    {
      id: "computer",
      title: computerHere ? HERE_NAMES[here] : "A computer",
      detail: computerHere ? undefined : computer?.name,
      done: computerHere || computer !== undefined,
    },
    { id: "hello", title: "An agent said hello", detail: hello, done: hello !== undefined },
    {
      id: "phone",
      title: handHere ? HERE_NAMES[here] : "Your phone",
      detail: handHere ? undefined : phone?.name,
      done: handHere || phone !== undefined,
    },
    notifyStep(facts.notifications, handHere ? server?.pushes : undefined),
    { id: "away", title: "Away from home", detail: away, done: away !== undefined },
  ];
}

/**
 * How long after an owner turns the relay the server's facts say what the switch did: the server
 * dials at once when it is turned on, and lets go two seconds after it is turned off (`TELL_MS`),
 * so the setup card reads them again this long after the switch rather than a minute later.
 */
export const RELAY_SETTLE_MS = 3000;

/**
 * How long a read of the server's facts waits so that it says what the switch just did: what is
 * left of `RELAY_SETTLE_MS` since the switch turned (`relay.at`), never more, and nothing once it
 * has passed or when nobody has turned it.
 */
export function relaySettleLeft(turnedAt: string | undefined, nowMs: number): number {
  if (turnedAt === undefined) return 0;
  const left = Date.parse(turnedAt) + RELAY_SETTLE_MS - nowMs;
  return Number.isNaN(left) ? 0 : Math.min(RELAY_SETTLE_MS, Math.max(0, left));
}

/** Until the server has done what an owner's switch at `turnedAt` said: at once when it has. */
export function relaySettled(turnedAt: string | undefined, nowMs = Date.now()): Promise<void> {
  const left = relaySettleLeft(turnedAt, nowMs);
  return left === 0 ? Promise.resolve() : new Promise((done) => setTimeout(done, left));
}

export function setupDoneCount(steps: readonly SetupStep[]): number {
  return steps.filter((step) => step.done).length;
}

/**
 * Whether this person owns the workspace: the card and the welcome are an owner's. Never the
 * demo's You (ADR 0213), who owns a made-up workspace and has nothing to set up in it: no card,
 * no welcome, and none of the reads they make (`/v1/devices`, every fifteen seconds).
 */
export function ownsWorkspace(directory: Directory, selfId: string | undefined): boolean {
  if (selfId === undefined || selfId === DEMO_PERSON_ID) return false;
  return directory[selfId]?.role === "owner";
}

/** Whether any agent, or a harness that speaks for itself, has joined the workspace. */
export function hasAgents(directory: Directory): boolean {
  return Object.values(directory).some((each) => each.kind !== "person");
}

/**
 * Whether this device shows the welcome: the owner's, before any agent has joined, on a device
 * that hasn't been through it (`seen`, kept by the device).
 */
export function showsWelcome(
  directory: Directory,
  selfId: string | undefined,
  seen: boolean,
): boolean {
  return !seen && ownsWorkspace(directory, selfId) && !hasAgents(directory);
}

/**
 * Whether the card is shown: to the owner, until every step is done or it is hidden on this
 * device. While what it reads is still loading, it isn't: a card that drew "0 of 6" and then
 * ticked five at once would say something false for a second.
 */
export function showsSetupCard(
  facts: Pick<SetupFacts, "server" | "devices" | "directory">,
  selfId: string | undefined,
  steps: readonly SetupStep[],
  hidden: boolean,
): boolean {
  if (hidden || !ownsWorkspace(facts.directory, selfId)) return false;
  if (facts.server === undefined || facts.devices === undefined) return false;
  return setupDoneCount(steps) < steps.length;
}
