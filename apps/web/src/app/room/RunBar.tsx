/**
 * Run program (ADRs 0226, 0227), under Programs in Universe: the room's project run on the
 * person's Mac as its agents said to in its run file. On the Mac it runs from the card's own
 * folder; in a browser the press goes to the person's Chips for Mac, and what that Mac says comes
 * back here.
 * What the bar says is `@chipschat/core`'s `runBar`, as the phone's is.
 */

import {
  type RunBar as Bar,
  commandOf,
  type MacsHeard,
  type RecipeRead,
  runBar,
} from "@chipschat/core";
import type { HeldRun, ProjectRun, ProjectRunAnswer } from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Folders, Room } from "../folders.ts";

/** How a browser asks the person's Mac, and hears back. */
export interface RunOnMac {
  /** The room: what is read and heard again for, rather than each time the page draws. */
  readonly room: string;
  readonly ask: (
    ask: { readonly op: "run"; readonly command: string } | { readonly op: "stop" },
  ) => Promise<MacsHeard>;
  readonly read: () => Promise<ProjectRunAnswer>;
  readonly heard: (listen: (run: HeldRun) => void) => () => void;
}

/** Run or Stop, as either asks it. */
export type RunAsk = Parameters<RunOnMac["ask"]>[0];

/**
 * The person's run of the room's program as this client holds it, and its presses: the Programs
 * card's bar and the banner over the room's page (ADR 0227's addendum of 9 November 2026) read
 * the one.
 */
export interface RunHere {
  readonly bar: Bar;
  readonly run: ProjectRun | undefined;
  readonly busy: boolean;
  /** The run file says how to run it. */
  readonly ready: boolean;
  /** Run or Stop: how many Macs heard it, or why nothing went. */
  readonly press: (ask: RunAsk) => Promise<MacsHeard | { readonly failed: string }>;
}

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

/** Who changed the files since a run at this commit, when anybody but the person did (SEC-40). */
export type ChangedSince = (commit: string | undefined) => readonly string[];

/** The run on this Mac, kept in the Mac's folders: Run and Stop run here. */
export function useMacRun(props: {
  readonly room: Room;
  readonly folders: Folders;
  readonly recipe: RecipeRead;
  readonly where?: string | undefined;
  readonly changedSince?: ChangedSince | undefined;
  /** How long it has run, kept current; the page's banner doesn't say it. */
  readonly ticks?: boolean | undefined;
}): RunHere {
  const { room, folders, recipe } = props;
  const state = useSyncExternalStore(folders.subscribe, () => folders.state(room.id));
  const now = useNow(props.ticks !== false && state.run?.state === "running");
  const changedBy = props.changedSince?.(state.run?.commit);
  const bar = runBar({ recipe, run: state.run, where: props.where, changedBy, now });
  return {
    bar,
    run: state.run,
    busy: state.busy === "run" || state.busy === "stop",
    ready: recipe !== undefined && !("why" in recipe),
    press: async (ask) => {
      await folders.run(room, ask.op, ask.op === "run" ? { command: ask.command } : undefined);
      const failed = folders.state(room.id).failed;
      return failed === undefined ? { macs: 1 } : { failed };
    },
  };
}

/** The bar on the Mac's Your folder card: Run and Stop run here. */
export function MacRun(props: {
  readonly room: Room;
  readonly folders: Folders;
  readonly recipe: RecipeRead;
  readonly where: string;
  readonly changedSince?: ChangedSince | undefined;
}) {
  return <HeldBar here={useMacRun(props)} recipe={props.recipe} />;
}

/** The bar as a run held here draws it: Run, or how it is going and Stop. */
function HeldBar({ here, recipe }: { readonly here: RunHere; readonly recipe: RecipeRead }) {
  const command = recipe !== undefined && !("why" in recipe) ? commandOf(recipe) : undefined;
  return (
    <RunBarView
      bar={here.bar}
      busy={here.busy}
      onRun={command === undefined ? undefined : () => void here.press({ op: "run", command })}
      onStop={() => void here.press({ op: "stop" })}
    />
  );
}

/** The run in a browser: the press goes to the person's Mac, and its word comes back. */
export function useAwayRun(props: {
  readonly runs: RunOnMac;
  readonly recipe: RecipeRead;
  readonly changedSince?: ChangedSince | undefined;
  /** How long it has run, kept current; the page's banner doesn't say it. */
  readonly ticks?: boolean | undefined;
}): RunHere {
  const { runs, recipe } = props;
  const [run, setRun] = useState<HeldRun | undefined>();
  const [macs, setMacs] = useState<number | undefined>();
  // The server opened Chips for Mac for the press (ADR 0227's second addendum).
  const [openedApp, setOpenedApp] = useState(false);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
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
    });
    return () => {
      live = false;
      unhear();
    };
  }, [runs.room]);
  const press = async (ask: RunAsk): Promise<MacsHeard | { readonly failed: string }> => {
    setAsking(true);
    setFailed(undefined);
    try {
      const heard = await runs.ask(ask);
      setMacs(heard.macs);
      setOpenedApp(heard.opened_app === true);
      return heard;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      setFailed(why);
      return { failed: why };
    } finally {
      setAsking(false);
    }
  };
  const now = useNow(props.ticks !== false && run?.state === "running");
  const changedBy = props.changedSince?.(run?.commit);
  const bar = runBar({ recipe, run, macs, openedApp, why: failed, changedBy, now });
  return {
    bar,
    run,
    busy: asking,
    ready: recipe !== undefined && !("why" in recipe),
    press,
  };
}

/** The bar in a browser: the press goes to the person's Mac, and its word comes back. */
export function AwayRun(props: {
  readonly runs: RunOnMac;
  readonly recipe: RecipeRead;
  readonly changedSince?: ChangedSince | undefined;
}) {
  return <HeldBar here={useAwayRun(props)} recipe={props.recipe} />;
}

interface ViewProps {
  readonly bar: Bar;
  readonly busy: boolean;
  readonly onRun: (() => void) | undefined;
  readonly onStop: () => void;
}

/** The bar as it is drawn: its button or its state, its words, its last lines, and Stop. */
export function RunBarView(props: ViewProps) {
  const { bar } = props;
  return (
    <div className="run-bar" data-kind={bar.kind} data-testid="run-bar">
      <Head {...props} />
      <Words bar={bar} />
      {(bar.lines?.length ?? 0) > 0 && (
        <pre className="run-bar-lines" data-testid="run-bar-lines">
          {bar.lines?.join("\n")}
        </pre>
      )}
      <Actions {...props} />
    </div>
  );
}

/** Run on Mac, or how it is going: running, starting, or how it ended. */
function Head({ bar, busy, onRun }: ViewProps) {
  if (bar.kind === "running" || bar.kind === "starting") {
    return (
      <div className="run-bar-state" data-testid="run-bar-state">
        <span className="run-bar-dot" data-starting={bar.kind === "starting" || undefined} />
        <b>{bar.title}</b>
        {bar.aside !== undefined && <span>{bar.aside}</span>}
      </div>
    );
  }
  if (bar.kind === "ended") {
    return (
      <p className="run-bar-ended" data-tone={bar.tone} data-testid="run-bar-state">
        {bar.title}
      </p>
    );
  }
  return (
    <button
      type="button"
      className="sheet-go"
      disabled={busy || bar.kind === "held" || onRun === undefined}
      onClick={onRun}
      data-testid="run-bar-run"
    >
      <Icon name="play" size={14} />
      {busy ? "Asking your Mac…" : bar.title}
    </button>
  );
}

/** What it runs, or what happened: commands drawn as code, and in amber when they changed. */
function Words({ bar }: { readonly bar: Bar }) {
  const said = bar.said.map((piece, at) =>
    "code" in piece ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are one sentence, in order.
      <code key={at}>{piece.code}</code>
    ) : (
      piece.text
    ),
  );
  if (bar.changed !== undefined) {
    return (
      <p className="run-bar-changed" data-testid="run-bar-words">
        <b>{bar.changed}</b> {said}
      </p>
    );
  }
  if (said.length === 0) return null;
  return (
    <p className="run-bar-words" data-tone={bar.tone} data-testid="run-bar-words">
      {said}
    </p>
  );
}

/** Stop and Run again while it runs; Run again once it ended. */
function Actions({ bar, busy, onRun, onStop }: ViewProps) {
  const again = bar.press !== undefined && (bar.stop || bar.kind === "ended");
  if (!bar.stop && !again) return null;
  return (
    <div className="your-folder-pair" data-single={!(bar.stop && again) || undefined}>
      {bar.stop && (
        <button
          type="button"
          className="sheet-go"
          data-tone="stop"
          disabled={busy}
          onClick={onStop}
          data-testid="run-bar-stop"
        >
          <Icon name="stop" size={12} />
          Stop
        </button>
      )}
      {again && (
        <button
          type="button"
          className="sheet-go"
          data-tone={bar.stop ? "soft" : undefined}
          disabled={busy || onRun === undefined}
          onClick={onRun}
          data-testid="run-bar-again"
        >
          <Icon name="play" size={14} />
          {bar.press}
        </button>
      )}
    </div>
  );
}
