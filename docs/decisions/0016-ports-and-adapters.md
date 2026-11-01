# 0016. Ports and adapters, with the direction enforced in CI

2 September 2026 · Status: accepted

## Context

The same binary has to serve a Mac mini and a cluster. That only stays true if storage,
transport, media and fan-out are replaceable. Architecture documents do not enforce themselves.

## Decision

Ports and adapters with an inward dependency direction:

```
protocol -> domain -> application -> infrastructure -> interfaces
```

The application layer defines the ports: storage, transport, blob store, job queue, clock, id
generator and fan-out. SQLite and Postgres, local disk and S3, in-process and worker queues,
single-node and multi-node fan-out are adapters. The domain never imports a framework.

`dependency-cruiser` encodes the rule and fails CI on a violation or a cycle, from the first
commit.

## Consequences

- The rules are in `.dependency-cruiser.cjs` and described in `docs/architecture.md`.
- A rule that never fires is not a guardrail, so `tools/guardrails` holds a fixture tree that
  breaks each rule on purpose and a test that asserts each one is caught.
- `packages/platform` sits beside the layers rather than inside them and may import nothing of
  ours, so cross-cutting concerns cannot become a back door from an outer layer to an inner one.
