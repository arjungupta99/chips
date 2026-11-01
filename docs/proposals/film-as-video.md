# The film as a video

**Build plan, 21 October 2026. Status: done, 25 October 2026: FV1 to FV6 and RA1 to RA3 built, the sharper films brought on, all live (ADR 0217 accepted on his "Proceed").** Arjun, 21 October 2026,
after the rendered film: "Put the film in the app in place of the live film. Write the plan and ADR
first." The decision is [ADR 0217](../decisions/0217-the-film-is-a-video-rendered-from-the-app.md).
It changes [ADR 0213](../decisions/0213-a-newcomer-watches-chips-play-a-made-up-workspace-before-setting-anything-up.md)'s
film and keeps its demo workspace, its words rule, Look around and the first screen.

This plan does four things:

- moves the render into the repository;
- gives each client a player for the rendered films;
- renders the two short films;
- takes the live film's stage out of the clients.

## What it costs

- **No server change, no migration, no restart of 4431.** Tools, core and the three clients only.
- **App size.**
  - The first film is about **5.5 MB**, measured on 21 October: H.264, 1080×1920, 60 fps, CRF 26.
    It matched the 15.5 MB CRF 16 encode by eye.
  - The short films are about 4 to 5 MB each, estimated from their length.
  - About 15 MB in all, on the phone, in the web build and in the Mac app.
- **A render after a filmed screen changes.** `pnpm film` takes about ten minutes on his Mac:
  - shots, about 3 minutes;
  - composing, about 4 minutes;
  - encoding, about 2 minutes.

  Then a look. Each render adds its videos to git history.
- **What the film gives up**, from ADR 0217:
  - the person's own taps;
  - a light film;
  - a landscape cut;
  - Liquid Glass and blur, since the phone's shots come from its web build.
- **About:**
  - `tools/film/`: four files moved in from the scratch folder, plus a beats file per film;
  - a render mode in each client;
  - a player in each client;
  - the stage, the caption, the ring and the stage's frames deleted from both clients;
  - Your turn taken out of core's player;
  - four e2e specs rewritten.

## What exists today

Made on 21 October in a scratch folder, and checked by eye and by measure. It is the first thing
moved into the repository.

| Piece | What it does |
|---|---|
| `shoot.mjs` | One shot: opens a build, starts Watch Chips work, jumps to a chapter (or goes to Look around and searches), and saves a screenshot per frame. Playwright's clock is installed and paused, so it moves only when told; each frame moves it a sixtieth of a second. Every CSS and Web Animations animation is paused and set to the same clock. A ring that comes up gets its tap after a set wait. |
| `film.html` | The scene, 1080×1920: the glow, the beat's words arriving a word at a time, a phone with its island and status bar, a Mac window for beat 1, the end card, and a slow camera that leans in and back within each beat. |
| `film.mjs` | Lays every frame of every beat into the scene, and finds where the app changed in one frame. A list that moved slides on a spring that lands on its last frame; rows that changed fade in, and a bubble-sized change dips to the ground first. A changed header is a new screen and dissolves. Shots within a beat dissolve into each other, and so do beats. |
| `check.py` | Compares each frame of the finished film with its neighbours, at full size, and lists any frame that changes far more than both. |

What the work taught, kept for the move:

- `page.clock.install` alone lets the clock run with real time, so the capture ran three times
  fast. `pauseAt` fixes it.
- An animation driven by scroll (`ScrollTimeline`) can't be given a time; it is left to its scroll.
- Chromium writes some PNGs with alpha and some without. ffmpeg needs `-reinit_filter 0`, or its
  measure stops where the format changes.
- A shot runs into the next chapter at its end, so each shot is cut where its chapter ends.
- The model chapter waits for a tap on Save (`ring-model-save`).
- On the Mac build, tapping the first chapter's segment replays the stage's step-back.

## The first film

Its beats, from the rendered film (`assets/film/watch.mp4` once moved):

| # | Beat | Shot | Seconds |
|---|---|---|---|
| 1 | Your computer | the Mac build's Spaces chapter, in a Mac window; the phone's Watch chapter in front of it | 5.5 |
| 2 | Harnesses | the phone's Agents chapter | 4.9 |
| 3 | Spaces | the phone's Spaces chapter | 5.3 |
| 4 | Teamwork | the phone's Teamwork chapter, ending on the room sheet | 11.4 |
| 5 | You decide | the Approve chapter, then the lock screen to Approved | 6.7 |
| 6 | Controls | the up-close film's Model chapter, then its Compact chapter | 9.0 |
| 7 | Search | Look around, the Search tab, "card" typed | 6.0 |
| 8 | End card | the mark, Chips, "Chat with your AI agents" | 3.2 |

The words, as rendered:

| Beat | Line | Sentence |
|---|---|---|
| Your computer | Your agents, on your own computer | Chips runs on your Mac with your agents, and your phone keeps up with them when you're out. |
| Harnesses | Agents from different harnesses, together | Each harness you connect brings its agents. Errand, Studio and Herald work side by side. |
| Spaces | Every job gets its own space | Each conversation keeps to its own room. A face lights up while its agent works. |
| Teamwork | People and agents, in one room | Rosa is here with Milo and Theo, who run on two different harnesses. Milo asks Theo for an invite card. |
| You decide | When it asks, you decide | Milo asks before paying the deposit. Answer in the room, or from your lock screen. |
| Controls | Each agent, set your way | Choose its model and effort. Make room in its context when it fills up. |
| Search | Find what was said, in any space | Search your spaces, your agents and everything said in them. |

## Phases

Each phase lands on main by fast-forward when `pnpm check` passes, with the e2e it drives. Going
live (the web build, the Mac app, a phone build) waits for his word. FV1 comes first. FV2, FV3 and
FV4 can then run side by side. FV5 needs FV2 and FV3, and FV6 is last. RA1 to RA3 (proposed 21
October, [below](#the-render-acts-as-a-person-does-ra1-to-ra3)) would come between FV5 and FV6, so
FV6's walk sees the final films.

### FV1 · The render in the repository

- **`tools/film/`**: the four files, tidied, with `check.py` ported to Node so the render needs no
  Python.
- **Beats files**, one per film (`tools/film/beats/watch.json` and the rest): each beat's words, its
  layout (phone, Mac and phone, end), and its shots. A shot names a film, a chapter, and where to
  cut. Cuts are said in the chapter's own terms, from a time into it to its end, rather than as
  frame numbers. The render mode tells the shooter which chapter is playing.
- **A render mode in each client**, made only by `pnpm film`:
  - The phone's web export gets a route `film-source` (built with `EXPO_PUBLIC_FILM_SOURCE=1`). The
    web build gets `?film-source` (built with `VITE_FILM_SOURCE=1`). Without the flag, the route
    is not there.
  - It plays a chapter of a film full size, with no stage, through the demo's store and the
    client's director. The lock screen picture covers the screen, and the player sends the taps
    itself.
  - It marks the page with the chapter playing and its time.
  - Full size is sharper than the stage, whose 0.74 scale resampled every line of text.
- **`pnpm film [watch|agents|trouble]`**:
  1. Builds both clients in render mode into a temporary folder, never the dist the apps ship.
  2. Serves them, shoots, composes, and checks. A lone jump fails the render.
  3. Encodes H.264 at CRF 26.
  4. Writes `assets/film/<film>.mp4` and `assets/film/films.json`: each film's title, length, beats
     with their start and end and their words, the hashes of `packages/core/src/demo/script.ts`
     and of the beats file, and the commit it was rendered at.

  It checks for ffmpeg first and says how to install it.
- **Tests:**
  - the hash test (a film rendered from an older script or beats file fails `pnpm check`);
  - the composer's maths: the spring lands on its last frame, rows found unchanged under a shift
    of a fraction of a pixel, a changed header read as a new screen.
- **Built** (21 October 2026). Where it differs from the above:
  - **No route of its own.** The render mode reads the page's address as the app loads:
    `?film=watch&chapter=5` plays a chapter, and `?look=1` (the phone only) is the demo played
    whole and looked around. The phone's stage starts it once the phone is ready
    (`demo/filmSource.ts`, `FilmSource` in `DemoStage.tsx`); the web's `App` does
    (`demo/filmSource.ts`, `FilmSourceStage`). The flag is read in the phone's one build-settings
    file (`src/build.ts`). The provider's `watch` takes a chapter to start from, for this alone.
  - **Turns are tapped by the shooter**, a moment after the page marks one (`data-film-turn`).
    The real control is pressed, as a person would, until FV5 takes Your turn out.
  - **Frames are the phone at twice its points** (786 × 1704) and the Mac's window at twice its
    size (2560 × 1600), full size, with no stage.
  - **The composer leaves the app's own motion alone.** A change the app animates around (a sheet
    sliding up as the list moves) dissolves, rather than moving on a spring that would hold the
    sheet still and let it jump at its end.
  - **`pnpm film watch --again`** composes again from the last render's shots, for work on the
    composer alone. The hashes it records are the files' as they are, so the film is rendered whole
    before it lands.
  - `check.py` became `loneJumps` in `motion.mjs`.

### FV2 · The phone's player

- **`app/film.tsx`** (`?film=watch`), a full-screen page:
  - `expo-video`'s `VideoView` with no native controls, the film from `assets/film/` through Metro;
  - dark in both appearances; the film fitted to the screen, letterboxed on an iPad.
- **The chapter bar** from `films.json`: one segment per beat. The segment playing fills from the
  player's time, between time updates on the UI thread, as `SegmentFill` fills now. A finished
  segment jumps once. A tap on a segment goes to its beat.
- **The rest of the chrome:**
  - a tap on the film pauses and plays;
  - Leave (✕);
  - when the film ends, the end card (`EndCard`, as today): Set up my own Chips, I have an invite,
    Look around, Watch again, More to see.
- **Look around is unchanged.** It builds the demo workspace at its end and opens Spaces.
- **The ways in:**
  - Welcome to Chips' Watch Chips work (`app/pair.tsx`);
  - the switcher's Watch Chips work (`Switcher.tsx`);
  - the end card's Watch again and More to see.
- **VoiceOver:** the film is labelled with the playing beat's line and sentence, and each segment
  is a button named by its beat. With Reduce Motion, no jump and no spring in the chrome.
- **Tests:** the page over a mocked `expo-video` (as `MediaViewer.test.tsx` mocks it), covering the
  bar from time, a jump, pause, Leave, the end card, and Look around. `e2e/demo.spec.ts` and
  `demoFilms.spec.ts` are rewritten for the player, still checking that no request leaves the page.
- **Built** (21 October 2026, on his "Yes"). Where it differs from the above:
  - **The bar is along the top**, under the status bar, with Leave at its end, as a story's is: the
    video fills the screen, so there is no foot under it. Its ink is white on the film and the
    app's own over the end card. The page is `src/demo/FilmPlayer.tsx`, read from
    `src/demo/videos.ts` (`films.json`), and `app/film.tsx` wires its ways.
  - **The film starts once its view is up**, not in the player's set-up: on the web, a player plays
    only the views it already has.
  - **A paused film shows a play mark** in its middle.
  - **The end card's words** are the demo's last chapter's ("That's Chips"), and the card is in the
    app's appearance; the film is dark in both.
  - **More to see offers only films with a video**, so it is empty until FV4. The live short films
    can't be reached any more, so `demoFilms.spec.ts` goes; FV4 writes its video version.
  - **Look around makes the demo itself** (`lookAround(film)`): played whole, in front and kept,
    as the live film's end left it. A demo kept behind the person's own workspace is brought in
    front as it was.
  - **The phone's e2e server answers byte ranges.** Chromium will not seek a video whose server
    never says it does, so a tap on a segment did nothing there.
  - **No Live Text on a paused frame** (`allowsVideoFrameAnalysis={false}`): iOS offered to read
    the film's words out of the picture, seen on the simulator.
  - The provider's `watch` stays for the render mode, and for the stage's own end card until FV5.

### FV3 · The web and the Mac

- **`apps/web/src/app/film/FilmPlayer.tsx`**:
  - a `<video>` (`playsInline`, `muted`, started by the click that opened it), the film imported
    through Vite;
  - the film at the window's height, centred, with the same bar, pause, Leave and end card.
- **The ways in:**
  - the unpaired page's Watch Chips work (`Welcome.tsx`);
  - the sidebar's workspace menu, Watch Chips work… (`Sidebar.tsx`);
  - the end card.
- **The Mac app** is the web build in WebKit, which plays H.264.
- **e2e:** `the-demo.spec.ts` and `the-short-films.spec.ts` are rewritten: the film plays, the bar
  goes to a beat, the end card's ways on work, and no request leaves the page.
- **Built** (21 October 2026, on his "Proceed"). Where it differs from the above:
  - **The film is fetched whole and played from memory**, from an object URL, as a room's videos
    are. The server's web route answers no byte ranges and calls an `.mp4` `octet-stream`, and
    WebKit (Safari, the Mac app) plays a video only from a server that answers ranges, or from
    memory. So the server is unchanged, and 4431 needs no restart for this.
  - **It is a modal dialog** (`showModal`) over the page as it was, so the page behind takes no
    focus and Escape leaves. The dialog takes the focus itself: WebKit ringed the first segment.
  - **What a time says of a film is core's** (`packages/core/src/demo/video.ts`), shared with the
    phone, whose copy went there; each client keeps only its list and its videos' addresses.
  - **The end card is the stage's own** (`pictures.tsx`), drawn a little smaller (`zoom: 0.82`)
    because the stage drew it a size up. FV5 can set its sizes once the stage goes.
  - **Look around makes the demo** (`lookAround` in `App.tsx`); one already looked around is
    brought in front as it was.
  - **`the-short-films.spec.ts` and `shortFilms.test.tsx` go**, as the phone's did: the live short
    films can't be reached. FV4 writes their video versions.
  - Checked in WebKit as well as Chromium (`the-demo.spec.ts` under Playwright's WebKit, once).

### FV4 · The two short films

- Beats files for *Your agents, up close* (agent page, model, instructions, compact, fork, move)
  and *Costs and trouble* (cost, spend, Not right?, can't answer), with words to the same rule.
- Rendered with `pnpm film agents` and `pnpm film trouble`, and played from More to see.
- **Built** (21 October 2026, on his "Go on to FV4"). Where it differs from the above:
  - **The words are the script's own**, which ADR 0213's walks already read to its rule; one shot a
    chapter, kept from 400 ms in. *Your agents, up close* is 39.8 s and 3.8 MB; *Costs and trouble*
    is 32.1 s and 3.0 MB. The three films are 12.2 MB in all.
  - **The composer finds two more kinds of change**, each of which jumped: a page popped back to
    the one under it lands over two frames (its header, then the page), and a change can land as
    a sheet comes to rest, three times its neighbours rather than four. `watch.mp4` was composed
    before these and passed its check, so it was not rendered again.
  - **The players put Watch Chips work first** (core's `inFilmOrder`): `films.json` lists films in
    their beats files' order, which is alphabetical, and More to see follows the demo's order.
  - **A new film's first render** builds both clients, so the players may not list its video until
    it exists: the build fails on the missing file. List it after its first render.
  - `demoFilms.spec.ts` and `the-short-films.spec.ts` are back, for the videos: each short film
    from More to see, a segment a part, to its own end card; the web's once in WebKit too.

### FV5 · The stage goes

- **Phone:**
  - `DemoStage`, `DemoCaption` and `Ring`;
  - `DemoMotion`'s `StageView` and `WordsIn`, while `SegmentFill` moves to the player;
  - `ui/stageFrame.tsx`, and its readers in `Sheet`, `LiftLayer` and `PageSheet`;
  - the stage in `app/_layout.tsx`.
- **Web:**
  - `DemoStage`, `Caption` and `useRing`;
  - `layer.tsx`, and its readers in `GrowingDialog`, `ConfirmDialog`, `LineMenu` and the room
    sheet's placing;
  - the stage in `App.tsx`.
- **Core:**
  - Your turn leaves the script and the player, which sends those events itself after their wait;
  - the chapters' captions leave the script, since the films' words are the beats files' now.
- The tests of what goes, go with it. The director, the screens' registries (`ui/asked.ts`),
  `LockPicture` and the end card stay: the render mode and Look around use them.
- **Built** (21 October 2026, on his "Go on to FV5"). Where it differs from the above:
  - **Each turn's act comes 600 ms later**, where the render's tap used to land, so every chapter
    keeps its timeline and its cuts. The render presses the app's own control a moment before
    (`taps` on a shot in a beats file: Approve, the model sheet's Save, Not right?'s Send), so
    the films still show the press. The player does not do an act the app's own control has done
    already.
  - **The end chapters left the script with the captions.** The end card's words are the film's
    (`FilmEnd`: "That's Chips"), and the render's Look around starts from the film played whole.
    `DemoFilm.minutes` went too: "1 min" is the video's own length now (`minutesOf`), on the
    phone's first screen and the web's welcome.
  - **The phone:** the render mode's stage is `FilmSourceStage.tsx`, which `app/_layout.tsx`
    mounts in the render build alone. `DemoMotion` became `FilmMotion` (the bar's `SegmentFill`
    and `Fades`). The provider's `jump` went with the bar that called it, and `Screen`'s lists no
    longer take the window's top themselves on a stage.
  - **The web:** the render mode's stage is `demo/FilmSourceStage.tsx`. The dialogs, the message
    menu and the room sheet's placing are their code from before the stage, word for word. The
    bar's fill moved into the film's player. The bar's easing was the stage's, so the player's
    jump never ran; the player has its own now. The end card is drawn at the size it was seen
    at (its 0.82 zoom folded into its sizes).
  - **A film's last chapter marks the film's end** (`watch:end`). The shooter ends a shot when the
    page's chapter mark changes, and with the end chapters gone the last chapter's mark never
    did: the first render waited an hour on the last shot of *Your agents, up close*.
  - The player's pause, speed and fill went with the stage's bar, their only reader.
  - All three films rendered again, since the script changed, at the same lengths as before:
    52.4 s (5.4 MB), 39.8 s (3.8 MB) and 32.1 s (3.0 MB).

### FV6 · Walks, then live

- A simulator, his iPhone over Wi-Fi, the Mac app and a browser, checking:
  - the film plays smooth and the bar follows it;
  - a tap on a segment, pause, Leave;
  - the end card's five ways;
  - each short film;
  - VoiceOver's words, Reduce Motion, and a phone in light mode.
- The scenario `testing/scenarios/onboarding/watch-chips-work.md` gains the player's steps.
- Live on his word: the web build, the Mac app and `pnpm phone ship`.
- **Walked, 25 October 2026** (on his "Start FV6: walk the films on my phone and the Mac"), with the
  films live since 00:23: the browser, a simulator of its own and Chips Walk; Reduce Motion and light
  on the simulator. The scenario now has the player's steps. Found WC-11 (the phone's end card titles
  leave a word alone) and WC-12 (the scene's glow shows a hard edge across the films); both fixed
  (`b07c37f0`), the films rendered again (`bceb97f7`) and live the same night. The Android
  emulator's end cards were walked that morning (`fe1ad717`). WC-13 (Look around after a short
  film opened that film's end) was fixed after it: Look around opens the first film's end from any
  end card (ADR 0217's addendum of 25 October, `c6fd3d98`).
  Not walked: VoiceOver on his iPhone.
- **Since, 25 October 2026:** Watch Chips work has a fifth part, Who answers, after Teamwork: the
  slide up the faces of ADR 0229, picking Theo ([ADR 0229](../decisions/0229-a-slide-up-from-the-faces-picks-who-a-message-goes-to.md)'s
  addendum of 25 October, `599b5116`). The render gained a `slide` step for it.

## The render acts as a person does (RA1 to RA3)

Proposed 21 October 2026, on his "After FV5 lands, write an ADR 0217 addendum and a plan for the
render driving the app by clicks, so the director and the screens' hooks can go. Show me before
building." The decision is [ADR 0217's addendum](../decisions/0217-the-film-is-a-video-rendered-from-the-app.md#addendum-21-october-2026-the-render-acts-as-a-person-does),
accepted 24 October on his "Accept the addendum and build RA1 to RA3 as planned, RA1's long press
and scroll first."

### What changes

Today a chapter's beat says *what is on screen*, and a director inside the app makes it so:

```ts
{ wait: 1500, sheet: "notRight" },
{ wait: 900, form: { kind: "notRight", reasons: [MISSED], words: "" } },
```

After, the script keeps only the agents' side, and `tools/film/acts.json` says *what the person
does*, by chapter time, on the app's own controls:

```json
"trouble:2": [
  { "at": 1300, "press": { "text": "Three can seat 12 on Saturday" }, "ms": 600 },
  { "at": 2800, "tap": { "text": "Not right?" } },
  { "at": 3700, "tap": { "text": "Missed what I asked" } },
  { "at": 3900, "type": "not-right-words", "text": "Mum can't manage stairs.", "every": 45 },
  { "at": 4900, "tap": "not-right-send" }
]
```

A step finds its control by test ID (a string) or by the words on it (`text`). The kinds:

| Step | What Playwright does |
|---|---|
| `tap` | a click on the control |
| `press` | the pointer down on it, held `ms` while the frames run, then up: a message lifted |
| `type` | the words into a field, a key every `every` ms, as Search's are typed today |
| `scroll` | a part of the page brought into view over `frames`, the same distance each frame |
| `reveal` | the same at once, before the shot's kept frames start |
| `back` | the bar's back |

Steps belong to the chapter, not the shot, so the two shots of *Your agents, up close*'s Model and
Compact (in *Watch Chips work* and in their own film) share them.

### The chapters

Only chapters that are shot need steps. 12 do, with about 40 steps between them:

| Chapter | Today's direction | Steps |
|---|---|---|
| Watch · Teamwork | the room's sheet, open, then closed | tap the room's name; tap its ✕ |
| Watch · Approve | Approve, by the render (FV5) | tap Approve |
| Watch · Lock screen | Approve on the picture, by the player | tap the picture's Approve |
| Agents · Model | the sheet, Heron 2, Deep, Save, closed | tap the model row; tap Heron 2; tap Deep; tap Save; tap ✕ |
| Agents · Instructions | the editor, its words, Save, back | reveal Context; tap `INSTRUCTIONS.md`; type the new line; tap Save |
| Agents · Compact | Compact now's ask, confirmed | reveal the window; tap Compact now; tap the confirm |
| Agents · Fork | the picker, a new room, the room it made | reveal the acts; tap Fork; tap the new room; and see where the app goes |
| Agents · Move | the picker, Receipts, the page's top | tap Move; tap Receipts; scroll to the top |
| Trouble · Cost | the reply lifted, What the run did, closed | press the reply; tap What the run did; tap ✕ |
| Trouble · Spend | the room's sheet, Spend per job, $3, $5, Save | tap the name; tap the Spend tile; tap the amount twice; tap Save; tap ✕ |
| Trouble · Not right? | lifted, the sheet, a reason, the words, Send | as above |
| Trouble · Can't answer | the words in the field, Send | type the words; tap Send |

Typing takes longer than words put in whole, so a few waits in the script grow to make room (the
new line in Instructions, about 45 keys). The films are rendered again anyway.

### RA1 · The two hard steps, tried first

- `press` and `scroll` in `shoot.mjs`, tried on *Costs and trouble*'s Cost (a reply pressed and
  held) and *Your agents, up close*'s Move (the page scrolled back to its top), with those two
  chapters' directions taken out of the script and the director left alone for the rest.
- What can go wrong, and what takes its place:
  - **The press does not lift the message.** The lift is Pressable's own long press (500 ms), on a
    timer the paused clock runs, so it should. If not, a touch through Chrome's own input (CDP's
    `Input.dispatchTouchEvent`), held over the same frames.
  - **The scroll jumps.** The browser may animate a wheel step on its own clock. Then the page's
    scroll position is set a step a frame from the shooter, which can't jump.
- Done when both chapters render, pass the jump check, and look right on a contact sheet. Nothing
  lands on main from RA1 unless RA2 follows.
- **Built, 24 October 2026.** Both worked the first time, with nothing in place of either:
  - **The press.** Playwright's mouse down on the reply, held 600 ms of the page's clock, then up.
    Pressable's long press runs on that clock, so "Sent to 11…" lifts with its capsule and menu
    about 500 ms in. What the run did then opens its sheet once the menu has gone down, as on the
    phone.
  - **The scroll.** The scroller's position set each frame by the time played, eased in and out
    over 800 ms: 40 frames that each move a little, no jump.
  - **Found: a real Move opens the room it went to.** The room picker's own pick ends in
    `opened(spaceId)`, so after Tax receipts the app goes to that room, where "Milo moved here from
    Birthday dinner" stands. The film no longer goes back to the top of Milo's page. Move's scroll
    is now at the start of the chapter: the page scrolled down to Move, as a person would. Fork
    does the same, into the copy's new room, which the director's `forked` used to do by hand.
  - **Found: the jump check misread small numbers.** ffmpeg prints a still frame's difference as
    `6.9437e-05`; the pattern `[\d.]+` stopped at the `e` and read 6.94, a lone jump. Fixed in
    `film.mjs` and `compose.mjs`. It flagged two still frames of Cost.

### RA2 · The render acts, and the app stops directing

- `tools/film/acts.json` for the 12 chapters; the shooter reads it and FV5's `taps` go.
- The script loses `show`, `sheet`, `about`, `picker`, `focus`, `form` and `composer`. Its
  chapters keep their opening place (screen, room, agent, file) and the agents' side.
- The player plays the agents' side only. When an act's moment comes in the render mode and the
  server has not heard it, the page marks it (`data-film-missed`) and the shot fails with its name.
- Both directors go. The render-mode stage takes the app to the chapter's opening place once, by
  the app's own routes, as the director's first move does today.
- `films.json` records `acts.json`'s hash beside the script's and the beats file's.
- All three films rendered again, and each step looked at on a contact sheet beside today's film.
- Checked by `pnpm check`, and e2e `the-demo`, `the-short-films`, `demo` and `demoFilms`.
- **Built, 24 October 2026.**
  - `acts.json` has 38 steps over the 12 chapters. Two kinds came in that the plan did not
    have: a step's control by what it is called (`{ label }`: a sheet's ✕, an effort's bar), and
    `type` filled a key at a time, as Search's words already were. No `back` was needed: the editor
    goes back by itself once saved.
  - A tap or a press on a control off the screen fails the shot, as a missing control does: a
    person can't press what they can't see. A scroll finds which way its list runs.
  - The player keeps where each chapter opens, the lock screen picture and the agents' side.
    `revision` went with the directions: what the person changes, the screen that changed it reads
    back itself. The core tests play the films with a person of their own, who does each act a
    moment before its beat through the store, as the render does on the controls.
  - The phone's stage opens each chapter's place once, as it starts; the lock screen's is the room
    under it. The web's opens nothing: the Mac is shot on Spaces alone, where the shell opens.
  - The four direction types the screens' hooks still read moved out of the script into
    `demo/directed.ts`, so RA3 deletes them without changing the script the films are hashed from.
  - **What acting as a person changed in the films:**
    - Cost: the reply is seen pressed and lifted, and What the run did opens from its menu.
    - Not right?: the room is scrolled up to Milo's table before it is pressed, and back down after
      Send, where Milo's second try arrives. The director lifted a message off the screen.
    - Instructions: the new line is typed, and the editor goes back by itself once saved.
    - Fork and Move: each ends in the room the agent went to, opened by the picker itself.
    - Lock screen: the room stands under the picture, not Spaces.
  - **What it found in the app:**
    - The lock screen picture's wall was square: an `<svg>` keeps its viewBox's shape against a top
      and a bottom, so the lower half of the screen showed the app (in today's film, Spaces' tab
      bar and +). It is sized to the screen now.
    - The room picker went down titled as a move after a fork, listing the copy's new room, and
      after a move listed the room the agent had left: once closed its mode was gone and the pick
      had changed the rooms. It keeps what it showed while it goes down.
    - A fork's new room opens a frame before the phone has it: one frame of "This space is not on
      this phone" before the room. Left as it is, as a finding: one frame, inside the push.

### RA3 · The screens' hooks go

- Phone: `ui/asked.ts`, the registries fed from it (`agentPage.ts`, `roomSheets.ts`,
  `lineAsks.ts`, `owner.ts`'s `fileWords`) and their hooks in the agent page, `AgentCard`,
  `ModelGroup`, `ContextEditor`, `useEditor`, `Line`, `LinePages` and `RoomSpend`.
- Web: `directing.ts` and its hooks in `Agents`, `Feedback`, `Harnesses`, `SpaceView`,
  `ModelGroup`, `RoomSheet` and `WindowGroup`, and the `directed` prop through `App` and `Shell`.
- The tests of what goes, go with it.
- No render: the script does not change.
- Checked by `pnpm check`, and the e2e of each screen touched (phone `room`, `agent-model`,
  `agent-context`, `hiddenRoom`; web `feedback`, `newSpace`, `room-agents`, `deleting`).
- **Built, 24 October 2026.** As planned, and a little more that only the film used:
  - Phone: `ui/asked.ts`, `agentPage.ts`, `lineAsks.ts`, `roomSheets.ts` (its `RoomPage` type
    moved to `RoomSheet.tsx`, whose pages they are) and `owner.ts`'s `fileWords`; the hooks in
    `AgentCard` (the part brought into view, and the views measured for it), `ModelGroup`,
    `WindowGroup`, `ContextEditor`, `useEditor` (its saved-elsewhere read, there for the film's
    own saves), `Line`, `LinePages`, `RoomSpend`, `RoomHead` and the agent route's reads again.
  - Web: `director.ts` and `directing.ts` (its scroll-into-view helper had no other user); their
    hooks in `Agents`, `Feedback`, `Harnesses`, `SpaceView` (the receipt opened by the film, the
    room's sheet put away from outside, the field filled), `ModelGroup`, `RoomSheet`, `Settings`,
    `WindowGroup` and the context editor and reads; `directed` through `App` and `Shell`.
  - Core: the four direction types RA2 left in `demo/directed.ts`.
  - RA2 and RA3 together, in the apps, core and the render: 2,647 lines gone and 912 in, the
    tests and `acts.json` among them.

### What it costs

About a day: RA1 an hour or two, RA2 most of the rest (the steps, and two or three renders of
about 35 minutes), RA3 an hour or two. Roughly 1,200 lines of app and core code and 850 lines of
tests go, and about 250 lines come in (the shooter's steps, `acts.json`, the missed-act mark).

## Risks

- **A stale film.** The hash test catches a changed script or beats file. A changed filmed screen
  is caught only by watching, so each release's walk watches the film.
- **The web build is not the phone.** No glass, no blur. After Approve, the web build's room
  scrolls back up as the card goes, and the film shows it. FV6 checks what the phone does. If the
  phone stays at the end, the web build's list gets the fix before the film is rendered again.
- **Autoplay.** Browsers play a muted video started by a click. The film has no sound, and Watch
  is always a click.
- **ffmpeg** is not in the repository. `pnpm film` needs it on the machine that renders, which is
  his Mac. The players need nothing new: `expo-video` is in the app, and every client plays H.264.

## Found while filming

- **Search quotes a table's raw Markdown.** A result for a message with a table reads
  `| Per head | Rating | |---|`. The menus and pins use `plainWords`; search snippets don't. The
  film searches "card" to keep clear of it. The fix is its own.

## Left for later

- A render source on the iOS simulator, so the phone's shots show Liquid Glass and blur.
- A light film, and a landscape cut for the Mac and the iPad.
- Main in the demo workspace (beat 3), and a member added (beat 7).
- The same file on chipschat.ai and as an App Store preview. Publishing is his call, and an App
  Store preview has size and content rules to check first.
