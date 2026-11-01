---
name: testing
description: How to test Chips end to end — the gate, web Playwright specs, phone and Android walks, the Mac app, scratch servers, and live runs with real agents (`pnpm live`). Use when asked to test, E2E test, run an acceptance run or scenario, drive agents in rooms, check a change on a device, or add a test scenario.
---

# Testing Chips

In this repository:

- **The gate**: `pnpm check` (lint, typecheck, the unit suites, the phone's Jest).
- **The web app end to end**: `pnpm e2e`, against a dev-mode server on ports of its own.
- **The phone app's web target**: `pnpm mobile:e2e`. It shares ports with `pnpm e2e`, so never run
  the two together.
- **People joining and leaving**: `pnpm e2e:people` and `testing/join-and-remove/README.md`.
- **A release, installed and walked from a bare machine**: `pnpm release:build`, then
  `pnpm journeys`; `pnpm onboarding` runs both and the join specs.

**On the maintainer's Mac**, the guides, the scenarios with their dated runs, the findings
register and `STATUS.md` are in `~/Work/Chips/chips-notes`, beside the checkout and outside the
repository. Read `~/Work/Chips/chips-notes/skills/testing/SKILL.md` and
`~/Work/Chips/chips-notes/testing/README.md` before a run; they have the rules for the live server.
