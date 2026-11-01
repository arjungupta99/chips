# 0227. Universe opens what a space made, on the phone and on the Mac

Date: 24 October 2026
Status: Accepted, 24 October 2026. Arjun, after Terra Fab Research's start page opened in the Mac's
browser: "can we have this index.html that we build to show other files, live at space level? and
can it open as a page in the chips app or something? not like a separate HTML? so that the
chips/space/files only contain the actual files?", then "I do not intend to run the server on
phone, those run on mac only … only documents open in phone", and the shape he asked for: Project
"should show just the files and changes and not the "Your folder" stuff"; the computer at the top
right opens "two tabs, "phone", "desktop""; "Get rid of Download as zip"; on the phone "phone loads
the index.html directly. does not load programs"; on the desktop "Open folder in mac", "open page"
for documents ("loads the index.html in the chips desktop app (if multiple files), loads the document
directly in chips if only one file") and "Run program" for programs, "Not in chips as a rule". On
the mock he picked the icon, four rings round a sun with a planet on each ("A looks good"), and the
name: "Let's call it universe". Then "Build it". It changes where [ADR 0224](0224-your-folder-is-a-copy-of-the-rooms-project-on-your-mac.md),
[ADR 0225](0225-open-folder-on-the-phone-opens-it-on-your-mac.md) and
[ADR 0226](0226-run-on-the-rooms-details-runs-the-project-on-your-mac.md) stand, and what the agents
are asked to keep.

## Context

ADR 0226's addendum put a computer at the room's top right that opened the room's details on
Project, whose Files began with Your folder: Open folder on Mac, Run on Mac, Download as zip. Run
opened what `chips.json` named on the Mac: a server's address, or a start page the agents kept at
`Viewing/index.html`, in the browser. So the start page was a file among the files, and the only
way to see it was a browser on the Mac.

Chips already opens a project's HTML page in its own page view on every device, its styles,
scripts and pictures folded in ([ADR 0223](0223-a-page-from-the-rooms-project-is-built-into-one-document.md)).
A start page is a page like that. What it lacked was a place of its own, links that open in Chips,
and a way to open it from the room.

## Decision

1. **Universe, at the room's top right.** In a room with a project, the icon is four rings round a
   gold sun, a blue, green, coral and violet planet on them. It opens Universe: the space's name
   under the word, and what the space made, to read or to run.
2. **Project is the files and their changes.** The room's details keep Project with Files and
   Changes, and nothing above them. Download as zip is gone from every device.
3. **What a space has, from what its agents keep.** Core's `universeOf` reads the project's files
   at `main` and its run file:
   - **A program** when the run file has `run`. The run file is `.chips/run.json`; a `chips.json`
     at the top is still read when there is none.
   - **Documents** to read: the start page at `.chips/index.html`; with none, what an opens-only
     run file names; with neither, the one document the project has (a page, Markdown, a PDF, a
     picture, a text or office file). A project with several documents and no start page lists
     them. A program's own pages are not documents unless its agents keep a start page.
   - `.chips` is the agents' and Chips's: Files leaves it out, and Finder hides it as it hides
     `.git`.
4. **On the phone, two tabs.**
   - **Phone**: the documents, here. A start page that is a page loads in the tab; a picture is
     drawn; another kind of document is one row that opens in Quick Look. Several documents with no
     start page are listed. A program's room says that programs run on your Mac, with a way to
     Desktop.
   - **Desktop**: what happens on the person's Mac. Open folder in Mac (ADR 0225). Under
     Documents, Open page, which asks the person's own Chips for Mac to open the start page, or the
     one document, in its own window. Under Programs, Run program (ADR 0226's bar, renamed), which
     runs it on the Mac and never in Chips: a site opens in the browser, an app in its own window.
5. **On the Mac and in a browser, one page.** Universe there is the Desktop tab's, acting here:
   the Mac's Your folder card (Open folder, Open in editor, what came in), Open page opening the
   page in this window, and Run program. In a browser, Open folder and Run program ask the Mac, as
   before, and Open page opens the page in the browser's own Chips.
6. **Open page reaches the Mac as Open folder does.** `POST /v1/spaces/:id/project/folder/open`
   takes `{"what": "page"}`, and `folder.open` carries `what: "page"` to the person's own sockets
   that said `folders`. Chips for Mac comes forward, opens the room, and opens its page; the phone
   says it did, or that no Mac is open. The frame names only the room: the Mac finds the page
   itself, from the same rule.
7. **A link on a page opens the file in Chips.** When chipsd builds a page, a link to a file of the
   project becomes `chips-file:<path>`. On the phone, a tap on one opens that file over the page
   (a page or Markdown in the page sheet, anything else in Quick Look); in the web's and the Mac's
   frame, a small script the builder adds hands the path to the window, which opens it in the page
   dialog (a page, Markdown, a PDF, a picture). Nothing else about what a page may reach changes.
8. **The agents' note says so.** Documents worth seeing: a start page at `.chips/index.html` that
   links to them (its links start `../`), the documents themselves at the top or in folders of their
   own, brought up to date as they change; one document needs no start page. Something that runs
   on the person's Mac: `.chips/run.json` with `run`, and `opens` for the address to open once it
   answers; an app is started by its own program, not `open`, so Stop can close it.

## Options

- **The agents' own page, opened in Chips.** Each space's start page looks as its agents made it.
  Picked.
- **Chips draws a page from a list the agents keep.** Tidier, but every space alike. Not picked.
- **Programs shown in Chips too.** Withdrawn on his "Not in chips as a rule"; programs never open on
  the phone, now or later.

## Consequences

- A space's documents can be read on the phone with no Mac awake.
- A start page that `Viewing/index.html` holds from ADR 0226's addendum is a document among the
  others until its agents move it; spaces from before keep their files as they are.
- Open page needs Chips for Mac from this build: an older one hears `folder.open` and opens the
  folder in Finder instead.
- The zip route stays on the server, unused by the apps.

## Addendum, 24 October 2026: the phone's Desktop tab is one list

Arjun: "under universe --> desktop tab we need better layout organization of the buttons". The tab
stacked three full-width buttons, each with its words under it: Open folder in Mac at the top, then
Open page in gold under Documents, then Run program in gold under Programs. The folder, the one
pressed least, came first. A space with a page and a program had two gold buttons. Run program sat
12 points in from the rest, in a panel whose fill in dark is the sheet's own, so the inset showed and
the panel didn't. On a mock of three layouts beside how it was (tidied buttons; one list; Run with
two tiles under it) he picked "B · One list", and "please also have smooth transitions when buttons
are tapped and state changes".

- **One card, a row each, as Settings draws them.** The program first, then the page (or the one
  document, by its name), then the folder. Each row has its mark, what it is ("Program", "Page",
  "Folder"), what it does under that, and its button at the right: Run in gold, Open for the others.
  Under the card, once: "These happen on your Mac. Chips for Mac has to be open."
- **What a press says comes back in its own row.** "Sent to your Mac. Finder opens the folder there."
  takes the place of the row's words, in green, or in red when no Mac heard it.
- **The program's row is the run bar.** While nothing runs it is Program and Run. Starting or
  running, its name says so with a lit dot, and Stop and Run again open under it. Run again is there
  from the start, dimmed until it runs, so Stop keeps its width. Once it ended, the name says how,
  its last lines open under it, and Run is back at the right; the name already says it ran, so the
  button doesn't say "Run again" and push the name onto two lines.
- **A press waits on the Mac that heard it.** Run keeps turning until that Mac says it is starting
  (or 10 seconds pass), and Stop until it says it stopped, so Run doesn't come back for the moment
  in between.
- **It moves.** A row's button gives under the thumb and springs back, on the +'s spring. Words that
  change crossfade in place. What opens under a row grows from no height and closes back to none,
  and the rows and the card move to their new places on the same clock and curve (190 ms, ease-out),
  so nothing jumps. With Reduce Motion nothing travels.
- **The page's Open is gold, the folder's a blue tint.** On his "I want the open button to also have
  a nice color", from a mock of a blue tint, solid blue and a gold tint beside the grey: "A, the blue
  tint", in the palette's soft blue. Then "open for folder can be the blue tint, but maybe slightly
  lighter as it is blending with background. open for files should be yellow as well": the page's
  (or the one document's) Open is gold, as Run is, and the folder's is Send's blue at 28% over the
  card in dark and 14% in light, with blue words (`blueInk`).
- The web's and the Mac's Universe page is unchanged: it was one page already (point 5).

## Addendum, 24 October 2026: the server opens Chips for Mac

Arjun: "I need ability, where if from chips phone app we try to open link or play program through
universe, if chips app is not open then the chips server can also open it." Chips for Mac starts at
login with no window
([ADR 0215](0215-the-menu-bar-shows-chips-while-the-server-here-answers.md)), and with no window
its page hasn't loaded, so nothing on the Mac says `folders` and the phone said "Chips for Mac isn't
open" while its icon sat in the menu bar. Of the shapes put to him he picked "Build A: the server opens
Chips for Mac and hands the ask over."

- **The owner's ask, with none of their Macs open, opens it.** Open page, Open folder in Mac and Run
  (not Stop: there is nothing running to stop) first look for a socket of the asker's that said
  `folders`. With none, and the asker the workspace's owner, the server runs
  `open -g -a <Chips for Mac> chips://space/<id>`, as a `chips://` link from anywhere else does: the
  window is made if there was none, behind what is in front, and its page connects at the room.
- **It waits for the app, then hands the ask over.** The ask is held up to 25 seconds for a socket of
  the owner's to say `folders`, then goes to it as it would have. The answer says `opened_app`, and
  the phone says "Chips for Mac wasn't open, so Chips opened it. Finder opens the folder there." (or
  "The page opens there."), or for Run what the Mac says next. If the app came up too slowly:
  "Chips for Mac is starting on your Mac but hasn't connected yet, so nothing opened. Press again in
  a moment."
- **Only the owner's ask, and only where the app is.** A member's Mac is not the one the server runs
  on, so their ask opens nothing and says, as before, that their Chips for Mac isn't open. The app is
  found where its login item says it runs from, else `/Applications/Chips.app`; with neither, the
  ask is answered as before.
- **Only a server serving for the person, on a Mac, outside dev mode.** `chips serve` (what the
  login item runs), `chips up` and `chipsd serve` open it; a test, a scratch server or a dev one
  doesn't, since opening the person's own Chips for Mac would show them a room it could not find.
- Under the Desktop tab's list it now says "These happen in Chips for Mac, on your Mac.", and Open
  folder on Mac's words no longer say it has to be open.
