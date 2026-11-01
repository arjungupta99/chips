# When it asks you: a plan

Date: 18 October 2026
Status: Plan, for Arjun's reading and then a forked session's building (he said: "I need a proper
and very clear setting / experience in the Agent harness page (and a shortcut in the You page). It
needs to explain and provide controls for this."). Grew out of the security review's SEC-10
(`docs/reviews/security-review.md`), which asked whether a harness may answer its own approval
when the action matters, and his worry that closing it would add friction.

## What this is for

A person should be able to open a harness's page and understand, in a few sentences, three things:
**when** this harness stops to ask them, **who** gets asked, and **what counts as an answer**. And
they should be able to change each of the three right there, with the consequence of the change
said in words before they make it. Today the page has a dial with four unlabelled steps under the
heading "How far it is trusted", and a list of rules in the protocol's own words. Nothing says
what L2 means for this harness, nothing shows the workspace's cap, nothing can remove a rule a
person made by answering "Always", and nothing says that the harness may answer its own asks.

You gets a shortcut, so a person who wonders "why did that run without asking me" or "why am I
being asked so much" finds the answer from the place they already go for their own settings.

## What exists, and what the plan builds on

- **The dial.** `policy.autonomy` 0 to 3, per harness, capped by `workspace_max_autonomy`
  (ADR 0008). L0 asks for everything; L1 lets reads through and asks for every write; L2 asks
  when the action matters; L3 asks for nothing and reports back. The phone draws it as a
  `Segment` in `apps/mobile/src/harnesses/Profile.tsx` (`Trust`), the web in `RunPanel.tsx` and
  `Harnesses.tsx`. Since SEC-1 only an owner or admin turns it (`mayTurnDial`).
- **What "matters" is.** `matters()` in `server/src/domain/policy.ts`: the harness's own flags on
  the action (external, irreversible, money, a hot risk class). Chips reads what the harness says;
  it never sees the tool call. The plan's words have to be honest about that.
- **Rules.** A person who answers a card with "Always" makes a rule in the harness's policy for
  that room (ADR 0036, decision 4; `ruleFromAlways`). The page lists rules (`ruleWords`) and
  cannot remove one. The store sends the whole list with every dial turn (`setAutonomy`), so
  removal is already possible on the wire: send the list without it.
- **Who answers.** Policy names approvers per ask: the harness's owner by default, `any` for
  the room's people but a guest, a person by id, `role:`, and `lead` for a lane (ADR 0030, 0036,
  0042). The card shows who may answer; nothing on the harness page does.
- **Self-settlement (SEC-10).** `settlesItsOwn` in `authorize.ts`: a harness may resolve an
  approval on its own run, any action class, scope `once`. Written for a harness that shows the
  same question in its own window (OpenClaw test, finding 5), so the card cools when the person
  says yes there.
- **You.** A settings list (ADR 0085) with a Notifications group, devices, passkeys, invites,
  people, and one workspace-wide agent control, the message limit (ADR 0187), which is the
  precedent for a workspace control on You.
- **No UI** for the workspace cap, and no UI that says what any level means.

## The experience

### On the harness page: "When it asks you"

One section replaces the "How far it is trusted" and "What it may do" cards. Phone, Mac and web
draw the same words from core.

1. **The sentence first.** The top line is what is true now, in plain words, for this harness:
   *"Jacobian asks you before money, outside messages, deletions and anything that can't be
   undone. Everything else runs and shows up in the receipt."* (L2.) For L1: *"Jacobian asks you
   before every change. Reading is free."* For L3: *"Jacobian runs on its own and reports back.
   It asks you for nothing."* For L0: *"Jacobian asks you before everything."* Core gives the
   sentence (`askingWords(policy)`), so the three apps agree.
2. **The dial, with its levels named.** The four steps keep their place, each with its short
   name (Observe, Ask first, Ask when it matters, Autonomous) and the one-line consequence under
   the chosen one. Steps above the workspace's cap are drawn but cannot be chosen, with the note
   *"Your workspace caps this at L2. Change that in You."* An owner or admin turns it; anyone
   else reads it, with *"Only an owner or admin changes this."*
3. **The rules it has earned.** Each rule a person made by answering Always, in words:
   *"payment.transfer under $50 is allowed, from your Always in Bakery on 12 October."* A swipe
   (phone) or an × (web) removes one: the store sends the list without it. A rule the harness
   declared itself (not from an Always) is listed under *"Its own rules"* and cannot be removed
   here. Empty: *"No rules yet. Answering an ask with Always makes one."*
4. **Who is asked.** *"Its asks go to you"* for the owner, naming the owner for everybody else,
   with *"An ask about a room's work can also name the people in that room, and a lane's lead."*
   Nothing to change here in this plan; the words make the routing visible.
5. **What counts as an answer** (SEC-10, the new control). Three choices, drawn as a segment or
   radio with the consequence under the chosen one:
   - **"Only you"**: the harness never answers its own asks; a card waits for a person.
   - **"It may answer the small ones"** (the default, and the fix for SEC-10): the harness may
     settle its own ask when the action does not matter, as it does when the person answered in
     its own window; money, outside messages, deletions and anything irreversible wait for a
     person.
   - **"It may answer everything"**: today's behaviour, for a harness with an approval window of
     its own. Under it: *"Chips then records the harness's yes, not yours."*
   The choice is the harness's, kept on its policy. Only an owner or admin changes it.
6. **The honest footer.** One sentence under the section: *"Chips goes by what a harness says
   about an action. The dial is the brake; the rules and the answers are yours."*
7. **What happens when nobody answers.** A line: *"An ask nobody answers is denied after N
   minutes."*, from the sweep's expiry, so the page says the whole story.

### On You: "When agents ask you"

A row in You's Agents group (beside the message limit from ADR 0187). Its subtitle is a count:
*"Jacobian asks when it matters · OpenClaw asks before every change · 1 more"*. Tapping it opens a
page that lists each harness with its sentence and its dial, read-only, each row leading to the
harness's own section above. At the top, for an owner or admin, **the workspace cap**: *"No
harness runs above L2 in this workspace"*, a segment of the four levels, sent as
`policy.updated` with `workspace_max_autonomy` and no harness change (the event already carries
the cap; the apps have never sent it). Lowering the cap lowers nothing else: a harness above the
new cap is simply capped, as the engine already does.

### Words in the ask card

The card gains one line when a harness has answered its own ask: *"Answered by Jacobian in its
own tools."* So the audit's difference shows where a person looks for it.

## Decisions to record (one ADR; the number is whatever is free when the session starts)

1. **Self-settlement is a policy field.** `policy.updated` gains an optional `own_answers:
   "none" | "ordinary" | "all"`, kept on `harness_policy` (migration adds the column, default
   `ordinary`). `refuseSettling` in `authorize.ts` reads it with the stored approval's action:
   `none` refuses; `ordinary` refuses when `matters(action)` or when the approvers name a person
   by id; `all` is today's rule. The default, `ordinary`, is SEC-10's fix for every harness that
   never chose. The conformance kit's fake mirrors it.
2. **The sentence is core's.** `askingWords(policy, harnessName)` and `levelWords(level)` in
   core, used by all three apps and by the You row, so nobody rewords a level in one place.
3. **Removing a rule is sending the list without it**, through `setAutonomy` as it is; a rule
   made by an Always carries where and when it was made (`made_in`, `made_at`, optional, filled
   by `ruleFromAlways`), so the words can say so. Older rules without them say *"from an Always"*.
4. **The workspace cap is set from You by an owner or admin**, as the message limit is
   (ADR 0187); the door already refuses the event from anybody else (SEC-1).
5. **The card says when a harness answered itself.** `approval.resolved` from a harness is drawn
   with the harness's name, not "you".

## Phases, each a gate and his word

0. **Mocks first.** A phone-width HTML mock of the harness section (all four levels, the cap
   note, the rules list with a removal, the three-way answer control with its consequences, the
   footer) and of the You row and its page, with the words as they will ship. He reads the words
   and picks; nothing is built before.
1. **Server and protocol.** `own_answers` on `policy.updated` and `harness_policy`; the door rule;
   `made_in`/`made_at` on a rule from an Always; the card's "answered by" words on the wire need
   nothing new (the event's actor is the harness). Tests: `authorize.test.ts` for the three
   settings against a matters and a non-matters ask; `submit-event.test.ts` for the rule fields;
   migration test. The conformance fake.
2. **Core.** `askingWords`, `levelWords`, `ownAnswersWords`; the policy model carries
   `ownAnswers` and the rules' provenance; `setAutonomy` grows `ownAnswers` and a `removeRule`;
   `setWorkspaceCap`; the You row's summary (`askingSummary(model)`). Tests for every sentence.
3. **Phone.** The section on `harnesses/Profile.tsx`; the You row and its page; the card line.
   RNTL tests; a simulator walk against a scratch server with two harnesses at different levels.
4. **Web and Mac.** The same section in `Harnesses.tsx` (and the dial in `RunPanel.tsx` reads
   the level words); the You row; the card line. Playwright on the harness page.
5. **Go live.** Migration, so a `.backup` and a 4431 restart; `pnpm web:build`, `pnpm desktop`,
   `pnpm phone ship`. STATUS and the review's SEC-10 row.

## What is left out, and why

- **A per-person "don't ask me"**. Asking is the harness's setting, not the person's: two owners
  of one workspace should see one truth. The You page is a shortcut to the same controls.
- **Changing who is asked from the page.** Routing is policy's and the card's (ADR 0036, 0042);
  the page only says it. A later plan may let an owner name a default approver per harness.
- **Reading the tool call.** Chips still goes by the harness's flags; a deny-by-default for an
  unknown `kind` is a separate decision.

## Tests and acceptance

- Core: the sentence for each level and each `own_answers` value; the summary row for one, two
  and several harnesses; removal sends the list without the rule and nothing else.
- Server: the door's three answers; the default for a harness with no choice is `ordinary`; an
  `all` harness may still not settle an ask that named a person by id (ADR 0042's "named is
  standing enough" stays a person's).
- Phone and web: a member sees the section read-only with the words; an owner changes each
  control and the sentence follows; a rule removed disappears from the list and from the next
  `policy.updated`.
- Walk: two harnesses; answer an ask with Always, see the rule, remove it, see the next ask come
  back; set the cap to L1 from You and see both dials capped.
