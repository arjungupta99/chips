/**
 * Several programs in Universe (ADR 0303): each program's row on the phone's Desktop tab and under
 * Programs on the web and the Mac, Run all in the heading, the banner over the start page, and the
 * program a link on the page needs, found by its port. A run file of one `run` is one program,
 * drawn by `runBar` and `programBanner` as before; these are for a run file that lists programs.
 *
 * The words are here so the phone, the web and the Mac say the same.
 */

import {
  commandOf,
  namesInWords,
  opensShown,
  type Program,
  type ProjectRun,
  type RunFile,
} from "@chipschat/protocol";
import { type BannerKind, PROGRAM_BANNER, type ProgramBanner } from "./programBanner.js";
import { type RunBar, type RunFileRead, type RunSaid, runBar } from "./projectRun.js";
import { unheardWords } from "./yourFolder.js";

/**
 * Whether a run file lists programs by name, each drawn as a row of its own, with Run all once
 * there are two (ADR 0303). A run file of one `run` is the one program, drawn as before.
 */
export function listsPrograms(file: RunFileRead): file is RunFile {
  return (
    file !== undefined &&
    !("why" in file) &&
    file.programs.length > 0 &&
    file.programs.every((program) => program.name !== undefined)
  );
}

/** What a phone says of a run file of programs where its server holds one run per room. */
export const PROGRAMS_NEED_UPDATE =
  "This space runs several programs. Update Chips on your computer to run them from here.";

/**
 * The run file as a device can run it: a run file of programs, where the server doesn't hold a run
 * per program (an older computer), can't be run from here yet, since their runs would mix.
 */
export function runFileHere(file: RunFileRead, keepsPrograms: boolean | undefined): RunFileRead {
  return keepsPrograms === false && file !== undefined && !("why" in file) && named(file)
    ? { why: PROGRAMS_NEED_UPDATE }
    : file;
}

const named = (file: RunFile): boolean =>
  file.programs.some((program) => program.name !== undefined);

/** The runs as a device holds them: the one program's, and each listed program's by name. */
export interface RunsHeld {
  readonly run?: ProjectRun | undefined;
  readonly programs?: Readonly<Record<string, ProjectRun>> | undefined;
}

/** A program's run among them, by its name ignoring case; the one program's for one with none. */
export function runOf(runs: RunsHeld, program: Pick<Program, "name">): ProjectRun | undefined {
  const { name } = program;
  if (name === undefined) return runs.run;
  const key = Object.keys(runs.programs ?? {}).find(
    (each) => each.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : runs.programs?.[key];
}

/** A program's row, as every device draws it (mock A of ADR 0303). */
export interface ProgramRow {
  readonly name: string;
  readonly kind: "ready" | "starting" | "running" | "ended";
  /** Drawn first, in green: "Running". */
  readonly state?: string | undefined;
  readonly said: readonly RunSaid[];
  /** How the words read: plain, good news, or trouble. */
  readonly tone: "plain" | "good" | "bad";
  /** In amber, over the words: somebody else changed the files, or the agents changed how it runs. */
  readonly changed?: string | undefined;
  /** Its last lines, when it ended, or while it runs and something went wrong. */
  readonly lines?: readonly string[] | undefined;
  /** Run, at the row's right, while it doesn't run. */
  readonly run: boolean;
  /** It never started: something it needs didn't (ADR 0303). The banner names that one first. */
  readonly neverRan?: boolean | undefined;
  /** Open, while it runs: the address it serves, which the Mac opens again. */
  readonly open?: string | undefined;
  readonly stop: boolean;
}

export interface ProgramRowInput {
  readonly program: Program & { readonly name: string };
  /** How the person's last run of it stands, as their Mac said. */
  readonly run?: ProjectRun | undefined;
  /** After a press from the phone or the web: how many Macs heard it. */
  readonly macs?: number | undefined;
  /** And whether the server opened Chips for Mac for it first. */
  readonly openedApp?: boolean | undefined;
  /** Why the press didn't reach a Mac, or why the Mac didn't run it, in its words. */
  readonly why?: string | undefined;
  /** Who changed the files since the last run, when anyone but the person and their agents did. */
  readonly changedBy?: readonly string[] | undefined;
  readonly now?: number | undefined;
}

/** "Shop needs it", "Shop and Admin need it". */
function needWords(names: readonly string[]): string {
  return `${namesInWords(names)} ${names.length === 1 ? "needs" : "need"} it`;
}

/** What a row says Run runs, short: "`npm install`, then `npm run dev` in shop/". */
function runsShort(program: Program & { readonly run?: string | undefined }): RunSaid[] {
  const said: RunSaid[] = [];
  if (program.setup !== undefined) said.push({ code: program.setup }, { text: ", then " });
  said.push({ code: program.run ?? "" });
  if (program.in !== undefined) said.push({ text: ` in ${program.in}/` });
  return said;
}

/** A program's row: what it says and offers, from its recipe and its last run. */
export function programRow(input: ProgramRowInput): ProgramRow {
  const { program, run } = input;
  const name = program.name;
  if (run?.state === "starting") {
    const fors = run.runs_for ?? [];
    return {
      name,
      kind: "starting",
      said: [{ text: fors.length === 0 ? "Starting…" : `Starting · ${needWords(fors)}` }],
      tone: "plain",
      run: false,
      stop: true,
    };
  }
  if (run?.state === "running") return runningRow(name, run);
  const bar = runBar({
    recipe: program,
    run,
    macs: input.macs,
    openedApp: input.openedApp,
    why: input.why,
    changedBy: input.changedBy,
    now: input.now,
  });
  if (bar.kind === "ended") return endedRow(name, bar, run);
  return readyRow(input, bar);
}

/** A program running: for whom, at which address or port, or what went wrong. */
function runningRow(name: string, run: ProjectRun): ProgramRow {
  const trouble = run.trouble ?? run.why;
  const opened =
    run.opened !== undefined && /^https?:\/\//i.test(run.opened) ? run.opened : undefined;
  const base = {
    name,
    kind: "running" as const,
    run: false,
    stop: true,
    ...(opened === undefined ? {} : { open: opened }),
  };
  if (trouble !== undefined) {
    return {
      ...base,
      said: [{ text: trouble }],
      tone: "plain",
      ...(run.lines === undefined ? {} : { lines: run.lines }),
    };
  }
  return { ...base, state: "Running", said: [{ text: whereWords(run, opened) }], tone: "good" };
}

/** After "Running": for whom, at the address it opened, on its port, or on the Mac. */
function whereWords(run: ProjectRun, opened: string | undefined): string {
  const fors = run.runs_for ?? [];
  if (fors.length > 0) return ` for ${namesInWords(fors)}`;
  if (opened !== undefined) return ` at ${opensShown(opened)}`;
  return run.listens === undefined ? " on your Mac" : ` on ${portWords(run.listens)}`;
}

/** "port 8000", or the address as Run shows it where it names no port. */
function portWords(address: string): string {
  const port = portOf(address);
  return port === undefined ? opensShown(address) : `port ${port}`;
}

/**
 * A program that ended: how, in the run bar's words, and its last lines. One that never started,
 * since something it needs didn't, says only that: it didn't stop, it never ran.
 */
function endedRow(name: string, bar: RunBar, run: ProjectRun | undefined): ProgramRow {
  const neverRan = run?.state === "failed" && run.since === undefined && bar.said.length > 0;
  const said: RunSaid[] = neverRan ? [...bar.said] : [{ text: bar.title }];
  if (!neverRan && bar.said.length > 0) said.push({ text: " " }, ...bar.said);
  return {
    name,
    kind: "ended",
    said,
    ...(neverRan ? { neverRan } : {}),
    tone: bar.tone === "bad" ? "bad" : "plain",
    changed: bar.changed,
    ...(bar.lines === undefined ? {} : { lines: bar.lines }),
    run: bar.press !== undefined,
    stop: false,
  };
}

/** A program not running: what Run runs, or why the last press did nothing. */
function readyRow(input: ProgramRowInput, bar: RunBar): ProgramRow {
  const { program, run } = input;
  const unheard = input.macs === 0 ? unheardWords("ran", input.openedApp) : (input.why ?? run?.why);
  const changed =
    bar.changed ??
    (run?.command !== undefined && run.command !== commandOf(program)
      ? "Changed since you last ran it."
      : undefined);
  return {
    name: program.name,
    kind: "ready",
    said: unheard === undefined ? runsShort(program) : [{ text: unheard }],
    tone: unheard === undefined ? "plain" : "bad",
    changed,
    run: true,
    stop: false,
  };
}

/** Whether a row's program is running, or on its way. */
const isUp = (row: Pick<ProgramRow, "kind">): boolean =>
  row.kind === "running" || row.kind === "starting";

/**
 * Run all in the Programs heading, or Stop all once every program runs (ADR 0303). Shown once
 * there are two programs.
 */
export function programsHeading(rows: readonly Pick<ProgramRow, "kind">[]): "run" | "stop" {
  return rows.length > 0 && rows.every(isUp) ? "stop" : "run";
}

export const RUN_ALL = "Run all";
export const STOP_ALL = "Stop all";

/** The banner's words for a row's trouble: "Admin: It stopped after 2 min. …". */
function rowText(row: ProgramRow): string {
  return `${row.name}: ${row.said.map((piece) => ("code" in piece ? piece.code : piece.text)).join("")}`;
}

/**
 * The banner over the start page of a space with several programs (ADR 0303): which are off and
 * which run, with Run all, Run on the one that's off, or Stop all. `press` and `program` say what
 * its button does: Run or Stop, of one program by name, or of every program.
 */
export function programsBanner(rows: readonly ProgramRow[]): ProgramBanner {
  if (rows.some((row) => row.kind === "starting")) {
    return {
      kind: "starting",
      title: "Starting on your Mac",
      body: PROGRAM_BANNER.startingBody,
      tone: "plain",
      press: "stop",
      label: STOP_ALL,
    };
  }
  if (rows.every(isUp)) {
    return {
      kind: "running",
      title: "Running on your Mac",
      body: PROGRAM_BANNER.runningBody,
      tone: "plain",
      press: "stop",
      label: rows.length === 1 ? "Stop" : STOP_ALL,
      settles: true,
    };
  }
  return offBanner(rows);
}

/** Which programs are off, and which run: what the banner says while any isn't running. */
function offBanner(rows: readonly ProgramRow[]): ProgramBanner {
  const off = rows.filter((row) => !isUp(row));
  const up = rows.filter((row) => row.kind === "running");
  // What went wrong first: a program that failed, before one that never ran for it.
  const bad =
    off.find((row) => row.tone === "bad" && row.neverRan !== true) ??
    off.find((row) => row.tone === "bad");
  const changed = off.find((row) => row.changed !== undefined)?.changed;
  // One program off, beside others running or alone: its banner names it, and Run runs it.
  const one = off.length === 1 && (up.length > 0 || rows.length === 1) ? off[0] : undefined;
  return {
    kind: "off",
    title: offTitle(off, up, one),
    body: (bad === undefined ? undefined : rowText(bad)) ?? changed ?? offBody(off, up, one, rows),
    tone: bad !== undefined ? "bad" : changed !== undefined ? "changed" : "plain",
    press: "run",
    ...(one === undefined ? { label: RUN_ALL } : { program: one.name, label: `Run ${one.name}` }),
  };
}

const namesOf = (rows: readonly ProgramRow[]): string => namesInWords(rows.map((row) => row.name));

function offTitle(
  off: readonly ProgramRow[],
  up: readonly ProgramRow[],
  one: ProgramRow | undefined,
): string {
  if (one !== undefined) return `${one.name} isn’t running`;
  return up.length === 0 ? "Programs aren’t running" : `${namesOf(off)} aren’t running`;
}

function offBody(
  off: readonly ProgramRow[],
  up: readonly ProgramRow[],
  one: ProgramRow | undefined,
  rows: readonly ProgramRow[],
): string {
  if (rows.length === 1) return PROGRAM_BANNER.offBody;
  if (up.length === 0) return "Some links here open only while they run on your Mac.";
  const are = up.length === 1 ? "is" : "are";
  const them = one === undefined ? "them" : one.name;
  const run = one === undefined || off.length > 1 ? "they run" : "it runs";
  return `${namesOf(up)} ${are}. Links to ${them} open once ${run}.`;
}

/** The port an address names, or the one its scheme uses; nothing for what isn't an address. */
function portOf(address: string): string | undefined {
  try {
    const url = new URL(address);
    if (url.port !== "") return url.port;
    return url.protocol === "https:" ? "443" : "80";
  } catch {
    return undefined;
  }
}

/**
 * The program a link on the page needs (ADR 0303): the one on the link's port, by where its run
 * file opens or where it was last heard to listen. Nothing for a port no program has.
 */
export function programOfLink(
  url: string,
  file: RunFile,
  runs: RunsHeld,
): (Program & { readonly name: string }) | undefined {
  const port = /^https?:\/\//i.test(url) ? portOf(url) : undefined;
  if (port === undefined) return undefined;
  for (const program of file.programs) {
    if (program.name === undefined) continue;
    const run = runOf(runs, program);
    const heard = [program.opens, run?.listens, run?.opened].filter(
      (each): each is string => each !== undefined && /^https?:\/\//i.test(each),
    );
    if (heard.some((each) => portOf(each) === port)) return { ...program, name: program.name };
  }
  return undefined;
}

/** How a link's program stands, as the banner would say it: one program's row, or all of them. */
export function linkKind(
  row: Pick<ProgramRow, "kind"> | undefined,
  rows: readonly ProgramRow[],
): BannerKind {
  if (row === undefined)
    return rows.every((each) => each.kind === "running") ? "running" : programsBanner(rows).kind;
  if (row.kind === "ready") return "off";
  return row.kind;
}
