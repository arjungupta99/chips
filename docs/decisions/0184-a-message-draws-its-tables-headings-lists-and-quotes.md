# 0184. A message draws its tables, headings, lists and quotes

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's "go with A".
Replaces ADR 0068's line that tables stay out of a message's grammar (HTML still does). Reads a
message's blocks with the reader ADR 0123 makes a Markdown file's page with.
Added to by ADR 0186: a table that scrolls says there is more of it (a fade and a dot per column).

## Context

On 16 October 2026 Arjun sent a screenshot of the Garage door replacement room: J's answer of 15
October about thermal bowing came through as `## Why it’s plausible for your door`, a table of
pipes and `|---|---|`, `- ` before each point and `> ` before a quotation. A message's grammar was
bold, italic, code, links, @mentions, fenced code and pictures (ADR 0068), and the rest was drawn
as typed. Only a `.md` file and the iPhone's Read full reply drew whole Markdown (ADR 0123).

The agents write these all the time. Of 550 agent messages in the month to 16 October, 16 held a
table, 22 a heading and 97 a list; 16 of the 19 tables had three to seven columns.

Three ways were mocked at phone width with his garage reply and the LEGO table from Riaan's
development (9 October): as now; **A**, a grid in the bubble that scrolls sideways when it does
not fit; **B**, each row a short entry under its first column. Headings, lists and quotes were the
same in A and B. Arjun picked A.

## Decision

1. **Core reads a message's blocks with `markdown-it`** (`packages/core/src/markdown.ts`), the
   reader `markdownPage` already uses, with its block rules alone. Raw HTML, indented code,
   `===`/`---` underlines and link references are off, so a chat line indented four spaces is
   words, `Done` over `---` is words and a rule, and `<div>` is its characters. Each block's words
   are still read by core's own tokenizer: @mentions, pictures (ADR 0068), the link rules and
   underscores are unchanged. The tree gains `heading`, `list` (ordered, from its start, items
   holding blocks), `quote`, `rule` and `table` (alignment, heading row, rows as wide as it). A
   table runs to a blank line, as GitHub's does.
2. **The phone draws a table edge to edge in its bubble**, a size down (15), its heading row tinted
   and bold in the quieter ink, a line under each row. Its columns come from `tableLayout`: each
   has the width its words take on one line and the least it can take (its longest word, never
   under 6.5 ems of a longer cell). A table that fits shares the bubble out by flexbox, as a browser
   shares a table; one that does not scrolls sideways inside the bubble, each column at most 14
   ems, so the room never does.
3. **A bubble holding a table is drawn at its widest** (`holdsTable`, `Line`), on its own side.
4. **A wide table's rows take the touch** and hand a long press back to the bubble (`HoldLine`), so
   it swipes and the message menu still opens on it.
5. **Headings are one size**, a step up (18) and bold, with a little more room above: a bubble is
   not a document and has no outline for levels to show. Lists hang their bullets and numbers in a
   gutter; quotes take a bar and the quieter ink; a rule is a line.
6. **The web and the Mac draw the elements they are**: `h3` to `h6` under the room's own headings,
   `ul`/`ol`, `blockquote`, `hr`, and a `table` in a box of its own that scrolls sideways. A bubble
   holding one may be 96ch rather than prose's 60ch. A column with a cell over 24 characters keeps
   7em through a block in each cell, since a browser does not hold a table cell to its min-width.
7. **A message's one line of words** (`plainWords`) says a heading, a list, a quote and a table by
   their words.

## Consequences

- J's answers read as he wrote them, on the phone, the web and the Mac. Nothing changes on the
  server or the wire; the phone needs a new build.
- No new dependency: `markdown-it` is core's since ADR 0123.
- **The walk found three things the suites could not** (simulator, iOS 26.5, a copy of the live
  rooms):
  - A bubble that hugs its words, holding a table, measured the rows in its sizing pass and kept
    that height: Riaan's development drew a 4,328-point bubble round 965 points of words and
    table, blank below them, painted over the lines after it. A strut, the scroller, the negative
    margins and the row lines were each taken out in turn and none was the cause; a bubble at a
    set width was. Hence point 3.
  - A sideways scroller's content is not held to its width, so in one the columns of a table that
    fits never gave any up: the garage table's guidance ran off the bubble. A table that fits is
    plain rows (point 2).
  - The press round each bubble kept every touch, so a wide table never moved. Hence point 4.
- `flex: 1` (a basis of nothing) on the words beside a bullet or a quote's bar would measure them
  at no width in a bubble that hugs its words; they start at their own width and shrink.
- Whether a table fits is first judged by the window's estimate of a bubble, then by the table's
  own measured width: the same number on a phone, so only an iPad's pane draws it twice.
- Column widths are estimated from character counts (SF Pro at about 0.53 em, bold 0.58, four
  points of slack, breaks after a hyphen, slash or dash), since React Native cannot measure words
  before it draws them. A misjudged column wraps a little more or less, never out of the bubble.
- HTML still stays out of a message, for ADR 0068's reason.

## Addendum, 17 October 2026: a table written without its line of dashes is still a table

In the OpenCode room big-pickle wrote a table with no line of dashes under its heading row, and
it drew as rows of pipes; Arjun: "there is another table in 'Open Code' last message 'Model,
Scaffold, Resolve Rate' that is not rendering". GitHub would not read it as a table either. A
message now does (`withDashes` in `packages/core/src/markdown.ts`): two or more lines that each
start and end with `|`, outside a code block, with the same number of cells and at least two, and
no line of dashes among them, are read with a line of dashes under the first, which is the heading
row; no column is aligned. Rows of differing widths, a single row and a single column stay words.
`holdsTable` reads the same, so the phone draws such a bubble at its widest (point 3). Of the 31
messages with pipes in Arjun's rooms that day, only that answer and its cut summary read
differently. A Markdown file's page (ADR 0123) keeps GitHub's rule.
