# The hosted relay: what to run, where, and what to change first

**Recommendations, 5 October 2026. Status: his calls taken 9 October 2026 ("go with your
recommendations, start Part 1"): Hetzner in Hillsboro, the list on, devices learn the relay. Built
on 9 October: R0, R1, R4 and C2, the box's files (H2's) and a Linux-only release run
([ADR 0144](../decisions/0144-the-hosted-relay-serves-a-list-of-servers.md)); see "Built" under
§3 and §4. C3 built on 12 October, with the phone's frames opened natively, on his "go with A
then B" ([ADR 0152](../decisions/0152-a-large-file-through-the-relay-holds-neither-the-tunnel-nor-the-phone.md)).
Not built: R2, R3, R5, R6's timeouts, C1, C4 and §5.** He
asked, while ruling on the install plan: "I will do the hosted relay as well, provide me
recommendations in a separate plan file for it." It sits beside
[`install-onboarding-plan.md`](install-onboarding-plan.md), whose §3.7 puts the relay after
Tailscale in the order a phone reaches Chips away from home. Facts below are as read from `b1cfec1a`.

In one line each:

- **One small box, one process, Caddy in front.** The relay is single-process by design. A phone
  must reach the same process that holds its server's key, so the first deployment is one VM,
  not two behind a load balancer.
- **Lock it to his own servers until he says otherwise.** The relay accepts any server today. A
  short allowlist of server keys keeps it private while nothing else is public.
- **Fix four things in the relay before it faces the internet:** message size, backpressure,
  per-address limits, and what it logs. Each is small.
- **Opt in from `chips up`, never on by default.** "Anywhere, through the Chips relay" becomes the
  fourth answer to "who can reach Chips?", recommended only when there is no Tailscale.
- **Paired devices learn the relay from the server.** ADR 0039 says they do, but no client reads
  it yet.

## 1. What the relay is today

- **Code:** `relay/` (`switchboard.ts` holds the rules and touches no socket; `server.ts` wraps it in
  `ws`). It runs as `chips relay` or `pnpm relay`.
- **Endpoints:** `/v1/serve` (a home server dials out), `/v1/connect` (a phone dials in), and
  `GET /health`. It serves plain `ws://` and leaves TLS to a proxy (`relay/src/server.ts:9-13`).
- **Matching:** by the server's 32-byte X25519 public key, which the phone sends in its first frame.
  A server proves the key with an HMAC over a relay nonce before it is listed.
- **What it carries:** a Noise NK tunnel (ADR 0039) the relay cannot read. The capture test asserts
  that no plaintext word, path, code or header crosses (`relay/src/server.test.ts:65-129`).
- **What it sees:** server keys, server and phone IP addresses, session ids, timing, and frame
  sizes.
- **What it logs at info:** `server listed {key, from}`, `session opened {session, key, from}`, and
  `session closed`. Together these pair keys with IP addresses (`relay/src/switchboard.ts:151-176`).
- **State:** all in memory. Nothing is written to disk. A restart drops every session; servers
  redial with backoff starting at 1 s.
- **Limits that exist:**
  - 32 sessions per server
  - a ping every 20 s, and a close at 60 s of silence
  - 10 s to finish the handshake
- **Limits that don't exist:**
  - no `maxPayload`, so `ws` allows 100 MiB per message
  - no backpressure (`server.ts:81-83`)
  - no per-address or global caps
  - no rate limits
- **Behind a proxy:** the phone's address comes from the last `X-Forwarded-For` entry, and only on
  connections from loopback (ADR 0056 addendum). So the TLS proxy must run on the same machine.
- **Server side:** `CHIPS_RELAY_URL` has no default. When it's set, `chips serve` puts the relay
  and the key in the QR. The pairing limiter counts by the relay's `from` field, so every server
  trusts the relay to report addresses honestly.
- **Known gaps, from STATUS:**
  - A paired device never learns a relay added later. `/v1/health` names it, but no client reads
    it.
  - A large clip through the relay stalls, because the server buffers a whole answer before
    sending it.
  - The phone leaks a relay tunnel when it pairs again.

## 2. Where to run it

**Recommendation: one Hetzner Cloud VM, in the US region nearest him (Hillsboro, Oregon), with
Debian 12, `chips relay` from the release, and Caddy for TLS.**

| | Hetzner Cloud | DigitalOcean | Fly.io |
|---|---|---|---|
| Fits a single sticky process | yes | yes | yes (one machine, no autoscale) |
| Rough monthly cost at his scale (a few devices) | a few euros | about $6 | about $5 plus bandwidth |
| `docs/chips-distribution.html`'s estimate at 10,000 users | ~$15 | ~$50 | n/a (AWS was $120–350) |
| Bandwidth | generous in the EU; **check what the US locations include** | 1 TB on the smallest | metered per GB |
| Why not | US traffic allowance smaller than the EU's | costs more per box | metered bandwidth is the relay's whole cost |

- **Prices change.** Check them on the day. The distribution page's numbers are estimates written
  on 6 September: 200 events per person per day and 50 MB of media per person per month.
- **Region:** near the people using it, which today means near him. A phone and a server that are
  both in California should not be relayed through Germany.
- **Size:** the smallest shared-CPU box is enough for his devices. The distribution page puts about
  10,000 idle connections on 4 GB. Grow the box before adding a second one (§6).

**The domain:** `relay.chipschat.ai`, with A and AAAA records pointing at the box. Caddy gets a
certificate from Let's Encrypt on its own.

## 3. What to change in Chips first (H1)

Each item below is a change in this repo with its own tests. None of them names a harness. In
order of how much they matter:

1. **R0, the allowlist.**
   - `CHIPS_RELAY_ALLOW_KEYS` is a comma-separated list of server public keys. When it's set, a
     `serve` proof for any other key gets `error bad_proof` and the socket is closed.
   - **While nothing is public, the relay serves his servers only:** the 4431 server, plus any
     scratch server he adds.
   - `chips relay --print-key` (or `chips doctor`) shows a server's key so it can be added to the
     list.
2. **R1, size and backpressure.**
   - Set `maxPayload` on the `WebSocketServer`. Tunnel messages are at most 65,535 bytes, so 256
     KiB leaves room to spare.
   - Track `bufferedAmount` on the receiving socket. Above 4 MiB, pause reading from the sender;
     above 16 MiB, close the session with `busy`. One slow phone then can't fill the relay's
     memory.
3. **R2, per-address limits.**
   - At most 32 open sockets per IP address (per /64 for IPv6).
   - At most 30 handshakes per minute per address.
   - At most 64 sessions per server key per address.
   - Global caps on servers and sessions.
   - Over a limit, close with 1013 (try again later).
4. **R3, lockout by key.**
   - Anyone holding a server key (it's in every QR) can fill all 32 sessions.
   - Cap the sessions one address may hold for one key at 4.
   - Close a session that has carried no tunnel bytes for 30 s (not 60).
5. **R4, what it logs, and for how long.**
   - At info, log counts only: servers listed and sessions open, once a minute.
   - Log key and address pairs at debug, which is off by default.
   - Rotate daily and keep seven days. Put this in `operate/relay.md` and a privacy note. ADR 0038
     says this is owed "before strangers are on it".
6. **R5, metering.**
   - Wire the switchboard's `tap` into byte counters by direction, in aggregate, never per key.
   - Expose them with the server and session counts on `GET /metrics`, on loopback only.
   - This is what ADR 0038's trigger (10 TB a month, or $100) is watched with.
   - **Built by day, 20 October 2026 (ADR 0208):** servers, servers reached, sessions, peaks and
     bytes each way for each UTC day, logged and appended to `CHIPS_RELAY_COUNTS_FILE`; not on a
     `GET /metrics`.
7. **R6, health and version.**
   - `/health` reports the release's version. It says `0.0.0` today because the bin never passes
     it.
   - Heartbeat, idle and handshake timeouts become environment variables, like the session limit.
8. **R7, a release that carries it.** `chips relay` is already in the CLI, so Phase 1's tarball
   runs it with nothing else on the box.

**Built, 9 October 2026 (ADR 0144).** R0 as written, except that no command prints a key: a
server's `GET /v1/health` names it as `relay.key`, and a server the relay turns away logs it with
`CHIPS_RELAY_ALLOW_KEYS`. The refusal is a new code, `not_allowed`, rather than `bad_proof`, which
would have said the proof was wrong. R1 as written; the session ends with the reason `too_slow`,
not `busy`, which already means a full server. R4's logging as written, with the counts logged
only when they changed; rotation is journald's seven days on the box. R6's version: `chips relay`
reports the release's on `/health`.

And on the server and client side:

9. **C1, opt in from `chips up`.**
   - "Who should be able to reach Chips?" gains a fourth answer: "Anywhere, through the Chips relay
     (end to end encrypted)". It is listed after Tailscale and the Wi-Fi.
   - It's recommended only when there is no tailnet.
   - It sets `CHIPS_RELAY_URL=wss://relay.chipschat.ai` in the service's environment.
   - Never on by default, because it sends a server's key and address to a box he runs.
10. **C2, paired devices learn the relay.** Core's link reads `relay` from `/v1/health` when it's
    on the network, and keeps it for when it's away. ADR 0039 §5 and `operate/relay.md` already
    say this happens.
11. **C3, stream bodies through the tunnel.** Fix the large-clip stall, where `link.ts:153` buffers
    a whole answer, before the relay carries media for anyone but him. **Built 12 October 2026**
    ([ADR 0152](../decisions/0152-a-large-file-through-the-relay-holds-neither-the-tunnel-nor-the-phone.md)):
    the answer streams, paced by the socket's backlog; measured with `pnpm relay:bench`.
12. **C4, wording.** ADR 0038 §2 and the distribution page say "device key" where the code matches
    by server key. The page also still lists the relay as "Not built".

## 4. Standing it up (H2): files Chips can carry, steps that are his

**The files.** These live in this repo under `packaging/relay/`. They are generic and name no
harness:

- `Caddyfile`:
  ```
  relay.chipschat.ai {
    reverse_proxy 127.0.0.1:4440
  }
  ```
  Caddy passes WebSocket upgrades through and adds `X-Forwarded-For`, which the relay trusts only
  from loopback.
- `chips-relay.service`, a systemd **system** unit:
  - a dedicated `chips-relay` user with no login shell
  - `CHIPS_RELAY_HOST=127.0.0.1`, `CHIPS_RELAY_PORT=4440`, `CHIPS_RELAY_ALLOW_KEYS=…`
  - `Restart=always`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`,
    `PrivateTmp=yes`
  - logs to the journal, with rotation per R4
- `cloud-init.yaml`:
  - creates the user
  - installs Caddy from its own apt repository
  - unpacks the release with `install.sh --from`
  - enables both units
  - firewall: 22 from his addresses only, 80/443 from anywhere, 4440 closed

**Built, 9 October 2026:** all three files and more in `packaging/relay/` — the env file is its
own (`/etc/chips-relay.env`, whose placeholder keeps the relay from starting), journald keeps
seven days, unattended upgrades are on, and the release is installed under `/opt/chips` with
`CHIPS_PREFIX`. C2 is built as written: the client reads `/v1/health` each time its socket opens
and keeps a relay it did not have. Step 3's tarball comes from the Release workflow run by hand
with `targets=linux-x64`. The README there is these steps, in full.

**12 October 2026, the box:** Hetzner's smallest US type turned out to be CPX11 at $21.09 a
month with IPv4 (Hillsboro); the cheap Cost-Optimized types are offered in Europe only. On his
call the relay starts on **Nuremberg, CX23 ($7.09)**, on the account's $25 verification credit,
and moves to the US by DNS when people rely on it (`packaging/relay/README.md`, "Moving it").
Hetzner now offers Debian 13, not 12; `cloud-init.yaml` no longer asks for `apt-transport-https`.

**His steps, in order:**

1. Make the Hetzner project and an SSH key, then create the VM with the `cloud-init.yaml`.
2. Point `relay.chipschat.ai` at it.
3. Copy the private release tarball over, because nothing is public. `scp` and
   `install.sh --from` do it.
4. Add his server's key to `CHIPS_RELAY_ALLOW_KEYS`, then restart the unit.
5. On the Mac mini, set `CHIPS_RELAY_URL=wss://relay.chipschat.ai` for 4431 (his launch agent). Do
   this on his word, with a 4431 restart.
6. The cellular walk: phone off Wi-Fi, Tailscale off, open Chips, and see it connect "through the
   relay". M4.2 has owed this since 6 September.

## 5. Proving it (H4)

- **What already runs on every change:** the relay's unit tests, the capture test, and the web and
  phone relay e2e specs (`apps/web/e2e/relay.spec.ts`, `apps/mobile/e2e/relay.spec.ts`,
  `asleep.spec.ts`).
- **New, in this repo:**
  - tests for each of R0–R6
  - a **load script** (`tools/relay-load/`) that opens N idle server and phone pairs against a
    relay and reports memory and CPU
  - a run at 1,000 pairs locally, and 10,000 against the real box before anyone else uses it
- **New, nightly:**
  - a **probe** from a GitHub runner, which is outside his network: a scratch server on the runner
    registers its key (an allowlisted test key), a tunnel client connects, and one request makes a
    round trip
  - It fails loudly when the relay is down or slow.
- **A status page:** an uptime monitor hitting `https://relay.chipschat.ai/health` every minute
  (UptimeRobot or Better Stack free tiers). It stays private while nothing else is public.

## 6. Later

- **A second region:** only once people far from Oregon use it. It needs the phone to ask the
  right relay, which the QR already carries.
- **More than one box in one region:** this needs routing by key before the first frame. The
  smallest change is a hash prefix of the server key in the URL path (`/v1/connect/<prefix>`) so a
  layer-7 balancer can stick a key to a box. It's a protocol version bump, so write an ADR first.
- **Direct connections (NAT traversal):** ADR 0038 defers it until egress passes 10 TB a month or
  the bill passes $100. R5's counters are how anyone will know.
- **Opening it to strangers:** remove the allowlist and publish the privacy note. It goes with
  making anything else public, which is his call and not now.

## 7. His calls

1. **Provider and region.** I'd use Hetzner, Hillsboro.
2. **The allowlist while private** (R0). I'd turn it on.
3. **Opt-in from `chips up`**, not default (C1). I'd make it opt-in.
4. **Log retention:** seven days of rotated logs, counts at info, key–address pairs at debug only
   (R4). I'd take that.
5. **Order:** H1 (R0–R6, C2, C3), then H2, then H4's probe and load run, then C1. I'd run H1 as one
   phase after Phase 2 of the install plan, or before it if the cellular walk matters sooner.
