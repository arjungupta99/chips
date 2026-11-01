# 0103. An agent's pins rest dim, and the face beside its words wears them

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0089 point 1's "lit and still" at rest and its rule that
a face under 32 points wears no pins, for the face beside a line; keeps 0102's drawing.

## Context

An agent's face wears the mark's ten pins (ADR 0089, drawn since 0102 as the first chip with short
pins). At rest they stood fully lit; while the agent works a light runs round them, each pin
lifting from 0.3 to lit and back. Under 32 points a face had no room for pins inside its box, so
the face beside an agent's line in a room (28 points on the phone, 24 on the Mac) and the face on
the phone's thinking bubble showed the bitten body alone, and said "working" with a green dot.

On 3 October Arjun sent a screenshot of the Agents tab with three agents mid-work, their pins dim
between flashes: "I like the dim spikes in the Agents tab. Let's make the dim spikes the default
there. In chats I want to see similar icon for the agent message icons." He asked for mocks first,
then said the chat's pins "probably do not need dimming", then "make the pins slightly dim in the
chat as well", then "slightly more dim in the chats". The mocks offered two ways to give the line's
face pins: **A**, inside its box, which shrinks the chip to 22 points; **B**, round a chip the
full size of the face, the pins standing into the gap beside the bubble. He picked B: "go with B,
build it".

## Decision

1. **An agent's pins rest dim:** 0.3, the low the working light already falls back to. The light
   still runs round them while it works. This holds wherever a face wears its pins inside its
   box: the Agents tab, an agent's own page, a room's members, on the phone and the Mac.
2. **The face beside an agent's line wears its pins round its body** (`pinsOut`): the body is the
   whole face, 28 points on the phone and 24 on the Mac, and the pins stand 0.13 of it past its
   edges. On the phone the thinking bubble's face does the same.
3. **Those pins rest a little less dim, at 0.45.** Both numbers live in the outline
   (`PIN_REST`, in both copies, drift-tested), and the web hands its own down to the stylesheet as
   `--pin-rest`.
4. **Wearing pins, the line's face says it is working by its light,** not by the green dot, which
   stays for faces with no pins at all. The amber dot for an agent that can't answer is
   unchanged.
5. **On the Mac the face keeps clear by as far as its pins stand out** (a margin of 4 pixels at
   24), because a message row contains its paint (`content-visibility: auto`) and would otherwise
   cut them off. On the phone the room's rows do not clip, and the pins stand into the gap.

## Consequences

- Every face that wears pins inside its box looks dimmer at rest than before; only a working
  agent's pins light up.
- A room's faces now read as the same chip as the Agents tab's, at the cost of a few points of
  overhang on the phone and 4 pixels more room on the Mac.
- Every other face under 32 points is unchanged: no pins, and the green dot while working.

## Alternatives considered

- **A: pins inside the line face's box.** The face takes no more room, but the chip shrinks to
  22 points beside 17-point words and reads smaller than a person's face beside theirs.
- **The chat's pins fully lit, or at 0.6.** Both were mocked; he asked for them dimmer each time.
- **Dimming only in the Agents tab.** He asked for the chat's faces to be similar; the other
  pin-wearing faces follow the Agents tab so an agent looks the same wherever it is drawn large.

## Addendum, 3 October 2026: the mark's pins rest a little dim too

Arjun: "I need the main logo to also have slightly dim pins. Show me mock". The mock set the logo's
pins at 1, 0.7, 0.55 and 0.45 across the app icon, the mark beside the name, the small sizes and the
working mark; he picked 0.55 ("go with 0.55").

- `PIN_REST.mark` is 0.55, in both outline copies. The web's mark (`mark.tsx`) hands it to its
  stylesheet as `--pin-rest`; working, its light still runs round the pins from 0.4 to lit. A
  finished turn's grey mark keeps its own 0.55.
- The phone's working mark (`ChipPulse`) was never at rest: its pins lie dim under the light. With
  Reduce Motion on, its pins now stand at 0.55 instead of fully lit.
- The app icons draw their paper pins at `fill-opacity` 0.55 over the ink: the phone's, Android's
  adaptive icon, the splash and the Mac's. The menu bar's stays solid, since macOS paints that
  template in one colour and dim pins there would only be a paler grey. The icon guardrail now
  holds the other four to `PIN_REST.mark`.
- The icons change with new builds only, and the iPhone's needs `expo prebuild` first.
