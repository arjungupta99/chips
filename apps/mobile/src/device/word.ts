/**
 * What this device is called where a sentence names it (ADR 0177): a phone, or an iPad.
 *
 * The app said "this phone" in forty places, from the connection's sheet to Media on this phone,
 * and on an iPad every one of them was wrong ("Notify me on this phone", a "This phone" tag on the
 * iPad's own row in Devices: the iPad simulator, 15 October 2026). Each says it through here now.
 * An Android tablet is still a phone here: there is no such tablet to try it on.
 *
 * Read from the platform each time it is asked rather than once as the module loads, so a test can
 * be an iPad.
 */

import { Platform } from "react-native";

export type DeviceWord = "phone" | "iPad";

/** Whether this is an iPad. */
export function isPad(): boolean {
  return Platform.OS === "ios" && Platform.isPad === true;
}

/** What this device is called in a sentence: "phone", or "iPad". */
export function deviceWord(): DeviceWord {
  return isPad() ? "iPad" : "phone";
}

/** "this phone" or "this iPad"; "This phone" or "This iPad" at the start of a sentence. */
export function thisDevice(start = false): string {
  return `${start ? "This" : "this"} ${deviceWord()}`;
}
