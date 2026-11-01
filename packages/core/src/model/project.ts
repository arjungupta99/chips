/**
 * The room's project as the room shows it (ADR 0222): every change, from its `project.changed`,
 * newest first, with the reply that carries it and the Undo that took it back; and how many files
 * the project has, for the room sheet's Project tile.
 *
 * A change shows once. A reply that names it (`change`) carries it: "2 files changed" under the
 * reply, and no line of its own. A change nothing carries gets one quiet line by whoever made it,
 * "changed 2 files": at once for a person's, and for an agent's once its run in the room has ended
 * without a reply naming it, so a reply that follows its push a moment later shows no line first.
 * An Undo is a line of its own, "undid Wren's change", and Put it back is the Undo of an Undo.
 */

import { actorKind, type ClientEvent } from "../events.js";
import { addLine } from "./lines.js";
import {
  type Building,
  type FoldStep,
  field,
  type MutableChange,
  type MutableProject,
  type MutableRun,
  type MutableSpace,
} from "./state.js";
import type { Line, ProjectChange } from "./types.js";

function projectOf(space: MutableSpace): MutableProject {
  space.project ??= { files: 0, changes: new Map() };
  return space.project;
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** How many files a change changed. */
export function changedCount(change: Pick<ProjectChange, "files" | "moreFiles">): number {
  return change.files.length + change.moreFiles;
}

/** "2 files changed", under the reply that made the change. */
export function filesChangedWords(change: Pick<ProjectChange, "files" | "moreFiles">): string {
  return `${plural(changedCount(change), "file")} changed`;
}

/**
 * What a change's quiet line says after the name of whoever made it: "changed 2 files", "undid
 * Wren's change", or, for the Undo of an Undo, "put Wren's change back". Names come from
 * `nameOf`, the client's, and a change whose maker it can't name is "a change".
 */
export function changeWords(
  project: {
    readonly changes: readonly Pick<
      ProjectChange,
      "commit" | "by" | "undoes" | "files" | "moreFiles"
    >[];
  },
  commit: string,
  nameOf: (participantId: string) => string | undefined = () => undefined,
): string {
  const find = (id: string | undefined) =>
    id === undefined ? undefined : project.changes.find((each) => each.commit === id);
  const change = find(commit);
  if (change === undefined) return "changed the project";
  const whose = (other: { by: string } | undefined): string => {
    if (other === undefined) return "a";
    if (other.by === change.by) return "their own";
    const name = nameOf(other.by);
    return name === undefined ? "a" : `${name}'s`;
  };
  const target = find(change.undoes);
  if (change.undoes === undefined) return `changed ${plural(changedCount(change), "file")}`;
  if (target?.undoes !== undefined) return `put ${whose(find(target.undoes))} change back`;
  return `undid ${whose(target)} change`;
}

function lineOf(project: MutableProject, change: MutableChange): Line {
  return {
    id: `change-${change.commit}`,
    seq: change.seq,
    kind: "system",
    authorId: change.by,
    authorKind: change.authorKind,
    text: changeWords({ changes: [...project.changes.values()] }, change.commit),
    ts: change.at,
    change: change.commit,
  };
}

/** A change's quiet line, at its place in the room. */
function show(space: MutableSpace, change: MutableChange): void {
  if (change.shown || change.reply !== undefined) return;
  change.shown = true;
  addLine(space, lineOf(projectOf(space), change));
}

/** A change as its `project.changed` says it, not yet drawn. */
function changeFrom(event: ClientEvent, commit: string): MutableChange {
  return {
    commit,
    before: field<string | null>(event, "before") ?? null,
    by: field<string>(event, "by") ?? event.actor.id,
    byKind: actorKind(event.actor) === "person" ? "person" : "agent",
    authorKind: actorKind(event.actor),
    at: event.ts,
    seq: event.seq,
    message: field<string>(event, "message") ?? "",
    files: field<ProjectChange["files"]>(event, "files") ?? [],
    moreFiles: field<number>(event, "more_files") ?? 0,
    undoes: field<string>(event, "undoes"),
    shown: false,
  };
}

/** An Undo takes its change back; the Undo of an Undo puts that one's change back. */
function takeBack(project: MutableProject, change: MutableChange): void {
  const target = change.undoes === undefined ? undefined : project.changes.get(change.undoes);
  if (target === undefined) return;
  target.undoneBy = change.commit;
  const back = target.undoes === undefined ? undefined : project.changes.get(target.undoes);
  if (back !== undefined) back.undoneBy = undefined;
}

export const PROJECT_FOLDS: Readonly<Record<string, FoldStep>> = {
  "project.changed": (state, event) => {
    const space = event.space_id === undefined ? undefined : state.spaces.get(event.space_id);
    const commit = field<string>(event, "after");
    if (space === undefined || commit === undefined) return;
    const project = projectOf(space);
    const files = field<number>(event, "file_count");
    if (files !== undefined) project.files = files;
    if (project.changes.has(commit)) return;
    const change = changeFrom(event, commit);
    project.changes.set(commit, change);
    takeBack(project, change);
    const waiting = change.byKind === "agent" && hasOpenRun(state, space.id, change.by);
    if (!waiting) show(space, change);
  },
};

/** Whether an agent has a run going in a room: its change may yet come with its reply. */
function hasOpenRun(state: Building, spaceId: string, agentId: string): boolean {
  for (const run of state.runs.values()) {
    if (run.spaceId === spaceId && run.harnessId === agentId && run.endedAt === undefined)
      return true;
  }
  return false;
}

/** A reply that names its change carries it, and the change's quiet line, if drawn, goes. */
export function claimChange(
  space: MutableSpace | undefined,
  commit: string | undefined,
  lineId: string,
): void {
  if (space === undefined || commit === undefined) return;
  const change = projectOf(space).changes.get(commit);
  if (change === undefined) return;
  change.reply = lineId;
  if (!change.shown) return;
  const at = space.lines.findIndex((line) => line.kind === "system" && line.change === commit);
  if (at >= 0) space.lines.splice(at, 1);
  change.shown = false;
}

/** A run has ended: its agent's changes in the room that no reply named get their quiet line. */
export function settleChanges(state: Building, run: MutableRun | undefined): void {
  if (run === undefined) return;
  const space = state.spaces.get(run.spaceId);
  if (space?.project === undefined) return;
  for (const change of space.project.changes.values()) {
    if (change.by === run.harnessId && !change.shown && change.reply === undefined)
      show(space, change);
  }
}

/** The project, frozen for the model: newest change first. */
export function frozenProject(project: MutableProject): {
  files: number;
  changes: readonly ProjectChange[];
} {
  const changes = [...project.changes.values()]
    .sort((a, b) => b.seq - a.seq)
    .map(
      (change): ProjectChange => ({
        commit: change.commit,
        before: change.before,
        by: change.by,
        byKind: change.byKind,
        at: change.at,
        seq: change.seq,
        message: change.message,
        files: change.files,
        moreFiles: change.moreFiles,
        ...(change.undoes === undefined ? {} : { undoes: change.undoes }),
        ...(change.undoneBy === undefined ? {} : { undoneBy: change.undoneBy }),
        ...(change.reply === undefined ? {} : { reply: change.reply }),
      }),
    );
  return { files: project.files, changes };
}
