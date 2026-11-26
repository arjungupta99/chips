/**
 * A run file of several programs, run on the Mac (ADR 0303). Each program is one run of `run.ts`'s,
 * in its own folder of the project and its own runs folder, `runs/<space>/programs/<name>`. Run on
 * a program starts what it needs first and waits for each to answer; those it started run for it,
 * and Stop on it stops them with it unless another running program still needs them. Run all
 * starts every program that isn't running, the needed ones first; Stop all stops every one.
 *
 * A run file of one `run` is one program with no name, run in `runs/<space>` as before. Any press
 * also stops what a program the run file no longer has left running, so nothing holds a port with
 * no Stop.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  commandOf,
  neededBy,
  type Program,
  type ProjectRun,
  programNamed,
  programsInOrder,
  RUN_FILE,
  RUN_FILE_BEFORE,
  type RunFile,
  runPrograms,
} from "@chipschat/protocol";
import {
  markUnstarted,
  type RunDeps,
  realIn,
  runStatus,
  runsForOf,
  runsOf,
  setRunsFor,
  startRun,
  stopRun,
} from "./run.js";

/** How a room's runs stand: the one program's, and each listed program's by name. */
export interface Runs {
  readonly run?: ProjectRun | undefined;
  readonly programs?: Readonly<Record<string, ProjectRun>> | undefined;
}

/**
 * The run file in the folder, read as programs: nothing when there is none, or what is wrong with
 * it. `.chips/run.json`, or, with none, `chips.json` at the top.
 */
export async function readPrograms(
  folder: string,
): Promise<RunFile | { readonly why: string } | undefined> {
  for (const file of [RUN_FILE, RUN_FILE_BEFORE]) {
    let text: string;
    try {
      text = await readFile(join(folder, file), "utf8");
    } catch {
      continue;
    }
    return runPrograms(text, file);
  }
  return undefined;
}

/** A program's run: the room's deps, for this program's runs folder. */
const forProgram = (deps: RunDeps, program: Program): RunDeps => ({
  ...deps,
  program: program.name,
});

/** The programs a room has runs folders for on this Mac, by the names they were run as. */
async function namesRun(deps: RunDeps): Promise<readonly string[]> {
  const at = join(runsOf(deps.home, deps.spaceId), "programs");
  let folders: string[];
  try {
    folders = await readdir(at);
  } catch {
    return [];
  }
  const names = await Promise.all(
    folders.map(async (folder) => {
      try {
        return (await readFile(join(at, folder, "name"), "utf8")).trim();
      } catch {
        return "";
      }
    }),
  );
  return names.filter((name) => name !== "");
}

/** Whether anything of a run still goes. */
const goes = (run: ProjectRun): boolean => run.state === "running" || run.state === "starting";

/** Whether a room's one unnamed program has ever run here. */
async function ranAlone(deps: RunDeps): Promise<boolean> {
  try {
    await stat(join(runsOf(deps.home, deps.spaceId), "command"));
    return true;
  } catch {
    return false;
  }
}

/**
 * How every run of the room stands: the one program's, when it ever ran here, and each program's
 * that ran, by name, with the programs a need runs for that are still running.
 */
export async function runsStatus(deps: RunDeps): Promise<Runs> {
  const names = await namesRun(deps);
  const run = names.length === 0 || (await ranAlone(deps)) ? await runStatus(deps) : undefined;
  if (names.length === 0) return { run };
  const stands = await Promise.all(names.map((name) => runStatus({ ...deps, program: name })));
  const going = new Set(names.filter((_, at) => goes(stands[at] as ProjectRun)).map(low));
  const programs: Record<string, ProjectRun> = {};
  for (const [at, name] of names.entries()) {
    const stand = stands[at] as ProjectRun;
    const fors = goes(stand)
      ? (await runsForOf({ ...deps, program: name })).filter((each) => going.has(low(each)))
      : [];
    programs[name] = fors.length === 0 ? stand : { ...stand, runs_for: fors };
  }
  return { ...(run === undefined ? {} : { run }), programs };
}

const low = (name: string): string => name.toLowerCase();

/**
 * The folder a program runs in, or why it can't: its `in` has to be a folder of the project, after
 * links, which may point anywhere on the Mac (SEC-55).
 */
export async function whereOf(
  folder: string,
  program: Program,
): Promise<{ readonly at: string } | { readonly why: string }> {
  if (program.in === undefined) return { at: folder };
  const real = await realIn(folder, program.in);
  const isFolder =
    real !== undefined &&
    (await stat(real).then(
      (each) => each.isDirectory(),
      () => false,
    ));
  return isFolder
    ? { at: join(folder, program.in) }
    : {
        why: `${program.in} isn't a folder of your project yet, so Chips didn't run ${program.name}.`,
      };
}

/**
 * Run what a press names (ADR 0303): one program and what it needs, or, named nothing, every
 * program that isn't running. What a program the run file no longer has left running is stopped
 * first. The answer is how every run of the room stands then.
 */
export async function startPrograms(
  folder: string,
  file: RunFile,
  name: string | undefined,
  deps: RunDeps,
): Promise<Runs | { readonly refused: string }> {
  for (const program of programsInOrder(file, name)) {
    const where = await whereOf(folder, program);
    if ("why" in where) return { refused: where.why };
  }
  await stopLeftOver(file, deps);
  const [only] = file.programs;
  if (only !== undefined && only.name === undefined) {
    await startRun(folder, only, deps);
    return await runsStatus(deps);
  }
  if (name === undefined) await runEvery(folder, file, deps);
  else await runOne(folder, file, name, deps);
  return await runsStatus(deps);
}

/** One program, after what it needs: those already running run for it too, the rest start for it. */
async function runOne(folder: string, file: RunFile, name: string, deps: RunDeps): Promise<void> {
  const order = programsInOrder(file, name);
  const pressed = order.at(-1);
  if (pressed === undefined) return;
  for (const need of order.slice(0, -1)) {
    const started = await needFor(folder, file, need, pressed, deps);
    if (!started) return await unstarted(pressed, need, deps);
  }
  await start(folder, file, pressed, deps, []);
}

/** A need of the pressed program running: started for it, or now running for it too. */
async function needFor(
  folder: string,
  file: RunFile,
  need: Program,
  pressed: Program,
  deps: RunDeps,
): Promise<boolean> {
  const at = forProgram(deps, need);
  const stands = await runStatus(at);
  if (goes(stands)) {
    const fors = await runsForOf(at);
    // One the person ran is theirs: it isn't stopped with the program it runs for.
    if (fors.length > 0 && !fors.some((each) => low(each) === low(pressed.name ?? ""))) {
      await setRunsFor(at, [...fors, pressed.name ?? ""]);
    }
    return true;
  }
  return goes(await start(folder, file, need, deps, [pressed.name ?? ""]));
}

/** Every program that isn't running, the needed ones first; one whose need didn't start says so. */
async function runEvery(folder: string, file: RunFile, deps: RunDeps): Promise<void> {
  const failed: Program[] = [];
  for (const program of programsInOrder(file)) {
    const need = needed(file, program).find((each) => failed.includes(each));
    if (need !== undefined) {
      failed.push(program);
      await unstarted(program, need, deps);
      continue;
    }
    const stands = await runStatus(forProgram(deps, program));
    if (goes(stands)) continue;
    if (!goes(await start(folder, file, program, deps, []))) failed.push(program);
  }
}

/** The programs one program needs, directly or through others. */
function needed(file: RunFile, program: Program): readonly Program[] {
  return programsInOrder(file, program.name).slice(0, -1);
}

/** One program started in its folder, as its run file says, for those named (none: the person's). */
async function start(
  folder: string,
  file: RunFile,
  program: Program,
  deps: RunDeps,
  runsFor: readonly string[],
): Promise<ProjectRun> {
  const where = await whereOf(folder, program);
  if ("why" in where) return { state: "failed", trouble: where.why };
  return await startRun(where.at, program, forProgram(deps, program), {
    opensPrinted: neededBy(file, program.name ?? "").length === 0,
    runsFor,
    command: commandOf(program),
  });
}

/** A program not run because something it needs didn't start: its row says which. */
async function unstarted(program: Program, need: Program, deps: RunDeps): Promise<void> {
  await markUnstarted(
    forProgram(deps, program),
    commandOf(program),
    `${need.name} didn't start, so Chips didn't run ${program.name}. ${need.name}'s row says why.`,
  );
}

/**
 * Stop what a press names (ADR 0303): a program, then each need that ran only for programs no
 * longer running; or, named nothing, every program, and whatever a run file before this one left.
 * `file` is the run file as the folder has it, when it can be read: without it, the program alone.
 */
export async function stopPrograms(
  file: RunFile | undefined,
  name: string | undefined,
  deps: RunDeps,
): Promise<Runs> {
  if (name === undefined) {
    await stopRun(deps);
    for (const each of await namesRun(deps)) await stopRun({ ...deps, program: each });
    return await runsStatus(deps);
  }
  await stopRun({ ...deps, program: name });
  if (file !== undefined) await stopNeeds(file, name, deps);
  return await runsStatus(deps);
}

/** After a program stopped: each need it was started for that no running program needs any more. */
async function stopNeeds(file: RunFile, name: string, deps: RunDeps): Promise<void> {
  const needs = programsInOrder(file, name).slice(0, -1).reverse();
  for (const need of needs) {
    const at = forProgram(deps, need);
    const fors = await runsForOf(at);
    // One the person ran themselves, or that isn't running, is left as it is.
    if (fors.length === 0 || !goes(await runStatus(at))) continue;
    const still = await stillRunning(
      file,
      fors.filter((each) => low(each) !== low(name)),
      deps,
    );
    if (still.length > 0) await setRunsFor(at, still);
    else await stopRun(at);
  }
}

/** Those of these programs, by name, that the run file lists and are running. */
async function stillRunning(
  file: RunFile,
  names: readonly string[],
  deps: RunDeps,
): Promise<string[]> {
  const still: string[] = [];
  for (const each of names) {
    const other = programNamed(file, each);
    if (other !== undefined && goes(await runStatus(forProgram(deps, other)))) still.push(each);
  }
  return still;
}

/**
 * What a run file before this one left running: the one unnamed program, where the file now lists
 * programs, and any program it no longer lists; where it says one `run`, every listed program.
 */
async function stopLeftOver(file: RunFile, deps: RunDeps): Promise<void> {
  const listed = file.programs.flatMap((program) =>
    program.name === undefined ? [] : [low(program.name)],
  );
  for (const name of await namesRun(deps)) {
    if (!listed.includes(low(name))) await stopRun({ ...deps, program: name });
  }
  if (listed.length > 0 && (await ranAlone(deps))) await stopRun(deps);
}
