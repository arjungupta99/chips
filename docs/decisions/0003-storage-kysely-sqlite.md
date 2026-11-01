# 0003. Kysely and SQLite, with Postgres later

2 September 2026 · Status: accepted

## Context

The event log needs transactions, predictable SQL and migrations that run identically on a
laptop and a cluster. An ORM would hide the queries whose shape we care most about.

## Decision

Kysely as the query builder over a single schema definition. SQLite via `better-sqlite3` in
solo mode from Phase 0. Postgres via `pg` in Phase 6, with the same migrations. No ORM.

## Consequences

- Queries are visible and typed; the indexes each one needs are declared in a migration beside
  it (section 6.2).
- Two dialects mean migration tests run up and down on both from Phase 6.
- `better-sqlite3` is synchronous and native. It is the right trade for a single-process solo
  server, and it means the write path can hold a real transaction across the append and the
  projection update.
