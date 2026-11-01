# `@chipschat/tunnel`

The end-to-end tunnel between a phone and its server
([ADR 0039](../../docs/decisions/0039-the-tunnel-is-noise-nk-over-webcrypto-and-requests-cross-it-as-messages.md)):
a Noise NK handshake over WebCrypto, requests and sockets carried inside it as messages, and both
ends of the relay's conversation. It imports `@chipschat/protocol` for the relay's frames and nothing
else, so the server, the web app and the phone share it.

| Where | What |
|---|---|
| `src/noise.ts` | `Noise_NK_25519_AESGCM_SHA256`, section by section: two messages of forty-eight bytes, then transport messages of at most 65,535. |
| `src/keys.ts` | X25519 keys through WebCrypto — the server's static key as it is kept and as it is used — and the proof a server gives the relay. |
| `src/mux.ts` | The multiplexer: a request as a header and a chunked body, a response the same way back, a socket as a channel of text; the caller end and the answerer end. |
| `src/relay.ts` | A server dialling `/v1/serve` and taking sessions under their ids; a phone dialling `/v1/connect` and being put through. Over any WebSocket-shaped socket. |

## Invariants

| Invariant | Test |
|---|---|
| Only the holder of the key the phone was given can complete the handshake; a forged answer fails it. | `noise.test.ts`, "cannot be completed by anyone but the holder" |
| A transport message tampered with, replayed or reordered is refused. | `noise.test.ts`, "refuses a transport message that was tampered with" |
| Each direction stays in nonce order however the calls interleave. | `noise.test.ts`, "keeps each direction in order" |
| A body of any length crosses whole, in chunks no larger than a Noise message. | `mux.test.ts`, "carry a body larger than one chunk"; "round-trip any body at all" (property) |
| Bodies over the limit, too many requests, and too many sockets are refused, not carried. | `mux.test.ts`, "refuse a body over the limit"; "hold no more sockets" |
| A closed tunnel tells every waiting request and every open socket. | `mux.test.ts`, "tell every open socket and every waiting request" |
| The server's proof holds for the key's owner and for nobody else. | `keys.test.ts`, "proves possession to the relay" |
