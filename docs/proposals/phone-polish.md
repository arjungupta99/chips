# The phone's room, iPhone-shaped — a polish pass on `apps/mobile`

*Proposal, 11 September 2026, reviewed the same evening: every recommendation taken, with one
change — the person's own bubbles are teal, not blue (`OUTGOING` in the phone's tokens). The plan
is edited only at a gate, so this stands beside it and STATUS records the work under Scope
changes. WP1 landed that night with [ADR 0050](../decisions/0050-the-phones-room-is-a-conversation-a-lane-is-its-chain-and-the-receipt-is-asked-for.md),
and WP2 and WP4 after it, WP3 and WP5 on 12 September — departures from what is written below are
recorded under each, half of WP3 could not be built at all, and with WP5 the pass is done.*

**Follow-up, 16 September 2026:** the next pass is planned in
[Space Activity and chat refinements](space-activity-and-chat-refinements.md): reusable activity
cards with header access, a public harness-neutral publishing contract, scrolling bubble
colors and text actions. That document has the technical phases and compaction handoff; its
implementation has not started. The completed work below remains the record of the first pass.
(17 September 2026: the activity cards were built and then withdrawn,
[ADR 0062](../decisions/0062-the-activity-card-is-withdrawn.md); the chat refinements stand.)

Arjun's words, from the phone: the routing bubble repeats the message; only the chain belongs in
it; the Done label should not persist, and status should sit on the right, only while working or
failed; the "n steps · 1m 02s" bubble under every reply should go, and live in the long-press
sheet instead; bubbles want a larger corner; the app should move and look like an iPhone app,
not an Android one; the composer jumps with the keyboard instead of sliding; the "…" appears the
instant a message is sent; and the rest of the app should be as refined.

## 1. What the room does today, and why

Read from the code and from the simulator (J's space, 11 September 2026, dark):

1. **The route card repeats everything.** `apps/mobile/src/spaces/LaneCard.tsx` draws the
   trail, a status pill, the trail again in words, then `lane.goal` — which is the person's own
   message, one bubble above — then `lane.summary` and the cost. Jacobian's adapter
   (`adapters/jacobian/src/channels/chips/lanes.ts`, `run.ts`) sets the lane's summary to the
   specialist's whole reply *and* completes J's own run with the same reply, so in J's space the
   question appears twice and the answer twice: once inside the card (1,050 characters for the
   Kung Fu Panda reply) and once as J's green summary bubble under it.
2. **The receipt sits under every reply.** `Line.tsx`'s `Receipt` is drawn under every `summary`
   and `status` line: "▸ 1 step · 1m 02s" as a bordered box the width of the room.
3. **Done persists.** `LANE_TO_STATUS` maps `completed` to a green Done pill that stays for good,
   left of centre in the card's head.
4. **The corner is the desktop's.** Bubbles use `RADIUS.lg` = 12, the design system's card
   corner. Messages on iOS draws 18 at 17pt type.
5. **The keyboard jumps.** `SpaceView.tsx` uses React Native's `KeyboardAvoidingView`
   (`behavior="padding"`, offset measured by `useAbove`). That component sets a padding from
   keyboard events and animates it with `LayoutAnimation`; under Fabric, with an inverted
   `FlatList` holding its place through `maintainVisibleContentPosition` and a composer whose
   height comes from a measured twin, the padding lands in one frame and the list re-anchors in
   the next. The field arrives, then settles — a jump, not a slide — and there is no interactive
   dismissal.
6. **The dots are instant.** `useLingering(runDoing(space.run))` shows the thinking bubble the
   moment a run is queued or running. In today's runs Jacobian's `run.started` landed 22–106 ms
   after the person's message (median about 40 ms; seqs 4489–4628), and the first `run.status`
   about ten seconds later. So the dots appear in the same breath as the sent bubble, before it
   has finished landing.
7. **Every reply is green.** Core folds a `run.completed` whose summary equals the harness's last
   message onto that message (`closeOnLastSaid`, Phase 3 finding 9) by changing its kind to
   `summary`. Jacobian always completes with its last reply, so on the phone every answer wears
   the green summary ground, and the room is a wall of green rather than a conversation.
8. **Underscores.** Core's `parseInline` knows `*em*` and `**strong**` but not `_em_` or
   `__strong__`. J writes `_Robin Hood_ (1973)`, and the phone shows the underscores.
9. **The chrome is hand-made.** A hand-drawn tab bar with the desktop rail's amber, custom
   titles, no haptics anywhere, cubic timings rather than springs, an avatar beside every
   harness line even in a room of two, 16pt type at the desktop's 1.45 leading, and a
   context-menu-shaped action (the long press) that arrives without the lift or the tap iOS
   gives its own.

## 2. The rules the room will follow (the ADR 0050 candidate)

1. **A lane in the room is its chain.** A route card is one slim row: the hops as faces, the
   names in words, and nothing the room already says. Its status sits at the right edge and is
   drawn only while it is live (`queued`, `running` → *Working*, with the breathing dots) or has
   failed (`failed`, `cancelled` → *Failed*); the pill's dot is still, as every pill's on the
   phone is. Done draws nothing: the reply beneath is the proof. Tapping the row opens the specialist's space; pressing and holding it opens a sheet
   with what the card used to show — the goal, constraints, deadline, cost and the lane's own
   summary.
2. **The specialist's room keeps the question, as the person's words.** A task card is the
   chain as a caption (*Arjun → J → Riaan's development*) above the goal drawn as the person's
   own bubble, tagged *via J*, because in that room it is the only copy of what was asked. Core's
   `saidBy` already reads a relayed line this way; the task line takes `onBehalfOf` as its
   speaker.
3. **The receipt is asked for, never shown.** No receipt under any line. The long-press sheet
   of the line that closed a run — the summary, or the status line a failure left — carries a
   *What the run did* card: one header (`1 step · 1m 02s · ≈$0.10`), the steps, and the model
   and tokens when the run reported them. A status line becomes pressable for this.
4. **A reply that closed its run is a reply.** Core marks a line folded by `closeOnLastSaid`
   (`folded: true`); the phone draws a folded summary on the ordinary harness ground and keeps
   the green for a summary that stands alone. The receipt is in the sheet either way.
5. **Bubbles are iOS bubbles.** 18pt corners; consecutive lines from one author within three
   minutes group, with 5pt corners on the sides that face each other, 2pt between them and
   14pt between groups; the time inside the last bubble of a group only; a centred separator
   (*Today 11:26 AM*) where more than fifteen minutes pass; no avatars in a room of two, and in
   a group only beside the last bubble of a run of one author. Yours are solid blue with white
   ink; theirs the quiet surface. Body 17pt on 22pt leading. A bubble stops at 78% of the
   column.
6. **The composer moves with the keyboard.** Its motion is the keyboard's own frame, on the UI
   thread, and a drag down the list dismisses the keyboard interactively.
7. **The dots wait a beat.** The thinking bubble appears 800 ms after the run began and never
   before the person's own line is confirmed; a run that answers inside that beat shows no dots
   at all. It still leaves the instant the reply lands.
8. **The chrome is the platform's.** Native tabs, native large titles with the search field in
   the bar, the native sheet spring, haptics where iOS puts them, and springs rather than
   timings for what the app moves itself.

## 3. Work packages

Each ends with tests and docs; each is its own commit or two; none touches `apps/mobile` while a
simulator walk or the phone e2e is running. Sizes are working days.

### WP1 · The room (1.5)

Core, `packages/core`:
- `model/lines.ts` `closeOnLastSaid`: set `folded: true` on the folded line; `model/types.ts`
  `Line.folded?: true`. `fold.test.ts`: a folded reply is marked; a standalone summary is not.
- `markdown.ts`: `_em_` and `__strong__` as inline patterns, bounded so `snake_case` and
  `file_name.ts` stay whole (the underscore must open after a non-word and close before one);
  `markdown.test.ts` cases for both and for the identifiers.

Phone, `apps/mobile/src/spaces`:
- `spaces.ts` (pure): `groupLines(lines, {sameAuthorWithinMs: 180_000, separatorAfterMs:
  900_000})` returning each drawn row's place in its group (`first | middle | last | only`) and
  whether a separator precedes it; `laneLive(lane)`: the pill's word or nothing. `spaces.vitest.ts`
  property tests: a group never spans a separator, an author change or a different kind.
- `LaneCard.tsx` → `LaneChain.tsx`: the slim row (faces, names, live pill at the right, chevron);
  `onOpen` opens the lane's home space (`router.push('/spaces/<homeSpaceId>')`, the split's
  `onOpen` on a wide screen); long press opens `LaneSheet` (goal, constraints, deadline, cost,
  summary). The task kind draws the caption and hands the goal to `Message` as the person's line.
- `Line.tsx`: `Receipt` removed; `Bubble` takes `place` and `named` to pick corners, stamp and
  avatar; `Margin` for `status` lines becomes a `Hold` target when the run has steps; a
  `Separator` component for the day/time line; `folded` picks the ground.
- `LineMenu.tsx`: a `RunReceipt` card (`SheetCard` of `SheetRow`-like rows without marks) when
  `run` is given: header from `receiptSummary`, one row per step with ✓/✕ and its duration, a
  footer with model and tokens. The `Sheet` gets `scroll` (a `ScrollView` capped at 60% of the
  window) so twenty steps do not push Cancel off the glass.
- `Thinking.tsx`: `THINKING_GRACE_MS = 800`; `useLingering` gains `confirmed` (the newest line
  is not pending) and a timer; `Thinking.test.tsx` with fake timers: nothing at 700 ms, the
  bubble at 800, nothing at all when the reply lands at 500.
- `Motion.tsx`, `Thinking.tsx`, `ui/Sheet.tsx`: `Animated.spring` (stiffness 320, damping 32,
  mass 1 — iOS's 0.85 damping ratio at a 0.35 s response) in place of the cubic timings; Reduce
  Motion keeps the fades.
- `ui/tokens.ts`: `BUBBLE = { radius: 18, inner: 5, padX: 14, padY: 9, maxWidth: 0.78 }`,
  `PHONE = { outgoing: "#2f6fed", outgoingInk: "#ffffff" }` outside `Palette` so the drift test
  stays honest; `TEXT.body` 17, `LEADING_PHONE` 22/17.
- `Markdown.tsx`: paragraph at the new size and leading.

Tests: `SpaceView.test.tsx` (no receipt in the room; the route row shows the chain and no goal;
the pill only while running/failed; the task row shows the caption and the person's bubble),
`Line.test.tsx` (corners by place, stamp on the last only, folded ground), `LineMenu.test.tsx`
(the receipt card, the scroll), `e2e/room.spec.ts` on the web target (long-press → the sheet
carries "1 step"; the room does not), Maestro `receipt.yaml` for the device.
Docs: ADR 0050 with the rules above; `apps/docs/…/operate/mobile.md` (what a long press offers);
STATUS.

### WP2 · The keyboard (0.5)

- Add `react-native-keyboard-controller` 1.21.9 (the version SDK 57 bundles) to `apps/mobile`
  — say so before the install, as agreed; it needs a development build, which `pnpm phone`
  already makes, and Reanimated, already here.
- `app/_layout.tsx`: `KeyboardProvider` under the gesture root.
- `SpaceView.tsx`: the library's `KeyboardAvoidingView` (same props, driven by the keyboard's
  frame on the UI thread) in place of React Native's; `keyboardDismissMode="interactive"` on the
  list and `KeyboardGestureArea` around it for the drag-to-dismiss; `useAbove` stays as the
  offset (it measures what the navigation bar takes).
- `jest.setup.js`: the library's own Jest mock (`react-native-keyboard-controller/jest`).
- Web target: the provider and the view are no-ops on web; verify at implementation that the
  Playwright suite still types into the composer, and keep React Native's view behind a
  `Platform.OS === "web"` switch if it does not.
- Proof: a simulator recording (frames from `simctl` video, as before) of the field rising with
  the keyboard and following a drag, before and after; the phone walk is Arjun's.

**Built, 11 September 2026, with two departures.** `KeyboardGestureArea` is not used: every one
of its props is Android's, and on iOS what gives the finger the keyboard is
`keyboardDismissMode="interactive"` on the list, which the controller's native side tracks — one
prop instead of a wrapper that would do nothing here. And `behavior` is `padding` on both
platforms rather than padding on iOS and nothing on Android: the library's types refuse an
`undefined` behavior under `exactOptionalPropertyTypes`, and the choice it forced is the right
one, since a controller whose purpose is to make the two platforms behave alike should not be
asked to behave differently. The recording is not made — the simulator's app carries an embedded
bundle and cannot see this code without a native rebuild, which is Arjun's `pnpm phone`;
`e2e/maestro/keyboard.yaml` is the flow that asks the device instead.
- Docs: STATUS; a line in the mobile guide's "what the phone needs a development build for".

### WP3 · Native chrome (1)

- `app/(tabs)/_layout.tsx`: `NativeTabs` from `expo-router/unstable-native-tabs` in place of
  `Tabs` plus the hand-drawn bar: SF Symbols for the marks (`tray.full`, `bubble.left.and.
  bubble.right`, `cpu`, `person.crop.circle`, `bolt` — the Android side gets the Material
  names), the badge on For you, `minimizeBehavior="onScrollDown"` on iOS 26, the Runtime
  trigger hidden outside development. Liquid Glass comes with it on iOS 26. The iPad rail goes:
  iPadOS draws native tabs at the top, which is the platform's own answer to a rail. `TabBar.tsx`
  stays only if Android or the web target needs it — decide at implementation from what the
  navigator does there.
- Large titles: each tab becomes a stack (`(tabs)/spaces/_layout.tsx` with `headerLargeTitle`,
  `headerTransparent`, `headerBlurEffect: "systemChromeMaterial"`); `Screen` drops its own title
  on iOS; the Spaces list moves its search into `headerSearchBarOptions` (the native field in
  the bar, collapsing on scroll); `contentInsetAdjustmentBehavior="automatic"` on every list.
  The room keeps its route at `/spaces/[id]` (deep links, ADR 0040's cards) and gains a title
  with a subtitle (the harness, or the count of people) and the blurred bar.
- Tests: `TabBar.test.tsx` retires with the bar or narrows to the fallback; a layout test that
  the five triggers are declared and Runtime hidden in release; e2e `pair.spec.ts`/`room.spec.ts`
  still find the tabs by role on the web target (native tabs fall back to a JS bar there —
  verify).
- Docs: STATUS; the mobile guide's screenshots.

**Built, 12 September 2026 — the bar, and not the titles.** `NativeTabs` is the bar on the
phone: an SF Symbol and a Material glyph for each tab, the count on For you, `minimizeBehavior`
set to `onScrollDown`, Runtime `hidden` outside development, and iOS 26's glass and its press for
nothing. The five tabs are data (`src/ui/tabs.ts`) read by both bars, so the two targets cannot
offer different tabs. The iPad rail is gone from the phone build: where a tab bar stands on an iPad is iPadOS's to
decide, though that much was not seen — the iPad simulator here has no paired build on it.
The room's bar gained a second line — the harness in the room, or how many people, from
`spaceSubtitle` — drawn as a view in the title's place, because a bar's title is a string and
`@react-navigation/native-stack` has no `headerSubtitle`. Each tab's list takes its bottom inset
from the window now, the bar being glass over the list rather than a shelf under it.

`TabBar.tsx` stays, and the rail with it, on the web target alone. The brief left that to be
decided from what the navigator does there, and what it does is a fixed pill floating over the
top centre of the page — neither a phone's bar nor an iPad's rail, and over the top of the very
screens thirteen specs read. So `app/(tabs)/_layout.web.tsx` keeps the drawn bar and
`_layout.tsx` is the phone's.

**The large titles are not in this. They do not work.** The half of this package that moves each
tab's name into a navigation bar was built as written — a stack of one screen per tab with
`headerLargeTitleEnabled`, `Screen` drawing no title under a bar that has one, and the Spaces
search moved into `headerSearchBarOptions` — and inside the phone's own tab bar it does not
render. The bar comes up at the full height a large title needs and draws nothing in it: only
the tab the app launched into ever showed a name, and that one lost it as soon as another tab
had been in front. The name was reaching the bar all along — the small title appeared the moment
the list was scrolled — so it is the large label alone. Six builds on the simulator ruled out
the styling (a blue bar and a green title proved the bar's extent and that the label draws when
it draws at all), declaring the title on the screen rather than on the navigator, switching large
titles on at focus rather than at mount, and handing the stack the scroll view's insets with
`disableAutomaticContentInsets`. It is expo-router 57.0.19 over react-native-screens 4.26.0, and
the navigator is the one this proposal warned was named `unstable`.

So the tab screens keep the title this app draws, which is a left-aligned 34pt name that does
not collapse — closer to what an iPhone does for a top-level list than the small centred title
the working half of that bar would have given — and the Spaces search stays the drawn box. The
reason is written where the next person will meet it, in `Screen.tsx`. What is worth retrying
when the navigator moves is in *Not in this pass, recorded* below.

What the detail routes did not do is move inside the tabs. `/spaces/[id]`, `/harnesses/[id]` and
`/needs/[id]` stay on the root stack and cover the whole window, because a room has a composer at
the foot of it and a tab bar under a keyboard is a row of buttons nobody meant to press. That
bar is the platform's and works: it is where the room's two-line title lives.

### WP4 · Haptics and press (0.25)

- Add `expo-haptics` ~57.0.2 (bundled with SDK 57; say so before the install). A `ui/haptics.ts`
  wrapper that swallows the web's rejection: `tap()` light impact, `lift()` medium, `success()`,
  `warning()`, `tick()` selection.
- Send → light; the long press opening a sheet → medium, with the bubble lifting to 1.03 on a
  spring; Approve → success, Deny → warning; the swipe crossing its threshold → selection.
- `jest.setup.js` mock; tests assert the calls through the wrapper.

**Built, 11 September 2026, with two departures.** The wrapper is `ui/haptics.ts` and names five
feelings — `tap`, `lift`, `success`, `warning`, `tick` — each fire and forget, each swallowing a
platform that has no engine. It does not swallow *the web's rejection*, because there is none any
more: `expo-haptics` 57.0.3 vibrates on the web where the browser allows it and does nothing
where it does not, so the swallow stands as insurance rather than as the point. And it is pinned
at 57.0.3 exactly rather than the SDK's `~57.0.2`: the newest patch inside that range, written
the way its fifteen sibling Expo pins are written.

The selection click needed a file of its own. The swipe's position is the swipeable's own shared
value, handed to the callback that draws the face behind the card, and reading it as the finger
moves means a Reanimated hook — which cannot be imported under Jest at all, as `jest.setup.js`
has said since the swipeable itself was mocked. So `needs/Crossing.tsx` holds the one Reanimated
import in the app, draws nothing, clicks once each time the card crosses the line where letting
go would decide it, and is mocked away beside the swipeable. It is the click that makes the
other two feelings coherent: *far enough* under the finger, then *answered* on release, rather
than two buzzes out of one instant.

The bubble's lift sits on the bubble and not on the press around it. The press is the width of
the room; scaling that would carry a short bubble on the right out past the glass, since a
transform grows about its own middle. `useLift` in `spaces/Motion.tsx` is the spring, the same
`IOS_SPRING` as everything else, still under Reduce Motion. It lifts beneath the sheet's scrim
rather than through it — iOS's own context menu carries the bubble above the blur, which wants a
portal and a copy of it; what is worth having is the moment of the press, and that is over before
the scrim is dark.

What no test can reach: whether the phone buzzes. The engine is spies under Node, a simulator
has none, and Maestro can make the gesture but cannot be asked what was felt. Sixteen tests say
which feeling each screen asked for and when — a send that is refused is silent, a denial never
reaches for the error pattern, an approval with edits is still a yes — and a hand on a real
phone is the rest.

### WP5 · The sweep (1)

- Spaces list: rows to 76pt with 44pt avatars, the time in the top right at 13pt, the snippet in
  `ink3`, the unread count as today; the group's corner to 16.
- Composer: the field on `surface` with a hairline `line2` border; Send inside the field's right
  edge as a 30pt blue circle, dimmed while there is nothing to send; the + as today.
- For you and Harnesses: cards to a 16 corner; section labels in the iOS grouped style (13pt,
  uppercase, `ink3`); the Fleet's Done/Idle pills only when live, as the room's rule.
- You: an inset grouped list (rows with chevrons) rather than a card of label/value pairs.
- Type scale on the phone: body 17/22, secondary 15, caption 13, title 34 where a title is
  still drawn by hand. `maxFontSizeMultiplier` 1.5 on bubbles so Dynamic Type cannot break a
  row.
- The long-press sheet's corner to 24 and its spring; the scrim to 0.4.
- Docs: STATUS, the mobile guide.

**Built, 12 September 2026, with two departures and one addition.**

Everything above landed. The Spaces rows are 76 points with 44-point faces and the time on the
name's baseline at 13; the composer's field is the page's own surface under a hairline of
`line2`, with Send a 30-point blue circle inside its right edge, dimmed while there is nothing to
send; the card's corner is 16 everywhere — `Card`, the Fleet's rows, the Spaces group, the face
behind a swipeable card — and the sheet's is 24 over a 0.4 scrim; a section label is 13-point
small capitals in `ink3` on For you and on You alike; the Fleet says nothing about a harness that
is idle or has finished, ring and pill together (`saysStatus`); a screen's own name is 34.

*The departure on You.* It is the phone's settings shape — inset groups of rows under
small-capital headings, the label at the left and what it says at the right — but **no chevrons**.
A chevron on iOS means a screen is one tap away, and no row on You has one behind it: every group
either states a fact about this pairing or holds the control that changes it, in place. A chevron
would be a promise the next tap breaks, and the brief's parenthesis was describing the shape of
the list rather than asking for an arrow that leads nowhere.

*The departure on For you.* The tier headings keep the tier's colour, as the dot the pill was
already drawing, rather than going grey with the rest of the label. Three grey headings would
say Decide now, Review today and FYI are three of the same thing, and this app's rule is that
state is a colour *and* a word — never a word alone any more than a colour alone.

*The addition.* `maxFontSizeMultiplier` is asked for on every `Text` in a bubble and not only on
its words: a `Text` inherits the cap from another `Text` and nothing else, and the name over a
message and the time under it are in boxes of their own. The pairing screen, the connection line
and the empty-list sentence came onto the scale with the rest (they were 16, 13 and 15 as bare
numbers); the Runtime report did not, being a development-only table of numbers whose density is
the point.

### Not in this pass, recorded

- The desktop web app's route card still carries the goal and the summary. It should follow
  rule 1 in its own task once the phone's version has been lived with.
- The native `formSheet` presentation for the line menu (a route with `sheetAllowedDetents`)
  would give the system's spring, dimming and interactive dismissal for free; it means the line
  id in the URL and is a follow-up if the tuned custom sheet does not satisfy.
- Large titles in the tab bar, when the navigator can draw them. Each tab becomes a stack of one
  screen with `headerLargeTitleEnabled`, `Screen` stops drawing a title where a bar has one, and
  the Spaces search moves into `headerSearchBarOptions`. All of it was written on 12 September
  2026 and taken out again; the WP3 note above says what was tried and what the failure looks
  like, so the retry is an afternoon rather than a week.
- Jacobian's adapter could stop posting the reply twice (as the lane summary and the run
  summary); core already folds the run's copy, and the phone now hides the lane's, so the
  adapter can stay as it is. Its files are his to change.

## 4. Order, proof and what needs Arjun's word

Order: WP1 → WP2 → WP4 → WP3 → WP5. WP1 is the visible fix and needs nothing installed; WP2 and
WP4 each add one dependency; WP3 is the largest change to the app's skeleton and the one most
likely to move under us (the navigator's API is named `unstable`).

Proof at the end of each: `pnpm --filter @chipschat/mobile test`, `pnpm run check`, the phone e2e on
5198 alone, a simulator walk with screenshots beside the mocks in this proposal, and STATUS.

Needs his word: the two installs (`react-native-keyboard-controller@1.21.9`,
`expo-haptics@~57.0.2`, both into `apps/mobile`); a rebuild with `pnpm phone` for each native
change; whether the desktop follows rule 1.

## 5. Decisions for Arjun

1. The chain row: tap opens the specialist's space, hold shows the lane's detail. Yes?
2. A lane waiting on somebody: no pill (the ask card at the foot says it), as you said — or an
   amber *Waiting on you* at the right? Recommended: no pill.
3. Your bubbles in solid blue with white ink (Messages), or the soft blue they have now?
   Recommended: solid blue. *Decided: teal.*
4. A reply that closed its run on the ordinary ground, green kept for a standalone summary?
   Recommended: yes.
5. Native tabs and native large titles, retiring the amber bar and the iPad rail? Recommended:
   yes; the rail's job is done by iPadOS's top tab bar.
6. Times: inside the last bubble of a group plus a separator every fifteen minutes, or hidden
   until a swipe as Messages does? Recommended: inside plus separators.
7. Should the desktop's route card follow, later? Recommended: yes, as its own task.
