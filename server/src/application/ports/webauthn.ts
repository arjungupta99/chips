/**
 * What the passkey use case needs from WebAuthn, as a port: the browser's two answers checked
 * and turned into a key to keep, or a sign-in to honour. Infrastructure implements it with
 * `node:crypto`; a test hands in something simpler.
 */

/** A public key as a JSON Web Key: the fields the three kinds a browser produces need. */
export interface PasskeyJwk {
  readonly kty: string;
  readonly crv?: string | undefined;
  readonly x?: string | undefined;
  readonly y?: string | undefined;
  readonly n?: string | undefined;
  readonly e?: string | undefined;
}

export interface PasskeyKey {
  readonly jwk: PasskeyJwk;
  readonly algorithm: number;
}

export interface RegistrationAnswer {
  readonly id: string;
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports?: readonly string[] | undefined;
  };
}

export interface AssertionAnswer {
  readonly id: string;
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle?: string | null | undefined;
  };
}

export interface VerifyContext {
  readonly challenge: string;
  readonly origins: readonly string[];
  readonly rpId?: string | undefined;
}

export type Verified<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface WebAuthn {
  readonly verifyRegistration: (
    answer: RegistrationAnswer,
    context: VerifyContext,
  ) => Verified<
    PasskeyKey & {
      readonly credentialId: string;
      readonly signCount: number;
      readonly transports: readonly string[];
    }
  >;
  readonly verifyAssertion: (
    answer: AssertionAnswer,
    context: VerifyContext & { readonly key: PasskeyKey; readonly signCount: number },
  ) => Verified<{ readonly signCount: number }>;
}
