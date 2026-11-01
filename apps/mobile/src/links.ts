/**
 * Where a `chips://` link goes on the phone.
 *
 * Two shapes are worth linking to from outside, and they are the desktop's (`apps/web/src/
 * native.ts`) rather than new ones: a space, and a decision somebody is waiting on.
 *
 *   chips://space/spc_01H…      → the space
 *   chips://approval/apr_01H…   → the ask, on its own screen
 *
 * The second lands on `/needs/<id>` because that is what the screen is called here, which is
 * the whole reason this is a translation rather than a set of route names shaped like a URL
 * scheme: the scheme is a contract with the outside world and the routes are this app's own.
 *
 * In Expo Go there is no custom scheme. The app is reached through the development URL, and a
 * link then looks like `exp://100.64.0.7:8081/--/space/spc_01H` — the `/--/` separates the
 * bundler's address from the app's path. A development build is what gets `chips://` itself,
 * and the mobile guide says so.
 */

/** The route a link points at, or nothing when it points at something this app does not have. */
export function routeFor(raw: string): string | undefined {
  const [kind, id] = partsOf(raw);
  if (kind === undefined || id === undefined) return undefined;
  if (kind === "space" && id.startsWith("spc_")) return `/spaces/${id}`;
  if (kind === "approval" && id.startsWith("apr_")) return `/needs/${id}`;
  return undefined;
}

/**
 * The kind and the id, from either shape. `chips://approval/apr_1` parses with the kind as the
 * host and the id as the path; somebody typing `chips:approval/apr_1` gets the same answer,
 * which is worth being lenient about — the desktop is.
 */
function partsOf(raw: string): readonly (string | undefined)[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  const inExpoGo = url.pathname.includes("/--/");
  if (!inExpoGo && url.protocol !== "chips:") return [];
  const path = inExpoGo ? url.pathname.slice(url.pathname.indexOf("/--/") + 4) : url.pathname;
  const parts = [...(inExpoGo ? [] : [url.hostname]), ...path.split("/")].filter(
    (part) => part !== "",
  );
  return [parts[0], parts[1]];
}
