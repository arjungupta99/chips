# 0255. The dots on When it asks you open every ask

Date: 1 November 2026
Status: Accepted, 1 November 2026, on Arjun's "Build A". Mock:
<https://claude.ai/artifact/7RgGMSggKwvndu6W8rC4Vm> (option A).

## Context

Arjun, 1 November 2026: "The Harness details --> When it asks you page shows green / red dots at
the bottom, currently it does not provide any useful info, I'd like to be able to tap it and see the
asks, plan this out and show mocks first", and "everything should be polished".

The dots came with ADR 0195: one per ask the reader can see, the last 30, green for a yes, a green
ring for a yes for the session or always, red for a no, grey for one nobody answered and an amber
ring for one still waiting, with a line under them ("12 asks since 23 October · all answered by
you"). Nothing on the page said what the colours meant, the dots opened nothing, and the line did
not say how many were a no. Claude Code, on Arjun's server, had asked 12 times on 23 October, from
seven of its agents in five spaces, and he had said no to 4 of them.

The mock drew today's page beside three ways in, all with the same Asks page and the same ask
opened whole: A, a tap on the dots pushes the page; B, the newest five open in place under the
dots, each dot dropping into its row; C, a finger slid along the dots raises each ask over them. He
chose A, the cheapest.

## Decision

1. **Asks so far.** The dots get a heading, **Asks so far**, with **See all** at its right, a key
   under them that counts every ask by how it ended ("8 yes", "4 no", "1 unanswered", "1
   waiting", only those there are), and the line as before. The whole block is one press that
   opens every ask. Core's `harnessAskKey` counts them.
2. **The Asks page** (`/harnesses/[id]/asked`, a part beside Recent runs; ADR 0254). Every ask of
   the harness that the reader can see, newest first, under its day ("Today", "Yesterday",
   "Friday 23 October"). **All, Yes and No** stand at its top, with their counts, when the asks
   are not all one or the other; nobody answering is a no unless the ask's fallback let it
   through, and an ask still waiting is under All alone. Core's `askRows`, `askFilters`,
   `rowsUnder` and `byDay`.
3. **A row** is the dot it was, grown into a mark with a tick, a cross or a clock; the ask's own
   words in two lines, its `code` in mono (its question, else its preview's title, else what its
   kind does, "Apply changes", and its kind only when Chips has no words for it); the answer in
   its colour and who asked where, "You said no · Thea in Memory match again"; and its time.
   The answer says who and how far: "You said yes for the session", "Dana said no", "Policy said
   yes", "Claude Code said yes in its own tools", "Nobody answered, so it was denied", "Waiting for
   you". Core's `askAnswer`.
4. **An ask, whole.** A row opens the ask's own screen (`/needs/[id]`). An ask not waiting on the
   reader is drawn whole and read only (`Answered`): who asked, where and when; the question,
   its effect, its preview, how long a yes lasts and its risks, as its card drew them; the answer
   and when it came, "You said no" over "At 5:37 AM, 4 minutes after Thea asked."; and **Open in
   Memory match again**, which lands on the run the ask belonged to (`?at=run:`). An ask still
   waiting on the reader opens `Decide`, to be answered, as before. The same screen now shows a
   card's ask that somebody answered while it was open, where it said "Not here". Core's
   `findAsk`, `askVerdict`, `askedAtWords`.
5. **On a wide screen** the Asks page opens in the Agents tab's pane and goes back to When it asks
   you (`PART_FROM`).
6. **The web and the Mac.** The harness card's Asks so far is a button that grows a dialog out of
   itself (ADR 0084), with the same rows, days and filter. A row opens the ask whole in the same
   dialog, with Back to the list; Open in its space folds the dialog away and opens the space.

## What is left out

- B's fold and C's slide, which cost half a day and a day more.
- You's Allowed always sheet keeps its dots as they were: it counts every harness's asks, and the
  ask was about a harness's page.
- The web opens a space at its top, as everywhere else on the desktop: it has no way yet to land on
  a run.
- Claude Code's questions read as raw commands ("Allow it to grep -noE …"), because its bridge sends
  "Allow it to" and the command as the question. Each ask carries the agent's own one-line
  description in its input, which only the preview shows. Sending that as the question would make
  these rows and the room's card read better; it is a bridge release of its own.

## Consequences

- The ask screen is no longer only for what waits on the reader: an id in the model always draws
  something, and "Not here" is left for an ask the reader cannot see.
- Rows are read from the model the phone already holds; nothing new is asked of the server.
- Tests: `asksSoFar.test.ts` (core), `parts.test.tsx`, `Profile.test.tsx` and `NeedsScreen.test.tsx`
  (phone), `Asking.test.tsx` (web), and end to end `asksSoFar.spec.ts` (phone) and
  `when-it-asks.spec.ts` (web).
