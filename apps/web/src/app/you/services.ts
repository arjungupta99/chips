/**
 * What the You screen is handed (ADR 0085): the registry's reads and writes, the person's
 * notification settings, and the caps on attachments, as the store does them. Apart from the
 * screen, so that its parts in this folder can name them without importing the screen that
 * imports them.
 */

import type {
  HereDevice,
  Invite,
  IssuedInvite,
  PairedDeviceRecord,
  Passkey,
  RelayFacts,
  WorkspaceRole,
} from "@chipschat/core";
import type {
  AttachmentCaps as Caps,
  ExchangeLimits,
  NotificationSettings,
} from "@chipschat/protocol";

/** The caps on what may be attached (ADR 0047): setting them, and the ceiling they sit under. */
export interface LimitsService {
  readonly set: (caps: Caps) => void;
  /** The most the server takes in one upload, which a cap cannot exceed. */
  readonly ceiling: () => Promise<number>;
  /** When Chips steps in on agents talking to each other (ADR 0187). */
  readonly setExchange: (limits: ExchangeLimits) => void;
}

/** The registry reads and writes behind the screen, as the store does them. */
export interface PeopleService {
  readonly passkeys: () => Promise<Passkey[]>;
  readonly addPasskey: (name: string) => Promise<unknown>;
  readonly revokePasskey: (passkeyId: string) => Promise<void>;
  readonly devices: () => Promise<PairedDeviceRecord[]>;
  readonly revokeDevice: (deviceId: string) => Promise<void>;
  /** A code for another device, from this one, with the address a QR should carry (M4.1). */
  /** A code for another device of this person's, or, from an owner, for `forId`'s new phone (ADR 0206). */
  /** And, naming one of their devices, a phone that takes its place (ADR 0236). */
  readonly issuePairingCode: (forId?: string, replaces?: string) => Promise<IssuedCode>;
  readonly invites: () => Promise<Invite[]>;
  /**
   * A link with a role, once or for several, for 30 minutes (ADR 0232), and for a guest or a
   * member the room it brings them into (ADR 0168).
   */
  readonly createInvite: (
    role: WorkspaceRole,
    singleUse: boolean,
    spaceId?: string,
  ) => Promise<IssuedInvite>;
  readonly revokeInvite: (inviteId: string) => Promise<void>;
  /** The devices signed in as somebody else (ADR 0209): an owner's or an admin's to read. */
  readonly personDevices: (personId: string) => Promise<PairedDeviceRecord[]>;
  /** Change the name you go by (ADR 0082); rejects with the server's reason for a refusal. */
  readonly rename: (displayName: string) => Promise<void>;
  /** Name the workspace again (ADR 0194), an owner's; rejects with the server's reason. */
  readonly renameWorkspace: (name: string) => Promise<void>;
}

/** A pairing code for another device, and the address a phone's camera opens. */
export interface IssuedCode {
  readonly code: string;
  readonly expiresAt: string;
  readonly url: string;
  /** The same code as the app's own link, sent to a phone that is not here and pasted there. */
  readonly appUrl?: string | undefined;
  /** The relay a phone reaches the server through from anywhere, when the server has one. */
  readonly relay: string | undefined;
  /**
   * The code as one link to send a computer (ADR 0210): the relay's `/pair` page, or the server's
   * own page when it has no relay. Absent from a server older than the field.
   */
  readonly link?: string | undefined;
}

/** The person's notification settings (M5.6), as the store holds them, and the browser's leave. */
export interface NotificationsService {
  readonly settings: () => NotificationSettings;
  readonly load: () => Promise<NotificationSettings>;
  readonly save: (settings: NotificationSettings) => Promise<void>;
  /** The browser's own notifications: whether they are allowed, and asking. Absent in the shell. */
  readonly browser?:
    | {
        readonly state: "granted" | "denied" | "default" | "unsupported";
        readonly ask: () => Promise<"granted" | "denied" | "default">;
      }
    | undefined;
}

/** The owner's relay switch (ADR 0211, Phase 4), as the store does it. */
export interface RelayService {
  readonly read: () => Promise<RelayFacts>;
  readonly set: (on: boolean) => Promise<RelayFacts>;
  /** Push the people the switch would cut off to go direct; how many were asked. */
  readonly ask: () => Promise<number>;
  /** Forget the Tailscale share link kept for the next guest (Phase 3). */
  readonly forget: () => Promise<void>;
  /** The relay's host and the server's address, for the words under the switch. */
  readonly relayHost: string;
  readonly serverUrl: string | undefined;
  /** The server's machine, as it names itself. */
  readonly machine: () => Promise<string>;
  /** This device, which the lists call "This computer" or "This browser". */
  readonly here: HereDevice;
  /** Scroll the card into view once it is drawn: the setup card's Away from home sent them here. */
  readonly reveal?: boolean | undefined;
}
