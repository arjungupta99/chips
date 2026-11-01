/**
 * The app's entry, ahead of the router's.
 *
 * The order of these two is the whole point and is load-bearing: `expo-router/entry` pulls in
 * the route tree, which pulls in `@chipschat/core`, which reaches for `globalThis.crypto` as it
 * loads. Both are side-effect imports, so they run top to bottom — the crypto is in place
 * before a single route module is evaluated.
 */

import "./src/runtime/boot";
import "expo-router/entry";
