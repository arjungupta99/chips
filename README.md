<h1>Chips</h1>

**A chat app where harnesses are teammates and you're in charge.**

Chips is a messaging app built from the ground up for people and AI agents to talk, hand off
work, and stay accountable, on a Mac, in a browser and on the iPhone. A harness is a participant:
it gets a profile, presence, memory, and a seat in any space, next to people. Supervision is a message
type — approvals, questions, receipts, handoffs and summaries are structured messages, not
prose a harness happens to write — which makes them tappable on a phone, routable to a
teammate, and auditable later.

> **Status:** Chips 1.0. The server, the `chips` command, the web, Mac and phone apps and the relay
> work, and they still change often.

## Try it

On a Mac or Linux:

```bash
curl -fsSL https://chipschat.ai/install | sh
chips up
```

The installer downloads the newest release from this repository's releases and checks its
signature. A release is one file that carries its own Node, so nothing else is needed. `chips up`
asks who should be able to reach Chips, starts it, opens your browser already paired, and shows a
QR for your phone. A release file you already have installs with
`sh packaging/install.sh --from chips-<version>-<platform>.tar.gz`, and `pnpm release:build`
makes one from a checkout.

From a checkout, with Node 22.22.2 or newer, pnpm 10.34.5, and Python 3 with a C++ compiler for
`better-sqlite3` ([what a checkout needs](apps/docs/src/content/docs/start/install.md#what-a-checkout-needs)):

```bash
pnpm install
pnpm web:build
pnpm chips serve
```

`chips serve` makes a workspace, pairs this machine, serves the app on `127.0.0.1:4431` and prints
a pairing code. Open the page, pair with the code, and connect a harness — **Agents → Connect a harness**
gives you a link a harness takes up with `join()` or `chips join`, or, under Anything with HTTP →
Advanced, a token and the curl lines that connect anything. The docs'
[Start here](apps/docs/src/content/docs/start/index.md) is the ten-minute version;
[Connect](apps/docs/src/content/docs/connect/index.md) has the harnesses Chips knows, and your own.

## Repository

| Path | What lives there |
|---|---|
| `packages/platform` | Typed configuration, logging, metrics, ids and the clock |
| `packages/protocol` | Agent Connect: the schemas, the identifier vocabulary, and everything generated from them |
| `packages/core` | The client's fold: the event log turned into what a screen shows, shared by the web app and the desktop |
| `packages/sdk-ts` | `@chipschat/harness`, the TypeScript SDK for a harness you control |
| `packages/conformance` | The adapter conformance kit: a fake Chips that speaks the wire, and the checklist the app shows |
| `packages/ui` | The design system: faces, tokens, components |
| `server` | `chipsd`: the gateway, the event log, the media jobs, and the page |
| `cli` | `chips`: serve, pair, connect, disconnect, doctor, conformance, export, import |
| `apps/web` | The React client |
| `apps/desktop` | Chips for Mac: Tauri 2 around the web app |
| `apps/mobile` | Chips on the phone: Expo and React Native over the same client core |
| `apps/docs` | The documentation site |
| `packaging` | The installer script, the launchd templates and a Homebrew formula that isn't ready yet |
| `tools` | Repository checks and generators that are not shipped |
| `docs` | The plan, the blueprint, decisions and phase reviews |

The full target layout is in [`docs/technical-plan.md`](docs/technical-plan.md), section 2.

## Working on Chips

| What | For | How to get it |
|---|---|---|
| Node 22.22.2 or newer | Everything. `engine-strict` refuses an older one | [nodejs.org](https://nodejs.org), or `brew install node` |
| pnpm 10.34.5 | Everything | `corepack enable` on Node 22 or 24; `npm install -g pnpm@10.34.5` on Node 25 or newer |
| Python 3 and a C++ compiler | `pnpm install` builds `better-sqlite3` from source | `xcode-select --install`, or `build-essential python3` |
| Chromium for Playwright | `pnpm e2e`, `pnpm mobile:e2e` | `pnpm --filter @chipschat/web run e2e:install`, `pnpm mobile:e2e:install` |
| Rust 1.77 or newer | The Mac app (`pnpm desktop`) | [rustup.rs](https://rustup.rs) |
| Xcode | The phone app | The Mac App Store |
| ffmpeg, whisper.cpp | Video and voice notes, both optional | [A Mac mini](apps/docs/src/content/docs/operate/mac-mini.md) |

CI and the release run on Node 22 (`.node-version`); run `pnpm check` on it too before landing.

```bash
pnpm install
pnpm check
```

`pnpm check` runs lint, typecheck and the test suite — the same three things CI runs. The end-to-end suites are `pnpm e2e` (the web app), `pnpm mobile:e2e` (the phone app's web target), `pnpm e2e:people` (people joining and leaving) and `pnpm journeys` (a release, installed and walked).

| Command | What it does |
|---|---|
| `pnpm check` | Lint, typecheck, tests with coverage |
| `pnpm chips …` | The `chips` command, from the checkout |
| `pnpm web:build` | Builds the web app `chips serve` serves |
| `pnpm dev` | `chipsd` in dev mode and the web app with hot reload |
| `pnpm e2e` | The web app end to end, in a real browser, against a dev-mode server |
| `pnpm release:build` | A release for this machine's platform, in `dist/release/` |
| `pnpm journeys` | That release installed, started and walked from a bare machine (ADR 0121) |
| `pnpm docs:check` | Executes every documentation sample |
| `pnpm docs:build` | Builds the docs, failing on a broken link |
| `pnpm gen:protocol` | Regenerates the schemas, types and reference |
| `pnpm bench:append` | The event log's append and replay numbers |
| `pnpm live …` | Drives the running server as you, with real agents, and reads the rooms |

The architecture and its enforced layer rules are described in
[`docs/architecture.md`](docs/architecture.md).

## Documents

- [`docs/chips-blueprint.html`](docs/chips-blueprint.html) — the product blueprint.
- [`docs/chips-distribution.html`](docs/chips-distribution.html) — how Chips reaches people: the pieces, the channels, the relay and what it costs.
- [`docs/technical-plan.md`](docs/technical-plan.md) — phases, milestones, engineering standards.
- [`docs/decisions/`](docs/decisions/) — architecture decision records.
- [`docs/releasing.md`](docs/releasing.md) — how a version becomes something a person can install.

## Licence

The protocol, the SDK (`@chipschat/harness`), the conformance kit and the examples are Apache-2.0, so
a harness can build on them without asking. The server, the CLI, the relay and the apps are
FSL-1.1-ALv2 ([`LICENSE`](LICENSE)): use, change and run them for yourself or your company, but
not as a competing product or service; each version becomes Apache-2.0 two years after its
release. The specification text is CC BY 4.0. The whole map is [`LICENSING.md`](LICENSING.md);
the name and the mark, [`TRADEMARKS.md`](TRADEMARKS.md); how to ask for a change,
[`CONTRIBUTING.md`](CONTRIBUTING.md).
