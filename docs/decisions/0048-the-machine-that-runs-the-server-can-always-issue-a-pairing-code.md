# 48. The machine that runs the server can always issue a pairing code

Date: 10 September 2026 · Status: accepted

## Context

`chips serve` pairs the machine it runs on by construction (ADR 0006, `chips serve`): whoever
started the server can read its database, so a pairing code would prove nothing, and the
machine is given a device key without one. From then on, `chips pair --issue` asks the server
for codes with that device, and every other device — the desktop app, a phone — gets in with
one of them.

That reasoning stopped one step short. The device it makes is an ordinary row in the devices
list, and a person tidying that list withdrew it (10 September 2026: the CLI, a browser and an
old phone, all at once). Nothing was wrong with that; a device is a device. But with it gone
the server's own machine could no longer mint a code for a phone at all, though the person at
it could still read every key the database holds. What was left was reading the code `chips
serve` printed at start out of a log, if fifteen minutes had not passed, or restarting the
server to make it print another — which drops every harness's socket for the sake of six
characters. The evening it cost is in `docs/STATUS.md`.

The same gap stood in the way of pairing a phone with nobody typing. `pnpm phone` can launch
the installed app with a URL for it to open, and the app can pair with what the URL carries;
what it could not do was get a code without a device of its own being trusted.

## Decision

1. **The server makes an operator token at every start** — thirty-two random bytes, the same
   strength as a device key — and writes it beside its database, in the data directory, as
   `operator.<port>.token`, owner-only in an owner-only directory. The port is in the name
   because two servers can share a data directory but not a port, and one name for both would
   let a scratch server write over the token a long-running one is still answering with. It is
   removed when the server
   stops. Being able to read the file is being able to read the workspace, and that is the
   whole of what issuing a code takes.
2. **`POST /v1/operator/pairing-code`**, with the token in `x-chips-operator`, issues a code
   for the workspace's first person — the owner, the same person `chips serve` pairs its own
   machine as. The token is compared in constant time, a wrong one counts against the address
   like a wrong pairing code, and the answer has the shape `POST /v1/pairing-codes` answers
   with, so a QR is built the same way from either. The route is registered whenever the server
   issues codes at all; it does not depend on dev mode or on how the server is bound, because
   the token, not the network, is the credential.
3. **`chips pair --issue` tries the device first and the token second.** A person asking as
   themselves is the ordinary case and stays so. When the device is turned away, or there never
   was one, and a token is where this machine's configuration says the server keeps its data,
   the code comes from the server itself, and the output says so in one line. A machine with
   neither is told what it always was: pair it, or run the server.
4. **The token is not a device.** It appears in no list, cannot be withdrawn from one, and
   speaks for nobody: it issues codes, and nothing else. Withdrawing the CLI's device still
   means what it meant. A server whose data directory cannot be written still serves; it warns,
   and can only be asked by a device it trusts.

## Consequences

- `pnpm phone connect` pairs a plugged-in phone with nobody typing: it issues a code from the
  server's machine, launches the app with `chips://pair?…`, and reads "device paired" off the
  server's log. No restart, no log-reading for a code, no browser.
- The dev-mode `POST /v1/dev/pairing-code` stays what it was — a laptop convenience with no
  credential, only on loopback. It is not replaced, because its point is needing nothing.
- The data directory now holds one more secret. It already held every device's public key and
  every token's digest, and the file's permissions are the database's; `docs` list it beside
  them.
- A server started from before this ADR leaves no token. `pnpm phone doctor` says so and what
  a restart brings.
