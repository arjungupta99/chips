/** The Kysely adapter for the join-request registry (ADR 0122). */

import type { Kysely } from "kysely";
import type {
  JoinChange,
  JoinRegistry,
  JoinRequest,
} from "../../application/ports/join-requests.js";
import type { Database, JoinRequestsTable } from "../db/schema.js";

function names(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((each) => typeof each === "string") : [];
  } catch {
    return [];
  }
}

function toRequest(row: JoinRequestsTable): JoinRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    code: row.code,
    name: row.name,
    software: row.software,
    machine: row.machine,
    fromAddr: row.from_addr,
    wants: names(row.wants),
    publicKey: row.public_key,
    state: row.state,
    capabilities: names(row.allowed_caps),
    startedBy: row.started_by,
    url: row.url,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    harnessId: row.harness_id,
    spaceId: row.space_id,
    deviceId: row.device_id,
    pairAs: row.pair_as,
    askedOf: row.asked_of,
    inviteId: row.invite_id,
    role: row.role,
    replaces: row.replaces,
    checkCommit: row.check_commit,
    checkNonce: row.check_nonce,
  };
}

/** A change as columns: only what it names. */
function columnsOf(change: JoinChange): Partial<JoinRequestsTable> {
  return { ...decisionColumns(change), ...requesterColumns(change) };
}

/** What a person's decision changes, and a device's code once it has one (ADR 0278). */
function decisionColumns(change: JoinChange): Partial<JoinRequestsTable> {
  const columns: Partial<JoinRequestsTable> = {};
  if (change.state !== undefined) columns.state = change.state;
  if (change.capabilities !== undefined) columns.allowed_caps = JSON.stringify(change.capabilities);
  if (change.decidedBy !== undefined) columns.decided_by = change.decidedBy;
  if (change.decidedAt !== undefined) columns.decided_at = change.decidedAt;
  if (change.pairAs !== undefined) columns.pair_as = change.pairAs;
  if (change.code !== undefined) columns.code = change.code;
  return columns;
}

/** What a link taken up says of who took it, and what redeeming made. */
function requesterColumns(change: JoinChange): Partial<JoinRequestsTable> {
  const columns: Partial<JoinRequestsTable> = {};
  if (change.name !== undefined) columns.name = change.name;
  if (change.software !== undefined) columns.software = change.software;
  if (change.machine !== undefined) columns.machine = change.machine;
  if (change.fromAddr !== undefined) columns.from_addr = change.fromAddr;
  if (change.harnessId !== undefined) columns.harness_id = change.harnessId;
  if (change.spaceId !== undefined) columns.space_id = change.spaceId;
  if (change.deviceId !== undefined) columns.device_id = change.deviceId;
  return columns;
}

export function createJoinRegistry(db: Kysely<Database>): JoinRegistry {
  return {
    async add(request) {
      await db
        .insertInto("join_requests")
        .values({
          id: request.id,
          workspace_id: request.workspaceId,
          kind: request.kind,
          secret_hash: request.secretHash,
          code: request.code,
          name: request.name,
          software: request.software,
          machine: request.machine,
          from_addr: request.fromAddr,
          wants: JSON.stringify(request.wants),
          public_key: request.publicKey,
          state: request.state,
          allowed_caps: JSON.stringify(request.capabilities),
          started_by: request.startedBy,
          url: request.url,
          decided_by: request.decidedBy,
          decided_at: request.decidedAt,
          created_at: request.createdAt,
          expires_at: request.expiresAt,
          harness_id: null,
          // An invite's room is known when it is asked (ADR 0232); a harness's when it is made.
          space_id: request.spaceId,
          device_id: null,
          pair_as: request.pairAs,
          asked_of: request.askedOf,
          invite_id: request.inviteId,
          role: request.role,
          replaces: request.replaces,
          check_commit: request.checkCommit,
          check_nonce: request.checkNonce,
        })
        .execute();
    },

    async byId(id) {
      const row = await db
        .selectFrom("join_requests")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row === undefined ? undefined : toRequest(row);
    },

    async bySecretHash(secretHash) {
      // The unique index on secret_hash is this query's.
      const row = await db
        .selectFrom("join_requests")
        .selectAll()
        .where("secret_hash", "=", secretHash)
        .executeTakeFirst();
      return row === undefined ? undefined : toRequest(row);
    },

    async secretHashOf(id) {
      const row = await db
        .selectFrom("join_requests")
        .select("secret_hash")
        .where("id", "=", id)
        .executeTakeFirst();
      return row?.secret_hash;
    },

    async inStates(workspaceId, states) {
      if (states.length === 0) return [];
      const rows = await db
        .selectFrom("join_requests")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("state", "in", [...states])
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .execute();
      return rows.map(toRequest);
    },

    async waitingCount(workspaceId, now, among) {
      const row = await db
        .selectFrom("join_requests")
        .select((eb) => eb.fn.countAll<number>().as("waiting"))
        .where("workspace_id", "=", workspaceId)
        .where("state", "=", "waiting")
        .where("expires_at", ">", now)
        .where("asked_of", among === "links" ? "is not" : "is", null)
        .executeTakeFirst();
      return Number(row?.waiting ?? 0);
    },

    async change({ id, from, now, change }) {
      // One statement: the state and the expiry in the predicate are what decide between two
      // people deciding at once, or a decision and a redeem racing.
      const result = await db
        .updateTable("join_requests")
        .set(columnsOf(change))
        .where("id", "=", id)
        .where("state", "=", from)
        .where("expires_at", ">", now)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async made(id, change) {
      await db.updateTable("join_requests").set(columnsOf(change)).where("id", "=", id).execute();
    },

    async expire(now) {
      const rows = await db
        .selectFrom("join_requests")
        .selectAll()
        .where("state", "in", ["waiting", "allowed"])
        .where("expires_at", "<=", now)
        .execute();
      if (rows.length === 0) return [];
      await db
        .updateTable("join_requests")
        .set({ state: "expired" })
        .where(
          "id",
          "in",
          rows.map((row) => row.id),
        )
        .where("state", "in", ["waiting", "allowed"])
        .execute();
      return rows.map((row) => ({ ...toRequest(row), state: "expired" as const }));
    },
  };
}
