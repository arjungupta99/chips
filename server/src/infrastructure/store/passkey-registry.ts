/** The Kysely adapter for the passkey registry (ADR 0034). */

import type { Kysely } from "kysely";
import type { PasskeyRegistry, PasskeyView } from "../../application/ports/passkeys.js";
import type { PasskeyJwk } from "../../application/ports/webauthn.js";
import type { Database, PasskeysTable } from "../db/schema.js";

function toView(row: PasskeysTable): PasskeyView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    participantId: row.participant_id,
    credentialId: row.credential_id,
    publicKey: JSON.parse(row.public_key) as PasskeyJwk,
    algorithm: row.algorithm,
    signCount: row.sign_count,
    transports: row.transports === null ? [] : (JSON.parse(row.transports) as string[]),
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function createPasskeyRegistry(db: Kysely<Database>): PasskeyRegistry {
  return {
    async addPasskey(passkey) {
      await db
        .insertInto("passkeys")
        .values({
          id: passkey.id,
          workspace_id: passkey.workspaceId,
          participant_id: passkey.participantId,
          credential_id: passkey.credentialId,
          public_key: JSON.stringify(passkey.publicKey),
          algorithm: passkey.algorithm,
          sign_count: passkey.signCount,
          transports: JSON.stringify([...passkey.transports]),
          name: passkey.name,
          created_at: passkey.createdAt,
          last_used_at: null,
          revoked_at: null,
        })
        .execute();
    },

    async passkeyByCredentialId(credentialId) {
      // The unique index on credential_id is this query's.
      const row = await db
        .selectFrom("passkeys")
        .selectAll()
        .where("credential_id", "=", credentialId)
        .executeTakeFirst();
      return row === undefined ? undefined : toView(row);
    },

    async passkeysOf(workspaceId, participantId) {
      const rows = await db
        .selectFrom("passkeys")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .execute();
      return rows.map(toView);
    },

    async revokePasskey({ workspaceId, participantId, passkeyId, at }) {
      const result = await db
        .updateTable("passkeys")
        .set({ revoked_at: at })
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("id", "=", passkeyId)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async noteUse({ passkeyId, signCount, at }) {
      await db
        .updateTable("passkeys")
        .set({ sign_count: signCount, last_used_at: at })
        .where("id", "=", passkeyId)
        .execute();
    },
  };
}
