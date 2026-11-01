# `@chipschat/platform`

Cross-cutting primitives: the typed configuration, the logger, the metric instruments and the
clock. It sits **beside** the layers rather than inside them — anything may import it, and it
may import nothing of ours, so it cannot become a back door from an outer layer to an inner
one. See [ADR 0017](../../docs/decisions/0017-repository-layout-additions.md).

Identifiers used to live here. They moved to [`@chipschat/protocol`](../protocol/), because an id
is part of the wire format and an SDK should not have to pull a logger in to validate one.

## What it holds

| Module | What it is |
|---|---|
| `config` | The Zod configuration schema, and a loader that merges defaults, a file and the environment, in that order. |
| `logging` | A `pino` factory with redaction, and `withContext` for the request, run and lane ids a runbook follows. |
| `observability` | The OpenTelemetry instruments a runbook needs: appends, fan-out latency, pending approvals and their age, sockets, job queue depth. |
| `result` | `Result<T, E>` — errors as values at boundaries. |
| `time` | The `Clock` port, the system clock, and a manual clock a test drives by hand. |

## Invariants

| Invariant | Protected by |
|---|---|
| Exactly one file reads `process.env`. | `biome.json`, rule `style/noProcessEnv`, with a single ignore in `src/config/environment.ts`. |
| Configuration precedence is defaults, then file, then environment. | `src/config/load.test.ts`, "precedence" |
| Every environment variable in `ENVIRONMENT_BINDINGS` reaches the setting it names, and every binding has a sample. | `src/config/load.test.ts`, "environment bindings" |
| A bad setting is a returned error, not a thrown one, and every problem is reported at once. | `src/config/load.test.ts`, "failure" |
| Secrets never reach a log line, at any nesting depth. | `src/logging/logger.test.ts`, "redaction" |
| A manual clock never runs backwards. | `src/time/clock.test.ts` |
| Metric instruments record without an SDK registered, because none is by default. | `src/observability/metrics.test.ts` |

## Testing

```bash
pnpm --filter @chipschat/platform test
```
