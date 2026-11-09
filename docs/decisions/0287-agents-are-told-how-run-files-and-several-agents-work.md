# 0287. Agents are told how Run and Universe work, how to reach a person, and what to do when several are asked

Date: 8 November 2026
Status: Accepted. Arjun, 8 November 2026, on the review of the Health space: "Yes, with Jacobian".
Amends [ADR 0250](0250-a-session-hears-a-spaces-rules-once.md) (the rules a note ends
with) and replaces the line of [ADR 0249](0249-agents-told-a-message-is-for-all-and-handed-more-of-the-room.md)
for a person's message to every agent.

## Context

Arjun built a health dashboard with two agents, Luis on Jacobian and Builder on Claude Code, over
41 runs and $51. It worked, but most of the friction came from what the agents weren't told:

1. **Universe and Run.** The agents didn't know that Open page shows a copy of the project's files
   and can't reach a running program. A page opened from Universe looked empty beside the running
   app. Its links to `localhost` went nowhere on the iPhone. Luis wrote twice that it couldn't tell
   how Chips opens a link, and the agents kept asking for Stop and then Run where Run again does
   both.
2. **Files on the Mac.** Two agents tried four times to reach a zip on the Desktop. Each try hung
   behind a macOS permission box, and Arjun moved the file himself.
3. **Reaching a person.** An agent's words push only those it @s (ADRs 0158, 0198). Nine of Luis's
   messages asked Arjun for something, such as signing in or pressing Run, while @-ing only
   Builder.
4. **Several agents asked at once.** Asked by @ for mocks, both agents built them, and Luis threw
   its set away after 11 minutes and $1.59. Agents start within seconds of each other, so they
   can't talk it over first.

Item 4 can't be a flat rule. Bro chat shows five agents answering one question well, each once,
and Sudoku mini shows three agents building at once because Arjun had said who does what. Telling
agents to split the work first would slow both. And 4 of the 7 messages Arjun had sent to several
named agents were in rooms with no lead, where agents told to agree among themselves would write
four plans.

## Decision

All of it goes in the room note, which the server words. One restart reaches every harness, and
no bridge or SDK release is needed.

1. **Universe and Run** (`RUNNING_WORDS`, after `UNIVERSE_WORDS`, in a space with a project): what
   Open page shows and can't reach, where each kind of link opens, what `localhost` means on a
   phone, and that Run again stops the old program and starts the new one.
2. **Files** (`FILE_WORDS`, in every space): ask the person to attach it, and don't try their
   Desktop, Documents or Downloads.
3. **Reaching a person** (`REACH_A_PERSON_WORDS`, beside other agents): @ them when they need to
   do or decide something, and not for updates.
4. **A person's message for several agents** (`severalAsked`, `TakerNews.several`): each taker is
   told who else has it, and what to do in each case. A question gets its own answer from each. If
   the message says who does what, each does its part. If it is one job with nobody assigned, one
   agent says who does what and the others answer `NO_REPLY` until it does.

   Chips names that one, so that no two agents can each decide it's them: the lead if the message
   is for the lead, otherwise the first agent it named, or the first by name for one sent to
   every agent. It is worked out from the message alone, so every taker on every harness is told
   the same one. This replaces ADR 0249's line for a person's message to every agent, and keeps
   its "don't pass it on with an @". An agent's message to several is left as it was.

The agents decide which case a message is from its words. Chips doesn't, and the composer has no
control for it.

The sentence in the project note that said a start page's links open in Chips now says web links
open in the browser, as they have since the page builder's change of 8 November. That sentence is
in the protocol, which bridges take from npm, so bridges pick it up at their next release. Jacobian
keeps its own copy and was changed with this.

## Consequences

- Rules are resent when their words change (`SessionRules` compares them), so agents in open
  sessions hear these on their next turn.
- A room's rules grow by about 310 characters, and about 460 more where there is a project.
- When one job is left undivided, every agent but the organiser spends a short turn standing by.
  For an agent carrying a very large context that turn is not cheap.
- Tried before it went live, on the prompts the real server wrote for four agents in six cases,
  each given to its own Claude Opus turn with no tools: one job with the lead asked, the lead not
  asked, and All with no lead, a question, divided work, and each making its own. All 17 turns did
  what the case called for. It was not run through the bridges.
- A message that is unclear about which case it is can go the wrong way. The worst outcome is one
  extra turn or some duplicate work, which is what happened before.
- An agent that uses `@` for a person now pushes them. The rule says not to for updates, and a
  person can quiet a room as before.
