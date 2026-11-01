/**
 * The server's tunnel key, made once and kept (M4.1, ADR 0039): what the pairing payload
 * carries as `key`, what a phone asks the relay for, and what the Noise handshake proves the
 * server holds. Made the first time it is asked for, and the gateway asks as it starts to listen
 * (ADR 0191), so every server has one, relay or not: the tunnel door on its own network answers
 * to it. Imported once and held, so a handshake costs no read.
 */

import { generateStoredKeyPair, importStoredKeyPair, type KeyPair } from "@chipschat/tunnel";
import type { Clock, ServerKeys } from "../../application/index.js";
import { RELAY_KEY } from "../../application/index.js";

export interface RelayIdentity {
  /** The public half, base64url: the pairing payload's `key`. */
  readonly publicKey: () => Promise<string>;
  /** The pair, for the handshake. */
  readonly keyPair: () => Promise<KeyPair>;
}

export function createRelayIdentity(deps: {
  readonly keys: ServerKeys;
  readonly clock: Clock;
}): RelayIdentity {
  let loading: Promise<{ publicKey: string; pair: KeyPair }> | undefined;

  const load = async () => {
    const stored =
      (await deps.keys.get(RELAY_KEY)) ??
      (await deps.keys.keep(RELAY_KEY, {
        ...(await generateStoredKeyPair()),
        createdAt: deps.clock.nowIso(),
      }));
    return { publicKey: stored.publicKey, pair: await importStoredKeyPair(stored) };
  };
  const identity = () => {
    loading ??= load().catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
    return loading;
  };

  return {
    publicKey: async () => (await identity()).publicKey,
    keyPair: async () => (await identity()).pair,
  };
}
