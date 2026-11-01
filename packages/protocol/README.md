# `@chipschat/protocol`

Agent Connect: the canonical Zod schemas for every event, the identifier vocabulary, and
everything generated from them.

The schemas here are the source of truth ([ADR 0007](../../docs/decisions/0007-protocol-zod-canonical.md)).
`pnpm gen:protocol` writes:

| Output | What it is |
|---|---|
| `generated/schema/<type>.json` | JSON Schema, one file per event. |
| `generated/agent-connect.json` | The bundle: a `oneOf` over every event, with `$defs`. |
| `generated/types.ts` | TypeScript types with no dependency on zod, for consumers that only need the shape. |
| `apps/docs/src/content/docs/reference/events/*.md` | One reference page per event, with its fields and its fixture as an example. |

CI runs `pnpm check:protocol`, which regenerates nothing and fails if anything on disk differs.

The only runtime dependency is `zod`, so an SDK built on this package stays light.

## What it holds

| Module | What it is |
|---|---|
| `envelope` | The fields every event carries, from Appendix C of the plan, and the helpers that build an event schema from a definition. |
| `primitives` | The sub-schemas events share: attachments, sources, risk classes, actions, previews, policy, budget, trails. |
| `events/harness-to-chips` | The sixteen events a harness sends. |
| `events/chips-to-harness` | The fourteen events Chips sends. |
| `events/catalogue` | The single list. Every generator, test and reference page is a read of it. |
| `frames` | The nine WebSocket frames of Appendix B, and protocol version negotiation. |
| `ids` | Prefixed ULIDs ([ADR 0011](../../docs/decisions/0011-identifiers-prefixed-ulids.md)), monotonic within a millisecond. |

## Invariants

| Invariant | Protected by |
|---|---|
| Every declared event has a fixture, and every fixture has a declared event. | `src/events/catalogue.test.ts`, "the catalogue" |
| Every fixture parses against its own schema. | `src/events/catalogue.test.ts`, "every fixture" |
| Every field has a description, so no reference row is ever blank. | `src/events/invariants.test.ts`, "the catalogue's shape" |
| Validation happens once at the edge: undeclared fields are stripped, never passed through. | `src/events/invariants.test.ts`, "validation happens once, at the edge" |
| An id with the wrong prefix is rejected, for every event and every prefix. | `src/events/invariants.test.ts` |
| An event survives a JSON round trip unchanged. | `src/events/invariants.test.ts` |
| Error codes are a closed set a client can branch on. | `src/frames.test.ts` |
| Version negotiation never picks a version outside either side's range. | `src/frames.test.ts`, "protocol negotiation" |
| Ids sort in the order they were minted and are never repeated, whatever the clock does. | `src/ids/ulid.test.ts`, "ids, as properties" |

## The fixtures

`fixtures/` is the golden scenario, PO-4471 (Appendix A of the plan), one file per event. Every
layer's tests read these, so a shape change breaks loudly rather than quietly. The reference
pages embed them as examples, which means a fixture that stops being realistic is a
documentation bug as well as a test one.

## Testing

```bash
pnpm --filter @chipschat/protocol test
```
