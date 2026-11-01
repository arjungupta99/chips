# 0137. Search's hint rolls through what it finds

Date: 7 October 2026
Status: Accepted, 7 October 2026. Phone, Mac and web. Follows ADRs 0132 and 0136.

## Context

With nothing typed and nothing searched for yet, Search said what it finds in one quiet line:
"Spaces, agents, and anything said in them." The faces of your spaces had just started drifting
behind it (ADR 0136), and Arjun asked for that line to be made "cool as well".

Four mocks (a private artifact, kept out of the repo): **A · Rolling word** (a bigger "Find" and a
word rolling over to the next), **B · Marked in turn** (the line as it is, gold lighting each noun
in turn), **C · Typed** (the line typing itself out, then resting) and **D · Sweep of light** (a
slow shine across the line). He picked **A**.

## Decision

1. **A bigger line, "Find" and a word that rolls**: spaces, then agents, then anything said, and
   round again. Each word stays 2.4 s, then rolls up to the next in 0.6 s with a little spring, a
   little past the word and back (a cubic Bézier of 0.34, 1.5, 0.64, 1). "Find" is in the quiet
   ink, the word in the full ink, bold: 24 on 30 points on the phone, 21 on 28 pixels on the Mac
   and the web, which set everything a little smaller.
2. **The sentence stays under it, small**, as it was. Only it is read out: VoiceOver and screen
   readers skip the rolling line.
3. **Where it was, when it was**: only with no recent searches, and gone once you type. The faces
   drift behind it as they did behind the sentence.
4. **Rolling only while it can be seen.** On the phone it stops while the tab is behind a room or
   another tab and while the app is in the background, and starts again from spaces. With Reduce
   Motion (or `prefers-reduced-motion`) it stands still on "Find spaces".
5. **It grows with the reader's text size** on the phone, up to half as big again, and the window
   it rolls behind with it.

### How each client draws it

- **Core** (`searchHint.ts`): the words, the sentence, the pace and the spring (`SEARCH_HINT`,
  `HINT_ROUND_MS`), the same everywhere.
- **The phone** (`search/Hint.tsx`, `search/roll.ts`): the words stand in a column, the first again
  at its foot, behind a window one line high, and the column moves up a line at a time; when it has
  gone round it shows the first word again, so the round starts over with no jump. One clock from
  nought to one over the 9 s round, looped on the native side as the backdrop's is, each roll's
  spring sampled sixteen times into the interpolation. Nothing crosses to JavaScript while it runs.
- **The web and the Mac** (`Search.tsx`'s `Hint`, `styles.css`): the same column, moved a quarter
  of itself at a time by one CSS animation, the spring as each step's timing function. The
  keyframes are written for core's three words and 9 s round; a change to either changes them.

## Consequences

- One more native animation on the phone while the tab shows the hint; it is a transform, on the
  native side.
- The backdrop's hook for whether the app is in front moved to `ui/useActive.ts`, shared by both.
- Walked on a Release simulator (iPhone 17 Pro, iOS 26.5) over a scratch copy of his workspace,
  light and dark, and on the web in the app's browser, light and dark. Not walked: Reduce Motion on
  a device, a larger text size, his iPhone, the Mac app and 4431's page.
