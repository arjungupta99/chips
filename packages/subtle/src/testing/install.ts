/**
 * The shim in place of the runtime's own WebCrypto, for the conformance run.
 *
 * `vitest.tunnel.config.ts` runs `@chipschat/tunnel`'s whole suite with this as its setup: the Noise
 * handshake, the keys, the mux and the relay, none of them changed, all of them against this
 * package instead of Node's. It is the proof ADR 0044 promises — that the shim is the same
 * interface and not merely a similar one — and it is why the tunnel needs no phone-shaped fork.
 */

import { createWebCrypto } from "../index.js";

// Taken before the replacement: Node's random is real, and the shim has no reason to make its own.
const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);

Object.defineProperty(globalThis, "crypto", {
  value: createWebCrypto({ random: (out) => random(out) }),
  configurable: true,
  writable: true,
});
