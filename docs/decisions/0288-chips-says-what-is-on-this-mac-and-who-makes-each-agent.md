# 0288. Chips says what is on this Mac, who makes each agent, and what to run when one is missing

Date: 9 November 2026
Status: Accepted. Arjun, 9 November 2026: "Make all the 4 fixes".

## Context

We walked the first run on an empty Mac, with a bare home and PATH and each card's real
`chips connect <id> --json`. A person with no agent installed gets a poor first run:

- The gallery says "Pick the one you already run". Chips never looks at what is installed.
- Claude Code and Codex stop at `npm install -g @agentclientprotocol/...`. A new Mac has no npm,
  and the release carries only `node`. A person with Claude Code working hits the same stop,
  because the bridge looks for the adapter and not for the agent.
- Hermes on an empty Mac talks about `~/.hermes/.env` and never says Hermes is missing. OpenCode and
  OpenClaw name a website but give no line to run.
- Card lines name our plumbing ("through chips-acp").
- Nothing says who makes an agent or where a person's words go once they use it.

Arjun does not want Chips to carry the liability of setting an agent up. So Chips does not install
an agent or run its sign-in. The person runs each maker's own installer and sign-in.

## Decision

1. **Plain words.** Card lines say what the agent is. Every stop for something missing gives the
   maker's own line to run, under the words "Run this in Terminal".
2. **Chips looks first.** A card names the agent's command (`program`). Chips for Mac looks for it
   through a fresh login-shell PATH (`programs_here`), asked when a gallery opens and when the
   window comes back. Found agents are marked On this Mac and come first. An answer that arrives
   after the gallery has drawn adds the tag and never moves a row. The first run's words follow
   what was found. A browser can't look, and says what it said before. The PATH for a bridge is
   now asked each time too, so something just installed is found without restarting the app.
3. **Connect fetches the adapter.** An adapter is the piece between an agent and the ACP bridge.
   It is plumbing, and asking a person to fetch it with npm is the dead end above. The release now
   carries npm beside Node, `chips connect` tells the bridge where (`CHIPS_NPM`), and the bridge
   fetches the adapter into `~/Chips/.bridges/acp/adapters/<kind>`, with no install scripts. The
   agent is asked for first, so nobody downloads hundreds of megabytes to be told it's missing. An
   adapter already on the PATH is used as it is, and disconnecting removes a fetched one.

   Codex's adapter is fetched. **Claude Code's is not yet**: its adapter is built on Anthropic's
   Agent SDK, and Anthropic's docs bar third parties from offering claude.ai login without approval.
   Until Anthropic has said whether this counts, `fetches` stays false for Claude Code in the
   bridge's `kinds.ts`, and it keeps today's stop in plainer words. Turning it on is that one
   word and a bridge release. If Anthropic says no, the way in is a Console API key.
4. **Who makes it.** A card's `whose` says who makes the agent and where what a person sends it
   goes, and `terms` links to the maker's terms or licence. Both show beside the card's way in. The
   words live in `connectors.json`, like the rest of what a card says, and in shared core, so
   phones get them with their next build.

## Consequences

- The release grows by the size of npm, about 13 MB before compression.
- Fix 3 reaches people with the next computer release. Older installs carry no npm, so the bridge
  falls through to the same stop as before, in plainer words.
- A fetched adapter is 300 MB or more. Connect says it is a large download.
- Written steps for someone with no agent, and a card that follows along while they run them, are a
  later piece and are not part of this.
