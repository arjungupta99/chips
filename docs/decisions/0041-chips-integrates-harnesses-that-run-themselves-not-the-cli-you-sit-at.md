# 0041. Chips integrates harnesses that run themselves, not the CLI you sit at

7 September 2026 · Status: accepted · Supersedes [0025](0025-the-claude-code-adapter-is-a-bridge-on-the-harnesss-machine.md)

Taken on Arjun's call, on the day of, after a design discussion that shrank the Claude Code
integration three times and then ran out of things to shrink. The adapter is removed, not
rewritten.

## Context

Chips is for the harnesses Jacobian, Hermes and OpenClaw are: a daemon somebody runs, that keeps
its own loop and its own memory, and reports in. Claude Code is not one of those. It is a CLI you
sit at, and the whole of [ADR 0025](0025-the-claude-code-adapter-is-a-bridge-on-the-harnesss-machine.md)
was the cost of pretending otherwise.

Everything hard about the adapter followed from one fact: **Chips never started the session.**
Not starting it, the bridge had to infer six things, each of them a guess dressed as a fact.

- **Which session.** From the hook payload's `session_id`, which is all a hook says about itself.
- **Which room.** From `cwd` → `git rev-parse` → a worktree key, which is why the bridge had to be
  a process on that machine at all.
- **What it is called.** By scraping the session's own transcript JSONL for the title Claude Code
  writes into it.
- **Which session a message is for.** A picker, pins and `session_ref` on the message
  ([ADR 0040](0040-a-message-names-the-session-it-is-for-and-a-visit-carries-its-own-name.md))
  exist because a worktree can hold two terminals and neither of them signed for the message.
- **How to deliver it.** The Chips channel into a live session, `claude -p --resume` into a closed
  one, never both — and the channel matches a session by `cwd` alone, so two terminals in one
  worktree are indistinguishable and the newest attached wins.
- **Whether it is alive.** From the mtime of a transcript file, because `SessionEnd` arrives for
  sessions somebody is plainly still in.

Each of those is defensible on its own and the code says so honestly. Together they are a pile of
inference standing in for a handshake that never happened, and the channel — gated on an account
feature, an org policy, and two flags including
`--dangerously-load-development-channels` — is a good implementation of an impossible job.

The alternatives were weighed and rejected in the same discussion:

- **Only track sessions Chips started.** Verified as possible: `claude -p --input-format
  stream-json` holds a real multi-turn conversation, `--session-id` is honoured and `--resume`
  recovers it in a fresh process. But something has to own those processes, and that something is
  a harness. Chips is not one.
- **Keep hooks, drop the mirror — approvals and notifications only.** The smallest honest version:
  two hooks instead of eleven, a card that asks before a tool runs. Still a bridge, still a
  settings file edited under someone's home directory, still supervision of a conversation
  happening somewhere Chips cannot see, for the one harness that has a supervisor already sitting
  in front of it.

## Decision

**Chips does not integrate Claude Code.** `adapters/claude-code`, `chips bridge`, `chips channel`
and everything written for them are removed rather than reduced.

1. **A harness Chips supports runs by itself.** It has its own loop, is reachable while nobody is
   watching, and holds a token of its own. Jacobian is the shape; Hermes, OpenClaw and anything on
   `@chipschat/harness` are the same shape. Being asked to supervise something from a phone is only
   worth anything when there is nobody at the keyboard.
2. **Claude Code is a custom harness like any other, if somebody wants it.** The four environment
   variables, the [hooks guide](../../apps/docs/src/content/docs/connect/hooks.md) and the SDK are
   all still there, and none of them are Chips' code to maintain. What is gone is a first-party
   adapter and the claim of support that comes with it.
3. **The wire keeps sessions.** `session.started`, `session.ended`, `session.renamed`,
   `session_ref` on a run, pins and the visit strip stay in the protocol. They describe any
   harness that is visited rather than always running, they are documented for a custom harness,
   and their only first-party user is gone — which is a reason to leave them alone and watch, not
   a reason to tear out a second thing on the same day.
4. **The launch agent, the settings writer and the keychain's bridge secret go with it.** Nothing
   is left behind that edits `~/.claude/settings.json`.

## Consequences

- `chips` loses two commands (`bridge`, `channel`) and a harness (`claude-code`) from `connect`,
  `disconnect`, `doctor` and `conformance`. `Harness` is now `jacobian | custom`.
- `doctor` loses `bridge:<harness>`. A harness that has never used its token now warns whatever
  it is; before, Claude Code was excused because the bridge answered for it separately.
- `Connection` loses `bridge`, and the keychain loses the bridge secret. A `connections.json`
  written by an older build still reads: the field is simply ignored.
- CI runs conformance for one adapter.
- 7,012 lines of adapter and about 900 of CLI, docs and tests go. The suite is 149 files and
  2,193 tests, all green.
- **What is lost, said plainly.** The deferred approval (Gate 2, condition 1) had exactly one
  first-party harness that could raise one from a terminal, and the Phase 5 condition to watch one
  from a real phone can no longer be met that way. It has to be met with Jacobian or a sample.
- **The live workspace still holds Claude Code's spaces, sessions and messages.** The log is
  append-only and none of it is rewritten. The harness stays in the workspace with its history,
  the way `disconnect` always left it; its spaces simply stop gaining events.
- [ADR 0024](0024-a-harness-has-spaces-and-a-space-is-a-worktree.md) is unchanged in principle —
  a harness has spaces, keyed by whatever it calls a unit of work — but its worked example was a
  git worktree, and no first-party harness keys on one any more.
  [ADR 0033](0033-two-harnesses-in-one-worktree-share-one-space.md) keeps its rule for the same
  reason and loses its only pair.
  [ADR 0040](0040-a-message-names-the-session-it-is-for-and-a-visit-carries-its-own-name.md)
  keeps its rule and loses the case that forced it: with no harness offering two live visits, a
  message names a session that nothing yet needs named.
- This closes the door M7.3 was going to walk through. Codex needed a process on the machine for
  the same reasons and would have inherited the bridge; it now has to justify itself from zero,
  against the same question — does it run when nobody is watching?
