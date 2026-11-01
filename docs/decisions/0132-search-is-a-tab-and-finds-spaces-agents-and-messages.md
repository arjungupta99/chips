# 0132. Search is a tab, and finds spaces, agents and messages

Date: 6 October 2026
Status: Accepted, 6 October 2026. Phone (Phase 2 of `docs/proposals/search-plan.md`); the Mac and
the web on 7 October 2026 (Phase 5, the addendum below); the field's Cancel and the chips arriving
on the phone that night (the second addendum). Added to by
[0189](0189-searchs-results-arrive-glide-and-fade.md), 17 October 2026: the results arrive, glide
and fade rather than being swapped in a frame.

## Context

Arjun: "in chips I need the make the search really useful and highly polished. We probably need
it as a tab bar option. We should be able to search Space - tap takes to space, Agent - tap takes
to agent detail, Messages - tap takes to exact message on the space. show me mocks first." On the
mock (a private Artifact), "sounds good", which the plan reads as taking its three picks (§1):

1. **A · a tab of its own**, not B (the iOS 26 search slot, which would take the +'s place).
2. **The box on Spaces goes.**
3. **The words are marked in the bubble on landing** (Phase 3, ADR 0133).

What the phone had was one box over Spaces, "Anything said":

- It found messages only, never a space or an agent by name.
- It asked the server on every key from two letters, with no pause, and a slow answer could land
  over a newer one.
- It stripped the server's marks, so nothing found was marked.
- A tap opened the room at its foot, with the message found somewhere up its history.

What there was to build on: the server's search (`GET /v1/search`, SQLite FTS5 over messages,
voice-note words and run steps, newest first, paged), the room's landing on a line (`?at=line:`,
`?at=run:`, the gold `Flash`), the agent's page (`/agents/<id>`), and from Phase 1 core's
`search.ts` and `messageSearch.ts` (the plan's §3.2, §3.3 and §3.7).

## Decision

- **Search is a tab**, between Agents and You (`TABS` in `ui/tabs.ts`, `app/(tabs)/search.tsx`).
  It is an ordinary tab: the slot of the search kind at the bar's end stays the +'s. Four tabs
  and the + fit the iOS 26 bar with every word showing (the simulator, 6 October).
- **The field stands where the tab's name would**, on the same glass (`Screen`'s new `head`). The
  chips (All, Spaces, Agents, Messages) stand under it once something is typed: the chosen one is
  ink on the page's colour, flat.
- **The keyboard comes up** when the tab is chosen from another with nothing typed, and when the
  tab is pressed while it is in front; not on coming back from something opened from it, where
  the results wait as they were. A press on the tab in front reaches the navigator as `tabPress`
  (react-native-screens reports a repeated selection), which is what tells a press from a pop.
  The field takes the keyboard a frame after the tab is in front: UIKit puts the tab's view in
  the window after the navigator says so. Leaving the tab, or dragging the results, puts it away.
- **Cancel** stands beside the field while it is in use (it has the keyboard, or words in it), as
  a phone's own search does. It empties the field and puts the keyboard away.
- **Spaces and agents are found on the phone**, by name, from core's index (`searchIndex`): a
  space by its name or someone in it ("With Kit"), an agent by its name or its harness's.
  The index is kept while the tab is in front or something is typed, each new one handed the
  last, so a change to the workspace folds only the rooms it touched.
- **Messages are the server's**, through core's `messageSearch`: from two letters, after a 200 ms
  pause, the newest answer winning, the hits kept between keys, pages of 20 as the list nears its
  end. Two placeholder rows show only before the first answer.
- **A run's summary that repeats its own message is one row** (`messageSearch`'s `joined`). The
  room draws the two as one line, the message's, with the summary folded in (`closeOnLastSaid`);
  the server indexes both. Seen in his workspace on the walk: every Jacobian answer was listed
  twice, and the summary's row would have landed on no line. The older hit, the room's line,
  is kept; the same words by the same author in the same room over ten minutes apart stay two.
- **The results**, in one virtualised list (`UnderNameList`, a `FlatList` under the floating name):
  - All shows Spaces and Agents three each, then "See all N", which picks that chip; then
    Messages. A chip shows its kind alone, all of it.
  - A space: its face at 40 points (`Avatar`'s new `result`), its name with the typed part marked,
    who it is with or the member it was found by, marked, and when it last spoke.
  - An agent: its face, its name marked, the Agents tab's own line with the harness marked when
    that is what matched; Free in amber, Archived at the right.
  - A message: who said it and where ("in Chinatown dinner · thread" for a thread), when, and the
    server's words on two lines with the match marked. A voice note says so with a microphone, a
    step starts with `>_` and says "step in". A hit in a room this phone no longer has is left
    out.
  - The mark is `goldSoft` behind `goldDeep`, the room flash's colours (`Marked`).
- **States.** Nothing typed: the recent searches, or "Spaces, agents, and anything said in
  them." Nothing found: "Nothing for “…”", with what search looks at. The server out of reach:
  spaces and agents are still found, and Messages says "Can't reach your server. Messages are
  searched there." with Try again; once it is back, the search is asked again with no press. A
  failed ask: "The search didn't go through." with Try again.
- **Recent searches** are this phone's (prefs `search.recent`, `search/recent.ts` over core's
  `rememberSearch`): kept when the Search key is pressed (with the words as the field had them,
  not as the last render did) or a result is opened, at most eight, newest first; a tap runs one,
  × forgets one, Clear forgets all.
- **Where a tap goes.** A space: `/spaces/<id>`, its room at its foot. An agent: `/agents/<id>`,
  its page. A message: `/spaces/<id>?at=line:<lineId>`, a step `?at=run:<runId>`: the room at that
  line, centred and flashed gold. On a wide screen each redirects into its tab's split, as a link
  does.
- **The box on Spaces goes**, with its search call, its hits and `plainSnippet`.

## What is left out, and why

- **B, the iOS 26 search slot.** Not chosen: it takes the +'s place.
- **"In a space" and "From someone".** Later, if he asks. The server already takes `space_id`;
  "From someone" needs an `author_id` filter on the server.
- **Ranking by relevance.** Messages stay newest first, as the server returns them.
- **The words marked in the bubble, and a landing with no glide from the foot.** Phase 3,
  [ADR 0133](0133-a-message-found-opens-at-its-line-with-the-words-marked.md) (7 October 2026).
- **Rounded marks.** The mock drew the mark with corners; a mark is a `Text` inside the line's
  `Text`, so it wraps with the words, and inside a line a background has none.
- **The Mac and the web.** Phase 5, the addendum below.
- **Agents' memories, files and pages.** Search covers the names of spaces and agents and what
  was said in rooms.

## Consequences

- No server change, no protocol change, nothing in Jacobian or the bridge, no migration. Going
  live is `pnpm phone build`; 4431 is untouched.
- The web target's drawn bar shows four tabs too: it reads the same list.
- The mock said "Can't reach your Mac". The app calls the machine "your server" everywhere else
  (`NoRooms`, `Connection`), so the line does too.
- On the simulator, the first tap on a list row just after coming back from a pushed screen is
  sometimes not taken, on Spaces as much as on Search. It predates this, and is not touched here.
- On his iPhone (iOS 27.0.1) since 7 October 2026, 00:41 PDT; he searched and said "all fine"
  (Phase 4). Not walked: Android, the iPad.

## Addendum: the Mac and the web, 7 October 2026

On his "Run Phase 5", the desktop's Search page (the rail's Search, `apps/web/src/app/Search.tsx`;
the Mac app is the web app's own copy) finds what the phone's tab finds and opens each where the
phone does. It found messages only, by its own 250 ms pause and a More button.

1. **Spaces and agents are found on the computer**, from core's `searchIndex`, `findSpaces` and
   `findAgents`, on the first letter and with no connection. The chips (All, Spaces, Agents,
   Messages) show once something is typed, the chosen one ink on the page's colour. All shows three
   of each, then *See all N*. A space wears the rail's face (`spaceAvatar`), an agent its own.
2. **What is listed, and what each row says, moved into core** (`searchResults.ts`):
   `searchItems`, `spaceFoundLine` ("With Kit · 8:02 PM"), `hitAuthor`, `hitPlace`, `hitWords`,
   `closesRun` and `SEARCH_LOOKS_AT`. They were the phone's (`items.ts`, `Results.tsx`), and the
   desktop needs the same rules, as `spaceTitle` and `spaceList` went into core in Phase 1. The
   phone imports them now; it draws and does the same.
3. **Messages are asked for by core's `messageSearch`**: from two letters, after 200 ms, the
   newest answer winning, the hits kept between keys. The next page is asked for as the list nears
   its end (an `IntersectionObserver` at its foot), where More could append an older search's page.
   Two placeholder rows the first time. With no server, an amber line and Try again (the store's
   `wake`), and the search is asked again when the connection comes back. A failed ask says so,
   with Try again. A row is the author's face, "Kit in Chinatown dinner", the time, and two lines
   of the server's words, a voice note's and a step's saying so.
4. **The search outlives the page** (`SearchSession`, held by the shell): what was typed, the chip,
   the messages found and the last index. The page is taken down for every room opened from it, and
   it lost what was typed; now the way back finds it as it was.
5. **An agent opens its page** on the Agents tab (`Harnesses`' `initialAgent`). The rail's own
   choice of the tab opens its list, as before.
6. **A step lands on the line that closed its run** (core's `closesRun`, the phone's rule). It
   opened its room at the foot.
7. **The landed line marks the words searched for** (`Markdown`'s `marks`, by core's `wordMarks`,
   in plain, bold and italic words and mentions; code and links as they are), cleared 2.5 s after
   the room opens (`MARKS_MS`). A voice note and a step take none (`hitWords`). The mark is
   `--gold-soft` behind `--gold-deep` in a result and in the bubble (`Marked.tsx`). Here it can be
   rounded: `box-decoration-break: clone` keeps the corners when it wraps.
8. **Recent searches are kept on this computer** (`recentSearches.ts`, `localStorage` under
   `chips.search.recent`, each read and write in a try), remembered on Enter or on a result opened.
9. **The room's jump lands once, lands, and stays** (`MessageList.tsx`). Found while testing the
   landing, the first two by a unit test and the third on the walk:
   - The jump ran again on every render, since the room hands the list a new focus object each
     time it draws. A reader who scrolled on from the line found was pulled back to it by every
     event in the room, and by the room's own clock. It now runs once for each jump (its nonce),
     or when a line the room did not have yet arrives.
   - Its first aim counted the gap between rows twice. In a long room it ran past a row not yet
     measured, and that row was never drawn, so it was never centred. It now aims again with what
     the rows on the way measured, up to 12 times, until the row is drawn.
   - Up the history, nothing held the reader's place. The rows above are drawn at a guess (76 px)
     and measured as they come into the window, and a photo in one decodes later; each moved
     everything under it, and `.msgs` has the browser's scroll anchoring off (it fought following
     the end), which the Mac app's WebKit lacks anyway. In "design test space" the line found
     drifted from the middle to 672 px below it in three seconds, one step each time the room's
     clock re-drew it. The re-landing on every render had hidden this too. Now the row across the
     middle of the window is held where it stood (`held`): after each render, measure and resize,
     the scroller moves by however far it was pushed, as browser anchoring would. At the end
     `stick` still holds the last row.
   A test holds the first two (a jump to row 400 of 1,000 centres row 400, once, through two more
   lines arriving). The walk measured the third, frame by frame: the line's middle 0 px from the
   window's middle throughout, the scroller moving 1,688 → 2,132 px under it; and a reader who
   scrolled 900 px up from it stayed on the same row, 1 px from where they left it, for four
   seconds.

Also on the desktop, and not asked:

- **Rows off the screen are laid out only when they come near** (`content-visibility: auto`), and
  what is listed follows the field a beat behind under load (`useDeferredValue`), so a key is
  never held up by the rows it changes, under Spaces with every room listed.

### What is left out, and why

- **The landed line's blue outline.** The web marks the line a jump lands on with an outline (M5.4),
  where the phone flashes it gold. It stays: not asked.
- **Arrow keys through the results, and a shortcut to the page.** Not asked. Each result is a
  button in the tab order.

### Consequences

- No server change, no protocol change, no migration. Going live is `pnpm web:build` (4431 serves
  `apps/web/dist`, no restart) and `pnpm desktop`, on his word.
- The field is called "Search spaces, agents and messages" (it was "Search messages"); the tests
  and the e2e follow it.
- The phone's code changed only in where it imports these rules from. It needs no new build.
- Live on 4431's page (`pnpm web:build`) and the Mac app (`pnpm desktop`) since 7 October 2026,
  08:28 PDT, on his "go live". 4431 was not restarted.

## Addendum: Cancel and the chips arrive, on the phone, 7 October 2026

Arjun: "the cancel button appears abruptly. Animate the search text box resizing and cancel
appearing. The screen should look polished".

1. **Cancel rides in.** When the field takes the keyboard, the box narrows and Cancel rides in
   from the right edge beside it, fading up, over 0.32 s on a curve that is quick away and
   settles; it goes back the same way. Its room grows on the UI thread (Reanimated), and Cancel
   stands whole in a stand of its own that the room clips, so it slides rather than being fitted
   to the room a frame at a time (which cut it to "C…" and stalled the box half way). With Reduce
   Motion the box gives way at once and Cancel only fades (`ui/SearchCancel.tsx`).
2. **The chips arrive with their room made.** The chips come with the first letter typed. They
   were in the measured head, so the list learnt of them a frame or two late and the first results
   jumped down under them. Now the screen is told their height with them (`Screen`'s `under`): the
   list and the glass make room in the same frame, and the chips fade in and settle 6 points into
   place over 0.2 s (only fade, with Reduce Motion). The chips are a fixed 32 points, their words
   growing with the text size only as far as that holds.
3. Walked on a Release simulator: measured frame by frame, the box's edge eases in and out over
   about eighteen frames with no step back, Cancel slides in whole, and the first results stand
   where they end from the first frame. Not on the web, which has no Cancel.
