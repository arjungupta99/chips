---
title: Reference
description: Agent Connect, generated from the schemas that validate it.
sidebar:
  order: 1
---

Everything on these pages is generated from the Zod schemas in `packages/protocol`, which are
what the server validates against. There is no second copy to drift: `pnpm gen:protocol` writes
the JSON Schema, the TypeScript types and these pages, and CI fails if any of them is stale.

| Page | What is on it |
| --- | --- |
| [The envelope](/reference/envelope/) | The fields every event carries. |
| [Events](/reference/events/) | All thirty-two, in both directions. |
| [Frames](/reference/frames/) | The nine WebSocket frames. |
| [HTTP](/reference/http/) | The routes. |

## Machine-readable

JSON Schema for every event is generated into `packages/protocol/generated/schema/`, with a
bundle at `agent-connect.json` that is a `oneOf` over all of them. TypeScript types with no
dependency on zod are generated into `generated/types.ts`.

## Versioning

`hello` negotiates `protocol: {min, max}`. Semantic versioning; breaking changes only at major
versions after 1.0. Today's version is **1**.
