# 0266. A harness's page on the Mac and the web is the phone's

Date: 3 November 2026
Status: Accepted, 3 November 2026: the phone's page (ADR 0254, Arjun's B) brought to the desktop on
his word of 2 November, "make sure they are parity with phone, highly polished". Where the desk's own
parts stand (point 6) waits on his pick of the mock "Desk parts of a harness's page".

## Context

Arjun, 2 November 2026, with Chips for Mac just installed: "I think the desktop app and web are super
behind ... thoroughly walk through each and make sure they are parity with phone, highly polished."

On the phone a harness's page has been ADR 0254's since 31 October: the head's line ("Connected ·
since 6:55 AM"), New agent and Pause, its first five agents with See all, its own jobs, Set up
(Model, Context files, When it asks you, a row each), History (Recent runs, the budget), and
Restart and Remove at the foot. The pages those rows open are pages of their own.

The desktop's page was still the old card, as the Harnesses tab drew it: the connection checklist
first, When it asks you whole with its picture and three promises, What it may do and Tokens as
buttons, Remove at the foot. It had no agents, no Pause, no runs and no budget bar. Its head ran its
words together ("Connected · since 12:35 AMowned by [You]No live sessions · 1 space"), and the
level said "L2 · ask when it matters" with nowhere to change it. View all drew every harness's
whole card, tokens and checklists and all, one after another.

The words the phone's page says lived in `apps/mobile/src/harnesses/words.ts`, and the desktop had
its own copy of one of them (`rollup`).

## Decision

1. **The page is the phone's.** A tile on the shelf, or a card under View all, opens the harness's
   page (`apps/web/src/app/harness/HarnessPage.tsx`) over the Agents page, with the phone's parts
   in the phone's order and words: the head with its dot and line (why it can't answer; what it is
   doing, in the sidebar's word; back after a restart this page watched; or Connected · since) and
   where it works under it; **New agent** (gold while it can answer) and **Pause** or **Resume**,
   greyed while nothing of it is going; **Agents · N**, the first five, then **See all N agents**
   or **Archived · N**; **Its own jobs** (ADR 0252); **Set up** with its Main agent's Model row,
   **Context files** ("N shared", for its owner) and **When it asks you** ("You decide", "2
   allowed always"); **History** with **Recent runs** ("3 this week") and the budget's bar; and
   **Restart harness…** and, apart in red, **Remove harness…** at the foot, each asked first in
   the phone's words. The old Open space button goes, as the phone has none: the Main agent's row
   opens its card, whose Space opens the room.
2. **Two columns when there is room.** Wider than 760 pixels, its agents and jobs stand on the left
   and Set up and History on the right, with Restart and Remove side by side under them, as an
   iPad beside the Agents list draws it (ADR 0256); narrower, one after the other.
3. **The rows open pages of their own** (`harness/Parts.tsx`), each with its way back: every agent
   with a field that finds one by name or space; its context files, a shared file an agent's page
   points at flashing there; When it asks you whole, with **How far it is trusted** under it for a
   harness that takes the dial, which turns for an owner or admin; and Recent runs, a row each with
   what it was asked, where, when, how it ended and what it cost, opening its space.
4. **An agent opened from these pages goes back to them.** The agent's page joins the stack of pages
   over the list, so its back button names the page under it ("‹ Herald"), as the phone pushes it.
   A page whose harness or agent was removed steps back to what was under it.
5. **View all is the phone's cards.** Every harness's card is the phone's `HarnessCard`: face, name,
   why it can't answer, its level, what it is doing, where it works, Working for, and the context
   and budget bars; a card opens the page. Connect a harness is at the foot for whoever may.
6. **What only a desk has stands under History, for now.** Who owns it (the picker that hands it
   on), the connection checklist, What it may do and Tokens are under a **Connection** heading at
   the foot of the right column. The phone leaves them out on purpose, so it settles nothing here;
   the mock asks Arjun where they belong.
7. **The words are core's.** `packages/core/src/harnessPage.ts` holds what both clients say:
   `harnessRollup`, `AGENTS_SHOWN`, `harnessRuns`, `runsWeekWords`, `RUN_STATE_WORDS`,
   `contextValue`, `asksValue`, `budgetWords` and `REMOVED_HARNESS_NOTE`.

## Consequences

- The desktop's page is two screens shorter for a harness like Herald, and says what it is doing
  first instead of which event types it has sent.
- The level is no longer a sentence on the page: it is the dial on When it asks you, and a line on
  the harness's card under View all.
- The phone still has its own copy of the words in `apps/mobile/src/harnesses/words.ts`; pointing
  it at core's is a phone change for another session.
- The phone's and the desktop's status words still differ for a paused run: the phone says Waiting
  on you, the desktop's sidebar and this page say Paused.
- Tests and specs that opened every card under View all now open the one harness's page from its
  tile or its card.
