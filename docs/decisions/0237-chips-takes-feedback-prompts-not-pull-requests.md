# 0237. Chips takes feedback prompts, not pull requests

Date: 26 October 2026
Status: Accepted, 26 October 2026. Arjun: "How can anyone give tool feedback? Also I do not want to
accept pull requests from people, I want to ask them to submit a feedback prompt, that can be used
to improve the tool." On the mocks and the plan (`docs/proposals/feedback-prompts.md`): "Go with
your picks on all seven calls, put the plan in docs/proposals, and start the build." Replaces the
contribution parts of [0014](0014-licensing-and-contribution.md) (sign-off as the bar for outside
code) and [0128](0128-the-protocol-stays-apache-and-the-server-and-apps-move-to-the-functional-source-license.md)
(the contributor licence agreement and its bot).

## Context

Nobody outside could tell us anything. The app had no row for it, "Not right?" on a message goes
to the agent and not to us, support@chipschat.ai has no mailbox, and the repository is private.

`CONTRIBUTING.md` was written for pull requests: sign-off under the DCO for every change, and a
CLA as well for a change to the server or the apps, so the licensor could relicense it (ADR 0128).
The CLA's text and bot were to arrive with the public repository.

Arjun doesn't want code from outside. A person who wants Chips changed can say what they want in
a few sentences, and that's a prompt for the agent that makes the change: what they saw, what
they'd change, and how to tell it's done. Bugs and ideas both fit those three parts.

## Decision

1. **A feedback prompt is an issue on the repository**, from one issue form,
   `.github/ISSUE_TEMPLATE/feedback-prompt.yml`, labelled `feedback-prompt`. Its fields are
   `saw`, `change` and `done`, which are required, `version` and `credit`, which aren't, and
   `grant`, a box to tick that lets the people who make Chips use the prompt, and anything made
   from it, under any licence. Blank issues are off; the new issue page links a security problem
   to `SECURITY.md` and what makes a good prompt to chipschat.ai/feedback.
2. **Pull requests are off** once the repository is public (GitHub's Settings → General →
   Features). `CONTRIBUTING.md` says Chips doesn't take them, says how to send a prompt, and says
   anyone may still fork Chips and change it for themselves, as its licences allow.
3. **No CLA, and no DCO for others.** With no outside code coming in, neither has a job. Our own
   commits are still signed off, and CI still checks it (ADR 0014): it costs nothing and says who
   made each commit. How we work and what CI enforces move from `CONTRIBUTING.md` to
   `docs/working-on-chips.md`.
4. **Everything opens the form.** The apps' You → Send feedback opens it with the Chips version
   filled in (`feedbackLink()` in `packages/core/src/feedback.ts`), or puts a line in the Main
   space's field that asks the Main agent to help write one. chipschat.ai/feedback says what makes
   a good prompt, and chipschat.ai/feedback.md tells any agent how to fill the form's link.
   Chips itself sends nothing: nothing is public until the person posts it on GitHub.
5. **The apps' row waits for the public repository.** One switch in `feedback.ts` keeps it from
   being drawn until then, so no build shows a row that leads to a 404.
6. **Security reports** go to GitHub's private vulnerability reporting as well as
   security@chipschat.ai, once the repository is public. GitHub offers it only on a public
   repository.

## Consequences

- The licences don't change (`LICENSING.md`). The protocol, the SDK and the conformance kit stay
  Apache-2.0, and the server and the apps FSL-1.1-ALv2. Without outside code, the copyright stays
  whole, which is what ADR 0128's CLA was for.
- A prompt's `grant` box is a line a person ticks, not a signed agreement. It needs a lawyer's
  look before the repository is public.
- `credit` is a promise kept by hand: when a change comes from a prompt, its release notes name
  the person, if they gave a name.
- `tools/guardrails/feedback-form.test.ts` holds the form's ids to the ones `feedbackLink()` fills
  and the plan lists, since chipschat.ai/feedback.md fills the rest by those names.
- Dependabot can still raise alerts with pull requests off, but can't open fix PRs.
- Going public is Arjun's: make the repository public, turn pull requests off, turn on private
  vulnerability reporting, create the `feedback-prompt` label, and turn the apps' switch on.
