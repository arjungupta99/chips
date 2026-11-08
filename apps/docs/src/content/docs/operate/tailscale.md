---
title: Tailscale
description: Your server on your tailnet, over HTTPS. A browser pairs from any of your devices and a passkey works away from the mini. For a phone it is an optional direct path beside the relay.
---

[Tailscale](https://tailscale.com) puts your devices on one private network, a *tailnet*, wherever
each of them is. A Mac mini on it has an address, `100.x.y.z`, that your phone reaches on
cellular as well as on the sofa, with nothing forwarded on your router.

A phone does not need Tailscale to reach Chips away from home. [The relay](/operate/relay/) does
that, once it's turned on, with nothing on the phone. Tailscale is for when you want a direct path
to the mini, and HTTPS for your browsers.

The plain address, `http://100.x.y.z:4431`, is enough for the apps. It is not enough for a
browser, which makes a device key or a passkey only on a secure address: `localhost`, or
`https://`. So a browser on your laptop could pair with the mini only from the mini itself.
**Tailscale Serve** fixes that. It puts HTTPS in front of the server, under a name like
`https://mac-mini.your-tailnet.ts.net`, with a certificate Tailscale gets and renews for you.
Only devices on your tailnet can reach that name.

By the end of this page:

- The server answers at an `https://` name on your tailnet.
- Pairing codes and QR codes carry that name.
- A browser on any of your devices pairs with a code.
- A passkey made there works from all of them.
- A browser there records voice notes.

## Before you start

- **The server runs.** Set it up as on [a Mac mini](/operate/mac-mini/), with
  `chips up --reach tailnet`, on port 4431.
- **Tailscale is on the mini and on every device you will use**, all signed in to the same
  tailnet.
- **MagicDNS is on.** It is by default: the admin console, **DNS**.
- **HTTPS certificates are on.** In the admin console, go to **DNS**, then **HTTPS Certificates**,
  then **Enable**. Rename the machine first if you want to: its name becomes part of the address,
  and every certificate issued for it is recorded in public Certificate Transparency logs.

## Put HTTPS in front of the server

On the mini:

```sh
tailscale serve --bg 4431
```

It answers with the name, and what that name forwards to:

```
Available within your tailnet:

https://mac-mini.your-tailnet.ts.net/
|-- proxy http://127.0.0.1:4431
```

`--bg` keeps it after the command exits, and after a restart. The first request can take a few
seconds while Tailscale gets the certificate. Check it from any device on the tailnet:

```sh
curl https://mac-mini.your-tailnet.ts.net/v1/health
```

`tailscale serve status` shows what is served. `tailscale serve --https=443 off` takes it away
again.

This is **Serve**, not **Funnel**. Funnel would put the same server on the public internet, which
is a different decision. [Your own domain](/operate/own-domain/) says what that decision opens.

:::note[Two Tailscales on one Mac]
The Mac app has its own command, `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. A
Homebrew `tailscale` installed as well talks to the same service, and warns when their versions
differ. Use the app's command, or bring the Homebrew one up to date.
:::

## Tell the server its name

The server needs to know the address it is reached at, so that what it hands out carries that
address. That is `CHIPS_PUBLIC_URL`. Export it and run `chips up` again:

```sh
CHIPS_PUBLIC_URL=https://mac-mini.your-tailnet.ts.net chips up --reach tailnet
```

`chips up` writes the name into the service and starts it again, keeping the other settings the
service already had. An exported `CHIPS_PUBLIC_URL` wins over the address `--reach` would pick. It
works the same on Linux, where the service is a systemd user unit.

The log says it as the server starts, on the first line of the box: *address
https://mac-mini.your-tailnet.ts.net*. From then on that name is in:

- the pairing codes `chips pair --issue` prints, and their QR codes;
- invite links;
- the addresses a passkey may be made and used from;
- the signed URLs a harness on another machine is given for attachments. So that harness must
  reach the name too: put its machine on the tailnet. A harness on the mini itself is given the
  address it connected at, such as `http://127.0.0.1:4431`, so it fetches files with Tailscale down.

## Pair a browser

On the mini, issue a code:

```sh
chips pair --issue
```

On the other device, open the `https://` name, and type the code. It is good for fifteen minutes,
once.

A browser's device key belongs to the address it paired at. A tab you already paired at
`http://100.x.y.z:4431` stays paired there, and the `https://` name is a new pairing: one more
device under **You → Devices**.

Once a browser is paired at the `https://` name, **You → Passkeys → Add a passkey** works there.
The passkey then signs you in at that name on any device on the tailnet that has it: synced by
your platform, or offered from your phone. On the plain address, passkeys work only on the mini
itself. See [People](/operate/people/#passkeys).

**Voice note** works at the `https://` name too, for the same reason: a browser gives the
microphone only to a secure address. See
[voice notes](/operate/desktop/#voice-notes).

## A phone

A phone reaches Chips from anywhere through [the relay](/operate/relay/), with Tailscale or
without it. The tailnet is a direct path beside the relay. With the Tailscale app connected on the
phone, the `https://` name works at home and away without the relay. A phone already paired to the
plain address keeps working with it. Pair it again, from a QR the server issued after the change,
and it holds the `https://` name instead. The name reaches the server only through Tailscale. With
Tailscale off, a phone paired to the name falls back to the relay when it is on, and otherwise
waits for Tailscale.

## What the server sees

Tailscale Serve connects to the server from `127.0.0.1`, and says who asked in headers it writes
itself:

| Header | What it holds |
| --- | --- |
| `X-Forwarded-For` | The asking device's tailnet address. Serve writes it, replacing any the device sent. |
| `X-Forwarded-Proto` | `https` |
| `Tailscale-User-Login`, `Tailscale-User-Name` | The tailnet account the device is signed in as |

Chips reads one of them. A request from loopback is counted by its `X-Forwarded-For` for the
limit on wrong answers: five wrong pairing codes, invites, passkey sign-ins or operator tokens a
minute from one device, then a minute's wait. Without it, every device behind Serve would be one
address, and one device's typos would lock out the rest. From any peer but loopback the header is
only the caller's own claim, and is not read.

A device counts as its own tailnet address, whether Serve writes its `100.x.y.z` or its IPv6
address in `fd7a:115c:a1e0::/48`. Anywhere else an IPv6 address counts as its /64, but a whole
tailnet shares one /64, so that rule would make every device one. When 30 wrong pairing codes
arrive in a minute from every device together, each is allowed one a minute until they slow down,
as on [your own domain](/operate/own-domain/#what-the-internet-can-reach).

Nobody is signed in by their Tailscale account. Being on the tailnet gets a device as far as the
pairing screen; a device key or a harness token is still what gets it in.

Anything else on the mini that sends requests to port 4431 from loopback is believed about who
asked, the same way. So run no proxy in front of Chips on the mini but one you chose, as for
[your own domain](/operate/own-domain/), and no program there you would not trust to count its own
wrong answers.

## The plain port stays open

The server still answers on `http://` at port 4431, on your home network and on the tailnet. The
desktop app finds it there by itself, and a phone paired to the plain address uses it. Keep it
bound to every address, as `chips up --reach tailnet` does: a server bound to loopback with dev
mode on would put the dev routes, which hand out pairing codes to anyone who asks, behind Serve.

## When it does not work

- **`tailscale serve` says HTTPS is not enabled**: turn on HTTPS certificates in the admin
  console.
- **The name does not resolve on a device**: that device is not connected to the tailnet, or
  MagicDNS is off.
- **Pairing codes carry the plain address, not the `https://` name**: the service has no
  `CHIPS_PUBLIC_URL`. Run `chips up` again with it exported, as above.
- **The `https://` name does not answer**: Serve is not running in front of port 4431.
  `tailscale serve status` says what it serves.
- **The page asks for a code on a browser you already paired**: it paired at the other address.
  Pair it once at this one.
- **A harness cannot fetch an attachment**: its signed URL carries the `https://` name, and the
  harness is not on the tailnet. Put its machine on the tailnet, or run it on the mini, where it
  connects at `127.0.0.1` and is given that address.
