/**
 * What has been sent and not yet answered. A socket comes and goes; a harness's events must
 * not. Every event carries an idempotency key and the server answers each with an `ack` or an
 * `error` naming it; until then the event waits here, and every socket that opens — the first
 * time, or again after a drop — sends the unanswered ones first. A resend the server had
 * already applied comes back `duplicate: true`, which is what the key is for.
 */

export interface Ack {
  readonly idempotencyKey: string;
  readonly seq: number;
  readonly duplicate: boolean;
  /** For a `task` that opened a lane: where it lives and which run it is (M3.5). */
  readonly lane?: { readonly laneId: string; readonly runId: string; readonly spaceId: string };
  /**
   * A message Chips took into the room but held from the agents it named (ADR 0097): they have
   * sent each other their allowance since a person last acted, or a person paused them. Tell the
   * model, so it says what is done and what is blocked rather than waiting on them.
   */
  readonly held?: true;
  /**
   * With `held`: the messages between agents since the reset, and the workspace's hold (ADR
   * 0187), absent where it holds them only on a pause.
   */
  readonly exchange?: { readonly count: number; readonly allowance?: number };
}

export class RefusedError extends Error {
  override readonly name = "RefusedError";
  constructor(
    readonly code: string,
    message: string,
    readonly idempotencyKey?: string,
  ) {
    super(message);
  }
}

interface Waiting {
  readonly event: Readonly<Record<string, unknown>>;
  readonly resolve: (ack: Ack) => void;
  readonly reject: (error: RefusedError) => void;
}

export interface Outbox {
  /** Hold an event until the server answers for its key. */
  readonly add: (key: string, event: Readonly<Record<string, unknown>>) => Promise<Ack>;
  readonly unanswered: () => readonly Readonly<Record<string, unknown>>[];
  readonly acked: (ack: Ack) => void;
  readonly refused: (error: RefusedError) => void;
  /** Reject everything still waiting: the connection is gone for good. */
  readonly abandon: (reason: string) => void;
  readonly size: () => number;
}

export function createOutbox(): Outbox {
  const waiting = new Map<string, Waiting>();
  return {
    add(key, event) {
      return new Promise<Ack>((resolve, reject) => {
        waiting.set(key, { event, resolve, reject });
      });
    },
    unanswered: () => [...waiting.values()].map((entry) => entry.event),
    acked(ack) {
      const entry = waiting.get(ack.idempotencyKey);
      if (entry === undefined) return;
      waiting.delete(ack.idempotencyKey);
      entry.resolve(ack);
    },
    refused(error) {
      if (error.idempotencyKey === undefined) return;
      const entry = waiting.get(error.idempotencyKey);
      if (entry === undefined) return;
      waiting.delete(error.idempotencyKey);
      entry.reject(error);
    },
    abandon(reason) {
      for (const [key, entry] of waiting) {
        waiting.delete(key);
        entry.reject(new RefusedError("closed", reason, key));
      }
    },
    size: () => waiting.size,
  };
}
