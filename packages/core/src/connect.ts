/**
 * Connect a harness (ADR 0122, ADR 0171, ADR 0190), in the words the phone and the desktop share:
 * the gallery's two ways the app carries, a card's tag, face and head, what to copy for each, which
 * harnesses are here already, the three steps the phone follows a link through, the minutes a link
 * has left, and what the arrival says once the harness has said hello.
 *
 * The desktop's dialog keeps the card's five steps (`JOIN_STEPS`); the phone folds them into three
 * (`connectSteps`), each read from the same card (`joinCardState`).
 */

import {
  type Connector,
  fillLink,
  JOIN_LINK_SECONDS,
  joinLink,
  parseJoinLink,
} from "@chipschat/protocol";
import { harnessModelAgent } from "./agentModel.js";
import { type Directory, nameOf } from "./events.js";
import { type JoinCard, type JoinRequest, joinCardState, saidHello } from "./join.js";
import type { WorkspaceModel } from "./model/types.js";

/** The two ways in the app ships with, beside the docs' cards. */
export type ConnectWay = "own" | "http";

/** A card the gallery shows: one of the two ways, or a connector the docs list (ADR 0171). */
export type ConnectChoice = ConnectWay | Connector;

/**
 * A way's face: a mark on one of the grounds (ADR 0064). A docs card has no face of its own: it
 * wears the one its harness will, its name's (ADR 0190, addendum of 18 October 2026).
 */
export interface CardFace {
  readonly icon: string;
  readonly ground: number;
}

export const CONNECT_WAYS: Readonly<
  Record<ConnectWay, { name: string; sub: string; kind: string; face: CardFace }>
> = {
  own: {
    name: "Your own harness",
    sub: "@chipschat/harness, about ten lines",
    kind: "Write code",
    face: { icon: "wafer", ground: 26 },
  },
  http: {
    name: "Anything with HTTP",
    sub: "A key and a curl line",
    kind: "Advanced",
    face: { icon: "plug", ground: 19 },
  },
};

/** The ways, in the order the gallery lists them under the docs' cards. */
export const CONNECT_WAY_ORDER: readonly ConnectWay[] = ["own", "http"];

/**
 * The tag beside a docs card's name: what bringing it in asks of you, in the words the connect
 * page then uses ("Ask OpenClaw to do it", "Run a line yourself"), so the tag says itself.
 */
export function kindWords(card: Connector): { words: string; one: boolean } {
  if (card.sentence !== undefined) return { words: "Ask it", one: true };
  switch (card.kind) {
    case "one-line":
      return { words: "Run a line", one: true };
    case "sdk":
      return { words: "Write code", one: false };
    case "http":
      return { words: "HTTP", one: false };
    case "guide":
      return { words: "Guide", one: false };
  }
}

/** What the gallery says under its title, as the phone has said it since ADR 0190. */
export const GALLERY_LEDE =
  "Pick what runs your agents. You run one line on that computer, and it shows up here.";

/**
 * The heading over the two ways the app carries: "Or" only after the docs' cards. A server told no
 * docs, and the demo, have none.
 */
export function ownWayHeading(cards: number): string {
  return cards === 0 ? "Build your own" : "Or build your own";
}

/** A docs card's line for a harness here already: picking it offers another, or a new agent. */
export function connectedHereLine(press: "Tap" | "Click"): string {
  return `Connected here. ${press} for another, or a new agent.`;
}

/** A choice's name: the card's, or the way's. */
export function choiceName(choice: ConnectChoice): string {
  return typeof choice === "string" ? CONNECT_WAYS[choice].name : choice.name;
}

/** A choice's key, to tell two apart: the card's id, or the way. */
export function choiceKey(choice: ConnectChoice): string {
  return typeof choice === "string" ? choice : choice.id;
}

/**
 * The harnesses in this workspace, by name, so the gallery's card for one says it is connected:
 * it offered Hermes as new with Hermes already here (the setup audit, 17 October 2026, M4). A card
 * stays a way in, for a second one.
 */
export function connectedNames(directory: Directory): ReadonlySet<string> {
  return new Set(
    Object.values(directory)
      .filter((each) => each.kind === "harness" && each.removedAt === undefined)
      .map((each) => each.displayName.toLowerCase()),
  );
}

/** The harness here by a card's name, for the card that says it is connected (ADR 0190, point 1). */
export function harnessNamed(directory: Directory, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.values(directory).find(
    (each) =>
      each.kind === "harness" &&
      each.removedAt === undefined &&
      each.displayName.toLowerCase() === wanted,
  )?.id;
}

/**
 * A card for a harness here already asks before it makes a link (ADR 0190, point 1): a second link
 * makes a second harness beside this one, which is for another computer, and the one here is put
 * right from its page. New agent is for whoever may ask it for one (`mayAskFromPage`).
 */
export function hereAlreadyWords(
  name: string,
  mayAsk: boolean,
): { note: string; newAgent: string; another: string } {
  const newAgent = mayAsk ? " A new agent of it starts in a space of its own." : "";
  return {
    note: `${name} is connected here already.${newAgent} Another ${name} is for another computer. If this one has stopped, its page says why.`,
    newAgent: `New ${name} agent`,
    another: `Connect another ${name}`,
  };
}

/**
 * The connect page's head: whose face, what it is called, and the line under it, which says what to
 * do with what the page shows and where it goes ("please be more clear in the instructions", Arjun,
 * 18 October 2026). A line to run says Run in Terminal on its own box (`RUN_IN_TERMINAL`), so the
 * line under the name says only where (ADR 0257). A docs card's face is none, so it is drawn by its name,
 * as the harness it brings is on the arrival, the shelf and every list after: the face picked is
 * the face that arrives (ADR 0190, addendum of 18 October 2026).
 */
export function connectHead(
  choice: ConnectChoice,
  asking: boolean,
): { name: string; face: CardFace | undefined; title: string; sub: string } {
  if (typeof choice !== "string") {
    return {
      name: choice.name,
      face: undefined,
      title: `Connect ${choice.name}`,
      sub: CARD_SAYS[cardSays(choice, asking)](choice.name),
    };
  }
  return {
    name: CONNECT_WAYS[choice].name,
    face: CONNECT_WAYS[choice].face,
    title: `Connect ${choice === "own" ? "your own harness" : "anything with HTTP"}`,
    sub:
      choice === "own"
        ? "Add this to your harness's code, where it starts."
        : "It answers with a key. Give that key to your harness.",
  };
}

/**
 * What a card's box holds: its sentence while asking, else its line (Chips's installer before it,
 * for a card whose bridge comes from npm), else the link alone.
 */
function cardSays(card: Connector, asking: boolean): "sentence" | "install" | "command" | "link" {
  if (asking && card.sentence !== undefined) return "sentence";
  if (fetchesBridge(card)) return "install";
  return card.command !== undefined ? "command" : "link";
}

/** What to do with each, said under the card's name. */
const CARD_SAYS: Readonly<
  Record<"sentence" | "install" | "command" | "link", (name: string) => string>
> = {
  sentence: (name) => `Paste this into your chat with ${name}, wherever you talk to it.`,
  install: (name) =>
    `This goes on the computer where ${name} runs, and installs Chips there if it needs to.`,
  command: (name) => `This goes on the computer where ${name} runs.`,
  link: (name) => `Give ${name} this link, on the computer where it runs.`,
};

/**
 * Over every line a person runs themselves, on its box (Arjun, 1 November 2026: "whenever we are
 * asking user to run a command in terminal, we should say 'run in terminal'"; ADR 0257).
 */
export const RUN_IN_TERMINAL = "Run in Terminal";

/**
 * Whether what a choice's box holds is a line to run in a terminal: a card's line, or the curl for
 * anything with HTTP. Not a sentence to say, a link to hand over, or code for a harness's source.
 */
export function runsInTerminal(choice: ConnectChoice, asking: boolean): boolean {
  if (typeof choice === "string") return choice === "http";
  const says = cardSays(choice, asking);
  return says === "install" || says === "command";
}

/** Where `curl … | sh` fetches Chips's installer (ADR 0119). */
export const INSTALL_URL = "https://chipschat.ai/install";

/** A card whose line is `chips connect <id> '{link}'`: its bridge comes from npm (ADR 0218). */
export function fetchesBridge(
  choice: ConnectChoice,
): choice is Connector & { readonly command: string; readonly package: string } {
  return (
    typeof choice !== "string" &&
    choice.kind === "one-line" &&
    choice.package !== undefined &&
    choice.command?.startsWith("chips connect ") === true
  );
}

/**
 * A bridge's card, run on another computer: Chips's installer, which installs Chips there when it
 * isn't, then connects the card's harness (ADR 0218, decision 10). The link goes in
 * `CHIPS_JOIN_LINK`, which the installer hands on to `chips connect`, never among the words, where
 * anybody else on that computer could read it with `ps` and redeem it first (SEC-50).
 */
export function installLine(card: Connector, link: string): string {
  return `curl -fsSL ${INSTALL_URL} | ${joinLinkIs(link)} sh -s -- connect ${card.id}`;
}

/** Under the installer's line: the card's own, for a computer that has Chips already. */
export function alreadyThere(
  card: Connector,
  link: string,
): {
  readonly before: string;
  readonly code: string;
  readonly after: string;
} {
  return {
    before: "If Chips is already on that computer, ",
    code: `${joinLinkIs(link)} chips connect ${card.id}`,
    after: " does the same thing.",
  };
}

/** The link as the shell sets it for one command, quoted so that nothing in it is a word of its own. */
const joinLinkIs = (link: string) => `CHIPS_JOIN_LINK='${link.replaceAll("'", "'\\''")}'`;

/**
 * The note under what the page shows: how long its link lasts, and what else it needs. A card whose
 * bridge `chips connect` fetches from npm (ADR 0218) can't be run anywhere until that bridge is
 * published; the note says so.
 */
export function connectNote(choice: ConnectChoice, link?: string): string {
  const once = [
    `The link in it works once, for ${JOIN_LINK_SECONDS / 60} minutes.`,
    ...(link === undefined ? [] : [linkReach(link)]),
  ].join(" ");
  if (choice === "own") return `${once} Your harness trades it for a key of its own, and keeps it.`;
  if (choice === "http") {
    return `It answers with your harness's id, its key and its space, to call Chips with. ${once}`;
  }
  // What has to be on that computer first, as On this Mac says it (the new-person sweep's
  // finding 3): the card's `needs`, on every card, not only the Mac's.
  const needed = choice.needs === undefined ? once : `${once} That computer needs ${choice.needs}.`;
  if (choice.published !== false) return needed;
  return choice.package === undefined
    ? `${needed} Not published yet: that computer needs its own copy of ${choice.name}'s connector.`
    : `${needed} Not published yet: \`chips connect\` fetches ${choice.name}'s bridge from npm, where it isn't yet.`;
}

const LOOPBACK_LINK = /^https?:\/\/(?:127\.\d+\.\d+\.\d+|localhost|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

/**
 * Where a join link can be used from (the new-person sweep's finding 3). It names Chips at its own
 * address, so a computer that can't reach that address can't take it up, and nothing in the
 * card would ever say why. On this computer's own address, it works only here.
 */
export function linkReach(link: string): string {
  if (LOOPBACK_LINK.test(link)) {
    return "It works only on the computer Chips runs on, so run it there.";
  }
  const origin = /^https?:\/\/[^/?#]+/.exec(link)?.[0] ?? link;
  return `That computer has to reach Chips at ${origin}: on the same network, on its tailnet, or at an address it can reach.`;
}

/** On the phone, before the note: how what is copied there reaches the computer it goes on. */
export const HANDOFF_NOTE = "With Handoff, Copy puts it on your Mac's clipboard too.";

/** What the card shows to copy: the sentence while asking, else the line, else the link alone. */
export function sayOf(
  card: Connector,
  link: string,
  asking: boolean,
): { kind: "sentence" | "command" | "link"; text: string; testId: string } {
  switch (cardSays(card, asking)) {
    case "sentence":
      return {
        kind: "sentence",
        text: fillLink(card.sentence ?? "", link),
        testId: "join-sentence",
      };
    case "install":
      return { kind: "command", text: installLine(card, link), testId: "join-command" };
    case "command":
      return { kind: "command", text: fillLink(card.command ?? "", link), testId: "join-command" };
    case "link":
      return { kind: "link", text: link, testId: "join-card-link" };
  }
}

/** What to run for a harness on the SDK: `join()` with the link, then `connect()`. */
export function sdkLines(link: string): string {
  return [
    `import { connect, join } from "@chipschat/harness";`,
    "",
    "// Asks once with the link, then keeps its key.",
    `const me = await join({ link: "${link}", name: "My agent" });`,
    "const chips = await connect(me);",
  ].join("\n");
}

/** The same from a shell, for a harness in any language: the four lines, into its environment. */
export function shellLine(link: string): string {
  return `eval "$(chips join ${link})"`;
}

/** Anything with HTTP: trade the link for a key in one call. */
export function curlRedeem(link: string): string {
  const parsed = parseJoinLink(link);
  if (parsed === undefined) return link;
  const body = JSON.stringify({ secret: parsed.secret, name: "My agent" });
  return `curl -s -X POST "${parsed.url}/v1/join/redeem" -H "Content-Type: application/json" -d '${body}'`;
}

/**
 * What the phone's connect page copies for a choice: a card's line (or its sentence while asking),
 * the code for your own harness, or the curl line.
 */
export function copyOf(choice: ConnectChoice, link: string, asking: boolean): string {
  if (typeof choice !== "string") return sayOf(choice, link, asking).text;
  return choice === "own" ? sdkLines(link) : curlRedeem(link);
}

/** The minutes and seconds a link has left, as a clock reads: "14:52", and "0:00" once it is out. */
export function linkLeft(request: Pick<JoinRequest, "expiresAt">, nowMs: number): string {
  const left = Math.max(0, Math.ceil((Date.parse(request.expiresAt) - nowMs) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** How much of a link's time is left, from one when it is made to nought when it is out. */
export function linkShare(request: Pick<JoinRequest, "expiresAt">, nowMs: number): number {
  const left = (Date.parse(request.expiresAt) - nowMs) / 1000;
  return Math.min(1, Math.max(0, left / JOIN_LINK_SECONDS));
}

/** A request's card as it stands, from what the client holds: the desktop's and the phone's. */
export function joinCardOf(
  request: JoinRequest,
  model: Pick<WorkspaceModel, "spaces">,
  directory: Directory,
  nowMs: number,
): JoinCard {
  const harness = request.harnessId === undefined ? undefined : directory[request.harnessId];
  return joinCardState({
    request,
    state: harness?.state,
    removed: harness?.removedAt !== undefined,
    hello: saidHello(model, directory, request),
    nowMs,
  });
}

/** One of the phone's three steps: done, under way, or still to come. */
export interface ConnectStep {
  readonly key: "link" | "connects" | "hello";
  readonly label: string;
  readonly detail: string;
  readonly state: "done" | "now" | "later";
}

/**
 * The card's five steps folded into three for the phone (ADR 0190): the link is ready; the harness
 * connects (waiting, asking and being allowed are this one step for a link a person made); it says
 * hello. While the link waits, the second step counts its minutes down. A stalled card holds its
 * step where it stopped, with nothing under way.
 */
export function connectSteps(
  request: JoinRequest,
  card: JoinCard,
  name: string,
  nowMs: number,
): ConnectStep[] {
  const stalled = card.stall !== undefined;
  const connected = card.done >= 4;
  const hello = card.done >= 5;
  return [
    {
      key: "link",
      label: "Link ready",
      detail: `Works once, for ${JOIN_LINK_SECONDS / 60} minutes`,
      state: "done",
    },
    {
      key: "connects",
      label: `${name} connects`,
      detail: connectsDetail(request, connected, stalled, nowMs),
      state: connected ? "done" : stalled ? "later" : "now",
    },
    {
      key: "hello",
      label: "Says hello",
      detail: hello ? `${name} is here` : "Its Main agent joins Chips",
      state: hello ? "done" : connected && !stalled ? "now" : "later",
    },
  ];
}

/**
 * The three steps while the link is still being made: the first under way, the others to come. The
 * phone draws them from the page's first frame, so the page is as tall as it will be before the
 * link comes back, and the sheet glides to it once rather than chasing each piece as it arrives.
 */
export function makingSteps(name: string): ConnectStep[] {
  return [
    {
      key: "link",
      label: "Making a link",
      detail: `Works once, for ${JOIN_LINK_SECONDS / 60} minutes`,
      state: "now",
    },
    { key: "connects", label: `${name} connects`, detail: "When it uses the link", state: "later" },
    { key: "hello", label: "Says hello", detail: "Its Main agent joins Chips", state: "later" },
  ];
}

/**
 * A link of the shape the server will make (its address, `/j/` and a 192-bit secret), to hold the
 * line's place on the page while the real one is made: the same length, so it wraps alike.
 */
export function linkStandIn(serverUrl: string | undefined): string {
  return joinLink(serverUrl || "http://127.0.0.1:4431", `chips_j_${"x".repeat(32)}`);
}

/**
 * Cancel link, while a link waits to be used (Arjun, 18 October 2026: "do we have a way to cancel
 * connect your own harness?"): withdrawn, its harness can no longer use it. Put away, a link is
 * still followed; this is how to say it is not wanted. The phone's and the desktop's words.
 */
export const CANCEL_LINK = {
  label: "Cancel link",
  failed: "Chips could not cancel it. The link works until its minutes run out.",
} as const;

/** The line under "connects": where it is, where it took its key, or the minutes it has left. */
function connectsDetail(
  request: JoinRequest,
  connected: boolean,
  stalled: boolean,
  nowMs: number,
): string {
  const from = request.machine ?? request.fromAddr;
  if (connected) return from === undefined ? "Connected" : `From ${from}`;
  if (request.state === "redeemed") {
    return from === undefined ? "Took its key, starting up" : `Took its key on ${from}`;
  }
  return stalled ? "Not connected" : `Waiting… ${linkLeft(request, nowMs)} left`;
}

/** The name a link's harness goes by on the page: its own once it has named itself, else the card's. */
export function connectingName(request: JoinRequest | undefined, choice: ConnectChoice): string {
  if (request?.name !== undefined && request.name !== "") return request.name;
  return typeof choice === "string" ? "Your harness" : choice.name;
}

/** What the arrival says (ADR 0190): who is here, from where, and its Main agent, to say hello to. */
export function arrivalWords(
  request: JoinRequest,
  directory: Directory,
): { title: string; line: string; harnessId?: string; mainAgentId?: string; roomId?: string } {
  const harnessId = request.harnessId;
  const name =
    harnessId === undefined ? (request.name ?? "Your harness") : nameOf(directory, harnessId);
  const main = harnessId === undefined ? undefined : harnessModelAgent(directory, harnessId);
  const mainName = main === undefined ? undefined : nameOf(directory, main);
  const from = request.machine ?? request.fromAddr;
  const connected = from === undefined ? "Connected." : `Connected from ${from}.`;
  const waiting =
    mainName === undefined
      ? "It is waiting in its space."
      : mainName === name
        ? "Its Main agent is waiting in its space."
        : `Its Main agent, ${mainName}, is waiting in its space.`;
  return {
    title: `${name} is here`,
    line: `${connected} ${waiting}`,
    ...(harnessId === undefined ? {} : { harnessId }),
    ...(main === undefined ? {} : { mainAgentId: main }),
    ...(request.spaceId === undefined ? {} : { roomId: request.spaceId }),
  };
}

/**
 * Whether a link this device made is still being waited on: made, not out of time, not stopped,
 * and not yet answered by a hello. The shelf's last tile waits while it is (ADR 0190, point 2).
 */
export function linkWaiting(card: JoinCard | undefined): boolean {
  return card !== undefined && card.stall === undefined && card.done < 5;
}

/**
 * Where a bridge's card runs (ADR 0218, phase 5): Chips for Mac, which carries `chips`, runs its
 * line itself on this Mac; anywhere else gets the installer's line, to paste where it runs.
 */
/**
 * A link a card made that waits to be used, as the shelf's last tile counts it down (ADR 0190,
 * point 2; on the desktop since ADR 0271): its minutes left, the share of its time left, and
 * whether its harness has taken its key. Nothing once the harness is here or the link has stopped.
 */
export interface WaitingLink {
  readonly left: string;
  readonly share: number;
  readonly taken: boolean;
}

export function waitingLink(
  request: JoinRequest | undefined,
  card: JoinCard | undefined,
  nowMs: number,
): WaitingLink | undefined {
  if (request === undefined || !linkWaiting(card)) return undefined;
  return {
    left: linkLeft(request, nowMs),
    share: linkShare(request, nowMs),
    taken: request.state === "redeemed",
  };
}

/** The shelf's last tile: Connect a harness, or the link it waits on. */
export function connectTileWords(waiting: WaitingLink | undefined): {
  readonly name: string;
  readonly line: string;
  readonly label: string;
} {
  if (waiting === undefined) {
    return { name: "Connect", line: "a harness", label: "Connect a harness" };
  }
  if (waiting.taken) {
    return { name: "Connecting", line: "One moment…", label: "Connect a harness, connecting" };
  }
  return {
    name: "Waiting",
    line: waiting.left,
    label: `Connect a harness, waiting, ${waiting.left} left`,
  };
}

export const CONNECT_WHERE = { here: "On this Mac", another: "On another computer" } as const;
export type ConnectWhere = keyof typeof CONNECT_WHERE;

/**
 * Over each place's steps, so they read as what will happen rather than rows to pick (Arjun,
 * 1 November 2026: "the list with circles feels like I should tap it"; ADR 0257).
 */
export const STEPS_LABEL: Readonly<Record<ConnectWhere, string>> = {
  here: "What Connect does",
  another: "What happens",
};

/** On this Mac, before Connect is pressed: what it does. */
export function hereSentence(name: string): string {
  return `${name} runs on this Mac, so Chips can connect it for you. It gets the ${name} bridge and keeps it running after you log in.`;
}

/** Connect, while it runs, and once it has stopped somewhere. */
export function hereButton(name: string, state: "ready" | "running" | "stopped"): string {
  if (state === "running") return "Connecting…";
  return state === "stopped" ? "Try again" : `Connect ${name}`;
}

/** Under Connect: what has to be on this Mac first (the card's `needs`), and whether it is out yet. */
export function hereNote(card: Connector): string {
  const needs = `You need ${card.needs ?? `${card.name} on this Mac`}.`;
  return card.published === false
    ? `${needs} Not published yet: Chips fetches ${card.name}'s bridge from npm, where it isn't yet.`
    : needs;
}

/** Under Try again: a bridge stops before it uses the link, so the same link runs again. */
export function stillWorks(request: Pick<JoinRequest, "expiresAt">, nowMs: number): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(request.expiresAt) - nowMs) / 60_000));
  return minutes === 1
    ? "The link still works for another minute."
    : `The link still works for another ${minutes} minutes.`;
}

/** Under Try again, once the link can't be used: another is made before it runs. */
export const LINK_REMADE = "Its link has run out, so Try again makes a new one.";

/** A line `chips connect <id> --json` printed (ADR 0218): a step, and what was said of it. */
export interface HereLine {
  readonly step: string;
  readonly [said: string]: unknown;
}

/** One line of `chips connect --json`, or nothing for a line that is not a step. */
export function hereLine(text: string): HereLine | undefined {
  try {
    const line = JSON.parse(text) as unknown;
    return typeof line === "object" && line !== null && typeof (line as HereLine).step === "string"
      ? (line as HereLine)
      : undefined;
  } catch {
    return undefined;
  }
}

export type HereStepKey = "bridge" | "check" | "join" | "keep";

/** One of the four steps of Connect on this Mac. */
export interface HereStep {
  readonly key: HereStepKey;
  readonly label: string;
  readonly detail: string;
  readonly state: "done" | "now" | "later" | "stopped";
}

/**
 * Where it stopped: the bridge's own sentence, what to do, a line to copy when it gives one, and
 * whether that line is run in a terminal, which its box then says (ADR 0257).
 */
export interface HereStop {
  readonly says: string;
  readonly doing?: string | undefined;
  readonly copy?: string | undefined;
  readonly run: boolean;
}

export interface HereRun {
  readonly steps: readonly HereStep[];
  readonly stop?: HereStop | undefined;
  /** Joined and kept: `chips connect` said it was connected. */
  readonly connected: boolean;
}

const HERE_KEYS: readonly HereStepKey[] = ["bridge", "check", "join", "keep"];

/** Which of the four each line is about. */
const HERE_STEP_OF: Readonly<Record<string, number>> = {
  downloading: 0,
  checking: 1,
  checked: 1,
  joining: 2,
  keeping: 3,
};

/** Each step's words: its name, and under it, while it waits, while it runs, and once done. */
function hereWords(
  name: string,
): Record<HereStepKey, { label: string; later: string; now: string; done: string }> {
  return {
    bridge: {
      label: `Getting the ${name} bridge`,
      later: "From npm",
      now: "Looking it up on npm",
      done: "From npm",
    },
    check: {
      label: `Checking ${name}`,
      later: `That ${name} answers, on this Mac`,
      now: `Looking for ${name}`,
      done: `${name} answers`,
    },
    join: {
      label: "Joining Chips",
      later: "With a link that works once",
      now: "Trading the link for a key",
      done: `${name} has a key of its own`,
    },
    keep: {
      label: "Keeping it running",
      later: "So it is back after a restart",
      now: "Adding it to your login items",
      done: "It starts again when you log in",
    },
  };
}

/** Kilobytes as Finder counts them: "640 KB". */
function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString("en-US")} KB`;
}

const textOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

/** What a line says of its step while it runs, and once it is done. */
function saidOf(line: HereLine): { now?: string | undefined; done?: string | undefined } {
  if (line.step === "downloading") {
    const release = `${String(line["package"])} ${String(line["version"])}`;
    const received = line["received"];
    if (typeof received !== "number") return { done: release };
    const total = line["total"];
    const of = typeof total === "number" && total > 0 ? ` of ${kb(total)}` : "";
    return { now: `Downloading, ${kb(received)}${of}`, done: release };
  }
  if (line.step === "checked") return { done: textOf(line["detail"]) };
  return { now: textOf(line["detail"]) };
}

/** A bridge's sentence without its last words for a terminal: the dialog says the link is good. */
function sentenceOf(line: HereLine): string {
  const sentence = textOf(line["sentence"]) ?? "It stopped.";
  return sentence.replace(/\s*The link is still good\b[\s\S]*$/, "") || sentence;
}

/**
 * A setting, `NAME=value`, which goes in a file rather than being run: Hermes's
 * `API_SERVER_ENABLED=true`, for its `.env`. Every other line a bridge gives to copy is a command.
 */
const SETTING = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;

function stopOf(line: HereLine): HereStop {
  const copy = textOf(line["copy"]);
  return {
    says: textOf(line["says"]) ?? sentenceOf(line),
    doing: textOf(line["doing"]),
    copy,
    run: copy !== undefined && !SETTING.test(copy.trim()),
  };
}

type HereSaid = Partial<Record<HereStepKey, { now?: string; done?: string }>>;

/** A step's own words, the newest of each kept. */
function heard(said: HereSaid, key: HereStepKey, line: HereLine): void {
  const { now, done } = saidOf(line);
  said[key] = {
    ...said[key],
    ...(now === undefined ? {} : { now }),
    ...(done === undefined ? {} : { done }),
  };
}

/** What the lines so far say: how far they reached, each step's own words, and how it ended. */
function readLines(lines: readonly HereLine[]) {
  let reached = -1;
  let failed: HereLine | undefined;
  let connected = false;
  const said: HereSaid = {};
  for (const line of lines) {
    if (line.step === "connected") connected = true;
    if (line.step === "failed") failed = line;
    const at = HERE_STEP_OF[line.step];
    const key = at === undefined ? undefined : HERE_KEYS[at];
    if (at === undefined || key === undefined) continue;
    reached = Math.max(reached, at);
    heard(said, key, line);
  }
  return { reached, failed, connected, said };
}

function stateOf(
  index: number,
  read: ReturnType<typeof readLines>,
  running: boolean,
): HereStep["state"] {
  const at = Math.max(read.reached, 0);
  if (read.connected || index < read.reached) return "done";
  if (index === at && read.failed !== undefined) return "stopped";
  return index === at && running ? "now" : "later";
}

/**
 * The four steps of Connect on this Mac from what `chips connect --json` has printed so far: each
 * done once a later one starts, the furthest under way while it runs, or stopped where it failed,
 * in the bridge's words where it gave some. Before anything runs all four wait, greyed, so the
 * dialog is its full height from its first frame (ADR 0190).
 */
export function hereSteps(name: string, lines: readonly HereLine[], running: boolean): HereRun {
  const words = hereWords(name);
  const read = readLines(lines);
  const steps = HERE_KEYS.map((key, index): HereStep => {
    const state = stateOf(index, read, running);
    const own = read.said[key];
    const detail =
      state === "done"
        ? (own?.done ?? words[key].done)
        : state === "now"
          ? (own?.now ?? words[key].now)
          : state === "stopped"
            ? (textOf(read.failed?.["detail"]) ?? own?.now ?? "It stopped here")
            : words[key].later;
    return { key, label: words[key].label, detail, state };
  });
  return {
    steps,
    ...(read.failed === undefined || read.connected ? {} : { stop: stopOf(read.failed) }),
    connected: read.connected,
  };
}
