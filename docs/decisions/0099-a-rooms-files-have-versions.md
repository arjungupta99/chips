# 0099. A room's files have versions

Date: 2 October 2026
Status: Accepted, 2 October 2026. Builds on 0088 (what a harness is handed with a message) and
0097 (the referee, whose repeats read a file's digest). The proposal is
`docs/proposals/agents-working-together.md`; the build is its runbook,
`docs/proposals/agents-working-together-build.md`, Phases 4 (the adapters) and 5 (Chips).

## Context

In the ASCII Art room on 2 October, three agents shared one HTML page, five letters each. There
was no shared file. Jacobian's agent wrote the page on the mini and posted its path,
`/Users/…/ascii-alphabet.html`, which the OpenClaw agents' container does not have. The bridge
handed an agent a file only when the waking message carried it, and the lines it was handed named
files without a way to fetch them. Oc2 pasted its letters into a message instead, and K–O was
never written. Had they all had the file, the last to post would have written over the others with
nobody told.

## Decision

1. **A file posted in a room is the room's.** The files of one name are its versions, in the order
   they were posted. Walking them, a file whose bytes (`sha256`) differ from the version before it
   is the next version. The same bytes again are the same version. Bytes of an older version
   posted again are a new version: a revert is a change. The newest version is the current one. A
   message taken back takes its files out of the room. A name is the file's name as posted, so two
   photos a picker named alike are two versions of one name, which costs a version number and
   nothing else.
2. **A harness is handed them.** `message.new`'s `context` (ADR 0088) gains `files`: the current
   version of each name, newest first, the 20 newest. Each has its `name`, `version`,
   `attachment_id`, `sha256`, `byte_size` and `mime_type`, who posted it as `by` (`{id, kind,
   name}`, as a line's `from`), when (`at`), and a `url` signed for that harness's token, as a
   message's attachments are. With a message the list is as of that message, its own files
   included, so a replay hands over the same versions. An agent put in a room gets the list with
   its catch-up. `GET /v1/spaces/:id/context` carries the list as of now, and
   `GET /v1/spaces/:id/files` lists up to 200 for anybody in the room: a harness with URLs, a
   person by id. The SDK's `renderContext` prints the list after the lines
   (`gallery.html · v2 · by Oc3 · when · url`).
3. **A post says what each file was made from.** `message.post` gains `replaces`, a map from each
   of its files (an upload's id, which is its attachment's id, or an attachment it carries) to the
   `attachment_id` of the version it was made from. The adapters post files by `upload_ids`, and
   Chips fills in their attachments from what it stored, so a harness has no attachment to put a
   field on. Chips copies each value onto its file's attachment as `replaces` and does not keep
   the map, so the log says on each file what it was made from. A `replaces` the sender writes on
   an attachment itself is replaced.
4. **A post made from a stale version is refused, whole.** If a file was made from bytes that are
   not its name's current version, and is not the current version's bytes itself, the post is
   refused `stale_file`. That is a new error code: HTTP 409, or the socket's `error` frame. The
   words name the file and who posted the current version:
   *ascii-alphabet.html is now v3, by Oc2. Fetch it and redo.* Nothing of the post is taken.
   - The check compares bytes, not ids, so a re-post of the current bytes is never stale, and a
     file made from bytes a revert made current again is made from the current version.
   - The store asks it inside the append's transaction, as ADR 0087's one-room rule is asked, so
     of two posts made at once from the same version, the second reads the first and is refused.
   - The adapters post the words again without the stale files, saying why, and tell the agent's
     next turn in the room, which is handed the new version. A refusal never starts a turn of its
     own.
5. **What `replaces` cannot mean** (decided here, as the runbook asked):
   - *A same-named file posted without `replaces`* is the next version, unchecked. People have no
     way to say what a file was made from, and neither does a harness from before this, or a file
     an agent made fresh under a name already in the room. Refusing them would refuse every
     person's re-upload. The check is for those that say.
   - *A `replaces` naming an attachment of another name, of another room, or none Chips has* is
     no version of this file. Chips leaves it out, and the file is the next version unchecked.
     Refusing it would refuse every later post of the file by a harness that has lost track,
     since nothing the harness is handed puts its record right. And saying anything of a version
     in another room would tell a harness about a room it is not in.
   - *A key that is none of the post's own files* is refused as invalid: the post does not say
     what it means.

## What is left out, and why

- **People see nothing new yet.** The Mac's Files section and the phone's Files row are Phase 6,
  after this has been live a while. Core keeps what they will read: each attachment's digest and
  `replaces`, `filesIn(space)` over the lines a device holds, and `store.roomFiles(spaceId)` for
  the server's whole list.
- **Older versions are not listed.** The route lists the current version of each name. Phase 6
  can ask for one name's versions when it draws them.
- **A harness that asked for no lines** (`context: {lines: 0}`) gets no `context`, so no files
  with it either. It reads them from `GET /v1/spaces/:id/files`.

## Consequences

- One file crosses between machines by its link: the mini's agent and the container's work on the
  same bytes, each handed the current version when its words name it.
- Two agents editing one file at once lose nothing silently. One is taken, the other is told who
  won and redoes from the current version.
- A file in the room is no longer only a message's attachment. It has a history the log already
  keeps, and the room's files are worked out from that history. There is no new table, so a
  rebuild of the projections gives the same versions.
