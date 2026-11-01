/**
 * Who is on the other end of a request or a socket.
 *
 * The application layer names what it needs to know; infrastructure decides how to find out.
 * That is what lets Phase 5's passkeys and invites arrive as another adapter rather than as a
 * change to every route.
 */

import type { WorkspaceRole } from "../../domain/index.js";

/** An authenticated caller. `system` never comes from the wire; only Chips itself is that. */
export interface Principal {
  readonly kind: "person" | "harness";
  readonly participantId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  /**
   * A person's standing in the workspace (ADR 0034), read beside their device so the cheap
   * rules cost no lookup. Absent for a harness.
   */
  readonly role?: WorkspaceRole | undefined;
  /**
   * Which credential proved it, for the audit log and for `chips doctor`. `device_grant` is a URL a
   * device handed a player (ADR 0058): only an attachment's bytes are ever read by it.
   */
  readonly via: "harness_token" | "device_key" | "device_grant";
  /** The device that signed, or whose grant it is, when a person is calling. */
  readonly deviceId?: string;
  /** The token that was presented, when a harness is calling. */
  readonly tokenId?: string;
  /** The person accountable for a harness. `hello` reports it; a person owns themselves. */
  readonly ownerId?: string;
}

export type AuthFailure =
  | "missing_credentials"
  | "unknown_token"
  | "revoked_token"
  | "removed_harness"
  | "unknown_device"
  | "revoked_device"
  /**
   * The device's person was removed from the workspace (ADR 0160). Said only to a request its own
   * key signed, so it tells nobody but them; the wire hears it as a refusal of its own.
   */
  | "person_removed"
  | "bad_signature"
  | "timestamp_out_of_range"
  /**
   * A signature of the wrong shape for where it arrived (ADR 0191, decision 6): one bound to a
   * tunnel, on the plain port; or one not bound, inside a tunnel, which is what a replay of a
   * captured request looks like.
   */
  | "signature_not_bound"
  | "malformed";

export interface AuthAttempt {
  readonly authorization?: string | undefined;
  readonly deviceId?: string | undefined;
  readonly signature?: string | undefined;
  readonly timestamp?: string | undefined;
  /**
   * Which shape the device signed, from `x-chips-signed`: `v2` for the five lines that name the
   * tunnel's handshake hash (ADR 0191, decision 6); nothing for ADR 0006's four.
   */
  readonly signed?: string | undefined;
  /**
   * The handshake hash of the tunnel the request arrived through, hex (`Bindings.relay` or
   * `.lan`); nothing on the plain port.
   */
  readonly tunnelHash?: string | undefined;
  readonly method: string;
  /** The full request target: the path and the query string, as the signature covers them. */
  readonly target: string;
  readonly body: string;
  /** The body's digest, when the transport hashed the bytes itself (an upload). */
  readonly bodyDigest?: string | undefined;
}

export interface Authenticator {
  /** Identify the caller, or say why not. */
  readonly authenticate: (
    attempt: AuthAttempt,
  ) => Promise<{ ok: true; principal: Principal } | { ok: false; reason: AuthFailure }>;
  /**
   * The person a device grant admits (ADR 0058), whose signature the door has already checked:
   * the device it names, still paired, and its person's standing. A device withdrawn since the
   * grant was issued admits nobody.
   */
  readonly grantedDevice: (
    deviceId: string,
  ) => Promise<{ ok: true; principal: Principal } | { ok: false; reason: AuthFailure }>;
}
