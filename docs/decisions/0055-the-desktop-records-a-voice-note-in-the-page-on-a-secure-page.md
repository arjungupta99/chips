# 55. The desktop records a voice note in the page, on a secure page

Date: 13 September 2026 · Status: accepted

## Context

ADR 0054 gave the phone a recorder and left the desktop without one. A browser gives a page the
microphone only on a secure address: `https://`, or `localhost`. The desktop page on a tailnet's
plain HTTP is neither. ADR 0054 said recording there would wait for the desktop app's own window.

Two things changed the same day. The live server is now reached at an `https://` name on the
tailnet, through Tailscale Serve. So a browser on any of Arjun's machines has a secure page, and
may ask for the microphone. And the desktop app turned out to be closer than that consequence
assumed. Its window is WebKit, loading the app from its own `tauri://` origin, which is secure.
wry, the webview under Tauri, already grants a page's request for the microphone. What the app
lacked was the sentence macOS shows when an app first asks for the microphone, without which
macOS refuses it.

The desktop is also where a person is most likely to be typing. A voice note there is for
someone away from the keyboard, or talking faster than typing, not something to optimise for.
So it should cost little on screen: a button, not a sheet.

## Decision

1. **The page records with the browser's own `MediaRecorder`.** There is no dependency and no
   native module, and one piece of code serves every browser and the desktop app's window. It
   asks for one channel with echo cancellation and noise suppression, at 96 kb/s. It takes the
   first container this browser writes, of Opus in a WebM, AAC in an MP4, a plain WebM, or Opus
   in an Ogg. Chrome and Firefox write the first, and Safari and the desktop app's WebKit the
   second. The file is named as the phone names one, `voice-note-0913-1142.webm`, and
   `@chipschat/core` now holds that name for both. Everything after is ADR 0054's. The chip uploads
   as a chosen file does and says *uploading and transcribing…*, and the server sniffs the bytes
   and writes down the words before the upload answers. An MP4 of sound alone is `audio/mp4` by
   the rule ADR 0054 already has.
2. **A microphone beside the clip, and one click to start.** The composer grows `onRecord`, and
   the room gives it one wherever the page has a `MediaRecorder`. Pressing it asks for the
   microphone and starts recording at once. A strip above the composer shows the time, *Stop and
   add*, which takes the focus, and *Cancel*, which Escape presses too. It stops by itself at five
   minutes, `LONGEST_VOICE_NOTE_MS`, and keeps what it has. The microphone is let go whenever
   recording ends, including when the strip is closed before the microphone answers. So the
   browser's recording light never outlives the strip. The message can still be typed while a
   note records.
3. **On a page that may not record, the microphone is still offered, and says why.** A plain
   `http://` page has a `MediaRecorder` and no `navigator.mediaDevices`. Hiding the button there
   would leave a person wondering where voice notes went. Pressing it says that a browser records
   only on a secure page, and to open Chips at its `https://` address. A refusal names where to
   allow the microphone: the browser's settings for the site, or, in the desktop app, System
   Settings → Privacy & Security → Microphone.
4. **The desktop app claims the microphone.**
   - `src-tauri/Info.plist` carries `NSMicrophoneUsageDescription`, in the phone's words. Tauri
     embeds it in a development build and merges it into the bundle.
   - `Entitlements.plist` claims `com.apple.security.device.audio-input`, which the hardened
     runtime of a signed build requires.
   - The content policy gains `media-src 'self' blob:`. Its `default-src 'self'` would otherwise
     refuse the object URL a voice note, or a video, plays from.

## Consequences

- A voice note can be sent from any browser on the tailnet, and from the desktop app, with the
  same words in it as one from the phone. In Chromium against a real server and whisper, a
  recorded sentence reached a harness written down, and played back in the room's card.
- A browser tab on the plain address shows a microphone that cannot record. That is on purpose,
  and the sentence it says is the fix.
- The recording is whatever the browser's encoder makes of the room. Echo cancellation and noise
  suppression are asked for, not guaranteed, and whisper hears what is left. The silence check of
  ADR 0054 applies unchanged.
- The desktop app's recording has not been run. That needs a person at the Mac to answer macOS's
  microphone prompt. The signed build's entitlement is unproven until there is an identity to sign
  with. A WebKit MP4 was checked the other way: a fragmented AAC MP4, as Safari records one,
  sniffed as a video, was called sound by ffprobe and was written down word for word.
- Switching rooms mid-recording keeps the strip, as switching keeps the staged chips, and the note
  goes with whichever room is open when it is kept.
- Nothing on the server or the wire changed: this decision is a client and the desktop app's
  permissions. A harness that reads `transcript` gets a desktop voice note's words the same way.

## Addendum, 13 September 2026: the served page's policy, and what Safari records

The first voice notes Arjun recorded on the live server corrected two things.

- **The page `chipsd` serves could not play them.** Its content policy (`routes/web.ts`) had no
  `media-src`, so `default-src 'self'` refused the `blob:` address a voice note or a video plays
  from. Its `object-src 'none'` refused the `blob:` address a PDF's preview is drawn from as well.
  Decision 4 gave the desktop app's policy `media-src`, but not the served page's. The Playwright
  test passed because it loads the page from the Vite dev server, which sends no policy. The
  served page's policy now has `media-src 'self' blob:` and `object-src blob:`. `object-src` still
  allows no plugin and no address but one the page's own script made. A test in `voice.spec.ts`
  loads the page from `chipsd`, plays sound and shows a PDF from `blob:` addresses, and failed on
  both before the change.
- **Safari records WebM.** Both notes were Opus in WebM with `encoder=WebKit`, recorded in Safari.
  So Safari takes the first type in decision 1's list, and does not fall back to an MP4. Whether
  Safari plays back a WebM it recorded has not been seen. The server heard one: whisper wrote it
  down once the model's path was fixed. The claim that Safari and the desktop app's WebKit write
  AAC in an MP4 is withdrawn. The desktop app has still not recorded.
