# 0012. Vitest, Playwright, the conformance kit, and one golden scenario

2 September 2026 · Status: accepted

## Context

Chips is a protocol, a server, three clients and a set of adapters. Each needs a different kind
of test, and all of them need to agree about what an event looks like.

## Decision

Vitest for unit and integration tests, with integration tests running against a real SQLite
file in a temporary directory. Playwright for the web app. A conformance kit for adapters. And
one golden scenario — Appendix A of the plan, PO-4471 — that every layer must pass.

Coverage thresholds live in the Vitest configuration and may only go up: 90 percent lines and
branches on `packages/protocol`, the domain layer and the policy engine; 80 percent overall.
Property-based tests with `fast-check` cover the event log, the state machines, the policy
engine and lane invariants.

## Consequences

- The golden scenario is the contract between layers: a change that alters its expected UI
  states updates Appendix A in the same commit.
- Fixtures come from `packages/protocol/fixtures`, so every layer agrees on shape.
- Tests are deterministic: injected clock and ids, no sleeps, no network in unit tests. CI
  retries are off, because a retry hides a flake and a flake is a bug.
