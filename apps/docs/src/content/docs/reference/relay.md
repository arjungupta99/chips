---
title: The relay and the tunnel
description: The switchboard's control frames, the pairing payload, and what crosses the tunnel.
sidebar:
  order: 5
---

The relay ([operate](/operate/relay/)) speaks a handful of JSON text frames on a WebSocket and
forwards binary frames it never parses. Every frame carries `v`, the relay protocol version
(`1`), and the two that open a path carry `candidates`, a list of candidate addresses for a
direct path that is always empty in v1. A peer receiving a version it does not know reads the
fields it does know and uses the relay, rather than failing.

## The server's door, `/v1/serve`

| Frame | Direction | Fields |
| --- | --- | --- |
| `challenge` | relay → server | `nonce`, `ephemeral` — thirty-two bytes each, base64url. Sent at once. |
| `serve` | server → relay | `key` — the server's X25519 static public key; `proof` — HMAC-SHA256 over the nonce and the key, keyed by X25519 between the server's static key and the relay's ephemeral; `candidates`. |
| `serving` | relay → server | `session_limit` — how many phones the relay holds open for this server. |
| `open` | relay → server | `session` — sixteen bytes as hex; `from` — the phone's address as the relay saw it. |
| `close` | either way | `session`, `reason`. |
| `error` | relay → server | `code` — `bad_frame`, `bad_proof`, `not_allowed`, `busy`, `replaced`, `unknown_version`; `message`. The socket closes after it. |

A binary frame on this socket is a session id, sixteen bytes, followed by the tunnel's bytes for
that session, in both directions. The newest proof for a key wins: a server that restarts is
listed again before its old socket has timed out, and the old one hears `error` with
`replaced`. A relay with a list of servers (`CHIPS_RELAY_ALLOW_KEYS`) answers any other key's `serve`
with `error` and `not_allowed`, before checking its proof. A relay that lists eight servers from
one address already answers a ninth's `serve` with `busy` ([limits](/operate/relay/#limits)). Homes
behind a carrier's shared address (CGNAT) count as one, so a server there can be turned away by
neighbours it doesn't know. It keeps dialling, and is listed once one of the eight goes.

## The phone's door, `/v1/connect`

| Frame | Direction | Fields |
| --- | --- | --- |
| `connect` | phone → relay | `key` — the server's key from the pairing payload; `candidates`. |
| `connected` | relay → phone | `session`. From here the binary frames on this socket are the tunnel's, raw. |
| `close` | either way | `session`, `reason` — `server_gone`, `replaced`, `done`, `too_slow` (one end fell more than 16 MiB behind). |
| `error` | relay → phone | `code` — `no_such_server`, `busy`, `bad_frame`, `unknown_version`; `message`. |

## The pairing payload

A QR is an address with the payload in its fragment, as it has been since the first release:

```
http://192.168.1.20:4431/#pair=ABC-234&v=1&relay=wss%3A%2F%2Frelay.example&key=<43 chars>
```

| Field | Meaning |
| --- | --- |
| `pair` | The code. Six characters from thirty-two, in two groups. |
| `v` | The payload's version, `1`. A QR without one is from before the relay and carries a code alone. |
| `lan` | The server on its network, when that is not the address the QR opens. Absent, the QR's own origin. |
| `relay` | The relay the server dials out to, `ws://` or `wss://`. |
| `key` | The server's tunnel key: asked for at the relay, and what the tunnel authenticates. |

`POST /v1/pairing-codes` answers the same fields beside the code — `v`, `relay`, `server_key`,
`candidates` — for a screen to put in a QR, and `GET /v1/server` names the relay and the key to a
paired device, signed, so a device paired before the server had a relay learns of it without
pairing again: the client reads it each time its socket opens and keeps a relay it did not have.
`GET /v1/health` names neither, but to the server's own machine.

No message on either door may be over 256 KiB; a socket that sends one is closed with 1009.

## The tunnel

`Noise_NK_25519_AESGCM_SHA256`, with the prologue `chips/tunnel/1`: the phone holds the server's
key and speaks first, `-> e, es`; the server answers `<- e, ee`; forty-eight bytes each. The
phone is anonymous at this layer and authenticated inside the tunnel by its device signature on
every request, exactly as on the network.

Inside, each transport message is one frame: a two-byte header length, a JSON header, and a
body. A request is `{ t: "req", id, method, target, headers, end }` with the first chunk of its
body, then `{ t: "data", id, end }` frames for the rest, at most 32 KiB a chunk; the answer is
`{ t: "res", id, status, headers, end }` the same way back, or `{ t: "error", id, message }`. A
socket is `{ t: "open", id, target }`, answered by `{ t: "opened", id }` or
`{ t: "close", id, code, reason }`; its text crosses as `{ t: "msg", id, end }` frames, and
either end closes it with `close`. On the server a `req` becomes a request to the same routes
the port serves, and an `open` with a ticket becomes a session in the same hub as `/v1/ws`.
