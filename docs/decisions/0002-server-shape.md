# 0002. `chipsd` is one Node process

2 September 2026 · Status: accepted

## Context

Chips has to run on a Mac mini in a closet and in a cluster, from the same software. Splitting
services early would make the home case heavy for no benefit.

## Decision

`chipsd` is one Node process: Hono for HTTP, `ws` for WebSocket, and an in-process job queue
for media processing. Packaging into a single executable — Bun `--compile` or Node SEA — is a
Phase 6 decision, not a Phase 0 one.

## Consequences

- Solo mode is one process, one database file, one directory.
- The job queue is behind a port (see 0016), so team mode can move it to a worker process
  without touching the use cases that enqueue work.
- Gateway processes hold no state, so Phase 6 can run several of them behind one address.
