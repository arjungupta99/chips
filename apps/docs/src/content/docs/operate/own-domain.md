---
title: Your own domain
description: Your server at a name you own, like chips.example.com, over HTTPS from anywhere. What that puts on the internet, the two ways to do it, and what the server needs told.
---

[The relay](/operate/relay/) and [Tailscale](/operate/tailscale/) both reach your server without
putting it on the internet. Your own domain does put it there. `https://chips.example.com`
answers any browser, on any network, with nothing installed on the device, and a phone paired to
it reaches it at home and away with no relay. That is the reason to do it. The cost is that the
pairing screen is on the internet too, for anyone to find.

| | Who can reach it | Who can read what crosses | What it takes |
| --- | --- | --- | --- |
| [Tailscale](/operate/tailscale/) | Your devices, on your tailnet | You | Tailscale on every device |
| [The relay](/operate/relay/) | A phone with the server's QR | You: the relay forwards ciphertext | A relay somewhere public |
| Your domain, [Caddy](#with-caddy-on-the-mac) | Anyone | You: TLS ends on your Mac | A public address and two ports forwarded |
| Your domain, [Cloudflare Tunnel](#with-cloudflare-tunnel) | Anyone | You and Cloudflare | The domain's DNS on Cloudflare |

By the end of this page:

- The server answers at `https://chips.example.com`.
- Pairing codes, invites, passkeys and attachment links carry that name.
- A browser anywhere pairs with a code, and a passkey made there works from any of your devices.

## Before you start

- **The server runs**, as `chips up` starts it on [a Mac mini](/operate/mac-mini/), on port 4431.
- **Dev mode is off.** `CHIPS_DEV_MODE` is unset, or `false`. Dev mode serves a route that hands a
  pairing code to anyone who asks, and it is registered only while the server is bound to
  loopback. A proxy on the same Mac reaches loopback, so behind one that route would be on the
  internet.
- **A domain whose DNS you can change.** This page uses `chips.example.com`.
- **Port 4431 is not forwarded on your router.** The proxy is the one door from the internet.

## What the internet can reach

Everything but a handful of routes needs a device key, a harness token, or a signed attachment
link. The ones that do not:

- `GET /v1/health`, which says the server is up and nothing a stranger could not guess;
- `POST /v1/pair`, with a pairing code;
- an invite's peek and redeem, with an invite's token;
- a passkey's sign-in;
- `POST /v1/operator/pairing-code`, with the token the server writes beside its database
  ([ADR 0048](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0048-the-machine-that-runs-the-server-can-always-issue-a-pairing-code.md));
- the web app's own pages.

An invite and the operator token are 256-bit secrets. A pairing code is shorter: one of about a
billion, good for fifteen minutes and one use. After five wrong answers in a minute from one
address, at any one of those doors, that address waits a minute. Answers sent all at once count
as they arrive, not as they come back wrong.

What one address is:

- **An IPv4 address is itself.** Everyone behind one home router shares its five a minute.
- **An IPv6 address counts as its /64**, the block a home line or a rented server is given.
  Counted one by one, a single machine could step through its block and never wait.

When 30 wrong pairing codes arrive in a minute from every address together, each address is
allowed one wrong code a minute instead of five, until they slow down. Nobody is locked out. The
first code from any address is always checked, so a code typed right still pairs, and a typo costs
a minute. The server's log says *wrong pairing codes from many addresses* when this starts.

Somebody with many addresses still gets more guesses. So issue a code when you are about to use
it, rather than leaving one open. `chips serve` issues one each time it starts, good for fifteen
minutes.
[ADR 0056](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0056-wrong-answers-are-counted-by-the-64-as-they-arrive-and-a-guess-from-everywhere-slows-everyone.md)
says what a guess is worth.

## Choose how the internet reaches the Mac

There are two ways below, and either way the proxy runs **on the Mac with the server**. The server
counts wrong answers by the address the proxy says a request came from, and it believes that only
from a proxy on loopback. A proxy on another machine works, but every device then counts as that
machine: one person's typos make everyone wait a minute.

Tailscale Funnel is not a third way. It serves only names under your tailnet's `ts.net` domain,
never your own.

### With Caddy on the Mac

[Caddy](https://caddyserver.com) answers for your name on ports 80 and 443, gets a certificate
from Let's Encrypt and renews it, and passes each request to the server. TLS ends on your Mac, so
nothing between a device and the Mac can read what crosses.

The internet has to reach the Mac:

- **A public address.** Compare the internet address your router shows with the one a
  what's-my-IP page shows. If they differ, your provider shares one address among many customers,
  and nothing can be forwarded to you. Use [Cloudflare Tunnel](#with-cloudflare-tunnel).
- **Ports 80 and 443, forwarded on the router to the Mac.** Let's Encrypt checks the name on one
  of them before it issues a certificate. Caddy sends port 80 on to 443.
- **A DNS record** for `chips.example.com`: type `A`, with your public address, and `AAAA` too if
  you have an IPv6 one. If your provider changes the address from time to time, keep the record up
  to date with your DNS host's dynamic DNS.

Install Caddy:

```sh
brew install caddy
```

Write `$(brew --prefix)/etc/Caddyfile`, which is `/opt/homebrew/etc/Caddyfile` on Apple silicon.
The closing brace goes on its own line:

```
chips.example.com {
	reverse_proxy 127.0.0.1:4431
}
```

Start it, and it starts again at login:

```sh
brew services start caddy
```

Check it from a phone on cellular, off your Wi-Fi, at `https://chips.example.com/v1/health`.

Caddy passes WebSockets through with nothing configured. It sets no timeout on a response and no
limit on an upload's size, so the slow requests under [Harnesses](#harnesses) are safe. Reloading
its configuration closes the sockets open through it, and the apps and harnesses reconnect.

### With Cloudflare Tunnel

`cloudflared` on the Mac dials out to Cloudflare and holds that connection open. Cloudflare answers
for your name and sends each request down it. Nothing is forwarded on the router and the Mac needs
no public address, so this works when your provider shares one address among many customers.

What it costs:

- **Cloudflare can read everything that crosses.** It ends TLS at its own edge, so messages,
  attachments and pairing codes are readable there, and so is the token of a harness that
  connects through the domain. A device's key never crosses: it signs each request, and only the
  signature is sent. A harness on the Mac, talking to `127.0.0.1`, goes through Cloudflare only to
  fetch an attachment, whose link carries the domain.
- **The domain's DNS is on Cloudflare**, in the same account as the tunnel.
- **Limits.** An upload through Cloudflare is at most 100 MB on the Free and Pro plans. The phone
  and the desktop send uploads in 4 MB pieces, so this limits only a harness sending a whole file.
  Cloudflare gives up on a response after 125 seconds, with error 524. See the slow requests under
  [Harnesses](#harnesses).
- **WebSockets must be on** in the zone's network settings. Anything that answers a request with a
  challenge page, such as a bot or security rule, stops the apps and harnesses, which cannot solve
  one.

Install `cloudflared`, sign in, and make a tunnel with a DNS record for the name:

```sh
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create chips
cloudflared tunnel route dns chips chips.example.com
```

`create` prints the tunnel's id and writes its credentials to `~/.cloudflared/`. Write
`~/.cloudflared/config.yml`. The last rule catches every other name:

```yaml
tunnel: <the tunnel's id>
credentials-file: /Users/<you>/.cloudflared/<the tunnel's id>.json
ingress:
  - hostname: chips.example.com
    service: http://127.0.0.1:4431
  - service: http_status:404
```

Run it once in a terminal to check it, with `cloudflared tunnel run chips`, then install it as a
launch agent, which reads the same folder and starts at login:

```sh
cloudflared service install
```

The Mac needs to reach Cloudflare outbound on port 7844. Cloudflare's dashboard can make the same
tunnel instead, under **Networking → Tunnels**, with `http://127.0.0.1:4431` as the service.

## Tell the server its name

The server needs to know the address it is reached at, so that what it hands out carries it. That
is `CHIPS_PUBLIC_URL`. Export it and run `chips up` again:

```sh
CHIPS_PUBLIC_URL=https://chips.example.com chips up --reach local
```

`--reach local` keeps port 4431 to this Mac, so the proxy is the one door from outside; `--reach
lan` lets your Wi-Fi in directly as well. `chips up` writes the name into the service and starts it
again, keeping the other settings the service already had, and an exported `CHIPS_PUBLIC_URL` wins
over the address `--reach` would pick. It works the same on Linux, where the service is a systemd
user unit.

The log says it as the server starts, on the first line of the box: *address
https://chips.example.com*. From then on that name is in:

- the pairing codes `chips pair --issue` prints, and their QR codes;
- invite links made where no browser said its own address;
- the addresses a passkey may be made and used from;
- the signed links a harness is given for attachments.

A server has one public address. If it was at a Tailscale name before, that name reaches it for
as long as Serve runs, and devices paired there keep working. But a passkey belongs to the name it
was made at, and the server now allows only the new one. To keep signing in at the old name as
well, name it beside the new one:

```sh
CHIPS_PUBLIC_URL=https://chips.example.com \
  CHIPS_PASSKEY_ORIGINS=https://mac-mini.your-tailnet.ts.net chips up --reach local
```

## Pair a browser, and a phone

On the Mac, issue a code:

```sh
chips pair --issue
```

On the other device, open `https://chips.example.com` and type the code. A browser's device key
belongs to the address it paired at, so a browser paired at another address pairs once more here.
Then **You → Passkeys → Add a passkey** makes a passkey for this name. See
[People](/operate/people/#passkeys).

A phone that scans a QR issued after the change holds the domain, and reaches it on any network,
with no relay. A phone that holds a relay as well tries the domain first, and the domain always
answers, so the relay is no longer used. That matters with Cloudflare Tunnel, which can read what
the phone sends. [The relay](/operate/relay/) could not: it carries a tunnel between the phone
and the server that it cannot open.

## Harnesses

A harness on the Mac keeps talking to `http://127.0.0.1:4431`. Nothing about it changes, except
the attachment links it is given, which now carry the domain. So it must reach the domain from
the Mac: see [when it does not work](#when-it-does-not-work) if it cannot.

Two requests are slow on purpose, and a proxy that gives up early cuts them off:

- **A hook's wait for an approval**, `GET /v1/approvals/:id/wait?timeout=`, holds the request
  open for as long as it asks, up to fifteen minutes. A harness elsewhere, reaching the server
  through a proxy with a shorter limit, should ask for less, and ask again.
- **The last piece of a voice note** is answered after whisper has written it down, and whisper is
  given up to two and a half minutes. On a Mac mini it takes seconds, but a slow machine and a long
  note can take longer than a proxy allows.

## What the server sees

A proxy on the Mac connects to the server from `127.0.0.1`. The server reads one header from it,
`X-Forwarded-For`, and only its last entry, which is the one the proxy wrote. Entries before it
are whatever the caller sent. Both ways on this page write it so that the last entry is the
visitor's:

- **Caddy** sets the header to the address that connected to it, and drops one the caller sent.
- **Cloudflare** adds the address that connected to its edge at the end of whatever the caller
  sent, and `cloudflared` passes the header on.

Nothing else about the request is taken on the proxy's word. Nobody is signed in by where they
came from: a device key, a harness token or a signed link is still what gets them in.

## Taking it off the internet

Stop Caddy with `brew services stop caddy` and close the two ports on the router, or delete the
tunnel in Cloudflare's dashboard. Then run `chips up` again with `CHIPS_PUBLIC_URL` set to the
address you use now. A device paired at the domain cannot reach the server any more, and pairs
again at an address it can.

## When it does not work

- **Caddy cannot get a certificate**: the name does not point at your public address yet, or port 80
  or 443 does not reach the Mac. Caddy's log, `$(brew --prefix)/var/log/caddy.log`, says which
  check failed.
- **With Caddy, the name works from a phone on cellular, but not from the Mac or your Wi-Fi**: your
  router does not send its own public address back inside, and a harness on the Mac needs that to
  fetch attachments. On the Mac, the line `127.0.0.1 chips.example.com` in `/etc/hosts` sends the
  name straight to Caddy there. Your router's DNS may do the same for the rest of the house.
- **Error 524 from Cloudflare**: a response took longer than 125 seconds. Ask a hook's wait for
  less.
- **Error 413 from Cloudflare**: a whole upload over 100 MB. Send it in pieces, as the apps do
  ([the HTTP reference](/reference/http/)).
- **The apps connect and then keep dropping, through Cloudflare**: WebSockets are off for the zone.
- **Every request is refused, and the server's log says *authentication refused***: something
  between the device and the server changed the path or the query. A device signs the request
  exactly as it sent it, so turn off any rewriting of URLs on the way to the server.
- **`curl https://chips.example.com/v1/health` does not answer**: the proxy is not running, or the
  name does not point at it yet.
- **A passkey is not offered**: it was made at another name. Make one here, or add that name to
  `CHIPS_PASSKEY_ORIGINS`.
- **Everyone is told to wait a minute after one person's wrong code**: the proxy is on another
  machine, so every request comes from one address. Run it on the Mac with the server.
