/**
 * When a credential was last used, written off the hot path.
 *
 * `harness_tokens.last_used_at` and `devices.last_seen_at` have been in the schema since M0.3
 * and the token route has always reported the first; nothing wrote either. The authenticator
 * offers `onUsed` for exactly this, and this is what to hand it: a write per credential at
 * most once a minute, fire-and-forget, so a busy harness costs one row update an hour rather
 * than one per hook. What reads it is `chips doctor`, for which a minute is precise enough —
 * a harness that has never spoken is the question, not one that spoke fifty seconds ago.
 */

import type { Kysely } from "kysely";
import type { Principal } from "../../application/ports/identity.js";
import type { Database } from "../db/schema.js";

export interface LastUsedOptions {
  readonly db: Kysely<Database>;
  /** Milliseconds since the epoch. Injected so the tests can move it. */
  readonly now?: () => number;
  /** How often one credential's use is written, at most. */
  readonly everyMs?: number;
  /** A failed write is logged, never thrown: the request it belongs to has already succeeded. */
  readonly onError?: (error: unknown) => void;
}

const EVERY_MS = 60_000;

export function createLastUsed(options: LastUsedOptions): (principal: Principal) => void {
  const now = options.now ?? Date.now;
  const every = options.everyMs ?? EVERY_MS;
  const written = new Map<string, number>();

  return (principal) => {
    const target = principal.via === "harness_token" ? principal.tokenId : principal.deviceId;
    if (target === undefined) return;
    const key = `${principal.via}:${target}`;
    const at = now();
    const last = written.get(key);
    if (last !== undefined && at - last < every) return;
    written.set(key, at);

    const stamp = new Date(at).toISOString();
    const update =
      principal.via === "harness_token"
        ? options.db
            .updateTable("harness_tokens")
            .set({ last_used_at: stamp })
            .where("id", "=", target)
        : options.db.updateTable("devices").set({ last_seen_at: stamp }).where("id", "=", target);
    update.execute().then(
      () => undefined,
      (error: unknown) => options.onError?.(error),
    );
  };
}
