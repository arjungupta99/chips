/**
 * What every client's Project page says (ADR 0222): a change's row in Changes, its lines added and
 * removed, the files by folder for Files, and whether a person may undo a change, so the web, the
 * Mac and the phone say the same.
 */

import { clockOf } from "./agents.js";
import { changedCount, changeWords } from "./model/project.js";
import type { ProjectChange, RoomProject } from "./model/types.js";

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The lines a change added and removed, binary files counting none. */
export function changeLines(change: Pick<ProjectChange, "files">): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const file of change.files) {
    added += file.added ?? 0;
    removed += file.removed ?? 0;
  }
  return { added, removed };
}

/** `+12 −3`, the way a change's lines are said. */
export function linesWords(lines: { added: number; removed: number }): string {
  return `+${lines.added} −${lines.removed}`;
}

/**
 * A change's row in Changes, newest first: what it said, or for an Undo what it did, and under it
 * who, how many files, its lines and when, and that it was undone.
 */
export function changeRow(
  project: RoomProject,
  change: ProjectChange,
  nameOf: (participantId: string) => string | undefined,
  now: number = Date.now(),
): { readonly title: string; readonly under: string } {
  const who = nameOf(change.by) ?? (change.byKind === "person" ? "Someone" : "An agent");
  const title =
    change.undoes === undefined
      ? change.message.trim() || "A change to the project"
      : `${who} ${changeWords(project, change.commit, nameOf)}`;
  const under = [
    who,
    plural(changedCount(change), "file"),
    linesWords(changeLines(change)),
    clockOf(change.at, now),
    change.undoneBy === undefined ? undefined : "Undone",
  ].filter((part): part is string => part !== undefined);
  return { title, under: under.join(" · ") };
}

/** The change a reply carries, from the room's project, when the room has it. */
export function changeOf(
  project: RoomProject | undefined,
  commit: string | undefined,
): ProjectChange | undefined {
  if (project === undefined || commit === undefined) return undefined;
  return project.changes.find((change) => change.commit === commit);
}

/**
 * What a person's button on a change does: Undo for a change, Put it back for an Undo still
 * standing, and nothing for one already taken back or for a guest.
 */
export function undoOffer(
  change: ProjectChange,
  guest: boolean,
): "Undo" | "Put it back" | undefined {
  if (guest || change.undoneBy !== undefined) return undefined;
  return change.undoes === undefined ? "Undo" : "Put it back";
}

/** The project's files by folder, for Files: the top's first, then each folder in order. */
export function filesByFolder<File extends { readonly path: string }>(
  files: readonly File[],
): readonly { readonly folder: string; readonly files: readonly File[] }[] {
  const folders = new Map<string, File[]>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const at = file.path.lastIndexOf("/");
    const folder = at < 0 ? "" : file.path.slice(0, at);
    const list = folders.get(folder) ?? [];
    list.push(file);
    folders.set(folder, list);
  }
  return [...folders.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({ folder, files: list }));
}

/** A file's name, without its folders. */
export function fileNameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * What Download as zip names its file (ADR 0224): the room's name, so the phone's Files and a
 * browser's downloads keep it as `Sudoku mini.zip`, with what a file name can't hold taken out.
 */
export function projectZipName(title: string): string {
  const name = title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a control character is no name's.
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^[\s.-]+|[\s.]+$/g, "");
  return `${name === "" ? "Project" : name}.zip`;
}

/** What the zip holds, as Download as zip says it under the button: "All 5 files as they are now". */
export function projectZipWords(files: number): string {
  return files === 1 ? "The one file as it is now" : `All ${files} files as they are now`;
}
