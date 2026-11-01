/**
 * Messaging depth (M5.4) against a real database: a thread's members are its parent's, the
 * FTS5 index follows the messages and steps tables through a queue their triggers fill and a
 * search or a sweep drains (Gate 5), and search finds what was said, in voice notes too — newest
 * first, by page, only in the caller's spaces, and under 200 ms with fifty thousand messages in
 * the room.
 */

import { type Insertable, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingEvent } from "../../application/ports/index.js";
import { SNIPPET_CLOSE, SNIPPET_OPEN } from "../../application/ports/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import type { MessagesTable } from "../db/schema.js";
import { decodeCursor, ftsQuery } from "./read-models.js";
import { drainSearchIndex } from "./search-index.js";

let ws: TestWorkspace;
let clock = 1_756_820_000_000;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

async function append(
  type: string,
  extra: Record<string, unknown>,
  actor: { kind: "person" | "harness"; id: string } = {
    kind: "person",
    id: ws.arjun.participantId,
  },
): Promise<{ id: string; seq: number }> {
  clock += 1000;
  const result = await ws.gateway.deps.store.append({
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
  return { id: result.event.id, seq: result.event.seq };
}

const asMessage = (eventId: string) => eventId.replace(/^evt_/, "msg_");

describe("a thread's members are its parent's", () => {
  it("is in everyone's spaces who is in the parent, and in nobody else's", async () => {
    const said = await append("message.post", { text: "Shall we thread this?" });
    const thread = ws.ids.next("space");
    await append("space.created", {
      space_id: thread,
      kind: "thread",
      parent_space_id: ws.spaceId,
      root_message_id: asMessage(said.id),
    });
    const models = ws.gateway.deps.readModels;

    expect(await models.spacesForMember(ws.workspaceId, ws.dana.participantId)).toContain(thread);
    expect(await models.memberRole(ws.workspaceId, thread, ws.dana.participantId)).toBe("member");
    expect(await models.memberRole(ws.workspaceId, thread, ws.arjun.participantId)).toBe("owner");
    expect(await models.isMember(ws.workspaceId, thread, ws.scout.participantId)).toBe(true);
    const members = await models.membersOf(ws.workspaceId, thread);
    expect(members.map((m) => m.participant_id).sort()).toEqual(
      [ws.arjun.participantId, ws.dana.participantId, ws.scout.participantId].sort(),
    );

    const priya = await ws.addPerson("Priya", "member");
    expect(await models.spacesForMember(ws.workspaceId, priya.participantId)).not.toContain(thread);
    expect(await models.memberRole(ws.workspaceId, thread, priya.participantId)).toBeUndefined();

    // The space knows its parent and its root; the root knows its thread.
    expect(await models.space(ws.workspaceId, thread)).toMatchObject({
      kind: "thread",
      parent_space_id: ws.spaceId,
      root_message_id: asMessage(said.id),
    });
    expect(await models.message(ws.workspaceId, asMessage(said.id))).toMatchObject({
      thread_id: thread,
      edited_at: null,
      deleted_at: null,
    });
  });

  it("leaves a member who leaves the parent out of the thread too", async () => {
    const thread = ws.ids.next("space");
    await append("space.created", {
      space_id: thread,
      kind: "thread",
      parent_space_id: ws.spaceId,
    });
    await append("membership.removed", {
      participant_id: ws.dana.participantId,
      removed_by: ws.arjun.participantId,
    });
    const models = ws.gateway.deps.readModels;
    expect(await models.spacesForMember(ws.workspaceId, ws.dana.participantId)).not.toContain(
      thread,
    );
    expect(await models.memberRole(ws.workspaceId, thread, ws.dana.participantId)).toBeUndefined();
  });
});

describe("search", () => {
  const search = (text: string, extra: Record<string, unknown> = {}) =>
    ws.gateway.deps.readModels.search(ws.workspaceId, [ws.spaceId], {
      text,
      limit: 25,
      ...extra,
    });

  it("finds a message by its words, newest first, with the match marked in a snippet", async () => {
    const first = await append("message.post", { text: "Checking the Northwind quotes first." });
    const second = await append("message.post", {
      text: "Northwind confirmed: 120 units on the 19th.",
    });
    await append("message.post", { text: "Nothing to do with it." });

    const page = await search("northwind");
    expect(page.hits.map((hit) => hit.message_id)).toEqual([
      asMessage(second.id),
      asMessage(first.id),
    ]);
    expect(page.hits[0]).toMatchObject({
      kind: "message",
      space_id: ws.spaceId,
      author_id: ws.arjun.participantId,
    });
    expect(page.hits[0]?.snippet).toBe(
      `${SNIPPET_OPEN}Northwind${SNIPPET_CLOSE} confirmed: 120 units on the 19th.`,
    );
    expect(page.next_cursor).toBeNull();
  });

  it("narrows as it is typed: every word required, the last a prefix", async () => {
    await append("message.post", { text: "Checking the Northwind quotes first." });
    await append("message.post", { text: "Northwind confirmed." });
    expect((await search("north")).hits).toHaveLength(2);
    expect((await search("northwind quo")).hits).toHaveLength(1);
    expect((await search("northwind quotes confirmed")).hits).toHaveLength(0);
    expect((await search("   ")).hits).toHaveLength(0);
    expect(ftsQuery('say "hi" there')).toBe('"say" "hi" "there" *');
    expect(ftsQuery("")).toBeUndefined();
  });

  it("pages by cursor, and shrugs at a cursor that is not its own", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(asMessage((await append("message.post", { text: `Northwind note ${i}` })).id));
    }
    const first = await search("northwind", { limit: 2 });
    expect(first.hits.map((hit) => hit.message_id)).toEqual([ids[4], ids[3]]);
    expect(first.next_cursor).not.toBeNull();
    const second = await search("northwind", { limit: 2, cursor: first.next_cursor ?? "" });
    expect(second.hits.map((hit) => hit.message_id)).toEqual([ids[2], ids[1]]);
    const third = await search("northwind", { limit: 2, cursor: second.next_cursor ?? "" });
    expect(third.hits.map((hit) => hit.message_id)).toEqual([ids[0]]);
    expect(third.next_cursor).toBeNull();

    expect(decodeCursor("not-a-cursor")).toBeUndefined();
    expect(decodeCursor(Buffer.from("[1]").toString("base64url"))).toBeUndefined();
    expect((await search("northwind", { cursor: "garbage" })).hits).toHaveLength(5);
  });

  it("looks only in the spaces given, and in one of them when asked", async () => {
    await append("message.post", { text: "Northwind here." });
    const other = ws.ids.next("space");
    await append("space.created", { space_id: other, kind: "group", title: "Other" });
    await append("message.post", { space_id: other, text: "Northwind there." });
    const models = ws.gateway.deps.readModels;

    const both = await models.search(ws.workspaceId, [ws.spaceId, other], {
      text: "northwind",
      limit: 25,
    });
    expect(both.hits).toHaveLength(2);
    const one = await models.search(ws.workspaceId, [ws.spaceId, other], {
      text: "northwind",
      limit: 25,
      spaceId: other,
    });
    expect(one.hits.map((hit) => hit.space_id)).toEqual([other]);
    const none = await models.search(ws.workspaceId, [], { text: "northwind", limit: 25 });
    expect(none.hits).toEqual([]);
    const elsewhere = await models.search(ws.workspaceId, [ws.spaceId], {
      text: "northwind",
      limit: 25,
      spaceId: other,
    });
    expect(elsewhere.hits).toEqual([]);
  });

  it("finds a receipt by its step's title and summary, in the run's space", async () => {
    const runId = ws.ids.next("run");
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    await append("run.started", { run_id: runId, goal: "Confirm PO #4471", plan: [] }, scout);
    await append(
      "step.log",
      {
        run_id: runId,
        step_id: "read-po",
        status: "done",
        title: "Read PO #4471",
        summary: "120 units, delivery 19 September, signed by Arjun.",
      },
      scout,
    );
    const page = await search("september");
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]).toMatchObject({
      kind: "receipt",
      space_id: ws.spaceId,
      run_id: runId,
      step_id: "read-po",
    });
    expect(page.hits[0]?.snippet).toContain(`${SNIPPET_OPEN}September${SNIPPET_CLOSE}`);
    expect((await search("read po")).hits).toHaveLength(1);
  });

  it("finds a voice note by what was said in it, and says the snippet was heard (ADR 0054)", async () => {
    const note = (transcript: string, n: number) => ({
      attachment_id: `att_01K4ZQPX00000000000000000${n}`,
      filename: `voice-note-0913-114${n}.m4a`,
      mime_type: "audio/mp4",
      byte_size: 64_000,
      sha256: "92efa547f5840a2e7257bab9e3529a0410cce0d865fdbc40ebb2895e76de010a",
      duration_ms: 8400,
      transcript,
    });
    const spoken = await append("message.post", {
      text: "",
      attachments: [note("Send Priya the receipt.", 1), note("And the invoice for Tuesday.", 2)],
    });
    const both = await append("message.post", {
      text: "The receipt, as promised.",
      attachments: [note("Here is the receipt I mentioned.", 3)],
    });
    await append("message.post", {
      text: "A file, not a voice note.",
      attachments: [{ ...note("", 4), transcript: undefined, filename: "transcript.pdf" }],
    });

    const priya = await search("priya");
    expect(priya.hits).toHaveLength(1);
    expect(priya.hits[0]).toMatchObject({
      kind: "message",
      message_id: asMessage(spoken.id),
      snippet: `Send ${SNIPPET_OPEN}Priya${SNIPPET_CLOSE} the receipt.\nAnd the invoice for Tuesday.`,
      snippet_from: "transcript",
    });
    // Every voice note of a message is heard, and every word required across them.
    expect((await search("priya tuesday")).hits).toHaveLength(1);
    // Where the typed words match too, the hit quotes those, and is not called heard.
    const receipt = await search("receipt");
    expect(receipt.hits.map((hit) => hit.message_id)).toEqual([
      asMessage(both.id),
      asMessage(spoken.id),
    ]);
    expect(receipt.hits[0]?.snippet).toBe(
      `The ${SNIPPET_OPEN}receipt${SNIPPET_CLOSE}, as promised.`,
    );
    expect(receipt.hits[0]).not.toHaveProperty("snippet_from");
    expect((await search("mentioned")).hits[0]?.snippet_from).toBe("transcript");
    expect((await search("transcript")).hits).toHaveLength(0);

    // An edit changes the typed words and leaves what was heard findable; a taking back takes both.
    await append("message.edited", { message_id: asMessage(both.id), text: "As promised." });
    expect((await search("mentioned")).hits.map((hit) => hit.message_id)).toEqual([
      asMessage(both.id),
    ]);
    await append("message.deleted", { message_id: asMessage(spoken.id) });
    expect((await search("priya")).hits).toHaveLength(0);

    // A rebuild replays the messages, and what was heard is found again.
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect((await search("mentioned")).hits).toHaveLength(1);
  });

  it("follows an edit and a taking back: the new words are found, the old are not", async () => {
    const said = await append("message.post", { text: "Delivery is on the 12th." });
    await append("message.edited", {
      message_id: asMessage(said.id),
      text: "Delivery is on the 19th.",
    });
    expect((await search("12th")).hits).toHaveLength(0);
    expect((await search("19th")).hits).toHaveLength(1);
    await append("message.deleted", { message_id: asMessage(said.id) });
    expect((await search("19th")).hits).toHaveLength(0);
    expect((await search("delivery")).hits).toHaveLength(0);
    const row = await ws.db
      .selectFrom("messages")
      .select(["text", "edited_at", "deleted_at"])
      .where("id", "=", said.id)
      .executeTakeFirst();
    expect(row).toMatchObject({ text: null });
    expect(row?.edited_at).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();
  });

  it("follows the tables by a queue: drained on a search or a sweep, and equal to them after a rebuild (Gate 5)", async () => {
    const said = await append("message.post", { text: "Queued until somebody looks." });
    const queued = await sql<{ n: number }>`select count(*) as n from search_queue`.execute(ws.db);
    expect(queued.rows[0]?.n).toBeGreaterThan(0);
    // Not in the index yet — and found all the same, since a search drains first.
    expect((await search("queued")).hits).toHaveLength(1);
    expect(
      (await sql<{ n: number }>`select count(*) as n from search_queue`.execute(ws.db)).rows[0]?.n,
    ).toBe(0);
    // The sweep drains what a search has not.
    await append("message.edited", { message_id: asMessage(said.id), text: "Swept into place." });
    const swept = await ws.gateway.deps.sweep();
    expect(swept.indexed).toBe(1);
    expect((await search("swept")).hits).toHaveLength(1);
    expect((await search("queued")).hits).toHaveLength(0);
    // A taking back leaves the index at once, before any drain.
    await append("message.deleted", { message_id: asMessage(said.id) });
    const gone = await sql<{ n: number }>`select count(*) as n from messages_fts`.execute(ws.db);
    expect(gone.rows[0]?.n).toBe(0);
    // A rebuild replays the tables, and the index follows them to the same count.
    await append("message.post", { text: "One that stays." });
    await append("message.post", { text: "And another that stays." });
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    // Every message row the replay wrote is queued again — Chips' own lines included — and
    // the index ends equal to what has text and was not taken back.
    expect(await drainSearchIndex(ws.db)).toBeGreaterThanOrEqual(2);
    const counts = await sql<{ fts: number; live: number }>`
      select (select count(*) from messages_fts) as fts,
        (select count(*) from messages where text is not null and deleted_at is null) as live
    `.execute(ws.db);
    expect(counts.rows[0]?.fts).toBe(counts.rows[0]?.live);
    expect((await search("stays")).hits).toHaveLength(2);
  });

  it("answers in under 200 ms with fifty thousand messages in the room", async () => {
    const words = [
      "quote",
      "delivery",
      "units",
      "signed",
      "invoice",
      "shipment",
      "confirm",
      "draft",
    ];
    const rows: Insertable<MessagesTable>[] = [];
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    for (let i = 0; i < 50_000; i += 1) {
      const a = words[i % words.length];
      const b = words[(i * 3 + 1) % words.length];
      const rare = i % 5000 === 0 ? " Northwind" : "";
      rows.push({
        id: ws.ids.next("event"),
        workspace_id: ws.workspaceId,
        space_id: ws.spaceId,
        run_id: null,
        seq: i + 100,
        type: "text",
        author_kind: "person",
        author_id: ws.arjun.participantId,
        text: `Message ${i}: the ${a} and the ${b}${rare} for PO-${i % 97}.`,
        reply_to: null,
        attachments: "[]",
        approval_id: null,
        ask_id: null,
        created_at: new Date(base + i * 1000).toISOString(),
        edited_at: null,
        deleted_at: null,
      });
    }
    await ws.db.transaction().execute(async (trx) => {
      for (let i = 0; i < rows.length; i += 1000) {
        await trx
          .insertInto("messages")
          .values(rows.slice(i, i + 1000))
          .execute();
      }
    });
    // The index follows the table by a queue (Gate 5): fifty thousand rows, folded in at once.
    const folded = performance.now();
    expect(await drainSearchIndex(ws.db)).toBeGreaterThanOrEqual(50_000);
    const foldMs = performance.now() - folded;
    expect(foldMs, `draining fifty thousand took ${foldMs.toFixed(0)} ms`).toBeLessThan(10_000);
    const indexed = await sql<{ n: number }>`select count(*) as n from messages_fts`.execute(ws.db);
    expect(indexed.rows[0]?.n).toBeGreaterThanOrEqual(50_000);

    for (const text of ["northwind", "quote delivery", "ship", "po-42"]) {
      const started = performance.now();
      const page = await search(text);
      const took = performance.now() - started;
      expect(page.hits.length, text).toBeGreaterThan(0);
      expect(took, `${text} took ${took.toFixed(1)} ms`).toBeLessThan(200);
    }
  }, 60_000);
});
