/**
 * The demo (ADR 0213) under test: a clock that runs in no time, and a store made the way a client
 * makes the demo's, with what the demo's socket delivered to it kept for a test to read.
 */

import { parseEvent } from "@chipschat/protocol";
import { demoDevice } from "../demo/device.js";
import { type DemoPlayer, startDemo } from "../demo/player.js";
import { type Act, type DemoFilm, filmOf } from "../demo/script.js";
import type { DemoClock } from "../demo/serve.js";
import type { Device } from "../device.js";
import type { ClientEvent } from "../events.js";
import { createStore, type Snapshot, type Store } from "../store.js";
import type { TransportOptions } from "../transport.js";

/**
 * What the protocol's schemas would not take of what the demo's socket delivered, or a field they
 * would drop, by each event's number and type: nothing, for a film the wire still plays.
 */
export function unparsed(delivered: readonly ClientEvent[]): string[] {
  return delivered
    .filter((event) => event.type !== "hello")
    .flatMap((event) => {
      const parsed = parseEvent(event);
      const wrong = parsed.ok ? parsed.dropped.map((field) => `drops ${field}`) : [parsed.error];
      return wrong.map((why) => `${event.seq} ${event.type}: ${JSON.stringify(why)}`);
    });
}

/**
 * The rooms, what was said in them, their runs and asks: what a jump must land on. A room's id is
 * written as `named` says, by its title, for a room whose id the store minted itself (a fork's new
 * room), which a replay mints otherwise. Every list is copied, not held: the fold may grow a room's
 * members in place after this is taken.
 */
export function summary(snapshot: Snapshot, named: ReadonlyMap<string, string> = new Map()) {
  return [...snapshot.model.spaces]
    .map((space) => ({ space, id: named.get(space.title ?? "") ?? space.id }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ space, id }) => ({
      id,
      title: space.title,
      members: [...space.members],
      lines: space.lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        author: line.authorId,
        text: line.text,
        files: line.attachments?.map((file) => file.id),
        to: line.addressedTo && [...line.addressedTo],
        mentions: line.mentions && [...line.mentions],
        corrections: line.corrections?.map((note) => note.text),
      })),
      runs: space.runs.map((run) => ({
        runId: run.runId,
        state: run.state,
        agent: run.harnessId,
        goal: run.goal,
        cost: run.costUsd,
        doing: run.statusVerb,
        steps: run.steps.map((step) => `${step.title} ${step.durationMs}`),
        asks: run.approvals.map((each) => ({
          id: each.approvalId,
          decision: each.resolved?.decision,
          by: each.resolved?.by,
          executed: each.executed,
        })),
      })),
      ceiling: space.spendCeiling,
    }));
}

/** Everything queued so far runs: microtasks, and what they queue, a few rounds deep. */
export async function drain(): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export interface FakeClock extends DemoClock {
  /** Move on by `ms`, running each timer due on the way at its own time. */
  readonly advance: (ms: number) => Promise<void>;
}

/** A clock that stands still until told to move: 20 October 2026, six in the evening. */
export function fakeClock(start = Date.parse("2026-10-20T18:00:00.000Z")): FakeClock {
  let now = start;
  let made = 0;
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  const due = (until: number) =>
    [...timers.entries()]
      .filter(([, timer]) => timer.at <= until)
      .sort(([a, one], [b, other]) => one.at - other.at || a - b)[0];
  return {
    now: () => now,
    setTimeout: (run, ms) => {
      made += 1;
      timers.set(made, { at: now + ms, run });
      return made;
    },
    clearTimeout: (timer) => {
      timers.delete(timer as number);
    },
    advance: async (ms) => {
      const until = now + ms;
      await drain();
      for (let next = due(until); next !== undefined; next = due(until)) {
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.run();
        await drain();
      }
      now = until;
      await drain();
    },
  };
}

export interface Watching {
  readonly clock: FakeClock;
  readonly store: Store;
  readonly player: DemoPlayer;
  /** What the demo's socket delivered to the store, the hello first. */
  readonly delivered: ClientEvent[];
  /** What the store wrote over HTTP to the demo, by path, in order, taken or refused. */
  readonly written: { readonly path: string; readonly body: unknown }[];
  readonly snapshot: () => Snapshot;
  readonly close: () => void;
}

/** How long before its beat the person does an act, as the render taps a moment before. */
export const AHEAD = 100;

/**
 * An act done through the store, as the app's own control sends it: the composer's Send, the
 * card's Approve, the model sheet's Save, the editor's Save over the version it read, Compact now,
 * a fork into a new room, a move, the spend sheet's Save, Not right?'s Send on the newest message
 * in the room that says its words. What the server turns away changes nothing, as for a tap.
 */
export async function doAct(store: Store, act: Act): Promise<void> {
  switch (act.kind) {
    case "send":
      store.send({
        spaceId: act.spaceId,
        text: act.text,
        ...(act.to === undefined ? {} : { to: act.to }),
      });
      return;
    case "approve": {
      const { spaceId, runId, approvalId } = act;
      store.resolveApproval({ spaceId, runId, approvalId, decision: "approved" });
      return;
    }
    case "model":
      await store.changeAgentModel(act.agentId, { model: act.model, effort: act.effort });
      return;
    case "context": {
      const copy = await store.agentContext(act.agentId);
      const base = copy.files.find((file) => file.name === act.name)?.hash ?? null;
      const { agentId: id, name, text } = act;
      await store.editContext({ owner: "agent", id, name, text, baseHash: base });
      return;
    }
    case "compact":
      await store.compactAgent(act.agentId);
      return;
    case "fork":
      await store.forkIntoNewRoom(act.agentId, act.title);
      return;
    case "move":
      await store.moveAgent(act.agentId, act.spaceId);
      return;
    case "spend":
      await store.setSpendCeiling(act.spaceId, act.usd);
      return;
    case "notRight": {
      const space = store.getSnapshot().model.spaces.find((each) => each.id === act.spaceId);
      const line = space?.lines.filter((each) => each.text === act.said).at(-1);
      if (line === undefined) return;
      const { spaceId, text } = act;
      store.sendFeedback({ spaceId, lineId: line.id, kind: "correction", text });
      return;
    }
  }
}

/**
 * The person: each act of the chapter playing done `AHEAD` of its beat, through the store, as the
 * render does it on the app's own controls. Answers how to stop.
 */
function acting(
  player: DemoPlayer,
  film: DemoFilm,
  clock: FakeClock,
  store: Store,
  skip: (act: Act) => boolean,
): () => void {
  let chapter: number | undefined;
  const timers: unknown[] = [];
  const stop = player.subscribe((state) => {
    if (!state.playing || state.chapter === chapter) return;
    chapter = state.chapter;
    let at = 0;
    for (const beat of film.chapters[state.chapter]?.beats ?? []) {
      at += beat.wait;
      const { act } = beat;
      if (act === undefined || skip(act)) continue;
      timers.push(
        clock.setTimeout(() => void doAct(store, act).catch(() => undefined), at - AHEAD),
      );
    }
  });
  return () => {
    stop();
    for (const timer of timers) clock.clearTimeout(timer);
  };
}

/**
 * The demo started at a chapter, its store made and folded what it was sent, its player ready, and
 * the person doing each act a moment before its beat, unless `skip` says to leave it undone.
 */
export async function watch(
  options: {
    readonly from?: number;
    readonly film?: string | DemoFilm;
    readonly clock?: FakeClock;
    readonly skip?: (act: Act) => boolean;
  } = {},
): Promise<Watching> {
  const clock = options.clock ?? fakeClock();
  const demo = startDemo({ ...options, clock });
  const delivered: ClientEvent[] = [];
  const connect = (wire: TransportOptions) =>
    demo.storeOptions.connect({
      ...wire,
      onEvent: (event) => {
        delivered.push(event);
        wire.onEvent(event);
      },
    });
  const written: { path: string; body: unknown }[] = [];
  const post = <T>(device: Device, path: string, body: unknown): Promise<T> => {
    written.push({ path, body });
    return demo.storeOptions.post<T>(device, path, body);
  };
  const store = createStore({
    device: await demoDevice(),
    ...demo.storeOptions,
    connect,
    post,
    schedule: (flush) => queueMicrotask(flush),
  });
  await drain();
  const player = demo.makePlayer();
  const stopActing = acting(
    player,
    filmOf(options.film),
    clock,
    store,
    options.skip ?? (() => false),
  );
  return {
    clock,
    store,
    player,
    delivered,
    written,
    snapshot: () => store.getSnapshot(),
    close: () => {
      stopActing();
      player.close();
      store.close();
    },
  };
}
