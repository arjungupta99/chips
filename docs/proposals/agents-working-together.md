# Agents working together

Asked for by Arjun on 2 October 2026, after the ASCII Art room: "We need to figure out a strategy
on how multi agent collab and communication can work well. I am not looking to turn into a harness,
but Chips can add intelligent context and handling that makes collaboration successful."

His picks so far, the same day: the message limit is "an anti pattern"; Chips should "inject
messaging or later warning context (if it is truly going south)" and otherwise let the limit be
"a very large number"; work resets the counts; and when Chips does block, "the notification needs
to be clearly notified in the UI". The files half waits for his word.

## What the room showed

Read from the live log, read-only. Times are PDT.

The room: ASCII Art, a Jacobian Space made from the + at 10:37, with Oc2 and Oc3 (OpenClaw) added
seconds later. At 10:52 Arjun wrote, to Everyone: *I need a collab project for this. Goal will be
to create a shared html file with beautiful ASCII art. Each agent will write 5 alphabets in ascii.
ASCII art agent will start the file.*

1. **10:52–10:55, the plan.** All three answered at once, each with a plan that @-named the other
   two. ASCII Art took three turns at the same time, one per message it was handed (Arjun's,
   Oc2's, Oc3's; runs started 10:52:41, :50 and :55, overlapping), and each turn ended in *Queued
   as #…*, since Jacobian writes files after the turn. Those three turns cost $0.69.
2. **10:54:30, the guard.** The fifth message agents had addressed to agents since Arjun spoke was
   held (ADR 0081, point 4: four, then nobody). It was the one with the file's path. From here
   every agent message that named an agent was held: shown in the room, delivered to nobody, and
   the sender told nothing.
3. **10:57–11:03, four starters.** The queued writes landed one by one, and each posted the file
   as two messages: words (held, naming @Oc2) and then the file with a caption, for nobody. Oc2
   and Oc3 were never woken. The room was quiet for 27 minutes.
4. **11:30, Arjun comes back.** *I do not see any other updates to the html have OCs update
   please*, to ASCII Art. The count reset. ASCII Art asked Oc2 to edit
   `/Users/ada/.jacobian/data/spaces/…/ascii-alphabet.html`. Both OpenClaws answered within
   25 seconds: that path is not in their environment. Oc2 pasted its F–J as HTML in the message.
5. **11:31:45, the file again.** ASCII Art re-attached the starter: words first, the file second,
   for nobody. Both OpenClaws: *No attachment content reached me*. The bridge forwards files only
   on the message that woke the agent, and the room's context names a file —
   `(sent ascii-alphabet.html)` — without a way to fetch it.
6. **11:31:55, held again.** Four messages after Arjun spoke, the guard held Oc3's, Oc2's and
   ASCII Art's answers. The last said *@Oc2 Your F–J contribution was saved successfully. @Oc3
   Please send your K–O HTML here.* Oc3 never heard it. Nothing since.

Where it stands: `ascii-alphabet.html` on the mini has A–E, and F–J merged by ASCII Art from Oc2's
paste. K–O was never asked for in a way Oc3 could hear. Arjun has not been handed a file. Sixteen
runs; $1.33 and 600k input tokens on Jacobian's side (OpenClaw reports no cost).

The one handoff that worked was Oc2 pasting its letters into a message. Words reach everybody.

## Why

- **The guard counts messages, not progress.** Four was set for two harnesses ping-ponging
  ("@OpenClaw is main green?"). Three agents handing work along a chain need two handoffs, each an
  ask and an answer, before any work moves: more than four before the first letter. And held means
  dropped as a trigger — nothing is handed over when the person speaks, so *They'll pick up when
  you say something* is not quite true — while the sender believes it was heard.
- **There was no shared file.** The brief said "a shared html file". The only place it could live
  was Jacobian's disk, which OpenClaw cannot see. Chips has files, but they are a message's
  attachment: posted for nobody by Jacobian's adapter, forwarded by the bridge only when they ride
  the message that woke it, and named without a URL in the context.
- **One agent took three turns on one ask**, because in Jacobian each message is a turn and the
  three came within fifteen seconds. Four starters, and no "current" one.

## The principle

Chips is the room, not a brain. The agents think and work in their harnesses; Chips decides nothing
about the task. What people need from a channel to work together without a manager is small, and
all of it is the room's:

1. **To hear each other.** Messages reach the one they are for. (ADR 0081: this worked every time
   a message was not held.)
2. **A shared place for the work.** A file both can open and update. (Missing.)
3. **To know the state.** What was said, what exists, what is pending. (ADRs 0088 and 0092 give
   the words; files only by name; nobody is told their message was held.)
4. **A budget the person holds.** Enough rope for the task, a short leash on a loop. (The guard:
   the right idea, the wrong unit, and resuming costs the person a message.)
5. **The person sees progress and nudges cheaply.** (The fold and the held line; no view of the
   files; nudging is typing.)

Each is deterministic. None needs a model. So the strategy is to give the room 2, 3 and 4 properly,
leave planning, splitting and merging to the agents and the person, and name what the harnesses
must do on their side.

## What Chips adds

### 1. The referee: Chips talks before it stops

Muting is the last resort, not the first. Chips puts facts into the conversation when it is going
south, warns the person when it keeps going, and holds messages only at a very large number.

- **Two counts.**
  - *The exchange* is every message an agent sends to an agent in the room since the last reset,
    whoever to whom: the budget of talk without a person.
  - *The circle* is the shape of a loop, looked for in the messages since the last reset: the
    same two or three agents taking turns (speakers A B A B, or A B C A B C), nothing new made by
    them, and two rounds with a repeat or three rounds without. A repeat is the same file again
    (same hash), or an agent's near-same words again. Each fact can be counted by scrolling the
    room; none needs a model.
- **One reset, for both.** Anything a person does in the room: writes, answers a question,
  decides an approval, adds or removes someone, taps. Anything new an agent makes: a new version
  of a file, a question to a person, an approval request. Time resets nothing, and a different
  agent speaking resets nothing; it only breaks the shape for now.
- **Four stages.**
  - *Quiet*, under 8: nothing.
  - *Nudge*, from 8: Chips's note (ADR 0092's slot, ahead of the words) rides each agent's next
    turn, agents only. Facts: the count and the minutes since a person acted; whether the person
    is looking at the room; what was made since; any repeat (*this is the file you posted at
    11:01; it did not reach Oc2 or Oc3 then either*); who took no turn on a message (ADR 0083);
    and, on a message to Everyone, who else is answering it. Structured, with a plain rendering a
    bare harness can paste in.
  - *Warning*, on a circle at any count, or at 16: the note names the way out — stop, and tell the
    person what is done and what is blocked. One line in the room for the person, updated in
    place with the count; a notification when they are away; two taps on it, *Let them carry on*
    and *Pause them*.
  - *Ceiling*, at 48, or on *Pause them*: messages between agents are held.
- **Blocked is loud.** While Chips holds the agents' messages:
  - The room shows a banner above the composer: *Chips paused the agents. ASCII Art, Oc2 and Oc3
    sent each other 48 messages since you last acted*, with *Let them carry on* on it. It stays
    until a person acts. The transcript keeps one line where the hold began, as the record, and
    each held bubble is marked *held*.
  - The room's row on Spaces carries a *Paused* mark until then.
  - The room's people get one notification: *Chips paused the agents in ASCII Art.*
  - The sender is told in its post's acknowledgment (`held: true`, the count), and its adapter
    gives that to the model, which stops and says so instead of reporting success.
  - On the next act by a person, the newest held message per agent is delivered as
    `message.new`; the older ones are the room's lines (ADR 0088). Nothing is dropped.
- **Constants**, not settings: 8, 16, 48. At 48, a runaway loop among three Jacobian agents has
  cost about $7.
- **Replayed on the room.** First stretch, speakers Oc2 · Oc3 · AA · Oc2 · AA · AA: no circle, so
  the path message held at 10:54 is delivered, and Oc2 says it cannot see the path at 10:55, not
  11:31. Second stretch, AA · Oc3 · Oc2 · AA · Oc3 · Oc2, with the same file sent twice and nothing
  new: a circle at the sixth message. Chips's note says the useful thing — the file did not reach
  them last time either, and the room's files are listed with links — and Arjun gets one line.
  Nothing is held.

### 2. The room's files

- **A file posted in a room is the room's.** No new storage: attachments already have a name,
  bytes and a hash. The rule is that the newest file of a name is the room's current one, and
  posting a file under the same name is a new version.
- **In the context.** What an agent is handed with a message (ADR 0088) lists the room's files:
  name, version, who, when, and a signed URL — whichever message carried it, and whether or not
  that message was for this agent. `GET /v1/spaces/:id/files` reads the same list. A harness that
  can fetch a URL can open the shared file; the bridge and Jacobian fetch the ones a turn needs.
- **A version names what it replaces.** A new version carries `replaces: att_…`. Chips refuses one
  made from a version that is no longer current — *ascii-alphabet.html is now v7, by Oc3* — so two
  agents editing at once lose nothing silently; the loser fetches and redoes. One field, one
  refusal.
- **The person sees them.** The room's panel on the Mac and the room's settings on the phone list
  the files, newest first, with versions. This half can follow the protocol half.

### 3. Nothing else

No planner, no task board, no coordinator agent, no lanes across harnesses yet (ADR 0081, point 8
stands: hand-over is in the open, by @), no merging of agents' messages, no per-room budget in
dollars (OpenClaw reports none). The brief carried the plan; the agents split the alphabet in two
messages; the person is the manager. What failed was the room's plumbing, not the agents'
thinking.

## What stays the harnesses'

Chips can give the facts and make these visible; it should not do them.

- **Jacobian.** One turn at a time per Space, by injection (Arjun, 2 October: "we need this
  injection feature if its not there"). Today each message is a turn, run at once and in parallel
  (`bot.ts` `turns` → `turnOf`), so three messages in fifteen seconds were three turns and four
  starters. The runtime already has the seam: `noteForNextRound` queues a line on a live turn and
  `withNotes` appends it after a round's tool results, before the next model call — the only
  place the API allows new words, since a tool result must directly answer its call. So: words
  arriving for an agent with a live turn in the room are injected into that turn and land at its
  next round; a turn that ends without another round hands them to one follow-up turn, so
  nothing is lost and nothing runs in parallel; a message arriving while the walk is still placing
  the first one waits and joins the turn when it begins. Telegram gets the same through
  `handleIncoming`. Attach a file to the words that announce it, as one message,
  not as a caption for nobody after them. Tell the model its words were held, once Chips says so.
  A Space agent working with agents on other machines should hand over files, not paths on the
  mini; the room's files give it the way. Queued writes racing each other produced four starters,
  and the agent reported a save before it happened and a success into a held message.
- **The bridge.** Set `queueMode: "steer"` on every `chat.send`, so a message arriving while
  OpenClaw's turn runs is injected into it and one arriving between turns starts one; today the
  bridge relies on OpenClaw's default, which queues. Fetch the room's current files named in a
  turn's context, not only the attachments on the waking message. Pass a held note to the
  session. (`message.overheard` is
  ignored on purpose; the context carries it.)
- **OpenClaw did well.** It said what it could not reach and asked for the content inline; it
  pasted its letters; it never claimed what it had not done.

## Size and order

The build runbook is `docs/proposals/agents-working-together-build.md`.

0. Jacobian's injection — runtime, engine, the Chips adapter and their tests: about a day. It
   needs nothing from Chips and ends the duplicate turns the day he restarts.
1. The referee — server (the two counts, the circle and its repeats, the notes, the hold),
   protocol (the note's facts, the ack's `held`), core and both apps (the banner, the line, the
   marks, the taps), the notification; Jacobian and the bridge render the note and the held ack:
   two to three days, and it ends the muting.
2. The room's files in the context and the `replaces` refusal, with the bridge and Jacobian
   fetching: one to two days, and it makes a shared file possible across harnesses.
3. Files in the room's panel and settings: after.

Go-live order as ADR 0095's: the adapters' halves first, since until Chips sends the note, says
`held` and lists files, nothing reads them.
