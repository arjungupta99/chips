/**
 * The CLI's own credential.
 *
 * `chips connect` registers a harness, which is a person's act — only a person adds a harness
 * (ADR 0023) — so the CLI needs a credential of its own rather than reaching into the database
 * beside it. It gets one the way a browser does: generate an Ed25519 key, present the public
 * half with a short-lived pairing code, keep the private half.
 *
 * Node has no non-extractable key store, so the private half is a file with owner-only
 * permissions under the config home, and the keychain holds nothing here — a key that has to be
 * read back to sign is a key on disk however it is wrapped. That is the honest difference from
 * the browser, where the key genuinely cannot be exported, and `chips doctor` says so.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { signingPayload } from "@chipschat/server";
import { devicePath } from "./home.js";

export interface CliDevice {
  readonly deviceId: string;
  readonly participantId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  /** Where this device is paired, so a second server does not silently reuse the first's key. */
  readonly serverUrl: string;
  /** PKCS#8, PEM. */
  readonly privateKey: string;
}

export class PairingError extends Error {
  override readonly name = "PairingError";
}

export function loadDevice(path = devicePath()): CliDevice | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CliDevice;
  } catch {
    return undefined;
  }
}

/** Written owner-only, in a directory that is too: the private half of a credential. */
export function storeDevice(device: CliDevice, path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(device, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** A fresh Ed25519 pair: the public half as the server takes it, the private half as it is kept. */
export function newDeviceKey(): { readonly publicKey: string; readonly privateKey: string } {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/**
 * Pair with a code, the way the browser does: the public half travels, the private half stays.
 */
export async function pairDevice(input: {
  readonly serverUrl: string;
  readonly code: string;
  readonly name: string;
  readonly path?: string;
}): Promise<CliDevice> {
  const key = newDeviceKey();
  const response = await fetch(`${input.serverUrl}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: input.code.trim().toUpperCase(),
      public_key: key.publicKey,
      name: input.name,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new PairingError(body.error?.message ?? "That pairing code is not valid.");
  }
  const paired = (await response.json()) as {
    device_id: string;
    participant_id: string;
    workspace_id: string;
    display_name: string;
  };
  const device: CliDevice = {
    deviceId: paired.device_id,
    participantId: paired.participant_id,
    workspaceId: paired.workspace_id,
    displayName: paired.display_name,
    serverUrl: input.serverUrl,
    privateKey: key.privateKey,
  };
  storeDevice(device, input.path ?? devicePath());
  return device;
}

/**
 * The headers a signed request carries. The signature covers the method, the full request
 * target, a timestamp and a digest of the body, and `signingPayload` is the server's own
 * function, so there is one definition of what is signed rather than two that can drift.
 */
export function signRequest(
  device: CliDevice,
  method: string,
  target: string,
  body = "",
): Record<string, string> {
  const timestamp = Date.now();
  const payload = signingPayload({ method, target, timestamp, body });
  const key = createPrivateKey(device.privateKey);
  return {
    "x-chips-device": device.deviceId,
    "x-chips-timestamp": String(timestamp),
    "x-chips-signature": sign(null, Buffer.from(payload, "utf8"), key).toString("base64"),
  };
}

/** The public half, for a check that says whether this key is the one the server knows. */
export function publicKeyOf(device: CliDevice): string {
  return createPublicKey(device.privateKey)
    .export({ type: "spki", format: "der" })
    .toString("base64");
}

/** A signed request against the paired server. Throws with the server's own words. */
export async function call<T>(
  device: CliDevice,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  target: string,
  body?: unknown,
): Promise<T> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await fetch(`${device.serverUrl}${target}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...signRequest(device, method, target, raw),
    },
    ...(raw === "" ? {} : { body: raw }),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(failure.error?.message ?? `${target} answered ${response.status}`);
  }
  return (await response.json()) as T;
}
