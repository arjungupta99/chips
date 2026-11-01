# 0039. The tunnel is Noise NK over WebCrypto, and requests cross it as messages

6 September 2026 · Status: accepted

Written while building M4.1, because ADR 0038 says what the relay is — a switchboard that
forwards ciphertext and understands nothing — and stops short of saying what the ciphertext
is, who is authenticated by it, and how a request that was an HTTP call on the network becomes
something a relay can carry without reading.

## Context

On the network the server is on, a phone reaches it the way a browser does: signed requests
to `/v1`, and a socket opened with a single-use ticket (ADR 0006). Away from that network the
same calls have to cross a relay that neither end trusts with the words, and three questions
follow. What authenticates the server to the phone, since the relay could put anyone behind a
key? What authenticates the phone to the server? And what, exactly, is inside the ciphertext —
bytes of HTTP, or something the three runtimes involved (a Node server, a browser, a phone) can
all produce without a parser?

The plan's line for M4.1 says "a Noise-based handshake with libsodium". libsodium would mean a
native module in the server and a different binding on every client; WebCrypto is already in
Node 22 and every browser, and X25519, AES-GCM, HMAC and SHA-256 are enough for a Noise
pattern, if not the one the specification's examples use.

## Decision

1. **The pattern is Noise NK, `Noise_NK_25519_AESGCM_SHA256`.** The phone holds the server's
   static public key from the pairing payload, so it authenticates the server in the first round
   trip and needs no static key of its own: `-> e, es` then `<- e, ee`, forty-eight bytes each.
   The phone is anonymous at this layer and is authenticated inside the tunnel by every
   request's device signature, exactly as on the network — the door is the same door. AES-GCM
   and SHA-256 rather than ChaCha and BLAKE2, because WebCrypto has the former everywhere and
   not the latter; the rest of the pattern follows the specification section by section, and
   `packages/tunnel/src/noise.ts` is written to be read beside it. The prologue is
   `chips/tunnel/1`, so a change to what the tunnel carries is a new prologue and a failed
   handshake rather than a misread.

2. **Requests and sockets cross the tunnel as messages, not as HTTP bytes.** Each request is a
   JSON header — method, path and query, headers — and its body, split into chunks the Noise
   message size allows; the answer is the same the other way; a socket is a message that opens a
   channel and messages that carry its text. On the server the message becomes a `Request` for
   the same Hono app the port serves, so authentication, routing and the door are untouched, and
   a socket with a ticket becomes a session in the same hub as one at `/v1/ws`. On the client the
   answer becomes a `Response`, so the store and the transport call `fetch` and `WebSocket` on a
   `Link` and never learn which link they got. A browser cannot speak HTTP over a byte stream
   and a phone should not have to write the parser; this shape costs each runtime nothing.

3. **The server's tunnel key is made once, on first use, and kept in the database.** A registry
   row (ADR 0018), the first that holds a private key. In the database rather than a file so that
   the backup that keeps a workspace keeps its phones paired: restore it elsewhere and every
   phone still reaches it. A server with no relay configured never makes one. The key is not
   exported by `chips export`; it is the server's, not a workspace's.

4. **The server proves the key to the relay before it is listed.** The relay sends a nonce and
   an X25519 ephemeral; the server answers with an HMAC over the nonce and its key, keyed by the
   Diffie-Hellman between its static key and that ephemeral; the relay computes the same from
   its side. Nobody without the private key can be listed under it, so nobody can sit where a
   server should be and deny it service. The newest proof for a key wins, so a server that
   restarted is back before its old socket has timed out.

5. **The phone tries the network first, on a short timeout, and falls back on its own.** A
   device that names a relay probes `/v1/health` at the network address for a second and a
   half; if it answers, the link is the plain one and the relay never hears from the phone. The
   transport chooses again on every reconnect, because the phone may have come home. A device
   paired on the network before its server gained a relay learns the relay from `/v1/health`,
   which names it, so nobody re-pairs for that.

6. **What the relay knows is bounded, and what a tunnel may ask is bounded.** The relay learns
   which key spoke to which phone, from which address, when, and how many bytes; the switchboard
   has a tap for exactly that, which is the packet capture in the tests and the meter M6.4 will
   read against ADR 0038's threshold. A tunnel is a stranger until a credential lets it in, so
   the server caps requests with no credential at thirty a minute per tunnel (phase-5-review
   finding 8), and the pairing limiter counts by the address the relay saw. The relay holds at
   most thirty-two phones per server.

## Consequences

- The plan's parenthesis, "with libsodium", is not followed: WebCrypto adds nothing to install,
  and the same file runs in Node, in a browser and — with the runtime's WebCrypto or a polyfill
  of it, which M4.2 checks before assuming — on a phone. Recorded under Scope changes.
- The web app can use the relay too, not only the phone: a browser at another origin that opens
  a QR's link with a network address it cannot reach goes through the relay, says *via relay* in
  the header, and comes back the same way after a reload. That is how the acceptance is walked
  on a machine with no phone, and it is what the desktop app away from home will do.
- A response crosses the tunnel whole: a 100 MB attachment is buffered on the server before it
  is chunked. Streaming is M4.4's, with media.
- The handshake is fixed to one pattern. A phone that ever needs to authenticate itself at the
  tunnel layer — a device whose server wants to refuse strangers before the door — would move to
  `Noise_IK` with a per-device key registered at pairing, and the prologue would say so.
- A tunnel's session is one socket on the relay; a phone that reconnects opens another. The
  relay's session limit is per server, and a phone that leaves a session open on a dead
  connection holds a slot until the relay's idle timeout, sixty seconds, lets it go.
