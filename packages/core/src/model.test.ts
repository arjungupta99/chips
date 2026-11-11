/**
 * The fold from events to what the screens show, driven by the golden scenario's own fixtures
 * so the model is tested against real event shapes.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FIRST_PERSON_NAME, WARN_AT } from "@chipschat/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ClientEvent, Directory } from "./events.js";
import {
  type Approval,
  addedTo,
  administers,
  aimOf,
  aimsAtEveryone,
  aimWords,
  aimWordsOf,
  askDetail,
  askedName,
  askHeadline,
  betweenHarnesses,
  buildModel,
  capsDraft,
  capsFromDraft,
  capsSentence,
  capsWords,
  createFold,
  draftAddress,
  exchangeLine,
  fileLinesKey,
  goalWords,
  harnessesIn,
  heardWords,
  inFiles,
  type Lane,
  type Line,
  laneChainCostUsd,
  lanesInSpace,
  lastWords,
  marginWords,
  mayAnswer,
  mayDelete,
  mayEdit,
  mayPin,
  mayTurnDial,
  mentionablesIn,
  messageRoute,
  myRole,
  NEW_SPACE_NAME,
  namesAuthors,
  nextAddress,
  nextAim,
  othersIn,
  parentOf,
  pausedIn,
  pauseWords,
  pinnedLines,
  type Run,
  replyAgent,
  roomHandles,
  roomLeadOf,
  routesIn,
  routeWords,
  type Space,
  sessionToAddress,
  spaceFace,
  spaceWorking,
  standingIn,
  takesFeedback,
  takesReaction,
  visibleLines,
  type WorkspaceModel,
  wireTo,
} from "./model.js";
import { spendCeilingOf } from "./rooms.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

/** PO-4471 from opening to summary, with a question and a removal along the way. */
function wholeScenario(): ClientEvent[] {
  return [
    ...upToTheAsk(),
    fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
    fixture("approval.executed", 8),
    fixture("step.log", 9, { step_id: "email-dana", status: "done" }),
    fixture("question.ask", 10),
    fixture("question.answered", 11),
    fixture("usage", 12),
    fixture("context.usage", 13),
    fixture("membership.added", 14, { participant_id: "usr_2", participant_kind: "person" }),
    fixture("membership.removed", 15, { participant_id: "usr_2" }),
    fixture("run.steer", 16),
    fixture("run.plan", 17),
    fixture("run.pause", 18),
    fixture("run.resume", 19),
    fixture("checkpoint", 20, { compacted: true }),
    fixture("usage", 21, { scope: "step", input_tokens: 10, output_tokens: 1 }),
    fixture("run.completed", 22),
  ];
}

/** PO-4471 up to the point where a person has to answer. */
function upToTheAsk(): ClientEvent[] {
  return [
    fixture("space.created", 1),
    fixture("membership.added", 2),
    fixture("run.started", 3),
    fixture("run.status", 4),
    fixture("step.log", 5),
    fixture("approval.request", 6),
  ];
}

describe("the people of the workspace (ADR 0034)", () => {
  it("folds who joined with which role, and a change of role, into the people and the audit", () => {
    const model = buildModel([
      fixture("person.joined", 1, {
        participant_id: "usr_1",
        display_name: "Arjun",
        role: "owner",
        invite_id: undefined,
        invited_by: undefined,
        actor: { kind: "person", id: "usr_1" },
      }),
      fixture("person.joined", 2),
      fixture("role.changed", 3),
    ]);
    expect(model.people["usr_1"]).toMatchObject({ displayName: "Arjun", role: "owner" });
    expect(model.people["usr_01K4ZQPX000000000000000009"]).toMatchObject({
      displayName: "Dana",
      role: "admin",
      invitedBy: "usr_01K4ZQPX000000000000000003",
      inviteId: "inv_01K4ZQPX0000000000000000D1",
    });
    expect(myRole(model, "usr_1")).toBe("owner");
    expect(myRole(model, "usr_nobody")).toBeUndefined();
    expect(administers("owner")).toBe(true);
    expect(administers("admin")).toBe(true);
    expect(administers("member")).toBe(false);
    expect(administers(undefined)).toBe(false);
    // The dial is theirs alone (SEC-1): a member, a stranger and nobody at all cannot turn it.
    expect(mayTurnDial(model, "usr_1")).toBe(true);
    expect(mayTurnDial(model, "usr_01K4ZQPX000000000000000009")).toBe(true);
    expect(mayTurnDial(model, "usr_nobody")).toBe(false);
    expect(mayTurnDial(model, undefined)).toBe(false);

    // Newest first: the change, then the invited joining, then the owner's.
    expect(model.audit.map((entry) => [entry.kind, entry.who, entry.what])).toEqual([
      ["people", "usr_01K4ZQPX000000000000000003", "made Dana an admin"],
      ["people", "usr_01K4ZQPX000000000000000003", "invited Dana, who joined as member"],
      ["people", "usr_1", "Arjun joined as owner"],
    ]);
    expect(model.audit[0]?.reason).toBe("Dana runs the finance harnesses now.");
  });

  it("audits a harness handed to another person, naming the new owner (M5.2)", () => {
    const model = buildModel([fixture("person.joined", 1), fixture("harness.transferred", 2)]);
    expect(model.audit[0]).toMatchObject({
      kind: "people",
      who: "usr_01K4ZQPX000000000000000003",
      what: "handed hrn_01K4ZQPX000000000000000004 to Dana",
      reason: "Dana runs Scout's projects now.",
    });
  });

  it("audits a harness removed, by the name it had then (ADR 0078)", () => {
    const model = buildModel([fixture("person.joined", 1), fixture("harness.removed", 2)]);
    expect(model.audit[0]).toMatchObject({
      kind: "people",
      who: "usr_01K4ZQPX000000000000000003",
      what: "removed Scout",
      reason: "Only here for a test.",
    });
  });

  it("keeps a role change for somebody whose joining has not folded as an audit line only", () => {
    const model = buildModel([fixture("role.changed", 1)]);
    expect(model.people).toEqual({});
    expect(model.audit[0]?.what).toBe("made usr_01K4ZQPX000000000000000009 an admin");
  });
});

describe("the space", () => {
  it("opens with a title and gathers its members, its creator first", () => {
    const opened = fixture("space.created", 1, { title: "PO-4471", kind: "group" });
    const { spaces } = buildModel([
      opened,
      fixture("membership.added", 2, { participant_id: "usr_1", participant_kind: "person" }),
      fixture("membership.added", 3, { participant_id: "hrn_1", participant_kind: "harness" }),
    ]);
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.title).toBe("PO-4471");
    expect(spaces[0]?.members).toEqual([opened.actor.id, "usr_1", "hrn_1"]);
  });

  it("reads what a harness said as its agent's once the agent takes its place (ADR 0087)", () => {
    const opened = fixture("space.created", 1, { title: "Chess Game", kind: "direct" });
    const harness = "hrn_01K4ZQPX000000000000000004";
    const agent = "agt_01K4ZQPX0000000000000000A1";
    const said = fixture("message.post", 3, {
      space_id: opened["space_id"],
      actor: { kind: "harness", id: harness },
      text: "e4 is the move.",
      addressed_to: [],
    });
    const { spaces } = buildModel([
      opened,
      fixture("membership.added", 2, { participant_id: harness, participant_kind: "harness" }),
      said,
      fixture("membership.replaced", 4, {
        space_id: opened["space_id"],
        from: harness,
        to: agent,
        ts: "2026-09-30T09:00:00.000Z",
      }),
    ]);
    const space = spaces[0];
    expect(space?.members).toEqual([opened.actor.id, agent]);
    const line = space?.lines.find((each) => each.kind === "text");
    expect(line?.authorId).toBe(agent);
    // No news: the room stays where its last words put it on the list.
    expect(space?.lastActivityAt).toBe(said.ts);
  });

  it("keeps a room where it was when Chips moves an agent in or out of it (ADR 0087, Phase 4)", () => {
    const opened = fixture("space.created", 1, { title: "Kalshi Research", kind: "direct" });
    const agent = "agt_01K4ZQPX0000000000000000A1";
    const said = fixture("message.post", 3, {
      space_id: opened["space_id"],
      text: "Where are the odds?",
    });
    const later = { ts: "2026-09-30T09:00:00.000Z", actor: { kind: "system", id: "system" } };
    const { spaces } = buildModel([
      opened,
      fixture("membership.added", 2, { participant_id: agent, participant_kind: "agent" }),
      said,
      fixture("membership.removed", 4, {
        ...later,
        space_id: opened["space_id"],
        participant_id: agent,
        reason: "agent_archived",
      }),
      fixture("agent.released", 5, {
        ...later,
        space_id: opened["space_id"],
        agent_id: agent,
        reason: "agent_archived",
      }),
      fixture("agent.attached", 6, { ...later, space_id: opened["space_id"], agent_id: agent }),
    ]);
    expect(spaces[0]?.lastActivityAt).toBe(said.ts);
  });

  it("lists the person who opened a space as a member before anyone is added", () => {
    const opened = fixture("space.created", 1, { title: "Notes", kind: "direct" });
    const { spaces } = buildModel([
      opened,
      fixture("membership.added", 2, {
        participant_id: opened.actor.id,
        participant_kind: "person",
      }),
    ]);
    expect(spaces[0]?.members).toEqual([opened.actor.id]);
  });

  it("wears its harness's face when it goes by the harness's name, whatever the run is doing", () => {
    const directory: Directory = {
      hrn_1: { id: "hrn_1", kind: "harness", displayName: "Jacobian" },
    };
    const quiet = [
      fixture("space.created", 1, { kind: "direct", title: undefined }),
      fixture("membership.added", 2, { participant_id: "hrn_1", participant_kind: "harness" }),
    ];
    expect(spaceFace(buildModel(quiet).spaces[0] as Space, directory)).toEqual({
      kind: "harness",
      harnessId: "hrn_1",
      status: "idle",
    });
    const busy = [...quiet, fixture("run.started", 3, { actor: { kind: "harness", id: "hrn_1" } })];
    expect(spaceFace(buildModel(busy).spaces[0] as Space, directory)).toMatchObject({
      status: "working",
    });
    const asking = [...busy, fixture("approval.request", 4)];
    expect(spaceFace(buildModel(asking).spaces[0] as Space, directory)).toMatchObject({
      status: "waiting",
    });
  });

  it("wears its own title's initials when it has a title, run or no run", () => {
    // Jacobian's fifty-odd spaces each have a title; the title is what tells them apart, and the
    // harness's face on every row told nothing (Arjun, 9 September 2026).
    const directory: Directory = {
      hrn_1: { id: "hrn_1", kind: "harness", displayName: "Jacobian" },
    };
    const titled = [
      fixture("space.created", 1, { kind: "direct", title: "Fact-checker" }),
      fixture("membership.added", 2, { participant_id: "hrn_1", participant_kind: "harness" }),
    ];
    expect(spaceFace(buildModel(titled).spaces[0] as Space, directory)).toEqual({ kind: "person" });
    const worked = [
      ...titled,
      fixture("run.started", 3, { actor: { kind: "harness", id: "hrn_1" } }),
    ];
    expect(spaceFace(buildModel(worked).spaces[0] as Space, directory)).toEqual({ kind: "person" });
  });

  it("wears its own name for a room of people or of several harnesses, and a hash for a channel", () => {
    const directory: Directory = {
      hrn_1: { id: "hrn_1", kind: "harness", displayName: "Scout" },
      hrn_2: { id: "hrn_2", kind: "harness", displayName: "Ledger" },
    };
    const people = buildModel([
      fixture("space.created", 1, { kind: "group", title: undefined }),
      fixture("membership.added", 2, { participant_id: "usr_2", participant_kind: "person" }),
    ]).spaces[0] as Space;
    expect(spaceFace(people, directory)).toEqual({ kind: "person" });
    const crowd = buildModel([
      fixture("space.created", 1, { kind: "group", title: undefined }),
      fixture("membership.added", 2, { participant_id: "hrn_1", participant_kind: "harness" }),
      fixture("membership.added", 3, { participant_id: "hrn_2", participant_kind: "harness" }),
      // The latest run is Scout's; the face is still the room's own, not whoever spoke last.
      fixture("run.started", 4, { actor: { kind: "harness", id: "hrn_1" } }),
    ]).spaces[0] as Space;
    expect(spaceFace(crowd, directory)).toEqual({ kind: "person" });
    const channel = buildModel([fixture("space.created", 1, { kind: "channel", title: "ops" })])
      .spaces[0] as Space;
    expect(spaceFace(channel, directory)).toEqual({ kind: "channel" });
  });

  it("lets a run stand in for a membership row the replay has not brought yet", () => {
    const orphan = buildModel([
      fixture("space.created", 1, { kind: "direct", title: undefined }),
      fixture("run.started", 2, { actor: { kind: "harness", id: "hrn_9" } }),
    ]).spaces[0] as Space;
    expect(spaceFace(orphan, {})).toEqual({
      kind: "harness",
      harnessId: "hrn_9",
      status: "working",
    });
  });

  it("shows a person's message as a line", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("message.post", 2, { text: "Get PO #4471 confirmed." }),
    ]);
    const lines = spaces[0]?.lines ?? [];
    expect(lines.at(-1)).toMatchObject({ kind: "text", text: "Get PO #4471 confirmed." });
  });

  it("folds to the same thing whatever order the events arrive", () => {
    const inOrder = buildModel(wholeScenario());
    fc.assert(
      fc.property(
        fc.shuffledSubarray(wholeScenario(), { minLength: wholeScenario().length }),
        (shuffled) => {
          expect(buildModel(shuffled)).toEqual(inOrder);
        },
      ),
    );
  });

  it("folds the same whether the log arrives in one batch or in many", () => {
    const whole = wholeScenario();
    fc.assert(
      fc.property(
        // Where the batches break: the store's flushes, which carry ascending events.
        fc.uniqueArray(fc.integer({ min: 1, max: whole.length - 1 }), { maxLength: 5 }),
        (breaks) => {
          const fold = createFold();
          let from = 0;
          for (const at of [...breaks].sort((a, b) => a - b).concat(whole.length)) {
            fold.push(whole.slice(from, at));
            fold.model();
            from = at;
          }
          expect(fold.model()).toEqual(buildModel(whole));
        },
      ),
    );
  });

  it("hands back the same space object while nothing touches it", () => {
    const fold = createFold();
    fold.push(upToTheAsk());
    const first = fold.model();
    fold.push([
      fixture("space.created", 100, {
        space_id: "spc_other",
        title: "Somewhere else",
      }),
    ]);
    const second = fold.model();
    expect(second.spaces).toHaveLength(2);
    const before = first.spaces.find((each) => each.id !== "spc_other");
    const after = second.spaces.find((each) => each.id !== "spc_other");
    expect(after).toBe(before);
  });

  it("hands back the same run while it says the same, and a new one once it changes", () => {
    const fold = createFold();
    fold.push(upToTheAsk());
    const before = fold.model().spaces[0]?.run;
    // Somebody's word in the room: the space is frozen again, and its run says what it said.
    fold.push([
      fixture("message.post", 50, {
        actor: { kind: "person", id: "usr_1" },
        run_id: undefined,
        text: "Meanwhile",
      }),
    ]);
    expect(fold.model().spaces[0]?.run).toBe(before);
    // A step of its own: a new run, and the one handed out before still says what it said.
    const steps = before?.steps.length ?? 0;
    fold.push([fixture("step.log", 51, { step_id: "send-email", status: "running" })]);
    const after = fold.model().spaces[0]?.run;
    expect(after).not.toBe(before);
    expect(after?.steps).toHaveLength(steps + 1);
    expect(before?.steps).toHaveLength(steps);
    // A step already there, its status changed in place: a new run as well.
    fold.push([fixture("step.log", 52, { step_id: "send-email", status: "done" })]);
    const done = fold.model().spaces[0]?.run;
    expect(done).not.toBe(after);
    expect(done?.steps.at(-1)?.status).toBe("done");
    expect(after?.steps.at(-1)?.status).toBe("running");
  });

  it("puts a line that arrives late in its place", () => {
    const fold = createFold();
    const [opened, first] = upToTheAsk();
    fold.push([opened as ClientEvent, fixture("message.post", 9, { text: "last" })]);
    fold.push([first as ClientEvent]);
    const lines = fold.model().spaces[0]?.lines ?? [];
    expect(lines.map((line) => line.seq)).toEqual(
      [...lines].map((line) => line.seq).sort((a, b) => a - b),
    );
    expect(lines.at(-1)?.text).toBe("last");
  });

  it("ignores an event type it does not know", () => {
    const model = buildModel([
      fixture("space.created", 1),
      { ...fixture("space.created", 2), type: "quantum.entangle" },
    ]);
    expect(model.spaces).toHaveLength(1);
  });
});

describe("the run", () => {
  it("draws the plan as planned steps and turns to waiting on an approval", () => {
    const { spaces } = buildModel(upToTheAsk());
    const run = spaces[0]?.run;
    expect(run?.state).toBe("waiting");
    expect(run?.goal).toContain("PO #4471");
    expect(run?.approvals).toHaveLength(1);
    expect(run?.approvals[0]?.actionKind).toBe("email.send");
  });

  it("records the decision and returns to running", () => {
    const events = [
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
    ];
    const run = buildModel(events).spaces[0]?.run;
    expect(run?.state).toBe("running");
    expect(run?.approvals[0]?.resolved).toMatchObject({ decision: "approved", by: "usr_1" });
  });

  it("finishes with a summary and a cost", () => {
    const events = [
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
      fixture("usage", 8),
      fixture("context.usage", 9),
      fixture("run.completed", 10),
    ];
    const space = buildModel(events).spaces[0];
    expect(space?.run?.state).toBe("done");
    expect(space?.run?.summary).toBeTruthy();
    expect(space?.run?.costUsd).toBeCloseTo(1.47);
    expect(space?.lines.at(-1)?.kind).toBe("summary");
  });

  it("draws no line for a run that ended on NO_REPLY, nor for its passed turn (ADR 0105)", () => {
    const events = [
      ...upToTheAsk(),
      fixture("turn.passed", 7),
      fixture("run.completed", 8, { summary: "`NO_REPLY`" }),
    ];
    const space = buildModel(events).spaces[0];
    const before = buildModel(upToTheAsk()).spaces[0];
    expect(space?.run?.state).toBe("done");
    expect(space?.run?.summary).toBe("Had nothing to add.");
    expect(space?.lines.length).toBe(before?.lines.length);
  });

  it("remembers who passed a turn, and when, with no line drawn (ADR 0105)", () => {
    const events = [...upToTheAsk(), fixture("turn.passed", 7)];
    const space = buildModel(events).spaces[0];
    const before = buildModel(upToTheAsk()).spaces[0];
    const actor = events.at(-1)?.actor.id ?? "";
    expect(space?.passed).toEqual({ [actor]: 7 });
    expect(space?.lines.length).toBe(before?.lines.length);
    expect(before?.passed).toBeUndefined();
  });

  it("draws one card when the summary repeats the run's last message (Phase 3 review, finding 9)", () => {
    const answer = "Confirmed PO #4471 with Northwind and updated the tracker.";
    const space = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 7, { text: `${answer}\n` }),
      fixture("run.completed", 8, { summary: answer }),
    ]).spaces[0];
    const cards = space?.lines.filter((line) => line.text.includes("Confirmed PO")) ?? [];
    expect(cards).toHaveLength(1);
    // The message's own bubble, now the summary card: the receipt draws beneath it, feedback on
    // it reaches the harness by the id it knows, and the run panel keeps the summary as before.
    expect(cards[0]).toMatchObject({
      id: fixture("message.post", 7).id,
      kind: "summary",
      runId: "run_01K4ZQPX000000000000000005",
      // Marked as the fold it is, so a client may draw it as the reply rather than as a card.
      folded: true,
    });
    expect(takesFeedback(cards[0] as Line)).toBe(true);
    expect(space?.run?.summary).toBe(answer);
    expect(space?.lines.some((line) => line.id === fixture("run.completed", 8).id)).toBe(false);
  });

  it("folds a summary onto the message it repeats when the run said more after it (Chess Game, 15 September 2026)", () => {
    // Jacobian said its status, sent a file with a caption, asked a question, and completed with
    // the status again; the room read the status twice, because the fold looked at the last
    // message alone.
    const status = "To-do status: phases 1–3 are landed; phases 4–5 remain.";
    const space = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
      fixture("message.post", 8, { id: "evt_status", text: status }),
      fixture("message.post", 9, { id: "evt_caption", text: "The mock, to compare the themes." }),
      fixture("question.ask", 10),
      fixture("run.completed", 11, { summary: `${status}\n` }),
    ]).spaces[0];
    const said = space?.lines.filter((line) => line.text.includes("To-do status")) ?? [];
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({
      id: "evt_status",
      kind: "summary",
      runId: "run_01K4ZQPX000000000000000005",
      folded: true,
    });
    // The caption is still the message it was, and nothing was added at the end.
    expect(space?.lines.at(-1)).toMatchObject({ id: "evt_caption", kind: "text" });
    expect(space?.lines.some((line) => line.id === fixture("run.completed", 11).id)).toBe(false);
  });

  it("folds a summary that is the message cut short, as the bridges send a long answer's (OpenCode, 17 October 2026)", () => {
    // OpenCode's bridge, like Hermes's and the ACP one, ends a run with the answer cut to 2,000
    // characters and an ellipsis; the room read the answer twice, the second stopping before its tables.
    const answer = `${"Big Pickle is a stealth alias. ".repeat(80)}\n\n| # | Model |\n|---|---|\n| 1 | Claude Opus 5 |`;
    const space = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 7, { text: answer }),
      fixture("run.completed", 8, { summary: `${answer.slice(0, 1990)}…` }),
    ]).spaces[0];
    const said = space?.lines.filter((line) => line.text.includes("stealth alias")) ?? [];
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({
      id: fixture("message.post", 7).id,
      kind: "summary",
      folded: true,
      text: answer,
    });
  });

  it("folds a summary that only names the files of an answer that was only files (setup audit, 17 October 2026)", () => {
    // A bridge posts an answer of files alone and summarises the run "Sent welcome.html."; the room
    // drew the file and then the sentence, as two answers.
    const file = {
      attachment_id: "att_01K4ZQPX000000000000000001",
      filename: "welcome.html",
      mime_type: "text/html",
      byte_size: 1296,
      sha256: "x",
    };
    const space = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 7, { text: "", attachments: [file] }),
      fixture("run.completed", 8, { summary: "Sent welcome.html." }),
    ]).spaces[0];
    expect(space?.lines.at(-1)).toMatchObject({
      id: fixture("message.post", 7).id,
      kind: "summary",
      folded: true,
      text: "",
    });
    expect(space?.lines.at(-1)?.attachments?.map((each) => each.filename)).toEqual([
      "welcome.html",
    ]);
    expect(space?.lines.some((line) => line.id === fixture("run.completed", 8).id)).toBe(false);
  });

  it("keeps the message and the summary apart when they differ, or when somebody else said the words", () => {
    const answer = "Confirmed PO #4471 with Northwind and updated the tracker.";
    const different = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 7),
      fixture("run.completed", 8, { summary: answer }),
    ]).spaces[0];
    expect(different?.lines.slice(-2).map((line) => line.kind)).toEqual(["text", "summary"]);
    expect(different?.lines.at(-1)?.folded).toBeUndefined();

    // A person who typed the same sentence is not the harness summarising itself.
    const somebodyElse = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 7, { text: answer, actor: { kind: "person", id: "usr_1" } }),
      fixture("run.completed", 8, { summary: answer }),
    ]).spaces[0];
    expect(somebodyElse?.lines.slice(-2).map((line) => line.kind)).toEqual(["text", "summary"]);

    // A summary cut short that is not how the message begins is a summary of its own.
    const cutElsewhere = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 7, { text: answer }),
      fixture("run.completed", 8, { summary: "Confirmed the order…" }),
    ]).spaces[0];
    expect(cutElsewhere?.lines.slice(-2).map((line) => line.kind)).toEqual(["text", "summary"]);
  });
});

describe("the fleet and the needs-you queue", () => {
  it("lists the harness with its run state and context", () => {
    const { fleet } = buildModel(upToTheAsk());
    expect(fleet).toHaveLength(1);
    expect(fleet[0]?.status).toBe("waiting");
  });

  it("lists a harness once, on its latest run, however many runs it has", () => {
    const { fleet } = buildModel([
      fixture("space.created", 1, { space_id: "spc_a" }),
      fixture("space.created", 2, { space_id: "spc_b" }),
      fixture("run.started", 3, { space_id: "spc_a", run_id: "run_a" }),
      fixture("run.started", 4, { space_id: "spc_b", run_id: "run_b" }),
      fixture("run.completed", 5, { space_id: "spc_b", run_id: "run_b" }),
      fixture("run.status", 6, { space_id: "spc_a", run_id: "run_a" }),
    ]);
    expect(fleet).toHaveLength(1);
    // The run touched last is the one shown: run_a, still going, not run_b, which finished.
    expect(fleet[0]).toMatchObject({ runId: "run_a", spaceId: "spc_a", status: "running" });
  });

  it("computes the context ring from usage", () => {
    const { fleet } = buildModel([...upToTheAsk(), fixture("context.usage", 7)]);
    // 82,000 of 200,000 tokens is 41 percent.
    expect(fleet[0]?.contextPercent).toBe(41);
  });

  it("surfaces a pending approval, and drops it once resolved", () => {
    const asking = buildModel(upToTheAsk());
    expect(asking.needsYou).toHaveLength(1);
    expect(asking.needsYou[0]).toMatchObject({ kind: "approval" });

    const resolved = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
    ]);
    expect(resolved.needsYou).toHaveLength(0);
  });

  it("surfaces a question until it is answered", () => {
    const asking = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("question.ask", 3),
    ]);
    expect(asking.needsYou).toHaveLength(1);
    expect(asking.needsYou[0]?.kind).toBe("question");

    const answered = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("question.ask", 3),
      fixture("question.answered", 4),
    ]);
    expect(answered.needsYou).toHaveLength(0);
  });
});

describe("the sessions in a space (M2.3, ADR 0024)", () => {
  it("opens a visit, keeps it when it ends, and says which run was its last", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2),
      fixture("run.started", 3, { session_ref: "scout:3f9c1a" }),
      fixture("session.ended", 4),
    ]);
    const sessions = spaces[0]?.sessions ?? [];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionRef: "scout:3f9c1a",
      where: "mbp · ~/Work/Chips",
      live: false,
      endedReason: "prompt_input_exit",
      lastRunId: "run_01K4ZQPX000000000000000005",
    });
    // The space and everything in it stay; only the visit ended.
    expect(spaces[0]?.runs).toHaveLength(1);
  });

  it("opens a visit from a run alone, because a headless turn sends no start hook", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2, { session_ref: "scout:abc" }),
    ]);
    expect(spaces[0]?.sessions).toHaveLength(1);
    expect(spaces[0]?.sessions[0]).toMatchObject({ sessionRef: "scout:abc", live: true });
    expect(spaces[0]?.run?.sessionRef).toBe("scout:abc");
  });

  it("puts a live visit first and the rest newest first, which is where a message goes", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2, { session_ref: "one", ts: "2026-09-04T09:00:00.000Z" }),
      fixture("session.ended", 3, { session_ref: "one", ts: "2026-09-04T09:30:00.000Z" }),
      fixture("session.started", 4, { session_ref: "two", ts: "2026-09-04T10:00:00.000Z" }),
      fixture("session.ended", 5, { session_ref: "two", ts: "2026-09-04T10:30:00.000Z" }),
      fixture("session.started", 6, { session_ref: "three", ts: "2026-09-04T08:00:00.000Z" }),
    ]);
    const space = spaces[0] as Space;
    // "three" started first of all and is the only one still open, so it is the one addressed.
    expect(space.sessions.map((session) => session.sessionRef)).toEqual(["three", "two", "one"]);
    expect(sessionToAddress(space)?.sessionRef).toBe("three");
  });

  it("has nowhere to address a message in a space no session has ever visited", () => {
    const { spaces } = buildModel([fixture("space.created", 1), fixture("message.post", 2)]);
    expect(sessionToAddress(spaces[0] as Space)).toBeUndefined();
  });

  it("opens a visit again when it is started a second time", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2),
      fixture("session.ended", 3),
      fixture("session.started", 4, { started_reason: "resume" }),
    ]);
    expect(spaces[0]?.sessions[0]).toMatchObject({ live: true, endedReason: undefined });
  });
});

describe("leaving a space", () => {
  const ME = "usr_1";

  function joined(): ClientEvent[] {
    return [
      fixture("space.created", 1, { title: "tmp-chan · main" }),
      fixture("membership.added", 2, { participant_id: ME, participant_kind: "person" }),
      fixture("message.post", 3, { text: "hello" }),
    ];
  }

  it("takes the space off the reader's list, at once", () => {
    const before = buildModel(joined(), { selfId: ME });
    expect(before.spaces).toHaveLength(1);

    const after = buildModel(
      [...joined(), fixture("membership.removed", 4, { participant_id: ME })],
      { selfId: ME },
    );
    expect(after.spaces).toEqual([]);
  });

  it("takes its runs and what they were waiting for with it", () => {
    const model = buildModel(
      [
        ...joined(),
        fixture("run.started", 4),
        fixture("approval.request", 5),
        fixture("membership.removed", 6, { participant_id: ME }),
      ],
      { selfId: ME },
    );
    expect(model.spaces).toEqual([]);
    expect(model.needsYou).toEqual([]);
  });

  it("leaves the space alone when it was somebody else who left", () => {
    const model = buildModel(
      [...joined(), fixture("membership.removed", 4, { participant_id: "usr_2" })],
      { selfId: ME },
    );
    expect(model.spaces).toHaveLength(1);
  });

  it("keeps every space when nobody said who is reading", () => {
    const model = buildModel([
      ...joined(),
      fixture("membership.removed", 4, { participant_id: ME }),
    ]);
    expect(model.spaces).toHaveLength(1);
  });

  it("keeps only the spaces the server lists, and says which it forgot", () => {
    const fold = createFold({ selfId: ME });
    fold.push([
      ...joined(),
      fixture("space.created", 4, { space_id: "spc_other", title: "Analyst" }),
      fixture("run.started", 5, { space_id: "spc_other", run_id: "run_other" }),
    ]);
    expect(
      fold
        .model()
        .spaces.map((space) => space.id)
        .sort(),
    ).toEqual(["spc_01K4ZQPX000000000000000002", "spc_other"]);

    // The reader left spc_other from another device while this one was away.
    expect(fold.keepOnly(new Set(["spc_01K4ZQPX000000000000000002"]))).toEqual(["spc_other"]);
    expect(fold.model().spaces.map((space) => space.id)).toEqual([
      "spc_01K4ZQPX000000000000000002",
    ]);

    // Listed in full, nothing is forgotten and the model is the one already made.
    const before = fold.model();
    expect(fold.keepOnly(new Set(["spc_01K4ZQPX000000000000000002"]))).toEqual([]);
    expect(fold.model()).toBe(before);
  });

  // JR-16: a person taken out of a room and added back found it empty, named after the owner,
  // even after a reload: the room was dropped on the leaving, and every replay passed the leaving
  // on its way to the return.
  it("brings the room back whole when the reader is added again", () => {
    const fold = createFold({ selfId: ME });
    fold.push([...joined(), fixture("membership.removed", 4, { participant_id: ME })]);
    expect(fold.model().spaces).toEqual([]);
    fold.push([fixture("membership.added", 6, { participant_id: ME, participant_kind: "person" })]);
    const [room] = fold.model().spaces;
    expect(room?.title).toBe("tmp-chan · main");
    expect(room?.members).toContain(ME);
    expect(room?.lines.map((line) => line.text)).toContain("hello");
  });

  it("keeps what was said before and while they were out in a replay of the whole room", () => {
    const model = buildModel(
      [
        ...joined(),
        fixture("membership.removed", 4, { participant_id: ME }),
        fixture("message.post", 5, { text: "said while away" }),
        fixture("membership.added", 6, { participant_id: ME, participant_kind: "person" }),
        fixture("message.post", 7, { text: "after the return" }),
      ],
      { selfId: ME },
    );
    expect(model.spaces).toHaveLength(1);
    expect(model.spaces[0]?.title).toBe("tmp-chan · main");
    expect(model.spaces[0]?.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining(["hello", "said while away", "after the return"]),
    );
  });

  it("brings back a room the server stopped listing, when the reader is added again", () => {
    const fold = createFold({ selfId: ME });
    fold.push(joined());
    fold.keepOnly(new Set());
    expect(fold.model().spaces).toEqual([]);
    fold.push([fixture("membership.added", 9, { participant_id: ME, participant_kind: "person" })]);
    expect(fold.model().spaces[0]?.lines.map((line) => line.text)).toContain("hello");
  });

  it("does not bring back a room erased while the reader was out of it", () => {
    const fold = createFold({ selfId: ME });
    fold.push([...joined(), fixture("membership.removed", 4, { participant_id: ME })]);
    fold.erase(["spc_01K4ZQPX000000000000000002"]);
    fold.push([fixture("membership.added", 6, { participant_id: ME, participant_kind: "person" })]);
    expect(fold.model().spaces).toEqual([]);
  });
});

describe("people coming and going (JR-5, JR-6)", () => {
  const ARJUN = "usr_arjun";
  const PRIYA = "usr_priya";
  const DEV = "usr_dev";
  const SPACE = "spc_01K4ZQPX000000000000000002";

  function people(): ClientEvent[] {
    return [
      fixture("person.joined", 1, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      fixture("person.joined", 2, { participant_id: PRIYA, display_name: "Priya", role: "member" }),
      fixture("person.joined", 3, { participant_id: DEV, display_name: "Dev", role: "member" }),
      fixture("space.created", 4, { title: "Kitchen", actor: { kind: "person", id: ARJUN } }),
      fixture("membership.added", 5, {
        participant_id: ARJUN,
        participant_kind: "person",
        actor: { kind: "person", id: ARJUN },
      }),
    ];
  }
  const added = (seq: number, who: string) =>
    fixture("membership.added", seq, {
      participant_id: who,
      participant_kind: "person",
      actor: { kind: "person", id: ARJUN },
    });
  const removed = (seq: number, who: string, by: string, extra: Record<string, unknown> = {}) =>
    fixture("membership.removed", seq, {
      participant_id: who,
      removed_by: by,
      actor: { kind: "person", id: by },
      ...extra,
    });
  const said = (events: ClientEvent[], selfId: string) =>
    buildModel(events, { selfId })
      .spaces.find((space) => space.id === SPACE)
      ?.lines.filter((line) => line.whole === true)
      .map((line) => line.text);

  it("says who brought whom in, from where each reader stands, and not the room's maker", () => {
    const events = [...people(), added(6, PRIYA)];
    expect(said(events, ARJUN)).toEqual(["You added Priya"]);
    expect(said(events, PRIYA)).toEqual(["Arjun added you"]);
    expect(said(events, DEV)).toEqual(["Arjun added Priya"]);
  });

  it("says somebody came by a space's link, and whose (ADR 0168)", () => {
    const byLink = fixture("membership.added", 6, {
      participant_id: PRIYA,
      participant_kind: "person",
      role: "guest",
      invite_id: "inv_01K4ZQPX000000000000000001",
      actor: { kind: "person", id: ARJUN },
    });
    const events = [...people(), byLink];
    expect(said(events, ARJUN)).toEqual(["Priya joined by your link"]);
    expect(said(events, PRIYA)).toEqual(["You joined by Arjun's link"]);
    expect(said(events, DEV)).toEqual(["Priya joined by Arjun's link"]);
  });

  it("says an owner, not You, for one still under the server's first name (JR-17)", () => {
    // A server that could not read its person's name calls them "You" until they name themselves.
    const unnamed = [
      fixture("person.joined", 1, {
        participant_id: ARJUN,
        display_name: FIRST_PERSON_NAME,
        role: "owner",
      }),
      ...people().slice(1),
    ];
    const byLink = fixture("membership.added", 6, {
      participant_id: PRIYA,
      participant_kind: "person",
      invite_id: "inv_01K4ZQPX000000000000000001",
      actor: { kind: "person", id: ARJUN },
    });
    expect(said([...unnamed, byLink], PRIYA)).toEqual(["You joined by an owner's link"]);
    expect(said([...unnamed, byLink], ARJUN)).toEqual(["Priya joined by your link"]);
    expect(said([...unnamed, added(6, DEV)], DEV)).toEqual(["An owner added you"]);
  });

  it("says who took whom out, who left, and who was removed from the workspace", () => {
    const events = [
      ...people(),
      added(6, PRIYA),
      added(7, DEV),
      removed(8, PRIYA, ARJUN),
      removed(9, DEV, DEV),
    ];
    expect(said(events, ARJUN)).toEqual([
      "You added Priya",
      "You added Dev",
      "You removed Priya",
      "Dev left",
    ]);
    const gone = [
      ...people(),
      added(6, PRIYA),
      removed(7, PRIYA, ARJUN, { reason: "person_removed" }),
    ];
    expect(said(gone, ARJUN)?.at(-1)).toBe("Priya was removed from the workspace by you");
    // Taken out three times at once, as Foodie's log has Natalie (19 October 2026): said once.
    const thrice = [
      ...people(),
      added(6, PRIYA),
      removed(7, PRIYA, ARJUN),
      removed(8, PRIYA, ARJUN),
      removed(9, PRIYA, ARJUN),
    ];
    expect(said(thrice, ARJUN)).toEqual(["You added Priya", "You removed Priya"]);
  });

  it("takes a person removed from the workspace off its people, and the line keeps their name", () => {
    const out = {
      seq: 8,
      type: "person.removed",
      id: "evt_8",
      ts: "2026-10-14T10:00:00.000Z",
      workspace_id: "ws_1",
      actor: { kind: "person", id: ARJUN },
      participant_id: PRIYA,
      display_name: "Priya",
      removed_by: ARJUN,
    } as ClientEvent;
    const events = [
      ...people(),
      added(6, PRIYA),
      removed(7, PRIYA, ARJUN, { reason: "person_removed" }),
      out,
    ];
    const model = buildModel(events, { selfId: ARJUN });
    expect(model.people[PRIYA]).toBeUndefined();
    expect(said(events, ARJUN)?.at(-1)).toBe("Priya was removed from the workspace by you");
    expect(model.audit.map((entry) => entry.what)).toContain("removed Priya from the workspace");
  });

  it("says a person who deleted their account left the workspace (ADR 0243)", () => {
    const out = {
      seq: 8,
      type: "person.removed",
      id: "evt_8",
      ts: "2026-10-29T10:00:00.000Z",
      workspace_id: "ws_1",
      actor: { kind: "person", id: PRIYA },
      participant_id: PRIYA,
      display_name: "Priya",
      removed_by: PRIYA,
    } as ClientEvent;
    const left = fixture("membership.removed", 7, {
      participant_id: PRIYA,
      actor: { kind: "person", id: PRIYA },
      reason: "person_left",
    });
    const events = [...people(), added(6, PRIYA), left, out];
    const model = buildModel(events, { selfId: ARJUN });
    expect(model.people[PRIYA]).toBeUndefined();
    expect(said(events, ARJUN)?.at(-1)).toBe("Priya left the workspace");
    expect(model.audit.map((entry) => entry.what)).toContain("deleted their account");
    expect(buildModel(events, { selfId: ARJUN }).takenOut).toEqual({});
  });

  it("keeps who took the reader out of a room, until they are back in", () => {
    const out = [...people(), added(6, PRIYA), removed(7, PRIYA, ARJUN)];
    expect(buildModel(out, { selfId: PRIYA }).takenOut).toEqual({
      [SPACE]: {
        spaceId: SPACE,
        title: "Kitchen",
        byId: ARJUN,
        byName: "Arjun",
        at: expect.any(String),
      },
    });
    // Their own leaving is no news to them; a return clears it.
    expect(
      buildModel([...people(), added(6, PRIYA), removed(7, PRIYA, PRIYA)], { selfId: PRIYA })
        .takenOut,
    ).toEqual({});
    expect(buildModel([...out, added(8, PRIYA)], { selfId: PRIYA }).takenOut).toEqual({});
  });
});

describe("a goal a person asked for (M2.3)", () => {
  it("is their message in the space, marked with the harness they said it at", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2, { goal: "Tidy the README.", goal_from: "harness" }),
    ]);
    const line = spaces[0]?.lines.at(-1);
    expect(line?.text).toBe("Tidy the README.");
    expect(line?.via).toBe("hrn_01K4ZQPX000000000000000004");
    expect(spaces[0]?.run?.goalFrom).toBe("harness");
  });

  it("is not drawn again when it came from Chips, because it is already here", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("message.post", 2, { text: "Tidy the README." }),
      fixture("run.started", 3, { goal: "Tidy the README.", goal_from: "chips" }),
    ]);
    expect(spaces[0]?.lines).toHaveLength(1);
    expect(spaces[0]?.run?.goalFrom).toBe("chips");
  });

  it("is left alone by a harness that does not say where its goals come from", () => {
    const { spaces } = buildModel([fixture("space.created", 1), fixture("run.started", 2)]);
    expect(spaces[0]?.lines).toHaveLength(0);
    expect(spaces[0]?.run?.goalFrom).toBeUndefined();
  });
});

describe("what a visit is called (ADR 0040)", () => {
  it("takes the name its harness gives it, and the latest one", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2, { session_ref: "one", where: "mbp · ~/Work/Chips" }),
      fixture("session.renamed", 3, { session_ref: "one", title: "Running Chips locally" }),
      fixture("session.renamed", 4, { session_ref: "one", title: "Sync spec flakes" }),
    ]);
    expect(spaces[0]?.sessions[0]?.title).toBe("Sync spec flakes");
    // A rename says nothing about whether the visit is open, or when it began.
    expect(spaces[0]?.sessions[0]?.live).toBe(true);
    expect(spaces[0]?.sessions[0]?.where).toBe("mbp · ~/Work/Chips");
  });

  it("leaves a visit its harness never named without one", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2, { session_ref: "one" }),
    ]);
    expect(spaces[0]?.sessions[0]?.title).toBeUndefined();
  });

  it("does not reopen a visit that has ended", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2, { session_ref: "one" }),
      fixture("session.ended", 3, { session_ref: "one" }),
      fixture("session.renamed", 4, { session_ref: "one", title: "Relay v0 review" }),
    ]);
    expect(spaces[0]?.sessions[0]?.title).toBe("Relay v0 review");
    expect(spaces[0]?.sessions[0]?.live).toBe(false);
  });
});

describe("where a message typed in a space would go (M2.3)", () => {
  it("reaches a live session, and starts a closed one again", () => {
    const live = buildModel([fixture("space.created", 1), fixture("session.started", 2)]);
    expect(messageRoute(live, live.spaces[0] as Space)).toMatchObject({ how: "live" });

    const closed = buildModel([
      fixture("space.created", 1),
      fixture("session.started", 2),
      fixture("session.ended", 3),
    ]);
    expect(messageRoute(closed, closed.spaces[0] as Space)).toMatchObject({ how: "resume" });
  });

  it("says a harness that works by sessions has none here, which is the direct space's case", () => {
    const model = buildModel([
      // The worktree space, where the harness actually works.
      fixture("space.created", 1, { space_id: "spc_work" }),
      fixture("session.started", 2, { space_id: "spc_work" }),
      // The direct space `chips connect` opens, which has no sessions and never will.
      fixture("space.created", 3, { space_id: "spc_direct", kind: "direct" }),
      fixture("membership.added", 4, {
        space_id: "spc_direct",
        participant_id: "hrn_01K4ZQPX000000000000000004",
        participant_kind: "harness",
      }),
    ]);
    const direct = model.spaces.find((space) => space.id === "spc_direct") as Space;
    expect(messageRoute(model, direct)).toEqual({
      how: "nowhere",
      harnessId: "hrn_01K4ZQPX000000000000000004",
    });
  });

  it("is an ordinary message in a room where nobody works by sessions", () => {
    const model = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2, { session_ref: undefined }),
    ]);
    expect(messageRoute(model, model.spaces[0] as Space)).toEqual({ how: "chat" });
  });

  describe("and the visit a person pinned (ADR 0040)", () => {
    /** Two terminals, the second heard from later, so auto would choose it. */
    const twoLive = () =>
      buildModel([
        fixture("space.created", 1),
        fixture("session.started", 2, { session_ref: "one", ts: "2026-09-07T09:00:00.000Z" }),
        fixture("session.started", 3, { session_ref: "two", ts: "2026-09-07T10:00:00.000Z" }),
      ]);

    it("goes to the one pinned rather than the one that spoke last", () => {
      const model = twoLive();
      const space = model.spaces[0] as Space;
      expect(messageRoute(model, space)).toMatchObject({
        how: "live",
        pinned: false,
        session: { sessionRef: "two" },
      });
      expect(messageRoute(model, space, "one")).toMatchObject({
        how: "live",
        pinned: true,
        session: { sessionRef: "one" },
      });
    });

    it("starts a pinned visit again when it has ended, rather than taking the live one", () => {
      const model = buildModel([
        fixture("space.created", 1),
        fixture("session.started", 2, { session_ref: "one", ts: "2026-09-07T09:00:00.000Z" }),
        fixture("session.ended", 3, { session_ref: "one", ts: "2026-09-07T09:30:00.000Z" }),
        fixture("session.started", 4, { session_ref: "two", ts: "2026-09-07T10:00:00.000Z" }),
      ]);
      expect(messageRoute(model, model.spaces[0] as Space, "one")).toMatchObject({
        how: "resume",
        pinned: true,
        session: { sessionRef: "one" },
      });
    });

    it("says a pin has gone rather than quietly sending to another terminal", () => {
      const model = twoLive();
      expect(messageRoute(model, model.spaces[0] as Space, "three")).toEqual({
        how: "gone",
        sessionRef: "three",
      });
    });
  });
});

describe("a harness rolled up across its spaces (M2.3)", () => {
  it("counts its live visits, its spaces and what is waiting on it", () => {
    const { fleet } = buildModel([
      ...upToTheAsk(),
      fixture("session.started", 7, { session_ref: "one" }),
      fixture("session.started", 8, { session_ref: "two", space_id: "spc_b" }),
      fixture("session.ended", 9, { session_ref: "two", space_id: "spc_b" }),
    ]);
    expect(fleet).toHaveLength(1);
    // Two open: "one", and the visit the scenario's own run belongs to. "two" ended.
    expect(fleet[0]).toMatchObject({ liveSessions: 2, spaceCount: 2, needsYou: 1 });
  });

  it("counts only the asks still open, not the runs it has finished", () => {
    // OpenClaw's card said "22 waiting on you" for its 22 finished runs, with one ask open.
    const { fleet } = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("run.completed", 3),
    ]);
    expect(fleet[0]).toMatchObject({ needsYou: 0 });
  });

  it("shows a harness with a terminal open and nothing running at all", () => {
    const { fleet } = buildModel([fixture("space.created", 1), fixture("session.started", 2)]);
    expect(fleet).toHaveLength(1);
    expect(fleet[0]).toMatchObject({ liveSessions: 1, spaceCount: 1, needsYou: 0 });
    expect(fleet[0]?.runId).toBeUndefined();
    expect(fleet[0]?.status).toBeUndefined();
  });
});

describe("the run's timeline, cost and controls (M1.3)", () => {
  it("times a step logged outside any plan by the events that began and ended it", () => {
    const run = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2, { plan: undefined }),
      fixture("step.log", 3, {
        step_id: "ls",
        status: "started",
        title: "Bash · ls",
        ts: "2026-09-05T16:00:01.000Z",
      }),
      fixture("step.log", 4, {
        step_id: "ls",
        status: "done",
        title: undefined,
        ts: "2026-09-05T16:00:03.000Z",
      }),
      fixture("approval.request", 5, { step_id: undefined, ts: "2026-09-05T16:00:04.000Z" }),
    ]).spaces[0]?.run;
    expect(run?.steps).toEqual([
      expect.objectContaining({
        stepId: "ls",
        title: "Bash · ls",
        status: "done",
        startedAt: "2026-09-05T16:00:01.000Z",
        endedAt: "2026-09-05T16:00:03.000Z",
      }),
    ]);
    expect(run?.steps[0]?.planned).toBeUndefined();
    expect(run?.approvals[0]).toMatchObject({ askedAt: "2026-09-05T16:00:04.000Z" });
    expect(run?.approvals[0]?.stepId).toBeUndefined();
  });

  it("names a step with no title by its summary or its tool, never by its id", () => {
    const steps = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2, { plan: undefined }),
      fixture("step.log", 3, {
        step_id: "tool_search_code:call_Qx1",
        status: "started",
        title: undefined,
        summary: undefined,
        tool: "web_fetch",
      }),
      fixture("step.log", 4, {
        step_id: "call_Zy2",
        status: "started",
        title: undefined,
        summary: undefined,
        tool: "bash",
      }),
      // A summary that comes with the end replaces the tool's name the start had to make do with.
      fixture("step.log", 5, {
        step_id: "call_Zy2",
        status: "done",
        title: undefined,
        tool: "bash",
        summary: "list files (agent)",
      }),
    ]).spaces[0]?.run?.steps;
    expect(steps?.map((step) => step.title)).toEqual(["web_fetch", "list files (agent)"]);
  });

  it("replaces the steps still to come with a new plan, keeping the ones done", () => {
    const run = buildModel([
      ...upToTheAsk(),
      fixture("step.log", 7, { step_id: "check-crm", status: "done", title: undefined }),
      fixture("run.plan", 8),
    ]).spaces[0]?.run;
    expect(run?.steps.map((step) => [step.stepId, step.status])).toEqual([
      ["read-po", "done"],
      ["check-crm", "done"],
      ["email-dana", "planned"],
      ["update-tracker", "planned"],
    ]);
    expect(run?.steps[2]?.title).toBe("Email Dana to confirm, with the pallet count");
  });

  it("keeps a planned step's title when its log carries none, and records how it went", () => {
    const run = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("step.log", 3, {
        step_id: "check-crm",
        status: "failed",
        title: undefined,
        error: "CRM down",
        duration_ms: 90,
      }),
    ]).spaces[0]?.run;
    const step = run?.steps.find((s) => s.stepId === "check-crm");
    expect(step).toMatchObject({
      title: "Check the Northwind record in the CRM",
      status: "failed",
      error: "CRM down",
      durationMs: 90,
      // In the plan, and it began and ended at the one event that reported it.
      planned: true,
      startedAt: "2026-09-02T14:22:02.004Z",
      endedAt: "2026-09-02T14:22:02.004Z",
    });
  });

  it("leaves a tick on the rail where a compaction happened", () => {
    const run = buildModel([
      ...upToTheAsk(),
      fixture("context.usage", 7, { compacted: true }),
      fixture("checkpoint", 8, { compacted: true, label: "Halfway" }),
    ]).spaces[0]?.run;
    const rail = run?.steps.map((step) => `${step.kind ?? "step"}:${step.stepId}`);
    // After the step that has begun (email-dana is waiting), before the ones still to come.
    expect(rail).toEqual([
      "step:read-po",
      "step:check-crm",
      "step:email-dana",
      "tick:tick:7",
      "tick:tick:8",
      "step:update-tracker",
    ]);
    expect(run?.steps[4]?.title).toBe("Compacted: Halfway");
  });

  it("takes a run-scoped usage as the total and adds a step's to it, remembering the model", () => {
    const events = [
      ...upToTheAsk(),
      fixture("usage", 7, {
        scope: "step",
        input_tokens: 1000,
        output_tokens: 100,
        cost: { usd: 0.02, estimated: true },
      }),
      fixture("usage", 8, {
        scope: "step",
        input_tokens: 500,
        output_tokens: 50,
        cost: { usd: 0.01, estimated: true },
      }),
    ];
    const summed = buildModel(events).spaces[0]?.run;
    expect(summed).toMatchObject({ inputTokens: 1500, outputTokens: 150, model: "opus-5" });
    expect(summed?.costUsd).toBeCloseTo(0.03);

    const replaced = buildModel([...events, fixture("usage", 9)]).spaces[0]?.run;
    expect(replaced).toMatchObject({ inputTokens: 82_140, outputTokens: 3402, costUsd: 1.47 });
  });

  it("counts what came from the prompt cache as a run's total does, and a step's adds to it", () => {
    const events = [
      ...upToTheAsk(),
      fixture("usage", 7, {
        scope: "step",
        input_tokens: 19_790,
        cache_read_tokens: 15_351,
        cache_write_tokens: 4435,
        output_tokens: 185,
      }),
      fixture("usage", 8, { scope: "step", input_tokens: 1000, cache_read_tokens: 900 }),
    ];
    expect(buildModel(events).spaces[0]?.run).toMatchObject({
      inputTokens: 20_790,
      cacheReadTokens: 16_251,
      cacheWriteTokens: 4435,
    });
    const total = fixture("usage", 9, {
      scope: "run",
      input_tokens: 25_000,
      cache_read_tokens: 20_000,
      cache_write_tokens: 0,
    });
    expect(buildModel([...events, total]).spaces[0]?.run).toMatchObject({
      inputTokens: 25_000,
      cacheReadTokens: 20_000,
      cacheWriteTokens: 0,
    });
    const plain = buildModel([...upToTheAsk(), fixture("usage", 7)]).spaces[0]?.run;
    expect(plain?.cacheReadTokens).toBeUndefined();
  });

  it("keeps the tokens out of a usage that does not know its tokens in (finding 11)", () => {
    const events = [
      ...upToTheAsk(),
      fixture("usage", 7, { scope: "step", input_tokens: undefined, output_tokens: 232 }),
    ];
    const run = buildModel(events).spaces[0]?.run;
    expect(run?.inputTokens).toBeUndefined();
    expect(run?.outputTokens).toBe(232);

    const counted = [
      ...events,
      fixture("usage", 8, { scope: "step", input_tokens: 1000, output_tokens: 8 }),
      fixture("usage", 9, { scope: "run", input_tokens: undefined, output_tokens: 300 }),
    ];
    expect(buildModel(counted).spaces[0]?.run).toMatchObject({
      inputTokens: 1000,
      outputTokens: 300,
    });
  });

  it("takes the cost of a usage that knows no tokens, and keeps the counts it had (ADR 0162)", () => {
    const events = [
      ...upToTheAsk(),
      fixture("usage", 7, { scope: "step", input_tokens: 1000, output_tokens: 8 }),
      fixture("usage", 8, {
        scope: "run",
        input_tokens: undefined,
        output_tokens: undefined,
        cost: { usd: 0.25, estimated: true },
      }),
    ];
    expect(buildModel(events).spaces[0]?.run).toMatchObject({
      inputTokens: 1000,
      outputTokens: 8,
      costUsd: 0.25,
    });
    const alone = [
      ...upToTheAsk(),
      fixture("usage", 7, { input_tokens: undefined, output_tokens: undefined }),
    ];
    const run = buildModel(alone).spaces[0]?.run;
    expect(run?.outputTokens).toBeUndefined();
    expect(run?.costUsd).toBe(1.47);
  });

  it("is paused by a person and carries on when resumed", () => {
    const paused = buildModel([...upToTheAsk(), fixture("run.pause", 7)]).spaces[0]?.run;
    expect(paused).toMatchObject({ state: "paused", paused: true });
    // The ask raised before the pause is still open, so it waits on that once resumed.
    const resumed = buildModel([...upToTheAsk(), fixture("run.pause", 7), fixture("run.resume", 8)])
      .spaces[0]?.run;
    expect(resumed).toMatchObject({ state: "waiting", paused: false });
    const answered = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
      fixture("run.pause", 8),
      fixture("run.resume", 9),
    ]).spaces[0]?.run;
    expect(answered).toMatchObject({ state: "running", paused: false });
  });

  it("stays paused through an ask and its answer, so only Resume sets it going (ADR 0293)", () => {
    const begun = [
      fixture("space.created", 1),
      fixture("membership.added", 2),
      fixture("run.started", 3),
      fixture("run.pause", 4),
    ];
    const asked = buildModel([...begun, fixture("approval.request", 5)]).spaces[0]?.run;
    expect(asked).toMatchObject({ state: "paused", paused: true });
    const answered = buildModel([
      ...begun,
      fixture("approval.request", 5),
      fixture("approval.resolved", 6, { decision: "approved", resolved_by: "usr_1" }),
    ]).spaces[0]?.run;
    expect(answered).toMatchObject({ state: "paused", paused: true });
  });

  it("says Pause holds it once its harness says so on a status (ADR 0293)", () => {
    const begun = [
      fixture("space.created", 1),
      fixture("membership.added", 2),
      fixture("run.started", 3),
    ];
    expect(buildModel([...begun, fixture("run.status", 4)]).spaces[0]?.run?.pausable).toBe(false);
    const said = buildModel([
      ...begun,
      fixture("run.status", 4, { pausable: true }),
      fixture("run.status", 5),
    ]).spaces[0]?.run;
    expect(said?.pausable).toBe(true);
  });

  it("counts the time it stood paused, so its clock counts working time (ADR 0293)", () => {
    const start = fixture("run.started", 3);
    const t = Date.parse(String(start.ts));
    const iso = (ms: number) => new Date(t + ms).toISOString();
    const run = buildModel([
      fixture("space.created", 1),
      fixture("membership.added", 2),
      start,
      fixture("run.pause", 4, { ts: iso(10_000) }),
      fixture("run.resume", 5, { ts: iso(70_000) }),
      fixture("run.pause", 6, { ts: iso(80_000) }),
    ]).spaces[0]?.run;
    expect(run).toMatchObject({ pausedMs: 60_000, pausedAt: iso(80_000), paused: true });
    const stopped = buildModel([
      fixture("space.created", 1),
      fixture("membership.added", 2),
      start,
      fixture("run.pause", 4, { ts: iso(10_000) }),
      fixture("run.cancel", 5, { ts: iso(25_000) }),
    ]).spaces[0]?.run;
    expect(stopped).toMatchObject({ pausedMs: 15_000, paused: false, state: "cancelled" });
  });

  it("says who stopped it where its bubble stood, when a person did (ADR 0293)", () => {
    const space = buildModel([...upToTheAsk(), fixture("run.cancel", 7)]).spaces[0];
    const line = space?.lines.at(-1);
    const run = space?.run;
    expect(line).toMatchObject({ kind: "system", authorId: run?.harnessId, authorKind: "harness" });
    expect(line?.text).toMatch(/^was stopped( by .+)?$/);
  });

  it("ends as cancelled when stopped, and never moves again", () => {
    const run = buildModel([
      ...upToTheAsk(),
      fixture("run.cancel", 7),
      fixture("run.resume", 8),
      fixture("run.status", 9),
    ]).spaces[0]?.run;
    expect(run).toMatchObject({
      state: "cancelled",
      paused: false,
      endedAt: fixture("run.cancel", 7).ts,
    });
    expect(run?.statusVerb).toBeUndefined();
  });

  it("shows a steer as a message from the person who said it, tagged with how they meant it", () => {
    const line = buildModel([...upToTheAsk(), fixture("run.steer", 7)]).spaces[0]?.lines.at(-1);
    expect(line).toMatchObject({
      kind: "text",
      authorId: "usr_01K4ZQPX000000000000000003",
      authorKind: "person",
      mode: "steer",
      text: "Mention the pallet count in the email as well.",
    });
  });

  it("draws a message from a kind of participant it has never heard of as a harness's (ADR 0088)", () => {
    const line = buildModel([
      fixture("space.created", 1),
      fixture("message.post", 2, {
        actor: { kind: "agent", id: "agt_01K4ZQPX000000000000000004" },
      }),
    ]).spaces[0]?.lines[0];
    expect(line).toMatchObject({
      authorId: "agt_01K4ZQPX000000000000000004",
      authorKind: "harness",
    });
  });

  it("keeps the key a line's event carried, so a receipt can find it", () => {
    const line = buildModel([
      fixture("space.created", 1),
      fixture("message.post", 2, { idempotency_key: "arjun-msg-7" }),
    ]).spaces[0]?.lines[0];
    expect(line?.key).toBe("arjun-msg-7");
  });

  it("knows when a run started and ended, and lists every run a space had", () => {
    const events = [
      ...upToTheAsk(),
      fixture("run.completed", 7),
      fixture("run.started", 8, { run_id: "run_01K4ZQPX00000000000000000B", goal: "Second" }),
    ];
    const space = buildModel(events).spaces[0];
    expect(space?.runs).toHaveLength(2);
    expect(space?.runs[0]).toMatchObject({
      state: "done",
      startedAt: fixture("run.started", 3).ts,
      endedAt: fixture("run.completed", 7).ts,
    });
    expect(space?.run?.goal).toBe("Second");
    // The summary line names its run, so the receipt underneath knows which one to draw.
    const summary = space?.lines.find((line) => line.kind === "summary");
    expect(summary?.runId).toBe("run_01K4ZQPX000000000000000005");
  });

  it("leaves a status line with the error when a run fails", () => {
    const space = buildModel([...upToTheAsk(), fixture("run.failed", 7)]).spaces[0];
    expect(space?.lines.at(-1)).toMatchObject({
      kind: "status",
      runId: "run_01K4ZQPX000000000000000005",
    });
    expect(space?.run?.error).toBeTruthy();
  });
});

describe("what a fold makes of the less common events", () => {
  it("keeps a run event that arrives before its run.started, as a run with nothing known yet", () => {
    const { spaces, fleet } = buildModel([
      fixture("space.created", 1),
      fixture("step.log", 2, { step_id: "read-po", status: "done" }),
    ]);
    const run = spaces[0]?.run;
    expect(run?.goal).toBe("");
    expect(run?.steps.map((step) => step.stepId)).toEqual(["read-po"]);
    // The harness is known from the event's actor, so the fleet still lists it.
    expect(fleet[0]?.harnessId).toBe(run?.harnessId);
  });

  it("removes a member", () => {
    const { spaces } = buildModel([
      fixture("space.created", 1),
      fixture("membership.added", 2, { participant_id: "usr_2", participant_kind: "person" }),
      fixture("membership.removed", 3, { participant_id: "usr_2" }),
    ]);
    expect(spaces[0]?.members).not.toContain("usr_2");
  });

  it("records what happened after a yes", () => {
    const run = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
      fixture("approval.executed", 8, { outcome: "failed" }),
    ]).spaces[0]?.run;
    expect(run?.approvals[0]?.executed).toBe("failed");
  });

  it("marks a run failed, with no verb phrase left showing", () => {
    const run = buildModel([...upToTheAsk(), fixture("run.failed", 7)]).spaces[0]?.run;
    expect(run?.state).toBe("failed");
    expect(run?.statusVerb).toBeUndefined();
  });

  it("drops a question that names no space, rather than throwing", () => {
    const { space_id: _none, ...homeless } = fixture("question.ask", 3);
    const model = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      homeless as ClientEvent,
    ]);
    expect(model.needsYou).toHaveLength(0);
  });
});

describe("many spaces", () => {
  it("keeps them apart and lists the most recent first", () => {
    const model = buildModel([
      fixture("space.created", 1, { space_id: "spc_a", title: "A" }),
      fixture("message.post", 2, { space_id: "spc_a", text: "in A" }),
      fixture("space.created", 3, { space_id: "spc_b", title: "B" }),
      fixture("message.post", 5, { space_id: "spc_b", text: "in B, later" }),
    ]);
    expect(model.spaces.map((c) => c.title)).toEqual(["B", "A"]);
    expect(model.spaces[1]?.lines.at(-1)?.text).toBe("in A");
  });
});

describe("approvals, questions, policy and the audit (M1.4)", () => {
  it("counts down from when the harness asked, and records how and when a decision was made", () => {
    const run = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, {
        decision: "edited",
        scope: "session",
        resolved_by: "usr_1",
        updated_input: { body: "Hi Dana — with the pallet count." },
        resolved_elsewhere: true,
      }),
    ]).spaces[0]?.run;
    const approval = run?.approvals[0];
    // The ask was at 14:22:04 with an hour to answer.
    expect(approval?.expiresAt).toBe("2026-09-02T15:22:04.004Z");
    expect(approval?.fallback).toBe("deny");
    expect(approval?.input).toMatchObject({ to: "dana@northwind.com" });
    expect(approval?.resolved).toMatchObject({
      decision: "edited",
      by: "usr_1",
      at: "2026-09-02T14:30:12.881Z",
      scope: "session",
      elsewhere: true,
      updatedInput: { body: "Hi Dana — with the pallet count." },
    });
  });

  it("keeps how the harness said its preview is drawn, and its heading (OpenClaw finding 7)", () => {
    const asked = buildModel(upToTheAsk()).spaces[0]?.run?.approvals[0];
    expect(asked).toMatchObject({
      preview: expect.stringContaining("Hi Dana"),
      previewFormat: "markdown",
      previewTitle: "To dana@northwind.com",
    });

    const diff = buildModel([
      ...upToTheAsk().slice(0, -1),
      fixture("approval.request", 6, {
        preview: { format: "diff", body: "-  120 units\n+  240 units" },
      }),
    ]).spaces[0]?.run?.approvals[0];
    expect(diff?.previewFormat).toBe("diff");
    expect(diff?.previewTitle).toBeUndefined();

    const bare = buildModel([
      ...upToTheAsk().slice(0, -1),
      fixture("approval.request", 6, { preview: undefined }),
    ]).spaces[0]?.run?.approvals[0];
    expect(bare?.preview).toBeUndefined();
    expect(bare?.previewFormat).toBeUndefined();
  });

  it("heads the card with the harness's question, then the preview's title, then the kind (ADR 0142)", () => {
    const asked = buildModel(upToTheAsk()).spaces[0]?.run?.approvals[0];
    expect(asked).toMatchObject({
      question: "Send this email to dana@northwind.com?",
      effect: expect.stringContaining("PO #4471"),
      lasts: "once",
    });
    if (asked === undefined) throw new Error("no approval");
    expect(askHeadline(asked)).toBe("Send this email to dana@northwind.com?");
    expect(askDetail(asked)).toBe(asked.effect);

    const unasked = { ...asked, question: undefined, effect: undefined, lasts: undefined };
    expect(askHeadline(unasked)).toBe("To dana@northwind.com");
    expect(askDetail(unasked)).toContain("Hi Dana");
    const bare = { ...unasked, previewTitle: undefined, preview: "" };
    expect(askHeadline(bare)).toBe("email.send to dana@northwind.com");
    expect(askDetail(bare)).toBeUndefined();

    // What waits on a person is headed the same way, so a banner asks the question too.
    const waiting = buildModel(upToTheAsk()).needsYou;
    expect(waiting.find((item) => item.kind === "approval")?.title).toBe(
      "Send this email to dana@northwind.com?",
    );
  });

  it("folds a question with its options, its timeout and, later, its answer", () => {
    const asked = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("question.ask", 3),
    ]).spaces[0]?.run;
    expect(asked?.state).toBe("waiting");
    const question = asked?.questions[0];
    expect(question).toMatchObject({
      askId: "qst_01K4ZQPX000000000000000009",
      onNoAnswer: "use_default",
      timeoutAt: "2026-09-02T15:22:05.004Z",
    });
    expect(question?.questions[0]).toMatchObject({
      questionId: "delivery-window",
      allowFreeText: true,
      multiSelect: false,
      defaultValue: "19",
    });
    expect(question?.questions[0]?.options.map((o) => o.label)).toEqual([
      "19 September",
      "26 September",
    ]);

    const answered = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("question.ask", 3),
      fixture("question.answered", 4, {
        answers: [{ question_id: "delivery-window", values: ["26"], free_text: "later" }],
      }),
    ]).spaces[0]?.run;
    expect(answered?.state).toBe("running");
    expect(answered?.questions[0]?.answered).toMatchObject({
      by: "usr_01K4ZQPX000000000000000003",
      timedOut: false,
      answers: [{ questionId: "delivery-window", values: ["26"], freeText: "later" }],
    });
  });

  it("puts a question with a default in Review today, and one without in Decide now", () => {
    const withDefault = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("question.ask", 3),
    ]).needsYou;
    expect(withDefault.find((item) => item.kind === "question")?.tier).toBe("review");

    const questions = (fixture("question.ask", 3)["questions"] as { default_value?: string }[]).map(
      ({ default_value: _none, ...rest }) => rest,
    );
    const without = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("question.ask", 3, { questions }),
    ]).needsYou;
    expect(without.find((item) => item.kind === "question")?.tier).toBe("decide");
  });

  it("lists a finished run to review and a checkpoint as FYI, each with its place in the log", () => {
    const { needsYou, spaces } = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, { decision: "approved", resolved_by: "usr_1" }),
      fixture("checkpoint", 8),
      fixture("run.completed", 9),
    ]);
    expect(needsYou.map((item) => [item.kind, item.tier, item.seq])).toEqual(
      expect.arrayContaining([
        ["checkpoint", "fyi", 8],
        ["summary", "review", 9],
      ]),
    );
    const checkpoint = spaces[0]?.lines.find((line) => line.kind === "checkpoint");
    expect(checkpoint?.text).toContain("PO read and the CRM record checked.");
    expect(checkpoint?.text).toContain("Next: Draft the confirmation email.");
  });

  it("folds a policy change into the harness's level in that room, the cap, and the budget", () => {
    const model = buildModel([
      fixture("space.created", 1),
      fixture("policy.updated", 2, {
        space_id: undefined,
        policy: { autonomy: 1, rules: [] },
        budget_usd: 25,
      }),
      fixture("policy.updated", 3, {
        policy: { autonomy: 3, rules: [{ match: "email.send", decision: "ask" }] },
        workspace_max_autonomy: 3,
      }),
      fixture("run.started", 4),
    ]);
    const harness = model.harnesses["hrn_01K4ZQPX000000000000000004"];
    expect(harness).toMatchObject({ autonomy: 1, maxAutonomy: 3, budgetUsd: 25, spentUsd: 0 });
    expect(harness?.bySpace["spc_01K4ZQPX000000000000000002"]?.autonomy).toBe(3);
    // The run's policy is the room's dial, capped by the workspace.
    expect(model.spaces[0]?.run?.policy).toMatchObject({ autonomy: 3, maxAutonomy: 3 });
    expect(model.spaces[0]?.run?.policy?.rules).toHaveLength(1);
  });

  it("adds up what a harness's runs have cost against its budget", () => {
    const model = buildModel([
      fixture("space.created", 1),
      fixture("policy.updated", 2, { space_id: undefined, budget_usd: 25 }),
      fixture("run.started", 3),
      fixture("usage", 4),
      fixture("run.completed", 5),
    ]);
    expect(model.harnesses["hrn_01K4ZQPX000000000000000004"]?.spentUsd).toBe(1.47);
  });

  it("keeps an audit of who decided what and when, newest first", () => {
    const { audit } = buildModel([
      ...upToTheAsk(),
      fixture("approval.resolved", 7, {
        decision: "denied",
        scope: "always",
        resolved_by: "usr_1",
        reason: "Not yet.",
      }),
      fixture("run.pause", 8, { by: "usr_1" }),
      fixture("policy.updated", 9, { changed_by: "usr_1" }),
      fixture("question.ask", 10),
      fixture("question.answered", 11),
    ]);
    expect(audit.map((entry) => [entry.seq, entry.kind, entry.who])).toEqual([
      [11, "question", "usr_01K4ZQPX000000000000000003"],
      [9, "policy", "usr_1"],
      [8, "run", "usr_1"],
      [7, "approval", "usr_1"],
    ]);
    expect(audit[3]).toMatchObject({ what: "denied email.send, always", reason: "Not yet." });
    expect(audit[2]?.what).toBe("paused the run");
    expect(audit[1]?.what).toContain("set autonomy to L2 here");
  });
});

describe("attachments (M1.5)", () => {
  it("puts a message's files on its line, as the server described them", () => {
    const model = buildModel([
      ...upToTheAsk(),
      fixture("message.post", 900, {
        idempotency_key: "with-a-file",
        attachments: [
          {
            attachment_id: "att_01K4ZQPX000000000000000008",
            filename: "PO-4471.pdf",
            mime_type: "application/pdf",
            byte_size: 184_302,
            sha256: "a".repeat(64),
          },
        ],
      }),
    ]);
    const line = model.spaces[0]?.lines.find((l) => l.key === "with-a-file");
    expect(line?.attachments).toEqual([
      {
        id: "att_01K4ZQPX000000000000000008",
        filename: "PO-4471.pdf",
        mimeType: "application/pdf",
        byteSize: 184_302,
        sha256: "a".repeat(64),
      },
    ]);
  });

  it("says when the room's files may have changed: a line with a file landing or taken back (ADR 0100)", () => {
    const page = (n: number) =>
      fixture("message.post", 900 + n, {
        idempotency_key: `page-${n}`,
        attachments: [
          {
            attachment_id: `att_01K4ZQPX00000000000000001${n}`,
            filename: "gallery.html",
            mime_type: "text/html",
            byte_size: 800 + n,
            sha256: "a".repeat(64),
          },
        ],
      });
    const key = (events: ReturnType<typeof upToTheAsk>) => {
      const space = buildModel(events).spaces[0];
      return space === undefined ? "" : fileLinesKey(space);
    };
    const before = key([...upToTheAsk(), page(1)]);
    expect(key([...upToTheAsk(), page(1), fixture("message.post", 950)])).toBe(before);
    expect(key([...upToTheAsk(), page(1), page(2)])).not.toBe(before);
  });

  it("leaves out of Files a voice note and a photo a picker named, and keeps a named one (ADR 0100)", () => {
    expect(inFiles("ascii-alphabet.html", "text/html")).toBe(true);
    expect(inFiles("preview.png", "image/png")).toBe(true);
    expect(inFiles("Scan Sep 30, 2026 at 5.50 PM.jpg", "image/jpeg")).toBe(true);
    expect(inFiles("voice-note-0913-1142.m4a", "audio/mp4")).toBe(false);
    expect(inFiles("interview.m4a", "audio/mp4")).toBe(true);
    for (const picked of ["image.png", "image.jpg", "IMG_0233.png", "photo-1.jpg", "video-2.mp4"]) {
      expect(inFiles(picked, picked.endsWith("mp4") ? "video/mp4" : "image/jpeg")).toBe(false);
    }
    expect(inFiles("image.png", "application/octet-stream")).toBe(true);
  });

  it("shows a harness's read of a file as a muted line and an audit entry", () => {
    const model = buildModel([...upToTheAsk(), fixture("attachment.fetched", 901)]);
    const line = model.spaces[0]?.lines.at(-1);
    expect(line).toMatchObject({ kind: "system", authorKind: "harness", text: "read PO-4471.pdf" });
    expect(model.audit[0]).toMatchObject({ kind: "attachment", what: "read PO-4471.pdf" });
  });
});

describe("connections (M1.6)", () => {
  it("lists what each harness has sent, so a profile can light its checklist", () => {
    const model = buildModel(upToTheAsk());
    const scout = model.connections["hrn_01K4ZQPX000000000000000004"];
    expect(scout?.seen).toEqual(
      expect.arrayContaining(["run.started", "step.log", "approval.request"]),
    );
    expect(scout?.seen).not.toContain("membership.added");
    expect(scout?.lastSeenAt).toBeDefined();
    expect(model.connections["usr_01K4ZQPX000000000000000003"]).toBeUndefined();
  });
});

describe("feedback on a harness's line (M3.4)", () => {
  const ARJUN = "usr_01K4ZQPX000000000000000003";
  const DANA = "usr_01K4ZQPX000000000000000009";
  /** The `message.post` fixture's line, by the id the wire gives its message. */
  const SAID = "msg_01K4ZQPX000000000000000067";
  const from = (id: string, name: string) => ({
    participant_id: id,
    kind: "person",
    display_name: name,
    role: "member",
  });

  function said(): ClientEvent[] {
    return [
      fixture("space.created", 1),
      fixture("membership.added", 2),
      fixture("message.post", 3),
    ];
  }

  it("folds a reaction and a note onto the line they are about, and into the audit", () => {
    const { spaces, audit } = buildModel([
      ...said(),
      fixture("feedback", 4, {
        kind: "reaction",
        reaction: "👎",
        text: undefined,
        message_id: SAID,
        from: from(ARJUN, "Arjun"),
      }),
      fixture("feedback", 5, {
        message_id: SAID,
        actor: { kind: "person", id: DANA },
        from: from(DANA, "Dana"),
      }),
    ]);
    const line = spaces[0]?.lines.find((each) => each.text.startsWith("The PO is for"));
    expect(line?.reactions).toEqual([{ by: ARJUN, reaction: "👎", seq: 4 }]);
    expect(line?.corrections).toEqual([
      {
        by: DANA,
        text: "The delivery date is the 19th, not the 12th.",
        ts: "2026-09-02T14:22:27.004Z",
        seq: 5,
      },
    ]);
    expect(audit.map((entry) => [entry.kind, entry.who, entry.what, entry.reason])).toEqual([
      [
        "feedback",
        DANA,
        "said what went wrong with a message",
        "The delivery date is the 19th, not the 12th.",
      ],
      ["feedback", ARJUN, "reacted 👎", undefined],
    ]);
  });

  it("counts a person's reaction once when the same event arrives twice, and takes it back on a second tap (M5.4)", () => {
    const thumbs = fixture("feedback", 4, {
      kind: "reaction",
      reaction: "👎",
      text: undefined,
      message_id: SAID,
      from: from(ARJUN, "Arjun"),
    });
    const once = buildModel([...said(), thumbs, thumbs]);
    const line = (model: WorkspaceModel) =>
      model.spaces[0]?.lines.find((each) => each.text.startsWith("The PO is for"));
    expect(line(once)?.reactions).toHaveLength(1);
    const again = buildModel([...said(), thumbs, { ...thumbs, seq: 5, id: "evt_again" }]);
    expect(line(again)?.reactions).toEqual([]);
    const thrice = buildModel([
      ...said(),
      thumbs,
      { ...thumbs, seq: 5, id: "evt_again" },
      { ...thumbs, seq: 6, id: "evt_thrice" },
    ]);
    expect(line(thrice)?.reactions).toEqual([{ by: ARJUN, reaction: "👎", seq: 6 }]);
  });

  it("is taken by what a harness said and the summary of its run, not by a person's line", () => {
    const { spaces } = buildModel([
      ...said(),
      fixture("message.post", 4, { actor: { kind: "person", id: ARJUN }, text: "Thanks." }),
      fixture("run.started", 5),
      fixture("run.completed", 6),
    ]);
    const lines = spaces[0]?.lines ?? [];
    expect(lines.map((line) => [line.kind, takesFeedback(line)])).toEqual([
      ["text", true],
      ["text", false],
      ["summary", true],
    ]);
    expect(takesFeedback({ ...(lines[0] as Line), pending: true })).toBe(false);
  });

  it("leaves everything alone when the line is not here, rather than throwing", () => {
    const model = buildModel([
      ...said(),
      fixture("feedback", 4, {
        message_id: "msg_01K4ZQPX00000000000000ZZZZ",
        from: from(ARJUN, "Arjun"),
      }),
    ]);
    expect(model.spaces[0]?.lines.every((line) => line.corrections === undefined)).toBe(true);
    expect(model.audit).toHaveLength(0);
  });
});

describe("the lines a space draws", () => {
  const room = (lines: readonly Partial<Line>[]): Space =>
    ({
      id: "sp_1",
      lines: lines.map((line, index) => ({
        id: `ln_${index + 1}`,
        seq: index + 1,
        kind: "text",
        authorId: "per_dana",
        authorKind: "person",
        text: "hello",
        ts: "2026-09-07T10:00:00.000Z",
        ...line,
      })),
    }) as unknown as Space;

  it("leaves out an empty system line, which is a fold's leftover, not a thing that happened", () => {
    const drawn = room([
      {},
      { kind: "system", text: "" },
      { kind: "system", text: "read PO-4471.pdf" },
    ]);
    expect(visibleLines(drawn, []).map((each) => each.id)).toEqual(["ln_1", "ln_3"]);
  });

  it("draws a lane once: the route card in the space that did the routing, not the task card too", () => {
    const lanes = [
      { laneId: "la_a", homeSpaceId: "sp_1", linkedSpaceIds: ["sp_1"] } as unknown as Lane,
    ];
    const drawn = room([
      { id: "r", kind: "route", laneId: "la_a" },
      { id: "t", kind: "task", laneId: "la_a" },
    ]);
    expect(visibleLines(drawn, lanes).map((each) => each.id)).toEqual(["r"]);
  });

  it("keeps the task card where the lane is not also linked here", () => {
    const lanes = [
      { laneId: "la_a", homeSpaceId: "sp_1", linkedSpaceIds: ["sp_other"] } as unknown as Lane,
    ];
    const drawn = room([{ id: "t", kind: "task", laneId: "la_a" }]);
    expect(visibleLines(drawn, lanes).map((each) => each.id)).toEqual(["t"]);
  });
});

describe("a group space (M3.3)", () => {
  const ARJUN = "usr_01K4ZQPX000000000000000003";
  const DANA = "usr_01K4ZQPX000000000000000009";
  const SCOUT = "hrn_01K4ZQPX000000000000000004";
  const LEDGER = "hrn_01K4ZQPX00000000000000000B";
  const SPACE = "spc_01K4ZQPX000000000000000002";

  function room(): ClientEvent[] {
    return [
      fixture("space.created", 1, { title: "Northwind", kind: "group" }),
      fixture("membership.added", 2, { participant_id: SCOUT, participant_kind: "harness" }),
      fixture("membership.added", 3, { participant_id: LEDGER, participant_kind: "harness" }),
      fixture("membership.added", 4, {
        participant_id: DANA,
        participant_kind: "person",
        role: "guest",
      }),
    ];
  }

  it("knows who opened it and everyone's standing in it", () => {
    const space = buildModel(room()).spaces[0];
    expect(space?.openedBy).toBe(ARJUN);
    expect(space?.state).toBe("open");
    expect(space?.roles).toEqual({
      [ARJUN]: "owner",
      [SCOUT]: "member",
      [LEDGER]: "member",
      [DANA]: "guest",
    });
    const gone = buildModel([
      ...room(),
      fixture("membership.removed", 5, { participant_id: DANA }),
    ]);
    expect(gone.spaces[0]?.roles[DANA]).toBeUndefined();
  });

  it("is retitled, closed and reopened, each said in the room as a muted line", () => {
    const retitled = buildModel([
      ...room(),
      fixture("space.updated", 5, { title: "Northwind quotes" }),
    ]).spaces[0];
    expect(retitled?.title).toBe("Northwind quotes");
    expect(retitled?.lines.at(-1)).toMatchObject({
      kind: "system",
      authorId: ARJUN,
      text: "renamed this space to Northwind quotes",
    });

    const closed = fixture("space.updated", 6, { state: "closed" });
    delete (closed as Record<string, unknown>)["title"];
    const shut = buildModel([...room(), closed]).spaces[0];
    expect(shut?.state).toBe("closed");
    expect(shut?.title).toBe("Northwind");
    expect(shut?.lines.at(-1)?.text).toBe("archived this space");

    const reopened = buildModel([...room(), closed, { ...closed, seq: 7, state: "open" }]);
    expect(reopened.spaces[0]?.state).toBe("open");
    expect(reopened.spaces[0]?.lines.at(-1)?.text).toBe("unarchived this space");
  });

  it("knows a room a harness can open again, by the key it was opened under", () => {
    expect(buildModel(room()).spaces[0]?.keyed).toBe(false);
    const keyed = fixture("space.created", 1, {
      kind: "direct",
      title: "Chess Game",
      external_key: "hrn_1:chess",
    });
    expect(buildModel([keyed]).spaces[0]?.keyed).toBe(true);
  });

  it("becomes the harness's when it claims a room a person asked it for, and takes its name", () => {
    const asked = fixture("space.created", 1, { kind: "direct", asked_of: SCOUT });
    delete (asked as Record<string, unknown>)["title"];
    const waiting = buildModel([asked]).spaces[0];
    expect(waiting?.keyed).toBe(false);
    expect(waiting?.title).toBeUndefined();

    const claimed = fixture("space.claimed", 2, { actor: { kind: "harness", id: SCOUT } });
    const room = buildModel([asked, claimed]).spaces[0];
    expect(room?.keyed).toBe(true);
    expect(room?.openedBy).toBe(SCOUT);
    expect(room?.title).toBe("Kitchen remodel");
    // Nobody renamed it: it was waiting to be called something, and says nothing about it.
    expect(room?.lines).toEqual([]);

    // A claim with no name leaves the one it had.
    const unnamed = fixture("space.claimed", 2, { actor: { kind: "harness", id: SCOUT } });
    delete (unnamed as Record<string, unknown>)["title"];
    const named = { ...asked, title: "Mine" };
    expect(buildModel([named, unnamed]).spaces[0]?.title).toBe("Mine");
  });

  it("says a room's last words as plain words, or that it needs a yes", () => {
    const said = fixture("message.post", 2, {
      run_id: undefined,
      text: "The **[LEGO City Yellow Bulldozer](https://example.com)** is back",
    });
    expect(lastWords(buildModel([fixture("space.created", 1), said]).spaces[0] as Space)).toBe(
      "The LEGO City Yellow Bulldozer is back",
    );
    expect(lastWords(buildModel(upToTheAsk()).spaces[0] as Space)).toBe("Needs a yes");
    expect(lastWords(buildModel([fixture("space.created", 1)]).spaces[0] as Space)).toBe("");
  });

  it("hands a row the start of a long message, not all of it (ADR 0181)", () => {
    const room = (text: string) => {
      const posted = fixture("message.post", 2, { run_id: undefined, text });
      return buildModel([fixture("space.created", 1), posted]).spaces[0] as Space;
    };
    // A reply of eleven thousand characters, as one room's last was: a row lays out what it is
    // given to cut it to a line, so it is given the line's start and a good deal more than fits.
    const long = `**Verdict:** the ${"quiet, light and cheap one ".repeat(500)}wins.`;
    const words = lastWords(room(long));
    expect(words.startsWith("Verdict: the quiet, light and cheap one")).toBe(true);
    expect(words).toHaveLength(200);
    // Never ending on half of a character outside the basic plane.
    const emoji = lastWords(room(`${"a".repeat(199)}${"🥔".repeat(10)}`));
    expect(emoji).toBe("a".repeat(199));
  });

  it("says a queued turn as work, and says while it is going (ADR 0090)", () => {
    const turn = (text: string) => {
      const posted = fixture("message.post", 2, { run_id: undefined, text });
      return buildModel([fixture("space.created", 1), posted]).spaces[0] as Space;
    };
    // The harness's own markup for Telegram and Slack, said in the room's register instead:
    // no thought-bubble emoji, no triangle, the runtime's prefix off the tool's id.
    const working = turn(
      "💭 Reading the news…\n▸ local-dev__web_search · Starship Flight 14 results",
    );
    expect(lastWords(working)).toBe("Reading the news · web search · Starship Flight 14 results");
    expect(spaceWorking(working)).toBe(true);

    // Over: the receipt the harness writes itself, and the light goes out.
    const done = turn("💭 Worked 25s · 2 steps");
    expect(lastWords(done)).toBe("Worked 25s · 2 steps");
    expect(spaceWorking(done)).toBe(false);

    // A message that merely opens with the emoji is not one of these, and is said as it is.
    const loose = turn("💭 is the emoji for a thought.\nThis message is not one of those bubbles.");
    expect(lastWords(loose)).toContain("💭 is the emoji for a thought.");
    expect(spaceWorking(loose)).toBe(false);
  });

  it("says a run's goal beside the room only when the room does not already show it", () => {
    const goal = (fields: Record<string, unknown>) => {
      const model = buildModel([fixture("space.created", 1), fixture("run.started", 2, fields)]);
      return goalWords(model.spaces[0]?.run as Run);
    };
    // Nobody typed it: the header and the run panel are where it is read.
    expect(goal({ goal: "Reconcile the ledger." })).toBe("Reconcile the ledger.");
    // A message sent here, or a prompt at the harness drawn as one: the room has it already.
    expect(goal({ goal: "Help refine this.", goal_from: "chips" })).toBeUndefined();
    expect(goal({ goal: "Help refine this.", goal_from: "harness" })).toBeUndefined();
    expect(goal({ goal: "" })).toBeUndefined();
  });

  it("says a room with a run of its own is working, and one waiting on a person is not", () => {
    const running = buildModel([fixture("space.created", 1), fixture("run.started", 2)])
      .spaces[0] as Space;
    expect(spaceWorking(running)).toBe(true);
    expect(spaceWorking(buildModel(upToTheAsk()).spaces[0] as Space)).toBe(false);
    expect(spaceWorking(buildModel([fixture("space.created", 1)]).spaces[0] as Space)).toBe(false);
  });

  it("says who a room was asked of, and goes by New space until the harness does something", () => {
    const asked = fixture("space.created", 1, { kind: "direct", asked_of: SCOUT });
    delete (asked as Record<string, unknown>)["title"];
    const brief = fixture("message.post", 2, {
      id: "evt_01K4ZQPX0000000000000000B1",
      actor: { kind: "person", id: "usr_01K4ZQPX000000000000000003" },
      run_id: undefined,
      text: "Plan the **kitchen remodel**:\n two quotes, a budget   and a start date.",
    });
    const waiting = buildModel([asked, brief]).spaces[0] as Space;
    expect(waiting.askedOf).toBe(SCOUT);
    expect(askedName(waiting)).toBe(NEW_SPACE_NAME);

    // Claimed with no name, or answered in with none: the first words stand in, as plain words on
    // one line.
    const claimed = fixture("space.claimed", 3, { actor: { kind: "harness", id: SCOUT } });
    delete (claimed as Record<string, unknown>)["title"];
    const words = "Plan the kitchen remodel: two quotes, a budget and a start date.";
    expect(askedName(buildModel([asked, brief, claimed]).spaces[0] as Space)).toBe(words);
    const answer = fixture("message.post", 3, {
      id: "evt_01K4ZQPX0000000000000000B2",
      actor: { kind: "harness", id: SCOUT },
      run_id: undefined,
      text: "On it.",
    });
    expect(askedName(buildModel([asked, brief, answer]).spaces[0] as Space)).toBe(words);
    // Answered before anybody said anything worth a name: still waiting to be called something.
    expect(askedName(buildModel([asked, claimed]).spaces[0] as Space)).toBe(NEW_SPACE_NAME);

    // A name is read from the start of the message, as a row's line is (SEC-3): the list draws
    // it on every render, and a 64 KB first message is not parsed whole for it.
    const long = fixture("message.post", 2, {
      id: "evt_01K4ZQPX0000000000000000B3",
      actor: { kind: "person", id: "usr_01K4ZQPX000000000000000003" },
      run_id: undefined,
      text: `Plan the remodel. ${"[".repeat(10_000)}`,
    });
    const cut = askedName(buildModel([asked, long, claimed]).spaces[0] as Space) ?? "";
    expect(cut.startsWith("Plan the remodel. [[[")).toBe(true);
    expect(cut).toHaveLength(4000);

    // Named, by the harness or a person, or never asked of anybody: the rule has nothing to say.
    const named = fixture("space.claimed", 3, { actor: { kind: "harness", id: SCOUT } });
    expect(askedName(buildModel([asked, brief, named]).spaces[0] as Space)).toBeUndefined();
    expect(askedName(buildModel(room()).spaces[0] as Space)).toBeUndefined();
    expect(buildModel(room()).spaces[0]?.askedOf).toBeUndefined();
  });

  it("goes when erased, with its threads and the lanes that lived in it (ADR 0067)", () => {
    const other = fixture("space.created", 10, {
      space_id: "spc_01K4ZQPX0000000000000OTHER",
      title: "India trip",
      kind: "group",
    });
    const thread = fixture("space.created", 11, {
      space_id: "spc_01K4ZQPX000000000000THREAD",
      kind: "thread",
      parent_space_id: room()[0]?.space_id,
      root_message_id: "msg_01K4ZQPX0000000000000000AA",
    });
    const erased = fixture("space.erased", 12, {
      erased: [room()[0]?.space_id, "spc_01K4ZQPX000000000000THREAD"],
    });

    // A lane whose specialist worked in the erased room: its opening went with the room.
    const lane = fixture("run.requested", 9, { space_id: room()[0]?.space_id });
    expect(buildModel([...room(), lane]).lanes).toHaveLength(1);

    const model = buildModel([...room(), lane, other, thread, erased]);

    expect(model.spaces.map((space) => space.id)).toEqual(["spc_01K4ZQPX0000000000000OTHER"]);
    expect(model.lanes).toEqual([]);
    // The tombstone names no space of its own, so it brings none back.
    expect(model.spaces).toHaveLength(1);
  });

  it("is not made again by an event that names it after it was erased (agents review, finding 11)", () => {
    // The release of an erased room's agents names the room, and came after the tombstone.
    const erased = fixture("space.erased", 12, { erased: [room()[0]?.space_id] });
    const released = fixture("agent.released", 13, {
      space_id: room()[0]?.space_id,
      agent_id: "agt_01K4ZQPX000000000000000007",
      reason: "deleted",
    });
    expect(buildModel([...room(), erased, released]).spaces).toEqual([]);
  });

  it("carries whom a message mentions, as Chips resolved it", () => {
    const { spaces } = buildModel([
      ...room(),
      fixture("message.post", 5, { text: "@Ledger check the warehouse", mentions: [LEDGER] }),
      fixture("message.post", 6, { text: "no handles", mentions: [] }),
    ]);
    const lines = spaces[0]?.lines ?? [];
    expect(lines.at(-2)?.mentions).toEqual([LEDGER]);
    expect(lines.at(-1)?.mentions).toBeUndefined();
  });

  it("names the authors of a room's lines only once a third participant is in it", () => {
    const two = buildModel([
      fixture("space.created", 1, { title: "Northwind", kind: "group" }),
      fixture("membership.added", 2, { participant_id: SCOUT, participant_kind: "harness" }),
    ]).spaces[0];
    expect(two?.members).toHaveLength(2);
    expect(namesAuthors(two as Space)).toBe(false);

    // The same room with Dana in it: now which of them said a thing is a question.
    const three = buildModel(room()).spaces[0];
    expect(namesAuthors(three as Space)).toBe(true);
  });

  it("tells harness-to-harness traffic from a harness talking to the room", () => {
    const isHarness = (id: string) => id.startsWith("hrn_");
    const { spaces } = buildModel([
      ...room(),
      fixture("message.post", 5, { text: "@Ledger which warehouse?", mentions: [LEDGER] }),
      fixture("message.post", 6, { text: "@Arjun done", mentions: [ARJUN] }),
      fixture("message.post", 7, { text: "Working on it." }),
      fixture("message.post", 8, {
        actor: { kind: "person", id: ARJUN },
        text: "@Scout thanks",
        mentions: [SCOUT],
      }),
    ]);
    const lines = spaces[0]?.lines ?? [];
    expect(lines.slice(-4).map((line) => betweenHarnesses(line, isHarness))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("folds what harnesses addressed to harnesses, and what the guard held (ADR 0081)", () => {
    const isHarness = (id: string) => id.startsWith("hrn_");
    const { spaces } = buildModel([
      ...room(),
      fixture("message.post", 5, { text: "Is it booked?", addressed_to: [LEDGER] }),
      fixture("message.post", 6, { text: "@Arjun done", mentions: [ARJUN], addressed_to: [] }),
      fixture("message.post", 7, { text: "And again?", addressed_to: [], held: true }),
      // Addressed now, whatever it names: Chips decided.
      fixture("message.post", 8, { text: "@Ledger fyi", mentions: [LEDGER], addressed_to: [] }),
    ]);
    const lines = spaces[0]?.lines ?? [];
    expect(lines.slice(-4).map((line) => betweenHarnesses(line, isHarness))).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(lines.at(-2)).toMatchObject({ held: true, addressedTo: [] });
  });

  it("folds an agent's check-in as its heartbeat's, and nothing else as one (ADR 0143)", () => {
    const { spaces } = buildModel([
      ...room(),
      fixture("message.post", 5, { text: "It reaches 94°F by 3 PM.", heartbeat: true }),
      fixture("message.post", 6, { text: "Working on it." }),
    ]);
    const lines = spaces[0]?.lines ?? [];
    expect(lines.at(-2)).toMatchObject({ text: "It reaches 94°F by 3 PM.", heartbeat: true });
    expect(lines.at(-1)?.heartbeat).toBeUndefined();
  });

  it("folds an agent's context compacting as one quiet line of its own (ADR 0146)", () => {
    const { spaces } = buildModel([...room(), fixture("context.compacted", 5)]);
    const line = spaces[0]?.lines.at(-1);
    expect(line).toMatchObject({
      kind: "system",
      authorId: "agt_01K4ZQPX0000000000000000A1",
      authorKind: "harness",
      text: "compacted its context · 214k → 21k tokens",
      compacted: { from: 214_000, to: 21_000, window: 272_000, by: "itself" },
    });
  });

  describe("who a message is for (ADR 0081)", () => {
    const DIRECTORY: Directory = {
      [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
      [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
      [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout" },
      [LEDGER]: { id: LEDGER, kind: "harness", displayName: "Ledger" },
    };
    let seq = 4;
    const said = (by: string, text: string, extra: Record<string, unknown> = {}) => {
      seq += 1;
      return fixture("message.post", seq, {
        // Three digits, the same id under 100: the long stretches here run past it.
        id: `evt_01K4ZQPX000000000000000${String(seq).padStart(3, "0")}`,
        actor: { kind: by.startsWith("hrn_") ? "harness" : "person", id: by },
        text,
        ...extra,
      });
    };
    const spaceOf = (events: ClientEvent[]) => buildModel(events).spaces[0] as Space;

    it("knows the harnesses a message here can be for, not one that was removed", () => {
      const space = spaceOf(room());
      expect(harnessesIn(space, DIRECTORY)).toEqual([SCOUT, LEDGER]);
      const removed = { ...DIRECTORY, [LEDGER]: { ...DIRECTORY[LEDGER], removedAt: "x" } };
      expect(harnessesIn(space, removed as Directory)).toEqual([SCOUT]);
    });

    it("aims an unnamed message at every harness at first, then where the last one went", () => {
      const first = spaceOf(room());
      expect(nextAddress(first, DIRECTORY, ARJUN)).toEqual([SCOUT, LEDGER]);
      const after = spaceOf([...room(), said(ARJUN, "@Ledger hi", { addressed_to: [LEDGER] })]);
      expect(nextAddress(after, DIRECTORY, ARJUN)).toEqual([LEDGER]);
      // Dana has not spoken here: hers is still every harness.
      expect(nextAddress(after, DIRECTORY, DANA)).toEqual([SCOUT, LEDGER]);
    });

    it("lets an @ in the draft decide, and says when none does", () => {
      const space = spaceOf(room());
      expect(draftAddress("no handle", space, DIRECTORY)).toBeUndefined();
      expect(draftAddress("@nobody here", space, DIRECTORY)).toBeUndefined();
      expect(draftAddress("@Ledger and @dana", space, DIRECTORY)).toEqual([LEDGER]);
      expect(draftAddress("@dana only", space, DIRECTORY)).toEqual([]);
      expect(draftAddress("@all hi", space, DIRECTORY)).toEqual([SCOUT, LEDGER]);
    });

    it("reads an @ as the server does: whole names first, and a harness's name for its one agent (ADR 0091)", () => {
      const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
      const CLAW = "hrn_01K4ZQPX0000000000OPENCLAW";
      const HELLO = "agt_01K4ZQPX000000000000HELLO";
      const ONE = "agt_01K4ZQPX0000000000000ONE";
      const TWO = "agt_01K4ZQPX0000000000000TWO";
      const agents: Directory = {
        ...DIRECTORY,
        [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian" },
        [CLAW]: { id: CLAW, kind: "harness", displayName: "OpenClaw" },
        [HELLO]: { id: HELLO, kind: "agent", harnessId: JACOBIAN, displayName: "Hello" },
        [ONE]: { id: ONE, kind: "agent", harnessId: CLAW, displayName: "OpenClaw" },
        [TWO]: { id: TWO, kind: "agent", harnessId: CLAW, displayName: "OpenClaw 2" },
      };
      for (const members of [
        [ARJUN, HELLO, TWO, ONE],
        [ARJUN, HELLO, ONE, TWO],
      ]) {
        const space = { ...spaceOf(room()), members };
        expect(draftAddress("@OpenClaw over to you", space, agents)).toEqual([ONE]);
        expect(draftAddress("@OpenClaw2 over to you", space, agents)).toEqual([TWO]);
        expect(draftAddress("@Jacobian hi", space, agents)).toEqual([HELLO]);
        expect(mentionablesIn(space, agents).find((each) => each.id === HELLO)?.also).toEqual([
          "Jacobian",
        ]);
        // OpenClaw has two agents here, so its name is neither's by `also`.
        expect(mentionablesIn(space, agents).find((each) => each.id === TWO)?.also).toBeUndefined();
        // What the field's list says under each.
        expect(roomHandles(space, agents)).toMatchObject({
          [ONE]: "@OpenClaw",
          [TWO]: "@OpenClaw2",
          [HELLO]: "@Hello",
        });
      }
    });

    it("aims by @, then the pick, then the default, and has no aim with only one other", () => {
      const space = spaceOf([...room(), said(ARJUN, "hi", { addressed_to: [SCOUT] })]);
      expect(aimOf("hello", undefined, space, DIRECTORY, ARJUN)).toEqual({
        ids: [SCOUT],
        by: "default",
      });
      expect(aimOf("hello", [LEDGER], space, DIRECTORY, ARJUN)).toEqual({
        ids: [LEDGER],
        by: "pick",
      });
      expect(aimOf("@Scout hello", [LEDGER], space, DIRECTORY, ARJUN)).toEqual({
        ids: [SCOUT],
        by: "at",
      });
      expect(aimOf("hello", ["hrn_gone"], space, DIRECTORY, ARJUN)?.by).toBe("default");
      const alone = spaceOf(
        room().filter((event) => ![LEDGER, DANA].includes(String(event["participant_id"]))),
      );
      expect(aimOf("hello", undefined, alone, DIRECTORY, ARJUN)).toBeUndefined();
    });

    it("aims a reply to an agent's message at it, under an @ and over a pick (ADR 0219)", () => {
      const space = spaceOf([
        ...room(),
        said(LEDGER, "Booked for 6"),
        said(DANA, "Can I come?"),
        said(ARJUN, "hi", { addressed_to: [SCOUT] }),
      ]);
      const idOf = (text: string) => space.lines.find((line) => line.text === text)?.id as string;
      const ledgers = idOf("Booked for 6");
      expect(replyAgent(space, DIRECTORY, ledgers)).toBe(LEDGER);
      expect(aimOf("Make it 8", [SCOUT], space, DIRECTORY, ARJUN, ledgers)).toEqual({
        ids: [LEDGER],
        by: "reply",
      });
      expect(aimOf("@Scout make it 8", undefined, space, DIRECTORY, ARJUN, ledgers)?.by).toBe("at");
      // A reply to a person's message, or your own, or one not here, changes nothing.
      for (const other of [idOf("Can I come?"), idOf("hi"), "evt_not_here"]) {
        expect(replyAgent(space, DIRECTORY, other)).toBeUndefined();
        expect(aimOf("Yes", undefined, space, DIRECTORY, ARJUN, other)?.by).toBe("default");
      }
    });

    it("sends the aim as to, but not an @'s, nor one for nobody", () => {
      expect(wireTo({ ids: [LEDGER], by: "pick" })).toEqual([LEDGER]);
      expect(wireTo({ ids: [SCOUT, LEDGER, DANA], by: "default", all: true })).toBe("all");
      // A list of every agent stays a list (ADR 0114), and a person picked goes too (ADR 0204).
      expect(wireTo({ ids: [SCOUT, LEDGER], by: "pick" })).toEqual([SCOUT, LEDGER]);
      expect(wireTo({ ids: [DANA], by: "pick" })).toEqual([DANA]);
      expect(wireTo({ ids: [LEDGER], by: "at" })).toBeUndefined();
      // Nor a reply's: Chips makes it the agent's, and a to would outrank that (ADR 0219).
      expect(wireTo({ ids: [LEDGER], by: "reply" })).toBeUndefined();
      expect(wireTo({ ids: [], by: "default" })).toBeUndefined();
      expect(wireTo(undefined)).toBeUndefined();
    });

    it("says an aim as Everyone, No agent, or the names", () => {
      const space = spaceOf(room());
      expect(
        aimWordsOf({ ids: [LEDGER, SCOUT, DANA], by: "pick", all: true }, space, DIRECTORY),
      ).toBe("Everyone");
      expect(aimWordsOf({ ids: [LEDGER, SCOUT], by: "pick" }, space, DIRECTORY)).toBe(
        "Ledger and Scout",
      );
      expect(aimWords([], space, DIRECTORY)).toBe("No agent");
      expect(aimWords([LEDGER], space, DIRECTORY)).toBe("Ledger");
    });

    it("draws a route only where a person's address changed (A2)", () => {
      const space = spaceOf([
        ...room(),
        said(ARJUN, "From before"),
        said(ARJUN, "@Ledger is it in?", { addressed_to: [LEDGER] }),
        said(ARJUN, "and the PR?", { addressed_to: [LEDGER] }),
        said(DANA, "hi", { addressed_to: [SCOUT, LEDGER] }),
        said(ARJUN, "your turn", { addressed_to: [SCOUT] }),
        said(SCOUT, "@Ledger over to you", { addressed_to: [LEDGER] }),
        said(ARJUN, "@dana look", { addressed_to: [] }),
        said(ARJUN, "both", { addressed_to: [LEDGER, SCOUT] }),
        said(ARJUN, "both again", { addressed_to: [SCOUT, LEDGER] }),
      ]);
      const routes = routesIn(space, DIRECTORY);
      const drawn = space.lines
        .filter((line) => routes.has(line.id))
        .map((line) => [line.text, routes.get(line.id)?.to]);
      expect(drawn).toEqual([
        ["@Ledger is it in?", [LEDGER]],
        ["hi", [SCOUT, LEDGER]],
        ["your turn", [SCOUT]],
        ["both", [LEDGER, SCOUT]],
      ]);
      expect(routes.get(space.lines.find((line) => line.text === "hi")?.id ?? "")?.from).toBe(DANA);
    });

    it("keeps Everyone as everyone when a harness joins: the capsule says so, and no route is drawn", () => {
      const TREE = "hrn_01K4ZQPX00000000000000TREE";
      const directory: Directory = {
        ...DIRECTORY,
        [TREE]: { id: TREE, kind: "harness", displayName: "Tree" },
      };
      const joined = fixture("membership.added", 90, {
        participant_id: TREE,
        participant_kind: "harness",
      });
      const space = spaceOf([
        ...room(),
        said(ARJUN, "hi all", { addressed_to: [SCOUT, LEDGER], addressed_to_all: true }),
        joined,
      ]);
      const aim = aimOf("next", undefined, space, directory, ARJUN);
      expect(aim).toEqual({ ids: [SCOUT, LEDGER, TREE, DANA], by: "default", all: true });
      expect(aim === undefined ? "" : aimWordsOf(aim, space, directory)).toBe("Everyone");
      expect(wireTo(aim)).toBe("all");

      // Picked by name, the two stay two when a third joins.
      const named = spaceOf([
        ...room(),
        said(ARJUN, "you two", { addressed_to: [SCOUT, LEDGER] }),
        joined,
      ]);
      expect(nextAddress(named, directory, ARJUN)).toEqual([SCOUT, LEDGER]);

      const after = spaceOf([
        ...room(),
        said(ARJUN, "hi all", { addressed_to: [SCOUT, LEDGER], addressed_to_all: true }),
        joined,
        said(ARJUN, "and you, Tree", {
          addressed_to: [SCOUT, LEDGER, TREE],
          addressed_to_all: true,
        }),
      ]);
      const drawn = [...routesIn(after, directory).keys()].map(
        (id) => after.lines.find((line) => line.id === id)?.text,
      );
      expect(drawn).toEqual(["hi all"]);
    });

    it("keeps a pick of Everyone as everyone when an agent joins before the send (ADR 0113)", () => {
      const TREE = "hrn_01K4ZQPX00000000000000TREE";
      const directory: Directory = {
        ...DIRECTORY,
        [TREE]: { id: TREE, kind: "harness", displayName: "Tree" },
      };
      const joined = fixture("membership.added", 90, {
        participant_id: TREE,
        participant_kind: "harness",
      });
      const space = spaceOf([...room(), joined]);
      const aim = aimOf("next", "all", space, directory, ARJUN);
      expect(aim).toEqual({ ids: [SCOUT, LEDGER, TREE, DANA], by: "pick", all: true });
      expect(aim === undefined ? "" : aimWordsOf(aim, space, directory)).toBe("Everyone");
      expect(wireTo(aim)).toBe("all");
      // An @ still decides over it.
      expect(aimOf("@Scout next", "all", space, directory, ARJUN)?.by).toBe("at");
    });

    it("says up to three names, and four or more as how many (ADR 0114)", () => {
      const more = ["hrn_01K4ZQPX00000000000000TREE", "hrn_01K4ZQPX00000000000000MOSS"];
      const directory: Directory = {
        ...DIRECTORY,
        [more[0] ?? ""]: { id: more[0] ?? "", kind: "harness", displayName: "Tree" },
        [more[1] ?? ""]: { id: more[1] ?? "", kind: "harness", displayName: "Moss" },
      };
      const space = spaceOf(room());
      expect(aimWords([SCOUT, LEDGER, more[0] ?? ""], space, directory)).toBe(
        "Scout, Ledger and Tree",
      );
      expect(aimWords([SCOUT, LEDGER, ...more], space, directory)).toBe("4 agents");
      // Four of both say how many of each (ADR 0204).
      expect(aimWords([SCOUT, LEDGER, more[0] ?? "", DANA], space, directory)).toBe(
        "1 person, 3 agents",
      );
    });

    it("adds an agent to what the field says, or starts afresh from Everyone (ADR 0114)", () => {
      const TREE = "hrn_01K4ZQPX00000000000000TREE";
      const directory: Directory = {
        ...DIRECTORY,
        [TREE]: { id: TREE, kind: "harness", displayName: "Tree" },
      };
      const space = spaceOf([
        ...room(),
        fixture("membership.added", 90, { participant_id: TREE, participant_kind: "harness" }),
      ]);
      const ALL = [SCOUT, LEDGER, TREE];
      // Under Everyone, as the default or picked, the first is that agent alone.
      const everyone = { ids: [...ALL, DANA], by: "default", all: true } as const;
      expect(aimsAtEveryone(everyone, undefined)).toBe(true);
      expect(addedTo(everyone, undefined, LEDGER, space, directory)).toEqual([LEDGER]);
      expect(addedTo({ ...everyone, by: "pick" }, "all", LEDGER, space, directory)).toEqual([
        LEDGER,
      ]);
      // Else it joins whoever the field says, picked or by default, and goes again on a second tap.
      expect(addedTo({ ids: [SCOUT], by: "default" }, undefined, LEDGER, space, directory)).toEqual(
        [SCOUT, LEDGER],
      );
      const two = { ids: [SCOUT, LEDGER], by: "pick" } as const;
      expect(addedTo(two, [SCOUT, LEDGER], LEDGER, space, directory)).toEqual([SCOUT]);
      // A list of every agent stays a list, and a tap takes one out of it.
      expect(addedTo(two, [SCOUT, LEDGER], TREE, space, directory)).toEqual(ALL);
      const listed = { ids: [...ALL, DANA], by: "pick", all: true } as const;
      expect(aimsAtEveryone(listed, [...ALL, DANA])).toBe(false);
      expect(addedTo(listed, [...ALL, DANA], TREE, space, directory)).toEqual([
        SCOUT,
        LEDGER,
        DANA,
      ]);
      // Everybody picked one by one says Everyone, and goes to all (ADR 0114).
      expect(aimOf("x", [...ALL, DANA], space, directory, ARJUN)).toEqual(listed);
      // A person joins as an agent does (ADR 0204).
      expect(addedTo(two, [SCOUT, LEDGER], DANA, space, directory)).toEqual([SCOUT, LEDGER, DANA]);
      // None is no pick, and the field goes back to its default.
      expect(
        addedTo({ ids: [SCOUT], by: "pick" }, [SCOUT], SCOUT, space, directory),
      ).toBeUndefined();
    });

    it("remembers a route went to everyone, whoever has come since (ADR 0113)", () => {
      const TREE = "hrn_01K4ZQPX00000000000000TREE";
      const directory: Directory = {
        ...DIRECTORY,
        [TREE]: { id: TREE, kind: "harness", displayName: "Tree" },
      };
      const space = spaceOf([
        ...room(),
        said(ARJUN, "hi all", { addressed_to: [SCOUT, LEDGER], addressed_to_all: true }),
        said(ARJUN, "just Scout", { addressed_to: [SCOUT] }),
        fixture("membership.added", 90, { participant_id: TREE, participant_kind: "harness" }),
      ]);
      const [all, one] = [...routesIn(space, directory).values()];
      expect(all).toEqual({ from: ARJUN, to: [SCOUT, LEDGER], all: true });
      expect(one).toEqual({ from: ARJUN, to: [SCOUT] });
      expect(aimWords(all?.to ?? [], space, directory)).toBe("Scout and Ledger");
      expect(all === undefined ? "" : routeWords(all, space, directory)).toBe("Everyone");
      expect(one === undefined ? "" : routeWords(one, space, directory)).toBe("Scout");
    });

    it("draws no route in a room of two", () => {
      const alone = spaceOf([
        ...room().filter((event) => ![LEDGER, DANA].includes(String(event["participant_id"]))),
        said(ARJUN, "hi", { addressed_to: [SCOUT] }),
      ]);
      expect(routesIn(alone, DIRECTORY).size).toBe(0);
    });

    describe("a message for a person (ADR 0204)", () => {
      // Foodie, 19 October 2026: one agent and two people, and nothing said who a message was for.
      const foodie = (...lines: ClientEvent[]) =>
        spaceOf([...room().filter((event) => event["participant_id"] !== LEDGER), ...lines]);

      it("aims in a room of one agent and one other person, people in the list", () => {
        const space = foodie();
        expect(aimOf("hi", undefined, space, DIRECTORY, ARJUN)).toEqual({
          ids: [SCOUT],
          by: "default",
        });
        expect(aimOf("hi", [DANA], space, DIRECTORY, ARJUN)).toEqual({ ids: [DANA], by: "pick" });
        expect(aimOf("@dana hi", [SCOUT], space, DIRECTORY, ARJUN)).toEqual({
          ids: [DANA],
          by: "at",
        });
        expect(aimOf("hi", "all", space, DIRECTORY, ARJUN)).toEqual({
          ids: [SCOUT, DANA],
          by: "pick",
          all: true,
        });
        // Dana's own field lists Arjun, never herself.
        expect(othersIn(space, DIRECTORY, DANA)).toEqual([SCOUT, ARJUN]);
      });

      it("keeps a person picked as where the next one goes, in a room of one agent too", () => {
        const toDana = foodie(
          said(ARJUN, "How's it going?", { addressed_to: [], addressed_people: [DANA] }),
        );
        expect(nextAim(toDana, DIRECTORY, ARJUN)).toEqual({ ids: [DANA] });
        const both = foodie(
          said(ARJUN, "Coffee?", { addressed_to: [SCOUT], addressed_people: [DANA] }),
        );
        expect(nextAim(both, DIRECTORY, ARJUN)).toEqual({ ids: [SCOUT, DANA] });
        // Back to the agent alone, and the agent it is.
        const back = foodie(
          said(ARJUN, "How's it going?", { addressed_to: [], addressed_people: [DANA] }),
          said(ARJUN, "Log Philz", { addressed_to: [SCOUT] }),
        );
        expect(nextAim(back, DIRECTORY, ARJUN)).toEqual({ ids: [SCOUT] });
      });

      it("draws a route to a person, and again where the address moved back", () => {
        const space = foodie(
          said(ARJUN, "Log Philz", { addressed_to: [SCOUT] }),
          said(ARJUN, "How's it going?", { addressed_to: [], addressed_people: [DANA] }),
          said(ARJUN, "Again?", { addressed_to: [], addressed_people: [DANA] }),
          said(ARJUN, "Both of you", { addressed_to: [SCOUT], addressed_people: [DANA] }),
          said(ARJUN, "Just you", { addressed_to: [SCOUT] }),
        );
        const routes = routesIn(space, DIRECTORY);
        const drawn = space.lines
          .filter((line) => routes.has(line.id))
          .map((line) => [line.text, routes.get(line.id)?.to]);
        expect(drawn).toEqual([
          ["Log Philz", [SCOUT]],
          ["How's it going?", [DANA]],
          ["Both of you", [SCOUT, DANA]],
          ["Just you", [SCOUT]],
        ]);
        expect(space.lines.find((line) => line.text === "Again?")?.addressedPeople).toEqual([DANA]);
      });
    });

    /** Scout and Ledger trading, `n` messages in all, each its own words. */
    const trade = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        i % 2 === 0
          ? said(SCOUT, `step ${i}: the purchase order number ${i} is drafted now`, {
              addressed_to: [LEDGER],
            })
          : said(LEDGER, `step ${i}: ledger line ${i} checks out against it`, {
              addressed_to: [SCOUT],
            }),
      );

    it("says nothing under the agents' talk until the warning, then who talked, in place as it grows (ADR 0097)", () => {
      const space = spaceOf([
        ...room(),
        said(ARJUN, "sort it out", { addressed_to: [SCOUT, LEDGER] }),
        ...trade(WARN_AT + 1),
      ]);
      const drawn = space.lines.map((_, index) => exchangeLine(space, index, DIRECTORY)?.text);
      // Two trading, each with its own words, are not going round however long they take turns
      // (ADR 0097's addendum of 17 October 2026): nothing until the warning at sixteen.
      expect(drawn.slice(-(WARN_AT + 1)).filter((text) => text !== undefined)).toEqual([
        "Scout and Ledger have sent each other 16 messages since you last acted.",
        "Scout and Ledger have sent each other 17 messages since you last acted.",
      ]);
      expect(exchangeLine(space, space.lines.length - 1, DIRECTORY)?.stage).toBe("warning");
      expect(pausedIn(space)).toBe(false);
      // A person speaking starts it again.
      const after = spaceOf([
        ...room(),
        ...trade(WARN_AT + 1),
        said(ARJUN, "go on", { addressed_to: [SCOUT] }),
      ]);
      expect(exchangeLine(after, after.lines.length - 1, DIRECTORY)).toBeUndefined();
    });

    it("says so at the fourth when two take turns and one asks the same again", () => {
      const ask = "please send the ledger lines for PO 4471 as one table";
      const space = spaceOf([
        ...room(),
        said(SCOUT, ask, { addressed_to: [LEDGER] }),
        said(LEDGER, "I sent them to the shared sheet an hour ago", { addressed_to: [SCOUT] }),
        said(SCOUT, ask, { addressed_to: [LEDGER] }),
        said(LEDGER, "They are in the shared sheet, tab two, rows 4 to 19", {
          addressed_to: [SCOUT],
        }),
      ]);
      const drawn = space.lines.map((_, index) => exchangeLine(space, index, DIRECTORY)?.text);
      expect(drawn.slice(-2)).toEqual([
        undefined,
        "Scout and Ledger have sent each other 4 messages since you last acted.",
      ]);
    });

    it("warns at the workspace's stop, and on a circle only while circles count (ADR 0187)", () => {
      const at = (stop: number | null, circles = true) => ({ stop, hold: 100, circles });
      const long = spaceOf([...room(), said(ARJUN, "sort it out"), ...trade(40)]);
      const lineAt = (space: typeof long, n: number, limits: ReturnType<typeof at>) =>
        exchangeLine(space, space.lines.length - 1 - n, DIRECTORY, limits)?.text;
      // A stop of 32: nothing at 17, the line from 32.
      expect(lineAt(long, 40 - 17, at(32))).toBeUndefined();
      expect(lineAt(long, 40 - 31, at(32))).toBeUndefined();
      expect(lineAt(long, 40 - 32, at(32))).toBe(
        "Scout and Ledger have sent each other 32 messages since you last acted.",
      );
      // A stop of 8: from the eighth.
      expect(lineAt(long, 40 - 8, at(8))).toBe(
        "Scout and Ledger have sent each other 8 messages since you last acted.",
      );
      // No stop: never on a count.
      expect(lineAt(long, 0, at(null))).toBeUndefined();

      const ask = "please send the ledger lines for PO 4471 as one table";
      const round = spaceOf([
        ...room(),
        said(SCOUT, ask, { addressed_to: [LEDGER] }),
        said(LEDGER, "I sent them to the shared sheet an hour ago", { addressed_to: [SCOUT] }),
        said(SCOUT, ask, { addressed_to: [LEDGER] }),
        said(LEDGER, "They are in the shared sheet, tab two, rows 4 to 19", {
          addressed_to: [SCOUT],
        }),
      ]);
      expect(lineAt(round, 0, at(null))).toBe(
        "Scout and Ledger have sent each other 4 messages since you last acted.",
      );
      expect(lineAt(round, 0, at(16, false))).toBeUndefined();
      expect(lineAt(round, 0, at(null, false))).toBeUndefined();
    });

    it("says Chips paused the agents whatever the workspace's numbers", () => {
      const held = said(SCOUT, "one more", { addressed_to: [], held: true });
      const space = spaceOf([...room(), ...trade(4), held]);
      expect(
        exchangeLine(space, space.lines.length - 1, DIRECTORY, {
          stop: null,
          hold: null,
          circles: false,
        })?.stage,
      ).toBe("held");
    });

    it("says when the same words come again", () => {
      const again = "please send the ledger lines for the PO as one table";
      const space = spaceOf([
        ...room(),
        said(SCOUT, again, { addressed_to: [LEDGER] }),
        said(LEDGER, "I cannot reach that file from here at all", { addressed_to: [SCOUT] }),
        said(SCOUT, again, { addressed_to: [LEDGER] }),
        said(LEDGER, "Still nothing has arrived from you here", { addressed_to: [SCOUT] }),
        said(SCOUT, again, { addressed_to: [LEDGER] }),
      ]);
      expect(exchangeLine(space, space.lines.length - 1, DIRECTORY)?.text).toBe(
        "Scout and Ledger have sent each other 5 messages since you last acted, and the last one repeated an earlier one.",
      );
    });

    it("says Chips paused the agents once one is held, and the room is paused until a person acts", () => {
      const held = said(SCOUT, "one more", { addressed_to: [], held: true });
      const space = spaceOf([...room(), ...trade(4), held]);
      expect(exchangeLine(space, space.lines.length - 1, DIRECTORY)).toEqual({
        stage: "held",
        text: "Chips paused the agents. Scout and Ledger have sent each other 5 messages since you last acted.",
      });
      expect(pausedIn(space)).toBe(true);
      expect(pauseWords(space, DIRECTORY)).toBe(
        "Chips paused the agents. Scout and Ledger sent each other 5 messages since you last acted.",
      );
      const handed = fixture("message.handed", 900, { message_id: `msg_${held.id.slice(4)}` });
      const acted = spaceOf([...room(), ...trade(4), held, said(ARJUN, "go on"), handed]);
      expect(pausedIn(acted)).toBe(false);
      expect(acted.lines.find((line) => line.id === held.id)).toMatchObject({
        held: true,
        handed: true,
      });
    });

    it("says beneath a message which working turns heard it, each once (ADR 0106)", () => {
      const file = said(LEDGER, "The space's file is ascii-alphabet.html.", { addressed_to: [] });
      const heard = (by: string, at: number) =>
        fixture("message.heard", at, {
          actor: { kind: "harness", id: by },
          message_id: `msg_${file.id.slice(4)}`,
        });
      const once = spaceOf([...room(), file, heard(SCOUT, 990)]);
      const line = once.lines.find((each) => each.id === file.id) as Line;
      expect(line.heardBy).toEqual([SCOUT]);
      expect(heardWords(line, DIRECTORY)).toBe("Scout heard this while working");
      const twice = spaceOf([
        ...room(),
        file,
        heard(SCOUT, 990),
        heard(SCOUT, 991),
        heard(DANA, 992),
      ]);
      const both = twice.lines.find((each) => each.id === file.id) as Line;
      expect(both.heardBy).toEqual([SCOUT, DANA]);
      expect(heardWords(both, DIRECTORY)).toBe("Scout and Dana heard this while working");
      expect(heardWords({ ...both, heardBy: undefined }, DIRECTORY)).toBeUndefined();
    });

    it("draws a person's pause as their line, pauses the room in their name, and carrying on ends it", () => {
      const paused = fixture("exchange.set", 950, {
        actor: { kind: "person", id: ARJUN },
        state: "paused",
      });
      const space = spaceOf([...room(), paused]);
      expect(space.lines.at(-1)).toMatchObject({
        kind: "system",
        exchange: "paused",
        text: "paused the agents",
        authorId: ARJUN,
      });
      expect(pausedIn(space)).toBe(true);
      expect(pauseWords(space, DIRECTORY)).toBe(
        "Arjun paused the agents. Their messages to each other wait until somebody acts.",
      );
      const going = fixture("exchange.set", 951, {
        actor: { kind: "person", id: ARJUN },
        state: "going",
      });
      const after = spaceOf([...room(), paused, going]);
      expect(after.lines.at(-1)).toMatchObject({
        exchange: "going",
        text: "let the agents carry on",
      });
      expect(pausedIn(after)).toBe(false);
      expect(after.actedSeq).toBe(951);
    });

    it("says most of a job's allowance is spent in one quiet line, and nothing for a harness's own budget (ADR 0118)", () => {
      const most = fixture("budget.warning", 940, {
        budget: { limit_usd: 3, spent_usd: 2.41 },
        threshold: 80,
        scope: "job",
      });
      const space = spaceOf([...room(), most]);
      expect(space.lines.at(-1)).toMatchObject({
        kind: "status",
        authorKind: "system",
        text: "This job has spent $2.41 of the $3.00 this space allows.",
      });
      const before = spaceOf(room()).lines.length;
      const harnessOwn = fixture("budget.warning", 941, { scope: undefined });
      const atCeiling = fixture("budget.warning", 942, {
        threshold: 100,
        action: "pause",
        scope: "job",
      });
      expect(spaceOf([...room(), harnessOwn, atCeiling]).lines).toHaveLength(before);
    });

    it("is paused by Chips at the room's spend ceiling, says the figures, and a person carrying on starts a new allowance (ADR 0118)", () => {
      const ceiling = fixture("space.spend_ceiling_set", 945, {
        actor: { kind: "person", id: ARJUN },
        usd: 10,
      });
      const paused = fixture("exchange.set", 950, {
        actor: { kind: "system", id: "system" },
        state: "paused",
        why: "spend",
        spend: { ceiling_usd: 10, spent_usd: 10.02, since_seq: 900, uncounted_runs: 0 },
      });
      const space = spaceOf([...room(), ceiling, paused]);
      expect(space.lines.at(-1)?.seq, "no line: the banner says it").toBe(945);
      expect(pausedIn(space)).toBe(true);
      expect(space.pausedSpend).toMatchObject({ spentUsd: 10.02, ceilingUsd: 10 });
      expect(pauseWords(space, DIRECTORY)).toBe(
        "This job has spent $10.02 of the $10.00 this space allows. The agents start nothing new until somebody lets them carry on.",
      );

      const going = fixture("exchange.set", 951, {
        actor: { kind: "person", id: ARJUN },
        state: "going",
      });
      const after = spaceOf([...room(), ceiling, paused, going]);
      expect(after.lines.at(-1)).toMatchObject({
        kind: "system",
        exchange: "going",
        authorId: ARJUN,
        text: "let the agents carry on after $10.02. A new $10.00 starts now.",
      });
      expect(pausedIn(after)).toBe(false);
      expect(pauseWords(after, DIRECTORY)).toBeUndefined();

      // Words in the room let them go as well; a later carry on, from no pause, says no more.
      const spoke = fixture("message.post", 960, {
        id: "evt_01K4ZQPX000000000000000960",
        actor: { kind: "person", id: ARJUN },
        text: "go on then",
        addressed_to: [SCOUT],
      });
      const later = fixture("exchange.set", 2000, {
        actor: { kind: "person", id: ARJUN },
        state: "going",
      });
      const quiet = spaceOf([...room(), ceiling, paused, spoke, later]);
      expect(pausedIn(spaceOf([...room(), ceiling, paused, spoke]))).toBe(false);
      expect(quiet.lines.at(-1)?.text).toBe("let the agents carry on");
    });

    it("names a job that had finished as its cost came in, and says a raise and a carry on in one line (ADR 0282)", () => {
      const started = fixture("run.started", 940, { ts: "2026-11-06T09:49:26.071Z" });
      const paused = fixture("exchange.set", 950, {
        actor: { kind: "system", id: "system" },
        ts: "2026-11-06T14:58:33.315Z",
        state: "paused",
        why: "spend",
        spend: { ceiling_usd: 3, spent_usd: 3.096_719, since_seq: 900, uncounted_runs: 0 },
      });
      const still = spaceOf([...room(), started, paused]);
      // While the run goes on, the job is still spending.
      expect(pauseWords(still, DIRECTORY)).toBe(
        "This job has spent $3.10 of the $3.00 this space allows. The agents start nothing new until somebody lets them carry on.",
      );
      const done = fixture("run.completed", 952, { ts: "2026-11-06T14:58:33.804Z" });
      const finished = spaceOf([...room(), started, paused, done]);
      expect(pauseWords(finished, DIRECTORY)).toBe(
        "Scout's job came to $3.10 when it finished, past the $3.00 this space allows a job. The agents start nothing new until somebody lets them.",
      );

      const raised = fixture("space.spend_ceiling_set", 960, {
        actor: { kind: "person", id: ARJUN },
        usd: 5,
      });
      const going = fixture("exchange.set", 961, {
        actor: { kind: "person", id: ARJUN },
        state: "going",
      });
      const after = spaceOf([...room(), started, paused, done, raised, going]);
      expect(after.lines.at(-1)).toMatchObject({
        id: raised.id,
        kind: "system",
        exchange: "going",
        authorId: ARJUN,
        text: "raised the limit to $5.00 and let the agents carry on after $3.10.",
      });
      expect(after.lines.filter((line) => line.exchange === "going")).toHaveLength(1);
      expect(pausedIn(after)).toBe(false);

      // Set back to the default, it says so; set some time before the hold, it is a line of its own.
      const back = fixture("space.spend_ceiling_set", 960, {
        actor: { kind: "person", id: ARJUN },
        usd: null,
      });
      expect(spaceOf([...room(), started, paused, done, back, going]).lines.at(-1)?.text).toBe(
        "set the limit back to the default, $3.00, and let the agents carry on after $3.10.",
      );
      const before = fixture("space.spend_ceiling_set", 945, {
        actor: { kind: "person", id: ARJUN },
        usd: 5,
      });
      const apart = spaceOf([...room(), before, started, paused, done, going]);
      expect(apart.lines.find((line) => line.id === before.id)?.text).toBe(
        "set the spend per job to $5.00",
      );
      expect(apart.lines.at(-1)?.text).toBe(
        "let the agents carry on after $3.10. A new $5.00 starts now.",
      );

      // No cap, from Raise the limit, says it took the cap off in the same line (ADR 0292); taken
      // off some time before, carrying on starts no new allowance.
      const lifted = fixture("space.spend_ceiling_lifted", 960, {
        actor: { kind: "person", id: ARJUN },
      });
      expect(spaceOf([...room(), started, paused, done, lifted, going]).lines.at(-1)?.text).toBe(
        "took the cap off and let the agents carry on after $3.10.",
      );
      const liftedBefore = fixture("space.spend_ceiling_lifted", 945, {
        actor: { kind: "person", id: ARJUN },
      });
      expect(
        spaceOf([...room(), liftedBefore, started, paused, done, going]).lines.at(-1)?.text,
      ).toBe("let the agents carry on after $3.10.");
      // From No cap to an amount is set, not raised.
      expect(
        spaceOf([...room(), liftedBefore, started, paused, done, raised, going]).lines.at(-1)?.text,
      ).toBe("set the limit to $5.00 and let the agents carry on after $3.10.");
    });

    it("says a person's pause in their name though Chips paused at the ceiling before it", () => {
      const atCeiling = fixture("exchange.set", 950, {
        actor: { kind: "system", id: "system" },
        state: "paused",
        why: "spend",
        spend: { ceiling_usd: 3, spent_usd: 3.4, since_seq: 900, uncounted_runs: 0 },
      });
      const theirs = fixture("exchange.set", 960, {
        actor: { kind: "person", id: ARJUN },
        state: "paused",
      });
      const space = spaceOf([...room(), atCeiling, theirs]);
      expect(pauseWords(space, DIRECTORY)).toBe(
        "Arjun paused the agents. Their messages to each other wait until somebody acts.",
      );
    });

    it("leads the room with the agent a person chose, in one line, and with nobody once it leaves (ADR 0104)", () => {
      const chose = fixture("space.lead_set", 960, {
        actor: { kind: "person", id: ARJUN },
        agent_id: LEDGER,
      });
      const space = spaceOf([...room(), chose]);
      expect(space.lead).toBe(LEDGER);
      expect(roomLeadOf(space)).toBe(LEDGER);
      expect(space.lines.at(-1)).toMatchObject({
        kind: "system",
        authorId: LEDGER,
        text: "leads this space now",
      });
      // Who chose says so once the workspace knows their name.
      const joined = fixture("person.joined", 1, {
        actor: { kind: "person", id: ARJUN },
        participant_id: ARJUN,
        display_name: "Arjun",
      });
      expect(spaceOf([joined, ...room(), chose]).lines.at(-1)?.text).toBe(
        "leads this space now, chosen by Arjun",
      );
      const left = fixture("membership.removed", 961, { participant_id: LEDGER });
      expect(roomLeadOf(spaceOf([...room(), chose, left]))).toBeUndefined();
      const nobody = fixture("space.lead_set", 962, {
        actor: { kind: "person", id: ARJUN },
        agent_id: null,
      });
      const none = spaceOf([...room(), chose, nobody]);
      expect(roomLeadOf(none)).toBeUndefined();
      expect(none.lines.at(-1)).toMatchObject({
        authorId: ARJUN,
        text: "said nobody leads this space",
      });
    });

    it("leads a room asked of harnesses with the first asked until it claims, as the claim will (ADR 0149's addendum)", () => {
      const asked = fixture("space.created", 1, {
        title: "Northwind",
        kind: "group",
        asked_of: LEDGER,
        also_asked_of: [SCOUT],
      });
      const waiting = [asked, ...room().slice(1)];
      expect(roomLeadOf(spaceOf(waiting))).toBe(LEDGER);
      // A lead a person chose stands over it.
      const chose = fixture("space.lead_set", 960, {
        actor: { kind: "person", id: ARJUN },
        agent_id: SCOUT,
      });
      expect(roomLeadOf(spaceOf([...waiting, chose]))).toBe(SCOUT);
      // Its agent in its place, the claim's lead says who leads; until it does, nobody.
      const agent = "agt_01K4ZQPX00000000000000LEDG";
      const replaced = fixture("membership.replaced", 961, { from: LEDGER, to: agent });
      expect(roomLeadOf(spaceOf([...waiting, replaced]))).toBeUndefined();
      const claimed = fixture("space.lead_set", 962, {
        actor: { kind: "system", id: "system" },
        agent_id: agent,
      });
      expect(roomLeadOf(spaceOf([...waiting, replaced, claimed]))).toBe(agent);
      // A room asked of nobody has no lead until one is chosen.
      expect(roomLeadOf(spaceOf(room()))).toBeUndefined();
    });

    it("allows a job what a person set, in one line, and the default again when set back (ADR 0117)", () => {
      expect(spendCeilingOf(spaceOf(room()))).toBe(3);
      const set = fixture("space.spend_ceiling_set", 960, {
        actor: { kind: "person", id: ARJUN },
        usd: 10,
      });
      const space = spaceOf([...room(), set]);
      expect(space.spendCeiling).toBe(10);
      expect(spendCeilingOf(space)).toBe(10);
      expect(space.lines.at(-1)).toMatchObject({
        kind: "system",
        authorId: ARJUN,
        text: "set the spend per job to $10.00",
      });
      const back = fixture("space.spend_ceiling_set", 961, {
        actor: { kind: "person", id: ARJUN },
        usd: null,
      });
      const after = spaceOf([...room(), set, back]);
      expect(after.spendCeiling).toBeUndefined();
      expect(spendCeilingOf(after)).toBe(3);
      expect(after.lines.at(-1)?.text).toBe("set the spend per job back to the default, $3.00");
    });

    it("has no cap once a person takes it off, in one line, until an amount is set again (ADR 0292)", () => {
      const lifted = fixture("space.spend_ceiling_lifted", 960, {
        actor: { kind: "person", id: ARJUN },
      });
      const none = spaceOf([...room(), lifted]);
      expect(none.spendCeiling).toBe("none");
      expect(spendCeilingOf(none)).toBe("none");
      expect(none.lines.at(-1)).toMatchObject({
        kind: "system",
        authorId: ARJUN,
        text: "took the cap off the spend per job",
      });
      const set = fixture("space.spend_ceiling_set", 961, {
        actor: { kind: "person", id: ARJUN },
        usd: 500,
      });
      const capped = spaceOf([...room(), lifted, set]);
      expect(capped.spendCeiling).toBe(500);
      expect(capped.lines.at(-1)?.text).toBe("set the spend per job to $500.00");
    });

    it("says nothing when a + room's claim chooses its lead, and one quiet line when the lead is handed nobody's turn (ADR 0104)", () => {
      const claimed = fixture("space.lead_set", 960, {
        actor: { kind: "system", id: "system" },
        agent_id: SCOUT,
      });
      const quiet = spaceOf([...room(), claimed]);
      expect(roomLeadOf(quiet)).toBe(SCOUT);
      expect(quiet.lines.some((line) => line.seq === 960)).toBe(false);
      const done = said(LEDGER, "F–J done.", { addressed_to: [] });
      const handed = fixture("message.handed", 970, {
        message_id: `msg_${done.id.slice(4)}`,
        agent_id: SCOUT,
        lead: true,
      });
      const space = spaceOf([...room(), claimed, done, handed]);
      expect(space.lines.find((line) => line.id === done.id)?.handed).toBeUndefined();
      expect(space.lines.at(-1)).toMatchObject({
        kind: "system",
        authorId: SCOUT,
        text: "took it as the lead: it was nobody's turn",
      });
    });

    it("says who took a message its agent did not pick up, and stops waiting on that agent (ADR 0291)", () => {
      // The lead's own hand-off comes back to it; another agent's goes to the lead.
      const own = said(SCOUT, "@Ledger reconcile March.", { addressed_to: [LEDGER] });
      const back = fixture("message.handed", 970, {
        message_id: `msg_${own.id.slice(4)}`,
        agent_id: SCOUT,
        lead: true,
        unanswered_by: LEDGER,
        why: "offline",
      });
      const returned = spaceOf([...room(), own, back]);
      expect(returned.lines.find((line) => line.id === own.id)).toMatchObject({
        passedOn: [LEDGER],
      });
      const took = returned.lines.at(-1) as Line;
      expect(took).toMatchObject({
        kind: "system",
        authorId: SCOUT,
        text: "took it back: it hadn't been picked up",
        unpicked: { by: LEDGER, back: true },
      });
      expect(marginWords(took, DIRECTORY)).toBe("Scout took it back: Ledger hadn't picked it up");

      const theirs = said(LEDGER, "@Scout over to you.", { addressed_to: [SCOUT] });
      const toSender = fixture("message.handed", 980, {
        message_id: `msg_${theirs.id.slice(4)}`,
        agent_id: LEDGER,
        unanswered_by: SCOUT,
        why: "silent",
      });
      const again = spaceOf([...room(), theirs, toSender]).lines.at(-1) as Line;
      expect(marginWords(again, DIRECTORY)).toBe("Ledger took it back: Scout hadn't picked it up");

      const asLead = fixture("message.handed", 990, {
        message_id: `msg_${theirs.id.slice(4)}`,
        agent_id: "agt_wren",
        lead: true,
        unanswered_by: SCOUT,
        why: "failed",
      });
      const led = spaceOf([...room(), theirs, asLead]).lines.at(-1) as Line;
      expect(led).toMatchObject({ text: "took it as the lead: it hadn't been picked up" });
      expect(marginWords({ ...led, authorId: LEDGER }, DIRECTORY)).toBe(
        "Ledger took it as the lead: Scout hadn't picked it up",
      );
      // Any other quiet line reads as it did: its agent's name, then its words.
      expect(
        marginWords({ ...led, unpicked: undefined, text: "read PO-4471.pdf" }, DIRECTORY),
      ).toBe("agt_wren read PO-4471.pdf");
    });
  });

  it("puts an approval in the queue of who may answer it, and nobody else's", () => {
    const asked = [
      ...room(),
      fixture("run.started", 5),
      fixture("approval.request", 6, { approvers: [DANA] }),
    ];
    const dana = buildModel(asked, { selfId: DANA });
    expect(dana.needsYou.filter((item) => item.kind === "approval")).toHaveLength(1);
    const arjun = buildModel(asked, { selfId: ARJUN });
    expect(arjun.needsYou.filter((item) => item.kind === "approval")).toHaveLength(0);
    // The card itself is in the room for both, and says who may answer.
    const approval = arjun.spaces[0]?.run?.approvals[0];
    expect(approval?.approvers).toEqual([DANA]);
    if (approval === undefined) throw new Error("no approval");
    expect(mayAnswer(approval, ARJUN)).toBe(false);
    expect(mayAnswer(approval, DANA)).toBe(true);
    // An ask that names nobody is anyone's — and a reader nobody has named sees them all.
    const anyone = buildModel(
      [...room(), fixture("run.started", 5), fixture("approval.request", 6, { approvers: [] })],
      { selfId: ARJUN },
    );
    expect(anyone.needsYou.filter((item) => item.kind === "approval")).toHaveLength(1);
    expect(buildModel(asked).needsYou.filter((item) => item.kind === "approval")).toHaveLength(1);
  });

  it("keeps the space's id on every event of the room", () => {
    expect(buildModel(room()).spaces[0]?.id).toBe(SPACE);
  });

  it("marks a room the reader only glimpses through an ask that named them (ADR 0042)", () => {
    // All Priya is ever sent of this room is the ask, its hand-on and what came of it.
    const PRIYA = "usr_01K4ZQPX00000000000000000P";
    const glimpsed = [
      fixture("run.started", 5),
      fixture("approval.request", 6, { approvers: [PRIYA] }),
    ];
    const priya = buildModel(glimpsed, { selfId: PRIYA });
    expect(priya.spaces).toHaveLength(1);
    expect(priya.spaces[0]?.glimpse).toBe(true);
    const ask = priya.needsYou.find((item) => item.kind === "approval");
    expect(ask?.outside).toBe(true);
    expect(ask?.spaceId).toBe(SPACE);

    // Whoever is in the room sees the same events as the room itself.
    const inside = buildModel([...room(), ...glimpsed], { selfId: ARJUN });
    expect(inside.spaces[0]?.glimpse).toBe(false);
    expect(inside.needsYou.find((item) => item.kind === "approval")?.outside).toBeUndefined();

    // A reader who says nothing about themselves glimpses nothing: the web app names itself.
    expect(buildModel(glimpsed).spaces[0]?.glimpse).toBe(false);
  });

  it("draws a card from a hand-on when the ask itself was never theirs to see (ADR 0042)", () => {
    // Handed to Dana, who is not in the room: all she is sent is the hand-on, which carries
    // what the ask is because she never saw the request that raised it.
    const handed = [
      fixture("approval.routed", 7, {
        ask: {
          harness_id: SCOUT,
          action: { kind: "email.send", input: { to: "dana@northwind.com" } },
          risk: ["external_communication"],
          expires_at: "2026-09-06T13:04:00.000Z",
        },
      }),
    ];
    const dana = buildModel(handed, { selfId: DANA });
    const item = dana.needsYou.find((each) => each.kind === "approval");
    expect(item?.title).toBe("email.send to dana@northwind.com");
    expect(item?.outside).toBe(true);
    expect(item?.expiresAt).toBe("2026-09-06T13:04:00.000Z");
    expect(dana.spaces[0]?.run?.approvals[0]).toMatchObject({
      actionKind: "email.send",
      risk: ["external_communication"],
      routedBy: ARJUN,
      routedReason: "Dana knows the Northwind account.",
    });
    expect(dana.fleet[0]?.harnessId).toBe(SCOUT);

    // A hand-on for an ask the reader did see updates it rather than adding a second card.
    const both = buildModel(
      [
        ...room(),
        fixture("run.started", 5),
        fixture("approval.request", 6, { approvers: [ARJUN] }),
        ...handed,
      ],
      { selfId: DANA },
    );
    expect(both.spaces[0]?.run?.approvals).toHaveLength(1);
    expect(both.spaces[0]?.run?.approvals[0]?.approvers).toEqual([DANA]);

    // Without the ask there is nothing to draw, and the hand-on changes nothing.
    const bare = buildModel([fixture("approval.routed", 7)], { selfId: DANA });
    expect(bare.needsYou).toHaveLength(0);
    expect(bare.audit).toHaveLength(0);
  });
});

describe("a lane, from both sides (M3.2)", () => {
  // The ids the three lane fixtures share, so a scenario reads as one chain.
  const LANE = "lane_01K4ZQPX00000000000000000A";
  const PERSON = "usr_01K4ZQPX000000000000000003";
  const LEAD = "hrn_01K4ZQPX000000000000000004";
  const LEAD_RUN = "run_01K4ZQPX000000000000000005";
  const LEAD_SPACE = "spc_01K4ZQPX000000000000000002";
  const SPECIALIST = "hrn_01K4ZQPX00000000000000000B";
  const SPECIALIST_RUN = "run_01K4ZQPX00000000000000000D";
  const HOME = "spc_01K4ZQPX00000000000000000C";
  const ORIGIN = "msg_01K4ZQPX000000000000000007";

  it("opens a lane and draws a route card from the lead's `task` alone", () => {
    const model = buildModel([fixture("task", 1)]);
    expect(model.lanes).toHaveLength(1);
    const lane = model.lanes[0];
    expect(lane?.laneId).toBe(LANE);
    expect(lane?.leadId).toBe(LEAD);
    expect(lane?.specialistId).toBe(SPECIALIST);
    expect(lane?.onBehalfOf).toBe(PERSON);
    expect(lane?.leadRunId).toBe(LEAD_RUN);
    expect(lane?.originMessageId).toBe(ORIGIN);
    expect(lane?.linkedSpaceIds).toEqual([LEAD_SPACE]);
    expect(lane?.state).toBe("running");
    expect(lane?.delivery).toBe("pending");
    // The route card is a line in the lead's chat, named by its lane.
    const line = model.spaces.find((s) => s.id === LEAD_SPACE)?.lines.at(-1);
    expect(line?.kind).toBe("route");
    expect(line?.laneId).toBe(LANE);
  });

  it("opens the home, seeds the specialist's run and draws a task card from `run.requested`", () => {
    const model = buildModel([fixture("run.requested", 1)]);
    const lane = model.lanes[0];
    expect(lane?.specialistId).toBe(SPECIALIST);
    expect(lane?.runId).toBe(SPECIALIST_RUN);
    expect(lane?.homeSpaceId).toBe(HOME);
    expect(lane?.trail.map((hop) => hop.participantId)).toEqual([PERSON, LEAD]);
    // Two leads make a lane one deep: the person heads the trail, the specialist is not in it.
    expect(lane?.depth).toBe(1);
    expect(lane?.leadRunId).toBe(LEAD_RUN);
    // The run is seeded running, with its goal, so a first message lands without a run.started.
    const home = model.spaces.find((s) => s.id === HOME);
    const run = home?.runs.find((r) => r.runId === SPECIALIST_RUN);
    expect(run?.state).toBe("running");
    expect(run?.harnessId).toBe(SPECIALIST);
    expect(run?.goal).toBe("Are the Northwind quotes in line with last quarter?");
    const line = home?.lines.at(-1);
    expect(line?.kind).toBe("task");
    expect(line?.laneId).toBe(LANE);
  });

  it("is one object with two views: the lead's card and the specialist's are the same lane", () => {
    const model = buildModel([
      fixture("task", 1),
      fixture("run.requested", 2),
      fixture("lane.updated", 3),
    ]);
    expect(model.lanes).toHaveLength(1);
    const lane = model.lanes[0];
    // The lead side gave the origin; the specialist side gave the trail; both are on the one lane.
    expect(lane?.originMessageId).toBe(ORIGIN);
    expect(lane?.trail).toHaveLength(2);
    expect(lane?.homeSpaceId).toBe(HOME);
    expect(lane?.linkedSpaceIds).toEqual([LEAD_SPACE]);
    expect(lane?.constraints).toEqual(["Use the finance warehouse, not the CRM"]);
    expect(lane?.deadline).toBe("2026-09-02T18:00:00.000Z");
    // lane.updated carried the news home to the lead.
    expect(lane?.state).toBe("completed");
    expect(lane?.delivery).toBe("queued_to_lead");
    expect(lane?.summary).toContain("4 percent under");
    expect(lane?.costUsd).toBe(0.03);
    // The route card in the lead's space and the task card in the home both find this one lane.
    expect(lanesInSpace(model, LEAD_SPACE).map((l) => l.laneId)).toEqual([LANE]);
    expect(lanesInSpace(model, HOME).map((l) => l.laneId)).toEqual([LANE]);
  });

  it("carries the files the specialist answered with, and keeps them after a later update", () => {
    const menu = {
      attachment_id: "att_01K4ZQPX00000000000000000E",
      filename: "menu.jpg",
      mime_type: "image/jpeg",
      byte_size: 4096,
      width: 800,
      height: 600,
    };
    const model = buildModel([
      fixture("task", 1),
      fixture("run.requested", 2),
      fixture("lane.updated", 3, { attachments: [menu] }),
    ]);
    expect(model.lanes[0]?.attachments).toEqual([
      {
        id: menu.attachment_id,
        filename: "menu.jpg",
        mimeType: "image/jpeg",
        byteSize: 4096,
        width: 800,
        height: 600,
      },
    ]);

    // A later update with none does not take the answer's files away.
    const after = buildModel([
      fixture("task", 1),
      fixture("run.requested", 2),
      fixture("lane.updated", 3, { attachments: [menu] }),
      fixture("lane.updated", 4, { cost_usd: 0.04 }),
    ]);
    expect(after.lanes[0]?.attachments).toHaveLength(1);
    expect(after.lanes[0]?.costUsd).toBe(0.04);
  });

  it("merges the two sides whichever batch each arrives in", () => {
    const fold = createFold();
    fold.push([fixture("run.requested", 2)]);
    fold.push([fixture("task", 1)]);
    const model = fold.model();
    expect(model.lanes).toHaveLength(1);
    // The specialist side is authoritative for the trail; the lead side still adds its route card.
    expect(model.lanes[0]?.trail).toHaveLength(2);
    expect(model.spaces.find((s) => s.id === LEAD_SPACE)?.lines.at(-1)?.kind).toBe("route");
  });

  it("replaces an ephemeral child's label with the id Chips minted for it", () => {
    const model = buildModel([
      fixture("task", 1, { to: "a data helper", child: { label: "a data helper" } }),
      fixture("run.requested", 2),
    ]);
    // The `task` names a label; `run.requested` carries the real specialist id, and it wins.
    expect(model.lanes[0]?.specialistId).toBe(SPECIALIST);
  });

  it("keeps the lead's label for a lane between two spaces of one harness (M3.5)", () => {
    // Jacobian hands a Space down, a subagent works in the worktree: the specialist is the lead
    // itself, and the label is what the cards call the work.
    const model = buildModel([
      fixture("task", 1, { to: LEAD, home: HOME, label: "Shopping" }),
      fixture("run.requested", 2, { specialist_id: LEAD, label: "Shopping" }),
    ]);
    const lane = model.lanes[0];
    expect(lane?.specialistId).toBe(LEAD);
    expect(lane?.label).toBe("Shopping");
    // Either side alone carries it, and a lane with no label has none.
    expect(buildModel([fixture("task", 1, { label: "Explore" })]).lanes[0]?.label).toBe("Explore");
    expect(buildModel([fixture("run.requested", 1)]).lanes[0]?.label).toBeUndefined();
  });

  describe("naming the lead of a lane between two spaces of one harness (13 September 2026)", () => {
    const THEIR_ROOM = fixture("space.created", 1, {
      actor: { kind: "harness", id: LEAD },
      kind: "direct",
      title: "Chess Game",
    });

    it("calls the lead, and its hop, by the room of its own it handed down from", () => {
      // Jacobian's Chess Game is a room Jacobian opened for that Space. Handing down to its
      // Engineer, Jacobian is both ends, and its name said the work came from J.
      const model = buildModel([
        THEIR_ROOM,
        fixture("task", 2, { to: LEAD, home: LEAD_SPACE, label: "Engineer" }),
        fixture("run.requested", 3, {
          space_id: LEAD_SPACE,
          specialist_id: LEAD,
          label: "Engineer",
          link_to: [LEAD_SPACE],
        }),
        fixture("approval.request", 4, { run_id: SPECIALIST_RUN }),
      ]);
      const lane = model.lanes[0];
      expect(lane?.leadLabel).toBe("Chess Game");
      // The person heads the trail under their own name; the lead's hop is the room.
      expect(lane?.trail.map((hop) => hop.label)).toEqual([undefined, "Chess Game"]);
      // And the room is named beside the name, so the chain can draw the face chosen for it.
      expect(lane?.leadSpaceId).toBe(LEAD_SPACE);
      expect(lane?.trail.map((hop) => hop.spaceId)).toEqual([undefined, LEAD_SPACE]);
      // An ask inside the lane carries both names, so its chain ends with the Engineer, not J.
      const item = model.needsYou.find((each) => each.kind === "approval");
      expect(item?.trail?.map((hop) => hop.label)).toEqual([undefined, "Chess Game"]);
      expect(item?.laneLabel).toBe("Engineer");
    });

    it("keeps the lead's own name from a room it did not open, or on a lane to somebody else", () => {
      // PO-4471 is a room a person opened: Scout works in it, but it is not a part of Scout.
      const group = buildModel([
        fixture("space.created", 1, { actor: { kind: "person", id: PERSON }, title: "PO-4471" }),
        fixture("task", 2, { to: LEAD, label: "Explore" }),
        fixture("run.requested", 3, { specialist_id: LEAD, label: "Explore" }),
      ]).lanes[0];
      expect(group?.leadLabel).toBeUndefined();
      expect(group?.trail.map((hop) => hop.label)).toEqual([undefined, undefined]);
      // No room in the name, no room's face: Scout in PO-4471 is never drawn as PO-4471.
      expect(group?.leadSpaceId).toBeUndefined();
      expect(group?.trail.map((hop) => hop.spaceId)).toEqual([undefined, undefined]);
      // A room of the lead's own, routed to another harness: the two names are the answer there.
      const across = buildModel([
        { ...THEIR_ROOM, space_id: LEAD_SPACE },
        fixture("task", 2),
        fixture("run.requested", 3),
      ]).lanes[0];
      expect(across?.leadLabel).toBeUndefined();
      expect(across?.leadSpaceId).toBeUndefined();
      expect(across?.trail.map((hop) => hop.label)).toEqual([undefined, undefined]);
    });

    it("names every hop of a nested chain by the room its own run was in", () => {
      // 🤖 → Shopping → Amazon → Checkout: J's room is the direct space opened when J was added,
      // untitled and the person's; Shopping and Amazon are rooms Jacobian opened for its Spaces.
      const J_ROOM = "spc_01K4ZQPX0000000000000000J1";
      const SHOPPING = "spc_01K4ZQPX0000000000000000J2";
      const AMAZON = "spc_01K4ZQPX0000000000000000J3";
      const [J_RUN, SHOPPING_RUN, AMAZON_RUN] = ["J4", "J5", "J6"].map(
        (tail) => `run_01K4ZQPX000000000000000${tail}`,
      );
      const room = (seq: number, spaceId: string, title: string) =>
        fixture("space.created", seq, {
          space_id: spaceId,
          actor: { kind: "harness", id: LEAD },
          kind: "direct",
          title,
        });
      const model = buildModel([
        fixture("space.created", 1, {
          space_id: J_ROOM,
          actor: { kind: "person", id: PERSON },
          kind: "direct",
          title: undefined,
        }),
        room(2, SHOPPING, "Shopping"),
        room(3, AMAZON, "Amazon"),
        fixture("run.started", 4, { space_id: J_ROOM, run_id: J_RUN }),
        fixture("run.started", 5, { space_id: SHOPPING, run_id: SHOPPING_RUN }),
        fixture("run.started", 6, { space_id: AMAZON, run_id: AMAZON_RUN }),
        fixture("run.requested", 7, {
          space_id: AMAZON,
          specialist_id: LEAD,
          label: "Checkout",
          link_to: [AMAZON],
          trail: [
            { participant_id: PERSON },
            { participant_id: LEAD, run_id: J_RUN },
            { participant_id: LEAD, run_id: SHOPPING_RUN },
            { participant_id: LEAD, run_id: AMAZON_RUN },
          ],
        }),
      ]);
      const lane = model.lanes[0];
      expect(lane?.trail.map((hop) => hop.label)).toEqual([
        undefined,
        undefined,
        "Shopping",
        "Amazon",
      ]);
      expect(lane?.trail.map((hop) => hop.spaceId)).toEqual([
        undefined,
        undefined,
        SHOPPING,
        AMAZON,
      ]);
      expect(lane?.leadLabel).toBe("Amazon");
      expect(lane?.leadSpaceId).toBe(AMAZON);
    });
  });

  it("says who a specialist is working for in the fleet", () => {
    const model = buildModel([fixture("run.requested", 1)]);
    const entry = model.fleet.find((each) => each.harnessId === SPECIALIST);
    expect(entry?.workingFor).toBe(LEAD);
    expect(entry?.runId).toBe(SPECIALIST_RUN);
  });

  it("carries the trail on an item raised inside a lane", () => {
    const model = buildModel([
      fixture("run.requested", 1),
      fixture("approval.request", 2, { run_id: SPECIALIST_RUN, space_id: HOME }),
    ]);
    const item = model.needsYou.find((each) => each.kind === "approval");
    expect(item?.runId).toBe(SPECIALIST_RUN);
    expect(item?.trail?.map((hop) => hop.participantId)).toEqual([PERSON, LEAD]);
  });

  it("rolls the lane's cost up to the lead's run, and down a nested chain", () => {
    const model = buildModel([
      fixture("task", 1),
      fixture("run.requested", 2),
      fixture("lane.updated", 3),
    ]);
    // The lead's own run has no cost of its own here; what it handed on cost three cents.
    expect(laneChainCostUsd(model, LEAD_RUN)).toBeCloseTo(0.03, 5);
    // A run that opened no lane has nothing to add.
    expect(laneChainCostUsd(model, "run_no_lanes")).toBeUndefined();
  });

  it("sums a two-level chain into the top lead's total", () => {
    const SUB_LANE = "lane_01K4ZQPX0000000000000000F0";
    const SUB_RUN = "run_01K4ZQPX0000000000000000F1";
    const SUB_HOME = "spc_01K4ZQPX0000000000000000F2";
    const model = buildModel([
      fixture("run.requested", 1),
      fixture("lane.updated", 2, { cost_usd: 0.03 }),
      // The specialist becomes a lead of its own, one level deeper.
      fixture("run.requested", 3, {
        lane_id: SUB_LANE,
        run_id: SUB_RUN,
        space_id: SUB_HOME,
        requested_by: SPECIALIST,
        specialist_id: "hrn_01K4ZQPX0000000000000000F3",
        link_to: [HOME],
        trail: [
          { participant_id: PERSON },
          { participant_id: LEAD, run_id: LEAD_RUN },
          { participant_id: SPECIALIST, run_id: SPECIALIST_RUN },
        ],
      }),
      fixture("lane.updated", 4, { lane_id: SUB_LANE, space_id: HOME, cost_usd: 0.02 }),
    ]);
    // The top lead's chain totals both levels; the middle specialist's totals only the deeper one.
    expect(laneChainCostUsd(model, LEAD_RUN)).toBeCloseTo(0.05, 5);
    expect(laneChainCostUsd(model, SPECIALIST_RUN)).toBeCloseTo(0.02, 5);
  });

  it("keeps a lane's messages in the specialist's space, not the lead's", () => {
    const model = buildModel([
      fixture("task", 1),
      fixture("run.requested", 2),
      // The specialist replies once, in its own space.
      fixture("message.post", 3, {
        space_id: HOME,
        run_id: SPECIALIST_RUN,
        text: "Pulled the finance warehouse.",
        actor: { kind: "harness", id: SPECIALIST },
      }),
    ]);
    const leadText = model.spaces
      .find((s) => s.id === LEAD_SPACE)
      ?.lines.filter((l) => l.kind === "text");
    const homeText = model.spaces
      .find((s) => s.id === HOME)
      ?.lines.filter((l) => l.kind === "text");
    expect(homeText?.some((l) => l.text.includes("finance warehouse"))).toBe(true);
    expect(leadText?.some((l) => l.text.includes("finance warehouse"))).toBe(false);
  });
});

describe("messaging depth (M5.4)", () => {
  const ARJUN = "usr_01K4ZQPX000000000000000003";
  const DANA = "usr_01K4ZQPX000000000000000009";
  const SCOUT = "hrn_01K4ZQPX000000000000000004";
  const SPACE = "spc_01K4ZQPX000000000000000002";
  const THREAD = "spc_01K4ZQPX00000000000000000T";
  /** The `message.post` fixture's line: Scout's, by the event's id. */
  const SAID = "evt_01K4ZQPX000000000000000067";

  function said(): ClientEvent[] {
    return [
      fixture("space.created", 1),
      fixture("membership.added", 2),
      fixture("message.post", 3),
    ];
  }
  const thread = (seq: number) =>
    fixture("space.created", seq, {
      id: `evt_thread_${seq}`,
      space_id: THREAD,
      kind: "thread",
      title: undefined,
      parent_space_id: SPACE,
      root_message_id: "msg_01K4ZQPX000000000000000067",
    });
  const reply = (seq: number, text: string) =>
    fixture("message.post", seq, {
      id: `evt_01K4ZQPX0000000000000000R${seq}`,
      space_id: THREAD,
      actor: { kind: "person", id: DANA },
      text,
    });
  const lineIn = (model: WorkspaceModel, spaceId: string, id: string) =>
    model.spaces.find((space) => space.id === spaceId)?.lines.find((line) => line.id === id);

  it("shows an edit in place, marked as changed, and audits it", () => {
    const model = buildModel([...said(), fixture("message.edited", 4)]);
    expect(lineIn(model, SPACE, SAID)).toMatchObject({
      text: "Working on it — checking the Northwind quotes first.",
      editedAt: "2026-09-06T12:00:00.004Z",
    });
    expect(model.audit.map((entry) => [entry.kind, entry.who, entry.what])).toEqual([
      ["message", ARJUN, "edited a message"],
    ]);
  });

  it("leaves a tombstone where a line was taken back, its files, thumbs and pin gone", () => {
    const thumbs = fixture("feedback", 4, {
      kind: "reaction",
      reaction: "👍",
      text: undefined,
      message_id: "msg_01K4ZQPX000000000000000067",
      from: { participant_id: ARJUN, kind: "person", display_name: "Arjun", role: "member" },
    });
    const model = buildModel([
      ...said(),
      thumbs,
      fixture("message.pinned", 5),
      fixture("message.deleted", 6),
    ]);
    const line = lineIn(model, SPACE, SAID);
    expect(line).toMatchObject({ text: "", deleted: true });
    expect(line?.reactions).toBeUndefined();
    expect(line?.attachments).toBeUndefined();
    expect(model.spaces[0]?.pins).toEqual([]);
    expect(model.audit.at(0)).toMatchObject({
      kind: "message",
      what: "took back a message",
      reason: "Sent to the wrong room.",
    });
  });

  it("pins a line to its space and lets it go, listing what is pinned in order", () => {
    const pinned = buildModel([...said(), fixture("message.pinned", 4)]);
    const space = pinned.spaces[0] as Space;
    expect(space.pins).toEqual([
      { lineId: SAID, by: ARJUN, ts: "2026-09-06T12:02:00.004Z", seq: 4 },
    ]);
    expect(pinnedLines(space).map((line) => line.id)).toEqual([SAID]);
    // Pinned twice is pinned once; unpinned is gone.
    const twice = buildModel([
      ...said(),
      fixture("message.pinned", 4),
      fixture("message.pinned", 5),
    ]);
    expect(twice.spaces[0]?.pins).toHaveLength(1);
    const let_go = buildModel([
      ...said(),
      fixture("message.pinned", 4),
      fixture("message.unpinned", 5),
    ]);
    expect(let_go.spaces[0]?.pins).toEqual([]);
    expect(let_go.audit.map((entry) => entry.what)).toEqual([
      "unpinned a message",
      "pinned a message",
    ]);
  });

  it("grows a thread from a line: the line counts the replies, the thread knows its parent", () => {
    const model = buildModel([...said(), thread(4), reply(5, "First"), reply(6, "Second")]);
    expect(lineIn(model, SPACE, SAID)).toMatchObject({
      threadId: THREAD,
      replyCount: 2,
      lastReplyAt: reply(6, "").ts,
    });
    const opened = model.spaces.find((space) => space.id === THREAD) as Space;
    expect(opened).toMatchObject({
      kind: "thread",
      parentSpaceId: SPACE,
      rootLineId: SAID,
      members: [],
    });
    expect(opened.lines.map((line) => line.text)).toEqual(["First", "Second"]);
    // A reply is the room's news too: the room comes forward with it.
    expect(model.spaces[0]?.id).toBe(SPACE);
    expect(model.spaces.find((space) => space.id === SPACE)?.lastEventSeq).toBe(6);
    expect(parentOf(model, opened)?.id).toBe(SPACE);
    expect(standingIn(model, opened, ARJUN)).toBe("owner");
    expect(standingIn(model, opened, DANA)).toBeUndefined();
  });

  it("links a thread and its root whichever arrives first, and counts only what is still said", () => {
    const early = buildModel([
      fixture("space.created", 1),
      thread(2),
      fixture("message.post", 3),
      reply(4, "First"),
      reply(5, "Second"),
      fixture("message.deleted", 6, {
        space_id: THREAD,
        message_id: "msg_01K4ZQPX0000000000000000R5",
      }),
    ]);
    const root = lineIn(early, SPACE, SAID);
    expect(root?.threadId).toBe(THREAD);
    expect(root?.replyCount).toBe(1);
    expect(root?.lastReplyAt).toBe(reply(4, "").ts);
  });

  it("takes a space's threads down with it when the reader leaves", () => {
    const model = buildModel(
      [
        ...said(),
        fixture("membership.added", 4, { participant_id: DANA, participant_kind: "person" }),
        thread(5),
        reply(6, "First"),
        fixture("membership.removed", 7, { participant_id: DANA }),
      ],
      { selfId: DANA },
    );
    expect(model.spaces).toEqual([]);
  });

  it("says who may edit, take back, pin and react", () => {
    const model = buildModel([
      ...said(),
      fixture("message.post", 4, {
        id: "evt_mine",
        actor: { kind: "person", id: ARJUN },
        text: "Mine.",
      }),
      fixture("message.deleted", 5, { message_id: "msg_01K4ZQPX000000000000000067" }),
    ]);
    const scouts = lineIn(model, SPACE, SAID) as Line;
    const mine = lineIn(model, SPACE, "evt_mine") as Line;
    expect(mayEdit(mine, ARJUN)).toBe(true);
    expect(mayEdit(mine, DANA)).toBe(false);
    expect(mayEdit(scouts, SCOUT)).toBe(false);
    expect(takesReaction(mine)).toBe(true);
    expect(takesFeedback(mine)).toBe(false);
    expect(takesReaction(scouts)).toBe(false);
    const member = { inSpace: "member" as const, inWorkspace: "member" as const };
    expect(mayDelete(mine, ARJUN, member)).toBe(true);
    expect(mayDelete(mine, DANA, member)).toBe(false);
    expect(mayDelete(mine, DANA, { inSpace: "owner", inWorkspace: "member" })).toBe(true);
    expect(mayDelete(mine, DANA, { inSpace: "member", inWorkspace: "admin" })).toBe(true);
    expect(mayDelete(scouts, ARJUN, { inSpace: "owner", inWorkspace: "owner" })).toBe(false);
    expect(mayPin("member")).toBe(true);
    expect(mayPin("guest")).toBe(false);
    expect(mayPin(undefined)).toBe(false);
  });
});

describe("an approval handed on (M5.5)", () => {
  const ARJUN = "usr_01K4ZQPX000000000000000003";
  const DANA = "usr_01K4ZQPX000000000000000009";

  it("changes who may answer, says who handed it and why, and records it in the audit", () => {
    const model = buildModel([...upToTheAsk(), fixture("approval.routed", 7)]);
    const approval = model.spaces[0]?.runs[0]?.approvals[0];
    expect(approval).toMatchObject({
      approvers: [DANA],
      routedBy: ARJUN,
      routedAt: "2026-09-06T12:04:00.004Z",
      routedReason: "Dana knows the Northwind account.",
    });
    expect(mayAnswer(approval as Approval, DANA)).toBe(true);
    expect(mayAnswer(approval as Approval, ARJUN)).toBe(false);
    expect(model.audit[0]).toMatchObject({
      kind: "approval",
      who: ARJUN,
      what: `handed an approval to ${DANA}`,
      reason: "Dana knows the Northwind account.",
    });
  });

  it("leaves everything alone when the approval is not here", () => {
    const model = buildModel([
      ...upToTheAsk(),
      fixture("approval.routed", 7, { approval_id: "apr_01K4ZQPX00000000000000ZZZZ" }),
    ]);
    expect(model.audit).toHaveLength(0);
  });
});

describe("when Chips steps in on agents talking (ADR 0187)", () => {
  it("holds Chips's own numbers until an owner sets them, then the last set, and says who did", () => {
    expect(buildModel([]).exchangeLimits).toEqual({ stop: 16, hold: 48, circles: true });
    const model = buildModel([fixture("exchange.limits_set", 1)]);
    expect(model.exchangeLimits).toEqual({ stop: 32, hold: null, circles: false });
    expect(model.audit[0]).toMatchObject({
      kind: "policy",
      who: "usr_01K4ZQPX000000000000000003",
      what: "set when Chips steps in on agents: stop after 32 · never held · circles off",
    });
    const again = buildModel([
      fixture("exchange.limits_set", 1),
      fixture("exchange.limits_set", 2, { stop: 8, hold: 24, circles: true }),
    ]);
    expect(again.exchangeLimits).toEqual({ stop: 8, hold: 24, circles: true });
  });
});

describe("the workspace named again (ADR 0194)", () => {
  it("says who renamed it, and from what to what", () => {
    const model = buildModel([fixture("workspace.renamed", 1)]);
    expect(model.audit[0]).toMatchObject({
      kind: "policy",
      who: "usr_01K4ZQPX000000000000000003",
      what: "renamed the workspace from My workspace to Primal",
    });
  });
});

describe("the relay turned by an owner (ADR 0211, Phase 4)", () => {
  it("is on until turned, then says who turned it and when, in the audit too", () => {
    expect(buildModel([]).relay).toBeUndefined();
    const off = buildModel([fixture("relay.set", 1)]);
    expect(off.relay).toEqual({
      on: false,
      by: "usr_01K4ZQPX000000000000000003",
      at: "2026-10-21T10:05:00.000Z",
    });
    expect(off.audit[0]).toMatchObject({ kind: "policy", what: "turned the relay off" });
    const on = buildModel([fixture("relay.set", 1), fixture("relay.set", 2, { on: true })]);
    expect(on.relay?.on).toBe(true);
  });
});

describe("what may be attached (ADR 0047)", () => {
  it("holds no caps until an owner sets them, then the last set whole, and says who did", () => {
    expect(buildModel([]).attachmentCaps).toEqual({ image: null, video: null, file: null });
    const model = buildModel([fixture("attachment.limits_set", 1)]);
    expect(model.attachmentCaps).toEqual({ image: 26_214_400, video: 104_857_600, file: null });
    expect(model.audit[0]).toMatchObject({
      kind: "attachment",
      who: "usr_01K4ZQPX000000000000000003",
      what: "capped photos at 25 MB, videos at 100 MB, and files at the server's limit",
    });
    const again = buildModel([
      fixture("attachment.limits_set", 1),
      fixture("attachment.limits_set", 2, {
        image_bytes: null,
        video_bytes: 1_048_576,
        file_bytes: null,
      }),
    ]);
    expect(again.attachmentCaps).toEqual({ image: null, video: 1_048_576, file: null });
  });

  it("says the caps the way a settings screen does, naming the ceiling where it is known", () => {
    const caps = { image: 26_214_400, video: null, file: 52_428_800 };
    expect(capsSentence(caps, 104_857_600)).toBe(
      "Photos up to 25 MB, videos up to the server's 100 MB, and files up to 50 MB.",
    );
    expect(capsSentence(caps)).toBe(
      "Photos up to 25 MB, videos up to the server's limit, and files up to 50 MB.",
    );
    // A cap at or above the ceiling is the ceiling.
    expect(capsSentence({ ...caps, image: 209_715_200 }, 104_857_600)).toMatch(
      /^Photos up to the server's 100 MB,/,
    );
  });

  it("says the caps at the right of You's row as one size, or the range they run over", () => {
    const MB = 1024 * 1024;
    const none = { image: null, video: null, file: null };
    expect(capsWords(none, undefined)).toBe("Server's limit");
    expect(capsWords(none, 100 * MB)).toBe("100 MB");
    expect(capsWords({ ...none, image: 25 * MB }, 100 * MB)).toBe("25–100 MB");
    expect(capsWords({ image: 25 * MB, video: 25 * MB, file: 25 * MB }, undefined)).toBe("25 MB");
  });

  it("goes to a settings form as megabytes and back, refusing what is not a number", () => {
    const caps = { image: 26_214_400, video: null, file: 1_572_864 };
    expect(capsDraft(caps)).toEqual({ image: "25", video: "", file: "1.5" });
    expect(capsFromDraft({ image: "25", video: " ", file: "1.5" })).toEqual({ caps });
    expect(capsFromDraft({ image: "lots", video: "", file: "" })).toEqual({
      error: "A cap on photos is a number of megabytes, or blank for the server's limit.",
    });
    expect(capsFromDraft({ image: "", video: "0", file: "" })).toMatchObject({
      error: expect.stringMatching(/^A cap on videos/),
    });
  });
});
