# 0303. A space runs several programs, a row each

Date: 25 November 2026
Status: Accepted, 25 November 2026, on Arjun's "Build A". The mock
(<https://claude.ai/artifact/SBoMpcVGHfdfpunGzMigiJ>, source in
`chips-notes/mocks/several-programs/`) offered A, a row for each program with Run all in the
heading; B, one Programs row that opens a page of them; and C, one run whose parts light by whether
each answers. Amends [0226](0226-run-on-the-rooms-details-runs-the-project-on-your-mac.md) (the run file and Run),
[0227](0227-universe-opens-what-a-space-made-on-the-phone-and-the-mac.md) (Universe's Desktop tab, Pages and the banner) and
[0230](0230-run-opens-the-address-the-program-prints-and-says-what-went-wrong.md) (what Run opens). The
research it follows is `chips-notes/reviews/universe-several-programs-2026-11-25.md`.

## Context

A space has one run file, `.chips/run.json`, with one `run`, one `opens` and one `setup`. Every
client draws that one program: one row on the phone's Desktop tab, one bar under Programs on the
web and the Mac, one banner over the start page. When the agents make two apps in one space (a
shop and its API, a site and an admin), they have to squeeze both into one shell command, and
three of the ways they do it broke Run until ADR 0230's addendum of 25 November. Even now a
combined command has one Stop, one setup and one place to open, and a crash of one app hides
behind the other.

## Decision

1. **The run file can list programs.**

   ```json
   {
     "programs": [
       { "name": "API", "in": "api", "run": "uvicorn main:app --port 8000",
         "setup": "pip install -r requirements.txt" },
       { "name": "Shop", "in": "shop", "run": "npm run dev", "opens": "http://localhost:5173",
         "setup": "npm install", "needs": ["API"] }
     ]
   }
   ```

   - `name` is how Chips says it: 1–30 letters, digits, spaces, `.`, `_` or `-`, starting with a
     letter or digit, each different from the others ignoring case.
   - `in` is the program's folder in the project, where its `setup` and `run` run and from which
     a file it `opens` is found. Left out, the program runs at the project's top. It never leaves
     the project.
   - `run`, `opens` and `setup` say for each program what they say for the one today, by the same
     rules (ADR 0226, SEC-46, the folder rule of ADR 0226's second addendum). Each program runs
     something: a page that needs no starting is the start page's, not a program's.
   - `needs` names programs of the same file it can't work without. They have to be there, and
     no two programs need each other, directly or round a circle.
   - One to six programs. A file with `programs` and `run` both is refused, as is a list entry
     that isn't a program.
   - A run file with one `run`, as every space has today, is one program with no name, drawn and
     run as today. Nothing changes for those spaces or their agents.

   One reader, protocol's `runPrograms`, reads both forms for every device. `runRecipe` stays the
   reader of one recipe.

2. **Run, per program, on the Mac.** `chips project folder run|stop|status` take the program by
   name (`CHIPS_FOLDER_PROGRAM`; Chips for Mac's shell checks its shape as it checks the rest).
   - Each named program keeps its runs folder at `runs/<space>/programs/<name>/`; the one
     unnamed program keeps `runs/<space>/` as now, so a run from before this carries on.
   - **Run on a program** starts what it needs first, the ones they need before them, and waits
     for each to answer (or to go quiet, as ADR 0230's addendum lets a quiet program be). A need
     already running is left running. A need that fails stops the press there, and the program's
     row says which need didn't start.
   - **Who it runs for.** A need started for a program is written down as running for it
     (`runs_for`), and its row says "Running for Shop and Admin". **Stop on a program** stops it,
     then each need that ran only for programs no longer running. A need the person ran
     themselves, or started with Run all, is theirs and keeps running.
   - **Run all** (no program named) starts every program that isn't running, the needed ones
     first. **Stop all** stops every program, and whatever ran from a run file before it changed.
     Any press also stops what was left running by a program the run file no longer has, and by
     the one unnamed program when the file now lists programs, so nothing holds a port with no
     Stop.
   - **Opening.** A program with `opens` opens as today. A program nobody needs and with no
     `opens` opens the address it prints, as the one program does (ADR 0230's addendum). A program
     others need and with no `opens` opens nothing: it is an API or a worker, and the page it
     serves is another program's. Every program says where it listens once it answers
     (`listens`), whether or not it opened it, so its row says its port.
   - **Setup** runs per program, in its folder, keyed by its words and the manifests in its folder
     and one folder down.
   - The press carries what it runs (`pressCommand`): each program it starts, needs first, by
     name, folder, setup, run and what it opens. The Mac reads the same from its folder's run file
     and runs nothing when they differ (SEC-46). A press can now be longer than one program's
     1,100 characters: up to 7,000.

3. **The server holds a run per program.** `POST /v1/spaces/:id/project/run` and `folder.run`
   carry `program`; `PUT` and `folder.run_state` carry which program a run is; `GET` answers the
   unnamed program as `run` and the rest as `programs`, by name. `folder.run` gains `op: "show"`:
   open again in the Mac's browser what a running program serves. The hello says `programs` in
   `server.takes`; a phone that meets a server without it draws a run file of programs as one it
   can't run yet ("Update Chips on your computer to run these"), since an older server would mix
   their runs into one.

4. **Universe draws a row per program.**
   - **Phone and iPad Desktop:** with two programs or more, a Programs heading with Run all (Stop
     all once every program runs), a card with a row per program, then a "Page and folder" heading
     over the page and folder rows. A row reads, as `programRow` in core says: its name; what Run
     runs and where, then "Starting…", "Starting · Shop needs it", "Running at localhost:5173",
     "Running on port 8000" or "Running for Shop and Admin"; or how it ended, and a program that
     never started because a need didn't says only that. Its buttons: Run; a dim Starting, with
     Stop, so a long setup can be stopped; Open (asking the Mac to show it) and Stop while it
     runs. A run file of one `run` draws as today, with no heading; a list of one program draws
     its row, with no Run all.
   - **Web and Mac:** under Programs, the same rows. On the Mac, Open opens the program's address
     in the browser; in a browser it asks the Mac, as the phone does.
   - **The banner over the start page** says which programs are off: "Programs aren't running",
     "Admin isn't running · Shop and API are", or "Running on your Mac", with Run all, Run Admin,
     or Stop all (`programsBanner`). One program's banner is as before.
   - **A link** needs the program on its port (`programOfLink`: the port of `opens`, else of where
     it listens). "This link needs Admin running", with "Run Admin and open". A link on a port no
     program has needs the programs that aren't running, with "Run all and open". A running
     program's link opens at once. On the phone a localhost link still says it opens only on the
     Mac.
   - **Pages and Media:** a program in its own folder claims only the pages and their pictures in
     that folder, so a plain site beside it shows on Pages. A program at the project's top claims
     every page, as the one program does today.
   - **The Desktop dot:** each program is a row of its own (`program:<name>`), lit once when it
     is new, by the rule of ADR 0227's addendum of 17 November 2026. The one unnamed program keeps
     the row `program`.

5. **What the agents are told** gains the list: one entry per program, its folder, what it needs,
   and to add a program to the list rather than replace the file. Those words are said by the SDK,
   so they reach the agents with the next SDK and bridge release, which is Arjun's call. Until
   then agents write the one `run` they write now, and a run file of programs comes only from an
   agent asked for one.

## Consequences

- A space with two apps gets a Run, a Stop, a setup and a state for each, and Stop on Shop leaves
  the API running for Admin.
- An older phone reads a run file of programs as one that "doesn't say what to run or open", and
  shows that in red. It can still open the page and the folder.
- A program the run file dropped is stopped at the next press, not at once: until then it may
  hold its port, and Run on the program that wants that port says who holds it (ADR 0230).
- The press check now covers several programs at once: changing any program a press would start
  shows the run file again before it runs.
- Nothing here is per person beyond what ADR 0231 says: Run, Stop and Open are the owner's, on the
  Mac where the workspace's server runs.
