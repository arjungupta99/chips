/**
 * The golden scenario, played from the person's chair (technical-plan Appendix A). The person
 * says what they said in the plan; whatever the harness asks, the person answers — a card is
 * approved, a question takes its default — until the run ends or nothing more comes. Then the
 * log is read: which rows of the checklist the harness lit, and what it got wrong on the way.
 *
 * The driver never assumes the adapter's shape beyond the wire. It does not know where an
 * adapter reads its usage from, or that Jacobian's card is a keyboard; it knows a person said
 * something and a harness was expected to work, ask, and finish.
 *
 * A harness that declares `new_spaces` is then asked for a room of its own, as the + by the tab
 * bar asks: the person opens a room, asks the harness into it and says what it is for. It must
 * claim the room under a key of its own, and is expected to answer there. A harness that does not
 * declare it is not asked, and passes or fails on the golden scenario alone.
 *
 * A harness that declares `forks` is asked for a copy of the agent it played the scenario as, in
 * a room of the person's (ADR 0087, Fork): its copy, registered with `forked_from` and the room,
 * must join it while the room waits.
 */

import { eventDefinition, HARNESS_CAPABILITIES, messageIdOf } from "@chipschat/protocol";
import { askForAChange, askForANewAgent, askForARestart, SETTINGS_CAPABILITIES } from "./checks.js";
import { type FakeChips, startFakeChips } from "./fake-chips.js";
import { type Finding, levelsOf, type Outcome, passes, type Report, rowsOf } from "./report.js";
import type { ChipsAddress, Subject } from "./subject.js";
import { byHarness, POLL_MS, sleep, within } from "./waiting.js";
import type { StoredEvent } from "./workspace.js";

/** What the person says: the first line of the golden scenario. */
export const GOLDEN_MESSAGE =
  "Here's the signed PO. Get it confirmed with Northwind and update the tracker.";

/** What the person asks a new room for, of a harness that declares `new_spaces`. */
export const NEW_SPACE_MESSAGE = "Plan the kitchen remodel: two quotes, a budget and a start date.";

export interface ConformanceOptions {
  readonly subject: Subject;
  /** Where the fake listens. Any free port when absent. */
  readonly port?: number | undefined;
  /** How long to wait for each thing the harness should do next. Ten seconds. */
  readonly beatTimeoutMs?: number | undefined;
  /** How long to wait for a harness that acts on its own to connect. Two minutes. */
  readonly connectTimeoutMs?: number | undefined;
  /** Told where Chips is once it listens — what `custom` prints for a person to paste. */
  readonly onAddress?: ((address: ChipsAddress) => void) | undefined;
  /** Progress, a line at a time, as the scenario plays. */
  readonly log?: ((line: string) => void) | undefined;
}

const DEFAULT_BEAT_MS = 10_000;
const DEFAULT_CONNECT_MS = 120_000;
/** After the run ends, how long trailing events are given to land before the log is read. */
const SETTLE_MS = 500;

const ENDINGS: ReadonlySet<string> = new Set(["run.completed", "run.failed"]);
const ASKS: ReadonlySet<string> = new Set(["approval.request", "question.ask"]);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Has the harness shown up: a socket subscribed, or any call at all made with its token? A poll
 * counts — a harness in hooks mode reads the log before it has anything to say, and a kit that
 * waited for it to speak first would wait for ever, as would the harness.
 */
async function connectedWithin(
  chips: FakeChips,
  ms: number,
  log: (line: string) => void,
): Promise<boolean> {
  const { harnessId } = chips.address;
  const spoke = (): boolean =>
    chips.heard() || chips.workspace.log.some((event) => byHarness(event, harnessId));
  const until = Date.now() + ms;
  log(`Waiting for the harness to connect (up to ${Math.round(ms / 1000)} s)…`);
  while (Date.now() < until) {
    if (spoke()) {
      log("The harness is here.");
      return true;
    }
    await sleep(POLL_MS);
  }
  return spoke();
}

/**
 * The next thing the harness does that the person must answer, or that ends the run. A lane's
 * own ending is not the run's (M3.5): a subagent finishing, a Space handing back, is news for
 * the lead, and the person waits for the lead.
 */
async function nextBeat(
  chips: FakeChips,
  after: number,
  timeoutMs: number,
): Promise<StoredEvent | undefined> {
  const { harnessId } = chips.address;
  const ends = (event: StoredEvent): boolean =>
    ENDINGS.has(event.type) && !chips.workspace.isLaneRun(event.run_id);
  try {
    return await chips.waitFor(
      (event) =>
        event.seq > after && byHarness(event, harnessId) && (ASKS.has(event.type) || ends(event))
          ? event
          : undefined,
      timeoutMs,
    );
  } catch {
    return undefined;
  }
}

/** What was being waited for when nothing came, said so the report can. */
function nothingCame(chips: FakeChips, timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  const { harnessId } = chips.address;
  const events = chips.workspace.log.filter((event) => byHarness(event, harnessId));
  if (!events.some((event) => event.type === "run.started")) {
    return `no run started within ${seconds} s of the message`;
  }
  return `the run did not end within ${seconds} s of the last thing the person answered`;
}

/** Answer whatever comes, until the run ends. */
async function answerUntilTheEnd(
  chips: FakeChips,
  since: number,
  beatMs: number,
  findings: Finding[],
  log: (line: string) => void,
): Promise<void> {
  let cursor = since;
  for (;;) {
    const next = await nextBeat(chips, cursor, beatMs);
    if (next === undefined) {
      findings.push({ severity: "note", message: nothingCame(chips, beatMs) });
      return;
    }
    cursor = next.seq;
    if (ENDINGS.has(next.type)) {
      log(`The run ${next.type === "run.completed" ? "completed" : "failed"}.`);
      return;
    }
    if (next.type === "approval.request") {
      const action = (next.payload["action"] as { kind?: string } | undefined)?.kind ?? "an action";
      await chips.decide(String(next.payload["approval_id"]), "approved", { reason: "Go ahead." });
      log(`You approved ${action}.`);
    } else {
      await chips.answer(String(next.payload["ask_id"]));
      log("You answered the question with its default.");
    }
  }
}

/** The subject's turn must finish once the run has; a turn that hangs is a finding, not a hang. */
async function settled(
  turning: Promise<void> | undefined,
  ms: number,
  findings: Finding[],
): Promise<void> {
  if (turning === undefined) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), ms);
  });
  const outcome = await Promise.race([turning.then(() => "done" as const), late]);
  clearTimeout(timer);
  if (outcome === "late") {
    findings.push({
      severity: "warn",
      message: `the subject's turn had not finished ${Math.round(ms / 1000)} s after the run ended`,
    });
  }
}

async function play(
  chips: FakeChips,
  subject: Subject,
  beatMs: number,
  findings: Finding[],
  log: (line: string) => void,
): Promise<void> {
  const message = await chips.say(GOLDEN_MESSAGE);
  log(`You: ${GOLDEN_MESSAGE}`);
  const turning = subject
    .turn?.({
      spaceId: chips.address.spaceId,
      messageId: messageIdOf(message.id),
      text: GOLDEN_MESSAGE,
    })
    .catch((error: unknown) => {
      findings.push({
        severity: "error",
        message: `the subject's turn failed: ${messageOf(error)}`,
      });
    });
  await answerUntilTheEnd(chips, message.seq, beatMs, findings, log);
  await sleep(SETTLE_MS);
  await settled(turning, beatMs, findings);
}

/** A person asks for a new room: the harness claims it, and answers there. */
async function askForARoom(
  chips: FakeChips,
  beatMs: number,
  findings: Finding[],
  log: (line: string) => void,
): Promise<void> {
  const { harnessId } = chips.address;
  const seconds = Math.round(beatMs / 1000);
  const { spaceId } = await chips.askForSpace(NEW_SPACE_MESSAGE);
  log(`You asked for a new space: ${NEW_SPACE_MESSAGE}`);
  const claimed = await within(
    chips,
    (event) => event.type === "space.claimed" && event.space_id === spaceId,
    beatMs,
  );
  if (claimed === undefined) {
    findings.push({
      severity: "error",
      message: `the harness declares new_spaces but did not claim the space a person asked it for within ${seconds} s`,
    });
    return;
  }
  const title = claimed.payload["title"];
  log(`It claimed the space${typeof title === "string" ? ` as “${title}”` : ""}.`);
  if (typeof title !== "string") {
    findings.push({
      severity: "note",
      message: "the new space was claimed without a title, so it reads as its first words",
    });
  }
  const answered = await within(
    chips,
    (event) =>
      event.type === "message.post" && event.space_id === spaceId && byHarness(event, harnessId),
    beatMs,
  );
  if (answered === undefined) {
    findings.push({
      severity: "warn",
      message: `the harness claimed the new space but said nothing in it within ${seconds} s`,
    });
  } else log("It answered in the new space.");
}

/** A person asks for a copy of the harness's agent in another room: the copy joins it. */
async function askForACopy(
  chips: FakeChips,
  beatMs: number,
  findings: Finding[],
  log: (line: string) => void,
): Promise<void> {
  const { workspace } = chips;
  const original = [...workspace.agents.values()].find(
    (agent) => !agent.lead && workspace.agentRoom(agent.agent_id) === chips.address.spaceId,
  );
  if (original === undefined) {
    findings.push({
      severity: "warn",
      message: "the harness declares forks, but no agent of its is in the scenario's space to copy",
    });
    return;
  }
  const spaceId = await chips.openRoom("Second opinion");
  const { forkId } = await chips.askForFork(original.agent_id, spaceId);
  log(`You asked for a copy of ${original.name} in another space.`);
  const joined = await within(
    chips,
    (event) => event.type === "membership.added" && event.payload["fork_of"] === forkId,
    beatMs,
  );
  if (joined === undefined) {
    findings.push({
      severity: "error",
      message: `the harness declares forks but no copy joined the space it was asked for within ${Math.round(beatMs / 1000)} s`,
    });
    return;
  }
  const copy = workspace.agents.get(String(joined.payload["participant_id"]));
  log(`Its copy${copy === undefined ? "" : `, ${copy.name},`} joined the space.`);
}

function errorsIn(findings: readonly Finding[]): number {
  return findings.filter((finding) => finding.severity === "error").length;
}

/** Whether the harness was there to play at all. */
function played(chips: FakeChips): boolean {
  return chips.workspace.log.some((event) => byHarness(event, chips.address.harnessId));
}

function unique(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.severity}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the log says the harness got wrong, beyond which rows it lit. */
function findingsFrom(chips: FakeChips): Finding[] {
  const { harnessId } = chips.address;
  const found: Finding[] = [];
  const sent = chips.workspace.log.filter((event) => byHarness(event, harnessId));
  for (const refused of chips.workspace.refusals) {
    if (refused.who !== "harness") continue;
    found.push({
      severity: "error",
      message: `Chips refused ${refused.type ?? "an event"}: ${refused.message}`,
    });
  }
  for (const dropped of chips.workspace.dropped) {
    if (dropped.who !== "harness") continue;
    found.push({
      severity: "warn",
      message: `${dropped.type} carried \`${dropped.field}\`, which the protocol does not declare: Chips drops it`,
    });
  }
  for (const event of sent) {
    if (eventDefinition(event.type)?.requiresRun === true && event.run_id === null) {
      found.push({
        severity: "warn",
        message: `${event.type} was sent without a run; the protocol says it belongs to one`,
      });
    }
  }
  found.push(...approvalFindings(chips, sent), ...runFindings(chips, sent));
  return unique(found);
}

function approvalFindings(chips: FakeChips, sent: readonly StoredEvent[]): Finding[] {
  const found: Finding[] = [];
  const executed = new Set(
    sent
      .filter((event) => event.type === "approval.executed")
      .map((event) => String(event.payload["approval_id"])),
  );
  for (const row of chips.workspace.approvals.values()) {
    if (row.state !== "resolved" || row.decision === "denied") continue;
    if (!executed.has(row.approval_id)) {
      found.push({
        severity: "warn",
        message:
          "an approval was answered yes but the run never said what became of it: send approval.executed so the card can move from approved to sent",
      });
    }
  }
  return found;
}

/** The steps still open at the end: started, and never reported done or failed. */
function openSteps(sent: readonly StoredEvent[]): string[] {
  const open = new Map<string, string>();
  for (const event of sent) {
    if (event.type !== "step.log") continue;
    const stepId = String(event.payload["step_id"]);
    if (event.payload["status"] === "started") {
      open.set(stepId, String(event.payload["title"] ?? stepId));
    } else open.delete(stepId);
  }
  return [...open.values()];
}

function runFindings(chips: FakeChips, sent: readonly StoredEvent[]): Finding[] {
  const found: Finding[] = [];
  const open = openSteps(sent);
  for (const run of chips.workspace.runs.values()) {
    if (run.state !== "done" && run.state !== "failed") {
      found.push({ severity: "warn", message: `a run was left ${run.state}` });
    } else if (open.length > 0) {
      found.push({
        severity: "warn",
        message: `the run ended with ${open.length} step${open.length === 1 ? "" : "s"} still started: ${open.join(", ")}`,
      });
    }
  }
  return [...found, ...trailingFindings(sent)];
}

/** What a usage or a failure says about itself. */
function trailingFindings(sent: readonly StoredEvent[]): Finding[] {
  const found: Finding[] = [];
  for (const event of sent) {
    if (event.type === "usage" && event.payload["cost"] === undefined) {
      found.push({
        severity: "note",
        message: "usage carried no cost; Chips estimates one from its price table",
      });
    }
    if (event.type === "run.failed") {
      found.push({
        severity: "note",
        message: `the run failed: ${String(event.payload["error"])}`,
      });
    }
  }
  return found;
}

async function stopQuietly(subject: Subject, findings: Finding[]): Promise<void> {
  try {
    await subject.stop();
  } catch (error) {
    findings.push({
      severity: "warn",
      message: `stopping the subject failed: ${messageOf(error)}`,
    });
  }
}

/**
 * Each capability the harness declares, checked after the golden scenario: what became of it,
 * passed or failed by whether its check found anything wrong.
 */
async function playCapabilities(
  chips: FakeChips,
  declared: ReadonlySet<string>,
  beatMs: number,
  findings: Finding[],
  log: (line: string) => void,
): Promise<Map<string, Outcome>> {
  const outcomes = new Map<string, Outcome>();
  const check = async (capability: string, step: () => Promise<void>): Promise<void> => {
    if (!declared.has(capability)) return;
    const before = errorsIn(findings);
    await step();
    outcomes.set(capability, errorsIn(findings) > before ? "failed" : "passed");
  };
  const { newSpaces, forks, newAgents, restarts } = HARNESS_CAPABILITIES;
  await check(newSpaces, () => askForARoom(chips, beatMs, findings, log));
  await check(forks, () => askForACopy(chips, beatMs, findings, log));
  await check(newAgents, () => askForANewAgent(chips, beatMs, findings, log));
  for (const capability of SETTINGS_CAPABILITIES) {
    await check(capability, () => askForAChange(capability, chips, beatMs, findings, log));
  }
  // Last: it may take the harness away and back.
  await check(restarts, () => askForARestart(chips, beatMs, findings, log));
  return outcomes;
}

/** What no check sees is declared; what a harness never came to play is failed. */
function settle(
  chips: FakeChips,
  declared: ReadonlySet<string>,
  outcomes: ReadonlyMap<string, Outcome>,
): Map<string, Outcome> {
  const all = new Map(outcomes);
  const there = played(chips);
  for (const capability of declared) {
    if (!all.has(capability)) all.set(capability, there ? "declared" : "failed");
  }
  return all;
}

/** Walk the subject through the scenario and read the log. Never throws: what went wrong is in the report. */
export async function runConformance(options: ConformanceOptions): Promise<Report> {
  const { subject } = options;
  const log = options.log ?? (() => undefined);
  const beatMs = options.beatTimeoutMs ?? DEFAULT_BEAT_MS;
  const chips = await startFakeChips({ port: options.port, capabilities: subject.capabilities });
  const declared = new Set(subject.capabilities ?? []);
  let outcomes = new Map<string, Outcome>();
  const started = Date.now();
  const findings: Finding[] = [];
  try {
    options.onAddress?.(chips.address);
    await subject.start(chips.address);
    const present =
      subject.turn !== undefined ||
      (await connectedWithin(chips, options.connectTimeoutMs ?? DEFAULT_CONNECT_MS, log));
    if (present) {
      await play(chips, subject, beatMs, findings, log);
      outcomes = await playCapabilities(chips, declared, beatMs, findings, log);
    } else {
      findings.push({
        severity: "error",
        message: "the harness never connected: no socket subscribed and nothing arrived over HTTP",
      });
    }
  } catch (error) {
    findings.push({
      severity: "error",
      message: `the scenario could not be played: ${messageOf(error)}`,
    });
  } finally {
    await stopQuietly(subject, findings);
    await chips.close();
  }
  const sent = chips.workspace.log
    .filter((event) => byHarness(event, chips.address.harnessId))
    .map((event) => event.type);
  const rows = rowsOf(sent);
  const all = unique([...findings, ...findingsFrom(chips)]);
  return {
    adapter: subject.name,
    rows,
    levels: levelsOf(rows, settle(chips, declared, outcomes)),
    findings: all,
    events: sent.length,
    durationMs: Date.now() - started,
    passed: passes(rows, all),
  };
}
