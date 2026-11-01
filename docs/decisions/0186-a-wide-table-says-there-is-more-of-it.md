# 0186. A wide table says there is more of it

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's "Proceed with C".
Adds to ADR 0184, whose tables scroll sideways in their bubble when they do not fit.

## Context

ADR 0184 drew a message's tables. A table too wide for its bubble scrolls sideways inside it, and
nothing said so: the table stopped dead at the bubble's edge, and the cut words ("A rot",
"intern") read like a drawing fault. On 17 October 2026, with the tables on his iPhone, Arjun
asked: "When a list is scrollable and the scrollable content is hidden, can we display a mini
indicator that tells there is more content that can be scrolled? Needs to look cool and
polished".

Four ways were mocked at phone width on J's LEGO table from Riaan's development (private artifact
`26YCiA6SDcc7UE6cvWb4FD`): as now; **A**, the side with more fades into the bubble; **B**, A and
a small flat disc with a chevron on the heading row's open edge; **C**, A and a dot per column
over the table's far corner, the columns in view lit as one capsule. Each could also peek, gliding
a little way and springing back the first time a table came on screen. Arjun picked C.

## Decision

1. **A table that scrolls fades where it has more.** Each side fades into the bubble over 36
   points, as strongly as there is table past it: none at its end, all of it 28 points in, so the
   fade comes up with the finger rather than at once.
2. **A dot per column sits over the table's far corner**, in line with the words' edge, and the
   columns in view are lit as one capsule. Column k is the dot k steps along and the gap after
   it, so the capsule's ends glide from dot to dot as the table moves. A dot fades as the
   capsule's end comes over it and has gone a third of the way across, so no sliver shows past
   the end. The dots are the bubble's quieter ink at 0.3 and the capsule its secondary ink; on
   your own bubble, its ink.
3. **The numbers are core's** (`packages/core/src/tableDots.ts`): `edgeStrength`, `columnsInView`,
   `capsule`, `dotShown`. The phone and the web draw by them, so the two cannot disagree. They are
   worklets, as `viewer.ts`'s are.
4. **On the phone everything that moves is an opacity or a transform**, set on the UI thread from
   the scroll (`WideTable`, `useAnimatedScrollHandler`), so nothing is laid out again as the table
   moves. The fade is a `MaskedView` (UIKit's own `maskView`), each side a ramp under a solid
   cover whose opacity gives way. The capsule is a cap at each end and a run between them,
   stretched by `scaleX`, in one layer. The system's scroll bar is off; the dots say it.
5. **On the web and the Mac** the fade is a CSS mask and the capsule a positioned block, both set
   from custom properties that a scroll listener writes to the table's box (`useWideTable`), so a
   scroll draws nothing through React.
6. **No peek.** Arjun's word was C; the peek was offered beside each option, and it would need the
   room to say when a message comes on screen, which its list does not.
7. **A table that fits draws nothing new**: no fade, no dots.

## Consequences

- J's wide tables say how much more there is before they are swiped and where the reader is while
  they are. Nothing changes on the server or the wire.
- No new dependency: `MaskedView` and `react-native-svg` are the app's already (`ui/Fades.tsx`).
- Jest stands in for `WideTable` (`jest.setup.js`), as for the app's other Reanimated files: it
  draws the scroller and a dot per column, and the fade and the capsule moving are the
  simulator's to show (`testing/scenarios/rooms/tables-in-a-message.md`, TM-5).
- The walk found one thing: a dot the capsule's end was partly over showed past the end as a grey
  sliver, at first faded only by as much of it as was covered. It now goes a third of the way in.
- A mask costs the phone an offscreen pass for that bubble while it is on screen; only a table
  that scrolls has one.
