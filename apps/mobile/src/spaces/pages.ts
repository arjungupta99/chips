/**
 * Whether this build can draw a page (ADR 0059). `react-native-webview` has a native half, and a
 * build made before pages does not carry it: loading the module there stops the app on the spot.
 * So a room opens an HTML or a Markdown file in place only where that half is present — on the web target the
 * browser draws it — and `PageView` is loaded only then. An older build still opens the file
 * through the share sheet, as it always did.
 */

import { Platform, TurboModuleRegistry } from "react-native";

let present: boolean | undefined;

export function hasPageView(): boolean {
  present ??= Platform.OS === "web" || TurboModuleRegistry.get("RNCWebViewModule") !== null;
  return present;
}

/** How long a page takes to arrive: enough to be a fade rather than a cut, and no more. */
export const PAGE_FADE_MS = 180;
/** How long to wait for a view that never says it loaded before showing it regardless. */
export const PAGE_WAITS_MS = 2000;
