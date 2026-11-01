# 0011. Prefixed ULIDs, always strings

2 September 2026 · Status: accepted

## Context

Ids appear in URLs, logs, audit exports and agent code. An integer tells you nothing about what
it points at, and a bare UUID sorts randomly, which makes an event log painful to read.

## Decision

ULIDs with type prefixes: `usr_`, `agt_`, `conv_`, `msg_`, `run_`, `stp_`, `apr_`, `qst_`,
`lane_`, `att_`, `ws_`. Always strings. Generation goes through a port so tests are
deterministic; the generator is monotonic within a millisecond.

## Consequences

- `run_01K4...` is self-describing in a log line, and a mistyped id is caught by shape.
- Ids sort by creation time, so an event log reads in order even before `seq` is consulted.
- Monotonicity means two ids minted in the same millisecond still sort deterministically. The
  invariants — round-trip of the timestamp, ordering, uniqueness under a hostile clock — are
  covered by property tests in `packages/platform`.
