# OpenClaw as Chips's second harness: install, test, uninstall

27 September 2026 · Accepted. **Decided by Arjun:**
- Docker.
- Keep the bridge.
- Chips gains "remove a harness" (decision 4b), built before Phase 6.
- **Chips has no dependency of any kind on OpenClaw** ("chips should not have any kind of dependency
  on OpenClaw").

**Where things live, then:**
- **The bridge and the OpenClaw scripts** are in their own repository, `~/Work/chips-openclaw`, beside Chips. It is not pushed anywhere unless he says so.
- **The bridge speaks Chips's public wire by hand**, written from Chips's docs alone, as a third party would. It imports nothing of Chips.
- **Chips keeps only prose:** this plan and the test report.
- **A guard enforces it:** `tools/guardrails/no-harness-named.test.ts` fails if a harness appears in any manifest, the lockfile, a tool, a script or a workflow.

**Progress:**
- **Phase 0 is done.** The baseline was taken at 00:04 PDT.
- **Phase 1 is done.** OpenClaw 2026.9.6 is up in `chips-openclaw`. Its exec policy is mode `ask` with the user as Codex's reviewer, since an allowlist blocks every command on the Codex runtime (see the report).
- **Phase 2 is done.** He signed in to ChatGPT; the model is `openai/gpt-6-astra`.
- **Phase 3 is done.** A scratch Chips runs on 4436, with its web app on 5186.
- **Phase 4 is done.** The bridge is in `~/Work/chips-openclaw/bridge`: 21 tests, run by `scripts/bridge.sh` against the scratch server or 4431.
- **Phase 5 is done.** The results and 17 findings are in `docs/reviews/openclaw-test-report.md`.
- **Phase 5a is built and live** (ADR 0078) since 01:18 PDT on 27 September: 4431 on migration 0029, the desktop and his iPhone rebuilt from main 671a37bc.
- **Phase 6 is done**: OpenClaw is a harness on 4431 (token in the keychain, `new_spaces` declared) and the bridge runs against it. Every H and P test is recorded in the report (H6 deferred, as planned), with six new findings (18 to 23).
- **Phase 7 is sized** in `docs/proposals/openclaw-findings-sized.md`: all 23 findings in five batches by what they cost to ship, the smallest first. Nothing is built without his word.
- **Phase 8 waits for his word.**

**Corrected from the first draft, 27 September 2026:**
- **The pinned version is 2026.9.6**, not 2026.9.3. It was released on 23 September and has an arm64 image.
- **The image is 4.87 GB unpacked, not ~1 GB.** It sits in the Colima VM's disk, which is 60 GB.
- **OpenClaw keeps sign-in secrets in a third folder,** `/home/node/.config/openclaw`. It is mounted from `~/chips-openclaw/secrets`.
- **The sign-in is by device code** (`--device-code`): a link and a short code, entered on any device. This is simpler than pasting a redirect URL, which stays as the fallback.

## Why

Chips has had one real harness, Jacobian. ADR 0077 removed the single-harness assumptions that a
read of the code could find. A second real harness, built differently from Jacobian, is the only way
to find the ones a read cannot. OpenClaw is that harness. It is a gateway with many agents and flat
sessions, and it has approvals and questions of its own. It is here **to test Chips**, and it
leaves the Mac as it found it.

Model access is **GPT through OpenAI's OAuth** (ChatGPT sign-in), not an API key.

## The ground rules

- **One folder, one container, nothing else.** Everything OpenClaw keeps goes in `~/chips-openclaw/`:
  config, sessions, the agent's workspace, the OAuth tokens and logs. OpenClaw itself runs in one
  Docker container, `chips-openclaw`, on the Colima that is already running.
- **Nothing installed on the Mac itself.** There is no launchd service (never
  `onboard --install-daemon`), no global npm package, no `~/.openclaw`, no `/tmp/openclaw` and no
  `/Applications/OpenClaw.app`. This Mac's Node is 26.0.0, and OpenClaw needs 26.1+ or 24.16+. The
  container means that never matters.
- **The agent works inside the container.** Its shell and file tools cannot see the Mac's files.
- **Loopback only.** The gateway is published on `127.0.0.1:18789` and needs a token.
- **Storefront is not touched.** Its six containers share the Colima VM (8 GB; Storefront uses ~2.4 GB, and
  OpenClaw needs ~1 GB). Every Docker command in the scripts is scoped to the compose project
  `chips-openclaw`. Nothing runs `docker system prune`, or anything else that reaches beyond the
  project.
- **Pinned.** One image tag (2026.9.6) is used from install to
  uninstall. OpenClaw's gateway protocol is strict about versions (min = max). The bridge is built
  against that tag.
- **His word at each stop.** The steps marked ⏸ wait for Arjun.

## What lives where

| Thing | Where | Made in | Gone in |
|---|---|---|---|
| Baseline of the Mac, to compare against at the end | `~/chips-openclaw-baseline.txt` (outside the sandbox, so it outlives it) | Phase 0 | Phase 8, last step |
| OpenClaw image, pinned tag | Colima's image store | Phase 1 | Phase 8 |
| Container `chips-openclaw` | Colima | Phase 1 | Phase 8 |
| OpenClaw state: config, sessions, workspace, SQLite with the OAuth tokens, logs | `~/chips-openclaw/state/` → `/home/node/.openclaw` | Phase 1–2 | Phase 8 |
| Gateway token (local only) | `~/chips-openclaw/.env`, mode 600 | Phase 1 | Phase 8 |
| Scratch Chips server, with its own database | `~/chips-openclaw/chips/`, port 4436 (checked free at start) | Phase 3 | Phase 8 |
| Bridge's cursor file and log | `~/chips-openclaw/bridge/` | Phase 4 | Phase 8 |
| Scripts: `up.sh`, `down.sh`, `login.sh`, `cli.sh`, `check.sh`, `uninstall.sh`, `compose.yaml` | `~/Work/chips-openclaw/` (its own repository, not Chips) | Phase 1 | stay; they are how it is done again |
| The bridge (OpenClaw ↔ Chips), with its own tests and `@openclaw/*` packages | `~/Work/chips-openclaw/bridge/` | Phase 4 | stays, kept apart from Chips (decision 3) |
| OpenClaw as a harness on 4431 | his live workspace | Phase 6 (⏸) | removed in Phase 8 with `chips remove OpenClaw` (Phase 5a, decision 4b) |

## Phases

### Phase 0 · Decide, and take a baseline

⏸ **Arjun decides** (details under *Decisions* below):
1. Docker, as recommended.
2. GPT OAuth for the model. Chosen.
3. Whether the bridge code stays in Chips after the uninstall.
4. What happens to OpenClaw's harness row on 4431 after the uninstall.

**Then the baseline** goes to `~/chips-openclaw-baseline.txt`, as plain listings:
- the top level of `~` (dotfiles included) and of `~/Library/LaunchAgents`
- `launchctl list` filtered to `openclaw`
- `npm ls -g --depth=0`
- `docker ps -a`, `docker images` and `docker volume ls`
- the keychain searched for `openclaw`
- `/Applications` filtered to `OpenClaw`
- `/tmp/openclaw`
- ports 18789, 1455 and 4436

**Exit:** the file exists, and nothing named OpenClaw exists anywhere.

### Phase 1 · OpenClaw in its container

- `compose.yaml` in `~/Work/chips-openclaw`:
  - project `chips-openclaw`, one service `gateway`, the pinned image
  - `127.0.0.1:18789:18789`, volume `~/chips-openclaw/state:/home/node/.openclaw`
  - `env_file: ~/chips-openclaw/.env`, restart `no`
  - the container binds `lan` inside, and only loopback is published
- `up.sh`:
  - makes the folder
  - writes a random gateway token into `.env` (mode 600)
  - pulls the image
  - runs OpenClaw's non-interactive onboarding with `--skip-channels --no-install-daemon`, gateway token auth and no model yet
  - starts the gateway
- Config written in the same step:
  - **Exec approvals:** `tools.exec.security: allowlist`, `tools.exec.ask: always`, `askFallback: deny`. Every command asks, which is what Chips is here to show.
  - **One agent, `main`.**
  - **No messaging channels.** Chips is its only client.
- `check.sh` reports what is running: the container, the port, the gateway's health, and the folder's size.
- `down.sh` stops the container and keeps everything.

**Checks:**
- `openclaw --version`, `openclaw doctor` and `openclaw gateway status` pass, through `docker compose -p chips-openclaw exec`.
- The Control UI opens at `http://127.0.0.1:18789/` with the token.
- A connection without the token is refused.

**Exit:** the gateway is healthy, and a diff against the baseline shows only the container, the image and `~/chips-openclaw`.

### Phase 2 · GPT sign-in (⏸ Arjun's hands)

- `login.sh` runs `openclaw models auth login --provider openai --device-code --set-default` inside the container, interactively.
- OpenClaw prints a link and a short code. Arjun opens the link on any device, signs in to ChatGPT and enters the code. No port is published for it.
- If the device code is ever refused, the fallback is the redirect paste: sign in through the printed `auth.openai.com` link, then copy the failed `http://localhost:1455/auth/callback?...` address into the terminal.
- **Only Arjun handles his sign-in.** I run the script and read its output, and never the credentials.
- The tokens land in the SQLite files under `~/chips-openclaw/state/`, and OpenClaw refreshes them itself.
- The default model is chosen from `openclaw models list --provider openai`: a GPT model his plan covers.

**Checks:**
- `openclaw models auth list --provider openai` shows one profile.
- A one-line prompt in the Control UI gets an answer.
- `openclaw agent` can run `ls`, but only after the Control UI's approval card is answered. Exec approvals work before Chips is involved.

**Exit:** OpenClaw answers on GPT, and asks before it runs a command.

Note: usage counts against his ChatGPT plan's limits. Replies may carry tokens and no dollar
figure, and Chips should then show a usage row without a cost (test U1).

### Phase 3 · A scratch Chips, apart from 4431

- A `chipsd` on 4436 in dev mode on loopback, with its database in `~/chips-openclaw/chips/`. It is started by hand and stopped by its PID. The CLI's pairing and 4431 are untouched.
- OpenClaw's harness is registered through that server's dev route, `POST /v1/dev/harnesses`, with `capabilities: ["new_spaces"]`:
  - no `autonomy`, because OpenClaw's approvals are its own
  - no `follows_rooms` in v1
- The desktop web app runs on its own Vite port against 4436 and is paired with a code from that server.

**Exit:** OpenClaw is listed in the scratch workspace's Harnesses, never connected.

### Phase 4 · The bridge

`~/Work/chips-openclaw/bridge/` is a small process that is two clients at once. It lives outside
Chips and depends on Chips only through Chips's public wire:

- **To Chips:** the public wire by hand (WebSocket and HTTP, as `connect/` in Chips's docs
  describes). It imports none of `@chipschat/*`. Where the docs fall short, that is a finding for the
  report (test D1), and the bridge is not fixed by reading Chips's source.
- **To OpenClaw:** OpenClaw's published client, `@openclaw/gateway-client` and
  `@openclaw/gateway-protocol`, both pinned to 2026.9.6, the gateway's own version. Checked on 27
  September:
  - They depend only on `ws`, `ipaddr.js` and `typebox`.
  - The bridge pairs as an operator device with role `operator` and scopes `read`, `write`, `approvals` and `questions`.
  - Pairing is approved once inside the container (`scripts/cli.sh devices approve <id>`).
  - The device key and token live in `~/chips-openclaw/bridge/`.
  - A probe paired and connected: protocol 4, 466 methods, 64 events.

**Shape, v1:**
- **One OpenClaw agent is one Chips harness.** This puts off open decision 8 (one connection, many agents) until lanes need it.
- **One Chips room is one OpenClaw session,** always created by the bridge (`sessions.create`), never OpenClaw's shared `main`. The room is claimed under the session key. That key is the only map, and it is kept in Chips (`GET /v1/harnesses/:id/spaces`). The bridge keeps no database, only its `since` cursor.
- **Filtered by session.** Every event is filtered by session key, because OpenClaw may send events to every connected client.
- **No `follows_rooms` in v1.** An archive or delete in Chips does nothing in OpenClaw.

**What maps to what.** The method and event names are checked against the protocol schema shipped
in the pinned image (`packages/gateway-protocol`) before any code is written. The names below are
from the docs and the September survey.

| Chips → OpenClaw | | OpenClaw → Chips | |
|---|---|---|---|
| `message.new` | `chat.send {sessionKey, message, idempotencyKey}` | agent lifecycle start/end/error | `run.started` / `run.completed` / `run.failed` |
| photo/file in `message.new` | fetched from the signed URL, sent as `attachments` (base64) | assistant message | `message.post` in the room |
| `space.created` asked of it (the +) | `sessions.create`, then claim the room with the session key | tool start/end | `step.log` (started/done), `run.status` |
| `run.cancel` | `chat.abort` | `exec.approval.requested` | `approval.request` (command, cwd) |
| `run.steer` | `chat.send` with `queueMode: "steer"` | per-turn usage, context % | `usage`, `context.usage` |
| `approval.resolved` once/always/deny | `exec.approval.resolve` allow-once / allow-always / deny | `ask_user` | `question.ask` (if the answer RPC exists; otherwise noted as a gap) |
| `question.answered` | the questions RPC (to be confirmed) | compaction before/after | `checkpoint` (if emitted) |

**Tests, in the bridge's repository, run with `node --test`, with no OpenClaw needed:**
- Unit tests of each mapping, one row of the table each, including:
  - an event for another session is dropped
  - a person's photo is sent as base64
  - allow-always becomes `allow-always`
  - a lost connection reconnects
- An integration test with the bridge between two stand-ins:
  - a fake gateway, a WebSocket server replaying frames recorded from the real OpenClaw in this phase
  - a fake Chips, a small WebSocket and HTTP server that speaks the wire as the docs describe
- `chips conformance custom` with the bridge as the subject, run against the real container during this phase. Chips's CLI runs the kit and the bridge connects to it, so nothing crosses into Chips. It must pass the kit's required rows: Messages, Runs, Steps, Approvals, Cost and Finished, with none refused.
- Chips's guard keeps passing: no harness in Chips's manifests, lockfile, tools, scripts or workflows.

**Exit:** the bridge's tests green, conformance passed, and the bridge answering in the scratch
workspace. Chips's `pnpm check` is unaffected, because nothing of this is in Chips.

### Phase 5 · Chips tested against OpenClaw, on the scratch server

The test list is under *The Chips tests* below. This phase runs everything that needs no phone and
no Jacobian. The results go in `docs/reviews/openclaw-test-report.md`: each test with pass, fail or
gap, what was seen, and the event seqs for anything that failed.

**Exit:** every test run, and each failure is either fixed (if small and plainly Chips's bug) or
listed for Phase 7.

### Phase 5a · Remove a harness, in Chips (decision 4b)

Chips could withdraw a harness's tokens but never remove the harness. This phase adds removal, for
any harness, as a Chips feature. It has an ADR of its own, and it lands before Phase 6 so the
uninstall leaves nothing on 4431.

- **Server:**
  - `DELETE /v1/harnesses/:id`, for the harness's owner or a workspace owner or admin (the rule for its tokens).
  - It withdraws every token, which closes its sockets.
  - It records `harness.removed` in the log, and marks the harness removed in the registry (a migration adds the column).
  - The harness's home rooms stop being homes, so they can be archived or deleted like any other room.
  - A removed harness cannot be given a token, added to a room, or asked from the +.
- **Its history stays:** what it said keeps its name. The clients mark it removed and leave it out of:
  - Harnesses
  - the + picker
  - add-a-member
  - @-mentions
- **CLI:** `chips remove <harness>` removes it on the server, then does what `disconnect` does here.
- **Desktop:** a *Remove harness…* action on its profile, asked first.
- **Phone:** the same action on its profile, with the confirm sheet.
- **Tests:**
  - server: the route, the authorization matrix row, and that a removed harness is refused everywhere
  - core: the fold and the readers
  - the CLI
  - web and phone component tests
  - a web e2e: remove a harness and it leaves the list and the +

**Exit:** `pnpm check` and the e2e suite green, and ADR 0078 written. Going live needs a 4431
restart, the desktop bundle and the phone rebuilt, each on his word.

### Phase 6 · Live beside Jacobian, on his iPhone (⏸ his word)

- `chips connect custom --name OpenClaw --no-dial` on 4431, then `chips declare OpenClaw new_spaces`. The token goes into the login keychain, as for any harness.
- The bridge is pointed at 4431. It keeps running by hand, never as a launch agent.
- Arjun uses it from his iPhone and the desktop app. I watch the log, the `events` table and the bridge's log.
- Runs the multi-harness tests (H) and the phone tests (P) below.

**Exit:** the H and P tests are recorded in the report.

### Phase 7 · Findings into Chips

- Each failure is triaged: a Chips bug, a bridge bug, an OpenClaw limit, or a gap in the protocol.
- Bridge bugs are fixed there.
- Chips bugs and gaps each come to Arjun **sized first**: files, migrations, restarts, and what he gets for it. The smallest option comes first, and nothing is built without his word.
- Candidates already known from ADR 0077:
  - a room drawing each harness's live run (test H3)
  - capabilities declared by the harness in `hello`
  - one connection carrying several agents, which is needed for OpenClaw's sub-agents as lanes

**Exit:** the report lists each finding with its outcome.

### Phase 8 · Uninstall OpenClaw (⏸ his word)

`~/Work/chips-openclaw/scripts/uninstall.sh`, in this order, each step printed:

1. Stop the bridge (by its PID file) and the scratch `chipsd` on 4436 (by its PID).
2. On 4431, only if Phase 6 ran, by hand before the script: delete OpenClaw's rooms if Arjun wants them gone, then `chips remove OpenClaw` (Phase 5a). This withdraws its tokens, removes it from the workspace and forgets the keychain secret.
3. `docker compose -p chips-openclaw down -v --rmi all`, which removes the container, the project's volumes and the pinned image. Storefront's containers are not touched.
4. `rm -rf ~/chips-openclaw`, which takes the state, the OAuth tokens, the logs, the scratch Chips database and the bridge's cursor with it.
5. **The OpenAI side:** deleting the folder destroys the tokens. OpenClaw documents no sign-out. If ChatGPT's account security settings list the sign-in, Arjun ends it there (⏸ his hands).
6. `check.sh --gone` compares against the baseline:
   - no container, image or volume named `chips-openclaw` or `openclaw`
   - no `~/.openclaw`, no `/tmp/openclaw`
   - no `ai.openclaw.*` in LaunchAgents or `launchctl`
   - no global `openclaw` npm package, no `/Applications/OpenClaw.app`
   - nothing in the keychain named `openclaw`
   - 18789, 1455 and 4436 free
   - the top level of `~` the same as the baseline, and Storefront's six containers still running
7. The baseline file is deleted last, after the comparison passes.
8. The bridge and the scripts stay in `~/Work/chips-openclaw` (decision 3); Chips needs no change, having nothing of OpenClaw in it.
9. STATUS records the uninstall and the check's output.

**Exit:** the check is clean, and the Mac is as the baseline found it.

## The Chips tests

Every test names what is done, what Chips must show, and where it runs:
- **S** = the scratch server (Phase 5)
- **L** = live on 4431 (Phase 6)
- **CI** = automated in the repository

### Connection and setup

| ID | What is done | Chips must | Where |
|---|---|---|---|
| C1 | The bridge connects for the first time | show OpenClaw connected in Harnesses; the checklist lights Messages, Runs, Steps, Approvals and Cost as events arrive | S |
| C2 | The OpenClaw container is stopped for a minute, then started | show it disconnected, then connected; nothing said in the minute is lost (it is delivered on reconnect) | S |
| C3 | The bridge is killed mid-reply and started again | resume from its cursor; no reply posted twice (idempotency keys) | S, CI |
| C4 | `chips doctor` | report OpenClaw's token live and last used, beside Jacobian's, by name | L |
| C5 | Its profile | show no autonomy dial (OpenClaw's permission model is its own) and no timeline without a milestone | S |

### Messages

| ID | What is done | Chips must | Where |
|---|---|---|---|
| M1 | "What can you do?" in OpenClaw's room | show a run: the thinking bubble, the reply, the run's receipt, a usage row | S |
| M2 | Ask for a table, code and a long answer | draw the Markdown; long replies scroll and wrap | S |
| M3 | Send a photo and ask what it shows | the photo reaches OpenClaw and is described | S, L (phone) |
| M4 | Send a voice note | the transcript reaches OpenClaw and is answered | L (phone) |
| M5 | Send three messages within two seconds | each gets a receipt, queued or steered; three answers or one combined answer, never lost | S |
| M6 | Stop a run midway | the run ends as cancelled; OpenClaw's turn is aborted | S |
| M7 | Steer a running turn ("shorter, please") | the steer reaches the running turn | S |
| M8 | Thumbs-down on a reply; edit and delete a sent message | nothing breaks; the bridge ignores what OpenClaw has no word for | S |

### Rooms

| ID | What is done | Chips must | Where |
|---|---|---|---|
| S1 | + → Create new space → OpenClaw → "Plan a weekend in Big Sur" | open "New space"; OpenClaw makes a session, claims the room and names it; the first words are answered there | S, L (phone) |
| S2 | Tell room A a fact, ask room B for it | room B does not know it: one room, one session | S |
| S3 | Restart the bridge | find its rooms through Chips, open no duplicates, and answer in the right one | S, CI |
| S4 | Archive, then delete, an OpenClaw room | the sheets promise nothing on OpenClaw's behalf (no `follows_rooms`: ADR 0077, live); the room goes | S, L |
| S5 | A room asked while the bridge is down | be claimed and answered when the bridge comes back | S |

### Supervision

| ID | What is done | Chips must | Where |
|---|---|---|---|
| A1 | "List the files in your workspace" | show an approval card naming the command and folder; Approve → it runs → `approval.executed` | S, L (phone) |
| A2 | The same, denied | show it denied; OpenClaw says it did not run it | S |
| A3 | Allow always, then ask for the same command again | the second runs without a card | S |
| A4 | Answer a card in OpenClaw's Control UI instead | resolve the Chips card as answered elsewhere, first answer wins | S |
| A5 | Leave a card unanswered past OpenClaw's fallback | show it expired or denied, not waiting for ever | S |
| A6 | Approve from the iPhone (Needs you was withdrawn with For you, ADR 0065, so in the room) | same as A1, decided on the phone | L |
| Q1 | A prompt that makes OpenClaw ask a question (`ask_user`) | show the question card with its options; the answer reaches OpenClaw | S (or recorded as a gap if the RPC is missing) |

### Cost and context

| ID | What is done | Chips must | Where |
|---|---|---|---|
| U1 | Any turn | show tokens; with OAuth and no dollar figure, show usage without a cost, not $0 | S |
| U2 | A long conversation | fill the context ring if OpenClaw reports it; hide it if not | S |

### Several harnesses at once (what ADR 0077 was for)

| ID | What is done | Chips must | Where |
|---|---|---|---|
| H1 | Open the + with both connected | offer Jacobian and OpenClaw (both declare `new_spaces`) | L (phone, desktop) |
| H2 | A group room with Jacobian, OpenClaw and Arjun; say "hi" | reach both; neither answers the other's reply unless named (SDK loop guard on OpenClaw's side; Jacobian's own rule on its side) | L |
| H3 | "@OpenClaw …" and "@Jacobian …" at once, so both work together | each run is visible; **known gap:** the room shows only its newest run, so the finding is recorded, not failed | L |
| H4 | Delete sheets in a Jacobian room and an OpenClaw room | Jacobian's promises; OpenClaw's does not | L |
| H5 | The Spaces list with both harnesses' rooms | each room carries its harness's face and name; nothing is Jacobian's by default | L (phone) |
| H6 | Jacobian hands work to OpenClaw (a lane) | **deferred:** needs one connection presenting several agents (open decision 8) | — |

### On the phone

| ID | What is done | Chips must | Where |
|---|---|---|---|
| P1 | Cold open with OpenClaw's rooms in the list | draw its rooms, faces and the + without a jump | L |
| P2 | An approval arrives while the app is in the background | show it in its room on return, the room's row saying "Needs a yes" (push needs a paid Apple team, so no banner) | L |
| P3 | A photo from the camera roll to OpenClaw | the photo flies to its tile and reaches OpenClaw (M3 on the phone) | L |

### Safety

| ID | What is done | Chips must | Where |
|---|---|---|---|
| X1 | Connect to the gateway without the token | be refused | S |
| X2 | Ask OpenClaw to list `/Users` | not see the Mac's files (it is in the container) | S |
| X3 | Look for the Chips token of OpenClaw's harness | find it only in the keychain (Phase 6) or the scratch folder (Phase 3) | S, L |

### Chips's docs, read as a third party

| ID | What is done | Chips must | Where |
|---|---|---|---|
| D1 | Write the bridge's Chips half from `connect/` in Chips's docs alone, never Chips's source | give a third party everything it needs: each place the docs were silent, wrong or unclear is a finding, with what had to be guessed | Phase 4 |
| D2 | Chips's guard after the whole test | find no harness in Chips's manifests, lockfile, tools, scripts or workflows | CI |

## Decisions for Arjun

1. **Docker or not?** Docker is recommended, for the reasons in the ground rules. The alternative
   is a private Node and OpenClaw inside `~/chips-openclaw/`, with `OPENCLAW_HOME`,
   `OPENCLAW_STATE_DIR` and the log file pointed there. It is just as easy to remove, but the
   agent's tools would run on the Mac.
2. **Model.** GPT through OAuth, **chosen**. He signs in himself in Phase 2.
3. **The bridge code after the uninstall.** **Chosen: keep it, outside Chips,** in
   `~/Work/chips-openclaw`, with the scripts. Chips has no dependency on OpenClaw of any kind.
4. **OpenClaw's harness row on 4431 after the uninstall.** Chips can withdraw a harness's tokens
   but cannot remove the harness itself. The options:
   - (a) It stays, listed as disconnected. Its rooms can be deleted. Nothing else is needed.
   - (b) Chips gains "remove a harness" before Phase 6: a small feature, useful for any harness
     someone stops using, which leaves the uninstall with nothing on 4431.
   - (c) Phase 6 is skipped, and all testing stays on the scratch server. This loses the phone and
     multi-harness tests (H, P).

   **Chosen: (b)**, as Phase 5a. It is not as small as first said: a migration, a protocol event,
   a route, the CLI, both clients and their tests. Going live takes a 4431 restart, the desktop
   bundle and the phone rebuilt.

## What it costs

| | |
|---|---|
| Disk | 4.87 GB image in the Colima VM's disk, plus the folder (150 MB after setup) |
| Memory | 820 MB in the Colima VM, measured idle after setup |
| Model | his ChatGPT plan's usage limits |
| Chips code | the bridge (roughly 1–2k lines with tests), six small scripts, a test report. No Chips server or protocol change for v1. |
| His time | Phase 0 decisions, the Phase 2 sign-in (~2 minutes), Phase 6 on the phone, the Phase 8 word |

## Risks

- **OpenClaw's protocol changes between releases.** The image and the bridge are pinned together,
  and the version is never moved during the test.
- **Method names differ from the docs.** They are checked against the image's own schema before
  code (Phase 4). A missing questions RPC becomes a recorded gap (Q1), not a blocker.
- **OAuth sign-in in a container.** The callback port is not reachable, and the paste fallback is
  the designed route. If OpenClaw ever refused the paste, the fallback would be to publish
  `127.0.0.1:1455` for the length of the sign-in only.
- **Shared Colima.** Every command is scoped to `-p chips-openclaw`. Colima is never restarted, and
  nothing is pruned beyond the project.
- **The ChatGPT sign-in outlives the folder on OpenAI's side** until it expires or he ends it
  (Phase 8, step 5).
