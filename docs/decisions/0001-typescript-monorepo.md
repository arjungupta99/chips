# 0001. TypeScript everywhere, one pnpm monorepo

2 September 2026 · Status: accepted

## Context

Chips ships a server, a CLI, a web app, a desktop shell, a mobile app, SDKs and adapters. They
share a protocol, and most of them share state and validation code. Splitting them across
repositories or languages would mean publishing a package to try a protocol change, and
hiring for two ecosystems.

## Decision

TypeScript everywhere, `strict` mode, Node 22 LTS as the baseline runtime. One monorepo with
pnpm workspaces and Turborepo pipelines for `build`, `test`, `lint` and `typecheck`. Biome for
lint and format. Vitest for tests.

Packages resolve each other from source in development — `exports` points at `src/index.ts`,
`publishConfig.exports` at `dist/` — so a protocol change is visible to every consumer without
a build step, while published artefacts are still compiled JavaScript with type declarations.

## Consequences

- One language across the SDK, server and clients; one lint and test configuration.
- Turborepo caches per package, so CI does not rebuild what did not change.
- Node 22 is the floor, expressed as `engines: {"node": ">=22.22.2"}` and `.node-version`. CI
  runs the matrix on Node 22 to keep the baseline honest, and `@types/node@22` pins the API
  surface the compiler will accept, so a Node 24 or 26 API cannot be used by accident. The
  implementer develops on Node 26 because Homebrew's `node@22` is broken on the current
  machine; the pinned types and the CI matrix are what keep that from mattering.
  *Raised from 22.12.0 on 13 September 2026:* jsdom 30 declares `^22.22.2`, and with
  `engine-strict` CI's install refused 22.12.0 before a single step ran. The floor is the lowest
  Node 22 the dependency tree accepts, not the newest, so CI keeps testing the floor.
  *25 October 2026:* `.node-version` is the Node a release carries (ADR 0119), Chips for Mac
  included, and the hosted relay runs, so it follows Node 22's security releases: 22.23.4 (the
  second security review's SEC-20). CI reads it too, so it runs that release rather than the
  floor; `engines` stays the floor, and `@types/node@22` still holds the code to what Node 22
  has.
- Biome replaces ESLint and Prettier. Its `all` preset was evaluated and rejected: it enables
  rules that contradict this plan, notably `noBarrelFile` against the `index.ts` boundaries
  section 6.1 requires. We run `recommended` with a named set of escalations to error, listed
  in `biome.json`.
