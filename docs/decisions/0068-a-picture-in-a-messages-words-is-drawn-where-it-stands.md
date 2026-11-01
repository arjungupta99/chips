# 0068 — A picture in a message's words is drawn where it stands

**Status:** Accepted, 23 September 2026. Its line that tables stay out is replaced by ADR 0184
(16 October 2026): a message draws its tables, headings, lists and quotes. HTML still stays out.

## Context

Arjun asked J in Shopping to "show me how it looks". J answered with a Markdown image:
`![Blue LEGO Technic Tipping Dump Truck](https://www.lego.com/…/42203_boxprod_v39.png)`. Core's
Markdown had no images, so the room drew a stray `!` and a link, and he said "There is no image".
J then fetched the photo and sent it as an attachment, which worked. Asked why the first one
failed, J blamed itself for a tool call it had in fact made.

Core had left images out on purpose: "a chat that renders tables and images is a chat where a
harness can draw anything it likes on a person's screen" (`apps/mobile/src/spaces/Markdown.tsx`).
When the cause was put to him, Arjun decided: "If Chips is getting inline image, then it needs to
render it properly with good layout."

## Decision

1. **Core reads `![alt](src)` and `[![alt](src)](href)`** (`packages/core/src/markdown.ts`). A
   picture is a block of its own, `{ type: "pictures", pictures }`:
   - a paragraph with a picture in it is cut around the picture;
   - pictures with only white space between them, blank lines included, are one block.
   A title (`"…"`) is read and dropped. An address may contain parentheses in balanced pairs.
2. **Only an absolute `http(s)` source is drawn.** `javascript:`, `data:` and relative sources
   show the alt text as plain words. A relative source would be fetched from Chips's own
   server. Inside bold or italic, where a block cannot go, a picture is read as a link to itself;
   so is one handed to `parseInline` directly.
3. **It is laid out as a photo attachment would be**, on both clients:
   - **Phone:** one picture alone is `TILE_MAX` (240) wide. It takes its own shape once it has
     loaded, within the attachment tile's limits (`tileShape`, 3:4 to 1.8:1), and shows as 4:3
     until then. Shapes are remembered by address, so a room drawn again does not jump. Several
     pictures are square tiles, two to a row.
   - **Web:** the same `photo-grid` the attachments use.
   - Everything sits inside the bubble, between the words it was written among.
4. **A tap opens the picture, or what it links to**, in the phone's browser or in a new tab on
   the web. The media viewer is for attachments, and its deck is built from them. A picture that
   will not load shows its alt text as a link, so a message never shows an empty frame.
5. **The client fetches it from where it lives.** The web sends no referrer. The served page's
   CSP adds `http: https:` to `img-src`, which the desktop shell's CSP already allowed.

## Consequences

- A picture's host sees the viewer's address when the room is opened, not when a link is tapped.
  A harness is the person's own agent, and the alternative, chipsd fetching and proxying each
  picture, needs SSRF guards, size limits and a cache. That is not worth building until a
  shared workspace makes it matter.
- The markdown grammar is still small. Tables and HTML stay out, for the reason quoted above.
  (Tables, headings, lists and quotes came in with ADR 0184; HTML stays out.)
- The list's one-line preview (`plainWords`) shows a picture's alt text, or "Image".
- Pictures are not in the media viewer's deck. If they belong there, that is a change to
  `packages/core/src/viewer.ts` and to both viewers.
