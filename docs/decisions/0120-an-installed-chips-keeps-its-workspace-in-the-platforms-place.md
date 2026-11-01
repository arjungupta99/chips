# 0120. An installed Chips keeps its workspace in the platform's place

Date: 5 October 2026
Status: Accepted, 5 October 2026. Phase 1 of `docs/proposals/install-onboarding-plan.md`.

## Context

The workspace followed the directory a server was started from: `./.chips` for the database,
the attachments, the operator token (ADR 0048) and the models. From a checkout that is right — the
data sits beside the code that made it — but an installed `chips` run from `~` one day and from a
project folder the next would make two workspaces and pair with neither. Setting only
`CHIPS_DATA_DIR` moved the token and the models but left the database in `./.chips`.

## Decision

1. **A release defaults its workspace to the platform's place**: `~/Library/Application
   Support/Chips` on a Mac, `${XDG_DATA_HOME:-~/.local/share}/chips` on Linux; its logs to
   `~/Library/Logs/Chips` or `${XDG_STATE_HOME:-~/.local/state}/chips`; its pages to the `web/`
   unpacked beside it. These are the lowest layer of its configuration, so `CHIPS_DATA_DIR` and
   the rest still win.
2. **A checkout keeps `./.chips`** and the repository's own `apps/web/dist`. Nothing changes for
   the server on 4431, which runs from the checkout.
3. **A data directory named without a database holds the database**: `CHIPS_DATA_DIR=/var/chips`
   alone means `sqlite:/var/chips/chips.db`. A database that is named stays where it is named.
4. The CLI's own credentials stay in `~/.config/chips` (unchanged).

## Consequences

- `chips up`, `chips serve`, `chips doctor` and the service find the same workspace from anywhere.
- Somebody who set `CHIPS_DATA_DIR` and not `CHIPS_DATABASE_URL` and relied on the split would find
  a new, empty database at the next start. No such setup is known: the launch agent sets neither.
- `chips uninstall --remove-data` knows what to remove: the workspace, its logs and the CLI's
  credentials, and nothing else.
