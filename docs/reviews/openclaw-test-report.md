# OpenClaw as a second harness: test report

27 September 2026. Phase 5 of `docs/proposals/openclaw-test-plan.md`: Chips tested against
OpenClaw 2026.9.6 on a scratch server (port 4436). OpenClaw runs in its own container, signed in to
ChatGPT (model `openai/gpt-6-astra`, through OpenClaw's Codex runtime). The bridge lives in
`~/Work/chips-openclaw`, outside Chips, and speaks Chips's public wire. Everything was done through
the desktop web app as the person, with the scratch server's log and the bridge's trace read
alongside.

Phase 6 (live beside Jacobian, on the iPhone) ran on 27 September: its results are under
[Phase 6](#phase-6-live-on-4431-beside-jacobian). ADR 0081 (who a message is for) went live that
night; its test is under [ADR 0081](#adr-0081-who-a-message-is-for-live-on-4431).

## Results

| ID | Test | Result |
|---|---|---|
| C1 | The checklist lights as events arrive | **Pass**: Messages, Runs, Steps, Approvals, Questions, Context, Cost and Finished all lit; Lanes dark, as expected |
| C2 | OpenClaw stopped, a message sent, OpenClaw started again | **Pass after a bridge fix**: the message was answered once OpenClaw was back. **Finding 8**: Chips showed OpenClaw healthy throughout |
| C3 | The bridge restarted | **Pass after a bridge fix**: it resumes from its cursor. A reused OpenClaw idempotency key first refused a message after a restart |
| C5 | Its profile | **Pass**: no autonomy dial, and no timeline without a milestone |
| M1 | A plain question | **Pass after a bridge fix**: the answer arrived as one card (it was two while the summary was shortened) |
| M2 | Markdown, links, a long answer | **Pass**: bold, lists and links drawn |
| M3 | A photo | **Pass** on the phone (Phase 6) |
| M4 | A voice note | **Pass after a bridge fix** on the phone (Phase 6) |
| M5 | Three messages within two seconds | **Pass after a bridge fix**: every message answered. OpenClaw answers queued messages in follow-up turns of its own; runs are now named from the message they came from |
| M6 | Stop a long answer | **Pass**: Stop asked "Stop for good?", then OpenClaw's turn was aborted |
| M7 | Steer a running turn | **Pass**: "make it only three" reached the turn and it answered with three |
| M8 | Thumbs-down, edit, delete | **Pass**: the thumbs-down and a deletion reached the log, and the bridge ignored them without error (edit not tried) |
| S1 | A new space from the +, asked of OpenClaw | **Pass**: made, claimed, named from the first words, answered in the room |
| S2 | One room's session does not know another's | **Pass** |
| S3 | The bridge restarted finds its rooms | **Pass**: a room's session key comes from the room's id |
| S4 | The delete sheet for an OpenClaw room | **Pass**: no promise on OpenClaw's behalf (no `follows_rooms`, ADR 0077) |
| S5 | A room asked while the bridge was down | **Pass**: claimed, named and answered when the bridge started |
| A1 | An approval card for a command | **Pass after an OpenClaw setting**: under the Codex runtime an allowlist exec policy blocks every command without asking; mode `ask` with the user as Codex's reviewer sends it to the card |
| A2 | Deny, with a reason | **Pass**: the command did not run and OpenClaw said so. The reason does not reach OpenClaw, whose resolve has no field for one |
| A3 | Always, then the same command again | **Gap (finding 4)**: OpenClaw offers only allow-once for its native commands and refused allow-always, which left the turn waiting. The bridge now sends a yes for always as allow-once. Chips's card still says *always*. **Rerun in batch 3 (finding 24)**: Chips's own rule does not hold either, at L1 |
| A4 | Answered in OpenClaw instead of Chips | **Gap (finding 5)**: the command ran, but Chips's card stayed live, with Approve and Deny, until it expired |
| A5 | An ask nobody answers | **Pass**: at its expiry (01:26, 30 minutes after it was asked) Chips resolved the card itself, `expired`, by `system`. The bridge had restarted since and held no record of the ask, so it sent OpenClaw nothing |
| Q1 | OpenClaw asks a question | **Pass after a bridge fix**: the card drew both options and free text, and "Sunday" reached OpenClaw once answers were sent as arrays of labels |
| U1 | Usage | **Partial (finding 11)**: tokens shown with no dollar figure, as expected on a ChatGPT plan. Only 3 of 22 turns had usage, because OpenClaw's Codex runtime reports input tokens only on some turns and Chips's `usage` needs both counts |
| U2 | The context ring | **Pass where reported**: 10%, 26.3k of 258k tokens, on the run panel and the room header |
| X1 | The gateway without its token | **Pass**: refused, "device identity required" |
| X2 | The agent reading the Mac's files | **Pass**: `/Users` does not exist in the container |
| X3 | Where the Chips token lives | **Pass**: only in `~/chips-openclaw/bridge/chips.env` (scratch) |
| D1 | The bridge's Chips half from Chips's docs alone | **Done, with findings 12 to 17** |

## Phase 6: live on 4431, beside Jacobian

27 September 2026, from 01:18 PDT. 4431 restarted onto migration 0029 (a backup of its database
was taken first), the desktop's bundle and his iPhone rebuilt from main 671a37bc. OpenClaw was
added with `chips connect custom --name OpenClaw --no-dial` and `chips declare OpenClaw new_spaces`;
the bridge runs by hand against 4431 (`scripts/bridge.sh start live`), with its token read from the
login keychain at start. Arjun drove the phone and the desktop; the server's log, the `events`
table and the bridge's log were read alongside.

| ID | Test | Result |
|---|---|---|
| C4 | `chips doctor` | **Pass**: "OpenClaw has 1 live token; last spoke just now", beside Jacobian. **Finding 19**: the check is keyed `custom`, not `OpenClaw` |
| X3 | Where the live token lives | **Pass**: only in the login keychain (service `chips`, account `custom:<id>`); `connect` printed it once and the bridge reads it at start, never from a file |
| M1 | "What can you do?" in its room | **Pass**: one card in 7 seconds, with usage and context. A first message sent before the bridge had ever connected was never heard (**finding 18**) |
| S1 | + → Create new space → OpenClaw, from the phone | **Pass**: claimed within a second, named "Plan a weekend in Big Sur", answered there |
| H1 | The + with both connected | **Pass**: rooms asked of OpenClaw and of Jacobian were both made from it |
| M3, P3 | A photo from the camera roll | **Pass**: the bridge fetched it from 4431 and OpenClaw described it, then answered a follow-up about it |
| A6 | An approval decided on the phone | **Pass after two fixes outside Chips**. First the model ran `ls` in Codex's own shell, which asks as an OpenClaw *plugin* approval naming no reviewer; OpenClaw found no route and denied it in 30 ms, so Chips was never asked. With the bridge handling plugin approvals and given `operator.admin` (Arjun's call), the card came; approved, the command then failed because Codex's sandbox (bubblewrap) cannot start in an unprivileged container. With the container as the sandbox (Arjun's call), `date` was asked, approved on the phone and ran |
| P2 | An ask arriving while the app is in the background | **Pass**: the card was waiting in its room on return. Needs you, which the plan named, went with For you (ADR 0065); the room's row says "Needs a yes" |
| H2 | A room with Jacobian, OpenClaw and Arjun; "Hi" | **Pass**: each answered once, and neither answered the other |
| H3 | One message naming both, asking them to introduce themselves to each other | **Pass, with finding 22**: both ran; each greeted the other by @name; OpenClaw heard Jacobian's reply (it named OpenClaw) and answered once, without a mention, so the exchange ended. Jacobian did not answer OpenClaw's greeting (its own rule) |
| H4 | The Delete sheet in a Jacobian room and in an OpenClaw room | **Pass**: Jacobian's says "It's deleted in Jacobian too." (it declares `follows_rooms`); OpenClaw's promises nothing on its behalf. Both cancelled |
| M4 | A voice note from the phone | **Pass after a bridge fix**: the first, with no typed words, started no run, because the bridge named the run from the empty text and Chips refused an empty goal (and then OpenClaw's answer, for want of the run). The transcript was in `message.new` all along, as `reference/http` says. The bridge now names such a run from the transcript; OpenClaw, sent the sound, wrote it down itself and answered |
| P1, H5 | Cold open, the Spaces list with both harnesses' rooms | **Pass**: "list looks fine"; each room wears its own harness's face and name, and nothing jumped |
| H6 | Jacobian hands work to OpenClaw | *Deferred*, as planned: it needs one connection presenting several agents (open decision 8) |

**New findings (for Phase 7):**

18. **A message to a harness that has never connected is silently unheard.** The room exists from
    the moment the harness is added, and the phone showed it at once; a message sent there before
    the harness's first connection is delivered to nobody (a harness with no cursor starts from
    now), and nothing in the room says the harness has never connected. It goes with finding 8.
19. **`chips doctor` and `chips connect` call a custom harness `custom`** when it is the only one:
    `harness:custom`, and "Undo with `chips disconnect custom`", where its name is OpenClaw.
20. **The desktop's + is easy to miss.** It is a 14 px grey glyph at the end of the RECENT label,
    where the phone has a gold + by the tab bar; Arjun looked for it twice and did not see it. Below
    640 px wide the desktop hides the whole sidebar, and the + with it, with nothing in its place.
21. **The room list's previews show raw Markdown**: "\`\`\`text Sun Sep 27…" for OpenClaw's reply,
    and "\*\*[LEGO…" in another room. Not OpenClaw's alone. Finding 7 (a fence drawn raw on an
    approval card) was seen live as well.
22. **With two harnesses at work, the room shows only the newest one thinking.** The bubble belongs
    to the room's newest run: after "Hi", Jacobian started, OpenClaw started 1.7 s later and
    finished 4 s after that, and the bubble went with it, while Jacobian worked on for 28 seconds
    with nothing shown. Arjun: "The desktop room shows no thinking bubble." The phone keeps a room's
    newest run the same way. This is the known gap H3 expected, and what it costs a person.
23. **A room a harness is added to never becomes that harness's own.** Arjun's "A joint space"
    (made with No one, then Jacobian and OpenClaw added) has no Jacobian Space: Jacobian treats a
    room it did not open or claim as J's own room, so the conversation mixes into J's history with
    Arjun, unmarked, and Jacobian answers there or hands the message to one of its Spaces. Nothing
    can make it a Space later: Jacobian claims only rooms asked of it from the +, and Chips's
    claim is for asked rooms. Jacobian also drops every message from a harness, so it never heard
    OpenClaw at all. Two ways out, sized in Phase 7: Jacobian opens a Space when it is added to a
    room it does not know, or Chips lets a harness claim a room it was added to.

Also seen, not findings: OpenClaw's agent took the name Sage in its room, and Chips still calls
the harness OpenClaw, since a harness's name is the one it was added with. Codex's asks expire after
two minutes, where OpenClaw's exec asks gave thirty. The model chooses among OpenClaw's read-only
`ls` tool (no ask), OpenClaw's exec tool (an exec ask) and Codex's shell (a plugin ask) for the same
request.

## ADR 0081: who a message is for, live on 4431

27–28 September 2026, from about 23:36 PDT. The software under test:
- **Chips:** main 6c65f0eb, 4431 on migration 0031, with the desktop dist and his iPhone rebuilt.
- **Jacobian:** 1c58b8c, then 404490a after W5's first run.
- **The bridge:** 88a70a4, then 4ea78cd.

The room was "A joint space": Arjun (named "You" in this workspace), Jacobian and OpenClaw. Arjun
drove the desktop and the phone. I read the events table alongside, and Jacobian's own turn records
for what each turn was told.

| ID | Test | Result |
|---|---|---|
| W1 | Capsule → OpenClaw, "Is the build green?" | **Pass**: sent with `to`, addressed to OpenClaw alone, and only OpenClaw ran. Its answer was for the people (`addressed_to: []`) |
| W2 | "Never mind", with no @ | **Pass**: OpenClaw again, from the capsule's default; Jacobian silent |
| W3 | Capsule → Jacobian, "What's 17 × 23?" | **Pass**: Jacobian alone, "391", and nothing in J's room. Its turn ran in the room's own thread, told "In this room: You (person), OpenClaw (agent, @OpenClaw), and you" and the one line it had overheard since it last spoke |
| W4 | Everyone, "Hi both" | **Pass**: `addressed_to_all`, and each ran once. Jacobian's turn led with the four lines it had overheard in W1 and W2; the walk that placed it read "Hi both" alone |
| W5 | Ask Jacobian to ask OpenClaw for a number | **Pass after a fix (finding 25)**: Jacobian @'d OpenClaw, OpenClaw ran and answered the room, two messages between them. The first run went to five: see finding 25. A first try with "@OpenClaw" in the text went to OpenClaw alone, as designed: an @ decides over the capsule, which said so before the send |
| W6 | A room made with No one, both added, then "Hello" | **Pass**: each answered once. The "Hi" sent before either was added is recorded as Everyone (`addressed_to_all` with nobody in it), which is what sent "Hello" to both |
| W7 | J's own room | **Pass, by eye**: no capsule and no routes. No message was sent. That J's room keeps its thread and its words is covered by Jacobian's tests |
| W8 | The guard | **Pass**: on scratch 4436, Pilot and Echo's fifth was held and addressed to nobody. Also live, unplanned, in W5's first run |
| E1 | Everyone after a harness joins (Arjun's call that night) | **Pass on scratch**: "hi both" to OpenClaw and Pilot, Echo added, and the capsule still said Everyone with three faces. "and Echo too?" reached all three, with no route over it |
| S1 | A room from the +, asked of OpenClaw | **Pass**, again: its only harness, answered |

**New findings:**

25. **An automatic `to` on an answer to an agent loops until the guard stops it.** Both adapters
    sent an answer to an agent back to it with `to`, as ADR 0081 said. Jacobian asked OpenClaw
    for a number. OpenClaw's answer went back to Jacobian, which said "Got it, thanks!" back,
    then "You're welcome!", then 👍, and the guard held the fifth. That is two turns each spent on
    nothing, after every question one agent asks another.
26. **Jacobian's room line left out the room's opener.** Chips makes the person who opens a room a
    member through `space.created`, with no `membership.added`, and Jacobian read only the
    latter.
27. **The phone cannot make a room for two agents.** Its + asks one agent for a room, and it has
    no Members panel. The desktop's "No one" and Members are the only way.
28. **A bare `jacobian` restarted only the dashboard.** Under launchd, `jacobian` with no
    arguments meant `start`, which leaves the gateway running. Two restarts that night "took"
    while Jacobian ran the code from before them. This is outside Chips, recorded for whoever
    restarts it next.
29. **The workspace's person is named "You".** Jacobian's room line reads "You (person) … and
    you". Not a bug: Arjun can rename himself in Chips.

## Findings for Chips (Phase 7)

These are about Chips, whatever harness shows them. None is fixed yet; each comes to Arjun sized
first.

**Bugs a person sees:**
1. **The desktop page scrolls as a whole under a tall approval card.** The document grew to 1,809 px
   in a 768 px window and scrolled 236 px, leaving a blank band under the app. Clicks aimed at the
   composer then land elsewhere (a message was lost this way in the test). `.ui-approval`'s decision
   area overflows the room, and neither `html` nor `body` clips it.
2. **A harness's card says "N waiting on you" for every run it has finished.** OpenClaw's said 22,
   which was its run count, while one ask was open. `buildFleet` counts `buildNeedsYou`'s review items
   (every ended run), left over from the For you queue withdrawn in ADR 0065. Jacobian's card will
   show the same.
3. **The Members panel's rename field keeps the previous room's title** when you move to another
   room, so Rename would give this room the other's name.
4. **An approval card offers Once, This session and Always whatever the harness can honour.**
   OpenClaw takes only allow-once for its native commands. A person who chooses Always is told it
   holds, and it does not. The protocol has no way for a harness to say which scopes it can keep.
5. **A harness cannot say an ask was answered elsewhere.** Answered in OpenClaw's own tools, the Chips
   card stays live until it expires, and the run it belongs to shows *Needed you* after it is done.
6. **A step with no summary is labelled by its step id** (`tool_search_code:call_…`), in the
   timeline and in the Working line, rather than by its tool (`web_fetch`).
7. **A Markdown preview on an approval card shows its code fence** as literal backticks.
8. **A harness looks healthy while it cannot answer.** With OpenClaw stopped, and later with the
   bridge stopped, the sidebar showed OpenClaw *Done*, with a green dot. Before its first run it
   said "No harnesses running" although the bridge was connected.

24. **"This session" and "Always" change nothing below L2.** Found rerunning A3 in batch 3, on
    the scratch server, in a new room with OpenClaw at L1. Always on `date` wrote its rule (a
    `policy.updated`: "You decided shell.exec is fine always"), and the next `date` asked again.
    The engine lets an `allow` among a harness's rules speak only at L2 and above
    (`server/src/domain/policy.ts` ~277), so that a room capped at L0 or L1 cannot be talked past.
    But the rules a person's answer makes are among the harness's rules: Always is written into
    its policy for the room, and This session is put in front of them. The rule came first
    (3 September), and the two answers were built on it later. Every new harness starts at L1, and
    Jacobian and OpenClaw both sit there on 4431, so the card offers two choices that do nothing
    today. `deny` rules speak at every level. Pressing Always again writes the same rule again
    (the first A3 left two).

**Protocol:**

9. The two gaps behind findings 4 and 5: an ask's available scopes, and a harness withdrawing an ask
   answered elsewhere.
10. A harness running several agents behind one gateway still needs one harness and token per agent
    (open decision 8), as the plan expected.
11. `usage` needs both input and output tokens, so a harness that knows only one reports nothing.
    Output-only usage could be allowed, with input marked unknown.

**Docs, as a third party read them (D1):**

12. `reference/frames` does not show an `event` frame's shape. `{frame: "event", event: {…}}` was
    guessed and turned out to be right.
13. `approval.request`'s `risk` is documented as an object; it is an array of strings from a closed
    list that only the JSON schema gives.
14. The body of an HTTP refusal is not shown (`{error: {code, message}}` was assumed).
15. Whether a signed attachment URL also wants the bearer token is not said.
16. `GET /v1/events` returns `message.post` where the socket gives `message.new`. The page says it,
    but a harness catching up must rebuild `from` and `message_id` itself, and nothing shows how.
17. `reference/frames` says the client's `hello` carries "the harnesses on this connection"; the
    server ignores them (see open decision 8).

## Outcomes (Phase 7)

Sized in `docs/proposals/openclaw-findings-sized.md`. The batches still to do are planned, step by
step, in `docs/proposals/openclaw-batches-2-5.md`.

| # | Outcome |
|---|---|
| 1, 2, 3, 6, 7, 20, 21, 22 | **Fixed** in batch 1: main aade3068, live on the desktop and his iPhone from about 10:25 PDT on 27 September, pushed at ef7ce93c. 22 also fixed the desktop drawing asks only from a room's newest run, found while sizing |
| 8 | **Half fixed** in batch 1: the desktop sidebar lists every harness and says nothing for one idle or finished. **"Offline" left as it is**, on Arjun's call in batch 4: a harness that has connected before loses nothing while down, and 18 covers the one that never has |
| 19 | **Fixed** in batch 2 (27 September): `doctor` and `connect` name a harness by its name (its id when two share one), quoted when it has a space; `doctor` on his machine says `harness:OpenClaw` and `harness:Jacobian`. The way back they print keeps the name. The CLI runs from source, so nothing to ship |
| 12–17 | **Fixed** in batch 3 (27 September), in the docs: an `event` frame's shape, with its key inside, in a new *Shapes* section of `reference/frames` and in the WebSocket page (12); the event pages print a long type as `enum[]`, `object[]` or `object`, list an enum's values, and give an array of objects' fields as rows, so `risk` reads as eight closed values (13); the error envelope's statuses, `issues` and `retry_after_seconds`, linked from the hooks and custom pages (14); a signed attachment URL wants the bearer too, and a member harness needs no URL (15); the log holds `message.post`, and the custom page shows how to rebuild `message.new` from it, with `next_cursor` `null` at the end (16); Chips reads no `harnesses` and no `since` from a client's `hello`, in the frames and WebSocket pages and the schema's own words (17). A new sample, `write-and-catch-up.ts`, proves 12, 16 and 17 against a real server on every push. Nothing to ship: the docs site is built from the repository |
| 4 | **Fixed** in batch 4 (27 September), in the docs: `concepts/approval.md` says Chips keeps This session and Always itself, whatever the harness can, and that Always on one `shell.exec` covers every `shell.exec` from that harness in that room. The protocol field for a harness's own scopes stays unscheduled |
| 24 | **Fixed** in batch 4 (27 September), option (a) on Arjun's call: an `allow` among a harness's rules speaks where the workspace's cap is L2 or more and the harness is not at L0, so This session and Always hold at L1; an `always` the room already has writes nothing (ADR 0080) |
| 5 | **Fixed** in batch 4 (27 September): a harness may send `approval.resolved` or `question.answered` for an ask of its own run, once, never as an expiry, in its own name; first answer still wins (ADR 0079). The bridge sends them on OpenClaw's `exec.approval.resolved`, `plugin.approval.resolved` and `question.resolved` |
| 11 | **Fixed** in batch 4 (27 September): `usage.input_tokens` is optional; the tokens out are counted, the run's tokens in stay as they were, and no price is put on it. The bridge sends the tokens out alone |
| 18 | **Fixed** in batch 4 (27 September): `GET /v1/participants` gives a harness `last_seen_at`, and a room whose harness has never connected says "OpenClaw has never connected; it won't hear this yet" on the desktop and the phone, until it speaks |
| 23 | **Fixed** by ADR 0081 and its Jacobian half (1c58b8c, live 27 September 23:31): a room that is no Space's own keeps its own thread in Jacobian, and Jacobian hears an owner's agent that addresses it |
| 25 | **Fixed** on Arjun's call (28 September): no automatic `to`. An answer to an agent reaches it only by the model's @, and each adapter tells its model so (Jacobian 404490a, bridge 4ea78cd). ADR 0081 is amended, and so are the connect guides (6b69ad50). W5 then took two messages |
| 26 | **Fixed** in Jacobian 404490a: a room's members count whoever `space.created` made one |
| 27 | **Built** 28 September, not yet live: the phone's + picks one agent or several. The first picked is asked and names the room, the rest are added, and the first words go to Everyone |
| 29 | **Built** 28 September, not yet live: a person renames themselves from You, on the phone or the desktop (ADR 0082), and every agent hears `person.renamed` |
| 28 | **Fixed** in Jacobian 07009ec, on Arjun's word: `jacobian` typed bare is the full restart (`restart --check --all`) |
| 9, 10 | Not scheduled: the protocol gaps behind 4 and 5 beyond batch 4, and one connection for several agents (open decision 8) |

## Fixed in the bridge while testing

Each is a commit in `~/Work/chips-openclaw`:
- The summary is the whole reply, so the answer and the summary are one card.
- Usage and context come from OpenClaw's `usage` stream.
- `sessions.create` is keyed by the session key alone.
- A yes for always goes to OpenClaw as allow-once when that is all it takes.
- Question answers go back as arrays of labels.
- Runs are named from their own message, follow-up turns from the room's latest words, and a turn
  with no reply says so.
- Steps carry OpenClaw's own description of each call.
- A request made while OpenClaw is down waits for it, however many reconnects fail.
- In Phase 6: a cursor per Chips harness, so the scratch server's place never carried over to
  4431's; `scripts/bridge.sh` starts it against either; plugin approvals (Codex's own shell) become
  Chips cards and are answered with `plugin.approval.resolve`; a voice note or photo sent without
  words names its run from its transcript or its kind. Not fixed: when OpenClaw pauses its
  reconnects for a pairing, the bridge process exits without saying so.

## What OpenClaw needed

- **Its setup.** Under a ChatGPT sign-in, turns run on OpenClaw's Codex runtime, where an allowlist
  exec policy blocks every command without asking. `scripts/up.sh` now sets mode `ask`, with the
  user as Codex's reviewer. In Phase 6, on Arjun's word: the bridge holds `operator.admin`, the only
  scope that sees a plugin approval naming no reviewer, and Codex runs with full access inside the
  container (policy `untrusted`, so anything beyond its read-only safe list still asks), since its
  own sandbox cannot start there.
- **The pairing.** The bridge paired once as an operator device (`devices approve`), and has
  reconnected with its device token since.
- **Its behaviour, as observed:**
  - A turn's id is the `chat.send` idempotency key, here the Chips message id.
  - Queued messages are answered in follow-up turns of their own.
  - Approvals expire after about 30 minutes; the first one said one minute.
  - `web_search` fails without a search provider key.
