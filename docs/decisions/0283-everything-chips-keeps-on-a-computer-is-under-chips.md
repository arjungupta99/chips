# 0283. Everything Chips keeps on a computer is under ~/Chips

Date: 7 November 2026
Status: Accepted, 7 November 2026, on Arjun's "Settings in ~/Chips too". Builds on ADRs 0218 (a
harness connects in one step with its bridge from npm) and 0224 (Your folder).

## Context

Arjun found seven `chips-` folders in his home folder and asked: "can all chips-* folders be made to
go under chips/ folder? I dont like so many chips- folders polluting my root". Each bridge made two
of its own, one hidden for its settings and one for its agents:

| Bridge | Settings and memory | Agents' folders |
|---|---|---|
| acp (Claude Code, Codex) | `~/.chips-acp/<kind>.json`, `~/.chips-acp/<kind>/` | `~/chips-acp/<kind>/<agent>` |
| hermes | `~/.chips-hermes/` | `~/chips-hermes/agents/<agent>` |
| opencode | `~/.chips-opencode/` | `~/chips-opencode/agents/<agent>` |
| openclaw | `~/.chips-openclaw/` | OpenClaw's own `~/.openclaw/chips/<agent>` |

His Mac also had the OpenClaw test rig, `~/chips-openclaw`, and its baseline,
`~/chips-openclaw-baseline.txt`. Chips itself already kept the rooms' folders in `~/Chips/Projects`
(ADR 0224).

Moving an agent's folder is not only a rename. What each harness ties to the folder was checked on
7 November:

- **Claude Code** (2.1.292) files a folder's conversations and its memory under
  `~/.claude/projects/<the folder's path, each character but a letter or digit made a dash>`. It finds
  a conversation by its id from any folder, but the memory is the folder's.
- **Codex** (codex-acp 2.2.2) picks a conversation up by its thread id, in whatever folder it is given.
- **Hermes** is told the folder in each run's instructions; its profiles name none.
- **OpenCode** (2.0.25) pins a session to its folder. Once the folder is gone the session can't be
  changed or used, but `POST /api/session/:id/move {directory}` moves it, with everything said in it,
  and the session's context records the move.

## Decision

1. **One folder.** Everything a bridge keeps is under `~/Chips`:

   ```
   ~/Chips/
     Projects/<room>/            the rooms' folders (ADR 0224), as they are
     Agents/<kind>/<agent>/      each agent's own folder: claude-code, codex, hermes, opencode
     .bridges/<bridge>/          each bridge's settings and memory: acp, hermes, opencode, openclaw
   ```

   `.bridges` is hidden, so Finder shows the two folders a person opens. Its files stay readable by
   the person alone, as they were. An ACP kind other than these two gets `Agents/<its slug>`.

2. **The cards name the new place.** Claude Code's and Codex's cards hand the bridge
   `~/Chips/.bridges/acp/claude-code.json` and `~/Chips/.bridges/acp/codex.json`.

3. **The old place is a name for the new one.** Given `~/.chips-acp/<kind>.json`, by an older Chips's
   card or a login item kept before the move, the acp bridge reads and writes
   `~/Chips/.bridges/acp/<kind>.json`, and keeps the login item with the new path.

4. **Each bridge moves an old install itself, once, when it starts** (`places.ts` in each bridge):
   its settings, its agents' folders, the folder paths in its saved state, and what the harness ties to
   a folder: Claude Code's store for each moved folder is merged into the new folder's, and each
   OpenCode session is moved once OpenCode's server answers. Codex and Hermes need nothing more.
   Only the old defaults move; a `folders` a person set stays where it is.

   A move renames, it never copies and deletes. Where something is already at the new place, what
   isn't there yet is moved in and a clash is left where it was, in the log. A rename that fails leaves
   the old place in use. Each step looks at what is on disk, so a start that stops halfway finishes the
   move on the next. An old folder is removed once it is empty.

   A run that hands over to a copy kept running (`--keep`, as `chips connect` runs it) moves nothing.
   The kept copy moves everything, once the copy it replaces has stopped. Until then, a path in the new
   place reads as the old one while only the old one is there. For the settings that is judged by the
   folder they are kept in, not by the config file, which Claude Code, Codex, Hermes and OpenCode
   need not have.

5. **OpenClaw.** A person's own OpenClaw keeps its agents' folders where OpenClaw keeps them; the
   bridge's state moves to `~/Chips/.bridges/openclaw`. The test rig, on Arjun's Mac only, moves by
   hand to `~/Chips/.bridges/openclaw-rig`, with its baseline at
   `~/Chips/.bridges/openclaw-rig-baseline.txt`.

## Consequences

- Nothing named `chips-` is left in a person's home folder. An install from before moves on the first
  start of acp 1.0.15, hermes 1.0.19, opencode 1.0.17 and openclaw 1.0.11. Two earlier rounds, live
  for minutes on 7 November, left a file behind on Arjun's Mac, which is what decision 4's last
  paragraph is for. In acp 1.0.13, hermes 1.0.17, opencode 1.0.15 and openclaw 1.0.10 the run handing
  over moved: the Hermes bridge being replaced wrote its cursor back into a new `~/.chips-hermes` as it
  stopped. In acp 1.0.14, hermes 1.0.18 and opencode 1.0.16 the run handing over took settings with no
  config file for moved already: OpenCode's started a new server in the new place and left the old
  `server.json` behind.
- An older Chips's cards still work with the new bridges (decision 3), and the new cards work with an
  old acp bridge, which makes `~/Chips/.bridges/acp` itself.
- A bridge moves files that belong to another program only where the harness needs it: Claude Code's
  per-folder store, and OpenCode's sessions through OpenCode's own API.
- Someone zipping or sharing all of `~/Chips` would carry `.bridges` and its keys with it. Chips
  itself only ever shares one room's project (ADR 0224).
