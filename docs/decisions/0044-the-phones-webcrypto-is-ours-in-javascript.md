# 0044. The phone's WebCrypto is ours, in JavaScript, and Node's suite proves it

7 September 2026 · Status: accepted

Decided in Phase 4 · Mobile and the relay, before `apps/mobile` exists (M4.2). Two decisions
that belong together: how a phone gets WebCrypto at all, and where its device key rests when it
has one.

## Context

Everything Chips asks of WebCrypto is in three files. `packages/tunnel/src/{keys,noise,bytes}.ts`
does the Noise handshake — X25519, AES-GCM, SHA-256, HMAC — and `packages/core/src/device.ts`
does the device key: Ed25519 generate, export as `spki`, sign, and a SHA-256 of the body. All of
it reaches for `globalThis.crypto`.

React Native has none. Hermes provides no `crypto.subtle`, and `expo-crypto` gives random bytes,
SHA digests and AES-GCM with a caller's nonce, but no X25519 and no Ed25519 — the two the tunnel
and the device key are built on. ADR 0039 said this would need answering before the phone: "a
pure-JS X25519/AES-GCM behind the same interface, or a native module and therefore a development
build".

A development build is not available: Gate 3's condition has waited since 5 September for an
Apple identity, and Expo Go is the only target this machine and this phone can reach.

## Decision

1. **A package, `@chipschat/subtle`, implements the subset of `SubtleCrypto` Chips uses**, and the
   phone installs it as `globalThis.crypto`. X25519 and Ed25519 from `@noble/curves`, AES-GCM
   from `@noble/ciphers`, SHA-256 and HMAC from `@noble/hashes`: the audited pure-JavaScript
   implementations, no dependencies of their own, BigInt only — which Hermes has.

2. **Nothing shared changes.** The tunnel and `device.ts` are untouched: they ask
   `globalThis.crypto` for what they always asked. A phone-shaped fork of the tunnel would be
   two implementations of a security protocol, which is one too many.

3. **Anything outside the subset throws by name.** `NotSupportedError`,
   `InvalidAccessError`, `OperationError`, `DataError` — the names WebCrypto uses, so a caller
   that branches on `error.name`, or simply reports it, reads the same on a phone as in a
   browser. Refusing loudly is the point: an approximation of a cipher is worse than no cipher.

4. **The proof is the tunnel's own suite, run again against the shim.** `vitest.tunnel.config.ts`
   in `packages/subtle` runs `@chipschat/tunnel`'s twenty-eight tests — the handshake, the keys, the
   mux, the relay — with `globalThis.crypto` replaced, and they pass unchanged. Beside it,
   `interop.test.ts` compares the shim with Node's real WebCrypto byte for byte: the same digest,
   the same `spki` and `pkcs8`, the same shared secret computed from either side, the same
   signature, the same sealed bytes with the same additional data, and both refusing a flipped
   tag. A device signature made by the shim verifies the way the server verifies one.

5. **A runtime that can do a piece of this natively passes it in.** `createWebCrypto` takes an
   optional `Primitives` — `random`, `sha256`, `aesGcm` — and uses what it is given. The phone
   passes `expo-crypto`'s; the tests run the JavaScript path, which is what a runtime falls back
   to. `installWebCrypto` leaves a real `crypto.subtle` alone: this is a fallback, never a
   replacement.

6. **The phone's device key lives in the Keychain, and `DeviceStorage` says so.** A browser keeps
   a non-extractable `CryptoKey` in IndexedDB by structured clone — a key the page itself cannot
   read. Neither half of that is available on a phone: a JavaScript implementation cannot make a
   key JavaScript cannot read, and SQLite cannot hold a `CryptoKey`. So `DeviceStorage` gains an
   optional `keepKey`/`loadKey` pair: when present, the key is generated extractable, `keep`
   hands the private half to the storage to put away, and `readAll` hands what the storage
   returned back to be imported again. On the phone that is a 48-byte PKCS#8 in `expo-secure-store`
   (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), with the record holding a reference; the storage's own
   `remove` is where it is forgotten, so no third method is needed. In a browser neither exists
   and nothing changes.

## Consequences

- **The honest security statement.** The phone's device key rests in the iOS Keychain, encrypted
  by the device and unavailable when the phone is locked. It is in JavaScript memory while a
  request is signed. It is not hardware-bound: an attacker with code execution inside the app can
  read it, where on the web they could only use the key, not take it. The upgrade is a native
  module behind the same `DeviceStorage` — a development build — and it changes nothing above
  this line.
- **Signing is slower.** How much slower is a number the first run on the phone produces (M4.2).
  Under about 50 ms per Ed25519 signature is fine, one per request; over about 150 ms and the
  native-module path moves up the list, which the Gate 4 packet will say.
- Not constant-time in the way a native implementation is. For a device key on a phone that is
  the right trade against not shipping; for the server, which has Node's own WebCrypto, nothing
  changes.
- `packages/subtle` imports nothing of ours, which `.dependency-cruiser.cjs` now enforces beside
  the same rule for `packages/platform`.
- Three new runtime dependencies, all from the same audited family, all leaf packages.

## Alternatives considered

- **A native module (`react-native-quick-crypto` or similar).** Faster and hardware-adjacent, and
  it needs a development build, which needs an Apple identity. Deferred, not rejected: the seam
  above is exactly where it lands.
- **Change the tunnel to use libsodium-js on the phone.** Two implementations of one handshake,
  and a second thing to audit. ADR 0039 chose WebCrypto so that one implementation runs
  everywhere; this keeps that.
- **Ask the server to do the crypto.** It is an end-to-end tunnel. The server is the far end.

## Addendum, 8 September 2026: measured on a real iPhone

The first run on Arjun's own phone (Expo Go, over Tailscale) answered the two numbers this ADR
left open, and reversed one of its expectations.

**Signing is not slow.** An Ed25519 signature costs **4–5 ms**, over five runs. The threshold
above was "under about 50 ms is fine, over about 150 ms and the native-module path moves up the
list". It is an order of magnitude inside that, and there is one signature per request. Verify is
13 ms, an X25519 agreement 11 ms. The native-module path stays deferred, and Expo Go — no Apple
identity, no development build — remains viable for the whole of Phase 4.

**The native cipher is slower than ours, so it is not being installed.** `expo-crypto` gained an
AES-GCM module, and `apps/mobile/src/runtime/aes.ts` was written to hand it to `createSubtle` as
a primitive, gated on a real phone agreeing byte for byte. It agrees — four shapes (empty
payload, empty additional data, a frame, a megabyte), both directions, every run. But sealing a
megabyte costs **476–556 ms natively against 366–428 ms in JavaScript**, consistently, about 30
per cent worse. The reason is the bridge rather than the cipher: a seal returns a `SealedData`
object and the ciphertext comes back through a second crossing, so a megabyte is marshalled
twice.

So the JavaScript path stays, and `@noble/ciphers` is what encrypts a relay frame on the phone.
`aes.ts` stays too, unused as a primitive but exercised by the Runtime screen, which is now both
a correctness check and the measurement that would tell us if this ever changed.

**What this means for the relay.** Roughly 400 ms per megabyte, one way. A relay frame is small
and this is invisible; an attachment crossing the relay pays it once. That is a cost worth
knowing rather than a problem worth solving, and if it ever becomes one the answer is a native
module behind `RuntimePrimitives` — the same seam, still exactly where it lands.

## Addendum, 12 October 2026: AES-GCM is native after all

It became one. A 40 MB clip through the relay held the phone's JavaScript thread for the length of
the file, and [ADR 0152](0152-a-large-file-through-the-relay-holds-neither-the-tunnel-nor-the-phone.md)
puts the phone's own cipher behind `RuntimePrimitives`, as this said it would: CryptoKit and
`javax.crypto` in a local module, one crossing each way rather than `expo-crypto`'s two. Signatures
and key agreement stay in JavaScript.
