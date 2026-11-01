# 0226. Run, on the room's details, runs the project on your Mac

Date: 24 October 2026
Status: Accepted, 24 October 2026. Arjun asked "could we have a way so that I can easily run it from
a button? this open project button is really convenient, a universal Run button would be as well",
and answered the brainstorm: "when a project is runnable, chips should tell the agents to have a
command / way ready to run it on the mac, and once run option is ready the run button would become
active in the space details page. Tapping the button would do all things / run script to run the app
on the mac". On the mock he chose "Build A: the Run bar under the room's name, as mocked", then
moved it: "wait no, the run bar needs to be on the project detail page, under the open project
button". It builds on the room's project ([ADR 0220](0220-a-rooms-project-is-a-git-repository-chips-holds.md)),
the note the agents get about it ([ADR 0221](0221-an-agent-works-on-the-rooms-project-in-a-copy-of-its-own-and-its-bridge-does-the-git.md)),
Your folder ([ADR 0224](0224-your-folder-is-a-copy-of-the-rooms-project-on-your-mac.md)) and Open folder
on Mac ([ADR 0225](0225-open-folder-on-the-phone-opens-it-on-your-mac.md)).

## Context

On 23 October Arjun opened Sudoku mini's folder from his iPhone, double-clicked `index.html` on the
Mac, and saw only the heading: the page loads its game as modules, which a browser refuses from
disk. The agents answered with "run `python3 -m http.server`" and a one-file copy as an attachment.
Every project that runs needs something like that: a server started, packages installed, an address
opened. Today the person has to know what, and a Terminal to do it in.

The agents know how their project runs, and they work on the same kind of Mac. Chips has the
folder on the Mac, and a way for any of the person's devices to ask that Mac to do something.

## Decision

1. **The agents keep a run file.** The note every agent's turn opens its project with (the SDK's
   `renderProjectNote`, and Jacobian's copy) says: when what you make can be run, keep `chips.json`
   at the project's top so Run in Chips can start it on the person's Mac from the project's folder,
   and check the command works in your copy before you say it does.

   ```json
   { "run": "python3 -m http.server 8000", "opens": "http://localhost:8000" }
   ```

   `run` is one shell command, run in the folder: a server that stays up, or a script that ends.
   `opens`, optional, is an address on the Mac itself (`localhost`, `127.0.0.1`) or a file in the
   project, never somewhere on the internet. `setup`, optional, runs first whenever it, or the
   project's `package.json`, `package-lock.json`, `requirements.txt` or `pyproject.toml`, changed
   since the last run (`npm install`). Each is at most 500 characters. One reader, the protocol's
   `runRecipe`, is what every device and the Mac check it with.
2. **Run is on the Project page, under Open folder.** The Your folder card at the top of Files has
   the Run bar: on the Mac under Open folder and Open in editor, in a browser and on the phone
   between Open folder on Mac and Download as zip. The bar reads `chips.json` at the room's `main`, as
   any file of the project is read, again whenever the project moves on. Ready, it says what it
   does: "Runs `python3 -m http.server 8000` in ~/Chips/Projects/Sudoku mini, then opens
   localhost:8000." (the phone and a browser say "on your Mac"). Without one it is there but held:
   "The agents haven't said how to run this yet." A file it can't use says why, in red.
3. **One tap does all of it, on the Mac.** The Mac's `chips project folder run` makes the folder or
   brings it up to `main` while untouched, runs `setup` when it changed, starts `run` in the folder
   with the person's own login shell, detached, and opens `opens` once it answers (it waits up to
   30 seconds). It keeps running until **Stop**, which ends the shell and everything it started.
   One run per room; **Run again** stops it and starts it afresh. What a run prints goes to
   `~/Library/Caches/chat.chips/runs/<room>/log`, never into the folder, so it never reads as a
   change of the person's. From the phone or a browser the press reaches the Mac as Open folder on
   Mac does: signed `POST /v1/spaces/:id/project/run {op, command}`, and `folder.run` to the
   person's own sockets that said `folders`, the Mac app's. The answer says how many Macs heard it;
   none, and the bar says "Chips for Mac isn't open, so nothing ran."
4. **Every device of the person's sees how it is going.** The Mac says starting, running (since
   when, what it opened), stopped, ended or failed (how long it ran, its code, its last 20 lines),
   looking again every three seconds while it runs, and with every look at the folder. Each change
   goes to the server as signed `PUT /v1/spaces/:id/project/run`; the server keeps the last word for
   that person and room, in memory, and passes it as `folder.run_state` to their own sockets that
   said `folder_runs`, never to anyone else's. `GET /v1/spaces/:id/project/run` reads it again, with
   how many of their Macs are open.
5. **Nothing runs unseen.** A press carries the command the bar showed, and the Mac runs only what
   the folder's `chips.json` says when that is the same; otherwise nothing runs and the bar says
   "chips.json in your folder says to run something else now." When the recipe changed since the
   person last ran the room, the bar says so in amber, "Changed since you last ran it.", over the
   new command. Only a person's own device can press Run: no agent, and nobody else's device.
6. **Not in this pass.** Ask them (putting "Make this runnable from Chips…" in the composer) and
   Tell the agents (a failed run's lines in the composer), both on the mock, wait for a way for the
   room's details to fill the composer on the phone.

## Options

- **A. A Run bar under the room's head.** His pick on the mock, then moved to the Project page
  under Open folder, beside the folder it runs from.
- **B. A Run tile, first in the tiles beside Project.** Quieter; the same states in a tile's two
  lines, with Stop on its page.

## Consequences

- Run trusts what the agents wrote as much as running it in Terminal would. The person sees the
  command before it runs, and again whenever it changes.
- A run outlives Chips for Mac quitting, since it is detached; when Chips opens again its card's
  first look shows it, and Stop ends it. Until then the phone shows what the Mac last said.
- The server forgets a run's last word when it restarts; the Mac says it again at its next look.
- The Mac knows a run's shell by its process id and the time that process started, so a process
  that took the id over after a restart is never stopped.
- A person's run is theirs: someone else in the room runs it on their own Mac, if they have one.

## Addendum, 24 October 2026: pages that need no starting

On his "make the 2 fixes", after Terra Fab Research's agent wrote `{"opens": "index.html"}` for two
report pages and a start page linking them, which this ADR's reader refused for having no `run`:

- **`opens` alone is a recipe** when it names a file of the project. Run opens that file on the Mac,
  and nothing keeps running; the Mac says `opened`, and the bar "Opens `index.html` from
  ~/Chips/Projects/<room>." then "Opened just now.". An address with no `run`, and a `setup` with no
  `run`, are still refused, in words.
- **Any document, never a program.** The Mac opens the file as Finder would: a PDF in Preview, a
  Word or Pages document in its app, a picture, a page in the browser. A file the Mac would run when
  opened (an app, a `.command` or other script, an installer, a link file) is refused as `opens`,
  with or without `run`: it starts only as `run`, where the bar shows the command.
- **The note says so**, and asks for one start page when there are several things to open, rather
  than a list. On his "maybe agents build it … agents may have proper context on which files to
  show" and "the index.html should be kept in a separate folder called "Viewing"", the agents keep
  it: "With several things to open, keep a start page at Viewing/index.html that links to the ones
  worth seeing (its links start ../), keep the files themselves at the top or in folders of their
  own, and open that page; bring it up to date whenever you add, rename or replace one."
- **A computer at the room's top right**, on his "a computer icon to show up on the top right of
  the space, which would be a shortcut to this "files" option": in a room with a project, the
  phone's bar (beside the connection's mark), the iPad's and the web's and Mac's header (before
  who is here) have it, and it opens the room's details on Project, at Files.
- **The card's order**, on his "Open folder on mac, Run on mac, Download as zip": on the phone and
  in a browser, Run stands between the two, an inset panel in the sheet's ground; on the Mac, right
  under Open folder and Open in editor.
- The same walk found the project's key check holding both pages for links whose words end in
  "sk" ("…/elon-musk-terafab-project-…" read as an OpenAI key). `sk-` now begins a word in the
  shapes the server's hook, the bridges and Jacobian check with.


## Addendum, 24 October 2026: an address that already answers, and a run file that leaves the folder

*Its first half, opening what already answers and starting nothing, is replaced by
[ADR 0230](0230-run-opens-the-address-the-program-prints-and-says-what-went-wrong.md): Run starts
the program and opens the address it prints. The second half, the run file kept to the folder,
stands.*

On his "Do all three", after Run in the Game of Life room stopped after a second with `EADDRINUSE
:::4173`. Its agent had written `{"run": "cd /Users/ada/JacobianSpaces/evolution-lab && node
scripts/serve.js", "opens": "http://localhost:4173"}`, so the project held nothing but its run file,
and the agent had started that server itself, which still held the port.

- **An address that already answers is opened, not started again.** Before it starts anything, Run
  asks the run file's `opens`, when it is an `http` address. If something answers there, the Mac
  opens it, starts nothing, and says `opened`, with why: "Something on your Mac already answers at
  localhost:4173, so Run opened it and started nothing. Chips didn't start it, so Stop can't close
  it." The bar shows those words, plainly, where it would say "Opened just now.". A run Chips
  started itself is stopped first, as before, so this is only ever someone else's.
- **A run file that leaves the project's folder is refused.** `run` or `setup` that changes to a
  folder outside it (`cd` or `pushd` to an absolute path, `~`, `$…` or `..`) or names a path in a
  home folder (`~`, `$HOME`, `/Users/<name>`, `/home/<name>`) is refused, in words, as a run file
  with no `run` is: "`.chips/run.json` uses /Users/ada/JacobianSpaces/evolution-lab, outside
  the project's folder. Ask the agents to put what it runs in the project." Run runs what the room
  made, which is what everyone in it can see, change and download; a run file that reaches into
  one agent's workspace runs something none of them can, and works on one Mac only.
- **The note says so**, in Chips's SDK and in Jacobian: "Everything it runs belongs in the project:
  Run refuses a command that goes anywhere outside the project's folder (a cd elsewhere, a path in
  a home folder)", and "leave starting it to Run rather than starting it yourself".
- This is a check of the words, not a sandbox: a command that reaches outside some other way still
  runs, as any command the person runs does. It catches the shape agents write, and says what to
  do instead.

## Addendum, 25 October 2026: a browser that won't open the address doesn't undo the run

Arjun, from his iPhone: "just tested game of life, sudoku. program running is failing from phone".
Both rooms said `_LSOpenURLsWithCompletionHandler() failed with error -1712`. Safari on his Mac
was refusing every address it was handed, from Terminal too and with Safari named, each in two
seconds. Run had started the game of life (its log said "Emergence is running at
http://localhost:4173"), but opening the address threw, so the press read as a run that never
happened: the bar showed the run before it with macOS's words, and the program went on with no
Stop. Sudoku's address already answered (another program holds 8000), so Run only opened it, and
that threw the same way.

- **Opening is the last thing a press does, and its failure is the browser's.** A run that started
  stays running when the address won't open. Its bar says "Running on your Mac" with Stop, and
  "Your browser didn't open localhost:4173. Open that address in your browser." in place of
  "Opened … in your browser.". What macOS said goes to the run's log.
- **An address that already answers says the same.** "Something on your Mac already answers at
  localhost:8000, so Run started nothing, and your browser didn't open it. Open that address in
  your browser. Chips didn't start it, so Stop can't close it."
- **A page that needs no starting** says "Your Mac didn't open index.html. Open it from your
  folder."
- Chips doesn't open the address another way (in Chips, or in another browser): the person's
  default browser is the one asked, and when it won't take an address, the person is told and does
  it.

## Addendum, 25 October 2026: Run says who else changed the files

The consequence above, that Run trusts what the agents wrote as much as Terminal would, held only
while nobody else could write (the second security review's SEC-40). With guests refused at the
door (ADR 0220's addendum), what is left is a member, or a member's agent, changing the files the
owner then runs. Arjun's call: say so, and never refuse the run for it.

- A run keeps the room's `main` it started at (`commit`, beside `command`), as the folder last
  fetched it.
- The bar names whoever changed the project after that commit, other than the person and the
  agents of their own harnesses: "Changed by Dana since you last ran it.", "Changed by Dana's
  agent since you last ran it." (`changedSince` and `runBar` in `packages/core/src/projectRun.ts`).
  It shows over Run, Run again and a run going on, in amber, and takes the place of "Changed since
  you last ran it." when both are true.
- A change by an agent whose harness has no recorded owner is named by the agent's own name.

## Addendum, 25 October 2026: what it opens is part of what the person saw

The second security review's SEC-46: `{"run": "make", "opens": "play.command/."}` passed the check
for a program, since the check read the end of the words and `/.` hid the name. Run opened
`<folder>/play.command`, which the Mac runs, and the press had shown only `make`.

- **A program is known by its last part,** once `.`, `..` and slashes are settled:
  `play.command/.` is `play.command` (`opensAProgram`).
- **The Mac asks again of the file it opens,** after links, before `open`: a file outside the folder
  once links are followed isn't opened, nor a program. A link called `index.html` to
  `play.command` fails with "index.html would run as a program, so Chips didn't open it."
- **What a press names includes what it opens:** `setup`, `run` and `open <opens>`, a line each
  (`commandOf`). A run file that changed only where it opens is refused on the Mac until the person
  has seen it, as one whose `run` changed is. A run file whose whole press would pass 1,100
  characters is refused, as one whose parts are too long is.
- A phone on a build from before this sends the run without what it opens, so the Mac refuses its
  press of a run file that has both until the phone is updated. Until the next run, such a run
  file's bar reads "Changed since you last ran it.", since the last run was written down without
  `open`.
