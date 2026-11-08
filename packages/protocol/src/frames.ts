/**
 * The WebSocket frames of Appendix B. Frames are the envelope around events on `/v1/ws`:
 * they carry the handshake, subscription, acknowledgement and liveness that the event
 * vocabulary itself does not.
 *
 * One endpoint serves people and harnesses (decision 5). Every client-originated `event` frame
 * carries an idempotency key and is answered with `ack {key, seq}`, which is what makes a
 * reconnect safe: replaying a frame the server already applied changes nothing.
 */

import { z } from "zod";
import { windowChangeFrame, windowCompactFrame } from "./agent-context-windows.js";
import { heartbeatChangeFrame } from "./agent-heartbeats.js";
import { modelChangeFrame } from "./agent-models.js";
import { contextBudget } from "./context.js";
import { contextEditFrame } from "./context-files.js";
import { PROTOCOL_VERSION } from "./envelope.js";
import { jobChangeFrame } from "./harness-jobs.js";
import { joinRequestView } from "./join.js";
import { autonomyLevel, id, isoTimestamp } from "./primitives.js";
import { heldRun } from "./project.js";
import { readFrame } from "./read-marks.js";

/** The client's half of the handshake. The server answers with a `hello` event. */
/**
 * The names a client may give in its `hello`'s `accepts`, and what each brings. Any other name is
 * taken and ignored: a client built for a newer server says what it understands, and an older
 * server, which sends none of it, still answers the hello (ADR 0211, Phase 3). Until then a name
 * the server did not know refused the whole hello, which would have cut every new app off from
 * every older server.
 */
export const SERVER_EXTENSIONS = [
  "events",
  "presence",
  "restart",
  "join",
  "context",
  "models",
  "heartbeats",
  "context_windows",
  "jobs",
  "folders",
  "folder_runs",
  "reads",
] as const;
export type ServerExtension = (typeof SERVER_EXTENSIONS)[number];

/**
 * What a server keeps of what a person's client may send beyond the base set, as its `hello` says
 * in `server.takes` (ADR 0281, addendum of 8 November 2026). A field a server doesn't know is
 * dropped in silence, so a client offers a person only what the server says it keeps. `held_yes`
 * is a yes that holds on: `for_minutes` and `until_stopped` on `approval.resolved`.
 */
export const HELD_YES = "held_yes";
export const SERVER_TAKES = [HELD_YES] as const;
export type ServerTake = (typeof SERVER_TAKES)[number];

export const clientHelloFrame = z
  .object({
    frame: z.literal("hello"),
    protocol: z
      .object({
        min: z.int().positive().describe("Oldest major version the client accepts."),
        max: z.int().positive().describe("Newest major version the client speaks."),
      })
      .describe("The client's range. The server picks the highest version both sides support."),
    client: z
      .object({
        name: z.string().min(1).max(120).describe("The harness or app name."),
        version: z.string().min(1).max(60),
      })
      .describe("Who is connecting, for the connection list and for support."),
    harnesses: z
      .array(
        z.object({
          harness_id: id("harness"),
          autonomy: autonomyLevel.optional().describe("The level the harness believes it has."),
        }),
      )
      .max(64)
      .optional()
      .describe(
        "Not read by Chips: a connection is its token's, and the server's `hello` names the token's harness and its agents (ADR 0087). Absent for a person's client.",
      ),
    since: z
      .int()
      .nonnegative()
      .optional()
      .describe("Not read by Chips: a stream resumes from `subscribe`'s `since`."),
    accepts: z
      .array(z.string().min(1).max(40))
      .max(32)
      .optional()
      .describe(
        "Server frames beyond the base set this client understands, by the names in `SERVER_EXTENSIONS`. A name the server does not know is ignored rather than refused, so a client may name a frame a newer server sends and still be answered by an older one (ADR 0211, Phase 3). A client that says `events` is sent its replay in pages rather than one frame per event; one that says `presence` is sent an agent's state as it changes (ADR 0083); a harness's socket that says `restart` is sent `restart` when a person asks it to restart (ADR 0094); an owner's or admin's that says `join` is sent each join request as it changes (ADR 0122); a harness's that says `context` is sent `context.edit` when a person changes one of its context files (ADR 0134); a harness's that says `models` is sent `model.change` when a person changes an agent's model or effort (ADR 0140); a harness's that says `heartbeats` is sent `heartbeat.change` when a person switches an agent's heartbeat or changes how often it beats (ADR 0143); a harness's that says `context_windows` is sent `context_window.compact` and `context_window.change` when a person asks an agent to compact now or changes the limit it compacts itself at (ADR 0146); a harness's that says `jobs` is sent `job.change` when a person switches one of the jobs it runs on its own (ADR 0252); a person's that says `folders` is sent `folder.open` when they ask, from another of their devices, for a room's folder to be opened in Finder (ADR 0225), and `folder.run` when they ask for its project to be run or stopped there (ADR 0226); a person's that says `folder_runs` is sent `folder.run_state` when their Mac says how a run of theirs stands (ADR 0226); a person's that says `reads` is sent `read` when they read further on another of their devices (ADR 0262); one that says nothing is sent what it was always sent, since an unknown frame is dropped in silence.",
      ),
    context: contextBudget
      .optional()
      .describe(
        "How much of a room a harness is handed with each message for it (ADR 0088): 40 lines and 16,000 characters when absent, 200 and 32,000 at most. For this connection. A person's client is handed none.",
      ),
  })
  .describe("The first frame a client sends.");

export const subscribeFrame = z
  .object({
    frame: z.literal("subscribe"),
    workspace_id: id("workspace"),
    space_ids: z
      .array(id("space"))
      .max(200)
      .optional()
      .describe("Narrow to these spaces. Absent means the whole workspace."),
    since: z
      .int()
      .nonnegative()
      .optional()
      .describe("Replay from this `seq` before streaming live."),
  })
  .describe("Ask for a stream. Subscriptions are keyed by workspace and space.");

export const eventFrame = z
  .object({
    frame: z.literal("event"),
    /** Validated against the catalogue, not here: the frame layer only routes. */
    event: z.record(z.string(), z.unknown()).describe("Any Agent Connect event."),
  })
  .describe("Carries one event in either direction.");

export const eventsFrame = z
  .object({
    frame: z.literal("events"),
    events: z
      .array(z.record(z.string(), z.unknown()))
      .max(500)
      .describe("A page of events, in `seq` order. One store page, as the replay reads them."),
  })
  .describe(
    "A page of a replay, for a client that asked for them in `hello`. Live events are always single `event` frames.",
  );

export const ackFrame = z
  .object({
    frame: z.literal("ack"),
    idempotency_key: z
      .string()
      .min(1)
      .max(200)
      .describe("The key from the frame being acknowledged."),
    seq: z.int().positive().describe("The sequence number the event was appended at."),
    duplicate: z
      .boolean()
      .default(false)
      .describe("True when this key had already been applied, so nothing changed."),
    lane: z
      .object({
        lane_id: z.string().min(1).max(120),
        run_id: z.string().min(1).max(120).describe("The specialist's run, which the lane is."),
        space_id: z.string().min(1).max(120).describe("The lane's home."),
      })
      .optional()
      .describe(
        "For a `task` that opened a lane: where it lives and which run it is, so a lead that drives the lane itself — a subagent, a Space handed down to — knows where to post. Absent when the task was flattened into a step.",
      ),
    held: z
      .literal(true)
      .optional()
      .describe(
        "The message is in the room, but Chips held it from the agents it named (ADR 0097): the agents have sent each other `exchange.allowance` messages since a person last acted, or a person paused them. Tell the model, so it stops and says what is done and what is blocked rather than waiting on them.",
      ),
    exchange: z
      .object({
        count: z.int().nonnegative(),
        allowance: z.int().positive().optional(),
      })
      .optional()
      .describe(
        "With `held`: the messages between agents since the reset, and the workspace's hold (ADR 0187), absent when it holds them only on a pause.",
      ),
  })
  .describe("The server's answer to a client-originated event.");

export const receiptFrame = z
  .object({
    frame: z.literal("receipt"),
    idempotency_key: z.string().min(1).max(200),
    disposition: z
      .enum(["queued", "steered"])
      .describe("What Chips did with a message sent mid-run."),
  })
  .describe("Tells a sender whether their mid-run message was queued or steered.");

/**
 * What Chips knows now of a harness (ADR 0083): whether a socket of it is open, and any trouble it
 * reported. State, not history: chipsd keeps it in memory and writes none of it to the log.
 */
export const agentState = z
  .object({
    connected: z
      .boolean()
      .describe(
        "Whether a socket of it is open. Offline only after 15 seconds without one, so a reconnect never flashes.",
      ),
    since: isoTimestamp.describe("When it connected, or when it went offline."),
    trouble: z
      .object({
        reason: z.string().min(1).max(200).describe("What it said is wrong, in one line."),
        since: isoTimestamp.describe("When it first said so."),
      })
      .optional()
      .describe(
        "What the harness says is wrong on its side (`PUT /v1/harnesses/:id/status`). Gone when it says it is fine, or when it goes offline.",
      ),
    restarting: z
      .object({
        since: isoTimestamp.describe("When a person asked."),
        by: id("person").describe("Who asked."),
      })
      .optional()
      .describe(
        "A person asked it to restart (`POST /v1/harnesses/:id/restart`, ADR 0094). Gone at its next word, a socket that opens or a status it reports, or three minutes after the ask.",
      ),
  })
  .describe("Whether an agent can answer: connected, not in trouble, and not restarting.");
export type AgentState = z.infer<typeof agentState>;

export const presenceFrame = z
  .object({
    frame: z.literal("presence"),
    participant_id: id("harness"),
    state: agentState,
  })
  .describe(
    "An agent's state changed (ADR 0083). Sent to a person's socket that said `presence` in its `hello`.",
  );

export const restartFrame = z
  .object({
    frame: z.literal("restart"),
    asked_by: id("person").describe("The person who asked."),
    asked_at: isoTimestamp.describe("When they asked."),
  })
  .describe(
    "A person asks the harness to restart (ADR 0094). Sent to a harness's socket that said `restart` in its `hello`, now or never: it is not in the log, so a reconnect never hears it again. What runs is the harness's own restart.",
  );

export const folderOpenFrame = z
  .object({
    frame: z.literal("folder.open"),
    space_id: id("space").describe("The room whose folder, or page, to open."),
    what: z
      .enum(["folder", "page"])
      .optional()
      .describe(
        "`page`: open the room's start page, or its one document, in Chips for Mac (ADR 0227). Left out, the folder in Finder.",
      ),
    asked_from: z.string().min(1).max(120).describe("The name of the device that asked: `iPhone`."),
    asked_at: isoTimestamp.describe("When they asked."),
  })
  .describe(
    "A person asks their own Mac to open a room's folder in Finder (ADR 0225), or its page in Chips for Mac (ADR 0227), from another of their devices. Sent to that person's sockets that said `folders` in their `hello`, now or never: it is not in the log. The Mac finds the folder and the page itself: nothing here is a path.",
  );
export type FolderOpenFrame = z.infer<typeof folderOpenFrame>;

export const folderRunFrame = z
  .object({
    frame: z.literal("folder.run"),
    space_id: id("space").describe("The room whose project to run, or stop."),
    op: z.enum(["run", "stop"]),
    command: z
      .string()
      .min(1)
      .max(1100)
      .optional()
      .describe(
        "For `run`, what the asking device showed would run: the Mac runs nothing else, and says so when its folder's run file says something different.",
      ),
    asked_from: z.string().min(1).max(120).describe("The name of the device that asked: `iPhone`."),
    asked_at: isoTimestamp.describe("When they asked."),
  })
  .describe(
    "A person asks their own Mac to run a room's project as its run file says, or to stop it (ADR 0226), from another of their devices. Sent to that person's sockets that said `folders` in their `hello`, now or never: it is not in the log. Nothing here is a command: the Mac reads it from the room's folder.",
  );
export type FolderRunFrame = z.infer<typeof folderRunFrame>;

export const folderRunStateFrame = z
  .object({
    frame: z.literal("folder.run_state"),
    space_id: id("space"),
    run: heldRun,
  })
  .describe(
    "How a person's run of a room's project on their Mac stands (ADR 0226), as that Mac said it. Sent to that person's sockets that said `folder_runs` in their `hello`, never to anyone else's, now or never: `GET /v1/spaces/:id/project/run` reads it again.",
  );
export type FolderRunStateFrame = z.infer<typeof folderRunStateFrame>;

export const joinFrame = z
  .object({
    frame: z.literal("join"),
    request: joinRequestView,
  })
  .describe(
    "A join request is waiting, or changed (ADR 0122): asked, allowed, refused, expired or redeemed. Sent to an owner's or admin's socket that said `join` in its `hello`, now or never; `GET /v1/join` reads what is waiting after a reconnect.",
  );

export const pingFrame = z
  .object({
    frame: z.literal("ping"),
    ts: z
      .int()
      .nonnegative()
      .describe("Sender's clock, in milliseconds, for a round-trip estimate."),
  })
  .describe("Heartbeat. Every twenty seconds; a silent socket is closed at sixty.");

export const pongFrame = z
  .object({ frame: z.literal("pong"), ts: z.int().nonnegative() })
  .describe("The answer to a ping, echoing its timestamp.");

/** Error codes are a closed set so a client can branch on them without parsing prose. */
export const errorCode = z.enum([
  "protocol_unsupported",
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid_event",
  "invalid_frame",
  "rate_limited",
  "payload_too_large",
  "too_far_behind",
  "budget_exhausted",
  "stale_file",
  "stale_context",
  "internal",
]);
export type ErrorCode = z.infer<typeof errorCode>;

export const errorFrame = z
  .object({
    frame: z.literal("error"),
    code: errorCode,
    message: z.string().min(1).max(2000).describe("What went wrong, in the product voice."),
    idempotency_key: z
      .string()
      .max(200)
      .optional()
      .describe("The frame at fault, when there was one."),
    retry_after_seconds: z.int().nonnegative().optional().describe("When rate limited."),
    refusal: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe(
        "Which rule refused the event, for a client that offers a way on: `agent_elsewhere`, `lead_room`, `agent_archived`, `room_closed` (ADR 0087), `agent_deleted` (ADR 0095).",
      ),
    space_id: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("For `agent_elsewhere`: the room the agent is in, where Move takes it from."),
  })
  .describe("Something went wrong. `too_far_behind` means resume with `since`.");

export const clientFrame = z
  .discriminatedUnion("frame", [clientHelloFrame, subscribeFrame, eventFrame, pingFrame, pongFrame])
  .describe("Anything a client may send.");
export type ClientFrame = z.infer<typeof clientFrame>;

export const serverFrame = z
  .discriminatedUnion("frame", [
    eventFrame,
    eventsFrame,
    ackFrame,
    receiptFrame,
    presenceFrame,
    restartFrame,
    joinFrame,
    folderOpenFrame,
    folderRunFrame,
    folderRunStateFrame,
    readFrame,
    contextEditFrame,
    modelChangeFrame,
    heartbeatChangeFrame,
    windowCompactFrame,
    windowChangeFrame,
    jobChangeFrame,
    pingFrame,
    pongFrame,
    errorFrame,
  ])
  .describe("Anything the server may send.");
export type ServerFrame = z.infer<typeof serverFrame>;

export const FRAME_NAMES = [
  "hello",
  "subscribe",
  "event",
  "events",
  "ack",
  "receipt",
  "presence",
  "restart",
  "join",
  "folder.open",
  "folder.run",
  "folder.run_state",
  "read",
  "context.edit",
  "model.change",
  "heartbeat.change",
  "context_window.compact",
  "context_window.change",
  "job.change",
  "ping",
  "pong",
  "error",
] as const;

/**
 * Pick the version both sides speak, or nothing when the ranges do not overlap.
 * `hello` negotiates `{min, max}` (decision 7).
 */
export function negotiateProtocol(
  client: { min: number; max: number },
  server: { min: number; max: number } = { min: PROTOCOL_VERSION, max: PROTOCOL_VERSION },
): number | undefined {
  const highest = Math.min(client.max, server.max);
  const lowest = Math.max(client.min, server.min);
  return highest >= lowest ? highest : undefined;
}
