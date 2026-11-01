/**
 * An agent's Context window group on its card (ADR 0146, the phone's on the desktop): how full its
 * harness says it is, as a big percent and "172k of 272k tokens" over the window drawn as bars lit
 * in the context ring's tone, with the limit it compacts itself at as a marker standing in them,
 * and past the fill faint bars up to how full its last long turn got, its words under the top bar.
 * A pointer drags the marker along the bars, snapping to the harness's limits, and letting go saves
 * it; the arrow keys step it from limit to limit. Compact now, a pill under the bars beside what it
 * last did or is doing, asks first in the confirm dialog. A Compacts itself row has a switch where
 * the harness lets the limit go off, and the foot says what compacting does.
 *
 * Only the people who run its harness see it, and only while the harness declares
 * `context_windows` and has sent a copy (core's `mayChangeWindow`). Away, or kept read only, the
 * limit is quiet and says why when hovered. The copy is read again when the agent stops working,
 * and every two seconds while a Compact now is under way, so the fill drains as the harness says
 * it is done. A limit is laid over the copy while it saves.
 */

import {
  compactNow,
  compactSheet,
  compactWords,
  type Directory,
  harnessOf,
  limitWhenOn,
  mayChangeWindow,
  nameOf,
  noCopy,
  notSharedWords,
  saveWindowLimit,
  settingLook,
  snapLimit,
  WINDOW_BARS,
  type WindowReads,
  type WorkspaceModel,
  windowFoot,
  windowGauge,
  windowNotYetWords,
  windowRows,
  windowSaveWords,
} from "@chipschat/core";
import type { AgentContextWindowView, WindowLimitAsk } from "@chipschat/protocol";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { recall, remember } from "../context/memory.ts";
import { HarnessMark } from "../context/rows.tsx";
import { NotShared, useLands, WaitingWindow } from "../Waiting.tsx";
import { Switch } from "../you/controls.tsx";

/** How long a save's or a compaction's trouble stays where it is said. */
const SAID_MS = 4000;
/** The bars, by their place along the window. */
const PLACES = Array.from({ length: WINDOW_BARS }, (_, at) => at);
/** How long the number takes to count up as the fill climbs: the bars' staggered light. */
const COUNT_MS = 700;

const keyOf = (agentId: string) => `window:${agentId}`;

/** The first read since the card opened: on its way, or what it found. */
type Reading = "asking" | "read" | "none_yet" | "failed";

export function WindowGroup({
  reads,
  model,
  directory,
  agentId,
  agentName,
  selfId,
  working,
}: {
  readonly reads: WindowReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
  /** Whether the agent is working now: when it stops, the copy is read again. */
  readonly working: boolean;
}) {
  const may = reads !== undefined && mayChangeWindow(model, directory, agentId, selfId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const [asking, setAsking] = useState(false);
  const { view, reading, climb, said, saveLimit, compact } = useWindow(
    may ? reads : undefined,
    agentId,
    harness,
    working,
  );
  const land = useLands(may && view === undefined && reading === "asking");
  if (settingLook(model, directory, agentId, selfId, "window") === "not_shared") {
    return (
      <NotShared
        group="window"
        words={notSharedWords("window", directory, agentId)}
        testID="window-not-shared"
      />
    );
  }
  if (view === undefined) {
    return (
      <Pending
        may={may}
        reading={reading}
        harness={harness}
        agentName={agentName}
        words={windowNotYetWords(directory, agentId)}
        land={land}
      />
    );
  }

  const rows = windowRows(view, agentName, harness, Date.now());
  const sheet = compactSheet(view, agentName, working);
  return (
    <section
      ref={land.copy}
      className={land.lands ? "ctx cw lands" : "ctx cw"}
      aria-label="Context window"
      data-testid="window-group"
    >
      <div className="ctx-h">
        <h2 className="agents-h">Context window</h2>
        <span className="ctx-from" data-testid="window-from">
          <HarnessMark name={harness} side={14} />
          {harness}
        </span>
      </div>
      <ul className="ctx-group">
        <li className="cw-gauge" data-testid="window-gauge">
          <Gauge
            view={view}
            rows={rows}
            climb={climb}
            onPick={(at) => {
              if (at !== view.limit?.at) void saveLimit({ at });
            }}
          />
          <div className="cw-act">
            <span className="cw-note" data-testid="window-note">
              {said.compact ?? rows.note}
            </span>
            <CompactPill view={view} rows={rows} onPress={() => setAsking(true)} />
          </div>
        </li>
        {rows.auto !== undefined && (
          <AutoRow
            auto={rows.auto}
            quiet={rows.quiet}
            said={said.limit}
            onSwitch={(on) => void saveLimit({ at: on ? limitWhenOn(view) : null })}
          />
        )}
      </ul>
      <p className="ctx-foot" data-testid="window-foot">
        {windowFoot(view, agentName, harness)}
      </p>
      {asking && (
        <ConfirmDialog
          asking={{ title: sheet.title, body: sheet.body, note: sheet.after, confirm: "Compact" }}
          danger={false}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void compact();
          }}
        />
      )}
    </section>
  );
}

/**
 * No copy to draw: the gauge blank while the first read is on its way, a line when the harness
 * has none of this agent yet, and nothing when the read went unanswered.
 */
function Pending({
  may,
  reading,
  harness,
  agentName,
  words,
  land,
}: {
  readonly may: boolean;
  readonly reading: Reading;
  readonly harness: string;
  readonly agentName: string;
  readonly words: string;
  readonly land: ReturnType<typeof useLands>;
}) {
  if (!may) return null;
  if (reading === "asking") {
    return <WaitingWindow harnessName={harness} agentName={agentName} place={land.blank} />;
  }
  if (reading === "none_yet") {
    return (
      <NotShared
        group="window"
        words={words}
        testID="window-not-yet"
        place={land.copy}
        lands={land.lands}
      />
    );
  }
  return null;
}

/** Compact now, under the bars: working while it is on its way or under way, quiet when it can't. */
function CompactPill({
  view,
  rows,
  onPress,
}: {
  readonly view: AgentContextWindowView;
  readonly rows: ReturnType<typeof windowRows>;
  readonly onPress: () => void;
}) {
  const { busy, quiet, label } = rows.compact;
  return (
    <button
      type="button"
      className="cw-pill"
      data-busy={busy}
      disabled={busy || quiet}
      title={quiet ? (view.why_not ?? rows.hint) : undefined}
      onClick={onPress}
      data-testid="window-compact"
    >
      {busy && <span className="cw-spin" aria-hidden="true" />}
      {label}
    </button>
  );
}

/** Compacts itself, under the gauge: what the marker means, with a switch where it may go off. */
function AutoRow({
  auto,
  quiet,
  said,
  onSwitch,
}: {
  readonly auto: NonNullable<ReturnType<typeof windowRows>["auto"]>;
  readonly quiet: boolean;
  readonly said: string | undefined;
  readonly onSwitch: (on: boolean) => void;
}) {
  return (
    <li className="ctx-row" data-testid="window-auto">
      <span className="ctx-row-words">
        <span className="ctx-row-title">Compacts itself</span>
        <span className="ctx-row-line" data-testid="window-auto-sub">
          {said ?? auto.sub}
        </span>
      </span>
      {auto.switch && (
        <Switch
          label="Compacts itself"
          checked={auto.on}
          disabled={quiet || auto.saving}
          onChange={onSwitch}
        />
      )}
    </li>
  );
}

/** What became of an ask, said where it was asked for a moment. */
type Said = { readonly limit?: string; readonly compact?: string };

/**
 * The agent's copy, read when there are reads to read it with and again when the agent stops
 * working, and the two asks: a limit, laid over the copy while it saves, and Compact now, followed
 * until it is done. Trouble with either is said for a moment.
 */
function useWindow(
  reads: WindowReads | undefined,
  agentId: string,
  harness: string,
  working: boolean,
) {
  const [view, setView] = useState<AgentContextWindowView | undefined>(() =>
    reads === undefined ? undefined : recall<AgentContextWindowView>(keyOf(agentId)),
  );
  const [reading, setReading] = useState<Reading>("asking");
  // Just read, not kept from before: the fill climbs to the first copy drawn.
  const [climb] = useState(view === undefined);
  const [said, setSaid] = useState<Said>({});
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `working` is when to read it again.
  useEffect(() => {
    if (reads === undefined) {
      setView(undefined);
      return;
    }
    reads.readAgentContextWindow(agentId).then(
      (now) => {
        remember(keyOf(agentId), now);
        if (!alive.current) return;
        setView(now);
        setReading("read");
      },
      // Not sent yet: say so. No answer: the last copy stands, or the group goes.
      (error: unknown) => {
        if (!alive.current) return;
        setReading(noCopy(error) ? "none_yet" : "failed");
        if (noCopy(error)) setView(undefined);
      },
    );
  }, [reads, agentId, working]);

  const say = (words: Said) => {
    setSaid(words);
    setTimeout(() => alive.current && setSaid({}), SAID_MS);
  };
  /** The copy as it is once an ask is over: the one it ended on, else read again. */
  const settled = async (ended: AgentContextWindowView | undefined) => {
    const now = ended ?? (await reads?.readAgentContextWindow(agentId).catch(() => undefined));
    if (now !== undefined) remember(keyOf(agentId), now);
    if (alive.current && now !== undefined) setView(now);
    return now;
  };

  const saveLimit = async (ask: WindowLimitAsk) => {
    if (reads === undefined) return;
    setSaid({});
    const asked_at = new Date().toISOString();
    setView((was) =>
      was === undefined
        ? was
        : { ...was, change: { change_id: "chg_asking", state: "waiting", at: ask.at, asked_at } },
    );
    const outcome = await saveWindowLimit(reads, agentId, ask, { alive: () => alive.current });
    if (!alive.current) return;
    await settled(outcome.view);
    if (outcome.state !== "saved") {
      say({ limit: windowSaveWords(outcome.state, harness, outcome.message) });
    }
  };

  const compact = async () => {
    if (reads === undefined) return;
    setSaid({});
    const asked_at = new Date().toISOString();
    setView((was) =>
      was === undefined
        ? was
        : { ...was, compaction: { change_id: "chg_asking", state: "waiting", asked_at } },
    );
    const outcome = await compactNow(reads, agentId, {
      alive: () => alive.current,
      onView: (now) => alive.current && setView(now),
    });
    if (!alive.current) return;
    const now = await settled(outcome.view);
    if (outcome.state !== "done") {
      say({ compact: compactWords(outcome.state, harness, now, outcome.message) });
    }
  };

  return { view, reading, climb, said, saveLimit, compact };
}

/** How a bar past the fill stands for its last long turn: faint up to it, its top bar held. */
function ghostAt(
  place: number,
  gauge: ReturnType<typeof windowGauge>,
): "faint" | "top" | undefined {
  const ghost = gauge.ghost;
  if (ghost === undefined || place < gauge.lit || place >= ghost.bars) return undefined;
  return place === ghost.bars - 1 ? "top" : "faint";
}

/**
 * The window as bars, lit to how full it is, with the limit as a marker a pointer drags along
 * them and the arrow keys step: a slider whose value is the limit. Past the fill, faint bars in
 * its last long turn's tone up to how full that turn got, the top one held with a cap, and the
 * turn's words under it in the scale.
 */
function Gauge({
  view,
  rows,
  climb,
  onPick,
}: {
  readonly view: AgentContextWindowView;
  readonly rows: ReturnType<typeof windowRows>;
  /** Just read: on its first draw the bars light up to the fill in turn and the number counts up. */
  readonly climb: boolean;
  readonly onPick: (at: number) => void;
}) {
  const gauge = windowGauge(view);
  const lit = useClimb(gauge.lit, climb);
  const big = useCountUp(gauge.percent, climb);
  const choices = view.limit?.choices ?? [];
  const bars = useRef<HTMLDivElement>(null);
  // Where the marker is while a pointer has it, in percent; and the limit under it.
  const [held, setHeld] = useState<{ readonly at: number; readonly snapped: number } | undefined>(
    undefined,
  );
  const marker = held?.at ?? gauge.marker;
  const flag = held?.snapped ?? gauge.marker;

  const percentAt = (clientX: number): number => {
    const box = bars.current?.getBoundingClientRect();
    if (box === undefined || box.width <= 0) return gauge.marker ?? 0;
    const low = choices[0] ?? 0;
    const high = choices[choices.length - 1] ?? 100;
    return Math.min(high, Math.max(low, ((clientX - box.left) / box.width) * 100));
  };
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const at = percentAt(event.clientX);
    setHeld({ at, snapped: snapLimit(choices, at) });
  };
  const step = (by: number) => {
    const index = choices.indexOf(gauge.marker ?? -1);
    const next = choices[Math.max(0, Math.min(choices.length - 1, index + by))];
    if (next !== undefined) onPick(next);
  };

  return (
    <>
      <div className="cw-top">
        <span className="cw-big" data-tone={gauge.tone} data-testid="window-percent">
          {big === gauge.percent ? gauge.big : `${big}%`}
        </span>
        <span className="cw-tokens" data-testid="window-tokens">
          {gauge.tokens}
        </span>
      </div>
      <div
        ref={bars}
        className="cw-bars"
        role="slider"
        aria-label="Compacts itself at"
        aria-valuemin={choices[0]}
        aria-valuemax={choices[choices.length - 1]}
        aria-valuenow={flag ?? undefined}
        aria-valuetext={flag === undefined ? "Only when asked" : `${flag}%`}
        aria-disabled={!rows.drags}
        tabIndex={rows.drags ? 0 : -1}
        title={rows.quiet ? rows.hint : undefined}
        data-quiet={rows.quiet}
        data-compacting={rows.compact.busy}
        data-drags={rows.drags}
        data-testid="window-bars"
        onPointerDown={(event) => {
          if (!rows.drags) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          follow(event);
        }}
        onPointerMove={(event) => {
          if (held !== undefined) follow(event);
        }}
        onPointerUp={() => {
          if (held === undefined) return;
          setHeld(undefined);
          onPick(held.snapped);
        }}
        onPointerCancel={() => setHeld(undefined)}
        onKeyDown={(event) => {
          if (!rows.drags) return;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") step(1);
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") step(-1);
          else return;
          event.preventDefault();
        }}
      >
        {PLACES.map((place) => {
          const ghost = ghostAt(place, gauge);
          return (
            <i
              key={place}
              data-lit={place < lit}
              data-tone={ghost === undefined ? gauge.tone : gauge.ghost?.tone}
              data-ghost={ghost}
              data-past={
                ghost === undefined &&
                gauge.marker !== undefined &&
                place >= gauge.lit &&
                (place / WINDOW_BARS) * 100 >= gauge.marker
              }
              style={{ ["--k" as string]: String(place) }}
            />
          );
        })}
        {marker !== undefined && (
          <span
            className="cw-marker"
            data-held={held !== undefined}
            style={{ left: `${marker}%` }}
            data-testid="window-marker"
          >
            <span className="cw-flag">{`${flag ?? marker}%`}</span>
          </span>
        )}
      </div>
      <div className="cw-scale">
        <span aria-hidden="true">0</span>
        {gauge.ghost !== undefined && (
          <span
            key={gauge.ghost.bars}
            className="cw-ghost"
            data-tone={gauge.ghost.tone}
            style={{ ["--top" as string]: String((gauge.ghost.bars - 1) / (WINDOW_BARS - 1)) }}
            data-testid="window-ghost"
          >
            {`${gauge.ghost.words} `}
            <b>{`${gauge.ghost.percent}%`}</b>
          </span>
        )}
        <span aria-hidden="true" data-testid="window-end">
          {gauge.end}
        </span>
      </div>
    </>
  );
}

/** Whether this browser asks for less motion. */
function lessMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * The bars lit on the copy's first draw: none, then the fill a frame later, so each bar's light
 * comes on in turn behind the one before it (the bars' staggered transition). At once for a copy
 * kept from before, and under Reduce Motion.
 */
function useClimb(lit: number, climb: boolean): number {
  const [up, setUp] = useState(!climb || lessMotion());
  useEffect(() => {
    if (up) return;
    const frame = requestAnimationFrame(() => setUp(true));
    return () => cancelAnimationFrame(frame);
  }, [up]);
  return up ? lit : 0;
}

/** The number over the bars, counting up from none with the fill on the copy's first draw. */
function useCountUp(percent: number, climb: boolean): number {
  const [shown, setShown] = useState(climb && !lessMotion() ? 0 : percent);
  const counted = useRef(!climb || lessMotion());
  useEffect(() => {
    if (counted.current) {
      setShown(percent);
      return;
    }
    counted.current = true;
    const start = performance.now();
    let frame = 0;
    // One clock for both ends: a frame's own timestamp may run from another origin.
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / COUNT_MS);
      setShown(Math.round(percent * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [percent]);
  return shown;
}
