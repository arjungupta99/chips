/**
 * Signed attachment URLs (decision 10): a grant to fetch one attachment, for one token, until
 * one moment. An HMAC over those three things with a server secret, carried in the query. A
 * leaked URL is useless to a different token immediately and useless to anyone in ten minutes;
 * a URL in a log is worth nothing without the token it was minted for.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface Grant {
  readonly attachmentId: string;
  /** The harness token the grant is for. The fetch must present it. */
  readonly tokenId: string;
  /** Seconds since the epoch. */
  readonly expiresAt: number;
}

function payload(grant: Grant): string {
  return [grant.attachmentId, grant.tokenId, String(grant.expiresAt)].join("\n");
}

export function signGrant(grant: Grant, secret: string): string {
  return createHmac("sha256", secret).update(payload(grant), "utf8").digest("hex");
}

export type GrantFailure = "malformed" | "expired" | "bad_signature" | "wrong_token";

/** Check a grant against the token that is presenting it and the clock. */
export function verifyGrant(options: {
  readonly grant: Grant;
  readonly signature: string;
  readonly secret: string;
  readonly presentedTokenId: string | undefined;
  readonly nowSeconds: number;
}): { ok: true } | { ok: false; reason: GrantFailure } {
  const { grant, signature } = options;
  if (!/^[a-f0-9]{64}$/.test(signature) || !Number.isFinite(grant.expiresAt)) {
    return { ok: false, reason: "malformed" };
  }
  const expected = Buffer.from(signGrant(grant, options.secret), "utf8");
  if (!timingSafeEqual(expected, Buffer.from(signature, "utf8"))) {
    return { ok: false, reason: "bad_signature" };
  }
  if (grant.expiresAt <= options.nowSeconds) return { ok: false, reason: "expired" };
  if (options.presentedTokenId !== grant.tokenId) return { ok: false, reason: "wrong_token" };
  return { ok: true };
}

/** The URL a harness gets in `message.new`: the grant and its signature, in the query. */
export function grantUrl(base: string, grant: Grant, secret: string): string {
  const query = new URLSearchParams({
    exp: String(grant.expiresAt),
    tok: grant.tokenId,
    sig: signGrant(grant, secret),
  });
  return `${base}/v1/attachments/${grant.attachmentId}?${query.toString()}`;
}

/**
 * What a harness is handed for an attachment, on the socket or over HTTP: a URL bound to its own
 * token, for the grants' lifetime from now (decision 10), and when it stops working.
 */
export function harnessGrant(
  base: string,
  grants: { readonly secret: string; readonly ttlSeconds: number },
  nowMs: number,
  ids: { readonly attachmentId: string; readonly tokenId: string },
): { url: string; expiresAt: string } {
  const expiresAt = Math.floor(nowMs / 1000) + grants.ttlSeconds;
  return {
    url: grantUrl(base, { ...ids, expiresAt }, grants.secret),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

/**
 * A grant a device may hand to a player (ADR 0058): one attachment's bytes — one variant of them —
 * to whoever holds the URL, as that device, until one moment. What an `<img src>`, a `<video src>`,
 * AVPlayer and ExoPlayer can present, since none of them can sign a request. It is a bearer: the
 * URL alone is the credential, for one file and one window, and the server still asks whether the
 * device's person may read it, on every request.
 */
export interface DeviceGrant {
  readonly attachmentId: string;
  /** The bytes it names: `file`, `thumb`, `view` or `play`. Another variant is another grant. */
  readonly variant: string;
  /** The device it was issued to, and whose person it is admitted as. */
  readonly deviceId: string;
  /** Seconds since the epoch. */
  readonly expiresAt: number;
}

/** Said first, so no harness grant's signature is ever a device grant's. */
const DEVICE_GRANT = "chips device grant v1";

function devicePayload(grant: DeviceGrant): string {
  return [
    DEVICE_GRANT,
    grant.attachmentId,
    grant.variant,
    grant.deviceId,
    String(grant.expiresAt),
  ].join("\n");
}

export function signDeviceGrant(grant: DeviceGrant, secret: string): string {
  return createHmac("sha256", secret).update(devicePayload(grant), "utf8").digest("hex");
}

export type DeviceGrantFailure = "malformed" | "expired" | "bad_signature" | "wrong_device";

/**
 * Check a device's grant against the clock and the device presenting it: the one it names when the
 * URL is the only credential, or a device that signed its request and must be that one.
 */
export function verifyDeviceGrant(options: {
  readonly grant: DeviceGrant;
  readonly signature: string;
  readonly secret: string;
  readonly presentedDeviceId: string | undefined;
  readonly nowSeconds: number;
}): { ok: true } | { ok: false; reason: DeviceGrantFailure } {
  const { grant, signature } = options;
  if (!/^[a-f0-9]{64}$/.test(signature) || !Number.isSafeInteger(grant.expiresAt)) {
    return { ok: false, reason: "malformed" };
  }
  const expected = Buffer.from(signDeviceGrant(grant, options.secret), "utf8");
  if (!timingSafeEqual(expected, Buffer.from(signature, "utf8"))) {
    return { ok: false, reason: "bad_signature" };
  }
  if (grant.expiresAt <= options.nowSeconds) return { ok: false, reason: "expired" };
  if (options.presentedDeviceId !== grant.deviceId) return { ok: false, reason: "wrong_device" };
  return { ok: true };
}

/**
 * The path a device hands its player: the attachment, the variant, the device, the expiry and the
 * signature, in the query. A path and not a URL, because the server does not know which of its
 * addresses the device reached it by; the device puts its own in front.
 */
export function deviceGrantPath(grant: DeviceGrant, secret: string): string {
  const query = new URLSearchParams({
    ...(grant.variant === "file" ? {} : { variant: grant.variant }),
    dev: grant.deviceId,
    exp: String(grant.expiresAt),
    sig: signDeviceGrant(grant, secret),
  });
  return `/v1/attachments/${grant.attachmentId}?${query.toString()}`;
}

/** A device grant as a request presents it, read from its path and query; nothing when it is none. */
export function deviceGrantOf(
  path: string,
  query: (name: string) => string | undefined,
): { readonly grant: DeviceGrant; readonly signature: string } | undefined {
  const attachment = /^\/v1\/attachments\/([^/]+)$/.exec(path);
  const deviceId = query("dev");
  const signature = query("sig");
  if (attachment === null || deviceId === undefined || signature === undefined) return undefined;
  const expires = query("exp") ?? "";
  return {
    grant: {
      attachmentId: attachment[1] ?? "",
      variant: query("variant") ?? "file",
      deviceId,
      expiresAt: /^\d+$/.test(expires) ? Number(expires) : Number.NaN,
    },
    signature,
  };
}
