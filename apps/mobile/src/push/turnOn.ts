/**
 * Turning this phone's pushes on, and whether they are: what You → Notifications' switch does, and
 * what the setup card and the ask at an agent's first question do too (ADR 0170). One way to turn
 * them on, so each says the same thing when it can't.
 */

import { type Device, isDemo } from "@chipschat/core";
import * as Notifications from "expo-notifications";
import { readSetting, SETTINGS } from "../prefs";
import { choosePush } from "./chosen";
import {
  buildTakesPush,
  type PushRefusal,
  platform,
  projectId,
  registerToken,
  tokenForThisPhone,
} from "./register";

/** On, or why not: a refusal the phone gave, no token, or the server not taking it. */
export type TurnedOn =
  | { readonly kind: "on" }
  | { readonly kind: PushRefusal }
  | { readonly kind: "no_token"; readonly why: string }
  | { readonly kind: "failed"; readonly why: string };

/**
 * Ask iOS, then Expo, then tell the server; remembered here as on. Never for the demo's made-up
 * workspace (ADR 0213), which asks for no permission: there is nothing to push from.
 */
export async function turnOnPush(device: Device): Promise<TurnedOn> {
  if (isDemo(device)) return { kind: "not_a_phone" };
  try {
    const asked = await tokenForThisPhone();
    if ("refused" in asked) return { kind: asked.refused };
    if ("noToken" in asked) return { kind: "no_token", why: asked.noToken };
    await registerToken(device, asked.token);
    await choosePush("on");
    return { kind: "on" };
  } catch (error) {
    return { kind: "failed", why: error instanceof Error ? error.message : "no answer" };
  }
}

/**
 * Whether this phone will be pushed to: the system allows it and the server took its token, which
 * is when the setting is written "on" (`turnOnPush`, and the launch's `refreshRegistration`). Read
 * as "allowed and not turned off", a turn-on the server never took, out of reach that moment,
 * stood On on You and ticked on the setup card with nothing at the server, and the ask never came
 * back (the new-person sweep's finding 13). Nothing to ask about where there can be no push at all
 * (a browser, a build with no project, an Android build with no Firebase): that is not a step left
 * for the person.
 */
export async function pushIsOn(): Promise<boolean | "never"> {
  if (platform() === undefined || projectId() === undefined || !buildTakesPush()) return "never";
  const [permission, chosen] = await Promise.all([
    Notifications.getPermissionsAsync(),
    readSetting(SETTINGS.push).catch(() => undefined),
  ]);
  return permission.granted && chosen === "on";
}
