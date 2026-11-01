# 0121. `chips up` is the first run, and the browser it opens pairs itself

Date: 5 October 2026
Status: Accepted, 5 October 2026. Phase 1 of `docs/proposals/install-onboarding-plan.md` (§3.1).
Builds on ADR 0028 (chipsd serves the page and pairs its machine) and ADR 0048 (the operator
token).

## Context

`chips serve` makes a workspace, prints a code and a QR, and pairs the CLI. A person then opens a
browser, types the code, and for a phone sets `CHIPS_HOST` and `CHIPS_PUBLIC_URL` by hand and keeps
the terminal open. The checkout's `tools/chips/chips` front door and `pnpm phone server` already did
the rest — a launch agent, a browser, a tailnet address — for one machine, his.

## Decision

1. **`chips up` asks one question, only when it has to: who can reach Chips?** Your devices over
   Tailscale (offered first, when `tailscale ip -4` answers), devices on this Wi-Fi, or only this
   machine. `--reach tailnet|lan|local` answers it; `--yes` takes the first; with nobody to ask it is
   only this machine. The first two bind every address, and the line says so.
2. **It runs as a login service** when it is a release on a Mac (a launch agent,
   `chat.chips.serve`) or on Linux (a systemd user unit), with the workspace, host, port and public
   address written into it. From a checkout, or with `--no-service`, it runs in the terminal.
3. **A service it did not write is left alone.** Its files say "Written by chips up"; a launch agent
   with the same label and without those words — a checkout's, `pnpm phone server`'s — is not
   replaced, stopped or removed, and `chips up` says how to run beside it.
4. **The browser on this machine pairs itself.** `chips up` opens `http://127.0.0.1:<port>/#pair=<code>`
   with a fresh single-use code; the page sends it at once and takes the fragment out of the address
   and the history as it reads it. The plan proposed accepting such a code only from loopback; it
   is not needed: the code is single-use, expires in fifteen minutes, is spent by the time anything
   else could read it, and never reaches a server log in a fragment.
5. **The phone gets a QR** of the app's link (`chips://pair?…`), addressed to the chosen tailnet or
   home-network address, and none when only this machine can reach Chips.
6. **Run again it only opens the browser and shows the QR**, asking nothing and writing nothing,
   unless `--reach` is given and the service is its own, which rewrites it.
7. **`chips down`** stops its own service and keeps it from starting at login; **`chips uninstall`**
   removes the service, the install and the link, and the workspace only on a separate yes or
   `--remove-data`.
8. **`chips up --json`** prints one line — `url`, `pair_link`, `phone_link`, `data_dir`, `log_file`,
   `service`, `reach`, `already_running`, `created` — and nothing else on stdout.
9. **A server bound to loopback does not advertise itself over mDNS**: nothing else could reach it.
10. **`chips doctor` checks this machine too**: which chips on which Node, whether a server answers
    here, whether it has its page, who can reach it, and whether each harness is connected now.

## Consequences

- From a release: `install.sh`, then `chips up`, then a paired browser — two commands and one
  question. Journeys J1, J5 and J6 (`apps/web/journeys/`) walk exactly that on the built tarball, in
  a fresh home with no Node on the PATH, and time it.
- On his Mac mini `chips up` from a release, with 4431 running, only opens a browser and shows a
  code; with 4431 stopped it refuses to touch his launch agent. His setup is not migrated.
- Linux user services stop at logout unless lingering is on (`loginctl enable-linger`); `chips up`
  does not change that system setting.
- Only the plan of what `chips up` does is pure and tested (`planUp`); launchd and systemd are run
  for real only on a person's machine, never by a test.

## Addendum, 20 October 2026: a relay reaches a phone from anywhere

Decision 5 said there is no QR when only this machine can reach Chips. That predates the relay as
the way a phone gets in from away (ADRs 0038, 0144 and 0191). A server with `CHIPS_RELAY_URL` set
dials out to the relay whatever it is bound to, and a QR that carries the relay and the server's
key pairs a phone from anywhere. The web's first-run card already drew that QR (`FirstRun.tsx`).

So `chips up` shows the phone's QR whenever the server it asked for a code names a relay, and says
the phone reaches Chips from anywhere, through the relay. The question is now who reaches Chips
directly: with a relay, the last answer reads "Only this machine, and phones through the relay",
and its line "Reachable directly from this machine only". Without a relay and with only this
machine, there is still no QR, and the line names the relay first and `--reach lan` second.

`chips doctor`'s reach check (decision 10) reads the relay from the server's `GET /v1/health` too.
A server connected to its relay is reachable from anywhere, and the check passes. A relay it is set
to use and is not connected to is a warning, however else it is reached, since a phone away from
home has no other way in. With no relay and only this machine, the fix names the relay first.
