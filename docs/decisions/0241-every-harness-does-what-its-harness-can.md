# 0241. Every harness does what its harness can, and each Hermes agent is a profile of its own

Date: 28 October 2026
Status: Accepted, 28 October 2026. Arjun, on Restart for Hermes and OpenCode: "We need this hook
for all harnesses", then "I would like to keep feature parity for all harnesses as much as
possible", then "Leave Heartbeat. We can't we do new spaces and models in Hermes and open code? How
do separate spaces of these models work in chips then? And why no models either for them?". Asked
whether Hermes agents keep sharing the Main agent's memory or each get a profile of their own:
"Separate profile. Would there be a “main agent” type as well?". It builds on
[ADR 0094](0094-a-person-restarts-a-harness-through-its-own-connection.md) (Restart),
[ADR 0108](0108-a-person-asks-a-harness-for-a-new-agent-in-a-room.md) (a new agent in a room),
[ADR 0141](0141-the-model-sheet.md) (Model),
[ADR 0146](0146-an-agents-context-window-is-its-harnesss-shown-and-compacted-in-chips.md) (Context
window), [ADR 0183](0183-a-harness-s-main-agent-is-its-default-agent.md) (the Main agent) and
[ADR 0238](0238-an-agents-groups-stand-in-their-place-and-say-what-their-harness-doesnt-share.md)
(groups that say what a harness doesn't share).

## Context

On 28 October 2026 the harnesses Chips connects to declared these:

| Harness | new spaces | new agents | forks | restarts | context files | models | heartbeats | context windows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jacobian | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| OpenClaw | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Claude Code, Codex (ACP bridge) | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| Hermes | | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| OpenCode | | ✓ | ✓ | ✓ | | | | |

Restart for Hermes and OpenCode shipped first, on the same day (chips-hermes 1.0.7, chips-opencode
1.0.6). Every other gap is something the harness can do and its bridge doesn't yet ask for.
Heartbeats are left out: no harness but OpenClaw has one of its own, and Chips doesn't fake one.

Hermes had a second gap. Its bridge made every new agent on the first profile, Hermes's default,
so a new agent was a new conversation with the Main agent's memory (`memories/MEMORY.md`,
`memories/USER.md`), persona (`SOUL.md`) and compaction limit. Two Hermes agents in Chips were one
Hermes remembering for both.

## Decision

1. **Each bridge declares what its harness really does, and the gallery's cards grant it.**
   - Hermes and OpenCode take **new spaces**: a space asked for from the + is claimed under a new
     agent of the harness, which answers its first words, as the ACP bridge does.
   - Claude Code and Codex share their **models**: the choices their ACP adapter offers for a
     session, set on the agent's sessions when a person picks one.
   - OpenCode shares its **models** (the providers and models its server is set up with, asked
     per message), its agents' **context files** (`AGENTS.md` and the instruction files its config
     names) and each agent's **context window** (the tokens of its session's last message, of its
     model's limit).
   - Hermes shares its **models**: those of the providers set up for the agent's profile.
   - No harness declares heartbeats it doesn't have; the card says it doesn't share one (ADR 0238).
2. **The Main agent is Hermes's own default profile.** It is the Hermes a person already talks to
   from Hermes's CLI and messaging apps, with that memory and persona. It stays the harness's Main
   agent (ADR 0183), and the profiles named in `~/.chips-hermes/config.json` stay as they are.
3. **Each new Hermes agent is a profile of its own.** An agent a person makes in Chips (the +, Add
   then a new one) gets a Hermes profile made for it, cloned from the Main agent's settings: its
   model, keys, tools and skills, and its persona to start from. Its memory starts empty and is its
   own, and so is its compaction limit. The one Hermes gateway serves every profile (Hermes 0.22
   multiplexes profiles under `/p/<profile>`), so a new agent starts no new process.
   - The profile is named after the agent when it is made and keeps that name after a rename, as
     its folder does.
   - An agent deleted in Chips keeps its profile in Hermes, as it keeps its folder: what it learned
     is the person's to delete (`hermes profile delete`).
   - A copy (Fork) goes on its own profile too, cloned with its original's memory, where Hermes can
     take the copied session there; where it can't, the copy goes on its original's profile, and
     the bridge's README says so.
   - Agents made before this keep the profile they have, with the sessions in it.

## Consequences

- An agent of every harness has the same headings on its card. What a harness can't do is said in
  its words, never hidden.
- Each Hermes agent remembers only its own conversations, and its Context group shows its own
  `SOUL.md` and memory files.
- Each change ships as a bridge release, a grant on its gallery card, and a grant on the harnesses
  already connected.
- The ACP bridge's models release goes out with ADR 0239's chips-acp 1.0.5, which waits on its own
  word.
