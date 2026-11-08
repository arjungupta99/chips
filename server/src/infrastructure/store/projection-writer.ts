// biome-ignore-all lint/suspicious/noExplicitAny: this file exists to hold the run-time table
// dispatch that Kysely's per-table types cannot follow. Every `any` below is a table or column
// name chosen from a closed set — `ProjectionTable` and `KEYS` — and nothing else in the server
// is allowed one. Keeping them here means a stray `any` elsewhere is still a review comment.

/**
 * Writes the changes a projector produced.
 *
 * The domain says *what* an event means as a list of `Change`s; this says *how* to write them.
 * That split is what lets the meaning of an event be tested without a database, and what makes
 * replay and live traffic run the same code (ADR 0004). The changes that depend on what is
 * already there — a run's next state, a plan's settled steps, a spend's difference, a session
 * rule's action — read it here, inside the caller's transaction.
 */

import { standingOffer } from "@chipschat/protocol";
import { sql, type Transaction } from "kysely";
import {
  applyRunTransition,
  type CarriedSpend,
  type Change,
  type HeldStopped,
  type ProjectionTable,
  type Row,
  type RunState,
  type RunTransition,
  type SessionRule,
  type Spend,
  type TakeRuns,
} from "../../domain/index.js";
import type { Database } from "../db/schema.js";

/** The natural key of each projection table. An upsert conflicts on it; a table not here is unreachable. */
export const KEYS: Readonly<Record<ProjectionTable, readonly string[]>> = {
  participants: ["id"],
  replacements: ["space_id", "from_id"],
  held_messages: ["event_id"],
  spaces: ["id"],
  // A session ref is the harness's own name, not a ULID, so the workspace is part of the key.
  sessions: ["workspace_id", "session_ref"],
  memberships: ["space_id", "participant_id"],
  messages: ["id"],
  runs: ["id"],
  steps: ["run_id", "step_id"],
  approvals: ["id"],
  questions: ["id"],
  attachments: ["id"],
  lanes: ["id"],
  harness_policy: ["harness_id", "space_id"],
  workspace_policy: ["workspace_id"],
  session_rules: ["run_id", "approval_id"],
  workspace_members: ["workspace_id", "participant_id"],
  pins: ["space_id", "message_id"],
  workspace_limits: ["workspace_id"],
};

/** Apply the changes in order. Order matters: a patch follows the upsert it refines. */
export async function applyChanges(
  trx: Transaction<Database>,
  changes: readonly Change[],
): Promise<void> {
  for (const change of changes) {
    switch (change.kind) {
      case "upsert":
        await upsert(trx, change.table, change.row);
        break;
      case "patch":
        await patch(trx, change.table, change.key, change.set);
        break;
      case "delete":
        await remove(trx, change.table, change.key);
        break;
      case "spend":
        await spend(trx, change);
        break;
      case "carried_spend":
        await carrySpend(trx, change);
        break;
      case "replace_plan":
        await replacePlan(trx, change.key, change.steps, change.updatedAt);
        break;
      case "session_rule":
        await sessionRule(trx, change);
        break;
      case "held_stopped":
        await heldStopped(trx, change);
        break;
      case "take_runs":
        await takeRuns(trx, change);
        break;
      default:
        await transitionRun(trx, change.key, change.transition, change.set);
    }
  }
}

/** Insert, or update the columns the row names; a column it leaves out keeps its value. */
async function upsert(trx: Transaction<Database>, table: ProjectionTable, row: Row): Promise<void> {
  const keys = KEYS[table];
  const updatable = Object.fromEntries(
    Object.entries(row).filter(([column]) => !keys.includes(column)),
  );
  await trx
    .insertInto(table as any)
    .values(row as any)
    .onConflict((oc) => oc.columns(keys as any).doUpdateSet(updatable as any))
    .execute();
}

async function patch(
  trx: Transaction<Database>,
  table: ProjectionTable,
  key: Row,
  set: Row,
): Promise<void> {
  if (Object.keys(set).length === 0) return;
  let query = trx.updateTable(table as any).set(set as any);
  for (const [column, value] of Object.entries(key)) {
    query = query.where(column as any, "=", value as any);
  }
  await query.execute();
}

async function remove(trx: Transaction<Database>, table: ProjectionTable, key: Row): Promise<void> {
  let query = trx.deleteFrom(table as any);
  for (const [column, value] of Object.entries(key)) {
    query = query.where(column as any, "=", value as any);
  }
  await query.execute();
}

/** The runs a harness began in a room as itself, its agent's now it is in the harness's place. */
async function takeRuns(trx: Transaction<Database>, change: TakeRuns): Promise<void> {
  await trx
    .updateTable("runs")
    .set({ agent_id: change.agentId })
    .where("workspace_id", "=", change.key.workspace_id)
    .where("space_id", "=", change.key.space_id)
    .where("harness_id", "=", change.key.harness_id)
    .where("agent_id", "is", null)
    .execute();
}

/** An erased room's cost, back on its harness's account: every row of it, as `usage` does. */
async function carrySpend(trx: Transaction<Database>, change: CarriedSpend): Promise<void> {
  const workspaceId = change.harness["workspace_id"];
  const harnessId = change.harness["harness_id"];
  if (typeof workspaceId !== "string" || typeof harnessId !== "string") return;
  await trx
    .updateTable("harness_policy")
    .set({ spent_usd: sql`spent_usd + ${change.usd}` })
    .where("workspace_id", "=", workspaceId)
    .where("harness_id", "=", harnessId)
    .execute();
}

/**
 * A usage report lands on the run and on the harness's spend. A run-scoped report is the total
 * so far, so the run's numbers are replaced and the harness's spend grows by the difference from
 * what the run had; a step's or a lane's numbers add to both. A run that was never started
 * takes no numbers, and the spend still grows, so a replay reaches the same answer as live.
 */
async function spend(trx: Transaction<Database>, change: Spend): Promise<void> {
  const runId = change.key["id"];
  const workspaceId = change.key["workspace_id"];
  const harnessId = change.harness["harness_id"];
  if (typeof runId !== "string" || typeof workspaceId !== "string") return;

  const run = await trx
    .selectFrom("runs")
    .select(["cost_usd", "input_tokens", "output_tokens"])
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", runId)
    .executeTakeFirst();

  if (run !== undefined) {
    await trx
      .updateTable("runs")
      .set(runNumbers(run, change))
      .where("workspace_id", "=", workspaceId)
      .where("id", "=", runId)
      .execute();
  }

  const delta = spendDelta(run?.cost_usd ?? 0, change);
  if (delta !== 0 && typeof harnessId === "string") {
    await trx
      .updateTable("harness_policy")
      .set({ spent_usd: sql`spent_usd + ${delta}` })
      .where("workspace_id", "=", workspaceId)
      .where("harness_id", "=", harnessId)
      .execute();
  }
}

interface RunNumbers {
  readonly cost_usd: number | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
}

/**
 * The run's tokens and cost after a report: replaced by a total, added to by a step's. A count
 * the report did not know leaves the run's as it was.
 */
function runNumbers(
  run: RunNumbers,
  change: Spend,
): { input_tokens: number | null; output_tokens: number | null; cost_usd?: number } {
  const total = change.scope === "run";
  const usd = change.usd;
  return {
    input_tokens: counted(run.input_tokens, change.inputTokens, total),
    output_tokens: counted(run.output_tokens, change.outputTokens, total),
    ...(usd === undefined ? {} : { cost_usd: total ? usd : (run.cost_usd ?? 0) + usd }),
  };
}

/** A count after a report: the run's own when the report did not know it (ADR 0162). */
function counted(had: number | null, said: number | undefined, total: boolean): number | null {
  if (said === undefined) return had;
  return total ? said : (had ?? 0) + said;
}

/** What the harness's spend grows by: the whole of a step's cost, the difference of a total. */
function spendDelta(before: number, change: Spend): number {
  if (change.usd === undefined) return 0;
  return change.scope === "run" ? change.usd - before : change.usd;
}

/** The states a step keeps its place in when the plan changes. */
const SETTLED_STEPS = ["done", "failed"];

/**
 * A new plan replaces what is still to do: the settled steps stay, in their order, and the new
 * ones follow with fresh ordinals. A new step that names a settled one is the settled one, so
 * a harness restating its plan does not undo a tick. The run's own copy of the plan follows.
 */
async function replacePlan(
  trx: Transaction<Database>,
  key: Row,
  steps: readonly { readonly step_id: string; readonly title: string }[],
  updatedAt: string,
): Promise<void> {
  const runId = key["id"];
  const workspaceId = key["workspace_id"];
  if (typeof runId !== "string" || typeof workspaceId !== "string") return;

  const settled = await trx
    .selectFrom("steps")
    .select(["step_id", "title", "ordinal"])
    .where("workspace_id", "=", workspaceId)
    .where("run_id", "=", runId)
    .where("status", "in", SETTLED_STEPS)
    .orderBy("ordinal", "asc")
    .execute();
  const settledIds = new Set(settled.map((step) => step.step_id));

  await trx
    .deleteFrom("steps")
    .where("workspace_id", "=", workspaceId)
    .where("run_id", "=", runId)
    .where("status", "not in", SETTLED_STEPS)
    .execute();

  let ordinal = settled.reduce((max, step) => Math.max(max, step.ordinal ?? -1), -1) + 1;
  const fresh = steps.filter((step) => !settledIds.has(step.step_id));
  for (const step of fresh) {
    await trx
      .insertInto("steps")
      .values({
        workspace_id: workspaceId,
        run_id: runId,
        step_id: step.step_id,
        ordinal,
        title: step.title,
        status: "planned",
        tool: null,
        summary: null,
        sources: null,
        duration_ms: null,
        error: null,
        updated_at: updatedAt,
      })
      .execute();
    ordinal += 1;
  }

  await trx
    .updateTable("runs")
    .set({
      plan: JSON.stringify([
        ...settled.map((step) => ({ step_id: step.step_id, title: step.title ?? step.step_id })),
        ...fresh,
      ]),
    })
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", runId)
    .execute();
}

/**
 * A decision for this session, as a rule: the approval's own action, decided the same way. A yes
 * that holds on (`until`, a time or `null`) is kept with the approval's space and the run's agent,
 * or its harness, since it holds past the run; it reaches every ask there (ADR 0281), so it keeps
 * the action's kind as `*` and none of its flags or starts.
 */
async function sessionRule(trx: Transaction<Database>, change: SessionRule): Promise<void> {
  const approvalId = change.key["id"];
  const workspaceId = change.key["workspace_id"];
  if (typeof approvalId !== "string" || typeof workspaceId !== "string") return;
  const approval = await trx
    .selectFrom("approvals")
    .select(["action", "space_id"])
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", approvalId)
    .executeTakeFirst();
  if (approval === undefined) return;
  const held = await heldWhere(trx, workspaceId, change, approval.space_id);
  if (held === undefined) return;
  const ruled = ruleOf(JSON.parse(approval.action) as RuledAction, held.space_id !== null);
  if (ruled === undefined) return;
  await trx
    .insertInto("session_rules")
    .values({
      workspace_id: workspaceId,
      run_id: change.runId,
      approval_id: approvalId,
      ...ruled,
      decision: change.decision,
      decided_at: change.decidedAt,
      ...held,
    })
    .onConflict((oc) =>
      oc.columns(["run_id", "approval_id"]).doUpdateSet({ decision: change.decision }),
    )
    .execute();
}

interface RuledAction {
  readonly kind: string;
  readonly external?: boolean;
  readonly irreversible?: boolean;
  readonly input?: unknown;
}

/**
 * What a rule matches: the action's kind and flags, and a command by how its parts start (ADR
 * 0239), never as its kind whole, so a command that can't be kept that way keeps nothing. A yes
 * that holds on in a space matches every ask (`holds`, ADR 0281).
 */
function ruleOf(
  action: RuledAction,
  holds: boolean,
): { match: string; external: 0 | 1; irreversible: 0 | 1; starts_with: string | null } | undefined {
  if (holds) return { match: "*", external: 0, irreversible: 0, starts_with: null };
  const offer = standingOffer(action.input);
  if (offer !== undefined && offer.kind !== "starts") return undefined;
  return {
    match: action.kind,
    external: action.external === true ? 1 : 0,
    irreversible: action.irreversible === true ? 1 : 0,
    starts_with: offer === undefined ? null : JSON.stringify(offer.starts),
  };
}

/**
 * Where a yes that holds on (`until`) holds: the approval's space, for the run's agent or else its
 * harness; nothing when either can't be found. A This session row holds none of it.
 */
async function heldWhere(
  trx: Transaction<Database>,
  workspaceId: string,
  change: SessionRule,
  spaceId: string | null,
): Promise<
  { space_id: string | null; participant_id: string | null; until: string | null } | undefined
> {
  if (change.until === undefined) return { space_id: null, participant_id: null, until: null };
  // A yes until stopped is the one row with a space and no end.
  if (spaceId === null) return undefined;
  const run = await trx
    .selectFrom("runs")
    .select(["agent_id", "harness_id"])
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", change.runId)
    .executeTakeFirst();
  if (run === undefined) return undefined;
  return { space_id: spaceId, participant_id: run.agent_id ?? run.harness_id, until: change.until };
}

/** A person's stop (ADR 0281): the agent's yeses still holding in the space end now. */
async function heldStopped(trx: Transaction<Database>, change: HeldStopped): Promise<void> {
  await trx
    .updateTable("session_rules")
    .set({ until: change.at })
    .where("workspace_id", "=", change.workspaceId)
    .where("space_id", "=", change.spaceId)
    .where("participant_id", "=", change.asker)
    .where((eb) => eb.or([eb("until", "is", null), eb("until", ">", change.at)]))
    .execute();
}

/**
 * A run's next state depends on the state it is already in, so this reads the row, asks the
 * domain where it goes, and writes the answer — all inside the caller's transaction.
 */
async function transitionRun(
  trx: Transaction<Database>,
  key: Row,
  transition: RunTransition,
  set: Row,
): Promise<void> {
  const id = key["id"];
  const workspaceId = key["workspace_id"];
  if (typeof id !== "string" || typeof workspaceId !== "string") return;

  const current = await trx
    .selectFrom("runs")
    .select("state")
    .where("id", "=", id)
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  // A transition for a run that was never started is not an error: the log may legitimately
  // begin mid-run, and a replay must reach the same answer as live traffic did.
  if (current === undefined) return;

  await trx
    .updateTable("runs")
    .set({ state: applyRunTransition(current.state as RunState, transition), ...(set as object) })
    .where("id", "=", id)
    .where("workspace_id", "=", workspaceId)
    .execute();
}
