# 0015. No telemetry by default

2 September 2026 · Status: accepted

## Context

Chips sees the most sensitive thing an agent does: the action it is asking permission for. A
supervision tool that phones home is not one people will point at their real work.

## Decision

No telemetry by default. Local metrics only. Any opt-in reporting is a Phase 7 decision, made
in the open.

## Consequences

- Metrics use the OpenTelemetry API with no SDK registered, so the instruments exist from
  Phase 0 and record nothing until an operator wires up an exporter. A Prometheus exporter
  arrives in Phase 6 and needs no code change here.
- Logs carry request, run and lane ids and no personal data by default.
- We learn about usage by asking people, which is slower and correct.
