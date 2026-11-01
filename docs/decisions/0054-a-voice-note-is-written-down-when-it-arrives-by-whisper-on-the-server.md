# 54. A voice note is written down when it arrives, by whisper on the server

Date: 13 September 2026 · Status: accepted

## Context

M4.4's line asks for *voice notes with a transcript (on-device or server-side, decided in an
ADR)*, and its acceptance says *a voice note reaches the agent with audio and text*. The plan's
demo is sending Scout a voice note from the phone, away from home.

A harness reads words. OpenClaw hands its model `{{Transcript}}`; Claude Code and Hermes have no
voice input on every surface. Sound that arrives with no words in it is sound the agent has to
transcribe for itself, if it can. So the words have to travel with the sound, in the same message.

There were two places to write them down.

- **On the phone**, with Apple's Speech framework, through a third-party Expo module. It needs a
  native module of its own and a new development build. It only covers notes recorded on an
  iPhone, not the desktop or a harness. Unless the module asks for on-device recognition, Apple
  hears the audio too.
- **On the server**, with whisper. The Mac mini already runs ffmpeg as a child process under
  limits (ADR 0053), and whisper is one more program under the same rules. Every client gets the
  words, and nobody's voice leaves the machine it was sent to. The cost is a download and some
  seconds of GPU time on the server.

On the Mac mini this was written on (M4, Metal, whisper.cpp 1.9.4 from Homebrew), with
`ggml-large-v3-turbo-q5_0.bin`, a 550 MB model that hears many languages:

- 6 seconds of speech took 1.5 seconds to write down.
- 2 minutes 15 seconds took 9.3 seconds.
- A Hindi sentence came back in Devanagari with its language detected.
- Eight seconds of silence came back as "Thank you."

## Decision

1. **The server writes down what was said, with whisper.cpp.** The model is Arjun's choice:
   `ggml-large-v3-turbo-q5_0.bin`, from the whisper.cpp repository on Hugging Face, checked
   against its SHA-256. The server looks for `whisper-cli` where it looks for ffmpeg, and for a
   model in the data directory's `models` folder, best known first. `CHIPS_WHISPER` and
   `CHIPS_WHISPER_MODEL` name them outright. Like ffmpeg, whisper is found, not required. Without
   it a voice note is kept with its length and no words, and the log says so at start.
2. **Sound is heard when its last byte arrives, before the upload answers.** A message carries
   its attachments as they were when it was posted, and a harness hears a message once. So the
   words must exist before the message does. A transcript made afterwards, as the playable copy
   of a video is, would reach the room and never the agent. The composer already holds Send until
   every upload is in, so a voice note's chip says *uploading and transcribing…* and Send waits
   for the words the way it waits for bytes. Whisper is given half the note's length, at least
   thirty seconds and at most two and a half minutes, and is killed when that is up. One whisper
   runs at a time: two on one GPU each take as long as both. A note that cannot be heard in time
   is kept with its length and no words, and the upload still succeeds.
3. **Whisper never reads the file somebody sent.** ffprobe measures it. ffmpeg decodes its first
   sound to sixteen-kilohertz mono PCM, no more than five minutes and a second of it, under the
   rules of ADR 0053: file protocol only, `-fs`, twenty seconds, `PATH` alone, a private
   directory, lower priority. The adapter writes the plainest WAV header there is around those
   samples, and whisper reads that, in the same private directory, under the same rules. So the
   one parser that meets the untrusted bytes is the one already under limits, and whisper's own
   decoders never run on them. Memory is not bounded: the model is half a gigabyte, loaded for
   each note.
4. **Silence is never handed to whisper.** Given eight seconds of nothing, whisper writes
   "Thank you.", and a harness would read that as the person's words. The server decodes the
   samples anyway, so it checks them first. A note needs a quarter of a second, in twentieths,
   louder than 45 dB below full scale, which is quieter than anyone talking into a phone. Of what
   whisper writes, a segment that only names a sound (`[BLANK_AUDIO]`, `(music)`) is dropped, and
   a transcript with no letter or digit left is no transcript.
5. **A voice note is at most five minutes.** `LONGEST_VOICE_NOTE_MS` is in `@chipschat/protocol`. The
   phone stops recording at it, and the server writes down no sound longer than it: a longer
   recording is a meeting, and would hold an upload for most of a minute. Longer sound is kept,
   with its length.
6. **The protocol's attachment gains `transcript`**: optional, up to 50,000 characters, described
   as machine-heard. It is filled from the uploads row, like `duration_ms`, so `message.post`
   with `upload_ids` carries it. So does `message.new` to a harness, beside the signed URL for the
   sound. Sound is named by its bytes like everything else. An M4A's brand now says `audio/mp4`
   before the `ftyp` rule can call it a video. CAF, FLAC and AAC in ADTS have signatures. A WebM
   or an MP4 in which ffprobe finds sound and no picture is `audio/webm` or `audio/mp4`. Recorded
   sound is served inline with its own type, as video is, because a player will not play
   `application/octet-stream`.
7. **The phone records on the attach sheet.** It uses `expo-audio`: one channel of AAC at 96 kb/s,
   under a megabyte a minute. It is a fourth row on the same sheet rather than a sheet of its own,
   because a sheet going down as another comes up is the dismissal that once took the photo picker
   with it. A room shows a voice note as a round Play, its length, and the words under them. The
   sound is fetched on the first tap. `expo-audio` has a native half that a development build made
   before this decision lacks, and loading it there stops the app. So the row, and playing in
   place, appear only where `requireOptionalNativeModule("ExpoAudio")` finds it. The two files
   that import `expo-audio` are required only then. An older build shows the words and opens the
   sound through the share sheet. The desktop shows the words and plays the sound in the browser's
   own player.

## Consequences

- The upload that finishes a voice note answers late. It takes about a second and a half for a
  short one, and ten seconds for two minutes, on this Mac mini. A second note sent while the
  first is being heard waits its turn. The first run after installing whisper compiles its Metal
  shaders, which took fifteen seconds, once.
- A transcript is machine-heard. In the test the Mac's own voice said "hardware store", and
  whisper wrote "hardware stall". Names, numbers and noisy rooms will be wrong sometimes. The
  field's description says so, and a harness should treat it that way.
- Noise that is loud enough is still handed to whisper, which may write words for it. Whisper's
  own voice activity detection needs a second model, which was not downloaded.
- A voice note's words are not searchable yet: the search index reads a message's `text` and
  nothing in its attachments.
- Any harness gets the words for free: they are a field of the attachment it already receives.
  Scout says back what it heard. Jacobian's adapter lives in its own repository and has to put
  `transcript` in front of its model; that is not done here.
- whisper is a system dependency and a model download, like ffmpeg but larger. CI does not
  install it. The tests that run a whisper which writes down how it was started run wherever
  ffmpeg is, CI included. The test of the real whisper runs where it and a model are installed.
- The desktop records nothing. A browser records only on a secure page, and the desktop page
  served over a tailnet's plain HTTP is not one. Recording there waits for the desktop app's own
  window.
- A server that restarts while it is hearing a note leaves its pieces on disk. The phone's retry
  of the last piece finds them all there and the note is heard again.

## Addendum, 13 September 2026: the desktop records

*The desktop records nothing*, above, is superseded by
[ADR 0055](0055-the-desktop-records-a-voice-note-in-the-page-on-a-secure-page.md). The live server
is reached over HTTPS on the tailnet now, and a browser there records with its own `MediaRecorder`.
The desktop app's window is a secure page already, and claims the microphone in its `Info.plist`.
The server's side of this decision is unchanged.

Jacobian's adapter, in its own repository, was changed the same evening to read `transcript`. The
Space is handed the words, and the placement walk reads them.

## Addendum, 13 September 2026: a voice note's words are searchable

*A voice note's words are not searchable yet*, above, is superseded.

- **A column of its own.** Migration 0021 gives the message index a second column, `heard`, beside
  `text`. The drain fills it from the transcripts in the message's `attachments`, a line apart,
  which are the words as the message was posted. It keeps its own column rather than being added
  to `text`, so a hit can say which it quotes. A person's words written down by whisper, with a
  misheard name in them, should not read as something they typed.
- **Typed words first.** A hit quotes the typed words when they matched. It quotes the transcript
  only when they did not, and then says `snippet_from: "transcript"`. The desktop reads that as
  *said in a voice note in* the room, and the phone as *· voice note* after the room's name.
- **The migration.** FTS5 cannot add a column, so the index is copied into a new one under its
  own name. Its rowids are kept, so the map still points at every row. Only messages whose
  attachments mention a transcript are queued to be indexed again. The live database had none.
- **Edits and deletions.** An edit changes the typed words and leaves the heard ones. A message
  taken back loses both, since its attachments are emptied with its text.
- **Receipts** are unchanged.
