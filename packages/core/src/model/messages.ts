/** What is said in a room, and what is done to what was said. */

import { DEFAULT_SPEND_CEILING_USD, dollars, eventIdOfMessage } from "@chipschat/protocol";
import { actorKind } from "../events.js";
import { compactedWords } from "../tokens.js";
import { addLine, lineIndexOf, messageAudit, textLine, withFeedback } from "./lines.js";
import { claimChange } from "./project.js";
import { agentLine } from "./spaces.js";
import {
  type Building,
  countReplies,
  type FoldStep,
  field,
  type MutableSpace,
  required,
  spaceOf,
} from "./state.js";
import type { Line } from "./types.js";

/** The quiet line under what was nobody's turn, handed to the room's lead (ADR 0104). */
const LEAD_TOOK_IT = "took it as the lead: it was nobody's turn";

/**
 * A reply goes among the lines replying to its message (ADR 0219), in the order they were said, and
 * the message, when the room has it yet, says so.
 */
function noteReply(state: Building, space: MutableSpace | undefined, reply: Line, to: string) {
  const had = state.repliesTo.get(to) ?? [];
  if (had.some((each) => each.id === reply.id)) return;
  const replies = [...had, { id: reply.id, seq: reply.seq }].sort((a, b) => a.seq - b.seq);
  state.repliesTo.set(to, replies);
  markReplied(space, to, replies);
}

function forgetReply(state: Building, space: MutableSpace | undefined, reply: Line, to: string) {
  const replies = (state.repliesTo.get(to) ?? []).filter((each) => each.id !== reply.id);
  if (replies.length === 0) state.repliesTo.delete(to);
  else state.repliesTo.set(to, replies);
  markReplied(space, to, replies);
}

function markReplied(
  space: MutableSpace | undefined,
  lineId: string,
  replies: readonly { readonly id: string }[],
) {
  const index = space?.lines.findIndex((line) => line.id === lineId) ?? -1;
  const line = space?.lines[index];
  if (space === undefined || line === undefined) return;
  const { repliedBy: _had, ...rest } = line;
  space.lines[index] =
    replies.length === 0 ? rest : { ...rest, repliedBy: replies.map((each) => each.id) };
}

export const MESSAGE_FOLDS: Readonly<Record<string, FoldStep>> = {
  "message.post": (state, event) => {
    const space = spaceOf(state, event);
    const line = textLine(event, required<string>(event, "text"));
    // A thread opened from this line before it arrived here still finds it (M5.4), and so do the
    // lines replying to it (ADR 0219).
    const threadId = state.threadsByRoot.get(line.id);
    const replies = state.repliesTo.get(line.id);
    // The change to the room's project the reply carries (ADR 0222): a thread's is its room's.
    const change = field<string>(event, "change");
    addLine(space, {
      ...line,
      ...(threadId === undefined ? {} : { threadId }),
      ...(replies === undefined ? {} : { repliedBy: replies.map((each) => each.id) }),
      ...(change === undefined ? {} : { change }),
    });
    if (change !== undefined) {
      claimChange(
        space?.parentSpaceId === undefined ? space : state.spaces.get(space.parentSpaceId),
        change,
        line.id,
      );
    }
    if (line.replyTo !== undefined) noteReply(state, space, line, line.replyTo);
    if (space?.parentSpaceId !== undefined) countReplies(state, space);
    // A harness's message inside its own run: the run remembers it, so a summary that says the
    // same thing again is folded onto it rather than drawn twice (Phase 3 review, finding 9).
    const run = typeof event.run_id === "string" ? state.runs.get(event.run_id) : undefined;
    if (
      run !== undefined &&
      actorKind(event.actor) === "harness" &&
      event.actor.id === run.harnessId
    ) {
      run.saidIds.push(event.id);
    }
  },

  // A held message handed to an agent it was for, once a person acted (ADR 0097): its line says so.
  // Or what was nobody's turn, handed to the room's lead once the room went still (ADR 0104): one
  // quiet line under it, the lead's, "ASCII Art took it as the lead: it was nobody's turn".
  "message.handed": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    if (field<boolean>(event, "lead") === true) {
      agentLine(space, event, required<string>(event, "agent_id"), LEAD_TOOK_IT);
      return;
    }
    const lineId = eventIdOfMessage(required<string>(event, "message_id"));
    const index = space.lines.findIndex((line) => line.id === lineId);
    const line = space.lines[index];
    if (line !== undefined) space.lines[index] = { ...line, handed: true };
  },

  // An agent's context compacted (ADR 0146): one quiet line, the agent's, saying from how much to
  // how much, which the room may open the agent's page from.
  "context.compacted": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const from = required<number>(event, "from");
    const to = required<number>(event, "to");
    const by = field<string>(event, "by") === "asked" ? "asked" : "itself";
    agentLine(space, event, event.actor.id, compactedWords(from, to), {
      compacted: { from, to, window: required<number>(event, "window"), by },
    });
  },

  // An agent passed its turn with `NO_REPLY` (ADR 0105): nothing is drawn, but the room knows it
  // heard, so a person's message to it stops waiting on it (ADR 0083).
  "turn.passed": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    space.passed ??= new Map();
    space.passed.set(event.actor.id, event.seq);
  },

  // A turn working in the room heard the message, said for somebody else (ADR 0106): the agent
  // goes on the line's `heardBy`, once, for the room to say beneath it.
  "message.heard": (state, event) => {
    const space = spaceOf(state, event);
    const index = lineIndexOf(space, event);
    const line = space?.lines[index];
    if (space === undefined || line === undefined) return;
    const agent = event.actor.id;
    if (line.heardBy?.includes(agent) === true) return;
    space.lines[index] = { ...line, heardBy: [...(line.heardBy ?? []), agent] };
  },

  // A person pausing the agents here, or letting them carry on (ADR 0097): one line, theirs. Chips
  // pausing them at the room's spend ceiling (ADR 0118) draws none: the banner says it while it
  // lasts, and the line of whoever lets them carry on says a new job begins.
  "exchange.set": (state, event) => {
    const space = spaceOf(state, event);
    const exchange = field<string>(event, "state");
    if (space === undefined || (exchange !== "paused" && exchange !== "going")) return;
    if (actorKind(event.actor) !== "person") return;
    // Read before this event is noted: whether the pause it ends was the spend ceiling's.
    const atCeiling = space.pausedSpend !== undefined && space.pausedSeq > space.actedSeq;
    const ceiling = dollars(space.spendCeiling ?? DEFAULT_SPEND_CEILING_USD);
    const words =
      exchange === "paused"
        ? "paused the agents"
        : atCeiling
          ? `let the agents carry on. A new ${ceiling} starts now.`
          : "let the agents carry on";
    addLine(space, { ...textLine(event, words), kind: "system", exchange });
  },

  // Most of a room's job's allowance spent (ADR 0118): one quiet line, Chips's, with the figures.
  // A harness's own budget, and the pause at the ceiling, draw nothing here.
  "budget.warning": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined || field<string>(event, "scope") !== "job") return;
    if (field<number>(event, "threshold") !== 80) return;
    const budget = field<{ limit_usd: number; spent_usd: number }>(event, "budget");
    if (budget === undefined) return;
    const words = `This job has spent ${dollars(budget.spent_usd)} of the ${dollars(budget.limit_usd)} this space allows.`;
    addLine(space, { ...textLine(event, words), kind: "status" });
  },

  // The author changed the words (M5.4): the line shows the latest, marked as changed.
  "message.edited": (state, event) => {
    const space = spaceOf(state, event);
    const index = lineIndexOf(space, event);
    const line = space?.lines[index];
    if (space === undefined || line === undefined) return;
    space.lines[index] = { ...line, text: required<string>(event, "text"), editedAt: event.ts };
    state.audit.push(messageAudit(event, "edited a message"));
  },

  // Taken back (M5.4): a tombstone where the line was, its pin gone with its words.
  "message.deleted": (state, event) => {
    const space = spaceOf(state, event);
    const index = lineIndexOf(space, event);
    const line = space?.lines[index];
    if (space === undefined || line === undefined) return;
    const { attachments: _files, reactions: _thumbs, corrections: _notes, ...rest } = line;
    space.lines[index] = { ...rest, text: "", deleted: true };
    // A reply taken back is no longer one of its message's (ADR 0219).
    if (line.replyTo !== undefined) forgetReply(state, space, line, line.replyTo);
    space.pins = space.pins.filter((pin) => pin.lineId !== line.id);
    if (space.parentSpaceId !== undefined) countReplies(state, space);
    state.audit.push(messageAudit(event, "took back a message"));
  },

  // Deleted for the reader alone (ADR 0167), and Undo. Only the person who did it is sent these,
  // so whoever folds one is them; the line stays in the fold for the edits and deletions that
  // may follow, and the snapshot leaves it out. No audit entry: nobody else's business.
  "message.hidden": (state, event) => {
    if (state.selfId !== undefined && event.actor.id !== state.selfId) return;
    spaceOf(state, event)?.hidden.add(eventIdOfMessage(required<string>(event, "message_id")));
  },

  "message.shown": (state, event) => {
    if (state.selfId !== undefined && event.actor.id !== state.selfId) return;
    spaceOf(state, event)?.hidden.delete(eventIdOfMessage(required<string>(event, "message_id")));
  },

  "message.pinned": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const lineId = eventIdOfMessage(required<string>(event, "message_id"));
    if (!space.pins.some((pin) => pin.lineId === lineId)) {
      space.pins.push({ lineId, by: event.actor.id, ts: event.ts, seq: event.seq });
    }
    state.audit.push(messageAudit(event, "pinned a message"));
  },

  "message.unpinned": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const lineId = eventIdOfMessage(required<string>(event, "message_id"));
    space.pins = space.pins.filter((pin) => pin.lineId !== lineId);
    state.audit.push(messageAudit(event, "unpinned a message"));
  },

  // A reaction or a note on a harness's line (M3.4): folded onto the line it is about, and an
  // entry in the audit, since the harness hears it and may act on it.
  feedback: (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const lineId = eventIdOfMessage(required<string>(event, "message_id"));
    const index = space.lines.findIndex((line) => line.id === lineId);
    const line = space.lines[index];
    if (line === undefined) return;
    const by = field<{ participant_id: string }>(event, "from")?.participant_id ?? event.actor.id;
    space.lines[index] = withFeedback(line, event, by);
    const reaction = field<string>(event, "reaction");
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "feedback",
      who: by,
      what: reaction === undefined ? "said what went wrong with a message" : `reacted ${reaction}`,
      spaceId: event.space_id,
      runId: line.runId,
      reason: field<string>(event, "text"),
    });
  },

  // A harness read a file: a muted line in the room, and an entry in the audit (decision 10).
  "attachment.fetched": (state, event) => {
    const filename = required<string>(event, "filename");
    const by = field<string>(event, "by") ?? event.actor.id;
    addLine(spaceOf(state, event), {
      ...textLine(event, `read ${filename}`),
      kind: "system",
      authorId: by,
      authorKind: "harness",
    });
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "attachment",
      who: by,
      what: `read ${filename}`,
      spaceId: event.space_id,
    });
  },
};
