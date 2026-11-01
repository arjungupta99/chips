/**
 * A `chips://` link the app was opened with, or handed while it was already running, sent to
 * the screen it names. A push tap (WP7) will arrive the same way, which is why this is one hook
 * rather than two paths.
 *
 * It waits for the device: the effect runs again when pairing finishes, so a link that arrives
 * before there is a store to open it with is followed the moment there is one, rather than
 * landing on a screen with nothing behind it.
 *
 * The same URL is followed once. Tapping a link for the screen already in front should do
 * nothing, and pushing a second copy of it onto the stack is not nothing.
 */

import { useURL } from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { routeFor } from "../links";

export function useDeepLinks(ready: boolean): void {
  const url = useURL();
  const router = useRouter();
  const followed = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || url === null || url === followed.current) return;
    const route = routeFor(url);
    if (route === undefined) return;
    followed.current = url;
    router.push(route);
  }, [ready, url, router]);
}
