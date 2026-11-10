/**
 * The kind a device is, read from its name (ADR 0085): a device names itself when it pairs —
 * "iPhone 17 Pro", "Chips for Mac", "Safari on Mac", "chips CLI" — and the server keeps no kind
 * of its own. On its own, with nothing imported, so the relay's lists can read it without a loop
 * through the store.
 */

export type DeviceKind = "phone" | "tablet" | "computer" | "browser" | "terminal" | "other";

/**
 * The kind a device's name says it is. A browser before a phone or a computer, since "Safari on
 * iPhone" is a browser that happens to be on one.
 */
export function deviceKind(name: string): DeviceKind {
  if (/\bCLI\b|terminal/i.test(name)) return "terminal";
  if (/browser|Safari|Chrome|Firefox|Edge|Arc\b|Opera|Brave/i.test(name)) return "browser";
  // An iPad was a phone until 16 October 2026, and its own row in Devices wore a handset (ADR 0177).
  if (/iPad|tablet/i.test(name)) return "tablet";
  if (/iPhone|Android|Pixel|Galaxy|sdk_gphone|phone/i.test(name)) return "phone";
  if (/Mac|Windows|Linux|desktop|computer|laptop/i.test(name)) return "computer";
  return "other";
}
