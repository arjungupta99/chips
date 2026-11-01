---
title: Contribute
description: Chips takes feedback prompts, not pull requests.
sidebar:
  order: 1
---

Chips doesn't take pull requests. If you'd like something changed, send a feedback prompt: what
you saw, what you'd change, and how to tell it's done. Open one with
[New issue → Feedback prompt](https://github.com/arjungupta99/chips/issues/new?template=feedback-prompt.yml),
or from the app under You → Send feedback. [chipschat.ai/feedback](https://chipschat.ai/feedback)
says what makes a good one.

You can still fork Chips and change it for yourself, as its licences allow. The protocol, the SDK,
the conformance kit, the examples and the adapters are Apache-2.0. The server, the CLI, the relay
and the apps are [FSL-1.1-ALv2](https://fsl.software/): readable and yours to run, not to sell as
a competing service, and Apache-2.0 two years after each release. The specification text is CC BY
4.0. The map is
[`LICENSING.md`](https://github.com/arjungupta99/chips/blob/main/LICENSING.md).

## Getting set up

```sh
git clone https://github.com/arjungupta99/chips.git
cd chips
pnpm install
pnpm check
```

`pnpm check` runs lint, typecheck and the test suite: the same three things CI runs.

CI runs on every push to main, and only the jobs a change can affect. The sign-off check always
runs. A change to prose alone (`docs/`, a Markdown file at the root) runs nothing
else. The visual suite runs for the web app, the packages it draws with, and the installs. The
macOS shell builds only when it or the workflow changes. `tools/ci/which-jobs.sh` holds the
rules, and a skipped job is not a failed one. Start the workflow by hand to run every job.

## What CI enforces

| Check | Fails on |
| --- | --- |
| Biome | A lint or format violation, a function over cognitive complexity 12, an undeclared dependency, a `process.env` read outside the one file allowed to. |
| `dependency-cruiser` | A layer violation or a dependency cycle. |
| `tsc` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. |
| Vitest | Coverage below 80 percent overall, or below 90 on the protocol and the domain layer. No retries. |
| `pnpm check:protocol` | A schema change that did not regenerate the reference. |
| `pnpm check:architecture` | A stale package graph. |
| `pnpm docs:check` | A sample that exits non-zero, or a broken link. |
| `pnpm bench:append` | The event log missing its performance budget. |

The full standards are in
[`docs/technical-plan.md`](https://github.com/arjungupta99/chips/blob/main/docs/technical-plan.md)
section 6, with a self-review checklist in Appendix G.

## Reporting a security problem

Don't open an issue.
[`SECURITY.md`](https://github.com/arjungupta99/chips/blob/main/SECURITY.md) says where to send
it.
