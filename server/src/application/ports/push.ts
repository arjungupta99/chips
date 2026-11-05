/**
 * Where a push may reach a person's phone, and what sends one (M4.3, ADR 0045).
 *
 * Two ports, because they are two different things. The registry is this server's own table:
 * which device holds which token, and what time zone that phone is in. The sender is somebody
 * else's service — Expo's, by default — which holds the APNs and FCM credentials so that this
 * server never has to, and is handed a token, two fixed words and a pair of ids.
 *
 * What the sender is given is deliberately thin. A push carries no action, no preview, no
 * harness name and no room title: the phone is told *that* a decision is waiting and which one,
 * and reads the rest over its own authenticated socket. Anyone between here and the phone,
 * Expo's service included, learns that a decision exists and nothing about it.
 */

export type PushPlatform = "ios" | "android";

/** A phone that may be pushed to: one row of the registry. */
export interface PushToken {
  readonly deviceId: string;
  readonly participantId: string;
  readonly token: string;
  readonly platform: PushPlatform;
  /** The phone's own IANA zone. Quiet hours mean nothing without it. */
  readonly timeZone: string;
  /** The key the words of a push are sealed to, base64 (ADR 0158). Absent: fixed words only. */
  readonly sealKey?: string | undefined;
}

export interface RegisterPushToken {
  readonly workspaceId: string;
  readonly participantId: string;
  readonly deviceId: string;
  readonly token: string;
  readonly platform: PushPlatform;
  readonly timeZone: string;
  /** The phone's sealing key (ADR 0158). A registration without one clears the old. */
  readonly sealKey?: string | undefined;
  readonly at: string;
}

export interface PushRegistry {
  /** Remember where this device may be reached, replacing whatever it registered before. */
  readonly register: (input: RegisterPushToken) => Promise<void>;
  /** Forget a device: unregistered by the phone, revoked by a person, or swept. */
  readonly remove: (deviceId: string) => Promise<void>;
  /**
   * Forget a token wherever it is held: the push service said no phone has it any more (its
   * receipt said `DeviceNotRegistered`). How many rows held it.
   */
  readonly removeToken: (token: string) => Promise<number>;
  /**
   * Forget every token whose device has been revoked. `forPeople` already leaves them out, so
   * this is housekeeping rather than safety: the sweep runs it so the table does not keep rows
   * for phones that were withdrawn months ago.
   */
  readonly pruneRevoked: () => Promise<number>;
  /** Every phone of these people, in one read. Nobody named, nothing back. */
  readonly forPeople: (
    workspaceId: string,
    participantIds: readonly string[],
  ) => Promise<PushToken[]>;
  /**
   * Each of these people's zone: the one their most recently registered phone gave (ADR 0157),
   * which is where they are as far as Chips knows. Somebody with no phone is left out.
   */
  readonly zonesOf: (
    workspaceId: string,
    participantIds: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
}

/**
 * One push. `title` and `body` are fixed words — see the note above; `data` carries the ids the
 * phone needs to find what this is about, and `categoryId` names the buttons the phone
 * registered, which is how Approve and Deny appear on the lock screen.
 */
export interface PushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly categoryId?: string | undefined;
  readonly priority?: "default" | "high" | undefined;
  /** Seconds. A decision that expires is not worth delivering an hour late. */
  readonly ttl?: number | undefined;
  /** The phone's own alert sound. Absent, the banner comes silently. */
  readonly sound?: "default" | undefined;
  /**
   * Hand the push to the phone's notification extension before it is shown (ADR 0158), which
   * opens sealed words in `data.sealed` and shows them in place of the fixed ones.
   */
  readonly mutableContent?: boolean | undefined;
  readonly data: Readonly<Record<string, string>>;
}

/**
 * What came back for one message, in the order they were sent. `DeviceNotRegistered` is the one
 * error worth acting on: the app was deleted or the token rotated, and the row should go.
 */
export interface PushTicket {
  readonly ok: boolean;
  readonly id?: string | undefined;
  readonly error?: string | undefined;
  readonly message?: string | undefined;
}

/**
 * What became of a push the service took, asked of it later by its ticket's id: delivered to
 * Apple or Google, or why not. `DeviceNotRegistered` here is how a deleted app is learned of.
 */
export interface PushReceipt {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly message?: string | undefined;
}

/**
 * Whether a push can go at all (ADR 0244). `no_access_token`: the sender posts to Expo, and this
 * server has no access token, which the Chips app's Expo project requires. `refused`: the push
 * service turned this server away (a 401 or 403), so its token is wrong or was revoked. Neither
 * mends itself; it stays so until Chips restarts with a token that works.
 */
export type PushReadiness = "ready" | "no_access_token" | "refused";

/**
 * What the server says of its pushes, on `GET /v1/server` and `/v1/health`: its readiness, or
 * `failing` when it is ready and its last pushes didn't get through to the push service (ADR
 * 0244, 2 November 2026). That one mends itself: the next pushes the service takes clear it.
 */
export type PushStanding = PushReadiness | "failing";

export interface PushSender {
  /** Send a batch. One ticket per message, in the same order. */
  readonly send: (messages: readonly PushMessage[]) => Promise<PushTicket[]>;
  /**
   * Whether a push can go now. Asked before a phone claims a banner: a push that cannot go must
   * not take the banner from the person's computer.
   */
  readonly readiness: () => PushReadiness;
  /**
   * Its readiness, or `failing` from a batch the push service didn't answer or didn't take (it
   * was unreachable, a 5xx, the push relay's `push_unavailable`) until a later batch gets its
   * tickets. A failing sender still sends: that is how it learns the service is back.
   */
  readonly standing: () => PushStanding;
  /**
   * What became of the pushes with these tickets' ids, by id; an id the service doesn't answer
   * for isn't there yet. Or why it couldn't say. Absent: a sender that has no receipts.
   */
  readonly receipts?:
    | ((ids: readonly string[]) => Promise<ReadonlyMap<string, PushReceipt> | string>)
    | undefined;
}
