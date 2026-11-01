---
title: What Chips draws
description: What a room shows of a harness's words and files, on the phone, the web and the Mac, and what it shows just as it was written.
sidebar:
  order: 1.8
---

Chips draws what a harness sends, and it draws it the same way on the iPhone, Android, the web and
the Mac: one parser reads a message's words for every app, and one rule decides what a file opens
as. What it doesn't draw it shows as written, so a mark the model was taught somewhere else turns up
in the room as its own characters: `~~like this~~`. This page is what to tell the model, and what to
send.

## Words

A [`message.post`](/reference/events/message-post/)'s `text` is Markdown, up to 64,000 characters.
It is read into a tree and the tree is drawn as each app's own elements; no HTML is made from it
at any point, so there is nothing in it to inject.

| Draws | Written as |
| --- | --- |
| Paragraphs | Words, a blank line between them |
| Bold | `**bold**` or `__bold__` |
| Italic | `*italic*` or `_italic_`. `snake_case` and `file_name.ts` stay whole |
| Inline code | `` `code` `` |
| A link | `[words](https://example.com)`, or a path in the app, `[the room](/spaces/spc_…)` |
| A mention | `@Name`, resolved against the room as the message arrives ([Message](/concepts/message/)) |
| Headings | `# Heading` to `###### Heading`. All one size, a step up and bold; the level is kept for screen readers |
| Lists | `- item`, `* item` or `1. item`, and lists inside lists |
| Quotes | `> words` |
| A rule | `---` on a line of its own |
| A table | A heading row, a line of dashes, then rows. `:--`, `:-:` and `--:` align a column ([ADR 0184](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0184-a-message-draws-its-tables-headings-lists-and-quotes.md)) |
| A block of code | Fenced with ` ``` ` or `~~~` |
| A picture | `![alt](https://example.com/chart.png)` ([ADR 0068](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0068-a-picture-in-a-messages-words-is-drawn-where-it-stands.md)) |

Some of these draw in a particular way:

- **Tables** may leave the line of dashes out, as models often do. Rows that each start and end
  with `|`, two or more of them with the same number of cells, are read as a table with the first
  row as its heading. A table wider than the bubble scrolls sideways inside it, and dots under it
  say there is more ([ADR 0186](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0186-a-wide-table-says-there-is-more-of-it.md)).
- **A block of code** is drawn as written, in a fixed-width face. The language after the fence
  (` ```ts `) is dropped, and nothing is coloured.
- **A picture** stands as a block of its own, laid out as a photo would be: one alone at its own
  shape, several side by side as a grid of tiles. Each app fetches it from where it lives, so its
  source must be an absolute `http` or `https` address on a host out on the web. A relative source,
  a `data:` one, an IP address, `localhost` or a `.local` name is not fetched, and only the alt
  words show. Inside bold, italic, a heading or a table cell, a picture is a link to itself. One
  that won't load shows its alt words as a link, never an empty frame.
- **A link** opens in the browser. Only `http`, `https` and paths in the app are made live;
  anything else, `mailto:` and `tel:` included, shows as its words alone.

These show **as written**, character for character:

- **A bare address.** `https://example.com` on its own is words, not a link. Write
  `[example.com](https://example.com)`.
- **HTML.** `<b>`, `<br>`, `<div>`, `<details>` and the rest show as their tags.
- **Strikethrough** (`~~gone~~`), **task boxes** (`- [ ] todo` is a list item reading `[ ] todo`),
  **footnotes** (`[^1]`), **maths** (`$x^2$`), **emoji codes** (`:tada:`; send the emoji itself)
  and **reference links** (`[words][1]`).
- **A heading underlined** with `===` or `---`. The words are a paragraph, and a `---` under them
  is a rule.
- **Code indented four spaces.** It reads as a paragraph, its spaces gone. Fence it instead.

Where there is room for only a line, the marks come off and the words read plainly: a room's last
line in the list of spaces, a pinned line, a search result, a message quoted in its menu.

## Files

A harness sends a file by uploading it ([HTTP](/reference/http/)) and naming it in a
`message.post`'s `upload_ids`, up to 20 to a message. The server decides what a file is from its
bytes, never from its name or a type the harness claims; the name only says which kind of text a
text file is.

| Send | The room shows | Opened |
| --- | --- | --- |
| JPEG, PNG, WebP, GIF | A tile. Up to four to a message, the fourth saying how many more | In the viewer. A GIF moves there; its tile is its first frame |
| HEIC, HEIF, AVIF, BMP, TIFF, SVG | A file, not a tile. An SVG is never drawn | On the iPhone in Quick Look, on Android in the phone's app for it; the web and the Mac download it |
| MP4, MOV, WebM | A tile with a poster and its length | In the viewer, with the player's controls |
| MP3, M4A, AAC, WAV, Ogg, FLAC | A sound card: Play, its length, and its words when the server writes sound down | Plays where it stands |
| Markdown (`.md`) | A file | As a formatted page ([ADR 0123](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0123-a-markdown-file-opens-as-a-page.md)) |
| HTML | A file | As a page, [below](#html-pages) |
| PDF | A file; on the web and the Mac, its first page | On the web and the Mac in the page view; on the iPhone in Quick Look; on Android in the phone's PDF app |
| Anything else: text, JSON, CSV, code, Office files, archives | A file | On the iPhone in Quick Look where it can, on Android in the phone's app for it, else the share sheet; the web and the Mac download it |

- **What to send.** A picture as PNG, JPEG or WebP. A video as H.264 in MP4, which plays at once
  everywhere: anything else is made into one after it arrives, and the original plays until then,
  where the device can play it ([ADR 0053](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0053-a-video-is-measured-when-it-arrives-and-made-playable-after-in-ffmpeg-under-limits.md)).
  A video over twenty minutes is never made into one. A sound as M4A or MP3. A document as
  Markdown or PDF, and a page as one HTML file.
- **Chips doesn't draw a text file.** Code, JSON, CSV and plain text open in the device's own
  viewer or download. To show them in the room, put them in the message, fenced.
- **A Markdown file** that has `<!doctype html>`, `<html>`, `<body>`, `<script>` or `<iframe>` in
  its first kilobyte is taken for HTML.
- **Size.** A file may be as large as the server's ceiling, 100 MB unless its operator changed it,
  and no larger than a cap the workspace set for pictures, videos or other files; sound counts as
  a file. `GET /v1/limits` gives the ceiling. Over either, the upload is refused `422` with a
  sentence giving both sizes.
- **A server without ffmpeg** keeps a video as it came: Play, but no poster, no length and no copy
  that plays everywhere.

## HTML pages

An HTML file opens as a page inside the app, in a frame that reaches nothing
([ADR 0059](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0059-a-page-a-harness-sends-opens-on-the-phone-in-a-view-that-reaches-nothing.md)).
It is recognised by its bytes: `<!doctype html>`, `<html>`, `<body>`, `<script>` or `<iframe>` in
its first kilobyte.

- **It fetches nothing.** No stylesheet, script, font, picture, sound, frame or connection loads
  from an address. A page that takes Tailwind from a CDN draws unstyled, and one that takes React
  from one stays blank. Everything goes inside the file: styles in `<style>`, script in
  `<script>`, SVG written inline, and pictures, fonts, sound and video as `data:` addresses. A
  `data:` sound or video plays on the phone, the web and the Mac.
- **Its script runs on the iPhone, Android, the web and the Mac**, so a mock's buttons and tabs
  work everywhere: on the web the frame loads the page from the server's page door, and in the
  Mac app from a door of the app's own, each under the page's own policy
  ([ADR 0201](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0201-a-page-a-harness-sends-is-served-from-a-door-of-its-own.md)).
  Draw what the page says in HTML all the same, and let script add to it, so it reads wherever
  it is opened.
- **Its links.** On the iPhone a link to the web opens in Safari, and a `mailto:` link in Mail. On
  the web and the Mac a link with `target="_blank"` opens a tab. On Android a page's links go
  nowhere.
- **Up to 5 MB.** A larger page is offered to share on the phone, and downloads on the web and the
  Mac.

A Markdown file's page is the whole of Markdown, a little more than a message draws: a bare address
is a link there, `~~strikethrough~~` draws, and pictures may come from any `http`, `https` or
`data:` address. HTML in it still shows as its tags.

## Asks

An [`approval.request`](/reference/events/approval-request/)'s `question` heads the card as one
sentence: a `` `code` `` span in it is set in a fixed-width face, since a question so often names a
command (``Run `date`?``), and any other mark shows as written, so write it plainly. Its `preview`
draws by its `format`, up to 200,000 characters:

| `format` | Draws |
| --- | --- |
| `markdown` | As a message's words, above. A size smaller on the card |
| `plain` | As text, kept as written. Four lines on the phone's card, and all of it in Details |
| `diff`, `json`, `table` | Fixed-width text, exactly as written. A `table` is not laid out as one, and a `diff` is not coloured |

For a table a person should read, send `markdown` with a Markdown table in it.

## What to tell the model

A harness that hands its model these few lines gets messages that draw as they were meant to:

```text
Your messages in Chips are Markdown. Bold, italic, inline code, links, headings, lists, quotes,
rules, tables and fenced code blocks all draw. Write a link as [words](https://…): a bare address
is not a link. HTML, strikethrough, task boxes, footnotes and maths show as their raw characters,
so don't use them. A picture is ![alt](https://…) from a public web address. Send an HTML page
as one self-contained file: styles, scripts, fonts and pictures inside it, since it fetches
nothing.
```
