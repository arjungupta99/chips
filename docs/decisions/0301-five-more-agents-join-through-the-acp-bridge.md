# 0301. Five more agents join through the ACP bridge: Cursor, Copilot, Antigravity, Goose and Grok

Date: 20 November 2026
Status: Accepted, 20 November 2026, on Arjun's "Yes, all five". He asked on 19 November which
other popular harnesses Chips could support. The answer suggested Cursor, Copilot, Goose and
Antigravity first, and he asked about Grok too.
Extends ADRs 0171, 0218, 0241, 0288 and 0300.

## Context

The gallery had five cards: OpenClaw, Hermes, OpenCode, Claude Code and Codex. The ACP bridge
(`chips-acp`) could already run any agent that speaks the Agent Client Protocol from a config a
person wrote, but it knew only Claude Code and Codex by name. Only those two had a card, install
and sign-in lines, and a mode picker.

The ACP registry (https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) lists 46
agents with how each is run. These five are among the most used outside the ones Chips had:

- **Cursor**, Cursor's command-line agent: `cursor-agent acp`.
- **Copilot**, GitHub's Copilot CLI: `copilot --acp`. It came out of beta in April 2026.
- **Antigravity**, Google's Antigravity CLI: `agy acp`. Google retired Gemini CLI for free users on
  18 June 2026, and Antigravity replaced it.
- **Goose**, the open-source agent that runs on the model a person picks: `goose acp`.
- **Grok**, xAI's Grok Build: `grok agent stdio`.

Each speaks ACP itself. Claude Code and Codex need an adapter from npm.

The registry gives download links but no checksums, so Chips does not fetch any agent from it. As
ADR 0288 says, the person installs each agent from its maker and signs it in.

What each one does was read from its maker's documentation, from Goose's source, and from
captures other ACP clients have published. Grok was also checked against Grok 0.2.99 on Arjun's
Mac. That Grok is signed out, so the check stopped at the hello.

## Decision

1. **A kind known by name need not have an adapter.** `chips-acp` knows each of the five by its
   own command and the words after it, its maker's install line, the folder that line puts it in,
   and its sign-in line. There is nothing to fetch, so Connect asks for the agent, then its sign-in.
   Each card names `~/Chips/.bridges/acp/<id>.json`, and none of those files needs writing.

2. **Modes only where they say how much an agent may do.**
   - Goose starts in Auto, which never asks, unless `GOOSE_MODE` says otherwise. So each session
     goes into Approve, with Approve, Smart approve and Auto to pick.
   - Antigravity starts in Default, with Default, Accept edits and Auto (where it offers Auto). Plan
     is left out, as Claude Code's is.
   - Cursor's and Copilot's modes are ways of working (Agent, Plan, Ask; Agent, Plan, Autopilot).
     Grok's ACP sessions have no mode to be put in.

   So those three get no picker, and each asks as its own settings say. For Copilot that is Allow
   all, a separate option that is off by default. For Cursor it is `approvalMode`, which never asks
   about edits in the agent's folder.

   The Permissions page shows what each one's own settings let through, read and never written
   (ADR 0299). For Copilot that is its Allow all, as its sessions say it. For Grok it is its mode,
   its rules from `~/.grok/config.toml`, and the permission rules Grok takes from Claude Code's
   settings, which it follows too. Grok takes its mode from a Claude Code `defaultMode` first, the
   most specific file's, then from its own `[ui] permission_mode`, else Ask, and the page names
   the file that set it. Grok's sessions don't say their mode, so the bridge reads it from those
   files. The other three are shown as Claude Code's are, with their mode and what their own
   settings run, ask about and refuse (from chips-acp 1.0.39):
   - **Antigravity**: the mode Chips starts its sessions in, its `permissions` lists in
     `~/.gemini/antigravity-cli/settings.json`, and its `toolPermission` where that says more.
     Its project and shared scopes aren't files the bridge can read.
   - **Goose**: the mode, and the tools its `permission.yaml` always allows, asks before and never
     allows.
   - **Cursor**: its `approvalMode` and `permissions` in `~/.cursor/cli-config.json`, with each
     agent folder's `.cursor/cli.json` rules.
   - **Copilot** also shows each "don't ask again" it saved for an agent's folder, in
     `~/.copilot/permissions-config.json`, and the URLs its `settings.json` allows or denies.

3. **Models for every kind known by name**, where its agent offers a `model` option, as ADR 0241
   gave Claude Code and Codex, each model once: Copilot on GitHub's free plan lists Auto twice.
   Context files stay Claude Code's and Codex's, whose files the bridge knows.

4. **No Fork on their cards.** None of the five copies a session (`session/fork`), and the bridge
   makes no copy of an agent whose session it can't copy. So each card leaves `forks` out, and
   Chips offers no Fork for them (ADR 0077).

5. **Sign-in the way each agent wants it.**
   - **Grok** opens no session until it is asked to sign in, as xAI's own ACP example shows. The
     bridge asks (`authenticate`, `headless`) by `XAI_API_KEY` where that is set, else by what
     `grok login` saved. It does this at Connect and each time it starts Grok.
   - **Cursor** is never asked over ACP: signed out, that opens a browser on the machine every
     time.
   - **Goose** has no account. With no model provider set up, it refuses a session with an internal
     error naming `GOOSE_PROVIDER`. Chips says that as "Goose has no model provider set up", with
     `goose configure` to run.
   - What signs each in from the environment is carried to the copy kept running: `CURSOR_API_KEY`,
     `COPILOT_GITHUB_TOKEN`, `GEMINI_API_KEY`, `XAI_API_KEY`, and Goose's provider and keys.
     `GH_TOKEN` and `GITHUB_TOKEN` are not carried: they are the gh command's too, and Copilot lets
     either beat the sign-in it saved.

6. **Cards follow the bridge.** A card's `chips connect` fetches the newest `@chipschat/acp@1`. So
   the five cards land only once the release that knows them (1.0.36) is on npm.

## Consequences

- Each card states its maker and where a person's words go (`whose`, `terms`), as ADR 0288 asks.
  Antigravity's sign-in is a Google account's. In an Antigravity issue (#1505), Google said
  personal sign-in is meant for "Interactive, human-present use only", and that automated or
  background use needs a Gemini API key or Google Cloud credentials. Each turn in Chips starts from
  a person's message, but the bridge runs in the background, so whether Antigravity's card ships
  with personal sign-in is Arjun's call.
- When it starts, the bridge opens a session to learn the models an agent offers. Cursor can't
  close one (`session/close`), so each start leaves one empty session in its own session list.
  Grok 0.2.99 couldn't either; Grok 1.0.89 can.
- Every agent's own updater keeps running, as its maker ships it. Grok was first started with
  `--no-auto-update`, as xAI suggests for ACP. But a Grok that only Chips runs then never updates,
  and xAI's API refused Grok 0.2.99 with a 426. So from chips-acp 1.0.37 it updates itself.
- An agent's refusal reaches the room in its own words. Where JSON-RPC's message is only "Internal
  error", Chips shows what the error's details say. Grok's turn had read "Internal error" where its
  API had said the version was too old.
- Grok also loads the MCP servers in Claude Code's config, so a Grok session can ask to use one.
  Chiral asked to pair "grok-shell-chiral" when the bridge first started Grok. Arjun was fine with
  Grok reading that config, so the bridge leaves it as Grok does it.
- Live, 20 November 2026, on chips-acp 1.0.36: Copilot CLI 1.0.114 (GitHub's free plan) answered a
  turn, and its file write reached Chips as an approval. Approved, the file was written. Grok was
  connected, but its first turn was refused because Grok 0.2.99 needed updating. Its tile said
  Failed until its next turn, as any harness's does after a failed run.
- Live again, on Grok 1.0.89: it answered, offered four models, and ran in Auto, taken from
  `defaultMode` in Arjun's `~/.claude/settings.json` though its own config said ask. Its file write
  went through by his Claude Code `Write` allow rule, `uname -s` ran as a read-only command, and
  Grok's Auto check blocked `rm` of a project file without asking. The Permissions page had said
  Ask, and from chips-acp 1.0.38 it says Auto and why.
- Antigravity, 20 November 2026: Arjun chose personal Google sign-in for the check, on a second
  Google account of his. Antigravity 1.5.13 connected through its card on chips-acp 1.0.38. It
  offered four models (Gemini 3.8 Flash, Claude Sonnet 4.6, Claude Opus 4.6 Thinking, GPT-OSS
  120B) and the modes Default, Accept edits, Auto and Plan. Its first turn was refused: Google
  answered 403, "Verify your account to continue", for an account new to Antigravity. Over ACP,
  Antigravity said only "⚠ Verification Required" as its reply, so Chips showed that as an answer.
  From chips-acp 1.0.39 the bridge fails such a turn with what to do: `agy -p hi` prints the link
  to verify the account.
- Google kept refusing that account as "not eligible for Antigravity" after it was verified and
  its sign-in page said "Authentication successful". Google's docs name age (18 and over,
  confirmed with Google) and country as what makes an account eligible, and they don't say which
  one failed. Antigravity signs out only from its own interactive screen (`/logout`), not in
  print mode. Signed in with another personal account of Arjun's, it answered at once, and the
  tile's Failed cleared with that turn.
- Each mode, picked in Chips, did what Antigravity's documentation says:
  - In Default, its file write reached Chips as an approval and was written once approved.
  - In Accept edits, its file write went through without asking and `uname -s` asked.
  - In Auto, a file write, `ls -la` and `rm` of a file in its folder all ran without asking. Auto
    runs every command in its terminal sandbox, and checks only a command that leaves it.
  - "Back to Default" put it back. The Permissions page showed each mode as it ran.

  Antigravity titles a command call with the bare command and a file call "File <path>", and
  gives its own words for a command in `toolSummary`. Its cards read "Allow it to uname -s?" and
  "Allow it to file room/hello.txt?". From chips-acp 1.0.40 they read "Get current date and
  time? `date`" and "Allow it to write room/hello.txt?", as checked live, and its Auto words
  name the sandbox.
- Copilot, Grok and Antigravity landed in the gallery on 20 November 2026. Cursor and Goose
  followed on 22 November, after each card's line was walked as a newcomer would, in a new Linux
  VM with Chips 1.4.0 from the site's install line, so nothing was installed on Arjun's Mac:
  - **Goose 1.60.2.** With no Goose, the line stopped with Goose's install line; that line put
    Goose in `~/.local/bin`, as the bridge expects. With no model provider, it stopped at `goose
    configure`. Given one (a small model served in the VM), it connected and was kept running,
    answered a turn, and asked before a command in Approve.
  - **Cursor 2026.11.22.** With no Cursor, the line stopped with Cursor's install line, which put
    `cursor-agent` in `~/.local/bin`. Signed out, Cursor's ACP refuses a session with ACP's
    "Authentication required", and the line stopped at `cursor-agent login`, naming
    `NO_OPEN_BROWSER=1 cursor-agent login`, which printed the sign-in address. A signed-in turn
    wasn't run: that needs a Cursor account.
  - Goose names a call's tool only in its `_meta` and calls every ask "other". Each Goose ask was
    one action kind, `acp.other`, so an Always for one command would have answered every tool
    Goose has. Antigravity gives its command as `CommandLine`, where Chips doesn't read one, so an
    Always for one of its commands would have been kept for every command. From chips-acp 1.0.41
    the bridge names a Goose ask by its tool (`acp.shell`) and hands Chips each command as
    `command`, Antigravity's and Cursor's included, so an Always keeps how that command starts.
  - A bridge update restarted Goose while a command waited on its card. Given its session back,
    Goose runs that call again and refused the room's next turn ("session already has active
    run"). From chips-acp 1.0.42 the bridge stops that run once the session is back, and the turn
    goes through. Checked live: the next turn answered, and the waiting command never ran.
- Antigravity on a Gemini API key, 25 November 2026. Antigravity 1.5.13 offers four ways to sign
  in over ACP: a Google account (`oauth-personal`), Gemini Enterprise (`oauth-business`), a Gemini
  API key (`gemini-api-key`), and Agent Platform on Google Cloud credentials (`agent-platform`).
  Asked to sign in by `gemini-api-key` with `GEMINI_API_KEY` set, it runs that process on the key.
  With a made-up key, it opened a session offering the Gemini 4 models, and its turn ended in the
  Gemini API's "API key not valid"; its settings file was unchanged. Its own docs also ask for
  `"modelProvider": "gemini"` in `~/.gemini/antigravity-cli/settings.json`, which would put `agy`
  in a terminal on the key as well; asked over ACP, it doesn't need that. But it saves the way it
  was last asked (`cache/acp-auth-state.json`, `{"methodId":"gemini-api-key"}`), and every `agy
  acp` after it tried the key: with none set, each refused its sessions as signed out, until the
  file was removed and its Google account signed it in again. On the account it offered Claude
  and GPT-OSS models besides Gemini's; on the key, Gemini's only. From chips-acp 1.0.43 the
  bridge asks it to sign in that way where the key is set, as it asks Grok by `XAI_API_KEY`, and
  fails a turn whose key Google refuses with where to make a new one. This is the way Google names
  for use with nobody at the screen (see Consequences). A Google AI Pro or Ultra plan doesn't pay
  for a key's use itself: it carries monthly Google Cloud credits that can, once claimed.
- Antigravity on a Google AI Pro account, 25 November 2026: Arjun chose his AI Pro plan's
  sign-in over a key, accepting that Google calls personal sign-in human-present use. He signed
  `agy` out (`/logout`) and in again with Google OAuth on that account; once the bridge restarted,
  Antigravity signed itself in from the keychain with nothing in Chips changed. It offered more
  than the 20 November account had: the Gemini 4 models, the Orchestrators, Gemini 3.8 Flash,
  Claude Opus 5.5, Claude Sonnet 5.5 and GPT-OSS 120B. In a new test space, a turn on its default
  and one after switching to Claude Sonnet 5.5 both came back in seconds, at no reported cost.
