/**
 * An agent's context files (ADR 0134): a harness's copy of what it builds each agent from, read
 * and edited by the person who owns the harness.
 *
 * - **A harness sends its copies** of its own agents' files, and of its own set, whole, whenever
 *   they change; a copy may answer an edit (`answers`) or refuse one (`refuses`).
 * - **The harness's owner reads them,** or an owner or admin of the workspace, the people who may
 *   restart or remove it (ADR 0078, ADR 0094). Nobody else: a file about the person it serves is
 *   theirs. A harness that does not declare `context_files` has none to read.
 * - **An edit** is checked against the copy (the file is there, may be edited, and was not changed
 *   since the person read it), kept as waiting, and sent down the harness's sockets that hear
 *   `context`. With nothing of it to hear, it is refused at once: no queue. The harness's answer
 *   closes it; one not answered in `CONTEXT_EDIT_WAIT_MS` reads as missed.
 */

import {
  type AgentContextPut,
  CONTEXT_EDIT_WAIT_MS,
  type ContextEditAsk,
  type ContextEditFrame,
  type ContextEditView,
  type ContextFile,
  HARNESS_CAPABILITIES,
  type HarnessContextPut,
  type SharedContextFile,
} from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type {
  ContextEdit,
  ContextOwner,
  ContextOwnerKind,
  ContextRegistry,
  ContextSet,
} from "../ports/context-files.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

export interface ContextFilesDeps {
  readonly readModels: Pick<ReadModels, "participant">;
  readonly context: ContextRegistry;
  readonly sessions: Pick<Sessions, "contextEdit" | "hearingContext">;
  readonly ids: { next: (kind: "edit") => string };
  readonly clock: Clock;
}

export interface ContextRefusal {
  readonly kind: "not_allowed" | "unknown" | "invalid" | "stale" | "away";
  readonly message: string;
  /** For `stale`: the file as Chips holds it now. */
  readonly file?: ContextFile | SharedContextFile;
}

type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ContextRefusal };

const refused = <T>(
  kind: ContextRefusal["kind"],
  message: string,
  file?: ContextRefusal["file"],
): Answer<T> => ({
  ok: false,
  error: { kind, message, ...(file === undefined ? {} : { file }) },
});
const ok = <T>(value: T): Answer<T> => ({ ok: true, value });

type Participant = NonNullable<Awaited<ReturnType<ReadModels["participant"]>>>;

/** A live harness and, for an agent, the agent: or why there is none to read. */
interface Whose {
  readonly owner: ContextOwner;
  readonly harness: Participant;
}

async function liveParticipant(
  deps: ContextFilesDeps,
  workspaceId: string,
  id: string,
  kind: Participant["kind"],
): Promise<Participant | undefined> {
  const found = await deps.readModels.participant(workspaceId, id);
  return found?.kind === kind && found.removed_at === null ? found : undefined;
}

/** The owner a path names, with its harness: an agent and the harness it is of, or a harness. */
async function whoseSet(
  deps: ContextFilesDeps,
  workspaceId: string,
  kind: ContextOwnerKind,
  id: string,
): Promise<Whose | undefined> {
  const owner: ContextOwner = { workspaceId, kind, id };
  if (kind === "harness") {
    const harness = await liveParticipant(deps, workspaceId, id, "harness");
    return harness === undefined ? undefined : { owner, harness };
  }
  const agent = await liveParticipant(deps, workspaceId, id, "agent");
  if (agent?.harness_id === undefined) return undefined;
  const harness = await liveParticipant(deps, workspaceId, agent.harness_id, "harness");
  return harness === undefined ? undefined : { owner, harness };
}

const declares = (harness: Participant): boolean =>
  harness.capabilities?.includes(HARNESS_CAPABILITIES.contextFiles) === true;

/** The set a person may read, or why not. */
async function readable(
  deps: ContextFilesDeps,
  principal: Principal,
  kind: ContextOwnerKind,
  id: string,
): Promise<Answer<{ readonly whose: Whose; readonly set: ContextSet }>> {
  if (principal.kind !== "person")
    return refused("not_allowed", "A person reads an agent's context.");
  const whose = await whoseSet(deps, principal.workspaceId, kind, id);
  if (whose === undefined) return refused("unknown", `No ${kind} of that id here.`);
  if (!ownsHarness(principal, whose.harness)) {
    return refused(
      "not_allowed",
      "An agent's context is read by its harness's owner, or by an owner or admin of the workspace.",
    );
  }
  const name = whose.harness.display_name;
  if (!declares(whose.harness))
    return refused("unknown", `${name} doesn't share its context files with Chips.`);
  const set = await deps.context.get(whose.owner);
  if (set === undefined) return refused("unknown", `${name} hasn't sent these files yet.`);
  return ok({ whose, set });
}

const away = (deps: ContextFilesDeps, workspaceId: string, harnessId: string): boolean =>
  deps.sessions.hearingContext(workspaceId, harnessId) === 0;

export interface ContextRead {
  readonly set: ContextSet;
  readonly away: boolean;
}

export function createReadContext(deps: ContextFilesDeps) {
  return async function readContext(input: {
    readonly principal: Principal;
    readonly kind: ContextOwnerKind;
    readonly id: string;
  }): Promise<Answer<ContextRead>> {
    const found = await readable(deps, input.principal, input.kind, input.id);
    if (!found.ok) return found;
    const { set, whose } = found.value;
    return ok({ set, away: away(deps, input.principal.workspaceId, whose.harness.id) });
  };
}

/** Why this file may not be changed so, or nothing when it may. */
function editRefusal(
  file: ContextFile | SharedContextFile | undefined,
  ask: ContextEditAsk,
  kind: ContextOwnerKind,
): Answer<never> | undefined {
  if (file === undefined) return refused("unknown", `There is no ${ask.name} here.`);
  if (ask.base_hash === null) {
    const ownable =
      kind === "agent" &&
      "shared" in file &&
      file.shared !== undefined &&
      file.replaceable === true;
    return ownable ? undefined : refused("invalid", `${file.title} can't be made an agent's own.`);
  }
  if (!file.editable) {
    const why = file.why_read_only === undefined ? "" : ` ${file.why_read_only}.`;
    return refused("invalid", `${file.title} is read only.${why}`);
  }
  if (file.hash !== ask.base_hash) {
    return refused("stale", `${file.title} was changed after you opened it.`, file);
  }
  return undefined;
}

export function createAskContextEdit(deps: ContextFilesDeps) {
  return async function askContextEdit(input: {
    readonly principal: Principal;
    readonly kind: ContextOwnerKind;
    readonly id: string;
    readonly ask: ContextEditAsk;
  }): Promise<Answer<ContextEditView>> {
    const { principal, kind, id, ask } = input;
    if (principal.kind !== "person")
      return refused("not_allowed", "A person edits an agent's context.");
    const found = await readable(deps, principal, kind, id);
    if (!found.ok) return found;
    const { set, whose } = found.value;
    const refusal = editRefusal(
      set.files.find((file) => file.name === ask.name),
      ask,
      kind,
    );
    if (refusal !== undefined) return refusal;

    const now = deps.clock.nowIso();
    const edit: ContextEdit = {
      id: deps.ids.next("edit"),
      owner: whose.owner,
      harnessId: whose.harness.id,
      name: ask.name,
      baseHash: ask.base_hash,
      text: ask.text,
      askedBy: principal.participantId,
      askedAt: now,
      state: "waiting",
      message: null,
      answeredAt: null,
    };
    await deps.context.addEdit(edit);
    const sockets = deps.sessions.contextEdit(
      principal.workspaceId,
      whose.harness.id,
      frameOf(edit),
    );
    if (sockets === 0) {
      const words = `Chips can't reach ${whose.harness.display_name} to save it.`;
      await deps.context.answer({
        workspaceId: principal.workspaceId,
        id: edit.id,
        state: "failed",
        message: words,
        at: now,
      });
      return refused("away", words);
    }
    return ok(viewOf(edit, Date.parse(now)));
  };
}

function frameOf(edit: ContextEdit): ContextEditFrame {
  return {
    frame: "context.edit",
    edit_id: edit.id as ContextEditFrame["edit_id"],
    harness_id: edit.harnessId as ContextEditFrame["harness_id"],
    ...(edit.owner.kind === "agent"
      ? { agent_id: edit.owner.id as NonNullable<ContextEditFrame["agent_id"]> }
      : {}),
    name: edit.name,
    text: edit.text,
    base_hash: edit.baseHash,
    asked_by: edit.askedBy as ContextEditFrame["asked_by"],
    asked_at: edit.askedAt,
  };
}

/** An edit as a person reads it: waiting past its minute is missed. */
export function viewOf(edit: ContextEdit, now: number): ContextEditView {
  const missed = edit.state === "waiting" && now - Date.parse(edit.askedAt) > CONTEXT_EDIT_WAIT_MS;
  return {
    edit_id: edit.id as ContextEditView["edit_id"],
    name: edit.name,
    state: missed ? "missed" : edit.state,
    asked_at: edit.askedAt,
    ...(edit.answeredAt === null ? {} : { answered_at: edit.answeredAt }),
    ...(edit.message === null ? {} : { message: edit.message }),
  };
}

export function createReadContextEdit(deps: ContextFilesDeps) {
  return async function readContextEdit(input: {
    readonly principal: Principal;
    readonly editId: string;
  }): Promise<Answer<ContextEditView>> {
    const { principal, editId } = input;
    if (principal.kind !== "person") return refused("not_allowed", "A person reads an edit.");
    const edit = await deps.context.edit(principal.workspaceId, editId);
    if (edit === undefined) return refused("unknown", "No edit of that id here.");
    const harness = await deps.readModels.participant(principal.workspaceId, edit.harnessId);
    if (!ownsHarness(principal, harness))
      return refused("not_allowed", "That edit isn't yours to read.");
    return ok(viewOf(edit, Date.parse(deps.clock.nowIso())));
  };
}

/** Close the edit a harness's copy answers or refuses, if it is one of its own and waits. */
async function closeEdit(
  deps: ContextFilesDeps,
  principal: Principal,
  put: Pick<AgentContextPut, "answers" | "refuses">,
  now: string,
): Promise<Answer<never> | undefined> {
  const editId = put.answers ?? put.refuses?.edit_id;
  if (editId === undefined) return undefined;
  const edit = await deps.context.edit(principal.workspaceId, editId);
  if (edit?.harnessId !== principal.participantId)
    return refused("invalid", "That edit isn't one asked of you.");
  const state = put.answers === undefined ? (put.refuses?.reason ?? "failed") : "saved";
  await deps.context.answer({
    workspaceId: principal.workspaceId,
    id: editId,
    state,
    message: put.refuses?.message ?? null,
    at: now,
  });
  return undefined;
}

/** The harness's own agent or itself, as a path names it: or why it may not send that set. */
async function sendable(
  deps: ContextFilesDeps,
  principal: Principal,
  kind: ContextOwnerKind,
  id: string,
): Promise<Answer<Whose>> {
  if (principal.kind !== "harness") {
    return refused("not_allowed", "A harness sends its own context files.");
  }
  const whose = await whoseSet(deps, principal.workspaceId, kind, id);
  if (whose === undefined) return refused("unknown", `No ${kind} of that id here.`);
  if (whose.harness.id !== principal.participantId) {
    return refused("not_allowed", `That ${kind} isn't yours.`);
  }
  return ok(whose);
}

/** A copy as the registry keeps it. */
function setOf(whose: Whose, put: AgentContextPut | HarnessContextPut, readAt: string): ContextSet {
  return {
    owner: whose.owner,
    harnessId: whose.harness.id,
    files: "files" in put ? put.files : put.shared,
    notShown: put.not_shown ?? [],
    newAgentsNote: "new_agents_note" in put ? (put.new_agents_note ?? null) : null,
    readNote: "read_note" in put ? (put.read_note ?? null) : null,
    readAt,
  };
}

export function createPutContext(deps: ContextFilesDeps) {
  return async function putContext(input: {
    readonly principal: Principal;
    readonly kind: ContextOwnerKind;
    readonly id: string;
    readonly put: AgentContextPut | HarnessContextPut;
  }): Promise<Answer<{ readonly readAt: string }>> {
    const { principal, put } = input;
    const whose = await sendable(deps, principal, input.kind, input.id);
    if (!whose.ok) return whose;
    const now = deps.clock.nowIso();
    const closing = await closeEdit(deps, principal, put, now);
    if (closing !== undefined) return closing;
    await deps.context.put(setOf(whose.value, put, now));
    return ok({ readAt: now });
  };
}

export type ReadContext = ReturnType<typeof createReadContext>;
export type AskContextEdit = ReturnType<typeof createAskContextEdit>;
export type ReadContextEdit = ReturnType<typeof createReadContextEdit>;
export type PutContext = ReturnType<typeof createPutContext>;
