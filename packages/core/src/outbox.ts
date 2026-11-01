/**
 * The outbox: what has been sent and not yet answered.
 *
 * A socket comes and goes; a person's message must not. Every client event carries an
 * idempotency key, and the server answers each with an `ack` or an `error` naming it. Until
 * that answer arrives the event stays here, so a socket that opens — for the first time, or
 * again after a drop — sends everything still unanswered before anything else. A resend the
 * server had already applied comes back as `duplicate: true`, which is what the key is for.
 *
 * Pure bookkeeping, so it is tested without a socket; the transport is the one that sends.
 */

export type OutboxEvent = Readonly<Record<string, unknown>> & { readonly idempotency_key: string };

export interface Outbox {
  /** Hold an event until the server answers for its key. A repeated key replaces the first. */
  readonly add: (event: OutboxEvent) => void;
  /** Everything unanswered, oldest first: what a fresh socket sends before anything else. */
  readonly unanswered: () => readonly OutboxEvent[];
  /** The server answered for this key, with an ack or a refusal; either way it is done here. */
  readonly settle: (key: string) => OutboxEvent | undefined;
  readonly size: () => number;
}

export function createOutbox(): Outbox {
  const waiting = new Map<string, OutboxEvent>();
  return {
    add(event) {
      // Re-adding moves nothing: the first send's place in line is the one that counts.
      if (!waiting.has(event.idempotency_key)) waiting.set(event.idempotency_key, event);
    },
    unanswered: () => [...waiting.values()],
    settle(key) {
      const event = waiting.get(key);
      waiting.delete(key);
      return event;
    },
    size: () => waiting.size,
  };
}
