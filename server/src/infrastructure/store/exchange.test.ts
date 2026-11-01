/**
 * The referee's reads (ADR 0097) against a real database: where the count starts — a person's
 * act, or an agent's new file, question or approval ask — what agents sent agents since, a pause,
 * a file seen in the room before, and the messages held since a person last acted.
 */

import { messageIdOf } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingEvent } from "../../application/ports/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;
let clock = 1_759_427_000_000;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const LEDGER = "hrn_01K4ZQPX00000000000000000M";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

type Actor = { kind: "person" | "harness" | "system"; id: string };

async function append(type: string, actor: Actor, extra: Record<string, unknown> = {}) {
  clock += 1000;
  const { event } = await ws.gateway.deps.store.append({
    v: 1,
    type,
    id: ws.ids.next("event"),
    ts: new Date(clock).toISOString(),
    workspace_id: ws.workspaceId,
    space_id: ws.spaceId,
    actor,
    idempotency_key: ws.ids.next("event"),
    ...extra,
  } as IncomingEvent);
  return event;
}

const say = (actor: Actor, extra: Record<string, unknown> = {}) =>
  append("message.post", actor, { text: "words", ...extra });

function file(name: string, sha256: string) {
  return {
    attachment_id: ws.ids.next("attachment"),
    filename: name,
    mime_type: "text/html",
    byte_size: 10,
    sha256,
  };
}

const read = () => ws.gateway.deps.readModels.exchangeOf(ws.workspaceId, ws.spaceId);

describe("where the referee's count starts", () => {
  it("is the last person's act — here, adding Scout — then a newer one, then an agent's file new to the room", async () => {
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    const said = await say(scout, { addressed_to: [LEDGER] });
    const setUp = await read();
    expect(setUp.since.kind).toBe("person");
    expect(setUp.since.seq).toBeLessThan(said.seq);
    expect(setUp.count).toBe(1);

    const arjun = { kind: "person" as const, id: ws.arjun.participantId };
    const spoke = await say(arjun, { addressed_to: [scout.id] });
    expect((await read()).since).toMatchObject({ kind: "person", seq: spoke.seq, by: arjun.id });

    const made = await say(scout, { addressed_to: [LEDGER], attachments: [file("a.html", SHA_A)] });
    await say(scout, { addressed_to: [LEDGER] });
    const after = await read();
    expect(after.since).toMatchObject({
      kind: "work",
      seq: made.seq,
      by: scout.id,
      made: "file",
      file: "a.html",
    });
    expect(after.count).toBe(1);
    expect(after.person).toBe(arjun.id);
    expect(after.personSeq).toBe(spoke.seq);
  });

  it("does not start again on a file already in the room, which is a repeat", async () => {
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    const first = await say(scout, {
      addressed_to: [LEDGER],
      attachments: [file("a.html", SHA_A)],
    });
    await say({ kind: "person", id: ws.arjun.participantId });
    await say(scout, { addressed_to: [LEDGER], attachments: [file("a.html", SHA_A)] });
    const now = await read();
    expect(now.since.kind).toBe("person");
    expect(now.messages.map((message) => message.filesSeen)).toEqual([["a.html"]]);
    expect(first.seq).toBeLessThan(now.since.seq);
    // A new file, by another name or the same, does.
    await say(scout, { addressed_to: [LEDGER], attachments: [file("a.html", SHA_B)] });
    expect((await read()).since).toMatchObject({ kind: "work", made: "file" });
  });

  it("starts again on a question or an approval an agent asks, never on a pause", async () => {
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    await say(scout, { addressed_to: [LEDGER] });
    const asked = await append("question.ask", scout, {
      ask_id: ws.ids.next("question"),
      questions: [],
    });
    expect((await read()).since).toMatchObject({ kind: "work", seq: asked.seq, made: "question" });

    await say(scout, { addressed_to: [LEDGER] });
    const arjun = { kind: "person" as const, id: ws.arjun.participantId };
    await append("exchange.set", arjun, { state: "paused" });
    const paused = await read();
    expect(paused.paused).toBe(true);
    expect(paused.since.seq).toBe(asked.seq);
    expect(paused.count).toBe(1);

    // Carrying on is a person acting: the count starts again, and the pause is over.
    const going = await append("exchange.set", arjun, { state: "going" });
    expect(await read()).toMatchObject({
      paused: false,
      count: 0,
      since: { kind: "person", seq: going.seq },
    });
  });

  it("is read as of a seq, so a message handed over again is handed the same facts", async () => {
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    const first = await say(scout, { addressed_to: [LEDGER] });
    await say(scout, { addressed_to: [LEDGER] });
    await say({ kind: "person", id: ws.arjun.participantId });
    const then = await ws.gateway.deps.readModels.exchangeOf(ws.workspaceId, ws.spaceId, {
      uptoSeq: first.seq,
    });
    expect(then).toMatchObject({ count: 1, since: { kind: "person" } });
    expect(then.messages.map((message) => message.message_id)).toEqual([messageIdOf(first.id)]);
  });
});

describe("what was held", () => {
  it("is the held messages after a seq and before another, newest first, with what they said", async () => {
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    const spoke = await say({ kind: "person", id: ws.arjun.participantId });
    const older = await say(scout, {
      text: "@Ledger first",
      mentions: [LEDGER],
      addressed_to: [],
      held: true,
    });
    await say(scout, { text: "for the people", addressed_to: [] });
    const newer = await say(scout, {
      text: "@Ledger second",
      mentions: [LEDGER],
      to: [LEDGER],
      addressed_to: [],
      held: true,
    });
    const next = await say({ kind: "person", id: ws.arjun.participantId });
    const held = await ws.gateway.deps.readModels.heldIn(
      ws.workspaceId,
      ws.spaceId,
      spoke.seq,
      next.seq,
    );
    expect(held.map((message) => message.event_id)).toEqual([newer.id, older.id]);
    expect(held[0]).toMatchObject({
      author_id: scout.id,
      text: "@Ledger second",
      mentions: [LEDGER],
      to: [LEDGER],
    });
    expect(
      await ws.gateway.deps.readModels.heldIn(ws.workspaceId, ws.spaceId, next.seq, next.seq + 10),
    ).toEqual([]);
  });
});
