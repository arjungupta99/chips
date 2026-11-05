/**
 * What the desktop shell does with what the app knows (M2.2).
 *
 * Three things, all of them the app telling the shell rather than the other way round: how many
 * things need a person, so the menu bar and the Dock can say; what a person pressed on a banner,
 * which comes back here and goes out as an ordinary decision through the store — the same call the
 * card makes, so a notification and a click are the same event by the time they reach the server —
 * or, for a click on the banner itself, opens its space as a `chips://approval` link would; and a
 * `chips://` link the shell was opened with. Which banners to raise, and on which of a
 * person's devices, is `useNotifications` (M5.6).
 *
 * Several workspaces (M5.3) are several stores: the badge is their sum, and a banner's answer
 * finds the workspace that raised it. In a browser there is no shell and this does nothing at all.
 */

import {
  askDetail,
  attention,
  type NeedsYouItem,
  nameOf,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { useEffect, useMemo, useRef } from "react";
import type { ChipsLink, Decision, Desktop } from "../native.ts";

export interface DesktopOptions {
  /** One workspace's store. */
  readonly store?: Store | undefined;
  /**
   * Every workspace the shell should hear from (M5.3): the one in front and the ones in the
   * background, less any muted on this device. The badge counts them all; a banner comes from
   * whichever raised the approval, and its answer goes back to that one.
   */
  readonly stores?: readonly Store[] | undefined;
  readonly desktop: Desktop | undefined;
  /** A `chips://` link the shell was opened with. */
  readonly onOpen?: ((link: ChipsLink) => void) | undefined;
}

export function useDesktop({ store, stores: given, desktop, onOpen }: DesktopOptions): void {
  const open = useRef(onOpen);
  useEffect(() => {
    open.current = onOpen;
  });
  // One list for as long as its members stay: the caller memoises `stores`, and the one-store
  // form is memoised here, so the subscriptions below are made once per change of membership.
  const stores = useMemo(() => given ?? (store === undefined ? [] : [store]), [given, store]);

  useEffect(() => {
    if (desktop === undefined || stores.length === 0) return;
    let badge = -1;
    const counts = new Map<Store, number>();

    const push = (from: Store, snapshot: Snapshot) => {
      const waiting = attention(snapshot.model.needsYou, snapshot.readState);
      counts.set(from, waiting.length);
      const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
      if (total !== badge) {
        badge = total;
        void desktop.badge(badge);
      }
    };

    const unsubscribes = stores.map((each) => {
      push(each, each.getSnapshot());
      return each.subscribe((snapshot) => push(each, snapshot));
    });

    // Registering a listener is a round trip to the shell, and a window can be gone before it
    // answers: a stop that arrives after the cleanup is called at once rather than kept.
    let live = true;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => {
      if (live) stops.push(stop);
      else stop();
    };
    void desktop
      .onDecision((decision) => {
        // A click on the banner itself asks to see it: its space opens, as a tap on the phone's
        // opens it (ADR 0267). The shell has brought the window forward already.
        if (decision.decision === "opened") {
          open.current?.({ kind: "approval", id: decision.approvalId });
          return;
        }
        answer(stores, decision);
      })
      .then(keep);
    void desktop.onOpen((link) => open.current?.(link)).then(keep);

    return () => {
      live = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const stop of stops.splice(0)) stop();
    };
  }, [stores, desktop]);
}

/** Approve or Deny on a banner, as the card's buttons would, in the workspace that asked. */
function answer(stores: readonly Store[], decision: Decision): void {
  if (decision.decision !== "approved" && decision.decision !== "denied") return;
  const said = decision.decision;
  // The banner's approval is in one of the workspaces; the answer goes back to that one.
  for (const each of stores) {
    const snapshot = each.getSnapshot();
    const item = attention(snapshot.model.needsYou, snapshot.readState).find(
      (candidate) => candidate.id === decision.approvalId,
    );
    if (item?.runId === undefined) continue;
    each.resolveApproval({
      spaceId: item.spaceId,
      runId: item.runId,
      approvalId: item.id,
      decision: said,
    });
    return;
  }
}

/** "Scout wants to email dana@northwind.com" — who, and what, in the banner's one line. */
export function askTitle(item: NeedsYouItem, snapshot: Snapshot): string {
  return `${nameOf(snapshot.directory, item.harnessId)} needs a decision`;
}

/**
 * The action itself, which is what the two buttons are about: the question (ADR 0142), then what
 * a yes does, else the preview.
 */
export function askBody(item: NeedsYouItem, snapshot: Snapshot): string {
  const space = snapshot.model.spaces.find((each) => each.id === item.spaceId);
  const approval = space?.runs
    .flatMap((run) => run.approvals)
    .find((each) => each.approvalId === item.id);
  const detail = approval === undefined ? undefined : askDetail(approval);
  return detail === undefined ? item.title : `${item.title} — ${detail}`;
}
