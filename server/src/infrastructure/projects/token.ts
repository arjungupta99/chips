/**
 * A person's project token (ADR 0220): what a device hands git, which cannot sign Chips's
 * requests, to clone and push one room's project for ten minutes. An HMAC over the room, the
 * device and the moment it stops, with the server's grant secret, as a device grant is (ADR 0058):
 * nothing is stored, a token is good for the room it names and no other, and the device must
 * still be paired when it is used.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { PROJECT_TOKEN_PREFIX } from "@chipschat/protocol";

/** Said first, so that no other grant's signature is ever a project token's. */
const PROJECT_TOKEN = "chips project token v1";

function signature(spaceId: string, deviceId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update([PROJECT_TOKEN, spaceId, deviceId, String(expiresAt)].join("\n"), "utf8")
    .digest("hex");
}

/** `chips_pt_<device>.<expiry>.<signature>`: the room is the URL's, and is in the signature. */
export function mintProjectToken(input: {
  readonly spaceId: string;
  readonly deviceId: string;
  /** Seconds since the epoch. */
  readonly expiresAt: number;
  readonly secret: string;
}): string {
  const signed = signature(input.spaceId, input.deviceId, input.expiresAt, input.secret);
  return `${PROJECT_TOKEN_PREFIX}${input.deviceId}.${input.expiresAt}.${signed}`;
}

export type ProjectTokenFailure = "malformed" | "bad_signature" | "expired";

/** The device a token admits to this room's project, or why it admits nobody. */
export function readProjectToken(input: {
  readonly token: string;
  readonly spaceId: string;
  readonly secret: string;
  readonly nowSeconds: number;
}): { ok: true; deviceId: string } | { ok: false; reason: ProjectTokenFailure } {
  if (!input.token.startsWith(PROJECT_TOKEN_PREFIX)) return { ok: false, reason: "malformed" };
  const parts = input.token.slice(PROJECT_TOKEN_PREFIX.length).split(".");
  const [deviceId, expires, signed] = parts;
  if (
    parts.length !== 3 ||
    deviceId === undefined ||
    !/^dev_[0-9A-Z]{26}$/.test(deviceId) ||
    expires === undefined ||
    !/^\d{1,12}$/.test(expires) ||
    signed === undefined ||
    !/^[a-f0-9]{64}$/.test(signed)
  ) {
    return { ok: false, reason: "malformed" };
  }
  const expiresAt = Number(expires);
  const expected = Buffer.from(signature(input.spaceId, deviceId, expiresAt, input.secret), "utf8");
  if (!timingSafeEqual(expected, Buffer.from(signed, "utf8"))) {
    return { ok: false, reason: "bad_signature" };
  }
  if (expiresAt <= input.nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, deviceId };
}
