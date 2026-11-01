# 0203. A screen draws again only what changed

Date: 19 October 2026
Status: Accepted, 19 October 2026, on Arjun's "Proceed" to cutting what the Spaces list makes as it
is drawn. Builds on ADR 0116 (the tabs drawn after the room) and ADR 0181 (picking rooms), and
narrows what ADR 0197's switcher reads.

## Context

Arjun, 19 October 2026, after switching between his two workspaces: "Space details works slow. The
space tab —> select button operation works slow". One store a workspace (ADR 0197's fifth
addendum) took the rebuild out of a switch. What a Select costs, and what a room costs with the
tabs under it, was left, and he said to go on with it.

Measured on an iPhone 17 Pro simulator (Release) against a copy of his Primal (24 open rooms, 33
agents), with a temporary probe posting JS stalls, Hermes collections, the bytes Hermes allocated
and the renders of Reanimated's animated components to a local sink:

- **A Select** drew some 1,760 animated views and allocated 45 MB, with eleven collections. The
  list was drawn twice, every row each time, and the Agents tab, unseen, drew all of its rows too.
  `useStepTabBarAside` read the tab bar's context, which held whether the bar was aside beside the
  setter: every screen that asked the bar to step aside was drawn again when it did.
- **A pick inside Select** drew every row again, some 500 animated views and 10 MB, for one circle.
  A row's handlers were made afresh at each draw of the list, so nothing could hold a row still.
- **A message sent in a room** drew Spaces, Agents and You, under it and unseen, six times over:
  some 2,800 animated views and over 100 MB, with stalls of 150 to 216 ms, and the same at every
  frame of an agent's answer as it streamed. The tabs read the store at transition priority (ADR
  0116), which put them after the room, not off. Spaces read the switcher's rows for its title,
  and those read the store's whole snapshot through `useSyncExternalStore`, so Spaces and You were
  drawn at once at every word besides. The rows themselves cost little to draw by the bytes their
  own bodies made: what cost was everything under them, drawn with them.

## Decision

1. **The tab bar's setter is a context of its own** (`ui/tabBarAside.tsx`). A screen that asks the
   bar to step aside holds only the setter, which never changes, and is not drawn again when the
   bar moves; the bar reads whether it is aside.
2. **A row of Spaces is drawn again only when what it shows changes** (`ListRow` in
   `spaces/List.tsx`, `memo`). It is handed what it shows: its room, face, unread count, time ("2h",
   worked out at each draw of the list, so it is as fresh as the list), whether it is picked, may be,
   or is shaking, and whether it is on its way out. What it does goes through one object for the
   list's life whose calls reach what the list holds at its last draw (`useSteady`,
   `ui/useSteady.ts`). Core already keeps a room's object while nothing in it changes, so a word in
   one room draws that room's row.
3. **So is a row of the Agents tab** (`ListedAgent` in `agents/Agents.tsx`). The tab is made afresh
   from the snapshot at each draw (`agentsTab`), so a row that says the same is handed the object it
   had (`useSameRows`). The sets of acts a row offers are kept one array each (`actSet`), on both
   lists.
4. **The switcher reads what its rows say, not the snapshot** (`useFrontFacts` in
   `workspaces/Switcher.tsx`): the name, the standing, what waits and whether it may be renamed,
   the same object while they are the same. The + reads only the directory (`useHarnesses`).
5. **A screen out of sight follows the store once a second** (`useDeferredSnapshot`,
   `OUT_OF_SIGHT_MS`). A tab not in front, and the tab under a room opened from it, take the last
   word once a second however many came; the moment a screen is in sight again it takes what the
   store holds, in a layout effect, before that frame is painted.

## Consequences

- **Measured** on the same simulator and copy, before and after, with the same probe, as the
  median over each step's own seconds (eight Selects, six picks, four messages sent in a room):
  - A Select: 2,079 animated views drawn, now 829; 50 MB allocated, now 18; thirteen collections,
    now five; its longest stall 175 ms (up to 341), now 47 (up to 68).
  - A pick: 996 views, now 71; 22 MB, now 2; five collections, now one; 50 ms, now 17.
  - A message sent in a room: 7,336 views, now 339; 217 MB, now 22; sixty collections, now six;
    its longest stall 384 ms (up to 525), now 46 (up to 48).
- A swipe back from a room finds Spaces no more than a second behind the room, and up to date the
  frame it is in front. A tab chosen from the bar is up to date in its first frame.
- A screen in sight is drawn as before: every word, after the room.
- A row's handlers are whatever the list held at its last draw. A handler that needs something a
  row shows is handed it by the row (`on.pick(space)`), never read from a closure the row kept.
- Not changed: a Select still draws every row once, since each must show its circle (about 500
  animated views and 13 MB); the Agents tab's own Select; the room's own drawing of a message; the
  archived agents' page (`Archived.tsx`), whose rows are drawn as before.
