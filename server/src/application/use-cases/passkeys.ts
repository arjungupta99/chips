/**
 * Passkeys (ADR 0034, decision 4): how a person comes back.
 *
 * A device key signs every request and never leaves its device; a passkey follows the person
 * — the platform keeps it, synced or not — and does exactly one thing here: it authorises
 * pairing a new device without a code from an old one. Registering one takes a paired device;
 * signing in with one answers a challenge and gets a paired device back, the way `POST /v1/pair`
 * answers a code. A passkey is its person's: listed and revoked by them, and by nobody else.
 *
 * Challenges are held in memory with a short life and used once, like pairing codes: a
 * capability, not a record. A sign-in's is asked for with no credential, so the door counts each
 * one against its address, and only so many are held at once (SEC-13).
 */

import type { WorkspaceRole } from "../../domain/index.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, IdGenerator, ReadModels } from "../ports/index.js";
import type { PasskeyRegistry, PasskeyView } from "../ports/passkeys.js";
import type { AssertionAnswer, RegistrationAnswer, WebAuthn } from "../ports/webauthn.js";
import type { DeviceRegistry, PairedDevice } from "./pair-device.js";

export interface PasskeysDeps {
  readonly registry: PasskeyRegistry;
  readonly devices: DeviceRegistry;
  readonly webauthn: WebAuthn;
  readonly readModels: Pick<ReadModels, "workspace" | "participant" | "workspaceRole">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Thirty-two random bytes, base64url. Injected so a test can know the challenge. */
  readonly randomChallenge: () => string;
  /** The origins a passkey may be used from, besides loopback (`auth.passkeyOrigins`). */
  readonly origins: () => readonly string[];
  /** Challenges held at once; `HELD_CHALLENGES` unless a test asks for fewer. */
  readonly held?: number | undefined;
}

export type PasskeyFailure = {
  readonly kind: "not_a_person" | "invalid" | "unknown_challenge" | "refused" | "unknown_passkey";
  readonly message: string;
};

type Answer<T> = { ok: true; value: T } | { ok: false; error: PasskeyFailure };

/** A challenge is good for five minutes, once. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Challenges held at once, for sign-ins and registrations together. Past it, the oldest is
 * forgotten first, and a sign-in whose challenge went that way asks for another. Filling it takes
 * this many asks inside five minutes, which the door's count allows only from thousands of
 * addresses.
 */
export const HELD_CHALLENGES = 10_000;

interface IssuedChallenge {
  readonly purpose: "register" | "sign_in";
  readonly workspaceId?: string | undefined;
  readonly participantId?: string | undefined;
  readonly expiresAt: number;
}

/** What the browser is handed for `navigator.credentials.create()`, in WebAuthn's JSON form. */
export interface RegistrationOptions {
  readonly challenge: string;
  readonly rp: { readonly name: string };
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string };
  readonly pubKeyCredParams: readonly { readonly type: "public-key"; readonly alg: number }[];
  readonly authenticatorSelection: {
    readonly residentKey: "preferred";
    readonly userVerification: "preferred";
  };
  readonly excludeCredentials: readonly {
    readonly type: "public-key";
    readonly id: string;
    readonly transports?: readonly string[] | undefined;
  }[];
  readonly timeout: number;
  readonly attestation: "none";
}

/** What the browser is handed for `navigator.credentials.get()`. */
export interface AssertionOptions {
  readonly challenge: string;
  readonly userVerification: "preferred";
  readonly timeout: number;
}

export interface SignedIn extends PairedDevice {
  readonly role: WorkspaceRole;
  readonly workspaceName: string;
}

const NOT_A_PERSON: PasskeyFailure = {
  kind: "not_a_person",
  message: "A passkey is a person's. A harness has a token.",
};

/** The algorithms offered, best first: Ed25519, then P-256, then RSA for older authenticators. */
const ALGORITHMS = [-8, -7, -257] as const;

export function createPasskeys(deps: PasskeysDeps) {
  const held = deps.held ?? HELD_CHALLENGES;
  // In the order they were issued, so the oldest is the first.
  const challenges = new Map<string, IssuedChallenge>();

  const prune = (): void => {
    for (const [challenge, issued] of challenges) {
      if (issued.expiresAt <= deps.clock.nowMs()) challenges.delete(challenge);
    }
  };

  const issue = (issued: Omit<IssuedChallenge, "expiresAt">): string => {
    prune();
    const challenge = deps.randomChallenge();
    challenges.set(challenge, { ...issued, expiresAt: deps.clock.nowMs() + CHALLENGE_TTL_MS });
    for (const oldest of challenges.keys()) {
      if (challenges.size <= held) break;
      challenges.delete(oldest);
    }
    return challenge;
  };

  /** Spend a challenge: it is gone whether or not what follows succeeds. */
  const take = (challenge: string): IssuedChallenge | undefined => {
    prune();
    const issued = challenges.get(challenge);
    challenges.delete(challenge);
    return issued;
  };

  const passkeyName = (name: string | undefined): string => {
    const trimmed = (name ?? "").trim();
    return trimmed === "" ? "A passkey" : trimmed.slice(0, 120);
  };

  return {
    /** Options for a new passkey, for a person on a paired device. */
    async registrationOptions(principal: Principal): Promise<Answer<RegistrationOptions>> {
      if (principal.kind !== "person") return { ok: false, error: NOT_A_PERSON };
      const [workspace, existing] = await Promise.all([
        deps.readModels.workspace(principal.workspaceId),
        deps.registry.passkeysOf(principal.workspaceId, principal.participantId),
      ]);
      const challenge = issue({
        purpose: "register",
        workspaceId: principal.workspaceId,
        participantId: principal.participantId,
      });
      return {
        ok: true,
        value: {
          challenge,
          rp: { name: workspace?.name ?? "Chips" },
          user: {
            id: Buffer.from(principal.participantId, "utf8").toString("base64url"),
            name: principal.displayName,
            displayName: principal.displayName,
          },
          pubKeyCredParams: ALGORITHMS.map((alg) => ({ type: "public-key" as const, alg })),
          authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
          excludeCredentials: existing
            .filter((passkey) => passkey.revokedAt === null)
            .map((passkey) => ({
              type: "public-key" as const,
              id: passkey.credentialId,
              transports: passkey.transports,
            })),
          timeout: CHALLENGE_TTL_MS,
          attestation: "none",
        },
      };
    },

    /** The browser's answer: verified, and kept as this person's passkey. */
    async register(input: {
      principal: Principal;
      challenge: string;
      answer: RegistrationAnswer;
      name?: string | undefined;
    }): Promise<Answer<PasskeyView>> {
      const { principal } = input;
      if (principal.kind !== "person") return { ok: false, error: NOT_A_PERSON };
      const issued = take(input.challenge);
      if (
        issued === undefined ||
        issued.purpose !== "register" ||
        issued.participantId !== principal.participantId
      ) {
        return {
          ok: false,
          error: {
            kind: "unknown_challenge",
            message: "That challenge is not one issued to you, or it has expired.",
          },
        };
      }
      const verified = deps.webauthn.verifyRegistration(input.answer, {
        challenge: input.challenge,
        origins: deps.origins(),
      });
      if (!verified.ok) return { ok: false, error: { kind: "refused", message: verified.reason } };
      if ((await deps.registry.passkeyByCredentialId(verified.value.credentialId)) !== undefined) {
        return {
          ok: false,
          error: { kind: "invalid", message: "That passkey is registered already." },
        };
      }
      const at = deps.clock.nowIso();
      const passkey = {
        id: deps.ids.next("passkey"),
        workspaceId: principal.workspaceId,
        participantId: principal.participantId,
        credentialId: verified.value.credentialId,
        publicKey: verified.value.jwk,
        algorithm: verified.value.algorithm,
        signCount: verified.value.signCount,
        transports: verified.value.transports,
        name: passkeyName(input.name),
        createdAt: at,
      };
      await deps.registry.addPasskey(passkey);
      return { ok: true, value: { ...passkey, lastUsedAt: null, revokedAt: null } };
    },

    async list(principal: Principal): Promise<Answer<PasskeyView[]>> {
      if (principal.kind !== "person") return { ok: false, error: NOT_A_PERSON };
      return {
        ok: true,
        value: await deps.registry.passkeysOf(principal.workspaceId, principal.participantId),
      };
    },

    async revoke(input: {
      principal: Principal;
      passkeyId: string;
    }): Promise<Answer<{ passkeyId: string; revokedAt: string }>> {
      const { principal } = input;
      if (principal.kind !== "person") return { ok: false, error: NOT_A_PERSON };
      const at = deps.clock.nowIso();
      const revoked = await deps.registry.revokePasskey({
        workspaceId: principal.workspaceId,
        participantId: principal.participantId,
        passkeyId: input.passkeyId,
        at,
      });
      if (!revoked) {
        return {
          ok: false,
          error: { kind: "unknown_passkey", message: "No live passkey of that id is yours." },
        };
      }
      return { ok: true, value: { passkeyId: input.passkeyId, revokedAt: at } };
    },

    /** A challenge for a sign-in: nobody is known yet, so the authenticator picks the credential. */
    assertionOptions(): AssertionOptions {
      return {
        challenge: issue({ purpose: "sign_in" }),
        userVerification: "preferred",
        timeout: CHALLENGE_TTL_MS,
      };
    },

    /**
     * The browser's answer to a sign-in: the credential names its person, the signature and the
     * counter say it is really them, and the device that asked is paired for them.
     */
    async signIn(input: {
      challenge: string;
      answer: AssertionAnswer;
      publicKey: string;
      deviceName: string;
    }): Promise<Answer<SignedIn>> {
      const issued = take(input.challenge);
      if (issued === undefined || issued.purpose !== "sign_in") {
        return {
          ok: false,
          error: {
            kind: "unknown_challenge",
            message: "That challenge was not issued, or it has expired.",
          },
        };
      }
      if (!/^[A-Za-z0-9+/]{40,64}={0,2}$/.test(input.publicKey)) {
        return {
          ok: false,
          error: { kind: "invalid", message: "That is not an Ed25519 public key." },
        };
      }
      const passkey = await verified(input.challenge, input.answer);
      if (!passkey.ok) return passkey;
      return pairFor(passkey.value, input.publicKey, input.deviceName);
    },
  };

  /** The passkey an answer names, if the answer verifies against it; its counter moved on. */
  async function verified(
    challenge: string,
    answer: AssertionAnswer,
  ): Promise<Answer<PasskeyView>> {
    const passkey = await deps.registry.passkeyByCredentialId(answer.id);
    if (passkey === undefined || passkey.revokedAt !== null) {
      return {
        ok: false,
        error: { kind: "unknown_passkey", message: "That passkey is not known here." },
      };
    }
    const result = deps.webauthn.verifyAssertion(answer, {
      challenge,
      origins: deps.origins(),
      key: { jwk: passkey.publicKey, algorithm: passkey.algorithm },
      signCount: passkey.signCount,
    });
    if (!result.ok) return { ok: false, error: { kind: "refused", message: result.reason } };
    await deps.registry.noteUse({
      passkeyId: passkey.id,
      signCount: result.value.signCount,
      at: deps.clock.nowIso(),
    });
    return { ok: true, value: passkey };
  }

  /** A new device for the passkey's person, as `POST /v1/pair` would give it. */
  async function pairFor(
    passkey: PasskeyView,
    publicKey: string,
    deviceName: string,
  ): Promise<Answer<SignedIn>> {
    const existing = await deps.devices.deviceByPublicKey(passkey.workspaceId, publicKey);
    if (existing !== undefined) {
      return { ok: false, error: { kind: "invalid", message: "That device is paired already." } };
    }
    const [person, role, workspace] = await Promise.all([
      deps.readModels.participant(passkey.workspaceId, passkey.participantId),
      deps.readModels.workspaceRole(passkey.workspaceId, passkey.participantId),
      deps.readModels.workspace(passkey.workspaceId),
    ]);
    // Somebody removed from the workspace (ADR 0160) has no standing, whatever key they hold.
    if (person === undefined || person.removed_at !== null || role === undefined) {
      return {
        ok: false,
        error: { kind: "unknown_passkey", message: "That passkey's person is gone." },
      };
    }
    const deviceId = deps.ids.next("device");
    await deps.devices.addDevice({
      deviceId,
      workspaceId: passkey.workspaceId,
      participantId: passkey.participantId,
      publicKey,
      name: deviceName.slice(0, 120) || "A device",
      pairedAt: deps.clock.nowIso(),
    });
    return {
      ok: true,
      value: {
        deviceId,
        participantId: passkey.participantId,
        workspaceId: passkey.workspaceId,
        displayName: person.display_name,
        role,
        workspaceName: workspace?.name ?? "Chips",
      },
    };
  }
}

export type Passkeys = ReturnType<typeof createPasskeys>;
