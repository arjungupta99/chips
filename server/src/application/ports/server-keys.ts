/**
 * The server's own keys (M4.1, ADR 0039): so far one, the X25519 static key a phone is given
 * in its pairing payload and authenticates the server by through the relay. A registry
 * (ADR 0018) — a replay could never reconstruct a private key, and should not.
 */

export interface StoredServerKey {
  /** Raw, base64url without padding: what the pairing payload and the relay carry. */
  readonly publicKey: string;
  /** PKCS#8, base64. */
  readonly privateKey: string;
  readonly createdAt: string;
}

export interface ServerKeys {
  /** The key of this kind, when one was ever made. */
  readonly get: (kind: string) => Promise<StoredServerKey | undefined>;
  /**
   * Keep a key unless one of this kind is there already, and answer the one that is there:
   * two processes making a key at once end up with the same one.
   */
  readonly keep: (kind: string, key: StoredServerKey) => Promise<StoredServerKey>;
}

/** The kind of the key the relay knows the server by. */
export const RELAY_KEY = "relay";
