/**
 * A link the system opens the app with, before the router reads it (expo-router's native intent):
 * an invite at a relay's page (ADR 0207) goes to `/join` with the invite as params, since the
 * router would read the page's path and drop the fragment the invite is in. Every other link goes
 * on as it came. A throw here would take the app down, so a link that cannot be read goes on too.
 */

import { joinPathFor } from "../src/pairing/inviteLink";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return joinPathFor(path) ?? path;
  } catch {
    return path;
  }
}
