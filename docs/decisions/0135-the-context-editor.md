# 0135. The context editor

Date: 7 October 2026
Status: Accepted, 7 October 2026. The phone (Phase 3 of `docs/proposals/agent-context-plan.md`);
the Mac and the web follow in Phase 5 as an addendum.

## Context

ADR 0134 put an agent's context files in Chips: its harness sends a copy of each agent's files and
of its own set, and takes a person's edit down its socket. Nothing drew them. Arjun's rulings stand
over this one: Chips adds nothing of its own, shared says so and opens on the harness's page,
nothing about a harness is written into Chips, eight shown and the rest named, and "the UI looks
like the mock" (<https://claude.ai/artifact/NDCTtC5bqeqXR4fcd6JFKB>, six scenes).

The editor needed one thing checked first: React Native's iOS `TextInput` takes styled `Text`
children, and a caret that drifts in it is worse than plain text. On the iPhone 17 Pro simulator
(7 October 2026), typing at the end, in the middle of a line and inside a word, deleting, and
typing a mark that re-pairs the spans around it each kept the caret where the typing was and lost
nothing, so long as the spans change only colour.

## Decision

- **A Context group on the agent's card,** between its facts and its history, for its harness's
  owner and only while the harness declares `context_files`: a heading with the harness's mark,
  its name and when its copy was read; a row a file, as the harness names it, on the tile its
  `role` picks (`CONTEXT_MARKS` in core: Who it is a spark on violet, how it works a list on
  blue, about you a person on green, memory drawers on sea, any other a page on slate); and a
  tag where a file is not simply the agent's own: **Shared** with the harness's mark, **Its own**
  in gold once it was given one in place of a shared file, **Read only** with a lock.
- **The foot says where they came from,** from what the harness sent and nothing else
  (`contextFoot`): a shared file is shared by so many of the harness's agents and lives on its
  page, linked; files copied from the harness's set for new agents are its own, the set linked.
  Past the eighth file, a quiet last row names the rest and the foot says Chips does not show
  them, with how many the harness has in all.
- **A row opens** the editor for a file that may be changed, the harness's page for a shared
  file (that file's row flashes there), or a page to read for one the harness keeps read only.
  A shared file the harness lets an agent have its own of offers "Give <agent> its own <title>…"
  under the foot, which opens the editor on the shared text with the name filled in.
- **The editor** is one route for an agent's file and a harness's (`/context?agent=|harness=…
  &name=…`): the native back, the file's title, and Save at the bar's right, drawn by Chips
  with the bar's own glass hidden: glass and grey until there is something to save, flat gold
  when there is, the chip's running pins while the harness has it, a green tick once it is
  saved. Under the bar, the file's tile, its name and whose it is; the text in a 22-point card,
  its Markdown's marks dimmed as typed (colour only); a glass capsule at the foot, riding the
  keys up when they come, saying what the file is doing: read at, edited, starts as, saving,
  saved, changed, theirs, couldn't save, didn't take it, away.
- **Saved goes back by itself** a second later, and the row it came from flashes gold.
- **Changed in the harness meanwhile, a sheet asks** whose words stay: the face, the file and
  when, what each side added and took out since the file was opened (`lineChanges`, line by
  line), **Keep mine** (saves over the harness's version) and **Use theirs** (puts the
  harness's words in the editor, saving nothing). Put away unanswered, the person's words stay,
  to save over the harness's. The sheet comes from either refusal: the server's, when the copy
  had already moved (`stale_context`), or the harness's own, when the file changed under it.
- **Away, it reads and does not save.** **Missed, failed:** the words stay and Save is on again.
  Leaving with words unsaved asks once.
- **The harness's page, for its owner,** shows **Shared by its agents** (rows with a few of its
  agents' faces and how many read each) and **New agents start with** (the files each new agent
  is given a copy of, or a line saying what one starts with), whichever has rows first. A file
  there opens the editor where the harness lets it be changed, and the page to read where not.
- **The words go in once the field has its size.** Given them before, iOS scrolled the field to
  show its start in a field of no height, and the first line opened out of sight.

## What is left out, and why

- **The mock's orange identity card on OpenClaw's `IDENTITY.md`.** The bridge says `role:
  identity` for it, as for `SOUL.md`, and the role picks the mark: two rows wear the spark. A
  harness that wants them told apart says another role; Chips does not look at the name.
- **Bold in the editor.** A heavier weight is a wider glyph, and the caret would drift; the mock
  drew its weight as a shadow for the same reason. Ink is enough.
- **A flash when a copy changes on its own.** The page reads the copy each time it comes to the
  front; nothing tells it sooner (ADR 0134).
- **The iPad's split.** The card beside the list opens the editor as a pushed screen; the shared
  file's flash on the harness's page is the phone's only.

## Consequences

- Core holds the words and the marks (`contextFoot`, `harnessGroups`, `notShownWords`,
  `editWords`, `CONTEXT_MARKS`, `lineChanges`), so the Mac and the web draw the same (Phase 5).
- `GroupRow` takes a styled line and a layer under its words (the flash), and a quiet tone;
  `GroupHeading` takes something at its right.
- On the web target the field is given its words plainly (`react-native-web` draws no children
  in a field), and Save goes in the bar's right-hand slot.
- The phone's e2e drives the whole round trip with a harness played by the test
  (`apps/mobile/e2e/agent-context.spec.ts`).

## Addendum, 7 October 2026: the Mac and the web (Phase 5)

The same screens on the desktop, from the same core. How the editor works moved out of the phone
into core (`contextEditor.ts`), so the two clients only differ in how they look: the editor's
model and each step of it (`openEditor`, `typed`, `sending`, `settled`, `keptMine`, `putOff`,
`tookTheirs`, `editorCan`), the save's round trip (`saveContextEdit`), what a file's screen opens
on (`contextOpening`), and where a file's Markdown marks are (`markdownInks`). Each tile's ground
is said as the index a face's ground is sent as (`CONTEXT_GROUND_INDEX`), which each client turns
into its own colour.

- **The Context group stands beside the card's facts and acts** where the agent's pane is wide
  enough, and under them where it is not, so a card with eight files does not push the history
  out of the window. Rows are a desktop's height (46 pixels, as the agents' list), not the
  phone's 52; the card scrolls on its own only past most of the window.
- **The harness's page is its card, alone in the pane,** with a way back to the agent's page that
  opened it; a shared file it was opened for flashes there. Every card in the Agents list carries
  the same Context sections for the harness's owner.
- **The context pages stack over the Agents tab:** a file over an agent's page or a harness's,
  each going back to the page under it, its back button saying which (‹ Shore Writer, ‹ Jacobian,
  ‹ Agents).
- **The editor is a page in the pane.** Save at the bar's right, flat, in the phone's four looks;
  ⌘S saves. The words are drawn twice in one place: marked and dimmed in a layer under the field,
  typed into the field over it, whose own letters are clear and whose caret is not. The two share
  a font, a size and a wrap, so each letter sits on its own; the layer gives the card its height,
  so the field grows with the words and the page scrolls, not the field. The status is a capsule
  at the foot of the pane.
- **The conflict is a dialog,** the sheet's words and its two answers; Escape puts it away, the
  person's words kept to save over the harness's.
- **Leaving asks only when it would lose words typed here,** on the phone too: an agent's own of a
  shared file opened and left untouched goes back without asking (it asked before, though nothing
  had been typed). On the desktop the ask is the confirm dialog, Keep editing or Leave, and
  closing the window or reloading asks as the browser does.
- **The context marks are the design system's:** spark, list, drawers, lock and the more mark are
  in `@chipschat/ui`'s icons, and the phone's drift test now checks its copies against them.

What is left out: switching tabs while editing loses the words, as the Agents tab's pages are its
own (an agent's page always was); the copy is read again when the window comes back to the front,
not when the harness sends one; the Used by faces and a shared file no agent reads are drawn as on
the phone (Phase 4's findings, for Arjun's call).

## Addendum, 7 October 2026: what the acceptance run changed (Phase 6)

The acceptance run (`testing/scenarios/agents/agent-context.md`) found two places where the
editor said or did less than the truth, on the phone and the desktop alike, since both step
core's model.

- **Away comes back.** An editor whose harness went away at a save kept the words but never
  turned Save on again, and a page opened while the harness was away stayed read only, though the
  harness came back (AC-2). While its harness is away, the editor now reads the copy again every
  five seconds (`harnessAway`, `AWAY_READ_MS`), and once the copy no longer says away it steps back
  (`cameBack`): Save is on again for the words typed, and a page opened away takes typing. Save
  stays off while the harness is away. Away at a save says "Your words are still here, to save
  once it's back."
- **Missed says only what Chips knows.** A harness that answers after its minute still writes
  the file, and the server then reads the edit as saved (AC-1). "Didn't take it" was not always
  true; missed now says the harness "hasn't answered", and the words stay. A Save made after such
  a late landing meets the moved copy and asks whose words stay.
- **Used by is a count.** Chips knows how many of a harness's agents read a shared file, not
  which, so the faces beside the count (any three of its agents, AC-4) are gone, on the harness's
  page and the read-only page, on Arjun's call. With ADR 0134's addendum, a Space given its own
  charter is tagged Its own even when no Space reads the default any more (AC-3).
