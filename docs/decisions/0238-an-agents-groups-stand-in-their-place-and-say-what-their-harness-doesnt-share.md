# 0238. An agent's groups stand in their place while they load, and say what their harness doesn't share

Date: 27 October 2026
Status: Accepted, 27 October 2026. Arjun: "Under Agent details, Context window and context sections
do not appear for Hermes and claude code can we add? Also for codex", and "these sections load
after a delay … what can we do to improve, without slowing down other things, Or atleast show a
cool loading state". On the mock (`https://claude.ai/artifact/CZjwUA5ijnThHq9sqaV86R`): "if some
feature is unavailable, then we should say so in the UI", then "proceed, and loading design B". It
builds on [ADR 0135](0135-the-context-editor.md)'s Context group,
[ADR 0141](0141-the-model-sheet.md)'s Model group,
[ADR 0143](0143-an-agents-heartbeat-is-its-harnesss-switched-and-timed-in-chips.md)'s Heartbeat
and [ADR 0146](0146-an-agents-context-window-is-its-harnesss-shown-and-compacted-in-chips.md)'s
Context window.

## Context

An agent's card draws four groups from its harness's copies: Model, Heartbeat, Context window and
Context. Two things were wrong with them.

1. **They were missing for three harnesses, with no word why.** Only Jacobian and OpenClaw declare
   `context_files` and `context_windows`; the Hermes bridge and the ACP bridge's Claude Code and
   Codex declare neither, so their agents' cards had no Context or Context window group, and nothing
   on the card said so.
2. **They arrived late, one by one.** Each group read its copy when the card opened and drew
   nothing until it came. The server answers these reads in well under a quarter second; the wait
   is the trip to the phone. On a phone the four dropped in one after another and pushed History
   off the screen. Model and Context kept their last copy while the app ran, so a second visit drew
   them at once, but Heartbeat and Context window kept nothing and dropped in between them again.

## Decision

1. **The bridges share both.** The ACP bridge (`chips-acp` 1.0.4) gives Claude Code and Codex agents
   their files and windows, and the Hermes bridge (`chips-hermes` 1.0.5) its agents' files and, from
   a webhook it adds to Hermes's config, how full they are. The gallery's Claude Code, Codex and
   Hermes cards grant `context_files` and `context_windows`. Chips adds nothing of its own (ADR
   0134): each bridge lists what its harness really gives the agent, and says what it can't do in
   its own words (`why_not`, `why_read_only`), which the group already shows.
2. **A harness says when its agent reads its files.** An agent's context copy may carry
   `read_note`, the harness's sentence for the foot under the files, where it doesn't give them at
   the start of every turn: "Hermes reads these when a conversation starts. A space already talking
   picks up a change after it next compacts." Absent, the foot says what it said before. Kept in
   `context_sets.read_note` (migration 0055).
3. **Every group is kept while the app runs.** Heartbeat and Context window keep their last copy as
   Model and Context do, so the card opened again draws all four at once and reads them again
   quietly.
4. **A group on its way stands in its place (the mock's B).** Before its first copy, a group the
   person will see draws in its real shape: its heading in words with its harness beside it, its
   rows as flat blank bars where the words will be, held still. Nothing under it moves when the
   copy lands. Only the Context window carries motion while it waits: a light runs along its bars,
   one after another. When its copy lands the fill climbs to it and the number counts up with it; a
   copy kept from before draws at its level at once, with no climb. Under Reduce Motion the bars
   stand lit and still and nothing counts.
5. **A group the harness doesn't share says so.** To the people who may see the groups (the
   harness's owner, or an owner or admin of the workspace), a group whose capability the harness
   doesn't declare keeps its heading with one quiet line: "Codex doesn't share Milo's model with
   Chips." On an agent's card only; a harness's page still shows only what it has. A Context window
   the harness declares but holds no copy of yet says "Claude Code hasn't said how full Nova's
   context is yet." A read that gets no answer leaves the last copy, or no group, as before.
6. **One core rule for both apps.** `settingLook` (core's `agentSettings.ts`) says which of the
   four a person sees, which the harness doesn't share and which is hidden, with the words for each.
   A read refused because the server holds no copy carries its status (`noCopy`).

## Consequences

- An agent of every harness Chips connects to has all four headings on its owner's card, each with
  its group or a line saying why not.
- The first open of a card shows its shape at once and fills in place; every later open in the
  same run of the app is instant. Copies are not kept on disk: a first open after a launch still
  waits for the trip, standing blank.
- An agent's Context window reads the space it last worked in: each space is its own conversation
  in Claude Code, Codex and Hermes, with its own fill, and the copy is one per agent.
- Hermes's fill needs one restart of its gateway after the bridge adds the webhook, and Hermes's API
  server can't be asked to compact: Compact now is quiet with Hermes's reason, and its limit is set
  for every agent on the profile, read only.
- Tests: core's `agentSettings.test.ts` and `context.test.ts`; the server's `agent-context.test.ts`
  and the migrator's; the phone's `WindowGroup.test.tsx`, `HeartbeatGroup.test.tsx`,
  `model.test.tsx` and `context.test.tsx`; the web's `window.test.tsx`, `heartbeat.test.tsx`,
  `model.test.tsx` and `context.test.tsx`.

## Addendum, 28 October 2026: a copy comes in over its blank

Arjun, on the build with this live: "The context still appears to appear abruptly after it loads,
it needs to transition appear in". Two things made it a jump. The copy replaced its blank in one
frame. And a group's copy is often a different height from its blank: the Context group stands
with three blank files, and Hermes sends four, so History and everything under it jumped down a
row as the files landed. Decision 4's "nothing under it moves" held only for groups whose copy
matched their blank.

1. **The copy comes in over its blank.** When a group's first copy lands where its blank stood,
   its heading stays where it is and what is under the heading fades in over 200 ms, the card's
   ease-out curve. On the phone the blank holds while the copy comes in and then fades from under
   it, so the group's ground never thins between the two. A "hasn't said yet" line that takes a
   blank's place comes in the same way.
2. **The group grows to its copy's size, and what is under it moves with it.** On the phone each
   group stands in a place of its own that takes its new size on `GROWS`, clipped, and History and
   the acts under it move on the same clock. On the web the group's own height runs from its
   blank's to its copy's, clipped, so the card below follows it.
3. **A copy already kept draws as it is.** A group drawn from a kept copy on the card's first frame
   doesn't fade, and a copy read again doesn't fade either. Under Reduce Motion the copy is
   there at once.

Built in `ui/growing.tsx` (`GroupPlace`, `Stands`, `Lands`) and `useStood` on the phone, and in
`useLands` with `.ctx.lands` on the web. Tests: the phone's `Waiting.test.tsx`; the web's
`window.test.tsx`. The motion was filmed on the phone's web export and in the web app, each with
its reads slowed.
