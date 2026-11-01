/**
 * The fan-out port. In solo mode one process delivers to its own subscribers; Phase 6 puts
 * several gateway processes behind one address over Postgres `LISTEN/NOTIFY` or Redis. The
 * port exists from Phase 0 so that change is an adapter swap (technical-plan 6.2).
 */

import type { StoredEvent } from "./event-store.js";

export interface Subscription {
  readonly workspaceId: string;
  /** Narrow to these spaces, or leave undefined for the whole workspace. */
  readonly spaceIds?: readonly string[];
}

export type Listener = (event: StoredEvent) => void;

export interface FanOut {
  /** Deliver an appended event to every subscriber of its workspace or space. */
  readonly publish: (event: StoredEvent) => void;
  /** Returns the function that cancels the subscription. */
  readonly subscribe: (subscription: Subscription, listener: Listener) => () => void;
  /** How many listeners are attached. For the sockets metric and for tests. */
  readonly subscriberCount: () => number;
}
