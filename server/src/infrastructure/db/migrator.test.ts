/**
 * Migrations, up and down, against a real SQLite file (technical-plan 6.3). The dialect list
 * grows to two in Phase 6; this file is where that gets checked for both.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseUrlError, openDatabase, sqlitePathFrom } from "./connection.js";
import { MIGRATIONS, migrateDown, migrateToLatest } from "./migrator.js";
import type { Database } from "./schema.js";

/** Every table M0.3 asks for, in the order the milestone lists them. */
const EXPECTED_TABLES = [
  "workspaces",
  "participants",
  "devices",
  "harness_tokens",
  "spaces",
  "memberships",
  "messages",
  "runs",
  "steps",
  "approvals",
  "questions",
  "attachments",
  "lanes",
  "events",
  "read_state",
  "server_keys",
];

let directory: string;
let db: Kysely<Database>;
let close: () => Promise<void>;

async function tableNames(): Promise<string[]> {
  const result = await sql<{
    name: string;
  }>`select name from sqlite_master where type = 'table' order by name`.execute(db);
  return result.rows.map((row) => row.name).filter((name) => !name.startsWith("sqlite_"));
}

async function indexNames(): Promise<string[]> {
  const result = await sql<{
    name: string;
  }>`select name from sqlite_master where type = 'index' and name not like 'sqlite_%' order by name`.execute(
    db,
  );
  return result.rows.map((row) => row.name);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "chips-migrate-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  db = connection.db;
  close = connection.close;
});

afterEach(async () => {
  await close();
  rmSync(directory, { recursive: true, force: true });
});

describe("the database URL", () => {
  it("reads a path out of a sqlite URL", () => {
    expect(sqlitePathFrom("sqlite:./.chips/chips.db")).toBe("./.chips/chips.db");
    expect(sqlitePathFrom("sqlite::memory:")).toBe(":memory:");
  });

  it("refuses a URL for a dialect this build does not have", () => {
    expect(() => sqlitePathFrom("postgres://localhost/chips")).toThrow(DatabaseUrlError);
  });
});

describe("migrating up", () => {
  it("creates every table M0.3 asks for", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const tables = await tableNames();
    for (const table of EXPECTED_TABLES) {
      expect(tables, `${table} is missing`).toContain(table);
    }
  });

  it("declares an index for each query that needs one", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const indexes = await indexNames();
    // Spot checks on the three that matter most: resuming a stream, the For you queue, and
    // authenticating a harness token.
    expect(indexes).toContain("events_workspace_id_space_id_seq");
    expect(indexes).toContain("approvals_workspace_id_state_requested_at");
    expect(indexes).toContain("harness_tokens_hash");
  });

  it("reports what it applied", async () => {
    const result = await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(result.applied).toEqual(MIGRATIONS.map((m) => m.name));
    expect(result.alreadyApplied).toEqual([]);
  });

  it("is safe to run twice", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const second = await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual(MIGRATIONS.map((m) => m.name));
  });

  it("turns foreign keys on, which SQLite does not do by itself", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const result = await sql<{ foreign_keys: number }>`pragma foreign_keys`.execute(db);
    expect(result.rows[0]?.foreign_keys).toBe(1);
  });

  it("refuses a participant in a workspace that does not exist", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    await expect(
      db
        .insertInto("participants")
        .values({
          id: "hrn_01K4ZQPX000000000000000004",
          workspace_id: "ws_01K4ZQPX00000000000000000Z",
          kind: "harness",
          display_name: "Nobody",
          owner_id: null,
          parent_id: null,
          ephemeral: 0,
          capabilities: null,
          created_at: "2026-09-02T00:00:00.000Z",
        })
        .execute(),
    ).rejects.toThrow();
  });
});

describe("the price table column (0002)", () => {
  async function workspaceColumns(): Promise<string[]> {
    const result = await sql<{ name: string }>`pragma table_info(workspaces)`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("is there after migrating up, and gone after the migration is undone", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await workspaceColumns()).toContain("price_table");

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await migrateDown(db)).toBe("0008-group-spaces");
    expect(await migrateDown(db)).toBe("0007-lanes");
    expect(await migrateDown(db)).toBe("0006-idempotency-keys-are-the-senders");
    expect(await migrateDown(db)).toBe("0005-sessions");
    expect(await migrateDown(db)).toBe("0004-uploads");
    expect(await migrateDown(db)).toBe("0003-policy-is-a-projection");
    expect(await migrateDown(db)).toBe("0002-workspace-price-table");
    expect(await workspaceColumns()).not.toContain("price_table");

    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await workspaceColumns()).toContain("price_table");
  });
});

/**
 * Undo migrations until the named one has been undone. Counting the steps instead means every
 * later migration has to remember to come back here and add one.
 */
async function downPast(name: string): Promise<void> {
  for (;;) {
    const undone = await migrateDown(db);
    if (undone === undefined) throw new Error(`never reached ${name}`);
    if (undone === name) return;
  }
}

/** Undo every migration, most recent first, the way `migrateDown` does one at a time. */
async function downAll(): Promise<string[]> {
  const undone: string[] = [];
  for (;;) {
    const name = await migrateDown(db);
    if (name === undefined) return undone;
    undone.push(name);
  }
}

describe("the policy split (0003)", () => {
  async function columns(table: string): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from pragma_table_info(${table})`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("moves autonomy, budget and spend out of participants and the cap out of workspaces", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await columns("participants")).not.toContain("autonomy");
    expect(await columns("workspaces")).not.toContain("max_autonomy");
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["harness_policy", "workspace_policy", "session_rules"]),
    );

    await downPast("0003-policy-is-a-projection");
    expect(await columns("participants")).toContain("autonomy");
    expect(await columns("workspaces")).toContain("max_autonomy");
    expect(await tableNames()).not.toContain("harness_policy");
  });
});

describe("uploads (0004)", () => {
  it("adds the uploads registry and the attachment's space, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await tableNames()).toContain("uploads");
    const columns = await sql<{
      name: string;
    }>`select name from pragma_table_info('attachments')`.execute(db);
    expect(columns.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(["space_id", "message_id"]),
    );
    expect(await indexNames()).toContain("attachments_workspace_id_space_id");

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await migrateDown(db)).toBe("0008-group-spaces");
    expect(await migrateDown(db)).toBe("0007-lanes");
    expect(await migrateDown(db)).toBe("0006-idempotency-keys-are-the-senders");
    expect(await migrateDown(db)).toBe("0005-sessions");
    expect(await migrateDown(db)).toBe("0004-uploads");
    expect(await tableNames()).not.toContain("uploads");
    const after = await sql<{
      name: string;
    }>`select name from pragma_table_info('attachments')`.execute(db);
    expect(after.rows.map((row) => row.name)).not.toContain("space_id");
  });
});

describe("sessions (0005)", () => {
  it("adds the visits table and the space's key, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await tableNames()).toContain("sessions");
    expect(await indexNames()).toContain("sessions_workspace_id_space_id");
    const spaces = await sql<{
      name: string;
    }>`select name from pragma_table_info('spaces')`.execute(db);
    expect(spaces.rows.map((row) => row.name)).toContain("external_key");

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await migrateDown(db)).toBe("0008-group-spaces");
    expect(await migrateDown(db)).toBe("0007-lanes");
    expect(await migrateDown(db)).toBe("0006-idempotency-keys-are-the-senders");
    expect(await migrateDown(db)).toBe("0005-sessions");
    expect(await tableNames()).not.toContain("sessions");
    const after = await sql<{
      name: string;
    }>`select name from pragma_table_info('spaces')`.execute(db);
    expect(after.rows.map((row) => row.name)).not.toContain("external_key");
  });
});

describe("a key is the sender's (0006)", () => {
  async function keyIndexColumns(): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from pragma_index_info('events_idempotency_key')`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("puts the actor in the key's index, and takes it out again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await keyIndexColumns()).toEqual(["workspace_id", "actor_id", "idempotency_key"]);

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await migrateDown(db)).toBe("0008-group-spaces");
    expect(await migrateDown(db)).toBe("0007-lanes");
    expect(await migrateDown(db)).toBe("0006-idempotency-keys-are-the-senders");
    expect(await keyIndexColumns()).toEqual(["workspace_id", "idempotency_key"]);

    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await keyIndexColumns()).toEqual(["workspace_id", "actor_id", "idempotency_key"]);
  });
});

describe("a lane knows its run and its lead's (0007)", () => {
  async function laneColumns(): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from pragma_table_info('lanes')`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds the columns and indexes a lane is found by, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await laneColumns()).toEqual(
      expect.arrayContaining([
        "run_id",
        "lead_run_id",
        "home_space_id",
        "linked_space_ids",
        "trail",
      ]),
    );
    expect(await indexNames()).toContain("lanes_workspace_id_run_id");
    expect(await indexNames()).toContain("lanes_workspace_id_lead_run_id");

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await migrateDown(db)).toBe("0008-group-spaces");
    expect(await migrateDown(db)).toBe("0007-lanes");
    expect(await laneColumns()).not.toContain("run_id");
    expect(await indexNames()).not.toContain("lanes_workspace_id_run_id");

    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await laneColumns()).toContain("home_space_id");
  });
});

describe("a space can be closed, and knows who opened it (0008)", () => {
  async function spaceColumns(): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from pragma_table_info('spaces')`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds the columns, fills in who opened what is already there, and takes them away again", async () => {
    // A room from before the migration, with its opening in the log: the backfill names its opener.
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    await downPast("0008-group-spaces");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "Solo", created_at: "2026-09-02T00:00:00.000Z" })
      .execute();
    await sql`insert into spaces (id, workspace_id, kind, title, created_at)
      values ('spc_1', 'ws_1', 'group', 'PO-4471', '2026-09-02T00:00:00.000Z')`.execute(db);
    await sql`insert into events (workspace_id, seq, id, type, ts, space_id, actor_kind, actor_id, payload, appended_at)
      values ('ws_1', 1, 'evt_1', 'space.created', '2026-09-02T00:00:00.000Z', 'spc_1', 'person', 'usr_1', '{}', '2026-09-02T00:00:00.000Z')`.execute(
      db,
    );

    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await spaceColumns()).toEqual(
      expect.arrayContaining(["state", "closed_at", "opened_by", "title_by"]),
    );
    const room = await sql<{ state: string; opened_by: string | null }>`
      select state, opened_by from spaces where id = 'spc_1'`.execute(db);
    expect(room.rows[0]).toEqual({ state: "open", opened_by: "usr_1" });

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await migrateDown(db)).toBe("0008-group-spaces");
    expect(await spaceColumns()).not.toContain("opened_by");
    expect(await spaceColumns()).not.toContain("state");
  });
});

describe("people join, hold a role, and come back by passkey (0009)", () => {
  it("adds the three tables, gives everyone already here a role, and takes it all away again", async () => {
    // A workspace from before roles: two people, the older of whom ran the server.
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "Solo", created_at: "2026-09-02T00:00:00.000Z" })
      .execute();
    for (const [id, name, at] of [
      ["usr_1", "Arjun", "2026-09-02T00:00:00.000Z"],
      ["usr_2", "Dana", "2026-09-03T00:00:00.000Z"],
    ] as const) {
      await sql`insert into participants (id, workspace_id, kind, display_name, ephemeral, created_at)
        values (${id}, 'ws_1', 'person', ${name}, 0, ${at})`.execute(db);
    }

    await migrateToLatest(db, () => "2026-09-06T00:00:00.000Z");
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["workspace_members", "invites", "passkeys"]),
    );
    expect(await indexNames()).toEqual(
      expect.arrayContaining(["invites_token_hash", "passkeys_credential_id"]),
    );

    // The oldest person is the owner, the rest are members, and the log says so.
    const members = await db
      .selectFrom("workspace_members")
      .select(["participant_id", "role", "updated_seq"])
      .orderBy("participant_id", "asc")
      .execute();
    expect(members).toEqual([
      { participant_id: "usr_1", role: "owner", updated_seq: 1 },
      { participant_id: "usr_2", role: "member", updated_seq: 2 },
    ]);
    const events = await db
      .selectFrom("events")
      .select(["seq", "type", "actor_id", "idempotency_key", "payload"])
      .orderBy("seq", "asc")
      .execute();
    expect(events.map((event) => [event.seq, event.type, event.actor_id])).toEqual([
      [1, "person.joined", "usr_1"],
      [2, "person.joined", "usr_2"],
    ]);
    expect(events[0]?.idempotency_key).toBe("0009-joined-usr_1");
    expect(JSON.parse(events[0]?.payload ?? "{}")).toMatchObject({
      type: "person.joined",
      participant_id: "usr_1",
      display_name: "Arjun",
      role: "owner",
      actor: { kind: "person", id: "usr_1" },
    });

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await migrateDown(db)).toBe("0009-people");
    expect(await tableNames()).not.toContain("workspace_members");
    expect(await tableNames()).not.toContain("invites");
    expect(await tableNames()).not.toContain("passkeys");
    expect(await db.selectFrom("events").selectAll().execute()).toEqual([]);
  });
});

describe("a database from before the rename", () => {
  it("is told what to do rather than failing on the first missing table", async () => {
    // Four migrations applied, and the tables they made under their old names: what a database
    // made on 3 September 2026 looks like (ADR 0024's addendum).
    await sql`create table _chips_migrations (name text primary key, applied_at text not null)`.execute(
      db,
    );
    for (const name of [
      "0001-initial",
      "0002-workspace-price-table",
      "0003-policy-is-a-projection",
      "0004-uploads",
    ]) {
      await sql`insert into _chips_migrations values (${name}, '2026-09-03T00:00:00.000Z')`.execute(
        db,
      );
    }
    await sql`create table conversations (id text primary key)`.execute(db);

    await expect(migrateToLatest(db, () => "2026-09-04T00:00:00.000Z")).rejects.toThrow(
      /delete the data directory and start again/,
    );
  });
});

describe("migrating down", () => {
  it("removes every table it created, most recent migration first", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const undone = await downAll();
    expect(undone).toEqual([...MIGRATIONS].reverse().map((m) => m.name));

    const tables = await tableNames();
    for (const table of EXPECTED_TABLES) {
      expect(tables, `${table} survived the down migration`).not.toContain(table);
    }
  });

  it("leaves the ledger able to migrate up again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    await downAll();
    const again = await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(again.applied).toEqual(MIGRATIONS.map((m) => m.name));
    expect(await tableNames()).toContain("events");
  });

  it("does nothing when there is nothing to undo", async () => {
    expect(await migrateDown(db)).toBeUndefined();
  });
});

describe("messaging depth (0010)", () => {
  async function columnsOf(table: string): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from pragma_table_info(${table})`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds the thread and message columns, the pins, and the search tables, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await columnsOf("spaces")).toEqual(
      expect.arrayContaining(["parent_space_id", "root_message_id"]),
    );
    expect(await columnsOf("messages")).toEqual(
      expect.arrayContaining(["edited_at", "deleted_at"]),
    );
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["pins", "messages_fts", "steps_fts"]),
    );

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await migrateDown(db)).toBe("0010-messaging-depth");
    expect(await columnsOf("spaces")).not.toContain("parent_space_id");
    expect(await columnsOf("messages")).not.toContain("deleted_at");
    expect(await tableNames()).not.toContain("pins");
    expect(await tableNames()).not.toContain("messages_fts");
  });

  it("indexes what was already said, once", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    await downPast("0012-search-off-the-request-path");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "Solo", created_at: "2026-09-02T00:00:00.000Z" })
      .execute();
    await sql`insert into messages (id, workspace_id, space_id, type, author_kind, author_id, text, created_at)
      values ('evt_1', 'ws_1', 'spc_1', 'text', 'person', 'usr_1', 'Northwind quotes', '2026-09-02T00:00:00.000Z')`.execute(
      db,
    );
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const found = await sql<{ message_id: string }>`
      select message_id from messages_fts where messages_fts match 'northwind'`.execute(db);
    expect(found.rows).toEqual([{ message_id: "evt_1" }]);
  });
});

describe("notifications per person (0011)", () => {
  it("adds the settings and the claim ledger, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["notification_settings", "notification_claims"]),
    );
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await migrateDown(db)).toBe("0011-notifications");
    expect(await tableNames()).not.toContain("notification_claims");
    expect(await tableNames()).not.toContain("notification_settings");
  });
});

describe("search off the request path (0012)", () => {
  async function triggerNames(): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from sqlite_master where type = 'trigger' order by name`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds the queue and the two maps, keeps what was indexed, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["search_queue", "messages_fts_map", "steps_fts_map"]),
    );
    expect(await triggerNames()).toEqual(
      expect.arrayContaining(["messages_fts_insert", "messages_fts_update", "messages_fts_delete"]),
    );

    // A message written the old way — into the index by 0010's trigger — keeps its rowid in
    // the map, and a message written now is a queue row, not an index row.
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await tableNames()).not.toContain("search_queue");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "T", created_at: "2026-09-02T00:00:00.000Z" })
      .execute();
    await sql`insert into messages (id, workspace_id, space_id, run_id, seq, type, author_kind, author_id, text, reply_to, attachments, approval_id, ask_id, created_at)
      values ('evt_a', 'ws_1', 'spc_1', null, 1, 'text', 'person', 'usr_1', 'Indexed the old way', null, '[]', null, null, '2026-09-02T00:00:00.000Z')`.execute(
      db,
    );
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    const mapped = await sql<{ fts_rowid: number; message_id: string }>`
      select m.fts_rowid, m.message_id from messages_fts_map m
      join messages_fts f on f.rowid = m.fts_rowid`.execute(db);
    expect(mapped.rows).toEqual([{ fts_rowid: 1, message_id: "evt_a" }]);
    await sql`insert into messages (id, workspace_id, space_id, run_id, seq, type, author_kind, author_id, text, reply_to, attachments, approval_id, ask_id, created_at)
      values ('evt_b', 'ws_1', 'spc_1', null, 2, 'text', 'person', 'usr_1', 'Queued the new way', null, '[]', null, null, '2026-09-02T00:00:01.000Z')`.execute(
      db,
    );
    const queued = await sql<{
      kind: string;
      key1: string;
    }>`select kind, key1 from search_queue`.execute(db);
    expect(queued.rows).toEqual([{ kind: "message", key1: "evt_b" }]);
    const indexed = await sql<{ n: number }>`select count(*) as n from messages_fts`.execute(db);
    expect(indexed.rows[0]?.n).toBe(1);

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await migrateDown(db)).toBe("0012-search-off-the-request-path");
    expect(await tableNames()).not.toContain("messages_fts_map");
    expect(await triggerNames()).toContain("messages_fts_update");
  });
});

describe("the server's keys (0013)", () => {
  it("adds the one table that keeps a private key, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-02T00:00:00.000Z");
    expect(await tableNames()).toContain("server_keys");
    await db
      .insertInto("server_keys")
      .values({
        kind: "relay",
        public_key: "p",
        private_key: "s",
        created_at: "2026-09-06T00:00:00.000Z",
      })
      .execute();
    // One key per kind: a second row of the same kind is refused by the table itself.
    await expect(
      db
        .insertInto("server_keys")
        .values({
          kind: "relay",
          public_key: "q",
          private_key: "t",
          created_at: "2026-09-06T00:00:01.000Z",
        })
        .execute(),
    ).rejects.toThrow();
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await migrateDown(db)).toBe("0013-server-keys");
    expect(await tableNames()).not.toContain("server_keys");
  });
});

describe("which visit a person's messages go to (0014)", () => {
  it("adds the pin registry, keeps one pin per person per space, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-07T00:00:00.000Z");
    expect(await tableNames()).toContain("session_pins");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "Solo", created_at: "2026-09-07T00:00:00.000Z" })
      .execute();
    const pin = (sessionRef: string) =>
      db
        .insertInto("session_pins")
        .values({
          workspace_id: "ws_1",
          participant_id: "usr_1",
          space_id: "spc_1",
          session_ref: sessionRef,
          pinned_at: "2026-09-07T00:00:00.000Z",
        })
        .execute();
    await pin("scout:one");
    // One pin per person per space: a second for the same space is the table's to refuse, so
    // that replacing a pin is a write that cannot leave two behind.
    await expect(pin("scout:two")).rejects.toThrow();
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await migrateDown(db)).toBe("0014-session-pins");
    expect(await tableNames()).not.toContain("session_pins");
  });
});

describe("what a visit is called (0015)", () => {
  async function columnsIn(table: string): Promise<string[]> {
    const result = await sql<{
      name: string;
    }>`select name from pragma_table_info(${table})`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds the title column, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-07T00:00:00.000Z");
    expect(await columnsIn("sessions")).toContain("title");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await migrateDown(db)).toBe("0015-session-titles");
    expect(await columnsIn("sessions")).not.toContain("title");
  });
});

describe("where a push may reach a phone (0016)", () => {
  it("adds the push token registry and its index, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-08T00:00:00.000Z");
    expect(await tableNames()).toContain("push_tokens");
    expect(await indexNames()).toContain("push_tokens_person");

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");

    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await migrateDown(db)).toBe("0017-attachment-limits");
    expect(await migrateDown(db)).toBe("0016-push-tokens");
    expect(await tableNames()).not.toContain("push_tokens");
    expect(await indexNames()).not.toContain("push_tokens_person");
  });

  it("keeps one token per device, so a phone that registers twice has one row", async () => {
    await migrateToLatest(db, () => "2026-09-08T00:00:00.000Z");
    const at = "2026-09-08T00:00:00.000Z";
    await db.insertInto("workspaces").values({ id: "w", name: "W", created_at: at }).execute();
    await db
      .insertInto("participants")
      .values({
        id: "p_1",
        workspace_id: "w",
        kind: "person",
        display_name: "A",
        ephemeral: 0,
        created_at: at,
      })
      .execute();
    await db
      .insertInto("devices")
      .values({
        id: "dev_1",
        workspace_id: "w",
        participant_id: "p_1",
        public_key: "k",
        name: "A phone",
        paired_at: at,
      })
      .execute();

    const register = (token: string) =>
      sql`insert or replace into push_tokens
            (device_id, workspace_id, participant_id, token, platform, time_zone, updated_at)
          values ('dev_1', 'w', 'p_1', ${token}, 'ios', 'Asia/Kolkata', ${at})`.execute(db);
    await register("ExponentPushToken[one]");
    await register("ExponentPushToken[two]");

    const held = await sql<{ token: string }>`select token from push_tokens`.execute(db);
    expect(held.rows).toEqual([{ token: "ExponentPushToken[two]" }]);
  });

  it("refuses a token for a device that does not exist", async () => {
    await migrateToLatest(db, () => "2026-09-08T00:00:00.000Z");
    await expect(
      sql`insert into push_tokens
            (device_id, workspace_id, participant_id, token, platform, time_zone, updated_at)
          values ('nobody', 'w', 'p_1', 't', 'ios', 'UTC', '2026-09-08T00:00:00.000Z')`.execute(db),
    ).rejects.toThrow();
  });
});

describe("upload pieces (0018)", () => {
  async function uploadColumns(): Promise<string[]> {
    const result = await sql<{ name: string }>`pragma table_info(uploads)`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds the size a slot said it would be, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-13T00:00:00.000Z");
    expect(await uploadColumns()).toContain("declared_bytes");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await migrateDown(db)).toBe("0018-upload-pieces");
    expect(await uploadColumns()).not.toContain("declared_bytes");
    expect(await uploadColumns()).toContain("byte_size");
  });
});

describe("playable videos (0019)", () => {
  async function uploadColumns(): Promise<string[]> {
    const result = await sql<{ name: string }>`pragma table_info(uploads)`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds where a video's playable copy has got to, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-13T00:00:00.000Z");
    expect(await uploadColumns()).toEqual(
      expect.arrayContaining([
        "playable_state",
        "playable_how",
        "playable_sha256",
        "playable_note",
      ]),
    );
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await migrateDown(db)).toBe("0019-playable-videos");
    expect(await uploadColumns()).not.toContain("playable_state");
    expect(await uploadColumns()).toContain("declared_bytes");
  });
});

describe("voice notes are searchable (0021)", () => {
  async function ftsColumns(): Promise<string[]> {
    const result = await sql<{ name: string }>`pragma table_info(messages_fts)`.execute(db);
    return result.rows.map((row) => row.name);
  }

  const insertMessage = (id: string, text: string, attachments: string) =>
    sql`insert into messages (id, workspace_id, space_id, run_id, seq, type, author_kind, author_id, text, reply_to, attachments, approval_id, ask_id, created_at)
      values (${id}, 'ws_1', 'spc_1', null, 1, 'text', 'person', 'usr_1', ${text}, null, ${attachments}, null, null, '2026-09-13T00:00:00.000Z')`.execute(
      db,
    );

  it("adds what was heard beside what was typed, keeps what was indexed, queues the voice notes, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-13T00:00:00.000Z");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "T", created_at: "2026-09-13T00:00:00.000Z" })
      .execute();
    await insertMessage("evt_typed", "Typed before the column", "[]");
    await insertMessage(
      "evt_voice",
      "",
      JSON.stringify([
        { attachment_id: "att_1", filename: "voice-note.m4a", transcript: "Heard." },
      ]),
    );
    // Indexed as 0020's drain indexed them, with typed words alone.
    await sql`insert into messages_fts_map (message_id) select id from messages order by id`.execute(
      db,
    );
    await sql`insert into messages_fts (rowid, text, message_id, workspace_id, space_id, created_at, author_id)
      select m.fts_rowid, s.text, s.id, s.workspace_id, s.space_id, s.created_at, s.author_id
      from messages s join messages_fts_map m on m.message_id = s.id`.execute(db);
    await sql`delete from search_queue`.execute(db);
    const before = await sql<{ fts_rowid: number; message_id: string }>`
      select fts_rowid, message_id from messages_fts_map order by message_id`.execute(db);

    await migrateToLatest(db, () => "2026-09-13T00:00:00.000Z");
    expect(await ftsColumns()).toEqual(
      expect.arrayContaining(["text", "heard", "message_id", "author_id"]),
    );
    // Indexed rows keep their rowids, so the map still names them; only the voice note is queued.
    const kept = await sql<{ fts_rowid: number; message_id: string; text: string }>`
      select m.fts_rowid, m.message_id, f.text from messages_fts_map m
      join messages_fts f on f.rowid = m.fts_rowid order by m.message_id`.execute(db);
    expect(kept.rows.map(({ fts_rowid, message_id }) => ({ fts_rowid, message_id }))).toEqual(
      before.rows,
    );
    const queued = await sql<{ key1: string }>`select key1 from search_queue`.execute(db);
    expect(queued.rows).toEqual([{ key1: "evt_voice" }]);
    const triggers = await sql<{ name: string }>`
      select name from sqlite_master where type = 'trigger' and name like 'messages_fts_%'`.execute(
      db,
    );
    expect(triggers.rows).toHaveLength(3);

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await ftsColumns()).not.toContain("heard");
    const found = await sql<{ message_id: string }>`
      select message_id from messages_fts where messages_fts match 'typed'`.execute(db);
    expect(found.rows).toEqual([{ message_id: "evt_typed" }]);
  });
});

describe("voice transcripts (0020)", () => {
  async function uploadColumns(): Promise<string[]> {
    const result = await sql<{ name: string }>`pragma table_info(uploads)`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds what was said in a voice note, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-13T00:00:00.000Z");
    expect(await uploadColumns()).toContain("transcript");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await migrateDown(db)).toBe("0021-voice-notes-are-searchable");
    expect(await migrateDown(db)).toBe("0020-voice-transcripts");
    expect(await uploadColumns()).not.toContain("transcript");
    expect(await uploadColumns()).toContain("playable_state");
  });
});

describe("view copies (0022)", () => {
  async function uploadColumns(): Promise<string[]> {
    const result = await sql<{ name: string }>`pragma table_info(uploads)`.execute(db);
    return result.rows.map((row) => row.name);
  }

  it("adds a photo's copy for a viewer, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-15T00:00:00.000Z");
    expect(await uploadColumns()).toEqual(
      expect.arrayContaining(["view_sha256", "view_mime_type"]),
    );
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await migrateDown(db)).toBe("0022-view-copies");
    expect(await uploadColumns()).not.toContain("view_sha256");
    expect(await uploadColumns()).not.toContain("view_mime_type");
    expect(await uploadColumns()).toContain("transcript");
  });
});

describe("the Activity card, withdrawn (0024)", () => {
  it("takes the table 0023 made away again, and puts it back on the way down", async () => {
    await migrateToLatest(db, () => "2026-09-18T00:00:00.000Z");
    expect(await tableNames()).not.toContain("activities");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    expect(await migrateDown(db)).toBe("0025-space-icons");
    expect(await migrateDown(db)).toBe("0024-activities-withdrawn");
    expect(await tableNames()).toContain("activities");
    expect(await migrateDown(db)).toBe("0023-activities");
    expect(await tableNames()).not.toContain("activities");
  });
});

describe("a space knows who archived it (0026)", () => {
  it("fills in who last moved each room from the log, and takes the column away again", async () => {
    await migrateToLatest(db, () => "2026-09-22T00:00:00.000Z");
    await downPast("0026-state-by");
    await db
      .insertInto("workspaces")
      .values({ id: "ws_1", name: "Solo", created_at: "2026-09-02T00:00:00.000Z" })
      .execute();
    for (const [id, state] of [
      ["spc_jacobian", "closed"],
      ["spc_arjun", "open"],
      ["spc_never", "open"],
    ] as const) {
      await sql`insert into spaces (id, workspace_id, kind, title, state, created_at)
        values (${id}, 'ws_1', 'direct', ${id}, ${state}, '2026-09-02T00:00:00.000Z')`.execute(db);
    }
    // Jacobian closed its room; Arjun's was closed by Jacobian and then reopened by him; and a
    // retitle, which moves nothing, is not a move.
    const events = [
      ["spc_jacobian", "harness", '{"state":"closed"}'],
      ["spc_arjun", "harness", '{"state":"closed"}'],
      ["spc_arjun", "person", '{"state":"open"}'],
      ["spc_arjun", "harness", '{"title":"Chess Game"}'],
      ["spc_never", "person", '{"title":"Trip"}'],
    ] as const;
    let seq = 0;
    for (const [space, kind, payload] of events) {
      seq += 1;
      await sql`insert into events (workspace_id, seq, id, type, ts, space_id, actor_kind, actor_id, payload, appended_at)
        values ('ws_1', ${seq}, ${`evt_${seq}`}, 'space.updated', '2026-09-02T00:00:00.000Z', ${space}, ${kind}, 'someone', ${payload}, '2026-09-02T00:00:00.000Z')`.execute(
        db,
      );
    }

    await migrateToLatest(db, () => "2026-09-22T00:00:00.000Z");
    const rows = await sql<{ id: string; state_by: string | null }>`
      select id, state_by from spaces order by id`.execute(db);
    expect(rows.rows).toEqual([
      { id: "spc_arjun", state_by: "person" },
      { id: "spc_jacobian", state_by: "harness" },
      { id: "spc_never", state_by: null },
    ]);

    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");

    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");

    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");

    expect(await migrateDown(db)).toBe("0039-context-files");

    expect(await migrateDown(db)).toBe("0038-join-requests");

    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");

    expect(await migrateDown(db)).toBe("0036-room-lead");

    expect(await migrateDown(db)).toBe("0035-agent-name-by");

    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");

    expect(await migrateDown(db)).toBe("0032-agents");

    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");

    expect(await migrateDown(db)).toBe("0029-harness-removed");

    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await migrateDown(db)).toBe("0026-state-by");
    const columns = await sql<{ name: string }>`
      select name from pragma_table_info('spaces')`.execute(db);
    expect(columns.rows.map((row) => row.name)).not.toContain("state_by");
  });
});

describe("a room knows which harness it was asked of (0027)", () => {
  it("adds the column, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-24T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('spaces')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("asked_of");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await migrateDown(db)).toBe("0027-asked-of");
    expect(await columns()).not.toContain("asked_of");
  });
});

describe("a room knows whether it is a harness's home (0028)", () => {
  it("adds the column, every room not a home, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-25T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{
          name: string;
        }>`select name, dflt_value from pragma_table_info('spaces')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("home");
    await sql`insert into spaces (id, workspace_id, kind, created_at) values ('spc_j', 'ws_1', 'direct', '2026-09-25T00:00:00.000Z')`.execute(
      db,
    );
    const row = await sql<{ home: number }>`select home from spaces where id = 'spc_j'`.execute(db);
    expect(row.rows).toEqual([{ home: 0 }]);
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await migrateDown(db)).toBe("0028-home");
    expect(await columns()).not.toContain("home");
  });
});

describe("a harness can be removed (0029)", () => {
  it("adds when it was removed, every harness here, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-27T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('participants')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("removed_at");
    await sql`insert into workspaces (id, name, created_at) values ('ws_1', 'Solo', '2026-09-27T00:00:00.000Z')`.execute(
      db,
    );
    await sql`insert into participants (id, workspace_id, kind, display_name, created_at) values ('hrn_1', 'ws_1', 'harness', 'Scout', '2026-09-27T00:00:00.000Z')`.execute(
      db,
    );
    const row = await sql<{
      removed_at: string | null;
    }>`select removed_at from participants where id = 'hrn_1'`.execute(db);
    expect(row.rows).toEqual([{ removed_at: null }]);
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await migrateDown(db)).toBe("0029-harness-removed");
    expect(await columns()).not.toContain("removed_at");
  });
});

describe("who a message is for (0030)", () => {
  it("adds the two columns, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-27T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('messages')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toEqual(expect.arrayContaining(["addressed_to", "held"]));
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await migrateDown(db)).toBe("0030-message-address");
    expect(await columns()).not.toContain("addressed_to");
    expect(await columns()).not.toContain("held");
  });
});

describe("a message for everyone (0031)", () => {
  it("adds the column, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-09-28T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('messages')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("addressed_to_all");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await migrateDown(db)).toBe("0031-message-for-everyone");
    expect(await columns()).not.toContain("addressed_to_all");
    expect(await columns()).toContain("addressed_to");
  });
});

describe("agents (0032)", () => {
  it("adds an agent's columns, its runs' and the replacements, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-30T00:00:00.000Z");
    const columns = async (table: string) =>
      (
        await sql<{ name: string }>`select name from pragma_table_info(${table})`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns("participants")).toEqual(
      expect.arrayContaining(["harness_id", "agent_key", "lead", "forked_from", "agent_state"]),
    );
    expect(await columns("runs")).toContain("agent_id");
    expect(await columns("replacements")).toEqual([
      "workspace_id",
      "space_id",
      "from_id",
      "to_id",
      "seq",
    ]);
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await migrateDown(db)).toBe("0032-agents");
    expect(await columns("participants")).not.toContain("harness_id");
    expect(await columns("runs")).not.toContain("agent_id");
    expect(await columns("replacements")).toEqual([]);
  });
});

describe("one room per agent (0033)", () => {
  it("adds held messages and an agent's rooms, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-09-30T00:00:00.000Z");
    const columns = async (table: string) =>
      (
        await sql<{ name: string }>`select name from pragma_table_info(${table})`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns("held_messages")).toEqual([
      "event_id",
      "workspace_id",
      "agent_id",
      "seq",
      "said_at",
      "text",
      "attachments",
    ]);
    expect(await columns("participants")).toEqual(
      expect.arrayContaining(["released_from", "last_space_id"]),
    );
    expect(await columns("spaces")).toContain("also_asked_of");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await migrateDown(db)).toBe("0033-one-room");
    expect(await columns("held_messages")).toEqual([]);
    expect(await columns("participants")).not.toContain("released_from");
    expect(await columns("spaces")).not.toContain("also_asked_of");
  });
});

describe("an agent's face (0034)", () => {
  it("adds the column to participants, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-01T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('participants')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("face");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await migrateDown(db)).toBe("0034-agent-face");
    expect(await columns()).not.toContain("face");
  });
});

describe("who named an agent (0035)", () => {
  it("adds the column to participants, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-02T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('participants')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("name_by");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await migrateDown(db)).toBe("0036-room-lead");
    expect(await migrateDown(db)).toBe("0035-agent-name-by");
    expect(await columns()).not.toContain("name_by");
  });
});

describe("what a room allows a job (0037)", () => {
  it("adds the column to spaces, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-04T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('spaces')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("spend_ceiling_usd");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await migrateDown(db)).toBe("0037-room-spend-ceiling");
    expect(await columns()).not.toContain("spend_ceiling_usd");
  });
});

describe("join requests (0038)", () => {
  it("adds the table, finds a link by its digest once, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-05T00:00:00.000Z");
    const tables = async () =>
      (
        await sql<{ name: string }>`select name from sqlite_master where type = 'table'`.execute(db)
      ).rows.map((row) => row.name);
    expect(await tables()).toContain("join_requests");
    await sql`insert into workspaces (id, name, created_at) values ('ws_1', '', '2026-10-05')`.execute(
      db,
    );
    const row = (id: string) => sql`
      insert into join_requests (id, workspace_id, kind, secret_hash, state, started_by, url, created_at, expires_at)
      values (${id}, 'ws_1', 'harness', 'digest', 'waiting', 'requester', 'http://127.0.0.1:4431', '2026-10-05', '2026-10-05')`;
    await row("jrq_1").execute(db);
    await expect(row("jrq_2").execute(db)).rejects.toThrow(/UNIQUE/);
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await migrateDown(db)).toBe("0038-join-requests");
    expect(await tables()).not.toContain("join_requests");
  });
});

describe("context files (0039)", () => {
  it("adds a set per owner and the edits, keeps one set per owner, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-10-07T00:00:00.000Z");
    const tables = async () =>
      (
        await sql<{ name: string }>`select name from sqlite_master where type = 'table'`.execute(db)
      ).rows.map((row) => row.name);
    expect(await tables()).toEqual(expect.arrayContaining(["context_sets", "context_edits"]));
    await sql`insert into workspaces (id, name, created_at) values ('ws_1', '', '2026-10-07')`.execute(
      db,
    );
    const set = sql`
      insert into context_sets (workspace_id, owner_kind, owner_id, harness_id, read_at)
      values ('ws_1', 'agent', 'agt_1', 'hrn_1', '2026-10-07')`;
    await set.execute(db);
    await expect(set.execute(db)).rejects.toThrow(/UNIQUE|PRIMARY/);
    await sql`
      insert into context_edits (id, workspace_id, owner_kind, owner_id, harness_id, name, text, asked_by, asked_at, state)
      values ('edt_1', 'ws_1', 'agent', 'agt_1', 'hrn_1', 'PERSONA.md', 'words', 'usr_1', '2026-10-07', 'waiting')`.execute(
      db,
    );
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await migrateDown(db)).toBe("0039-context-files");
    expect(await tables()).not.toContain("context_sets");
    expect(await tables()).not.toContain("context_edits");
  });
});

describe("a face of letters (0040)", () => {
  it("adds the column to space_icons, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-07T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('space_icons')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("letters");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await migrateDown(db)).toBe("0044-membership-agent-name");
    expect(await migrateDown(db)).toBe("0043-agent-context-windows");
    expect(await migrateDown(db)).toBe("0042-agent-heartbeats");
    expect(await migrateDown(db)).toBe("0041-agent-models");
    expect(await migrateDown(db)).toBe("0040-face-letters");
    expect(await columns()).not.toContain("letters");
  });
});

describe("a room's changes can be locked (0045)", () => {
  it("adds the column, every room unlocked, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-13T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('spaces')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("locked");
    await sql`insert into spaces (id, workspace_id, kind, created_at) values ('spc_1', 'ws_1', 'group', '2026-10-13T00:00:00.000Z')`.execute(
      db,
    );
    const row = await sql<{
      locked: number;
    }>`select locked from spaces where id = 'spc_1'`.execute(db);
    expect(row.rows).toEqual([{ locked: 0 }]);
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await migrateDown(db)).toBe("0048-agent-lock");
    expect(await migrateDown(db)).toBe("0047-invite-space");
    expect(await migrateDown(db)).toBe("0046-push-seal-key");
    expect(await migrateDown(db)).toBe("0045-room-lock");
    expect(await columns()).not.toContain("locked");
  });
});

describe("the rooms a person hid (0049)", () => {
  it("adds the table, one row per person per room, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-19T00:00:00.000Z");
    expect(await tableNames()).toContain("hidden_spaces");
    await sql`insert into workspaces (id, name, created_at) values ('ws_1', 'Primal', '2026-10-19T00:00:00.000Z')`.execute(
      db,
    );
    const hide = sql`insert into hidden_spaces (workspace_id, participant_id, space_id, hidden_at) values ('ws_1', 'usr_1', 'spc_1', '2026-10-19T00:00:00.000Z')`;
    await hide.execute(db);
    // The same room hidden twice by one person is one row.
    await expect(hide.execute(db)).rejects.toThrow();
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await migrateDown(db)).toBe("0049-hidden-spaces");
    expect(await tableNames()).not.toContain("hidden_spaces");
  });
});

describe("whom a device that asked is paired as (0050)", () => {
  it("adds the column, empty for every request before it, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-20T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('join_requests')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("pair_as");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await migrateDown(db)).toBe("0055-context-read-note");
    expect(await migrateDown(db)).toBe("0054-reconnect");
    expect(await migrateDown(db)).toBe("0053-links-ask");
    expect(await migrateDown(db)).toBe("0052-relay-switch");
    expect(await migrateDown(db)).toBe("0051-direct-asks");
    expect(await migrateDown(db)).toBe("0050-join-pair-as");
    expect(await columns()).not.toContain("pair_as");
  });
});

describe("how each part of a command starts, for This session (0056)", () => {
  it("adds the column, empty for every rule before it, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-27T00:00:00.000Z");
    const columns = async () =>
      (
        await sql<{ name: string }>`select name from pragma_table_info('session_rules')`.execute(db)
      ).rows.map((row) => row.name);
    expect(await columns()).toContain("starts_with");
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
    expect(await columns()).not.toContain("starts_with");
  });
});

describe("the rooms a person pinned (0057)", () => {
  it("adds the table, one row per person per room, read by person, and takes it away again", async () => {
    await migrateToLatest(db, () => "2026-10-27T00:00:00.000Z");
    expect(await tableNames()).toContain("pinned_spaces");
    expect(await indexNames()).toContain("pinned_spaces_workspace_id_participant_id");
    await sql`insert into workspaces (id, name, created_at) values ('ws_1', 'Primal', '2026-10-27T00:00:00.000Z')`.execute(
      db,
    );
    const pin = sql`insert into pinned_spaces (workspace_id, participant_id, space_id, pinned_at) values ('ws_1', 'usr_1', 'spc_1', '2026-10-27T00:00:00.000Z')`;
    await pin.execute(db);
    // The same room pinned twice by one person is one row.
    await expect(pin.execute(db)).rejects.toThrow();
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
    expect(await tableNames()).not.toContain("pinned_spaces");
    expect(await migrateDown(db)).toBe("0056-session-rule-starts");
  });
});

describe("a harness's own jobs and their runs (0058)", () => {
  it("adds the two tables, one row per job and per run, and takes them away again", async () => {
    await migrateToLatest(db, () => "2026-10-31T00:00:00.000Z");
    expect(await tableNames()).toContain("harness_jobs");
    expect(await tableNames()).toContain("harness_job_runs");
    expect(await indexNames()).toContain("harness_job_runs_job_started_at");
    await sql`insert into workspaces (id, name, created_at) values ('ws_1', 'Primal', '2026-10-31T00:00:00.000Z')`.execute(
      db,
    );
    const job = sql`insert into harness_jobs (workspace_id, harness_id, job_id, position, said, read_at) values ('ws_1', 'hrn_1', 'dreaming', 0, '{}', '2026-10-31T00:00:00.000Z')`;
    await job.execute(db);
    await expect(job.execute(db)).rejects.toThrow();
    const run = sql`insert into harness_job_runs (workspace_id, harness_id, job_id, run_id, started_at, cost_usd, said) values ('ws_1', 'hrn_1', 'dreaming', 'r1', '2026-10-31T10:00:00.000Z', 0.1, '{}')`;
    await run.execute(db);
    await expect(run.execute(db)).rejects.toThrow();
    expect(await migrateDown(db)).toBe("0058-harness-jobs");
    expect(await tableNames()).not.toContain("harness_jobs");
    expect(await tableNames()).not.toContain("harness_job_runs");
    expect(await migrateDown(db)).toBe("0057-pinned-spaces");
  });
});
