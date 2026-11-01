/**
 * Pairing a device.
 *
 * Decision 6: people are identified by an Ed25519 device key, paired by QR. The QR carries a
 * short-lived, single-use code; the device generates its own key pair, keeps the private half
 * where it cannot be exported, and sends only the public half.
 *
 * The code is held in memory with a short expiry rather than in a table. That is deliberate:
 * a pairing code is a capability, not a record, and one that survived a restart would be one
 * more thing that could leak. Losing it costs a person one scan.
 *
 * A code a person's device made while the relay was on went out as the relay's page (ADR 0232),
 * so it remembers who made it, and using it makes a request that waits for that person's Allow
 * rather than pairing at once. The first device to use it spends it, as before.
 *
 * A code may name a device of the same person that the new one replaces (ADR 0236): a phone that
 * had Chips deleted and put back reconnects in the old one's place, and the old key, which went
 * with the app, is signed out the moment the new device is paired, through the Allow or not.
 */

import type { Clock, ReadModels } from "../ports/index.js";

export interface PairingCode {
  readonly code: string;
  readonly workspaceId: string;
  readonly participantId: string;
  readonly expiresAt: number;
  /**
   * The person whose device made it, when it went out as the relay's page (ADR 0232): using it
   * waits for their Allow. Absent for the operator's codes and every code with no relay.
   */
  readonly askedOf?: string | undefined;
  /** The device of the same person this one takes the place of (ADR 0236). */
  readonly replaces?: string | undefined;
}

export type PairFailure =
  | "unknown_code"
  | "expired_code"
  | "malformed_key"
  | "already_paired"
  /** Five requests wait already (ADR 0122's guard), so a code that asks can't make a sixth. */
  | "too_many";

/** A code that asks, used: the request that waits for its maker (ADR 0232). */
export interface PairWaiting {
  readonly waiting: {
    readonly requestId: string;
    readonly secret: string;
    readonly code: string;
    readonly interval: number;
    readonly expiresIn: number;
  };
}

export interface PairedDevice {
  readonly deviceId: string;
  readonly participantId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  /**
   * What the workspace is called, when it has a name. A client needs it to name the place it
   * has just been let into — the workspace switcher's label (M5.3). Absent when the workspace
   * has no name, so the client falls back to the server's own host rather than to a stand-in
   * that would read the same on every server.
   */
  readonly workspaceName?: string;
}

/** A device as its person, or an owner, may see it: never the key. */
export interface DeviceView {
  readonly deviceId: string;
  readonly participantId: string;
  readonly name: string;
  readonly pairedAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
}

/** What the use case needs from the registry. Devices are not projections (ADR 0018). */
export interface DeviceRegistry {
  readonly participant: (
    workspaceId: string,
    participantId: string,
  ) => Promise<{ displayName: string } | undefined>;
  readonly deviceByPublicKey: (
    workspaceId: string,
    publicKey: string,
  ) => Promise<{ deviceId: string; participantId: string } | undefined>;
  readonly addDevice: (device: {
    deviceId: string;
    workspaceId: string;
    participantId: string;
    publicKey: string;
    name: string;
    pairedAt: string;
  }) => Promise<void>;
  /** One device, by id, in a workspace (ADR 0034). */
  readonly device: (workspaceId: string, deviceId: string) => Promise<DeviceView | undefined>;
  /** A person's devices, live and withdrawn, oldest first. */
  readonly devicesOf: (workspaceId: string, participantId: string) => Promise<DeviceView[]>;
  /** Withdraw one. It is refused at its next request. */
  readonly revokeDevice: (input: {
    workspaceId: string;
    deviceId: string;
    at: string;
  }) => Promise<boolean>;
}

export interface PairingCodes {
  readonly issue: (input: {
    workspaceId: string;
    participantId: string;
    ttlSeconds?: number;
    /** Who made it, when it goes out as the relay's page: using it waits for them (ADR 0232). */
    askedOf?: string | undefined;
    /** A device of the same person the new one replaces (ADR 0236). */
    replaces?: string | undefined;
  }) => PairingCode;
  readonly take: (code: string) => PairingCode | undefined;
  readonly peek: (code: string) => PairingCode | undefined;
  /** Drop every code that would pair a device for this person: they were removed (ADR 0160). */
  readonly dropFor: (workspaceId: string, participantId: string) => number;
}

/**
 * Codes are single use: `take` removes the code whether or not the pairing goes on to succeed,
 * so a code seen over somebody's shoulder is worth one attempt at most.
 */
export function createPairingCodes(clock: Clock): PairingCodes {
  const codes = new Map<string, PairingCode>();

  const prune = () => {
    for (const [code, issued] of codes) {
      if (issued.expiresAt <= clock.nowMs()) codes.delete(code);
    }
  };

  return {
    issue({ workspaceId, participantId, ttlSeconds = 900, askedOf, replaces }) {
      prune();
      const code = readableCode();
      const issued = {
        code,
        workspaceId,
        participantId,
        expiresAt: clock.nowMs() + ttlSeconds * 1000,
        ...(askedOf === undefined ? {} : { askedOf }),
        ...(replaces === undefined ? {} : { replaces }),
      };
      codes.set(code, issued);
      return issued;
    },
    take(code) {
      prune();
      const issued = codes.get(code);
      codes.delete(code);
      return issued;
    },
    peek(code) {
      prune();
      return codes.get(code);
    },
    dropFor(workspaceId, participantId) {
      let dropped = 0;
      for (const [code, issued] of codes) {
        if (issued.workspaceId !== workspaceId || issued.participantId !== participantId) continue;
        codes.delete(code);
        dropped += 1;
      }
      return dropped;
    },
  };
}

/**
 * Six characters from an alphabet with no 0/O or 1/I, in two groups. It is read aloud and typed
 * as often as it is scanned, so it is built to be read aloud and typed.
 */
export function readableCode(random: (max: number) => number = randomIndex): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    if (i === 3) out += "-";
    out += alphabet.charAt(random(alphabet.length));
  }
  return out;
}

function randomIndex(max: number): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return (bytes[0] ?? 0) % max;
}

export interface PairDeviceDeps {
  readonly registry: DeviceRegistry;
  readonly codes: PairingCodes;
  readonly readModels: Pick<ReadModels, "workspace">;
  readonly clock: Clock;
  readonly newDeviceId: () => string;
  /**
   * Make the request a code that asks waits on (ADR 0232): the join requests' `waitForLink`.
   * Without it, such a code pairs at once, as every code did before.
   */
  readonly wait?:
    | ((ask: {
        readonly workspaceId: string;
        readonly askedOf: string;
        readonly name: string;
        readonly publicKey: string;
        readonly pairAs: string | null;
        readonly replaces: string | null;
      }) => Promise<
        { ok: true; value: PairWaiting["waiting"] } | { ok: false; error: { kind: string } }
      >)
    | undefined;
  /**
   * Sign a device out wherever it could be reached: its key, its pushes and its sockets, as the
   * door's `DELETE /v1/devices/:id` does. Without it, the registry's withdrawal alone.
   */
  readonly withdraw?: ((workspaceId: string, deviceId: string) => Promise<void>) | undefined;
}

export interface PairDeviceInput {
  readonly code: string;
  /** The public half of an Ed25519 key pair, SPKI DER, base64. */
  readonly publicKey: string;
  readonly name: string;
}

export function createPairDevice(deps: PairDeviceDeps) {
  /** A good code, used: the device waits for whoever made it when it asks, else is paired now. */
  async function settle(
    issued: PairingCode,
    input: PairDeviceInput,
    displayName: string,
  ): Promise<{ ok: true; value: PairedDevice | PairWaiting } | { ok: false; error: PairFailure }> {
    if (issued.askedOf !== undefined && deps.wait !== undefined) {
      return waitFor(issued, issued.askedOf, input);
    }
    return { ok: true, value: await pairNow(issued, input, displayName) };
  }

  /** A code that asks nobody, used: the device is paired as the code's person, now. */
  async function pairNow(
    issued: PairingCode,
    input: PairDeviceInput,
    displayName: string,
  ): Promise<PairedDevice> {
    const deviceId = deps.newDeviceId();
    await deps.registry.addDevice({
      deviceId,
      workspaceId: issued.workspaceId,
      participantId: issued.participantId,
      publicKey: input.publicKey,
      name: input.name.slice(0, 120) || "A device",
      pairedAt: deps.clock.nowIso(),
    });
    await signOutReplaced(issued);
    return {
      deviceId,
      participantId: issued.participantId,
      workspaceId: issued.workspaceId,
      displayName,
      ...(await calledWhat(deps.readModels, issued.workspaceId)),
    };
  }

  /**
   * The device a reconnecting phone takes the place of, signed out now (ADR 0236): asked again,
   * since it may have been signed out since the code was made, and never anybody else's.
   */
  async function signOutReplaced(issued: PairingCode): Promise<void> {
    if (issued.replaces === undefined) return;
    const old = await deps.registry.device(issued.workspaceId, issued.replaces);
    if (old === undefined || old.participantId !== issued.participantId) return;
    if (old.revokedAt !== null) return;
    if (deps.withdraw !== undefined) {
      await deps.withdraw(issued.workspaceId, old.deviceId);
      return;
    }
    const at = deps.clock.nowIso();
    await deps.registry.revokeDevice({
      workspaceId: issued.workspaceId,
      deviceId: old.deviceId,
      at,
    });
  }

  /** A code that asks, used: the device waits for whoever made the code (ADR 0232). */
  async function waitFor(
    issued: PairingCode,
    askedOf: string,
    input: PairDeviceInput,
  ): Promise<{ ok: true; value: PairWaiting } | { ok: false; error: PairFailure }> {
    const waited = await deps.wait?.({
      workspaceId: issued.workspaceId,
      askedOf,
      name: input.name.slice(0, 120) || "A device",
      publicKey: input.publicKey,
      pairAs: issued.participantId === askedOf ? null : issued.participantId,
      replaces: issued.replaces ?? null,
    });
    if (waited?.ok !== true) return { ok: false, error: "too_many" };
    return { ok: true, value: { waiting: waited.value } };
  }

  return async function pairDevice(
    input: PairDeviceInput,
  ): Promise<{ ok: true; value: PairedDevice | PairWaiting } | { ok: false; error: PairFailure }> {
    // 44 base64 characters is a 32-byte Ed25519 key in SPKI DER, which is what the browser's
    // `exportKey("spki")` produces. Checking the shape here keeps a useless row out of the table.
    // It comes before the code is taken: a key that could never pair spends no code, and the
    // answer to it says nothing about whether the code exists.
    if (!/^[A-Za-z0-9+/]{40,64}={0,2}$/.test(input.publicKey)) {
      return { ok: false, error: "malformed_key" };
    }

    const issued = deps.codes.take(input.code.trim().toUpperCase());
    if (issued === undefined) return { ok: false, error: "unknown_code" };
    if (issued.expiresAt <= deps.clock.nowMs()) return { ok: false, error: "expired_code" };

    const existing = await deps.registry.deviceByPublicKey(issued.workspaceId, input.publicKey);
    if (existing !== undefined) return { ok: false, error: "already_paired" };

    const participant = await deps.registry.participant(issued.workspaceId, issued.participantId);
    if (participant === undefined) return { ok: false, error: "unknown_code" };
    return settle(issued, input, participant.displayName);
  };
}

/**
 * What the workspace is called, for the answer to travel with. The name comes back with the
 * pairing for the same reason an invite carries one: the device leaves with an id for this
 * place and, without it, nothing to call it. Nothing when the workspace has no name.
 */
async function calledWhat(
  readModels: Pick<ReadModels, "workspace">,
  workspaceId: string,
): Promise<{ workspaceName?: string }> {
  const workspace = await readModels.workspace(workspaceId);
  if (workspace === undefined || workspace.name === "") return {};
  return { workspaceName: workspace.name };
}

export type PairDevice = ReturnType<typeof createPairDevice>;
