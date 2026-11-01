/**
 * A link that asks (ADR 0232), waited on: the code a device shows while the person who sent the
 * link allows it, held where every way of pairing or joining reaches it. Each place that pairs or
 * joins starts a wait here and hands it to `pairDevice` or `joinByInvite`; one screen over the
 * whole app, on the phone and on the web alike, draws it until the wait is over.
 */

import type { AllowWait, JoinWaiting } from "./device.js";

/** What the screen draws while a link waits: whom for, the six digits, and how to stop. */
export interface AllowWaiting extends JoinWaiting {
  readonly kind: "invite" | "pairing";
  /** Who sent an invite, as they go by, when the link said. */
  readonly inviter?: string | undefined;
  /** The room or workspace an invite opens. */
  readonly place?: string | undefined;
  /** Stop waiting: the pairing or join that started it is refused with "Stopped asking." */
  readonly stop: () => void;
}

let waiting: AllowWaiting | undefined;
const listeners = new Set<() => void>();

function shown(next: AllowWaiting | undefined): void {
  waiting = next;
  for (const listener of listeners) listener();
}

/**
 * A wait for one pairing or join, to hand core's `pairDevice` or `joinByInvite`. Nothing shows
 * until the server says the link asks; `done` takes it down however the attempt ended.
 */
export function waitForAllow(
  kind: AllowWaiting["kind"],
  about: Pick<AllowWaiting, "inviter" | "place"> = {},
): AllowWait & { readonly done: () => void } {
  const controller = new AbortController();
  return {
    onWaiting: (said) =>
      shown({
        kind,
        ...about,
        ...said,
        stop: () => {
          controller.abort();
          shown(undefined);
        },
      }),
    signal: controller.signal,
    done: () => shown(undefined),
  };
}

/** The wait being shown, if any: for `useSyncExternalStore`, with `onAllowWaiting`. */
export function allowWaiting(): AllowWaiting | undefined {
  return waiting;
}

/** Be told when a wait starts or ends; answers how to stop being told. */
export function onAllowWaiting(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
