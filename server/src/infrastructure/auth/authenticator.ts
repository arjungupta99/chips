/**
 * The authenticator adapter: harness bearer tokens, and device-key signed requests for people
 * (ADR 0006), and inside a tunnel only signed for that tunnel (ADR 0191, decision 6).
 *
 * Every lookup is by digest or by device id, both indexed, so authenticating costs one query.
 * A revoked token or device is a distinct failure from an unknown one in the log, and the same
 * `unauthorized` to the caller: telling the wire which of the two it is would say whether a
 * token ever existed.
 */

import type { Kysely } from "kysely";
import type {
  AuthAttempt,
  Authenticator,
  AuthFailure,
  Principal,
} from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";
import {
  bearerToken,
  digestsMatch,
  hashHarnessToken,
  SIGNATURE_WINDOW_MS,
  verifyDeviceSignature,
} from "./credentials.js";

type Result = { ok: true; principal: Principal } | { ok: false; reason: AuthFailure };

/** A clock too far out is worth telling apart from a forged signature, in the log. */
function signatureFailure(reason: string): AuthFailure {
  return reason === "timestamp_out_of_range" ? "timestamp_out_of_range" : "bad_signature";
}

/** The three device headers every signed request carries, or nothing when one is missing or not a number. */
function deviceHeaders(attempt: AuthAttempt): { deviceId: string; at: number } | undefined {
  const { deviceId, signature, timestamp } = attempt;
  if (deviceId === undefined || signature === undefined || timestamp === undefined) {
    return undefined;
  }
  const at = Number.parseInt(timestamp, 10);
  return Number.isFinite(at) ? { deviceId, at } : undefined;
}

/** What `x-chips-signed` says for the five-line shape that names the tunnel (ADR 0191, decision 6). */
export const SIGNED_BOUND = "v2";

type Shape = { ok: true; handshakeHash: string | undefined } | { ok: false; reason: AuthFailure };

/**
 * Which shape to hold a device signature to, from where the request arrived and what the header
 * says (ADR 0191, decision 6). Inside a tunnel only a `v2` signature is good, held to that
 * tunnel's hash, so one made for another tunnel fails as a bad signature; on the plain port only
 * the four-line shape is good, since there is no tunnel for a `v2` to name. A four-line signature
 * inside a tunnel is refused (25 October 2026, the second security review): it is what a captured
 * request played back through a tunnel of the attacker's own looks like, and every phone build
 * since 18 October signs five there. Any other word is not a shape.
 */
function shapeOf(attempt: AuthAttempt): Shape {
  const { signed, tunnelHash } = attempt;
  if (signed === SIGNED_BOUND) {
    return tunnelHash === undefined
      ? { ok: false, reason: "signature_not_bound" }
      : { ok: true, handshakeHash: tunnelHash };
  }
  if (signed !== undefined) return { ok: false, reason: "malformed" };
  if (tunnelHash !== undefined) return { ok: false, reason: "signature_not_bound" };
  return { ok: true, handshakeHash: undefined };
}

export interface AuthenticatorOptions {
  readonly db: Kysely<Database>;
  /** Milliseconds since the epoch. Injected so signature-window tests are deterministic. */
  readonly now?: () => number;
  /** Called when a credential is used, so `last_used_at` is not a write on the hot path. */
  readonly onUsed?: (principal: Principal) => void;
}

export function createAuthenticator(options: AuthenticatorOptions): Authenticator {
  const { db } = options;
  const now = options.now ?? Date.now;

  async function byHarnessToken(token: string): Promise<Result> {
    const digest = hashHarnessToken(token);
    const row = await db
      .selectFrom("harness_tokens")
      .innerJoin("participants", "participants.id", "harness_tokens.harness_id")
      .select([
        "harness_tokens.id as token_id",
        "harness_tokens.token_hash",
        "harness_tokens.revoked_at",
        "harness_tokens.workspace_id",
        "participants.id as harness_id",
        "participants.display_name",
        "participants.owner_id",
        "participants.removed_at",
      ])
      .where("harness_tokens.token_hash", "=", digest)
      .executeTakeFirst();

    if (row === undefined) return { ok: false, reason: "unknown_token" };
    // The lookup already matched on the digest; comparing again in constant time is what keeps
    // the answer independent of how much of the digest was right (technical-plan 6.4).
    if (!digestsMatch(row.token_hash, digest)) return { ok: false, reason: "unknown_token" };
    if (row.revoked_at !== null) return { ok: false, reason: "revoked_token" };
    // Removing a harness withdraws its tokens (ADR 0078); a token that somehow outlived that is
    // still nobody's to speak with.
    if (row.removed_at !== null) return { ok: false, reason: "removed_harness" };

    const principal: Principal = {
      kind: "harness",
      participantId: row.harness_id,
      workspaceId: row.workspace_id,
      displayName: row.display_name,
      via: "harness_token",
      tokenId: row.token_id,
      ...(row.owner_id === null ? {} : { ownerId: row.owner_id }),
    };
    options.onUsed?.(principal);
    return { ok: true, principal };
  }

  /**
   * A paired device and its person. The person's standing in the workspace rides along (ADR 0034),
   * so the door's cheap rules cost no second query. A person with no row — none should exist after
   * 0009 — is a member.
   */
  function deviceRow(deviceId: string) {
    return db
      .selectFrom("devices")
      .innerJoin("participants", "participants.id", "devices.participant_id")
      .leftJoin("workspace_members", (join) =>
        join
          .onRef("workspace_members.participant_id", "=", "participants.id")
          .onRef("workspace_members.workspace_id", "=", "devices.workspace_id"),
      )
      .select([
        "devices.id as device_id",
        "devices.public_key",
        "devices.revoked_at",
        "devices.workspace_id",
        "participants.id as person_id",
        "participants.display_name",
        "participants.removed_at",
        "workspace_members.role as role",
      ])
      .where("devices.id", "=", deviceId)
      .executeTakeFirst();
  }

  type DeviceRow = NonNullable<Awaited<ReturnType<typeof deviceRow>>>;

  /**
   * A device withdrawn, and refused before its signature is read. A removed person's device is
   * withdrawn too, and is read on, so its own key can be told why (ADR 0160).
   */
  function withdrawnOnly(row: DeviceRow): boolean {
    return row.revoked_at !== null && row.removed_at === null;
  }

  /**
   * A device whose signature held: its person, or, once they were removed from the workspace
   * (ADR 0160), the reason, said only now to the holder of the key, so their screen says so rather
   * than asking them to pair a device that can never be let in again.
   */
  function admitted(row: DeviceRow): Result {
    if (row.removed_at !== null) return { ok: false, reason: "person_removed" };
    return { ok: true, principal: personOf(row, "device_key") };
  }

  function personOf(row: DeviceRow, via: Principal["via"]): Principal {
    const principal: Principal = {
      kind: "person",
      participantId: row.person_id,
      workspaceId: row.workspace_id,
      displayName: row.display_name,
      via,
      deviceId: row.device_id,
      role: row.role ?? "member",
    };
    options.onUsed?.(principal);
    return principal;
  }

  /** Why the signature does not hold over the shape the request arrived in, or nothing. */
  function signatureFault(
    row: DeviceRow,
    attempt: AuthAttempt,
    at: number,
    handshakeHash: string | undefined,
  ): AuthFailure | undefined {
    const verified = verifyDeviceSignature({
      publicKey: row.public_key,
      signature: attempt.signature ?? "",
      request: {
        method: attempt.method,
        target: attempt.target,
        timestamp: at,
        body: attempt.body,
        bodyDigest: attempt.bodyDigest,
        handshakeHash,
      },
      now: now(),
    });
    return verified.ok ? undefined : signatureFailure(verified.reason);
  }

  async function byDeviceKey(attempt: AuthAttempt): Promise<Result> {
    const headers = deviceHeaders(attempt);
    if (headers === undefined) return { ok: false, reason: "malformed" };
    const { deviceId, at } = headers;
    // The clock before the device: a device whose clock is out is told so, and so is anybody who
    // signs with a time that far off, so the answer says nothing of which devices are here.
    if (Math.abs(now() - at) > SIGNATURE_WINDOW_MS) {
      return { ok: false, reason: "timestamp_out_of_range" };
    }

    const row = await deviceRow(deviceId);
    if (row === undefined) return { ok: false, reason: "unknown_device" };
    if (withdrawnOnly(row)) return { ok: false, reason: "revoked_device" };

    const shape = shapeOf(attempt);
    if (!shape.ok) return shape;
    const fault = signatureFault(row, attempt, at, shape.handshakeHash);
    if (fault !== undefined) return { ok: false, reason: fault };
    return admitted(row);
  }

  return {
    async authenticate(attempt: AuthAttempt): Promise<Result> {
      const token = bearerToken(attempt.authorization);
      if (token !== undefined) return byHarnessToken(token);
      if (attempt.deviceId !== undefined) return byDeviceKey(attempt);
      return { ok: false, reason: "missing_credentials" };
    },

    async grantedDevice(deviceId) {
      const row = await deviceRow(deviceId);
      if (row === undefined) return { ok: false, reason: "unknown_device" };
      if (row.revoked_at !== null || row.removed_at !== null) {
        return { ok: false, reason: "revoked_device" };
      }
      return { ok: true, principal: personOf(row, "device_grant") };
    },
  };
}
