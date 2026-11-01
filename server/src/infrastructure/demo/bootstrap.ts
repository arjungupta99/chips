/**
 * The demo workspace `pnpm dev` starts from.
 *
 * Phase 0 has no `chips pair` and no invite flow, and the demo in the plan has to work on a
 * clean machine: start the server, open the page, run the scripted harness, approve. So in dev
 * mode — and only in dev mode — the server makes sure there is a workspace with one person, one
 * harness and one space, and writes what a client needs to join it to a file beside the
 * database. The harness is a record and a token: since the sample harness was withdrawn
 * (ADR 0188) nothing in this repository runs behind it, and the browser tests play it over its
 * socket.
 *
 * The file holds a harness token and a pairing code. Both are capabilities, which is why this
 * runs only when `CHIPS_DEV_MODE` is set, why the file is written with owner-only permissions,
 * and why the pairing code lives in memory with a fifteen minute expiry rather than in a table.
 */

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FIRST_PERSON_NAME, HARNESS_CAPABILITIES } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type { JoinWorkspace, PairingCodes } from "../../application/index.js";
import type { EventStore } from "../../application/ports/index.js";
import { mintHarnessToken } from "../auth/credentials.js";
import { sqlitePathFrom } from "../db/connection.js";
import type { Database } from "../db/schema.js";

export interface DemoWorkspace {
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly person: { id: string; displayName: string };
  readonly harness: { id: string; displayName: string; token: string };
  readonly pairingCode: string;
  /** Where the details were written, so the CLI can say. */
  readonly path: string;
}

export interface BootstrapOptions {
  readonly db: Kysely<Database>;
  readonly store: EventStore;
  readonly codes: PairingCodes;
  /** How the demo person enters the workspace: as anyone does, with a role in the log (ADR 0034). */
  readonly join: JoinWorkspace;
  readonly newId: (
    kind: "workspace" | "person" | "harness" | "space" | "token" | "event",
  ) => string;
  readonly now: () => string;
  readonly databaseUrl: string;
  /** Where clients should connect. Written into the file so nothing has to be guessed. */
  readonly serverUrl: string;
}

/**
 * Idempotent: run it on every start. If the demo workspace is already there it is reused, and
 * only the pairing code — which lives in memory and does not survive a restart — is fresh.
 */
export async function bootstrapDemoWorkspace(options: BootstrapOptions): Promise<DemoWorkspace> {
  const { db, store, now, newId } = options;
  const at = now();

  const existing = await db
    .selectFrom("workspaces")
    .selectAll()
    .orderBy("id", "asc")
    .limit(1)
    .executeTakeFirst();
  const workspaceId = existing?.id ?? newId("workspace");
  if (existing === undefined) {
    await db
      .insertInto("workspaces")
      .values({ id: workspaceId, name: "Demo", created_at: at })
      .execute();
  }

  const person = await ensurePerson(db, options.join, workspaceId, FIRST_PERSON_NAME);

  const harness = await ensureParticipant(db, {
    workspaceId,
    kind: "harness",
    displayName: "Scout",
    at,
    ownerId: person.id,
    newId: () => newId("harness"),
  });
  await ensurePolicy({
    db,
    store,
    workspaceId,
    harnessId: harness.id,
    personId: person.id,
    at,
    newId,
  });

  // A fresh token every start. The old one is revoked rather than left lying about, because a
  // demo token that keeps working after you stopped demoing is a credential nobody is watching.
  await db
    .updateTable("harness_tokens")
    .set({ revoked_at: at })
    .where("workspace_id", "=", workspaceId)
    .where("harness_id", "=", harness.id)
    .where("revoked_at", "is", null)
    .execute();

  const minted = mintHarnessToken();
  await db
    .insertInto("harness_tokens")
    .values({
      id: newId("token"),
      workspace_id: workspaceId,
      harness_id: harness.id,
      token_hash: minted.hash,
      name: "dev",
      created_at: at,
      last_used_at: null,
      revoked_at: null,
    })
    .execute();

  const spaceId = await ensureSpace({
    db,
    store,
    workspaceId,
    at,
    newId,
    members: [
      { id: person.id, kind: "person" as const, role: "owner" as const },
      { id: harness.id, kind: "harness" as const, role: "member" as const },
    ],
  });

  const pairing = options.codes.issue({ workspaceId, participantId: person.id });

  const details: DemoWorkspace = {
    workspaceId,
    spaceId,
    person: { id: person.id, displayName: person.displayName },
    harness: { id: harness.id, displayName: harness.displayName, token: minted.token },
    pairingCode: pairing.code,
    path: demoFilePath(options.databaseUrl),
  };

  writeDemoFile(details, options.serverUrl);
  return details;
}

/** `.chips/chips.db` -> `.chips/demo.json`. Beside the database, because it describes it. */
export function demoFilePath(databaseUrl: string): string {
  const path = sqlitePathFrom(databaseUrl);
  return path === ":memory:" ? "./.chips/demo.json" : join(dirname(path), "demo.json");
}

function writeDemoFile(details: DemoWorkspace, serverUrl: string): void {
  mkdirSync(dirname(details.path), { recursive: true });
  writeFileSync(
    details.path,
    `${JSON.stringify(
      {
        note: "Written by chipsd in dev mode. Holds a harness token and a pairing code; do not commit it.",
        url: serverUrl,
        workspace_id: details.workspaceId,
        space_id: details.spaceId,
        person: details.person,
        harness: details.harness,
        pairing_code: details.pairingCode,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  chmodSync(details.path, 0o600);
}

/** The demo person, found by name or joined as the workspace's owner (ADR 0034). */
async function ensurePerson(
  db: Kysely<Database>,
  join: JoinWorkspace,
  workspaceId: string,
  displayName: string,
): Promise<{ id: string; displayName: string }> {
  const found = await db
    .selectFrom("participants")
    .select(["id", "display_name"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "person")
    .where("display_name", "=", displayName)
    .executeTakeFirst();
  if (found !== undefined) return { id: found.id, displayName: found.display_name };
  const joined = await join({ workspaceId, displayName });
  if (!joined.ok) throw new Error(joined.error.message);
  return { id: joined.value.participantId, displayName: joined.value.displayName };
}

async function ensureParticipant(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    kind: "person" | "harness";
    displayName: string;
    at: string;
    ownerId?: string;
    newId: () => string;
  },
): Promise<{ id: string; displayName: string }> {
  const found = await db
    .selectFrom("participants")
    .select(["id", "display_name"])
    .where("workspace_id", "=", input.workspaceId)
    .where("kind", "=", input.kind)
    .where("display_name", "=", input.displayName)
    .executeTakeFirst();
  if (found !== undefined) {
    // The demo's manifest is the demo's to keep current: a Scout registered before ADR 0046
    // declared its tools and not that it takes the dial, and would have lost it.
    if (input.kind === "harness") {
      await db
        .updateTable("participants")
        .set({ capabilities: JSON.stringify(DEMO_HARNESS_CAPABILITIES) })
        .where("id", "=", found.id)
        .execute();
    }
    return { id: found.id, displayName: found.display_name };
  }

  const id = input.newId();
  await db
    .insertInto("participants")
    .values({
      id,
      workspace_id: input.workspaceId,
      kind: input.kind,
      display_name: input.displayName,
      owner_id: input.ownerId ?? null,
      parent_id: null,
      ephemeral: 0,
      capabilities: input.kind === "harness" ? JSON.stringify(DEMO_HARNESS_CAPABILITIES) : null,
      created_at: input.at,
    })
    .execute();
  return { id, displayName: input.displayName };
}

/**
 * What the demo's Scout declares: three tools; it takes the dial, being a harness on the SDK's
 * terms; and it takes new spaces, claiming a room a person asks it for and answering there — which
 * the tests that play it do.
 */
const DEMO_HARNESS_CAPABILITIES = [
  "drive.read",
  "crm.read",
  "email.send",
  HARNESS_CAPABILITIES.autonomy,
  HARNESS_CAPABILITIES.newSpaces,
] as const;

/**
 * A harness's policy is a projection of `policy.updated` (ADR 0019), so a new harness's first
 * policy is an event: L2, no rules, a $25 budget, the workspace capped at L2. Idempotent by its
 * key, so a restart appends nothing.
 */
async function ensurePolicy(input: {
  db: Kysely<Database>;
  store: EventStore;
  workspaceId: string;
  harnessId: string;
  personId: string;
  at: string;
  newId: BootstrapOptions["newId"];
}): Promise<void> {
  const found = await input.db
    .selectFrom("harness_policy")
    .select("harness_id")
    .where("workspace_id", "=", input.workspaceId)
    .where("harness_id", "=", input.harnessId)
    .executeTakeFirst();
  if (found !== undefined) return;

  await input.store.append({
    v: 1,
    type: "policy.updated",
    id: input.newId("event"),
    ts: input.at,
    workspace_id: input.workspaceId,
    actor: { kind: "person", id: input.personId },
    idempotency_key: `demo-policy-${input.harnessId}`,
    harness_id: input.harnessId,
    policy: { autonomy: 2, rules: [] },
    workspace_max_autonomy: 2,
    budget_usd: 25,
    changed_by: input.personId,
    reason: "A new harness starts at L2 in the demo, with a small budget.",
  } as Parameters<EventStore["append"]>[0]);
}

async function ensureSpace(input: {
  db: Kysely<Database>;
  store: EventStore;
  workspaceId: string;
  at: string;
  newId: BootstrapOptions["newId"];
  members: readonly { id: string; kind: "person" | "harness"; role: "owner" | "member" }[];
}): Promise<string> {
  // The oldest, by id: space ids are ULIDs, so the first one sorts first. Without an
  // order this took whichever row the query planner reached first, which is not the same
  // question — a restart of a dev server that had grown other spaces could re-point the
  // demo at a room Scout is not in, and `demo.json` would then describe somewhere else.
  const found = await input.db
    .selectFrom("spaces")
    .select("id")
    .where("workspace_id", "=", input.workspaceId)
    .orderBy("id", "asc")
    .limit(1)
    .executeTakeFirst();
  if (found !== undefined) return found.id;

  const spaceId = input.newId("space");
  const owner = input.members[0];
  if (owner === undefined) throw new Error("a space needs at least one member");

  // A space is a read model, so it is opened by an event like anything else (ADR 0018).
  await input.store.append({
    v: 1,
    type: "space.created",
    id: input.newId("event"),
    ts: input.at,
    workspace_id: input.workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: owner.id },
    idempotency_key: `demo-space-${spaceId}`,
    kind: "group",
    title: "PO-4471",
  } as Parameters<EventStore["append"]>[0]);

  for (const member of input.members) {
    await input.store.append({
      v: 1,
      type: "membership.added",
      id: input.newId("event"),
      ts: input.at,
      workspace_id: input.workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: owner.id },
      idempotency_key: `demo-member-${member.id}`,
      participant_id: member.id,
      participant_kind: member.kind,
      role: member.role,
    } as Parameters<EventStore["append"]>[0]);
  }

  return spaceId;
}
