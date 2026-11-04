/**
 * Harness tokens and device keys (ADR 0006). No passwords, ever.
 *
 * A harness token is 256 bits of randomness, shown once and stored only as a SHA-256 digest.
 * A person's device signs each request with an Ed25519 key paired by QR. Neither side has
 * anything a phishing page could ask for.
 *
 * Comparison is constant-time (technical-plan 6.4): a token check that returns early on the
 * first wrong byte tells an attacker how many bytes were right.
 */

import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { joinCheckCode, joinCheckText, joinCommitText } from "@chipschat/protocol";

/** Harness tokens are 256 bits, base64url, so they survive a header and a shell variable. */
export const HARNESS_TOKEN_BYTES = 32;

/** The prefix makes a leaked token searchable and obviously a Chips credential. */
export const HARNESS_TOKEN_PREFIX = "chips_at_";

export interface MintedToken {
  /** Shown to the operator once. Chips never sees it again. */
  readonly token: string;
  /** What goes in `harness_tokens.token_hash`. */
  readonly hash: string;
}

export function mintHarnessToken(random: (size: number) => Buffer = randomBytes): MintedToken {
  const token = `${HARNESS_TOKEN_PREFIX}${random(HARNESS_TOKEN_BYTES).toString("base64url")}`;
  return { token, hash: hashHarnessToken(token) };
}

export function hashHarnessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The prefix an invite's token wears in a link, for the same reason a harness token has one. */
export const INVITE_TOKEN_PREFIX = "chips_inv_";

/** An invite token: the same 256 bits as a harness token, kept the same way (ADR 0034). */
export function mintInviteToken(random: (size: number) => Buffer = randomBytes): MintedToken {
  const token = `${INVITE_TOKEN_PREFIX}${random(HARNESS_TOKEN_BYTES).toString("base64url")}`;
  return { token, hash: hashHarnessToken(token) };
}

/** The prefix a join request's secret wears, in a link or a requester's hands (ADR 0122). */
export const JOIN_SECRET_PREFIX = "chips_j_";

/**
 * A join request's secret: 192 bits, URL-safe, so it travels in a link's path. Kept as a digest,
 * as a token is; the code shown beside it is for comparing, not for keeping out.
 */
export function mintJoinSecret(random: (size: number) => Buffer = randomBytes): {
  readonly secret: string;
  readonly hash: string;
} {
  const secret = `${JOIN_SECRET_PREFIX}${random(24).toString("base64url")}`;
  return { secret, hash: hashHarnessToken(secret) };
}

/**
 * The six digits a link's request shows (ADR 0232), made from the joining device's public key:
 * the first four bytes of the SHA-256 of the key's bytes, as a number, modulo a million. The same
 * key always makes the same code, so the device and the Allow sheet show the same one, and a
 * stranger who used the link first shows another.
 */
export function keyCode(publicKey: string): string {
  const digest = createHash("sha256").update(Buffer.from(publicKey, "base64")).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/**
 * The three halves of the check a device asking on the Wi-Fi shows (S-1, ADR 0278), as this server
 * works them: a nonce of its own, a device's commitment read back from the nonce it sends, and the
 * code from both keys and both nonces, the same as the device works out.
 */
export const joinCheck = {
  nonce: (random: (size: number) => Buffer = randomBytes): string =>
    random(32).toString("base64url"),
  commitOf: (nonce: string): string =>
    createHash("sha256").update(joinCommitText(nonce), "utf8").digest("base64url"),
  code: (parts: Parameters<typeof joinCheckText>[0]): string =>
    joinCheckCode(createHash("sha256").update(joinCheckText(parts), "utf8").digest()),
};

/** Constant-time equality for two hex digests of the same length. */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Pull the token out of an `Authorization: Bearer …` header, if there is one. */
export function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer (\S+)$/.exec(header.trim());
  return match?.[1];
}

// ---------------------------------------------------------------- device keys

/**
 * What a device signs. Method, the full request target, timestamp and a digest of the body —
 * so a signature cannot be moved to another route, reused with a different query, replayed
 * later, or reused with different content — and, inside a tunnel, the tunnel's handshake hash
 * as a fifth line (ADR 0191, decision 6), so it cannot be moved to another tunnel or to the
 * plain port either: a replay has nowhere to go, and the five-minute window stops mattering for
 * anything inside a tunnel.
 *
 * `target` is the path **and** the query string, exactly as they appear in the request line:
 * `/v1/events?since=41`, not `/v1/events`. Signing the path alone (phase-0-review finding 5)
 * let one signature stand in for every query for five minutes; a signature over the target it
 * was made for stands in for nothing else.
 */
export interface SignedRequest {
  readonly method: string;
  readonly target: string;
  /** Milliseconds since the epoch, as the client saw it. */
  readonly timestamp: number;
  readonly body: string;
  /**
   * The body's SHA-256 as hex, when the caller has it already — an upload's bytes are hashed
   * once, as bytes, rather than decoded into a string to be hashed again.
   */
  readonly bodyDigest?: string | undefined;
  /**
   * The Noise handshake hash of the tunnel the request crosses, hex, as the fifth line; absent,
   * the four-line shape of a request on the plain port. The header `x-chips-signed: v2` says a
   * request signed five.
   */
  readonly handshakeHash?: string | undefined;
}

export function signingPayload(request: SignedRequest): string {
  const bodyDigest =
    request.bodyDigest ?? createHash("sha256").update(request.body, "utf8").digest("hex");
  return [
    request.method.toUpperCase(),
    request.target,
    String(request.timestamp),
    bodyDigest,
    ...(request.handshakeHash === undefined ? [] : [request.handshakeHash]),
  ].join("\n");
}

/** How far a device's clock may be from the server's before a signature is refused. */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export type SignatureFailure =
  | "malformed_key"
  | "malformed_signature"
  | "timestamp_out_of_range"
  | "bad_signature";

/**
 * Verify a device signature. Returns the reason on failure rather than a boolean, so the log
 * can say what went wrong without the caller inventing a message.
 */
export function verifyDeviceSignature(options: {
  readonly publicKey: string;
  readonly signature: string;
  readonly request: SignedRequest;
  readonly now: number;
}): { ok: true } | { ok: false; reason: SignatureFailure } {
  const skew = Math.abs(options.now - options.request.timestamp);
  if (!Number.isFinite(options.request.timestamp) || skew > SIGNATURE_WINDOW_MS) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  let key: ReturnType<typeof createPublicKey>;
  try {
    key = createPublicKey({
      key: Buffer.from(options.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return { ok: false, reason: "malformed_key" };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(options.signature, "base64");
  } catch {
    return { ok: false, reason: "malformed_signature" };
  }
  if (signature.length !== 64) return { ok: false, reason: "malformed_signature" };

  const payload = Buffer.from(signingPayload(options.request), "utf8");
  return verify(null, payload, key, signature)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
