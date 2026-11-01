# 0025. The Claude Code adapter is a bridge on the harness's machine

4 September 2026 · Status: superseded by [0041](0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md)

Taken while building M2.3's first piece, from a question the plan and [ADR 0024](0024-a-harness-has-spaces-and-a-space-is-a-worktree.md)
left open: the hooks make one HTTP call each — to what?

## Context

The blueprint says "each Claude Code hook is one HTTP call to your Chips server", and the mock
of `chips connect claude-code` says it writes eleven `http` hooks into `~/.claude/settings.json`
and puts the token in the keychain. Read together those two sentences do not work, and the
reason is worth writing down rather than quietly resolving.

What an `http` hook is, from the hooks reference on 4 September 2026: a POST whose body is the
payload, unmodified — there is no templating — with a `url`, optional `headers` whose values may
interpolate environment variables named in `allowedEnvVars`, and a timeout. The response is read
the way a command hook's stdout is, and the status code stands in for the exit code.

Three things follow that a server across the house cannot do.

- **The worktree.** ADR 0024 keys a space by the git worktree of `cwd`. The payload carries
  `cwd` and nothing else about the repository, and only a process on that machine can run
  `git rev-parse`. A remote server keying on `cwd` alone would make a second space for a
  terminal opened in a subdirectory, and could never title one `Chips · main`.
- **The token.** With hooks posting to chipsd, the harness's bearer token has to reach every
  call: either written literally into `~/.claude/settings.json`, or exported into the
  environment of every shell that launches Claude Code — and therefore into every command
  Claude Code runs. Both are worse than the keychain M2.1 chose.
- **Resuming a closed session.** The second half of M2.3 sends a message into a session that is
  no longer live by running `claude -p --resume <session-id>`. That is a process on the
  harness's machine. No arrangement of hooks moves it.

The alternative that avoids a long-running process is a `command` hook piping to `chips hook`,
which can do all three. It costs a Node start per hook, and `PreToolUse` and `PostToolUse` fire
on every tool call: a few hundred milliseconds added to each one, blamed on Claude Code rather
than on Chips.

## Decision

**`adapters/claude-code` is a bridge: a small process on the machine Claude Code runs on.** The
hooks stay `http` — the blueprint's word — and their URL is `http://127.0.0.1:<port>/hooks` on
the bridge rather than the server. The bridge holds the harness's token, resolves the worktree,
translates each payload into Agent Connect events, and talks to chipsd as the harness.

1. **It answers `{}` to everything.** A chat app watching a session has no business changing
   what it is watching. The approval gate is the one exception, and it is a later piece.
2. **It answers 200 even when it failed.** A Chips that is unreachable must look like a Chips
   that was never installed. Every failure is logged where the bridge's logs go and swallowed;
   nothing Chips does can stop a person working. The cost is that a silent failure is possible,
   which is why the log is a required argument rather than a default nobody reads, and why
   `chips doctor` will check the bridge.
3. **The hooks present a shared secret**, written into the settings file beside the URL.
   Loopback is not an authorisation: anything running as this person could otherwise post a
   forged tool call, and a forged tool call is a forged approval request.
4. **The space is found on the server, not remembered here.** `POST /v1/harnesses/:id/spaces`
   takes the key the adapter names a worktree with and answers with the space, opening one the
   first time. The key is stored on the space, scoped to the harness and unique in the
   workspace. So a bridge that has lost everything it knew — a new machine, a cleared config —
   finds yesterday's spaces rather than making a second set of them. The bridge caches the
   answers for as long as it runs, and that is all the map it has.
5. **A harness may open a space, and only this one.** The rule that a harness cannot open a
   space stands everywhere else; this door gives it exactly one shape: a direct space between
   the harness and its own owner, named by a key. It cannot name another harness's space,
   because the key it asks with is prefixed with its own id, on the server.
6. **A session's life is two events**, `session.started` and `session.ended`, carrying a
   `session_ref`, where it is running, and the harness's own transcript. They are Agent Connect
   events rather than something Claude Code shaped: a Jacobian Space and a Codex thread are
   visits too.

## Consequences

- `chips connect claude-code` has a fourth thing to write and `chips disconnect` a fourth to
  undo: the bridge, started by a launch agent. Both are still plain files with a record kept.
- `chips doctor` gains a check: the bridge is listening, and the hooks point at it.
- The blueprint's connect mock says "write 11 http hooks", which stays true. What changes is
  the URL in them, and the line about the launch agent that `connect` will print.
- A machine with no bridge running has Claude Code sessions that Chips never hears about. They
  are not lost — the next session in that worktree lands in the same space — but the gap is
  real, and it is what makes the bridge's own supervision worth doing properly.
- `spaces` gains `external_key`, unique per workspace, and `space.created` gains the field that
  feeds it. Jacobian's adapter will use the same door for its Spaces (M2.4).
- Codex, when it comes at M7.3, needs a process on the machine for its own reasons: its hooks
  have no `http` type at all. The bridge is the shape that adapter will take too.
