# 0010. Attachments are content-addressed and served through signed URLs

2 September 2026 · Status: accepted

## Context

Anything you can send a person you can send an agent. That means user files reach agents, and
agent output reaches phones. Both directions are a security surface.

## Decision

A content-addressed store keyed by SHA-256. Upload slots; MIME sniffed from bytes, never
trusted from the client; thumbnails with `sharp`; GPS stripped by default; signed URLs that
expire in 10 minutes and are bound to the requesting token. Local disk in solo mode,
S3-compatible in Phase 6. Video transcoding with ffmpeg in Phase 4.

## Consequences

- Identical files are stored once, and an attachment's identity does not depend on its name.
- A leaked URL is useless in ten minutes and useless to a different token immediately.
- An uploaded `.svg` is served as a download, not rendered — one of the negative cases in the
  golden scenario. So is an uploaded `.html`: only photos and PDFs render inline; everything
  else goes out as `application/octet-stream` with `Content-Disposition: attachment`, `nosniff`
  and a sandboxing CSP.
- As built in M1.5 (3 September 2026): the person may keep a photo's metadata, and says so per
  upload; access without a grant is by having uploaded the file or being a member of a
  conversation it was sent in; a message names uploads by id and Chips fills in what they are;
  every fetch by an agent is an `attachment.fetched` event, in the room and in the audit; bytes
  live beside the database in solo mode, in `attachments/<first two hex>/<sha256>`; the URL
  secret is made at start unless `CHIPS_ATTACHMENT_SECRET` is set, so a URL outlives the
  process only when it is.
