# 0086. The server answers the desktop window's origin

Date: 29 September 2026
Status: Accepted. Ends "`chipsd` sends no CORS headers" for one origin; no ADR had recorded that
rule, only the notes that worked around it (the phone's web target and the Playwright suite run
behind a proxy that makes the app and the server one origin).

## Context

Chips for Mac is a WebKit window that loads the web app from inside itself, at
`tauri://localhost`, and then talks to whichever server it found and paired with. Every call it
makes is to another origin. A JSON `POST` or a signed request from another origin is preceded by
a preflight, and `chipsd` answered that with a 404 and no `Access-Control-Allow-Origin`, so
WebKit never sent the request. The app was built and installed on the Mac mini for the first time
on 29 September 2026, and pairing failed with "Pairing failed." The server never saw it. Nothing
else the app does could have worked either. A browser tab never met this because the server
serves the page it runs, and the phone's app is not a browser.

The server has no cookies. A person's device signs every request with a key that never leaves
it (ADR 0006), a harness carries a bearer token, and a player a grant in the URL. So an origin
named here gains nothing ambient: it can make the requests any program could already make.

## Decision

1. **`/v1/*` answers exactly one other origin, `tauri://localhost`**, with Hono's `cors`
   middleware, before authentication so a preflight is answered without a credential. It is
   ahead of the routes, and a refusal carries the header too, so the window can read why.
2. **Request headers are allowed as the preflight names them**, so a new signed header needs no
   change here. **Two response headers are exposed**, `x-chips-playable` and `x-chips-view`,
   the ones the client reads that are not safelisted.
3. **No other origin is named.** A page on some other site still gets no
   `Access-Control-Allow-Origin` and cannot call the server from a browser.
4. The socket is untouched: its upgrade is handled by Node's server before Hono, and a
   WebSocket is not subject to CORS.

## Consequences

- The desktop app pairs and runs against any `chipsd` from this version on. An older server
  still refuses it, with the same "Pairing failed."
- A Windows or Linux build of the shell would load from a different origin
  (`http://tauri.localhost` on Windows) and would need its own line here.
- Every `/v1` response now carries `Vary: Origin`.
