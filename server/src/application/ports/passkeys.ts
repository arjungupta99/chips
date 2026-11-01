/**
 * The passkey registry (ADR 0034): a WebAuthn credential's public key, beside the device keys.
 * A registry, not a projection, for the reason every credential is.
 */

import type { PasskeyJwk } from "./webauthn.js";

export interface NewPasskey {
  readonly id: string;
  readonly workspaceId: string;
  readonly participantId: string;
  readonly credentialId: string;
  /** The public key as a JWK, which is what the verifier loads. */
  readonly publicKey: PasskeyJwk;
  readonly algorithm: number;
  readonly signCount: number;
  readonly transports: readonly string[];
  readonly name: string;
  readonly createdAt: string;
}

export interface PasskeyView {
  readonly id: string;
  readonly workspaceId: string;
  readonly participantId: string;
  readonly credentialId: string;
  readonly publicKey: PasskeyJwk;
  readonly algorithm: number;
  readonly signCount: number;
  readonly transports: readonly string[];
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

export interface PasskeyRegistry {
  readonly addPasskey: (passkey: NewPasskey) => Promise<void>;
  /** The passkey an authenticator named, across every workspace: a credential id is unique. */
  readonly passkeyByCredentialId: (credentialId: string) => Promise<PasskeyView | undefined>;
  /** A person's passkeys, live and revoked, newest first. */
  readonly passkeysOf: (workspaceId: string, participantId: string) => Promise<PasskeyView[]>;
  readonly revokePasskey: (input: {
    workspaceId: string;
    participantId: string;
    passkeyId: string;
    at: string;
  }) => Promise<boolean>;
  /** After a sign-in: the counter the authenticator reported, and when. */
  readonly noteUse: (input: { passkeyId: string; signCount: number; at: string }) => Promise<void>;
}
