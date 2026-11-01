/**
 * The Kysely adapter for the server's own keys (M4.1, ADR 0039). One row per kind; `keep` is an
 * insert that yields to a row already there, so whichever process made a key first is the one
 * every process uses.
 */

import type { Kysely } from "kysely";
import type { ServerKeys, StoredServerKey } from "../../application/index.js";
import type { Database } from "../db/schema.js";

export function createServerKeys(db: Kysely<Database>): ServerKeys {
  async function get(kind: string): Promise<StoredServerKey | undefined> {
    const row = await db
      .selectFrom("server_keys")
      .select(["public_key", "private_key", "created_at"])
      .where("kind", "=", kind)
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : { publicKey: row.public_key, privateKey: row.private_key, createdAt: row.created_at };
  }

  return {
    get,
    async keep(kind, key) {
      await db
        .insertInto("server_keys")
        .values({
          kind,
          public_key: key.publicKey,
          private_key: key.privateKey,
          created_at: key.createdAt,
        })
        .onConflict((conflict) => conflict.column("kind").doNothing())
        .execute();
      const kept = await get(kind);
      if (kept === undefined) throw new Error(`The ${kind} key was not kept.`);
      return kept;
    },
  };
}
