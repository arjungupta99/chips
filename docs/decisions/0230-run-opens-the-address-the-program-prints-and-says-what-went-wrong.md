# 0230. Run opens the address the program prints, and says what went wrong

Date: 25 October 2026
Status: Accepted, 25 October 2026. Arjun, after Run failed from his iPhone on the game of life and
Sudoku: "so will this running work reliably for other users ?", then "I dont think chips need to
figure out port for programs, they should do themselves", then "best would be if it can give me a
message if there is some port conflict or some other error, instead of silently failing", and
"Build it". It changes how [ADR 0226](0226-run-on-the-rooms-details-runs-the-project-on-your-mac.md)'s
Run opens what it started, and replaces that ADR's second addendum's rule for an address that
already answers.

## Context

A room's run file names a command and the address to open: the game of life's is
`{"run": "node scripts/serve.js", "opens": "http://localhost:4173"}`. The port is the agent's
choice, written twice, once in its program (`server.listen(4173)`) and once in `opens`, and
nothing holds the two together. Chips chooses no port.

When the port was taken, Run said little or the wrong thing:

- **A program that crashed on its port** ended with "It stopped after 1 second. It ended with
  code 1." over a Node stack trace with `EADDRINUSE` in it.
- **A port held by something that answers** was opened as though it were the room's program, and
  nothing started (ADR 0226's second addendum, written when the agent had started the game itself).
  Sudoku's 8000 is held by another of Arjun's programs, so Run would have opened that.
- **A missing tool** ended with "It ended with code 127." over `command not found: node`. macOS
  has no Node, and `python3` is a stand-in until Apple's command line tools are installed. Node
  put in by nvm is missed too, because Run's shell doesn't read `.zshrc`.
- **A program that never answered** left the bar at "Running on your Mac" with nothing under it.

## Decision

1. **The program picks its port, and Run opens the address it prints.** Run reads what the
   program prints as it starts and opens the first address on this Mac in it
   (`http://localhost:…`, `127.0.0.1`, `0.0.0.0` or `[::]`, the last two as `localhost`), once it
   answers. A program that moved to 4174 because 4173 was taken opens at 4174. The run file's
   `opens` is used only when the program prints no address, and not when something already
   answered there before Run started anything, since that is somebody else's program.
2. **What already answers is no longer opened in the program's place.** Run starts the program
   whatever answers at `opens`. A program that keeps to a taken port fails on it and says so (3),
   and one that picks its own port goes elsewhere and prints where.
3. **A run that went wrong says what, in plain words,** in the program's row, with its last lines
   under it as before:
   - A taken port: "Port 4173 is already in use by python3, so the program couldn't start. Quit
     that program, or ask the agents to have it pick a free port." The port comes from what the
     program printed, else from `opens`; the program holding it is named where the Mac can tell.
   - A missing tool: "Chips couldn't find node on your Mac, so the program couldn't start. Install
     Node.js, or ask the agents for a version that needs nothing installed." Python's stand-in,
     which asks macOS to install Apple's command line tools, says "This needs Apple's command line
     tools. Install them when your Mac asks, then press Run again."
   - Nothing answering: "It's running, but nothing answered at localhost:4173 after 30 seconds."
     with its last lines, and Stop.
   - The browser refusing the address (ADR 0226's addendum of 25 October) says so the same way.
   - Any other crash keeps "It stopped after 3 seconds. It ended with code 1." and its last lines.
4. **The words travel as `trouble`** on the run's state, apart from `why`, which stays the Mac's
   word on a press it didn't act on (no run file, a changed one). The phone and the web show
   `trouble` in place of the generic words.
5. **The agents' project note says to pick a free port and print the address:** "Have it pick a
   free port itself (try its usual one, and the next if that's taken) and print the address it
   listens on, like http://localhost:4173, which is what Run opens." In Chips's SDK
   (`renderProjectNote`) and Jacobian's own copy.

## Options

- **Chips picks a free port and hands it over as `PORT`.** Ruled out by Arjun: programs choose
  their own ports.
- **Keep opening whatever answers at `opens`.** It opened another program as the room's.
- **Chips serves plain pages itself on a free port**, so the game of life (a static page whose
  server only hands out files) needs no Node. Left for later; it doesn't make a run's failures
  speak, which is what was asked.

## Consequences

- A program that prints no address and keeps to a port somebody else holds fails with the
  taken-port words instead of opening the other program.
- Where Run reads an address depends on the program printing it while it starts. Python's
  `http.server` prints its address only when its output is flushed; it still opens through
  `opens` once it answers, as before.
- The bridges (OpenClaw, Claude Code and Codex, Hermes, OpenCode) take the note's new line with
  their next SDK update; Jacobian's copy changes now.
- Phones and browsers from before ignore `trouble` and show what they showed.

## Addendum, 25 October 2026: the note says the contract, not how to pick a port

Arjun: "hey, I do not want to super hard code chips to my use case. should this be at chips level
or program level ?", then "Yes: trim the note to the contract (print the address it listens on,
which Run opens) and drop how to pick a port". Which port a program takes, and what it does when
that port is taken, is the program's own business, and the usual servers already handle it. What
Chips owns is the contract: Run starts the run file's command, opens the address the program
prints, and says what went wrong. So point 5's line is now "Have it print the address it listens
on, like http://localhost:4173, which is what Run opens; "opens" is for a program that prints
none.", in Chips's SDK and Jacobian's copy. A program that keeps a port somebody else holds is
still told so in its row, with "ask the agents to have it pick a free port".

## Addendum, 25 October 2026: Python prints as it goes, and Run opens exactly where it listens

Arjun ran Sudoku mini from his iPhone: "I think that failed silently ?". It hadn't: Run started
`python3 -m http.server 8000`, which bound IPv6 8000 beside another program's IPv4 8000, and 31
seconds later its row said the program printed no address and another program answered at
localhost:8000. For those 31 seconds it said only "Starting". Python had printed its address, but
held it back while its output went to a file, so Run waited out its 30 seconds for nothing.

- **Python prints as it goes.** A run starts with `PYTHONUNBUFFERED=1` (unless the person's own
  environment says otherwise), so "Serving HTTP on :: port 8000 (http://[::]:8000/)" reaches Run
  as it is printed.
- **Run opens exactly where the program listens.** A program that says it listens on every
  address is opened at this Mac's own address of that kind: `0.0.0.0` as `127.0.0.1` and `[::]` as
  `[::1]`, since `localhost` may reach the other program on the other kind. Both still read as
  `localhost` in the row.
- **Where only a printed address could open, Run waits 5 seconds for one,** not 30: what the run
  file opens answered before Run started anything, so it is somebody else's, and a server prints
  its address as it starts listening.

## Addendum, 25 November 2026: a run that starts more than one program

Arjun asked how Universe handles a space whose agents make several apps or servers. A space still
has one run file and one program, so agents fit two servers into one command. Three ways of doing
that broke Run. The checks used two real servers through the runner, and the review is in
`chips-notes/reviews/universe-several-programs-2026-11-25.md`. His words: "Build fixes 1–3".

- **A run is everything its shell started.** With `a & b &` the shell ends at once while both
  servers go on. Run said "It ran and finished", with no Stop, and Stop and Run again never reached
  them. With `a & b`, once b ended, a held its port through every later Stop. The run's shell leads
  a process group of its own, and a run now counts as running while that group has processes, in
  the start-up of the Mac it began in. Stop and Run again end the group even after the shell has
  ended. While a group has processes, macOS and Linux give no new process its id, so a group with
  the shell's id and no process of it is the run's. After a restart, the id is free again and the
  group is left alone. The pid file keeps the start-up as a third line (`kern.bootsessionuuid`, or
  Linux's `boot_id`). A run started before this change has no third line and is read as before.
- **Run opens the printed address on the run file's port.** It used to open the first address the
  program printed, so an API that started before its page was opened in the browser. Now an
  address printed on the port `opens` names is opened first. For the first 3 seconds Run waits for
  one, trying `opens` itself where that was free before Run started. After that it opens the first
  address printed, as before. A program that prints one address on a port of its own choosing
  opens up to 3 seconds later than it did.
- **Setup sees the folders one down.** Setup ran again only when its words or a manifest at the
  project's top changed (`package.json`, `package-lock.json`, `requirements.txt`,
  `pyproject.toml`). A project of two apps keeps each app's manifest in the app's own folder, so
  when an agent added a dependency to `web/package.json`, setup didn't run and the run failed. The
  key now includes those files in each folder one down. Hidden folders, `node_modules` and links
  are skipped. A project with manifests only at its top keeps the key it had.
- **A run file with no `opens` opens what the program prints.** The agents are told to have the
  program print its address and that "opens" is for a program that prints none, but Run opened
  something only where `opens` was set, so a run file that followed those words never opened its
  page. Found while building the above; his words: "Yes, fix it here". Run now watches what such a
  program prints and opens the first address once it answers, as it does with `opens` set. A
  program that has printed no address and printed nothing more for 5 seconds (a bot, a window, a
  script) is left to run, with nothing said, rather than reading as "Starting" for 30 seconds. A
  program that keeps printing is watched for up to 30 seconds. One that printed an address that
  never answered says so, as with `opens`.

The words agents are told and a run file with several named programs are unchanged. The first would
need an SDK release, and the second would need a design of its own.
