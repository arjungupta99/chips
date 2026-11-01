/**
 * Run program (ADRs 0226, 0227), the first row of Universe's Desktop tab (its second addendum): the
 * press goes to the person's own Chips for Mac, which runs the project as its run file says, and
 * what that Mac says comes back here. What the bar says is `@chipschat/core`'s `runBar`, as the
 * web's and the Mac's is.
 */

import {
  commandOf,
  MAC_ROWS,
  type MacsHeard,
  type RecipeRead,
  RUN_AGAIN,
  type RunBar,
  runBar,
} from "@chipschat/core";
import type { HeldRun, ProjectRunAnswer } from "@chipschat/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { usePalette } from "../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Opening } from "./MacMotion";
import { MacRow, type MarkKind, RowButton, RowMark, UNDER_INSET } from "./MacRow";

/** How the phone asks the person's Mac, and hears back. */
export interface RunOnMac {
  /** The room: what is read and heard again for, rather than each time the page draws. */
  readonly room: string;
  readonly ask: (
    ask: { readonly op: "run"; readonly command: string } | { readonly op: "stop" },
  ) => Promise<MacsHeard>;
  readonly read: () => Promise<ProjectRunAnswer>;
  readonly heard: (listen: (run: HeldRun) => void) => () => void;
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

/** The bar: the press to the person's Mac, and its word back, as the list's first row. */
export function PhoneRun({
  runs,
  recipe,
}: {
  readonly runs: RunOnMac;
  readonly recipe: RecipeRead;
}) {
  const [run, setRun] = useState<HeldRun | undefined>();
  const [macs, setMacs] = useState<number | undefined>();
  // The server opened Chips for Mac for the press (ADR 0227's second addendum).
  const [openedApp, setOpenedApp] = useState(false);
  const [asking, setAsking] = useState(false);
  // A Mac heard the press: the button waits on what that Mac says, so Run isn't offered again for
  // the moment before it says it is starting, nor Stop before it says it stopped.
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
  useEffect(() => {
    if (!waiting) return;
    const given = setTimeout(() => setWaiting(false), HEARD_WAIT_MS);
    return () => clearTimeout(given);
  }, [waiting]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read and heard once for the room; `runs` is made anew as the page draws.
  useEffect(() => {
    let live = true;
    runs.read().then(
      (answer) => live && setRun((was) => was ?? answer.run),
      () => undefined,
    );
    const unhear = runs.heard((heard) => {
      setRun(heard);
      setMacs(undefined);
      setOpenedApp(false);
      setWaiting(false);
    });
    return () => {
      live = false;
      unhear();
    };
  }, [runs.room]);
  const press = async (ask: Parameters<RunOnMac["ask"]>[0]) => {
    setAsking(true);
    setFailed(undefined);
    try {
      const heard = await runs.ask(ask);
      setMacs(heard.macs);
      setOpenedApp(heard.opened_app === true);
      setWaiting(heard.macs > 0);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setAsking(false);
    }
  };
  const now = useNow(run?.state === "running");
  const ready = recipe !== undefined && !("why" in recipe);
  return (
    <RunBarView
      bar={runBar({
        recipe,
        run,
        macs,
        openedApp,
        why: failed,
        changedBy: runs.changedSince?.(run?.commit),
        now,
      })}
      busy={asking || waiting}
      onRun={ready ? () => void press({ op: "run", command: commandOf(recipe) }) : undefined}
      onStop={() => void press({ op: "stop" })}
    />
  );
}

interface ViewProps {
  readonly bar: RunBar;
  readonly busy: boolean;
  readonly onRun: (() => void) | undefined;
  readonly onStop: () => void;
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
      mark={<RowMark kind={markOf(bar)} icon={bar.kind === "ready" ? "playFill" : "play"} />}
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
function Press({ bar, busy, onRun }: ViewProps) {
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
});
