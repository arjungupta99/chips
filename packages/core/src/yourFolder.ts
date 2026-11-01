/**
 * Your folder (ADR 0224): the room's project as a folder on the Mac, and what its card says. The
 * folder is the Mac app's `chips project folder`'s, which answers with one line of JSON, the shape
 * below (`cli/src/commands/folder.ts` has its own copy, across the process boundary); the words are
 * here so that what the card says is tested once.
 */

import { namesInWords, type ProjectRun } from "@chipschat/protocol";
import { lostWords } from "./reach.js";

export type FolderOp =
  | "look"
  | "open"
  | "send"
  | "editor"
  | "file"
  | "view"
  | "run"
  | "stop"
  | "status";

/** A file the person changed in their folder and hasn't sent. */
export interface FolderChange {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}

/** What `chips project folder` answers. */
export type FolderAnswer =
  | {
      readonly ok: true;
      /** Where the folder is, or would be made, and the same as a person reads it. */
      readonly folder: string;
      readonly shown: string;
      /** The editor Open in editor opens; none when the Mac has none Chips knows. */
      readonly editor?: string | undefined;
      /** Whether the folder is there yet. */
      readonly made: boolean;
      readonly changed?: readonly FolderChange[];
      readonly clashes?: readonly string[];
      readonly clashedWith?: readonly string[];
      readonly marked?: string | undefined;
      readonly since?: readonly string[];
      readonly by?: readonly string[];
      readonly came?: readonly string[];
      readonly cameBy?: readonly string[];
      readonly trouble?: string | undefined;
      readonly sent?: { readonly files: readonly string[]; readonly over: readonly string[] };
      readonly keys?: readonly { readonly path: string; readonly what: string }[];
      /** How the room's run on this Mac stands (ADR 0226), after `run`, `stop` and `status`. */
      readonly run?: ProjectRun | undefined;
    }
  | { readonly ok: false; readonly why: string };

/** The folder as the card draws it. */
export type FolderStanding = "none" | "clash" | "changed" | "current";

export function folderStanding(answer: FolderAnswer & { ok: true }): FolderStanding {
  if (!answer.made) return "none";
  if ((answer.clashes ?? []).length > 0) return "clash";
  return (answer.changed ?? []).length > 0 ? "changed" : "current";
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** Some files by name, or how many when there are more than a sentence holds. */
function filesInWords(files: readonly string[]): string {
  return files.length > 3 ? plural(files.length, "file") : namesInWords(files);
}

/** Some people by name, or "Someone" when git named nobody. */
function whoInWords(names: readonly string[]): string {
  return names.length === 0 ? "Someone" : namesInWords(names);
}

/** Beside the card's title: where the folder stands. Not up to date when the room couldn't be reached. */
export function folderHeadWords(answer: FolderAnswer & { ok: true }): string {
  switch (folderStanding(answer)) {
    case "none":
      return "";
    case "clash":
      return "Not sent yet";
    case "changed":
      return `You changed ${plural(answer.changed?.length ?? 0, "file")}`;
    case "current":
      return answer.trouble === undefined ? "Up to date" : "Couldn't check";
  }
}

/** Under Open folder, before there is a folder. */
export function folderMakesWords(shown: string): string {
  return `Makes a copy of the project at ${shown} and opens it in Finder. While you haven't changed anything in it, Chips keeps it up to date.`;
}

/** What others changed that waits for the person's own to be sent. */
export function folderSinceWords(by: readonly string[], files: readonly string[]): string {
  const who = whoInWords(by);
  const has = by.length > 1 ? "have" : "has";
  return `${who} ${has} changed ${filesInWords(files)} since. It comes into your folder when you send yours. Until then, nothing in your folder changes.`;
}

/** The last change that came into the folder: "Wynn's change to src/board.js came in 2 min ago." */
export function folderCameWords(
  by: readonly string[],
  files: readonly string[],
  at: string,
  now: number = Date.now(),
): string {
  const whose = by.length === 0 ? "A change" : `${namesInWords(by)}'s change`;
  return `${whose} to ${filesInWords(files)} came in ${lostWords(at, now)}.`;
}

/**
 * Under Open folder on Mac, on the phone and in a browser (ADR 0225). It no longer says Chips for
 * Mac has to be open: the owner's server opens it when it isn't (ADR 0227's second addendum), and
 * what comes back says so when nothing could.
 */
export const FOLDER_ON_MAC_WORDS = "Opens the project's folder in Finder on your Mac.";

/** What an ask to the person's Macs came to: how many heard, and whether the server opened one. */
export interface MacsHeard {
  readonly macs: number;
  readonly opened_app?: true | undefined;
}

/**
 * No Mac of the person's heard the ask: the server opened Chips for Mac and it hadn't connected in
 * time (ADR 0227), or it opened none.
 */
export function unheardWords(nothing: "opened" | "ran", openedApp: boolean | undefined): string {
  return openedApp === true
    ? `Chips for Mac is starting on your Mac but hasn't connected yet, so nothing ${nothing}. Press again in a moment.`
    : `Chips for Mac isn't open, so nothing ${nothing}. Open Chips on your Mac and press again.`;
}

/** After Open folder on Mac: whether a Mac heard it, and whether the server opened it first. */
export function folderOnMacWords(heard: MacsHeard): string {
  if (heard.macs === 0) return unheardWords("opened", heard.opened_app);
  return heard.opened_app === true
    ? "Chips for Mac wasn't open, so Chips opened it. Finder opens the folder there."
    : "Sent to your Mac. Finder opens the folder there.";
}

/** On the Mac's card, after another device asked: "Opened from your iPhone just now." */
export function folderOpenedFromWords(from: string, at: string, now: number = Date.now()): string {
  return `Opened from your ${from} ${lostWords(at, now)}.`;
}

/** A clash's title and what to do about it. */
export function folderClashWords(
  file: string,
  clashedWith: readonly string[],
): { readonly title: string; readonly body: string } {
  const who = whoInWords(clashedWith);
  const whose = clashedWith.length === 0 ? "another" : `${who}'s`;
  return {
    title: `${file} clashed with ${whose} change`,
    body: `${who} changed the same lines before yours reached the space. Both are in the file now: keep what you both meant, take the marks out, and send again.`,
  };
}

/** Under a clash: the person's other changes, which wait with it. */
export function folderWaitingWords(others: readonly string[]): string {
  const held = "Nothing of yours is lost, and nothing goes to the space until the marks are out.";
  return others.length === 0
    ? held
    : `Your change to ${filesInWords(others)} is waiting with it. ${held}`;
}

/** Send held back for a key. */
export function folderKeysWords(keys: readonly { path: string; what: string }[]): string {
  const [first] = keys;
  if (first === undefined) return "";
  const named =
    keys.length === 1
      ? `${first.path} looks like it holds ${first.what}`
      : `${filesInWords(keys.map((key) => key.path))} look like they hold keys`;
  return `${named}, so nothing was sent. Take it out and send again.`;
}

/** After a Send. */
export function folderSentWords(files: readonly string[]): string {
  return files.length === 0
    ? "Nothing in your folder was different from the space's."
    : `Your change to ${filesInWords(files)} is in the space.`;
}

/** When the room's project couldn't be reached. */
export function folderTroubleWords(trouble: string): string {
  return `Chips couldn't reach the space's project: ${trouble.replace(/\.?$/, ".")}`;
}
