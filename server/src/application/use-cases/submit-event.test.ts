/**
 * The one door in, tested on its own.
 *
 * The gateway tests drive these rules through a transport for a handful of events. This file
 * drives them for the whole catalogue, so a new event type cannot arrive without a decision
 * about who sends it, and so the fields Chips fills in are the same whatever the transport.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { manualClock } from "@chipschat/platform";
import type { PolicyRule } from "@chipschat/protocol";
import { createIdGenerator, EVENTS, eventDefinition } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_TABLE, type WorkspaceRole } from "../../domain/index.js";
import type {
  ApprovalView,
  EventStore,
  HarnessPolicyView,
  IncomingEvent,
  LaneView,
  MessageView,
  Principal,
  QuestionView,
  RunView,
  StoredEvent,
  WorkspacePolicyView,
} from "../ports/index.js";
import { createSubmitEvent, type DroppedFields, droppedInTheLog } from "./submit-event.js";

const FIXTURES = fileURLToPath(new URL("../../../../packages/protocol/fixtures/", import.meta.url));

const WS = "ws_01K4ZQPX000000000000000001";
/** The golden scenario's space and run, as the fixtures name them. */
const SPACE = "spc_01K4ZQPX000000000000000002";
const RUN = "run_01K4ZQPX000000000000000005";

const ARJUN: Principal = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000003",
  workspaceId: WS,
  displayName: "Arjun",
  via: "device_key",
  deviceId: "dev_01K4ZQPX000000000000000005",
  role: "owner",
};

const SCOUT: Principal = {
  kind: "harness",
  participantId: "hrn_01K4ZQPX000000000000000004",
  workspaceId: WS,
  displayName: "Scout",
  via: "harness_token",
  tokenId: "tok_01K4ZQPX000000000000000006",
  ownerId: ARJUN.participantId,
};

const DANA: Principal = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000009",
  workspaceId: WS,
  displayName: "Dana",
  via: "device_key",
  deviceId: "dev_01K4ZQPX00000000000000000A",
  role: "member",
};

/** A second harness, in the space only when a test asks for one (ADR 0081). */
const LEDGER = {
  id: "hrn_01K4ZQPX00000000000000000M",
  kind: "harness" as const,
  display_name: "Ledger",
  owner_id: "usr_01K4ZQPX000000000000000003",
  role: null,
};

/** Everyone the fixtures' space holds, as the read models describe them. */
const PEOPLE = [
  {
    id: ARJUN.participantId,
    kind: "person" as const,
    display_name: "Arjun",
    owner_id: null,
    role: "owner" as const,
  },
  {
    id: DANA.participantId,
    kind: "person" as const,
    display_name: "Dana",
    owner_id: null,
    role: "member" as const,
  },
  {
    id: SCOUT.participantId,
    kind: "harness" as const,
    display_name: "Scout",
    owner_id: ARJUN.participantId,
    role: null,
  },
];

/** A store that remembers what it was asked to append and nothing else. */
function fakeStore(): EventStore & { readonly appended: IncomingEvent[] } {
  const appended: IncomingEvent[] = [];
  return {
    appended,
    async append(event) {
      appended.push(event);
      const stored: StoredEvent = {
        seq: appended.length,
        workspace_id: event.workspace_id,
        id: event.id,
        type: event.type,
        ts: event.ts,
        space_id: (event["space_id"] as string | undefined) ?? null,
        run_id: (event["run_id"] as string | undefined) ?? null,
        actor: event.actor,
        idempotency_key: (event["idempotency_key"] as string | undefined) ?? null,
        payload: { ...event, seq: appended.length },
      };
      return { event: stored, duplicate: false };
    },
    async since() {
      return { events: [], nextCursor: null };
    },
    async head() {
      return 0;
    },
    async rebuild() {
      return { replayed: 0 };
    },
    async erase() {
      throw new Error("not used here");
    },
  };
}

/** The fixtures' run, as the read model would describe it: Scout's, in the space, alive. */
function fixtureRun(overrides: Partial<RunView> = {}): RunView {
  return {
    run_id: RUN,
    space_id: SPACE,
    harness_id: SCOUT.participantId,
    goal: "Get PO #4471 confirmed with Northwind and update the tracker.",
    state: "running",
    status_verb: null,
    summary: null,
    cost_usd: null,
    context_used: null,
    context_limit: null,
    started_at: "2026-09-02T14:22:00.004Z",
    ended_at: null,
    ...overrides,
  };
}

/** The fixtures' approval, as the read model would describe it, pending unless told otherwise. */
function fixtureApproval(overrides: Partial<ApprovalView> = {}): ApprovalView {
  return {
    approval_id: "apr_01K4ZQPX000000000000000006",
    run_id: RUN,
    space_id: SPACE,
    // A small ask: since ADR 0195 one that matters takes no Always and no harness's own answer.
    action: { kind: "shell.exec" },
    state: "pending",
    decision: null,
    scope: null,
    reason: null,
    resolved_by: null,
    resolved_at: null,
    updated_input: null,
    expires_at: null,
    fallback: "deny",
    executed_outcome: null,
    approvers: [],
    ...overrides,
  };
}

function fixtureQuestion(overrides: Partial<QuestionView> = {}): QuestionView {
  return {
    ask_id: "qst_01K4ZQPX000000000000000009",
    run_id: RUN,
    space_id: SPACE,
    state: "pending",
    answered_by: null,
    timeout_at: null,
    on_no_answer: "use_default",
    questions: [{ question_id: "delivery-window", default_value: "19" }],
    ...overrides,
  };
}

interface HarnessOptions {
  /** Participants in no space at all. Everyone else is an owner everywhere. */
  readonly nonMembers?: readonly string[];
  /** A standing other than owner, by participant id. */
  readonly roles?: Readonly<Record<string, "owner" | "member" | "guest">>;
  /** Who opened the fixtures' space. Absent, Scout did. */
  readonly openedBy?: string;
  /** The runs that exist, by id. Absent, the fixtures' run exists and is running. */
  readonly runs?: Readonly<Record<string, RunView>>;
  /** The fixtures' approval and question, as they stand. Absent, both are pending. */
  readonly approval?: ApprovalView;
  readonly question?: QuestionView;
  /** Scout's policy. Absent, Scout has none: a new harness, L1. */
  readonly policy?: Partial<HarnessPolicyView>;
  /** The workspace's cap and rules. Absent, none: the default cap. */
  readonly workspace?: WorkspacePolicyView;
  /** Rules decided for the fixtures' run this session. */
  readonly session?: readonly PolicyRule[];
  /** The messages that exist, by wire id. Absent, the fixtures' message exists and is Scout's. */
  readonly messages?: Readonly<Record<string, MessageView>>;
  /** The lane the fixtures' run is, when it is one. Absent, the run is nobody's lane. */
  readonly lane?: LaneView;
  /** Each person's standing in the workspace (ADR 0034). Absent, Arjun owns it and Dana is a member. */
  readonly workspaceRoles?: Readonly<Record<string, WorkspaceRole>>;
  /** How many spaces each participant is in. Absent, one. */
  readonly spaceCounts?: Readonly<Record<string, number>>;
  /** The visits each space has (ADR 0040). Absent, every ref names one. */
  readonly sessions?: readonly string[];
  /** The most the server takes in one upload (ADR 0047). Absent, a cap is never over it. */
  readonly maxAttachmentBytes?: number;
  /** Told the fields an event lost at the edge (ADR 0162). */
  readonly dropped?: (dropped: DroppedFields) => void;
  /** Ledger in the space beside Scout (ADR 0081). Absent, Scout is its only harness. */
  readonly ledger?: boolean;
  /** Where each sender's last message in the space went (ADR 0081). Absent, nowhere yet. */
  readonly lastAddressed?: Readonly<Record<string, string[] | "all">>;
  /**
   * Messages harnesses have sent each other since the referee's count last started, and whether
   * a person paused them (ADR 0097). Absent, none and not.
   */
  readonly chatter?: number;
  readonly paused?: boolean;
}

/** The fixtures' message (`message.post`): Scout said it, in the space, in the run. */
const MESSAGE = "msg_01K4ZQPX000000000000000067";

/** Arjun owns the workspace and Dana is a member of it, unless a test says otherwise. */
const WORKSPACE_ROLES_BY_DEFAULT: Readonly<Record<string, WorkspaceRole>> = {
  [ARJUN.participantId]: "owner",
  [DANA.participantId]: "member",
};
function fixtureMessage(overrides: Partial<MessageView> = {}): MessageView {
  return {
    message_id: MESSAGE,
    event_id: "evt_01K4ZQPX000000000000000067",
    seq: 1,
    space_id: SPACE,
    run_id: RUN,
    type: "text",
    author_kind: "harness",
    author_id: SCOUT.participantId,
    created_at: "2026-10-20T21:14:03.000Z",
    edited_at: null,
    deleted_at: null,
    thread_id: null,
    ...overrides,
  };
}

/**
 * Read models that say everyone is in every space and the fixtures' run exists, unless
 * told otherwise, and remember what they were asked, so a test can say a rule was — or was
 * not — consulted.
 */
function harness(options: HarnessOptions = {}) {
  const store = fakeStore();
  const clock = manualClock(1_756_800_000_000);
  const ids = createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(1) });
  const asked: string[] = [];
  const runs = options.runs ?? { [RUN]: fixtureRun() };
  const readModels = {
    async memberRole(_workspaceId: string, spaceId: string, participantId: string) {
      asked.push(`${participantId}@${spaceId}`);
      if ((options.nonMembers ?? []).includes(participantId)) return undefined;
      return options.roles?.[participantId] ?? ("owner" as const);
    },
    async participant(_workspaceId: string, participantId: string) {
      // An agent registered on the way in is somebody from then on, as it is on the server.
      const registered = store.appended.find(
        (each) => each["type"] === "agent.registered" && each["agent_id"] === participantId,
      );
      if (registered !== undefined) {
        return {
          id: participantId,
          kind: "agent" as const,
          display_name: String(registered["name"]),
          owner_id: null,
          role: null,
          capabilities: null,
          removed_at: null,
          last_seen_at: null,
          harness_id: String(registered["harness_id"]),
        };
      }
      const found = PEOPLE.find((each) => each.id === participantId);
      if (found === undefined) return undefined;
      const view = { capabilities: null, removed_at: null, last_seen_at: null, ...found };
      if (view.kind !== "person") return view;
      // The workspace's own standing, which is what says whether somebody is a guest (ADR 0034).
      const role = (options.workspaceRoles ?? WORKSPACE_ROLES_BY_DEFAULT)[participantId] ?? null;
      return { ...view, role };
    },
    async membersOf() {
      const everyone = options.ledger === true ? [...PEOPLE, LEDGER] : PEOPLE;
      return everyone
        .filter((each) => !(options.nonMembers ?? []).includes(each.id))
        .map((each) => ({
          participant_id: each.id,
          kind: each.kind,
          display_name: each.display_name,
          role: options.roles?.[each.id] ?? ("owner" as const),
          owner_id: each.owner_id,
          workspace_role:
            each.kind === "person"
              ? ((options.workspaceRoles ?? WORKSPACE_ROLES_BY_DEFAULT)[each.id] ?? null)
              : null,
        }));
    },
    async space(_workspaceId: string, spaceId: string) {
      return {
        space_id: spaceId,
        kind: "group",
        title: "PO-4471",
        state: "open" as const,
        opened_by: options.openedBy ?? SCOUT.participantId,
        title_by: "person" as const,
        external_key: null,
        parent_space_id: null,
        root_message_id: null,
        asked_of: null,
        also_asked_of: [],
        home: false,
      };
    },
    async message(_workspaceId: string, messageId: string) {
      asked.push(`message:${messageId}`);
      return (options.messages ?? { [MESSAGE]: fixtureMessage() })[messageId];
    },
    async lane() {
      return undefined;
    },
    async laneByRun() {
      return options.lane;
    },
    async run(_workspaceId: string, runId: string) {
      asked.push(`run:${runId}`);
      return runs[runId];
    },
    async priceTable() {
      return DEFAULT_PRICE_TABLE;
    },
    async approval() {
      return options.approval ?? fixtureApproval();
    },
    async question() {
      return options.question ?? fixtureQuestion();
    },
    async harnessPolicy(): Promise<HarnessPolicyView | undefined> {
      if (options.policy === undefined) return undefined;
      return {
        harness_id: SCOUT.participantId,
        space_id: "*",
        autonomy: 2,
        rules: [],
        budget_usd: 25,
        spent_usd: 0,
        updated_seq: 1,
        ...options.policy,
      };
    },
    async workspacePolicy() {
      return options.workspace;
    },
    async sessionInSpace(_workspaceId: string, _spaceId: string, sessionRef: string) {
      return options.sessions === undefined || options.sessions.includes(sessionRef);
    },
    async sessionRules() {
      return [...(options.session ?? [])];
    },
    async rulesForAWhile() {
      return [];
    },
    async workspaceRole(_workspaceId: string, participantId: string) {
      const roles = options.workspaceRoles ?? WORKSPACE_ROLES_BY_DEFAULT;
      return roles[participantId];
    },
    async ownerCount() {
      const roles = options.workspaceRoles ?? WORKSPACE_ROLES_BY_DEFAULT;
      return Object.values(roles).filter((role) => role === "owner").length;
    },
    async spaceCountFor(_workspaceId: string, participantId: string) {
      return options.spaceCounts?.[participantId] ?? 1;
    },
    async lastAddressed(_workspaceId: string, _spaceId: string, actorId: string) {
      return options.lastAddressed?.[actorId];
    },
    async exchangeOf() {
      return {
        count: options.chatter ?? 0,
        since: { kind: "start" as const, seq: 0 },
        messages: [],
        paused: options.paused ?? false,
        personLooking: null,
        personSeq: undefined,
      };
    },
    async heldIn() {
      return [];
    },
    async agentByKey() {
      return undefined;
    },
    async participantsIn() {
      return [];
    },
    async heldNames() {
      return [];
    },
    async agentRoom() {
      return undefined;
    },
    async isMember(_workspaceId: string, spaceId: string, participantId: string) {
      return (await this.memberRole(_workspaceId, spaceId, participantId)) !== undefined;
    },
    async agentsOf() {
      return [];
    },
    async roomsHolding() {
      return [];
    },
    async replacedIn() {
      return [];
    },
    async attachmentFact() {
      return undefined;
    },
  };
  return {
    store,
    clock,
    asked,
    submit: createSubmitEvent({
      store,
      clock,
      ids,
      uploads: { find: async () => undefined },
      readModels,
      maxAttachmentBytes: options.maxAttachmentBytes,
      dropped: options.dropped,
    }),
  };
}

/**
 * The golden scenario's fixture for an event, as a client would send it: without the fields
 * the transport fills in, so what the use case stamps is what is tested.
 */
function fixture(type: string): Record<string, unknown> {
  const full = JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")) as Record<
    string,
    unknown
  >;
  const { actor: _actor, ts: _ts, workspace_id: _workspace, ...sent } = full;
  return sent;
}

/**
 * Who the protocol says sends an event: a kind, "either" for the shared ones, or "chips" for what
 * no client sends. Read from the catalogue, where the protocol's own test pins it for every event.
 */
function senderOf(type: string): "harness" | "person" | "either" | "chips" {
  const definition = eventDefinition(type);
  if (definition === undefined) throw new Error(`${type} is not in the catalogue`);
  return definition.sender;
}

/**
 * Whether the door takes an event from this kind of sender: by direction, or shared — except
 * that a decision, shared since M5.5, is a harness's only when policy handed it one (rule 9).
 */
/**
 * Whether the scenario takes an event from a sender. The fixtures' approval and question are
 * asks of Scout's own run, which Scout may settle as answered in its own tools (finding 5).
 */
function accepted(type: string, kind: "harness" | "person"): boolean {
  const sender = senderOf(type);
  return sender === kind || sender === "either";
}

describe("who may send what", () => {
  const cases = EVENTS.flatMap((event) => [
    [event.type, "harness"] as const,
    [event.type, "person"] as const,
  ]);

  it.each(cases)("%s from %s", async (type, kind) => {
    // A resume is for a run that is waiting; everything else in the scenario finds it running.
    const state = type === "run.resume" ? "waiting" : "running";
    const principal = kind === "harness" ? SCOUT : ARJUN;
    // A message is edited or taken back by its author (rule 12): the fixtures' is the sender's.
    const changing = type === "message.edited" || type === "message.deleted";
    const said = changing
      ? fixtureMessage({ author_kind: kind, author_id: principal.participantId })
      : fixtureMessage();
    const { submit } = harness({
      runs: { [RUN]: fixtureRun({ state }) },
      messages: { [MESSAGE]: said },
    });
    const result = await submit({
      event: fixture(type),
      principal,
      idempotencyKey: "once",
    });

    const allowed = accepted(type, kind);
    expect(result.ok, `${type} from ${kind} should be ${allowed ? "accepted" : "refused"}`).toBe(
      allowed,
    );
    if (!result.ok) {
      expect(["not_submittable", "wrong_direction", "not_an_approver"]).toContain(
        result.error.kind,
      );
    }
  });

  it("lets both a person and a harness send a message", async () => {
    for (const principal of [ARJUN, SCOUT]) {
      const { submit } = harness();
      const result = await submit({
        event: fixture("message.post"),
        principal,
        idempotencyKey: "msg",
      });
      expect(result.ok, `message.post from ${principal.kind}`).toBe(true);
    }
  });

  /**
   * Agents review, finding 1: an agent is made, renamed, archived, put in its harness's place and
   * copied by a use case that asks who may. Sent through the door they were a person's by default:
   * a guest renamed another person's agent, and a member took one over by registering its id
   * under a harness of her own.
   */
  it.each(["agent.registered", "agent.updated", "membership.replaced", "agent.fork"])(
    "takes %s from nobody: an agent's events are Chips's own to write",
    async (type) => {
      for (const principal of [ARJUN, { ...ARJUN, role: "guest" as const }, SCOUT]) {
        const { submit, store } = harness();
        const result = await submit({ event: fixture(type), principal, idempotencyKey: "forged" });
        expect(result.ok, `${type} from ${principal.kind}`).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe("not_submittable");
        expect(store.appended).toEqual([]);
      }
    },
  );

  it("tells a harness that resolves an approval not its own run's why it may not", async () => {
    const { submit } = harness({
      approval: fixtureApproval({ run_id: "run_01K4ZQPX00000000000000000R" }),
    });
    const result = await submit({
      event: fixture("approval.resolved"),
      principal: SCOUT,
      idempotencyKey: "self-approve",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("not_an_approver");
    expect(result.error.message).toContain("policy handed it");
  });

  it("leaves an event nothing declares for the schema to refuse", async () => {
    const { submit } = harness();
    const result = await submit({
      event: { type: "no.such.event" },
      principal: ARJUN,
      idempotencyKey: "unknown",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid");
  });

  it("refuses before it validates, so a malformed forgery gets the same answer", async () => {
    const { submit } = harness();
    const result = await submit({
      event: { type: "budget.warning", nonsense: true },
      principal: SCOUT,
      idempotencyKey: "forged-warning",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not_submittable");
  });
});

describe("what Chips fills in", () => {
  /**
   * Agents review, finding 2: fields the schema says Chips writes were kept as a sender wrote
   * them. `from_held` on a person's post deleted another agent's waiting words; `fork_of` on a
   * person's add answered a standing fork ask, so the real copy was turned away; `reason` on a
   * removal decides whether an unarchive brings the agent back. And `attachments` (SEC-5): a
   * message's own, naming another room's attachment, moved that attachment's row into this
   * room; what a message attaches is what its `upload_ids` name, as stored.
   */
  it.each([
    [
      "message.post",
      {
        held_since: "2020-01-01T00:00:00.000Z",
        from_held: "evt_01K4ZQPX0000000000000000ZZ",
        attachments: [
          {
            attachment_id: "att_01K4ZQPX00000000000000000Z",
            filename: "theirs.txt",
            mime_type: "text/plain",
            byte_size: 6,
            sha256: "a".repeat(64),
          },
        ],
      },
    ],
    [
      "membership.added",
      {
        moved_from: "spc_01K4ZQPX0000000000000000ZZ",
        fork_of: "evt_01K4ZQPX0000000000000000ZZ",
      },
    ],
    ["membership.removed", { reason: "archived", moved_to: "spc_01K4ZQPX0000000000000000ZZ" }],
  ] as const)("drops what is Chips's to write from a sender's %s", async (type, forged) => {
    const { submit, store } = harness();
    const result = await submit({
      event: { ...fixture(type), ...forged },
      principal: ARJUN,
      idempotencyKey: "forged-fields",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const stored = store.appended.find((each) => each.type === type);
    for (const field of Object.keys(forged)) expect(stored, field).not.toHaveProperty(field);
  });

  it("says who took somebody out of a room from the credential, not from the sender", async () => {
    const { submit, store } = harness();
    const removed = await submit({
      event: { ...fixture("membership.removed"), removed_by: DANA.participantId },
      principal: ARJUN,
      idempotencyKey: "removed-by",
    });
    expect(removed.ok).toBe(true);
    expect(store.appended.at(-1)).toMatchObject({ removed_by: ARJUN.participantId });

    const left = await submit({
      event: {
        ...fixture("membership.removed"),
        participant_id: ARJUN.participantId,
        removed_by: DANA.participantId,
      },
      principal: ARJUN,
      idempotencyKey: "left",
    });
    expect(left.ok).toBe(true);
    expect(store.appended.at(-1)).not.toHaveProperty("removed_by");
  });

  it("stamps the clock, whatever `ts` the sender wrote", async () => {
    const { submit, store, clock } = harness();
    const result = await submit({
      event: { ...fixture("approval.request"), ts: "2099-01-01T00:00:00.000Z" },
      principal: SCOUT,
      idempotencyKey: "future",
    });
    expect(result.ok).toBe(true);
    expect(store.appended[0]?.ts).toBe(clock.nowIso());
  });

  it.each([
    ["approval.resolved", ["resolved_by"], ["resolved_at"]],
    ["question.answered", ["answered_by"], ["answered_at"]],
    ["run.pause", ["by"], []],
    ["run.resume", ["by"], []],
    ["run.cancel", ["by"], []],
    ["policy.updated", ["changed_by"], []],
  ] as const)("attributes %s to the credential that sent it", async (type, who, when) => {
    const state = type === "run.resume" ? "waiting" : "running";
    const { submit, store, clock } = harness({ runs: { [RUN]: fixtureRun({ state }) } });
    const forged = Object.fromEntries([
      ...who.map((field) => [field, "usr_01K4ZQPX00000000000000000Q"]),
      ...when.map((field) => [field, "2020-01-01T00:00:00.000Z"]),
    ]);
    const result = await submit({
      event: { ...fixture(type), ...forged },
      principal: ARJUN,
      idempotencyKey: "attributed",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const appended: Readonly<Record<string, unknown>> = store.appended[0] ?? {};
    for (const field of who) expect(appended[field]).toBe(ARJUN.participantId);
    for (const field of when) expect(appended[field]).toBe(clock.nowIso());
  });

  it("says which fields it dropped, and who sent them, but not what is Chips's to write", async () => {
    const said: DroppedFields[] = [];
    const { submit, store } = harness({ dropped: (dropped) => said.push(dropped) });
    const result = await submit({
      event: { ...fixture("step.log"), kind: "file", glyph: "page", from_held: "evt_x" },
      principal: SCOUT,
      idempotencyKey: "dropped",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended.at(-1)).toMatchObject({ kind: "file" });
    expect(said).toEqual([{ principal: SCOUT, type: "step.log", fields: ["glyph", "from_held"] }]);
    await submit({ event: fixture("step.log"), principal: SCOUT, idempotencyKey: "kept" });
    expect(said).toHaveLength(1);
  });

  it("says a dropped field in the log once per sender and field", () => {
    const lines: unknown[][] = [];
    const say = droppedInTheLog({ warn: ((...line: unknown[]) => lines.push(line)) as never });
    say({ principal: SCOUT, type: "step.log", fields: ["glyph"] });
    say({ principal: SCOUT, type: "step.log", fields: ["glyph", "tint"] });
    say({ principal: ARJUN, type: "step.log", fields: ["glyph"] });
    expect(lines.map(([facts]) => facts)).toEqual([
      { sender: SCOUT.participantId, type: "step.log", fields: ["glyph"] },
      { sender: SCOUT.participantId, type: "step.log", fields: ["tint"] },
      { sender: ARJUN.participantId, type: "step.log", fields: ["glyph"] },
    ]);
  });

  it("does not need the sender to repeat what it will stamp", async () => {
    const { submit } = harness();
    const { resolved_by: _who, resolved_at: _when, ...bare } = fixture("approval.resolved");
    const result = await submit({ event: bare, principal: ARJUN, idempotencyKey: "bare" });
    expect(result.ok).toBe(true);
  });
});

describe("into a space the sender is in", () => {
  it("accepts a member's event and refuses a non-member's, for a person and a harness alike", async () => {
    for (const principal of [ARJUN, SCOUT]) {
      const inside = await harness().submit({
        event: fixture("message.post"),
        principal,
        idempotencyKey: "inside",
      });
      expect(inside.ok, `${principal.kind} in the space`).toBe(true);

      const outside = await harness({ nonMembers: [principal.participantId] }).submit({
        event: fixture("message.post"),
        principal,
        idempotencyKey: "outside",
      });
      expect(outside.ok, `${principal.kind} outside the space`).toBe(false);
      if (!outside.ok) expect(outside.error.kind).toBe("wrong_space");
    }
  });

  it("refuses a person adding themself to a space they are not in", async () => {
    const result = await harness({ nonMembers: [ARJUN.participantId] }).submit({
      event: { ...fixture("membership.added"), participant_id: ARJUN.participantId },
      principal: ARJUN,
      idempotencyKey: "self-invite",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong_space");
  });

  it("lets a person open a space, since nobody is a member of one yet", async () => {
    const { submit, asked } = harness({ nonMembers: [ARJUN.participantId] });
    const result = await submit({
      event: fixture("space.created"),
      principal: ARJUN,
      idempotencyKey: "open",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(asked).toEqual([]);
  });

  it("asks nothing for a workspace-wide event", async () => {
    const { submit, asked } = harness({ nonMembers: [ARJUN.participantId] });
    const { space_id: _none, ...workspaceWide } = fixture("policy.updated");
    const result = await submit({ event: workspaceWide, principal: ARJUN, idempotencyKey: "wide" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(asked).toEqual([]);
  });

  it("refuses on the cheaper rules first, so a forgery costs no lookup", async () => {
    const { submit, asked } = harness({ nonMembers: [SCOUT.participantId] });
    const result = await submit({
      event: fixture("run.cancel"),
      principal: SCOUT,
      idempotencyKey: "forged",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong_direction");
    expect(asked).toEqual([]);
  });
});

describe("into a run that exists, is the sender's, and takes the event", () => {
  it("refuses an event for a run nobody started, before it asks about membership", async () => {
    const { submit, asked } = harness({ runs: {} });
    const result = await submit({
      event: fixture("step.log"),
      principal: SCOUT,
      idempotencyKey: "k",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unknown_run");
      expect(result.error.message).toContain("run.started");
    }
    expect(asked).toEqual([`run:${RUN}`]);
  });

  it("refuses a harness's event for a run another harness started", async () => {
    const stranger = "hrn_01K4ZQPX00000000000000000S";
    const { submit } = harness({ runs: { [RUN]: fixtureRun({ harness_id: stranger }) } });
    const result = await submit({
      event: fixture("run.status"),
      principal: SCOUT,
      idempotencyKey: "k",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong_run");
  });

  it("refuses an event that puts a run in another space than its own", async () => {
    const elsewhere = "spc_01K4ZQPX00000000000000000E";
    const { submit } = harness({ runs: { [RUN]: fixtureRun({ space_id: elsewhere }) } });
    const result = await submit({
      event: fixture("run.pause"),
      principal: ARJUN,
      idempotencyKey: "k",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong_run");
  });

  it("lets a person act on a run a harness started, since runs are the harness's and the room is everyone's", async () => {
    const { submit } = harness();
    const result = await submit({
      event: fixture("run.pause"),
      principal: ARJUN,
      idempotencyKey: "k",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it.each([
    ["run.completed", "done"],
    ["step.log", "cancelled"],
    ["run.status", "failed"],
  ] as const)("refuses %s into a run that has ended as %s", async (type, state) => {
    const { submit } = harness({ runs: { [RUN]: fixtureRun({ state }) } });
    const result = await submit({ event: fixture(type), principal: SCOUT, idempotencyKey: "k" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("run_state");
      expect(result.error.message).toContain(state);
    }
  });

  it("still takes an approval's decision into a run that has ended (M3.5)", async () => {
    // A gate that handed its question back to a terminal may see the turn end before the card
    // is answered; the answer still settles the card, and the harness reports on it.
    const { submit } = harness({ runs: { [RUN]: fixtureRun({ state: "failed" }) } });
    const decided = await submit({
      event: fixture("approval.resolved"),
      principal: ARJUN,
      idempotencyKey: "k",
    });
    expect(decided.ok, JSON.stringify(decided)).toBe(true);
  });

  it("still takes a question's answer into a run that has ended", async () => {
    // Jacobian asks in a turn and ends the turn before anybody has read the question.
    const { submit } = harness({ runs: { [RUN]: fixtureRun({ state: "done" }) } });
    const answered = await submit({
      event: fixture("question.answered"),
      principal: ARJUN,
      idempotencyKey: "k",
    });
    expect(answered.ok, JSON.stringify(answered)).toBe(true);
  });

  it("pauses only a running run and resumes only a waiting one", async () => {
    const waiting = harness({ runs: { [RUN]: fixtureRun({ state: "waiting" }) } });
    const pause = await waiting.submit({
      event: fixture("run.pause"),
      principal: ARJUN,
      idempotencyKey: "p",
    });
    expect(pause.ok).toBe(false);
    if (!pause.ok) expect(pause.error.kind).toBe("run_state");

    const running = harness();
    const resume = await running.submit({
      event: fixture("run.resume"),
      principal: ARJUN,
      idempotencyKey: "r",
    });
    expect(resume.ok).toBe(false);
    if (!resume.ok) expect(resume.error.message).toContain("not paused");
  });

  it("opens a run only in a space, and lets its owner restate it", async () => {
    const { space_id: _none, ...homeless } = fixture("run.started");
    const nowhere = await harness({ runs: {} }).submit({
      event: homeless,
      principal: SCOUT,
      idempotencyKey: "k",
    });
    expect(nowhere.ok).toBe(false);
    if (!nowhere.ok) expect(nowhere.error.kind).toBe("invalid");

    const again = await harness().submit({
      event: fixture("run.started"),
      principal: SCOUT,
      idempotencyKey: "again",
    });
    expect(again.ok, JSON.stringify(again)).toBe(true);

    const stranger = "hrn_01K4ZQPX00000000000000000S";
    const taken = await harness({ runs: { [RUN]: fixtureRun({ harness_id: stranger }) } }).submit({
      event: fixture("run.started"),
      principal: SCOUT,
      idempotencyKey: "taken",
    });
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error.kind).toBe("wrong_run");
  });

  it("does not resurrect a run that has ended, even for its owner", async () => {
    const { submit } = harness({ runs: { [RUN]: fixtureRun({ state: "done" }) } });
    const result = await submit({
      event: fixture("run.started"),
      principal: SCOUT,
      idempotencyKey: "k",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("run_state");
  });

  it("lands an event that names the run and not the space in the run's space", async () => {
    const { submit, store, asked } = harness();
    const { space_id: _none, ...bare } = fixture("approval.request");
    const result = await submit({ event: bare, principal: SCOUT, idempotencyKey: "hook" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended[0]?.["space_id"]).toBe(SPACE);
    // And the membership rule was asked about that space, not skipped.
    expect(asked).toContain(`${SCOUT.participantId}@${SPACE}`);
  });
});

describe("a message that names the visit it is for (ADR 0040)", () => {
  it("is accepted when the ref names a session of that space, and travels with it", async () => {
    const { submit, store } = harness({ sessions: ["scout:one"] });
    const result = await submit({
      event: { ...fixture("message.post"), session_ref: "scout:one" },
      principal: ARJUN,
      idempotencyKey: "pinned",
    });
    expect(result.ok).toBe(true);
    expect(store.appended.at(-1)?.["session_ref"]).toBe("scout:one");
  });

  it("is refused when the ref names no session of that space, rather than quietly dropped", async () => {
    const result = await harness({ sessions: ["scout:one"] }).submit({
      event: { ...fixture("message.post"), session_ref: "scout:gone" },
      principal: ARJUN,
      idempotencyKey: "stale-pin",
    });
    // Dropping the ref would send the message wherever the harness chose next, and somebody
    // would read an answer from the wrong terminal as an answer from the right one.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid");
  });

  it("leaves a message that names no visit exactly as it was", async () => {
    const { submit, store } = harness({ sessions: [] });
    const result = await submit({
      event: fixture("message.post"),
      principal: ARJUN,
      idempotencyKey: "plain",
    });
    expect(result.ok).toBe(true);
    expect(store.appended.at(-1)?.["session_ref"]).toBeUndefined();
  });
});

describe("what Chips fills in for a run", () => {
  it("says who steered from the credential and the membership, whatever the body claimed", async () => {
    const { submit, store } = harness();
    const forged = {
      participant_id: "usr_01K4ZQPX00000000000000000Q",
      kind: "harness",
      display_name: "Not Arjun",
      role: "guest",
    };
    const result = await submit({
      event: { ...fixture("run.steer"), from: forged },
      principal: ARJUN,
      idempotencyKey: "steer",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended[0]?.["from"]).toEqual({
      participant_id: ARJUN.participantId,
      kind: "person",
      display_name: "Arjun",
      role: "owner",
    });
  });

  it("does not need the sender to say who they are on a steer", async () => {
    const { from: _from, ...bare } = fixture("run.steer");
    const result = await harness().submit({ event: bare, principal: ARJUN, idempotencyKey: "k" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("prices a usage that carries no cost, from the workspace's table", async () => {
    const { submit, store } = harness();
    const { cost: _theirs, ...bare } = fixture("usage");
    const result = await submit({ event: bare, principal: SCOUT, idempotencyKey: "usage" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended[0]?.["cost"]).toEqual({ usd: 0.4958, estimated: true });
  });

  it("prices the tokens a usage says came from the prompt cache at the cache's price", async () => {
    const { submit, store } = harness();
    const { cost: _theirs, ...bare } = fixture("usage");
    const event = { ...bare, cache_read_tokens: 80_000, cache_write_tokens: 1000 };
    await submit({ event, principal: SCOUT, idempotencyKey: "usage" });
    // 1,140 fresh at $5, 80,000 read at $0.50, 1,000 written at $6.25, 3,402 out at $25.
    expect(store.appended[0]).toMatchObject({
      cache_read_tokens: 80_000,
      cost: { usd: 0.137, estimated: true },
    });
  });

  it("keeps a cost the harness computed itself", async () => {
    const { submit, store } = harness();
    await submit({ event: fixture("usage"), principal: SCOUT, idempotencyKey: "usage" });
    expect(store.appended[0]?.["cost"]).toEqual({ usd: 1.47, estimated: true });
  });

  it("leaves a usage for a model it cannot price without a cost, rather than inventing one", async () => {
    const { submit, store } = harness();
    const { cost: _theirs, ...bare } = fixture("usage");
    await submit({ event: { ...bare, model: "abacus-1" }, principal: SCOUT, idempotencyKey: "u" });
    expect(store.appended[0]?.["cost"]).toBeUndefined();
  });
});

describe("what Chips fills in for a room (M3.3)", () => {
  it("resolves a message's @handles to the members they name, and drops what the sender wrote", async () => {
    const { submit, store } = harness();
    const said = await submit({
      event: {
        ...fixture("message.post"),
        text: "@Scout, check with @dana. Over to @Ledger.",
        mentions: ["usr_forged"],
      },
      principal: ARJUN,
      idempotencyKey: "m1",
    });
    expect(said.ok, JSON.stringify(said)).toBe(true);
    expect(store.appended[0]?.["mentions"]).toEqual([SCOUT.participantId, DANA.participantId]);

    const plain = await submit({
      event: { ...fixture("message.post"), text: "No handles here", mentions: ["usr_forged"] },
      principal: ARJUN,
      idempotencyKey: "m2",
    });
    expect(plain.ok).toBe(true);
    expect(store.appended[1]?.["mentions"]).toBeUndefined();
  });

  it("says who a message is for, and drops what the sender wrote of it (ADR 0081)", async () => {
    const { submit, store } = harness();
    const said = await submit({
      event: {
        ...fixture("message.post"),
        text: "Is the PO in?",
        addressed_to: [LEDGER.id],
        held: true,
      },
      principal: ARJUN,
      idempotencyKey: "a1",
    });
    expect(said.ok, JSON.stringify(said)).toBe(true);
    // The room's only harness.
    expect(store.appended[0]?.["addressed_to"]).toEqual([SCOUT.participantId]);
    expect(store.appended[0]?.["held"]).toBeUndefined();
  });

  it("follows a person's @, their choice, a reply, then their last message (ADR 0081)", async () => {
    const { submit, store } = harness({
      ledger: true,
      lastAddressed: { [ARJUN.participantId]: [LEDGER.id] },
    });
    const send = async (event: Record<string, unknown>, key: string) => {
      const said = await submit({
        event: { ...fixture("message.post"), ...event },
        principal: ARJUN,
        idempotencyKey: key,
      });
      expect(said.ok, JSON.stringify(said)).toBe(true);
      return store.appended.at(-1);
    };
    expect((await send({ text: "@Scout and @dana" }, "at"))?.["addressed_to"]).toEqual([
      SCOUT.participantId,
    ]);
    expect((await send({ text: "@dana only" }, "person"))?.["addressed_to"]).toEqual([]);
    expect((await send({ text: "@all hi" }, "all"))?.["addressed_to"]).toEqual([
      SCOUT.participantId,
      LEDGER.id,
    ]);
    const chosen = await send({ text: "your turn", to: [SCOUT.participantId] }, "to");
    expect(chosen?.["addressed_to"]).toEqual([SCOUT.participantId]);
    expect(chosen?.["to"]).toEqual([SCOUT.participantId]);
    // The fixtures' message is Scout's.
    expect((await send({ text: "yes", reply_to: MESSAGE }, "reply"))?.["addressed_to"]).toEqual([
      SCOUT.participantId,
    ]);
    expect((await send({ text: "and then?" }, "last"))?.["addressed_to"]).toEqual([LEDGER.id]);
  });

  it("says which people a person's message is for: those picked, or its @s, never what it wrote (ADR 0204)", async () => {
    const { submit, store } = harness();
    const send = async (event: Record<string, unknown>, key: string) => {
      const said = await submit({
        event: { ...fixture("message.post"), ...event },
        principal: ARJUN,
        idempotencyKey: key,
      });
      expect(said.ok, JSON.stringify(said)).toBe(true);
      return store.appended.at(-1);
    };
    // Foodie, 19 October 2026: words for the other person went to the room's only agent.
    const picked = await send({ text: "How's it going?", to: [DANA.participantId] }, "p1");
    expect(picked?.["addressed_to"]).toEqual([]);
    expect(picked?.["addressed_people"]).toEqual([DANA.participantId]);
    const both = await send(
      { text: "Coffee at 3?", to: [DANA.participantId, SCOUT.participantId] },
      "p2",
    );
    expect(both?.["addressed_to"]).toEqual([SCOUT.participantId]);
    expect(both?.["addressed_people"]).toEqual([DANA.participantId]);
    expect((await send({ text: "@dana are you in?" }, "p3"))?.["addressed_people"]).toEqual([
      DANA.participantId,
    ]);
    const forged = await send(
      { text: "Scout?", to: [SCOUT.participantId], addressed_people: [DANA.participantId] },
      "p4",
    );
    expect(forged?.["addressed_people"]).toBeUndefined();
  });

  it("sends a person's first message in a room of harnesses to every one (ADR 0081)", async () => {
    const { submit, store } = harness({ ledger: true });
    await submit({
      event: { ...fixture("message.post"), text: "Hi", addressed_to_all: true },
      principal: ARJUN,
      idempotencyKey: "hi",
    });
    expect(store.appended[0]?.["addressed_to"]).toEqual([SCOUT.participantId, LEDGER.id]);
    expect(store.appended[0]?.["addressed_to_all"]).toBe(true);
  });

  it("sends a person's message after one for everyone to everyone there now, a newcomer too (ADR 0081)", async () => {
    // Arjun's last message went to Everyone when Scout was the room's only other harness; Ledger
    // has joined since.
    const { submit, store } = harness({
      ledger: true,
      lastAddressed: { [ARJUN.participantId]: "all" },
    });
    await submit({
      event: { ...fixture("message.post"), text: "Both of you?" },
      principal: ARJUN,
      idempotencyKey: "next",
    });
    expect(store.appended[0]?.["addressed_to"]).toEqual([SCOUT.participantId, LEDGER.id]);
    expect(store.appended[0]?.["addressed_to_all"]).toBe(true);
  });

  it("does not say a message it did not send to everyone was, whatever the sender wrote (ADR 0081)", async () => {
    const { submit, store } = harness({ ledger: true });
    await submit({
      event: {
        ...fixture("message.post"),
        text: "Just you",
        to: [LEDGER.id],
        addressed_to_all: true,
      },
      principal: ARJUN,
      idempotencyKey: "one",
    });
    expect(store.appended[0]?.["addressed_to"]).toEqual([LEDGER.id]);
    expect(store.appended[0]?.["addressed_to_all"]).toBeUndefined();
  });

  it("keeps a harness's unnamed words for the people, and holds one to another only past the ceiling or on a pause (ADR 0097)", async () => {
    const said = async (chatter: number, text: string, paused = false) => {
      const { submit, store } = harness({ ledger: true, chatter, paused });
      const result = await submit({
        event: { ...fixture("message.post"), text },
        principal: SCOUT,
        idempotencyKey: "h",
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      return { event: store.appended[0], held: result.ok ? result.value.held : undefined };
    };
    expect((await said(0, "Done.")).event?.["addressed_to"]).toEqual([]);
    // Named in bold, as a lead's plan names who does each step (AW-20).
    expect((await said(0, "1. **@Ledger:** book it")).event?.["addressed_to"]).toEqual([LEDGER.id]);
    // The fifth, which ADR 0081's guard held, and the forty-eighth go.
    for (const before of [4, 47]) {
      const went = await said(before, "@Ledger is it booked?");
      expect(went.event?.["addressed_to"]).toEqual([LEDGER.id]);
      expect(went.event?.["held"]).toBeUndefined();
      expect(went.held).toBeUndefined();
    }
    // The one after the ceiling is held, and its sender is told the count.
    const past = await said(48, "@Ledger is it booked?");
    expect(past.event?.["addressed_to"]).toEqual([]);
    expect(past.event?.["held"]).toBe(true);
    expect(past.held).toEqual({ count: 49, allowance: 48 });
    // Paused by a person, the first is held.
    const paused = await said(0, "@Ledger is it booked?", true);
    expect(paused.event?.["held"]).toBe(true);
    expect(paused.held).toEqual({ count: 1, allowance: 48 });
    // Words for the people are never held, paused or not.
    expect((await said(60, "Booked, Arjun.", true)).event?.["held"]).toBeUndefined();
  });

  it("says what kind of participant a membership names, from the registry", async () => {
    const { submit, store } = harness();
    const added = await submit({
      event: { ...fixture("membership.added"), participant_kind: "person" },
      principal: ARJUN,
      idempotencyKey: "add",
    });
    expect(added.ok, JSON.stringify(added)).toBe(true);
    // A harness added to a room is its default agent (ADR 0087's addendum, point 5): registered
    // first, keyed and named after the harness, then added.
    expect(store.appended[0]).toMatchObject({
      type: "agent.registered",
      harness_id: SCOUT.participantId,
      key: SCOUT.participantId,
      name: SCOUT.displayName,
    });
    expect(store.appended[1]).toMatchObject({
      type: "membership.added",
      participant_id: store.appended[0]?.["agent_id"],
      participant_kind: "agent",
    });

    const nobody = await submit({
      event: { ...fixture("membership.added"), participant_id: "hrn_01K4ZQPX00000000000000000Z" },
      principal: ARJUN,
      idempotencyKey: "ghost",
    });
    expect(nobody.ok).toBe(false);
    if (!nobody.ok) expect(nobody.error.kind).toBe("unknown_participant");
  });

  it("writes who may answer onto an approval: the owner unless policy or the harness says", async () => {
    const owner = harness({ policy: { autonomy: 2 } });
    await owner.submit({
      // The harness asks for the owner and an ops lead; nobody here is an ops lead.
      event: { ...fixture("approval.request"), approvers: ["owner", "role:ops_lead"] },
      principal: SCOUT,
      idempotencyKey: "a",
    });
    expect(owner.store.appended[0]?.["approvers"]).toEqual([ARJUN.participantId]);

    const rule: PolicyRule = { match: "email.*", decision: "ask", approvers: ["role:member"] };
    const byRule = harness({
      workspace: { max_autonomy: 2, rules: [rule] },
      roles: { [DANA.participantId]: "member" },
    });
    await byRule.submit({
      event: fixture("approval.request"),
      principal: SCOUT,
      idempotencyKey: "b",
    });
    expect(byRule.store.appended[0]?.["approvers"]).toEqual([DANA.participantId]);

    const anyone = harness({ roles: { [DANA.participantId]: "member" } });
    await anyone.submit({
      event: { ...fixture("approval.request"), approvers: ["any"] },
      principal: SCOUT,
      idempotencyKey: "c",
    });
    expect(anyone.store.appended[0]?.["approvers"]).toEqual([
      ARJUN.participantId,
      DANA.participantId,
    ]);
  });

  it("keeps who may answer to the room, and inside a lane falls back to the person it is for", async () => {
    // Ledger is Dana's, and works a lane for Arjun in a room Dana is not in (Gate 3).
    const LEDGER: Principal = {
      ...SCOUT,
      participantId: "hrn_01K4ZQPX00000000000000000B",
      displayName: "Ledger",
      ownerId: DANA.participantId,
    };
    const lane: LaneView = {
      lane_id: "lane_01K4ZQPX00000000000000000A",
      run_id: RUN,
      lead_id: SCOUT.participantId,
      specialist_id: LEDGER.participantId,
      on_behalf_of: ARJUN.participantId,
      lead_run_id: null,
      home_space_id: SPACE,
      linked_space_ids: [],
      origin_message_id: null,
      goal: "Check the quotes",
      state: "running",
      delivery: "pending",
      depth: 1,
      trail: [],
      summary: null,
      cost_usd: null,
    };
    const runs = { [RUN]: fixtureRun({ harness_id: LEDGER.participantId }) };
    // The harness names nobody, so policy's default — the owner — is what resolves.
    const { approvers: _asked, ...ask } = fixture("approval.request");

    const inLane = harness({ nonMembers: [DANA.participantId], runs, lane });
    const asked = await inLane.submit({ event: ask, principal: LEDGER, idempotencyKey: "a" });
    expect(asked.ok, JSON.stringify(asked)).toBe(true);
    expect(inLane.store.appended[0]?.["approvers"]).toEqual([ARJUN.participantId]);

    // Not a lane: nobody named is here, so the owner answers from wherever she is (ADR 0042).
    // Before decision 9 this left an empty list, which meant anyone in the room but a guest.
    const plain = harness({ nonMembers: [DANA.participantId], runs });
    await plain.submit({ event: ask, principal: LEDGER, idempotencyKey: "b" });
    expect(plain.store.appended[0]?.["approvers"]).toEqual([DANA.participantId]);

    // A guest is in one room and is named only there, so an absent guest owner names nobody.
    const guest = harness({
      nonMembers: [DANA.participantId],
      runs,
      workspaceRoles: { ...WORKSPACE_ROLES_BY_DEFAULT, [DANA.participantId]: "guest" },
    });
    await guest.submit({ event: ask, principal: LEDGER, idempotencyKey: "g" });
    expect(guest.store.appended[0]?.["approvers"]).toEqual([]);

    // Scout names a ghost: the owner, who is here, answers — not anyone (Gate 5).
    const ghost = harness();
    await ghost.submit({
      event: { ...fixture("approval.request"), approvers: ["usr_01K4ZQPX00000000000000000Z"] },
      principal: SCOUT,
      idempotencyKey: "d",
    });
    expect(ghost.store.appended[0]?.["approvers"]).toEqual([ARJUN.participantId]);

    // Dana in the room: her own, as before.
    const present = harness({ runs, lane });
    await present.submit({ event: ask, principal: LEDGER, idempotencyKey: "c" });
    expect(present.store.appended[0]?.["approvers"]).toEqual([DANA.participantId]);
  });
});

describe("feedback on a harness's message (M3.4)", () => {
  it("says who gave it from the credential and the membership, whatever the body claimed", async () => {
    const { submit, store } = harness({ roles: { [DANA.participantId]: "member" } });
    const forged = {
      participant_id: "usr_x",
      kind: "harness",
      display_name: "Nobody",
      role: "owner",
    };
    const result = await submit({
      event: { ...fixture("feedback"), from: forged },
      principal: DANA,
      idempotencyKey: "note",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended[0]?.["from"]).toEqual({
      participant_id: DANA.participantId,
      kind: "person",
      display_name: "Dana",
      role: "member",
    });
  });

  it("does not need the sender to say who they are, nor which space: the message knows", async () => {
    const { from: _from, space_id: _space, ...bare } = fixture("feedback");
    const { submit, store } = harness();
    const result = await submit({ event: bare, principal: ARJUN, idempotencyKey: "k" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended[0]?.["space_id"]).toBe(SPACE);
  });

  it("takes a reaction as well as a note, and refuses one that says neither", async () => {
    const { text: _text, ...bare } = fixture("feedback");
    const thumbs = await harness().submit({
      event: { ...bare, kind: "reaction", reaction: "👎" },
      principal: ARJUN,
      idempotencyKey: "thumbs",
    });
    expect(thumbs.ok, JSON.stringify(thumbs)).toBe(true);
    const neither = await harness().submit({
      event: { ...bare, kind: "reaction" },
      principal: ARJUN,
      idempotencyKey: "neither",
    });
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error.kind).toBe("invalid");
  });

  it("refuses feedback on a message nobody sent, and on a person's own", async () => {
    const gone = await harness({ messages: {} }).submit({
      event: fixture("feedback"),
      principal: ARJUN,
      idempotencyKey: "gone",
    });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.kind).toBe("unknown_message");

    const theirs = fixtureMessage({ author_kind: "person", author_id: DANA.participantId });
    const person = await harness({ messages: { [MESSAGE]: theirs } }).submit({
      event: fixture("feedback"),
      principal: ARJUN,
      idempotencyKey: "theirs",
    });
    expect(person.ok).toBe(false);
    if (!person.ok) expect(person.error.kind).toBe("wrong_message");
  });

  it("refuses a reply to a message nobody sent, or to one in another space (ADR 0219)", async () => {
    const reply = { ...fixture("message.post"), reply_to: MESSAGE };
    const nothing = await harness({ messages: {} }).submit({
      event: reply,
      principal: ARJUN,
      idempotencyKey: "to-nothing",
    });
    expect(nothing.ok).toBe(false);
    if (!nothing.ok) expect(nothing.error.kind).toBe("unknown_message");

    const elsewhere = fixtureMessage({ space_id: "spc_01K4ZQPX000000000000000099" });
    const there = await harness({ messages: { [MESSAGE]: elsewhere } }).submit({
      event: reply,
      principal: ARJUN,
      idempotencyKey: "to-elsewhere",
    });
    expect(there.ok).toBe(false);
    if (!there.ok) expect(there.error.kind).toBe("wrong_message");

    // One said here is answered, taken back since or not.
    const deleted = fixtureMessage({ deleted_at: "2026-10-21T09:00:00.000Z" });
    const here = await harness({ messages: { [MESSAGE]: deleted } }).submit({
      event: reply,
      principal: ARJUN,
      idempotencyKey: "to-here",
    });
    expect(here.ok, JSON.stringify(here)).toBe(true);
  });

  it("asks about membership before it says whether the message exists", async () => {
    const { submit, asked } = harness({ nonMembers: [DANA.participantId], messages: {} });
    const result = await submit({
      event: fixture("feedback"),
      principal: DANA,
      idempotencyKey: "outsider",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong_space");
    // The message was looked up (it says which space to check) and nothing was said about it.
    expect(asked).toContain(`message:${MESSAGE}`);
  });
});

describe("who may answer (M3.3)", () => {
  const decide = (h: ReturnType<typeof harness>, principal: Principal) =>
    h.submit({ event: fixture("approval.resolved"), principal, idempotencyKey: "decide" });

  it("takes a decision only from who the approval names, when it names anyone", async () => {
    const named = harness({ approval: fixtureApproval({ approvers: [DANA.participantId] }) });
    const arjun = await decide(named, ARJUN);
    expect(arjun.ok).toBe(false);
    if (!arjun.ok) expect(arjun.error.kind).toBe("not_an_approver");
    const dana = await decide(named, DANA);
    expect(dana.ok, JSON.stringify(dana)).toBe(true);

    const anyone = harness({ approval: fixtureApproval({ approvers: [] }) });
    expect((await decide(anyone, ARJUN)).ok).toBe(true);
  });

  it("lets somebody named answer from outside the room (ADR 0042)", async () => {
    const outside = harness({
      approval: fixtureApproval({ approvers: [DANA.participantId] }),
      nonMembers: [DANA.participantId],
    });
    const dana = await decide(outside, DANA);
    expect(dana.ok, JSON.stringify(dana)).toBe(true);

    // Somebody the ask does not name is refused, in the room or out of it.
    const stranger = harness({
      approval: fixtureApproval({ approvers: [DANA.participantId] }),
      nonMembers: [ARJUN.participantId],
    });
    const refused = await decide(stranger, ARJUN);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe("not_an_approver");

    // An ask that names nobody is still the room's.
    const roomsOwn = harness({
      approval: fixtureApproval({ approvers: [] }),
      nonMembers: [DANA.participantId],
    });
    const away = await decide(roomsOwn, DANA);
    expect(away.ok).toBe(false);
    if (!away.ok) expect(away.error.kind).toBe("wrong_space");
  });

  it("writes onto the decision who could have answered it, so they hear it (ADR 0042)", async () => {
    const named = harness({
      approval: fixtureApproval({ approvers: [DANA.participantId] }),
      nonMembers: [DANA.participantId],
    });
    await named.submit({
      // A sender's own list is replaced, as every attributed field is.
      event: { ...fixture("approval.resolved"), approvers: [SCOUT.participantId] },
      principal: DANA,
      idempotencyKey: "decide",
    });
    expect(named.store.appended.at(-1)?.["approvers"]).toEqual([DANA.participantId]);

    const executed = harness({ approval: fixtureApproval({ approvers: [DANA.participantId] }) });
    await executed.submit({
      event: fixture("approval.executed"),
      principal: SCOUT,
      idempotencyKey: "executed",
    });
    expect(executed.store.appended.at(-1)?.["approvers"]).toEqual([DANA.participantId]);

    // An ask that named nobody names nobody on the way out either.
    const anyone = harness({ approval: fixtureApproval({ approvers: [] }) });
    await anyone.submit({
      event: fixture("approval.resolved"),
      principal: ARJUN,
      idempotencyKey: "decide",
    });
    expect(anyone.store.appended.at(-1)?.["approvers"]).toBeUndefined();
  });
});

describe("a change to a space (M3.3)", () => {
  it("lets the harness that opened a space retitle it, and no other harness", async () => {
    const opener = await harness().submit({
      event: fixture("space.updated"),
      principal: SCOUT,
      idempotencyKey: "title",
    });
    expect(opener.ok, JSON.stringify(opener)).toBe(true);

    const other = await harness({ openedBy: ARJUN.participantId }).submit({
      event: fixture("space.updated"),
      principal: SCOUT,
      idempotencyKey: "title",
    });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.kind).toBe("not_the_opener");
  });

  it("lets a person in the space close it, but not a guest", async () => {
    const closing: Record<string, unknown> = { ...fixture("space.updated"), state: "closed" };
    delete closing["title"];
    const member = await harness({ roles: { [ARJUN.participantId]: "member" } }).submit({
      event: closing,
      principal: ARJUN,
      idempotencyKey: "close",
    });
    expect(member.ok, JSON.stringify(member)).toBe(true);

    const guest = await harness({ roles: { [ARJUN.participantId]: "guest" } }).submit({
      event: closing,
      principal: ARJUN,
      idempotencyKey: "close",
    });
    expect(guest.ok).toBe(false);
    if (!guest.ok) expect(guest.error.kind).toBe("wrong_role");
  });

  it("lets only the owner remove somebody else, and anyone leave", async () => {
    const removal = { ...fixture("membership.removed"), participant_id: DANA.participantId };
    // A member of the room who is a member of the workspace, too: no standing to remove anybody.
    const member = await harness({ roles: { [ARJUN.participantId]: "member" } }).submit({
      event: removal,
      principal: { ...ARJUN, role: "member" },
      idempotencyKey: "remove",
    });
    expect(member.ok).toBe(false);
    if (!member.ok) expect(member.error.kind).toBe("wrong_role");

    const owner = await harness().submit({
      event: removal,
      principal: ARJUN,
      idempotencyKey: "remove",
    });
    expect(owner.ok, JSON.stringify(owner)).toBe(true);

    const left = await harness({ roles: { [DANA.participantId]: "guest" } }).submit({
      event: removal,
      principal: DANA,
      idempotencyKey: "leave",
    });
    expect(left.ok, JSON.stringify(left)).toBe(true);
  });
});

describe("a person's standing in the workspace (ADR 0034)", () => {
  const GUEST_ID = "usr_01K4ZQPX00000000000000000C";

  it("lets an owner change a role, and neither a member nor the last owner's own", async () => {
    const promote = {
      ...fixture("role.changed"),
      participant_id: DANA.participantId,
      role: "admin",
    };
    const byOwner = await harness().submit({
      event: promote,
      principal: ARJUN,
      idempotencyKey: "r1",
    });
    expect(byOwner.ok, JSON.stringify(byOwner)).toBe(true);
    if (byOwner.ok) {
      expect(byOwner.value.event.type).toBe("role.changed");
      expect(byOwner.value.event.payload["role"]).toBe("admin");
    }

    const byMember = await harness().submit({
      event: promote,
      principal: DANA,
      idempotencyKey: "r2",
    });
    expect(byMember.ok).toBe(false);
    if (!byMember.ok) expect(byMember.error.kind).toBe("wrong_role");

    // Arjun is the only owner: he may not step down until there is another.
    const demote = {
      ...fixture("role.changed"),
      participant_id: ARJUN.participantId,
      role: "member",
    };
    const last = await harness().submit({ event: demote, principal: ARJUN, idempotencyKey: "r3" });
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.error.message).toMatch(/last owner/);

    // With Dana an owner too, he may.
    const two = harness({
      workspaceRoles: { [ARJUN.participantId]: "owner", [DANA.participantId]: "owner" },
    });
    expect((await two.submit({ event: demote, principal: ARJUN, idempotencyKey: "r4" })).ok).toBe(
      true,
    );

    // An admin may not make an owner.
    const asAdmin = harness({
      workspaceRoles: { [ARJUN.participantId]: "owner", [DANA.participantId]: "admin" },
    });
    const crown = {
      ...fixture("role.changed"),
      participant_id: ARJUN.participantId,
      role: "owner",
    };
    const refused = await asAdmin.submit({
      event: { ...crown, participant_id: DANA.participantId },
      principal: { ...DANA, role: "admin" },
      idempotencyKey: "r5",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe("wrong_role");
  });

  it("lets nobody but an owner take an owner of the workspace out of a room (JR-23)", async () => {
    const asAdmin = harness({
      workspaceRoles: { [ARJUN.participantId]: "owner", [DANA.participantId]: "admin" },
    });
    const out = (participantId: string) => ({
      ...fixture("membership.removed"),
      participant_id: participantId,
      reason: "removed",
    });
    const refused = await asAdmin.submit({
      event: out(ARJUN.participantId),
      principal: { ...DANA, role: "admin" },
      idempotencyKey: "o1",
    });
    expect(refused).toMatchObject({
      ok: false,
      error: {
        kind: "wrong_role",
        message: "only an owner of the workspace takes an owner out of a space",
      },
    });
    // The owner may take the admin out, as before.
    const taken = await asAdmin.submit({
      event: out(DANA.participantId),
      principal: ARJUN,
      idempotencyKey: "o2",
    });
    expect(taken.ok, JSON.stringify(taken)).toBe(true);
  });

  it("refuses a change for somebody who never joined", async () => {
    const stranger = { ...fixture("role.changed"), participant_id: GUEST_ID, role: "member" };
    const result = await harness().submit({
      event: stranger,
      principal: ARJUN,
      idempotencyKey: "r6",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_participant");
  });

  it("seats a guest of the workspace as a guest of the room, in one room at most", async () => {
    const roles = {
      [ARJUN.participantId]: "owner" as const,
      [DANA.participantId]: "guest" as const,
    };
    const added = {
      ...fixture("membership.added"),
      participant_id: DANA.participantId,
      role: "member",
    };
    // Not in any space yet: seated, and as a guest whatever the sender wrote.
    const first = await harness({
      workspaceRoles: roles,
      spaceCounts: { [DANA.participantId]: 0 },
    }).submit({ event: added, principal: ARJUN, idempotencyKey: "g1" });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (first.ok) expect(first.value.event.payload["role"]).toBe("guest");

    // Already in another space: refused.
    const elsewhere = await harness({
      workspaceRoles: roles,
      spaceCounts: { [DANA.participantId]: 1 },
      nonMembers: [DANA.participantId],
    }).submit({ event: added, principal: ARJUN, idempotencyKey: "g2" });
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) expect(elsewhere.error.kind).toBe("guest_elsewhere");

    // Added again to the one space they are in: a retry, not a second space.
    const again = await harness({
      workspaceRoles: roles,
      spaceCounts: { [DANA.participantId]: 1 },
    }).submit({ event: added, principal: ARJUN, idempotencyKey: "g3" });
    expect(again.ok, JSON.stringify(again)).toBe(true);
  });

  it("makes nobody in more than one space a guest (Gate 5)", async () => {
    const demote = { type: "role.changed", participant_id: DANA.participantId, role: "guest" };
    const busy = harness({ spaceCounts: { [DANA.participantId]: 2 } });
    expect(
      await busy.submit({ event: demote, principal: ARJUN, idempotencyKey: "d1" }),
    ).toMatchObject({
      ok: false,
      error: { kind: "wrong_role", message: expect.stringMatching(/in 2/) },
    });
    const one = harness({ spaceCounts: { [DANA.participantId]: 1 } });
    expect((await one.submit({ event: demote, principal: ARJUN, idempotencyKey: "d2" })).ok).toBe(
      true,
    );
    // The other way is always open: a guest in one room made a member.
    const up = harness({
      workspaceRoles: { [ARJUN.participantId]: "owner", [DANA.participantId]: "guest" },
      spaceCounts: { [DANA.participantId]: 1 },
    });
    expect(
      (
        await up.submit({
          event: { ...demote, role: "member" },
          principal: ARJUN,
          idempotencyKey: "d3",
        })
      ).ok,
    ).toBe(true);
  });

  it("lets a guest open no space", async () => {
    const opened = await harness().submit({
      event: fixture("space.created"),
      principal: { ...DANA, role: "guest" },
      idempotencyKey: "g4",
    });
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.error.kind).toBe("wrong_role");
  });

  it("lets a member open no space, and an admin open one (ADR 0196)", async () => {
    const asMember = await harness().submit({
      event: fixture("space.created"),
      principal: { ...DANA, role: "member" },
      idempotencyKey: "m4",
    });
    expect(asMember.ok).toBe(false);
    if (!asMember.ok) expect(asMember.error.kind).toBe("wrong_role");
    const asAdmin = await harness({ nonMembers: [DANA.participantId] }).submit({
      event: fixture("space.created"),
      principal: { ...DANA, role: "admin" },
      idempotencyKey: "a4",
    });
    expect(asAdmin.ok, JSON.stringify(asAdmin)).toBe(true);
  });
});

describe("policy, on an approval request as it arrives (M1.4)", () => {
  const ask = (h: ReturnType<typeof harness>, key: string) =>
    h.submit({ event: fixture("approval.request"), principal: SCOUT, idempotencyKey: key });

  it("leaves the card for a person when the level says ask, and records nothing else", async () => {
    const h = harness({ policy: { autonomy: 2 } });
    const result = await ask(h, "ask");
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolution).toBeUndefined();
    expect(h.store.appended.map((event) => event.type)).toEqual(["approval.request"]);
  });

  it("approves on the spot at L3, as an event of Chips' own, with the reason", async () => {
    const h = harness({ policy: { autonomy: 3 }, workspace: { max_autonomy: 3, rules: [] } });
    const result = await ask(h, "auto");
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(h.store.appended.map((event) => event.type)).toEqual([
      "approval.request",
      "approval.resolved",
    ]);
    const resolved = h.store.appended[1] as Record<string, unknown>;
    expect(resolved).toMatchObject({
      actor: { kind: "system", id: "system" },
      approval_id: "apr_01K4ZQPX000000000000000006",
      decision: "approved",
      scope: "once",
      resolved_by: "system",
      resolved_elsewhere: false,
      idempotency_key: "apr_01K4ZQPX000000000000000006-policy",
    });
    expect(String(resolved["reason"])).toContain("L3");
    expect(result.value.resolution?.payload["decision"]).toBe("approved");
  });

  it("denies on the spot when a rule says so, and the workspace cap holds over the harness", async () => {
    const rule: PolicyRule = { match: "email.*", decision: "deny", reason: "No email from here." };
    const denied = await ask(harness({ policy: { autonomy: 3, rules: [rule] } }), "deny");
    expect(denied.ok).toBe(true);
    if (denied.ok) {
      expect(denied.value.resolution?.payload).toMatchObject({
        decision: "denied",
        reason: "No email from here.",
      });
    }

    const capped = harness({ policy: { autonomy: 3 }, workspace: { max_autonomy: 1, rules: [] } });
    const asked = await ask(capped, "cap");
    expect(asked.ok).toBe(true);
    if (asked.ok) expect(asked.value.resolution).toBeUndefined();
  });

  it("treats a brand-new harness with no policy as L1, ask first", async () => {
    const result = await ask(harness(), "new");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.resolution).toBeUndefined();
  });

  it("puts what was decided for this session before the harness's own rules", async () => {
    const session: PolicyRule[] = [{ match: "email.send", decision: "allow" }];
    // A person's answer holds from L1, where every harness starts (finding 24).
    const first = await ask(harness({ policy: { autonomy: 1 }, session }), "s1");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.resolution?.payload["decision"]).toBe("approved");

    const auto = await ask(harness({ policy: { autonomy: 2 }, session }), "s2");
    expect(auto.ok).toBe(true);
    if (auto.ok) expect(auto.value.resolution?.payload["decision"]).toBe("approved");

    // Not at L0, which asks for everything, and not past a workspace capped below L2.
    const observing = await ask(harness({ policy: { autonomy: 0 }, session }), "s0");
    expect(observing.ok).toBe(true);
    if (observing.ok) expect(observing.value.resolution).toBeUndefined();
    const capped = harness({
      policy: { autonomy: 2 },
      session,
      workspace: { max_autonomy: 1, rules: [] },
    });
    const held = await ask(capped, "sc");
    expect(held.ok).toBe(true);
    if (held.ok) expect(held.value.resolution).toBeUndefined();
  });

  it("approves by an always at L1, the next ask of its kind (finding 24)", async () => {
    const always: PolicyRule = {
      match: "email.send",
      when: { external: true, irreversible: true },
      decision: "allow",
      reason: "Arjun said always, on 2026-09-27T17:42:22.070Z",
    };
    const result = await ask(harness({ policy: { autonomy: 1, rules: [always] } }), "a1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resolution?.payload).toMatchObject({
        decision: "approved",
        resolved_by: "system",
      });
    }
  });

  it("lets a command through only when a rule covers every part of it (ADR 0239)", async () => {
    const command = (h: ReturnType<typeof harness>, line: string, key: string) =>
      h.submit({
        event: {
          ...fixture("approval.request"),
          action: { kind: "shell.exec", input: { command: line } },
          risk: [],
        },
        principal: SCOUT,
        idempotencyKey: key,
      });
    const starts = (...words: string[]): PolicyRule => ({
      match: "shell.exec",
      when: { starts_with: words },
      decision: "allow",
    });
    const rules = [starts("node", "--check"), starts("echo", "ok")];
    const covered = await command(
      harness({ policy: { autonomy: 1, rules } }),
      "node --check game.js && echo ok",
      "c1",
    );
    expect(covered.ok).toBe(true);
    if (covered.ok) {
      expect(covered.value.resolution?.payload).toMatchObject({ decision: "approved" });
      expect(String(covered.value.resolution?.payload["reason"])).toContain("every part");
    }

    // One part nothing covers, a command it can't read, and one with no command at all: a card.
    for (const [line, key] of [
      ["node --check game.js && rm -rf build", "c2"],
      ["node --check game.js > out.txt", "c3"],
      ["node -e 'process.exit()'", "c4"],
    ] as const) {
      const asked = await command(harness({ policy: { autonomy: 1, rules } }), line, key);
      expect(asked.ok).toBe(true);
      if (asked.ok) expect(asked.value.resolution, line).toBeUndefined();
    }

    // A part a rule stops stops the command, whatever covers the rest.
    const stop: PolicyRule = {
      match: "shell.exec",
      when: { starts_with: ["echo"] },
      decision: "deny",
      reason: "No echo here.",
    };
    const denied = await command(
      harness({ policy: { autonomy: 1, rules: [...rules, stop] } }),
      "node --check game.js && echo ok",
      "c5",
    );
    expect(denied.ok).toBe(true);
    if (denied.ok) {
      expect(denied.value.resolution?.payload).toMatchObject({
        decision: "denied",
        reason: "No echo here.",
      });
    }
  });

  it("reads the harness's everywhere after a space's own rules (ADR 0239)", async () => {
    const ask = {
      ...fixture("approval.request"),
      action: { kind: "shell.exec", input: { command: "git status --short | head -3" } },
      risk: [],
    };
    const policy = {
      space_id: SPACE,
      autonomy: 1,
      rules: [{ match: "shell.exec", when: { starts_with: ["head", "-3"] }, decision: "allow" }],
      everywhere_rules: [
        { match: "shell.exec", when: { starts_with: ["git", "status"] }, decision: "allow" },
      ],
    } satisfies Partial<HarnessPolicyView>;
    const result = await harness({ policy }).submit({
      event: ask,
      principal: SCOUT,
      idempotencyKey: "e1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.resolution?.payload["decision"]).toBe("approved");
  });

  it("lets a session's starts answer only commands made of them (ADR 0239)", async () => {
    const session: PolicyRule[] = [
      { match: "shell.exec", when: { starts_with: ["ls", "-la"] }, decision: "allow" },
    ];
    const ask = (line: string, key: string) =>
      harness({ policy: { autonomy: 1 }, session }).submit({
        event: {
          ...fixture("approval.request"),
          action: { kind: "shell.exec", input: { command: line } },
          risk: [],
        },
        principal: SCOUT,
        idempotencyKey: key,
      });
    const same = await ask("ls -la /tmp; ls -la", "s1");
    if (same.ok) expect(same.value.resolution?.payload["decision"]).toBe("approved");
    const other = await ask("ls -la && cat x", "s2");
    if (other.ok) expect(other.value.resolution).toBeUndefined();
  });

  it("decides nothing twice: a retried request appends no second decision", async () => {
    const h = harness({ policy: { autonomy: 3 }, workspace: { max_autonomy: 3, rules: [] } });
    await ask(h, "once");
    const before = h.store.appended.length;
    // The fake store appends anything; a duplicate is what the real store would say.
    const original = h.store.append;
    (h.store as { append: EventStore["append"] }).append = async (event) => ({
      ...(await original(event)),
      duplicate: true,
    });
    const again = await ask(h, "once");
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.resolution).toBeUndefined();
    expect(h.store.appended.length).toBe(before + 1);
  });
});

describe("a decision made always, or twice (M1.4)", () => {
  it("turns an always into a rule in the harness's policy, as an event", async () => {
    const { submit, store } = harness({ policy: { autonomy: 2, rules: [] } });
    const result = await submit({
      event: { ...fixture("approval.resolved"), scope: "always" },
      principal: ARJUN,
      idempotencyKey: "always",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended.map((event) => event.type)).toEqual([
      "approval.resolved",
      "policy.updated",
    ]);
    const policy = store.appended[1] as Record<string, unknown>;
    expect(policy).toMatchObject({
      actor: { kind: "system", id: "system" },
      harness_id: SCOUT.participantId,
      space_id: SPACE,
      changed_by: ARJUN.participantId,
      workspace_max_autonomy: 2,
      idempotency_key: "apr_01K4ZQPX000000000000000006-always",
    });
    const rules = (policy["policy"] as { rules: PolicyRule[] }).rules;
    expect(rules[0]).toMatchObject({
      match: "shell.exec",
      when: {},
      decision: "allow",
      // Who made it and when, so the harness page can say so (ADR 0195).
      made_by: ARJUN.participantId,
      made_at: (store.appended[0] as Record<string, unknown>)["resolved_at"],
    });
    expect(rules[0]?.reason).toContain("Arjun said always");
  });

  it("refuses Always and This session on an ask that matters, and takes Once (ADR 0195)", async () => {
    const email = fixtureApproval({
      action: { kind: "email.send", external: true, irreversible: true },
    });
    for (const scope of ["always", "session"]) {
      const { submit, store } = harness({ policy: { autonomy: 2, rules: [] }, approval: email });
      const result = await submit({
        event: { ...fixture("approval.resolved"), scope },
        principal: ARJUN,
        idempotencyKey: `standing-${scope}`,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("answered once");
      expect(store.appended).toEqual([]);
    }
    const once = await harness({ approval: email }).submit({
      event: { ...fixture("approval.resolved"), scope: "once" },
      principal: ARJUN,
      idempotencyKey: "standing-once",
    });
    expect(once.ok, JSON.stringify(once)).toBe(true);
  });

  it("lets a new Always replace a twin that was turned off (ADR 0195)", async () => {
    const off: PolicyRule = { match: "shell.exec", when: {}, decision: "allow", off: true };
    const other: PolicyRule = { match: "file.read", decision: "allow" };
    // The space's own row: an Always in a space keeps what that row holds.
    const { submit, store } = harness({
      policy: { space_id: SPACE, autonomy: 1, rules: [off, other] },
    });
    const result = await submit({
      event: { ...fixture("approval.resolved"), scope: "always" },
      principal: ARJUN,
      idempotencyKey: "always-back-on",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const rules = (store.appended[1] as unknown as { policy: { rules: PolicyRule[] } }).policy
      .rules;
    expect(rules.map((rule) => [rule.match, rule.off])).toEqual([
      ["shell.exec", undefined],
      ["file.read", undefined],
    ]);
  });

  it("refuses a harness settling its own ask that matters (SEC-10, ADR 0195)", async () => {
    const email = fixtureApproval({
      action: { kind: "email.send", external: true, irreversible: true },
    });
    const { submit, store } = harness({
      runs: { [RUN]: fixtureRun({ state: "running" }) },
      approval: email,
    });
    const result = await submit({
      event: { ...fixture("approval.resolved"), reason: "Allowed in its own window." },
      principal: SCOUT,
      idempotencyKey: "settled-matters",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_an_approver");
      expect(result.error.message).toContain("wait for a person");
    }
    expect(store.appended).toEqual([]);
  });

  it("writes no second rule for an always the policy already has", async () => {
    const kept: PolicyRule = {
      match: "shell.exec",
      when: {},
      decision: "allow",
      reason: "Arjun said always, on 2026-09-27T07:52:17.612Z",
    };
    const { submit, store } = harness({ policy: { space_id: SPACE, autonomy: 1, rules: [kept] } });
    const result = await submit({
      event: { ...fixture("approval.resolved"), scope: "always" },
      principal: ARJUN,
      idempotencyKey: "always-again",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended.map((event) => event.type)).toEqual(["approval.resolved"]);
  });

  it("remembers how each part of a command starts, one rule each, none twice (ADR 0239)", async () => {
    const asked = fixtureApproval({
      action: { kind: "shell.exec", input: { command: "node --check game.js && echo ok | sort" } },
    });
    const echo: PolicyRule = {
      match: "shell.exec",
      when: { starts_with: ["echo"] },
      decision: "allow",
    };
    const { submit, store } = harness({
      policy: { space_id: SPACE, autonomy: 1, rules: [echo] },
      approval: asked,
    });
    const result = await submit({
      event: { ...fixture("approval.resolved"), scope: "always" },
      principal: ARJUN,
      idempotencyKey: "always-parts",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const policy = store.appended[1] as Record<string, unknown>;
    expect(policy["space_id"]).toBe(SPACE);
    const rules = (policy["policy"] as { rules: PolicyRule[] }).rules;
    expect(rules.map((rule) => rule.when?.starts_with)).toEqual([
      ["node", "--check"],
      ["sort"],
      ["echo"],
    ]);
    expect(rules.every((rule) => rule.match === "shell.exec")).toBe(true);
    expect(String(policy["reason"])).toBe(
      "Arjun decided node --check …, echo …, sort … is fine always.",
    );
  });

  it("keeps an Always for every space in the harness's own policy (ADR 0239)", async () => {
    const asked = fixtureApproval({
      action: { kind: "shell.exec", input: { command: "git status --short" } },
    });
    const other: PolicyRule = { match: "file.read", decision: "allow" };
    const { submit, store } = harness({
      policy: { space_id: "*", autonomy: 1, rules: [other] },
      approval: asked,
    });
    const result = await submit({
      event: { ...fixture("approval.resolved"), scope: "always", everywhere: true },
      principal: ARJUN,
      idempotencyKey: "always-everywhere",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const policy = store.appended[1] as Record<string, unknown>;
    expect(policy).not.toHaveProperty("space_id");
    const rules = (policy["policy"] as { rules: PolicyRule[] }).rules;
    expect(rules.map((rule) => [rule.match, rule.when?.starts_with])).toEqual([
      ["shell.exec", ["git", "status"]],
      ["file.read", undefined],
    ]);
    expect(String(policy["reason"])).toContain("always, in every space.");
  });

  it("copies nothing of the harness's everywhere into a space's first row (ADR 0239)", async () => {
    // A space with no row of its own reads the harness's; its first Always starts it empty,
    // since the engine reads the harness's rules after the space's rather than in place of them.
    const everywhere: PolicyRule = { match: "file.read", decision: "allow" };
    const { submit, store } = harness({
      policy: { space_id: "*", autonomy: 1, rules: [everywhere] },
    });
    const result = await submit({
      event: { ...fixture("approval.resolved"), scope: "always" },
      principal: ARJUN,
      idempotencyKey: "always-first-row",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const policy = store.appended[1] as Record<string, unknown>;
    expect(policy["space_id"]).toBe(SPACE);
    const rules = (policy["policy"] as { rules: PolicyRule[] }).rules;
    expect(rules.map((rule) => rule.match)).toEqual(["shell.exec"]);
  });

  it("takes every space only from an owner or an admin, and only with Always (ADR 0239)", async () => {
    const member = await harness({ roles: { [ARJUN.participantId]: "member" } }).submit({
      event: { ...fixture("approval.resolved"), scope: "always", everywhere: true },
      principal: { ...ARJUN, role: "member" },
      idempotencyKey: "everywhere-member",
    });
    expect(member.ok).toBe(false);
    if (!member.ok) {
      expect(member.error.kind).toBe("wrong_role");
      expect(member.error.message).toContain("every space");
    }

    const session = await harness().submit({
      event: { ...fixture("approval.resolved"), scope: "session", everywhere: true },
      principal: ARJUN,
      idempotencyKey: "everywhere-session",
    });
    expect(session.ok).toBe(false);
    if (!session.ok) expect(session.error.kind).toBe("invalid");
  });

  it("answers once a command it can't read, or one that uses a listed program (ADR 0239)", async () => {
    const cases: readonly [string, string][] = [
      ["echo hi > out.txt", "can't read part by part"],
      ["ls && rm -rf build", "uses rm"],
      ["git -C room push origin", "uses git push"],
    ];
    for (const [command, said] of cases) {
      for (const scope of ["always", "session"]) {
        const asked = fixtureApproval({ action: { kind: "shell.exec", input: { command } } });
        const { submit, store } = harness({ policy: { autonomy: 1 }, approval: asked });
        const result = await submit({
          event: { ...fixture("approval.resolved"), scope },
          principal: ARJUN,
          idempotencyKey: `never-${scope}`,
        });
        expect(result.ok, command).toBe(false);
        if (!result.ok) {
          expect(result.error.kind).toBe("invalid");
          expect(result.error.message).toContain(said);
        }
        expect(store.appended).toEqual([]);
      }
      const once = await harness({
        approval: fixtureApproval({ action: { kind: "shell.exec", input: { command } } }),
      }).submit({
        event: { ...fixture("approval.resolved"), scope: "once" },
        principal: ARJUN,
        idempotencyKey: "never-once",
      });
      expect(once.ok, JSON.stringify(once)).toBe(true);
    }
  });

  it("makes a denied always a deny rule, and nothing of an expiry", async () => {
    const denied = harness({ policy: { autonomy: 2 } });
    await denied.submit({
      event: { ...fixture("approval.resolved"), scope: "always", decision: "denied" },
      principal: ARJUN,
      idempotencyKey: "never",
    });
    const rules = (denied.store.appended[1] as unknown as { policy: { rules: PolicyRule[] } })
      .policy.rules;
    expect(rules[0]?.decision).toBe("deny");

    const expired = harness({ policy: { autonomy: 2 } });
    await expired.submit({
      event: { ...fixture("approval.resolved"), scope: "always", decision: "expired" },
      principal: ARJUN,
      idempotencyKey: "expired",
    });
    expect(expired.store.appended.map((event) => event.type)).toEqual(["approval.resolved"]);
  });

  it("lets a harness settle its own ask, answered in its own tools, once (finding 5)", async () => {
    const settle = harness({ runs: { [RUN]: fixtureRun({ state: "done" }) } });
    const settled = await settle.submit({
      event: { ...fixture("approval.resolved"), reason: "Allowed in OpenClaw's CLI." },
      principal: SCOUT,
      idempotencyKey: "settled",
    });
    expect(settled.ok, JSON.stringify(settled)).toBe(true);
    // Its own answer, in its own name: the card says OpenClaw approved it, not a person.
    expect(settle.store.appended[0]).toMatchObject({
      type: "approval.resolved",
      resolved_by: SCOUT.participantId,
      scope: "once",
    });

    const always = await harness().submit({
      event: { ...fixture("approval.resolved"), scope: "always" },
      principal: SCOUT,
      idempotencyKey: "settled-always",
    });
    expect(always.ok).toBe(false);
    if (!always.ok) expect(always.error.message).toContain("a person's to give");

    // First answer wins either way round: a person after the harness is told it was settled.
    const late = await harness({
      approval: fixtureApproval({ state: "resolved", resolved_by: SCOUT.participantId }),
    }).submit({ event: fixture("approval.resolved"), principal: ARJUN, idempotencyKey: "late" });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.kind).toBe("already_decided");
  });

  it("refuses a second decision on an approval, and says who was first", async () => {
    const { submit } = harness({
      approval: fixtureApproval({
        state: "resolved",
        resolved_by: "usr_01K4ZQPX00000000000000000D",
      }),
    });
    const result = await submit({
      event: fixture("approval.resolved"),
      principal: ARJUN,
      idempotencyKey: "second",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("already_decided");
      expect(result.error.message).toContain("usr_01K4ZQPX00000000000000000D");
    }
  });

  it("refuses a second answer to a question", async () => {
    const { submit } = harness({
      question: fixtureQuestion({ state: "answered", answered_by: "system" }),
    });
    const result = await submit({
      event: fixture("question.answered"),
      principal: ARJUN,
      idempotencyKey: "second",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("already_decided");
  });

  it("never records a decision as made elsewhere: that is delivery's word", async () => {
    const { submit, store } = harness();
    await submit({
      event: { ...fixture("approval.resolved"), resolved_elsewhere: true },
      principal: ARJUN,
      idempotencyKey: "here",
    });
    expect(store.appended[0]?.["resolved_elsewhere"]).toBe(false);
  });
});

describe("a policy change from the dial (M1.4)", () => {
  it("fills in the workspace cap when the change names only the level", async () => {
    const { submit, store } = harness({ workspace: { max_autonomy: 3, rules: [] } });
    const { workspace_max_autonomy: _none, ...bare } = fixture("policy.updated");
    const result = await submit({ event: bare, principal: ARJUN, idempotencyKey: "dial" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(store.appended[0]?.["workspace_max_autonomy"]).toBe(3);
    expect(store.appended[0]?.["changed_by"]).toBe(ARJUN.participantId);
  });

  it("assumes the default cap when the workspace has never set one", async () => {
    const { submit, store } = harness();
    const { workspace_max_autonomy: _none, ...bare } = fixture("policy.updated");
    await submit({ event: bare, principal: ARJUN, idempotencyKey: "dial" });
    expect(store.appended[0]?.["workspace_max_autonomy"]).toBe(2);
  });

  it("is an owner's or an admin's to send, and neither a member's nor a guest's (SEC-1)", async () => {
    // Workspace-wide and at full trust, as a guest sent it: every harness it named would have
    // run money, deletions and external actions without asking anyone.
    const { space_id: _none, ...wide } = fixture("policy.updated");
    const open = {
      ...wide,
      actor: { kind: "person", id: DANA.participantId },
      policy: { autonomy: 3, rules: [{ match: "*", decision: "allow" }] },
      workspace_max_autonomy: 3,
    };
    const guest = { ...DANA, role: "guest" as const };
    const byGuest = await harness({
      workspaceRoles: { [ARJUN.participantId]: "owner", [DANA.participantId]: "guest" },
    }).submit({ event: open, principal: guest, idempotencyKey: "g1" });
    expect(byGuest.ok).toBe(false);
    if (!byGuest.ok) expect(byGuest.error.kind).toBe("wrong_role");

    const byMember = await harness().submit({ event: open, principal: DANA, idempotencyKey: "m1" });
    expect(byMember.ok).toBe(false);
    if (!byMember.ok) expect(byMember.error.kind).toBe("wrong_role");

    // In a space, the same: the standing is the workspace's.
    const inRoom = await harness().submit({
      event: { ...fixture("policy.updated"), actor: { kind: "person", id: DANA.participantId } },
      principal: DANA,
      idempotencyKey: "m2",
    });
    expect(inRoom.ok).toBe(false);
    if (!inRoom.ok) expect(inRoom.error.kind).toBe("wrong_role");

    const admin = { ...DANA, role: "admin" as const };
    const byAdmin = await harness({
      workspaceRoles: { [ARJUN.participantId]: "owner", [DANA.participantId]: "admin" },
    }).submit({ event: open, principal: admin, idempotencyKey: "a1" });
    expect(byAdmin.ok, JSON.stringify(byAdmin)).toBe(true);
    if (byAdmin.ok) expect(byAdmin.value.event.payload["changed_by"]).toBe(DANA.participantId);
  });
});

describe("handing an approval on, and a lead handed one (M5.5)", () => {
  const LEAD: Principal = {
    kind: "harness",
    participantId: "hrn_01K4ZQPX00000000000000000B",
    workspaceId: WS,
    displayName: "Lead",
    via: "harness_token",
    ownerId: ARJUN.participantId,
  };
  const lane = (): LaneView => ({
    lane_id: "lane_01K4ZQPX00000000000000000L",
    run_id: RUN,
    lead_id: LEAD.participantId,
    specialist_id: SCOUT.participantId,
    on_behalf_of: ARJUN.participantId,
    lead_run_id: null,
    home_space_id: SPACE,
    linked_space_ids: [],
    origin_message_id: null,
    goal: "Check the quotes",
    state: "running",
    delivery: "pending",
    depth: 1,
    trail: [],
    summary: null,
    cost_usd: null,
  });

  it("resolves the new names from the same refs, writes them on the event, and stamps who and when", async () => {
    const { submit, store } = harness({ workspaceRoles: { [DANA.participantId]: "admin" } });
    const result = await submit({
      event: {
        ...fixture("approval.routed"),
        to: ["role:admin"],
        approvers: ["usr_forged"],
        routed_by: "usr_forged",
      },
      principal: ARJUN,
      idempotencyKey: "route-1",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const stored: Readonly<Record<string, unknown>> = store.appended.at(-1) ?? {};
    expect(stored["approvers"]).toEqual([DANA.participantId]);
    expect(stored["routed_by"]).toBe(ARJUN.participantId);
    expect(typeof stored["routed_at"]).toBe("string");
  });

  it("names the lane's lead for `lead` from a person's rule, keeps it though it is not in the room, and takes its decision alone", async () => {
    const toLead: PolicyRule = { match: "calendar.*", decision: "ask", approvers: ["lead"] };
    const plain = { ...fixture("approval.request"), action: { kind: "calendar.write" }, risk: [] };
    const { submit, store } = harness({
      lane: lane(),
      nonMembers: [LEAD.participantId],
      policy: { autonomy: 1, rules: [toLead] },
    });
    const asked = await submit({ event: plain, principal: SCOUT, idempotencyKey: "ask-lead" });
    expect(asked.ok, JSON.stringify(asked)).toBe(true);
    const askedFor: Readonly<Record<string, unknown>> = store.appended.at(-1) ?? {};
    expect(askedFor["approvers"]).toEqual([LEAD.participantId]);

    const handed = harness({
      lane: lane(),
      nonMembers: [LEAD.participantId],
      approval: fixtureApproval({ approvers: [LEAD.participantId] }),
    });
    const byLead = await handed.submit({
      event: fixture("approval.resolved"),
      principal: LEAD,
      idempotencyKey: "lead-decides",
    });
    expect(byLead.ok, JSON.stringify(byLead)).toBe(true);
    const decided: Readonly<Record<string, unknown>> = handed.store.appended.at(-1) ?? {};
    expect(decided["resolved_by"]).toBe(LEAD.participantId);
    const byArjun = await handed.submit({
      event: fixture("approval.resolved"),
      principal: ARJUN,
      idempotencyKey: "arjun-decides",
    });
    expect(byArjun).toMatchObject({ ok: false, error: { kind: "not_an_approver" } });
  });

  it("never lets the specialist's own refs name a harness, and never a harness for what matters (Gate 5)", async () => {
    // The specialist names `lead`, or the lead's id, on an external action: its owner answers.
    for (const refs of [["lead"], [LEAD.participantId], ["lead", LEAD.participantId]]) {
      const own = harness({ lane: lane(), nonMembers: [LEAD.participantId] });
      const asked = await own.submit({
        event: { ...fixture("approval.request"), approvers: refs },
        principal: SCOUT,
        idempotencyKey: `own-${refs.join("-")}`,
      });
      expect(asked.ok, JSON.stringify(asked)).toBe(true);
      expect(own.store.appended.at(-1)?.["approvers"], refs.join(",")).toEqual([
        ARJUN.participantId,
      ]);
    }
    // A person's rule names the lead for a plain write (above), and not for an external one:
    // the lead is dropped and the ask reaches the person the lane is for.
    const toLead: PolicyRule = { match: "email.*", decision: "ask", approvers: ["lead"] };
    const matters = harness({
      lane: lane(),
      nonMembers: [LEAD.participantId],
      policy: { autonomy: 1, rules: [toLead] },
    });
    await matters.submit({
      event: fixture("approval.request"),
      principal: SCOUT,
      idempotencyKey: "by-rule-external",
    });
    expect(matters.store.appended.at(-1)?.["approvers"]).toEqual([ARJUN.participantId]);
    // Money and a deletion likewise, whatever the flags.
    for (const action of [
      { kind: "payment.send", money_usd: 5 },
      { kind: "file.delete", irreversible: true },
    ]) {
      const each = harness({
        lane: lane(),
        nonMembers: [LEAD.participantId],
        policy: {
          autonomy: 1,
          rules: [{ match: action.kind, decision: "ask", approvers: ["lead"] }],
        },
      });
      await each.submit({
        event: { ...fixture("approval.request"), action, risk: [] },
        principal: SCOUT,
        idempotencyKey: `by-rule-${action.kind}`,
      });
      expect(each.store.appended.at(-1)?.["approvers"], action.kind).toEqual([ARJUN.participantId]);
    }
  });

  it("hands an approval only to somebody who can answer it: nobody, a guest elsewhere, or the lead for what matters is refused (Gate 5)", async () => {
    const route = (to: string[], options: HarnessOptions = {}) =>
      harness(options).submit({
        event: { ...fixture("approval.routed"), to },
        principal: ARJUN,
        idempotencyKey: `route-${to.join("-")}`,
      });
    // A ghost, and a person outside the room.
    expect(await route(["usr_01K4ZQPX00000000000000000Z"])).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: expect.stringMatching(/names nobody/) },
    });
    // Somebody elsewhere in the workspace is a name, not nobody, since ADR 0042.
    const outside = harness({ nonMembers: [DANA.participantId] });
    const handedOut = await outside.submit({
      event: { ...fixture("approval.routed"), to: [DANA.participantId] },
      principal: ARJUN,
      idempotencyKey: "route-outside",
    });
    expect(handedOut.ok, JSON.stringify(handedOut)).toBe(true);
    expect(outside.store.appended.at(-1)?.["approvers"]).toEqual([DANA.participantId]);
    // What the ask is travels with the hand-on: Dana was never sent the request that raised it.
    expect(outside.store.appended.at(-1)?.["ask"]).toEqual({
      harness_id: SCOUT.participantId,
      action: { kind: "shell.exec" },
    });
    // A guest of another room is still nobody: they answer where they are.
    expect(
      await route([DANA.participantId], {
        nonMembers: [DANA.participantId],
        workspaceRoles: { ...WORKSPACE_ROLES_BY_DEFAULT, [DANA.participantId]: "guest" },
      }),
    ).toMatchObject({ ok: false, error: { kind: "invalid" } });
    // `lead` outside a lane names nobody; inside one, on the fixtures' external email, the lead
    // is dropped, which leaves nobody.
    expect(await route(["lead"])).toMatchObject({ ok: false, error: { kind: "invalid" } });
    const email = fixtureApproval({
      action: { kind: "email.send", external: true, irreversible: true },
    });
    expect(
      await route(["lead"], { lane: lane(), nonMembers: [LEAD.participantId], approval: email }),
    ).toMatchObject({ ok: false, error: { kind: "invalid" } });
    // The lead on a plain write, inside the lane: handed.
    const plain = harness({
      lane: lane(),
      nonMembers: [LEAD.participantId],
      approval: fixtureApproval({ action: { kind: "calendar.write" }, risk: [] }),
    });
    const handed = await plain.submit({
      event: { ...fixture("approval.routed"), to: ["lead"] },
      principal: ARJUN,
      idempotencyKey: "route-lead-plain",
    });
    expect(handed.ok, JSON.stringify(handed)).toBe(true);
    expect(plain.store.appended.at(-1)?.["approvers"]).toEqual([LEAD.participantId]);
    // Anyone: the people in the room, guests aside.
    const anyone = harness({ roles: { [DANA.participantId]: "guest" } });
    await anyone.submit({
      event: { ...fixture("approval.routed"), to: ["any"] },
      principal: ARJUN,
      idempotencyKey: "route-any",
    });
    expect(anyone.store.appended.at(-1)?.["approvers"]).toEqual([ARJUN.participantId]);
  });
});

describe("what may be attached (ADR 0047)", () => {
  const MB = 1024 * 1024;
  const caps = {
    ...fixture("attachment.limits_set"),
    image_bytes: 25 * MB,
    video_bytes: null,
    file_bytes: 50 * MB,
  };

  it("lets an owner cap attachments, and neither a member nor a harness", async () => {
    const byOwner = await harness().submit({ event: caps, principal: ARJUN, idempotencyKey: "c1" });
    expect(byOwner.ok, JSON.stringify(byOwner)).toBe(true);
    if (byOwner.ok) {
      expect(byOwner.value.event.type).toBe("attachment.limits_set");
      expect(byOwner.value.event.payload).toMatchObject({
        image_bytes: 25 * MB,
        video_bytes: null,
        file_bytes: 50 * MB,
      });
    }

    const byMember = await harness().submit({ event: caps, principal: DANA, idempotencyKey: "c2" });
    expect(byMember.ok).toBe(false);
    if (!byMember.ok) expect(byMember.error.kind).toBe("wrong_role");

    const byHarness = await harness().submit({
      event: { ...caps, actor: { kind: "harness", id: SCOUT.participantId } },
      principal: SCOUT,
      idempotencyKey: "c3",
    });
    expect(byHarness.ok).toBe(false);
    if (!byHarness.ok) expect(byHarness.error.kind).toBe("wrong_direction");
  });

  it("refuses a cap above what the server takes, by name", async () => {
    const over = await harness({ maxAttachmentBytes: 20 * MB }).submit({
      event: caps,
      principal: ARJUN,
      idempotencyKey: "c4",
    });
    expect(over).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "A cap of 25 MB on photos is more than this server takes (20 MB).",
      },
    });
    const under = await harness({ maxAttachmentBytes: 100 * MB }).submit({
      event: caps,
      principal: ARJUN,
      idempotencyKey: "c5",
    });
    expect(under.ok).toBe(true);
  });
});

describe("when Chips steps in on agents talking (ADR 0187)", () => {
  const limits = { ...fixture("exchange.limits_set"), stop: 32, hold: 100, circles: false };

  it("lets an owner set the stop, the hold and the circles switch, and neither a member nor a harness", async () => {
    const byOwner = await harness().submit({
      event: limits,
      principal: ARJUN,
      idempotencyKey: "x1",
    });
    expect(byOwner.ok, JSON.stringify(byOwner)).toBe(true);
    if (byOwner.ok) {
      expect(byOwner.value.event.type).toBe("exchange.limits_set");
      expect(byOwner.value.event.space_id).toBeNull();
      expect(byOwner.value.event.payload).toMatchObject({ stop: 32, hold: 100, circles: false });
    }

    const byMember = await harness().submit({
      event: limits,
      principal: DANA,
      idempotencyKey: "x2",
    });
    expect(byMember.ok).toBe(false);
    if (!byMember.ok) expect(byMember.error.kind).toBe("wrong_role");

    const byHarness = await harness().submit({
      event: { ...limits, actor: { kind: "harness", id: SCOUT.participantId } },
      principal: SCOUT,
      idempotencyKey: "x3",
    });
    expect(byHarness.ok).toBe(false);
    if (!byHarness.ok) expect(byHarness.error.kind).toBe("wrong_direction");
  });

  it("takes a Never for either number", async () => {
    const never = await harness().submit({
      event: { ...limits, stop: null, hold: null },
      principal: ARJUN,
      idempotencyKey: "x4",
    });
    expect(never.ok, JSON.stringify(never)).toBe(true);
  });

  it("refuses a stop at or past the hold, in the words a screen would use", async () => {
    for (const [stop, hold] of [
      [48, 48],
      [64, 48],
    ] as const) {
      const crossed = await harness().submit({
        event: { ...limits, stop, hold },
        principal: ARJUN,
        idempotencyKey: `x-${stop}-${hold}`,
      });
      expect(crossed).toEqual({
        ok: false,
        error: {
          kind: "invalid",
          message:
            "Chips would hold the agents before telling them to stop. Make the stop smaller than the hold.",
        },
      });
    }
  });

  it("refuses numbers out of their range, or not whole", async () => {
    for (const [stop, hold] of [
      [3, 48],
      [16, 9],
      [501, null],
      [null, 1001],
      [16.5, 48],
    ] as const) {
      const wrong = await harness().submit({
        event: { ...limits, stop, hold },
        principal: ARJUN,
        idempotencyKey: `y-${stop}-${hold}`,
      });
      expect(wrong.ok, `${stop}/${hold}`).toBe(false);
    }
  });
});
