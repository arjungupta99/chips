/**
 * Everything this app says to `expo-notifications`, in one place (M4.3, ADR 0045).
 *
 * The decisions are all in `payload.ts`, which is pure and tested; this is the seam, and it is
 * deliberately thin. It is also the only file that knows the EAS project id matters: without
 * one there is no push token to get, and the screen says so rather than failing quietly.
 *
 * And it is the only file that knows there is a target with no notifications at all. The same
 * screens run in a browser — `dev/serve.ts` for a person, the Playwright suite for a machine —
 * and `expo-notifications` does not answer there so much as throw: asking it for a category on
 * the web took the whole app down at startup. So every call into it is behind `platform()`,
 * here, once. A caller that had to remember would eventually forget.
 */

import { type Device, deleteJson, isDemo, putJson } from "@chipschat/core";
import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { SETTINGS, writeSetting } from "../prefs";
import { buttons, type Phone } from "./payload";

/** The category the buttons hang off. Referenced by the server's `categoryId`. */
export const CATEGORY = "decision";

/**
 * The EAS project id, from the manifest. Absent until somebody has run `eas init`, and the
 * push token cannot be asked for without it — Expo has nothing to attribute it to.
 */
export function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Whether this build can be pushed to at all. Android's pushes come through Firebase, and a build
 * made without the project's `google-services.json` (`android.googleServicesFile`) has no Firebase
 * to issue a token (AN-2). Asking to allow notifications there gets a yes that brings nothing, and
 * the setup card ticked Notifications for it (the emulator, 16 October 2026). The config is read
 * from the build itself, which keeps the key.
 */
export function buildTakesPush(): boolean {
  if (Platform.OS !== "android") return true;
  const file = Constants.expoConfig?.android?.googleServicesFile;
  return typeof file === "string" && file.length > 0;
}

/** This phone's IANA zone. What the server computes quiet hours in. */
export function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** `ios` or `android`; the web target registers nothing. */
export function platform(): Phone | undefined {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return undefined;
}

/**
 * Approve and Deny on the lock screen.
 *
 * Approve requires an unlock — Face ID before money moves — and Deny does not, because the
 * safe answer should be the easy one. On iOS neither brings the app forward: the whole point is
 * to answer without opening anything. Android cannot ask for the unlock on a button, so there
 * Approve opens the ask instead (`buttons` in `payload.ts` says which phone gets which).
 */
export async function installCategory(): Promise<void> {
  const phone = platform();
  if (phone === undefined) return;
  await Notifications.setNotificationCategoryAsync(CATEGORY, [...buttons(phone)]);
}

/**
 * No banner while the app is in front. The Spaces list marks the room that needs a yes, the
 * room itself holds the card, and a banner over the thing it is about is noise. The badge still
 * moves, because the badge is what a person sees from the home screen.
 */
export function silenceInForeground(): void {
  if (platform() === undefined) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

/** Why this phone cannot be pushed to, when it cannot. */
export type PushRefusal =
  | "no_project"
  | "not_a_phone"
  | "refused"
  | "no_entitlement"
  | "no_firebase";

/**
 * What iOS says, through `expo-notifications`, when the build has no `aps-environment`: a build
 * signed by a free Apple team, which `pnpm phone` builds without push because the team cannot
 * sign it. Matched on the entitlement's name, which is in Apple's words whatever wraps them.
 */
const NO_ENTITLEMENT = /aps-environment/;

/**
 * What Android says, through `expo-notifications`, when the build has no Firebase project in it:
 * no `google-services.json` as `android.googleServicesFile`, so Firebase never starts and there is
 * no app for FCM to issue a token to. Matched on the config key and on Firebase's own sentence.
 */
const NO_FIREBASE = /googleServicesFile|FirebaseApp is not initialized/;

/**
 * Ask iOS, then Expo. The answer is the token, or the reason there is none — which the screen
 * says out loud, since "notifications are off" and "this build has no project id" are two very
 * different problems for the person holding the phone. A token that iOS or Expo would not issue
 * is the phone's problem, never the server's, so it comes back here rather than as a throw the
 * screen would have to guess the source of.
 */
export async function tokenForThisPhone(): Promise<
  { readonly token: string } | { readonly refused: PushRefusal } | { readonly noToken: string }
> {
  if (platform() === undefined) return { refused: "not_a_phone" };
  const id = projectId();
  if (id === undefined) return { refused: "no_project" };
  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { refused: "refused" };
  try {
    const issued = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { token: issued.data };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    if (NO_ENTITLEMENT.test(why)) return { refused: "no_entitlement" };
    if (NO_FIREBASE.test(why)) return { refused: "no_firebase" };
    return { noToken: why };
  }
}

interface PushSeal {
  /**
   * The device's own key, base64, made the first time it is asked for; null when the keychain
   * would not keep it.
   */
  readonly sealKey: (deviceId: string) => string | null;
}

let seal: PushSeal | null | undefined;

/**
 * The key the server seals an agent's words to (ADR 0158), kept in the keychain group the app's
 * notification extension reads (`modules/push-seal`). One for each device, this phone in one
 * workspace, so a server holds only its own (the stranger review, 4 November 2026). None on
 * Android, on the web, and in a build made before the module: those phones are pushed fixed words.
 */
export function sealKey(deviceId: string): string | undefined {
  seal ??= Platform.OS === "ios" ? requireOptionalNativeModule<PushSeal>("ChipsPushSeal") : null;
  try {
    return seal?.sealKey(deviceId) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Tell the server where this phone is, what time it is there, and what to seal words to. The demo's
 * made-up workspace (ADR 0213) has no server, and is never told.
 */
export async function registerToken(device: Device, token: string): Promise<void> {
  const where = platform();
  if (where === undefined || isDemo(device)) return;
  const key = sealKey(device.deviceId);
  await putJson(device, "/v1/me/push-token", {
    token,
    platform: where,
    time_zone: timeZone(),
    ...(key === undefined ? {} : { seal_key: key }),
  });
}

/**
 * Register again as the app opens, when this phone was switched on (`chosen` is the switch's saved
 * word): the zone it is in today, which the room note gives agents as the person's time (ADR 0157),
 * and the key a newer build seals an agent's words to (ADR 0158). It asks nothing of the person: no
 * permission prompt, and a phone switched off here, or refused in Settings, stays as it is. Best
 * effort; the switch is the way to see what went wrong.
 *
 * A phone the system allows with no word saved was allowed when it asked, and the server never
 * took its token: it was out of reach that moment, and the word is written only once it does. It
 * is registered here too, and the word written when the server takes it, so the switch reads On
 * from then (the new-person sweep's finding 13).
 */
export async function refreshRegistration(
  device: Device,
  chosen: string | undefined,
): Promise<void> {
  const id = projectId();
  if (platform() === undefined || chosen === "off" || id === undefined || isDemo(device)) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const issued = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await registerToken(device, issued.data);
  if (chosen !== "on") await writeSetting(SETTINGS.push, "on").catch(() => undefined);
}

/** Tell it to stop. */
export async function unregisterToken(device: Device): Promise<void> {
  if (isDemo(device)) return;
  await deleteJson(device, "/v1/me/push-token");
}

/**
 * Say again, as the app opens, what this phone wants from a workspace's server: its pushes, when
 * the person switched them on and the workspace isn't muted here (`refreshRegistration`); none,
 * when either is off. Turning a switch off tells each server once, and one out of reach that
 * moment (a workspace behind, no signal) kept the token and went on pushing to a phone that had
 * said no, with nothing to tell it again (the stranger review, 4 November 2026). A server told to
 * stop twice answers the same.
 */
export async function settleRegistration(
  device: Device,
  chosen: string | undefined,
): Promise<void> {
  if (platform() === undefined || isDemo(device)) return;
  if (chosen === "off" || device.muted === true) await unregisterToken(device);
  else await refreshRegistration(device, chosen);
}

/**
 * Take down the banners for asks that have since been answered — by this person on a laptop, by
 * a colleague, or by the clock. The server cannot retract a delivered push, so the phone tidies
 * up for it whenever the log moves.
 */
export async function dismissAnswered(stillWaiting: (approvalId: string) => boolean) {
  if (platform() === undefined) return;
  const shown = await Notifications.getPresentedNotificationsAsync();
  for (const one of shown) {
    const data = one.request.content.data as { approval_id?: unknown } | undefined;
    const id = data?.approval_id;
    if (typeof id !== "string" || stillWaiting(id)) continue;
    await Notifications.dismissNotificationAsync(one.request.identifier);
  }
}

/** The number on the app icon: how many things need deciding now. */
export async function showBadge(count: number): Promise<void> {
  if (platform() === undefined) return;
  await Notifications.setBadgeCountAsync(count);
}

/**
 * The response that launched the app, if one did. Read once — it keeps answering with the same
 * one — which is the caller's business; that there is nothing to read in a browser is this
 * file's.
 */
export async function lastResponse(): Promise<Notifications.NotificationResponse | null> {
  if (platform() === undefined) return null;
  return await Notifications.getLastNotificationResponseAsync();
}

/** Pushes that arrive while the app runs, by what they carry. Returns the way to stop listening. */
export function onReceived(handle: (data: unknown) => void): () => void {
  if (platform() === undefined) return () => undefined;
  const subscription = Notifications.addNotificationReceivedListener((notification) =>
    handle(notification.request.content.data),
  );
  return () => subscription.remove();
}

/** Responses while the app runs. Returns the way to stop listening. */
export function onResponse(
  handle: (response: Notifications.NotificationResponse) => void,
): () => void {
  if (platform() === undefined) return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
