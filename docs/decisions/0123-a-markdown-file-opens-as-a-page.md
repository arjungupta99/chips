# 0123. A Markdown file opens as a page

Date: 5 October 2026
Status: Accepted, 5 October 2026. Extends 0059 (a page a harness sends opens on the phone, in a
view that reaches nothing) and 0100 point 8 (the same page on the Mac) from HTML to Markdown.
Leaves 0068 (the grammar of a message's own words) as it is.

## Context

On 5 October 2026 the Mission Murals Walking Tour room ended with the agent's finished work: an
eight-stop tour, `mission-murals-walking-tour.md`, 23 KB of headings, lists, bold labels and
sourced links, in its fourth version. On the phone a tap on its row opened the share sheet, since
only an HTML file opened in the app, and nothing on an iPhone draws Markdown. On the Mac it was a
download. Arjun asked whether it could be previewed, and whether `.md` files could show their
formatting.

The server sniffs `.md` and `.markdown` as `text/markdown`. Jacobian's agents hand their finished
work over in that form more than any other.

Two options were mocked on 5 October 2026, phone width, light and dark, with his real file drawn
as it would ship (kept out of the repo): **A**, the file is made into a page and drawn by the view
an HTML page already opens in; **B**, a native reader, growing the message grammar (`markdown.ts`)
with headings, lists, quotes and rules, drawn as native text, with no tables unless built by hand
and two renderers to keep in step. Arjun picked A ("go with A").

## Decision

1. **A Markdown file is a page.** Core's `isPage` takes `text/markdown` beside `text/html`, so
   every place that opens a page opens one: its row in the room and Files, on the phone, the web
   target and the Mac. The bar, Share or Download, the 5 MB limit and the share sheet on a build
   without a web view are 0059's and 0100's, unchanged.
2. **Core makes the page** (`markdownPage`), with `markdown-it` 15.0.2: the whole of CommonMark,
   tables and bare web addresses included. A file a person chose to open is a document, so it is
   drawn as one; the words of a message keep their small grammar, and a message is unchanged.
3. **The author's HTML is not part of it.** Raw HTML is escaped (`html: false`); `javascript:`,
   `vbscript:`, `file:` and `data:` links are refused by the library, a `data:` picture aside. The
   document's own policy is `default-src 'none'; img-src http: https: data:; style-src
   'unsafe-inline'`: no script, no frame, no font, nothing fetched but pictures. It is then drawn
   in 0059's view, which reaches nothing of the app's, so the page is held twice over.
4. **A link to the web or to mail opens outside it**, marked `target="_blank"`: in a new tab on
   the Mac and the web target, where a frame may not navigate the app; in Safari or Mail on a
   phone, through `pageLoad` as before. Any other link goes nowhere.
5. **It is drawn in the app's ink.** The client hands over its palette (light or dark, chosen or
   the system's) and its body size: 17 on a phone, as a message is set, and 15 on the Mac. The
   phone remakes the page when its appearance changes; the Mac reads its tokens as the page opens.
   The view's ground behind the page is the palette's, so dark mode opens on dark.

## Consequences

- An agent's report, plan or tour is read where it was sent, formatted, on every client. A table
  scrolls sideways in its own box rather than taking the page with it.
- One new runtime dependency in core, `markdown-it` (about 115 KB minified with its own
  dependencies), in the web and phone bundles. The CLI, the server and the relay do not import
  core and are unchanged.
- The phone needs a new build for it (`pnpm phone`); it is JavaScript only, on a build that already
  has the web view. The Mac needs its app rebuilt (`pnpm desktop`). No server change, no migration.
- The server still types a file by its bytes (`sniff.ts`): a `.md` whose first kilobyte holds
  `<script`, `<html`, `<body`, `<iframe` or a doctype is HTML, and opens as the HTML page it then
  is, its Markdown unformatted. Markdown with a `<br>` or a `<details>` in it is still Markdown.
- Plain text, JSON and CSV still open through the share sheet or as a download. They would be the
  same change with a different maker, and wait to be asked for.

## Addendum, 6 October 2026: a full reply is read as a page on the iPhone

Arjun: "fix the full-reply reader selection too". A handoff's **Read full reply** drew the reply in
the bubble's own `Markdown`, one `Text` a paragraph. On iOS a selectable `Text` copies itself whole,
so a long press there copied one paragraph and no handles came up. On an iPhone the reader now
makes the reply into a page with `markdownPage`, as a file is made here, and draws it in the page
view (0059) on the sheet's own ground, faded in once drawn as a file's page is. A finger then
selects from a word in one paragraph to a word in the next, across a list or a code block.

- It follows this ADR's grammar, not the bubble's: a list is a list and a heading a heading, where
  the bubble shows `-` and `#`. The bubble is unchanged.
- A link opens outside the app, as on any page. Pictures load as a page's do.
- A build without the web view, or a page that cannot be drawn, shows the bubble's words as before.
  Android keeps them too: its selectable `Text` takes a range within a paragraph. So does the web
  target, where the browser selects across the page.
- Walked on the simulator (iOS 26.5, Release, a scratch server's handoff): a press picked
  "Ritual", the end handle dragged across both list items, and Copy put exactly those two items on
  the pasteboard.

## Addendum, 18 October 2026: Select text reads a message the same way

Arjun: "When we long press text --> Select Text --> The text renders without markup. Please render
it with markup". The message menu's Select text put the message's Markdown, `**` and all, in a text
view nobody could edit (6 October), so a finger could select part of it. It is now the same reader
as a full reply: the page above on a phone, the bubble's own `Markdown` where there is no page.
What a finger copies is the words without their marks. Copy text and Share text still give the
Markdown as written (AN-28).

- The page stands on the sheet's own ground, with code a step down from it (`useGround`, ADR
  0192). Since ADR 0192 gave sheets the grouped ground it had stood on the paper, a lighter band
  across a light sheet, in the full reply's reader too. Dark is unchanged: there the grouped ground
  is the paper.
- Android reads it as the same page, and so does a hand-off's full reply there. Drawn as the
  bubble's `Markdown`, a `Text` a paragraph, a selection on Android stopped at its paragraph's end,
  where Select text's raw `Text` had taken the whole message. The web target keeps the bubble's
  words, which the browser selects across. On a sheet the page shares a finger with the sheet's
  pull as a list does (ADR 0175): off its top, Android's page keeps the finger
  (`nestedScrollEnabled`), so a drag down scrolls it back; at its top a pull down takes the sheet.
  Without that, the pull took every drag down, and a page scrolled down could not come back up.
- Walked on the emulator (`chips-pixel-9`, Android 16, WebView 133, a debug build on Metro, a
  scratch server): a reply with bold, a list, inline code and a code block drew formatted with no
  marks. A press picked "Ritual", the end handle dragged across both list items into the next
  paragraph, and Copy gave `Ritual on Valencia, pour-over at brew 4m`, `Sightglass on 20th, the
  Owl's Howl espresso` and `Both open at seven. Ritual is`. With the page scrolled, a selection
  from the code block into the paragraph under it copied as `bus:  22 to 16th` and `Paragraph 1:
  more words…`. The page scrolled down and back, and a pull at its top took the sheet. On a Mac
  under heavy load the page's first draw once waited about nine seconds for Chromium's renderer.
- Walked on the simulator (iOS 26.5, a Release app with this JavaScript, a scratch server): a reply
  with bold, italics, a list, a heading, a quotation and code drew formatted in light and dark, and
  a selection from "Ritual" into the second list item copied as `Ritual on Valencia, pour-over at
  brew 4m` and `Sight`, with no marks.
