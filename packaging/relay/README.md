# The hosted relay's box

What runs `relay.chipschat.ai`: one small Debian VM, `chips relay` from a release as a systemd
service on loopback, and Caddy in front for TLS. Why it is shaped this way is in
[the hosted relay plan](../../docs/proposals/hosted-relay-plan.md) and
[ADR 0144](../../docs/decisions/0144-the-hosted-relay-serves-a-list-of-servers.md); how a relay
works is in [operate/relay](../../apps/docs/src/content/docs/operate/relay.md).

| File | On the box | What it is |
| --- | --- | --- |
| `cloud-init.yaml` | — | The VM from nothing: the relay's user, Caddy, the files below, the firewall. Paste it as the server's user data. |
| `chips-relay.service` | `/etc/systemd/system/` | The relay as `chips-relay`, on `127.0.0.1:4440`, locked down, restarted if it stops. Its one writable place is `/var/lib/chips-relay/`, for the day's counts. |
| `chips-relay.env` | `/etc/chips-relay.env` | The servers it serves (`CHIPS_RELAY_ALLOW_KEYS`), and the Chips app's Expo access token for the push door (`CHIPS_PUSH_ACCESS_TOKEN`, [ADR 0246](../../docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)). Root reads it alone. Its placeholder keeps the relay from starting. |
| `Caddyfile` | `/etc/caddy/Caddyfile` | `relay.chipschat.ai` to the relay, with a certificate from Let's Encrypt and no access log. |
| `journald.conf` | `/etc/systemd/journald.conf.d/chips-relay.conf` | Logs kept seven days, as [the relay's terms](../../apps/docs/src/content/docs/operate/relay-terms.md) say. |

`cloud-init.yaml` carries copies of the other four; `relay/src/box.test.ts` fails when they drift
apart, so change a file and its copy together.

## Standing it up

Steps 1–2 and 6 are done in the Hetzner and DNS dashboards, step 3 on the Mac, 4–5 on the box.

1. **The VM.** In a Hetzner Cloud project, with your SSH key added:
   - Location and type. Hetzner's cheap "Cost-Optimized" types are in Europe only: **Nuremberg,
     CX23** (x86, not Arm) was $7.09 a month with IPv4 on 12 October 2026. Its smallest US type,
     **Hillsboro, CPX11**, was $21.09. Europe adds about 0.3 s to a relayed request from the US;
     the relay moves by DNS alone (see "Moving it" below), so start cheap and move when people
     rely on it.
   - Image **Debian 13** (or 12 where offered).
   - A **firewall** on it: inbound TCP 22 from your own address only, TCP 80 and 443 from
     anywhere, nothing else. (The box's own `ufw` allows 22 from anywhere; this narrows it.)
   - **Cloud config:** paste `cloud-init.yaml`.
   - When it is up, `ssh root@<its address>` and wait for `cloud-init status --wait` to say `done`.
2. **The name.** At the registrar for chipschat.ai: an `A` record `relay` → the VM's IPv4 address,
   and an `AAAA` record → its IPv6 address. Caddy asks Let's Encrypt for the certificate once the
   name resolves; `journalctl -u caddy` says when it has one.
3. **The release.** Nothing is public, so the tarball comes from a run of the Release workflow,
   by hand, for Linux x64 alone:

   ```sh
   gh workflow run release.yml -f targets=linux-x64
   gh run list --workflow release.yml --limit 1        # wait for it to pass
   gh run download <run id> -n chips-linux-x64 -D /tmp/chips-relay
   scp /tmp/chips-relay/chips-*-linux-x64.tar.gz packaging/install.sh root@relay.chipschat.ai:
   ```

4. **Install it** on the box, under `/opt/chips` where the unit looks:

   ```sh
   CHIPS_PREFIX=/opt/chips sh install.sh --from ./chips-*-linux-x64.tar.gz --no-path
   /opt/chips/bin/chips --version
   ```

5. **Name your servers and start it.** Each server's relay key is `relay.key` in its
   `GET /v1/health` once it has `CHIPS_RELAY_URL` set, asked on that server's own machine
   (`curl -s http://127.0.0.1:4431/v1/health`), and its log names it when this relay turns it away.
   Put the keys in `/etc/chips-relay.env`, comma-separated, then:

   ```sh
   systemctl start chips-relay
   journalctl -u chips-relay -n 20       # "chips-relay listening", allowKeys: 1
   curl -s https://relay.chipschat.ai/health
   ```

6. **A monitor.** An uptime check on `https://relay.chipschat.ai/health` every minute (UptimeRobot
   or Better Stack, free tier), private while nothing else is public.

## Without a release

When the Release workflow cannot run (GitHub Actions refused every job from 10 October 2026, on
billing), steps 3–4 are done with the relay alone. It is one JavaScript file with no natives, built
on any checkout, and run by Node from nodejs.org:

1. On a checkout, `pnpm release:relay` writes `dist/release/chips-relay-<version>+<commit>.mjs` and
   prints its SHA-256. Copy it to the box as `/opt/chips/lib/chips-relay.mjs`.
2. On the box, Node (the version in `.node-version`), checked against nodejs.org's own sums:

   ```sh
   v=22.23.4 && cd /tmp
   curl -fsSLO "https://nodejs.org/dist/v$v/node-v$v-linux-x64.tar.gz"
   curl -fsSL "https://nodejs.org/dist/v$v/SHASUMS256.txt" | grep " node-v$v-linux-x64.tar.gz\$" | sha256sum -c -
   mkdir -p /opt/chips/node /opt/chips/lib /opt/chips/bin
   tar -xzf "node-v$v-linux-x64.tar.gz" -C /opt/chips/node --strip-components=1
   ```

3. `/opt/chips/bin/chips`, mode 755, so the unit's `chips relay` runs it:

   ```sh
   #!/bin/sh
   # The relay alone, until a release is installed here: `chips relay` and nothing else.
   [ "$1" = relay ] || { echo "This chips runs the relay only." >&2; exit 2; }
   exec /opt/chips/node/bin/node /opt/chips/lib/chips-relay.mjs
   ```

A release installed later with `CHIPS_PREFIX=/opt/chips` puts its own `bin/chips` link in place
of this one; `/opt/chips/node` and `/opt/chips/lib/chips-relay.mjs` can go then. A new build is
step 1 again and `systemctl restart chips-relay`; `/health` says which commit is running.

## Afterwards

- **A new server:** add its key to `/etc/chips-relay.env`, `systemctl restart chips-relay`. A
  restart drops every session; servers dial again within a second and phones reconnect.
- **A new release:** steps 3 and 4 again, then `systemctl restart chips-relay`. The install keeps
  the old version beside the new one under `/opt/chips/lib/chips/`.
- **Moving it** to another location or provider: lower the DNS records' TTL to 5 minutes a day
  ahead; stand up the new box (steps 1, 3–5, with the same `/etc/chips-relay.env`); point
  `relay.chipschat.ai` at it; after the TTL, `systemctl stop chips-relay` on the old box so every
  server dials again and lands on the new one (with both running, a phone on the new box could be
  told its server is asleep while the server is still on the old one); then delete the old box and
  its IPv4. Nothing on a server or a phone changes: they know the relay by its name, and it keeps
  no state.
- **What it logs:** at info, how many servers and sessions there are, once a minute when that
  changes, and a server it turned away by its key. Which server talked to which phone from where
  is at debug, which is off. `CHIPS_LOG_LEVEL=debug` in the env file turns it on while you look.
- **What it counts** ([ADR 0208](../../docs/decisions/0208-the-relay-counts-each-day-and-chips-says-what-it-counts.md)):
  a line for each UTC day in `/var/lib/chips-relay/counts.jsonl`, kept until you delete it. It
  has the servers listed that day, the servers a phone came through to (`reached`), the sessions
  opened, the most of each at once, and the bytes each way. It has no key and no address. A
  restart writes the day so far and starts a new line, so a day can have two; its servers are at
  least the larger of the two. A day tells 100,000 servers apart at most, and one that saw more
  says `"at_least": ["servers"]` (a relay with a list never does). To read the last month:

  ```sh
  ssh root@relay.chipschat.ai tail -n 31 /var/lib/chips-relay/counts.jsonl
  ```

- **A unit changed in the repo** (as ADR 0208's did): copy it to `/etc/systemd/system/`, then
  `systemctl daemon-reload && systemctl restart chips-relay`. `cloud-init.yaml` only runs on a
  new box.
