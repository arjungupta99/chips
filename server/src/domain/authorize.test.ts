/**
 * The one authorization function, rule by rule, without a database. The use case's own tests
 * drive it through the catalogue with fake ports; this file says what each rule means.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type AuthorizeContext,
  authorize,
  type MessageFacts,
  type RunFacts,
  refuseOnMembership,
  refuseOnRun,
  refuseReopening,
  refuseWithoutLookup,
  type Sender,
} from "./authorize.js";

const FIXTURES = fileURLToPath(new URL("../../../packages/protocol/fixtures/", import.meta.url));

const WS = "ws_01K4ZQPX000000000000000001";
const SPACE = "spc_01K4ZQPX000000000000000002";
const RUN = "run_01K4ZQPX000000000000000005";
const ARJUN: Sender = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000003",
  workspaceId: WS,
  role: "owner",
};
const SCOUT: Sender = {
  kind: "harness",
  participantId: "hrn_01K4ZQPX000000000000000004",
  workspaceId: WS,
};

/** A fixture as the door sees it after validation, from its sender, with a key. */
function fixture(
  type: string,
  sender: Sender,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const full = JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")) as Record<
    string,
    unknown
  >;
  return {
    ...full,
    actor: { kind: sender.kind, id: sender.participantId },
    idempotency_key: "k",
    ...overrides,
  };
}

const scoutsRun = (overrides: Partial<RunFacts> = {}): RunFacts => ({
  run_id: RUN,
  harness_id: SCOUT.participantId,
  space_id: SPACE,
  state: "running",
  ...overrides,
});

const DANA = "usr_01K4ZQPX000000000000000009";

/** The fixtures' message: Scout said it, in the space (the `message.post` fixture). */
const scoutsMessage = (overrides: Partial<MessageFacts> = {}): MessageFacts => ({
  message_id: "msg_01K4ZQPX000000000000000067",
  space_id: SPACE,
  author_kind: "harness",
  author_id: SCOUT.participantId,
  ...overrides,
});

/**
 * Everything looked up and found in order: a member, the fixtures' run, nobody has decided, the
 * fixtures' space opened by Arjun, the fixtures' member is Scout, policy named nobody, the
 * fixtures' message is Scout's.
 */
const inOrder = (overrides: Partial<AuthorizeContext> = {}): AuthorizeContext => ({
  role: "owner",
  run: scoutsRun(),
  decidedBy: null,
  space: { space_id: SPACE, opened_by: ARJUN.participantId, state: "open" },
  participant: { id: SCOUT.participantId, kind: "harness" },
  approvers: null,
  message: scoutsMessage(),
  target: null,
  guestSpaces: null,
  ...overrides,
});

describe("without a lookup", () => {
  it("keeps an event in its sender's workspace, on its sender's behalf", () => {
    const elsewhere = fixture("checkpoint", SCOUT, {
      workspace_id: "ws_01K4ZQPX00000000000000000Z",
    });
    expect(refuseWithoutLookup(elsewhere, SCOUT)).toMatchObject({ kind: "wrong_workspace" });
    const forged = fixture("checkpoint", SCOUT, {
      actor: { kind: "person", id: ARJUN.participantId },
    });
    expect(refuseWithoutLookup(forged, SCOUT)).toMatchObject({ kind: "wrong_actor" });
  });

  it("holds the direction: a harness cannot cancel a run, a person cannot start one, both may talk", () => {
    expect(refuseWithoutLookup(fixture("run.cancel", SCOUT), SCOUT)).toMatchObject({
      kind: "wrong_direction",
    });
    // A decision is shared since M5.5, and an answer since finding 5: rule 9 says whether a
    // harness was handed it, or is settling its own.
    expect(refuseWithoutLookup(fixture("approval.resolved", SCOUT), SCOUT)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("question.answered", SCOUT), SCOUT)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("run.started", ARJUN), ARJUN)).toMatchObject({
      kind: "wrong_direction",
    });
    expect(refuseWithoutLookup(fixture("message.post", ARJUN), ARJUN)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("message.post", SCOUT), SCOUT)).toBeUndefined();
  });

  it("takes a heartbeat's check-in from a harness, and not from a person (ADR 0143)", () => {
    const beat = { heartbeat: true };
    expect(refuseWithoutLookup(fixture("message.post", SCOUT, beat), SCOUT)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("message.post", ARJUN, beat), ARJUN)).toMatchObject({
      kind: "wrong_direction",
      message: expect.stringContaining("heartbeat"),
    });
  });

  it("insists on an idempotency key", () => {
    const { idempotency_key: _none, ...bare } = fixture("checkpoint", SCOUT);
    expect(refuseWithoutLookup(bare, SCOUT)).toMatchObject({ kind: "missing_idempotency_key" });
  });
});

describe("the run", () => {
  it("must exist, unless the event is the one that opens it", () => {
    expect(authorize(fixture("step.log", SCOUT), SCOUT, inOrder({ run: null }))).toMatchObject({
      kind: "unknown_run",
    });
    expect(authorize(fixture("run.started", SCOUT), SCOUT, inOrder({ run: null }))).toBeUndefined();
  });

  it("opens only in a space", () => {
    const { space_id: _none, ...homeless } = fixture("run.started", SCOUT);
    expect(authorize(homeless, SCOUT, inOrder({ run: null }))).toMatchObject({ kind: "invalid" });
  });

  it("is the sending harness's, in its own space", () => {
    const stranger = scoutsRun({ harness_id: "hrn_01K4ZQPX00000000000000000S" });
    expect(
      authorize(fixture("run.status", SCOUT), SCOUT, inOrder({ run: stranger })),
    ).toMatchObject({ kind: "wrong_run" });
    const elsewhere = scoutsRun({ space_id: "spc_01K4ZQPX00000000000000000E" });
    expect(
      authorize(fixture("run.pause", ARJUN), ARJUN, inOrder({ run: elsewhere })),
    ).toMatchObject({ kind: "wrong_run" });
    // A person acts on any run in a room they are in: runs are the harness's, the room is everyone's.
    expect(authorize(fixture("run.pause", ARJUN), ARJUN, inOrder())).toBeUndefined();
  });

  it("takes only what its state allows", () => {
    const done = inOrder({ run: scoutsRun({ state: "done" }) });
    expect(authorize(fixture("step.log", SCOUT), SCOUT, done)).toMatchObject({ kind: "run_state" });
    expect(authorize(fixture("run.resume", ARJUN), ARJUN, inOrder())).toMatchObject({
      kind: "run_state",
    });
    const waiting = inOrder({ run: scoutsRun({ state: "waiting" }) });
    expect(authorize(fixture("run.resume", ARJUN), ARJUN, waiting)).toBeUndefined();
  });
});

describe("the space", () => {
  it("takes an event only from a member, and lets anyone open a new one", () => {
    expect(authorize(fixture("message.post", ARJUN), ARJUN, inOrder({ role: null }))).toMatchObject(
      { kind: "wrong_space" },
    );
    expect(
      authorize(fixture("message.post", ARJUN), ARJUN, inOrder({ role: "guest" })),
    ).toBeUndefined();
    expect(
      authorize(fixture("space.created", ARJUN), ARJUN, inOrder({ role: null, run: null })),
    ).toBeUndefined();
  });

  it("asks nothing of a workspace-wide event", () => {
    const { space_id: _none, ...wide } = fixture("policy.updated", ARJUN);
    expect(authorize(wide, ARJUN, inOrder({ role: null, run: null }))).toBeUndefined();
  });
});

describe("first answer wins", () => {
  it("refuses a second decision on an approval, and a second answer to a question", () => {
    const context = inOrder({ decidedBy: "usr_01K4ZQPX00000000000000000D" });
    const twice = authorize(fixture("approval.resolved", ARJUN), ARJUN, context);
    expect(twice).toMatchObject({ kind: "already_decided" });
    expect(twice?.message).toContain("first answer wins");
    expect(authorize(fixture("question.answered", ARJUN), ARJUN, context)).toMatchObject({
      kind: "already_decided",
    });
  });

  it("takes the first", () => {
    expect(authorize(fixture("approval.resolved", ARJUN), ARJUN, inOrder())).toBeUndefined();
  });

  it("does not apply to anything but a decision", () => {
    const context = inOrder({ decidedBy: "somebody" });
    expect(authorize(fixture("run.pause", ARJUN), ARJUN, context)).toBeUndefined();
  });
});

describe("a change to a space (M3.3)", () => {
  const scoutOpened = { space_id: SPACE, opened_by: SCOUT.participantId, state: "open" };

  it("lets a person in the space retitle or close it, but not a guest", () => {
    expect(authorize(fixture("space.updated", ARJUN), ARJUN, inOrder())).toBeUndefined();
    expect(
      authorize(fixture("space.updated", ARJUN), ARJUN, inOrder({ role: "member" })),
    ).toBeUndefined();
    expect(
      authorize(fixture("space.updated", ARJUN), ARJUN, inOrder({ role: "guest" })),
    ).toMatchObject({ kind: "wrong_role" });
  });

  it("lets a harness retitle or close only a space it opened", () => {
    const update = fixture("space.updated", SCOUT);
    expect(authorize(update, SCOUT, inOrder({ space: scoutOpened }))).toBeUndefined();
    expect(authorize(update, SCOUT, inOrder())).toMatchObject({ kind: "not_the_opener" });
  });

  it("needs a space, and something to change", () => {
    expect(
      authorize(fixture("space.updated", ARJUN), ARJUN, inOrder({ space: null })),
    ).toMatchObject({ kind: "unknown_space" });
    const { title: _none, ...nothing } = fixture("space.updated", ARJUN);
    expect(authorize(nothing, ARJUN, inOrder())).toMatchObject({ kind: "invalid" });
    expect(authorize({ ...nothing, state: "closed" }, ARJUN, inOrder())).toBeUndefined();
  });

  it("lets the harness that opened a space name it its home, and nobody archive it after (ADR 0069)", () => {
    const { title: _title, ...bare } = fixture("space.updated", SCOUT);
    const home = { ...bare, home: true };
    expect(authorize(home, SCOUT, inOrder({ space: scoutOpened }))).toBeUndefined();
    expect(authorize(home, SCOUT, inOrder())).toMatchObject({ kind: "not_the_opener" });
    const { title: _its, ...said } = fixture("space.updated", ARJUN);
    expect(authorize({ ...said, home: true }, ARJUN, inOrder())).toMatchObject({
      kind: "wrong_role",
    });

    // The direct room it was handed, which a person opened: its home too, if it is in it. A
    // group room it is in: no.
    const handed = { space_id: SPACE, opened_by: ARJUN.participantId, state: "open" };
    expect(
      authorize(home, SCOUT, inOrder({ space: { ...handed, kind: "direct" }, role: "member" })),
    ).toBeUndefined();
    expect(
      authorize(home, SCOUT, inOrder({ space: { ...handed, kind: "group" }, role: "member" })),
    ).toMatchObject({ kind: "not_the_opener" });
    expect(
      authorize(
        { ...home, title: "Mine" },
        SCOUT,
        inOrder({ space: { ...handed, kind: "direct" }, role: "member" }),
      ),
    ).toMatchObject({ kind: "not_the_opener" });

    const theHome = { ...scoutOpened, home: true };
    expect(
      authorize({ ...said, state: "closed" }, ARJUN, inOrder({ space: theHome })),
    ).toMatchObject({ kind: "invalid" });
    // Brought back, or renamed, by a person: yes. Put away by the harness itself: its word.
    expect(
      authorize({ ...said, state: "open" }, ARJUN, inOrder({ space: theHome })),
    ).toBeUndefined();
    expect(
      authorize(fixture("space.updated", ARJUN), ARJUN, inOrder({ space: theHome })),
    ).toBeUndefined();
    expect(
      authorize({ ...bare, state: "closed" }, SCOUT, inOrder({ space: theHome })),
    ).toBeUndefined();
  });

  it("lets no person rename or archive a room whose changes are locked, but bring one back (ADR 0156)", () => {
    const locked = { space_id: SPACE, opened_by: ARJUN.participantId, state: "open", locked: true };
    const { title: _title, ...said } = fixture("space.updated", ARJUN);
    expect(
      authorize(fixture("space.updated", ARJUN), ARJUN, inOrder({ space: locked })),
    ).toMatchObject({ kind: "invalid", message: expect.stringContaining("locked") });
    expect(
      authorize({ ...said, state: "closed" }, ARJUN, inOrder({ space: locked })),
    ).toMatchObject({ kind: "invalid" });
    // An admin of the workspace is a person like any other here.
    const admin: Sender = { ...ARJUN, role: "admin" };
    expect(
      authorize({ ...said, state: "closed" }, admin, inOrder({ space: locked, role: "member" })),
    ).toMatchObject({ kind: "invalid" });
    expect(
      authorize(
        { ...said, state: "open" },
        ARJUN,
        inOrder({ space: { ...locked, state: "closed" } }),
      ),
    ).toBeUndefined();
    // Brought back and renamed in one: the name is still a change the lock holds.
    expect(
      authorize(
        { ...said, state: "open", title: "Again" },
        ARJUN,
        inOrder({ space: { ...locked, state: "closed" } }),
      ),
    ).toMatchObject({ kind: "invalid" });
    expect(
      authorize(
        fixture("space.updated", ARJUN),
        ARJUN,
        inOrder({ space: { ...locked, locked: false } }),
      ),
    ).toBeUndefined();

    // The harness that opened it renames or closes it as it always could.
    const { title: _its, ...bare } = fixture("space.updated", SCOUT);
    const scoutLocked = { ...scoutOpened, locked: true };
    expect(
      authorize(fixture("space.updated", SCOUT), SCOUT, inOrder({ space: scoutLocked })),
    ).toBeUndefined();
    expect(
      authorize({ ...bare, state: "closed" }, SCOUT, inOrder({ space: scoutLocked })),
    ).toBeUndefined();
  });

  it("lets a member add somebody, and only the owner remove somebody else", () => {
    const added = fixture("membership.added", ARJUN);
    expect(authorize(added, ARJUN, inOrder({ role: "member" }))).toBeUndefined();
    expect(authorize(added, ARJUN, inOrder({ role: "guest" }))).toMatchObject({
      kind: "wrong_role",
    });

    const removedScout = fixture("membership.removed", ARJUN, {
      participant_id: SCOUT.participantId,
    });
    expect(authorize(removedScout, ARJUN, inOrder({ role: "owner" }))).toBeUndefined();
    // A member of the room, and a member of the workspace: no standing to remove anybody.
    const member: Sender = { ...ARJUN, role: "member" };
    expect(authorize(removedScout, member, inOrder({ role: "member" }))).toMatchObject({
      kind: "wrong_role",
    });
    // An owner or admin of the workspace removes anybody from any room they are in (ADR 0034).
    expect(authorize(removedScout, ARJUN, inOrder({ role: "member" }))).toBeUndefined();
    const admin: Sender = { ...ARJUN, role: "admin" };
    expect(authorize(removedScout, admin, inOrder({ role: "member" }))).toBeUndefined();
    // Leaving is anyone's, whatever their standing.
    const left = fixture("membership.removed", ARJUN, { participant_id: ARJUN.participantId });
    expect(authorize(left, ARJUN, inOrder({ role: "guest" }))).toBeUndefined();
  });

  it("takes an owner of the workspace out of a room by an owner alone (JR-23)", () => {
    const owner = {
      participant: { id: DANA, kind: "person" as const, standing: "owner" as const },
    };
    const removed = fixture("membership.removed", ARJUN, { participant_id: DANA });
    const admin: Sender = { ...ARJUN, role: "admin" };
    // An admin is refused, though the room's owner; an owner of the workspace is not.
    expect(authorize(removed, admin, inOrder({ role: "owner", ...owner }))).toMatchObject({
      kind: "wrong_role",
      message: "only an owner of the workspace takes an owner out of a space",
    });
    expect(authorize(removed, ARJUN, inOrder({ role: "member", ...owner }))).toBeUndefined();
    // A member made the room's owner is refused too.
    const member: Sender = { ...ARJUN, role: "member" };
    expect(authorize(removed, member, inOrder({ role: "owner", ...owner }))).toMatchObject({
      kind: "wrong_role",
    });
    // Leaving is still the owner's own.
    const dana: Sender = { ...ARJUN, participantId: DANA, role: "owner" };
    const leaves = fixture("membership.removed", dana, { participant_id: DANA });
    expect(authorize(leaves, dana, inOrder({ role: "owner", ...owner }))).toBeUndefined();
    // Anybody else an admin takes out as before.
    const plain = {
      participant: { id: DANA, kind: "person" as const, standing: "member" as const },
    };
    expect(authorize(removed, admin, inOrder({ role: "member", ...plain }))).toBeUndefined();
  });

  it("says whom an unarchive would put in a second room (JR-24)", () => {
    expect(refuseReopening([])).toBeUndefined();
    expect(refuseReopening(["Natalie"])).toEqual({
      kind: "guest_elsewhere",
      message:
        "Natalie is a guest in another space now, and a guest is in one at a time: take them out of one first, or make them a member",
    });
    expect(refuseReopening(["Natalie", "Ravi", "Meera"])?.message).toMatch(
      /^Natalie, Ravi and Meera are guests in other spaces now/,
    );
  });

  it("makes somebody a room's owner only by its owner, or an owner or admin of the workspace", () => {
    const asOwner = fixture("membership.added", ARJUN, { participant_id: DANA, role: "owner" });
    const member: Sender = { ...ARJUN, role: "member" };
    const dana = { participant: { id: DANA, kind: "person" as const } };
    expect(authorize(asOwner, member, inOrder({ role: "member", ...dana }))).toMatchObject({
      kind: "wrong_role",
      message: "only the owner of a space makes somebody else its owner",
    });
    expect(authorize(asOwner, member, inOrder({ role: "owner", ...dana }))).toBeUndefined();
    const admin: Sender = { ...ARJUN, role: "admin" };
    expect(authorize(asOwner, admin, inOrder({ role: "member", ...dana }))).toBeUndefined();
    // As a member, anybody in the room adds anybody.
    const asMember = { ...asOwner, role: "member" };
    expect(authorize(asMember, member, inOrder({ role: "member", ...dana }))).toBeUndefined();
  });

  it("puts an agent in a room only as it would be moved: by its harness's owner, or an owner or admin (ADR 0034's addendum)", () => {
    const agent = "agt_01K4ZQPX00000000000000NOTES";
    const member: Sender = { ...ARJUN, participantId: DANA, role: "member" };
    const added = fixture("membership.added", member, { participant_id: agent });
    const byArjun = fixture("membership.added", ARJUN, { participant_id: agent });
    const arjuns = {
      participant: { id: agent, kind: "agent" as const, owner: ARJUN.participantId },
    };
    expect(authorize(added, member, inOrder({ role: "member", ...arjuns }))).toMatchObject({
      kind: "wrong_role",
      message:
        "an agent is put in a space by its harness's owner, or an owner or admin of the workspace",
    });
    // A harness, added as its default agent, the same.
    const scouts = {
      participant: {
        id: SCOUT.participantId,
        kind: "harness" as const,
        owner: ARJUN.participantId,
      },
    };
    expect(authorize(added, member, inOrder({ role: "member", ...scouts }))).toMatchObject({
      kind: "wrong_role",
    });
    // Her own harness's agent, and anybody's to an owner or admin.
    const hers = { participant: { id: agent, kind: "agent" as const, owner: DANA } };
    expect(authorize(added, member, inOrder({ role: "member", ...hers }))).toBeUndefined();
    expect(authorize(added, { ...member, role: "admin" }, inOrder(arjuns))).toBeUndefined();
    expect(authorize(byArjun, { ...ARJUN, role: "owner" }, inOrder(arjuns))).toBeUndefined();
  });

  it("adds only somebody who exists", () => {
    expect(
      authorize(fixture("membership.added", ARJUN), ARJUN, inOrder({ participant: null })),
    ).toMatchObject({ kind: "unknown_participant" });
  });

  it("adds no harness that was removed from the workspace (ADR 0078)", () => {
    const scout = { id: SCOUT.participantId, kind: "harness" as const };
    const added = fixture("membership.added", ARJUN, { participant_id: SCOUT.participantId });
    expect(authorize(added, ARJUN, inOrder({ participant: scout }))).toBeUndefined();
    expect(
      authorize(added, ARJUN, inOrder({ participant: { ...scout, removed: true } })),
    ).toMatchObject({ kind: "invalid", message: expect.stringContaining("removed") });
  });
  it("adds nobody removed from the workspace, and says it was a person (ADR 0160)", () => {
    const dana = { id: DANA, kind: "person" as const, removed: true };
    const added = fixture("membership.added", ARJUN, { participant_id: DANA });
    expect(authorize(added, ARJUN, inOrder({ participant: dana }))).toMatchObject({
      kind: "invalid",
      message: "that person was removed from the workspace",
    });
  });
});

describe("who may answer (M3.3)", () => {
  it("takes a decision from anyone in the room when policy named nobody", () => {
    expect(authorize(fixture("approval.resolved", ARJUN), ARJUN, inOrder())).toBeUndefined();
    expect(
      authorize(fixture("approval.resolved", ARJUN), ARJUN, inOrder({ approvers: [] })),
    ).toBeUndefined();
  });

  it("takes a decision only from who policy named, when it named someone", () => {
    const named = inOrder({ approvers: [DANA] });
    expect(authorize(fixture("approval.resolved", ARJUN), ARJUN, named)).toMatchObject({
      kind: "not_an_approver",
    });
    const both = inOrder({ approvers: [DANA, ARJUN.participantId] });
    expect(authorize(fixture("approval.resolved", ARJUN), ARJUN, both)).toBeUndefined();
  });

  it("has nothing to say about anything but a decision", () => {
    expect(
      authorize(fixture("message.post", ARJUN), ARJUN, inOrder({ approvers: [DANA] })),
    ).toBeUndefined();
  });

  it("never takes a guest for anyone: a guest decides only when named by id (Gate 5)", () => {
    const GUEST: Sender = { ...ARJUN, role: "guest" };
    const decision = fixture("approval.resolved", GUEST);
    expect(authorize(decision, GUEST, inOrder({ role: "guest", approvers: [] }))).toMatchObject({
      kind: "not_an_approver",
    });
    // A guest of the room who is a member of the workspace is a guest here all the same.
    expect(authorize(decision, ARJUN, inOrder({ role: "guest", approvers: null }))).toMatchObject({
      kind: "not_an_approver",
    });
    expect(
      authorize(decision, GUEST, inOrder({ role: "guest", approvers: [ARJUN.participantId] })),
    ).toBeUndefined();
    // Nor hands an unnamed ask on.
    expect(
      authorize(
        fixture("approval.routed", GUEST),
        GUEST,
        inOrder({ role: "guest", approvers: [] }),
      ),
    ).toMatchObject({ kind: "not_an_approver" });
  });
});

describe("feedback on a message (M3.4)", () => {
  it("takes a reaction or a note from a person in the room, on a message a harness said", () => {
    expect(authorize(fixture("feedback", ARJUN), ARJUN, inOrder())).toBeUndefined();
    const thumbs = fixture("feedback", ARJUN, {
      kind: "reaction",
      reaction: "👎",
      text: undefined,
    });
    expect(authorize(thumbs, ARJUN, inOrder({ role: "guest" }))).toBeUndefined();
  });

  it("is a person's to give, like a steer", () => {
    expect(authorize(fixture("feedback", SCOUT), SCOUT, inOrder())).toMatchObject({
      kind: "wrong_direction",
    });
  });

  it("says what it is: a reaction its emoji, a correction its note", () => {
    const { text: _none, ...bare } = fixture("feedback", ARJUN);
    expect(authorize(bare, ARJUN, inOrder())).toMatchObject({ kind: "invalid" });
    expect(authorize({ ...bare, kind: "reaction" }, ARJUN, inOrder())).toMatchObject({
      kind: "invalid",
    });
  });

  it("needs a message a harness said, in this space", () => {
    const note = fixture("feedback", ARJUN);
    expect(authorize(note, ARJUN, inOrder({ message: null }))).toMatchObject({
      kind: "unknown_message",
    });
    const theirs = scoutsMessage({ author_kind: "person", author_id: DANA });
    expect(authorize(note, ARJUN, inOrder({ message: theirs }))).toMatchObject({
      kind: "wrong_message",
    });
    const elsewhere = scoutsMessage({ space_id: "spc_01K4ZQPX00000000000000000C" });
    expect(authorize(note, ARJUN, inOrder({ message: elsewhere }))).toMatchObject({
      kind: "wrong_message",
    });
  });

  it("has nothing to say about anything but feedback", () => {
    expect(
      authorize(fixture("message.post", ARJUN), ARJUN, inOrder({ message: null })),
    ).toBeUndefined();
  });
});

describe("a person's standing in the workspace (ADR 0034)", () => {
  const GUEST: Sender = { ...ARJUN, role: "guest" };
  const MEMBER: Sender = { ...ARJUN, role: "member" };
  const ADMIN: Sender = { ...ARJUN, role: "admin" };
  const MEMBER_ACTOR = { kind: "person", id: MEMBER.participantId };

  it("lets a guest open no space and add nobody to one, before any lookup", () => {
    expect(refuseWithoutLookup(fixture("space.created", GUEST), GUEST)).toMatchObject({
      kind: "wrong_role",
    });
    expect(refuseWithoutLookup(fixture("membership.added", GUEST), GUEST)).toMatchObject({
      kind: "wrong_role",
    });
    // A guest still talks, and still leaves.
    expect(refuseWithoutLookup(fixture("message.post", GUEST), GUEST)).toBeUndefined();
  });

  it("lets a member open no space but a thread, and still add people, before any lookup (ADR 0196)", () => {
    expect(refuseWithoutLookup(fixture("space.created", MEMBER), MEMBER)).toMatchObject({
      kind: "wrong_role",
      message: expect.stringContaining("a member of the workspace may not open a space"),
    });
    const thread = fixture("space.created", MEMBER, { kind: "thread" });
    expect(refuseWithoutLookup(thread, MEMBER)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("membership.added", MEMBER), MEMBER)).toBeUndefined();
    // An owner or an admin opens one.
    expect(refuseWithoutLookup(fixture("space.created", ADMIN), ADMIN)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("space.created", ARJUN), ARJUN)).toBeUndefined();
    // A guest opens not even a thread.
    expect(
      refuseWithoutLookup(fixture("space.created", GUEST, { kind: "thread" }), GUEST),
    ).toMatchObject({ kind: "wrong_role" });
  });

  it("lets only an owner or an admin change a role, before any lookup", () => {
    const change = fixture("role.changed", MEMBER);
    expect(refuseWithoutLookup(change, MEMBER)).toMatchObject({ kind: "wrong_role" });
    expect(refuseWithoutLookup(change, GUEST)).toMatchObject({ kind: "wrong_role" });
    expect(refuseWithoutLookup(fixture("role.changed", ADMIN), ADMIN)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("role.changed", ARJUN), ARJUN)).toBeUndefined();
  });

  it("lets only an owner or an admin turn a harness's dial, before any lookup (SEC-1)", () => {
    // Workspace-wide, as the dial sends it: no space to be a member of, so nothing else would
    // have refused it. A guest put any harness at L3 with `* → allow` and lifted the cap.
    const { space_id: _none, ...dial } = fixture("policy.updated", GUEST, {
      policy: { autonomy: 3, rules: [{ match: "*", decision: "allow" }] },
      workspace_max_autonomy: 3,
    });
    expect(refuseWithoutLookup(dial, GUEST)).toMatchObject({ kind: "wrong_role" });
    expect(refuseWithoutLookup({ ...dial, actor: MEMBER_ACTOR }, MEMBER)).toMatchObject({
      kind: "wrong_role",
    });
    // In a space too: the standing is the workspace's, not the room's.
    expect(refuseWithoutLookup(fixture("policy.updated", MEMBER), MEMBER)).toMatchObject({
      kind: "wrong_role",
    });
    expect(refuseWithoutLookup(fixture("policy.updated", ADMIN), ADMIN)).toBeUndefined();
    expect(refuseWithoutLookup(fixture("policy.updated", ARJUN), ARJUN)).toBeUndefined();
    // Chips's own `always` rule is a `policy.updated` by `system`, which rule 2 settles; the
    // harness has no standing and is refused there, not here.
    expect(refuseWithoutLookup(fixture("policy.updated", SCOUT), SCOUT)).toMatchObject({
      kind: "wrong_direction",
    });
  });

  it("changes the role of somebody who exists, within the changer's reach, and never the last owner's", () => {
    const toAdmin = fixture("role.changed", ARJUN, { role: "admin" });
    const member = { role: "member" as const, lastOwner: false, spaces: 1 };
    expect(authorize(toAdmin, ARJUN, inOrder({ target: member }))).toBeUndefined();
    expect(authorize(toAdmin, ARJUN, inOrder({ target: null }))).toMatchObject({
      kind: "unknown_participant",
    });
    // An admin may neither touch an owner nor make one.
    const owner = { role: "owner" as const, lastOwner: false, spaces: 1 };
    expect(authorize(toAdmin, ADMIN, inOrder({ target: owner }))).toMatchObject({
      kind: "wrong_role",
    });
    const toOwner = fixture("role.changed", ADMIN, { role: "owner" });
    expect(authorize(toOwner, ADMIN, inOrder({ target: member }))).toMatchObject({
      kind: "wrong_role",
    });
    expect(authorize(toOwner, ARJUN, inOrder({ target: member }))).toBeUndefined();
    // The last owner stays.
    expect(
      authorize(toAdmin, ARJUN, inOrder({ target: { role: "owner", lastOwner: true, spaces: 1 } })),
    ).toMatchObject({ kind: "wrong_role" });
    expect(authorize(toAdmin, ARJUN, inOrder({ target: owner }))).toBeUndefined();
  });

  it("keeps a guest of the workspace to one space", () => {
    const added = fixture("membership.added", ARJUN, { participant_id: DANA });
    const dana = { id: DANA, kind: "person" as const };
    expect(authorize(added, ARJUN, inOrder({ participant: dana, guestSpaces: 1 }))).toMatchObject({
      kind: "guest_elsewhere",
    });
    expect(authorize(added, ARJUN, inOrder({ participant: dana, guestSpaces: 0 }))).toBeUndefined();
    // Not a guest: nothing to count.
    expect(
      authorize(added, ARJUN, inOrder({ participant: dana, guestSpaces: null })),
    ).toBeUndefined();
  });
});

describe("the order of the rules", () => {
  it("refuses on the cheap rules first, whatever else is wrong", () => {
    const context: AuthorizeContext = {
      run: null,
      role: null,
      decidedBy: "x",
      space: null,
      participant: null,
      approvers: null,
      message: null,
      target: null,
      guestSpaces: null,
    };
    const refused = authorize(fixture("run.cancel", SCOUT), SCOUT, context);
    expect(refused).toMatchObject({ kind: "wrong_direction" });
  });

  it("checks the run before the space, so a hook that names no space is placed first", () => {
    const { space_id: _none, ...bare } = fixture("approval.request", SCOUT);
    const nothing: AuthorizeContext = {
      run: null,
      role: null,
      decidedBy: null,
      space: null,
      participant: null,
      approvers: null,
      message: null,
      target: null,
      guestSpaces: null,
    };
    expect(authorize(bare, SCOUT, nothing)).toMatchObject({
      kind: "unknown_run",
    });
  });
});

describe("a reaction on anyone's message (M5.4)", () => {
  const thumbs = () =>
    fixture("feedback", ARJUN, { kind: "reaction", reaction: "👍", text: undefined });
  const arjunsMessage = () => scoutsMessage({ author_kind: "person", author_id: DANA });

  it("takes a reaction on a person's message, and a correction only on an agent's or a harness's", () => {
    expect(authorize(thumbs(), ARJUN, inOrder({ message: arjunsMessage() }))).toBeUndefined();
    expect(
      authorize(fixture("feedback", ARJUN), ARJUN, inOrder({ message: arjunsMessage() })),
    ).toMatchObject({ kind: "wrong_message" });
    // Since ADR 0087 an agent says every reply (PM-3).
    const agentsMessage = scoutsMessage({
      author_kind: "agent",
      author_id: "agt_01K4ZQPX0000000000000000AG",
    });
    expect(
      authorize(fixture("feedback", ARJUN), ARJUN, inOrder({ message: agentsMessage })),
    ).toBeUndefined();
    expect(authorize(fixture("feedback", ARJUN), ARJUN, inOrder())).toBeUndefined();
  });

  it("takes nothing on a line Chips wrote, or on a message taken back", () => {
    const system = scoutsMessage({ author_kind: "system", author_id: "system" });
    expect(authorize(thumbs(), ARJUN, inOrder({ message: system }))).toMatchObject({
      kind: "wrong_message",
    });
    const gone = scoutsMessage({ deleted: true });
    expect(authorize(thumbs(), ARJUN, inOrder({ message: gone }))).toMatchObject({
      kind: "wrong_message",
    });
  });
});

describe("changing a message (M5.4, rule 12)", () => {
  const MEMBER: Sender = { ...ARJUN, role: "member" };
  const ADMIN: Sender = { ...ARJUN, role: "admin" };
  const arjunsMessage = () =>
    scoutsMessage({ author_kind: "person", author_id: ARJUN.participantId });

  it("lets a message be edited by its author alone, harness or person", () => {
    expect(authorize(fixture("message.edited", SCOUT), SCOUT, inOrder())).toBeUndefined();
    expect(authorize(fixture("message.edited", ARJUN), ARJUN, inOrder())).toMatchObject({
      kind: "wrong_role",
    });
    expect(
      authorize(fixture("message.edited", ARJUN), ARJUN, inOrder({ message: arjunsMessage() })),
    ).toBeUndefined();
    // The space's owner, and the workspace's, have no more say over the words than anyone.
    expect(
      authorize(fixture("message.edited", ARJUN), ADMIN, inOrder({ role: "owner" })),
    ).toMatchObject({ kind: "wrong_role" });
  });

  it("lets a message be taken back by its author, the space's owner, or an admin", () => {
    const deletion = fixture("message.deleted", ARJUN);
    expect(authorize(fixture("message.deleted", SCOUT), SCOUT, inOrder())).toBeUndefined();
    expect(authorize(deletion, MEMBER, inOrder({ role: "owner" }))).toBeUndefined();
    expect(authorize(deletion, ADMIN, inOrder({ role: "member" }))).toBeUndefined();
    expect(authorize(deletion, MEMBER, inOrder({ role: "member" }))).toMatchObject({
      kind: "wrong_role",
    });
    // A harness takes back only its own words.
    const theirs = fixture("message.deleted", SCOUT);
    expect(
      authorize(theirs, SCOUT, inOrder({ role: "member", message: arjunsMessage() })),
    ).toMatchObject({ kind: "wrong_role" });
  });

  it("lets anyone in the space but a guest pin a message, or let one go", () => {
    expect(
      authorize(fixture("message.pinned", ARJUN), MEMBER, inOrder({ role: "member" })),
    ).toBeUndefined();
    expect(
      authorize(fixture("message.unpinned", ARJUN), MEMBER, inOrder({ role: "member" })),
    ).toBeUndefined();
    expect(
      authorize(fixture("message.pinned", ARJUN), MEMBER, inOrder({ role: "guest" })),
    ).toMatchObject({ kind: "wrong_role" });
    // A pin is a person's: the direction says so before any lookup.
    expect(authorize(fixture("message.pinned", SCOUT), SCOUT, inOrder())).toMatchObject({
      kind: "wrong_direction",
    });
  });

  it("leaves a message taken back alone, except for a retry of the taking back", () => {
    const gone = scoutsMessage({ deleted: true });
    expect(
      authorize(fixture("message.edited", SCOUT), SCOUT, inOrder({ message: gone })),
    ).toMatchObject({ kind: "wrong_message" });
    expect(
      authorize(fixture("message.pinned", ARJUN), ARJUN, inOrder({ message: gone })),
    ).toMatchObject({ kind: "wrong_message" });
    expect(
      authorize(fixture("message.unpinned", ARJUN), ARJUN, inOrder({ message: gone })),
    ).toBeUndefined();
    expect(
      authorize(fixture("message.deleted", SCOUT), SCOUT, inOrder({ message: gone })),
    ).toBeUndefined();
  });

  it("lets anyone in the space, a guest too, delete any message for themselves and undo it (ADR 0167)", () => {
    const GUEST: Sender = { ...ARJUN, role: "guest" };
    const gone = scoutsMessage({ deleted: true });
    for (const type of ["message.hidden", "message.shown"]) {
      // Scout's words, Dana's, a tombstone: none of it is the guest's, and it is theirs to hide.
      expect(authorize(fixture(type, ARJUN), GUEST, inOrder({ role: "guest" }))).toBeUndefined();
      expect(
        authorize(fixture(type, ARJUN), MEMBER, inOrder({ role: "member", message: gone })),
      ).toBeUndefined();
      // A person's: a harness has no screen to take a line off.
      expect(authorize(fixture(type, SCOUT), SCOUT, inOrder())).toMatchObject({
        kind: "wrong_direction",
      });
      expect(authorize(fixture(type, ARJUN), ARJUN, inOrder({ message: null }))).toMatchObject({
        kind: "unknown_message",
      });
      const elsewhere = scoutsMessage({ space_id: "spc_01K4ZQPX00000000000000000C" });
      expect(authorize(fixture(type, ARJUN), ARJUN, inOrder({ message: elsewhere }))).toMatchObject(
        { kind: "wrong_message" },
      );
    }
  });

  it("needs the message, in this space", () => {
    expect(
      authorize(fixture("message.pinned", ARJUN), ARJUN, inOrder({ message: null })),
    ).toMatchObject({ kind: "unknown_message" });
    const elsewhere = scoutsMessage({ space_id: "spc_01K4ZQPX00000000000000000C" });
    expect(
      authorize(fixture("message.pinned", ARJUN), ARJUN, inOrder({ message: elsewhere })),
    ).toMatchObject({ kind: "wrong_message" });
  });
});

describe("a thread (M5.4, rule 13)", () => {
  const THREAD = "spc_01K4ZQPX00000000000000000T";
  const thread = (overrides: Record<string, unknown> = {}) =>
    fixture("space.created", ARJUN, {
      kind: "thread",
      space_id: THREAD,
      title: undefined,
      parent_space_id: SPACE,
      root_message_id: scoutsMessage().message_id,
      ...overrides,
    });

  it("grows in a space its opener is in, from a message there", () => {
    expect(authorize(thread(), ARJUN, inOrder())).toBeUndefined();
    expect(authorize(thread({ root_message_id: undefined }), ARJUN, inOrder())).toBeUndefined();
    expect(authorize(thread(), ARJUN, inOrder({ role: null }))).toMatchObject({
      kind: "wrong_space",
    });
    expect(authorize(thread(), ARJUN, inOrder({ space: null }))).toMatchObject({
      kind: "unknown_space",
    });
  });

  it("is a thread when it names a parent, and names one when it is a thread", () => {
    expect(authorize(thread({ kind: "group" }), ARJUN, inOrder())).toMatchObject({
      kind: "invalid",
    });
    expect(
      authorize(
        thread({ parent_space_id: undefined, root_message_id: undefined }),
        ARJUN,
        inOrder(),
      ),
    ).toMatchObject({ kind: "invalid" });
    // A space that is not a thread is not asked.
    expect(
      authorize(fixture("space.created", ARJUN), ARJUN, inOrder({ message: null, space: null })),
    ).toBeUndefined();
  });

  it("grows in a space that is open and not a thread itself", () => {
    const inAThread = {
      space_id: SPACE,
      opened_by: ARJUN.participantId,
      state: "open",
      parent_space_id: "spc_01K4ZQPX00000000000000000P",
    };
    expect(authorize(thread(), ARJUN, inOrder({ space: inAThread }))).toMatchObject({
      kind: "invalid",
    });
    const closed = { space_id: SPACE, opened_by: ARJUN.participantId, state: "closed" };
    expect(authorize(thread(), ARJUN, inOrder({ space: closed }))).toMatchObject({
      kind: "invalid",
    });
  });

  it("grows from a message in the space, still there, with no thread yet", () => {
    expect(authorize(thread(), ARJUN, inOrder({ message: null }))).toMatchObject({
      kind: "unknown_message",
    });
    const elsewhere = scoutsMessage({ space_id: "spc_01K4ZQPX00000000000000000C" });
    expect(authorize(thread(), ARJUN, inOrder({ message: elsewhere }))).toMatchObject({
      kind: "wrong_message",
    });
    expect(
      authorize(thread(), ARJUN, inOrder({ message: scoutsMessage({ deleted: true }) })),
    ).toMatchObject({ kind: "wrong_message" });
    const threaded = scoutsMessage({ thread_id: "spc_01K4ZQPX00000000000000000Q" });
    expect(authorize(thread(), ARJUN, inOrder({ message: threaded }))).toMatchObject({
      kind: "wrong_message",
      message: expect.stringContaining("spc_01K4ZQPX00000000000000000Q"),
    });
  });

  it("has no members of its own", () => {
    const facts = {
      space_id: THREAD,
      opened_by: ARJUN.participantId,
      state: "open",
      parent_space_id: SPACE,
    };
    const added = fixture("membership.added", ARJUN, { space_id: THREAD });
    expect(authorize(added, ARJUN, inOrder({ space: facts }))).toMatchObject({ kind: "invalid" });
    const removed = fixture("membership.removed", ARJUN, { space_id: THREAD });
    expect(authorize(removed, ARJUN, inOrder({ space: facts }))).toMatchObject({
      kind: "invalid",
    });
    // Retitling or closing one is a change to a space like any other.
    const retitled = fixture("space.updated", ARJUN, { space_id: THREAD, title: "Delivery" });
    expect(authorize(retitled, ARJUN, inOrder({ space: facts }))).toBeUndefined();
  });
});

describe("an ask that matters waits for a person (SEC-10, ADR 0195)", () => {
  const own = (askAction: AuthorizeContext["askAction"]) => inOrder({ askRun: RUN, askAction });
  const settled = (overrides: Record<string, unknown> = {}) =>
    fixture("approval.resolved", SCOUT, { reason: "Allowed in its own window.", ...overrides });
  const answer = (scope: string, decision = "approved") =>
    fixture("approval.resolved", ARJUN, { scope, decision });
  const named = (askAction: AuthorizeContext["askAction"]) =>
    inOrder({ approvers: [ARJUN.participantId], askAction });

  it("refuses a harness settling its own ask when the action matters", () => {
    for (const action of [
      { external: true },
      { irreversible: true },
      { money_usd: 40 },
      { risk: ["financial"] },
      { risk: ["credential"] },
    ]) {
      expect(authorize(settled(), SCOUT, own(action))).toMatchObject({
        kind: "not_an_approver",
        message: expect.stringContaining("wait for a person"),
      });
    }
    // A no from its own window is no kinder to the audit: it waits for a person too.
    expect(authorize(settled({ decision: "denied" }), SCOUT, own({ money_usd: 5 }))).toMatchObject({
      kind: "not_an_approver",
    });
  });

  it("lets it settle a small one, as its own window answered it", () => {
    expect(authorize(settled(), SCOUT, own({}))).toBeUndefined();
    expect(
      authorize(settled(), SCOUT, own({ external: false, risk: ["privacy"] })),
    ).toBeUndefined();
    // An ask Chips has no record of the action for is judged as before.
    expect(authorize(settled(), SCOUT, own(null))).toBeUndefined();
  });

  it("lets a person answer one once, and gives no standing yes for it", () => {
    const money = named({ money_usd: 40 });
    expect(authorize(answer("once"), ARJUN, money)).toBeUndefined();
    expect(authorize(answer("once", "denied"), ARJUN, money)).toBeUndefined();
    for (const scope of ["session", "always"]) {
      expect(authorize(answer(scope), ARJUN, money)).toMatchObject({
        kind: "invalid",
        message: expect.stringContaining("answered once"),
      });
      expect(authorize(answer(scope, "denied"), ARJUN, money)).toMatchObject({ kind: "invalid" });
    }
  });

  it("keeps This session and Always for the small ones", () => {
    expect(authorize(answer("always"), ARJUN, named({}))).toBeUndefined();
    expect(authorize(answer("session"), ARJUN, named({ risk: ["legal"] }))).toBeUndefined();
  });
});

describe("a harness settles an ask answered in its own tools (OpenClaw test, finding 5)", () => {
  const OTHER: Sender = {
    kind: "harness",
    participantId: "hrn_01K4ZQPX00000000000000000B",
    workspaceId: WS,
  };
  const OTHER_RUN = "run_01K4ZQPX00000000000000000R";
  const settled = (overrides: Record<string, unknown> = {}) =>
    fixture("approval.resolved", SCOUT, { reason: "Allowed in OpenClaw's CLI.", ...overrides });
  const answered = (overrides: Record<string, unknown> = {}) =>
    fixture("question.answered", SCOUT, overrides);
  const own = inOrder({ askRun: RUN });

  it("lets it settle an approval its own run asked, once", () => {
    expect(authorize(settled(), SCOUT, own)).toBeUndefined();
    expect(authorize(settled({ decision: "denied" }), SCOUT, own)).toBeUndefined();
  });

  it("keeps This session and Always a person's to give, and an expiry Chips's", () => {
    expect(authorize(settled({ scope: "always" }), SCOUT, own)).toMatchObject({ kind: "invalid" });
    expect(authorize(settled({ scope: "session" }), SCOUT, own)).toMatchObject({ kind: "invalid" });
    expect(authorize(settled({ decision: "expired" }), SCOUT, own)).toMatchObject({
      kind: "invalid",
    });
  });

  it("refuses an ask of another run, or of another harness's run", () => {
    // The ask is another run's, whatever run the event names.
    expect(authorize(settled(), SCOUT, inOrder({ askRun: OTHER_RUN }))).toMatchObject({
      kind: "not_an_approver",
    });
    expect(authorize(settled(), SCOUT, inOrder({ askRun: null }))).toMatchObject({
      kind: "not_an_approver",
    });
    // The run is Scout's, and the sender is not Scout.
    expect(authorize(fixture("approval.resolved", OTHER), OTHER, own)).toMatchObject({
      kind: "not_an_approver",
    });
  });

  it("lets it answer a question its own run asked, as answered in its own tools", () => {
    expect(refuseWithoutLookup(answered(), SCOUT)).toBeUndefined();
    expect(authorize(answered(), SCOUT, own)).toBeUndefined();
    expect(authorize(answered(), SCOUT, inOrder({ askRun: OTHER_RUN }))).toMatchObject({
      kind: "not_an_approver",
    });
    expect(authorize(answered({ timed_out: true }), SCOUT, own)).toMatchObject({
      kind: "invalid",
    });
    // Another harness's run is refused at rule 4, as any event into it is.
    expect(authorize(fixture("question.answered", OTHER), OTHER, own)).toMatchObject({
      kind: "wrong_run",
    });
    // A person answers as before.
    expect(authorize(fixture("question.answered", ARJUN), ARJUN, own)).toBeUndefined();
  });
});

describe("a lead handed an ask (M5.5, open decision 7)", () => {
  const LEAD: Sender = {
    kind: "harness",
    participantId: "hrn_01K4ZQPX00000000000000000B",
    workspaceId: WS,
  };

  it("lets a harness decide only what policy handed it, and refuses the rest at rule 9", () => {
    const decision = fixture("approval.resolved", LEAD);
    expect(authorize(decision, LEAD, inOrder({ approvers: [LEAD.participantId] }))).toBeUndefined();
    expect(authorize(decision, LEAD, inOrder({ approvers: [DANA] }))).toMatchObject({
      kind: "not_an_approver",
    });
    // An empty list means anyone in the room — any person; never a harness.
    expect(authorize(decision, LEAD, inOrder({ approvers: [] }))).toMatchObject({
      kind: "not_an_approver",
    });
    expect(authorize(decision, LEAD, inOrder({ approvers: null }))).toMatchObject({
      kind: "not_an_approver",
    });
    expect(authorize(fixture("approval.resolved", SCOUT), SCOUT, inOrder())).toMatchObject({
      kind: "not_an_approver",
    });
  });

  it("answers from outside the room, into the specialist's run: rules 4 and 5 stand aside for a decision alone", () => {
    const decision = fixture("approval.resolved", LEAD);
    expect(refuseOnRun(decision, LEAD, scoutsRun())).toBeUndefined();
    expect(refuseOnMembership(decision, null)).toBeUndefined();
    expect(
      authorize(decision, LEAD, inOrder({ role: null, approvers: [LEAD.participantId] })),
    ).toBeUndefined();
    // Anything else from a harness into another's run, or a room it is not in, is refused as before.
    expect(refuseOnRun(fixture("checkpoint", LEAD), LEAD, scoutsRun())).toMatchObject({
      kind: "wrong_run",
    });
    expect(refuseOnMembership(fixture("message.post", LEAD), null)).toMatchObject({
      kind: "wrong_space",
    });
    // A person's decision from outside the room passes rule 5 too since ADR 0042; rule 9 is
    // what judges it, and refuses one the approval does not name.
    expect(refuseOnMembership(fixture("approval.resolved", ARJUN), null)).toBeUndefined();
    expect(
      authorize(fixture("approval.resolved", ARJUN), ARJUN, inOrder({ role: null })),
    ).toMatchObject({ kind: "wrong_space" });
  });

  it("lets a person policy named answer from wherever they are (ADR 0042)", () => {
    const decision = fixture("approval.resolved", ARJUN);
    const named = inOrder({ role: null, approvers: [ARJUN.participantId] });
    expect(authorize(decision, ARJUN, named)).toBeUndefined();
    // A guest is in one room and answers there, named or not.
    expect(authorize(decision, { ...ARJUN, role: "guest" }, named)).toMatchObject({
      kind: "wrong_space",
    });
    // Somebody the list does not name is still refused, in the room or out of it.
    expect(
      authorize(decision, ARJUN, inOrder({ role: null, approvers: ["usr_somebody_else"] })),
    ).toMatchObject({ kind: "not_an_approver" });
    // An ask that named nobody is the room's, as it always was.
    expect(authorize(decision, ARJUN, inOrder({ role: null, approvers: [] }))).toMatchObject({
      kind: "wrong_space",
    });
    expect(authorize(decision, ARJUN, inOrder({ role: "member", approvers: [] }))).toBeUndefined();
  });
});

describe("handing an approval on (M5.5, rule 14)", () => {
  const MEMBER: Sender = { ...ARJUN, role: "member" };
  const ADMIN: Sender = { ...ARJUN, role: "admin" };
  const routed = () => fixture("approval.routed", ARJUN);

  it("is for somebody who may answer it, or who runs the workspace", () => {
    expect(
      authorize(routed(), MEMBER, inOrder({ approvers: [ARJUN.participantId] })),
    ).toBeUndefined();
    expect(authorize(routed(), MEMBER, inOrder({ approvers: [] }))).toBeUndefined();
    expect(authorize(routed(), MEMBER, inOrder({ approvers: null }))).toBeUndefined();
    expect(authorize(routed(), MEMBER, inOrder({ approvers: [DANA] }))).toMatchObject({
      kind: "not_an_approver",
    });
    expect(authorize(routed(), ADMIN, inOrder({ approvers: [DANA] }))).toBeUndefined();
  });

  it("is a person's, and not for a decision already made", () => {
    expect(authorize(fixture("approval.routed", SCOUT), SCOUT, inOrder())).toMatchObject({
      kind: "wrong_direction",
    });
    expect(authorize(routed(), ARJUN, inOrder({ decidedBy: DANA }))).toMatchObject({
      kind: "already_decided",
    });
  });
});

describe("a room asked of a harness (rule 15)", () => {
  /** A direct room Arjun opens, asking Scout, as the phone sends it. */
  const asking = (overrides: Record<string, unknown> = {}) => {
    const event = fixture("space.created", ARJUN, {
      kind: "direct",
      asked_of: SCOUT.participantId,
      ...overrides,
    });
    delete event["title"];
    return event;
  };
  const takes = (capabilities: readonly string[] | null) =>
    inOrder({ participant: { id: SCOUT.participantId, kind: "harness", capabilities } });

  it("is a person's to ask, of a harness that takes new spaces", () => {
    expect(authorize(asking(), ARJUN, takes(["autonomy", "new_spaces"]))).toBeUndefined();
    // Only a person sends space.created at all: a harness opens its rooms through its door.
    expect(
      authorize(
        asking({ actor: { kind: "harness", id: SCOUT.participantId } }),
        SCOUT,
        takes(["new_spaces"]),
      ),
    ).toMatchObject({
      kind: "wrong_direction",
    });
  });

  it("is refused of a harness that has not said it takes one, and of nobody at all", () => {
    expect(authorize(asking(), ARJUN, takes(["autonomy"]))).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("new_spaces"),
    });
    expect(authorize(asking(), ARJUN, takes(null))).toMatchObject({ kind: "invalid" });
    expect(authorize(asking(), ARJUN, inOrder({ participant: null }))).toMatchObject({
      kind: "unknown_participant",
    });
    // A person is not somebody a room is asked of, whatever they declared.
    expect(
      authorize(
        asking({ asked_of: DANA }),
        ARJUN,
        inOrder({ participant: { id: DANA, kind: "person", capabilities: ["new_spaces"] } }),
      ),
    ).toMatchObject({ kind: "unknown_participant" });
  });

  it("is refused of a harness that was removed, whatever it declared (ADR 0078)", () => {
    const removed = inOrder({
      participant: {
        id: SCOUT.participantId,
        kind: "harness",
        capabilities: ["new_spaces"],
        removed: true,
      },
    });
    expect(authorize(asking(), ARJUN, removed)).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("removed"),
    });
  });

  it("is refused for a room with a key already, and for a thread", () => {
    expect(
      authorize(asking({ external_key: "hrn_x:squatted" }), ARJUN, takes(["new_spaces"])),
    ).toMatchObject({ kind: "invalid", message: expect.stringContaining("no key yet") });
    expect(
      authorize(
        asking({
          kind: "thread",
          parent_space_id: SPACE,
          root_message_id: "msg_01K4ZQPX000000000000000067",
        }),
        ARJUN,
        takes(["new_spaces"]),
      ),
    ).toMatchObject({ kind: "invalid" });
  });

  it("asks nothing of a room that asks nobody", () => {
    expect(authorize(asking({ asked_of: undefined }), ARJUN, takes(null))).toBeUndefined();
  });
});
