# 0040. A message names the session it is for, and a visit carries its own name

7 September 2026 · Status: accepted · Narrowed by [0041](0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md)

From Arjun's question of 6 September — "this Chips-main seems to sync up all messages I am
sending to Claude here, even if they are being sent to separate sessions" — and his answers on
the seventh: the pin is **synced**, and **auto stays the default**. The interleaving is ADR 0024
working as designed. What is not designed is that a person cannot say which of several terminals
they mean, and cannot read which one a line came from. This records both, and what neither fixes.

## Context

A space is a worktree (ADR 0024), so every `claude` started under it lands in one room and a
space collects terminals. That is the property the keying exists for — close every terminal,
come back tomorrow, continue — and it is not in question here.

Four things follow from it that were never decided, only inherited:

- **The target moves.** `sessionToAddress` is `space.sessions[0]`, and `freezeSessions` orders
  live-first then by `lastSeenAt`. Answer a question in the second terminal and the next message
  typed in Chips — composed for the first — silently retargets to the second.
- **The composer predicts; the bridge decides.** The client calls a visit live when `endedAt` is
  unset; the bridge calls it live when `visit.live` **or** its transcript was written inside
  `STILL_OPEN_MS`. Two implementations, kept in step by a comment saying they are "the same
  sentence". They already disagree in the case `visits.ts` documents: `SessionEnd` fires while
  somebody is plainly still in the session.
- **Nothing on the wire names a session.** `message.new` carries `message_id`, `from`, `text`,
  attachments, mentions and `reply_to`. The courier picks the visit itself, from its own store.
- **A person's own messages carry no label.** `sessionTag` is read from the line's run, and
  `Line.runId` is only ever set where a completed run folds onto the harness's last said line.
  So Claude's answers are tagged and the message that asked for them is not.

And one thing that turned out to be available. Claude Code writes an `ai-title` line and a
`custom-title` line into the session transcript, each carrying the title and the session id, and
re-stamps them about once a turn — 171 and 173 stamps in one session of this repo, read on 6
September 2026. Neither appears in its hooks reference. `Stop` already opens that file for usage,
so the name costs one more pass over a buffer already in memory.

Nothing could carry that name, though: `session.started` and `session.ended` are the only session
events, and the projection upserts `session.started` with `state: "live"`, `ended_reason: null`
and `started_at: event.ts` — so re-sending it to change a title would resurrect an ended visit
and reset when it began.

## Decision

1. **A message may name the session it is for.** `session_ref` is optional on `message.post` and
   is carried into `message.new`. The server checks it names a session of that space. The courier
   delivers to the visit named rather than the visit guessed; that path is `carry`, which already
   exists for a deferred approval. A harness that reports no visits ignores the field, and one is
   never required to read it.

2. **The pin is the person's, it lives on the server, and it follows them.** A registry table,
   not a projection (ADR 0018), one row per workspace, person and space, holding a `session_ref`;
   read and replaced at `/v1/me/…` like notification settings, and readable by nobody else —
   an owner and an admin included (ADR 0037, decision 1). Arjun's call, and the right one for
   the case the picker is for: pin at the desk, walk away, and the phone still aims at the same
   terminal, because a session lives where its harness is and not where the typing happens.

3. **Auto is the default and stays.** With nothing pinned, a message goes where it goes today,
   by the ordering above. The picker is offered only where there is a choice to make — the
   condition already gating the per-line tag, `space.sessions.length > 1` — so a person with one
   terminal never meets any of this.

4. **A pin that cannot be reached refuses, and never falls back.** *Ended* is not *gone*: an
   ended visit is resumed, which is the pin working. Gone is the bridge no longer holding the
   visit at all — pruned past `KEEP_PER_SPACE`, or never seen on this machine — and then the
   message is not sent, the composer says which session it meant, and the person picks another.
   Quietly retargeting would be the worst outcome available: an answer from the wrong terminal
   is read as an answer from the right one, and acted on.

5. **A visit carries a name, and the harness supplies it.** A new `session.renamed`, harness to
   Chips, carrying `session_ref` and a title; `sessions` gains a `title` column, and the
   projection updates that column alone. The Claude Code bridge reads the title at `Stop` from
   the transcript it is already holding, prefers `custom-title` over `ai-title` because a name a
   person chose beats a name a model wrote, and sends the event only when the title has changed
   from the one its `Visit` last recorded. Which of the two it came from is resolved in the
   adapter and does not go on the wire: Chips has no use for the distinction.

6. **The name is what a session is called, everywhere.** The visit strip, the picker and the
   sentence above the composer say the name; so does the label under a line. A short ref survives
   only as hover text, beside the worktree path. A line shows its session's *current* name, which
   is what identifies the terminal it came from — not what that terminal was called at the time.
   A session with no name yet says so; it has none for its first turn or two, because the name is
   generated from the conversation.

7. **What is not here.** No per-session rooms: a space is still one thread, and keying a space by
   something other than the worktree is a larger decision this does not open. Jacobian sends
   neither session event, so it has no visits, no picker and no route sentence, and nothing here
   reaches it. Whether a Codex thread is a visit or a space of its own stays M7.3's to answer.
   Folding the visit strip into the picker — one list instead of two — was raised and is not
   decided; the strip stays until it is.

## Consequences

- The protocol gains one optional field and one event, so `pnpm gen:protocol` and the events
  reference follow. The conformance kit's rows are unchanged: a harness that sends neither is
  as conformant as it was.
- A migration for `sessions.title` and the pin registry; `session.renamed` projects as a narrow
  update, deliberately not the upsert `session.started` uses, so a rename can never revive a
  visit that has ended.
- The core's `messageRoute` takes the pin into account and `sessionToAddress` keeps its ordering
  for the auto case; `Line` gains the session its message named, which is what finally lets a
  person's own message be labelled.
- The bridge honours `session_ref` through `carry`, and reads the title where it already reads
  usage. Both are cheap; neither adds a file it was not opening.
- **`ai-title` and `custom-title` are undocumented.** This is the same bet the bridge already
  takes reading usage from the transcript — recorded in `STATUS.md` and the Claude Code page,
  by no ADR — and it degrades the same way: no lines, no name, the ref instead.
- **The two liveness rules still disagree.** A pin turns the composer from a prediction into an
  instruction, which is why it is worth having, but the client and the bridge still decide
  liveness by different evidence and the composer can still promise `resume` where the bridge
  delivers through the channel. Narrowed, not closed, and left open on purpose.
- The plan is not edited here — that happens at gates — so this lands in `STATUS.md` under
  Scope changes until a gate takes it.
