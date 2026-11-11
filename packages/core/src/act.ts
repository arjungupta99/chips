/**
 * What the composer's line asks the store to do, and what to say when it cannot be done. A
 * message is sent; a command needs a run that can take it — going, and paused or not as the
 * command expects — or it is answered with a notice rather than a refusal from the server.
 * Pure over the store's interface, so the shell stays a wiring diagram.
 */

import { handleMap } from "@chipschat/protocol";
import type { Attachment } from "./attachments.js";
import type { Command } from "./commands.js";
import type { Directory, Participant } from "./events.js";
import type { Aim, MessageRoute, Run, Space } from "./model/index.js";
import { aimedAt, takesFeedback, wireTo } from "./model/index.js";
import { mayRemove, whyNotAdd } from "./rooms.js";
import type { Store } from "./store.js";

export interface ActContext {
  readonly store: Store;
  readonly spaceId: string;
  readonly run: Run | undefined;
  /** The space itself and the names around it, for the commands that change the room (M3.3). */
  readonly space: Space;
  readonly directory: Directory;
  /** Where a message would go, so a pinned visit travels with it and a gone one stops it. */
  readonly route?: MessageRoute | undefined;
  /** Where the capsule over the field aims a message, in a room of harnesses (ADR 0081). */
  readonly aim?: Aim | undefined;
  /** The line the message replies to, from the strip over the field (ADR 0219). */
  readonly replyTo?: string | undefined;
}

const ENDED = new Set(["done", "failed", "cancelled"]);

/** The visit a message names, when the person pinned one and it is still there (ADR 0040). */
function pinnedVisit(route: MessageRoute | undefined): { sessionRef?: string } {
  if (route?.how !== "live" && route?.how !== "resume") return {};
  return route.pinned ? { sessionRef: route.session.sessionRef } : {};
}

type SpaceCommand = Extract<
  Command,
  { kind: "title" } | { kind: "close" } | { kind: "reopen" } | { kind: "add" } | { kind: "remove" }
>;
const SPACE_COMMANDS: ReadonlySet<Command["kind"]> = new Set([
  "title",
  "close",
  "reopen",
  "add",
  "remove",
]);

function isSpaceCommand(command: Command): command is SpaceCommand {
  return SPACE_COMMANDS.has(command.kind);
}

/** Carry the command out, or say why not. */
export function act(
  command: Command,
  { store, spaceId, run, space, directory, route, aim, replyTo }: ActContext,
  attachments: readonly Attachment[] = [],
): string | undefined {
  if (command.kind === "message") {
    return sendMessage(
      command.text,
      { store, spaceId, run, space, directory, route, aim, replyTo },
      attachments,
    );
  }
  if (attachments.length > 0) {
    return "Files go with a message, not a command. Send them on their own line.";
  }
  if (command.kind === "unknown") {
    return `/${command.name} is not a command here. ${command.hint}`;
  }
  // Leaving needs no run: it is about the space, and a space with nothing going on is exactly
  // the one somebody wants off their list.
  if (command.kind === "leave") {
    store.leaveSpace({ spaceId });
    return undefined;
  }
  if (isSpaceCommand(command)) {
    return spaceCommand(command, { store, spaceId, run, space, directory });
  }
  // Nor does a note about the harness's last message: what it said is in the log (M3.4).
  if (command.kind === "wrong") return wrongCommand(command.text, store, spaceId, space);
  if (run === undefined || ENDED.has(run.state)) {
    return `There is no run going to ${command.kind}.`;
  }
  return runCommand(command, store, { spaceId, runId: run.runId }, run);
}

/**
 * A message, sent where it is aimed. A pinned visit this space no longer has stops it rather than
 * redirecting it (ADR 0040): an answer from the wrong terminal reads exactly like an answer from
 * the right one, so nothing is sent until the person picks again.
 */
function sendMessage(
  text: string,
  { store, spaceId, directory, route, aim, replyTo }: ActContext,
  attachments: readonly Attachment[],
): string | undefined {
  if (route?.how === "gone") {
    return "The session you pinned has gone. Pick another below, or let it go, and send again.";
  }
  const to = wireTo(aim);
  // The field's people are who it is for besides its agents (ADR 0204): drawn on the route from the
  // send, as its agents are, until Chips says.
  const aimed = aim === undefined ? undefined : aimedAt(aim, directory);
  store.send({
    spaceId,
    text,
    ...(attachments.length === 0 ? {} : { attachments }),
    ...pinnedVisit(route),
    ...(to === undefined ? {} : { to }),
    ...(aimed === undefined ? {} : { addressedTo: aimed.agents }),
    ...(aimed === undefined || aimed.people.length === 0 ? {} : { addressedPeople: aimed.people }),
    ...(replyTo === undefined ? {} : { replyTo }),
  });
  return undefined;
}

/** A change to the room: its title, whether it is open, and who is in it (M3.3). */
/** What `/title` and `/archive` say in a room whose changes are locked (ADR 0156), rather than send. */
const LOCKED = "This space's changes are locked. Unlock them in its sheet first.";

function spaceCommand(command: SpaceCommand, context: ActContext): string | undefined {
  const { store, spaceId, space } = context;
  switch (command.kind) {
    case "title":
      if (space.locked === true) return LOCKED;
      store.updateSpace({ spaceId, title: command.title });
      return undefined;
    case "close":
      if (space.state === "closed") return "This space is already archived.";
      if (space.locked === true) return LOCKED;
      store.updateSpace({ spaceId, state: "closed" });
      return undefined;
    case "reopen":
      if (space.state !== "closed") return "This space is not archived.";
      store.updateSpace({ spaceId, state: "open" });
      return undefined;
    default:
      return membershipCommand(command, context);
  }
}

/**
 * Why somebody gone from the workspace can't be added. A person may have left by deleting their
 * account (ADR 0243), so theirs says what is true either way; a harness only ever goes by removal.
 */
function goneWords(who: Participant): string {
  return who.kind === "person"
    ? `${who.displayName} is no longer in the workspace.`
    : `${who.displayName} was removed from the workspace.`;
}

function membershipCommand(
  command: Extract<SpaceCommand, { kind: "add" } | { kind: "remove" }>,
  { store, spaceId, space, directory }: ActContext,
): string | undefined {
  const who = findByName(directory, command.who);
  if (who === undefined) return `Nobody called ${command.who} is in your directory.`;
  const here = space.members.includes(who.id);
  if (command.kind === "add") {
    if (here) return `${who.displayName} is already in this space.`;
    if (who.removedAt !== undefined) return goneWords(who);
    // What the door would turn away is said here, in the room, rather than sent (ADR 0087).
    const refused = whyNotAdd(space, directory, who.id) ?? elsewhere(space, who);
    if (refused !== undefined) return refused;
    store.addMember({ spaceId, participantId: who.id, kind: who.kind });
    return undefined;
  }
  if (!here) return `${who.displayName} is not in this space.`;
  if (!mayRemove(space, directory, who.id)) {
    return `${who.displayName} is the Main agent here, and stays in its Main space.`;
  }
  store.removeMember({ spaceId, participantId: who.id });
  return undefined;
}

/** An agent that is in another room is moved, not added: said, since `/add` does not move. */
function elsewhere(space: Space, who: Participant): string | undefined {
  if (who.kind !== "agent" || typeof who.room !== "string" || who.room === space.id) {
    return undefined;
  }
  return `${who.displayName} is in another space. Move it here from this space's members.`;
}

/** `/wrong <note>`: what went wrong with the last thing a harness said here, as feedback. */
function wrongCommand(
  text: string,
  store: Store,
  spaceId: string,
  space: Space,
): string | undefined {
  const last = space.lines.findLast(takesFeedback);
  if (last === undefined) return "No harness has said anything here to be wrong about.";
  store.sendFeedback({ spaceId, lineId: last.id, kind: "correction", text });
  return undefined;
}

/** A participant by the name a person typed, matched the way a mention is (ADR 0091). */
function findByName(directory: Directory, who: string): Participant | undefined {
  const handle = who.trim().toLowerCase().replace(/\s+/g, "");
  const everyone = Object.values(directory).map((each) => ({
    id: each.id,
    displayName: each.displayName,
  }));
  const id = handleMap(everyone).get(handle);
  return id === undefined ? undefined : directory[id];
}

/** A command on the run that is going: steer it, pause or resume it, or stop it. */
function runCommand(
  command: Exclude<
    Command,
    { kind: "message" } | { kind: "unknown" } | { kind: "leave" } | { kind: "wrong" } | SpaceCommand
  >,
  store: Store,
  target: { spaceId: string; runId: string },
  run: Run,
): string | undefined {
  switch (command.kind) {
    case "steer":
      store.steerRun({ ...target, mode: command.mode, text: command.text });
      return undefined;
    case "pause":
      if (run.paused) return "The run is already paused.";
      // A Pause its harness would not hold hides work that carries on (ADR 0293).
      if (!run.pausable) return "This agent can't pause. /stop ends its work.";
      store.pauseRun(target);
      return undefined;
    case "resume":
      if (!run.paused) return "The run is not paused.";
      store.resumeRun(target);
      return undefined;
    default:
      store.stopRun({
        ...target,
        ...(command.reason === undefined ? {} : { reason: command.reason }),
      });
      return undefined;
  }
}
