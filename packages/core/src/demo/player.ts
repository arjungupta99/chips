/**
 * The player (ADR 0213): a film's clock. It plays a chapter's beats on the waits between them and
 * hands what the harnesses say to the demo's server: the agents' side of the film. It keeps where
 * the chapter opens, how far it has played and the lock screen picture as one state a client
 * subscribes to. `pnpm film` renders the films from it (ADR 0217).
 *
 * What You does (a message sent, an answer, a model, a file saved, a Compact now, a fork, a move,
 * a ceiling, Not right?) the person does on the app's own controls; in the render, the render
 * does it a moment before its beat, as a person would (ADR 0217's addendum). The player never
 * does it. When an act's moment comes and the server has not heard it done, the state says so
 * (`missed`), and the render stops on it.
 *
 * The clock is injected, so a test plays a whole film in no time. A jump to a chapter is a fresh
 * server, store and player started there (`startDemo`), not a player that winds itself back.
 */

import { useLink } from "../link.js";
import { DEMO_DEVICE_ID } from "./device.js";
import {
  type Act,
  type Beat,
  type DemoChapter,
  type DemoFilm,
  type DemoScreen,
  filmOf,
  type LockScreenCue,
} from "./script.js";
import {
  type DemoClock,
  type DemoServer,
  type DemoStoreOptions,
  type Heard,
  REAL_CLOCK,
  type ServeOptions,
  serveDemo,
  startingAt,
  writePathOf,
} from "./serve.js";
import { AGENTS, ROOMS } from "./workspace.js";

/** The lock screen a chapter draws as a picture: who asks, in which room, and whether it is answered. */
export interface DemoLockScreen {
  readonly who: string;
  readonly room: string;
  readonly question: string;
  /** What the picture's own Approve answers, through the store's `resolveApproval`. */
  readonly spaceId: string;
  readonly runId: string;
  readonly approvalId: string;
  readonly answered: boolean;
}

export interface DemoState {
  /** The film playing, by its key. */
  readonly film: string;
  /** The chapter playing, from 0. */
  readonly chapter: number;
  /** Where the chapter opens; the person's taps take the app on from there. */
  readonly screen: DemoScreen;
  /** The room, when the screen is one, or the lock screen's. */
  readonly spaceId?: string | undefined;
  /** The agent, when the screen is its page. */
  readonly agentId?: string | undefined;
  readonly lockScreen?: DemoLockScreen | undefined;
  /** An act of this chapter whose moment came before anybody did it, by its kind. */
  readonly missed?: Act["kind"] | undefined;
  readonly playing: boolean;
  /** Played to the end: the last chapter stands, and the demo answers what is sent to it. */
  readonly ended: boolean;
}

export interface DemoPlayer {
  readonly getState: () => DemoState;
  /** Told the state now, and at every change. */
  readonly subscribe: (listener: (state: DemoState) => void) => () => void;
  /** Start playing; once is enough. */
  readonly play: () => void;
  readonly close: () => void;
}

export interface PlayerOptions {
  readonly server: DemoServer;
  /** The film, by its key: the first when none is named. The server must be serving the same. */
  readonly film?: string | DemoFilm | undefined;
  readonly from?: number | undefined;
  readonly clock?: DemoClock | undefined;
}

/** One moment of a chapter, at a played time: a beat, or the end. */
type Step =
  | { readonly at: number; readonly kind: "beat"; readonly beat: Beat }
  | { readonly at: number; readonly kind: "end" };

function stepsOf(chapter: DemoChapter): Step[] {
  const steps: Step[] = [];
  let at = 0;
  for (const beat of chapter.beats) {
    at += beat.wait;
    steps.push({ at, kind: "beat", beat });
  }
  steps.push({ at: at + chapter.hold, kind: "end" });
  return steps;
}

/**
 * Whether something the person did is what an act is waiting for: the same write to the same
 * agent or room, or the same kind of event in the same room. Where a write goes is the person's to
 * choose (another room for the copy, another amount), so a tap is done whatever it picked; but a
 * send that names who it is for (`to`, the pick of ADR 0229) is done only by words sent to them.
 */
function doneBy(act: Act, heard: Heard): boolean {
  const path = writePathOf(act);
  if (path !== undefined) {
    const named = act.kind !== "context" || heard.via !== "http" || heard.body["name"] === act.name;
    return heard.via === "http" && heard.path === path && named;
  }
  if (heard.via !== "socket") return false;
  const { event } = heard;
  switch (act.kind) {
    case "send":
      return (
        event.type === "message.post" &&
        event.space_id === act.spaceId &&
        (act.to === undefined || sameIds(event["to"], act.to))
      );
    case "notRight":
      return (
        event.type === "feedback" &&
        event["kind"] === "correction" &&
        event.space_id === act.spaceId
      );
    case "approve":
      return event.type === "approval.resolved" && event["approval_id"] === act.approvalId;
    default:
      return false;
  }
}

/** Whether a send's `to` names the ones an act asks for, in any order. */
function sameIds(to: unknown, want: readonly string[]): boolean {
  if (!Array.isArray(to) || to.length !== want.length) return false;
  return want.every((id) => to.includes(id));
}

/** What the chapter has come to: its lock screen, its ask's answer, and what the person did. */
interface View {
  lockScreen: LockScreenCue | undefined;
  /** How the chapter's ask was answered, for a beat that says something else after a Deny. */
  answer: string | undefined;
  /** What the person did this chapter, as the server took it. */
  seen: Heard[];
  missed: Act["kind"] | undefined;
}

function viewOf(): View {
  return { lockScreen: undefined, answer: undefined, seen: [], missed: undefined };
}

/** Where a chapter opens, each only when there is one: a state names nothing it does not show. */
function placeOf(chapter: DemoChapter): Pick<DemoState, "screen" | "spaceId" | "agentId"> {
  const { screen, spaceId, agentId } = chapter;
  return {
    screen,
    ...(spaceId === undefined ? {} : { spaceId }),
    ...(agentId === undefined ? {} : { agentId }),
  };
}

function lockScreenOf(view: View): Pick<DemoState, "lockScreen"> {
  const cue = view.lockScreen;
  if (cue === undefined) return {};
  const answered = view.seen.some(
    (heard) =>
      heard.via === "socket" &&
      heard.event.type === "approval.resolved" &&
      heard.event["approval_id"] === cue.approvalId,
  );
  const room = ROOMS.find((each) => each.id === cue.spaceId)?.title ?? "";
  const { question, spaceId, runId, approvalId } = cue;
  const who = AGENTS[cue.agent].name;
  return { lockScreen: { who, room, question, spaceId, runId, approvalId, answered } };
}

export function createPlayer(options: PlayerOptions): DemoPlayer {
  const { server } = options;
  const film: DemoFilm = filmOf(options.film);
  const clock = options.clock ?? REAL_CLOCK;
  const last = film.chapters.length - 1;
  const chapterAt = (at: number) => film.chapters[Math.min(Math.max(at, 0), last)] as DemoChapter;
  const from = startingAt(film, options.from);
  let index = Math.min(from, last);
  let ended = from > last;
  let steps = stepsOf(chapterAt(index));
  let next = 0;
  let view = viewOf();
  /** Played time in the chapter as it stood at `markedAt`. */
  let played = 0;
  let markedAt = clock.now();
  let playing = false;
  let timer: unknown;
  let closed = false;
  const listeners = new Set<(state: DemoState) => void>();
  if (ended) server.answering(true);

  const playedNow = () => (playing ? played + (clock.now() - markedAt) : played);

  const stateOf = (): DemoState => ({
    film: film.key,
    chapter: index,
    ...placeOf(chapterAt(index)),
    ...lockScreenOf(view),
    ...(view.missed === undefined ? {} : { missed: view.missed }),
    playing,
    ended,
  });

  const emit = () => {
    const state = stateOf();
    for (const listener of listeners) listener(state);
  };

  const schedule = () => {
    clock.clearTimeout(timer);
    timer = undefined;
    const step = steps[next];
    if (!playing || ended || closed || step === undefined) return;
    timer = clock.setTimeout(fire, Math.max(0, step.at - playedNow()));
  };

  /** The step due now: its played time is where the clock stands, whatever the timer's drift. */
  function fire(): void {
    timer = undefined;
    const step = steps[next];
    if (step === undefined || closed) return;
    played = step.at;
    markedAt = clock.now();
    next += 1;
    if (step.kind === "end") enter(index + 1);
    else run(step.beat);
    emit();
    schedule();
  }

  function enter(chapter: number): void {
    if (chapter > last) {
      ended = true;
      playing = false;
      server.answering(true);
      return;
    }
    index = chapter;
    steps = stepsOf(chapterAt(index));
    next = 0;
    played = 0;
    view = viewOf();
  }

  /** What the harnesses say on a beat, after a Deny when that is what the chapter's ask got. */
  function say(beat: Beat): void {
    const said =
      view.answer === "denied" && beat.ifDenied !== undefined ? beat.ifDenied : beat.play;
    if (said !== undefined) server.play(said);
    if (beat.presence !== undefined) {
      server.presence(beat.presence.harnessId, beat.presence.connected);
    }
  }

  /**
   * A beat: its lock screen, what the harnesses say, and its act checked. An act the person did
   * gives the chapter its answer; one nobody did by now is missed.
   */
  function run(beat: Beat): void {
    if (beat.lockScreen !== undefined) view.lockScreen = beat.lockScreen ?? undefined;
    say(beat);
    const { act } = beat;
    if (act === undefined) return;
    const done = view.seen.find((heard) => doneBy(act, heard));
    if (done === undefined) view.missed ??= act.kind;
    else if (act.kind === "approve" && done.via === "socket") {
      view.answer = String(done.event["decision"]);
    }
  }

  /** The person did something, and the server has taken it: an act it waits for is done. */
  const heard = (taken: Heard): void => {
    view.seen.push(taken);
    emit();
  };
  const unhear = server.onPerson(heard);

  return {
    getState: stateOf,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(stateOf());
      return () => listeners.delete(listener);
    },
    play: () => {
      if (playing || ended || closed) return;
      playing = true;
      markedAt = clock.now();
      schedule();
      emit();
    },
    close: () => {
      closed = true;
      playing = false;
      clock.clearTimeout(timer);
      unhear();
      listeners.clear();
    },
  };
}

/** A demo ready to make a store and its player: the seams for `createStore`, and the player for it. */
export interface DemoStart {
  /**
   * What `createStore` takes for the demo's device besides the device itself, spread over the
   * app's own options so that nothing of the app's (its storage, its socket) is used.
   */
  readonly storeOptions: DemoStoreOptions;
  /** The player, at the chapter the demo started from, once the store is made with `storeOptions`. */
  readonly makePlayer: () => DemoPlayer;
}

/**
 * Start a film at a chapter (0, or its chapter count for Look around, the film played whole): a
 * server that already holds everything played before it, the demo's link registered for its
 * device so a room's picture draws, and the player to make once the store is made. A jump on the
 * bar is another `startDemo`, with the old store and player closed.
 */
export function startDemo(options: ServeOptions = {}): DemoStart {
  const server = serveDemo(options);
  useLink(DEMO_DEVICE_ID, server.link);
  const { film, from, clock } = options;
  return {
    storeOptions: server.storeOptions,
    makePlayer: () => createPlayer({ server, film, from, clock }),
  };
}
