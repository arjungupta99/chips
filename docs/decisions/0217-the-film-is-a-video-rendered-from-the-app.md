# 0217. The film is a video rendered from the app, and each client plays it

Date: 21 October 2026
Status: Accepted, 21 October 2026, on Arjun's "Proceed", after his "Put the film in the app in place
of the live film. Write the plan and ADR first." Built to the [film as video plan](../proposals/film-as-video.md).
Changes ADR 0213's film (points 2, 3, 5 and 8); its demo workspace, its words rule, Look around and
the first screen stand.

## Context

ADR 0213's film plays live: the app's own screens, driven by the demo's script, step back onto a
stage while the store plays the chapters. It was walked on a simulator and the Mac on 21 October
(WC-1 to WC-9). Arjun, the same day: "This demo video does not look polished. We need some other
reliable way to produce smoother motion and video."

A live film can't promise smooth. It runs the real layout, springs and scrolling of a scaled app,
so how it looks depends on the device and the moment, and an older phone drops frames.

Before the film, the moats were agreed (his "1. Agree"):

- **Hard to copy:** Chips runs on your computer; it works with several harnesses over an open
  protocol; people and agents share a room.
- **Real but buildable by others:** agent controls (model, context, compaction, fork), spaces and
  the Main agent, search, members, and harnesses supported out of the box.

The film's order follows the moats. Then he asked for a sample of one beat, rendered frame by frame
("2. Yes do it"). On the sample he said "Your video looks good". The whole film followed: 52
seconds, 1080×1920, 60 fps, made in a scratch folder:

- **Capture:** Playwright drives the phone's web build and the web build, each playing the demo's
  chapters. The page's clock is a fake one, stepped a sixtieth of a second per frame, with every
  animation set to the same clock, and each frame is a screenshot. Nothing can drop.
- **Composition:** a second pass lays each frame into a phone (and, for one beat, a Mac window),
  with the beat's words and a slow camera.
- **Arrivals:** the web build shows a new message in a single frame. The composer moves the list on
  a spring and fades in only the rows that changed.
- **Check:** every frame is compared with its neighbours, and no single-frame jump is left.

## Decision

1. **The film is a video**, rendered as above from the app's own screens playing the demo's script,
   and encoded once: H.264, 1080×1920, 60 fps. It plays the same on every device, with no sound.
2. **Seven beats, in the moat order**, and an end card:

   | # | Beat | What it shows |
   |---|---|---|
   | 1 | Your computer | Chips for Mac with an agent working, the phone in front of it |
   | 2 | Harnesses | the Agents tab: three harnesses and their agents together |
   | 3 | Spaces | every job in its own room, a face lit while its agent works |
   | 4 | Teamwork | Rosa, Milo and Theo in one room; Milo asks Theo for a card |
   | 5 | You decide | Milo asks before paying the deposit; approved, then a lock-screen answer |
   | 6 | Controls | Milo's model and effort changed; his context compacted |
   | 7 | Search | one search finds what was said, across the workspace |

   The words keep ADR 0213's rule: they say what a person can do and what the app shows, and promise
   nothing an agent does. They live in one file with the beats, beside the render.
3. **Each client plays it with its own player.** The phone uses `expo-video`, which already plays a
   room's videos (ADR 0163). The web and the Mac use a `<video>`. Around it, Chips' own chrome:
   - the green chapter bar, one segment per beat, filled from the video's time; a tap on a segment
     goes to that beat;
   - a tap on the film pauses and plays it;
   - Leave (✕).
4. **No Your turn.** The film shows Send and Approve being tapped. A real tap belongs in Look
   around, where the controls are real. The ring and the five-second wait go.
5. **The end card stays the app's own**, after the video: Set up my own Chips, I have an invite,
   Look around, Watch again, and More to see.
6. **The two short films become videos too**, rendered the same way and played by the same player:
   *Your agents, up close* and *Costs and trouble*. Both stay under More to see.
7. **The demo engine stays.** Core's workspace, script, player and server answers, and each
   client's director, do two jobs:
   - **Look around:** they build the made-up workspace at the film's end, as today (ADR 0213, point 7).
   - **The film's source:** a render mode, which only the build `pnpm film` makes, plays a chapter
     full size with no stage, and the render captures it. No screen in the app leads there.
8. **The stage goes from the clients**: the scaled root, the caption under it, the ring, and the
   frames that drew sheets and dialogs inside the stage (`ui/stageFrame.tsx`, `layer.tsx`).
9. **Accessibility.**
   - The words are in the picture, so the player labels the film with the current beat's words for
     VoiceOver, and names each segment of the bar.
   - The film plays as rendered, because it starts only on the person's tap. Reduce Motion changes
     the chrome (no jump on a finished segment, no spring on the end card).
   - The player is dark in both appearances, as a video player is.
10. **The files live in the repository.**
    - `tools/film/`: the render.
    - `assets/film/`: the videos, plus `films.json` listing each film's beats with their times and
      words. The phone imports them through Metro, which already watches the repository's root.
      The web imports them through Vite.
    - `films.json` records a hash of the script and of the beats file it was rendered from. A test
      fails when either changes and the films were not rendered again.

## Consequences

- **Smooth on every device**, and one file can also serve the website and an App Store preview.
  Publishing either is his call.
- **The film shows the app as of its render.**
  - A change to a screen the film shows leaves the film behind until `pnpm film` runs: about ten
    minutes on his Mac, measured 21 October, plus a look.
  - The hash test catches a changed script or beats file. A change elsewhere in a filmed screen is
    caught only by watching, so each release's walk watches the film.
- **Size.** The first film is about 5.5 MB at the quality chosen. That was measured: H.264 at CRF 26
  matched CRF 16 by eye, and CRF 16 was 15.5 MB. The short films (about 50 and 40 seconds) are estimated at 4 to 5 MB each. Each
  new render adds its files to git history.
- **What it gives up:**
  - the person's own taps inside the film;
  - a light-mode film;
  - a landscape or iPad cut (the portrait film is letterboxed there);
  - Liquid Glass and blur, since the phone's shots come from its web build. A render source on the
    iOS simulator is left for later.
- **The live film's e2e specs change**: `the-demo.spec.ts`, `the-short-films.spec.ts`, and the
  phone's `demo.spec.ts` and `demoFilms.spec.ts`. They check the player plays, the bar goes to a
  beat, the end card's ways on, and still that no request leaves the page.
- **Main is not in beat 3**: the demo workspace has none. Adding it changes the script, and then
  the film is rendered again.
- **Adding and removing a member is not filmed.** The room sheet at the end of Teamwork shows who
  is in the room, with Add.
- **App Review:** Look around still offers a working made-up workspace, so ADR 0213's question
  about a demo mode in place of the demo account is unchanged.

## Addendum, 21 October 2026: the render acts as a person does

Status: Accepted, 24 October 2026, on Arjun's "Accept the addendum and build RA1 to RA3 as planned,
RA1's long press and scroll first." Proposed 21 October, on his "After FV5 lands, write an ADR 0217
addendum and a plan for the render driving the app by clicks, so the director and the screens'
hooks can go. Show me before building." Plan: [the film as video, RA1 to RA3](../proposals/film-as-video.md#the-render-acts-as-a-person-does-ra1-to-ra3).
Built 24 October 2026, all three phases, with the three films rendered again.

### Context

After FV5 the live film's stage is gone, but the render still directs the app from the inside.
Point 7 kept the demo engine for Look around and as the film's source. The film's source is the
part with a cost:

- The script says what the person does on screen as names: the screen, the sheet open over it,
  the message it is about, what a form holds, the part of a page in view, the composer's words.
- A director on each client turns those names into routes and asks: `DemoDirector` and `film.ts`
  on the phone, `director.ts` and `directing.ts` on the web.
- The screens take the asks through hooks: `ui/asked.ts`'s registries in 12 phone files, and
  `directing.ts`'s in 7 web screens, the shell and `App`. They open their own sheets, fill their own
  fields and scroll themselves when asked, and read again when told.

Nobody but the render ever reaches those hooks, yet they live in the app's real screens. Each
change to one of those screens has to keep its hook working. Arjun, 21 October: "so it appears we
created a lot of logic to make the live demo... do we still need all of that?"

### Decision

1. **The render acts as a person does.** What the person does in a chapter is a list of steps by
   chapter time, kept with the render (`tools/film/acts.json`):
   - **tap** a control;
   - **press** and hold one (lifting a message);
   - **type** words into a field, a key at a time;
   - **scroll** a part of a page into view, over a number of frames;
   - **back**.

   Each step finds the app's own control by its test ID, or by the words on it. Playwright does
   them on the paused clock, frame by frame, as it already presses Approve, Save and Send (FV5's
   `taps`, which this replaces). A step that finds nothing fails the shot.
2. **The script keeps the agents' side and where each chapter opens.** What the agents say and do
   (`play`, `ifDenied`, `presence`), the lock screen picture (`lockScreen`), and each chapter's
   opening place stay in the script. What You does (`act`) stays too, for two uses only: the server
   plays it when a demo starts part-way or played whole (Look around), and the render mode checks
   it was done. The player never does it.
3. **A missed act fails the shot.** When an act's moment comes in the render mode and the server
   has not heard the person do it, the page marks it, and the shooter stops with the act's name.
   The script and `acts.json` can't drift apart without a render failing.
4. **Gone from the app:**
   - both directors;
   - `ui/asked.ts` and every registry and hook that feeds from it on the phone;
   - `directing.ts`'s hooks on the web, and the `directed` prop through the shell;
   - the script's direction fields (`show`, `sheet`, `about`, `picker`, `focus`, `form`,
     `composer`), the player's view of them, and `revision`.
5. **Stays in the app:**
   - the demo's server and the script's events, which Look around and the render both need;
   - the render-mode stage: it opens the chapter's place once, draws the lock screen picture and
     marks the chapter;
   - `LockPicture`, a picture rather than a screen;
   - the players and the end card.

### Consequences

- **No screen carries code for the film.** What stays of the demo in the app is what Look around
  needs: the server's seams in the store, Not in the demo, and the Demo tag.
- **The films change a little.** The composer's words are typed, not put in whole. A message is
  seen being pressed and held. Scrolls are the render's own, at a steady speed.
- **A moved or renamed control breaks the render**, loudly, rather than leaving a hook that quietly
  does nothing.
- **Two files say when You acts**: the script, for the server, and `acts.json`, for the render.
  Point 3 holds them together.
- **Cost:** about 40 steps across the 12 chapters that are shot, written once. All three films rendered again and
  checked frame by frame, at about 35 minutes a render. Roughly 1,200 lines of app and core code
  and 850 of tests go; about 250 lines come in.
- **Risks, tried first:** a long press under the paused clock, and a smooth scroll in the phone's
  web build. If either fails, the plan says what takes its place before anything is deleted.

## Addendum, 21 October 2026: sharper, and a little slower

Status: Accepted, 21 October 2026, on Arjun's word about the website's clips, which are cut from
the films: "super blurry, low rez", "We need crisper film", and "please also slightly slow down on
the actions, videos feel bit too fast".
Built 21 October on the website's branch (`538c2b00`), and brought onto main on 25 October 2026,
after the render acts as a person does (`25ef1d18`), on his "Yes, rebase 538c2b00 (the sharper,
slower films) onto main and render all three films again." The films were rendered again then
(`2e418939`): 62.1 s, 47.5 s and 37.9 s.

### Context

- **Soft text.** The phone was shot at two pixels a point, 786 pixels wide. The scene was drawn at
  one pixel a point, with the phone's screen about 613 wide, and the camera's lean enlarged it again.
  So every line of text was resampled twice before the encode, and a clip shown larger than the
  film, as the website shows them, enlarged it a third time.
- **The encode was not the cause.** CRF 26 already matched CRF 16 by eye (Consequences, Size).
- **Too fast.** The film plays the app at its own speed. A tap, the sheet it opens and the reply
  that arrives follow each other faster than someone seeing them for the first time can follow.

### Decision

1. **The phone is shot at three pixels a point** (`PHONE_SCALE` in `shoot.mjs`), as an iPhone
   draws: 1,179 by 2,556. The Mac's window stays at two.
2. **The scene is drawn at twice its size** (`SCENE_SCALE` in `compose.mjs`): 2,160 by 3,840. So
   the phone's screen and the camera's lean are resampled at four times the pixels the film keeps.
   The encode scales it down to 1,080 by 1,920 with Lanczos. The film's size, frame rate and CRF
   stay as they are.
3. **The app plays at five-sixths of its speed** (`PACE` in `shoot.mjs`). Each frame moves the
   page's clock 1/72 of a second, not 1/60. The film still has 60 frames a second, so nothing
   stutters, and everything the app does takes a fifth longer.
   - **The page's animation frames come once a frame**, at its end. Playwright's clock gives one
     every 16 milliseconds of the page's time, which suited a 16.7 millisecond step. At 13.9, one
     frame in six had none, so whatever the app moves by script (a sheet's spring) stood still for a
     frame and caught up in the next. The shooter tells the page's clock where each frame ends.
   - The beat files keep their times in chapter milliseconds, so they stay as they are, with one
     change: You decide's first shot ends at 4,550, not 4,600. At the slower pace its last frames
     caught Milo's next "Thinking" arriving, and the jump check failed the render.
4. **ffmpeg's measure is read whole** (`meanDiffs` in `motion.mjs`). A frame almost the same as the
   one before prints its mean difference in exponent form, `1.89147e-05`. The composer and the jump
   check read only the digits before the `e`, so a face's glow 30 pixels wide counted as a change of
   1.89. The composer then started a dissolve there, and a real dissolve already under way snapped
   to its end. It was so before, more rarely. At three pixels a point the costs film's busiest shot
   counted 95 changes, against 2 read whole, and the check failed on three snaps it made.
5. **The website's clips are cut from the composed frames**, which are lossless at 2,160 wide, not
   from the encoded film, so they are compressed only once. The cutting lives with the website, in
   its own repository (`chips-website`, `mocks/cut.sh`), and reads the frames `pnpm film` keeps.

### Consequences

- **The films are a fifth longer**, measured 21 October:

  | Film | Length | Size |
  |---|---|---|
  | The film | 62.1 s (was 52.4) | 5.3 MB (was 5.4) |
  | Costs and trouble | 37.9 s (was 32.1) | 3.0 MB (was 3.0) |
  | Your agents, up close | 47.1 s (was 39.8) | 3.9 MB (was 3.8) |

  The sizes barely move.
- **A render takes longer:** about 25 minutes for the film on his Mac, against ten before. Most of
  it is the composer drawing 2,160 by 3,840 frames. With all three films rendering at once, each
  took 21 to 32 minutes.
- **The temporary folder holds more:** about 3 GB for the film while it renders (its shots 0.7 GB,
  its frames 2.3 GB), which `--again` reuses, and about 7 GB for all three.
- **In the app the gain is modest:** the screen shows 1,080 pixels either way, and what improves is
  the edges of text. Where the frames are seen larger, as on the website, the gain is large. A
  1,440 by 2,560 encode of the same frames would be sharper in the app too, at 7.2 MB for the film
  (1.4 times the size). That is left to Arjun.

## Addendum, 25 October 2026: Look around opens the first film's end

Status: Accepted, 25 October 2026, on Arjun's "Yes: make Look around open the demo as the main film
leaves it, after any film".

Point 7 says Look around builds the made-up workspace "at the film's end". Each end card's Look
around built it at its own film's end, so after Costs and trouble the demo opened with Herald
offline and Hugo unable to answer, which reads as broken to somebody looking around for the first
time; a relaunch built it at the first film's end anyway. Now Look around builds the demo as
Watch Chips work leaves it, from any film's end card, on the phone, the web and the Mac, as a
relaunch does. A demo already kept stays as it was. The render mode is unchanged: it builds the
demo at its own chapter before it looks around.

## Addendum, 26 October 2026: the first screen plays the film

Status: Accepted, 26 October 2026, on Arjun's "Build it as the mock now shows. Write the ADR 0217
addendum first." It follows his ask of 25 October: "the onboarding experience on a newly installed
app does not feel great", with the top animation removed, the Chips logo at the top, Watch Chips
work playing under it, taps on the right and left of the film, and a Skip to That's Chips. He asked
for mocks first. On the mock he asked for a brighter Skip and a way to scan a QR code. He renamed
More to see, asked for better play buttons with no thumbnails, made Scan a QR code That's Chips'
gold button, and added a row for a pairing code under the one for an invite link. Changes ADR 0213's
point 9 (the first screen), and this ADR's point 3, where a tap on the film paused it.

### Context

- **The first screen opened on a loop** of a space at work, nine seconds of plain animation, which
  he found confusing. The film itself was a button away.
- **That's Chips came only after the last frame.** There was no way to the ways in from the film but
  watching it all, or leaving it.
- **Scanning was hard to find.** On 25 October his wife reinstalled Chips and had to scan a new-phone
  code from his People page. "Scan a QR code" was on the ways-in page, under Somebody invited you,
  behind Set up my own Chips.
- **The ways-in page repeated the rest.** With a camera, Paste and Chips on this Wi-Fi on the first
  screen, the one thing left only on that page was typing a pairing code.

### Decision

1. **The first screen is the film.** At the top, in the middle, the Chips mark and its name. The
   mark's pins light once as the screen opens, and stay still with Reduce Motion. Under them, Watch
   Chips work and its length, then the film, playing at once with no sound, in a rounded frame as
   tall as the screen allows. The loop and "Chat with your AI agents" go.
2. **A tap on the film moves through its parts**, as a story does. This holds on the first screen
   and in the full-screen player:
   - **the right two-thirds:** the next part, and on the last part, That's Chips;
   - **the left third:** this part from its start, or the part before when this one began less
     than 2 seconds ago, so a second tap goes back one;
   - **a finger held:** the film waits until it lifts;
   - **a segment of the bar:** that part, as before.

   The side tapped flashes, without motion under Reduce Motion. For VoiceOver the film is adjustable:
   swipe up for the next part, down for this part again, and double-tap to pause. Where a tap lands
   is core's (`nextPartAt`, `backPartAt`), so the three clients agree. On the web and the Mac, → and
   ← do what the taps do, and Pause stays at the window's top right.
3. **Skip**, gold, at the bottom right, goes to That's Chips at once, as the film's end does.
   **Scan a QR code** stands opposite it.
4. **Scan a QR code opens the camera** in a sheet over the page, with the film waiting under it. It
   reads what the ways-in page's camera read, through the same `invites.scanned` and `pair`: an
   invite, a computer's pairing code, or a new phone's code from People (ADR 0206).
5. **That's Chips takes the film's place** on the first screen, with the mark at the top standing
   for its own. In the full-screen player it stands over the film's end, as before. It holds:
   - a gold **Scan a QR code**;
   - **Have an invite link?** with iOS's own Paste, which asks no "Allow Paste?";
   - **Have a pairing code?** with **Type**, which opens the pairing code page: where a computer
     shows its code, the code and address fields, and Pair;
   - **More walkthroughs**, which was More to see: each film a row behind a round play button,
     with its length at the end;
   - **Look around** and **Watch again**, with a replay mark.

   The first screen's foot empties there.
6. **On the phone, Set up my own Chips and the ways-in page go.** What was on that page and on
   nothing else, the typed code, is the pairing code page. A pairing link that did not work opens
   that page, saying what went wrong. Chips found on this Wi-Fi (ADR 0172) still comes up from the
   first screen's foot, and the film gets smaller to make room.
7. **A film's length reads as a video player shows it** (`lengthWords` in core): 1:14 for Watch Chips
   work, where it said 1 min.
8. **The web and the Mac follow** with the same first screen, taps, hold and Skip, and the same
   More walkthroughs. A computer has no camera to point at a code, so Paste an invite link stands
   opposite Skip, and That's Chips keeps a gold Set up my own Chips and I have an invite. Their
   ways in stay as they are.

### Consequences

- **Nothing is rendered again,** and the server is unchanged.
- **Somebody with an invite** taps Skip, then Paste. A link opened from the message still opens its
  join card with no tap at all.
- **The first screen holds the film at once:** from the app's bundle on the phone, and fetched
  whole (6 MB) on the web and the Mac when their first screen opens.
- **A tap no longer pauses the film.** Holding does. The tests and the scenario's steps for the
  player (`watch-chips-work.md`) change with it.

## Addendum, 28 October 2026: a Mac shot is held to the jump check

The site's clip of the Mac (the teamwork chapter, shot in the web build) jumped four times: the web's
room moved a row at a time, and opened at the top of its history. The film never said so, because
its check runs on the composed film, where the Mac's window is small and behind the phone. Now
`film.mjs` checks each Mac shot's own frames with `loneJumps` before composing, and a shot with a
frame that jumps fails the render, naming the frames. `pnpm --filter @chipschat/film jumps` runs the
same check over any clip or folder of frames. The room's motion itself is
[ADR 0242](0242-the-room-moves-on-the-web-and-the-mac-as-it-does-on-the-phone.md).
