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
- The phone's way in for somebody with nothing set up (a row that sends them to chipschat.ai/setup)
  and the card that follows along (B) are later pieces.
- Claude Code's path on a new Mac still asks for Node.js, until Anthropic answers.
