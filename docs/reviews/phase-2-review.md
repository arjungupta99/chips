# Phase 2 review

Verdict: **Pass with fixes** — the fixes were found during the gate, applied before the tag, and
are confirmed present below; four conditions carry into Phase 3.
Reviewed commit: tag `phase-2-complete`
Reviewer: Fable · 5 September 2026, on the Mac mini the phase was built for

The phase's goal was "run on the Mac mini; connect Jacobian and Claude Code; a stranger can
install from the docs", and all three are true on the machine this review is written on.
`chips doctor` here reports the server on 4431, Claude Code's bridge on 8790 with eleven hooks,
and Jacobian's token last used four hours ago; the terminal I am reviewing from is itself a
Claude Code session whose prompts and answers are in the `Chips · main` space. A fresh clone of
the repository installed, built, served the page, paired itself, registered a harness and had it
say hello in **eleven seconds** of wall clock, following Start here as written. The six
milestones' acceptance tests run, in Vitest, in Chromium, against a real server, a fake Chips
that speaks the wire, and Jacobian's own compiler over a scratch copy of its tree.

What holds the verdict at *with fixes* is not the adapters, which held under every probe, nor
the docs, which a cold reader can follow, but two things the packet could not see from inside
the tree. The first is that **CI has been red on `main` since 4 September** and nobody knew:
the architecture page the gate checks for staleness was generated here with Tauri's build
output in the graph, so it carried a node a clean checkout never produces, and the lint step
that runs `check:architecture` has failed on every push since the desktop was first built
(finding 1, fixed at the gate). The Phase 1 review's condition 3 — observe a green run — was
carried twice precisely so that this class of thing would be seen; it was not, and this is what
it cost. The second is the one promise of M2.3 the bridge does not keep: an approval decided
after the gate has handed the question back to the terminal goes nowhere (finding 2, a
condition). Beside those, four small things the local-install probes found — file modes, a
pairing door with no throttle, a QR with the wrong address — each fixed at the gate, and one
docs gap the focus list named, fixed the same way.

## What was verified

Everything was run on Node 26, as in every gate so far. **The Node 22 leg has still not been
observed**, and this time it could not be run locally either: Homebrew's `node@22` on this
machine is unlinked — its binary aborts on a missing `libsimdjson` — and reinstalling a system
package is Arjun's, not mine. The fresh clone therefore ran under Node 26.

| Command | Result |
|---|---|
| `pnpm check` in a fresh clone at the tagged commit | exit 0 · 133 files, **1,554 passed**, 0 skipped · Biome clean at complexity 12 · dependency-cruiser 479 modules, no violations · architecture and protocol pages current · every package and the docs site type-check |
| `pnpm test` coverage | 94.27 lines / 82.77 branches / 92.37 functions / 92.39 statements — each above the packet's, and above Gate 1's on three of four |
| `pnpm docs:check` | 5 of 5 samples, two of them against an in-process chipsd |
| `pnpm docs:build` | 73 pages, every link validated |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **21 passed** (Chromium, 1.1 minutes; scale, windowing and restart last as their own project) |
| `chips conformance claude-code` · `jacobian` | passed, 14 events in 0.5 s · passed, 19 events in 0.6 s |
| `chips conformance custom`, a hooks-mode harness written from the Custom guide alone | passed, 7 events |
| `node adapters/jacobian/scripts/vendor.mjs --check` | Jacobian's own `tsc` over a scratch copy: 0 errors |
| `pnpm bench:append` | 1,632 ms for 10,002 events against 2,000; replay 26.5 µs per event |
| `pnpm bench:fold` | ten thousand events in two hundred flushes: **3 ms** |
| The fresh clone, timed | clone 1 s · `pnpm install` 4 s (store-backed) · `pnpm web:build` 2 s · `pnpm chips serve` answering in 3 s · the page at `/` 200 · `connect custom` and a hello landing 4 s later · `doctor` clean · **11 s from clone to a harness talking** |
| The cold read of 5 September, from STATUS | serve to a harness saying hello from the terminal 64 s; the browser path — pair at the QR's address, Add harness, paste — a minute more |

I read the diff from `phase-1-complete` — seventy-six commits, six of them the gate's — in full for the parts the gate
focus names and by section for the rest: the door's changes (`authorize.ts`, `open-space.ts`,
`submit-event.ts`), the last-used stamping, the sessions projection and its migration, the CLI
end to end (`serve`, `pair`, `connect`, `disconnect`, `doctor`, the keychain and the device),
the bridge (`translate.ts`'s gate, `resume.ts`, `inbound.ts`, `listen.ts`, `channel-server.ts`),
the Jacobian plugin's resolution path (`cards.ts`, `bot.ts`), the shell's seam (`native.ts`,
`useDesktop.ts`) and its Rust (`notify.rs`, `discovery.rs`), the kit's `workspace.ts` against
`authorize.ts`, the new web route, every migration, every ADR from 0023 to 0028, `STATUS.md`
and the packet. I walked the demo script as far as this machine allows: step 1 in full from the
fresh clone; step 2's result live (`doctor`); step 3's issuing half (`chips pair --issue` prints
a code and a QR that now names the Wi-Fi's address); steps 4 and 7 through
`bridge.integration.test.ts` and the hand checks recorded on 4 September; step 5's first half
as Arjun observed it on 5 September. The laptop's pairing, the Telegram half of step 5, and the
notification's button are Arjun's, and the packet says so.

Then eleven probes against the local install, the gate focus's third item:

| Probe | What it did | What happened |
|---|---|---|
| P1 | A hook posted to the live bridge on 8790 with no secret, then with a wrong one | **403, 403.** Loopback is not an authorisation (ADR 0025). |
| P2 | Two hundred wrong pairing codes at `POST /v1/pair` | **1,902 a second, all 401.** A six-character code from thirty-two, alive fifteen minutes: a 0.16 % chance per code for a guesser nobody slows. Finding 5, fixed: the sixth wrong code in a minute from one address is `429` with `retry_after_seconds`. |
| P3 | Browsed `_chips._tcp` while the scratch server advertised | Name, port, host, the addresses, and a TXT record with the workspace id, the server version and the protocol version. Nothing secret, as the Mac mini page says. |
| P4 | Read how a resumed turn is started | `spawn("claude", ["-p", "--resume", id, text])` — an argv, no shell. A message typed in Chips cannot inject a command on the harness's machine. |
| P5 | `chips export` to a folder | The folder `0700`, the snapshot `0600`, and the command says it holds credentials. |
| P6 | The data directory and the database `serve` makes | **`0755` and `0644`**, the umask's, while every file the CLI writes is owner-only. Finding 3, fixed: `0700` and `0600`, the WAL and SHM files with them. |
| P7 | `~/.claude/settings.json` after `connect claude-code` | Eleven hooks, each carrying the bridge secret in an `X-Chips-Bridge` header, in a **`0644`** file. Finding 4, fixed: written `0600`. |
| P8 | A harness's token at `POST /v1/pairing-codes` | **403** `forbidden`. A token is not a person (`pairing-codes.test.ts`). |
| P9 | `/../secret.txt`, `/..%2Fsecret.txt`, `/assets/../../secret.txt` at the page | **404** each, and never the file (`web.test.ts`). |
| P10 | Two harnesses both saying `hello-1` | **201, 201**, two events — found by M2.6's cold read, fixed before the gate (ADR 0027), proved in `gateway.test.ts`. |
| P11 | `pnpm check` in a fresh clone | **`check:architecture` failed** where it passes in the working tree. Finding 1. |

## Engineering standards (Appendix G)

1. Layers inward, cruiser green: **yes.** The kit restates the door rather than importing the
   domain (ADR 0026), which is the one place the rule is kept by discipline rather than by the
   cruiser; `workspace.test.ts` is written rule for rule against `authorize.ts`. The CLI imports
   the server's wiring only; the adapters nothing of it.
2. Input validated at the edge: **yes.** Every event through the schema at the door and in the
   fake; hook payloads read field by field; the settings file refused rather than overwritten;
   the pairing body's shape checked before any lookup.
3. Idempotency: **yes**, and per sender since ADR 0027; a rotation issues before it revokes and
   is safe to interrupt; the bridge keys every event by run and hook.
4. Workspace scope on every query: **yes**; the events read carries the viewer for membership,
   which the replay gap of 5 September proved necessary.
5. One transaction, `rebuild` reproduces: **yes**; the replay property test covers the new
   tables; `chips import` is that replay through the same code.
6. Cursor pagination, indexes: **yes**; four new indexes, each beside its query.
7. Heavy work off the request path: **no**, unchanged from Phase 1 and accepted for the same
   reason; the bridge's transcript read is bounded.
8. Coverage met, any down: met; lines down 0.4 with the adapters brought *into* the report,
   branches up.
9. Property tests: the replay's totality extended; the door rules in the kit; the run and
   policy machines unchanged.
10. Deterministic tests: injected clock and ids in the server and the CLI; real sockets and a
    real clock in the kit's and the bridge's integration tests, by design, with ceilings.
11. Quarantined tests: none.
12. Logs: ids, never a token; the bridge logs a session's id and never a prompt; the server's
    redaction is at every depth.
13. Metrics: none — Phase 6; `doctor` is the first page of the runbook.
14. Dependencies: seven new, each pinned, each with a reason in the packet; the Jacobian plugin
    brings none into Jacobian.
15. Docs: every public surface of the phase has a page, and the reference regenerated for the
    two session events and three fields.
16. Blueprint nouns: **yes**, and the code took them on the second day.
17. Sizes: within the complexity limit; three long files that read top to bottom, named in the
    packet.
18. Load recorded: the windowing run at a locked 60 fps against 11,000 messages, the scale run
    faster than Gate 1's, the fold at 3 ms, the append benchmark within budget.

## Findings

### 1. CI has been red on `main` since 4 September, and the packet did not know
**Medium, process. Fixed at the gate.** `tools/architecture/generate.mjs:28`,
`.dependency-cruiser.cjs:208`, `docs/architecture.md`; entered at `c3a661e`.

`pnpm check` passed in the working tree and failed in a fresh clone at `check:architecture`,
with one line of difference: the committed page had a node for `apps/desktop`. The generator's
noise pattern excluded `dist`, `coverage` and `.turbo` but not Cargo's `target`, so on this
machine — where the desktop has been built — dependency-cruiser walked Tauri's generated
JavaScript under `src-tauri/target/debug/build/…` and the page was written with a package a
clean checkout never sees. CI's lint step runs that check, so every push since the desktop
shell's page-side commit has failed it. Nobody saw, because the Phase 1 review's condition 3 —
look at the Actions tab once — was never done, and this is the plainest argument yet for doing
it. **Fix:** `target` is noise to the generator and to the cruiser's own exclusions; the page
is regenerated from a clean view; `check:architecture` passes in the tree and in the clone.

### 2. An approval decided after the gate gave up goes nowhere
**Medium. A condition for Phase 3.** `adapters/claude-code/src/translate.ts:436-493`,
`adapters/claude-code/src/listen.ts:41`.

The gate posts `approval.request` with `expires_in` equal to its own wait, blocks nine minutes,
and answers `ask` — the terminal's own prompt — when nothing has come. The request carries a
`resume_token` "so a decision that arrives after this process is gone still has something to
act on"; nothing reads it. The courier hears `message.new` and nothing else. So the card and
the hook expire together, and there is no path by which a decision made at minute ten reaches
the session — the second half of the blueprint's "the hook waits for the decision, or defers and
is resumed later", and M2.3's acceptance line "a deferred approval answered after the session
ended resumes correctly". It is safe as it stands: nothing is approved that nobody saw, and the
terminal asks. But a person who could not reach the phone in nine minutes loses the ask to the
terminal, and in a headless `claude -p` run there is no terminal to lose it to. **Fix, in Phase
3 (M3.5):** a decision that arrives after the gate has answered starts a turn in the session
that carries it — the channel when live, `claude -p --resume` when closed — with the card saying
which; the packet's first question, answered: yes, a late decision starts a new turn.

### 3. The database and its directory are created with the umask
**Low, security. Fixed at the gate.** `server/src/infrastructure/db/connection.ts:43-49`.

`.chips/` was `0755` and `chips.db` `0644` on this machine: the whole event log — every message,
every decision, every token's digest — readable by any account here, while the CLI's own files
are `0600` and the export folder `0700`. Now the directory is made `0700` and the database
`0600` before WAL mode, so the `-wal` and `-shm` files inherit it; a database found looser is
tightened on open. `connection.test.ts` checks all four files.

### 4. The settings file carries the bridge's secret, world-readable
**Low, security. Fixed at the gate.** `cli/src/commands/claude-code.ts`, `write()`.

ADR 0025 chose loopback plus a shared secret so that a hook could prove it is Claude Code's;
the secret rides in an `X-Chips-Bridge` header on each of the eleven hooks in
`~/.claude/settings.json`, which was `0644`. Another account on the machine could read it and
post hooks the bridge would believe — a run, a step, a `Stop` — into the person's spaces. The
file is written `0600` now; it is the person's, Claude Code runs as them, and nothing else
should read it. `claude-code.test.ts` checks the mode.

### 5. Pairing takes wrong codes as fast as the machine can answer
**Low, security. Fixed at the gate.** `server/src/interfaces/http/routes/pair.ts`.

Probe P2. A code is 2³⁰ possibilities, alive fifteen minutes, and single-use — so a guesser
wins only by exhausting the space while the code is alive, which at 1,902 attempts a second is
a 0.16 % chance per code on a server bound to the network, and the Mac mini page tells people to
bind to the network. Now five wrong codes a minute from one address, then `429` with
`retry_after_seconds`; a malformed key does not count; a right code inside the allowance still
pairs. `pair.test.ts`.

### 6. The Claude Code page did not say, in the blueprint's terms, what differs
**Low, docs. Fixed at the gate.** `apps/docs/src/content/docs/connect/claude-code.md`.

The gate focus asks whether the docs say plainly what differs between the terminal and Chips.
The page had the two ways in and the sentence about what does not change; it lacked the
blueprint's table — what Claude sees on each path, what you get, the limits today: questions
and plan approval do not come through the channel, Claude answers a channel message briefly as
to one from outside, a resumed turn runs in a fresh permission mode — and the comparison with
Remote Control that ADR 0024's seventh decision asks for. Added, as a table and two paragraphs.

### 7. The QR carried the VPN's address
**Low. Fixed at the gate.** `cli/src/commands/serve.ts`, `lanUrl`.

The first non-internal IPv4 address on this machine is Tailscale's, so `chips pair --issue`
printed `http://100.64.0.7:4497` for a phone standing next to the mini on its Wi-Fi. An RFC
1918 address wins when there is one.

### 8. The served page has no Content-Security-Policy
**Low, security. A condition for Phase 3.** `server/src/interfaces/http/routes/web.ts`.

Section 6.4: "the web app ships a strict content security policy." The page sends
`X-Frame-Options: DENY` and `nosniff` and nothing else; ADR 0028 says so and defers it here
rather than guess at a policy that could break the app silently. Before Phase 3 ends: a policy
written against what Vite's build actually loads, checked by a test that fetches `/`.

### 9. The app has no way to pair another device
**Low. In the plan.** `chips pair --issue` and `POST /v1/pairing-codes` exist since M2.6; the
app has no screen for them, so a phone is paired from a terminal. Added to Phase 4's M4.1, where
the phone arrives.

### 10. The checklist's rows are the protocol's, not the blueprint's
**Note. Accepted.** The blueprint's card lists Sessions, Runs, Approvals, Steps, Usage, Context
ring, Lanes and Messages-in-the-channel; the app and the kit light Messages, Runs, Steps,
Approvals, Questions, Context, Cost and Finished. The built list is the same for every harness
and lights on event families a harness author can find in the reference; a Sessions row would
be dark for a Jacobian that is complete. The packet's fourth question, answered: keep.

### 11. The kit restates the door
**Note. Accepted, with the test that keeps it honest.** `packages/conformance/src/workspace.ts`
restates `authorize.ts`'s six rules rather than importing them, so a stranger's adapter can run
the kit without the server (ADR 0026). The drift risk is real and `workspace.test.ts` is
written rule for rule against the server's tests. Worth re-reading at Gate 3, when lanes add a
seventh rule.

### 12. `security add-generic-password` takes the secret on its command line
**Note. Accepted.** `cli/src/keychain.ts`. For the moment it runs, the token is visible to this
user's own processes in `ps`; the tool has no stdin form for `add`. The alternative was a native
module and a compiler on every machine that installs Chips.

## Deviations accepted

Every entry under Scope changes in `STATUS.md` for Phase 2, as the packet lists them: the nouns
and the mid-phase plan edit (ADR 0024); the bridge on the harness's machine (ADR 0025);
`PermissionRequest` alone as the gate (open decision 5 now); the two session events and the
three fields; the harness's one door to a space; L2's shell command, said plainly; no context
ring without a window size; `Stop` posting the reply as a message; not every Jacobian Space a
space (ADR 0024's addendum); the served page, the machine paired by construction and the issued
code (ADR 0028); keys per sender (ADR 0027); the launch agent as a template; no direct space for
a harness that opens its own. The blueprint deviations in the packet's table, each with its
reason, including the checklist rows (finding 10). None to reverse.

One deviation the packet did not name, accepted here with a reason: the plan's M2.1 said
`chips connect` "opens the connection", and for Jacobian and a custom harness it cannot — the
harness is not on the machine — so it prints what the harness needs, once, and `doctor` says
when the harness has never spoken. That is the right reading of the sentence for a harness that
runs elsewhere.

## Conditions for the next phase

1. **The deferred approval** (finding 2), as M3.5's task in the plan: a late decision starts a
   turn in the session that carries it, through the channel when live and by `claude -p --resume`
   when closed, with the card saying which and the bridge's integration test proving both.
2. **A Content-Security-Policy on the page chipsd serves** (finding 8), before Phase 3 ends; in
   the plan's Phase 3 exit criteria.
3. **Observe one green CI run on `main`** — the Phase 1 review's condition 3, carried a third
   time, now with the reason it was never green (finding 1) fixed. The next push after the tag
   is the first that can be green; write it on the "Last review" line. `gh` is still
   unauthenticated here, and Homebrew's `node@22` on this machine wants a reinstall before the
   Node 22 leg can be run locally.
4. **Jacobian on this Mac mini**: re-vendor the plugin and restart it, so the live run carries
   the cost-store read and M2.5's fixes; and the seventh seam, one line in Jacobian's gateway.
   Both Arjun's; nothing in that checkout is committed without his word.

## Follow-up: the fixes, confirmed

Each was made during the gate and is in the tagged commit; I re-ran what proves it, and the
fresh clone's `pnpm check` above is the run that includes them all.

| Finding | Fix | Proved by |
|---|---|---|
| 1, the stale page | `target` excluded from the generator and the cruiser; the page regenerated | `pnpm check:architecture` in the tree and in a fresh clone; `lint:deps` counts the same modules in both |
| 3, the database's mode | `0700` directory, `0600` database, WAL and SHM with it | `connection.test.ts`, "makes the directory and the database owner-only" |
| 4, the settings file | Written `0600` | `claude-code.test.ts`, "leaves the file owner-only" |
| 5, the pairing door | Five wrong codes a minute per address, then `429` | `pair.test.ts`, both cases |
| 6, the docs | The blueprint's table and the two paragraphs on the Claude Code page | `pnpm docs:build`, 73 pages, links validated |
| 7, the QR's address | RFC 1918 first | `serve.test.ts`, "prefers the home network's address" |
