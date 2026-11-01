/**
 * The single-process fan-out adapter. Subscriptions are keyed by workspace and space
 * (technical-plan 6.2), and delivery is in `seq` order because `publish` is called from the
 * append path, one event at a time.
 *
 * Phase 6 replaces this with an adapter over Postgres `LISTEN/NOTIFY` or Redis. Nothing above
 * the port changes.
 */

import type { FanOut, Listener, StoredEvent, Subscription } from "../../application/ports/index.js";

interface Entry {
  readonly subscription: Subscription;
  readonly listener: Listener;
}

/**
 * Does this subscriber want this event? A subscriber narrowed to spaces still wants
 * workspace-wide events, which have no space of their own: a policy change, a budget
 * warning, the kill switch.
 */
function wants(subscription: Subscription, event: StoredEvent): boolean {
  if (subscription.workspaceId !== event.workspace_id) return false;

  const spaces = subscription.spaceIds;
  if (spaces === undefined) return true;
  return event.space_id === null || spaces.includes(event.space_id);
}

export function createInProcessFanOut(): FanOut {
  const entries = new Set<Entry>();

  return {
    publish(event: StoredEvent) {
      for (const entry of entries) {
        if (wants(entry.subscription, event)) entry.listener(event);
      }
    },

    subscribe(subscription: Subscription, listener: Listener) {
      const entry: Entry = { subscription, listener };
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    },

    subscriberCount: () => entries.size,
  };
}
