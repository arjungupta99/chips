/**
 * Several programs under Programs in Universe (ADR 0303): a row for each program of a run file
 * that lists them, with its own Run, Open and Stop, and Run all in the heading (Stop all once
 * every program runs). On the Mac they run here, from the room's folder; in a browser each press
 * goes to the person's Mac, and what that Mac says comes back here. What a row says is core's
 * `programRow`, as the phone's is.
 */

import {
  type MacRunAsk,
  type MacsHeard,
  type ProgramRow,
  programRow,
  programsHeading,
  RUN_ALL,
  type RunsHeld,
  runOf,
  STOP_ALL,
} from "@chipschat/core";
import {
  type HeldRun,
  type Program,
  type ProjectRun,
  pressCommand,
  type RunFile,
} from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Folders, Room } from "../folders.ts";
import { Heading } from "./parts.tsx";
import type { ChangedSince, RunOnMac } from "./RunBar.tsx";

/** The programs as this client holds them, and the presses that run, stop and show them. */
export interface ProgramsHere {
  readonly file: RunFile;
  readonly runs: RunsHeld;
  readonly rows: readonly ProgramRow[];
  /** The program a press is under way for, or `all`; nothing while none is. */
  readonly busy: string | undefined;
  /** Run or Stop one program by name, or every program; how many Macs heard it, or why not. */
  readonly press: (ask: MacRunAsk) => Promise<MacsHeard | { readonly failed: string }>;
  /** Open what a running program serves, in the Mac's browser. */
  readonly show: (program: string) => void;
}

/** What the last press from here came to, for the row it was for. */
interface Pressed {
  readonly program: string | undefined;
  readonly macs?: number | undefined;
  readonly openedApp?: boolean | undefined;
  readonly failed?: string | undefined;
}

/** The time a running program's minutes are counted from, kept current while one runs. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, [running]);
  return running ? Math.max(now, Date.now()) : Date.now();
}

/** The rows for the programs, from the runs held and what the last press came to. */
function rowsOf(
  file: RunFile,
  runs: RunsHeld,
  pressed: Pressed | undefined,
  changedSince: ChangedSince | undefined,
  now: number,
): readonly ProgramRow[] {
  return file.programs.flatMap((program) => {
    if (program.name === undefined) return [];
    const run = runOf(runs, program);
    const mine =
      pressed !== undefined &&
      (pressed.program === undefined || same(pressed.program, program.name));
    return [
      programRow({
        program: program as Program & { readonly name: string },
        run,
        ...(mine ? { macs: pressed.macs, openedApp: pressed.openedApp, why: pressed.failed } : {}),
        changedBy: changedSince?.(run?.commit),
        now,
      }),
    ];
  });
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** What a press asks of the Mac: Run with what it starts, Stop, or Show. */
export function askFor(
  file: RunFile,
  op: "run" | "stop" | "show",
  program: string | undefined,
): MacRunAsk {
  const named = program === undefined ? {} : { program };
  if (op === "run") return { op, command: pressCommand(file, program), ...named };
  return { op, ...named };
}

/** On the Mac: the programs run here, from the room's folder, as the Mac's folders keep them. */
export function useMacPrograms(props: {
  readonly room: Room;
  readonly folders: Folders;
  readonly file: RunFile;
  readonly changedSince?: ChangedSince | undefined;
  readonly ticks?: boolean | undefined;
}): ProgramsHere {
  const { room, folders, file } = props;
  const state = useSyncExternalStore(folders.subscribe, () => folders.state(room.id));
  const [pressing, setPressing] = useState<string | undefined>();
  const runs: RunsHeld = { run: state.run, programs: state.programs };
  const now = useNow(props.ticks !== false && Object.values(state.programs ?? {}).some(running));
  const pressed: Pressed | undefined =
    state.failed === undefined ? undefined : { program: pressing, failed: state.failed };
  return {
    file,
    runs,
    rows: rowsOf(file, runs, pressed, props.changedSince, now),
    busy: state.busy === "run" || state.busy === "stop" ? (pressing ?? "all") : undefined,
    press: async (ask) => {
      if (ask.op === "show") return show(ask.program);
      setPressing(ask.program);
      await folders.run(room, ask.op, {
        ...(ask.op === "run" ? { command: ask.command } : {}),
        ...(ask.program === undefined ? {} : { program: ask.program }),
      });
      const failed = folders.state(room.id).failed;
      return failed === undefined ? { macs: 1 } : { failed };
    },
    show: (program) => void show(program),
  };
  async function show(program: string | undefined): Promise<MacsHeard> {
    await folders.show(room, program);
    return { macs: 1 };
  }
}

const running = (run: ProjectRun | undefined): boolean => run?.state === "running";

/** In a browser: each press goes to the person's Mac, and each program's word comes back. */
export function useAwayPrograms(props: {
  readonly runs: RunOnMac;
  readonly file: RunFile;
  readonly changedSince?: ChangedSince | undefined;
  readonly ticks?: boolean | undefined;
}): ProgramsHere {
  const { runs: asking, file } = props;
  const [runs, setRuns] = useState<{
    readonly run?: HeldRun | undefined;
    readonly programs: Readonly<Record<string, HeldRun>>;
  }>({ programs: {} });
  const [pressed, setPressed] = useState<Pressed | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: read and heard once for the room; `runs` is made anew as the page draws.
  useEffect(() => {
    let live = true;
    asking.read().then(
      (answer) =>
        live &&
        setRuns((was) => ({
          run: was.run ?? answer.run,
          programs: { ...answer.programs, ...was.programs },
        })),
      () => undefined,
    );
    const unhear = asking.heard((heard, program) => {
      setRuns((was) =>
        program === undefined
          ? { ...was, run: heard }
          : { ...was, programs: { ...withoutName(was.programs, program), [program]: heard } },
      );
      setPressed(undefined);
    });
    return () => {
      live = false;
      unhear();
    };
  }, [asking.room]);
  const now = useNow(props.ticks !== false && Object.values(runs.programs).some(running));
  const press = async (ask: MacRunAsk): Promise<MacsHeard | { readonly failed: string }> => {
    setBusy(ask.program ?? "all");
    setPressed(undefined);
    try {
      const heard = await asking.ask(ask);
      if (ask.op !== "show") {
        setPressed({
          program: ask.program,
          macs: heard.macs,
          openedApp: heard.opened_app === true,
        });
      }
      return heard;
    } catch (error) {
      const failed = error instanceof Error ? error.message : String(error);
      setPressed({ program: ask.program, failed });
      return { failed };
    } finally {
      setBusy(undefined);
    }
  };
  return {
    file,
    runs,
    rows: rowsOf(file, runs, pressed, props.changedSince, now),
    busy,
    press,
    show: (program) => void press({ op: "show", program }),
  };
}

/** The runs kept by name, without the one of this name said another way. */
function withoutName<Run>(
  programs: Readonly<Record<string, Run>>,
  name: string,
): Record<string, Run> {
  return Object.fromEntries(Object.entries(programs).filter(([each]) => !same(each, name)));
}

/** On the Mac: the heading and a row for each program, run here. */
export function MacPrograms(props: Parameters<typeof useMacPrograms>[0]) {
  return <ProgramsView here={useMacPrograms(props)} />;
}

/** In a browser: the heading and a row for each program, each press to the person's Mac. */
export function AwayPrograms(props: Parameters<typeof useAwayPrograms>[0]) {
  return <ProgramsView here={useAwayPrograms(props)} />;
}

/** Programs, with Run all or Stop all, over a row for each program. */
export function ProgramsView({ here }: { readonly here: ProgramsHere }) {
  const all = programsHeading(here.rows);
  return (
    <>
      <div className="programs-head">
        <Heading>Programs</Heading>
        {here.rows.length > 1 && (
          <button
            type="button"
            className="programs-all"
            data-all={all}
            disabled={here.busy !== undefined}
            onClick={() => void here.press(askFor(here.file, all, undefined))}
            data-testid="programs-all"
          >
            <Icon name={all === "run" ? "play" : "stop"} size={11} />
            {all === "run" ? RUN_ALL : STOP_ALL}
          </button>
        )}
      </div>
      <div className="programs" data-testid="programs">
        {here.rows.map((row) => (
          <ProgramRowView key={row.name} row={row} here={here} />
        ))}
      </div>
    </>
  );
}

/** One program: how it stands, and its Run, or its Open and Stop. */
function ProgramRowView({ row, here }: { readonly row: ProgramRow; readonly here: ProgramsHere }) {
  const busy = here.busy !== undefined && (here.busy === "all" || same(here.busy, row.name));
  return (
    <div className="program-row" data-kind={row.kind} data-testid={`program-${row.name}`}>
      <span className="program-mark" data-kind={row.kind} data-tone={row.tone} aria-hidden="true">
        {row.kind === "ready" || row.kind === "ended" ? <Icon name="play" size={12} /> : null}
      </span>
      <div className="program-words">
        <b className="program-name">{row.name}</b>
        {row.changed !== undefined && <span className="program-changed">{row.changed}</span>}
        <span
          className="program-said"
          data-tone={row.tone}
          data-testid={`program-${row.name}-said`}
        >
          {row.state !== undefined && <b className="program-state">{row.state}</b>}
          {row.said.map((piece, at) =>
            "code" in piece ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are one sentence, in order.
              <code key={at}>{piece.code}</code>
            ) : (
              piece.text
            ),
          )}
        </span>
      </div>
      <ProgramActs row={row} here={here} busy={busy} />
      {(row.lines?.length ?? 0) > 0 && (
        <pre className="run-bar-lines program-lines" data-testid={`program-${row.name}-lines`}>
          {row.lines?.join("\n")}
        </pre>
      )}
    </div>
  );
}

/** A program's buttons: Run while it doesn't run; a dim Starting; Open and Stop while it runs. */
function ProgramActs({
  row,
  here,
  busy,
}: {
  readonly row: ProgramRow;
  readonly here: ProgramsHere;
  readonly busy: boolean;
}) {
  return (
    <div className="program-acts">
      {row.kind === "starting" && (
        <button type="button" className="program-run" data-dim disabled tabIndex={-1}>
          Starting
        </button>
      )}
      {row.run && (
        <button
          type="button"
          className="program-run"
          disabled={busy}
          onClick={() => void here.press(askFor(here.file, "run", row.name))}
          aria-label={`Run ${row.name}`}
          data-testid={`program-${row.name}-run`}
        >
          <Icon name="play" size={11} />
          Run
        </button>
      )}
      {row.open !== undefined && (
        <button
          type="button"
          className="program-open"
          onClick={() => here.show(row.name)}
          aria-label={`Open ${row.name}`}
          data-testid={`program-${row.name}-open`}
        >
          Open
        </button>
      )}
      {row.stop && (
        <button
          type="button"
          className="program-stop"
          disabled={busy && row.kind !== "running"}
          onClick={() => void here.press(askFor(here.file, "stop", row.name))}
          aria-label={`Stop ${row.name}`}
          data-testid={`program-${row.name}-stop`}
        >
          <Icon name="stop" size={11} />
        </button>
      )}
    </div>
  );
}
