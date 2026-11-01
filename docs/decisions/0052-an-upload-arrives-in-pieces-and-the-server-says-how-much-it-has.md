# 52. An upload arrives in pieces, and the server says how much it has

Date: 13 September 2026 · Status: accepted

## Context

An upload has been two requests since M1.5: a slot, then the whole file as one `PUT`. That is
fine for a receipt on Wi-Fi and wrong for what M4.4 asks of the phone: *a two-minute video
uploads over a flaky connection with resume*. A two-minute video from an iPhone is tens of
megabytes. When the connection drops at 90 per cent, one `PUT` has nothing to resume. The phone
starts again from nothing, and on a train it may never finish.

Three things constrain the answer. The door authenticates a request by a device signature over
its method, its target (path and query), a timestamp and a digest of its body (ADR 0006).
Headers are not signed. The relay tunnel carries a request whole, as a header and chunks
(ADR 0039), so a body is buffered at both ends of it. And the phone's `fetch` cannot stream a
request body, and its SHA-256 is JavaScript (ADR 0044), so a body is also hashed in one go.

tus, the open resumable-upload protocol, puts the offset in an `Upload-Offset` header and
appends with `PATCH`. The signature would not cover that offset, so a captured piece could be
replayed at another place in the file within the signature's window. Taking tus's shape and
moving the offset where the signature covers it is a smaller change than signing headers.

## Decision

1. **A slot takes its bytes in pieces, each at an offset.** `PUT /v1/uploads/:id?offset=N`
   appends the body at byte `N`. The offset is in the query, so the signature covers it and a
   piece cannot be moved. A piece at any offset other than the number of bytes the server holds
   is refused, and the refusal says how many it holds. `PUT /v1/uploads/:id` with no offset is
   the whole file, as it has always been; harnesses and the SDK keep using it.
2. **A pieced upload names its size at the slot, and the slot says it takes pieces.**
   `POST /v1/uploads` answers `pieces: true`. A client sends pieces only to a slot that says so,
   and otherwise sends the file whole. A server from before this decision ignores `?offset=`,
   and would store the first piece as the whole file and answer `201`: a truncated file, with
   nothing to say so. `byte_size` in `POST /v1/uploads` is required for pieces. The piece that
   brings the count to that size finishes the upload. Its answer is the attachment, `201`,
   exactly as a whole `PUT` answers. Every other piece answers `200 { received_bytes }`. A piece
   that would go past the size is refused.
3. **`GET /v1/uploads/:id` says how far an upload got**: `{ attachment_id, received_bytes,
   byte_size, expires_at }`, and `attachment` once it is stored. It answers only the uploader.
   A client whose piece failed on the network does not know whether the server kept it, so it
   asks, and goes on from there.
4. **Pieces wait on disk until the last one, then the upload is what it always was.** They are
   appended to one file per slot, beside the blob store. The file's length is the count, so a
   crash mid-write leaves a shorter file and a client that asks is told the truth. When the
   last piece arrives, the bytes are sniffed, stripped, thumbnailed, digested and kept once by
   their SHA-256, as a whole `PUT`'s are, and the pieces are deleted. One slot's pieces are
   written one at a time.
5. **A slot that keeps moving does not expire, and one that stops is swept.** Every piece moves
   the slot's expiry fifteen minutes on from when it arrived. The gateway's sweep deletes the
   pieces of a slot whose expiry has passed.
6. **The cap is judged at the first piece, and again at the end.** The first piece carries the
   leading bytes the sniff reads, so the declared size is judged against the workspace's cap
   for what the file is before the rest is sent: a video called `photo.jpg` is refused at the
   first piece, not after a hundred megabytes (ADR 0047). What is kept is judged again when it
   is complete, as it is today.
7. **The clients send four-megabyte pieces from a source they read a piece at a time.** Core's
   `uploadFile` reads a piece, signs it and sends it. When a piece fails on the network, or the
   server answers `429` or `5xx`, it waits with backoff, asks how far the upload got and goes on.
   It gives up after six failures in a row with no progress between them, and reports progress
   as it goes. The phone reads a picked file through a file handle, and the browser slices its
   `File`, so neither holds a video in memory to send it.

## Consequences

- Four megabytes is small enough that a dropped piece costs seconds on a phone connection. It
  is large enough that a hundred-megabyte file is twenty-five requests. It is well under the
  tunnel's body limit and cheap to hash in JavaScript. The number is core's, not the protocol's:
  the server takes a piece of any size up to what the slot has left.
- The server still reads the whole file into memory when the last piece arrives, to sniff and
  digest it, as it did for a whole `PUT`. The ceiling bounds that at a hundred megabytes by
  default. Reading it as a stream belongs with the transcode, which is the other half of M4.4's
  line and runs in a process of its own.
- A resume lasts as long as the upload's call does. If the phone's app is killed mid-upload, the
  chip is gone with it, and the slot's pieces are swept when it expires. Resuming across a
  restart would need the phone to keep its slot ids and file handles in its own store. That is
  not built.
- A client that is not Chips' own can resume too: decisions 1 to 3 are the whole protocol, and
  the HTTP reference says them.
- A piece refused for its offset is `invalid_event`, not a new error code. A client that asks
  before it resumes never sends one, so the closed set of codes stays closed.
