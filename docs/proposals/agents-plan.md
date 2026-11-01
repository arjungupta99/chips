# Agents — phased implementation plan

29 September 2026. The model is agreed in `docs/proposals/agents.md` (the proposal). This is how
to build it: eight phases, each shippable on its own, each ending in a live check on his server.
Nothing here is built yet.

## How the phases fit

| Phase | What it delivers | Repos | Size | Depends on |
| --- | --- | --- | --- | --- |
| 0 | Two ADRs (0087, 0088) and this plan agreed | Chips (docs) | S | — |
| 1 | An agent is handed the room's recent lines with every question; clients tolerate a participant kind they don't know | Chips, then Jacobian and the bridge | M | 0 |
| 2 | Agents exist: a harness registers several, and one connection speaks for all of them. Nothing a person sees changes except names and faces | Chips | L | 0 |
| 3 | Jacobian's J and Spaces, and OpenClaw's agents, arrive in Chips as agents | Jacobian, bridge | L | 2 |
| 4 | One room per agent, and everything that follows: archive, unarchive, delete, move, held messages, the Lead room, hand-off to a free agent | Chips (server, core, both clients) | L | 3 |
| 5 | The Agents tab, an agent's card, and its message history | Chips (clients, one read model) | M | 2 (useful after 3) |
| 6 | Fork | Chips, Jacobian | M–L | 4 |
| 7 | The old paths removed; docs and ADRs settled | Chips, Jacobian, bridge | M | 6 |

Phase 1 needs nothing else and can ship first. Phase 5 can be built while Phase 4 is under way,
because it is client work over the same read models.

## Ground rules for every phase

- **Chips names no harness.** "Lead agent" is a generic label. `tools/guardrails/no-harness-named.test.ts`
  stays green. Jacobian's and OpenClaw's code lives in their own repositories.
- **The log stays the source of truth.** Every new fact is an event, so a workspace replays from zero
  and comes out identical. Existing data is moved with appended events, never by writing
  projection rows by hand.
- **The wire only grows.** A field or event is added, never renamed in place. A harness that
  has not been updated keeps working until the phase that retires what it uses, and that phase
  says so.
- **Promises need declarations** (ADR 0077). Fork is offered only for a harness that declares `forks`.
- **The fake follows the server.** `packages/conformance/src/workspace.ts` copies the server's
  rules (`fillAddress`, the guard, attribution, run transitions). Every rule change lands there in
  the same commit.
- **Gates.** `pnpm check` green. Web e2e on 5199 (`CHIPS_E2E_WEB_PORT=5199 CHIPS_E2E_SERVER_PORT=4492
  CHIPS_E2E_RELAY_PORT=4493 CHIPS_E2E_BUILD_PORT=5198`), never alongside `pnpm check`. Phone e2e on its
  ports (`CHIPS_E2E_SERVER_PORT=4462 CHIPS_E2E_RELAY_PORT=4463 CHIPS_MOBILE_E2E_PORT=5197`). A
  simulator walk against a scratch chipsd before anything goes on his iPhone.
- **Going live is his word, every time.** That covers restarting 4431, rebuilding `apps/web/dist`,
  `pnpm phone` and `pnpm desktop`. Nothing is committed in Jacobian without his word, and he
  restarts Jacobian himself. Main stays linear (fast-forward). Push only when he says.
- **Before each 4431 restart with a migration:** `cp .chips/chips.db .chips/chips.db.bak-<date>-pre-<phase>`.
- **STATUS and memory are updated at the end of each phase.**

---

## Phase 0 — Decisions written down

**Goal.** The model in the proposal becomes two accepted ADRs, so later phases cite them.

Accepted by Arjun, 29 September 2026:
[ADR 0087](../decisions/0087-a-harness-has-agents-and-an-agent-is-in-one-room.md) and
[ADR 0088](../decisions/0088-an-agent-is-handed-what-was-said-since-it-last-spoke.md).

- **ADR 0087, "A harness has agents, and an agent is in one room at a time."** It covers:
  - the new participant kind, `agent` (ids `agt_…`), beside `person` and `harness`: the agent
    takes part in rooms, and the harness holds the token, owner, autonomy and budget;
  - the words: harness, agent, Lead agent, Lead room, attached, free, released, move, fork;
  - the proposal's rules 1–12;
  - who may do what;
  - the moments table.

  It supersedes ADR 0024's room-per-Space. It amends:
  - ADR 0033: automatic joining by a shared key goes.
  - ADR 0066 and ADR 0069: a room following its Space becomes rules 3, 5 and 9, and the home becomes the Lead room.
  - ADR 0077: open decision 8 is closed.
  - ADR 0081: delivery moves from the harness to its agents; who a message is for is unchanged.
- **ADR 0088, "An agent is handed what was said since it last spoke."** It covers the context
  block, its budget, the pull endpoint, and the catch-up on joining.
- **Fixtures go in with their schemas, not here.** `pnpm check:protocol` alone would ignore a
  fixture for an event that does not exist yet, but `packages/protocol/src/events/catalogue.test.ts`
  fails `pnpm check` on any fixture file with no event declared, and holds every fixture to its
  schema. So each phase adds the fixture in the commit that adds the event or field (listed in
  Phases 1, 2 and 4), and `pnpm gen:protocol` writes its reference page then.
- **Done when** he has read and accepted both ADRs. On his acceptance, both say Accepted, and the
  Status lines of 0024, 0029, 0033, 0066, 0069, 0077 and 0081 gain "Amended by 0087" (0081 also
  "extended by 0088"), as 0069's carries 0078's.

---

## Phase 1 — Context with the turn

**Goal.** When a message is for a harness, Chips hands it the room's lines since that harness
last spoke there. The in-memory 20-line buffers in Jacobian and the bridge go away. It works
before agents exist: "since it last spoke" means since the harness last posted in that room, and
Phase 2 narrows it to the agent.

### Chips

1. **Protocol** (`packages/protocol/src/events/chips-to-harness.ts`):
   - **`messageNew` gains an optional `context`:**
     - `lines[]`, each with `seq`, `at`, `from {id, kind, name}`, and `kind: said | joined | left |
       renamed | archived | unarchived`;
     - also on each line: `text` (clipped), `transcript` for a voice note, `files[]` names, `addressed_to`, `held`;
     - `since_seq`, `truncated`, and `before` (a cursor for more).
   - **The `hello` client frame gains an optional `context: {lines, chars}` budget.** The default is
     20 lines and 4,000 characters, today's numbers. A budget is a preference, not a promise, so
     the harness sends it itself; ADR 0077's person-only declaration does not apply.
   - **Fixtures:** `message.new.json` gains a context, in the commit that adds the field.
2. **A pure renderer shared by the server and the fake.** It goes in `packages/protocol/src/context.ts`,
   beside `address.ts`, which is already shared that way.
   - `contextLines(events, budget)` picks and clips the lines.
   - `renderContext(lines)` is the plain-text form the SDK offers.
   - Unit tests cover clipping, the oldest line dropping first, voice notes, held messages, joins and renames.
3. **Server.**
   - **Read models** (`server/src/infrastructure/store/read-models.ts` and its port):
     - `lastSpokeSeq(ws, space, participantId)`;
     - `roomLinesSince(ws, space, seq, limit)`, which reads messages, `membership.*`, `participant.renamed` and `space.updated`.
   - **`server/src/interfaces/ws/session.ts`:** `asDelivered` attaches `context` to a
     `message.new`, and never to `message.overheard`. The budget is kept from the harness's `hello`.
   - **The pull route:** `GET /v1/spaces/:id/context?before=&limit=`, harness token only and
     member-scoped. It goes in `server/src/interfaces/http/routes/spaces.ts`, and the authorization
     matrix test gains a row.
4. **SDK** (`packages/sdk-ts/src/connect.ts`, `events.ts`): `message.context` on `message.new`, plus
   a `renderContext` export. The conformance fake (`packages/conformance/src/fake-chips.ts`)
   attaches the same block.
5. **Forward tolerance on the clients.** Core's `participantKind` and fold, and `packages/ui` avatar
   kinds, treat an unknown participant kind as a non-person, drawing it as a harness is drawn.
   The iPhone build installed with this phase then survives Phase 2's `agent` kind.
6. **Docs.**
   - `connect/websocket.md` and `connect/custom.md` get a section, "What you're told with a question".
   - The generated reference pages come from `pnpm gen:protocol`.

### Adapters (Phase 1b, after Chips is live)

- **Jacobian** (`src/channels/chips/room-talk.ts`, `bot.ts`):
  - `withRoom` takes `heard` from `event.context` via `renderContext`, and falls back to
    `RoomTalk.take` when absent.
  - Once live, the `heard` map and `overhear()` buffering are deleted. `company` stays until Phase 3.
- **Bridge** (`chips-openclaw/bridge/src/bridge.ts`): `withOverheard` reads `event.context` the same
  way, and the `overheard` map is deleted.

### Tests

- Server delivery tests: a new message carries context; an overheard message doesn't; the budget is respected; context survives a reconnect.
- Pull route tests.
- The fake's scenario.
- Web e2e: a scripted harness asserts the lines.
- Jacobian and bridge unit tests updated.

### Going live

4431 restart (no migration), `apps/web/dist` rebuilt, `pnpm phone`, `pnpm desktop` (for the
tolerance). Then his word on Jacobian's commit and restart, and the bridge restart.

### Done when

In a room with Jacobian and OpenClaw:
1. OpenClaw answers something.
2. Jacobian is restarted.
3. He asks Jacobian "what did OpenClaw just say?", and it knows.

Today that answer is lost on the restart.

**Risk:** low. It is additive, and the adapters keep a fallback until the Chips side is live.

---

## Phase 2 — Agents on one connection

**Goal.** A harness registers any number of agents. One token speaks for all of them. Rooms hold
agents, and history keeps its names. Nothing about rooms changes yet: an agent may still be in
several rooms, and room keys still work. Every harness that has not been updated keeps working,
because an `hrn_` actor is read as its agent in that room.

### Protocol (`packages/protocol`)

1. **Ids** (`src/ids/ulid.ts`): `agent: "agt"` in `ID_PREFIXES` and `PREFIX_TO_KIND`.
2. **Kinds** (`src/primitives.ts`): `actor.kind` and `participantRef.kind` gain `agent`.
3. **New events** (`src/events/workspace.ts`, `catalogue.ts`):
   - `agent.registered {agent_id, harness_id, key, name, lead, forked_from?}`
   - `agent.updated {agent_id, name?, state?: active | archived}`
   - `membership.replaced {space_id, from, to}`, the display mapping for history.
   - Fixtures for each.
4. **`hello`** (`chips-to-harness.ts`, `harnessManifest`): lists the harness and its `agents[]`, each
   with its rooms. The SDK and `examples/scout` stop reading `harnesses[0]` as "me" and read
   `harness` and `agents`.
5. **Delivery fields.** `message.new` and `message.overheard` gain `for: agt_[]`, the connection's own
   agents this message is addressed to, so an adapter knows which agent takes the turn.

### Server

1. **Migration `0032-agents.ts`**, registered in `server/src/infrastructure/db/migrator.ts`:
   - `participants` gains `harness_id` (for agents), `agent_key`, `lead`, `forked_from` and
     `agent_state`, plus a unique index on (`harness_id`, `agent_key`).
   - `runs` gains `agent_id`.
   - There is no memberships change. Its key is (`space_id`, `participant_id`), which already works for agents.
2. **Projection** (`server/src/domain/projection.ts`):
   - `agent.registered` and `agent.updated` write the participant row.
   - `membership.replaced` swaps the membership row and records the mapping for history reads.
3. **Registry** (`infrastructure/store/harness-registry.ts`, `ports/harnesses.ts`): `registerAgent`, `agentsOf`, `agentByKey`.
4. **Auth** (`infrastructure/auth/authenticator.ts`, `ports/identity.ts`): a harness token's
   `Principal` carries `harnessId` and `agentIds`.
5. **The actor rule** (`domain/authorize.ts` `refuseWithoutLookup`, `refuseOnRun`,
   `refuseHarnessOnSpaceUpdate`, `routes/harnesses.ts` `opensOwnSpace`):
   - An `agent` actor must be one of the principal's agents.
   - A `harness` actor is read as the harness's agent in that room when there is exactly one, and
     refused with `which_agent` when there are several. That keeps the old Jacobian and bridge working.
   - `submit-event.ts` `draftFrom` stops letting the sender's `actor` override silently. It is
     checked, then kept.
6. **Routes** (`routes/harnesses.ts`):
   - `POST /v1/harnesses/:id/agents {key, name, lead?}` registers an agent or renames it, idempotently by key.
   - `GET /v1/harnesses/:id/agents` lists each agent with its rooms and state.
   - `POST /v1/harnesses/:id/spaces` by key keeps working as a shim: it registers an agent for
     the key if needed, and opens or finds that agent's room.
7. **Delivery** (`interfaces/ws/session.ts`, `hub.ts`):
   - One session per connection. `memberSpaces` is the union of its agents' rooms.
   - `isFor` checks the event against every agent of the connection. `message.new` is sent when
     any of them is addressed, carrying `for`, and `message.overheard` otherwise.
   - Receipts, `liveRunFor` and `receiptToHarness` are per agent.
   - Presence stays keyed on the harness, so its agents share one link status and one
     "can't answer now" (ADR 0083).
8. **Addressing** (`submit-event.ts` `fillMentions`/`fillAddress`, `packages/protocol/src/address.ts`,
   `mentions.ts`):
   - "Harnesses in the room" becomes "agents in the room".
   - The @handle is the agent's name without spaces.
   - `@all` names every agent.
   - The guard of four counts agent-to-agent messages (`harnessChatter` → `agentChatter`).
9. **Runs and lanes:**
   - `runs.agent_id` is set from the actor.
   - `liveRun(ws, space, agentId)`.
   - `route-lane.ts` names agents as specialists.
   - `mintChild` mints an ephemeral agent of the lead's harness, where it minted a child harness.
   - Budget stays per harness and sums its agents' runs.
10. **The upgrade: `chipsd upgrade agents`**, a new subcommand in `server/bin/chipsd.ts`.
    - It is dry-run unless `--apply`, and it prints the plan. It appends, as the system:
      - For each harness, one `agent.registered` per keyed room it opened. The key is the room's
        key, and the name is the room's title.
      - A Lead agent for its home room.
      - One default agent, named after the harness, for every other room it is in.
      - One `membership.replaced` per room.
    - A harness with no keyed rooms (Scout, OpenClaw) gets one agent in all its rooms.
    - Run twice, it adds nothing.
    - **On his server today, the dry run should show:**
      - Jacobian: 66 agents, one per room it opened. That is J as Lead for its home, and 65 Space
        agents. All 66 rooms are keyed and opened by Jacobian, including the one it shares with
        OpenClaw, so no default agent is needed.
      - OpenClaw: one agent, in its 4 rooms. That is allowed until Phase 4.
      - Scout: one agent.

### Core and clients

- **The core rule, one change applied throughout:** where a reader asks "is this a harness in the room?", it now asks "is this an agent?".
  - It goes through one helper, core's `isAgent(participant)`, so the change is one pass and is
    easy to review.
  - For Phase 2 alone, `isAgent` also accepts a `harness` member, because a room may still hold one
    until the upgrade has run. Phase 7 narrows it.
  - A guard test lists every `"harness"` literal left in `packages/core/src` and the two apps, so
    none is missed. Each one left must be about the harness itself: its card, its token, its
    presence or its budget.
- **Core** (`packages/core/src`):
  - The `Participant` kind in `events.ts`, with `workspaceHarnesses` becoming `workspaceAgents`, plus `addableTo`, `newSpaceHarnesses` and `nameOf`.
  - `model/readers.ts`: `betweenHarnesses`, `harnessesIn`, `guardLine`, `wireTo`, `spaceFace`.
  - `timeline.ts`: `spaceDoing` gives one bubble per agent.
  - `agents.ts`: `cantAnswer`, via the agent's harness presence.
  - `model/build.ts`: `buildFleet` keeps harnesses and gains agents.
  - `membership.replaced` is applied when drawing a room's history.
- **UI** (`packages/ui/src/components/avatar/avatar.tsx`, `trail/trail.tsx`): the `agent` kind. It
  wears the agent's own face (the Space face where one is chosen), with the harness named under it
  wherever names show.
- **Phone and desktop:** no new screens. Faces, names, the capsule and the route read agents. The
  Harnesses tab keeps listing harnesses; Phase 5 replaces it.

### CLI, SDK, fake

- **CLI:** `doctor` lists a harness's agents, and `connect` prints that a harness registers its own.
- **SDK** (`packages/sdk-ts`):
  - `chips.agents.register({key, name, lead})`.
  - `chips.as(agentId)` for sending.
  - `message.for`.
  - A single-agent harness needs no change.
- **Conformance fake:** agents, `for`, and the actor rule, mirrored.

### Tests

- Protocol invariants.
- The authorization matrix: an agent actor that is its own, one that is not, an `hrn_` in a room with one agent, and one in a room with several.
- Projection replay: a log with agents rebuilds identically.
- The upgrade's dry run and apply on a copy of his database. Do this in a worktree, since 4431 runs the main checkout's source.
- Delivery `for` and receipts.
- Core readers.
- `shapes.spec.ts` gains Tree-with-agents: two agents of one harness in one room, each answering its own @.

### Going live

1. Backup.
2. 4431 restart with migration 0032.
3. Show him the upgrade's dry run.
4. Run it on his word.
5. Rebuild `apps/web/dist`, then `pnpm phone` and `pnpm desktop` in the same window.
6. Jacobian and the bridge are not touched.

### Done when

- Every room shows the same people.
- Jacobian's Space rooms show their agent's name and face on old and new answers, and J's room shows J.
- Jacobian and OpenClaw still answer, unchanged.
- `pnpm check` and both e2e suites pass.

**Risks.**
- The actor rule is the one place a mistake refuses a real harness. The matrix test covers it, and
  the `hrn_` mapping is the safety net.
- The upgrade is the one-way step. It is dry-run first, run on a copy first, and backed up.

---

## Phase 3 — The adapters speak agents

**Goal.** Jacobian and the bridge register their agents and speak as them. After this, nothing
depends on the `hrn_` mapping.

### Jacobian (`src/channels/chips/`)

1. **Registration** (`spaces.ts` `SpaceMap`):
   - At start, and whenever a Space directly under J is made, `POST /v1/harnesses/:id/agents` with
     the Space's id as the key and its name.
   - J is registered as the lead.
   - Renames follow the Space's name.
   - `openAll`/`follow` stop opening rooms by key. They reconcile agents instead: an archived Space
     sends `agent.updated {state: archived}`.
2. **The map is agent ↔ Space, not room ↔ Space.** `roomOf`, `chipsSpaceOf` and `jacobianSpaceOf`
   are rewritten over agents. A room is found through the agent's membership.
3. **A turn per addressed agent** (`bot.ts` `onMessage`, `turn`):
   - `for` names the agents, and each gets its own turn, with `entrySpaceId` set to that agent's Space.
   - A message to J enters at the top, as today.
   - Two agents addressed means two turns in parallel; Jacobian already runs a turn per message.
4. **Speaking as the agent:** every post, card and run carries `actor: agt_…`, the agent of the
   Space the turn ran in (`post`, `postFiles`, `card`, `Run`).
5. **A shared room** (`brought_into`):
   - On his server the one shared room is already keyed to its Space, so Phase 2's upgrade gave it
     that Space's agent.
   - For a room brought into later that has no key, the Space made for it is registered as an agent.
     It takes the default agent's place through `POST /v1/agents/:id/attach {space_id, replacing}`,
     which appends `membership.replaced`. This route is added in Phase 3's Chips commit; it is small.
   - The `brought_into` map is kept, read-only, until Phase 7.
6. **Who is in the room** comes from `context` and `hello`, and `RoomTalk.company` goes.

### Bridge (`chips-openclaw/bridge/src/`)

1. **Agents from the gateway:**
   - At start, read the gateway's agent list and register each one, keyed by its OpenClaw agent id.
   - `OPENCLAW_AGENT` becomes an optional filter.
2. **A session per agent:** `ensureSession` keys by agent, and each turn runs as `agentId`. The
   agent is taken from `for` on `message.new`.
3. **One token** for the whole gateway (closes open decision 8 for OpenClaw).

### Going live

His word on the Jacobian commit, then his restart. Bridge restart. There is no Chips restart
beyond the small attach route, which rides with the next 4431 restart.

### Done when

- The Chess Game room's new answers come from Chess Game.
- J's room is J's.
- The shared room shows its Space's agent, not J.
- OpenClaw's agents appear with their own names, all on one token.
- `GET /v1/harnesses/:id/agents` shows no default agent left for Jacobian.

**Risks.**
- Jacobian's walk: a message to a Space agent must not be handed up by the walk against the
  person's intent. `entrySpaceId` already means "speak to this Space directly". Test a hand_back
  from a Space agent's room.

---

## Phase 4 — One room per agent

**Goal.** The rules in the proposal hold at the door, and both clients offer the choices they need.

### Server

1. **Door rules** (`domain/authorize.ts`, new `refuseOnAgentMembership`; the existing guest rule
   `guest_elsewhere` is the pattern):
   - An agent already in an open room cannot be added to another. The refusal is
     `agent_elsewhere {space_id}`, and the client offers Move or Fork.
   - A lead agent cannot be added to any room but its Lead room.
   - No agent can be added to a Lead room. People can.
   - A Lead room cannot be archived or deleted. This is the existing `home` checks in `authorize.ts` and
     `erase-space.ts`, with the `home` flag renamed `lead_room` in the read model.
2. **Attach and release are events, appended by Chips:**
   - `agent.attached {agent_id, space_id, by, catch_up}`. The catch-up is Phase 1's lines, before the join.
   - `agent.released {agent_id, space_id, by, reason: archived | deleted | moved | agent_archived}`.
   - Both are delivered to the agent's harness. `membership.added` and `membership.removed` still
     go with them for every other reader.
   - Fixtures for both.
3. **Move:** `POST /v1/agents/:id/move {space_id}`, for the harness's owner or a workspace owner or
   admin. It appends release then attach, and a line in the room left: *Chess Game moved to
   Openings prep*.
4. **Archive** (`submit-event.ts` `settle`, beside `routeLane` and `notify`, since nothing cancels on
   archive today):
   - On `space.updated` to closed, append `run.cancel` for every live run of the room's agents,
     with the same cascade to lanes as `route-lane.ts` `cascade`.
   - Then `agent.released (archived)` for each agent, remembered on the agent as `released_from`.
5. **Unarchive:** on `space.updated` to open, re-attach each agent whose `released_from` is this
   room and that is still free. The ones elsewhere are listed for the client.
6. **Delete** (`erase-space.ts`):
   - Release every agent.
   - With `delete_agent: true`, which the sheet sends only when the room had one agent, append
     `agent.updated {state: archived}` and tell the harness to delete its side. For a
     `follows_rooms` harness that is the existing "gone on both sides".
7. **An agent archived in its harness** (`agent.updated archived`): release it, and archive the room
   when it was the only agent there.
8. **Held messages:**
   - A `message.post` from a free agent is taken into `held_messages` (migration
     `0033-held-messages.ts`) as a `message.held {agent_id}` event.
   - On the agent's next attach, each is posted into that room, oldest first, marked as held.
   - `GET /v1/harnesses/:id/agents` reports the count.
9. **Hand-off to a free agent** (`route-lane.ts` `resolveHome`):
   - The lane's home is the specialist agent's room.
   - When it is free, Chips opens a room with the person the task is on behalf of, and attaches it.
   - `directSpaceBetween` and the `lane-home-…` key become "the agent's room".
10. **The + asks for a new agent** (ADR 0087, point 6):
    - `space.created {asked_of: hrn_}` stays.
    - The harness registers a new agent and attaches it to the room. That replaces
      `space.claimed`, which stays readable for old logs.
    - With several faces picked (ADR 0084), each harness picked is asked for a new agent, and the
      first one's names the room. How `space.created` names the rest is this phase's to settle.
    - A harness that cannot make one attaches the agent it has; when that agent is elsewhere, the
      room shows the no-agent notice with Move.
11. **Resolving what Phase 2 grandfathered** (`chipsd upgrade one-room`):
    - It is dry-run first, and lists every agent in more than one open room.
    - It proposes: keep the room with the latest activity, and release the rest.
    - It runs only on his word.
    - On his server, after Phase 3, that should be only OpenClaw's agents. Today its one agent is
      in 4 rooms. Once the bridge registers each gateway agent, it may be fewer.

### Core and both clients

- **`packages/core/src/putAway.ts`:** the archive and delete wording follows the rules:
  - *Chess Game's reply will be stopped*;
  - *…will be free to join another room*;
  - the optional *Delete Chess Game in Jacobian too*.
- **A new core reader, `roomAgents(space)`:** who is here, who was released from here and is
  elsewhere (with where), and who is free to come back.
- **The Move or Fork sheet**, used everywhere an agent is added or brought back:
  - Phone: a sheet in `ConfirmSheet`'s shape.
  - Desktop: a `GrowingDialog`.
  - Fork stays hidden until Phase 6, since no harness declares `forks`.
- **The elsewhere row in a room:** *Chess Game is in Openings prep*, with Move back and Fork.
- **The no-agent notice**, amber as *can't answer now* is, above the field:
  - Phone: `SpaceView.tsx` over `Composer.tsx`.
  - Desktop: `SpaceView.tsx`.
- **Adding an agent to a room that exists:**
  - **Desktop:** `Members.tsx` `AddMember` lists agents grouped as Free and In other rooms.
  - **Phone:** it has no members panel today, only `/add @name`. It gets a room sheet from the title
    capsule: people and agents, and Add. This is the phase's one new phone screen, and it gets a
    mock first, from the real app's screens.
- **The Lead room:**
  - Its title reads *Lead agent · Jacobian*.
  - Its Add offers people only.
  - It shows no archive or delete.

### Tests

- The authorization matrix for every rule.
- Archive cancels runs and releases agents; unarchive re-attaches only the free ones; move; delete with and without `delete_agent`; held messages posted on attach.
- A lane to a free agent opens a room.
- The upgrade's dry run.
- The fake mirrors all of it.
- Web e2e: a new `agents.spec.ts` covering add elsewhere → Move, archive with a run going, and unarchive with one elsewhere.
- Phone e2e: the sheet and the notice.
- A simulator walk of each moment.

### Going live

1. Backup.
2. 4431 restart with migration 0033.
3. `upgrade one-room` dry run shown to him, then applied on his word.
4. `apps/web/dist`, `pnpm phone`, `pnpm desktop`.
5. Jacobian changes, his word, only if Phase 3 left gaps:
   - archive a Space on `agent.released (archived)`;
   - restore it on attach;
   - delete it on `agent.updated archived` from a delete.

### Done when

These hold live, on his server, with Jacobian and OpenClaw:
- Archiving a room while an agent is working stops it and frees it.
- Unarchiving brings back the free agent and offers Move back for the moved one.
- Adding a busy agent offers Move.
- A room left with no agent shows the notice.
- J can't be added anywhere.
- J hands work to a free Space, and the Space gets a room with him.

**Risks.**
- Archiving now stops work. Say so on the sheet, and make it the first thing the walk checks.

---

## Phase 5 — The Agents tab and message history

**Goal.** The Harnesses tab becomes Agents. Every agent has a card and a history.

### Server

1. **Read model and route:** `GET /v1/agents/:id/messages?before=&limit=`.
   - It returns the messages the agent posted or was addressed in, in rooms the reader can read.
   - It also returns the agent's stays: `membership.added` and `membership.removed`, or attach and
     release, per room, as ranges.
   - Rooms the reader can't read come back as counts only.
   - An index on messages (`actor_id`, `seq`) goes in migration 0034 if the read is slow on his database.
2. **Authorization matrix row:** a guest sees only their room's stretch.

### Clients

- **Phone:**
  - `src/ui/tabs.ts`: `harnesses` becomes `agents`, titled "Agents". The route
    `app/(tabs)/agents.tsx` keeps a redirect from `harnesses`.
  - `src/harnesses/Fleet.tsx` becomes `src/agents/Agents.tsx`, in sections:
    - Lead agent;
    - Agents, each with its harness and room under its name, *Free · 1 waiting*, and working state on the ring as the fleet does today;
    - Archived · N;
    - Harnesses, as today's cards.
  - The agent card is new, `src/agents/AgentCard.tsx`: face, harness, room (tap to open it), since, Message history, Move, Fork and Archive as allowed.
  - Message history is new, `src/agents/History.tsx`: the room's lines grouped under dividers
    (room face, name, dates, *now* on the current one), plus *N messages in a room you're not in*.
  - The harness page stays today's `Profile.tsx`, reached from the Harnesses section.
- **Desktop:**
  - `Harnesses.tsx` gains the same sections.
  - `Sidebar.tsx` `FleetRow` lists agents.
  - The agent card and history go in the right pane.
- **Mock first:** a phone-width mock drawn from the real app's screens (Spaces list, room, the
  Harnesses tab, the harness page, the archive sheet, the + window), published as an Artifact.
  Built only on his pick.

### Tests

- The read model and its scoping.
- Core readers for the dividers.
- Phone component tests.
- Web and phone e2e: tab → agent → history.

### Going live

4431 restart (and 0034 if needed), `apps/web/dist`, `pnpm phone`, `pnpm desktop`.

### Done when

He opens Agents → Chess Game → Message history on his iPhone and reads what it was asked and answered in each room, under that room's divider.

---

## Phase 6 — Fork

**Goal.** A copy of an agent joins a room, remembering everything up to the fork.

### Chips

- The capability `forks` goes in `packages/protocol/src/capabilities.ts`, and is declared by a person (`chips declare … forks`).
- `agent.fork {agent_id, space_id, by}` is sent to the harness. The harness registers the copy with
  `forked_from` and attaches it to `space_id`.
- The room shows *Forking Chess Game…* until then, then the copy joins.
- It times out after 60 seconds with *Jacobian didn't make the copy*.
- Fork appears in the Move or Fork sheet, the elsewhere row and the agent card, only for a harness that declares `forks`.
- The copy's history starts with a line pointing to the original.
- Its name is the harness's. Chips shows *Chess Game · fork* until the harness names it.

### Jacobian

Forking a Space is new there. Copy under J:
- the registry node;
- the Space's records database;
- its memory links;
- its files;
- the thread as it stands.

Name it, and register it as an agent with `forked_from`. This needs a design pass in Jacobian's
own terms first (`src/spaces/lifecycle/manager.ts`), and its own tests.

### Bridge

Not declared. OpenClaw's agents aren't forked until OpenClaw can copy an agent's workspace.

### Done when

He forks Chess Game into a second room, asks the copy about something from before the fork, and
it knows. He asks the original about something said to the copy, and it doesn't.

---

## Phase 7 — Cleanup and docs

- **Chips:**
  - `isAgent` accepts `agent` only, and the guard test's list of `"harness"` literals holds only
    harness-level uses.
  - Retire opening rooms by key and the claim shim. `POST /v1/harnesses/:id/spaces` answers 410,
    naming the agents route.
  - `external_key`, `space.claimed` and the `asked` list stay readable for old logs only.
  - The `hrn_`-actor mapping is removed once no adapter uses it; `doctor` warns first.
- **Jacobian:** delete `brought_into`, `RoomTalk`, and the room-keyed parts of `SpaceMap`.
- **Bridge:** delete the `overheard` map remnants and `OPENCLAW_AGENT`.
- **Docs:**
  - `concepts/participant.md`, `harness.md`, `space.md` and `lane.md` are rewritten around agents, and `agent.md` is new.
  - `connect/custom.md`, `websocket.md`, `new-spaces.md`, `jacobian.md` and `conformance.md`.
  - `operate/cli.md`.
  - `reference/http.md`.
  - The generated event pages.
- **ADRs:** whatever the phases changed from 0087 or 0088 is written into them as an addendum.
  (The older ADRs' "Amended by" lines go in at Phase 0's acceptance.)
- **Done when:**
  - `pnpm check` is green with the shims gone.
  - A fresh install connects a custom harness from the docs alone and registers two agents.

---

## What moves on his server, phase by phase

| After | Jacobian | OpenClaw | Rooms |
| --- | --- | --- | --- |
| 1 | Answers with the room's lines, survives restarts | Same | Unchanged |
| 2 | 66 agents: J (Lead) and 65 Spaces, all speaking through the old adapter | One agent, in 4 rooms | Every room shows its agent's name on old and new messages |
| 3 | Registers and speaks as its agents; the shared room is its Space's | All its gateway agents, one token | Unchanged |
| 4 | Archive, unarchive, move, delete and hand-off work as agreed | Its agent in one room | Rooms with no agent show the notice |
| 5 | — | — | Agents tab; message history |
| 6 | Forks Spaces | — | Fork offered for Jacobian's agents |

## Decided

1. **An agent is a participant of a new kind, `agent`, with ids `agt_…`** (Arjun, 29 September
   2026: "go with the new type"). The harness stays a participant of kind `harness`, which holds
   the token, owner, autonomy and budget, and is no longer a member of rooms once Phase 2's upgrade
   has run. The rejected alternative kept agents as `harness` participants and moved the token to a
   new connection record: less change, but the names would say the wrong thing. The cost of the
   choice is that every `kind === "harness"` check in rooms has to change. Phase 2 does that in
   one pass: core gains `isAgent(participant)`, which for Phase 2 alone also accepts a `harness`
   member, so nothing breaks mid-upgrade; Phase 7 narrows it to `agent` only. Phase 1 ships
   first, so the iPhone and desktop builds installed then tolerate the new kind.

## Open technical questions (each settled in its phase)

1. **Budget and autonomy per agent.** Both stay per harness in this plan. A per-agent budget can come later without a wire change.
2. **Where a free agent's scheduled output goes** when its harness ignores the cancel. This plan
   holds it (rule 6). If he'd rather see it at once, it could open a room with the owner, as the
   hand-off does.
3. **The phone's room sheet** in Phase 4 is new UI. Its mock should be drawn from the real app's
   screens: the title capsule, `ConfirmSheet`, and the You tab's grouped sheets.
