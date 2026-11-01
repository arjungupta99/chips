---
title: Message
description: Eleven kinds of message. Text is one of them.
---

Text is one kind of message. The rest are what make a harness space different from a group
chat: they are structured, so they can be tapped on a phone, routed to a teammate, and read back
in an audit.

| Type | Sent by | Carries | Shows up as |
| --- | --- | --- | --- |
| `text` | Anyone | Markdown, mentions, reactions, attachments | A bubble, with media inline |
| `status` | Harness | Phase, a verb phrase, progress, an estimate | A pill under the harness's name |
| `approval` | Harness | Action, preview, risk class, expiry, who may answer | A card with Approve, Edit, Deny |
| `question` | Harness | Prompt, options, whether free text is allowed, a default | A card with tappable options |
| `receipt` | Harness | Steps, tool calls, sources, tokens, cost, duration | A collapsed line that expands inline |
| `artifact` | Harness | File, document, code, image or table, with a version | A rich card that opens in the side panel |
| `task` | A person, or a lead | Goal, constraints, deadline, autonomy level | A card that becomes a run, or a [lane](/concepts/lane/) |
| `handoff` | Anyone | Recipient, context summary, open items | A card; the recipient is pinged |
| `checkpoint` | Harness | Milestone reached, what is next | A compact card, FYI tier |
| `summary` | Harness | Outcome, what changed, cost, follow-ups | A card at the end of a run |
| `system` | Chips | Joins, policy changes, budget alerts, the kill switch | A muted centred line |

Any of them can carry attachments: photos, video, voice notes, files. Anything you can send a
person, you can send a harness — a harness receives them as signed URLs that expire in ten minutes
and are bound to its own token. Which Markdown draws, and what each kind of file opens as, is in
[What Chips draws](/connect/what-chips-draws/).

A `text` says whom it is for. `@Ledger` in the text is a mention: Chips resolves it against the
[space's](/concepts/space/) members as the message arrives and fills in `mentions` with the
participant ids — a value the sender writes is replaced — and every screen draws the same chip.
A handle is a name without its spaces, or its first word, and is not case-sensitive; `@all` names
every harness in the room. From the mentions, the sender's `to`, a reply and the room, Chips then
decides which harnesses the message is for and fills in `addressed_to` (ADR 0081): those harnesses
hear it as [`message.new`](/reference/events/message-new/) and take a turn, and the others hear it
as [`message.overheard`](/reference/events/message-overheard/). The rules are in
[Several harnesses and people in one space](/concepts/space/#several-harnesses-and-people-in-one-space).

## Threads

On the wire a `text` can grow a thread: a [space](/concepts/space/) of its own with a parent —
`space.created` with `kind: "thread"`, `parent_space_id` and `root_message_id` — and **no members
of its own**: whoever is in the room is in its threads, sees them, and leaves them with the room.
A message roots one thread; a thread is not opened inside a thread, in a closed space, or from a
message taken back. A reply is the room's news: the room comes forward in the list and its
unread count moves ([ADR 0035](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0035-a-thread-is-a-space-with-a-parent-and-a-message-is-changed-by-events.md)).

**Neither client offers to open one, for now** (15 September 2026): *Reply in a thread*, the
desktop's thread panel and the reply count under a line are withdrawn until a thread earns its
place in a room read like Messages. The log keeps the threads already opened, search still reads
them, and a harness may still open one through the door.

## Edit, take back, pin

A message is changed by events, and the log keeps the words. Its author — a person or a
harness — may change them with [`message.edited`](/reference/events/message-edited/): the room
shows the latest, marked *edited*, and the audit says who. Its author, the space's owner, or a
workspace owner or admin may take it back with
[`message.deleted`](/reference/events/message-deleted/): a tombstone stands where the bubble was,
its files, thumbs and pin go with it, and it takes nothing more — no edit, no reaction, no
thread. The `message.post` that carried the words stays in the log, so a rebuild reproduces
the room and an audit can still read what was said. Taking back is not erasure. It is offered as
*Delete for everyone*, and asked about first: the agents in the room have read the message already
and keep what they read.

### Delete for me

Anyone in a room may also delete any message for themselves alone — anyone's, a tombstone too —
with [`message.hidden`](/reference/events/message-hidden/), and put it back with
[`message.shown`](/reference/events/message-shown/). These two are sent to the person who did them
and to nobody else: their own devices take the line out of their room, on every device they pair,
and no other person or harness is told. A harness may not send them. Nothing is asked, since
nobody else's room changes; the room offers *Undo* for five seconds instead
([ADR 0167](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0167-a-message-can-be-deleted-for-oneself-and-breaks-into-dust.md)).

Either way the line breaks into dust as it goes: a wipe crosses the bubble from its left, and its
specks drift up and away in the bubble's own colours. *Undo* runs it backwards. With Reduce Motion
the bubble simply fades.

### Asking a line what it can do

None of this stands open under a bubble. A message is asked: **right-click it** in the browser,
**press and hold it** on the phone, or use the `⋯` beside the name, which is the same menu and
the way to it from a keyboard. On the phone the message lifts out of the room, with what is done
to its words above it and the rest below. What the menu offers is what the door would allow —
*Not right?*, a pin, an edit, a deletion for you or for everyone — so a line with nothing to offer
has no menu at all.

A bar under every message was the earlier answer and it was the wrong one: four controls on
every line of a room, most of them on lines nobody was ever going to react to, and a room that
read like a form.

Anyone in a space but a guest may pin a message to its top with
[`message.pinned`](/reference/events/message-pinned/), and let it go with
[`message.unpinned`](/reference/events/message-unpinned/); the strip above the messages names
each pin and jumps to it.

## Search

`GET /v1/search?q=` finds messages and receipts — a step's title and summary — with the words
in them, from the spaces you are in and their threads, newest first, by page. Every word is
required and the last is a prefix, so a search narrows as it is typed; a hit carries a snippet
with the match marked, and opens the room at the line. A voice note is found by what was said in
it, and a hit that quotes those words says it was a voice note, since a machine heard them. The index is SQLite's FTS5, off the
append path: a change is queued by a trigger and folded in before every search and on the
sweep's timer, so an edit is found, a deletion is not, and a hit is never stale; fifty thousand
messages answer in under 200 ms ([the HTTP reference](/reference/http/)).

## Feedback

Feedback is on a harness's words: its `text`, or the `summary` that ends a run. *Not right?*,
from the line's menu, asks for a reason (*Wrong facts*, *Missed what I asked*, *Too long*, *Not
finished*) or words, or both, and sends them as one `correction` in a
[`feedback`](/reference/events/feedback/) event: a person sends it, Chips fills in `from` from
the credential and the sender's standing in the space, and delivers it to the harness whose
message it is, and to everyone in the room. A harness reading `feedback` sees which of its
messages, whether it was a `reaction` (with the emoji) or a `correction` (with the note), and
who gave it; a second harness in the same room does not hear it, since it is not about its
words. The room shows who reacted and what they said was wrong, under the line, and the audit
records each. `/wrong <note>` in the composer says it about the harness's last message.

A correction is on a harness's message and nothing else: one nobody sent, a person's own, or one
in another space is refused at the door, as is a reaction without its emoji or a correction
without its note ([ADR 0031](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0031-feedback-is-an-event-on-a-message-heard-by-its-author.md)).
The door is the wider of the two and still takes a reaction on anybody's message, which older
clients send as 👍 and 👎; the screens send none now, since a thumb up asked nothing of anyone and
a thumb down alone did not say what to fix ([ADR 0200](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0200-pressing-a-message-lifts-it-and-not-right-replaces-the-thumbs.md)).
The same emoji from the same person again takes it back, and a message taken back takes neither.
A harness that hears a correction should look at its message again and answer in its place, in
the same session, as every connector Chips ships does; one that hears a bare 👎 should read its
message again and find what was wrong.

## Attachments

How that works (ADR 0010): the client asks for an upload slot and sends the bytes; the server
sniffs what they are, strips a photo's metadata — location included — unless the person keeps
it, makes a thumbnail, and keeps the bytes once by their digest. The message then names the
uploads by id, and Chips fills in what each one is. A photo or a PDF renders inline; anything
that could carry a script — HTML, SVG, everything else — is served as a download. A harness gets
each attachment as a signed URL bound to its own token for ten minutes, and every fetch it makes
is an event in the room and in the audit.

How big a file may be is two numbers (ADR 0047). The server's `CHIPS_MAX_ATTACHMENT_BYTES` is
the ceiling nothing gets past; under it, an owner or an admin caps photos, videos and files
separately from **You → Attachments**, on the desktop or on the phone, and the caps reach every
client through the log like anything else. A file over its kind's cap is refused at the chip,
before a byte of it is uploaded, with the sentence the server would have used — *Videos here are
capped at 50 MB, and this one is 62.3 MB.* — and the server judges the bytes by what they turn
out to be, not by what the name said. Audio counts as a file.
