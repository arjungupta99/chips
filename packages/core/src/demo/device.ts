/**
 * The demo's device (ADR 0213): a workspace that lives only on this device, made up, with a person
 * called You in it. Its ids are fixed, so the film plays the same events under the same ids every
 * time and a jump to a chapter lands where playing to it would. Pairing mints ids from the clock
 * and randomness and never makes these, so two "Chips demo" workspaces cannot exist and a real one
 * is never taken for the demo.
 */

import { FIRST_PERSON_NAME, ID_PREFIXES, type Id, type IdKind } from "@chipschat/protocol";
import type { Device } from "../device.js";

/**
 * Every demo id after its prefix: a ULID whose first seven characters say demo, and a number. Each
 * is a real prefixed ULID, so the protocol's schemas take it like any other.
 */
const STEM = "01KDEM0";

/** The demo's `n`th id of a kind: `usr_01KDEM00000000000000000001`. */
export function demoId<K extends IdKind>(kind: K, n: number): Id<K> {
  return `${ID_PREFIXES[kind]}_${STEM}${String(n).padStart(19, "0")}` as Id<K>;
}

export const DEMO_DEVICE_ID = demoId("device", 1);
export const DEMO_WORKSPACE_ID = demoId("workspace", 1);
/** You, the person the demo is watched as: the made-up workspace's owner. */
export const DEMO_PERSON_ID = demoId("person", 1);
export const DEMO_WORKSPACE_NAME = "Chips demo";

/**
 * The demo's device. Its key is made in memory each time, since every request a device makes is
 * signed (a file fetched by id, through the demo's link); nothing ever reads the signature, and
 * the key is never kept. No server, relay or key of a server: the demo reaches none.
 */
export async function demoDevice(): Promise<Device> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    deviceId: DEMO_DEVICE_ID,
    participantId: DEMO_PERSON_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    displayName: FIRST_PERSON_NAME,
    workspaceName: DEMO_WORKSPACE_NAME,
    privateKey: pair.privateKey,
  };
}

/**
 * Whether a device is the demo's: no setup card and no welcome, no push token, no permission
 * asked, no join request heard, nothing counted at the relay (ADR 0213, point 1).
 */
export function isDemo(device: { readonly deviceId: string } | undefined): boolean {
  return device?.deviceId === DEMO_DEVICE_ID;
}
