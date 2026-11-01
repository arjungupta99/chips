# 0195. When it asks you: the harness decides when to ask, a person decides the answer, and an ask that matters waits for one

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Build this version as drawn: the hero, the three
promises, Allowed always with switches, swipe to dust with Undo, the dots, the ask card changes,
and the You row and sheet."

## Context

SEC-10 in the third security pass (`docs/reviews/security-review.md`) found that a harness could
settle its own ask whatever the ask was. `refuseSettling` refused only a scope beyond this one
time and `expired`. So a harness could ask to move money, policy could name the owner, and the
harness could answer the ask itself before anyone tapped. The review left one question to Arjun:
whether answering in the agent's own tools (OpenClaw finding 5, ADR 0079) had to keep working for
asks like that. The row's "Fixed in `d103fd06`" was wrong: that commit is SEC-11's, and SEC-10
was open.

The plan (`docs/proposals/asking-plan.md`) answered with a harness page section that had four
parts:

- the dial's four levels, each in a sentence;
- the rules a person's Always had made;
- who is asked;
- a new three-way control, "what counts as an answer", for SEC-10.

It also gave You a page for the workspace's cap. The first mock drew it
(https://claude.ai/artifact/2jF8z4HyBTEPPRUuW9jFJ5). Arjun asked two questions: what the
difference was between "when it asks" and "what counts as an answer", and how the whole
permission system could be simpler and more effective.

The live database answered for him:

- Fifteen asks, every one answered by a person.
- No Always ever given, and no rules.
- Every harness at L1.
- No harness that declares `autonomy`.

The four levels and the three-way control were settings nobody had turned. They would also
answer a question nobody had asked.

The simpler model was mocked next (https://claude.ai/artifact/CVJxwiUVgYWVYP8jRcn2QZ). He asked
for it to be "more cool and delightful", and for an on/off on each rule under Allowed always.
Version 2 has both, and he picked it.

## Decision

1. **The harness decides when to ask; Chips decides who answers.** The harness page says so for
   every harness in one line: "Kit decides when to ask. You decide the answer." A second line
   says where its asks go: "Its asks come to you on any device, unless it names someone else in
   the room." For anybody but the owner, the owner is named. Core writes both lines
   (`askingOpening`, `asksGoTo`), so the three apps agree.

2. **Three promises, which nobody sets**:
   - "The big ones wait for you." Money, outside messages, deletions and anything that can't be
     undone. A harness can't settle these, and they take no This session or Always.
   - "Its own window counts for the small ones." A smaller ask the harness answered in its own
     tools stands, as ADR 0079 has it.
   - "No answer is a no." An ask nobody answers lapses to its fallback.

   These are fixed rules, not a control: the three-way control is not built.

3. **What matters is one sentence, in the protocol** (`actionMatters`). An action matters if it
   leaves the workspace, spends money (`money_usd` over nought), can't be undone, or carries a
   hot risk class (external, external_communication, destructive, financial, credential). The
   server's `matters()`, the conformance kit's fake and the apps all read it, and core puts it on
   each `Approval` as `matters`. Chips still goes by what the harness says about its action, and
   never sees the tool call.

4. **The door (SEC-10).**
   - A harness that settles an ask that matters is refused (`not_an_approver` at the door, which
     the harness receives as `forbidden`): it waits for a person.
   - A person who answers an ask that matters with This session or Always is refused with
     `invalid`: it is answered once.
   - A smaller ask can still be settled in the harness's own tools.
   - Who the stored approvers are is not looked at. They are always resolved ids, so the plan's
     "approvers name a person" condition would have refused every self-settlement.

5. **A rule a person's answer made never allows an ask that matters.** An Always is keyed on the
   action's kind and its outside and can't-be-undone flags. Without this rule, an Always given
   for a small `payment.send` would later let one carrying money through. The policy engine asks
   `speaks(rule, action)` before applying a rule. A rule that is `off` says nothing. A rule with a
   `made_at`, which only an answer gives, never allows an ask that matters. Rules carry three
   optional fields: `made_by`, `made_at` and `off`. An Always's rule gets both `made_by` and
   `made_at`. The rules a This session answer makes for its session get `made_at`, the time it
   was decided, so they never allow an ask that matters either.

6. **Allowed always is the one control.**
   - Each rule a person's Always made, and each rule in the harness's policy, is a row: the
     action's kind, who made it, where and when ("By you in Bakery · 12 October"), and a switch.
   - Off keeps the row, dimmed ("Off · Kit asks again").
   - Swiped (phone) or ×'d (web, Mac), the row breaks into dust as Delete for me's message does
     (ADR 0167). The list closes over it, and Undo stands for five seconds.
   - Removing asks nothing first, because Undo is there.
   - Only an owner or an admin changes these (SEC-1). Anybody else sees still switches and no
     way to remove.
   - Every change sends the scope's rules whole (`store.setRules`, a `policy.updated` at the
     scope's level). Core has no optimistic fold for that event. Until the server echoes it, or
     for six seconds if it never does, the screens draw the change over the model (core's
     `withChanges` and `changesStill`). A switch stays where it was put, and a removed row stays
     gone.
   - Taking a rule out and making it again leaves one rule, not two.

7. **The harness page's section, "When it asks you", on every harness's page**:
   - The ask flies from the harness's face to whoever its asks go to, lands in amber, a ring
     pulses, and a green tick pops; it goes back green.
   - The opening lines.
   - The three promises on flat tiles. The hand waves, the tick draws itself, and the clock's
     hand turns.
   - Allowed always and its count ("2 on", "1 of 2 on").
   - A dot for every ask the reader can see: green for yes, a ring for a standing yes, red for
     no, amber for one waiting, grey for one that lapsed. A line under the dots says "15 asks
     since 6 September · all answered by you". It counts apart the asks answered in the
     harness's own window, the ones Chips answered on the spot ("2 by policy"), the lapses and
     the ones still waiting.
   - With Reduce Motion the ask rests halfway and nothing moves.
   - On the phone the old "What it may do" rules card is gone, and the Trust card keeps the dial.
     On the web and the Mac the section is part of the harness card, and the run panel's dial is
     unchanged.

8. **The ask card.**
   - An open ask that matters says "Waits for you", or "Waits for a person" to anybody else.
   - It offers no scope, and a line says why: "You answer asks like this each time, so there is
     no Always."
   - An ask the harness settled in its own tools says "Answered by Kit in its own tools." under
     its verdict. A lead's answer for another harness (ADR 0036) doesn't say this.

9. **You has a shortcut.**
   - On the phone, the workspace's group (owners and admins) gains an "Allowed always" row, which
     says how many rules are on and opens a sheet.
   - On the web and the Mac it is a card under the workspace's heading.
   - Both list every harness by name, with rules that switch and remove as on the harness's page.
     A harness with no rules says "Nothing allowed always."
   - It is a way into the same rules, not a setting of its own. Asking belongs to the harness,
     not the person, so two people running one workspace see one truth.

10. **Left out of the plan:**
    - the four-level section and its sentences;
    - the three-way "what counts as an answer" control;
    - You's page for the cap;
    - the walk's step that sets the cap from You.

    The dial keeps its place on the phone's Trust card and the web's run panel, as it was.

## Consequences

- SEC-10 is closed by a rule, not by a setting. A harness that used to settle a payment, an
  outside message or a deletion in its own tools is now refused, and the ask waits on the card
  for a person. This is the case the review asked about, and Arjun's model answers it.
- An answer made by Always is narrower than before: it never covers an ask that matters, even
  one of the same kind. Rules a harness declares in its policy are unchanged.
- A person can turn a standing yes off without losing it, and take one back for five seconds
  after removing it. Before this, the page could not remove a rule at all.
- `policyRule` gains three optional fields. A server older than this one strips `off`, so a rule
  switched off on it still applies. The apps and the server ship together, as they do.
- The phone's Profile and You, and the web's harness card, You and ask card, each have tests.
  `e2e/when-it-asks.spec.ts` covers the whole round trip in a browser: Always, the rule, off, the
  next ask coming back, on, the ×, Undo, removed for good, and an ask that matters that the
  harness may not settle. `e2e/decisions.spec.ts`'s own-tools test now settles a smaller ask and
  is refused on one that matters.
- No harness is excepted, a test harness included (Arjun, 18 October, after an exception for test
  harnesses was weighed). A test that needs an ask answered without a person sends a smaller ask,
  or answers the card itself, as `apps/mobile/e2e/decide.spec.ts` now does: This session is
  picked on a tracker write from a harness at L1, and an outside email is answered once. A live
  run answers each flagged ask once, with `pnpm live decide <room> approve`; `--scope session` on
  one is refused.

## Addendum, 26 October 2026: You's Allowed always says nothing once, and rows say what they allow

Arjun: "The You → My spaces → Allowed always section looks off and incomplete. What is it for?"
The mock (https://claude.ai/artifact/LwgxN9e9P5JgxURXTNw7FV) drew today's sheet beside three
directions, and he picked A: "one empty state, plain words for the kinds, drop empty harness
groups, new You row value. Phone, web and Mac."

What the live database showed: no rules at all, and 27 asks since 6 September, none answered
Always. So the sheet only ever drew six harness headings, each over a box that said "Nothing
allowed always.", under a line about turning rows off and swiping them away.

1. **Nothing allowed anywhere is said once.** The ask flies from the workspace's harnesses (up to
   three faces) to the reader; "Nothing is allowed always, so every ask comes to you." ("to a
   person" when some harness's asks go to someone else); how a rule comes to be here; that the
   asks that matter take a yes each time, so Always isn't offered for them; and the dots of every
   ask the reader can see, with the harness page's line under them (`alwaysNone`,
   `workspaceAskHistory`). This replaces decision 9's "A harness with no rules says 'Nothing
   allowed always.'"
2. **Only the harnesses with a rule get a group.** The rest are one line under the list: "Codex,
   Hermes and OpenCode ask every time." (`alwaysAsking`).
3. **A row says what the rule allows in plain words**, with the harness's own kind small under
   it: `shell.exec` and `acp.bash` "Run commands", `file.delete` "Delete files", `email.send`
   "Send email" (`actionWords`). The words are read from the kind's own words, never from which
   harness sent it, since Chips names no harness (ADR 0051). A kind none of them fit keeps the
   kind as its name, as before. The harness page's rows say the same.
4. **The line under a row says where the rule holds first**: "In Bakery · by you, 12 October",
   "In every space · from its policy". Decision 6's "By you in Bakery · 12 October" is reworded.
5. **You's row says "Asks every time"** when nothing is allowed, where it said "None".

Not done here, and drawn in the same mock: B (each rule counts and lists the asks it answered) and
C (an Always that covers only the command's start, in this space or every space). C also answers
a hole the mock found: an Always on a shell kind covers every command of that kind, and the ACP
bridge marks only ACP's delete and fetch calls as risky, so `rm` reaches a person as an ordinary
ask.
