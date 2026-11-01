# 0007. Zod schemas are the protocol

2 September 2026 · Status: accepted

## Context

Agent Connect has to be implementable by someone who has never read our TypeScript. If the
schema, the types and the documentation are maintained separately they will disagree, and the
disagreement will be discovered by an adapter author.

## Decision

The Zod schemas in `packages/protocol` are canonical. JSON Schema, TypeScript types and the
docs reference are generated from them by `pnpm gen:protocol`. `hello` negotiates
`protocol: {min, max}`. Semantic versioning; breaking changes only at major versions after 1.0.

## Consequences

- One source of truth; CI fails if generated files are stale.
- Every event has a fixture, and every layer's tests read the same fixtures, so a shape change
  breaks loudly rather than silently.
- Validation happens once at the edge and the value is trusted inside (section 6.1).
