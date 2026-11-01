# New space from the + — execution plan

24 September 2026. Phases 1, 2 and 3 on main, not pushed; Phase 4 on the branch; nothing live yet. Agreed so far with Arjun:

1. The room is made on the first send, not on the tap.
2. The harness names the room; it reads "New space" until then, and a person's rename holds.
3. The harness expands the brief. For Jacobian that is J, as today.
4. Every new Jacobian Space is a child of J.
5. It must work for any harness that wants it (OpenClaw is the named case), and Chips must not
   know what a Jacobian Space is.
6. The + is not in the top bar: it sits by the tab bar at the foot of the screen (Arjun, 24 Sep).
   Tapping it opens a small window, "Create new space", with a field. Enter turns the window into
   the full-screen room. The movement must be fluid on the phone; plain transitions on web and
   desktop. The connection mark stays top right.

## The shape

Chips says one generic thing: *a person opened this room and asked harness H into it; here is
the first message.* What H makes of it (an agent, a session, where it sits in its own tree, what
it is called) is H's business. It is the same shape as archive (ADR 0066): the person acts in
Chips, the harness follows.

```
phone: + → empty room (nothing on the server yet) → first send
  space.created {kind: direct, asked_of: H}  +  membership.added H  +  message.new
harness H: sees a room asked of it with no key
  makes its own thing (Jacobian: a Space under J, via J) → claims the room with its own key + a title
Chips: the room now has H's key and H as its opener, so retitle, archive, erase and
  Jacobian's 30-second follow() treat it like every room H opened itself
```

Why a claim is needed at all: Jacobian calls `openSpace(<Space id>)` for every Space it has. If
the room did not carry the Space's id as its key, Jacobian's next pass would open a second room
for the same Space.

## Phase 0: mock (no code)

`docs/proposals/new-space-mocks.html`: a phone-width, animated walk-through. The gold + by the
tab bar pours into the "Create new space" window above the keyboard. On send, the window fills
the screen, the words fly into the first bubble, and the room is named by the harness. It has
slow motion, and three looks for the +: gold glass beside the bar (recommended), clear glass, or
a fourth tab.

Gate: passed 24 September 2026. Arjun approved FIG 1 as it stands: **flat gold** beside the bar, and
the movement unchanged. The other three looks are kept in the mock for the record.

## Phase 1: protocol and server (Chips, generic)

- `HARNESS_CAPABILITIES.newSpaces` (`"new_spaces"`) in `packages/protocol/src/capabilities.ts`;
  `takesNewSpaces(directory)` in `@chipschat/core`, read by both clients. The + shows only when a
  harness in the workspace declares it, so Chips can land before any harness does, with no dead
  button.
- `space.created` gains optional `asked_of` (a harness id). The door refuses it unless a person
  sends it, the harness exists, declares `new_spaces`, and is added to the room.
  `server/src/application/visibility.ts` sends that `space.created` to the harness asked.
- The claim: the harness's one door, `POST /v1/harnesses/:id/spaces`
  (`server/src/application/use-cases/open-space.ts`), takes an optional `space_id`. For a room
  asked of this harness that has no key, it writes a new `space.claimed {external_key, title?}`
  instead of opening a room. The projection sets `external_key` and `opened_by` = the harness.
  The title applies unless a person has retitled the room (`title_by`), as it does today. A key
  already used in the workspace is refused, and the adapter is told which room holds it.
- `GET /v1/harnesses/:id/spaces` also lists rooms asked of it and not yet claimed, so an adapter
  that was down catches up at its next start.
- Migration 0027: `spaces.asked_of`, backfilled by a rebuild (there is nothing to backfill today).
- Re-declaring a harness: capabilities are only set at registration today. Add an owner-only
  `PATCH /v1/harnesses/:id {capabilities}` and a `chips harness declare <id> new_spaces` command,
  so Jacobian's existing registration (and anyone's OpenClaw later) can take it on.
- Tests: the door, the projection and a rebuild, both routes, and visibility.

Landed 24 September 2026, on the worktree branch. Where it differs from the list above:
- The listing puts rooms waiting to be claimed in their own array, `asked`
  (`space_id, asked_by, title, state, asked_at`), beside `spaces`, rather than among them with a
  null key. Jacobian's adapter reads every entry of `spaces` as a key of its own, and a null
  there could reach its `follow()`.
- A claim is refused when the harness was taken out of the room before it claimed it, and such a
  room is not listed. A retry of a claim that landed finds the room (`claimed: false`).
- `space.claimed` writes no line in the room: the room was waiting for a name, and nobody renamed
  it. The door drops the title when a person named the room first.
- The clients' fold takes `space.claimed` too (`@chipschat/core`), so a claimed room shows as keyed
  and erasable, and names the harness that can open it again.
- `takesNewSpaces(directory, harnessId)` sits beside `takesAutonomy`, and
  `newSpaceHarnesses(directory)` lists who can be asked, by name, for the window and the picker.
- The command is `chips declare <harness> <capability>…`. The list is whole, and it prints what
  it replaced. The route is the harness owner's, or a workspace owner's or admin's, as its tokens
  are.

## Phase 2: SDK, test kit, demo (what OpenClaw would use)

- `@chipschat/sdk-ts`: `onSpaceAsked({spaceId, askedBy, firstMessage})` and
  `claimSpace(spaceId, key, title?)`, with catch-up from the list at connect.
- The conformance kit (the fake Chips) gets the scenario: *a person asks for a new space; the
  adapter claims it and answers in that room.*
- The demo Scout declares `new_spaces` and claims the rooms asked of it. That lets web e2e and the
  golden scenario cover the flow without Jacobian.
- A short adapter-guide page, "New spaces": what Chips guarantees, and what the harness decides.

For OpenClaw specifically (no adapter exists yet; `docs/openclaw-class-harnesses.md`): the bridge
declares `new_spaces`. For a room asked of it, it calls `sessions.create` on the agent bound to
Chips, claims the room with the session key, and sends the first message with `chat.send`.
OpenClaw has no tree like Jacobian's; "a new session of the default agent" is its version of
"a child of J". No protocol change is needed for it.

Landed 24 September 2026, on the worktree branch. Where it differs from the list above:
- `onSpaceAsked` hands over `{spaceId, askedBy, firstMessage: {messageId, text}}`, once per room,
  when the first words are known. That is on the first `message.new` in the room, not on its
  `space.created`, or when a catch-up reads them from the room's history
  (`GET /v1/events?space_id=`). Those words go to the ask and are not delivered to `message.new`
  too.
- The catch-up runs when a listener is registered and again at every reconnect. Live events are
  held back while it reads, so the same room is never handed over twice.
- `claimSpace` answers `{spaceId, claimed, retitled}`, and a refusal throws `RefusedError` with
  the server's code and words. It and the catch-up are the SDK's only HTTP calls, with Node 22's
  `fetch` and the socket's token.
- The kit's scenario is not a separate step. It is the golden run's last act, played only for a
  subject whose `capabilities` include `new_spaces`:
  - A room left unclaimed is an error.
  - A claimed room left silent is a warning.
  - A claim with no title is a note.

  The checklist gains no row. Its rows are events a harness sends and that light the Harnesses
  tab. The door writes `space.claimed`, so an unlit "send space.claimed" row would point
  authors at an event the door refuses from a client.
- The fake's own door answers now carry the real route's full shape (`retitled`, `joined`,
  `claimed`). `GET /v1/events` on the fake now takes `space_id`, as the real one does.
- Scout's key for a room is `brief:<message id>`: the brief it was given is its unit of work.
- The adapter page is `connect/new-spaces.md`, linked from the SDK and conformance pages.
- `chips conformance custom` cannot declare `new_spaces` for a harness started by hand. The kit
  takes capabilities only from a subject in code.

## Phase 3: phone

- The + by the tab bar: flat gold (`palette.gold`, a dark +, a soft shadow), our own round view. Where it sits (over the separate slot iOS 26 keeps for a `search` tab, or in the gap
  beside the centred bar) is an hour's spike on the simulator first, including the bar shrinking
  as the list scrolls. It only shows when a harness declares `new_spaces`.
- The window: one glass view laid over everything, grown out of the + on two springs, across and
  up, slightly out of step (Reanimated, UI thread). Its content is laid out once at full size and
  faded in, so nothing reflows (ADR 0061). The keyboard rises with it and the list dims. The
  title is "Create new space", with the harness's name under it (a picker when more than one
  harness takes new spaces). The field says "What's this space for?", grows to four lines, and
  sends on Enter or the arrow.
- Tapping outside it, or ×, folds it back into the +, and the text is kept as the next draft.
- On send, in this order: `createSpace({kind: "direct", askedOf})`, `addMember(harness)`, then the
  message, all through the outbox. The room is pushed under the window with no transition of its
  own. The window fills the screen, the message flies from the field to the room's first bubble,
  and the window lifts away.
- The room reads "New space" until the harness names it. The name slides in with a gold sweep.
  If the harness never names it, the room's first words stand in, as a display rule with
  nothing stored.
- Haptics: light on the +, firmer on send. Reduce Motion: fades only.
- Walk it on the simulator (Release) against a scratch dev server with the demo Scout. Then
  `pnpm phone` on Arjun's word.

Landed 24 September 2026, on the worktree branch. Where it differs from the list above:
- **Where the + sits** (the spike, 24 September): over the search slot, on Arjun's pick. With
  three tabs the centred bar leaves 64 points beside it, room for a 48-point + hard against the
  screen's edge, and none at all with the development bundle's fourth tab. A tab with the search
  role makes iOS move the bar aside and keep a round slot at its end: 62 points at rest and 47
  when the bar shrinks, about the same centre, so a 62-point + covers it in both. The slot's tab
  (`app/(tabs)/new.tsx`) is `disabled` and its press opens the window, so VoiceOver finding the
  slot gets what a thumb on the + gets. The + stays under the dim while the window is up: hidden,
  it showed the system's own slot behind it.
- **The bar never shrank.** `minimizeBehavior` had been set since 11 September, but UIKit looks
  for a tab's list only down the chain of first children, and every screen put its name first.
  On iOS the screen's body now comes first in the tree and is drawn below the name (`Screen.tsx`,
  its own commit).
- **The window is not grown, it is uncovered.** The mock animates its width and height; here that
  would be a layout per frame (ADR 0061). It is laid out once, the size of the screen, and cut to
  the rect it is at by four nested clips that only move, one per corner (`newSpace/geometry.ts`,
  tested by property). The glass is the system's on iOS 26, the bars' chrome below it, paint
  under Reduce Transparency.
- **The room comes in once the window has covered the screen**, 65 percent into the fill, not at
  the send: pushed at once, the list vanished behind the dim.
- **The words set off at once** for where a first bubble stands, and are put right in flight as
  the room says where it is. The room asks its held bubble ten times a second: a reply landing
  under it pushes it up without a layout of its own, and the demo Scout replies within the
  flight.
- **The name.** "New space" while the harness has done nothing with the room; its first words once
  the harness has claimed it or answered in it without a name (`askedName` in core, so the
  desktop can share it). A harness that never does anything leaves it "New space"; there is no
  timer. A name that comes while the window is still over the room waits until the window has
  lifted, and then slides in with the sweep.
- **The web target's bar** has no slot, so its + floats above the bar's end, or at the foot of
  the rail on a wide screen, and opens the same window.
- **The phone learns a new capability at the next reconnect**, not only at launch: every hello
  after the first reads the directory again (core). This was Phase 2's second open point.
- **An asked room nobody claims still cannot be erased.** The rule is the server's; changing it is
  a contract change, brought to Arjun rather than made.
- Scout's names no longer end on a word the six-word cut left hanging ("Plan a trip to Kyoto").
- Not walked: Reduce Motion, an iPad, Android. The phone's `relay` and `room` specs fail on main
  as they do here (the thinking bubble now says "web search"; the relay header), not this phase's.

## Phase 4: desktop

- The + at the head of the sidebar (`apps/web/src/app/Sidebar.tsx:239`) opens a small centred
  dialog with the same words and field, with a plain fade and scale. Enter closes it and opens
  the room the way clicking a room does. It replaces the one-line form, which makes a room nobody
  answers in.
- Rebuild `apps/web/dist` in the main checkout, which 4431 serves.

Landed 24 September 2026, on the worktree branch. Where it differs from the list above:
- **The field is the room's composer** (`@chipschat/ui`), so the dialog sends as a room does: Enter,
  Shift+Enter for a new line, four rows at most. Its send is gold with a dark arrow, the phone's.
- **Enter closes the dialog at once**, and the room opens when its `space.created` comes back, as
  a group room made from the rail always has (the shell's `awaited`): on a desk that is one round
  trip, and the dialog's fade covers it.
- **The one-line form is gone, and the room of people it made is "No one" in the dialog**
  (Arjun's pick, B, of three: the form only where no harness takes new spaces; "No one" beside the
  harnesses; no rooms of people on the desk). With it chosen the field says "Name the space", and
  the words, on one line, are the room's name. Where no harness takes new spaces it is the only
  choice, so none is shown. So the + is always there on the desk, as it always was; the phone
  still has one only where a harness takes new spaces.
- **An asked room may be erased before the harness claims it** (Arjun's word, the open point from
  Phase 3): the server's rule (`erase-space.ts`) and core's `mayErase` let its owner, or an owner
  or admin of the workspace in it, erase it, and a claim that comes after is told there is no such
  room. ADR 0067 says so.
- **The name reads as plain words.** `plainWords` moved from the phone into core, and `askedName`
  gives a room's first words through it, so the rail and the phone's list say the same thing.
- **No gold sweep** on the desktop: offered, not built.
- The rail wears an untitled asked room's harness as its face (core's `spaceFace`) while the
  room's header wears the initials of "New space"; both wear the name's initials once it has one.
  Noticed, not changed: it is how every untitled room with a harness in it is drawn.
- Not rebuilt: `apps/web/dist`. Going live needs the merge, the rebuild and a desktop reload.

## Phase 5: Jacobian half (`~/Work/Jacobian/src/channels/chips/`, on Arjun's word)

- On a room asked of it (the event live, the list at start): run a J turn with the first message,
  entering at J, marked "a new space was asked for from Chips". J creates exactly one child
  Space under itself (`space_kit_bootstrap`: brief, board, first task). That is today's
  expansion, unchanged.
- Binding: the first Space created by the turn that started from that room is the room's Space.
  In `spaces.ts`, `open()` claims the waiting room with the Space's id and name instead of
  opening a second one. If the turn ends without a Space, the adapter creates one under J from
  the message itself, so the room is never left orphaned.
- J's reply in that turn goes to the new room, not J's room.
- Re-declare Jacobian's registration with `new_spaces`. Arjun restarts Jacobian himself.

## Phase 6: record

ADR 0069 ("A person asks a harness for a new space, and the harness claims the room"), STATUS,
and memory.

## Cost

| | What | Live steps |
|---|---|---|
| Chips | 1 capability, 1 field on `space.created`, 1 new event on the existing door, 1 migration, 1 PATCH route + CLI, SDK + kit scenario, phone + desktop UI | 4431 restart (migration), phone rebuild, `apps/web/dist` rebuild |
| Jacobian | adapter change in `src/channels/chips/`, re-declare | Jacobian restart (Arjun's) |

Order: 0 → 1 → 2 → 3 → 4 in a Chips worktree, replayed linear onto main. 5 in Jacobian. The +
shows nowhere until Jacobian re-declares, so each side can land and restart on its own.

## Risks

- Binding by "the Space this turn created" relies on J creating it in that turn. The fallback
  covers a J that does not.
- A person can add a declaring harness to an ordinary group room, but only a room made with
  `asked_of` can be claimed. That keeps a harness from taking over a room people share.
