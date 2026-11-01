# 0014. Apache-2.0, CC BY 4.0 for the spec, DCO sign-off

2 September 2026 · Status: accepted; superseded in part by [0128](0128-the-protocol-stays-apache-and-the-server-and-apps-move-to-the-functional-source-license.md) on 6 October 2026: the server and apps are FSL-1.1-ALv2 and need a CLA, the protocol, SDK and conformance kit stay Apache-2.0; its contribution part replaced by [0237](0237-chips-takes-feedback-prompts-not-pull-requests.md) on 26 October 2026: Chips takes feedback prompts, not code from outside, and sign-off stays on our own commits

## Context

Chips is open source from day one, and the business is the cloud, the hosted relay and
enterprise features. The protocol is meant to be implemented by people who owe us nothing.

## Decision

Apache-2.0 at the root. CC BY 4.0 for the specification text. DCO sign-off on every commit —
`git commit -s` — and no CLA. `SECURITY.md` with a disclosure address. An `ee/` directory is
reserved but stays empty until Phase 8.

## Consequences

- Apache-2.0's patent grant makes the protocol safe for a company to implement.
- DCO keeps the contribution barrier at one line, and CI can check it mechanically.
- Anything that would go in `ee/` before Phase 8 is a signal the boundary is in the wrong place.
- The disclosure address in `SECURITY.md` is `security@chipschat.ai` and needs a real mailbox
  behind it before the repository is public.
