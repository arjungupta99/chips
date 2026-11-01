# 0028. chipsd serves the page, and the machine that serves it is paired

5 September 2026 · Status: accepted

Decided while writing Start here for a cold read (M2.6): the page could not be written honestly
against what `chips serve` did.

## Context

`chips serve` printed a QR encoding `http://<this machine>:4431/#pair=<code>` — the address a
phone's camera would open — and nothing was there: chipsd served the API and answered `/` with
an error envelope. The web app was reachable only through Vite's dev server on 5173, and the
pairing screen's reading of `#pair=` in the URL had no page to run in. The desktop app is the
same page in a window, and every request it makes is relative, which only works when the page
and the API share an origin.

Two more things stood between a reader and a second device. A pairing code is single use, and
outside dev mode nothing could issue another: the browser and the CLI could not both pair
without restarting the server, and a server under launchd hid its one code in a log. And the
CLI on the server's own machine — the one `chips connect` is run on — had to pair itself with a
code the server printed to the same terminal, which proves nothing to anyone.

## Decision

1. **`/` is the web app.** chipsd serves the build Vite makes — `index.html`, hashed files under
   `assets/` cached for a year — from `CHIPS_WEB_DIR`, defaulting to the repository's own
   `apps/web/dist`; any path that names no file gets `index.html`, so a link into a space opens
   the app; nothing outside the directory is ever served; the page is sent with
   `X-Frame-Options: DENY` and `nosniff`. With no build there, `/` is a sentence saying so and
   what to run. The API is untouched: an unknown `/v1` path is still `not_found`.
2. **The machine that runs `chips serve` is paired by construction.** Whoever started the server
   can read its database, so a code would prove nothing; and it is this machine `chips connect`
   and `chips pair --issue` are about to be run on. A device key already there — for this server
   or another — is left alone.
3. **A paired person issues the next code.** `POST /v1/pairing-codes`, for a person's device
   only, mints a code for that person; `chips pair --issue` prints it and a QR. A harness's
   token gets `forbidden`: a token is not a person, and a harness that could pair devices could
   make itself one.
4. **The network address is offered only when the server is bound to it.** `serve` prints the
   LAN address and puts it in the QR when `CHIPS_HOST` is not loopback, and otherwise says that
   only this machine can reach it and how to change that.

## Consequences

- Start here is five commands and one page, and the QR is true. `pnpm web:build` is a step in
  the install, and the page says so when it is missing.
- One origin for the page and the API, on a Mac mini and on a laptop alike; the desktop app's
  relative requests and the browser's are the same requests.
- The served page carries no Content-Security-Policy yet. The build inlines nothing that would
  need an exception, but a policy is a Gate 2 item under local install security, not something
  to guess at here.
- The app has no *Pair another device* screen; the CLI has the command. The screen is owed.
- `lanUrl` takes the first non-internal IPv4 address the machine has, which on a laptop with a
  VPN can be the VPN's; a preference for private ranges is a small follow-up.
  *Both are done, 8 September 2026.* The address is `reachableUrl` in `@chipschat/platform`, it
  prefers a private range, and it is what `POST /v1/pairing-codes` answers — so the *Pair another
  device* screen the app has since grown draws a QR the server addressed rather than one built
  from the origin the page happened to load from. `CHIPS_PUBLIC_URL` overrides it, which is the
  answer for a phone that reaches the machine only over a tailnet.
