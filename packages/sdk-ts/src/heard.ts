/**
 * Words said in a room while one of a harness's agents works there, not to it (ADR 0105,
 * ADR 0106). Chips names the turns that are to hear them in `message.overheard`'s
 * `working_turns`; a bridge hands each the line below at its next step, never starting a turn on
 * it, and says `run.heard(message_id)` once the turn has it. A turn that ends first hears nothing,
 * and is handed the words with its agent's next turn (ADR 0105).
 */

import { type MessageOverheard, withRole } from "@chipschat/protocol";

/** One turn that is to hear a message: its agent and its run. */
export interface WorkingTurn {
  readonly agentId: string;
  readonly runId: string;
}

/** The turns `message.overheard` names to hear it, or none. */
export function workingTurnsOf(message: Pick<MessageOverheard, "working_turns">): WorkingTurn[] {
  return (message.working_turns ?? []).map((turn) => ({
    agentId: turn.agent_id,
    runId: turn.run_id,
  }));
}

/**
 * The line a working turn is handed: who said it, a person with their standing, and what, its
 * words, what a voice note said and its files by name. "Duncan (guest) said in the room, not to
 * you: …", as Jacobian tells its turns.
 */
export function overheardLine(
  message: Pick<MessageOverheard, "from" | "text" | "attachments">,
): string {
  const files = message.attachments ?? [];
  const said = files.flatMap((file) => (file.transcript === undefined ? [] : [file.transcript]));
  const words = [
    message.text.trim(),
    ...said.map((each) => `(voice note: ${each})`),
    files.length === 0 ? "" : `(sent ${files.map((file) => file.filename).join(", ")})`,
  ].filter((part) => part !== "");
  const who = withRole(message.from.display_name, message.from);
  return `${who} said in the room, not to you: ${words.join(" ")}`;
}
