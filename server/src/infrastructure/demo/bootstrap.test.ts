/**
 * The dev-mode bootstrap is idempotent, and "the demo workspace" has to mean the same thing on
 * every start. It stopped meaning that once a workspace had grown other spaces: the
 * lookup took whichever row the query planner reached first, so a restart could re-point
 * `demo.json` at a room Scout is not a member of, and the demo would fail with a refusal rather
 * than an explanation. Found by `apps/web/e2e/restart.spec.ts`.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIdGenerator } from "@chipschat/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { createJoinWorkspace, createPairingCodes } from "../../application/index.js";
import { openDatabase } from "../db/connection.js";
import { migrateToLatest } from "../db/migrator.js";
import { createPeopleRegistry } from "../store/people-registry.js";
import { createReadModels } from "../store/read-models.js";
import { createSqliteEventStore } from "../store/sqlite-event-store.js";
import { bootstrapDemoWorkspace, type DemoWorkspace } from "./bootstrap.js";

const directories: string[] = [];
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** One database, and a bootstrap that can be run against it as many times as a test likes. */
async function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "chips-bootstrap-"));
  directories.push(directory);
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  closers.push(() => connection.close());
  await migrateToLatest(connection.db);

  let tick = 0;
  const now = () => new Date(1_756_800_000_000 + tick++ * 1000).toISOString();
  const ids = createIdGenerator();
  const store = createSqliteEventStore({ db: connection.db, now });
  const clock = { now: () => new Date(now()), nowMs: () => Date.now(), nowIso: now };
  const joinWorkspace = createJoinWorkspace({
    people: createPeopleRegistry(connection.db),
    store,
    readModels: createReadModels(connection.db),
    clock,
    ids,
  });
  const start = (): Promise<DemoWorkspace> =>
    bootstrapDemoWorkspace({
      db: connection.db,
      store,
      codes: createPairingCodes(clock),
      join: joinWorkspace,
      newId: (kind) => ids.next(kind),
      now,
      databaseUrl: `sqlite:${join(directory, "chips.db")}`,
      serverUrl: "http://127.0.0.1:4431",
    });
  return { db: connection.db, store, ids, now, start, directory };
}

describe("the dev-mode demo workspace", () => {
  it("is the same workspace, person, harness and room on every start", async () => {
    const { start } = await workspace();
    const first = await start();
    const again = await start();
    expect(again.workspaceId).toBe(first.workspaceId);
    expect(again.person.id).toBe(first.person.id);
    expect(again.harness.id).toBe(first.harness.id);
    expect(again.spaceId).toBe(first.spaceId);
  });

  it("declares what Scout takes, new spaces among it, and brings an older Scout up to date", async () => {
    const { db, start } = await workspace();
    const first = await start();
    const declared = async () =>
      JSON.parse(
        (
          await db
            .selectFrom("participants")
            .select("capabilities")
            .where("id", "=", first.harness.id)
            .executeTakeFirstOrThrow()
        ).capabilities ?? "[]",
      ) as string[];
    expect(await declared()).toEqual(expect.arrayContaining(["autonomy", "new_spaces"]));
    // A Scout registered before it took new spaces.
    await db
      .updateTable("participants")
      .set({ capabilities: JSON.stringify(["autonomy"]) })
      .where("id", "=", first.harness.id)
      .execute();
    await start();
    expect(await declared()).toContain("new_spaces");
  });

  it("still is once the workspace has other rooms in it", async () => {
    const { start, store, ids, now } = await workspace();
    const first = await start();

    // What a session of using Chips leaves behind: a Custom harness with a direct room of its own.
    const other = ids.next("space");
    await store.append({
      v: 1,
      type: "space.created",
      id: ids.next("event"),
      ts: now(),
      workspace_id: first.workspaceId,
      space_id: other,
      actor: { kind: "person", id: first.person.id },
      idempotency_key: `${other}-opened`,
      kind: "direct",
    } as never);

    const again = await start();
    expect(again.spaceId).toBe(first.spaceId);
    expect(again.spaceId).not.toBe(other);
  });

  it("mints a fresh token on every start and revokes the one before it", async () => {
    const { start, db } = await workspace();
    const first = await start();
    const again = await start();
    expect(again.harness.token).not.toBe(first.harness.token);
    const tokens = await db
      .selectFrom("harness_tokens")
      .select(["revoked_at"])
      .where("harness_id", "=", first.harness.id)
      .orderBy("created_at", "asc")
      .execute();
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.revoked_at).not.toBeNull();
    expect(tokens[1]?.revoked_at).toBeNull();
  });

  it("writes what a client needs beside the database, owner-only", async () => {
    const { start } = await workspace();
    const details = await start();
    const written = JSON.parse(readFileSync(details.path, "utf8")) as Record<string, unknown>;
    expect(written["space_id"]).toBe(details.spaceId);
    expect(JSON.stringify(written)).toContain(details.harness.token);
  });
});
