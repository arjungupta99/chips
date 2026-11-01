/**
 * What a browser calls itself when it pairs, or when it makes a passkey: "Safari on Mac",
 * "Chrome on Windows". Every browser used to pair as "This browser", and a person looking at
 * five of them in You, from the phone, could not tell which was which, nor which to sign out
 * (ADR 0085). The name is read once, from the user agent, and kept by the server; `deviceKind`
 * in core reads it back for the mark beside it, so it always carries the browser's name.
 */

/**
 * Browsers, in the order they are told apart: Edge and Opera say "Chrome" too, and Chrome says
 * "Safari".
 */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\b(?:Headless)?Chrome\/|\bCriOS\/|\bChromium\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

/**
 * Systems, phones before computers: an iPad's Safari may say "Macintosh", and Android says
 * "Linux".
 */
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh\b|\bMac OS X\b/, "Mac"],
  [/\bWindows\b/, "Windows"],
  [/\bLinux\b/, "Linux"],
];

function first(table: readonly (readonly [RegExp, string])[], agent: string): string | undefined {
  return table.find(([pattern]) => pattern.test(agent))?.[1];
}

/**
 * The name for this browser, from its user agent. A browser this does not know is "Browser on
 * Mac", and a system it does not know is just "Firefox"; knowing neither, it is "Browser" — never
 * "This browser", which is only true on the device that says it.
 */
export function browserDeviceName(
  agent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): string {
  const browser = first(BROWSERS, agent);
  const system = first(SYSTEMS, agent);
  if (system === undefined) return browser ?? "Browser";
  return `${browser ?? "Browser"} on ${system}`;
}
