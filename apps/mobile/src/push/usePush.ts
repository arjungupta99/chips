/**
 * The push half of the app, as hooks (M4.3, ADR 0045).
 *
 * `usePushResponses` is the one that has to be right. A person pressing Approve or Deny on the
 * lock screen has decided, and the phone owes them the delivery: the decision is written to the
 * queue **first**, then sent. If the send fails — no signal, the server asleep, the app killed
 * mid-flight — the row is still there, and the next time the app comes forward it is drained.
 * Nothing is ever answered twice: the store's own idempotency key covers a retry, and a row
 * goes only after the server has taken it.
 *
 * `usePushBadge` keeps the number on the icon honest and takes down banners for asks that have
 * since been answered — by this person on a laptop, by a colleague, or by the clock. The server
 * cannot retract a push it has already delivered, so the phone tidies up for it.
 */

import { type Device, isDemo, type Store } from "@chipschat/core";
import type { NotificationResponse } from "expo-notifications";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { readSetting, SETTINGS } from "../prefs";
import { useSnapshot } from "../store/provider";
import { useBringForward } from "../workspaces/forward";
import {
  deviceFrom,
  type PendingDecision,
  type Response,
  readOnArrival,
  responseTo,
} from "./payload";
import { behindOf, decisionStore, type PushWorkspaces } from "./route";

export type { PushWorkspaces } from "./route";

import { forget, pending, remember } from "./queue";
import {
  dismissAnswered,
  installCategory,
  lastResponse,
  onReceived,
  onResponse,
  platform,
  settleRegistration,
  showBadge,
  silenceInForeground,
} from "./register";

/** Where a tapped notification goes. The scheme's word for it is the link module's business. */
const routeFor = (approvalId: string) => `/needs/${approvalId}`;

/**
 * Install the category and the foreground behaviour, once, at startup — before any response can
 * arrive. Registering the buttons is what makes them appear on a push that names the category,
 * and a push that arrives before they are registered shows none.
 *
 * Whether this target has notifications at all is `register.ts`'s to know, not this hook's.
 */
export function usePushSetup(): void {
  useEffect(() => {
    silenceInForeground();
    void installCategory();
  }, []);
}

/**
 * Once per launch of a paired app, tell each workspace's server again where this phone is (ADR
 * 0157) and the key it seals words to (ADR 0158), when the person switched pushes on. A phone that
 * turned it on before either existed would otherwise never send them; one whose turning on the
 * server never took is registered now (`refreshRegistration`). Every workspace this phone holds is
 * told, the one in front and those behind it; one muted here (ADR 0197), or every one when pushes
 * are switched off, is told again to stop (`settleRegistration`).
 */
export function usePushRefresh(devices: readonly Device[]): void {
  const told = useRef(new Set<string>());
  useEffect(() => {
    const fresh = devices.filter((device) => !told.current.has(device.deviceId));
    if (fresh.length === 0) return;
    for (const device of fresh) told.current.add(device.deviceId);
    void readSetting(SETTINGS.push)
      .catch(() => undefined)
      .then((chosen) =>
        Promise.all(
          fresh.map((device) => settleRegistration(device, chosen).catch(() => undefined)),
        ),
      )
      .catch(() => undefined);
  }, [devices]);
}

/**
 * What a push about a join request (ADR 0122) or a guest's ask to go direct (ADR 0211) reads, in
 * whichever workspace it came from, so that its sheet opens.
 */
function readerOf(
  what: Extract<Response, { kind: "join" | "direct" }>,
): (store: Store) => Promise<unknown> {
  return what.kind === "join"
    ? (store) => store.joinRequest(what.requestId)
    : (store) => store.readDirectAsk(what.askId);
}

/** A kept decision, sent. The store's own idempotency key covers a send again. */
function send(store: Store, decision: PendingDecision): void {
  store.resolveApproval({
    spaceId: decision.spaceId,
    runId: decision.runId,
    approvalId: decision.approvalId,
    decision: decision.decision,
    scope: "once",
  });
}

/**
 * Answer the pushes. Live responses while the app runs, the one that launched it on startup,
 * and the queue drained whenever the app comes forward or the log changes.
 *
 * A row goes when the log says the ask is answered, not when the send returns — `resolveApproval`
 * hands the event to the socket's outbox and answers nothing, which is right for a screen and
 * not enough for a promise. So the queue holds a decision until the answer comes back round in
 * the fold, and sends again if it never does. A second send of an ask that has already been
 * answered is refused by the door, which is exactly what should happen.
 */
export function usePushResponses(store: Store, workspaces: PushWorkspaces): void {
  const router = useRouter();
  const snapshot = useSnapshot(store);
  // Draining reads the log through a ref, so that it is not rebuilt on every snapshot: the
  // listeners would then be torn down and registered again with every event that arrives.
  const latest = useRef(snapshot);
  const { deviceId, storeOf, holds } = workspaces;

  // Each decision goes through the store of the workspace it was asked in (ADR 0197), in front or
  // behind. One for a workspace this phone no longer holds can never be taken, and goes; one for a
  // workspace muted here, which has no store, waits until it is in front.
  const drain = useCallback(async () => {
    for (const decision of await pending()) {
      const via = decisionStore(decision, { deviceId, storeOf, holds }, store, latest.current);
      if (via === "gone") await forget(decision.approvalId);
      else if (via !== "waits") send(via, decision);
    }
  }, [store, deviceId, storeOf, holds]);

  // Something for a workspace behind the one in front: it comes forward first (ADR 0197).
  const behind = useBringForward();

  const handle = useCallback(
    async (response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      const what = responseTo(
        response.actionIdentifier,
        data,
        new Date().toISOString(),
        routeFor,
        platform(),
      );
      // Which workspace it came from, when it is one behind the one in front (ADR 0197).
      const from = deviceFrom(data);
      const elsewhere = behindOf(data, { deviceId, holds });
      // Done here, or in the workspace behind once it has come forward.
      const where = async (act: (there: Store) => unknown) => {
        if (elsewhere === undefined) await act(store);
        else behind(elsewhere, (there) => void act(there));
      };
      if (what.kind === "open") {
        await where(() => router.push(what.route));
        return;
      }
      if (what.kind === "join" || what.kind === "direct") {
        // The sheet opens when the request or the ask is on the snapshot; a person who may not
        // answer is told no, and nothing opens.
        const read = readerOf(what);
        await where((there) => read(there).catch(() => undefined));
        return;
      }
      if (what.kind === "nothing") return;
      // Written down before anything is sent. This is the whole promise of the feature.
      await remember(from === undefined ? what.decision : { ...what.decision, deviceId: from });
      await drain();
    },
    [drain, router, store, deviceId, holds, behind],
  );

  // The response that launched the app, read once: it keeps answering with the same one, so a
  // ref rather than a re-read guards against acting twice.
  const launched = useRef(false);
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    void lastResponse().then((response) => {
      if (response !== null) void handle(response);
    });
  }, [handle]);

  useEffect(
    () =>
      onResponse((response) => {
        void handle(response);
      }),
    [handle],
  );

  useEffect(() => {
    void drain();
    const changed = (state: AppStateStatus) => {
      if (state === "active") void drain();
    };
    const subscription = AppState.addEventListener("change", changed);
    return () => subscription.remove();
  }, [drain]);

  // And on every change to the log, because the answer coming back round in the fold is what
  // clears a row: a decision stays owed until this phone has seen it land.
  useEffect(() => {
    latest.current = snapshot;
    void drain();
  }, [drain, snapshot]);
}

/**
 * A push that arrives while the app is open shows no banner (`silenceInForeground`), so one a
 * sheet or a page waits on is read instead (ADR 0211): a guest's ask, for an owner's sheet, and
 * an answer to one's own, for the guide. Only the workspace in front reads; one behind is read at
 * its next hello.
 */
export function usePushArrivals(store: Store, deviceId: string): void {
  useEffect(
    () =>
      onReceived((data) => {
        const from = deviceFrom(data);
        if (from !== undefined && from !== deviceId) return;
        const read = readOnArrival(data);
        if (read?.kind === "direct") void store.readDirectAsk(read.askId).catch(() => undefined);
        if (read?.kind === "mine") void store.readMyDirectAsk().catch(() => undefined);
      }),
    [store, deviceId],
  );
}

/**
 * The badge, and the banners for asks nobody is waiting on any more. The badge counts what waits
 * to be decided in every workspace this phone holds (ADR 0197): the one in front, and those
 * behind it (`behind`, by device). The demo's made-up workspace (ADR 0213) is counted nowhere:
 * `madeUp` says the one in front is it, and it is left out of those behind.
 */
export function usePushBadge(
  store: Store,
  behind: Readonly<Record<string, number>> = {},
  madeUp = false,
): void {
  const snapshot = useSnapshot(store);
  const waiting = madeUp ? [] : snapshot.model.needsYou.filter((item) => item.tier === "decide");
  const elsewhere = Object.entries(behind).reduce(
    (sum, [deviceId, count]) => sum + (isDemo({ deviceId }) ? 0 : count),
    0,
  );

  useEffect(() => {
    void showBadge(waiting.length + elsewhere);
    const open = new Set(waiting.map((item) => item.id));
    void dismissAnswered((approvalId) => open.has(approvalId));
    // The list itself is rebuilt on every snapshot; its length and its ids are what matter.
  }, [waiting, elsewhere]);
}
