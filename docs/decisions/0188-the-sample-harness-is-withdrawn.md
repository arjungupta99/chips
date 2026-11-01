# 0188. The sample harness is withdrawn

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's "Go ahead with the plan as written: keep the demo
workspace's Scout record, drop the CI conformance job." Amends 0051 (the `scout` adapter and the
CI job that walked it).

## Context

`examples/scout` held Scout and Ledger: sample harnesses on `@chipschat/harness` and the Claude
Agent SDK that played the golden scenario (PO-4471) and the lane between them. Scout started in
Phase 0 as a scripted harness on a raw socket, became the SDK's first afternoon in Phase 1, and
since ADR 0051 was the one adapter `chips conformance` could bring up by itself, which a CI job
walked on every push.

On 17 October 2026 Arjun asked what Scout was for, "seems like it was added in the beginning for
testing. Can we delete it?" By then:

- Chips speaks to real harnesses: Jacobian, the OpenClaw, ACP, Hermes and OpenCode bridges, each
  in its own repository with its own suite. None of them uses Scout's code.
- The kit's own tests already walk an in-process harness on the SDK "that does what Scout does"
  through every row (`packages/conformance/src/scenario.test.ts`), and `chips conformance` is
  tested with fakes.
- Of the web suite, only `approval-loop`, `feedback` and `route` started Scout as a process, and
  `lane.spec.ts` already played both harnesses of a lane over their own sockets.
- CI had been blocked on billing since 10 October, so its conformance job was not running.
- The Claude Agent SDK was Scout's alone, 194 MB in every install.

Scout in his own workspace was a leftover too: the dev bootstrap made it on 5 September, and it
last spoke on 8 September. That one is his to remove from its page (ADR 0078).

## Decision

1. **The sample goes**: `examples/scout`, the `scout` adapter (`cli/src/scout.ts`), `pnpm
   example:scout` and `pnpm example:ledger`, and the Claude Agent SDK with them. `chips
   conformance` knows `custom` alone.
2. **CI walks no adapter.** The `conformance (scout)` job goes; the kit is proved by its own tests
   in `pnpm test`, and each harness's adapter by its own suite (as Jacobian's always was).
3. **The specs play the harness themselves.** `approval-loop.spec.ts` and `feedback.spec.ts` play
   the demo harness on `@chipschat/harness` in their own process (`apps/web/e2e/golden-run.ts`,
   the same calls and words Scout used). `route.spec.ts` goes; its one check of its own, a person
   cancelling a lane from the route card, is a second test in `lane.spec.ts`.
4. **The phone flows get a script, not a sample.** `apps/mobile/e2e/maestro/golden.mjs` plays the
   golden run over a raw socket with no dependencies, for approve, deny, steer and receipt;
   `--when-asked` waits for a person, which is how `chips conformance custom` walks it (and it
   passes).
5. **The demo workspace keeps its Scout.** `pnpm dev` still makes a harness record called Scout
   and the room PO-4471, with a token in `demo.json`: the browser suites play it over its socket
   and look for its name (34 files). Nothing in the repository runs behind it, and `chipsd` says
   to connect a harness instead of naming the sample.
6. **History stays as written**: STATUS, earlier ADRs, reviews, proposals and the technical plan
   still say what Scout did when it did it.

## Consequences

- Nothing in the repository proves `@chipschat/harness` as a separate program a person starts;
  the specs use the same SDK in their own process, and `golden.mjs` the wire without it. A harness
  author's first afternoon is the SDK page and `chips connect custom`, not a sample to copy.
- `examples/` stays in the workspace and in the licence split (Apache-2.0) for samples to come,
  as `adapters/` already did with nothing in it.
- "Scout" stays the made-up name of the demo harness and of harnesses in unit tests.
