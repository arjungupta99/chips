/**
 * How a harness's turns have gone since a bridge release was switched to, for its first day
 * (bridges-keep-current.md, rule 3).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase } from "../db/connection.js";
import { migrateToLatest } from "../db/migrator.js";
import type { Database } from "../db/schema.js";
import { createHarnessTurns } from "./harness-turns.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ROOM = "spc_01K4ZQPX000000000000000ROOM";
const HARNESS = "hrn_01K4ZQPX000000000000000004";
const OTHER = "hrn_01K4ZQPX000000000000000009";
const AT = "2026-11-20T10:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(AT) + minutes * 60_000).toISOString();

let db: Kysely<Database>;
let close: () => Promise<void>;

beforeEach(async () => {
  const directory = mkdtempSync(join(tmpdir(), "chips-turns-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(connection.db, () => AT);
  db = connection.db;
  await db.insertInto("workspaces").values({ id: WS, name: "Solo", created_at: AT }).execute();
  for (const id of [HARNESS, OTHER]) {
    await db
      .insertInto("participants")
      .values({
        id,
        workspace_id: WS,
        kind: "harness",
        display_name: id,
        owner_id: null,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: AT,
      })
      .execute();
  }
  await db
    .insertInto("spaces")
    .values({
      id: ROOM,
      workspace_id: WS,
      kind: "group",
      title: ROOM,
      external_key: null,
      state: "open",
      closed_at: null,
      opened_by: null,
      title_by: null,
      state_by: null,
      asked_of: null,
      created_at: AT,
    } as never)
    .execute();
  close = async () => {
    await connection.close();
    rmSync(directory, { recursive: true, force: true });
  };
});

afterEach(async () => {
  await close();
});

let made = 0;
async function run(state: string, startedAt: string, harness = HARNESS) {
  made += 1;
  await db
    .insertInto("runs")
    .values({
      id: `run_${made}`,
      workspace_id: WS,
      space_id: ROOM,
      harness_id: harness,
      goal: "g",
      state,
      status_phase: null,
      status_verb: null,
      plan: null,
      session_ref: null,
      summary: null,
      error: null,
      cost_usd: null,
      input_tokens: null,
      output_tokens: null,
      context_used: null,
      context_limit: null,
      started_at: startedAt,
      ended_at: null,
    })
    .execute();
}

const turns = () => createHarnessTurns(db)(WS, HARNESS, AT);

it("counts the turns begun since the time that are over, and those that failed", async () => {
  expect(await turns()).toEqual({ ended: 0, failed: 0, failedBefore: false });
  await run("failed", at(1));
  await run("failed", at(2));
  await run("done", at(3));
  expect(await turns()).toEqual({ ended: 3, failed: 2, failedBefore: false });
});

it("leaves out a turn still going, one a person stopped, and another harness's", async () => {
  await run("running", at(1));
  await run("paused", at(2));
  await run("cancelled", at(3));
  await run("failed", at(4), OTHER);
  expect(await turns()).toEqual({ ended: 0, failed: 0, failedBefore: false });
});

it("leaves out a turn begun before the time, and says whether the newest of those had failed", async () => {
  await run("failed", at(-30));
  await run("done", at(-20));
  expect(await turns()).toEqual({ ended: 0, failed: 0, failedBefore: false });
  await run("failed", at(-10));
  // One a person stopped after it says nothing either way.
  await run("cancelled", at(-5));
  expect(await turns()).toEqual({ ended: 0, failed: 0, failedBefore: true });
  // A turn begun at the very time of the switch belongs to the release before.
  await run("done", AT);
  expect(await turns()).toEqual({ ended: 0, failed: 0, failedBefore: false });
});
