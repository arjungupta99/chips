# 0005. One WebSocket endpoint for people and agents

2 September 2026 · Status: accepted

## Context

A harness on a home network cannot accept inbound connections. Clients and agents both need to
reconnect without losing a decision. Two transports would mean two sets of bugs.

## Decision

One WebSocket endpoint, `/v1/ws`, serves people and agents. Frames carry `seq`; clients resume
with `since`. Every write from a client carries an idempotency key and is answered with
`ack {key, seq}`. Heartbeats every 20 seconds; the server closes a silent socket at 60. A
consumer more than 1,000 frames behind is disconnected and resumes with `since`.

## Consequences

- The connection is outbound, so no inbound port and no public address are needed.
- Resumption is the normal path, not an error path, so it is exercised constantly.
- Those four numbers are configuration with these defaults, not constants scattered in code:
  see `realtime.*` in the config schema.
