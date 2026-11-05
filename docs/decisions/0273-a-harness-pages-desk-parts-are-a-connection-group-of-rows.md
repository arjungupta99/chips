# 0273. A harness page's desk parts are a Connection group of rows

Date: 3 November 2026
Status: Accepted, 3 November 2026: Arjun's B of the mock "Where a harness page's desk parts go"
("Go with your recommendations").

## Context

The Mac and the web drew the phone's harness page (ADR 0266). Four of its parts are the desk's
alone, and the phone leaves them out on purpose: who owns the harness (M5.2), the connection
checklist (M1.6), What it may do (ADR 0046) and its Tokens (ADR 0023). They stood under History as a
Connection group: an Owned by menu in its header, the checklist's nine lines open, and two ghost
buttons that unfolded What it may do and Tokens in place. On a window 720 points high, Restart and
Remove were below the fold, under nine lines a person reads once, when they first connect it.

The mock offered three ways: A, one Connection row in Set up opening a page with all four; B, a
Connection group of four rows, each saying what it holds and opening a page of its own; C, the
group behind a fold at the foot. Arjun's rule for the desktop is a page in place before a popup
("I want us to minimise popups in ipad, mac and web where possible", ADR 0272).

## Decision

1. **A Connection group of four rows** stands under Set up, as the page's other groups do
   (`apps/web/src/app/harness/Desk.tsx`, `DeskGroup`):
   - **Owner**, with "You" or the owner's name at its right. For whoever may hand the harness on
     (its owner, or a workspace owner or admin), it opens **Owner**: the workspace's people who
     are not guests, a row each with their face and a tick on its owner, under "Its asks go to its
     owner on any device, unless it names someone else in the space." A click hands it on. For
     anybody else the row says who and opens nothing.
   - **What it sends**, with how many of the checklist's rows have lit and when it was last heard
     ("3 of 9 · heard now"). It opens the checklist, as it was.
   - **What it may do**, with how many of the capabilities Chips draws something for it may use
     ("2 of 12"), for whoever may hand it on. It opens the switches, as they were, with no Close.
   - **Tokens**, with nothing at its right, since the list is asked for only when it is opened. It
     opens the list, Revoke on each and Issue a new token, with no Close.
2. **Each opens a page over the harness's page** (a `harness_part`), with "‹ {harness}" back, as
   Context files, When it asks you and Recent runs do. Nothing unfolds in place and nothing is a
   dialog.
3. **History moves to the left column**, under its agents and jobs, so the two columns stay even.
   In one column the order stays the phone's: agents, jobs, Set up, History, then Connection.
4. **The rows' values are core's** (`ownerValue`, `sendsValue`, `mayDoValue` in
   `packages/core/src/harnessPage.ts`), beside the other rows' values.
5. **The checklist and the tokens' list live with the group** (`harness/Desk.tsx`), so the pages
   import them without importing the Agents page. Add harness's dialog keeps lighting the same
   checklist.

## Consequences

- The whole page fits a 720-high window with its foot, and each desk part says what it holds
  before it is opened.
- Tokens are two clicks from the page instead of one; a token is issued or revoked rarely.
- Specs and tests that opened the tokens or the switches in place open their rows instead.
- The phone still has none of these, on purpose.
