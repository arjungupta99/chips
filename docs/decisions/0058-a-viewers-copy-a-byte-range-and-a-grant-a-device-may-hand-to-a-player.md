# 58. A viewer's copy, a byte range, and a grant a device may hand to a player

Date: 15 September 2026 · Status: accepted

## Context

The media viewer (ADR 0057) climbs from a thumbnail to a bigger picture, and plays a video on its
stage. The server gave it nothing in between and nothing it could stream. There were three
variants: a 512-pixel thumbnail, the file as sent, and a video's copy that plays everywhere
(ADR 0053). A viewer wants a size in between: enough for a phone's screen at three times, small
enough to arrive in a moment.

Every read was a GET signed in headers (ADR 0006), and `serve()` answered with the whole body and
no `Accept-Ranges`. Neither `<img src>`, `<video src>`, AVPlayer nor ExoPlayer can sign a request.
So both clients fetched bytes and made a local file or a blob, and a two-minute clip was on the
phone whole before its first frame. A player cannot seek in a body it cannot ask a run of, and
AVPlayer will not start at all over one.

The one grant that existed (decision 10) is a harness's: a URL in `message.new`, bound to its
token, which the fetch must present too. A player holds nothing to present.

The media viewer proposal's §4.5 set out the answer. Its Phases 2 and 3 left four things for this
decision:

- what a grant names while a video's copy is being made;
- what a cache may keep;
- what a player shows while a stream starts;
- how the three players take it.

## Decision

1. **A copy for a viewer, `?variant=view`.**
   - It is a WebP no longer than 2,048 pixels on its longer side (`attachments.viewEdge`), made by
     the same `images.thumbnail` as the thumbnail. It is never enlarged.
   - It is made at upload for a raster photo and for a video's poster, and recorded in
     `view_sha256` and `view_mime_type` (migration 0022).
   - A photo kept before the migration is given one at its first `GET ?variant=view`: made from the
     file, kept by its digest, and recorded. Only a row with no copy is written, and two first
     requests in one process make it once.
   - A GIF has no copy, because a copy is one still frame. Nor does a photo `sharp` could not read
     when it arrived; its missing thumbnail says which photos those are. Asked for a view, both are
     answered with the photo itself.
   - A video with no poster's copy — one measured before the migration — answers `404`.
   - The answer says which it is in `x-chips-view`: `copy` or `original`.
2. **Byte ranges.** `GET /v1/attachments/:id` serves one run of bytes in a `Range` header:
   - The three forms are `bytes=0-499`, `bytes=500-` and `bytes=-500`. The answer is `206` with
     `Content-Range` and the run's `Content-Length`. Every answer says `Accept-Ranges: bytes`.
   - A run past the end is `416` with `Content-Range: bytes */<size>`.
   - A header the server does not read — several runs, another unit, a last byte before the first
     — gets the whole file, which the standard allows.
   - Every answer carries the digest as its `ETag`. An `If-Range` naming anything else gets the
     whole file.
   - A `HEAD` is answered from the size alone.
   - The parsing is `@chipschat/protocol`'s `byteRange`, so the conformance kit's stand-in answers the
     same way.

   The `BlobStore` port gains `size(sha256)` and `read(sha256, range)`. The disk adapter streams a
   run from the file, opened at the first read and closed at the run's end, on a failure, or when
   the reader stops. A megabyte of a 500 MB video is a megabyte read, and an answer nobody reads
   holds no file open.
3. **A grant a device may hand to a player.**
   - **Issued:** `POST /v1/attachments/:id/grant` with `{ variant }` — `file`, `thumb`, `view` or
     `play` — signed by a device, answers `{ url, expires_at, variant, playable? }`. Only a person
     who may read the file gets one, as a GET is admitted. A harness is refused: its URLs come in
     `message.new`.
   - **The URL** is a path, `/v1/attachments/:id?variant=…&dev=<deviceId>&exp=<unix>&sig=<hmac>`.
     The server does not know which of its addresses the device reached it by, so the device puts
     its own in front. The HMAC-SHA256 covers a label, the attachment, the variant, the device and
     the expiry, with the `grants.secret` the harness grant uses. The label keeps a harness grant's
     signature from ever being a device grant's.
   - **At the door**, a GET or HEAD of an attachment carrying `dev`, `exp` and `sig` and no other
     credential is taken as a grant:
     - The signature and the expiry are checked first, with nothing looked up. A failure is `403`,
       saying *bad signature* or *expired*.
     - Then the device it names is loaded. A withdrawn device is `401`.
     - The request is then that device's person's (`via: "device_grant"`), and `admitReader` asks
       on every request whether that person may read the file. A person who has left the space
       reads nothing with a grant they were given before.
     - A request that signs and also carries a grant must come from the grant's device; another is
       refused as *wrong device*.
   - **Nothing else:** a grant reads one variant of one attachment's bytes, and reaches no other
     route or method.
4. **A grant names the bytes it resolved to, for its whole life.**
   - A `play` asked for while the copy is being made names the `file`. The answer's `playable` says
     `pending`, so the viewer still says the original is playing.
   - A `view` of a photo with no copy names the `file` too.
   - A copy that is made stays made, and the file never changes. So every run a player asks of one
     grant is a run of the same bytes, even when the copy lands mid-playback.
   - Try again — after a stream would not play, or the original would not while its copy was made
     — asks for a fresh grant, which names the copy once there is one. Play grants do not wait for
     the copy: an iPhone plays the HEVC original at once.
5. **How long a grant holds.**
   - Ten minutes (`CHIPS_SIGNED_URL_TTL_SECONDS`, as a harness's URL) for a photo, a thumbnail or a
     view.
   - For a video's `play` or `file`, its length and ten minutes more, since a player asks for runs
     for as long as it plays; an hour at most, and the hour when its length is unknown.
6. **What a cache may keep.**
   - An answer to a grant is `private` and never kept past its expiry: `max-age` is the seconds it
     has left.
   - An answer to a signed `?variant=play` that gave the original while the copy is being made
     stays `no-store` (the media viewer, Phase 3).
   - Every other answer is `private, max-age=600`, as before.
7. **A grant never appears in a log line.**
   - The logger drops `sig=` from every line as it is written: in a field, a message or an error's
     words, not only from a field named `sig`.
   - The server logs *device grant issued* and *device grant refused* with the attachment, the
     variant, the expiry and the reason, and never the URL.
8. **Only where a player can reach the server.**
   - Through the relay a request crosses the tunnel as messages (ADR 0039), which no native player
     and no `<video>` can follow. So core's `grantAttachment` gives nothing when the device's link
     is the relay, and nothing from a server from before grants.
   - `FileService.streamUrl` on the phone and on the web gives nothing then, and the viewer and the
     desktop's row fetch the bytes as they did.
   - On the phone a stream shows a spinner while it starts or catches up after a scrub. The ring,
     which says how much has come, is the download path's.
9. **The players.**
   - AVPlayer asks for `bytes=0-1` first and wants `206`, `Accept-Ranges` and a true type. The
     route gives all three, and a video's type is served inline (ADR 0053).
   - ExoPlayer plays the URL over plain `http` on a tailnet, which the Android build's cleartext
     flag already allows. The iPhone build already allows arbitrary loads.
   - A `<video>` in a browser asks as AVPlayer does. A page the server serves reaches the URL as
     its own origin.
   - The desktop shell's page is not the server's origin, so its content policy admits `http:` and
     `https:` for `img-src` and `media-src`, and the app needs rebuilding to carry that.

## The trade, stated plainly

A grant's URL is a bearer credential. It is not bound to the player that holds it: a player can
present nothing else. Whoever has the URL can read that one variant of that one file, as the
device's person, until it expires. That is ten minutes for a picture, and up to an hour for a video.
The URL could be in a crash report, in something pasted, or in a proxy's log.

It cannot be withdrawn on its own. It stops working when:

- it expires;
- the device is withdrawn;
- its person may no longer read the file;
- the server restarts without a configured `CHIPS_ATTACHMENT_SECRET`.

What it can never do:

- read another file, or another variant of the same one;
- reach another route;
- serve a device that signs its own request;
- outlive its expiry;
- serve a person who could not otherwise read the file.

It is issued only to a signed device of a person who may read the file, and the server never logs
it. This is the trade decision 10's harness grant already makes, minus that grant's second lock, a
token the fetch must also present. It is also the trade the proposal's decision 3 recommended and
Arjun answered, and that Phase 4 was prompted with.

**Alternatives not taken:**

- **The signed headers of today, handed to `expo-video`'s source.** A signature's timestamp is
  checked for freshness, and a player asks for runs for the whole of a playback, so a long video
  would outlive it. And `<img>` and `<video>` on the web take no headers.
- **A short grant renewed as it plays.** A player cannot be handed a new URL mid-playback without
  reloading, which is a stall and a seek.
- **A cookie.** Native players do not carry the app's cookies, and a cookie on the web page would be
  a credential for every request, not one file.
- **A local HTTP proxy in the app, answering ranges from the tunnel.** That would make the relay
  stream too. It is its own proposal (the media viewer proposal's risks).

## Consequences

- **A clip starts in about a second on the server's network**, and scrubs to anywhere in it without
  being on the phone first. The first frame is a range's worth of bytes away, not the whole file.
- **The viewer climbs to a 2,048-pixel copy** rather than to the original. The phone knows the copy
  from the photo itself because the server says so; it guesses by size and type only for a server
  that does not.
- **The grant secret.** Without `CHIPS_ATTACHMENT_SECRET` the server makes one at start, so every
  grant dies at a restart. A player mid-playback then fails at its next run; Try again asks for
  another.
- **The audit.**
  - A person's reads are not audit events, as before; that includes a grant's.
  - A harness's read is recorded at its first byte, not at every run a player asks for.
  - A grant's issue is a log line, not an event.
- **Through the relay the server still reads a whole answer before sending it.** The tunnel's
  answering side takes a body whole (ADR 0039). Nothing a player can use crosses it, so this is as
  it was.
- **An older photo's first view waits** for the copy to be made in the request: about a couple of
  hundred milliseconds, once.
- **In Phase 6**, `BlobStore.read` with a range is an object store's ranged `GET`, and nothing
  above the port changes.
- **The desktop app streams at its next build.** It bundles the page it shows, so the page that
  asks for a grant and the content policy that admits the URL arrive together. The app as it is
  built now plays from a blob, as before.
