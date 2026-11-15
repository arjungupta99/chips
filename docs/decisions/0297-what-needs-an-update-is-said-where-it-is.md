# 0297. What needs an update is said where it is

Date: 13 November 2026
Status: Accepted, 13 November 2026, on Arjun's picks from the mock (`chips-notes/mocks/in-step`):
"yes, build them", after he asked for "Needs update" in place of "behind", the update dot animated
on each row, no dot on a row that has its own Update button, and the dot kept clear of the `›`.
Builds on ADR 0296 (the gold dot), and on `docs/proposals/everything-in-step.md` and
`docs/proposals/bridges-keep-current.md`, whose parts people don't see were built first.

## Context

The computer now knows what every app and bridge runs (`GET /v1/software`), keeps the bridges in
its own data folder current, and can update itself at night when it came from the install line.
None of that was on a screen. An owner couldn't see that a bridge couldn't update, that a bridge on
another machine had fallen behind, or that somebody's phone was two releases back; and an app
skipped any event a newer computer sent without a word.

## Decision

1. **About's Needs update list, for the owner.** Under Updates, a group headed "Needs update" lists
   only what needs someone: a bridge that couldn't update (and why), one whose updates are off with
   a release out, one on another machine that needs `chips connect --update` run there; then each
   iPhone, iPad and Mac whose Chips is older than what is out, by whose it is ("Natalie's iPhone",
   "Your Mac"). Not this device, which Updates shows already, and not one unseen for thirty days.
   Each row wears the update dot at its end, landing and breathing as the one at the top does, in a
   box as wide as its glow so neither the glow nor its ring reaches the chevron; a row that opens
   nothing keeps the chevron's room, so the dots stand in a column. A bridge's row opens its
   harness page. The group is gone when nothing needs an update.
2. **The night switch.** For a computer from the install line, a row "Update it at night" under the
   computer's own, off until its owner turns it on (`PUT /v1/server/self-update`). The line under
   it says what it does, or how the last night went ("Updated to 1.2.6 last night", "Couldn't
   update last night. … Still on 1.2.5. It tries again tonight."). The computer's Update button
   there shows `chips update` to run on it, with Run in Terminal on the Mac and the web, and Copy
   on a phone. A row with an Update button has no dot: the button says it. Chips for Mac's own
   server never shows the switch; it updates with the app.
3. **A bridge's line on its harness page.** A Bridge group with one line of seven states:
   updated (green), a release ready and waiting for a quiet moment, starting it (both a still blue
   dot: they fix themselves), couldn't update because it didn't come back, couldn't update for a
   reason Chips names, updates off with a release out, and a bridge on another machine with the line
   to run there (these four wear the breathing gold dot: the owner has something to do). npm out of
   reach and a busy folder pass on their own and don't ask anyone. Under it, for the owner, the
   switch **Keep this bridge up to date**, on by default (`PUT /v1/harnesses/:id/bridge-updates`,
   migration 0065); off, the computer leaves the bridge on its release. A bridge kept elsewhere is
   told what is out by the name it says in its hello (`chips-<name>` is `@chipschat/<name>`).
4. **The update dot for the owner.** Beside a release (ADR 0296), the dot lights for the owner when
   a bridge needs them or a night update failed, never for someone else's phone. Opening About puts
   it out until what needs them changes.
5. **The last net.** An event in a room that the app's catalogue doesn't have is drawn as one quiet
   line of Chips's own, centred as the room's other notes are: "Something here needs a newer
   Chips.", with Update beside it (About on the Mac and the web, the App Store on a phone). One line
   for a run of them. An event the catalogue has and the app leaves undrawn on purpose is not one.

## Consequences

- Core holds the rules and words (`packages/core/src/inStep.ts`, the fold's `noteNewer`), so the
  phone, the iPad, the Mac and the web say the same.
- Apps before this one still skip what they don't know; from it on, nothing a newer computer sends
  disappears without a line.
- The bridge line and switch show only once the signed bridge list is on chipschat.ai, since until
  then the computer keeps nothing current and says only what each bridge runs.

## Addendum, 13 November 2026, later: after a review

A review of everything in step, which Arjun asked for, changed what these screens do in the cases
below. The words are core's, so every device says the same.

1. **A computer Chips for Mac carries asks nothing of anyone.** It says so in `self_update`
   (`with_app`), and its row reads "1.2.5 · 1.2.6 comes with Chips for Mac", or "Starts again on
   1.2.6 when nothing is going on" once the app has updated: no Update button, no night switch, no
   dot, top or small.
2. **Under the night switch, the foot is the night's alone**, as the mock has it. ADR 0296's line
   about what waits for the computer shows where there is no night switch.
3. **How the last update went, in the night foot.** "last night" is before six this morning or
   from six yesterday evening by the reader's clock; an update run by hand in the day reads "today"
   or "yesterday"; older, "on 12 November". One under way reads "Updating now." What the computer
   gives as the reason is closed as a sentence. The computer now names two failures it used to
   leave as "updating" or "updated": one that stopped halfway, and one that installed a release it
   then didn't start again on ("Chips 1.2.6 is installed, but this computer hasn't started again on
   it. Run chips up.").
4. **A switch the computer didn't take goes back** to what the computer holds, whatever the read
   after it does. Two turned quickly are sent in order, and the last is what shows.
5. **A read that fails changes nothing.** The Needs update list and a harness's Bridge group keep
   what the computer last said; only an older computer's "no such route" means there is no list.
   A harness page reads again as it opens.
6. **The owner's dot remembers each thing it was put out for.** One of two fixed leaves it out for
   the other; only something new lights it. While About is in view, whatever arrives to light the
   dot is seen as it comes.
7. **A refusal for a reason this app doesn't know** (a newer computer's) reads "Couldn't update to
   1.0.31. Still on 1.0.30." and wears the gold dot, with no promise that it passes on its own.
8. **The last net holds whatever a newer computer sends.** The line is made from the event's id,
   place and time alone, never its fields; a run of unknown events replayed out of order is still
   one line; and an event of a later level that this app has in its catalogue is not unknown.
9. **A browser tab doesn't reload while the computer can't be reached**, and doesn't offer to. A
   word typed in any kind of field, or a file waiting in the composer, is something a reload would
   lose.
10. **Chips for Mac's row.** A release ready always has Restart now; where the Mac asks for an
    administrator's password the line says so and the dot stays lit (ADR 0298's addendum). A failure
    that gives no reason reads "Couldn't update to 1.2.6. Still on 1.2.5."
11. **`GET /v1/software` tells a person only of the harnesses they are told of at all** (the
    directory's scope), leaves out a harness removed since, and a device unpaired since.
12. **An app that moves up a level keeps what only it holds**: the messages sent and not yet
    answered, and the spaces made here the computer hasn't taken, are carried into the new cache
    before the earlier one is forgotten. No app is past level 1 yet. An earlier cache that can't be
    read still looks empty, and is forgotten: telling the two apart needs the cache to say so.

## Addendum, 13 November 2026, night: two more things a bridge's line says

The computer now watches a bridge through its first day on a release, and reads what a release
needs of the harness behind it (`docs/proposals/bridges-keep-current.md`, "Built, 13 November
(night)"). The line on the harness page and in About says both, in core's words:

1. **Why a release was put back.** "It didn't come back, so 1.0.31 is back on." stays for one that
   never came back, or never said how its harness is. One put back in its first day reads "It kept
   stopping, so 1.0.31 is back on." or "Its first turns failed, so 1.0.31 is back on.", each with
   "Chips tries again when the next release is out." A word for it this app doesn't know, as from
   a newer computer, reads as the first.
2. **A release the harness is too old for.** "Couldn't update to 1.0.32", then "It needs Hermes
   0.9.0 or newer. Still on 1.0.31.", with the harness's own name. It needs the owner, who updates
   the harness; Chips takes the release on its own once they have. `bridge_update` carries the
   release it needs as `needs`, beside `reason: "harness"`. An app from before this reads the
   reason as one it doesn't know: "Couldn't update to 1.0.32. Still on 1.0.31."

The switch's foot is unchanged. "Goes back to the one before if the new one doesn't come back"
is short for all three.
