/**
 * The clock's half of an approval and a question: every approval has an expiry and a fallback,
 * every question a timeout and a no-answer outcome (blueprint), and somebody has to notice when
 * the time has passed. This does, on a timer the gateway runs, and what it notices becomes an
 * event of Chips' own — an `approval.resolved` as `expired`, a `question.answered` as
 * `timed_out` — so the card cools, the harness hears, and the audit says nobody answered.
 *
 * Injected clock and ids, so a test calls `sweep()` with a manual clock rather than waiting.
 */

import type {
  Clock,
  EventStore,
  IdGenerator,
  NotificationRegistry,
  PushRegistry,
  ReadModels,
  SearchIndex,
} from "../ports/index.js";

export interface SweepDeps {
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "approvalsExpiredBy" | "questionsTimedOutBy">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The notification claim ledger (M5.6), pruned here so a week-old banner is nobody's. */
  readonly notifications?: Pick<NotificationRegistry, "prune"> | undefined;
  /** The search index (Gate 5), drained here so its queue never grows long between searches. */
  readonly searchIndex?: SearchIndex | undefined;
  /** Push tokens (M4.3), so a withdrawn phone's row does not sit in the table for ever. */
  readonly push?: Pick<PushRegistry, "pruneRevoked"> | undefined;
  /** Uploads (ADR 0052), so the pieces of one that stopped do not sit on the disk for ever. */
  readonly uploads?: { readonly abandon: (now: string) => Promise<number> } | undefined;
  /** Join requests (ADR 0122), so one past its expiry says so on every screen that shows it. */
  readonly joins?: { readonly expire: () => Promise<number> } | undefined;
}

export interface SweepResult {
  /** Approvals resolved as expired, by id. */
  readonly expired: readonly string[];
  /** Questions answered by the timeout, by ask id. */
  readonly timedOut: readonly string[];
  /** Notification claims forgotten, being older than a week. */
  readonly pruned: number;
  /** Search queue rows folded into the index. */
  readonly indexed: number;
  /** Push tokens forgotten, their device having been withdrawn. */
  readonly forgotten: number;
  /** Unfinished uploads whose pieces were deleted, their slot having expired. */
  readonly abandoned: number;
  /** Join requests marked expired, never having been redeemed. */
  readonly joinsExpired: number;
}

/** How long a claim is kept: long enough for every device to have seen the week's banners. */
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSweep(deps: SweepDeps) {
  return async function sweep(): Promise<SweepResult> {
    const now = deps.clock.nowIso();
    const before = new Date(Date.parse(now) - CLAIM_TTL_MS).toISOString();
    return {
      expired: await expireApprovals(deps, now),
      timedOut: await timeOutQuestions(deps, now),
      pruned: (await deps.notifications?.prune(before)) ?? 0,
      indexed: (await deps.searchIndex?.drain()) ?? 0,
      forgotten: (await deps.push?.pruneRevoked()) ?? 0,
      abandoned: (await deps.uploads?.abandon(now)) ?? 0,
      joinsExpired: (await deps.joins?.expire()) ?? 0,
    };
  };
}

async function expireApprovals(deps: SweepDeps, now: string): Promise<string[]> {
  const expired: string[] = [];
  for (const approval of await deps.readModels.approvalsExpiredBy(now)) {
    await deps.store.append({
      v: 1,
      type: "approval.resolved",
      id: deps.ids.next("event"),
      ts: now,
      workspace_id: approval.workspace_id,
      ...(approval.space_id === null ? {} : { space_id: approval.space_id }),
      ...(approval.run_id === null ? {} : { run_id: approval.run_id }),
      actor: { kind: "system", id: "system" },
      // One expiry per approval, however many sweeps notice it.
      idempotency_key: `${approval.approval_id}-expired`,
      approval_id: approval.approval_id,
      decision: "expired",
      scope: "once",
      reason: `nobody answered by ${approval.expires_at}, so the fallback applied: ${approval.fallback}`,
      resolved_by: "system",
      resolved_at: now,
      resolved_elsewhere: false,
      // Whoever could have answered hears that nobody did, wherever they are (ADR 0042).
      ...(approval.approvers.length > 0 ? { approvers: [...approval.approvers] } : {}),
    });
    expired.push(approval.approval_id);
  }
  return expired;
}

async function timeOutQuestions(deps: SweepDeps, now: string): Promise<string[]> {
  const timedOut: string[] = [];
  for (const question of await deps.readModels.questionsTimedOutBy(now)) {
    await deps.store.append({
      v: 1,
      type: "question.answered",
      id: deps.ids.next("event"),
      ts: now,
      workspace_id: question.workspace_id,
      ...(question.space_id === null ? {} : { space_id: question.space_id }),
      ...(question.run_id === null ? {} : { run_id: question.run_id }),
      actor: { kind: "system", id: "system" },
      idempotency_key: `${question.ask_id}-timeout`,
      ask_id: question.ask_id,
      // The default, where the question has one; nothing where it has not. What the harness
      // does with that is `on_no_answer`'s, which it already knows.
      answers: question.questions.map((each) => ({
        question_id: each.question_id,
        values: each.default_value === undefined ? [] : [each.default_value],
      })),
      answered_by: "system",
      answered_at: now,
      timed_out: true,
    });
    timedOut.push(question.ask_id);
  }
  return timedOut;
}

export type Sweep = ReturnType<typeof createSweep>;
