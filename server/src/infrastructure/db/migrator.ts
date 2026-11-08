/**
 * The migration runner behind `chipsd migrate`.
 *
 * Migrations are a hand-kept list rather than a directory scan, so the order is in the source
 * and cannot depend on how a filesystem sorts. Each one runs in its own transaction and
 * records its name, so running `migrate` twice is a no-op.
 */

import type { Kysely } from "kysely";
import * as initial from "./migrations/0001-initial.js";
import * as priceTable from "./migrations/0002-workspace-price-table.js";
import * as policyProjection from "./migrations/0003-policy-is-a-projection.js";
import * as uploads from "./migrations/0004-uploads.js";
import * as sessions from "./migrations/0005-sessions.js";
import * as idempotencyKeys from "./migrations/0006-idempotency-keys-are-the-senders.js";
import * as lanes from "./migrations/0007-lanes.js";
import * as groupSpaces from "./migrations/0008-group-spaces.js";
import * as people from "./migrations/0009-people.js";
import * as messagingDepth from "./migrations/0010-messaging-depth.js";
import * as notifications from "./migrations/0011-notifications.js";
import * as searchOffThePath from "./migrations/0012-search-off-the-request-path.js";
import * as serverKeys from "./migrations/0013-server-keys.js";
import * as sessionPins from "./migrations/0014-session-pins.js";
import * as sessionTitles from "./migrations/0015-session-titles.js";
import * as pushTokens from "./migrations/0016-push-tokens.js";
import * as attachmentLimits from "./migrations/0017-attachment-limits.js";
import * as uploadPieces from "./migrations/0018-upload-pieces.js";
import * as playableVideos from "./migrations/0019-playable-videos.js";
import * as voiceTranscripts from "./migrations/0020-voice-transcripts.js";
import * as voiceSearch from "./migrations/0021-voice-notes-are-searchable.js";
import * as viewCopies from "./migrations/0022-view-copies.js";
import * as activities from "./migrations/0023-activities.js";
import * as activitiesWithdrawn from "./migrations/0024-activities-withdrawn.js";
import * as spaceIcons from "./migrations/0025-space-icons.js";
import * as stateBy from "./migrations/0026-state-by.js";
import * as askedOf from "./migrations/0027-asked-of.js";
import * as home from "./migrations/0028-home.js";
import * as harnessRemoved from "./migrations/0029-harness-removed.js";
import * as messageAddress from "./migrations/0030-message-address.js";
import * as messageForEveryone from "./migrations/0031-message-for-everyone.js";
import * as agents from "./migrations/0032-agents.js";
import * as oneRoom from "./migrations/0033-one-room.js";
import * as agentFace from "./migrations/0034-agent-face.js";
import * as agentNameBy from "./migrations/0035-agent-name-by.js";
import * as roomLead from "./migrations/0036-room-lead.js";
import * as roomSpendCeiling from "./migrations/0037-room-spend-ceiling.js";
import * as joinRequests from "./migrations/0038-join-requests.js";
import * as contextFiles from "./migrations/0039-context-files.js";
import * as faceLetters from "./migrations/0040-face-letters.js";
import * as agentModels from "./migrations/0041-agent-models.js";
import * as agentHeartbeats from "./migrations/0042-agent-heartbeats.js";
import * as agentContextWindows from "./migrations/0043-agent-context-windows.js";
import * as membershipAgentName from "./migrations/0044-membership-agent-name.js";
import * as roomLock from "./migrations/0045-room-lock.js";
import * as pushSealKey from "./migrations/0046-push-seal-key.js";
import * as inviteSpace from "./migrations/0047-invite-space.js";
import * as agentLock from "./migrations/0048-agent-lock.js";
import * as hiddenSpaces from "./migrations/0049-hidden-spaces.js";
import * as joinPairAs from "./migrations/0050-join-pair-as.js";
import * as directAsks from "./migrations/0051-direct-asks.js";
import * as relaySwitch from "./migrations/0052-relay-switch.js";
import * as linksAsk from "./migrations/0053-links-ask.js";
import * as reconnect from "./migrations/0054-reconnect.js";
import * as contextReadNote from "./migrations/0055-context-read-note.js";
import * as sessionRuleStarts from "./migrations/0056-session-rule-starts.js";
import * as pinnedSpaces from "./migrations/0057-pinned-spaces.js";
import * as harnessJobs from "./migrations/0058-harness-jobs.js";
import * as joinCheck from "./migrations/0059-join-check.js";
import * as rulesForAWhile from "./migrations/0060-rules-for-a-while.js";
import type { Database } from "./schema.js";

/** A migration is written against the schema of its own moment, not today's `Database`. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type AnyDb = Kysely<any>;

export interface Migration {
  readonly name: string;
  readonly up: (db: AnyDb) => Promise<void>;
  readonly down: (db: AnyDb) => Promise<void>;
}

/** In order. Adding one appends to the end; nothing is ever renumbered. */
export const MIGRATIONS: readonly Migration[] = [
  initial,
  priceTable,
  policyProjection,
  uploads,
  sessions,
  idempotencyKeys,
  lanes,
  groupSpaces,
  people,
  messagingDepth,
  notifications,
  searchOffThePath,
  serverKeys,
  sessionPins,
  sessionTitles,
  pushTokens,
  attachmentLimits,
  uploadPieces,
  playableVideos,
  voiceTranscripts,
  voiceSearch,
  viewCopies,
  activities,
  activitiesWithdrawn,
  spaceIcons,
  stateBy,
  askedOf,
  home,
  harnessRemoved,
  messageAddress,
  messageForEveryone,
  agents,
  oneRoom,
  agentFace,
  agentNameBy,
  roomLead,
  roomSpendCeiling,
  joinRequests,
  contextFiles,
  faceLetters,
  agentModels,
  agentHeartbeats,
  agentContextWindows,
  membershipAgentName,
  roomLock,
  pushSealKey,
  inviteSpace,
  agentLock,
  hiddenSpaces,
  joinPairAs,
  directAsks,
  relaySwitch,
  linksAsk,
  reconnect,
  contextReadNote,
  sessionRuleStarts,
  pinnedSpaces,
  harnessJobs,
  joinCheck,
  rulesForAWhile,
];

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

async function ensureLedger(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("_chips_migrations")
    .ifNotExists()
    .addColumn("name", "text", (c) => c.primaryKey())
    .addColumn("applied_at", "text", (c) => c.notNull())
    .execute();
}

async function appliedNames(db: Kysely<Database>): Promise<Set<string>> {
  const rows = await db.selectFrom("_chips_migrations").select("name").execute();
  return new Set(rows.map((row) => row.name));
}

/** Bring the database up to date. Returns what it did, so `chipsd migrate` can say so. */
export async function migrateToLatest(
  db: Kysely<Database>,
  now: () => string = () => new Date().toISOString(),
): Promise<MigrationResult> {
  await ensureLedger(db);
  const already = await appliedNames(db);
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (already.has(migration.name)) continue;
    await db.transaction().execute(async (trx) => {
      await migration.up(trx);
      await trx
        .insertInto("_chips_migrations")
        .values({ name: migration.name, applied_at: now() })
        .execute();
    });
    applied.push(migration.name);
  }

  return { applied, alreadyApplied: [...already] };
}

/** Undo the most recent migration. Used by the up-and-down migration test. */
export async function migrateDown(db: Kysely<Database>): Promise<string | undefined> {
  await ensureLedger(db);
  const already = await appliedNames(db);

  for (const migration of [...MIGRATIONS].reverse()) {
    if (!already.has(migration.name)) continue;
    await db.transaction().execute(async (trx) => {
      await migration.down(trx);
      await trx.deleteFrom("_chips_migrations").where("name", "=", migration.name).execute();
    });
    return migration.name;
  }
  return undefined;
}
