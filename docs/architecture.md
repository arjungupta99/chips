# Architecture

> The graph in this file is generated. Edit the prose in
> `tools/architecture/architecture.template.md` and run `pnpm gen:architecture`.
> CI fails if the file is stale.

Chips is ports and adapters with an inward dependency direction. The rule is
[ADR 0016](decisions/0016-ports-and-adapters.md); this page is what it looks like today.

## The layers

```
protocol  ->  domain  ->  application  ->  infrastructure  ->  interfaces
```

| Layer | Where | What lives there | May import |
|---|---|---|---|
| **protocol** | `packages/protocol` | Zod schemas for every Agent Connect event, and the types, JSON Schema and reference generated from them. | Nothing of ours. |
| **domain** | `server/src/domain` | Pure code: the policy engine, the run and lane state machines, invariants. No I/O, no framework. | `protocol` |
| **application** | `server/src/application` | Use cases — post a message, request an approval, resolve it, route a task — and the ports they depend on: storage, transport, blob store, job queue, clock, id generator, fan-out. | `protocol`, `domain` |
| **infrastructure** | `server/src/infrastructure` | Adapters: Kysely repositories, the WebSocket and HTTP transports, media jobs, the relay. | `protocol`, `domain`, `application` |
| **interfaces** | `server/src/interfaces`, `cli` | Routes, socket handlers, the command line. | everything inward |

`packages/platform` sits **beside** the layers rather than inside them. It holds the typed
configuration, the logger, the OpenTelemetry instruments, id generation and the clock. Anything
may import it; it may import nothing of ours. That is what keeps a cross-cutting concern from
becoming a back door through which an outer layer reaches an inner one.

`packages/ui` is the design system — the blueprint's tokens, primitives and cards — and
`packages/core` the protocol client and state the web and mobile apps share. Both belong to
the clients: they may import `packages/protocol`, and `core` the tunnel, and nothing else of
ours; no server layer imports them.

`packages/tunnel` is the end-to-end tunnel between a phone and its server (M4.1, ADR 0039): a
Noise handshake over WebCrypto, requests and sockets as messages inside it, and both ends of the
relay's conversation. It imports the protocol and nothing else, and the server, the client core
and the relay all import it. `relay/` is the switchboard itself, a process of its own beside
`server/` and `cli/`: it reads the protocol's control frames and the tunnel's key proof, forwards
ciphertext, and imports no server layer.

## The graph

<!-- generated:graph -- do not edit by hand; run pnpm gen:architecture -->

```mermaid
flowchart TD
  subgraph Protocol["Protocol"]
    n624205028["packages/protocol"]
  end
  subgraph Domain["Domain"]
    n996711109["server/domain"]
  end
  subgraph Application["Application"]
    n963107443["server/application"]
  end
  subgraph Infrastructure["Infrastructure"]
    n500920516["server/infrastructure"]
  end
  subgraph Interfaces["Interfaces"]
    n363039["cli"]
    n479898120["server/interfaces"]
  end
  subgraph Clients_and_docs["Clients and docs"]
    n493571875["apps/docs"]
    n851943491["apps/mobile"]
    n14977080["apps/web"]
    n393463653["packages/core"]
    n276762261["packages/ui"]
  end
  subgraph Cross_cutting["Cross-cutting"]
    n327191503["packages/platform"]
  end
  subgraph Shared_packages["Shared packages"]
    n38359444["cli/commands"]
    n753957783["cli/testing"]
    n452219849["packages/conformance"]
    n94727671["packages/sdk-ts"]
    n114641936["packages/subtle"]
    n154201815["packages/tunnel"]
    n412893316["relay"]
    n664852675["server"]
    n171398232["server/testing"]
  end
  n493571875 --> n327191503
  n493571875 --> n624205028
  n493571875 --> n94727671
  n493571875 --> n664852675
  n851943491 --> n14977080
  n851943491 --> n393463653
  n851943491 --> n624205028
  n851943491 --> n114641936
  n14977080 --> n393463653
  n14977080 --> n624205028
  n14977080 --> n94727671
  n14977080 --> n276762261
  n38359444 --> n363039
  n38359444 --> n753957783
  n38359444 --> n452219849
  n38359444 --> n327191503
  n38359444 --> n624205028
  n38359444 --> n94727671
  n38359444 --> n412893316
  n38359444 --> n664852675
  n38359444 --> n171398232
  n363039 --> n38359444
  n363039 --> n753957783
  n363039 --> n452219849
  n363039 --> n327191503
  n363039 --> n624205028
  n363039 --> n94727671
  n363039 --> n664852675
  n363039 --> n171398232
  n452219849 --> n624205028
  n452219849 --> n94727671
  n452219849 --> n171398232
  n393463653 --> n624205028
  n393463653 --> n154201815
  n94727671 --> n327191503
  n94727671 --> n624205028
  n94727671 --> n664852675
  n154201815 --> n624205028
  n276762261 --> n624205028
  n412893316 --> n327191503
  n412893316 --> n624205028
  n412893316 --> n154201815
  n963107443 --> n327191503
  n963107443 --> n624205028
  n963107443 --> n664852675
  n963107443 --> n996711109
  n963107443 --> n171398232
  n996711109 --> n624205028
  n500920516 --> n327191503
  n500920516 --> n624205028
  n500920516 --> n154201815
  n500920516 --> n963107443
  n500920516 --> n996711109
  n500920516 --> n171398232
  n479898120 --> n327191503
  n479898120 --> n624205028
  n479898120 --> n154201815
  n479898120 --> n412893316
  n479898120 --> n664852675
  n479898120 --> n963107443
  n479898120 --> n996711109
  n479898120 --> n500920516
  n479898120 --> n171398232
  n171398232 --> n327191503
  n171398232 --> n624205028
  n171398232 --> n664852675
  n171398232 --> n963107443
  n171398232 --> n500920516
  n664852675 --> n327191503
  n664852675 --> n624205028
  n664852675 --> n963107443
  n664852675 --> n996711109
  n664852675 --> n500920516
  n664852675 --> n479898120
```

<!-- /generated:graph -->

## What CI enforces

`pnpm lint:deps` runs [`dependency-cruiser`](../.dependency-cruiser.cjs) over the tree. These
rules are errors:

| Rule | What it forbids |
|---|---|
| `no-circular` | Any dependency cycle. |
| `no-unresolvable` | An import that does not resolve. |
| `not-to-dev-dep` | Shipped code importing a `devDependency`. |
| `not-to-unlisted-dep` | A runtime import not declared in the importing package's `package.json`. |
| `no-deprecated-core` | Deprecated Node core modules. |
| `protocol-is-innermost` | `packages/protocol` importing any layer of ours. |
| `domain-not-to-outer` | The domain layer importing application, infrastructure or interfaces. |
| `domain-not-to-framework` | The domain layer importing Hono, `ws`, Kysely, `better-sqlite3`, `pg`, `pino`, `sharp`, React, Vite or OpenTelemetry. |
| `application-not-to-outer` | A use case importing an adapter instead of a port. |
| `infrastructure-not-to-interfaces` | An adapter reaching back into routes, socket handlers or the CLI. |
| `platform-imports-nothing-of-ours` | `packages/platform` importing anything in the repository. |
| `clients-not-to-server` | `packages/ui` or `packages/core` importing anything of ours but the protocol. |
| `server-not-to-clients` | `server/`, `cli/` or `relay/` importing `packages/ui` or `packages/core`. |
| `ui-and-core-are-siblings` | The design system and the client core importing each other. |
| `no-deep-import-into-package` | Reaching past a package's `index.ts`. A stylesheet the package exports, such as `@chipschat/ui/styles.css`, is an entry point of its own and is allowed. |
| `no-deep-import-between-packages` | The same, between packages. |

A rule that never fires is not a guardrail. `tools/guardrails/fixtures` is a miniature
repository in which each of those rules is broken on purpose, and
`tools/guardrails/dependency-cruiser.test.ts` asserts that each one is caught — and that
nothing else fires, so the fixtures stay a precise description of the rules.

The one rule without a fixture is `not-to-dev-dep`, which needs an installed dependency tree to
classify. It is stock dependency-cruiser configuration; only its `from` filter is ours.

## Other guardrails

| Check | Where | Fails on |
|---|---|---|
| Coverage thresholds | `vitest.config.ts` | Below 80 percent overall, or below 90 percent on `packages/protocol` and `server/src/domain`. Thresholds may only go up. |
| One reader of `process.env` | `biome.json`, rule `style/noProcessEnv` | Any file except `packages/platform/src/config/environment.ts` reading the environment directly. |
| Cognitive complexity | `biome.json`, rule `complexity/noExcessiveCognitiveComplexity` | A function over 12. |
| Typed configuration | `packages/platform/src/config` | A setting that is not in the Zod schema, or an environment variable not in `ENVIRONMENT_BINDINGS`. |
| Architecture graph | `tools/architecture/generate.mjs --check` | This file being out of date with the source tree. |

## Determinism

Time and identifiers come through ports so tests do not sleep and do not guess:
`systemClock` and `manualClock` in `packages/platform/src/time`, `createIdGenerator` in
`packages/platform/src/ids`. Production wires the system clock and a monotonic ULID generator;
tests wire a clock they drive by hand and a generator with fixed randomness.
