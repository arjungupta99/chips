/**
 * A chipsd to test the SDK against: in-process, on a real port, with a workspace, a person,
 * a harness with a token, and a space they share. Built from the server's public
 * exports only, the way a harness author's own test would be.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import {
  buildGateway,
  type Gateway,
  migrateToLatest,
  mintHarnessToken,
  openDatabase,
  type Principal,
} from "@chipschat/server";

export interface TestServer {
  readonly url: string;
  readonly gateway: Gateway;
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly personId: string;
  readonly person: Principal;
  readonly harnessId: string;
  readonly token: string;
  readonly close: () => Promise<void>;
}

export async function startTestServer(
  options: {
    autonomy?: 0 | 1 | 2 | 3;
    /** What the harness declares (ADR 0046): `new_spaces`, for one a person may ask for rooms. */
    capabilities?: readonly string[];
  } = {},
): Promise<TestServer> {
  const directory = mkdtempSync(join(tmpdir(), "chips-sdk-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(connection.db, () => "2026-09-03T00:00:00.000Z");
  const base = defaultConfig();
  const config = {
    ...base,
    server: { ...base.server, port: 0 },
    log: { ...base.log, level: "silent" as const },
  };
  const ids = createIdGenerator();
  const at = "2026-09-03T09:00:00.000Z";
  const workspaceId = ids.next("workspace");
  const personId = ids.next("person");
  const harnessId = ids.next("harness");
  const db = connection.db;

  await db
    .insertInto("workspaces")
    .values({ id: workspaceId, name: "Test", created_at: at })
    .execute();
  const declared = options.capabilities === undefined ? null : JSON.stringify(options.capabilities);
  for (const [id, kind, name, owner, capabilities] of [
    [personId, "person", "Arjun", null, null],
    [harnessId, "harness", "Scout", personId, declared],
  ] as const) {
    await db
      .insertInto("participants")
      .values({
        id,
        workspace_id: workspaceId,
        kind,
        display_name: name,
        owner_id: owner,
        parent_id: null,
        ephemeral: 0,
        capabilities,
        created_at: at,
      })
      .execute();
  }
  const minted = mintHarnessToken();
  await db
    .insertInto("harness_tokens")
    .values({
      id: ids.next("token"),
      workspace_id: workspaceId,
      harness_id: harnessId,
      token_hash: minted.hash,
      name: "test",
      created_at: at,
      last_used_at: null,
      revoked_at: null,
    })
    .execute();

  const gateway = buildGateway({ config, db, ids, version: "0.0.0-sdk-test" });
  const spaceId = ids.next("space");
  const append = (event: Record<string, unknown>) =>
    gateway.deps.store.append({
      v: 1,
      id: ids.next("event"),
      ts: at,
      workspace_id: workspaceId,
      actor: { kind: "person", id: personId },
      ...event,
    } as unknown as Parameters<typeof gateway.deps.store.append>[0]);
  await append({
    type: "space.created",
    space_id: spaceId,
    idempotency_key: "setup-space",
    kind: "group",
    title: "PO-4471",
  });
  for (const [participant, kind, role] of [
    [personId, "person", "owner"],
    [harnessId, "harness", "member"],
  ] as const) {
    await append({
      type: "membership.added",
      space_id: spaceId,
      idempotency_key: `setup-member-${participant}`,
      participant_id: participant,
      participant_kind: kind,
      role,
    });
  }
  // Arjun owns the workspace, as its first person does: a join link he makes can be taken up.
  await append({
    type: "person.joined",
    idempotency_key: "setup-person",
    participant_id: personId,
    display_name: "Arjun",
    role: "owner",
  });
  await append({
    type: "policy.updated",
    idempotency_key: "setup-policy",
    harness_id: harnessId,
    policy: { autonomy: options.autonomy ?? 2, rules: [] },
    workspace_max_autonomy: 3,
    budget_usd: 25,
    changed_by: personId,
  });

  const listening = await gateway.listen();
  return {
    url: `http://127.0.0.1:${listening.port}`,
    gateway,
    workspaceId,
    spaceId,
    personId,
    person: {
      kind: "person",
      participantId: personId,
      workspaceId,
      displayName: "Arjun",
      role: "owner",
      via: "device_key",
    },
    harnessId,
    token: minted.token,
    close: async () => {
      await gateway.close();
      await connection.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
