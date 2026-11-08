---
title: Gallery
description: The connectors there are, and how far each gets, by the conformance kit's levels.
sidebar:
  order: 8.5
---

Each connector here puts a harness, or a whole family of agents, into Chips. A connector lives with
its harness, not in Chips (ADR 0051). Chips names no harness in its own code; this page is where
they are named.

How far each one gets is said in the [conformance kit's levels](/connect/conformance/#levels):

- **Talks:** an agent in a room that answers.
- **Supervised:** a thinking bubble, steps, approvals, cost and Stop.
- **Lives in Chips:** the +, agents, copies, new agents, rooms followed, and Restart.
- **Managed from Chips:** context files, model, heartbeat, context window, and the dial.

The "Checked" column says what each claim rests on. *Kit* is a `chips conformance` run against
the fake Chips. *Live* is the connector in use on a real server, in the walks Chips is tested with. *Declared* is what the connector says it does and nothing has checked yet.

| Connector | What it connects | Talks | Supervised | Lives in Chips | Managed from Chips | Checked |
| --- | --- | --- | --- | --- | --- | --- |
| **ACP bridge** (`chips-acp`) | Any [Agent Client Protocol](https://agentclientprotocol.com) agent over stdio, one kind per harness: Goose, Gemini CLI, OpenCode, and Codex or Claude Code through their adapters. Its Main agent is the one Chips gives every harness, and the rest are made from Chips (the +, Add, Fork), each in a folder of its own. Two cards: Claude Code and Codex, each with its own config (`~/Chips/.bridges/acp/claude-code.json`, `codex.json`; ADR 0283) | ✓ | ✓ | 5 of 6: agents (declared), new spaces, new agents, forks, restarts | 3 of 5: context files, model (declared), context window | Kit, with a scripted ACP agent, 14 October 2026. Live with Claude Code and Codex through their adapters, 14 October 2026: turns, steps, the gauge, Claude Code's cost, and an ask from each answered in Chips; then the +, Add, Fork (the copy remembers, the original doesn't hear the copy), move and delete for each. Each needs its asking mode set (`default`, `workspace-write`) |
| **OpenClaw bridge** | An [OpenClaw](https://docs.openclaw.ai) gateway: each Chips agent an OpenClaw agent | ✓ | ✓ | 5 of 6 declared: new spaces, agents, new agents, forks, restarts | 4 of 5 declared: context files, model, heartbeat, context window | Live since 27 September 2026. Fork live 22 October 2026, on OpenClaw's own session fork into a new OpenClaw agent with a copy of the original's folder (the copy remembers, the original doesn't hear the copy). Not by the kit: it needs OpenClaw itself |
| **Hermes bridge** (`chips-hermes`) | [Hermes Agent](https://hermes-agent.nousresearch.com), on its API server's Runs API: each profile a Chips agent, each room a Hermes session | ✓ | ✓ | 5 of 6: agents (declared), new spaces (declared), new agents, forks, restarts | 3 of 5: context files, model (declared), context window | Kit, with a scripted Hermes API server, 14 October 2026. Live with Hermes 0.22, 16–17 October 2026; Fork live 22 October 2026, on Hermes's own session fork (the copy remembers, the original doesn't hear the copy). Hermes v0.20.6's API server doesn't ask before guarded commands ([#98728](https://github.com/NousResearch/hermes-agent/issues/98728)), so until that is fixed, only its MCP consent reaches Chips as a card |
| **OpenCode bridge** (`chips-opencode`) | [OpenCode](https://opencode.ai) 2.0, on its own server (`opencode serve`): each OpenCode agent a Chips agent, each room an OpenCode session | ✓ | ✓ | 5 of 6: agents (declared), new spaces (declared), new agents, forks, restarts | 3 of 5 declared: context files, model, context window | Kit, with a scripted OpenCode server, 14 October 2026. Live with OpenCode 2.0, 16–17 October 2026, and Fork on OpenCode's own session fork, 22 October 2026 (the copy remembers, the original doesn't hear the copy). Richer than OpenCode through the ACP bridge: exact cost per model call, sub-agents' cost and asks, steer and follow-up |
| **Your own** | Anything that speaks [Agent Connect](/connect/) over the [SDK](/connect/sdk/), [WebSocket](/connect/websocket/) or [HTTP](/connect/custom/) | | | | | `chips conformance custom --capabilities …` |

The cards a person picks from in Chips, when they bring an agent, are this page's too: they are kept
in the docs' [`connectors.json`](/connectors.json), which a release of Chips carries, a checkout reads
where it is, and the server hands its apps (`CHIPS_CONNECTORS` points it elsewhere,
[ADR 0171](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0171-the-gallery-is-docs-content-the-server-hands-out.md)).
Each card says what to run, with `{link}` where a join link goes, and can say a sentence to paste to
the agent so it connects itself.

A bridge's card is one line, `chips connect <id> '{link}'`, which Chips shows as
`CHIPS_JOIN_LINK='<link>' chips connect <id>` so the link stays off the command line
([the command](/operate/cli/#chips_join_linklink-chips-connect-id)), and names its npm package and
major: `@chipschat/hermes@1`, `@chipschat/opencode@1`,
`@chipschat/acp@1` (Claude Code and Codex) and `@chipschat/openclaw@1`. `chips connect` fetches the
newest release of that major, checks it against the registry, and runs it on the Node Chips carries
([ADR 0218](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0218-a-harness-connects-in-one-step-with-its-bridge-from-npm.md)).
All four are on npm at major 1 (Apache-2.0), each published from its own repository.

In Chips for Mac, a bridge's card asks where the harness runs. **On this Mac**, Connect runs the
card's line for you and ticks off its four steps, listed under What Connect does: getting the
bridge, checking the harness, joining Chips, and keeping it running. Where the bridge stops, it says
why and what to do, and Try again runs the same line with the same link. **On another computer**,
and in a browser or on the phone, the card gives `curl -fsSL https://chipschat.ai/install |
CHIPS_JOIN_LINK='<link>' sh -s -- connect <id>`, which installs Chips on that computer when it isn't
there. Every line a person runs themselves says **Run in Terminal** on its box
([ADR 0257](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0257-connect-says-what-its-steps-are-and-where-a-line-runs.md)). The link goes in the environment,
not among the command's words, which anybody else on that computer can list. A card's `needs` says
what has to be running first: after "You need" on this Mac, and after "That computer needs" on
every card. Each card also says where its link works: on the computer Chips runs on, for a link on
its loopback address, or wherever that computer can reach Chips's address
([ADR 0247](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0247-what-a-new-person-meets-says-where-it-works.md)).

## Getting a connector on this page

1. Run `chips conformance custom --capabilities <what it declares>` against it, and say what the
   report's levels say.
2. Each capability it declares is checked when the kit can see it, and said as declared when it
   can't. A declared capability that fails its check fails the run (see
   [Conformance](/connect/conformance/)).
3. For an agent family, say which agents it was checked with, as the ACP bridge's row does.
