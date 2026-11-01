/**
 * Run program (ADRs 0226, 0227): the room's project run on the person's Mac, as its agents said to
 * in its run file, `.chips/run.json` (or `chips.json` at the top, where it was kept before), and
 * what the Run bar in Universe says about it. The Mac's, the web's and the phone's draw the same
 * bar from the same words, here.
 */

import {
  commandOf,
  namesInWords,
  opensShown,
  type ProjectRun,
  RUN_FILE,
  RUN_FILE_BEFORE,
  type RunRecipe,
  runRecipe,
} from "@chipschat/protocol";
import { type Directory, harnessOf, nameOf } from "./events.js";
import type { ProjectChange, RoomProject } from "./model/types.js";
import { lostWords } from "./reach.js";
import type { Store } from "./store.js";
import { unheardWords } from "./yourFolder.js";

/** The recipe at the room's `main`, nothing when the project has no run file, or why it isn't one. */
export type RecipeRead = RunRecipe | { readonly why: string } | undefined;

/**
 * The run file at the room's `main`, read the way the Mac reads it: `.chips/run.json`, or, with
 * none, `chips.json` at the top, where it was kept before ADR 0227.
 */
export async function readRunRecipe(
  store: Pick<Store, "projectFile">,
  spaceId: string,
): Promise<RecipeRead> {
  for (const file of [RUN_FILE, RUN_FILE_BEFORE]) {
    try {
      const { bytes } = await store.projectFile(spaceId, file);
      return runRecipe(new TextDecoder().decode(bytes), file);
    } catch {
      // Not there: the one it was kept in before, or nothing.
    }
  }
  return undefined;
}

export { commandOf };

/**
 * Who changed the room's project since the person last ran it (SEC-40): whoever made the changes
 * after the commit the run started at, but the person and the agents of their own harnesses,
 * named as the Run bar says them, "Dana" or "Dana's agent", the first of them first. Nothing when
 * the run names no commit, or the room's changes don't go back to it.
 */
export function changedSince(
  project: Pick<RoomProject, "changes"> | undefined,
  commit: string | undefined,
  directory: Directory,
  selfId: string,
): readonly string[] {
  if (project === undefined || commit === undefined) return [];
  const at = project.changes.findIndex((change) => change.commit === commit);
  if (at < 0) return [];
  const names: string[] = [];
  // Newest first: the ones before the run's are the ones since, read oldest first.
  for (const change of project.changes.slice(0, at).reverse()) {
    const name = someoneElse(change, directory, selfId);
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Who made a change, unless it was the person or an agent of one of their own harnesses. */
function someoneElse(
  change: Pick<ProjectChange, "by" | "byKind">,
  directory: Directory,
  selfId: string,
): string | undefined {
  if (change.by === selfId) return undefined;
  if (change.byKind === "person") return nameOf(directory, change.by);
  const ownerId = directory[harnessOf(directory, change.by)]?.ownerId;
  if (ownerId === selfId) return undefined;
  const owner = ownerId === undefined ? undefined : directory[ownerId]?.displayName;
  // A harness nobody is recorded as owning: its agent, by its own name.
  return owner === undefined ? nameOf(directory, change.by) : `${owner}'s agent`;
}

/** The amber line when somebody else changed the files since the last run, or nothing. */
function changedByWords(changedBy: readonly string[] | undefined): string | undefined {
  if (changedBy === undefined || changedBy.length === 0) return undefined;
  return `Changed by ${namesInWords(changedBy)} since you last ran it.`;
}

/** A piece of the bar's words: plain, or a command drawn as code. */
export type RunSaid = { readonly text: string } | { readonly code: string };

/** The Run bar, as every device draws it. */
export interface RunBar {
  /** Held when there is nothing to run; ready; starting; running; or finished, by itself or not. */
  readonly kind: "held" | "ready" | "starting" | "running" | "ended";
  readonly title: string;
  /** Beside the title: how long it has run. */
  readonly aside?: string | undefined;
  /**
   * In amber, over the words: since the person last ran it, somebody else changed the files, or the
   * agents changed how it runs.
   */
  readonly changed?: string | undefined;
  readonly said: readonly RunSaid[];
  /** How the words read: plain, good news, or trouble. */
  readonly tone: "plain" | "good" | "bad";
  /** Its last lines, when it ended. */
  readonly lines?: readonly string[] | undefined;
  /** Whether Run is offered, and as what: "Run program", or "Run again". */
  readonly press?: string | undefined;
  readonly stop: boolean;
}

export const RUN_TITLE = "Run program";
/** What runs it once more, while it runs or once it ended. */
export const RUN_AGAIN = "Run again";

/** How long something took: "3 seconds", "2 min", "1 h 5 min". */
function tookWords(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

/** "Runs `npm install`, then `npm run dev` in ~/Chips/Projects/Sudoku mini, then opens localhost:5173." */
function runsWords(recipe: RunRecipe, where: string | undefined): RunSaid[] {
  // Pages that need no starting: "Opens `index.html` from ~/Chips/Projects/Terra Fab Research."
  if (recipe.run === undefined) {
    const from = where === undefined ? " on your Mac." : ` from ${where}.`;
    return [{ text: "Opens " }, { code: recipe.opens ?? "" }, { text: from }];
  }
  const said: RunSaid[] = [{ text: "Runs " }];
  if (recipe.setup !== undefined) said.push({ code: recipe.setup }, { text: ", then " });
  said.push({ code: recipe.run });
  const tail = [
    where === undefined ? " on your Mac" : ` in ${where}`,
    recipe.opens === undefined ? "." : `, then opens ${opensShown(recipe.opens)}.`,
  ].join("");
  said.push({ text: tail });
  return said;
}

export interface RunBarInput {
  /** The recipe the bar shows: the room's, at `main`. */
  readonly recipe: RecipeRead;
  /** How the person's last run stands, as their Mac said. */
  readonly run?: ProjectRun | undefined;
  /** The folder on the Mac, as the person reads it; the phone doesn't know it. */
  readonly where?: string | undefined;
  /** After a press from the phone or the web: how many Macs heard it. */
  readonly macs?: number | undefined;
  /** And whether the server opened Chips for Mac for it first (ADR 0227's second addendum). */
  readonly openedApp?: boolean | undefined;
  /** Why the Mac couldn't run it, in its own words. */
  readonly why?: string | undefined;
  /**
   * Who changed the files since the last run, when it was anyone but the person and their own
   * agents (`changedSince`). The bar says so, and runs it all the same.
   */
  readonly changedBy?: readonly string[] | undefined;
  readonly now?: number | undefined;
}

/** The bar for a room: what it says and offers, from the recipe and the last run. */
export function runBar(input: RunBarInput): RunBar {
  const now = input.now ?? Date.now();
  const { recipe, run } = input;
  if (run?.state === "starting") {
    return { kind: "starting", title: "Starting on your Mac", said: [], tone: "plain", stop: true };
  }
  const changed = changedByWords(input.changedBy);
  if (run?.state === "running") return { ...runningBar(run, now), changed };
  if (run?.why === undefined && (run?.state === "failed" || run?.state === "ended")) {
    return { ...endedBar(run, recipe, now), changed };
  }
  // A run that found its address already answering says so in its own words, plainly (below).
  const refused = run?.state === "opened" ? undefined : run?.why;
  return readyBar({ ...input, why: input.why ?? refused }, now);
}

/** A run going on the Mac: for how long, and what it opened, or what to do where it couldn't. */
function runningBar(run: ProjectRun, now: number): RunBar {
  // Running, but something went wrong: nothing answered, or the browser refused its address
  // (ADR 0230). A Mac from 25 October said so as `why`.
  const trouble = run.trouble ?? run.why;
  const said: RunSaid[] =
    trouble !== undefined
      ? [{ text: trouble }]
      : run.opened === undefined
        ? []
        : [{ text: `Opened ${opensShown(run.opened)} in your browser.` }];
  return {
    kind: "running",
    title: "Running on your Mac",
    aside: run.since === undefined ? undefined : tookWords(now - Date.parse(run.since)),
    said,
    tone: trouble === undefined ? "good" : "plain",
    ...(trouble === undefined || run.lines === undefined ? {} : { lines: run.lines }),
    press: RUN_AGAIN,
    stop: true,
  };
}

/** Under how a run ended: what went wrong in plain words (ADR 0230), else the code it ended with. */
function endedSaid(run: ProjectRun, failed: boolean): RunSaid[] {
  if (!failed) return [];
  if (run.trouble !== undefined) return [{ text: run.trouble }];
  return run.code === undefined ? [] : [{ text: `It ended with code ${run.code}.` }];
}

/** A run that ended: how, and its last lines. */
function endedBar(run: ProjectRun, recipe: RecipeRead, now: number): RunBar {
  const took =
    run.since === undefined || run.ended === undefined
      ? undefined
      : tookWords(Date.parse(run.ended) - Date.parse(run.since));
  const failed = run.state === "failed";
  const title = failed
    ? took === undefined
      ? "It stopped."
      : `It stopped after ${took}.`
    : `It ran and finished${run.ended === undefined ? "" : ` ${lostWords(run.ended, now)}`}.`;
  const ready = recipe !== undefined && !("why" in recipe);
  return {
    kind: "ended",
    title,
    said: endedSaid(run, failed),
    tone: failed ? "bad" : "plain",
    lines: run.lines,
    ...(ready ? { press: RUN_AGAIN } : {}),
    stop: false,
  };
}

/** Nothing running: what a press would run, or why there's nothing to. */
function readyBar(input: RunBarInput, now: number): RunBar {
  const { recipe, run } = input;
  if (recipe === undefined) {
    return {
      kind: "held",
      title: RUN_TITLE,
      said: [{ text: "The agents haven't said how to run this yet." }],
      tone: "plain",
      stop: false,
    };
  }
  if ("why" in recipe) {
    return {
      kind: "held",
      title: RUN_TITLE,
      said: [{ text: recipe.why }],
      tone: "bad",
      stop: false,
    };
  }
  const changed =
    changedByWords(input.changedBy) ??
    (run?.command !== undefined && run.command !== commandOf(recipe)
      ? "Changed since you last ran it."
      : undefined);
  const { said, tone } = readySaid(input, runsWords(recipe, input.where), now);
  return { kind: "ready", title: RUN_TITLE, changed, said, tone, press: RUN_TITLE, stop: false };
}

/** What a ready bar says under Run: what a press runs, or what came of the last one. */
function readySaid(
  input: RunBarInput,
  runs: RunSaid[],
  now: number,
): { readonly said: RunSaid[]; readonly tone: RunBar["tone"] } {
  const { run } = input;
  if (input.macs === 0)
    return { said: [{ text: unheardWords("ran", input.openedApp) }], tone: "bad" };
  if (input.why !== undefined) return { said: [{ text: input.why }], tone: "bad" };
  if (run?.state === "stopped" && run.ended !== undefined) {
    return { said: [...runs, { text: ` Stopped ${lostWords(run.ended, now)}.` }], tone: "plain" };
  }
  if (run?.state !== "opened") return { said: runs, tone: "plain" };
  // The page wouldn't open (ADR 0230).
  if (run.trouble !== undefined) return { said: [{ text: run.trouble }], tone: "bad" };
  // From a Mac before ADR 0230: something already answered where it opens, so Run opened that.
  if (run.why !== undefined) return { said: [{ text: run.why }], tone: "plain" };
  if (run.since === undefined) return { said: runs, tone: "plain" };
  return { said: [...runs, { text: ` Opened ${lostWords(run.since, now)}.` }], tone: "plain" };
}
