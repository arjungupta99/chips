# 0179. A read the connection drops under is asked again, and a preview is not covered

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's "go ahead with both".
Amends the link (ADR 0038 decision 1), the tunnel's requests (ADR 0039, ADR 0153) and how the
phone's media viewer says a photo did not come (the media viewer proposal, §4.3).

## Context

Arjun, 16 October 2026, 17:38 PDT, opening a photo from the Garage door replacement space's
Media page (ADR 0165) on his iPhone, away from home and so through the relay: the viewer said
**Could not fetch the photo. The tunnel closed: server_gone.** with Try again, on a card over the
picture. Then: "but the media was there and the error was showing on top".

What happened, from the serve log: another session's go-live restarted 4431 at 17:38:18 (exit
143, `SIGTERM`). The phone was part-way through the photo's 2,048-pixel copy (`?variant=view`).
4431's link to the relay went with the process, the relay closed the phone's tunnel with
`server_gone`, and the download failed. The phone's next tunnel opened four seconds later
(17:38:23). The picture on the stage was the 512-pixel thumbnail the Media page's tile handed the
viewer, stretched to the screen.

So two things were wrong:

1. **Nothing asked again.** A download cut off by the connection going is the same download a
   moment later, once the transport has its next socket. The viewer, the room's thumbnails and the
   page reader all failed at once instead, and only a person pressing Try again asked again.
2. **The card covered a picture.** A preview a person can look at was hidden behind a dark card
   that read as *nothing loaded*, in the tunnel's own words.

## Decision

1. **A read the link drops under waits for the device to reach its server again, and is asked
   once more** (`readOnLink` in `packages/core/src/link.ts`). The transport says each time its
   socket opens (`reached(deviceId)`): the one proof that the server answers on the link the
   device holds now. A link chosen is not proof, since with no relay the network is handed over
   untried. A read waits up to `REJOIN_MS`, 20 seconds. The transport tries again 1, 2, 3, 4
   and 5 seconds apart, so a ten-second restart and the tries that find it back fit. The read is
   asked again through whichever link that is, signed afresh. If the device came back while the
   failure was on its way, it is asked at once. Given up on, or dropped a second time, it
   rejects with `ConnectionDropped`: **The connection dropped.**
2. **A drop is told apart from everything else.** The tunnel's close is its own type,
   `TunnelClosedError` (in `@chipschat/tunnel`, with the relay's or the wire's reason; the words
   are unchanged). On the network a drop is the `fetch` itself rejecting with a `TypeError`, which
   is how every platform says nothing came back. These are not drops and are not asked again: an
   answer the server refused, an answer the tunnel refused (too long), an `AbortError` from a
   reader that let go, and anything the read throws after the answer came.
3. **Reads only.** `fetchAttachmentWithType` goes through it, so thumbnails, viewer copies, files,
   pages and a video's download do on the phone, the web and the Mac. Writes are not: an upload's
   first try may have landed, and uploads already resume by asking how far they got (ADR 0052).
   `getJson` and the other signed reads are left as they were. Each is a one-line change when one
   shows the same fault.
4. **On the phone, a photo whose full picture will not come, while its preview is on the stage,
   says so at the foot.** A line over the caption reads **Preview only · couldn't load the full
   photo · Try again**, and a tap on it asks again (`PreviewOnly` in `Chrome.tsx`). It comes and
   goes with the bars. The card over the stage is kept for a photo with no preview, and for a
   video, whose poster is not the video.
5. **What was said is taken back when the photo comes.** The viewer asks for a failed picture
   again by itself whenever its deck is made again, as it is when the room reconnects. When that
   ask brought the photo, the failure stayed over it. Its failure now goes as it lands.

## Consequences

- Arjun's case shows nothing now. The view waits for the next tunnel, 4 to 5 seconds over the
  preview, and the full photo comes.
- Proved in `apps/mobile/e2e/viewer.spec.ts`, on the phone's web target against a real `chipsd`.
  The browser is put offline under the view's download, which closes the app's socket, and back
  400 ms later. Dropped once, the photo comes with nothing said. Dropped twice, the line shows over
  the preview with no card, and Try again brings the photo. Unit tests in `link.test.ts`,
  `attachments.test.ts`, `transport.test.ts`, `mux.test.ts` and `MediaViewer.test.tsx`.
- No server, wire, relay, Jacobian or bridge change. Going live is a phone build, and a web and Mac
  build for the retry there. 4431 is not restarted.
- A read waits up to 20 seconds before it says anything when the network fails a request while the
  socket stays up. That case is rare, since both go the same way, and before this it was said at
  once.
- The Mac's and the web's viewer still say **This browser cannot show this picture** for any
  failure, a drop among them (`usePicture.ts`), under the thumbnail. The retry makes that rarer.
  Its words are not changed here.

## Addendum, 16 October 2026: every signed read waits for the connection

Arjun, 16 October 2026, 18:23 PDT, on his iPhone on 5G: You's Devices said **The server did not
answer. This list comes from it, not from this phone.** under Pair a computer, and he had not tried
to pair. You asked for the list once, as it first drew, while the phone was coming back. No socket
had opened yet, so `linkFor` handed over the network's link, the tailnet address, which 5G cannot
reach. The read failed and nothing asked again. 4431's log had no failed request, because it never
arrived. You's lists then learned to read each time the connection opens, on the phone (15df1733)
and on the web and the Mac (4e3e6147). His next word: "Make getJson reads wait for the connection
everywhere".

1. **`getJson` goes through `readOnLink`.** Every signed read the store makes does: the directory,
   a space's history, search, devices, passkeys, invites, join requests, notification settings,
   an agent's context, model and heartbeat, a room's files, and the rest. A
   read the network fails, or the tunnel closes under, waits up to `REJOIN_MS` for the next socket
   and is asked once more through whichever link that is, signed afresh. This covers a read asked
   before the device has reached its server at all: the first socket is the reach it waits for.
2. **Nothing else changes.** A refused answer is said at once, as before (`/v1/devices answered
   403`). Writes (`postJson`, `putJson`, `patchJson`, `deleteJson`, the passkey calls) are not
   asked twice. The upload's "how far did it get" read keeps its own way (ADR 0052).
3. **Given up on, a read says "The connection dropped."** That replaces the platform's words for a
   failed `fetch` ("Load failed", "Failed to fetch", "Network request failed") after up to 20
   seconds.

Only apps that run a transport make a store: the phone, the web and the Mac. So no read waits on a
socket that is never opened. Unit tests in `transport.test.ts`: a read the network failed is asked
again on the next socket, and a refusal is not.

## Addendum, 16 October 2026: the web's and the Mac's viewer says a photo did not come

The Consequences above left the web's and the Mac's viewer saying **This browser cannot show this
picture. Download it to see it.** for any failure, a drop among them. On his word ("Fix the web and
Mac viewer's 'cannot show this picture' wording"), `usePicture.ts` now tells the two apart:

1. **Bytes that did not come** say **Could not fetch the photo.** with the reason under it (often
   **The connection dropped.**) and **Try again**, the phone's words (`MediaViewer.tsx`).
2. **Bytes that came and will not draw** keep **This browser cannot show this picture. Download it
   to see it.**, with no Try again: a HEIC in a browser that cannot decode one.
3. **An `<img>` that fails on a grant's URL** does not say which of the two it is. It is asked
   with a fresh grant once, as before, and then the copy's bytes are fetched into the page. Bytes
   in the page that still fail are the second case.

The video stage said **This video came, but would not play here.** when the video had not come at
all. It now says **Could not fetch the video.**, with the reason, in that case. Tests in
`Lightbox.test.tsx`.

## Addendum, 2 November 2026: an open that never settles, and a write that never went

On an iPhone locked partway through opening its socket, Chips tried nothing for hours, and for ten
minutes after it was brought back to the front. "Make a link" said **The tunnel is closed.** and
made nothing. The server's log had nothing from the phone after its last socket closed. A tunnel's
socket is greeted, and so ready, before it opens (ADR 0253), so the transport was ready and opening
at once. iOS never said what became of that socket. The silence check replaced it, and the open it
asked for found one under way and left it to finish. Every wake after did the same.

1. **An open is given up on after `OPEN_MS`, 30 seconds.** Dialling takes ten seconds at most and
   the socket opens a round trip or two after. The silence sweep gives up on an open older than
   that and reconnects on the backoff; a wake gives up on it and opens the next at once. Its socket
   and its link are let go. An open given up on finds it is not the current one when what it was
   waiting for comes after all, and closes what it brought, so a device never holds two sockets.
2. **A request a closed tunnel turned away says it never went.** `TunnelClosedError` has `sent`:
   false when the tunnel was closed before the request was put into it, true when it closed under
   it.
3. **A signed write turned away unsent waits for the connection.** `writeOnLink` waits up to
   `REJOIN_MS` for the device to reach its server again, as a read does, and sends it once, signed
   afresh. A write that went is still never sent twice. A tunnel that closed under it, or a
   connection that did not come back in time, says **The connection dropped.**, not the tunnel's
   words.

Tests: `transport.test.ts` ("an open that never settles", one through a real tunnel whose server
never takes the socket), `link.test.ts` ("a write on a link that may not be there"),
`mux.test.ts`.
