# 0265. You on the Mac and the web is the iPad's split

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's "Build A".
Mock: You on the Mac, today's beside A, B and C (sent in the session, not published).

## Context

You on the web and in Chips for Mac was a column of cards, each holding its whole page: the People
roster with every person opened under their row, the invite form and its links, the relay and its
devices, the three message limits, the attachment caps with their Save. For an owner it was 3,292 px
tall, four and a half windows of scrolling, in an order of its own and with words of its own: the
role said "Owner" where the phone says "Owner · Demo", the log was a table on a page of its own
behind a card's Open (ADR 0261), and Sign out sat halfway down.

The phone's You is a settings list (ADR 0085), in the order its addendum of 20 October 2026 set:
each row a mark, a label, what it is set to, and a chevron to what sets it. Since 1 November the
iPad stands that list in a column with the row's page beside it (ADR 0256's addendum, 3), and the
phone's sheets as sheets over it.

The mock drew today's You beside A, the iPad's split; B, the phone's list in one column with pages
in its place at every width; and C, today's cards in the phone's order and words. He chose A.

## Decision

1. **The list and the page beside it.** You is the list in a column 340 px wide, and beside it the
   page its row opens, under the page's name. Before any row is chosen the page says "Nothing open"
   and "Choose a row on the left." The row whose page is open wears the chosen ground. Where You is
   narrower than 720 px (the Mac's window at its narrowest leaves it 660), the list stands alone and
   a row opens its page in the list's place, with **‹ You** at its top (`useSplit`, `Pane`).
2. **The phone's order.** You and your workspace in one card: your face, your name as a field,
   "Owner · Demo" under it (a guest's one space instead), and a Workspace row that opens a form
   with the workspace's name, an owner's to change, and the other workspaces on this device to
   switch to. Then Notifications; Appearance; under the workspace's name, with "Owners and admins"
   beside it and only for them, People, Invite someone (an owner's), Relay (an owner's, where the
   server has one), Connect a harness, Attachment limits, Messages between agents, Allowed always
   and Workspace log; then This computer (This browser in a browser) with Server, Connection and
   Version; Send feedback; Devices, with Pair another device; Passkeys where one can work; and at
   the foot Sign out, in red, with Delete your account under it.
3. **Pages and forms.** People, a person from People, Invite someone, Relay, Connection and the
   workspace's log are pages. The shorter settings are forms grown out of their row over the list,
   as the iPad stands the phone's sheets: Workspace, Decisions, Finished work, Checkpoints, Quiet
   hours, Agents, Attachment limits, Messages between agents, Allowed always and Pair another
   device. A form's head is the sheet's: × to close, its title, and Save where the form saves; a
   form of one choice saves as it is picked. Delete your account keeps its dialog.
4. **A person's page.** Their face and name, since when and by whom, and their role's tag; what
   they can do; their role here (the picker where the reader may change it) and the link they came
   by; the spaces you share; their devices with Reconnect… and Sign out where the reader may; New
   phone… and Remove…. Removed while it is open, on any device, it goes back to People.
5. **The log as rows.** A page is a column, not a window's width, so each decision is a row: what
   was decided, and under it when (the day too, before today), who, and the space, which opens it.
6. **Words both clients say are core's.** The role line (`standingWords`, `guestStandingWords`),
   the notification rows' values (`DECIDE_WORDS`, `REVIEW_WORDS`, `FYI_WORDS`, `HEAR_WORDS`,
   `quietWords`, `quietSub`, `agentsWords`), Attachment limits' value (`capsWords`) and the
   Connection row's (`WAY_VALUE`).
7. **What the web keeps that the phone has not.** Passkeys, where a browser can hold one; the
   Workspace log; Finished work and Checkpoints, which the open app raises as banners and a phone's
   pushes never do; Banners on this computer (in this browser), the switch for this workspace
   here; and the browser's own
   leave, a row with Allow banners here while it has not been asked.
8. **Away from home.** The setup card's Away from home (ADR 0245) opens Relay beside the list and
   lights its card, as it lit the card in the column before.

## Consequences

- An owner's You is a list with nothing open inside it, and what a row opens is one click away,
  beside it. The roster, the invite form and the relay are each a page instead of a card.
- Every row opens its page or form first, so the tests that used a card's insides open its row:
  `openYouRow`, `openPerson` and `openLog` in `apps/web/e2e/support.ts`, and `openYouPage` in
  `testing/join-and-remove/support.ts`, which also comes back to the list where a page stands in
  its place.
- Your face has no picker on the web yet: it shows, and is changed on the phone. The same picker
  would let a space's and an agent's face be chosen on the Mac; it is its own piece of work.
- The phone is unchanged. Its own copies of the words in point 6 (`apps/mobile/src/you/words.ts`)
  can move to core's in a phone change.
- Shell no longer has an Audit page. The sidebar's `Tab` still names `"audit"`, and lights You for
  it; that file is the sidebar's to tidy.

## Addendum, 3 November 2026: every form is a page

Arjun, in Chips for Mac: "I am seeing a lot of items in You tab opening as a popup please have them
open in the side panel, same for web if its the same". It is the same code. It is also what he
asked for the face picker: "I want us to minimise popups in ipad, mac and web where possible"
(ADR 0272).

1. **A form is a page.** Point 3's forms open where a page does: beside the list, or in its place
   with **‹ You** where You is narrow. That covers Workspace, Decisions, Finished work, Checkpoints,
   Quiet hours, Agents, Attachment limits, Messages between agents, Allowed always, Pair another
   device and Send feedback. Their bodies are unchanged. The bar is a page's: the form's name, and
   ‹ where there is a way back. Attachment limits and Messages between agents save only when told,
   so Cancel and Save stand at the foot, and Enter in a field is Save. The other forms save as
   they change and have neither.
2. **One change, not twelve.** `FormDialog` became `FormPage`. It draws into a slot its host gives
   it (`FormHost` in `pane.tsx`), so every form moved at once, and a new one can't come back as a
   popup. You holds the host for its list. A page holds one for what it opens itself, and that form
   stands in the page's place with ‹ back to it: Go direct from Connection, and Turn the relay off
   from Relay.
3. **One thing open.** A form opening closes the page open, and a page opening from the list
   closes the form. A form opening in another group closes the one open. The row whose form is open
   wears the chosen ground beside the list, as a page's row does.
4. **The keyboard.** Opened, a form gives the keyboard to its first field or choice, or else to
   its name. Closed by its own hand (‹, Cancel, Save, or a choice that is the whole form), it hands
   the keyboard back to its row once the list is drawn again.
5. **Delete your account.** What goes and what stays is its page, with Delete your account at the
   foot. The button asks the last time in a dialog: the workspace's name typed, then Delete, or
   Keep it to go back to the page. The only owner's page says how the workspace itself is deleted,
   and has no button.
6. **What stays a dialog.** A short yes or no before something that can't be undone: signing out
   the devices not seen for a month, Remove… on a person, and the last step of Delete your account.
   The yes or no after a role is chosen on a person's page stays one too. It answers a choice just
   made on that page and says what the person will see, so a page of its own would take it away
   from the choice. Also what arrives unasked: somebody asking to go direct (`DirectAskDialog`). It
   comes from another person, on whatever screen is open, and it waits for an answer. A page would
   put it behind You's list, where nobody is looking.

The phone and the iPad are unchanged.

## Addendum, 3 November 2026: You moves

Arjun: "everything should have smooth transitions and look highly polished", on the web and in
Chips for Mac.

1. **Views move as one vocabulary.** The list, each page beside it, a form's page and Nothing open
   are views (`data-view`, `you/motion.ts`). A view one level deeper (a person from People, Go
   direct from Connection, Turn the relay off from Relay, and where You is narrow any page from the
   list) slides in from the trailing edge over the view it covers, which drifts a quarter of the
   way back and dims, as a navigation push does on the iPad. Back is the same move the other way.
   Another row's page beside the list, or Nothing open, crossfades, as the phone's `Swap` does.
   You itself fades in as it opens. The iPad's Settings changes the page beside its list in a
   frame; the crossfade is the phone's own answer for words that change in place, taken here for
   the page.
2. **What goes is drawn going.** React has taken a view away or hidden it by the time it is seen
   to go, so it is drawn once more where it stood, at the scroll it had: a copy no one can reach
   (no ids, no test ids, inert), in a layer React never draws.
3. **Nothing jumps in place.** Inside a view that stays, the groups, rows and cards a change moved
   (Quiet hours' times under its switch, a fold opened, a line that wrapped, devices read after the
   list was drawn) slide from where they stood, and the ones it brought fade in.
4. **Rows settle.** A row's value and the line under it crossfade to what they were just set to,
   by `Swap`, moved out of the room's `Doing` to be shared. The tick in a list of answers fades and
   grows into the one picked. Rows, answers, the way back and the feedback choices show hover and
   press on `--motion-fast`.
5. **One clock.** Durations are the tokens: `--motion-fast` (120 ms) for what goes and for hover,
   `--motion-base` (200 ms) for what comes, `--motion-slow` (300 ms) for a slide or a move, on
   `--ease`. The person page's lines, the invite's faces and the issued link moved onto them, and
   People's rows no longer rise one by one under a page that is already moving.
6. **Measured, and still when asked.** Only transform and opacity move, by the Web Animations API.
   In Playwright's WebKit, frames logged with requestAnimationFrame over 24 changes at 1280 and 900
   wide, light and dark, run at about 60 a second. The one or two long frames a change brings (26
   to 42 ms) fall at the click, while React draws the new page, before the move starts. With less
   motion asked for nothing moves and no copy is drawn, and `Swap` changes words at once, where
   before it left the words going drawn under the new ones.
7. **Banners tell the truth.** In a browser a banner needs the person's word and the browser's
   leave, so the two are one switch, as the phone's Notify me is: on only while a banner can be
   raised. A browser that refused shows it off and held, with where to allow it under it; one not
   asked yet shows it off, and turning it on asks. Before, the switch said on above a line that
   said off, with the browser's refusal on a row of its own.
