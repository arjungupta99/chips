# 0152. A large file through the relay holds neither the tunnel nor the phone

Date: 12 October 2026
Status: Accepted, 12 October 2026.

## Context

On 12 October the hosted relay went live and his iPhone reached 4431 through it on cellular
([ADR 0144](0144-the-hosted-relay-serves-a-list-of-servers.md)). ADR 0144 had left one thing
known and not built: "a large clip through the relay still stalls before it starts (C3)". He asked
to fix it ("fix the large video stall through the relay"), was shown two causes and three options,
and chose: "go with A then B".

**Measured first.** `pnpm relay:bench` ([testing/relay.md](../../testing/relay.md)) stands up a
relay, a scratch server dialling it through a 3 MB/s link (a home's uplink) and a Node "phone"
through a 10 MB/s one, 75 ms each way, and fetches a 40 MB file while timing small signed requests
on the same tunnel:

| | 40 MB, before |
| --- | --- |
| The file's headers and first byte | 0.38 s |
| The whole file | 14.6 s (2.7 MB/s: the uplink) |
| A small request on an idle tunnel | 0.31 s |
| A small request sent 0.5 s into the file | **14.1 s** |
| A small request sent 6 s in | **8.6 s** |
| The server's memory | +126 MB |

So it was not a stall before the start, as ADR 0144 said: the file started at once. It was
everything else on the tunnel that stopped — every answer, and every socket message, which is how
the room hears of a new line — until the whole file had gone. Two things did that:

1. **The server read the answer whole and queued all of it.** `server/src/interfaces/relay/link.ts`
   took the app's `Response` with `arrayBuffer()`, and the tunnel's answerer handed every 32 KiB
   frame to the socket at once. The server's one socket to the relay (which every phone's session
   shares) then held the file, and every frame after it waited its turn behind the last byte.
2. **The phone opened every frame in JavaScript.** `@noble/ciphers` on his iPhone costs about
   400 ms a megabyte ([ADR 0044](0044-the-phones-webcrypto-is-ours-in-javascript.md)'s addendum),
   so a 40 MB play copy held the JavaScript thread for some 16 seconds: the ring, the room and
   anything sent behind the file waited on it. ADR 0044 called this "a cost worth knowing rather
   than a problem worth solving, and if it ever becomes one the answer is a native module behind
   `RuntimePrimitives`". `expo-crypto`'s native AES-GCM had been measured and was slower (476–556
   ms), because its answer comes back as an object and the bytes through a second crossing.

## Decision

**A. The phone's AES-GCM is its own platform's** (`apps/mobile/modules/frame-cipher`): CryptoKit
on iOS, `javax.crypto` on Android, as a local Expo module with two synchronous functions, `seal`
and `open`. The bytes go in as `Uint8Array`s and come back as one `ArrayBuffer`; nothing else
crosses. Synchronous because a 32 KiB frame costs the platform's cipher microseconds, less than a
hop to another thread and back. `apps/mobile/src/runtime/aes.ts` wraps it as `@chipschat/subtle`'s
`aesGcm` primitive and `install.ts` hands it over at start, so every `crypto.subtle` AES-GCM call
on the phone — the tunnel's seal and open — is native. Where the module is absent (the web
target, a build from before it) the primitive is `undefined` and `@chipschat/subtle` stays in
JavaScript. The Runtime screen checks it against `@chipschat/subtle` with nothing native in it: four
shapes, sealed both ways and compared byte for byte, opened across, a changed byte refused; and it
times a megabyte of 32 KiB frames opened each way.

**B. The server sends an answer as it reads it, paced by the network** (`packages/tunnel/src/mux.ts`):

- `link.ts` hands the answerer the `Response`'s body as it is, a stream.
- The answerer sends a streamed body frame by frame, and sends each frame only once the channel's
  backlog is under `STREAM_AHEAD_BYTES`, a quarter of a megabyte. The backlog is the frames the
  channel has yet to seal plus what its wire has taken and not yet put on the network — the
  socket's `bufferedAmount`, through the new optional `Wire.backlog`. It looks again every 10 ms.
- Every phone's session is a wire over the server's one socket to the relay, so they are all paced
  by that socket's one backlog, and a second phone's messages do not wait behind the first
  phone's clip either.
- A whole body (`Uint8Array`) is sent as before, so nothing else that answers through the tunnel
  changed.

No frame, header or version changed: a phone from before this reads a streamed answer exactly as
it read a whole one, and a phone after it talks to a server from before.

## Consequences

**B, measured** with the same bench and the same file:

| | Before | After B |
| --- | --- | --- |
| The whole file | 14.6 s | 14.6 s |
| A small request sent 0.5 s in | 14.1 s | 0.8–1.3 s |
| A small request sent 6 s in | 8.6 s | 1.3–1.4 s |
| The server's memory | +126 MB | +28 MB |

The file takes as long as the uplink makes it. What is left of the wait, about a second, is the
link's own queue: the bench's slow link holds up to a megabyte in flight, as a home router does,
plus the kernel's socket buffers. Only a window carried end to end (the phone telling the server
how much it has taken) could shrink that, and a window large enough to keep a 3 MB/s, 150 ms link
full is about a megabyte itself; it would also be a change to the protocol. Not built.

**A** is measured by the Runtime screen (the scenario,
[testing/scenarios/relay/large-file-through-the-relay.md](../../testing/scenarios/relay/large-file-through-the-relay.md),
keeps the numbers from the simulator and his iPhone). It needs a native build: `pnpm phone` puts it
on his iPhone; a JavaScript bundle swap cannot.

- **ADR 0044's addendum is superseded for AES-GCM.** Its finding stands for `expo-crypto` (two
  crossings are slower than JavaScript); the module here is one crossing. Signatures and key
  agreement stay in JavaScript: 4–5 ms and 11–13 ms, once per request or tunnel, are not the
  problem. **On an iPhone they moved to this module too** (4 November 2026), for App Store Connect's
  export compliance rather than speed: [ADR 0277](0277-the-iphones-crypto-is-all-apples-operating-system.md).
- **The pacing needs the socket to report `bufferedAmount`.** Node's WebSocket does (checked on
  Node 26, which 4431 runs, and on 22.22.2, which a release bundles). A socket that does not report it reads as an empty backlog, and a
  body is then paced only by the channel's own queue — which is the behaviour before this, no
  worse.
- **Uploads through the relay are not paced.** The phone sends a 4 MB piece's frames at once
  (the caller's `sendInChunks`), so its own later frames wait behind a piece: about 1.3 s on a
  3 MB/s cellular uplink. Bounded by the piece, and not what was asked; not built. **Built the
  same day**, with a download let go of stopping the server:
  [ADR 0153](0153-the-tunnel-says-what-it-has-taken-and-a-reader-that-stops-says-so.md).
- **What the bench cannot see** is the phone's thread: its "phone" is Node. The Runtime screen and
  a simulator walk through the bench's relay ([testing/relay.md](../../testing/relay.md)) are where
  that is looked at.
