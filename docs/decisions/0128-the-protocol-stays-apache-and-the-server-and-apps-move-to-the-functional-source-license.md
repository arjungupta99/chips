# 0128. The protocol stays Apache-2.0, and the server and apps move to the Functional Source License

Date: 6 October 2026
Status: Accepted, 6 October 2026, on Arjun's call. Supersedes
[0014](0014-licensing-and-contribution.md) for the licence of the server and apps and for how their
contributions are licensed; 0014 still holds for the protocol, the SDK and the spec text.
Decision 5's contributor licence agreement, and its bot, are replaced by
[0237](0237-chips-takes-feedback-prompts-not-pull-requests.md) on 26 October 2026: Chips takes
feedback prompts, not pull requests, so no code comes in from outside to need one.

## Context

ADR 0014 put everything under Apache-2.0 with DCO sign-off and no CLA, and the business in what
Chips runs for people: Cloud, the hosted relay and enterprise features. On 6 October Arjun added
an aim 0014 did not have: that a company might one day buy Chips. Three things follow from it.

- Under Apache-2.0 everywhere, any company, including one that might buy Chips, can take the
  server and apps and ship them as its own. What is left to buy is the name, the users and the
  people. OpenClaw (MIT) is the case in point: when it was at its most popular, its author was
  hired and the project went to a foundation. Nobody bought the code, because nobody had to.
- Tightening a licence after people have the code is what forked Elasticsearch (OpenSearch),
  Redis (Valkey) and Terraform (OpenTofu). Loosening one later costs nothing.
- Under sign-off alone each outside contributor keeps the copyright to their change, so neither
  Arjun nor a buyer could relicense or close the code later without every one of them.

What has to stay fully open is what other people build against: a harness only speaks Agent
Connect if the protocol, the SDK and the conformance kit are theirs to use without asking.

Nothing has been published under Apache-2.0 yet (the repository is private and the releases are
drafts), and nobody outside has contributed to it. So the change costs nothing today and would cost
a fork later.

He also settled what Chips runs for people, for now: the hosted relay, free, and no Cloud.

## Decision

1. **Apache-2.0** stays for `packages/protocol`, `packages/sdk-ts` (`@chipschat/harness`),
   `packages/conformance`, `examples/` and `adapters/`. Each carries its own `LICENSE`.
2. **FSL-1.1-ALv2** (the Functional Source License, version 1.1, with Apache-2.0 as the future
   licence) covers everything else, from the root `LICENSE`: the server, the CLI, the relay, the
   web, Mac and phone apps, the docs site's code, `packages/core`, `platform`, `subtle`, `tunnel`
   and `ui`, and `tools/`. Anyone may use, change and run it for any purpose but offering it, or
   something substantially like it, as a commercial product or service. Each version becomes
   Apache-2.0 two years after it is released. The licensor is Arjun Gupta, until a company holds
   the copyright.
3. **CC BY 4.0** stays for the specification text (`apps/docs/src/content/docs/concepts/` and
   `reference/`).
4. **No Apache-2.0 part depends on an FSL part**, so nobody who uses the SDK takes on the FSL
   by accident. `tools/guardrails/licences.test.ts` checks it, and that every `package.json` names
   the licence `LICENSING.md` gives its folder.
5. **Contributions.** Every commit is still signed off (DCO). A change to an FSL part also needs a
   contributor licence agreement that lets the licensor relicense it. Its text, a standard one
   adapted from the Apache Individual CLA, and the bot that asks for it arrive when the repository
   is public. A change to an Apache-2.0 part needs sign-off only, so adapter authors are never
   asked to sign anything.
6. **Trademarks.** The name and the mark are Arjun's and neither licence grants them
   (`TRADEMARKS.md`). Forks rename; an adapter that passes conformance may say "works with
   Chips".
7. **What Chips runs for people** is the hosted relay, and it is free (his call, 6 October). Cloud
   is not planned for now. `ee/` stays
   reserved, empty, for anything ever sold under a commercial licence.

## Consequences

- The server and apps are no longer "open source" in the OSI sense. Say "source available,
  Apache-2.0 after two years"; say "open source" only of the protocol, the SDK and the
  conformance kit.
- Everything else in the readable-code argument still holds: anyone can read, build and run
  every line, and a company can run Chips for its own people.
- Homebrew's core tap takes only open-source licences. The formula was always going to live in
  Chips' own tap (`packaging/chips.rb`).
- The App Store build is fine: the licensor publishes it, and the FSL does not conflict with
  Apple's terms the way the GPL family does.
- A release carries both licences, and the third-party notices for what it bundles.
- Before the repository goes public (not yet: Arjun's ruling of 5 October), a cleaned copy with
  fresh history, the CLA text and bot, and a real mailbox behind `security@chipschat.ai`. The apps' own acknowledgements screens come with the store builds
  (Phase 6).
- Outside the repository, and Arjun's, and neither needed for the licences to work: a company to
  hold the copyright (until then it is his, and he is the licensor), and a trademark filing.

## Addendum, 16 October 2026: the npm scope is `@chipschat`

The npm user "chips" has owned the `@chips` scope for about ten years, so nothing named `@chips/…`
could ever be published as ours, and a package by one of those names could be anybody's. On his
word ("Use chipschat") every workspace package is `@chipschat/…`: `@chipschat/harness`,
`@chipschat/protocol` and `@chipschat/conformance` are the ones this decision's licence goes out
with, and the connectors will be `@chipschat/openclaw`, `@chipschat/acp`, `@chipschat/hermes` and
`@chipschat/opencode`. He made the free npm org `chipschat` the same day, so the scope is held.
Nothing is published yet; the gallery's guardrail (ADR 0171) lets a card fetch a package only once
it is.

