# 47. A workspace caps what may be attached, by kind, under the server's ceiling

Date: 10 September 2026 · Status: accepted

## Context

The server has always had one number for uploads: `CHIPS_MAX_ATTACHMENT_BYTES`, a hundred
megabytes unless the operator says otherwise, applied to every file alike and settable only in
the server's own configuration. With the phone able to send a photo, a video or a file (M4.4),
that number is the wrong shape twice over. A workspace wants different limits for different
things — a hundred megabytes is generous for a video and absurd for a photo — and the person
who meets the limit is holding a phone, not a shell on the server (Arjun, 10 September 2026:
*a way to cap file, image, and video sizes … present somewhere accessible in Chips settings*).

Where such a setting lives was the real question. The notification settings (M5.6) are a
registry row per person, because they are one person's and nobody else's business. Caps are
the workspace's: every client needs them to refuse a file before uploading it, the server needs
them at the door, and a change should be seen by everyone at once and be answerable for.

## Decision

1. **Caps are an event.** `attachment.limits_set` is a workspace event carrying all three caps
   at once — `image_bytes`, `video_bytes`, `file_bytes`, each a number of bytes or `null` for
   the server's own limit. Being in the log, it reaches every client over the socket and the
   replay, it is rebuilt with every other projection, and the audit says who capped what.
2. **Only an owner or an admin sends it**, by the same rule that changes a role. A member's or a
   harness's is refused at the door.
3. **The server's number is the ceiling.** A cap above `CHIPS_MAX_ATTACHMENT_BYTES` is refused
   when it is set, naming both numbers, so no cap in the log is one the server would never apply.
   Where a workspace sets no cap for a kind, the ceiling is the cap.
4. **A file is judged by what it is, not by its name.** The server checks the slot request by
   the kind the filename suggests — a courtesy, so a phone is not made to upload what will be
   refused — and the bytes by their sniffed type, which is the rule: a video called `photo.jpg`
   is capped as a video. Audio and everything that is not a picture or a video is a *file*.
5. **One sentence, everywhere.** The arithmetic and the words live in `@chipschat/protocol`
   (`limits.ts`), which the server and both clients already share. A client refuses a file at
   the chip with the sentence the server would have used — *Videos here are capped at 50 MB, and
   this one is 62.3 MB.* — and uploads nothing; the server says the same thing to a client that
   did not ask first. The server's ceiling reads *This server takes photos up to 100 MB, and
   this one is 120 MB.*
6. **The setting is in You**, on the desktop and on the phone, under *Attachments*: the caps in
   a sentence for everyone, and for an owner or an admin three fields in megabytes and Save.
   `GET /v1/limits` tells a client the ceiling, so the sentence can name it and a cap above it is
   refused before it is sent.

## Consequences

- A new projection table, `workspace_limits` (migration 0017), one row per workspace; the read
  model `attachmentCaps`; the upload use case takes the caps beside its ceiling.
- The phone's `Attachments` and `Composer` and the desktop's `useStaged` and `You` read
  `WorkspaceModel.attachmentCaps` from the fold, which is `NO_CAPS` until an owner sets any.
- The ceiling stays the operator's, in the server's configuration; nothing in the app raises it.
- Not decided here: per-space caps, or caps per harness. A harness uploads under the same caps
  as a person; its refusal is the same sentence, in the slot's answer.
