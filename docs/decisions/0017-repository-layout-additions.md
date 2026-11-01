# 0017. Two directories the plan's layout does not list

2 September 2026 · Status: accepted

## Context

Section 2 of the technical plan fixes the repository layout. Milestone M0.1 requires two things
that have no home in it: a typed configuration schema and a `pino` logger, both needed before
`server/` exists, and a way to prove the dependency-cruiser rules actually fire.

Putting configuration in `server/` would mean the CLI imports the server to read a port.
Putting the guardrail fixtures anywhere inside `packages/` or `server/` would mean the real
cruise sees deliberately broken modules.

## Decision

Two additions to the layout in section 2:

- **`packages/platform`** — cross-cutting primitives: the typed configuration schema and its
  loader, the logger, the OpenTelemetry instruments, id generation and the clock. It sits
  beside the layers, not inside them: anything may import it and it may import nothing of ours,
  a rule enforced by `platform-imports-nothing-of-ours`.
- **`tools/`** — repository checks and generators that are never shipped. Today it holds
  `tools/guardrails`, a miniature repository of modules that each break one layer rule, and the
  test that asserts each rule catches its module.

`tools/` is excluded from the real cruise and from Biome, so its deliberately broken fixtures
cannot fail the build they exist to test.

## Consequences

- The ports that the application layer owns — storage, transport, blob store, job queue,
  fan-out — still live in `server/src/application` when that arrives. `packages/platform`
  supplies the concrete clock and id generator those ports will be adapted to, not the ports.
- Section 2's tree is now incomplete. This ADR is the amendment; the phase packet records it.
