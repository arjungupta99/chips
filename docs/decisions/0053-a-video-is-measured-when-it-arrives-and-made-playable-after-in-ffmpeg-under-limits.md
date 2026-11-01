# 53. A video is measured when it arrives, and made playable after, in ffmpeg under limits

Date: 13 September 2026 · Status: accepted

## Context

M4.4's line asks for *a resumable video upload with server-side transcode and poster*. The
resumable half is ADR 0052. What arrives is whatever the phone recorded. From an iPhone that is
HEVC in a QuickTime file, often 4K, with its index at the end. The phone plays it. A browser on
Linux or Windows, Firefox, and an Android phone may not. A room shows the video as a row with a
film mark and a size, because nothing on the server knows how long it is, how big it is or what
its first frame looks like.

Doing that means decoding a file somebody sent, which is the riskiest thing the server does.
The Gate 4 review names it: *media pipeline isolation (transcoding runs in a separate process
with limits)*. ffmpeg is the tool that reads every container and codec a phone produces. It is
large, written in C, and has a long record of CVEs in its demuxers and decoders. It must not run
inside the server's process, and it must not be able to run for ever, fill the disk, or reach
the network.

Two costs pull apart. Measuring a video and grabbing one frame takes well under a second.
Re-encoding two minutes of 4K HEVC takes tens of seconds even on a Mac mini, which is far
longer than a request should wait.

## Decision

1. **ffmpeg runs as a child process, one run per step, under limits.** It is spawned with no
   shell, an environment of `PATH` alone, and no stdin. It reads a file from a private temporary
   directory made for that run (`0700`) and writes back into the same directory, which is
   deleted afterwards. Its limits:
   - `-protocol_whitelist file`, so a file that names a URL reaches nothing. ffmpeg already
     refuses a local playlist whose pieces are on another protocol; this is the second lock, for
     whatever does not.
   - A wall-clock timeout, after which the whole process is killed with `SIGKILL`: ten seconds
     to measure, fifteen for the poster, and for the transcode four times the video's length,
     at least a minute and at most fifteen.
   - `-fs` at the server's attachment ceiling, so output cannot outgrow what an upload could.
   - `-threads 2`, at a lower scheduling priority than the server.
   - A video longer than twenty minutes is kept as it came and not transcoded.
   - What it prints on stderr is kept to its last two kilobytes, for the log.

   Memory is not bounded. macOS has no per-process limit that holds, and a container is Phase
   6's. This is written here so that the Gate 4 review does not have to find it.
2. **A video is measured when its last byte arrives, before the upload answers.** `ffprobe`
   reads the duration and the display size, rotation applied. `ffmpeg` takes one frame a second
   in, or the first frame of a shorter clip, and `sharp` makes it the attachment's thumbnail:
   WebP, no larger than a photo's, served at `?variant=thumb` as a photo's is. The duration,
   width and height go into the uploads row. A message that attaches the video therefore carries
   `duration_ms`, `width` and `height`, fields the protocol's attachment has had since M1.5 and
   that nothing has filled until now. If measuring fails or times out, the upload still
   succeeds, as a video with no poster and no duration.
3. **Making it playable happens after, one video at a time.** A measured video is marked
   `pending`. A worker in the gateway takes the oldest pending video whenever an upload queues
   one, at start, and on the sweep's timer. It does one of three things:
   - `skipped`: already H.264, with AAC or no sound, in an MP4, at most 1920 pixels on its
     longer side. Nothing to do.
   - A remux: the same codecs in another container. The streams are copied into an MP4 with its
     index at the front.
   - A transcode: anything else becomes H.264 High, no longer than 1920 pixels on its longer
     side, CRF 23 at `veryfast`, `yuv420p`, AAC at 128 kb/s, index at the front.

   The result is kept once by its SHA-256 beside the original, and the row records it as
   `done`. A run that fails or times out is marked `failed`, with ffmpeg's last words, and is
   not tried again. A server that stops mid-run leaves the video `pending`, and it is tried at
   the next start. The original is never replaced: the message that carries it names its digest
   and its size.
4. **A client plays `?variant=play` and gets the best there is.** That is the playable copy once
   it is done, and the original until then or if there never is one. So nothing has to tell a
   client that the transcode finished, and no event is added. A phone that fetched the original
   a minute early keeps playing that. Recorded video — MP4, QuickTime, WebM — is served inline
   with its own type, as photos and PDFs are, because a player picks its engine by the type and
   WebKit will not play what calls itself `application/octet-stream`. None of them is markup;
   `nosniff` and the sandboxing CSP stay on every response.
5. **A client asks for a video's poster only when the video was measured.** An attachment with
   `duration_ms` came through step 2, which makes the poster in the same run. One without it
   predates this decision or was not measured, and asking would only get a `404`. It stays the
   row it is today. A measured video whose poster failed still answers `404`, and its tile is
   drawn with no picture: the play mark and the length on a plain ground.
6. **ffmpeg is found, not required.** The server looks for `ffmpeg` and `ffprobe` on its `PATH`,
   then in `/opt/homebrew/bin` and `/usr/local/bin`. `CHIPS_FFMPEG` and `CHIPS_FFPROBE` name them
   outright. A launch agent's `PATH` is short, which is why the fallback exists. Without them a
   video is kept as it came, as before this decision, and the server's log says so at start.

## Consequences

- The upload that finishes a video takes a little longer to answer: 356 ms to measure a
  two-minute 4K HEVC clip of 174 MB and take its frame, on the M4 Mac mini this was written on.
  A file that makes ffprobe and ffmpeg run into both timeouts holds the answer twenty-five
  seconds.
- A two-minute iPhone video plays in any browser once its copy is made. The same 4K clip became
  1080p H.264 in 24 seconds on two threads there. That clip is a test pattern, which encodes
  easily; real footage takes longer. Until the copy is made, a browser that cannot play HEVC
  shows the poster and says so when Play fails.
- The playable copy is a second file of up to the ceiling's size. The original is kept because a
  message names it, and a harness that asks for the file gets what was sent.
- ffmpeg is a system dependency, like the Rust toolchain for the desktop app, not an npm package.
  The tests that run the real binary are skipped where it is missing, except on CI, which
  installs it and fails if it is not there.
- The worker is in the server's process and spends its time waiting on a child. Moving it to a
  process of its own, or to Phase 6's queue, is a move of the port's adapter and not a change to
  the rules.

## Addendum, 13 September 2026: the kept original has no location

As first written, this decision kept a video's bytes exactly as they were sent. A photo has lost
its metadata since decision 10, unless its uploader kept it. A video is no different in what it
gives away. An iPhone writes where a video was taken into QuickTime's metadata
(`com.apple.quicktime.location.ISO6709`), and an Android phone writes a `©xyz` box. A camera can
also write where it was, frame by frame, into a track of its own. The playable copy dropped all
of that. The original did not, and the original is what `GET /v1/attachments/:id` and a
harness's grant serve.

1. **Unless the uploader kept its metadata, a video is written again before its digest is
   taken.** This happens after it is measured, in the upload's own request, and in a run like
   every other one here: a child process, the file protocol only, a private directory, `-fs` at
   the ceiling, and `SIGKILL` at a timeout. Nothing is encoded:
   `-map 0:v:0 -map 0:a:0? -map_metadata -1 -map_chapters -1 -c copy -fflags +bitexact`. The
   file goes back into the container it came in. QuickTime stays `mov` and MP4 stays `mp4`, both
   with the index at the front. WebM stays `webm`; a Matroska file holding codecs WebM does not
   allow is refused by that muxer and written as `matroska`. The time is the disk's: 75 MB took
   0.2 s on this Mac mini. The timeout is ten seconds, plus a second for every hundred megabytes.
2. **What is kept, and what goes.** The first picture and the first sound are kept, copied with
   their codec tags. An iPhone's `hvc1` is one of those, and Safari will not play HEVC without
   it. The display matrix is kept too: to ffmpeg, rotation is not metadata. Everything else goes:
   - the file's and the streams' metadata: the location, the make and model, and the creation
     time;
   - the chapters;
   - every other track, whatever it carries. A second sound track, such as another language, goes
     with the rest. That is the price of a rule that needs no list of which tracks are safe to
     keep.

   `-fflags +bitexact` keeps ffmpeg from adding its own `encoder` tag, so the file says nothing
   about the server either.
3. **The digest, the size and the row describe the file kept.** From then on, decision 3's
   sentence holds: the original is never replaced. A photo's digest was never that of the bytes
   sent either.
4. **If it cannot be done, the video is kept as it came, and the log says so.** There are three
   cases:
   - ffmpeg is not installed. The server says at start that videos keep their metadata.
   - The video cannot be read.
   - ffmpeg fails to write it again: a codec the container's muxer does not know, the timeout, or
     the ceiling.

   In the last two, the upload still succeeds, and the server logs
   `video kept with its metadata, location included` at `warn`, with the attachment's id and
   ffmpeg's last words. Refusing the upload was the other choice. It was not taken, for three
   reasons. First, almost every failure is a file the server cannot read at all, and a photo
   `sharp` cannot read is also kept as it came. Second, a message that will not send, over a
   helper process, is a failure the person can do nothing about. Third, the answer to the upload
   could not say why in words a person acts on. The log line is there so an operator can see it
   happen.
5. **Sound in a video's box is heard, not written again.** The measure comes first and decides
   whether the bytes are a video at all. A WebM or an MP4 with sound and no picture is sound, as
   ADR 0054 says, and is kept as it came, like every other upload that is neither a photo nor a
   video.

Consequences:

- The upload that finishes a video waits for one more run. For a stream copy, that is a fraction
  of a second at the default ceiling.
- The desktop's box is now *Keep location*, and appears for a video as well as a photo. The phone
  has no box, so a video sent from the phone always loses its location.
- No real iPhone clip has been through it yet. HDR with Dolby Vision, spatial audio, Cinematic
  video and spatial video each put more into the file than a test pattern does. Each could lose,
  in the copy, something the phone would want back. For those, the uploader's `keep_metadata`
  keeps the file as it was sent.
