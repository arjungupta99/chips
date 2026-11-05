# 0270. An agent's page on the Mac and the web is the phone's card

Date: 3 November 2026
Status: Accepted, 3 November 2026: the phone's card (ADR 0087, Phase 5) brought to the desktop on
Arjun's word of 2 November, "make sure they are parity with phone, highly polished".

## Context

Arjun, 2 November 2026, with Chips for Mac just installed: "I think the desktop app and web are super
behind ... thoroughly walk through each and make sure they are parity with phone, highly polished."

On the phone an agent's card is a page of grouped rows: its face and name, then Space, Since (or Was
there), Forked from, Now, Belongs to and Waiting, a row each with its value at the end; Lock
changes; its Model, Heartbeat, Context window and Context files; a Message history row that opens
its history on a page of its own; and its acts as rows. Put, Move and Fork open a picker that says
what the act does ("It's in one space at a time, so it leaves the one it's in"), offers a new space
to whoever may open one, and lists the reader's spaces with their faces.

The desktop's card was a short block of facts run together on two lines, with the groups beside it,
and its history under it in whatever height the card left. Moving or forking an agent was a menu of
spaces with a button beside it ("Move", "Fork", "Put it there") and nothing said about what it does.
Archive and Delete were two small buttons under the facts.

## Decision

1. **The card is the phone's.** An agent's page (`apps/web/src/app/Agents.tsx`, `AgentPage`) draws
   its face and its name, edited in place, with its harness under it; then its facts as rows (Space,
   Since or Was there, Forked from, Now, Belongs to, Waiting), Lock changes, Model and Heartbeat;
   and Context window, Context files, History and its acts. The rows are `GroupRow`, the same as a
   harness's page (ADR 0266). The whole card scrolls.
2. **Two columns when there is room.** Wider than 760 pixels, what it is stands on the left and what
   it holds and what may be done with it on the right; narrower, one after the other.
3. **Message history is a page of its own.** A row with how many spaces it holds ("2 spaces") opens
   it (`agent/AgentHistory.tsx`), with its way back naming the card ("‹ Wren"), opening at its
   newest line as before.
4. **Put, Move and Fork are rows that open the phone's picker.** Each row ("Move to another
   space…") grows a dialog (`agent/RoomPick.tsx`) with the phone's title and line, **A new space
   with it** (or **with the copy**, named as the copy will be) for an owner or admin and never for a
   move, then **Your spaces** with their faces. A click acts; a refusal is said in the dialog.
5. **Archive, Unarchive and Delete are rows**, Delete apart in red, each asked first as before.
6. **A fact's dates hold their place.** Since's dates are an empty value while the server is asked,
   so the row is drawn once and nothing under it moves when they come.
7. **The words are core's.** `packages/core/src/agentCardWords.ts` holds the picker's rows, titles,
   lines and rooms (`ROOM_PICK_ROW`, `roomPickWords`, `pickableRooms`), the history row's value
   (`historyRoomsWords`) and what is said when the server can't say where an agent has been
   (`staysFailedWords`).
8. **An agent's pages take their service from a file of their own** (`agent/service.ts`), so the
   card, its history and its picker import it without importing the Agents page.
9. **Beside Search's results** (ADR 0269), where there is no stack of pages, the history opens in
   the card's place and its way back returns to the card (`agent/AgentPane.tsx`).

## Addendum, 3 November 2026: its face

Once the face picker came to the desktop as a page (ADR 0272; Arjun: "I want us to minimise popups
in ipad, mac and web where possible"), the card takes the phone's two ways to its face (ADR 0089,
0174): for anybody but a guest (`mayFace`), the face at its head is a button, and an **Icon**
section under Lock changes has one row, the face at a row's size and what it wears ("Default",
"Cup on Teal"). Both open **Icon**, a page over the card with "‹ {name}" back, holding the
picker with the agent and its harness at its head (`agent/AgentFace.tsx`). A pick is saved for
everybody through `store.setAgentFace`; one the server turns away puts the old face back and says
why at the top of the page. Beside Search's results the page opens in the card's place, as the
history does.

## Consequences

- Moving or forking an agent says what it does before it is done, and a fork's new space is named
  before it is made.
- The history no longer shares the card's height: a long card and a long history each scroll whole.
- Specs and tests that read the history under the card open it from the Message history row.
- Still not the phone's: its archived agents are a fold, not a page with Select; and the history
  has no day lines.
- The phone still has its own copies of the picker's words (`RoomPicker.tsx`) and of why the server
  can't say where an agent has been (`stays.ts`); pointing them at core's is a phone change for
  another session.
