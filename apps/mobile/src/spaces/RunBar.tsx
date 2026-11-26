/**
 * Run program (ADRs 0226, 0227), the first row of Universe's Desktop tab (its second addendum): the
 * press goes to the person's own Chips for Mac, which runs the project as its run file says, and
 * what that Mac says comes back here. What the bar says is `@chipschat/core`'s `runBar`, as the
 * web's and the Mac's is.
 */

import {
  commandOf,
  MAC_ROWS,
  type MacRunAsk,
  type MacsHeard,
  type ProgramRow,
  programRow,
  programsHeading,
  type RecipeRead,
  RUN_AGAIN,
  RUN_ALL,
  type RunBar,
  type RunsHeld,
  runBar,
  runOf,
  STOP_ALL,
} from "@chipschat/core";
import {
  type HeldRun,
  type Program,
  type ProjectRunAnswer,
  pressCommand,
  type RunFile,
} from "@chipschat/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Swap } from "../ui/Swap";
import { usePalette } from "../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Opening, Squeeze } from "./MacMotion";
import { MacRow, type MarkKind, RowButton, RowMark, UNDER_INSET } from "./MacRow";

/** How the phone asks the person's Mac, and hears back. */
export interface RunOnMac {
  /** The room: what is read and heard again for, rather than each time the page draws. */
  readonly room: string;
  readonly ask: (ask: MacRunAsk) => Promise<MacsHeard>;
  readonly read: () => Promise<ProjectRunAnswer>;
  /** Each word from the Mac, and which program of a run file that lists them it is (ADR 0303). */
  readonly heard: (listen: (run: HeldRun, program: string | undefined) => void) => () => void;
  /** Who changed the files since a run at this commit, when anybody but the person did (SEC-40). */
  readonly changedSince?: ((commit: string | undefined) => readonly string[]) | undefined;
}

/** How long a press waits on the Mac that heard it before it can be pressed again regardless. */
const HEARD_WAIT_MS = 10_000;

/** The time a running run's minutes are counted from, kept current while it runs. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, [running]);
  return running ? Math.max(now, Date.now()) : Date.now();
}

/** A press to the person's Mac: run the program as the recipe says, or stop it. */
export type MacAsk = { readonly op: "run"; readonly command: string } | { readonly op: "stop" };

/**
 * How the person's run of the room stands, as their Mac last said, and the press that asks it to
 * run or stop. The Desktop tab's bar holds one; Universe holds one for the banner over the page and
 * the sheet a link brings up (ADR 0227's addendum of 9 November 2026), and hands it to the bar.
 */
export interface RunHeld {
  readonly run: HeldRun | undefined;
  /** After a press: how many Macs heard it. */
  readonly macs: number | undefined;
  /** And whether the server opened Chips for Mac for it first (ADR 0227's second addendum). */
  readonly openedApp: boolean;
  /** Why the press didn't reach the server. */
  readonly failed: string | undefined;
  /** Asking, or waiting on what the Mac that heard it says. */
  readonly busy: boolean;
  /** The first read has answered: until then what the run is isn't known, not "not running". */
  readonly known: boolean;
  /** Ask the Mac; what came of it, or why the ask itself failed. */
  readonly press: (ask: MacAsk) => Promise<MacsHeard | { readonly failed: string }>;
}

/**
 * The person's run of the room, read once and heard as their Mac says more; nothing is read or
 * heard while `live` is off (a space with no program, or a Universe put away).
 */
export function useRunOnMac(runs: RunOnMac, live = true): RunHeld {
  const [run, setRun] = useState<HeldRun | undefined>();
  const [macs, setMacs] = useState<number | undefined>();
  const [openedApp, setOpenedApp] = useState(false);
  const [asking, setAsking] = useState(false);
  // A Mac heard the press: the button waits on what that Mac says, so Run isn't offered again for
  // the moment before it says it is starting, nor Stop before it says it stopped.
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
  const [known, setKnown] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const given = setTimeout(() => setWaiting(false), HEARD_WAIT_MS);
    return () => clearTimeout(given);
  }, [waiting]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read and heard once for the room; `runs` is made anew as the page draws.
  useEffect(() => {
    if (!live) return;
    let still = true;
    runs.read().then(
      (answer) => {
        if (!still) return;
        setRun((was) => was ?? answer.run);
        setKnown(true);
      },
      () => still && setKnown(true),
    );
    const unhear = runs.heard((heard, program) => {
      // A listed program's word is its row's (ADR 0303), not the one program's.
      if (program !== undefined) return;
      setKnown(true);
      setRun(heard);
      setMacs(undefined);
      setOpenedApp(false);
      setWaiting(false);
    });
    return () => {
      still = false;
      unhear();
    };
  }, [runs.room, live]);
  const press = async (ask: MacAsk): Promise<MacsHeard | { readonly failed: string }> => {
    setAsking(true);
    setFailed(undefined);
    try {
      const heard = await runs.ask(ask);
      setMacs(heard.macs);
      setOpenedApp(heard.opened_app === true);
      setWaiting(heard.macs > 0);
      return heard;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      setFailed(why);
      return { failed: why };
    } finally {
      setAsking(false);
    }
  };
  return { run, macs, openedApp, failed, busy: asking || waiting, known, press };
}

/** The bar's words for a held run, kept current while it runs: the Desktop tab's and the banner's. */
export function useRunBar(
  held: RunHeld,
  runs: RunOnMac,
  recipe: RecipeRead,
  /** How long it has run, kept current; the banner doesn't say it, so it needn't redraw for it. */
  ticks = true,
): RunBar {
  const { run } = held;
  const now = useNow(ticks && run?.state === "running");
  return runBar({
    recipe,
    run,
    macs: held.macs,
    openedApp: held.openedApp,
    why: held.failed,
    changedBy: runs.changedSince?.(run?.commit),
    now,
  });
}

/** The bar: the press to the person's Mac, and its word back, as the list's first row. */
export function PhoneRun({
  runs,
  recipe,
  held,
  fresh = false,
}: {
  readonly runs: RunOnMac;
  readonly recipe: RecipeRead;
  /** The run as Universe already holds it; without it the bar holds its own. */
  readonly held?: RunHeld | undefined;
  /** New on Desktop (ADR 0227's addendum of 17 November 2026): the corner dot, and Run rings twice. */
  readonly fresh?: boolean;
}) {
  return held === undefined ? (
    <OwnRun runs={runs} recipe={recipe} fresh={fresh} />
  ) : (
    <HeldBar runs={runs} recipe={recipe} held={held} fresh={fresh} />
  );
}

function OwnRun({
  runs,
  recipe,
  fresh,
}: {
  readonly runs: RunOnMac;
  readonly recipe: RecipeRead;
  readonly fresh: boolean;
}) {
  return <HeldBar runs={runs} recipe={recipe} held={useRunOnMac(runs)} fresh={fresh} />;
}

function HeldBar({
  runs,
  recipe,
  held,
  fresh,
}: {
  readonly runs: RunOnMac;
  readonly recipe: RecipeRead;
  readonly held: RunHeld;
  readonly fresh: boolean;
}) {
  const bar = useRunBar(held, runs, recipe);
  const ready = recipe !== undefined && !("why" in recipe);
  return (
    <RunBarView
      bar={bar}
      busy={held.busy}
      onRun={ready ? () => void held.press({ op: "run", command: commandOf(recipe) }) : undefined}
      onStop={() => void held.press({ op: "stop" })}
      fresh={fresh}
    />
  );
}

interface ViewProps {
  readonly bar: RunBar;
  readonly busy: boolean;
  readonly onRun: (() => void) | undefined;
  readonly onStop: () => void;
  readonly fresh: boolean;
}

/**
 * The bar as the first row of the Desktop tab's list: Program and Run while nothing runs; how it is
 * going while it starts or runs, with Stop and Run again opening under it; how it ended, its last
 * lines under it, and Run again.
 */
function RunBarView(props: ViewProps) {
  const palette = usePalette();
  const { bar } = props;
  const resting = bar.kind === "ready" || bar.kind === "held";
  const said = saidOf(bar, palette);
  return (
    <MacRow
      testID="run-bar"
      mark={
        <RowMark
          kind={markOf(bar)}
          icon={bar.kind === "ready" ? "playFill" : "play"}
          fresh={props.fresh}
          testID="run-bar-new"
        />
      }
      title={resting ? MAC_ROWS.program : bar.title}
      titleBad={bar.kind === "ended" && bar.tone === "bad"}
      titleTestID="run-bar-state"
      aside={bar.aside}
      body={said.body}
      bodyKey={said.key}
      voice={bar.tone === "bad" ? "bad" : "plain"}
      bodyTestID="run-bar-words"
      action={<Press {...props} />}
      actionKey={pressOf(bar) === "none" ? "none" : "run"}
      parted={false}
      under={<Under {...props} />}
    />
  );
}

/** Whether Run is at the row's right: while nothing runs, and again once it ended. */
function pressOf(bar: RunBar): "run" | "again" | "none" {
  if (bar.kind === "ready" || bar.kind === "held") return "run";
  return bar.kind === "ended" && bar.press !== undefined ? "again" : "none";
}

/** Run, also once it ended: the row's name already says how it ended, so the word stays short. */
function Press({ bar, busy, onRun, fresh }: ViewProps) {
  const press = pressOf(bar);
  if (press === "none") return null;
  const again = press === "again" ? (bar.press ?? "") : undefined;
  return (
    <RowButton
      label="Run"
      icon="playFill"
      tone="gold"
      busy={busy}
      disabled={bar.kind === "held" || onRun === undefined}
      onPress={() => onRun?.()}
      accessibilityLabel={again ?? bar.title}
      rings={fresh && again === undefined ? 2 : 0}
      testID={again === undefined ? "run-bar-run" : "run-bar-again"}
    />
  );
}

/** What opens under the row: how it ended, in its last lines; Stop and Run again while it runs. */
function Under(props: ViewProps) {
  const palette = usePalette();
  const { bar } = props;
  const lines = bar.lines ?? [];
  return (
    <>
      {lines.length === 0 ? null : (
        <Opening style={styles.under}>
          <Text
            style={[styles.lines, { backgroundColor: palette.surface3, color: palette.ink2 }]}
            testID="run-bar-lines"
          >
            {lines.join("\n")}
          </Text>
        </Opening>
      )}
      {bar.stop ? (
        <Opening style={styles.under}>
          <Actions {...props} />
        </Opening>
      ) : null}
    </>
  );
}

/** The row's mark for how the program is going. */
function markOf(bar: RunBar): MarkKind {
  if (bar.kind === "running") return "running";
  if (bar.kind === "starting") return "starting";
  if (bar.kind === "held") return "quiet";
  if (bar.kind === "ended") return bar.tone === "bad" ? "failed" : "plain";
  return "ready";
}

/** What it runs, or what happened: commands drawn as code, and in amber when they changed. */
function saidOf(
  bar: RunBar,
  palette: Palette,
): { readonly body?: ReactNode; readonly key: string } {
  const key = [
    bar.changed ?? "",
    ...bar.said.map((piece) => ("code" in piece ? piece.code : piece.text)),
  ].join("");
  const said = bar.said.map((piece, at) =>
    "code" in piece ? (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are one sentence, in order.
        key={at}
        style={[styles.code, { backgroundColor: palette.surface3, color: palette.ink }]}
      >
        {piece.code}
      </Text>
    ) : (
      piece.text
    ),
  );
  if (bar.changed !== undefined) {
    return {
      key,
      body: (
        <>
          <Text style={[styles.strong, { color: palette.amberInk }]}>{bar.changed}</Text> {said}
        </>
      ),
    };
  }
  return said.length === 0 ? { key } : { key, body: said };
}

/**
 * Stop and Run again, while it starts or runs. Run again is there from the start, dimmed until it
 * runs, so Stop keeps its width rather than giving half of it up as it starts running.
 */
function Actions({ bar, busy, onRun, onStop }: ViewProps) {
  const palette = usePalette();
  return (
    <View style={styles.pair}>
      <Button
        label="Stop"
        icon="stop"
        variant="danger"
        grow
        disabled={busy}
        style={{ backgroundColor: palette.redSoft }}
        onPress={onStop}
        testID="run-bar-stop"
      />
      <Button
        label={bar.press ?? RUN_AGAIN}
        icon="play"
        grow
        disabled={busy || bar.press === undefined || onRun === undefined}
        onPress={() => onRun?.()}
        testID="run-bar-again"
      />
    </View>
  );
}

/**
 * The person's runs of a run file's several programs (ADR 0303), read once and heard as their Mac
 * says more, by name, and the press that runs, stops or shows one of them, or all.
 */
export interface ProgramsHeld {
  readonly runs: RunsHeld;
  /** After a press: the program it was for, or all, and what it came to. */
  readonly pressed?:
    | {
        readonly program: string | undefined;
        readonly macs?: number | undefined;
        readonly openedApp?: boolean | undefined;
        readonly failed?: string | undefined;
      }
    | undefined;
  /** The program a press is under way for, or `all`, until the Mac says more. */
  readonly busy: string | undefined;
  /** The first read has answered. */
  readonly known: boolean;
  readonly press: (ask: MacRunAsk) => Promise<MacsHeard | { readonly failed: string }>;
}

/** The runs of a room's programs: nothing is read or heard while `live` is off. */
export function useProgramsOnMac(runs: RunOnMac, live = true): ProgramsHeld {
  const [held, setHeld] = useState<RunsHeld>({});
  const [pressed, setPressed] = useState<ProgramsHeld["pressed"]>();
  const [asking, setAsking] = useState<string | undefined>();
  const [waiting, setWaiting] = useState<string | undefined>();
  const [known, setKnown] = useState(false);
  useEffect(() => {
    if (waiting === undefined) return;
    const given = setTimeout(() => setWaiting(undefined), HEARD_WAIT_MS);
    return () => clearTimeout(given);
  }, [waiting]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read and heard once for the room; `runs` is made anew as the page draws.
  useEffect(() => {
    if (!live) return;
    let still = true;
    runs.read().then(
      (answer) => {
        if (!still) return;
        setHeld((was) => ({
          run: was.run ?? answer.run,
          programs: { ...answer.programs, ...was.programs },
        }));
        setKnown(true);
      },
      () => still && setKnown(true),
    );
    const unhear = runs.heard((heard, program) => {
      setKnown(true);
      setHeld((was) =>
        program === undefined
          ? { ...was, run: heard }
          : { ...was, programs: { ...renamed(was.programs, program), [program]: heard } },
      );
      setPressed(undefined);
      setWaiting(undefined);
    });
    return () => {
      still = false;
      unhear();
    };
  }, [runs.room, live]);
  const press = async (ask: MacRunAsk): Promise<MacsHeard | { readonly failed: string }> => {
    const which = ask.program ?? "all";
    setAsking(which);
    setPressed(undefined);
    try {
      const heard = await runs.ask(ask);
      if (ask.op !== "show") {
        setPressed({
          program: ask.program,
          macs: heard.macs,
          openedApp: heard.opened_app === true,
        });
        if (heard.macs > 0) setWaiting(which);
      }
      return heard;
    } catch (error) {
      const failed = error instanceof Error ? error.message : String(error);
      setPressed({ program: ask.program, failed });
      return { failed };
    } finally {
      setAsking(undefined);
    }
  };
  return { runs: held, pressed, busy: asking ?? waiting, known, press };
}

/** The runs kept by name, less the one of this name said another way. */
function renamed<Run>(
  programs: Readonly<Record<string, Run>> | undefined,
  name: string,
): Record<string, Run> {
  return Object.fromEntries(
    Object.entries(programs ?? {}).filter(([each]) => each.toLowerCase() !== name.toLowerCase()),
  );
}

/** Each program's row, from its run and what the last press came to. */
export function useProgramRows(
  file: RunFile,
  held: ProgramsHeld,
  runs: RunOnMac,
  ticks = true,
): readonly ProgramRow[] {
  const going = Object.values(held.runs.programs ?? {}).some((run) => run.state === "running");
  const now = useNow(ticks && going);
  return file.programs.flatMap((program) => {
    if (program.name === undefined) return [];
    const run = runOf(held.runs, program);
    const { pressed } = held;
    const mine =
      pressed !== undefined &&
      (pressed.program === undefined ||
        pressed.program.toLowerCase() === program.name.toLowerCase());
    return [
      programRow({
        program: program as Program & { readonly name: string },
        run,
        ...(mine ? { macs: pressed.macs, openedApp: pressed.openedApp, why: pressed.failed } : {}),
        changedBy: runs.changedSince?.(run?.commit),
        now,
      }),
    ];
  });
}

/** What a press asks of the Mac: Run with what it starts, Stop, or Show; one program, or all. */
export function askFor(
  file: RunFile,
  op: "run" | "stop" | "show",
  program: string | undefined,
): MacRunAsk {
  const named = program === undefined ? {} : { program };
  if (op === "run") return { op, command: pressCommand(file, program), ...named };
  return { op, ...named };
}

/** Run all in the Programs heading, or Stop all once every program runs; once there are two. */
export function RunAll({
  file,
  rows,
  held,
}: {
  readonly file: RunFile;
  readonly rows: readonly ProgramRow[];
  readonly held: ProgramsHeld;
}) {
  const palette = usePalette();
  if (rows.length < 2) return null;
  const all = programsHeading(rows);
  const stop = all === "stop";
  return (
    <Squeeze
      accessibilityRole="button"
      accessibilityLabel={stop ? STOP_ALL : RUN_ALL}
      accessibilityState={{ disabled: held.busy !== undefined }}
      disabled={held.busy !== undefined}
      onPress={() => void held.press(askFor(file, all, undefined))}
      style={[styles.all, { backgroundColor: stop ? palette.redSoft : palette.goldSoft }]}
      testID="programs-all"
    >
      <Swap swapKey={all}>
        <View style={styles.allWords}>
          <Icon
            name={stop ? "stop" : "playFill"}
            size={11}
            color={stop ? palette.redInk : palette.goldDeep}
          />
          <Text style={[styles.allLabel, { color: stop ? palette.redInk : palette.goldDeep }]}>
            {stop ? STOP_ALL : RUN_ALL}
          </Text>
        </View>
      </Swap>
    </Squeeze>
  );
}

/** A program's row on the Desktop tab: its mark, name, how it stands, and its buttons. */
export function ProgramRowView({
  file,
  row,
  held,
  parted,
  fresh,
}: {
  readonly file: RunFile;
  readonly row: ProgramRow;
  readonly held: ProgramsHeld;
  readonly parted: boolean;
  readonly fresh: boolean;
}) {
  const palette = usePalette();
  const busy =
    held.busy !== undefined &&
    (held.busy === "all" || held.busy.toLowerCase() === row.name.toLowerCase());
  const key = [row.kind, row.state ?? "", row.changed ?? "", ...row.said.map(pieceText)].join("|");
  const said = row.said.map((piece, at) =>
    "code" in piece ? (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are one sentence, in order.
        key={at}
        style={[styles.code, { backgroundColor: palette.surface3, color: palette.ink }]}
      >
        {piece.code}
      </Text>
    ) : (
      piece.text
    ),
  );
  const body = (
    <>
      {row.changed === undefined ? null : (
        <Text style={[styles.strong, { color: palette.amberInk }]}>{`${row.changed} `}</Text>
      )}
      {row.state === undefined ? null : (
        <Text style={[styles.strong, { color: palette.greenInk }]}>{row.state}</Text>
      )}
      {said}
    </>
  );
  return (
    <MacRow
      testID={`program-${row.name}`}
      mark={
        <RowMark
          kind={programMark(row)}
          icon="playFill"
          fresh={fresh}
          testID={`program-${row.name}-new`}
        />
      }
      title={row.name}
      body={body}
      bodyKey={key}
      voice={row.tone === "bad" ? "bad" : "plain"}
      bodyTestID={`program-${row.name}-said`}
      action={<ProgramActions file={file} row={row} held={held} busy={busy} fresh={fresh} />}
      actionKey={row.kind === "ended" ? "ready" : row.kind}
      parted={parted}
      under={
        (row.lines?.length ?? 0) === 0 ? undefined : (
          <Opening style={styles.under}>
            <Text
              style={[styles.lines, { backgroundColor: palette.surface3, color: palette.ink2 }]}
              testID={`program-${row.name}-lines`}
            >
              {row.lines?.join("\n")}
            </Text>
          </Opening>
        )
      }
    />
  );
}

const pieceText = (piece: ProgramRow["said"][number]): string =>
  "code" in piece ? piece.code : piece.text;

/** A program's mark: gold Run while it doesn't run, gold and lit starting, green running. */
function programMark(row: ProgramRow): MarkKind {
  if (row.kind === "running") return "running";
  if (row.kind === "starting") return "starting";
  return row.kind === "ended" && row.tone === "bad" ? "failed" : "ready";
}

/** Run while it doesn't run; a dim Starting; Open and Stop while it runs. */
function ProgramActions({
  file,
  row,
  held,
  busy,
  fresh,
}: {
  readonly file: RunFile;
  readonly row: ProgramRow;
  readonly held: ProgramsHeld;
  readonly busy: boolean;
  readonly fresh: boolean;
}) {
  const palette = usePalette();
  if (row.run) {
    return (
      <RowButton
        label="Run"
        icon="playFill"
        tone="gold"
        busy={busy}
        onPress={() => void held.press(askFor(file, "run", row.name))}
        accessibilityLabel={`Run ${row.name}`}
        rings={fresh ? 2 : 0}
        testID={`program-${row.name}-run`}
      />
    );
  }
  return (
    <View style={styles.acts}>
      {row.kind === "starting" ? (
        <View style={[styles.dim, { backgroundColor: palette.surface3 }]}>
          <Text style={[styles.dimLabel, { color: palette.ink3 }]}>Starting</Text>
        </View>
      ) : null}
      {row.open === undefined ? null : (
        <RowButton
          label="Open"
          tone="gold"
          onPress={() => void held.press(askFor(file, "show", row.name))}
          accessibilityLabel={`Open ${row.name} on your Mac`}
          testID={`program-${row.name}-open`}
        />
      )}
      {row.stop ? (
        <Squeeze
          accessibilityRole="button"
          accessibilityLabel={`Stop ${row.name}`}
          disabled={busy && row.kind !== "running"}
          onPress={() => void held.press(askFor(file, "stop", row.name))}
          style={[styles.square, { backgroundColor: palette.redSoft }]}
          testID={`program-${row.name}-stop`}
        >
          <Icon name="stop" size={12} color={palette.redInk} />
        </Squeeze>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Under the row's words, past its mark, as far as its right edge.
  under: { paddingLeft: UNDER_INSET, paddingRight: SPACE.md, paddingBottom: SPACE.md },
  strong: { fontWeight: "600" },
  code: { fontFamily: "Menlo", fontSize: TEXT.xs },
  lines: {
    fontFamily: "Menlo",
    fontSize: TEXT.xs,
    lineHeight: TEXT.xs * 1.45,
    padding: SPACE.sm,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  pair: { flexDirection: "row", gap: SPACE.sm },
  all: { height: 26, paddingHorizontal: SPACE.md - 2, borderRadius: 13, justifyContent: "center" },
  allWords: { flexDirection: "row", alignItems: "center", gap: 5 },
  allLabel: { fontSize: TEXT.xs, fontWeight: "700" },
  acts: { flexDirection: "row", alignItems: "center", gap: SPACE.sm - 2 },
  dim: { height: 32, paddingHorizontal: SPACE.md, borderRadius: 16, justifyContent: "center" },
  dimLabel: { fontSize: TEXT.sm, fontWeight: "600" },
  square: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
