# `@chipschat/subtle`

The subset of WebCrypto Chips needs, in JavaScript, for a runtime that has none of its own.

React Native has no `crypto.subtle` (M4.2), and everything Chips asks of WebCrypto is in three
files — `packages/tunnel/src/{keys,noise,bytes}.ts` and `packages/core/src/device.ts` — all of
which reach for `globalThis.crypto`. So the phone is given a `globalThis.crypto` that answers,
and nothing shared changes shape
([ADR 0044](../../docs/decisions/0044-the-phones-webcrypto-is-ours-in-javascript.md)).

It imports nothing of ours. Its only dependencies are `@noble/curves`, `@noble/ciphers` and
`@noble/hashes`: the audited pure-JavaScript implementations, with no dependencies of their own.

## What it does

| Call | Algorithms and formats |
|---|---|
| `digest` | `SHA-256` |
| `generateKey` | `X25519` (`deriveBits`), `Ed25519` (`sign`, `verify`) — `extractable` honoured |
| `exportKey` | `raw` (a public key), `spki` (a public key), `pkcs8` (a private key); a key that is not extractable refuses |
| `importKey` | `raw` (an X25519 or Ed25519 public key, an AES-GCM key of 16 or 32 bytes, an HMAC key), `spki`, `pkcs8` |
| `deriveBits` | `{ name: "X25519", public }`, 256 bits |
| `sign` / `verify` | `HMAC` (SHA-256), `Ed25519` |
| `encrypt` / `decrypt` | `{ name: "AES-GCM", iv, additionalData?, tagLength: 128 }` — ciphertext then the tag, as WebCrypto returns it |

Anything else throws by the name WebCrypto uses — `NotSupportedError`, `InvalidAccessError`,
`OperationError`, `DataError` — so a caller that branches on `error.name` reads the same either
way.

```ts
import { installWebCrypto } from "@chipschat/subtle";
import * as expoCrypto from "expo-crypto";

// A runtime that can do a piece of this natively passes it in; the rest is JavaScript.
installWebCrypto({ random: (out) => expoCrypto.getRandomValues(out) });
```

`installWebCrypto` leaves a real `crypto.subtle` alone: it is a fallback, never a replacement.

## Invariants

| Invariant | Protected by |
|---|---|
| What the shim makes, Node's own WebCrypto accepts, and what Node makes, the shim accepts: the same digest, the same spki and pkcs8, the same shared secret from either side, the same signature, the same sealed bytes with the same additional data — and both refuse a flipped tag. | `src/interop.test.ts` |
| `@chipschat/tunnel`'s whole suite passes against this in place of Node's WebCrypto, unchanged. | `vitest.tunnel.config.ts` (a project of the root run) |
| A device signature made here verifies the way the server verifies it. | `src/interop.test.ts`, "the device signature, as the server checks it" |
| A key does only what it was made for, a key made unexportable stays unexportable, and an algorithm this package does not have is refused by name rather than approximated. | `src/subtle.test.ts` |
| Native primitives are used when they are given, and the JavaScript path when they are not. | `src/subtle.test.ts`, "what the runtime may do itself" |

## What it is not

Constant-time in the way a native implementation is, and not a place to put a key the runtime
cannot read: a JavaScript implementation holds bytes JavaScript can see. Where the phone's key
rests, and when it is in memory, is written down in ADR 0044.
