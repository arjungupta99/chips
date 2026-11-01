# 0146. An agent's context window is its harness's, shown and compacted in Chips

Date: 9 October 2026
Status: Accepted, 9 October 2026, on Arjun's "B, with the room line, every agent, Phase 0 now".
The build is `docs/proposals/agent-context-window-plan.md`.

## Context

Arjun asked: "display context window fill information for the agent and also have option to run
compaction. There should also be an auto compaction option where person can select limit." Mock:
<https://claude.ai/artifact/N3nnXBFU6zHfTfinXEZRjH>, layout B.

Chips already heard a run's fill (`context.usage`, the context ring on the web), per run and never
per agent. Nothing went down to a harness. The two harnesses differ:

- **OpenClaw** keeps a session per agent, with its tokens and window, and compacts one on request
  (`sessions.compact`). It has no per-agent threshold: it compacts on its own near full (about
  93% of 272K).
- **Jacobian** keeps each thread in memory, small at rest, and folds a turn's tool rounds mid-turn
  at one global threshold. That threshold was 450K tokens, above the 272K window, so it had never
  run, while turns reached 228.5K. Phase 0 set it to 200K the same day.

## Decision

1. **Nothing about a context window is Chips'.** A harness that declares `context_windows` sends a
   copy of an agent's (`PUT /v1/agents/:id/context-window`), whole. It sends one when it registers
   the agent, on connect, after the agent's turns, when a compaction starts and ends, and with each
   answer. The copy says:
   - how many tokens the agent holds (`used`), its model's window (`window`), and when it was
     measured;
   - whether it is compacting (`queued` behind a turn, or `running`);
   - its last compaction, from how much to how much, and whether a person asked (`last`);
   - whether it takes a Compact now (`compacts`, `why_not`);
   - its last long turn, the last whose height passed half its window: when it ended, the most it
     held, and how often it compacted itself (`long_turn`, added 10 October 2026, see the
     addendum below);
   - the limit it compacts itself at, as a percent of the window (`limit.at`, `null` for only
     when asked), the limits a person may pick (`choices`), the harness's own (`default`), and
     whether only when asked may be picked (`may_turn_off`). With no `limit`, the harness keeps
     its own and offers no other;
   - whether a person may change the limit (`editable`, `why_read_only`).

   Chips puts the numbers into words itself, by the run panel's rule ("172k of 272k tokens").
2. **A copy is a registry row** (`agent_context_windows`, migration 0043), as a model's and a
   heartbeat's are (ADRs 0140, 0143). The row holds the copy, the last limit asked, and the last
   Compact now. It goes with the agent and with its harness.
3. **Read and asked of by the people who run the harness**: its owner, or an owner or admin of
   the workspace. Anyone else sees no Context window group.
4. **Two asks, each answered by the harness's next copy.**
   - **A new limit**: `POST /v1/agents/:id/context-window/changes {at}`. It goes down as
     `context_window.change`. It is one of the choices, or `null` where `may_turn_off`.
   - **Compact now**: `POST /v1/agents/:id/context-window/compactions`. It goes down as
     `context_window.compact`.
     - It is *taken* by a copy that `answers` it while compacting.
     - It is *done* by a copy that answers it not compacting, or by the next copy that stops
       compacting.
     - It is refused while the agent is compacting already.

   Both go to the harness's sockets that said `context_windows` in their `hello`, now or never. An
   ask not answered within a minute reads as `missed`. The refusals are ADR 0140's: 422 for a limit
   not offered or an agent kept read only, 422 `harness_away`, 422 `change_waiting`, 403 and 404.
5. **The harness keeps the agent under the limit in its own way.**
   - Jacobian folds a turn at that share of the turn model's window, and folds a thread between
     turns that ends one above it.
   - OpenClaw's bridge compacts after a turn that ends at or over the limit. OpenClaw's own
     near-full compaction stays underneath, so "only when asked" means that and nothing sooner.

   Chips sends no Compact now of its own.
6. **The room says so.** When a copy's `last` is newer than the one before it, Chips writes
   `context.compacted` in the room the agent is in, once per compaction. It is a quiet line, the
   agent's: "J compacted its context · 214k → 21k tokens". Tapping it opens the agent's page. The
   first copy writes nothing, and an agent in no room gets no line.
7. **On the agent's page, layout B.** A Context window group sits under Model and Heartbeat,
   above Context:
   - a gauge: how full, as "63%" and "172k of 272k tokens", over 40 bars lit up to the fill in
     the context ring's tones (neutral to 70%, amber to 90%, red past it);
   - the limit, a marker standing in the bars. A person drags it, it snaps to the choices, and it
     saves when let go;
   - Compact now, a button in the gauge, which asks once in a sheet before it compacts, beside
     what it last did or is doing;
   - a Compacts itself row under the gauge, with a switch where `may_turn_off`;
   - a foot that says what compacting does, and why nothing can be asked now when it can't.

   Away or read only, the limit is quiet, as the Model group's is.
8. **Every agent** whose harness sends a copy, from the start.

## What is left out

- What the summary says, focus words for a compaction, and an undo.
- Jacobian's other threads, when two people talk to one agent: it reports the latest.
- A fill in the Agents list, and a ring in the phone's room.
- What a compaction costs: a short turn on the agent's model, which Chips can't price.

## Consequences

- Both harnesses gain code. The plan says how:
  - the bridge reads `sessions.describe` and calls `sessions.compact`, giving it the time it takes;
  - Jacobian learns its models' windows from Codex's cache, and compacts a thread between turns
    for the first time.
- `context.usage` stays per run, for the ring. The copy is the agent's.

## Addendum, 9 October 2026: Jacobian's threads, after the live check

The live check's 9.1k → 9.1k (CW-1) led to an investigation of Jacobian's compaction. Jacobian
kept twelve exchanges per thread, each what was asked and what was said, in memory only, and
dropped the oldest without a word; most of what its gauge counted was the opening prompt it
rebuilds every turn (9–12K), which no compaction touches. Its real pressure is inside one turn.
His rulings ("#1 sounds good", "#2 the variant", "#3 sounds good", "#4 mock first"):

1. **Fixes in Jacobian.** Notes no shorter than what they replace are thrown away and the thread
   left as it was; older exchanges under about 1K tokens are not worth a call ("Too little to
   compact yet."). Only a person's own thread moves an agent's page: a queue's (`run-<task>`,
   `task-<id>`) runs beside it and folds quietly. Jacobian no longer offers 90%, since a turn folds
   after the round that crossed its limit and one heavy round past 90% could overrun the window;
   it offers 50–80. Each compaction is logged.
2. **A thread is bounded by size, not twelve exchanges.** Past `spaces.compaction.thread_tokens`
   (40K, estimated, a picture at about 1,600) at a turn's end, its older exchanges fold into notes,
   the newest two kept, as Compact now does; with compaction off, or a fold that fails, it is
   trimmed to that size, oldest first, its notes kept. Such a fold is the agent compacting itself,
   so its room gets the quiet line.
3. **A thread outlives a restart.** Jacobian writes each thread to its Space's turn ledger as a turn
   closes off and reads it back while younger than 12 hours; what the agent's page held is kept
   beside it, so the gauge reads true after a restart. Until the agent's next turn, a Compact now
   waits ("It can compact after its next turn.").
4. **The gauge and a turn's peak**: a mock first (his call), then a decision (the addendum below).
   Also found: right after OpenClaw compacts, its count leaves out its opening prompt (about 9K for
   main) until the agent's next turn, so the gauge reads that much low for a while.

## Addendum, 10 October 2026: the last long turn on the gauge

The gauge reads what an agent holds between turns, and for Jacobian that is mostly its opening
prompt: its real pressure is inside a turn (228.5K on 5 October), which the gauge never showed. The
peak mock (https://claude.ai/artifact/SegA7Zmdh8Yykn9r9BExRC) offered four ways; his pick was "1,
keep the last long turn":

1. **The copy carries the agent's last long turn** (`long_turn: { at, peak, folds }`, optional):
   the last turn whose height, the most one round held, passed half its model's window, with how
   often it compacted itself during it. A long turn is kept until a later long turn replaces it,
   so a short reply after it does not wipe it; a harness that measures no turns sends none.
2. **Chips draws it as faint bars past the fill**, in the tone of how full that turn got (amber
   from 70%, red from 90%), its top bar held with a cap, and "Last long turn 80%" under it in the
   scale, kept clear of the window's size. The top bar lands and the words rise in, transforms
   only on the phone. Nothing is drawn when the turn reached no further than the fill. The note
   beside Compact now says what the turn did ("Its last long turn reached 218k and compacted itself
   once, at 9:16 AM.") when it is newer than the last compaction, and a screen reader hears it.
3. **Jacobian** keeps it per Space (any of the Space's threads, a queue's too, since the pressure is
   the Space's), beside the thread in the turn ledger, so a restart keeps it.
4. **A compaction that saves nothing writes no room line** (CW-1), in Chips as well as Jacobian:
   the server writes `context.compacted` only when `to` is below `from`.
5. **OpenClaw's low count right after a compaction is left as it is.** Its gateway says neither how
   big the opening prompt is nor that the count is an estimate (`totalTokensFresh` stays true),
   so the bridge has nothing true to add; the count is right again after the agent's next turn.
   OpenClaw sends no `long_turn` for now: it compacts near full by itself and reports each turn.
