/**
 * What the computer says for the update dot, About and a harness's Bridge group (ADR 0296, ADR
 * 0297), asked and kept in one place, so the phone, the iPad, the Mac and the web hold to the
 * same rules:
 *
 * - A read that fails changes nothing: what the last one said is kept. Only an answer changes what
 *   is known, and only an older server's "no such route" means the computer keeps no such list.
 * - Answers are kept in the order they were asked for, whatever order they land in. A read says
 *   how things stood when it was asked, so one that lands behind a newer answer is dropped.
 * - A switch the owner turns shows at once, drawn over what the computer last said, and the writes
 *   go one at a time in the order the switches were turned. One the computer wouldn't take goes
 *   back, whatever the read after it does; of two turned quickly, the last is what shows.
 * - Closed, it says nothing more: an answer that lands after the workspace was switched, or the
 *   page left, is dropped.
 *
 * Nothing here is React's. An app hands in the calls and a place to show what is said.
 */

import type { ComputerFacts } from "./about.js";
import type { HarnessSoftware, SelfUpdateFacts, Software } from "./inStep.js";
import { onTheirWay } from "./onTheirWay.js";
import type { ServerFacts } from "./store.js";
import type { UpdateFeed } from "./updates.js";

/** The computer as About says it: being read, read, or not reached. */
export type ComputerRead =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly facts: ComputerFacts }
  | { readonly kind: "unreached" };

/** What the computer last said, with the owner's switches turned here drawn over it. */
export interface ComputerSays {
  readonly computer: ComputerRead;
  /** The releases out and the App Store's version, as the computer last read them. */
  readonly feed: UpdateFeed | undefined;
  /** For the owner: the night switch and how the last update went. */
  readonly selfUpdate: SelfUpdateFacts | undefined;
  /** What each harness and device runs; none from a computer that keeps no such list. */
  readonly software: Software | undefined;
}

export const NOTHING_SAID: ComputerSays = {
  computer: { kind: "reading" },
  feed: undefined,
  selfUpdate: undefined,
  software: undefined,
};

/** The store's calls the reader asks through; a test hands in its own. */
export interface ComputerCalls {
  readonly serverFacts: () => Promise<ServerFacts>;
  readonly software: () => Promise<Software | undefined>;
  readonly setSelfUpdate: (automatic: boolean) => Promise<SelfUpdateFacts | undefined>;
  readonly keepBridgeCurrent: (harnessId: string, keepCurrent: boolean) => Promise<void>;
}

export interface ComputerReader {
  /** Reads `GET /v1/server` and what everything runs. */
  readonly read: () => void;
  /** Reads only what everything runs: a harness page asks as it opens. */
  readonly readSoftware: () => void;
  /** The owner's night switch, turned. */
  readonly setNightly: (on: boolean) => void;
  /** The owner's switch "Keep this bridge up to date", turned. */
  readonly keepBridge: (harnessId: string, on: boolean) => void;
  /** Says nothing more, whatever lands. */
  readonly close: () => void;
}

/** A switch as it was turned. An object, so two turns the same way are still told apart. */
interface Turn {
  readonly on: boolean;
}

/**
 * Answers in the order they were asked for. `asked` is called as a read goes out, and what it
 * returns says, when the read lands, whether nothing newer has been kept since; `landed` marks an
 * answer that is the newest by landing, as a write's is.
 */
function inOrder(): { readonly asked: () => () => boolean; readonly landed: () => void } {
  let clock = 0;
  let kept = 0;
  return {
    asked: () => {
      clock += 1;
      const at = clock;
      return () => {
        if (at < kept) return false;
        kept = at;
        return true;
      };
    },
    landed: () => {
      clock += 1;
      kept = clock;
    },
  };
}

const NIGHT = "night";

/** The night switch as it was turned, over what the computer last said of itself. */
function withNight(
  self: SelfUpdateFacts | undefined,
  turns: ReadonlyMap<string, Turn>,
): SelfUpdateFacts | undefined {
  const turn = turns.get(NIGHT);
  return self === undefined || turn === undefined ? self : { ...self, automatic: turn.on };
}

/** Each bridge's switch as it was turned, over what the computer last said everything runs. */
function withKeeps(
  software: Software | undefined,
  turns: ReadonlyMap<string, Turn>,
): Software | undefined {
  if (software === undefined || turns.size === 0) return software;
  const kept = (each: HarnessSoftware): HarnessSoftware => {
    const turn = turns.get(each.harnessId);
    return turn === undefined ? each : { ...each, keepCurrent: turn.on };
  };
  return { ...software, harnesses: software.harnesses.map(kept) };
}

/** A call made a moment later, so one a store doesn't have rejects as a failed read does. */
const attempt = <T>(call: () => Promise<T>): Promise<T> => Promise.resolve().then(call);

export function readComputer(
  calls: ComputerCalls,
  show: (says: ComputerSays) => void,
): ComputerReader {
  let closed = false;
  let computer: ComputerRead = { kind: "reading" };
  let feed: UpdateFeed | undefined;
  let selfUpdate: SelfUpdateFacts | undefined;
  let software: Software | undefined;
  const tell = () => {
    if (!closed) show({ computer, feed, selfUpdate, software });
  };
  const self = onTheirWay<SelfUpdateFacts | undefined, Turn>(withNight, undefined, (now) => {
    selfUpdate = now;
    tell();
  });
  const runs = onTheirWay<Software | undefined, Turn>(withKeeps, undefined, (now) => {
    software = now;
    tell();
  });
  const order = { server: inOrder(), self: inOrder(), software: inOrder() };

  /** One write at a time, in the order the switches were turned. */
  let writes: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(write: () => Promise<T>): Promise<T> => {
    const sent = writes.then(() => attempt(write));
    writes = sent.catch(() => undefined);
    return sent;
  };

  const readSoftware = () => {
    const newest = order.software.asked();
    attempt(calls.software).then(
      (said) => {
        if (!closed && newest()) runs.heard(said);
      },
      // Not reached, or the computer in trouble: what it last said stands.
      () => undefined,
    );
  };

  const read = () => {
    const newest = order.server.asked();
    const newestOfItself = order.self.asked();
    attempt(calls.serverFacts).then(
      (facts) => {
        if (closed || !newest()) return;
        computer = { kind: "read", facts: { machine: facts.machine, version: facts.version } };
        feed = facts.updates;
        // What it says of its own updates is older than a switch's answer that landed since.
        if (newestOfItself()) self.heard(facts.selfUpdate);
        else tell();
      },
      () => {
        // Said only of a computer never read: one read before keeps what it said.
        if (closed || computer.kind === "read") return;
        computer = { kind: "unreached" };
        tell();
      },
    );
    readSoftware();
  };

  return {
    read,
    readSoftware,
    setNightly: (on) => {
      const turn = self.ask(NIGHT, { on });
      inTurn(() => calls.setSelfUpdate(on)).then(
        (said) => {
          if (closed) return;
          order.self.landed();
          if (said !== undefined) self.heard(said);
          turn.taken();
        },
        () => {
          if (closed) return;
          // Back to what the computer holds, then asked again in case that moved.
          turn.refused();
          read();
        },
      );
    },
    keepBridge: (harnessId, on) => {
      const turn = runs.ask(harnessId, { on });
      const settled = (took: boolean) => {
        if (closed) return;
        if (took) {
          order.software.landed();
          turn.taken();
        } else turn.refused();
        // Its line follows the switch, and only the computer can say how.
        readSoftware();
      };
      inTurn(() => calls.keepBridgeCurrent(harnessId, on)).then(
        () => settled(true),
        () => settled(false),
      );
    },
    close: () => {
      closed = true;
    },
  };
}
