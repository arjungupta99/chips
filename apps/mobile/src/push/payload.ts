/**
 * What a push says, and what to do about it. Pure, so it is testable without a phone.
 *
 * A push carries three ids and two fixed words (ADR 0045), so everything here is about reading
 * ids out of an untyped bag and refusing anything that is not one. The words on the lock screen
 * are the server's; the words in the app come from the log the phone already has.
 */

/** The buttons the `decision` category registers. Approve asks for the unlock; Deny does not. */
export const APPROVE = "approve";
export const DENY = "deny";

/** Expo's own identifier for "the person tapped the notification itself". */
export const TAPPED = "expo.modules.notifications.actions.DEFAULT";

/** A phone this app registers buttons on. The web target registers none. */
export type Phone = "ios" | "android";

/**
 * Whether a press of Approve on the lock screen may decide, here.
 *
 * On iOS the button asks for Face ID before the app hears of the press, so a press is somebody
 * who could unlock the phone. Android has no such thing for a notification's button —
 * `expo-notifications` marks `isAuthenticationRequired` as iOS's — and on Android 11 and earlier
 * even a button that opens the app is heard before the unlock, not after. So on Android, and on
 * anything not known to ask, Approve opens the ask behind the unlock that opening an app takes,
 * and the person approves there. Deny decides from the lock screen everywhere: the safe answer
 * should be the easy one.
 */
export function approvesFromLockScreen(phone: Phone | undefined): boolean {
  return phone === "ios";
}

/** A button, in the shape `setNotificationCategoryAsync` takes. */
export interface Button {
  readonly identifier: string;
  readonly buttonTitle: string;
  readonly options: {
    readonly opensAppToForeground: boolean;
    readonly isAuthenticationRequired?: boolean;
    readonly isDestructive?: boolean;
  };
}

/**
 * The `decision` category's two buttons on this phone.
 *
 * Neither brings the app forward where the lock screen can decide: the point is to answer without
 * opening anything. Where it cannot, Approve's title ends in an ellipsis, the old promise that a
 * button asks for more before it acts.
 */
export function buttons(phone: Phone): readonly Button[] {
  const deny: Button = {
    identifier: DENY,
    buttonTitle: "Deny",
    options: { isDestructive: true, opensAppToForeground: false },
  };
  const approve: Button = approvesFromLockScreen(phone)
    ? {
        identifier: APPROVE,
        buttonTitle: "Approve",
        options: { isAuthenticationRequired: true, opensAppToForeground: false },
      }
    : { identifier: APPROVE, buttonTitle: "Approve…", options: { opensAppToForeground: true } };
  return [approve, deny];
}

/** The ids a decision push carries. */
export interface Ask {
  readonly approvalId: string;
  readonly spaceId: string;
  readonly runId: string;
}

/** A decision made without opening the app. */
export interface PendingDecision {
  readonly approvalId: string;
  readonly spaceId: string;
  readonly runId: string;
  readonly decision: "approved" | "denied";
  readonly at: string;
  /**
   * The workspace it was asked in, by this phone's device there (ADR 0197), so it is sent to that
   * server whichever workspace is in front. Absent from a push older than that, and from a row
   * kept before it: the one in front then.
   */
  readonly deviceId?: string | undefined;
}

/**
 * What a response to a push amounts to: a decision to send, a screen to open, a join request to
 * read (ADR 0122), or a guest's ask to go direct to read (ADR 0211), whose sheets then open
 * wherever the app is.
 */
export type Response =
  | { readonly kind: "decision"; readonly decision: PendingDecision }
  | { readonly kind: "open"; readonly route: string }
  | { readonly kind: "join"; readonly requestId: string }
  | { readonly kind: "direct"; readonly askId: string }
  | { readonly kind: "nothing" };

function idOf(data: unknown, key: string, prefix: string): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.startsWith(prefix) ? value : undefined;
}

/** The ask a push is about, or nothing when the payload is not one of ours. */
export function askFrom(data: unknown): Ask | undefined {
  const approvalId = idOf(data, "approval_id", "apr_");
  const spaceId = idOf(data, "space_id", "spc_");
  const runId = idOf(data, "run_id", "run_");
  if (approvalId === undefined || spaceId === undefined || runId === undefined) return undefined;
  return { approvalId, spaceId, runId };
}

/**
 * The workspace a push came from (ADR 0197): this phone's device there, which the server names in
 * every push so that a phone holding several knows which store to answer through and which to
 * bring forward. Nothing from a server older than that.
 */
export function deviceFrom(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)["device_id"];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** The join request a push is about (ADR 0122): its id, and nothing else, as every push. */
export function joinFrom(data: unknown): string | undefined {
  return idOf(data, "join_request_id", "jrq_");
}

/**
 * A guest's ask to go direct (ADR 0211, Phase 3), for an owner: its id. Its answer, for the guest,
 * opens the Connection page, where the guide is.
 */
export function directFrom(data: unknown): string | undefined {
  return idOf(data, "direct_ask_id", "dra_");
}

/** An owner asks this phone to go direct before turning the relay off (ADR 0211, Phase 4). */
function relayAsk(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>)["relay_ask"] === "connection"
  );
}

/**
 * What a push that arrives while the app is open is read for (ADR 0211): its banner is silenced
 * in front, so a guest's ask is read for an owner's sheet, and an answer for the guest's guide.
 */
export function readOnArrival(
  data: unknown,
): { readonly kind: "direct"; readonly askId: string } | { readonly kind: "mine" } | undefined {
  const direct = directFrom(data);
  if (direct !== undefined) return { kind: "direct", askId: direct };
  return idOf(data, "direct_shared", "dra_") === undefined ? undefined : { kind: "mine" };
}

/**
 * What to do about a person's response to a push.
 *
 * Approve and Deny are answered where the person is — on the lock screen, with the app never
 * coming forward. A tap opens the ask, because a tap is somebody saying "let me look", and the
 * card has the preview, the risk and the trail that the push deliberately does not. So does
 * Approve, on a phone that cannot ask for the unlock first (`approvesFromLockScreen`).
 *
 * A push about a room and no ask, an agent's @ (ADR 0158) or the agents held (ADR 0097), opens
 * the room. A guest's ask to go direct opens its sheet; its answer opens Connection (ADR 0211),
 * and so does an owner's ask to go direct before the relay goes off (Phase 4).
 */
export function responseTo(
  action: string,
  data: unknown,
  at: string,
  route: (approvalId: string) => string,
  phone: Phone | undefined,
): Response {
  const join = joinFrom(data);
  if (join !== undefined) return { kind: "join", requestId: join };
  const direct = directFrom(data);
  if (direct !== undefined) return { kind: "direct", askId: direct };
  if (idOf(data, "direct_shared", "dra_") !== undefined || relayAsk(data))
    return { kind: "open", route: "/connection" };
  const ask = askFrom(data);
  if (ask === undefined) {
    const spaceId = idOf(data, "space_id", "spc_");
    return spaceId === undefined
      ? { kind: "nothing" }
      : { kind: "open", route: `/spaces/${spaceId}` };
  }
  if (action === DENY || (action === APPROVE && approvesFromLockScreen(phone))) {
    return {
      kind: "decision",
      decision: { ...ask, decision: action === APPROVE ? "approved" : "denied", at },
    };
  }
  return { kind: "open", route: route(ask.approvalId) };
}
