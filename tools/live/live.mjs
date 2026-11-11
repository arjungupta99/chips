#!/usr/bin/env node
/**
 * `pnpm live` — drive the running Chips server as yourself, the way the apps do, and read what
 * the rooms did. Made for acceptance runs with real agents (long jobs Phase 6, 5 October 2026):
 * post a job, build a room with a lead and several agents, set its ceiling, let its agents carry
 * on, stop a run, then read every room it touched — and what the runs really cost.
 *
 *   pnpm live rooms                              the rooms you are in: title, id, lead, agents
 *   pnpm live say <room> <words…> [--to <agent name|all>]
 *                                                post as you; @Whole Name addresses an agent, and
 *                                                --to chooses one as the composer does, with no @
 *   pnpm live new <harness[,harness…]> <words…>  a room from the +, asked of those harnesses
 *          [--agents "Name[@harness],…"]         then a new agent of each name (default: the first harness)
 *          [--ceiling <usd>]                     and the room's spend per job
 *   pnpm live empty <title…> [--agents "Name@harness,…"]
 *                                                an empty room by its name, as the + makes it with
 *                                                Empty picked (ADR 0148), then those agents asked for
 *   pnpm live agent <room> <harness> [name]      ask a harness for one more agent in a room
 *   pnpm live not-right <room> [--reasons "Wrong facts,…"] [--message <msg_ id>] <words…>
 *                                                Not right? on the newest agent message there (or
 *                                                that one), as the apps send it (ADR 0200): one
 *                                                `correction` of the reasons and the words
 *   pnpm live lead <room> <agent name|none>      who leads the room
 *   pnpm live ceiling <room> <usd|default>       what a job may spend there; prints the job's spend
 *   pnpm live spend <room>                       the job's spend against the ceiling
 *   pnpm live carry-on <room>                    "Let them carry on" under the paused banner
 *   pnpm live pause <room>                       pause the agents' talk
 *   pnpm live run-pause <room>                   pause the newest open run, as its bubble's Pause
 *                                                does (ADR 0293); `run-resume` resumes it
 *   pnpm live take-back <room> <message_id>...   take messages back for everyone (ADR 0035) and
 *                                                hide what's left of them from you (ADR 0167)
 *   pnpm live archive <room>                     archive a room, as its menu's Archive does: out
 *                                                of the list, and back with Unarchive. For a
 *                                                test's own room once the test is done
 *   pnpm live stop <room> [--follow-up] [--after <s>]
 *                                                stop the newest open run; with --follow-up, wait for
 *                                                a capped turn's follow-up and stop it <s> in (30)
 *   pnpm live wait <room> --until <what> [--timeout <s>] [--since <seq|time>]
 *                                                block until: quiet (no run open for 45 s), answer,
 *                                                ask (an approval asked), capped, paused, or run (a
 *                                                new run starts); from --since (the seq `say`
 *                                                printed) rather than from when it is called
 *   pnpm live read <room> [--since <seq|time>]   the room's lines, runs and what they reported;
 *                                                a post's files by name and id, for `file`
 *   pnpm live watch [<room>…] [--since <seq>]    stream runs, posts, spend lines and pauses
 *   pnpm live file <attachment id> <out path>    save a file posted in a room
 *   pnpm live cost --since <time> [--store <db>] what Chips was told runs cost, against a harness's own store
 *   pnpm live context <agent> [--harness] [--text]
 *                                                an agent's context files as its harness sent them
 *                                                (ADR 0134); --harness: a harness's own set
 *   pnpm live context-edit <agent> <file name> <path> [--harness] [--own]
 *                                                save a file's new text from <path> and wait for its
 *                                                harness's answer; --own: give the agent its own of a
 *                                                shared file
 *   pnpm live model <agent>                      what an agent runs on and could, as its harness said
 *                                                (ADR 0140), and what became of the last change
 *   pnpm live model-set <agent> --model <id> [--effort <id>] | --same
 *                                                change it and wait for its harness's answer: saved,
 *                                                failed or missed; --same: back to the default
 *   pnpm live heartbeat <agent>                  whether an agent's heartbeat is on, how often, the
 *                                                intervals its harness offers (ADR 0143), and the
 *                                                last change
 *   pnpm live heartbeat-set <agent> on|off [minutes]
 *                                                switch it, at one of its intervals or the one it
 *                                                has, and wait for its harness's answer
 *   pnpm live window <agent>                     how full an agent's context window is, the limit it
 *                                                compacts itself at and the limits its harness offers
 *                                                (ADR 0146), its last compaction and the last asks
 *   pnpm live window-set <agent> <percent>|off   change that limit, or only when asked, and wait for
 *                                                its harness's answer
 *   pnpm live window-compact <agent>             ask it to compact now, and follow it to the end
 *   pnpm live asks [<room>] [--since <seq|time>] [--pending]
 *                                                the approvals asked there (everywhere, without a
 *                                                room): the question, what a yes does, how long it
 *                                                holds, the preview (ADR 0142), and what became of it
 *   pnpm live decide <room> approve|deny [--approval <apr_ id>] [--reason <words>] [--scope session]
 *                                                answer the newest ask waiting there (or that one),
 *                                                as you, for this once; an ask that matters is only
 *                                                ever answered once (ADR 0195)
 *
 * A time is local unless it says otherwise: `08:45` today, `2026-10-05T08:45`, or `…Z` for UTC.
 * <room> is a room's title (exact, else the one title containing it) or its `spc_` id. Harness
 * and agent names are matched the same way.
 */

/*
 * Who it is. It signs as this machine's paired CLI device (`~/.config/chips/device.json`, or
 * `CHIPS_CONFIG_HOME`), which is a person — you — on the server that device was paired with.
 * So everything it does is yours: what it posts is said by you, and every job it starts spends
 * real money on the harnesses' accounts. It reads through the server's own API, as a person sees
 * the rooms, never the database. Only `cost` reads a file: a copy of a harness's own cost store,
 * taken with `sqlite3 .backup`, since what a turn really cost is the harness's to say.
 *
 * How to run acceptance runs with it, what each looks for, and what the first runs taught:
 * `testing/live-agents.md`.
 */

import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const environment = process.env;

// ── Who and where ────────────────────────────────────────────────────────────────────────────

function fail(words) {
  console.error(`live: ${words}`);
  process.exit(1);
}

function configHome() {
  if (environment.CHIPS_CONFIG_HOME) return environment.CHIPS_CONFIG_HOME;
  const xdg = environment.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "chips") : join(homedir(), ".config", "chips");
}

function loadDevice() {
  const path = join(configHome(), "device.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fail(`No paired CLI device at ${path}. Pair one with \`chips pair\` first.`);
  }
}

const device = loadDevice();
const key = createPrivateKey(device.privateKey);

// ── The server's API, signed as the device ───────────────────────────────────────────────────

function headers(method, target, body) {
  const timestamp = Date.now();
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const payload = [method, target, String(timestamp), digest].join("\n");
  return {
    "content-type": "application/json",
    "x-chips-device": device.deviceId,
    "x-chips-timestamp": String(timestamp),
    "x-chips-signature": sign(null, Buffer.from(payload, "utf8"), key).toString("base64"),
  };
}

async function http(method, target, body) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await fetch(`${device.serverUrl}${target}`, {
    method,
    headers: headers(method, target, raw),
    ...(raw === "" ? {} : { body: raw }),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) fail(`${method} ${target}: ${response.status} ${json?.error?.message ?? text}`);
  return json;
}

async function openSocket() {
  const { ticket } = await http("POST", "/v1/socket-tickets", {});
  const socket = new WebSocket(`${device.serverUrl.replace(/^http/, "ws")}/v1/ws?ticket=${ticket}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("the socket would not open"));
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "chips-live", version: "1" },
    }),
  );
  return socket;
}

/** Events over the socket, as the apps send them: each answered by an `ack` or an `error`. */
async function submit(list) {
  const socket = await openSocket();
  const waiting = new Map();
  socket.onmessage = (message) => {
    const frame = JSON.parse(message.data);
    const done = waiting.get(frame.idempotency_key);
    if ((frame.frame === "ack" || frame.frame === "error") && done) done(frame);
  };
  const answers = [];
  for (const each of list) {
    const event = { idempotency_key: `live-${randomBytes(8).toString("hex")}`, ...each };
    const answer = await new Promise((resolve) => {
      waiting.set(event.idempotency_key, resolve);
      socket.send(JSON.stringify({ frame: "event", event }));
      setTimeout(() => resolve({ frame: "error", message: "no answer in 15 s" }), 15_000);
    });
    if (answer.frame === "error") fail(`${event.type} refused: ${answer.message}`);
    answers.push(answer);
  }
  socket.close();
  return answers;
}

/** Every event you can see from `since` on, a page at a time; one room's with `spaceId`. */
async function eventsSince(since = 0, spaceId) {
  const all = [];
  const room = spaceId === undefined ? "" : `&space_id=${spaceId}`;
  let cursor = since;
  for (;;) {
    const page = await http("GET", `/v1/events?since=${cursor}&limit=1000${room}`);
    // The server sends an approver every room's approvals, and events of no room, beside the
    // room asked for: a room's read and its asks are its own.
    all.push(
      ...(spaceId === undefined
        ? page.events
        : page.events.filter((event) => event.space_id === spaceId)),
    );
    if (page.next_cursor === null || page.events.length === 0) return all;
    cursor = page.next_cursor;
  }
}

/** A space id the way the apps mint one, a ULID: the client's, so a retry opens the same room. */
function newSpaceId() {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = Date.now();
  let head = "";
  for (let i = 0; i < 10; i += 1) {
    head = alphabet[time % 32] + head;
    time = Math.floor(time / 32);
  }
  const tail = [...randomBytes(16)].map((byte) => alphabet[byte % 32]).join("");
  return `spc_${head}${tail}`;
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function waitFor(check, seconds, what) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const done = await check();
    if (done) return done;
    if (Date.now() > until) fail(`gave up waiting for ${what} after ${seconds} s`);
    await sleep(3);
  }
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────

let participantsCache;
async function participants({ fresh = false } = {}) {
  if (fresh || participantsCache === undefined) {
    participantsCache = (await http("GET", "/v1/participants")).participants;
  }
  return participantsCache;
}

function pick(list, wanted, nameOf, what) {
  const needle = wanted.toLowerCase();
  const exact = list.filter((each) => nameOf(each).toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  const near = list.filter((each) => nameOf(each).toLowerCase().includes(needle));
  if (near.length === 1) return near[0];
  const names = (exact.length > 1 ? exact : near).map(nameOf);
  return fail(
    names.length === 0
      ? `no ${what} called "${wanted}"`
      : `"${wanted}" could be ${names.join(", ")}`,
  );
}

async function harnessNamed(name) {
  const harnesses = (await participants()).filter(
    (p) => p.kind === "harness" && p.removed_at === null,
  );
  return pick(harnesses, name, (p) => p.display_name, "harness");
}

async function nameOf(id) {
  if (id === device.participantId) return "you";
  const everyone = await participants();
  const found = everyone.find((p) => p.id === id);
  if (found === undefined) return id ?? "?";
  if (found.kind !== "agent") return found.display_name;
  const harness = everyone.find((p) => p.id === found.harness_id);
  return `${found.display_name}@${harness?.display_name ?? "?"}`;
}

async function agentsIn(roomId, options) {
  return (await participants(options)).filter(
    (p) => p.kind === "agent" && p.room === roomId && p.removed_at === null,
  );
}

// ── Rooms, from their own events ─────────────────────────────────────────────────────────────

const ROOM_FACTS = {
  "space.created": (room, event) => {
    if (typeof event.kind === "string") room.kind = event.kind;
  },
  "space.updated": (room, event) => {
    if (typeof event.state === "string") room.state = event.state;
  },
  "space.erased": (room) => {
    room.state = "erased";
  },
  "space.lead_set": (room, event) => {
    room.lead = event.agent_id ?? null;
  },
};

function noteRoom(room, event) {
  if (typeof event.title === "string" && event.type.startsWith("space.")) room.title = event.title;
  ROOM_FACTS[event.type]?.(room, event);
  room.last = Math.max(room.last, event.seq);
}

/** The rooms in these events: title, kind, state, lead, and the last seq seen there. */
function roomsFrom(events) {
  const rooms = new Map();
  for (const event of events) {
    if (!event.space_id) continue;
    const room = rooms.get(event.space_id) ?? {
      id: event.space_id,
      title: "",
      state: "open",
      lead: null,
      last: 0,
    };
    noteRoom(room, event);
    rooms.set(event.space_id, room);
  }
  return [...rooms.values()].filter((room) => room.state !== "erased");
}

async function roomNamed(wanted) {
  if (wanted.startsWith("spc_")) return { id: wanted, title: wanted };
  return pick(roomsFrom(await eventsSince(0)), wanted, (room) => room.title || room.id, "room");
}

// ── Reading a room ───────────────────────────────────────────────────────────────────────────

const QUIET = new Set([
  "step.log",
  "run.status",
  "attachment.fetched",
  "message.heard",
  "read.marked",
  "usage",
]);
const STARTS = new Set(["run.started", "run.requested"]);
const ENDS = new Set(["run.completed", "run.failed", "run.cancel"]);
const CAPPED = /Reached the end of what one turn may do/;

/** A time as this machine's clock reads it: 08:46:03. */
function clock(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

function oneLine(text, width = 110) {
  return String(text ?? "")
    .split(/\s+/)
    .join(" ")
    .slice(0, width);
}

const SAYS = {
  "approval.request": (e) => headlineOf(e),
  "approval.resolved": (e) => `${e.decision}${e.reason ? `: ${e.reason}` : ""}`,
  "budget.warning": (e) =>
    `${e.threshold}% ${e.action}: $${e.budget?.spent_usd} of $${e.budget?.limit_usd}`,
  "exchange.set": (e) => `${e.state}${e.why ? ` (${e.why})` : ""}`,
  "lane.updated": (e) => `${e.state ?? ""} ${oneLine(e.summary, 80)}`,
  "space.lock_set": (e) => (e.locked ? "locked changes" : "unlocked changes"),
  "space.spend_ceiling_lifted": () => "no cap on a job's spend",
};

async function lineOf(event) {
  const who = event.actor?.kind === "system" ? "Chips" : await nameOf(event.actor?.id);
  const says =
    SAYS[event.type]?.(event) ?? event.text ?? event.goal ?? event.summary ?? event.reason ?? "";
  const what = event.held === true ? `[held] ${says}` : says;
  // The files a post carries, by name and id for `file`: whether a room got a file or a path.
  const files = (event.attachments ?? []).map((each) =>
    `${each.filename ?? "a file"} ${each.attachment_id ?? each.id ?? ""}`.trim(),
  );
  const carried = files.length === 0 ? "" : ` [files: ${files.join(", ")}]`;
  return `${String(event.seq).padStart(6)} ${clock(event.ts)} ${event.type.padEnd(18)} ${who.padEnd(28).slice(0, 28)} ${oneLine(what)}${carried}`;
}

function noteRun(run, event) {
  if (ENDS.has(event.type) && run.end === null) {
    run.end = { how: event.type === "run.cancel" ? "stopped" : event.type.slice(4), at: event.ts };
  }
  if (event.type === "usage") {
    run.usd = event.cost?.usd ?? null;
    run.models.add(event.model);
  }
}

/** Each run in these events: who, when, how it ended, what it reported costing and on what models. */
function runsOf(events) {
  const runs = new Map();
  for (const event of events) {
    if (!event.run_id) continue;
    if (STARTS.has(event.type) && !runs.has(event.run_id)) {
      runs.set(event.run_id, {
        id: event.run_id,
        by: event.actor?.id,
        start: event.ts,
        goal: event.goal,
        end: null,
        usd: undefined,
        models: new Set(),
      });
    }
    const run = runs.get(event.run_id);
    if (run !== undefined) noteRun(run, event);
  }
  return [...runs.values()];
}

function parseSince(value) {
  if (value === undefined) return { seq: 0 };
  if (/^\d+$/.test(value)) return { seq: Number(value) };
  // A time without a zone is this machine's local time, as a person says it: 08:45 or 08:45:30,
  // not 15:45Z.
  const at = new Date(
    /^\d{1,2}:\d{2}(:\d{2})?$/.test(value) ? `${new Date().toDateString()} ${value}` : value,
  );
  if (Number.isNaN(at.getTime()))
    fail(`--since takes a seq, a time (08:45 or 08:45:30) or a date-time, not "${value}"`);
  console.error(`since ${at.toISOString()}`);
  return { seq: 0, at: at.toISOString() };
}

function within(event, since) {
  return event.seq > since.seq && (since.at === undefined || event.ts >= since.at);
}

async function printRun(run) {
  const end = run.end ? `${run.end.how} ${clock(run.end.at)}` : "OPEN";
  const usd = run.usd === undefined ? "—" : run.usd === null ? "no cost" : `$${run.usd.toFixed(3)}`;
  const by = (await nameOf(run.by)).padEnd(30).slice(0, 30);
  const models = run.models.size === 0 ? "" : `  [${[...run.models].join(", ")}]`;
  console.log(
    `    ${clock(run.start)} → ${end.padEnd(20)} ${by} ${usd.padStart(8)}  ${oneLine(run.goal, 60)}${models}`,
  );
}

async function read(roomArg, flags) {
  const room = await roomNamed(roomArg);
  const since = parseSince(flags.since);
  const all = await eventsSince(0, room.id);
  const spend = await http("GET", `/v1/spaces/${room.id}/spend`);
  console.log(
    `=== ${room.title}  ${room.id}  job $${spend.spent_usd.toFixed(3)} of $${spend.ceiling_usd.toFixed(2)} since seq ${spend.since_seq}`,
  );
  for (const event of all) {
    if (within(event, since) && !QUIET.has(event.type)) console.log(await lineOf(event));
  }
  // A run counts when anything of it happened in the window, so one begun before it still shows.
  const touched = new Set(all.filter((event) => within(event, since)).map((event) => event.run_id));
  const runs = runsOf(all).filter((run) => touched.has(run.id));
  const reported = runs.reduce((sum, run) => sum + (run.usd ?? 0), 0);
  const uncounted = runs.filter((run) => run.usd === null).length;
  console.log(
    `--- ${runs.length} runs, $${reported.toFixed(3)} reported, ${uncounted} with no cost`,
  );
  for (const run of runs) await printRun(run);
}

// ── Asks (ADR 0142) ──────────────────────────────────────────────────────────────────────────

const LASTS = { once: "Just this once", standing: "Until you take it back" };

/** The head of an ask's card as the apps draw it (core's `askHeadline`). */
function headlineOf(request) {
  return request.question ?? request.preview?.title ?? request.action?.kind ?? "an action";
}

/** Each approval asked in these events, with its decision and what the harness did after. */
function asksOf(events) {
  const asks = new Map();
  for (const event of events) {
    if (event.type === "approval.request") asks.set(event.approval_id, { request: event });
    const ask = asks.get(event.approval_id);
    if (ask === undefined) continue;
    if (event.type === "approval.resolved" && ask.resolved === undefined) ask.resolved = event;
    if (event.type === "approval.executed") ask.executed = event;
  }
  return [...asks.values()];
}

async function stateOf({ resolved, executed }) {
  if (resolved === undefined) return "WAITING";
  const by = await nameOf(resolved.resolved_by ?? resolved.actor?.id);
  return `${resolved.decision} by ${by}${executed === undefined ? "" : `, ${executed.outcome}`}`;
}

/** An ask as its card reads: who asks, the question, what a yes does, how long, the preview. */
async function printAsk(ask) {
  const { request } = ask;
  const who = await nameOf(request.actor?.id);
  console.log(
    `${String(request.seq).padStart(6)} ${clock(request.ts)} ${request.approval_id}  ${who} asks · ${await stateOf(ask)}`,
  );
  const unasked = request.question === undefined ? "(no question) " : "";
  console.log(`         ${unasked}${oneLine(headlineOf(request), 200)}`);
  if (request.effect !== undefined) console.log(`         ${oneLine(request.effect, 200)}`);
  const lasts = request.lasts === undefined ? "(how long not said)" : LASTS[request.lasts];
  const risk = request.risk?.length ? ` · ${request.risk.join(", ")}` : "";
  console.log(`         ${lasts} · ${request.action?.kind}${risk}`);
  if (request.preview !== undefined) {
    const title = request.preview.title ? ` "${oneLine(request.preview.title, 60)}"` : "";
    console.log(
      `         preview ${request.preview.format}${title}: ${oneLine(request.preview.body, 90)}`,
    );
  }
}

async function listAsks(roomArg, flags) {
  const room = roomArg === undefined ? undefined : await roomNamed(roomArg);
  const since = parseSince(flags.since);
  const all = asksOf(await eventsSince(0, room?.id)).filter(
    (ask) => within(ask.request, since) && (flags.pending !== true || ask.resolved === undefined),
  );
  if (all.length === 0) console.log(`no asks${room === undefined ? "" : ` in ${room.title}`}`);
  for (const ask of all) await printAsk(ask);
}

const DECISIONS = { approve: "approved", deny: "denied" };

async function decide(roomArg, answer, flags) {
  const decision = DECISIONS[answer] ?? fail(`decide <room> approve|deny, not "${answer ?? ""}"`);
  const room = await roomNamed(roomArg);
  const waiting = asksOf(await eventsSince(0, room.id)).filter((ask) => ask.resolved === undefined);
  const ask =
    flags.approval === undefined
      ? waiting.at(-1)
      : waiting.find((each) => each.request.approval_id === flags.approval);
  if (ask === undefined) fail(`no ask is waiting in ${room.title}`);
  const { request } = ask;
  const [ack] = await submit([
    {
      type: "approval.resolved",
      space_id: room.id,
      run_id: request.run_id,
      approval_id: request.approval_id,
      decision,
      // "once", or "session": the same ask is decided for the rest of the agent's session.
      scope: flags.scope === "session" ? "session" : "once",
      ...(typeof flags.reason === "string" ? { reason: flags.reason } : {}),
    },
  ]);
  console.log(`${decision} "${oneLine(headlineOf(request), 100)}" at seq ${ack.seq}`);
}

// ── Commands ─────────────────────────────────────────────────────────────────────────────────

async function rooms() {
  const all = roomsFrom(await eventsSince(0)).filter((room) => room.state === "open");
  all.sort((a, b) => b.last - a.last);
  for (const room of all.slice(0, 30)) {
    const names = await Promise.all((await agentsIn(room.id)).map((agent) => nameOf(agent.id)));
    const lead = room.lead ? ` lead ${await nameOf(room.lead)}` : "";
    console.log(
      `${(room.title || "(untitled)").padEnd(28).slice(0, 28)} ${room.id}${lead}  ${names.join(", ")}`,
    );
  }
}

async function say(roomArg, words, flags) {
  if (!words) fail("say what?");
  const room = await roomNamed(roomArg);
  const to = await chosen(room, flags.to);
  const [ack] = await submit([
    { type: "message.post", space_id: room.id, text: words, ...(to === undefined ? {} : { to }) },
  ]);
  console.log(
    `said in ${room.title} at seq ${ack.seq}${ack.held ? " (held from the agents it named)" : ""}`,
  );
}

/**
 * Not right? (ADR 0200): one `correction` on an agent's message, the newest in the room unless
 * `--message` names one. The note is made as core's `notRight` makes it: the reasons as a
 * sentence, then the words.
 */
async function notRight(roomArg, words, flags) {
  const room = await roomNamed(roomArg);
  const reasons =
    typeof flags.reasons === "string"
      ? flags.reasons
          .split(",")
          .map((each) => each.trim())
          .filter(Boolean)
      : [];
  const text = [reasons.length === 0 ? "" : `${reasons.join(", ")}.`, words.trim()]
    .filter((part) => part !== "")
    .join(" ");
  if (text === "") fail('not-right needs a reason (--reasons "Wrong facts") or words');
  const posts = (await eventsSince(0, room.id)).filter(
    (event) => event.type === "message.post" && event.actor?.kind === "agent",
  );
  const messageId = (event) => `msg_${event.id.slice(event.id.indexOf("_") + 1)}`;
  const about =
    typeof flags.message === "string"
      ? posts.find((event) => messageId(event) === flags.message)
      : posts.at(-1);
  if (about === undefined) fail(`no agent message ${flags.message ?? ""} in ${room.title}`.trim());
  const [ack] = await submit([
    {
      type: "feedback",
      space_id: room.id,
      message_id: messageId(about),
      kind: "correction",
      text,
    },
  ]);
  console.log(
    `Not right? on ${await nameOf(about.actor.id)}'s ${messageId(about)} (seq ${about.seq}) at seq ${ack.seq}: ${text}`,
  );
}

/** What `--to` chooses, as the composer does (ADR 0081): an agent in the room by name, or all. */
async function chosen(room, name) {
  if (name === undefined || name === true) return undefined;
  if (name === "all") return "all";
  return [pick(await agentsIn(room.id), name, (a) => a.display_name, "agent in the room").id];
}

/** The + with these harnesses picked: the room asked of the first, each put in it, then the words. */
async function createRoom(harnesses, words) {
  const [first, ...others] = harnesses;
  const spaceId = newSpaceId();
  await submit([
    {
      type: "space.created",
      space_id: spaceId,
      kind: others.length === 0 ? "direct" : "group",
      asked_of: first.id,
      ...(others.length === 0 ? {} : { also_asked_of: others.map((h) => h.id) }),
      idempotency_key: `space-${spaceId}`,
    },
    ...harnesses.map((h) => ({
      type: "membership.added",
      space_id: spaceId,
      participant_id: h.id,
      participant_kind: "harness",
      role: "member",
    })),
    { type: "message.post", space_id: spaceId, text: words },
  ]);
  return spaceId;
}

async function untilAgents(spaceId, count) {
  await waitFor(
    async () => (await agentsIn(spaceId, { fresh: true })).length >= count,
    180,
    `${count} agents in the room`,
  );
}

async function printRoom(spaceId) {
  // The harness names the room when it claims it, a few seconds after its agent arrives.
  let [room] = roomsFrom(await eventsSince(0, spaceId));
  for (let tries = 0; !room?.title && tries < 20; tries += 1) {
    await sleep(3);
    [room] = roomsFrom(await eventsSince(0, spaceId));
  }
  console.log(`=== ${room?.title || spaceId}  ${spaceId}`);
  if (room?.lead) console.log(`lead: ${await nameOf(room.lead)}`);
  for (const agent of await agentsIn(spaceId, { fresh: true })) {
    console.log(`agent: ${await nameOf(agent.id)}  ${agent.id}`);
  }
}

async function newRoom(harnessList, words, flags) {
  if (!harnessList || !words) fail("new <harness[,harness…]> <first words…>");
  const harnesses = [];
  for (const name of harnessList.split(",")) harnesses.push(await harnessNamed(name.trim()));
  const spaceId = await createRoom(harnesses, words);
  console.log(`room ${spaceId} asked of ${harnesses.map((h) => h.display_name).join(", ")}`);
  await untilAgents(spaceId, harnesses.length);
  const extra = flags.agents
    ? String(flags.agents)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  for (const each of extra) {
    const [name, harnessName] = each.split("@");
    const harness = harnessName ? await harnessNamed(harnessName) : harnesses[0];
    await http("POST", `/v1/spaces/${spaceId}/agents`, { harness_id: harness.id, name });
  }
  if (extra.length > 0) await untilAgents(spaceId, harnesses.length + extra.length);
  if (flags.ceiling !== undefined) await ceiling(spaceId, flags.ceiling, { quiet: true });
  await printRoom(spaceId);
  if (flags.ceiling !== undefined)
    console.log(`ceiling: $${Number(flags.ceiling).toFixed(2)} a job`);
}

/** The + with Empty picked (ADR 0148): a room by its name alone, then each agent asked for in it. */
async function emptyRoom(title, flags) {
  if (!title) fail('empty <title…> [--agents "Name@harness,…"]');
  const spaceId = newSpaceId();
  await submit([
    {
      type: "space.created",
      space_id: spaceId,
      kind: "group",
      title,
      idempotency_key: `space-${spaceId}`,
    },
  ]);
  console.log(`room ${spaceId} made empty`);
  const asked = flags.agents
    ? String(flags.agents)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  for (const each of asked) {
    const [name, harnessName] = each.split("@");
    if (!harnessName) fail(`say whose agent ${name} is: ${name}@<harness>`);
    const harness = await harnessNamed(harnessName);
    await http("POST", `/v1/spaces/${spaceId}/agents`, { harness_id: harness.id, name });
  }
  if (asked.length > 0) await untilAgents(spaceId, asked.length);
  await printRoom(spaceId);
}

async function addAgent(roomArg, harnessName, name) {
  const room = await roomNamed(roomArg);
  const harness = await harnessNamed(harnessName ?? fail("which harness?"));
  const asked = await http("POST", `/v1/spaces/${room.id}/agents`, {
    harness_id: harness.id,
    ...(name ? { name } : {}),
  });
  console.log(`asked ${harness.display_name} for ${asked.name ?? "an agent"} in ${room.title}`);
}

async function lead(roomArg, who) {
  const room = await roomNamed(roomArg);
  const agentId =
    who && who !== "none"
      ? pick(await agentsIn(room.id), who, (a) => a.display_name, "agent in the room").id
      : null;
  const done = await http("POST", `/v1/spaces/${room.id}/lead`, { agent_id: agentId });
  console.log(
    done.agent_id
      ? `${await nameOf(done.agent_id)} leads ${room.title}`
      : `nobody leads ${room.title}`,
  );
}

// ── Context files (ADR 0134) ─────────────────────────────────────────────────────────────────

async function contextOwner(name, asHarness) {
  if (asHarness) return { kind: "harnesses", id: (await harnessNamed(name)).id };
  const agents = (await participants()).filter((p) => p.kind === "agent" && p.removed_at === null);
  return { kind: "agents", id: pick(agents, name, (p) => p.display_name, "agent").id };
}

/** What a context file's line says beyond its name: shared, read only, how many read it. */
function contextTags(file) {
  const shared =
    file.shared === undefined
      ? ""
      : `shared:${file.shared}${file.replaceable ? " (replaceable)" : ""}`;
  const why = file.why_read_only ? ` (${file.why_read_only})` : "";
  const readOnly = file.editable ? "" : `read only${why}`;
  const usedBy = file.used_by === undefined ? "" : `used by ${file.used_by}`;
  const newAgents = file.for_new_agents ? "new agents" : "";
  return [shared, readOnly, usedBy, newAgents].filter(Boolean);
}

function contextLine(file) {
  const tags = contextTags(file);
  const more = tags.length === 0 ? "" : ` · ${tags.join(", ")}`;
  return `  ${file.title} · ${file.name} · ${file.role ?? "other"} · ${file.hash ?? "-"}${more}`;
}

async function context(name, flags) {
  if (name === undefined) fail("context <agent> [--harness] [--text]");
  const owner = await contextOwner(name, flags.harness === true);
  const set = await http("GET", `/v1/${owner.kind}/${owner.id}/context`);
  console.log(`read ${set.read_at}${set.away ? " · away: read only" : ""}`);
  for (const file of set.files ?? set.shared ?? []) {
    console.log(contextLine(file));
    if (flags.text === true && file.text !== undefined)
      console.log(file.text.replace(/^/gm, "      "));
  }
  for (const left of set.not_shown ?? [])
    console.log(`  (not shown: ${left.name}, ${left.reason})`);
  if (set.new_agents_note) console.log(`  new agents: ${set.new_agents_note}`);
}

async function contextEdit(name, fileName, path, flags) {
  if (path === undefined) fail("context-edit <agent> <file name> <path> [--harness] [--own]");
  const owner = await contextOwner(name, flags.harness === true);
  const set = await http("GET", `/v1/${owner.kind}/${owner.id}/context`);
  const file = (set.files ?? set.shared ?? []).find((each) => each.name === fileName);
  if (file === undefined) fail(`no ${fileName} in that set`);
  const text = readFileSync(path, "utf8");
  const asked = await http("POST", `/v1/${owner.kind}/${owner.id}/context/edits`, {
    name: fileName,
    text,
    base_hash: flags.own === true ? null : (file.hash ?? null),
  });
  console.log(`asked ${asked.edit_id}: ${asked.state}`);
  let seen = asked;
  for (let at = 0; seen.state === "waiting" && at < 80; at += 1) {
    await new Promise((done) => setTimeout(done, 1000));
    seen = await http("GET", `/v1/context/edits/${asked.edit_id}`);
  }
  console.log(`${seen.state}${seen.message ? `: ${seen.message}` : ""}`);
}

// ── Model and effort (ADR 0140) ──────────────────────────────────────────────────────────────

async function agentNamed(name) {
  const agents = (await participants()).filter((p) => p.kind === "agent" && p.removed_at === null);
  return pick(agents, name, (p) => p.display_name, "agent");
}

/** The copy's first line: what it runs on, whose, and whether it can be changed now. */
function modelHead(copy) {
  const whose = copy.own ? "its own" : (copy.default?.label ?? "no default");
  const effort = copy.effort ? ` at ${copy.effort}` : "";
  const away = copy.away ? " · away: read only" : "";
  const locked = copy.editable ? "" : ` · read only (${copy.why_read_only ?? "no reason given"})`;
  return `${copy.model}${effort} · ${whose}${away}${locked}`;
}

/** One model it could run on: ▸ for the one it runs on, * for the model's default level. */
function choiceLine(choice, current) {
  const levels = choice.efforts.map((level) =>
    level.id === choice.effort_default ? `${level.id}*` : level.id,
  );
  const mark = choice.id === current ? "▸" : " ";
  const named = levels.length === 0 ? "" : `: ${levels.join(" ")}`;
  return `  ${mark} ${choice.label} (${choice.id})${named}`;
}

function changeLine(change) {
  const asked = change.model === null ? "the default" : `${change.model} ${change.effort ?? ""}`;
  const words = change.message ? `: ${change.message}` : "";
  return `  last change ${change.change_id}: ${asked.trim()} · ${change.state}${words}`;
}

function printModel(copy) {
  console.log(modelHead(copy));
  if (copy.default) {
    const effort = copy.default.effort ? ` at ${copy.default.effort}` : "";
    console.log(`  default: ${copy.default.label} = ${copy.default.model}${effort}`);
  }
  if (copy.followed_by) {
    console.log(`  followed by ${copy.followed_by} agent${copy.followed_by === 1 ? "" : "s"}`);
  }
  for (const choice of copy.choices) console.log(choiceLine(choice, copy.model));
  if (copy.change) console.log(changeLine(copy.change));
  console.log(`  read ${copy.read_at}`);
}

async function model(name) {
  if (name === undefined) fail("model <agent>");
  const agent = await agentNamed(name);
  printModel(await http("GET", `/v1/agents/${agent.id}/model`));
}

async function modelSet(name, flags) {
  const same = flags.same === true;
  if (name === undefined || (!same && typeof flags.model !== "string")) {
    fail("model-set <agent> --model <id> [--effort <id>] | --same");
  }
  const agent = await agentNamed(name);
  const ask = same
    ? { model: null, effort: null }
    : { model: flags.model, effort: typeof flags.effort === "string" ? flags.effort : null };
  const asked = await http("POST", `/v1/agents/${agent.id}/model/changes`, ask);
  console.log(`asked ${asked.change_id}: ${asked.state}`);
  let seen = asked;
  for (let at = 0; seen.state === "waiting" && at < 80; at += 1) {
    await new Promise((done) => setTimeout(done, 1000));
    const copy = await http("GET", `/v1/agents/${agent.id}/model`);
    seen = copy.change?.change_id === asked.change_id ? copy.change : seen;
  }
  console.log(`${seen.state}${seen.message ? `: ${seen.message}` : ""}`);
  printModel(await http("GET", `/v1/agents/${agent.id}/model`));
}

// ── Heartbeat (ADR 0143) ─────────────────────────────────────────────────────────────────────

function printHeartbeat(copy) {
  const away = copy.away ? " · away: read only" : "";
  const locked = copy.editable ? "" : ` · read only (${copy.why_read_only ?? "no reason given"})`;
  console.log(`${copy.on ? "on" : "off"} · every ${copy.every} min${away}${locked}`);
  const choices = copy.choices.map((minutes) => (minutes === copy.every ? `▸${minutes}` : minutes));
  console.log(`  choices (min): ${choices.join(" ")}`);
  if (copy.change) {
    const { change } = copy;
    const asked = `${change.on ? "on" : "off"}, every ${change.every} min`;
    const words = change.message ? `: ${change.message}` : "";
    console.log(`  last change ${change.change_id}: ${asked} · ${change.state}${words}`);
  }
  console.log(`  read ${copy.read_at}`);
}

async function heartbeat(name) {
  if (name === undefined) fail("heartbeat <agent>");
  const agent = await agentNamed(name);
  printHeartbeat(await http("GET", `/v1/agents/${agent.id}/heartbeat`));
}

/** `<agent> on|off [minutes]`: the agent's name is every word before the last on or off. */
async function heartbeatSet(args) {
  const at = args.findLastIndex((word) => word === "on" || word === "off");
  const minutes = args[at + 1];
  if (at < 1 || args.length > at + 2 || (minutes !== undefined && !/^\d+$/.test(minutes))) {
    fail("heartbeat-set <agent> on|off [minutes]");
  }
  const agent = await agentNamed(args.slice(0, at).join(" "));
  const ask = {
    on: args[at] === "on",
    ...(minutes === undefined ? {} : { every: Number(minutes) }),
  };
  const asked = await http("POST", `/v1/agents/${agent.id}/heartbeat/changes`, ask);
  console.log(`asked ${asked.change_id}: ${asked.state}`);
  let seen = asked;
  for (let tries = 0; seen.state === "waiting" && tries < 80; tries += 1) {
    await new Promise((done) => setTimeout(done, 1000));
    const copy = await http("GET", `/v1/agents/${agent.id}/heartbeat`);
    seen = copy.change?.change_id === asked.change_id ? copy.change : seen;
  }
  console.log(`${seen.state}${seen.message ? `: ${seen.message}` : ""}`);
  printHeartbeat(await http("GET", `/v1/agents/${agent.id}/heartbeat`));
}

const tokens = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function windowHead(copy) {
  const percent = Math.round((copy.used / copy.window) * 100);
  const model = copy.model ? ` · ${copy.model}` : "";
  const doing = copy.compacting ? ` · compacting (${copy.compacting})` : "";
  const away = copy.away ? " · away: read only" : "";
  return `${percent}% full · ${tokens(copy.used)} of ${tokens(copy.window)} tokens${model}${doing}${away}`;
}

function limitLine(limit) {
  if (!limit) return "  compacts itself: its harness's own limit";
  const at = limit.at === null ? "only when asked" : `at ${limit.at}%`;
  const choices = limit.choices.map((each) => (each === limit.at ? `▸${each}` : each));
  const own = limit.default === undefined ? "" : ` · its own ${limit.default ?? "off"}`;
  const off = limit.may_turn_off ? " · may turn off" : "";
  return `  compacts itself ${at} · choices (%): ${choices.join(" ")}${own}${off}`;
}

const saidWords = (message) => (message ? `: ${message}` : "");

/** What it last did, and what became of the last of each ask. */
function windowAsks(copy) {
  const lines = [];
  if (copy.last) {
    const { last } = copy;
    lines.push(
      `  last compacted ${last.at} (${last.by}): ${tokens(last.from)} → ${tokens(last.to)}`,
    );
  }
  if (copy.long_turn) {
    const turn = copy.long_turn;
    const share = Math.round((turn.peak / copy.window) * 100);
    lines.push(
      `  last long turn ${turn.at}: peaked ${tokens(turn.peak)} (${share}%), compacted itself ${turn.folds}×`,
    );
  }
  if (copy.change) {
    const { change } = copy;
    const at = change.at === null ? "off" : `${change.at}%`;
    lines.push(
      `  last limit asked ${change.change_id}: ${at} · ${change.state}${saidWords(change.message)}`,
    );
  }
  if (copy.compaction) {
    const { compaction } = copy;
    lines.push(
      `  last Compact now ${compaction.change_id}: ${compaction.state}${saidWords(compaction.message)}`,
    );
  }
  return lines;
}

function printWindow(copy) {
  console.log(windowHead(copy));
  console.log(limitLine(copy.limit));
  if (!copy.compacts) console.log(`  takes no Compact now (${copy.why_not ?? "no reason given"})`);
  if (!copy.editable) console.log(`  read only (${copy.why_read_only ?? "no reason given"})`);
  for (const line of windowAsks(copy)) console.log(line);
  console.log(`  read ${copy.read_at} · measured ${copy.as_of}`);
}

async function contextWindow(name) {
  if (name === undefined) fail("window <agent>");
  const agent = await agentNamed(name);
  printWindow(await http("GET", `/v1/agents/${agent.id}/context-window`));
}

/** `<agent> <percent>|off`: the agent's name is every word before the last. */
async function windowSet(args) {
  const value = args.at(-1);
  if (args.length < 2 || (value !== "off" && !/^\d+$/.test(value ?? ""))) {
    fail("window-set <agent> <percent>|off");
  }
  const agent = await agentNamed(args.slice(0, -1).join(" "));
  const path = `/v1/agents/${agent.id}/context-window`;
  const asked = await http("POST", `${path}/changes`, {
    at: value === "off" ? null : Number(value),
  });
  console.log(`asked ${asked.change_id}: ${asked.state}`);
  let seen = asked;
  for (let tries = 0; seen.state === "waiting" && tries < 80; tries += 1) {
    await new Promise((done) => setTimeout(done, 1000));
    const copy = await http("GET", path);
    seen = copy.change?.change_id === asked.change_id ? copy.change : seen;
  }
  console.log(`${seen.state}${seen.message ? `: ${seen.message}` : ""}`);
  printWindow(await http("GET", path));
}

async function windowCompact(name) {
  if (name === undefined) fail("window-compact <agent>");
  const agent = await agentNamed(name);
  const path = `/v1/agents/${agent.id}/context-window`;
  const asked = await http("POST", `${path}/compactions`, {});
  console.log(`asked ${asked.change_id}: ${asked.state}`);
  let seen = asked;
  for (
    let tries = 0;
    (seen.state === "waiting" || seen.state === "taken") && tries < 240;
    tries += 1
  ) {
    await new Promise((done) => setTimeout(done, 1000));
    const copy = await http("GET", path);
    if (copy.compaction?.change_id === asked.change_id && copy.compaction.state !== seen.state) {
      seen = copy.compaction;
      console.log(`${seen.state}${seen.message ? `: ${seen.message}` : ""}`);
    }
  }
  printWindow(await http("GET", path));
}

async function ceiling(roomArg, value, { quiet = false } = {}) {
  if (value === undefined) fail("ceiling <room> <usd|default>");
  const room = await roomNamed(roomArg);
  const usd = value === "default" ? null : Number(value);
  if (usd !== null && !Number.isFinite(usd)) fail(`"${value}" is not an amount`);
  await http("POST", `/v1/spaces/${room.id}/spend-ceiling`, { usd });
  if (!quiet) await spend(room.id);
}

async function spend(roomArg) {
  const room = await roomNamed(roomArg);
  const job = await http("GET", `/v1/spaces/${room.id}/spend`);
  console.log(
    `${room.title}: this job $${job.spent_usd.toFixed(3)} of $${job.ceiling_usd.toFixed(2)} (since seq ${job.since_seq}; ${job.uncounted_runs} runs with no cost)`,
  );
}

async function exchange(roomArg, state) {
  const room = await roomNamed(roomArg);
  const done = await http("POST", `/v1/spaces/${room.id}/exchange`, { state });
  console.log(`${room.title}: agents ${done.state}${done.changed ? "" : " (already)"}`);
}

/** The newest run in the room that has not ended, from its own events. */
async function openRunIn(roomId) {
  return runsOf(await eventsSince(0, roomId))
    .filter((run) => run.end === null)
    .at(-1);
}

async function lastSeqIn(roomId) {
  return (await eventsSince(0, roomId)).at(-1)?.seq ?? 0;
}

/** A capped turn's follow-up in the room, from now: its run once it starts. */
async function nextFollowUp(roomId, timeout) {
  const before = await lastSeqIn(roomId);
  const capped = await waitFor(
    async () =>
      (await eventsSince(before, roomId)).find(
        (e) => e.type === "message.post" && CAPPED.test(e.text ?? ""),
      ),
    timeout,
    "a capped turn",
  );
  return await waitFor(
    async () => (await eventsSince(capped.seq, roomId)).find((e) => STARTS.has(e.type)),
    600,
    "the follow-up's run",
  );
}

async function stop(roomArg, flags) {
  const room = await roomNamed(roomArg);
  let runId;
  if (flags["follow-up"]) {
    const after = Number(flags.after ?? 30);
    console.log(`waiting in ${room.title} for a turn to reach its round cap and carry on…`);
    const started = await nextFollowUp(room.id, Number(flags.timeout ?? 1800));
    console.log(
      `follow-up ${started.run_id} started ${clock(started.ts)}; stopping it in ${after} s`,
    );
    await sleep(after);
    runId = started.run_id;
  } else {
    runId = (await openRunIn(room.id))?.id ?? fail(`no run is open in ${room.title}`);
  }
  const [ack] = await submit([
    { type: "run.cancel", space_id: room.id, run_id: runId, reason: "Stopped from the room." },
  ]);
  console.log(`stopped ${runId} at seq ${ack.seq}`);
}

/** The newest open run's Pause or Resume, as the thinking bubble's menu sends it (ADR 0293). */
async function runAct(roomArg, type) {
  const room = await roomNamed(roomArg);
  const runId = (await openRunIn(room.id))?.id ?? fail(`no run is open in ${room.title}`);
  const [ack] = await submit([{ type, space_id: room.id, run_id: runId }]);
  console.log(`${type === "run.pause" ? "paused" : "resumed"} ${runId} at seq ${ack.seq}`);
}

/**
 * Messages taken back, as their author or the space's owner may (ADR 0035), and then hidden from
 * you (ADR 0167), so neither their words nor the "taken back" mark stays in the room.
 */
async function takeBack(roomArg, messageIds) {
  const room = await roomNamed(roomArg);
  if (messageIds.length === 0) fail("name the messages to take back");
  // A message is named on the wire by its event's ULID under `msg_` (`messageIdOf`).
  for (const id of messageIds.map((each) => each.replace(/^evt_/, "msg_"))) {
    const [gone] = await submit([{ type: "message.deleted", space_id: room.id, message_id: id }]);
    const [hidden] = await submit([{ type: "message.hidden", space_id: room.id, message_id: id }]);
    console.log(`took back ${id} at seq ${gone.seq}, hidden at seq ${hidden.seq}`);
  }
}

/**
 * A room archived, as its menu's Archive does: out of the list, kept whole, and back with
 * Unarchive. A live test posts only in a room made for it and puts it away after (Arjun, 11
 * November 2026). The agents made there stay its agents: deleting them, and erasing the room, are
 * for good, and are a person's to do.
 */
async function archive(roomArg) {
  const room = await roomNamed(roomArg);
  const [done] = await submit([{ type: "space.updated", space_id: room.id, state: "closed" }]);
  console.log(`archived ${room.title} at seq ${done.seq}`);
}

const UNTIL = {
  answer: (e) => e.type === "message.post" && e.actor?.kind !== "person",
  ask: (e) => e.type === "approval.request",
  capped: (e) => CAPPED.test(e.text ?? ""),
  paused: (e) => e.type === "exchange.set" && e.state === "paused",
  run: (e) => STARTS.has(e.type),
};

async function wait(roomArg, flags) {
  const room = await roomNamed(roomArg);
  const until = flags.until ?? "quiet";
  const seconds = Number(flags.timeout ?? 1800);
  if (until === "quiet") {
    let quietSince = Date.now();
    await waitFor(
      async () => {
        if ((await openRunIn(room.id)) !== undefined) quietSince = Date.now();
        return Date.now() - quietSince > 45_000;
      },
      seconds,
      "quiet",
    );
    console.log(`${room.title} is quiet`);
    return;
  }
  const test =
    UNTIL[until] ?? fail(`--until is quiet, answer, ask, capped, paused or run, not "${until}"`);
  // From --since when given: finding the room reads every event, which can take longer than a
  // harness takes to answer, and a window opened after that misses what came in meanwhile.
  const since =
    flags.since === undefined ? { seq: await lastSeqIn(room.id) } : parseSince(flags.since);
  const found = await waitFor(
    async () =>
      (await eventsSince(since.seq, room.id)).find((event) => within(event, since) && test(event)),
    seconds,
    until,
  );
  console.log(await lineOf(found));
}

const WATCHED = new Set([
  ...STARTS,
  ...ENDS,
  "budget.warning",
  "exchange.set",
  "message.post",
  "lane.updated",
  "turn.passed",
  "message.handed",
  "space.spend_ceiling_set",
  "space.spend_ceiling_lifted",
  "space.lock_set",
]);

/** One pass over what is new: each watched event printed, titles kept up; the last seq seen. */
async function printNew(last, ids, titles) {
  let seen = last;
  for (const event of await eventsSince(last)) {
    seen = Math.max(seen, event.seq);
    if (typeof event.title === "string" && event.type.startsWith("space.")) {
      titles.set(event.space_id, event.title);
    }
    if (!WATCHED.has(event.type) || (ids.size > 0 && !ids.has(event.space_id))) continue;
    const room = (titles.get(event.space_id) || event.space_id || "").slice(0, 22);
    console.log(`[${room}] ${await lineOf(event)}`);
  }
  return seen;
}

async function watch(roomArgs, flags) {
  const ids = new Set();
  for (const each of roomArgs) ids.add((await roomNamed(each)).id);
  const all = await eventsSince(0);
  const titles = new Map(roomsFrom(all).map((room) => [room.id, room.title]));
  let last = flags.since === undefined ? (all.at(-1)?.seq ?? 0) : Number(flags.since);
  const shown = ids.size === 0 ? "every room" : [...ids].map((id) => titles.get(id)).join(", ");
  console.log(`watching ${shown} from seq ${last}`);
  for (;;) {
    last = await printNew(last, ids, titles);
    await sleep(3);
  }
}

async function file(attachmentId, out) {
  if (!attachmentId || !out) fail("file <attachment id> <out path>");
  const target = `/v1/attachments/${attachmentId}`;
  const response = await fetch(`${device.serverUrl}${target}`, {
    headers: headers("GET", target, ""),
  });
  if (!response.ok) fail(`${target}: ${response.status}`);
  writeFileSync(out, Buffer.from(await response.arrayBuffer()));
  console.log(`saved ${out} (${response.headers.get("content-type")})`);
}

/** What each harness told Chips its runs cost since a time. */
async function toldSince(at) {
  // A run's report is its total so far (ADR 0117), and a run of several turns sends several: the
  // last one is the run's. Any other report adds to what its harness was told.
  const runs = new Map();
  const told = new Map();
  for (const event of await eventsSince(0)) {
    if (event.type !== "usage" || event.ts < at || event.cost?.usd === undefined) continue;
    const harness = event.actor?.harness_id ?? "?";
    if (event.scope === "run" && event.run_id)
      runs.set(event.run_id, { harness, usd: event.cost.usd });
    else told.set(harness, (told.get(harness) ?? 0) + event.cost.usd);
  }
  for (const { harness, usd } of runs.values()) told.set(harness, (told.get(harness) ?? 0) + usd);
  return told;
}

/**
 * A query of a copy of a harness's own cost store: a SQLite file with an `api_calls` table of
 * `timestamp`, `trace_id` and `cost_usd`, named by `--store` or `CHIPS_LIVE_COST_STORE`. For
 * Jacobian that is `~/.jacobian/data/workers/global/worker.db`. Copied with `.backup`, since the
 * harness is writing it. Nothing where none is named or it cannot be read.
 */
function harnessStore(path) {
  if (!path) return undefined;
  const copy = join(mkdtempSync(join(tmpdir(), "chips-live-")), "store.db");
  try {
    execFileSync("sqlite3", [path, `.backup '${copy}'`]);
  } catch {
    return undefined;
  }
  return (query) =>
    JSON.parse(
      execFileSync("sqlite3", ["-json", copy, query], { encoding: "utf8" }).trim() || "[]",
    );
}

async function cost(flags) {
  const since = parseSince(flags.since ?? fail("cost --since <time> [--store <path>]"));
  if (since.at === undefined) fail("cost --since takes a time");
  for (const [harness, usd] of await toldSince(since.at)) {
    console.log(`Chips was told  ${(await nameOf(harness)).padEnd(12)} $${usd.toFixed(3)}`);
  }
  const store = flags.store ?? environment.CHIPS_LIVE_COST_STORE;
  const sql = harnessStore(store);
  if (sql === undefined) {
    console.log(
      store
        ? `the harness's store at ${store}: not readable`
        : "no harness store named (--store <path>)",
    );
    return;
  }
  const [total] = sql(
    `select round(sum(cost_usd),3) usd, count(*) calls from api_calls where timestamp >= '${since.at}'`,
  );
  console.log(
    `The harness's store            $${total?.usd ?? 0} over ${total?.calls ?? 0} calls; by journey:`,
  );
  const traces = sql(
    `select trace_id, round(sum(cost_usd),3) usd, count(*) calls, min(timestamp) first from api_calls where timestamp >= '${since.at}' and trace_id is not null and trace_id != '' group by trace_id having usd > 0 order by first`,
  );
  for (const trace of traces)
    console.log(
      `    ${clock(trace.first)}  ${trace.trace_id}  $${trace.usd}  ${trace.calls} calls`,
    );
}

// ── Arguments ────────────────────────────────────────────────────────────────────────────────

function parse(argv) {
  const words = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const next = argv[i + 1];
    const takesValue = next !== undefined && !next.startsWith("--");
    flags[arg.slice(2)] = takesValue ? next : true;
    if (takesValue) i += 1;
  }
  return { words, flags };
}

function help() {
  const source = readFileSync(new URL(import.meta.url), "utf8");
  const block = source.slice(source.indexOf("/**") + 3, source.indexOf("*/"));
  console.log(block.replace(/^ \* ?/gm, "").trim());
}

const [command, ...rest] = process.argv.slice(2);
const { words, flags } = parse(rest);
const COMMANDS = {
  rooms: () => rooms(),
  say: () => say(words[0], words.slice(1).join(" "), flags),
  "not-right": () => notRight(words[0], words.slice(1).join(" "), flags),
  new: () => newRoom(words[0], words.slice(1).join(" "), flags),
  empty: () => emptyRoom(words.join(" "), flags),
  agent: () => addAgent(words[0], words[1], words.slice(2).join(" ") || undefined),
  lead: () => lead(words[0], words.slice(1).join(" ")),
  ceiling: () => ceiling(words[0], words[1]),
  spend: () => spend(words[0]),
  "carry-on": () => exchange(words[0], "going"),
  pause: () => exchange(words[0], "paused"),
  stop: () => stop(words[0], flags),
  "run-pause": () => runAct(words[0], "run.pause"),
  "run-resume": () => runAct(words[0], "run.resume"),
  "take-back": () => takeBack(words[0], words.slice(1)),
  archive: () => archive(words.join(" ")),
  wait: () => wait(words[0], flags),
  read: () => read(words[0], flags),
  watch: () => watch(words, flags),
  file: () => file(words[0], words[1]),
  cost: () => cost(flags),
  context: () => context(words.join(" ") || undefined, flags),
  "context-edit": () => contextEdit(words[0], words[1], words[2], flags),
  model: () => model(words.join(" ") || undefined),
  "model-set": () => modelSet(words.join(" ") || undefined, flags),
  heartbeat: () => heartbeat(words.join(" ") || undefined),
  "heartbeat-set": () => heartbeatSet(words),
  window: () => contextWindow(words.join(" ") || undefined),
  "window-set": () => windowSet(words),
  "window-compact": () => windowCompact(words.join(" ") || undefined),
  asks: () => listAsks(words.join(" ") || undefined, flags),
  decide: () => decide(words[0], words[1], flags),
};
const ROOMLESS = new Set([
  "rooms",
  "watch",
  "cost",
  "new",
  "empty",
  "context",
  "context-edit",
  "model",
  "model-set",
  "heartbeat",
  "heartbeat-set",
  "window",
  "window-set",
  "window-compact",
  "asks",
]);
if (COMMANDS[command] === undefined) {
  help();
  process.exit(command === undefined || command === "help" ? 0 : 1);
}
if (words[0] === undefined && !ROOMLESS.has(command)) fail(`${command} needs a room`);
await COMMANDS[command]();
