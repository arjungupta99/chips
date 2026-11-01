# Install, first run and connecting a harness: five minutes from nothing to an agent on your phone

**Plan of record, 5 October 2026. Status: Phase 0 done; his rulings taken (§0a); Phase 1 started
5 October.** Arjun asked for it: "an extremely easy installation flow, onboarding flow,
and setup with harnesses — OpenClaw or others", "very good documentation that explains its
working and how to connect to it", mocks, and "some way to test these flows reliably". The
mock is a private Artifact, kept out of the repo: <https://claude.ai/artifact/4miVRcTK86GAWtimCXnUAN>.
Each phase is run from its prompt in §9, after a compaction. This plan spans Chips (this repo),
the OpenClaw bridge (`~/Work/chips-openclaw`, no remote), a new lab repository outside Chips, and
Jacobian for one small step.

In one line each:

- **Two lines install it.** `curl -fsSL https://chipschat.ai/install | sh`, then `chips up`. One
  tarball per platform carries its own Node, its native modules and the web app. `chips up`
  asks one question, who can reach Chips, then opens a browser that is already paired.
- **No token is copied by hand.** A harness asks to join and a person allows it. The person can
  start from Chips (one line to run where the harness lives) or the harness can start (a code to
  compare). A phone on the same Wi-Fi joins the same way. Capabilities are granted on the same
  screen, so `chips declare` is no longer needed.
- **The apps walk a newcomer through it.** Your name, your first agent, your phone, then a setup
  card that stays until all six steps are done.
- **The docs are part of the product.** They are deployed and organised by task. Every command
  in Start and Connect runs in CI on a clean machine. A `connect.md` lets an agent connect
  itself.
- **A test lab proves it.** It has seven layers, from contract tests to real harnesses running
  against a scripted model on clean machines. J1, the journey from nothing to the agent's
  hello, is timed on every release and fails the release over five minutes.

What it costs, said up front:

| Phase | Chips | Elsewhere | Live steps |
|---|---|---|---|
| 1 · An installable `chips` | bundle + release workflow, data dir, `chips up/down/uninstall`, `install.sh` | none | none (his 4431 keeps its checkout) |
| 2 · Join requests | 1 migration, ~6 routes, protocol events, a card in 3 clients, SDK `join()` | none | 4431 restart (migration) |
| 3 · First run in the apps | welcome, gallery, connect card, setup card, phone's no-server screen | none | dist, iPhone, Mac app |
| 4 · Connectors and the lab | scripted model (generic, in `tools/`) | bridge redeems links; new `chips-lab` repo; Jacobian adopts `join()` | bridge + Jacobian restart |
| 5 · The docs | rebuilt site, generated references, docs-as-tests, deploy job | domain + hosting (his) | docs deploy |
| 6 · Accounts and money | EAS/TestFlight config, signed Mac app with the server inside (if A) | Apple Developer Program, relay host (his) | store review |
| 7 · Acceptance | none | 3 clean machines, 2 cold-reading agents, 1 newcomer | none |

**The smallest version that is still worth having** is Phase 1, plus Phase 2's Chips-first
link only (no harness-first code, no device requests, no phone sheet), plus journey J1. That is
"install in two lines, connect an agent by running one line, proven by one test", about a third
of the work. It is offered in §5 as call 0.

## 0a. Rulings taken (Arjun, 5 October 2026)

His words: "go with your recommendations, start Phase 1. I already have the Apple Developer
Program. I will do the hosted relay as well, provide me recommendations in a separate plan file
for it. [Binaries while the repo is private:] I am not making anything public yet."

- **Calls 0–3, 7–10 as recommended.** The whole plan, in order, with a stop after Phase 2 to look
  again. Mac option **B** now, **A** in Phase 6. All three join entrances on one table. The
  gallery is docs content the app fetches. `chips-openclaw` stays the working name. The login
  service is on by default (asked once). The lab lives outside the repo, and the scripted model
  inside. L7 is capped per run.
- **Call 4: nothing is made public yet.** The repo stays private, and so does everything built
  from it:
  - The tarballs are workflow artifacts and a **draft, private GitHub release**. They're
    reachable with his `gh` login and by nobody else.
  - `install.sh` installs from a local tarball (`--from`) or from `CHIPS_DOWNLOAD_BASE`. A public
    `get.chipschat.ai` waits for a later word.
  - `@chipschat/harness` and `@chipschat/protocol` are **not** published to npm. A connector takes
    them as packed tarballs attached to the private release, or as a git dependency.
  - The scope is `@chipschat` (his word, 16 October 2026): the npm user "chips" has owned `@chips`
    for about ten years, so `@chips/…` can never be ours. The connectors go under the same scope
    (`@chipschat/openclaw`, `@chipschat/acp`, `@chipschat/hermes`, `@chipschat/opencode`), so no
    loose `chips-*` name needs claiming. He made the free npm org `chipschat` on 16 October, so
    the scope is held; nothing is published under it yet.
  - The OpenClaw connector is not published either (Phase 4). The docs site isn't deployed
    publicly (Phase 5); its build is attached to each CI run.
  - Universal links on `chipschat.ai` (Phase 6) also wait, because the association file has to be
    served publicly. The QR stays `chips://pair?…` until then.
- **Call 5: he already has the Apple Developer Program.** Phase 6's Apple work (EAS profiles,
  TestFlight internal testing, production push, Developer ID signing and notarization) is
  unblocked and can move earlier. TestFlight internal testing makes nothing public.
- **Call 6: he will run the hosted relay.** Its recommendations are a separate plan:
  [`hosted-relay-plan.md`](hosted-relay-plan.md). Tailscale stays the first way away from home
  until the relay is up.

## 0. How to use this document

- **Order.** Phases run in order. Each one is shippable on its own. Phases 1–3 need nothing of
  his except go-live words. Phase 6 needs his accounts and money and can move earlier if he
  wants.
- **Before each phase:**
  - Read §1–§3, the phase itself, and the memory notes `chips-working-agreements`,
    `chips-main-is-shared-between-sessions`, `arjun-wants-me-to-restart`,
    `arjun-merge-as-you-go`, `chips-openclaw-test` and `arjun-judges-ui-from-running-mocks`.
  - Run `ListAgents`, read main's reflog, and run `git log origin/main..main`.
  - Check `docs/decisions/` and the other worktrees for the next free ADR number. At the time of
    writing the highest is 0118, so this plan's ADRs are listed in §8 without numbers.
- **Commits.** A worktree on a `claude/<name>` branch, committed with
  `git -c commit.gpgsign=false commit -s`, ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fast-forward main as each phase
  lands. Main stays linear: replay, never merge. Push only on his word, and say which peers'
  commits a push would carry.
- **Gates.** `pnpm check`, then the phase's e2e or journey specs on their own ports, never
  alongside `pnpm check`. Journeys use ports 4450–4459 and 5196. The web suite keeps
  4432/4433/5199 and the phone suite keeps 5198.
- **The rule that shapes everything: Chips names no harness in shipped code.**
  `tools/guardrails/no-harness-named.test.ts` fails on `jacobian|openclaw` in `.ts`/`.tsx`
  under `apps`, `packages`, `server`, `cli`, `relay` and `examples`, and in manifests, the
  lockfile, `tools/`, `.github/`, `scripts/` and `packaging/`. `apps/docs/` and Markdown are
  allowed. ADR 0051 says "a harness's adapter lives with the harness". So:
  - Connectors live with their harness, or in their own repo.
  - The gallery is docs content (§3.4).
  - The harness lab lives outside this repo (§3.9).
  - Nothing in this plan widens the guardrail.
- **ADR 0041 stands:** Chips integrates harnesses that run themselves. Nothing here makes Chips
  start or own an agent's process. An ACP bridge that spawns agents would be a harness of its
  own, and is out of scope (§3.10).
- **Go-live, only on his "go live".** The 4431 recipe from the long-jobs plan: `lsof` first,
  `sqlite3 … ".backup …"`, kickstart `chat.chips.serve`, verify the pid and "chipsd
  listening". Then the clients: `pnpm web:build`, `pnpm phone build`, `pnpm desktop`.
- **UI.** No phone or desktop UI is built before his pick from the mock. Controls stay flat.
  Mocks are published as private Artifacts and never committed.
- **Docs and STATUS.** An ADR per decision (§8). `docs/STATUS.md` is newest first. The memory
  note `chips-install-onboarding` is written at the end of each phase and before any
  compaction.

## 1. The goal, and how we will know

| Measure | Today | Target | Measured by |
|---|---|---|---|
| Time from a clean machine to the agent's hello on the phone (TTFR) | impossible for a stranger; a checkout and a harness of your own for anyone else | ≤ 5 min with the harness already running | J1 on L3's macOS runner, every release |
| Commands typed | 5 before the first page, then writing a harness | 2 on Chips's machine, 1 where the harness runs (or 0 with "ask your agent") | J1's script |
| Secrets a person copies | 1 (the token), plus 3 other env lines | 0 | J1 never reads a token |
| Questions asked of a newcomer | none, but nothing works without reading | 3: reach, name, Allow | J1's steps |
| Docs commands verified | 6 samples run; every shell block in Start is unverified | every block in Start and Connect | L6 + L3 |
| An agent connecting itself from the docs, cold | done once by hand (the OpenClaw test, 27 Sep) | ≤ 10 min with no help, each docs release | L7 |

## 2. Where we are (read 5 October 2026)

Three read-only sweeps of the repo, summarised. File references are as of `b1cfec1a`.

**Install.**
- There is no release. The only tags are the `phase-*` ones and the only workflow is `ci.yml`.
  The repo is private, so even a release would 404 for outsiders (`docs/releasing.md:14-22`).
- Nothing can be installed. The CLI's bin is `./bin/chips.ts` and needs tsx
  (`cli/package.json:9`). Every workspace package exports `./src/index.ts`. There is no
  `--version`, so `install.sh:59` would print the usage text as the version.
- `packaging/install.sh` and `chips.rb` are drafts that have never been run. The formula's
  `--ignore-scripts` would skip the prebuilds for `better-sqlite3` and `sharp`
  (`releasing.md:29-43`).
- Data follows the current directory. `./.chips` is the default
  (`packages/platform/src/config/schema.ts:50-52`). So are the operator token
  (`<dataDir>/operator.<port>.token`) and the web directory, which defaults to the checkout's
  `apps/web/dist` (`server/src/gateway.ts:169-171`).
- `chips serve` already does a lot right: it makes the workspace, prints a code and a QR,
  advertises `_chips._tcp` and pairs the CLI (`cli/src/commands/serve.ts:56-215`). The owner is
  named "You". It binds to loopback unless `CHIPS_HOST` is set.
- `tools/chips/chips` is a checkout-only bash front door. It rebuilds the web app if it's stale,
  starts the launch agent, opens the browser and prints a code. It is the prototype of
  `chips up`.
- A browser off loopback can't pair over plain HTTP, because WebCrypto needs a secure context
  (`apps/web/src/app/Pairing.tsx:340-360`). The phone's own crypto (ADR 0044) can.
- **Phone:** development builds only. No `eas.json`, no TestFlight. `pnpm phone` needs Xcode, a
  cable and a weekly rebuild on a free team, which can't sign push. `apps/mobile/app/pair.tsx`
  tells users to run `pnpm phone connect`.
- **Mac app:** Tauri around the web build. It never runs a server
  (`apps/desktop/src-tauri`). It's unsigned unless the four `APPLE_*` secrets exist.
- **Relay:** built (ADR 0039) but not hosted anywhere.
- **ffmpeg** is optional. Without it, video and sound are kept as they came
  (`server/src/application/use-cases/uploads.ts:65-74`).

**Connecting a harness.**
- Only one path exists. Agents → Add harness (`apps/web/src/app/Harnesses.tsx:670-889`) or
  `chips connect custom` mints a token. The token is shown once, and the person pastes
  `CHIPS_URL`, `CHIPS_HARNESS_ID`, `CHIPS_HARNESS_TOKEN` and `CHIPS_SPACE_ID` into a harness
  they wrote themselves.
- The dialog gives the page's own origin as the URL, with no warning about reachability. It says
  "three curl lines" where the CLI and docs say four.
- The only capability the app can set is the dial checkbox. `new_spaces`, `follows_rooms` and the
  rest need `chips declare` (CLI only). Capabilities in `hello` were rejected because they would
  reverse ADR 0046.
- There's no "waiting for it to connect" state. Checklist rows light as event types arrive, and
  "Last heard" is the last event, not the socket.
- The phone can't add a harness: "They are added from a computer"
  (`apps/mobile/src/agents/Agents.tsx:120`).
- `@chipschat/harness` is good (`connect()`, runs, approvals, lanes, an outbox) but `private: true`,
  so no third party can install it.
- The CLI's adapter manifest holds `custom` and `scout` only (`cli/src/harnesses.ts:53-79`).
- The OpenClaw bridge works (27 Sep–3 Oct) but is a local repo with no remote.

**Docs.**
- Astro Starlight in `apps/docs`, with 6 executed samples, a generated events reference and
  link checking. It's built in CI and **never deployed**.
- **Stale:**
  - "Phase 2, in progress" (`index.mdx:41`) and similar notes in six other places.
  - Claude Code listed as coming (`connect/index.md:17`), against ADR 0041.
  - "Harnesses → Add a harness" in seven places, where the tab is now Agents.
  - Ten nouns in Concepts, with no Agent.
- **Missing:**
  - troubleshooting
  - security model
  - concept pages for agents, rooms, files, long jobs and who-a-message-is-for
  - OpenClaw and Hermes pages
  - a short "pair your phone" (it's buried in a 634-line `operate/mobile.md`)
- Every code block outside the six samples is hand-written and unverified.

**Tests.**
- The web e2e suite (35 specs) starts `chipsd` in dev mode with `/v1/dev/*` routes on a temp
  database. No spec runs the real `chips serve`, pairs with the code it prints, runs
  `chips connect`, or uses the web build that `chipsd` serves.
- Nothing runs `install.sh`.
- The phone has 18 Playwright specs, including `pair.spec.ts`, and 7 Maestro flows. Only one
  flow has run, once, by hand.
- Conformance walks Scout in CI. There is no OS matrix.
- The closest thing to a fresh-machine test is `cli/src/commands/serve.test.ts:80`, which runs
  in-process.

## 3. The design

### 3.1 One `chips`, three wrappers (Phase 1)

**The artifact.** One tarball per platform: `darwin-arm64`, `darwin-x64`, `linux-x64` and
`linux-arm64`, each about 50 MB, laid out as:

```
chips-0.2.0-darwin-arm64/
  bin/chips            # sh shim: exec "$here/../runtime/node" "$here/../lib/chips.mjs" "$@"
  runtime/node         # pinned Node 22 (the project's .node-version)
  lib/chips.mjs        # esbuild bundle of cli + server + packages, ESM, one file
  lib/node_modules/    # better-sqlite3 and sharp with this platform's prebuilt .node files
  web/                 # apps/web/dist, served by default
  VERSION, SHA256SUMS
```

- This is releasing.md's option 2, chosen because it needs no Node on the machine and no
  compiler. A single executable (Node SEA or Bun) stays M6.7's decision. It changes nothing a
  person sees, so it can come later.
- musl (Alpine) is unsupported at first and `install.sh` says so. The Docker image is
  Debian-slim.
- `ffmpeg` stays optional. `chips doctor` says what is lost without it.

**Where things live.** These are the platform's own places, unless `CHIPS_DATA_DIR` says
otherwise:

| | macOS | Linux |
|---|---|---|
| data (db, keys, uploads, operator token) | `~/Library/Application Support/Chips` | `${XDG_DATA_HOME:-~/.local/share}/chips` |
| config + CLI device + connections | `~/.config/chips` (unchanged) | same |
| binary | `~/.local/bin/chips` → `~/.local/lib/chips/<version>/` | same |
| logs | `~/Library/Logs/Chips/` | `${XDG_STATE_HOME:-~/.local/state}/chips/` |

- A checkout keeps `./.chips`. Running from a source tree sets `CHIPS_DATA_DIR` the way the
  launch-agent plist already sets its working directory.
- **His live 4431 is not migrated.** Its plist pins the checkout and `.chips/`. Moving it to an
  installed build is his call, later, and not needed for anything in this plan.

**Wrappers.** All of them run the same `chips`:

1. `install.sh` (`curl -fsSL https://chipschat.ai/install | sh`).
   - It detects the platform and downloads the tarball and `SHA256SUMS` from
     `${CHIPS_DOWNLOAD_BASE:-https://get.chipschat.ai}/<version>/` and verifies them.
   - It unpacks into a versioned directory, points `current` at it, links `~/.local/bin/chips`,
     and adds the PATH line to the shell's rc file only after asking (or never, with `--no-path`).
   - `CHIPS_DOWNLOAD_BASE` exists so L3 can serve artifacts it just built.
2. A Homebrew tap, once binaries are public (§5 call 4). The formula installs the tarball, not
   `npm install`.
3. A Docker image (`ghcr.io/<owner>/chips:<version>`, Debian-slim) for a VPS where the harness
   is already in compose. The docs give the compose snippet.
4. Chips for Mac, only if he picks A (§3.6).

**`chips up`, the one command.** It is idempotent. A second run says "Chips is already running"
and reopens the browser.

1. Make the workspace if there isn't one. The owner is named from the OS's full name if it's
   known, else "You". The welcome screen renames them.
2. **One question: who can reach Chips?**
   - Over Tailscale, offered first when `tailscale ip -4` answers (reusing
     `tools/phone/tailnet.mjs`'s logic, moved into the CLI).
   - On this Wi-Fi.
   - Only this machine.
   - The answer sets the bind address and `CHIPS_PUBLIC_URL`. `--reach tailnet|lan|local` skips
     the question.
3. Install as a login service, asking once. That's launchd `chat.chips.serve` from the existing
   template, or `systemd --user` on Linux. `--no-service` runs in the foreground (journeys and
   containers).
4. Wait for `/v1/health`.
5. Open the browser at `http://127.0.0.1:<port>/pair#code=<fresh code>`. The page pairs itself
   from the fragment. The fragment never reaches a log. **Only a loopback request may redeem a
   code that arrived this way.** The page tells the server which way the code came, and the
   server refuses that kind from anywhere else.
6. Print the phone QR (§3.2) and "Next: add an agent in the browser".
7. `--json` prints `{url, pair_link, qr_payload, data_dir, service}` for tests and for the Mac
   app.

**The other commands:**
- `chips down` stops the service.
- `chips uninstall` removes the service and the binaries. It asks before removing data, and
  `--keep-data` keeps it.
- `chips --version`.
- `chips update` is later, with the Mac app's updater.
- **`chips doctor` grows four checks:**
  - the runtime, which is bundled
  - the web build
  - bind and reach (loopback, LAN, tailnet or relay, and whether the address in the pairing
    offer answers)
  - each harness's socket **now**, from presence, not only its last event

  `--json` is for the lab. Every check links to its Troubleshooting section (§3.8).

### 3.2 Pairing the browser, the phone and the Mac

- **The browser on the same machine** is paired by `chips up` (step 5). Nothing to type.
- **The phone, from a QR.**
  - The QR carries `https://chipschat.ai/p#<payload>`. `<payload>` is today's `chips://pair?…`
    query, carrying the address, the code, and the relay and server key when there are some.
  - With the app installed, that's a universal link and the app pairs.
  - Without it, a static page on `chipschat.ai` says "Get Chips, then scan again" and links to
    TestFlight or the App Store. The fragment never reaches a server.
  - Until the domain's `apple-app-site-association` and a paid team exist (Phase 6), the QR
    stays `chips://pair?…`, as it is today.
- **The phone, from the Wi-Fi.** Chips lists servers it finds on `_chips._tcp`. Tapping one makes
  a **device join request** (§3.3). The computer shows the same short code, and a person allows
  it there. This needs `NSBonjourServices: ["_chips._tcp"]` added to the app. The Local Network
  prompt string already exists.
- **The Mac app.** "Find your server" already lists servers found over mDNS. The same tap makes a
  device join request in place of typing a code.

### 3.3 Join requests: one way in for harnesses and devices (Phase 2)

**The mechanism.** Something asks to join and a person allows it. This is OAuth's device flow
(RFC 8628) cut down to what Chips needs. One table, one state machine, one card in each client.

```
join_requests
  id            jrq_…
  kind          harness | device
  secret_hash   digest of the 128-bit secret the requester holds (it polls with it)
  code          6 chars, pairing's alphabet (no 0/O/1/I), shown on both sides
  name, software, machine, from_addr
  wants         JSON: capabilities asked for (harness), or the device's public key (device)
  state         waiting | allowed | denied | expired | redeemed
  allowed_caps  JSON: what the person granted (may be fewer than wants)
  started_by    requester | person      (person = a pre-allowed link made in Chips)
  decided_by, decided_at, created_at, expires_at
  harness_id | device_id                (set at redeem)
```

**Two entrances, one table:**

1. **The harness starts** (code).
   - The connector sends `POST /v1/join` with
     `{kind:"harness", name, software, machine, wants:[…]}`. It needs no auth, but it's
     rate-limited.
   - The answer is `{id, secret, code, expires_in, interval}`. The connector prints the code.
   - Owners' and admins' devices get a card, and a push where push works.
   - The person compares the code, chooses which capabilities to grant, and taps Allow or Don't
     allow.
   - The connector polls `POST /v1/join/:id/redeem` with its secret. It gets
     `{harness_id, token, space_id, url}` exactly once. After that the request is `redeemed` and
     the secret is dead.
2. **Chips starts** (link).
   - Agents → Add an agent (or the welcome's gallery) makes a pre-allowed request with
     `started_by: person`. The person chooses the capabilities before the link exists, using the
     same switches as the sheet.
   - The link is `<public url>/j/<secret>`: single-use, 15 minutes.
   - The harness's connector redeems it directly: `POST /v1/join/redeem {secret, name, software,
     machine}`.
   - The card in Chips follows along (below).
3. **The agent connects itself.** This is the Chips-first link plus a sentence. The person
   pastes "Connect yourself to my Chips. Follow https://chipschat.ai/connect.md and use this
   link: …" into their agent's chat. A harness that can run commands reads `connect.md` (§3.8)
   and redeems. It needs no product code beyond entrance 2.
4. **The curl path stays** for "Anything with HTTP": token plus lines, under Advanced. So does
   `chips connect custom`.

**The live card.** The person's device subscribes to its own request and sees each state:

1. waiting for the harness
2. asked, with from where and which software
3. allowed (by whom)
4. connected (the harness's socket `hello`, from presence)
5. said hello (its first `message.post` in its direct space)

Each stall says what's wrong:
- **expired:** make a new link
- **asked from an address that can't reach the public URL:** run `chips up` and choose Tailscale
- **connected with a revoked key:** the old token is still in its config
- **never said hello:** open the checklist

**Capabilities (ADR 0046 kept).** The harness asks for capabilities and a person declares them.
The allowed set is written through the same path as `chips declare`
(`server/src/application/use-cases/declare-capabilities.ts`). So the app can now set
`new_spaces`, `follows_rooms`, `new_agents` and `restarts`. `autonomy` stays the person's
switch, on by default for SDK harnesses as it is today. `restarts` still needs `restart` in the
socket's `hello` (ADR 0094).

**Devices.**
- A device request carries the device's public key in `wants`. On Allow, the server pairs it as
  `chips pair` does (`pair-device.ts`) and the device's poll gets its credential.
- A device request is only accepted from the LAN or loopback, never through the relay. So the
  relay can't be used to spam strangers' servers. Away from home, the QR is the way in.

**Guards.**
- 10 minutes for a code, 15 for a link.
- At most 5 waiting requests per server.
- 10 requests a minute per source address.
- Requests are visible only to owners and admins.
- A second redeem is refused with `spent`.
- Allow and Don't allow are audited as `join.allowed` and `join.denied`, naming who decided and
  what was granted. A request that is never decided leaves no event.
- The code is short on purpose. It's for comparing, not a secret: the 128-bit secret is the
  credential.

**The wire.** Three new routes and two events, all in `@chipschat/protocol` with generated reference
pages:
- `POST /v1/join`
- `POST /v1/join/:id/redeem` and `POST /v1/join/redeem`
- `GET /v1/join?state=waiting` for people
- `DELETE /v1/join/:id`
- events `join.allowed` and `join.denied`
- a socket frame so a person's devices hear new requests live

**The SDK.** `@chipschat/harness` gains:

```ts
join({ url?, link?, name, software?, wants?, onCode }): Promise<{ url, harnessId, token, spaceId }>
```

- It finds the server from `link`, then `url`, then `CHIPS_URL`, then
  `~/.config/chips/server.json` (written by `chips up` on the same machine), then mDNS.
- It runs either entrance and stores the result in the OS keychain (macOS `security`, the
  libsecret CLI where present, else a 0600 file, reusing `cli/src/keychain.ts`'s approach).
- On the next run it returns what it stored without asking again.
- `connect(await join(…))` is the whole connector handshake.
- The CLI gets `chips join <link>` for a harness written in another language. It redeems and
  prints the four lines a script can `eval`.

### 3.4 Connectors and the gallery (Phase 4)

**A connector lives with its harness (ADR 0051).**
- **OpenClaw:** the bridge in `~/Work/chips-openclaw/bridge` already reads only Chips's public
  docs. It gains `join()` and a `connect <link|url>` command and is published as its own public
  package. `chips-openclaw` is a placeholder name (§5 call 7). Its repo is not this one.
- **Jacobian:** its plugin (`src/channels/chips/`) adopts `join()`. It's one step, and a Jacobian
  commit needs his word. Jacobian stays out of the public gallery; it's his own.
- **Hermes:** a guide first, on the HTTP and WebSocket wire. A Python `chips-harness` with
  `join()` comes when there's a second Python harness to justify it.

**The gallery is docs content.**
- `apps/docs/src/content/connectors/<id>.md` has frontmatter:
  `name, one_liner, kind: one-line|guide|sdk|http, command: "npx chips-openclaw connect {link}", self_connect: true|false, docs: /connect/openclaw/, mark: <ground index>, verified: {version, date}`.
  It's written by hand, except `verified`, which comes from the lab (L4).
- The docs build emits `connectors.json` and a page per entry.
- The app fetches `https://chipschat.ai/connectors.json` (cached; refreshed at most daily).
- The app ships with **only the generic cards** (Your own harness, Anything with HTTP), so
  shipped code names no harness and the guardrail stays as it is.
- Offline, the gallery is the two generic cards and "More in the docs".
- No brand logos: each card wears a Chips face (ADR 0064 grounds, ADR 0089 pins).

### 3.5 The first run in the apps (Phase 3)

Built from his pick of the mock. The default is as drawn:

- **Web and Mac, after `chips up`:**
  1. Pairing (automatic).
  2. Welcome: "Chips is running on Arjun's Mac mini", plus your name. This replaces "You"
     through ADR 0082's rename.
  3. Bring your first agent: the gallery, with Skip.
  4. Connect: the line or the sentence, and the live card.
  5. The agent's room, with its hello.
  6. Get Chips on your phone: a QR card with Later.
- **The phone with no server:**
  - "Chips lives on a computer you own", with three ways in: on this Wi-Fi, scan its code, set up
    a computer (the share sheet with the install line).
  - Then a device join request, or the existing scan.
- **The join-request sheet** (phone) and dialog (web and Mac): who, from where, the code, what it
  asks for (switches), Allow or Don't allow. A push opens it.
- **The setup card** at the top of Spaces, on every client. It has six steps, all derived from
  state that already exists, so it needs no new server state:
  1. running
  2. this device
  3. an agent has said hello
  4. a second device is paired
  5. notifications
  6. away from home (the pairing offer has a tailnet, relay or https address)

  "Hidden" is kept per device. The card is gone when all six are done.
- **Empty states:**
  - Agents: "No agents yet. Add one here, or allow one that asks."
  - The phone can now add an agent: it makes the Chips-first link and offers the share sheet, so
    the line can be sent to the computer that runs the harness.

### 3.6 Chips for Mac (his call, §5 call 1)

- **A (the app carries the server).**
  - The `.app` carries the same `chips` tarball. On first launch, if there's no server on this
    Mac or the network, it asks "Where should Chips run?". Choosing this Mac runs `chips up
    --reach <choice> --json` behind the window: the same launch agent and the same data
    directory.
  - Closing the window keeps Chips in the menu bar (the tray already exists).
  - "Install command-line tool" links `chips` into `/usr/local/bin`, the way VS Code does.
  - It needs Developer ID signing, notarization and the Tauri updater: Phase 6.
- **B (the app connects).** Only the first screen changes, to the server list plus the install
  line.
- **Recommendation: B now, A in Phase 6.** Both run one `chips`. A adds no second server.

### 3.7 Reaching Chips away from home

- The order: same network, then tailnet, then hosted relay, then your own domain.
- **Tailscale now.** It's free, `chips up` detects it, and `operate/tailscale.md` exists.
- **The hosted relay** (`relay.chipschat.ai`, about $15–50 a month at 10k users per
  `docs/chips-distribution.html`) is §5 call 6. With it, the setup card's last step becomes one
  switch and the QR carries the relay.
- A browser off loopback needs HTTPS for WebCrypto. For a tailnet browser,
  `chips up --reach tailnet` offers `tailscale serve` for HTTPS when it's available, and says
  what it changes before it does it.

### 3.8 The documentation (Phase 5)

**Information architecture.** It replaces today's sidebar; the mock's §7 shows it.

1. **Start:** install (one line per platform, plus Docker), first run, your phone, away from home.
2. **Connect an agent:** one page per gallery entry, generated from §3.4's content. Each page has
   the same shape:
   - what you get (which checklist rows light)
   - the one line or the guide
   - what you'll see
   - when it stalls
   - the verified-with stamp

   Plus "Your own harness" (SDK) and "Anything with HTTP" (the curl walk-through).
3. **How Chips works.** A picture first: one server on your computer keeps the log, and apps and
   harnesses connect to it. Then one page each for:
   - spaces and rooms
   - agents and harnesses
   - who a message is for
   - runs, steps, approvals and questions
   - the dial and policy
   - files
   - long jobs and spend
   - lanes
   - audit

   This replaces "Ten nouns" and folds in ADRs 0081, 0087, 0097, 0099–0101, 0104 and 0117–0118.
4. **Build a connector:** join requests and `join()`, the SDK (executed samples embedded, not
   linked), the WebSocket and HTTP wire, capabilities, the checklist, the conformance kit.
5. **Run it:**
   - the CLI and the env table, both generated (the CLI from its usage, env from
     `packages/platform/src/config/load.ts`)
   - the service, data and backups, upgrades
   - Tailscale, relay, own domain
   - people and invites, notifications, the desktop and phone apps
6. **Security (new):**
   - what lives on your machine
   - device keys, harness tokens and their digests
   - pairing codes, join requests and their guards
   - what the relay sees (ciphertext only, ADR 0039)
   - the threat model in a page
7. **Troubleshooting (new):** organised by symptom. Each `chips doctor` check has an anchor here,
   and doctor prints the link.
8. **Reference:** events (generated, as today), HTTP, frames, envelope.
9. **For agents:** `llms.txt` (an index) and `connect.md` (instructions an agent can follow with
   a join link). L7 reads both cold.

**Rules that keep the docs true:**
- Every shell block in Start and Connect is fenced `bash run` (executed in order in L3's clean
  containers) or `bash norun` with a one-line reason.
- Every code sample is an included file under `apps/docs/samples/`, executed by `docs:check`.
- Screenshots are written by the journey specs (Playwright, one theme each, phone and desktop
  widths) into `apps/docs/src/assets/journeys/`. A changed screen changes its picture in the same
  commit.
- `docs:lint` refuses retired words outside a history note: Harnesses tab, Add a harness, For
  you, Activity card, "Phase N, in progress". Same idea as Jacobian's vocabulary lint, same
  marker escape.
- **Deploy:** Cloudflare Pages (or GitHub Pages) from CI on main, at `chipschat.ai` or
  `docs.chipschat.ai`. The domain and the token are his. Until then, a preview build is attached
  to each run.
- **README, CONTRIBUTING and the package READMEs** link to the docs rather than repeat them.
  README keeps its repository and commands tables, which are for contributors.

### 3.9 The test lab (Phases 1–5, run in Phase 7)

Seven layers, cheapest first. The mock's §8 draws them. "Where" says what code it is and where
it lives.

| | Layer | Proves | Where | When · budget |
|---|---|---|---|---|
| L1 | Contracts | join-request states (ask, allow, deny, expire, redeem once, guards); data-dir resolution; `chips up`'s plan as a pure function of the environment (the `tools/phone` plan pattern, already guarded by `tools/guardrails`); `install.sh`'s choices, run against fixtures under `sh -n` and a stubbed `curl`; doctor's checks | vitest, in this repo | every change · seconds |
| L2 | Journeys | the **built tarball, not dev mode**, with a fresh `HOME` and data dir, on its own ports. J1–J6 below | Playwright project `journeys` in `apps/web` | changes to setup paths (which-jobs) · ~4 min |
| L3 | Clean machines | `install.sh` against artifacts served by the run (`CHIPS_DOWNLOAD_BASE`), on `ubuntu:24.04` and `debian:12` containers **with no Node**, plus `macos-14` (arm64) and `macos-13` (x64) runners; then `chips up --no-service --reach local --json`, J1 headless, `chips doctor --json`, conformance against it; the quickstart's `bash run` blocks in order; uninstall, then a filesystem diff against a baseline (the OpenClaw scripts' `check.sh --gone` idea) | `.github/workflows/release.yml` + nightly | nightly + every tag · a red run blocks the release |
| L4 | Real harnesses | each gallery harness in a container, pointed at the **scripted model**, connects by join link, says hello, asks one approval, finishes; writes `verified` stamps | `chips-lab`, a repo outside Chips (it names harnesses); the scripted model is in Chips's `tools/` | nightly on the mini (self-hosted) · on demand |
| L5 | Devices | an erased simulator and emulator with the Release build; the pair link through `simctl openurl` / `adb shell am start` (no camera); allow a join request; a push via `simctl push`; the 7 existing Maestro flows join in | Maestro, recipes in memory `chips-phone-testing` / `chips-android` | nightly on the mini |
| L6 | Docs as tests | executed samples, `bash run` blocks (inside L3), links, journey screenshots, `docs:lint` | `docs:check`, `docs:build` | every docs change |
| L7 | Cold read by an agent | a fresh agent, with network access to the docs and the Chips under test only, told "connect yourself to the Chips at <url>"; passes on a hello within budget; transcript kept; stumbles become docs bugs | sandboxed agent run from `chips-lab` | each docs release · costs tokens |

**The journeys (L2), shared by L3 and the docs' screenshots:**

- **J1, nothing to hello.**
  1. Unpack the tarball, run `chips up --no-service --reach local --json`, and open `pair_link`.
  2. Welcome: type a name.
  3. Gallery: Anything with HTTP and Your own are the offline cards. The test serves a fixture
     `connectors.json` naming only `test-harness`.
  4. Make a Chips-first link.
  5. A **test connector** (a 30-line script on `@chipschat/harness`'s `join()`) redeems the link.
  6. The card goes through all five states. Open the room and see the hello.
  7. The phone card shows a QR whose payload pairs (checked by decoding it).
  8. Timed: each step's time goes into `journeys.json`.
- **J2, the harness starts.** The test connector requests and prints a code. The browser's card
  shows it. Allow with one capability turned off. The connector gets exactly the granted set,
  and `chips declare` is never run.
- **J3, the phone.** The mobile Playwright web target pairs from J1's QR payload, sees a waiting
  request, and allows it from the sheet.
- **J4, the refusals.** Don't allow. A link used twice. A code that expired (the server's clock
  is injected). Six requests at once (the sixth is refused). A device request through the relay
  (refused).
- **J5, again and after.** `chips up` twice says "already running" and changes nothing. Kill and
  restart: the harness reconnects with its stored key, and its card says Connected.
- **J6, gone.** `chips uninstall`, then nothing is left but data, which goes too without
  `--keep-data` (a filesystem diff).

**The scripted model (`tools/scripted-model`).**
- It's a small HTTP server speaking enough of the OpenAI `/v1/chat/completions` and Anthropic
  `/v1/messages` APIs (streaming included) to replay scripted turns: "say hello", "call tool X
  with Y", "ask for approval". It matches each script on the last user message.
- Harnesses point their model base URL at it.
- It names no harness, so it lives in this repo and the guardrail holds.
- It turns real harness binaries into deterministic, free test subjects. That's the only way L4
  can run nightly without flaking or spending money.

**Flake rules** (from the working agreements):
- Wait for states, not sleeps.
- Own ports.
- Never alongside `pnpm check` or the other suites.
- A background run's exit code is written to its log as `runner-exit N` and read back from there.
- A flaky journey is a bug, never a retry.

**TTFR.** J1 on L3's macOS runner writes `journeys.json` with per-step times. The release
workflow fails above 300 s and posts the numbers to the run summary. STATUS records them per
release.

### 3.10 What is deliberately not here

- **A first-party ACP bridge.** Survey rule 15 recommended one. But an ACP client spawns the
  agent, which makes it the agent's owner, which makes it a harness. ADR 0041 says Chips is not
  one. If wanted, it's a separate project that connects to Chips like any harness, with
  `join()`.
- **A built-in sample agent for the tour.** Scout exists for dev mode and conformance. People who
  install Chips already run a harness. Revisit if L7 or the newcomer in Phase 7 says otherwise.
- **Detecting harnesses on this machine** ("found OpenClaw on :18789, connect it?"). It would mean
  probes naming harnesses in the CLI. A data-driven `detect` field in the gallery entries could
  do it later, without names in code.
- **Telemetry.** Chips is local-first. TTFR is measured by the lab, not by users' machines.
- **Capabilities in `hello`.** Still rejected (ADR 0046). The join request carries the ask and a
  person grants it.

## 4. Phases

### Phase 0: readings and the mock (done 5 October 2026)

- Three sweeps of the repo (§2).
- The mock: <https://claude.ai/artifact/4miVRcTK86GAWtimCXnUAN>. It covers install, the
  browser's first run, the phone allowing a harness, the phone with no server, the setup card,
  A and B for the Mac, the docs, and the lab.
- This plan.
- **Stop for his calls (§5).**

### Phase 1: an installable `chips` (ADRs: tarball with its own runtime; data in the platform's place)

1. **Bundle.**
   - Add `tools/release/bundle.mjs`, which runs esbuild over `cli/bin/chips.ts` into
     `lib/chips.mjs` (ESM, `platform: node`, `target: node22`), with `better-sqlite3` and
     `sharp` external.
   - Copy their prebuilt `.node` files for the target. Use `prebuild-install` /
     `@img/sharp-<platform>`, fetched with the target's `--platform/--arch`.
   - Copy `apps/web/dist` to `web/`, the pinned Node to `runtime/`, and write the shim.
   - Add `tools/release/pack.mjs`, which makes `chips-<v>-<platform>.tar.gz` and `SHA256SUMS`.
2. **Version.**
   - Add `chips --version` / `-v`.
   - One version across the repo, read from root `package.json` at bundle time.
   - Bump to `0.2.0` when the first release is cut (Phase 1's last step, his word).
3. **Data dir.**
   - `packages/platform/src/config/schema.ts` defaults come from a new `defaultDataDir()`
     (platform-aware; `./.chips` when `CHIPS_DATA_DIR` or the checkout marker says so).
   - The web dir defaults to `<install>/web` when bundled.
   - The operator token follows the data dir.
   - Migration-free: an existing `.chips` is used where it is.
4. **`chips up` / `down` / `uninstall`** (`cli/src/commands/up.ts` etc.).
   - Plans are pure (`planUp(env) → Step[]`) and executed by a thin runner.
   - Port `tools/chips/chips`'s behaviour and `tools/phone/tailnet.mjs`'s detection.
   - The launchd template moves to the bundle. Add a systemd user unit.
5. **Loopback auto-pair.**
   - The server accepts a pairing code from the page's fragment only from a loopback address. The
     page says where the code came from, and `pair-device.ts` refuses that kind from anywhere
     else.
   - `Pairing.tsx` reads `#code=` on load.
6. **`install.sh`** rewritten to §3.1, with `CHIPS_DOWNLOAD_BASE`, `--version`, `--no-path`,
   and checksum verification. Drop `chips.rb`'s `npm install` for the tarball.
7. **`chips doctor`'s new checks** (§3.1).
8. **`release.yml`.**
   - On a tag: build the four tarballs (macOS runners for darwin, `ubuntu` + QEMU or
     `ubuntu-24.04-arm` for linux-arm64), then L3, then upload the artifacts.
   - Publishing them where strangers can reach them waits on §5 call 4. Until then they're
     workflow artifacts and a draft release.
9. **Tests.**
   - L1 for everything above.
   - The `journeys` Playwright project with J1 up to "Welcome" (the gallery comes in Phase 3).
   - J5 and J6.
   - L3's Linux containers in the nightly workflow. macOS runners on the tag only, for minutes.
10. **Docs.** `start/install.md` and README's "Try it" become the two lines, with "From a
    checkout" kept below for contributors. `docs/releasing.md` is rewritten around
    `release.yml`.

- **Gate:** `pnpm check`; journeys J1-partial, J5 and J6; L3 Linux green on a workflow
  dispatch; a tarball unpacked on this Mac in a fresh `HOME` passes J1-partial.
- **Go-live:** nothing changes on 4431. Cutting `v0.2.0` and where the binaries go are his.

**Built 5 October 2026** (ADRs 0119, 0120, 0121). Where it differs from the steps above:

- **Step 5: the loopback-only redemption was dropped.** The code is single-use, expires in 15
  minutes, never reaches a log in a fragment, and the page strips it as it reads it. A second kind
  of code would add a protocol field for no further safety. ADR 0121, point 4.
- **Step 8: the minutes.**
  - The journeys and the clean containers run in `release.yml` on a tag, by hand, and weekly
    (Linux x64 only). They don't run on every change, because private-repo minutes ran out on 13
    September.
  - Adding a `journeys` job to `ci.yml` is one job when the minutes allow.
  - The `ubuntu-24.04-arm` and `macos-15-intel` runner labels are unproven until the first
    dispatch.
- **Not in Phase 1:** the Docker image and the Homebrew tap, both because nothing is public.
  `chips conformance scout` needs a checkout.
- **Found on the way:** `CHIPS_DATA_DIR` alone used to leave the database in `./.chips`, so the
  database now follows it (ADR 0120). A loopback server no longer advertises itself over mDNS.
  Pretty logs no longer use a pino transport, which a bundle can't load. Two e2e specs were
  fixed: the relay spec now relies on the link's code pairing at once, and the tokens spec's
  "Done" button clashed with a room whose last line begins "Done:".

### Phase 2: join requests (ADR: a harness or a device asks to join, a person allows)

1. **Server.**
   - Migration 0038 `join_requests`.
   - Use case `server/src/application/use-cases/join.ts`: request, allow, deny, redeem, expire,
     guards. It reuses `createAddHarness` for the harness and `pairDevice` for the device.
   - Routes `server/src/interfaces/http/routes/join.ts`.
   - Socket frame `join.waiting` to owners' and admins' devices.
   - Events `join.allowed` / `join.denied`.
   - The sweep expires requests.
2. **Protocol.** Schemas, generated types and reference pages (`pnpm gen:protocol`).
3. **Core.** `joinRequests` in the store, and `joinCardState(request, presence, firstMessage)`
   for the five states and the stalls.
4. **Web and Mac.**
   - Agents → Add an agent becomes the gallery (generic cards only until Phase 3 fetches the
     rest). A card makes a Chips-first link.
   - The live card.
   - The request dialog, opened by the frame or a notification.
   - The old token and lines move under Anything with HTTP → Advanced, unchanged.
5. **Phone.**
   - The request sheet, opened by push (the push payload stays ids only, ADR 0045).
   - Agents' empty state.
   - "Add an agent" makes a link and opens the share sheet.
6. **SDK.** `join()` and its keychain store. Publish `@chipschat/harness` and `@chipschat/protocol` to
   npm, public, if §5 call 4 allows. If it doesn't, packed tarballs are attached to the release.
7. **CLI.** `chips join <link>`. `chips connect custom` unchanged.
8. **Tests.** L1 for the state machine and the guards (fast-check for the expiry and redeem-once
   properties). Journeys J1 (to hello), J2, J4 and J3 on the phone web target. Conformance's fake
   Chips gains the join routes so a connector can be tested without a server.
9. **Docs.** `connect/join.md` (new) and the SDK page's `join()` section, with executed samples.

- **Gate:** `pnpm check`; web e2e (all, on 5199); `mobile:e2e`; journeys; conformance.
- **Go-live, on his word:** back up, then kickstart 4431 (migration 0038), then `pnpm web:build`,
  `pnpm phone build`, `pnpm desktop`.

**Built 5 October 2026** ([ADR 0122](../decisions/0122-a-harness-or-a-device-asks-to-join-and-a-person-allows-it.md)).
Where it differs from the steps above:

- **The wire is eight routes, not three.** A link is made by `POST /v1/join/links`; allowing is
  `POST /v1/join/:id/allow` (which also changes a link's grant until it is used); `GET /v1/join/:id`
  feeds the card. The frame is `join`, sent at every change, not `join.waiting` alone. HTTP errors
  gained `refusal` (`spent`, `expired`, `denied`, `too_many`, `too_fast`, `not_here`, `decided`).
- **What is granted** is what the harness asked for, at most; a link carries what the person chose.
  Allowing writes it through `declareCapabilities` as the person who allowed, after `addHarness`.
- **`join.allowed` for a link** is written when the link is taken up, naming the harness it made.
  These events go only to people who see the directory, live and on replay.
- **The poll** is every three seconds: under the relay's thirty a minute per tunnel.
- **Not built in Phase 2:** mDNS discovery in `join()` (the CLI has it; Phase 3's phone uses it);
  publishing `@chipschat/harness` (nothing is public); the "Ask your agent" sentence (it points at
  `connect.md`, Phase 5); the phone's device request over the Wi-Fi (Phase 3). The server and the
  sheet already take device requests.
- **Found on the way:** a harness counted as connected in the server's first fifteen seconds
  (ADR 0083's grace), so the card counts a socket opened after the decision only; an answer to
  Allow arriving after the frame that said the key was collected moved the card back, so a request
  only moves forward on the snapshot; the phone's and web's join screens tripped the
  harness-literals guardrail on main, fixed within the hour.

### Phase 3: the first run in the apps (ADR: a newcomer is walked through setup; the setup card)

Built from his pick of the mock:
- the welcome flow (web and Mac)
- the gallery fetching `connectors.json` (cached; generic cards offline)
- the phone's no-server screen and device join requests over mDNS (`NSBonjourServices`)
- the setup card on both clients
- the empty states
- the phone QR card

If he picked A in §5 call 1, this phase only prepares the Mac's first screen. A itself is Phase 6.

- **Tests:** journeys J1 complete (gallery to QR), J3 complete. Maestro: `onboard.yaml` (erase,
  install, open pair link, allow) on the simulator. The journeys write their screenshots for the
  docs.
- **Go-live:** `pnpm web:build`, `pnpm phone build` (Info.plist change: rebuild after a prebuild),
  `pnpm desktop`.

### Phase 4: connectors and the lab

1. **The scripted model** in `tools/scripted-model`, with its own tests. It names no harness.
2. **OpenClaw's connector.** In `~/Work/chips-openclaw/bridge`: `join()`, `connect <link|url>`,
   publishing (name and owner per §5 call 7). It's still written only from public docs.
3. **`chips-lab`** (new repo, outside Chips):
   - compose files per harness
   - the scripted model's scripts
   - an L4 runner that writes `verified.json`
   - the L7 cold-read runner
   - a nightly launchd job on the mini that writes to `~/chips-lab/runs/<date>/`
4. **Jacobian adopts `join()`.** Its own commit, his word, `restart --check`.
5. **Hermes:** the guide only.

- **Gate:** L4 green for OpenClaw twice in a row. The bridge's tests. Jacobian's touched suites
  only (never the full `npm test`).
- **Go-live:** restart the bridge and Jacobian on his word, as the long-jobs plan does.

### Phase 5: the docs

- The IA in §3.8: pages written or rewritten, the generated CLI and env references,
  `connectors/` content, `llms.txt` and `connect.md`.
- `docs:lint`, `bash run` extraction in L3, the deploy job (needs §5 call 4's domain or a Pages
  project and its token, his).
- The stale notes swept.
- **Gate:** `docs:check`, `docs:build`, L3's quickstart run, L7 once (costs tokens; his word for
  the budget).

### Phase 6: accounts and money (all his to start)

- **The Apple Developer Program.**
  - `eas.json` with development, preview and production profiles.
  - TestFlight (internal first, then external after beta review).
  - Push with a production APNs key (ADR 0045 unchanged).
  - `apple-app-site-association` on `chipschat.ai` for the `https://chipschat.ai/p#…` universal link.
  - The Mac app signed with Developer ID, notarized, with the Tauri updater.
  - If A: the app carries the tarball and runs `chips up`.
- **Google Play** internal testing, if wanted.
- **The hosted relay**, if §5 call 6 says so: a box, Caddy for TLS, `relay.chipschat.ai`, and the
  relay row in the setup card.
- **Public binaries** (§5 call 4) and the Homebrew tap.

### Phase 7: acceptance

- L3 on three clean machines: macOS arm64, macOS x64 and Ubuntu. TTFR is under 5 minutes on
  each.
- L4 with every gallery harness.
- L7 with two different agents.
- **One person who has never seen Chips** (his pick), watched without help. Their stumbles are
  findings, sized like the OpenClaw report's.
- A report in `docs/reviews/install-onboarding-acceptance.md`.

## 5. His calls (answered 5 October 2026, see §0a)

Kept as asked. The answers are in §0a: as recommended, except 4 (nothing public yet), 5 (he has
the membership already) and 6 (he runs the hosted relay; separate plan).

0. **The whole plan or the small version** (Phase 1 + the Chips-first link + J1). **I'd do the
   whole plan in order, and stop after Phase 2 to look again.**
1. **Where Chips runs on a Mac: A or B** (§3.6). **B now, A in Phase 6.** Needed by Phase 3.
2. **One join request for harnesses and devices, three entrances** (§3.3). **All three.** The
   device entrance can be dropped without touching the rest. Needed by Phase 2.
3. **The gallery is docs content that names harnesses, and the app fetches it** (§3.4). Is that
   inside "Chips should not have any kind of dependency on OpenClaw"? **I think yes: the
   shipped code names none, and the docs already may.** Needed by Phase 3.
4. **Binaries while the repo is private:** a public bucket (for example `get.chipschat.ai` on
   Cloudflare R2) or making the repo public (M7.7, which needs the `security@` and `conduct@`
   mailboxes). Also whether to publish `@chipschat/harness` and `@chipschat/protocol` to npm. **The
   bucket, and npm public.** Needed at Phase 1's end.
5. **The Apple Developer Program ($99/yr).** **Yes, when Phase 6 starts.** It's the biggest single
   step towards "extremely easy" on a phone.
6. **Away from home: Tailscale now, the hosted relay later** (about $15–50 a month).
   **Tailscale now.**
7. **The OpenClaw connector's name and owner on npm.** `chips-openclaw` is a placeholder. Needed
   by Phase 4.
8. **`chips up` installs a login service by default** (it asks once, and `--no-service` skips
   it). **Yes.**
9. **The lab lives outside the repo** (`chips-lab`, because it names harnesses); the scripted
   model lives inside. **Yes.** Needed by Phase 4.
10. **L7's token budget.** One cold read per docs release, about a dollar or two on a small
    model. **Yes, capped per run.**

## 6. Readings

Taken at Phase 0 from the repo (§2). To be taken at each phase's end:
- J1's per-step times and TTFR (`journeys.json`)
- tarball sizes per platform
- L3's wall time per platform
- e2e and journey counts
- L4 pass rate per harness over 7 nights
- L7 time-to-hello and its stumbles

## 7. Code map

### 7.1 Chips

| Area | Files |
|---|---|
| Bundle, pack, release | `tools/release/` (new), `.github/workflows/release.yml` (new), `.github/workflows/ci.yml` (journeys job), `tools/ci/which-jobs.sh` |
| Data dir, web dir | `packages/platform/src/config/schema.ts:50-52`, `load.ts`, `server/src/gateway.ts:169-171`, `server/src/infrastructure/auth/operator.ts` |
| CLI | `cli/bin/chips.ts` (usage, dispatch, `--version`), `cli/src/commands/up.ts`, `down.ts`, `uninstall.ts`, `join.ts` (new), `doctor.ts`, `serve.ts`, `cli/src/home.ts` |
| Service | `packaging/launchd/`, `packaging/systemd/` (new), `tools/chips/chips` (retired into `chips up`) |
| Installer | `packaging/install.sh`, `packaging/chips.rb`, `packaging/Dockerfile` (new) |
| Join requests | `server/src/infrastructure/db/migrations/0038-join-requests.ts`, `server/src/application/use-cases/join.ts`, `routes/join.ts`, `add-harness.ts`, `pair-device.ts`, `declare-capabilities.ts`, the ws hub |
| Protocol | `packages/protocol/src/` (join schemas, events), `pnpm gen:protocol` |
| Core | `packages/core/src/` (join store, card state, setup card state) |
| Web and Mac | `apps/web/src/app/Pairing.tsx`, `Harnesses.tsx`, `Agents.tsx`, `Shell.tsx` (welcome, setup card), `you/Devices.tsx` |
| Phone | `apps/mobile/app/pair.tsx`, `app/_layout.tsx`, `src/agents/Agents.tsx`, `src/spaces/List.tsx`, `app.json` + `ios/Chips/Info.plist` (`NSBonjourServices`), `eas.json` (Phase 6) |
| Mac app | `apps/desktop/src-tauri/` (A only, Phase 6) |
| SDK | `packages/sdk-ts/src/join.ts` (new), `packages/conformance/src/fake-chips.ts` (join routes) |
| Scripted model | `tools/scripted-model/` (new) |
| Journeys | `apps/web/e2e/journeys/` (new project in `playwright.config.ts`), `apps/mobile/e2e/` (J3), `apps/mobile/e2e/maestro/onboard.yaml` |
| Docs | `apps/docs/src/content/docs/**`, `apps/docs/src/content/connectors/` (new), `apps/docs/scripts/` (run blocks, lint, generated CLI and env), `astro.config.mjs` (sidebar) |
| Guardrails | unchanged: `tools/guardrails/no-harness-named.test.ts` |

### 7.2 Elsewhere

- **The bridge** (`~/Work/chips-openclaw/bridge`): `join()`, `connect` command, publish.
- **Jacobian** (`~/Work/Jacobian/src/channels/chips/`): adopt `join()` (Phase 4, his word).
- **`chips-lab`** (new): compose per harness, scripts, L4 and L7 runners, nightly job.

## 8. Decision records

To be numbered at the time from the next free number (0118 is the highest on 5 October 2026).

- Chips installs as one tarball per platform with its own runtime (Phase 1)
- Chips keeps its data in the platform's place; a checkout keeps `.chips` (Phase 1)
- `chips up` is the first run; the browser on the same machine pairs itself (Phase 1)
- A harness or a device asks to join and a person allows it (Phase 2); amends ADR 0046's "who
  declares" to "the person who allows declares", unchanged in spirit
- A newcomer is walked through setup, and the setup card says what's left (Phase 3)
- The gallery of harnesses is docs content (Phase 3); records the guardrail's reading
- The docs are tested: run blocks, executed samples, journey screenshots (Phase 5)
- (If A) Chips for Mac carries the server (Phase 6)

## 9. Post-compaction prompts

Paste one to start a phase.

### Phase 1

> Run Phase 1 of `docs/proposals/install-onboarding-plan.md`. Read §0–§3 and the memory notes
> it names, check the next free ADR number, and work in a worktree on `claude/install-phase1`.
> Build the bundle and pack scripts, `--version`, the platform data dir, `chips up/down/
> uninstall` with pure plans, the loopback auto-pair, the new `install.sh`, doctor's checks,
> `release.yml` and the nightly L3 Linux job. Then L1 tests and journeys J1 (to Welcome), J5 and
> J6 on ports 4450–4459. Unpack a tarball in a fresh `HOME` on this Mac and walk J1 by hand.
> Don't touch 4431. Report gates, tarball sizes and J1's times, and stop before cutting a
> release.

### Phase 2

> Run Phase 2 of `docs/proposals/install-onboarding-plan.md`. Read §0–§3.3 and the memory notes.
> Worktree `claude/join-requests`. Build join requests end to end: migration 0038, the use case
> with its guards, routes, the socket frame and events, protocol and generated reference, core's
> card state, web and Mac (gallery with generic cards, Chips-first link, live card, request
> dialog), phone (sheet, empty state, share), SDK `join()`, `chips join`, conformance's fake.
> Tests: L1 with fast-check, journeys J1 (to hello), J2, J3 and J4, the web and phone suites.
> Docs: `connect/join.md`. Stop for "go live" (4431 migration).

### Phase 3

> Run Phase 3 of `docs/proposals/install-onboarding-plan.md` from his pick of the mock
> (https://claude.ai/artifact/4miVRcTK86GAWtimCXnUAN). Worktree `claude/first-run`. Read Phase 2's
> built note in §4 and ADR 0122 first: the join wire is eight routes, the `join` frame, `join()`
> and `chips join`, and the server already takes device requests. Build the welcome flow, the gallery fetching `connectors.json`, the setup card on both clients, the
> phone's no-server screen with device join requests over mDNS, and the empty states. Tests: J1
> and J3 complete, Maestro `onboard.yaml` on the simulator, journey screenshots into the docs.
> Stop for "go live" (dist, iPhone, Mac app).

### Phase 4

> Run Phase 4 of `docs/proposals/install-onboarding-plan.md`. Build `tools/scripted-model` in
> Chips. In the bridge's worktree, add `join()` and `connect <link>`, and stop before
> publishing. Create `~/Work/chips-lab` with OpenClaw's compose file and the L4 runner, and get
> L4 green twice. Ask before touching Jacobian. Report and stop for "go live".

### Phase 5

> Run Phase 5 of `docs/proposals/install-onboarding-plan.md`. Rebuild the docs to §3.8's IA,
> generate the CLI and env references, add the `connectors/` content, `llms.txt`,
> `connect.md`, `docs:lint`, `bash run` extraction into L3, and the deploy job (stop for his
> domain and token). Run L7 once within the budget he set. Report the stumbles.

### Phase 6

> Run Phase 6 of `docs/proposals/install-onboarding-plan.md` with the accounts he has set up.
> Report what each one unblocked, and stop before any store submission.

### Phase 7

> Run Phase 7 of `docs/proposals/install-onboarding-plan.md`. L3 on three clean machines, L4 on
> every gallery harness, L7 with two agents, then help him watch one newcomer. Write
> `docs/reviews/install-onboarding-acceptance.md` with TTFR per machine and the sized findings.
