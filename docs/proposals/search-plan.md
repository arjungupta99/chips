# Search — a tab that finds spaces, agents and messages, and opens each where you'd expect

**Plan of record, 6 October 2026. Status: Phase 1 done (6 October 2026, 22:45 PDT); Phase 2
done (6 October 2026, 23:30 PDT, ADR 0132); Phase 3 done (7 October 2026, ADR 0133); Phase 4
done (7 October 2026, 00:45 PDT: both on his iPhone, "all fine"); Phase 5 done (7 October 2026,
01:50 PDT, ADR 0132's addendum; live on 4431's page and the Mac app at 08:28).** Arjun: "in chips I need the
make the search really useful and highly polished. We probably need it as a tab bar option. We
should be able to search Space - tap takes to space, Agent - tap takes to agent detail, Messages
- tap takes to exact message on the space. show me mocks first." Then, on the mocks: "sounds
good. Build a detailed plan with phases. I will execute after compaction." Each phase is run
from its prompt in §9, after a compaction. Phone only, plus `@chipschat/core`; Phase 5 (Mac and web)
is optional. No server change, no migration, nothing in Jacobian or the bridge.

The mock is a private Artifact: <https://claude.ai/artifact/FhnrZXnQRH1ZSqAvp9wKbX>. Its source
is in the scratchpad of the session that drew it, and it stays out of the repo.

In one line each:

- **Search is a tab of its own**, between Agents and You. The + stays in the bar's last slot.
- **It finds three things.** Spaces by name and by who is in them; agents by name and by
  harness; messages through the server's existing index, voice-note words included.
- **Each opens where you'd expect.** A space opens its room. An agent opens its page. A message
  opens its room at that message, centred and flashed gold, with the words you searched marked
  for a moment.
- **The box on Spaces goes.** One place to search.

## 0. How to use this document

- **Order.** Run the phases in order. Phase 1 is core alone and changes nothing anyone sees.
  Phases 2 and 3 are each shippable on their own: after Phase 2 a message opens its room at the
  message, with the flash the room already does; Phase 3 makes the landing instant and marks the
  words.
- **Before each phase:**
  - Read §1 to §3, the phase itself, and the memory notes `chips-search-tab`,
    `chips-main-is-shared-between-sessions`, `chips-working-agreements`,
    `arjun-judges-ui-from-running-mocks`, `chips-phone-testing` and `arjun-merge-as-you-go`.
  - Run `ListAgents`, read `git reflog show main -5`, and check `git log origin/main..main`.
  - Bring this worktree's branch up to main with `git rebase main` (main stays linear: replay,
    never merge), then `pnpm install --frozen-lockfile` in the worktree. A worktree's install
    can predate the lockfile, and `apps/mobile` had no `node_modules` here on 6 October.
- **Where.** The worktree `.claude/worktrees/chips-search-feature-9238cf`, branch
  `claude/chips-search-feature-9238cf`. If it is gone, make a new worktree from main on a
  `claude/search-*` branch.
- **Commits.** Conventional Commits, made with `git -c commit.gpgsign=false commit -s`, ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fast-forward main as each phase
  lands (merge as you go). Before the fast-forward, `ListAgents` and the reflog again; if a peer
  has just moved main, replay onto a new named branch from main, never a detached HEAD.
- **Gates.**
  - `pnpm check` (lint, typecheck, Vitest, the phone's Jest).
  - The guardrails (`tools/guardrails`) after `git add` and before the fast-forward. The gate
    command must fail the chain on a red: read exit codes, don't grep the output.
    `harness-literals` and `no-harness-named` refuse harness names and `kind: "harness"`
    literals in product code and tools; a test fixture's harness is called something neutral.
  - The phone's Playwright suite (`pnpm mobile:e2e`, port 5198) for Phases 2 and 3. It shares
    4432 and 4433 with the web suite: never run the two together, and never beside
    `pnpm check`.
  - The web e2e (`CHIPS_E2E_WEB_PORT=5199`) only in Phase 5.
  - Biome's complexity limit is 12: split a component before it grows past it.
- **UI.** He judges from the mock and then from his phone. Controls stay flat, with no gradients
  or highlights; anything cool goes into motion. Walk each phase on the iPhone 17 Pro simulator
  as a Release build before saying it works, with stills of what changed. Say plainly what was
  not walked: Android, iOS 27, and the iPad.
- **Go-live, only on his word.** Phases 2 and 3 are phone JavaScript: `pnpm phone build` puts
  them on his iPhone, and it builds from main, so fast-forward first. Neither restarts 4431.
  Phase 5 is `pnpm web:build` (4431 serves `apps/web/dist`, no restart) and `pnpm desktop`.
- **Push only on his word.** Say which peers' commits a push would carry.
- **Docs.** An ADR for each decision (§8); `docs/STATUS.md`, newest first under "In progress";
  the `chips-search-tab` memory note. Update STATUS and memory at the end of each phase and
  before any compaction.
- **Reports.** Each phase ends with:
  - gates and counts;
  - stills from the simulator walk;
  - what is on main, what is on his phone, and what is not pushed;
  - the next phase's prompt from §9.

## 1. Rulings taken (Arjun, 6 October 2026)

His "sounds good" on the mock is read as taking the three picks the mock recommended. If any of
these is wrong, change it before Phase 2:

1. **A · a tab of its own.** Not B: the iOS 26 search slot would take the +'s place, and the +
   would move up beside the word Spaces.
2. **The box on Spaces goes.** It doesn't stay as a filter of that list.
3. **The words are marked in the bubble on landing**, as well as the gold flash.

Also as drawn in the mock, and not asked separately:

4. **Recent searches** live on this phone only (prefs), newest first.
5. **No server change.** Narrowing messages "In a space" or "From someone" is later (§3.6).
6. **Mac and web come second** (Phase 5), only if he wants them.

## 2. Why (read 6 October 2026)

What the phone had: one box at the top of Spaces ("Anything said", `apps/mobile/src/spaces/List.tsx`):

- **It finds messages only.** A space or an agent can't be found by name.
- **It searches on every key** from two letters on, with no pause.
- **It shows plain words.** `plainSnippet` strips the server's marks, so nothing found is
  marked. Each hit sits in a card under its room's name.
- **A tap opens the room at its foot** (`onOpen(hit.spaceId)`), not at the message. The message
  found is up the history, out of sight.

What is already there to build on:

- **The server's search.** `GET /v1/search` is SQLite FTS5 over messages, voice-note
  transcripts (ADR 0054) and run steps (receipts), limited to the reader's spaces, newest first,
  paged by cursor (`server/src/infrastructure/store/read-models.ts`, `ftsQuery`). The last word
  is prefix-matched, so hits come as you type, and it takes `space_id`. Core's `store.search`
  (`packages/core/src/store.ts`, `SearchInput`, `SearchHit`, `SNIPPET_OPEN`/`SNIPPET_CLOSE`)
  wraps it.
- **The room can land on a line.** `/spaces/<id>?at=line:<lineId>` (or `at=run:<runId>`, which
  lands on the run's closing line) scrolls the line to the middle and flashes it gold
  (`useLanding` in `SpaceView.tsx`, `parseTarget`/`targetIndex` in `spaces.ts`, `Flash` in
  `Motion.tsx`). It retries as lines arrive, so a room whose replay is still coming lands when
  the line does. On a wide screen `/spaces/[id]` redirects to the Spaces tab's split with the
  same `at`.
- **The agent's page** is `/agents/<id>`. On a wide screen it redirects to the Agents tab's
  split.
- **The web app** (`apps/web/src/app/Search.tsx`, the rail's Search tab) already finds messages,
  marks the words and opens the room at the line. It finds no spaces and no agents.

## 3. The design

### 3.1 The tab

- `search` joins `TABS` in `apps/mobile/src/ui/tabs.ts`: title "Search", SF Symbol
  `magnifyingglass`, Material `search`, drawn mark `search` (already in `icons.ts`).
  - `TAB_ORDER` becomes `index, agents, search, you, runtime`.
  - The phone's `NativeTabs` and the web target's drawn bar both read that list, so both get it.
  - The + keeps the `role="search"` slot it has (`app/(tabs)/_layout.tsx`).
- The route is `app/(tabs)/search.tsx`. The screen lives in `apps/mobile/src/search/`.
- **The field stands where a tab's name would.** The tab's name is for the bar and VoiceOver.
  - Cancel comes in beside the field while it has the keyboard.
  - It is `ui/Search.tsx`, grown to take `autoFocus`, `onSubmit` (the Search key), a ref to
    focus it, and Cancel.
- **The keyboard comes up** when the tab is chosen from another tab with the field empty, and
  when the tab is pressed while already showing. It doesn't come up on returning from a room
  pushed over the tab: the results are waiting where they were. Dragging the results puts it
  away (`keyboardDismissMode="on-drag"`).
- **The query and results survive** a push and a pop: they are the tab screen's state, and the
  tab stays mounted under the root stack.

### 3.2 What it finds (core, shared with the web)

A new `packages/core/src/search.ts`. Pure functions, with no store and no React. As built in
Phase 1, the names are found through an index (§3.7); the rules below are unchanged by that.

- **Terms.** `searchTerms(text)`:
  - lower case, diacritics folded (NFD, combining marks dropped, as FTS5's `unicode61` does);
  - split on white space, at most 8 terms (as `ftsQuery`).
  - A word is a run of letters or digits (`\p{L}\p{N}`), so `@ChinatownWalkingTour` is one word
    and `6–10` is two.
- **The index.** `searchIndex(model, directory, selfId, previous?)` folds every room's name, its
  members' names and every agent's and harness's name into words. Handed the last index, it
  takes back each room entry whose `Space` is the same object under the same directory, so a
  model change re-reads only the rooms it touched. `findSpaces` and `findAgents` take the index
  and the terms.
- **Spaces.** `findSpaces(index, terms)`:
  - A space matches when every term starts a word of its title (`spaceTitle`, the name the
    reader sees). Failing that, it matches when every term starts a word of one of its
    members' names; that row says "With Kit".
  - Threads (a `parentSpaceId`) are left out; they aren't listed anywhere.
  - Order: name matches before member matches, open before closed, then the Spaces list's own
    order (`spaceList`, last activity first). A closed space is marked Closed.
- **Agents.** `findAgents(index, terms)` over the directory's agents:
  - An agent matches when every term starts a word of its name, or of its harness's name (so
    `openclaw` lists OpenClaw's agents).
  - The line under the name is core's `agentLine`, the Agents tab's own. Rows are drawn for the
    agents found only (`agentsTab(…, { only })`), in the tab's order.
  - Archived agents come last, marked.
- **Marks.**
  - `nameMarks(text, terms)`: the ranges to mark in a name, being the typed prefix of each word
    a term starts ("Chin" of "Chinatown").
  - `wordMarks(text, terms)`: the ranges to mark in a message, by the server's rule. A whole
    word is marked when it equals one of the terms before the last, or starts with the last.
    This is what FTS5's `snippet()` marks, so a bubble and its result row agree.
- **Snippets.** `snippetParts(snippet)` splits a server snippet at `SNIPPET_OPEN` and
  `SNIPPET_CLOSE` into `{ text, marked }[]`. It replaces the phone's `plainSnippet`, which only
  stripped the marks, and can take the web's `marked()` in Phase 5. `markedParts(text, marks)`
  cuts a name or a run of text at `nameMarks` or `wordMarks` the same way, so every client draws
  marks from one list of pieces.
- **Recents.** `rememberSearch(list, text)`: newest first, the same words (case and accents
  folded) once, at most 8, blank ignored. `forgetSearch(list, text)` takes one out.
- **What a room is called** (`spaceTitle`) and **which rooms a list shows** (`spaceList`) moved
  into core (`model/readers.ts`) in Phase 1: the phone's and the web's copies were the same rule,
  and search needs it. Both clients import core's now.

### 3.3 The results

Drawn as the mock draws them (section 1, phone A):

- **Scope chips** under the field: All, Spaces, Agents, Messages. They show once something is
  typed. The selected chip is ink on the page colour, flat. A new `ScopeChips` in `src/search/`:
  neither `Choices` (a radio list) nor `Segment` (autonomy) fits.
- **Sections in All:**
  - Spaces, up to 3, then "See all N", which selects the Spaces chip.
  - Agents, up to 3, the same.
  - Messages.
  - Each section has an uppercase heading in `ink3`, like the list's own headings.
- **A space row:**
  - the space's face at 40 pt (add an Avatar size `result: 40`, or use `md` 36 if 40 reads no
    better on the simulator);
  - the name, with the typed part marked;
  - "With Kit · 8:02 PM" (members from `spaceSubtitle`, the time from `when.ts`);
  - a chevron.
- **An agent row:** the agent's face (`AgentFace`) at the same size, the name marked, `agentLine`
  under it (Free in amber), and a chevron.
- **A message row:**
  - the author's face at 36 (`md`);
  - "Kit in Chinatown dinner" (a thread: "in Chinatown dinner · thread"), with the time at the
    right;
  - the snippet on two lines with the words marked.
  - A voice note's snippet starts with a mic glyph and "voice note". A receipt's says "step in"
    and starts with `>_`.
  - A hit whose space isn't in the model (a room left since) is dropped.
- **The mark** is `goldSoft` behind `goldDeep` ink, radius 4. It is the same colour as the
  room's flash, so the result and the landing read as one thing.
- **Messages are fetched** by core's `messageSearch(store.search)` (`messageSearch.ts`, built in
  Phase 1), which the phone wraps in `useMessageSearch` with `useSyncExternalStore`, and the web
  takes in Phase 5:
  - from two letters, after the typing pauses 200 ms;
  - one request at a time is wanted: a newer one wins, and an older answer is dropped, the first
    page and every later one alike (the web's More can append an old query's page today);
  - the hits on screen stay until new ones land, so the list never goes blank between keys;
  - two placeholder rows show only the first time, when there is nothing to keep (`answered`);
  - pages of 20, with the next page fetched as the list nears its end (`onEndReached` → `more`);
  - `retry` asks again at once, for the first page or the next, whichever failed;
  - `hitKey(hit)` is each hit's list key.
- **States:**
  - **Nothing typed.** Recent searches with a clock glyph; a tap runs one again, × forgets it,
    and Clear forgets all. With none: "Spaces, agents, and anything said in them."
  - **Nothing found.** "Nothing for “…”", with what search looks at.
  - **Offline** (`snapshot.connection !== "open"`). Spaces and agents are still found. Messages
    show an amber line, "Can't reach your Mac. Messages are searched there.", with Try again
    (`store.wake`).
  - **A failed request.** "The search didn't go through." with Try again.
- **A search is remembered** (prefs `search.recent`, `prefs.ts` and `prefs.web.ts`) when its
  Search key is pressed or one of its results is opened.

### 3.4 Where a tap goes

- **A space:** `router.push("/spaces/<id>")`, which opens the room at its foot, as from Spaces.
- **An agent:** `router.push("/agents/<id>")`, which opens its page, as from Agents.
- **A message:** `router.push("/spaces/<spaceId>?at=line:<lineId>&words=<text>")`. A receipt
  uses `at=run:<runId>`. `words` arrives in Phase 3, and Phase 2 sends `at` alone.
- **On a wide screen** (iPad, the web target) the same routes redirect into the Spaces or Agents
  split, as a link does today. `words` has to ride the redirect (Phase 3).

### 3.5 The landing (Phase 3)

- **It opens at the line.** The room opens with the line found in the middle and no glide up
  from the foot first. Today `useLanding` scrolls animated once the line is laid out, so a room
  opened from a result visibly travels from its newest line.
  - The room holds its list unseen for the frame it takes to place the line, then shows it.
  - **It must not scroll inside a mount.** That deadlocked the app on 6 October (ADR 0130,
    fault 3). The scroll goes after the mount (the list's first `onLayout`, or the next frame),
    never from a layout transition.
  - Measure it first on the simulator; choose the smallest mechanism that lands without a
    visible move.
  - A line not laid out yet still goes through `onScrollToIndexFailed`: roughly there, then
    exactly.
- **The flash is unchanged** (`Flash`: `goldSoft`, 500 ms full, 1,400 ms fade).
- **The words are marked in the bubble.**
  - `words` reaches `SpaceView` (and `RoomPane` on a wide screen). The flashed line's `Markdown`
    gets `marks: terms`, and its text runs (plain, bold, italic, mentions) are split by core's
    `wordMarks`. Each match is wrapped in a nested `Text` with the result row's mark colours.
  - Code blocks and links are left unmarked.
  - The marks clear 2.5 s after landing, once the flash has faded. They clear as a state flip,
    not a fade: a nested `Text` can't animate on the native driver. This is the mock's one
    departure, and it should be told to him.
  - A voice note's words aren't drawn as text in the bubble, so a voice note gets the flash
    alone.

### 3.6 What is deliberately not here

- **"In a space" and "From someone."** The server already takes `space_id`, so "In a space" is
  phone work. "From someone" needs an `author_id` filter on the FTS query, the route and
  `SearchInput`. Both are later, if he asks.
- **Ranking by relevance.** It stays newest first, as the server returns. bm25 is for later, if
  he asks.
- **The iOS 26 search slot (B).** Not chosen.
- **Searching inside one room**, from its sheet. Not asked for.
- **Agents' memories, files and pages.** Search covers what was said in rooms and the names of
  spaces and agents.

### 3.7 Performance and scale (his ask, 6 October 2026)

During Phase 1 he asked: "please also make sure the search feature is performant, has a great
architecture, and is scalable". What that changed:

- **Nothing heavy on a key.** Every name is folded into words once (`searchIndex`), and a key is
  a prefix test on folded words. Plain ASCII is folded by `toLowerCase` alone.
- **A model change costs the rooms it touched.** The fold hands back an untouched space by the
  identity it had; the index takes those entries back. A new directory, which is rare, folds
  everything again.
- **Agent rows only for agents found.** `agentLine` reads the agent's room. It walked every room
  to find it, for every agent, on the Agents tab and in search alike. Core's `spaceById(model,
  id)` now looks a room up in a map made once per model. Finding agents for "c" at 10,000 rooms
  went from 3.3 ms to 0.7 ms.
- **Messages are the server's index.** FTS5, keyset-paged, limited to the reader's rooms; the
  client asks once per pause and drops stale answers.
- **Measured:** `pnpm bench:search [rooms]` (`packages/core/bench/search.ts`). At 10,000 rooms,
  1,000 agents and 5,000 people on the Mac mini: the worst key 2.3 ms ("c", 6,750 rooms found),
  an index update after a message 1.6 ms, the index from nothing 15 ms. It fails over 4 ms a key.
  It grows with the rooms: 38 ms a key at 100,000. His workspace has about 70.
- **For the phone (Phase 2):** build the index in the screen with `useMemo` over the model and
  directory, handing the last one from a ref, and only while the tab is focused or something is
  typed, since the tab stays mounted under the stack. Draw results in a virtualised list.
- **Not done, and why.** A sorted word index would make a narrow search sublinear in rooms, but a
  broad one costs the rooms it finds anyway, and 10,000 rooms is well inside a frame. Aborting a
  superseded request needs an `AbortSignal` through `store.search`; dropping its answer is
  enough while one request in flight costs the server under 200 ms.

## 4. Phases

Each phase lists what changes, its tests, its walk and its go-live.

### Phase 0 — the mock (done, 6 October 2026)

The private Artifact above, kept out of the repo. It drew Today, A and B; the three taps; recent
searches, Messages only, nothing found and offline; the rules; and the decisions. His picks are
§1.

### Phase 1 — core: what search finds (no UI) — done 6 October 2026

As built: `search.ts` with the index (§3.7), `messageSearch.ts`, `spaceTitle`/`spaceList`/
`spaceById` in core's `model/readers.ts`, `agentsTab(…, { only })`, `bench/search.ts`. Tests:
`search.test.ts`, `messageSearch.test.ts`, `model/readers.test.ts` (the title and list tests
moved from the phone's `spaces.vitest.ts`), `agentsTab.test.ts`.

- **`packages/core/src/search.ts`**, as §3.2: `searchTerms`, `findSpaces`, `findAgents`,
  `nameMarks`, `wordMarks`, `snippetParts` and `rememberSearch`.
  - Exported from `packages/core/src/index.ts`.
  - `spaceTitle` and `spaceSubtitle` live in the phone (`apps/mobile/src/spaces/spaces.ts`).
    Read how the web names a room (`apps/web/src/app/SpaceView.tsx` `spaceTitle`) and move the
    shared rule into core if the two agree. If they differ, `findSpaces` takes a
    `titleOf(space)` function. Don't fork the rule.
- **Tests:** `packages/core/src/search.test.ts`, including fast-check where it pays:
  - diacritics (`café` finds `Cafe`), case;
  - multi-term (`chin tour`);
  - prefix only on the last term for messages, every term for names;
  - `@ChinatownWalkingTour` as one word, `6–10` as two;
  - a member match ("With Kit") ranked after name matches;
  - threads left out; closed after open; archived agents last;
  - a harness name finding its agents;
  - `snippetParts` on a snippet with no marks, adjacent marks, and a mark at either end;
  - `rememberSearch` dedupe and cap.
- **No ADR yet.** The decision is recorded with the tab in Phase 2.
- **Gates:** `pnpm check`, guardrails. Fast-forward main. Nothing to take live.

### Phase 2 — phone: the Search tab, and the box on Spaces goes (ADR 0132)

As built, 6 October 2026 ([ADR 0132](../decisions/0132-search-is-a-tab-and-finds-spaces-agents-and-messages.md)):
`src/search/` holds `SearchScreen`, `Results` (the rows), `items.ts` (what the list shows, pure;
`results.ts` collided with `Results.tsx` on this case-blind disk), `ScopeChips`, `Marked`,
`useMessageSearch` and `recent.ts`. `Screen` takes a `head` in place of the name, and
`UnderNameList` is `UnderName` as a `FlatList`. Where it differs from the bullets below:

- **`tabPress` reaches an ordinary trigger** while it is in front (a repeated selection), checked
  on the simulator first. The field takes the keyboard a frame after the tab is in front: focused
  at once, coming back from another tab raised nothing.
- **Cancel** shows while the field has the keyboard or words in it (the mock showed it with words
  and no keyboard), and empties the field.
- **A run's summary that repeats its message is one hit** (core `messageSearch`, `joined`): every
  Jacobian answer was listed twice on the walk, and the summary's row lands on no line.
- **The Search key keeps the field's own words**: the last render's lost a letter typed just before
  Return.
- **"Can't reach your server"**, the app's word for it, where the mock said "your Mac".
- The mark has square corners: a nested `Text` has none.

- **The tab.** `tabs.ts` (§3.1), with `tabs.vitest.ts` and `TabBar.test.tsx` updated (the web
  target's bar shows four).
  - `app/(tabs)/search.tsx` renders `src/search/SearchScreen.tsx`.
  - Under `NativeTabs` the new trigger is an ordinary one, and the + slot is untouched.
  - Check on the simulator that four tabs and the + fit the bar (five tabs in a development
    build, with Runtime).
- **The screen** (`src/search/`, split to stay under Biome's limit of 12):
  - `SearchScreen.tsx`: the field, Cancel, the chips, and the list (a `SectionList` or one
    `FlatList` of typed rows);
  - `Results.tsx`: the rows;
  - `ScopeChips.tsx`;
  - `useMessageSearch.ts`: core's `messageSearch` under `useSyncExternalStore`, closed on
    unmount;
  - `recent.ts`: over prefs, using core's `rememberSearch` and `forgetSearch`.
  - The index: `searchIndex` in a `useMemo`, handed the last one from a ref, built only while
    the tab is focused or something is typed (§3.7).
  - Faces: `Avatar` for spaces and people, `AgentFace` for agents.
  - Times: `when.ts`.
  - Marks: core's `markedParts` (from `SpaceFound.marks`, `AgentFound.marks` and `lineMarks`) and
    `snippetParts`, drawn as nested `Text`.
- **Focus.** §3.1's rules for when the keyboard comes up.
  - Whether a plain `NativeTabs.Trigger` gets `tabPress` while already selected is the first
    thing to check. The + trigger uses `listeners={{ tabPress }}` today.
  - If it doesn't, focus on `useFocusEffect` only when the field is empty and the tab was
    entered from another tab: track the last tab in a ref, and don't focus after a pop.
- **Taps** as §3.4, without `words`.
- **The box on Spaces goes.** `List.tsx` loses `Search`, the `hits` state, the search call,
  `Hits` and `plainSnippet` (core's `snippetParts` replaces it). `List.test.tsx`'s search tests
  move to `SearchScreen.test.tsx`.
  - Read `List.tsx` as main has it. The empty-states session changed it on 6 October (ADR 0131,
    `85fd6fbd`): the box now hides when the server says there are no rooms (`look === "none"`).
    Keep its empty states intact.
- **Tests:**
  - **Jest, `src/search/SearchScreen.test.tsx`:**
    - typing finds a space and an agent from the snapshot, with the typed part marked;
    - messages: no call under two letters, one call after the pause, an older answer dropped;
    - See all selects its chip;
    - offline shows the amber line and still lists spaces and agents;
    - a failed request shows Try again;
    - recents are saved on Search and on opening a result, × forgets one, and Clear forgets all;
    - each tap pushes the right route: a space, an agent, `at=line:`, `at=run:`;
    - a hit whose space isn't in the model is dropped.
  - **Elsewhere:** `List.test.tsx` (no box, empty states as before), `tabs.vitest.ts`,
    `TabBar.test.tsx`.
  - **Phone Playwright, a new `apps/mobile/e2e/search.spec.ts`,** on the web target against
    the suite's scratch chipsd:
    - seed a room with a line holding an unusual word;
    - open the Search tab, type the word, and see the space row and the message row;
    - tap the message, and see the room open with `flash-<lineId>` visible.
- **Walk** on the iPhone 17 Pro simulator, Release, against a scratch chipsd over a `.backup`
  copy of his workspace (recipes in `chips-phone-testing` and `testing/phone.md`). Never pair a
  new device to 4431. Stills of:
  - the empty tab with recents;
  - "chin" typed;
  - the Messages chip;
  - offline;
  - each tap's destination.
- **ADR 0132** "Search is a tab, and finds spaces, agents and messages". Take the next free
  number at the time; another session may take 0132 first. It quotes §1 and covers §3.1 to
  §3.4. Shape as ADR 0112: Context, Decision as bold-led bullets, "What is left out, and why",
  Consequences.
- **Testing:** a new `testing/scenarios/rooms/search.md` from `TEMPLATE.md` (prefix `SR`), linked
  from `testing/scenarios/README.md` and from `testing/findings.md`'s prefix table. Its by-hand
  steps on his iPhone are for Phase 4.
- **Go-live, on his word:** `pnpm phone build` from main.

### Phase 3 — phone: a message opens at its line, with the words marked (ADR 0133)

As built, 7 October 2026 ([ADR 0133](../decisions/0133-a-message-found-opens-at-its-line-with-the-words-marked.md)).
Filmed before on the simulator: a line 4 rows up glided ~250 pt from the foot as the room slid in,
and one 174 rows up took ~2 s through the history. After: placed unseen, then faded up at the line,
lit, the words marked (79 ms and 778 ms from the room's mount), and nothing moves after. Where it
differs from the bullets below:

- **A line far up needs every row to it drawn**: a list with no `getItemLayout` ends its content at
  the last row it measured. While placing, the list's `initialNumToRender` reaches the line and
  eight past it, and drops back 2.5 s after the room shows. The rough jump is made only in view.
- **That drawing waits for the stack's `transitionStart`** (`inView`): drawn at the mount, it kept
  the bar's name and back button off the screen for the whole slide (they are committed through
  JavaScript). Chunked drawing was tried both ways and was worse.
- **`words` is not sent for a voice note or a step**: a voice note's words were heard, not drawn,
  and a step's run lands on the line that closed it. A file's *Go to message* clears it.
- **`Marked` moved to `ui/Marked.tsx`**, with `MarkedParts` for a `Text` already there.
- **The media viewer's scroll to a line** shares the room's `useRowScroll`, re-asking each frame in
  place of the 120 ms wait.

- **Read ADR 0130 and its STATUS entry first.** The room's scrolling was rebuilt on 6 October,
  and a scroll inside a mount deadlocks.
- **The landing** as §3.5, in `useLanding` (`SpaceView.tsx`). Measure before and after on the
  simulator: film a landing 200 lines up a room. Use the probe and film recipes in
  `chips-send-flight-one-body` and `chips-room-follows-answer`, and `sample` if anything hangs.
- **`words` end to end:**
  - `SearchScreen` adds it to the push;
  - `app/spaces/[id].tsx` reads it and passes it on its wide-screen redirect;
  - `app/(tabs)/index.tsx` gives it to `RoomPane`;
  - `SpaceView` takes `words` and gives `marks` to the flashed line's `Markdown`
    (`Line.tsx` → `Markdown.tsx`).
- **Marks in `Markdown.tsx`:** `Runs`/`Run` split plain text runs by core's `wordMarks`, and
  wrap each match in a `Text` with `testID="mark"`. They clear 2.5 s after the landing.
- **Tests:**
  - `SpaceView.test.tsx`: opened with `at` and `words`, the line flashes and its marks show;
    with fake timers, the marks are gone after 2.5 s; opened with `at` alone, nothing is marked.
  - `Markdown.test.tsx`: marks split a run, keep bold, skip code; matching follows case and
    diacritics.
  - The landing doesn't animate from the foot: assert `scrollToIndex` is called with
    `animated: false` on first landing, or whatever the chosen mechanism exposes.
  - Extend `apps/mobile/e2e/search.spec.ts`: after the tap the room shows the line with a
    `mark`.
- **ADR 0133** "A message found opens at its line, with the words marked". If the landing
  mechanism changes how ADR 0130's room moves, say so in both.
- **Go-live, on his word:** `pnpm phone build` from main.

### Phase 4 — acceptance on his iPhone

- He searches his own workspace on his iPhone. The steps go in `testing/scenarios/rooms/search.md`:
  1. Open the tab: the keyboard comes up, and recents show.
  2. Type part of a room's name: the room is first under Spaces, with the typed part marked.
  3. Type an agent's harness name: its agents are listed.
  4. Type a word said a long way up a busy room: the message row shows, and a tap lands on it,
     centred and lit, with the word marked.
  5. Type a word from a voice note: the row says voice note, and a tap lands with the flash.
  6. Go back: the results are where they were, and the keyboard is down.
  7. Turn Tailscale off: spaces and agents are still found, and the messages line says why.
- Read anything he reports, record a dated run in the scenario, and put findings (`SR-n`) in
  `testing/findings.md`. Fix what is small in this phase. Ask about anything larger.
- Update STATUS and memory.

### Phase 5 — Mac and web (optional, only on his word)

- **`apps/web/src/app/Search.tsx`** gains Spaces and Agents sections and the chips, from core's
  `searchIndex`, `findSpaces` and `findAgents`. `marked()` gives way to core's `snippetParts`.
  Its own debounce and More give way to core's `messageSearch`. Recents go in `localStorage`
  (try/catch).
- **The room's landing:** the web room already opens at a line from a hit. It gets the words
  marked the same way (`MessageList.tsx` and the line's Markdown), cleared after 2.5 s.
- **An agent hit** opens the agent's pane, as the Agents tab does.
- **Tests:** `apps/web/src/app/Search.test.tsx` (new), and `apps/web/e2e/messaging.spec.ts`'s
  search steps extended (on 5199, alone).
- **ADR:** an addendum to 0132.
- **Go-live, on his word:** `pnpm web:build` (4431 serves it, no restart) and `pnpm desktop`.

## 5. Risks, and what to check first

- **Four tabs and the + in the iOS 26 bar.** It should fit, but look on the simulator in Phase 2
  before building further. If it crowds, ask him rather than dropping a label.
- **`tabPress` on an ordinary `NativeTabs` trigger** may not fire while the tab is already
  selected (§4, Phase 2, Focus).
- **A deadlock on landing** (ADR 0130). No scroll from inside a mount.
- **A hit in a room this phone hasn't replayed.** `useLanding` already retries as lines come in,
  and a room the phone never opened is backfilled (up to 200 pages). Check a cold room in the
  walk.
- **Disk.** Simulator builds have filled the disk on 6 October. Check free space before a
  Release build, and remove your own build output after.
- **Peers.** Other sessions move main, build the phone and push. Before a fast-forward or a
  build, `ListAgents` and the reflog; after a build, check the bundle carries a string only this
  branch has.

## 6. Code map

- **Core:** `packages/core/src/store.ts` (`search`, `SearchHit`, the snippet marks),
  `agentsTab.ts` (`agentLine`, `only`), `model/readers.ts` (`spaceTitle`, `spaceList`,
  `spaceById`), `index.ts`; `search.ts`, `messageSearch.ts` and their tests; `bench/search.ts`.
- **The phone:**
  - `apps/mobile/src/ui/tabs.ts`, `TabBar.tsx`, `Search.tsx`, `Avatar.tsx`, `AgentFace.tsx`;
  - `app/(tabs)/_layout.tsx`, `_layout.web.tsx`, new `search.tsx`, `index.tsx`;
  - `app/spaces/[id].tsx`, `app/agents/[id]/index.tsx`;
  - `src/spaces/List.tsx`, `SpaceView.tsx` (`useLanding`), `spaces.ts`, `Line.tsx`,
    `Markdown.tsx`, `Motion.tsx` (`Flash`), `when.ts`;
  - `src/prefs.ts`, `prefs.web.ts`;
  - new `src/search/`, new `e2e/search.spec.ts`.
- **The server (read only, no change):** `server/src/infrastructure/store/read-models.ts`
  (`ftsQuery`, `messageHits`), the search route.
- **The web (Phase 5):** `apps/web/src/app/Search.tsx`, `Shell.tsx`, `Sidebar.tsx`,
  `MessageList.tsx`.
- **Docs:** `docs/STATUS.md`, `testing/scenarios/rooms/search.md`, `testing/findings.md`,
  `testing/scenarios/README.md`, and `apps/docs/src/content/docs/operate/mobile.md`: a short
  "Search" section in Phase 2, and its landing in Phase 3. `concepts/message.md` §Search
  describes the server and stays as it is.

## 7. Readings

None needed: the server's search is unchanged. If a walk shows search slow on his workspace,
time `GET /v1/search` against the scratch server's copy and compare with the 200 ms budget in
`messaging-depth.test.ts`.

## 8. Decision records

- **ADR 0132:** search is a tab, and finds spaces, agents and messages (Phase 2; an addendum in
  Phase 5).
- **ADR 0133:** a message found opens at its line, with the words marked (Phase 3).
- Take the next free numbers when each phase starts: 0131 went to the empty-states session on
  6 October.

## 9. Post-compaction prompts

Paste one to start a phase.

### Phase 1

> Run Phase 1 of `docs/proposals/search-plan.md` (core: what search finds). Read §0–§3 and the
> memory notes §0 names. Rebase the worktree branch on main, install, build
> `packages/core/src/search.ts` with its tests, run the gates, fast-forward main, update STATUS
> and memory, and report with Phase 2's prompt.

### Phase 2

> Run Phase 2 of `docs/proposals/search-plan.md` (phone: the Search tab, and the box on Spaces
> goes, ADR 0132). Rulings §1 stand <or: changes>. Check the four-tab bar and `tabPress` on the
> simulator first. Build, test (Jest, the new phone e2e spec, alone), walk it on the simulator
> as Release with stills, fast-forward main, and report. Wait for my word before
> `pnpm phone build`.

### Phase 3

> Run Phase 3 of `docs/proposals/search-plan.md` (phone: a message opens at its line with the
> words marked, ADR 0133). Read ADR 0130 first. Measure the landing on the simulator before and
> after, with a film. Build, test, walk, fast-forward main, and report. Wait for my word before
> `pnpm phone build`.

### Phase 4

> Run Phase 4 of `docs/proposals/search-plan.md`. I have searched on my iPhone: <what I saw, or
> "all fine">. Record the run in `testing/scenarios/rooms/search.md`, put any findings in
> `testing/findings.md`, fix what is small, and update STATUS and memory.

### Phase 5

> Run Phase 5 of `docs/proposals/search-plan.md` (Mac and web: spaces, agents and marks in the
> web Search page). Build, test (the web e2e on 5199, alone), fast-forward main, and report.
> Wait for my word before `pnpm web:build` and `pnpm desktop`.
