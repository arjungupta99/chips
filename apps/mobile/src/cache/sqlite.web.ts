/**
 * The web target keeps core's IndexedDB cache. `expo-sqlite` on the web is a WASM build behind
 * an origin-private file system, and the Playwright suite has no business being the first thing
 * to prove it — the browser cache is the one the web app has used since M1.2.
 */

export { deleteCache as deleteSqliteCache, openCache as openSqliteCache } from "@chipschat/core";
