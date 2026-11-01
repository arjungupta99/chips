import { agoWords } from "./agents.js";

/**
 * How the server is named and how long it has been out of reach, in the words both clients say
 * them in: the phone's connection sheet and the desktop's mark (ADR 0131).
 */

/** `http://100.64.0.7:4431` as a person would know it, `100.64.0.7:4431`; nothing for none. */
export function serverHost(serverUrl: string | undefined): string | undefined {
  if (serverUrl === undefined || serverUrl === "") return undefined;
  try {
    return new URL(serverUrl).host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * How long ago the connection was lost, for "Last connected …": "just now" under a minute, then
 * core's own short durations with "ago" ("4 min ago", "3 h ago", "2 d ago").
 */
export function lostWords(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const ms = Math.max(0, now - at);
  return ms < 60_000 ? "just now" : `${agoWords(ms)} ago`;
}
