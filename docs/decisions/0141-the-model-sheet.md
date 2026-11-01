# 0141. The model sheet

Date: 9 October 2026
Status: Accepted, 9 October 2026. The phone (Phase 4 of `docs/proposals/agent-model-plan.md`);
the Mac and the web in Phase 5 (the addendum below).

## Context

ADR 0140 put an agent's model and effort in Chips: its harness sends a copy of each agent's,
with the models it may run on and each model's effort levels, and takes a person's change down
its socket. Both harnesses send it now. Nothing drew it.

Arjun picked layout B of the mock (<https://claude.ai/artifact/SaHTfGPQg7Y2u3D2R2PEUT>, six
scenes): one row on the agent's page and one sheet, with the models, a "Same as …" switch and the
effort bars together, and one Save. The plan's rulings (§1) stand over this one: nothing about a
model is Chips', one Save sends both, a model change keeps the level when it can, away is read
only with no queue, a minute with no answer is missed, a refusal keeps the sheet, and the bars
are flat, rising and gold.

## Decision

- **A Model group on the agent's card,** between its facts and its context, for its harness's
  owner or an owner or admin of the workspace, and only while the harness declares `models` and
  has sent the agent's copy. The heading is "Model" with the harness's mark and name at its right
  (and, while the harness is away, when it last said). Anyone else's card has no group, and never
  asks.
- **One row:** a tile with the model mark (a chip, rounder than the Agents tab's, with longer
  pins) on the faces' blue; the model's label; "<Level> effort · <the default's label>" or
  "· its own" under it; the bars at the right, one per level, lit gold up to the agent's; and a
  chevron. Under the group, a foot when there is something the row can't say: how many agents
  follow this one's (J's), and why it can't be changed now.
- **Away or read only, the row is quiet:** grey words, a grey tile, grey bars, no chevron. A tap
  opens nothing: a glass hint at the foot of the screen says "<Harness> is away", or the
  harness's reason ("OpenClaw's own agent. Change it in OpenClaw."), and VoiceOver hears it. The
  tap also reads the copy again, so a harness that has come back opens the sheet on the next one.
- **The sheet,** from the top:
  1. the agent's face, "<Name>'s model", and the harness's name;
  2. the "Same as …" row with a switch and what the default runs on under it, when the harness
     gives a default;
  3. "Model": the models as radio rows, a gold check popping in on the one picked;
  4. "Effort", when the model has levels: the chosen level's name big, "Higher is slower, and
     costs more" beside it, and the bars as buttons, each with its level's name under it (five or
     fewer; above that only the big name);
  5. Save, full width.

  It opens on what the agent runs on now: Same on when it has none of its own. While Same is on,
  the models and the bars show the default's, dimmed, and take no press. Switching it off gives
  the agent both of its own, starting from the default's.
- **Save** is grey until something changed, then gold. Pressed, it shows the chip's running pins
  and "Saving to <harness>" while the harness has the change, then a green check and "Saved"; the
  row behind takes the harness's copy at once, and 650 ms later the sheet goes and the row flashes
  gold. Refused, missed or away, the sheet stays with the picks as they were and a line under
  Save in the harness's words or Chips' few ("<Harness> hasn't answered. It may still change
  it.", "<Harness> is away"). Away, the copy is read every five seconds, and Save comes back on
  with the harness. A new pick clears the line. Put away before an answer, the card reads the
  copy again.
- **The motion is the cool, the controls are flat.** The bars' light sweeps along the bars that
  change, a bar every 50 ms, up as the level rises and down as it falls; in the sheet it sweeps
  up from nothing as the sheet arrives, and the chosen bar stands 6% taller on a spring. The big
  name rises into place as it changes, the check pops, Save's words arrive on a spring, the list
  and the bars dim in 300 ms. Everything runs on React Native's `Animated` and the native
  driver (each bar's gold is a layer whose opacity moves), and Reduce Motion lights them at once.
- **The bars are kept by place, not by level.** A model with other levels relabels the same bars,
  so a light never has to move on a bar that has just gone.

## What is left out, and why

- **A confirmation before changing J's model,** which 21 other agents follow live. The foot says
  how many before the sheet opens; the plan leaves it to him.
- **A foot on an ordinary agent's group** ("Same as J's. Pick one to give Shore Writer its own."
  in the mock). The row's own line says whose it is; core's foot is only what the row can't say.
- **Costs and numbers.** The line under the big name is all.
- **Reading the copy while the card is open.** Chips hears nothing when a harness sends a new
  copy; the card reads it when it comes to the front, as the Context group does.

## Consequences

- Core holds the words and the picks (`modelRow`, `defaultWords`, the sheet's steps,
  `saveModelChange`, `MODEL_GROUND_INDEX`, `MODEL_SAVED_MS`), so the Mac and the web draw the
  same (Phase 5).
- `@chipschat/ui` and the phone's `SYSTEM_ICONS` gain the `model` mark, drift-checked.
- `GroupRow` takes an `off` tone: a setting that can't be changed now.
- `Arrive` (something arriving where it stands, on a spring) moved out of the context editor's
  chrome into `ui/Arrive.tsx`, for Save here too.
- The phone's e2e drives the round trip with a harness played by the test
  (`apps/mobile/e2e/agent-model.spec.ts`).

## Addendum, 9 October 2026: the Mac and the web (Phase 5)

The same group and the same sheet on the desktop, from the same core: the row, the words, the
picks and the save are core's (`agentModel.ts`), and how the bars' light sweeps is too
(`sweepOf`, `EFFORT_SWEEP_MS`, moved out of the phone), so the two clients only differ in how they
look. Files: `apps/web/src/app/model/` (`ModelGroup`, `ModelDialog`, `EffortBars`,
`useAgentModel`).

- **The Model group stands first in the card's side column,** above Heartbeat and Context, in
  the Context group's look: the model tile on the faces' blue, the label, "<Level> effort ·
  <whose>", the bars at the right and a chevron, with the same foot.
- **The sheet is a dialog that grows out of the row** and folds back into it (`GrowingDialog`,
  ADR 0084), with the same parts from the top. The models are a radio group and the bars are a
  radio group, real radios under the rows and the bars, so the arrow keys move along each and
  pick as they go; the switch, or else the model picked, has the keyboard as it opens. Enter
  saves from anywhere in it but the ×, and Escape, the × or a click outside puts it away. When it
  has folded, the row has the keyboard again: only then, since the page behind a modal dialog is
  inert and takes no focus while the dialog is there.
- **Save is `aria-disabled`, not disabled,** while it has nothing to send or waits, so it keeps
  the keyboard through Saving and Saved. Its words carry `aria-live`, and the line under it is a
  status.
- **Only the bars dim while Same is on.** The level's big name and the line beside it are words
  to read, and dimmed they fail contrast; the models dim as on the phone.
- **The model rows are shorter than a card's** (38 pixels), so eight models and the bars fit a
  laptop's window; past that the dialog's middle scrolls and Save stays at its foot.
- **The motion is CSS.** Each bar's gold is a layer whose opacity moves after its own delay from
  `sweepOf`, two frames after the level moves, so the bars are drawn as they were first; the
  chosen bar stands 6% taller on an overshooting curve; the check pops, the big name rises and
  Save's words arrive with the context editor's keyframes; the row flashes with the context
  rows' gold. Reduce Motion stills all of it.
- **Away or read only:** the quiet row is still a button, so the keyboard reaches it; a press
  says why in a capsule at the foot of the window, a status, and reads the copy again.

What is left out: the copy is read again when the window comes back to the front, not when the
harness sends one, as on the phone; a missed answer is covered by the unit tests, not walked.
