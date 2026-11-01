/**
 * The owner's relay switch (ADR 0211, Phase 4): whether this server dials its relay, and each
 * device's way in, which is what tells an owner who would be cut off with it off. A registry
 * beside the log; `relay.set` is the change's line in it, so every device connected hears.
 */

/** The way a socket came: the port, the tunnel door on the network, or the relay. */
export type SocketWay = "socket" | "lan" | "relay";

/** Whether the server is dialled in to its relay. `off` when it has none to dial. */
export type RelayStatus = "off" | "connecting" | "connected";

/**
 * Why a server with its relay on isn't connected to it, as its last try heard: the relay turned it
 * away as `busy` (as many servers from its address as it lists), or for not being on its list, or
 * for another reason (`refused`); or the relay couldn't be reached at all. The log said it alone,
 * and the owner's switch read On while phones said the server was asleep (the new-person sweep's
 * finding 12).
 */
export type RelayTrouble = "busy" | "not_allowed" | "refused" | "unreachable";

export interface RelaySwitch {
  readonly on: boolean;
  /** Who turned it last, and when, in which workspace; nothing until anybody has. */
  readonly setBy: string | null;
  readonly workspaceId: string | null;
  readonly setAt: string | null;
}

/** A person's device and its way in. */
export interface DeviceWay {
  readonly deviceId: string;
  readonly participantId: string;
  readonly name: string;
  readonly lastVia: SocketWay | null;
  readonly lastViaAt: string | null;
  /** When it last came other than through the relay; never, when null. */
  readonly directAt: string | null;
}

export interface RelaySwitchRegistry {
  /**
   * As an owner last left it. Before anyone has: on for a relay the server was set up with, off for
   * Chips's own (ADR 0245), with `setAt` null.
   */
  readonly current: () => Promise<RelaySwitch>;
  readonly set: (next: {
    readonly on: boolean;
    readonly by: string;
    readonly workspaceId: string;
    readonly at: string;
  }) => Promise<void>;
  /** A device's socket opened, this way. */
  readonly noteWay: (deviceId: string, via: SocketWay, at: string) => Promise<void>;
  /** The workspace's devices that are not withdrawn, with their ways in. */
  readonly ways: (workspaceId: string) => Promise<readonly DeviceWay[]>;
}
