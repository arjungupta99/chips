# Licensing

Chips is under two licences, split by what each part is for
([ADR 0128](docs/decisions/0128-the-protocol-stays-apache-and-the-server-and-apps-move-to-the-functional-source-license.md)).

| Licence | Parts | What it allows |
| --- | --- | --- |
| [Apache-2.0](packages/protocol/LICENSE) | `packages/protocol`, `packages/sdk-ts` (`@chipschat/harness`), `packages/conformance`, and `examples/` and `adapters/` when there are some | Anything, as Apache-2.0 allows. A harness can speak Agent Connect, bundle the SDK and pass the conformance kit without asking anyone. |
| [FSL-1.1-ALv2](LICENSE) | Everything else: `server`, `cli`, `relay`, `apps/*`, `packages/core`, `packages/platform`, `packages/subtle`, `packages/tunnel`, `packages/ui`, `tools/` | Use, change and run it for yourself, for your own company's people, for teaching and research, and for clients you do work for. Not to offer it, or something substantially like it, as a commercial product or service. Each version becomes Apache-2.0 two years after it is released. |
| [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | The Agent Connect specification text: `apps/docs/src/content/docs/concepts/` and `apps/docs/src/content/docs/reference/` | Copy and adapt it with credit. |

Each Apache-2.0 part carries its own `LICENSE`; the root `LICENSE` is the FSL and covers the rest.
Every `package.json` names its licence, and `tools/guardrails/licences.test.ts` checks that it
matches this table and that no Apache-2.0 part depends on an FSL part.

The name Chips and its mark are not licensed by either: see [`TRADEMARKS.md`](TRADEMARKS.md).
Chips takes feedback prompts, not code from outside: see [`CONTRIBUTING.md`](CONTRIBUTING.md).
