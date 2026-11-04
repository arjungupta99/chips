# 0277. The iPhone's crypto is all Apple's operating system's

Date: 4 November 2026
Status: Accepted, 4 November 2026. Built on main; whether it goes into a 1.0.x release is
Arjun's call.

## Context

The iPhone app tells App Store Connect it uses no non-exempt encryption:
`ITSAppUsesNonExemptEncryption` is `false` in `apps/mobile/app.json`, so no build is asked the
encryption questions again. While 1.0.0 (build 202611011318) was in review, that answer was checked
against what the app does, and it was only partly true.

Apple's table of what documentation each kind of encryption needs
([Export compliance documentation for encryption](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption/))
has three rows:

| The app uses | Documentation |
| --- | --- |
| encryption limited to that within the Apple operating system | none in App Store Connect |
| an industry standard algorithm, not provided within the Apple operating system | a French encryption declaration, uploaded in App Store Connect |
| proprietary algorithms not accepted by international standard bodies | a US CCATS and the French declaration |

The French declaration is needed only for an app distributed on the App Store in France, and Chips
is offered there. France controls secure communications apps in particular (Apple's
[overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
points to ANSSI), and every frame between the phone and a server through the relay is
end-to-end encrypted (ADR 0039).

What the phone ran, and where, on 1.0.0:

| Primitive | What uses it | Ran in |
| --- | --- | --- |
| Random bytes | keys, nonces, `randomUUID` | `expo-crypto`: `SecRandomCopyBytes` |
| SHA-256 | the tunnel's handshake hash, the request digest | `expo-crypto`: CommonCrypto |
| AES-GCM | every relay frame | CryptoKit, `modules/frame-cipher` (ADR 0152) |
| X25519 | the tunnel's keys, the pairing handshake | JavaScript, `@noble/curves` |
| Ed25519 | the device key and its signature on every request | JavaScript, `@noble/curves` |
| HMAC-SHA-256 | the tunnel's HKDF | JavaScript, `@noble/hashes` |
| AES-GCM, random bytes | a push's sealed words (ADR 0158) | CryptoKit and `SecRandomCopyBytes`, in the notification extension and `modules/push-seal` |

Nothing else in the app encrypts: there is no SQLCipher and no OpenSSL among its pods, and the
connections themselves are the system's (`URLSession`, and the system's TLS under React Native's
WebSocket). X25519, Ed25519 and HMAC are industry standard algorithms, and they ran in the app's
own code, not the operating system's. That is the second row, which wants the French declaration.
Every algorithm is a published standard (Noise_NK_25519_AESGCM_SHA256 is a published pattern of
standard primitives), so the third row is not the one in question.

## Decision

**On iOS, X25519, Ed25519 and HMAC-SHA-256 run in CryptoKit, as AES-GCM already did.** With
random bytes and SHA-256 from `expo-crypto`, which calls Security and CommonCrypto, every
cryptographic operation the iPhone app does goes through Apple's operating system, and
`ITSAppUsesNonExemptEncryption: false` describes the first row of the table.

- **The module.** `modules/frame-cipher` gained seven functions beside `seal` and `open`:
  `x25519Generate`, `x25519Derive`, `ed25519Generate`, `ed25519Sign`, `ed25519Verify`,
  `hmacSha256Sign` and `hmacSha256Verify`. They have AES-GCM's shape: synchronous, `Uint8Array`s
  in, one `ArrayBuffer` out (a `Bool` for the two that verify). The CryptoKit calls are in
  `ios/Primitives.swift`, which imports nothing of Expo; `FrameCipherModule.swift` only hands them
  to JavaScript. The module keeps its name, so nothing that links it changes.
- **The hooks.** `@chipschat/subtle`'s `Primitives` gained optional `x25519`, `ed25519` and
  `hmacSha256` beside `sha256` and `aesGcm`, and `createSubtle` hands each operation to the one it
  is given: key generation, key agreement, signing, verifying, and HMAC both ways. What stays in
  the package is bookkeeping: which key may do what, and the fixed DER prefixes of `der.ts`.
  `apps/mobile/src/runtime/native.ts` wraps the module as those hooks and `install.ts` passes them.
- **The JavaScript path stays** for the web target (which has the browser's own `crypto.subtle`
  and never installs ours), for Android (whose half of the module is AES-GCM only), and for any
  build without the functions. Each hook is `undefined` unless every function it needs is in the
  module, and a hook that is absent leaves that primitive in JavaScript.
- **Keys keep their format, so nobody pairs again.** `@chipschat/subtle` holds an X25519 private key
  as its 32-byte scalar and an Ed25519 one as its 32-byte seed, and PKCS#8 wraps exactly those
  bytes for both curves (RFC 8410). CryptoKit's `rawRepresentation` is the same 32 bytes. So the
  device key a phone made in JavaScript, kept in the Keychain as PKCS#8
  (`apps/mobile/src/device/storage.ts`), is read back as it always was and signs in CryptoKit.
- **A refused key agreement is an `OperationError` on both paths.** A peer public key of small order
  makes the shared secret all zeros. CryptoKit refuses it, `@noble/curves` refuses it, and
  `Primitives.swift` checks again. `@chipschat/subtle` now names the refusal as WebCrypto does, where
  `@noble/curves`' own error used to come through.
- **The Runtime screen says where each primitive runs.** A row each for random bytes, SHA-256,
  AES-GCM, X25519, Ed25519 and HMAC-SHA-256, with "native, CryptoKit" (or `expo-crypto`) or
  "JavaScript", and a check each that the native X25519, Ed25519 and HMAC agree with
  `@chipschat/subtle` on the phone itself, in the manner of the AES-GCM check (`platform.ts`).

## Consequences

- **Tested native against JavaScript, both directions.** `apps/mobile/src/runtime/cryptokit.vitest.ts`
  compiles the shipped `Primitives.swift` with `swiftc` beside a small driver
  (`modules/frame-cipher/interop/main.swift`) and holds it against `@chipschat/subtle` and Node's
  WebCrypto, the server's side: a JavaScript-made X25519 key and a native one agree on the secret
  from either side, and Node agrees with both; a device key made in JavaScript signs natively and
  Node's `verify` passes it, as the server checks it; native verifies what JavaScript and Node
  signed and refuses a changed byte; HMAC tags match byte for byte for keys shorter and longer than
  a block; AES-GCM seals the same bytes. A last case runs a device key, a tunnel's key agreement,
  an HMAC and a frame through `@chipschat/subtle` with every hook native, against Node. CryptoKit on
  the Mac is the framework the phone has. The test runs only where `swiftc` is (a Mac with Xcode),
  and is skipped on CI's Linux runners.
- **Signatures are no longer deterministic on an iPhone.** CryptoKit randomizes Ed25519 signatures
  (checked on this Mac: the same key over the same bytes signs differently each time). Every one of
  them verifies under RFC 8032, which is all the server asks. Nothing in Chips compares two
  signatures, and the tests check verification, not bytes.
- **Speed was not the reason, and nothing waited on these before.** Signatures and key agreement
  were 4–13 ms in JavaScript on his iPhone, once a request or a tunnel (ADR 0152). The Runtime
  screen's timings for them are no measure of CryptoKit: they run beside the screen's other checks
  on the one JavaScript thread, and on a simulator on 4 November they read 17–25 ms while the
  JavaScript AES-GCM timing ran beside them.
- **The JavaScript implementations are still in the iOS bundle.** `@noble/curves`, `@noble/hashes`
  and `@noble/ciphers` stay as the fallback, and an iPhone build never calls them; the Runtime screen
  shows every primitive native. Apple's table is keyed to what an app *uses*, which is now the
  operating system's alone. Apple's overview words the scope more widely, as an app that "uses,
  accesses, contains, implements, or incorporates" encryption. Under that wider reading, the
  fallback could be kept out of the iOS bundle: a `.ios.ts` variant of the JavaScript primitives
  that Metro picks for iOS, on the strength that every iOS build from this one has the module. That
  was not done here. It is Arjun's call whether the wider reading matters.
- **Android is unchanged.** Its half of the module does AES-GCM in `javax.crypto`, and the curves and
  HMAC stay in JavaScript there. The Android app is not released yet (Google Play waits on a check
  on a physical phone), and its own declarations are for when it is.
- **It needs a native build.** The module changed, so a JavaScript bundle swap cannot carry it.
  Builds before this one keep running their curves in JavaScript, and they talk to the same servers
  with the same keys.
- **1.0.0 and 1.0.2 as already built** ran X25519, Ed25519 and HMAC in JavaScript. A release
  carrying this change makes the `false` accurate for that release on; whether it goes onto
  `release-1.0` is Arjun's call.
