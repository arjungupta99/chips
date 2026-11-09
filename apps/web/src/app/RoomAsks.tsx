/**
 * The asks at the foot of a room on the web and the Mac: the ones still waiting on somebody, from
 * every run, as on the phone (`openAsks`). Who answered what is behind the dots on When it asks
 * you and in the workspace's log.
 *
 * Answered cards used to stay under the newest run until the next one started. Under For an hour
 * and Let it work that was every command an agent ran: 29 cards in a single run, each with its
 * whole command, and nothing waiting on anybody (Arjun, 8 November 2026: "why are there so many
 * giant permission boxes in mac app?").
 *
 * A card that closes while it is drawn says how for a moment and folds away, so the lines over it
 * glide down rather than jump (`.room-ask[data-going]`). Approve keeps its tick for that moment
 * (`Decide`).
 *
 * A new ask waits a beat before it is drawn. A standing yes answers most asks within a frame or
 * two, and one answered inside its beat is never drawn, so a room working under Let it work stays
 * still instead of flashing a card for each command. Asks already waiting as the room opens are
 * drawn at once.
 *
 * The foot of the room changes once for each thing that happens, never twice. An agent's bubble
 * stands through its ask's beat and goes in the frame its card is drawn, and comes back as an
 * answered card starts to fold; a new ask takes the place of the card answered before it, rather
 * than landing under it while it folds. Each of them was its own move of the whole room (Arjun, 8
 * November 2026, of the Mac: "tapping them makes the whole scrolling window go bouncing", "bouncy
 * can also happen when the permission screen appears"): down 56 pixels as the bubble went and up
 * 548 as the card came; and down, up, down and up as a yes was given to one of a run of commands.
 */

import {
  type Approval,
  type Doing,
  type Question,
  type Space,
  spaceDoing,
  THINKING_GRACE_MS,
} from "@chipschat/core";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

/** How long a new ask waits to be drawn: long enough for 95 of 96 a standing yes answered. */
export const ASK_BEAT_MS = 300;

/** How long a closed card stands with its tick before it folds: `.room-ask[data-going]`'s pause. */
export const ASK_TICK_MS = 750;

/**
 * How long a closed card stays: `.room-ask[data-going]`'s pause and fold, and a little over. Held
 * at nothing by its fill, a card taken late shows no change; one taken early would be cut off.
 */
export const ASK_GOING_MS = 1200;

interface Asked {
  readonly id: string;
  readonly harnessId: string;
  /** Still waiting on somebody. */
  readonly open: boolean;
}

export type RoomAsk =
  | (Asked & { readonly kind: "approval"; readonly approval: Approval })
  | (Asked & { readonly kind: "question"; readonly question: Question });

/** Every ask in the room, answered or not, in the order they were asked within each run. */
function asksIn(space: Space): readonly RoomAsk[] {
  return space.runs.flatMap((run): readonly RoomAsk[] => [
    ...run.approvals.map(
      (approval): RoomAsk => ({
        kind: "approval",
        id: approval.approvalId,
        harnessId: run.harnessId,
        open: approval.resolved === undefined,
        approval,
      }),
    ),
    ...run.questions.map(
      (question): RoomAsk => ({
        kind: "question",
        id: question.askId,
        harnessId: run.harnessId,
        open: question.answered === undefined,
        question,
      }),
    ),
  ]);
}

type Timers = Map<string, ReturnType<typeof setTimeout>>;

/** Stops an ask's timer. */
function cancel(timers: Timers, id: string): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** Unless there is a timer going under this name, does `then` after `ms`. */
function later(timers: Timers, name: string, ms: number, then: () => void): void {
  if (timers.has(name)) return;
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name);
      then();
    }, ms),
  );
}

/** What an ask needs now: its beat, its fold, or, answered inside its beat, never to be drawn. */
function needs(open: boolean, stood: boolean, gone: boolean) {
  if (open) return stood ? "nothing" : "beat";
  if (!stood) return "forget";
  return gone ? "nothing" : "fold";
}

/** What stands at the foot of the room. */
interface Foot {
  readonly drawn: readonly RoomAsk[];
  /** Whose card holds the foot: open, or answered and still showing its tick. */
  readonly standing: ReadonlySet<string>;
  /** Whose ask is waiting out its beat, with no card to show for it yet. */
  readonly coming: ReadonlySet<string>;
}

/** What each ask has done so far in this view of the room. */
interface Marks {
  /** Had its beat, and been drawn. */
  readonly stood: Set<string>;
  /** Closed, and done showing its tick. */
  readonly folding: Set<string>;
  /** Off the page. */
  readonly gone: Set<string>;
}

/** A closed card's second timer, beside the one that takes it away. */
const tickOf = (id: string) => `${id}:tick`;

/**
 * The asks to draw: those that have had their beat, until they have folded away or the next ask
 * has taken their place. Kept here and not in the model, since it is only about this view of the
 * room.
 */
function useFoot(asks: readonly RoomAsk[]): Foot {
  const [marks] = useState<Marks>(() => ({
    stood: new Set(asks.filter((ask) => ask.open).map((ask) => ask.id)),
    folding: new Set<string>(),
    gone: new Set<string>(),
  }));
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const timers = useRef<Timers>(new Map());
  const latest = useRef(asks);
  latest.current = asks;

  useEffect(() => {
    const running = timers.current;
    const landed = () => {
      takePlace(latest.current, marks, running);
      redraw();
    };
    for (const ask of asks) arm(ask, marks, running, landed, redraw);
  }, [asks, marks]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const id of [...running.keys()]) cancel(running, id);
    };
  }, []);

  const { stood, folding, gone } = marks;
  const drawn = asks.filter((ask) => stood.has(ask.id) && !gone.has(ask.id));
  const coming = new Set(
    asks.filter((ask) => ask.open && !stood.has(ask.id)).map((ask) => ask.harnessId),
  );
  // A card waiting for the ask that will take its place holds the foot until it does.
  const standing = drawn.filter((ask) => !folding.has(ask.id) || coming.has(ask.harnessId));
  return { drawn, standing: new Set(standing.map((ask) => ask.harnessId)), coming };
}

/** A new ask has had its beat: any card still going is gone, and this one stands in its place. */
function takePlace(asks: readonly RoomAsk[], marks: Marks, running: Timers): void {
  for (const { id, open } of asks) {
    if (open || !marks.stood.has(id) || marks.gone.has(id)) continue;
    marks.gone.add(id);
    cancel(running, id);
    cancel(running, tickOf(id));
  }
}

/** Sets going whichever timer an ask needs now. */
function arm(
  { id, open }: RoomAsk,
  { stood, folding, gone }: Marks,
  running: Timers,
  landed: () => void,
  redraw: () => void,
): void {
  const need = needs(open, stood.has(id), gone.has(id));
  if (need === "forget") cancel(running, id);
  if (need === "beat") {
    later(running, id, ASK_BEAT_MS, () => {
      stood.add(id);
      landed();
    });
  }
  if (need !== "fold") return;
  if (!folding.has(id)) {
    later(running, tickOf(id), ASK_TICK_MS, () => {
      folding.add(id);
      redraw();
    });
  }
  later(running, id, ASK_GOING_MS, () => {
    gone.add(id);
    redraw();
  });
}

/**
 * The harnesses at work whose bubbles stand: each once its run has been going `THINKING_GRACE_MS`
 * and the room's newest line is the server's, and each from then until it stops, whatever is sent
 * meanwhile — taken down at each send, it folded shut and opened again under every message typed
 * while the harness worked (the phone, 23 September 2026). The beat is counted from the run's own
 * start, so a room opened on a run long going shows its bubble at once; a clock ahead of the
 * server's waits no more than the beat.
 */
function useBeat(doing: readonly Doing[], confirmed: boolean): readonly Doing[] {
  const standing = useRef<ReadonlySet<string>>(new Set());
  const [, again] = useState(0);
  const now = Date.now();
  const left = (each: Doing) => {
    const started = each.startedAt === undefined ? Number.NaN : new Date(each.startedAt).getTime();
    if (Number.isNaN(started)) return 0;
    return Math.min(THINKING_GRACE_MS, Math.max(0, started + THINKING_GRACE_MS - now));
  };
  const shown = doing.filter(
    (each) => standing.current.has(each.harnessId) || (confirmed && left(each) === 0),
  );
  const waits = confirmed ? doing.filter((each) => !shown.includes(each)).map(left) : [];
  const next = waits.length === 0 ? undefined : Math.max(1, Math.min(...waits));
  useLayoutEffect(() => {
    standing.current = new Set(shown.map((each) => each.harnessId));
  });
  useEffect(() => {
    if (next === undefined) return;
    const timer = setTimeout(() => again((n) => n + 1), next);
    return () => clearTimeout(timer);
  }, [next]);
  return shown;
}

/**
 * The room's asks, and the bubbles of the agents at work under them. Keyed by the space, so a card
 * folding in one room is not carried to the next.
 */
export function RoomAsks(props: {
  readonly space: Space;
  /** The room's newest line is the server's: a bubble waits for that as well as for its beat. */
  readonly confirmed: boolean;
  readonly working: (doing: Doing) => ReactNode;
  readonly children: (ask: RoomAsk) => ReactNode;
}) {
  const asks = useMemo(() => asksIn(props.space), [props.space]);
  const { drawn, standing, coming } = useFoot(asks);
  // A thinking bubble waits a beat from its run's start, and for the reader's own line to be the
  // server's, so a quick answer comes without one (ADR 0050 rule 6, ADR 0268).
  const doing = useBeat(spaceDoing(props.space, coming), props.confirmed);
  return (
    <>
      {drawn.map((ask) => (
        <div
          key={ask.id}
          className="room-ask"
          data-going={ask.open ? undefined : "true"}
          data-waits={!ask.open && coming.has(ask.harnessId) ? "true" : undefined}
          inert={!ask.open}
        >
          <div className="room-ask-in">{props.children(ask)}</div>
        </div>
      ))}
      {doing.filter((each) => !standing.has(each.harnessId)).map(props.working)}
    </>
  );
}
