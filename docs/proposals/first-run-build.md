# The first run, built from the mock

**Build plan, 15 October 2026. Status: started.** Arjun's word, on the running mock of the whole
first run: "build all seven steps, Phase 3 first". The mock is a private Artifact, kept out of the
repo: <https://claude.ai/artifact/SEHZZ4tPRMEqngbj14jnD3>. It plays one person's first run on the
Mac and then the iPhone, in seven steps, each tagged with what it needs. This plan is the
[install plan](install-onboarding-plan.md)'s Phase 3 as the mock draws it, followed by the parts of
Phases 4 and 6 that the mock's steps 1, 3 and 5 need. Its rulings (§0a) stand: **nothing is made
public**, so where a step needs publishing, this plan builds up to the publishing and stops.

## The seven steps, and where each is built

| Step in the mock | What exists | What this plan adds | Phase |
|---|---|---|---|
| 1 · Open Chips: "Run Chips on this Mac?" | `chips up` (ADR 0121), the Mac app connects to a server elsewhere (option B) | the app carries `chips` and runs `chips up` behind its window (option A) | FR6 |
| 2 · Your name, already there | owner named "You", renamed through ADR 0082 | the first person is named from the OS account; the welcome asks once, prefilled | FR1, FR2 |
| 3 · Bring your first agent | gallery with the two generic cards, connect card, live card (ADR 0122) | cards from the docs' gallery; "Ask it to do it": one sentence to paste; OpenClaw's connector redeems a link | FR1, FR2, FR4, FR5 |
| 4 · The first hello | the agent's room, the faces lighting while working | the connect card opens the room on hello; "Get Chips on your phone" offered there | FR2 |
| 5 · Your phone in one scan | You → Pair another device (QR `chips://pair?…`), the relay (ADR 0144) | the QR card after the first hello; the phone's no-server screen finds Chips on the Wi-Fi | FR2, FR3 |
| 6 · Notifications, when they matter | push (ADR 0045), asked at launch or from You | asked the first time an agent asks something, with the reason on screen | FR3 |
| 7 · Set up | nothing | the setup card: six steps, derived from state, folding away when done | FR1–FR3 |

## Phases

Each phase lands on main by fast-forward when its gates pass. Go-live (4431, dist, iPhone, Mac app)
and pushing wait for his word, as always.

### FR1 · Server and core

- **The machine.** The server says which machine it runs on (`machine`: the Mac's computer name,
  else the host name) to the people paired to it, beside its version and reach, on a new
  `GET /v1/server`. The welcome and the setup card say "Chips is running on Arjun's Mac mini".
- **The first person's name.** On a machine with no workspace, `chips serve` and `chips up` name the
  first person from the OS account's full name (its first word), else "You". An existing workspace
  is left alone.
- **The gallery's cards.** `GET /v1/connectors` hands out the gallery the server was given:
  `CHIPS_CONNECTORS`, a file or an `https:` URL of the docs' `connectors.json`, read at most once a
  day; nothing by default until the docs are public. The server names no harness: it passes on
  what the docs say. Offline or unset, the apps show the two generic cards, as now.
- **Core.** `setupSteps()` (the six steps from state the client already has: health, devices,
  the first agent's hello, push, the pairing offer's reach) and `firstRun()` (whether this device
  shows the welcome).
- **ADR 0170** (a newcomer is walked through setup, and the setup card says what's left) and
  **ADR 0171** (the gallery is docs content that the server hands out).

### FR2 · Web and Mac

- **Welcome.** For the workspace's owner on a device that hasn't seen it: "Chips is running on
  <machine>", your name prefilled, Continue. Renames through ADR 0082. Once per device.
- **Bring your first agent.** The gallery: the docs' cards, then Your own harness and Anything with
  HTTP. Skip for now.
- **Connect.** The connect card gains a second tab, "Ask <it> to do it": one sentence with the link
  in it, to paste where the person already talks to the agent. The live card is ADR 0122's.
- **The hello.** When the card reaches its last step, "Open <agent>'s room".
- **Your phone.** In that room, until a second device is paired: a card with the QR, "Later" to put
  it away.
- **The setup card.** At the top of Spaces in the sidebar: the six steps; tap a step that's left to
  do it; folds away when all six are done; hidden per device.

### FR3 · Phone

- **The setup card** at the top of Spaces, the same six steps.
- **Notifications** asked the first time an approval card arrives on this phone (a sheet that says
  why, then iOS's own alert), not at launch. You → Notifications still turns them on any time.
- **No server yet.** "Chips lives on a computer you own": Chips found on this Wi-Fi (Bonjour,
  `_chips._tcp`), scan its code, or set one up (the install line, shared). Tapping a found server
  makes a device join request (ADR 0122) that a person allows on the computer. **ADR 0172.**

### FR4 · The gallery's content (docs)

- `apps/docs/src/content/connectors/<id>.md` per connector: name, one line, kind, the command with
  `{link}`, the sentence for "Ask it to do it", face (ground, mark), docs page.
- `pnpm --filter @chipschat/docs connectors` writes `apps/docs/public/connectors.json`; `docs:check`
  fails if it is stale. The live server is pointed at the checkout's copy.

### FR5 · OpenClaw's connector (`~/Work/chips-openclaw`)

- `connect <link>`: `join({ link })`, keeps the key the way the bridge keeps its others, and starts.
  Not published (§0a); the gallery's command names the checkout until it is.

### FR6 · Chips for Mac runs Chips (the install plan's option A)

- The app carries the `chips` tarball (`tools/release/build.mjs`'s darwin build) in its resources.
- First launch with no server here or on the network: "Run Chips on this Mac?". Yes runs
  `chips up --reach … --json --no-open` and pairs the app with the code it prints, then the
  welcome. "Connect to Chips on another computer" is today's finder.
- Signed with his Apple Development certificate, as now. Developer ID, notarization and the updater
  are his accounts' (the install plan's Phase 6).
- **ADR 0173.** Built 15 October: the shell's `can_run_here` / `run_here`, the first screen's
  offer, `pnpm desktop` carrying the release (`tools/release/build.mjs --web`).

### FR7 · TestFlight

- `eas.json` with development, preview and production profiles; `pnpm phone testflight` builds the
  production profile and stops before `eas submit`. Submitting is his.

## Tests

- Core: the six steps and `firstRun()` as tables, fast-check where state can arrive in any order.
- Server: the two routes, the first person's name, the connectors source's cache and failure.
- Web e2e (5199) and phone e2e (5198): the welcome, the gallery with a served `connectors.json`,
  the sentence tab, the setup card ticking and folding.
- Journeys: J1 from install to the QR card.
- The scenario `testing/scenarios/onboarding/first-run.md` gains the seven steps.
