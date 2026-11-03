/**
 * A link the system opens the app with, before the router reads it (expo-router's native intent),
 * as `routerPathFor` says: an invite at a relay's page (ADR 0207) goes to `/join` with the invite as
 * params, since the router would read the page's path and drop the fragment the invite is in; a
 * space's or an ask's link is left to `useDeepLinks`, which the router never sees; every other link
 * goes on as it came. A throw here would take the app down, so a link that cannot be read goes on
 * too.
 */

import { routerPathFor } from "../src/links";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    return routerPathFor(path);
  } catch {
    return path;
  }
}
