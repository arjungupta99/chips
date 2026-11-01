# 0183. A harness's Main agent is its default agent

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's "go with A".
Amends the Main agent's rules (ADR 0087, rule 7, and its addendum's point 5) and registration by
key (ADR 0087, Phase 3).

## Context

Hermes and OpenCode ran for real for the first time on 16 October 2026 (testing/findings.md ON-9).
Each came out with its Main agent called **OpenCode 2** and **Hermes 2**, beside an **OpenCode** and
a **Hermes** in no room (ON-10):

1. The join makes the harness a default agent, keyed by the harness's own id and named after it,
   in its direct room (ADR 0087's addendum, point 5).
2. The bridge registers its Main agent under a key of its own, with the same name. The name is
   taken, so Chips numbers it (ADR 0091).
3. The bridge attaches that agent in the default's place in the room. The default is left in no
   room, and no default agent is archived, so it keeps the name for good.

A harness could not name its default agent: registration refused any harness's id as a key. And
`lead` was written only when an agent was registered, so no agent could become Main later. OpenClaw
never hit this, because it joined before default agents existed, and the ACP bridges have no Main.

Arjun picked A of three: a harness names its default agent by its own id, and registers it as its
Main. The others were B, no default agent at the join for a harness that brings its own (which only
moves the clash to the first room with no key), or renaming the two by hand.

## Decision

1. **A harness's own id names its default agent.** `POST /v1/harnesses/:id/agents` takes the
   harness's own id as a `key`, for the agent Chips made for it. Any other harness's id is still
   refused. A name sent with it renames the default as any registration does, and a name a person
   gave it still holds.
2. **Registered as Main, it is Main.** With `lead: true` the default agent becomes the harness's
   Main agent: `agent.updated {lead: true}`. Any other agent of the harness that was Main stops
   being Main: `agent.updated {lead: false}`. So a bridge that made a Main of its own before this
   can move Main to the default, and then archive the one it made, which gives up its name.
3. **Only the default takes Main from another.** Any other key asked for as Main, while the harness
   has one, is still refused (rule 7: one at most). Chips enforces one at most when it writes the
   flag, not only when a second is asked for.
4. **`agent.updated` carries `lead`** (optional; protocol event `agent.updated`). The server's
   participants, the conformance fake and so every SDK harness's tests read it. The apps re-read
   the directory on any `agent.updated` already, so the Main tag follows without an app change.
5. **Bridges with a Main agent register it as the default** when the harness has one. Hermes and
   OpenCode do so wherever it is, and move Main off one they made before. OpenClaw does so only
   when the default is still in the room the join opened and there is no Main yet. That is a
   fresh join from its card. A harness whose default was deleted, or that has a Main already,
   keeps the Main it has: OpenClaw's live harness is one (its Main is `agent:main:chips-main`).
   OpenClaw tells its Main apart by the key it was seated with, and it speaks in Home either way.

## Consequences

- A fresh Hermes or OpenCode join has one agent, called what its config says, as its Main, in its
  own room. On its next start, a bridge that joined before this moves Main to the default, takes
  its room back, and archives the "2".
- What the old Main said in the room reads as the default's from then on (`membership.replaced`).
- The SDK's `register` says what `harnessId` as a key means.
- **A harness that can't make agents on request can't be put in a group room from Add any more**
  (found the same night, ON-12). The apps' Add offers free agents, and a Main agent isn't one.
  Before this, Hermes's and OpenCode's stray default was free, so one group room could have it.
  Now their one agent is Main, in its own room. Declaring `new_agents` (ADR 0108), as OpenClaw
  does, is how they would be asked for an agent in a room. A room made from the + doesn't use the
  default agent (it holds the harness until it claims the room), so this doesn't change it.
  **Since then (16 Oct, 23:47):** both bridges declare `new_agents` and answer `agent.asked`, and
  their cards grant it, so Add's "a new one" puts one of either in a group room.
