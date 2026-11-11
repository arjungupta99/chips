# 0290. Somebody with no agent is asked what they have and shown the maker's steps

Date: 10 November 2026
Status: Accepted. Arjun, 9 and 10 November 2026: build the written steps first ("build A"),
"Neither" leads to a free ChatGPT account with Codex, the first question is about what they pay
for, and OpenCode is not the suggestion.

## Context

ADR 0288 made the gallery look for agents on this Mac and gave every stop the maker's own line. A
person with no agent still met a gallery that says "Pick the one you already run", five names, and
Skip. Nothing told them which agent would work for them or how to get it before Connect failed.

The "Chips From Zero" mock (https://claude.ai/artifact/1ZLs4sBMx87W7kxP1Xui1s) offered two ways:
written steps (A), and a card that follows along while the person runs them (B), built on A.
Arjun's earlier call stands: Chips does not install an agent or run its sign-in. The person runs
the maker's own installer and sign-in.

## Decision

1. **One more row.** Where some card has written steps, the welcome's gallery ends its cards with
   **I don't have one yet**: "We'll suggest one and show you how to get it".
2. **One question.** "Which of these do you already have?", with one answer for each card with
   steps, in the docs' order: *I pay for Claude* (Claude Code), *I use ChatGPT* (Codex), then
   *Neither of those*, which suggests a free ChatGPT account with Codex. What they pay for decides
   which agent will work for them, so that is what is asked.
3. **The maker's steps.** The answer's card shows its steps, each a sentence with the line to run
   under Run in Terminal, or the maker's page to open. For Neither, making the account comes
   first. Chips for Mac says the steps run in this Mac's Terminal and how to open it; a browser
   says they run on the computer the agent will run on. Connect then goes on to the card's own
   page, as picking the card does, and Back retraces each step.
4. **The steps are the docs'.** A card's `start` in `connectors.json` holds the answer, the
   suggestion and the steps, and one card's `none` holds the answer for somebody with none of the
   others. Chips names no agent itself (ADR 0171), so the app carries only the words around them.
   The site's chipschat.ai/setup reads the same file, so the two say the same. (/start is the docs'
   Start here.)
5. **Claude Code's adapter is a step.** Until Anthropic answers ADR 0288's question, Connect does
   not fetch Claude Code's adapter, so its steps end with the bridge's own npm line and say that it
   needs Node.js. When the fetch is turned on, that step comes out of `connectors.json` with no app
   release.

## Consequences

- The question and its answers reach people with the next computer release, which carries the
  cards. Older apps read the cards and leave `start` out.
- OpenCode, OpenClaw and Hermes have no steps, so they have no answer. They stay in the gallery as
  before.
- **The phone (10 November 2026).** The phone runs no Chips and no agent, so it hands the setup
  page to a computer, as the mock's phone row and hand-off page do:
  - Its first screen's ways in end with **Nothing set up yet?** and Start, in place of the line
    that linked the download page. It opens **Chips starts on your computer**: the
    chipschat.ai/setup link to copy (Handoff carries it to a Mac's clipboard) or send to oneself,
    then Scan a QR code for when the computer shows one, and Look around meanwhile.
  - A paired phone's Connect a harness ends the cards with I don't have one yet, saying
    "chipschat.ai/setup says which one to get and how", and opens that page. It shows where some
    card has steps, as the welcome's row does.
- Claude Code's path on a new Mac still asks for Node.js, until Anthropic answers.

## Addendum, 10 November 2026: the steps follow along on Chips for Mac (option B)

Arjun: "build / fix all the items you just listed", the card that follows along among them. Built
to the mock's option B, on top of A:

1. **Each step can say how it is seen done.** A step's `done` in `connectors.json` is `program`, a
   command the step puts on the PATH, or `signedIn`. Claude Code's are `claude`, signed in, and
   `claude-agent-acp`; Codex's are `codex` and signed in. Making an account has none.
2. **Chips only looks.** Chips for Mac looks every three seconds while the steps are open and
   whenever its window comes back: the programs on the login shell's PATH (`programs_here`), and
   the agent's own status command for the sign-in (`signed_in_here`), from a list in the app by the
   card's id: `claude auth status` reads `loggedIn`, and `codex login status` succeeds. A card names
   which agent it is, never a command, and what the person signed in as is never read.
3. **What the person sees.** A step ticks green with what Chips saw ("Chips sees it on this Mac",
   "Signed in") and its line folds away; the one under way wears a gold ring and says "Chips is
   watching for this"; a step Chips can't see takes I've done this, and counts as done once a step
   after it is. Connect stays under them throughout.
4. **On to Connect.** When the last step ticks off while the page is open, it says "All done.
   Connecting…" and goes on to the card's Connect, which starts by itself. Steps all done at the first
   look, as on coming Back, wait for Connect to be pressed.
5. **A browser stays with A.** It can't look at the computer the steps run on.

