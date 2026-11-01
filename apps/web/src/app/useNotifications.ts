/**
 * Notifications per person (M5.6).
 *
 * What to raise is the core's (`planNotices`): the tiers, the quiet hours and the per-harness
 * words a person set, applied to what needs them. What this adds is the two things a page
 * has to do about it: claim each notice's key at the server first — one notification per
 * event per person, whichever of their devices gets there first — and then raise it where a
 * banner can be raised: the desktop shell, with Approve and Deny for a decision, or the
 * browser's own notifications when the person has allowed them. In a tab that has allowed
 * nothing, this does nothing at all.
 */

import {
  attention,
  digestTitle,
  momentOf,
  type NeedsYouItem,
  type Notice,
  nameOf,
  planNotices,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Desktop } from "../native.ts";
import { askBody, askTitle } from "./useDesktop.ts";

/** Where a banner goes: the shell, or the browser. */
export interface Notifier {
  /** A decision: Approve and Deny on the shell, a plain banner in a browser. */
  readonly decision: (item: NeedsYouItem, snapshot: Snapshot) => Promise<void>;
  /** A digest: a title and one line. */
  readonly digest: (title: string, body: string) => Promise<void>;
}

/** The shell's banners: `ask` with buttons, `tell` without. An older shell has no `tell`. */
export function desktopNotifier(desktop: Desktop): Notifier {
  return {
    decision: (item, snapshot) =>
      desktop.ask(item.id, askTitle(item, snapshot), askBody(item, snapshot)),
    digest: async (title, body) => {
      try {
        await desktop.tell(title, body);
      } catch {
        // A shell built before M5.6: what the digest names is in its rooms regardless.
      }
    },
  };
}

/** The browser's notifications, when the person has allowed them; nothing otherwise. */
export function browserNotifier(where: typeof globalThis = globalThis): Notifier | undefined {
  const Notify = (where as { Notification?: typeof Notification }).Notification;
  if (Notify === undefined || Notify.permission !== "granted") return undefined;
  const show = async (title: string, body: string, tag: string) => {
    const banner = new Notify(title, { body, tag });
    banner.onclick = () => where.focus();
  };
  return {
    decision: (item, snapshot) => show(askTitle(item, snapshot), askBody(item, snapshot), item.id),
    digest: (title, body) => show(title, body, title),
  };
}

/** What `browserPermission`'s asking raises on the page once the browser has answered. */
export const PERMISSION_ANSWERED = "chips:notification-permission";

type Permission = "granted" | "denied" | "default" | "unsupported";

function permissionOf(where: typeof globalThis): Permission {
  const Notify = (where as { Notification?: typeof Notification }).Notification;
  return Notify === undefined ? "unsupported" : Notify.permission;
}

/**
 * Whether a browser can ask the person to allow notifications, and the asking. The answer is
 * announced on the page as well as returned, so the notifier is rebuilt the moment it is yes,
 * with no reload.
 */
export function browserPermission(where: typeof globalThis = globalThis): {
  readonly state: Permission;
  readonly ask: () => Promise<"granted" | "denied" | "default">;
} {
  const Notify = (where as { Notification?: typeof Notification }).Notification;
  if (Notify === undefined) return { state: "unsupported", ask: async () => "denied" };
  return {
    state: Notify.permission,
    ask: async () => {
      const answer = await Notify.requestPermission();
      if (typeof where.dispatchEvent === "function")
        where.dispatchEvent(new Event(PERMISSION_ANSWERED));
      return answer;
    },
  };
}

/**
 * Listen for the browser's leave changing: an answer to Allow banners here, and a change made in
 * the browser's own settings for the site, where the browser reports one.
 */
function watchPermission(where: typeof globalThis, changed: () => void): () => void {
  let live = true;
  let status: PermissionStatus | undefined;
  where.addEventListener?.(PERMISSION_ANSWERED, changed);
  where.navigator?.permissions
    ?.query({ name: "notifications" })
    .then((found) => {
      if (!live) return;
      status = found;
      status.addEventListener("change", changed);
    })
    .catch(() => undefined);
  return () => {
    live = false;
    where.removeEventListener?.(PERMISSION_ANSWERED, changed);
    status?.removeEventListener("change", changed);
  };
}

/**
 * The browser's banners, as a notifier that is there exactly while the person allows them (ADR
 * 0085). The leave is followed rather than read once on arrival: a notifier made before the
 * person said yes would stay absent until the page was reloaded.
 */
export function useBrowserNotifier(where: typeof globalThis = globalThis): Notifier | undefined {
  const subscribe = useCallback((changed: () => void) => watchPermission(where, changed), [where]);
  const permission = useSyncExternalStore(subscribe, () => permissionOf(where));
  return useMemo(
    () => (permission === "granted" ? browserNotifier(where) : undefined),
    [permission, where],
  );
}

export interface NotificationsOptions {
  /** Every workspace to hear from: the one in front and the unmuted ones behind it. */
  readonly stores: readonly Store[];
  readonly notifier: Notifier | undefined;
  readonly now?: (() => Date) | undefined;
}

/** "PO-4471 confirmed · Which date?": the digest's line, the titles of what is waiting. */
export function digestBody(
  notice: Extract<Notice, { kind: "digest" }>,
  snapshot: Snapshot,
): string {
  const lines = notice.items
    .slice(0, 3)
    .map((item) => `${nameOf(snapshot.directory, item.harnessId)}: ${item.title}`);
  const more = notice.items.length - lines.length;
  return more > 0 ? `${lines.join(" · ")} · and ${more} more` : lines.join(" · ");
}

export function useNotifications({ stores, notifier, now }: NotificationsOptions): void {
  /** Keys raised, taken by another device, or on their way, per store: asked about once. */
  const seen = useRef(new Map<Store, Set<string>>());
  const clock = useMemo(() => now ?? (() => new Date()), [now]);

  useEffect(() => {
    if (notifier === undefined || stores.length === 0) return;
    const watch = { notifier, clock, seen: seen.current, live: true };
    const unsubscribes = stores.map((store) => follow(watch, store));
    const stopFreshening = freshenOnReturn(watch, stores);
    return () => {
      watch.live = false;
      stopFreshening();
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [stores, notifier, clock]);
}

/**
 * Plan one store's banners from its snapshots, but not before the person's settings have
 * answered, or failed to: judged by the defaults, the first snapshot could raise a banner the
 * person had turned off.
 */
function follow(watch: Watch, store: Store): () => void {
  let ready = false;
  const settled = () => {
    ready = true;
    if (watch.live) push(watch, store, store.getSnapshot());
  };
  store.loadNotificationSettings().then(settled, settled);
  return store.subscribe((snapshot) => {
    if (ready) push(watch, store, snapshot);
  });
}

/**
 * Read the settings again whenever the window comes back — focused, or shown after being hidden
 * — and plan again by them. They are the person's on every device, and a change made on the
 * phone reaches this one no other way: the server does not stream them.
 */
function freshenOnReturn(watch: Watch, stores: readonly Store[]): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const freshen = () => {
    if (document.visibilityState === "hidden") return;
    for (const store of stores) {
      store.loadNotificationSettings().then(
        () => {
          if (watch.live) push(watch, store, store.getSnapshot());
        },
        () => undefined,
      );
    }
  };
  window.addEventListener("focus", freshen);
  document.addEventListener("visibilitychange", freshen);
  return () => {
    window.removeEventListener("focus", freshen);
    document.removeEventListener("visibilitychange", freshen);
  };
}

/** What one run of the hook holds: where banners go, the clock, and what has been raised. */
interface Watch {
  readonly notifier: Notifier;
  readonly clock: () => Date;
  readonly seen: Map<Store, Set<string>>;
  live: boolean;
}

/** A snapshot arrived: plan, keep the new keys, and claim them. */
function push(watch: Watch, store: Store, snapshot: Snapshot): void {
  const mine = watch.seen.get(store) ?? new Set<string>();
  watch.seen.set(store, mine);
  const waiting = attention(snapshot.model.needsYou, snapshot.readState);
  const notices = planNotices(waiting, store.notificationSettings(), momentOf(watch.clock()));
  const fresh = notices.filter((notice) => !mine.has(notice.key));
  if (fresh.length === 0) return;
  for (const notice of fresh) mine.add(notice.key);
  void raise(watch, store, snapshot, fresh);
}

/** Claim the keys at the server, and raise what this device was granted. */
async function raise(
  watch: Watch,
  store: Store,
  snapshot: Snapshot,
  fresh: readonly Notice[],
): Promise<void> {
  let granted: string[];
  try {
    granted = await store.claimNotifications(fresh.map((notice) => notice.key));
  } catch {
    // The server is away: the keys are tried again on the next change.
    const mine = watch.seen.get(store);
    for (const notice of fresh) mine?.delete(notice.key);
    return;
  }
  if (!watch.live) return;
  for (const notice of fresh) {
    if (!granted.includes(notice.key)) continue;
    if (notice.kind === "decision") void watch.notifier.decision(notice.item, snapshot);
    else void watch.notifier.digest(digestTitle(notice), digestBody(notice, snapshot));
  }
}
