# 0173. Chips for Mac carries Chips, and runs it here when nothing answers

Date: 15 October 2026
Status: Accepted, 15 October 2026. The install plan's option A for the Mac
([install plan](../proposals/install-onboarding-plan.md), §3.3 and Phase 6), built as step 1 of the
[first-run build plan](../proposals/first-run-build.md) (FR6), on Arjun's "build all seven steps,
Phase 3 first" after the running mock (<https://claude.ai/artifact/SEHZZ4tPRMEqngbj14jnD3>).

## Context

Chips for Mac connected to a server somewhere else (option B): its first screen listed what
advertised itself on the network and took an address. A person who had only the app had nothing
to connect to, and was told to start one with `chips serve` in a terminal. The mock's first step
is the app asking "Run Chips on this Mac?" and doing it.

A release of `chips` (ADR 0119) already runs with no Node installed, keeps its workspace in the
platform's place (ADR 0120), and `chips up` (ADR 0121) makes the workspace, starts the server as a
login service, and prints one line of JSON with a pairing link in it.

## Decision

1. **The app carries a release of `chips`** in its resources, as `chips/`: the one
   `tools/release/build.mjs` makes for this Mac, built from the app's own copy of the web app
   (`--web`, so `apps/web/dist`, which the running server serves, is not touched). `pnpm desktop`
   builds it; `tauri.conf.json` names no resource, so a build without it is still a build, and
   the app then offers nothing to run.
2. **The shell gains two commands and nothing else.** `can_run_here` says whether the app
   carries `chips`; `run_here` runs its `chips up --reach <reach> --json --no-open` and hands back
   the last line of JSON, or what `chips up` said on standard error. It refuses a reach `chips
   up` does not know, and an app opened from where it was downloaded (App Translocation), since a
   login service pointed into that copy would point at nothing next launch.
3. **The page asks only when nothing answers.** On the first screen, when the shell can run
   Chips, the page asks `http://127.0.0.1:4431/v1/health` too. With nothing on this Mac and
   nothing on the network, the screen is "Run Chips on this Mac?" with **Run Chips here**, and
   the finder below it as "Or connect to Chips on another computer". With a server on the
   network it is a quiet **Run Chips on this Mac instead** under the list. With Chips answering
   on this Mac, it is not offered at all.
4. **The reach is the home network**, so the phone on the same Wi-Fi can reach it and the relay
   can carry it further; where `chips up` says the Mac has no home network address, it runs again
   for this Mac alone. A tailnet is `chips up --reach tailnet` afterwards, as now.
5. **The app pairs with the code `chips up` printed**, over loopback (`127.0.0.1:4431`), as
   "Chips for Mac", with nobody typing, and the welcome (ADR 0170) follows.

## Consequences

- The app grows by the release (about 140 MB unpacked).
- The login service runs the `chips` inside the app: moving the app, or replacing it with a newer
  one, changes the server that runs at the next start; deleting it leaves a service that cannot
  start until `chips uninstall`. `chips down` stops it.
- The shell now runs one program, its own copy of `chips`, and only on a person's click.
- His Mac mini has Chips on 4431, so the app there is never offered to run another.
- Signing for anybody else's Mac (Developer ID, notarization, and signing the runtime inside the
  resources for it) is the install plan's Phase 6 and his accounts'.
