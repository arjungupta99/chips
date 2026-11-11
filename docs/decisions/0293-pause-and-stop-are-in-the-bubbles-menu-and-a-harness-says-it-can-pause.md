# 0293. Pause and Stop are in the bubble's menu, and a harness says it can pause

Date: 10 November 2026
Status: Accepted. Arjun, 10 November 2026, on the "Pause and Stop" mock
(https://claude.ai/artifact/ANrwzifw3X1EKcs9QC7pbM): "go with your picks. Please make sure the
functionality works reliably with all harnesses".

## Context

On the Mac and the web, a working space grew a third column, the Run panel (ADR 0151, ADR 0284),
with Pause, Stop, the cost, the context ring and a timeline. Arjun did not want it: "please remove
the right section for desktop and web… Instead I want a pause and stop in the right click / long
press menu". The iPhone and iPad never had the panel, and had no Pause or Stop in a space at all.

Reading the code for the mock turned up a worse problem. Pause marked the run paused and hid the
thinking bubble (`runDoing` gives nothing for a paused run), but no bridge listened for
`run.pause`: not chips-acp (Claude Code, Codex), chips-opencode, chips-hermes, chips-openclaw, or
Jacobian's channel. The agent kept working out of sight. Every one of them did handle `run.cancel`.

The server kept a paused run in `waiting`, the state a run is in while it waits on a person. An
answer to an ask moved it to `running`, and a Resume after that was refused as "not paused".

## Decision

1. **The panel goes.** The Mac and the web draw no third column for a run. The space takes the
   width. Cost stays on "What the run did" and in Spend, the dial and budget on the agent's page.
2. **The bubble has a menu.** On the Mac and the web, right-click (or the menu key on) the thinking
   bubble: its head names the agent and how long it has worked, then Pause (or Resume) and Stop, in
   the message menu's look and keys. On the iPhone and iPad, press and hold the bubble: it lifts
   out of the space as a held message does (ADR 0200) with a card of the same items.
3. **The row has them too, on the Mac and the web.** A space's row menu starts with "Pause Luis"
   and "Stop Luis" while Luis works there, above Change icon and the rest. On the iPhone and iPad a
   held row still opens Change icon.
4. **Stop does not ask.** A right-click or a hold, then Stop, is two deliberate moves, and nothing
   is deleted. The panel's "Stop for good?" was there because the button was always in reach.
5. **A paused bubble stays.** It says Paused, its dots dim, its clock holds, and a flat Resume sits
   in it. The clock counts working time, so after Resume it carries on from where it held. In the
   list the face's pins go back in (ADR 0285) and the row says Paused. "Pausing" or "Stopping"
   shows only while the server has not answered after 300 ms, the beat asks wait.
6. **A stopped bubble folds into a line.** "Luis was stopped by Arjun" stands where the bubble was,
   so everybody in a shared space sees who did it. What the agent did so far stays. Chips's own
   stops (a lane cascading, a budget) leave no line; the run's status line says it ended.
7. **A harness says a run can pause.** `run.status` takes `pausable: true`. A harness that says it
   on a run promises that on `run.pause` it stops that run's work where it is within a few seconds
   without ending the run, that on `run.resume` it carries on in the same conversation, and that on
   `run.cancel` while paused it ends quietly. Clients offer Pause only on a run that said so, Stop
   on every run, and Resume on any paused run (Chips pauses runs itself at a budget's ceiling). A
   server from before this drops the field (ADR 0162), so its runs offer Stop alone, and nothing
   breaks.
8. **What a bridge does.** It says `pausable: true` once, as each run starts, on a status of
   "Thinking…" (a single word and its ellipsis, which no client draws as a thought). On a pause it
   interrupts the agent's turn the way its Stop does (ACP `session/cancel`, OpenCode's abort,
   Hermes's and OpenClaw's own), keeps the session, posts nothing for the half-finished part, sends
   no completion, and waits. On a resume it prompts the same session with "You were paused partway
   through this. Carry on from where you stopped. Nothing you wrote before the pause reached the
   room, so write your whole reply.", followed by anything steered in the meantime. The last
   sentence is there because an agent keeps its half-written words in its session and some pick up
   mid-list from them (OpenCode did, on a real run): the room would get the second half alone.
   A pause that lands before the first prompt or between two holds the next one. A pause while the
   agent waits on a person's answer interrupts nothing, and an answer given while paused reaches
   the agent once it is resumed.
9. **The bridges use the SDK they have.** The SDK on npm is 1.0.4, and a new one is published only
   with a public snapshot, which is the release session's. So a bridge sends that status with
   `chips.send("run.status", { space_id, run_id, actor? }, …)`, the run's own envelope, a public
   call of 1.0.4. The SDK in this repo takes `pausable` in `run.status()`, for when it is next
   published.
10. **The server keeps `paused` as its own state.** `running` → `paused` on `run.pause`;
    `paused` → `running` on `run.resume`; an ask or its answer leaves a paused run paused; it
    still completes, fails or is cancelled from there. A run already `waiting` when this lands
    still resumes from `waiting`.

## Consequences

- Pause holds the agent on every Chips bridge and on Jacobian, and nowhere is it offered where it
  would not.
- The Mac and the web lose what only the panel drew: the live cost and the lanes' cost rolled up
  into the lead's, the context ring, the timeline, the visit picker, and the dial for one space
  ("Autonomy for Scout here"). The phone never had them. The agent's page keeps its own dial for
  the whole agent, and "What the run did" keeps the cost once a run ends.
- Every other Pause follows the same rule: the agent page's Pause (web, Mac, iPhone, iPad) is
  greyed out on a run that did not say it can pause, and `/pause` there says "This agent can't
  pause. /stop ends its work." Resume is never held back.
- Pause appears only with this server. The apps need nothing else from it: with an older server,
  the bubble's menu offers Stop.
