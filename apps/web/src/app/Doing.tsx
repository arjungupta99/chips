/**
 * What a harness at work wears on the Mac, as on the phone. Three dots with the light running
 * across them in the colour of the face beside them (ADR 0126), which the thinking bubble
 * (`SpaceView.tsx`) and a queued turn's (`TaskBubble.tsx`) both wear; the call in hand drawn by its
 * kind, which the queued turn's still does; and the thinking bubble's steady parts (ADR 0147): its
 * words held a beat and crossfaded where they stand, its clock, and its strip of calls. The
 * phone's `ui/Dots.tsx`, `spaces/CallPill.tsx`, `spaces/Thinking.tsx` and `spaces/CallStrip.tsx`
 * are the same things, and core's `bubbleSays` says what both of them say.
 */

import type {
  CallKind,
  ConnectionState,
  Doing,
  PlacedChip,
  Says,
  Space,
  Step,
  ToolKind,
} from "@chipschat/core";
import {
  CLOSE_WAIT_MS,
  clockWords,
  doingSays,
  fitStrip,
  holdSays,
  saidMidRun,
  stepParts,
  stripOf,
} from "@chipschat/core";
import { Icon, type IconName } from "@chipschat/ui";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Three dots, the light running across them as it runs round a chip's pins: each lit quickly, let
 * go slowly, a little larger while lit (`.lit-dots`). Still, and fully lit, where motion is reduced;
 * still and unlit in a bubble at rest (`.doing-bub[data-resting]`).
 */
export function LitDots({ colour }: { readonly colour: string }) {
  return (
    <span
      className="lit-dots"
      style={{ "--dots": colour } as CSSProperties}
      data-testid="lit-dots"
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}

/** What each kind of call is drawn as. */
const GLYPHS: Readonly<Record<ToolKind, IconName>> = {
  shell: "terminal",
  web: "globe",
  search: "search",
  file: "doc",
};

/**
 * A call, drawn by its kind where its tool says one (core's `stepParts`): a terminal and the
 * command, a globe and the address without its `https://www.`, a glass and what it looked for, a
 * page and the file, in a monospaced face. A tool of no kind keeps its words. Three lines and no
 * further, as the thought has: held to one, a call ended in an ellipsis that ate the thing it was
 * given (Arjun, 1 October 2026).
 */
export function CallPill({ step }: { readonly step: string }) {
  const parts = stepParts(step);
  if (parts === undefined) return null;
  const glyph = parts.kind === undefined ? undefined : GLYPHS[parts.kind];
  const words =
    glyph === undefined
      ? [parts.tool, parts.target].filter((part) => part !== undefined).join(" · ")
      : (parts.target ?? parts.tool);
  return (
    <span className="call-pill" data-kind={parts.kind}>
      {glyph !== undefined && <Icon name={glyph} size={12} />}
      <span className="call-words">{words}</span>
    </span>
  );
}

/** What each kind of call is drawn as on the thinking bubble's strip. */
export const STRIP_GLYPHS: Readonly<Record<CallKind, IconName>> = {
  search: "search",
  web: "globe",
  shell: "terminal",
  image: "image",
  memory: "bookmark",
  edit: "pen",
  file: "doc",
  mail: "mail",
  handoff: "route",
  other: "dot",
};

/**
 * The words on screen, held (core's `holdSays`): read off the run at every drawing, and asked
 * again when words waiting their turn are due or a finished call settles back to *Thinking*.
 */
export function useHeld(doing: Doing): Says {
  const says = doingSays(doing);
  const read = [says.label, says.detail, says.kind, says.code, says.calls, says.settled].join("\n");
  const [held, setHeld] = useState(() => holdSays(undefined, says, Date.now()).held);
  const [asked, ask] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `says` is read by `read`; `asked` is when to read again.
  useEffect(() => {
    const now = Date.now();
    const next = holdSays(held, says, now);
    if (next.held !== held) setHeld(next.held);
    if (next.wake === undefined) return;
    const timer = setTimeout(() => ask((n) => n + 1), Math.max(0, next.wake - now));
    return () => clearTimeout(timer);
  }, [read, held, asked]);
  return held.shown;
}

/**
 * What a harness at work is doing, said where it is named away from the room — the sidebar's list
 * of harnesses — in the words of its bubble's top line, held as the bubble holds them (core's
 * `fleetDoing`). Until 10 October 2026 the list said Jacobian's `run.status` as it came: a line
 * of reasoning, `Writing…`, the reply's first words.
 */
export function DoingWord({ doing }: { readonly doing: Doing }) {
  return <>{useHeld(doing).label}</>;
}

/**
 * The lines the room holds back now (core's `saidMidRun`): a harness's line said in a run still
 * at work, for up to `CLOSE_WAIT_MS` from when this room first saw it, so the reply lands with its
 * run's close — the answer, its receipt and the bubble going — as one change. The lines there when
 * the room opened are drawn: they have stood longer than any wait.
 */
export function useHeldReplies(space: Space): ReadonlySet<string> {
  const seen = useRef<{ readonly space: string; readonly at: Map<string, number> }>(undefined);
  if (seen.current?.space !== space.id) {
    seen.current = {
      space: space.id,
      at: new Map(space.lines.map((line) => [line.id, Number.NEGATIVE_INFINITY])),
    };
  }
  const at = seen.current.at;
  const now = Date.now();
  for (const line of space.lines) if (!at.has(line.id)) at.set(line.id, now);
  const waiting = saidMidRun(space).filter((id) => now - (at.get(id) ?? now) < CLOSE_WAIT_MS);
  const [, ask] = useState(0);
  const key = waiting.join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the lines waiting; their times are in the ref.
  useEffect(() => {
    if (waiting.length === 0) return;
    const due = Math.min(...waiting.map((id) => (at.get(id) ?? 0) + CLOSE_WAIT_MS));
    const timer = setTimeout(() => ask((n) => n + 1), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [key]);
  return new Set(waiting);
}

/** How long after the strip's row starts opening its first glyph comes. */
const STRIP_LEAD_MS = 180;

/**
 * Whether the strip's row is open, and how long its first glyph waits: open from the first words
 * said after the first call, and for as long as the bubble stands. One that came open shows its
 * glyphs as it arrives.
 */
export function useStripRow(called: boolean): {
  readonly open: boolean;
  readonly lead: number | undefined;
} {
  const [came] = useState(called);
  const [open, setOpen] = useState(called);
  if (called && !open) setOpen(true);
  return { open, lead: came ? undefined : STRIP_LEAD_MS };
}

/**
 * Words that change where they stand: what was there fades out, what comes fades in rising three
 * pixels (`.swap-in`, `.swap-out`), both in the one grid cell so neither moves the other. Reduce
 * Motion changes them at once.
 */
export function Swap({
  id,
  className,
  children,
}: {
  readonly id: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const [was, setWas] = useState<{ readonly id: string; readonly words: ReactNode }>({
    id,
    words: children,
  });
  const [going, setGoing] = useState<{ readonly id: string; readonly words: ReactNode }>();
  if (was.id !== id) {
    setGoing(was);
    setWas({ id, words: children });
  }
  const changed = useRef(false);
  if (going !== undefined) changed.current = true;
  return (
    <span className={`swap ${className}`}>
      <span key={id} className={changed.current ? "swap-now swap-in" : "swap-now"}>
        {children}
      </span>
      {going === undefined ? null : (
        <span
          key={`going:${going.id}`}
          className="swap-out"
          aria-hidden="true"
          onAnimationEnd={() => setGoing(undefined)}
        >
          {going.words}
        </span>
      )}
    </span>
  );
}

/**
 * How long the bubbles stay at rest once the socket is open again: the catch-up comes a round trip
 * behind the open, and the end of a turn that came while the room was away lands in it, so the
 * dots do not light only to go (the phone's `CATCH_UP_MS`).
 */
export const CATCH_UP_MS = 800;

/**
 * Whether the room is in touch with its server, for its bubbles' sake: not while the socket is
 * down, nor for `CATCH_UP_MS` after it is back. A room opened connected is in touch at once.
 */
export function useInTouch(connection: ConnectionState): boolean {
  const open = connection === "open";
  const [caughtUp, setCaughtUp] = useState(open);
  useEffect(() => {
    if (!open) {
      setCaughtUp(false);
      return;
    }
    const timer = setTimeout(() => setCaughtUp(true), CATCH_UP_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return open && caughtUp;
}

/** How long the turn has taken, as a clock reads, ticking on the second; stopped while not `running`. */
export function Clock({
  startedAt,
  running = true,
}: {
  readonly startedAt: string | undefined;
  readonly running?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const began = startedAt === undefined ? now : Date.parse(startedAt);
    const wait = 1000 - ((((Date.now() - began) % 1000) + 1000) % 1000) + 5;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [now, startedAt, running]);
  return (
    <span className="doing-clock" data-testid="doing-clock">
      {clockWords(startedAt, now)}
    </span>
  );
}

/** The least time between two calls coming onto the strip. */
const RIPPLE_MS = 90;
const DIGIT = 6.4;
const SIZES = {
  chip: (count: number) => (count > 1 ? 19 + DIGIT * String(count).length : 16),
  more: (hidden: number) => 13 + DIGIT * String(hidden).length,
  gap: 3,
};

/**
 * The thinking bubble's strip, as the phone draws it (`spaces/CallStrip.tsx`): a glyph a call, a
 * run of one kind folded into a glyph and its count, the newest lit in ink, the oldest folded into
 * a `+N` once they outgrow the strip. A burst ripples in a glyph at a time.
 */
export function CallStrip({
  made,
  lead,
}: {
  readonly made: readonly Step[];
  readonly lead: number | undefined;
}) {
  const strip = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<number>();
  useLayoutEffect(() => {
    const node = strip.current;
    if (node === null) return;
    setRoom(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => setRoom(node.clientWidth));
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  const shown = useRipple(made.length, lead);
  const placed =
    room === undefined || room === 0
      ? undefined
      : fitStrip(stripOf(made.slice(0, shown)), room, SIZES);
  const gone = useGone(placed?.chips ?? []);
  return (
    <span className="doing-strip" data-testid="doing-strip" ref={strip} aria-hidden="true">
      {gone.chips.map((chip) => (
        <span
          key={chip.key}
          className="strip-chip strip-going"
          style={{ width: chip.width, "--x": `${chip.x}px` } as CSSProperties}
          onAnimationEnd={() => gone.done(chip.key)}
        >
          <Icon name={STRIP_GLYPHS[chip.kind]} size={10} />
        </span>
      ))}
      {placed?.chips.map((chip) => (
        <StripChip key={chip.key} chip={chip} />
      ))}
      {placed !== undefined && placed.more > 0 && (
        <span className="strip-more" style={{ width: SIZES.more(placed.more) }}>
          +{placed.more}
        </span>
      )}
    </span>
  );
}

function StripChip({ chip }: { readonly chip: PlacedChip }) {
  return (
    <span
      className="strip-chip"
      data-kind={chip.kind}
      data-lit={chip.lit ? "true" : undefined}
      style={{ width: chip.width, transform: `translateX(${chip.x}px)` }}
    >
      <span className="strip-mark" key={chip.count}>
        <Icon name={STRIP_GLYPHS[chip.kind]} size={10} />
        {chip.count > 1 && <span className="strip-count">{chip.count}</span>}
      </span>
    </span>
  );
}

/** How many of `count` calls are on the strip yet: each `RIPPLE_MS` after the one before. */
function useRipple(count: number, lead: number | undefined): number {
  const times = useRef<number[] | undefined>(undefined);
  if (times.current === undefined) {
    times.current = lead === undefined ? Array.from({ length: count }, () => 0) : [];
  }
  const [shown, setShown] = useState(times.current.length);
  useEffect(() => {
    const due = times.current ?? [];
    const now = Date.now();
    for (let index = due.length; index < count; index += 1) {
      const before = due[index - 1];
      const earliest = index === 0 ? now + (lead ?? 0) : now;
      due.push(Math.max(earliest, (before ?? 0) + RIPPLE_MS));
    }
  }, [count, lead]);
  useEffect(() => {
    const due = times.current ?? [];
    const next = due[shown];
    if (shown >= count || next === undefined) return;
    const timer = setTimeout(
      () => {
        const now = Date.now();
        let ready = shown + 1;
        while (ready < count && (due[ready] ?? 0) <= now) ready += 1;
        setShown(ready);
      },
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [shown, count]);
  return Math.min(shown, count);
}

/** The glyphs folded off the strip's start since the last drawing, kept to fade where they stood. */
function useGone(chips: readonly PlacedChip[]) {
  const last = useRef<readonly PlacedChip[]>(chips);
  const [going, setGoing] = useState<readonly PlacedChip[]>([]);
  useLayoutEffect(() => {
    const keys = new Set(chips.map((chip) => chip.key));
    const left = last.current.filter((chip) => !keys.has(chip.key));
    last.current = chips;
    if (left.length > 0) setGoing((was) => [...was, ...left]);
  });
  const done = useCallback(
    (key: string) => setGoing((was) => was.filter((chip) => chip.key !== key)),
    [],
  );
  return { chips: going, done };
}
