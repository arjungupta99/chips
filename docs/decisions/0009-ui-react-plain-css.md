# 0009. React 19, plain CSS with the blueprint's tokens

2 September 2026 · Status: accepted

## Context

The blueprint's design language is the product. A utility framework would dissolve it into
class strings and make the tokens hard to keep honest across web, desktop and mobile.

## Decision

React 19 with Vite. Plain CSS using the blueprint's tokens in `packages/ui`; no utility
framework. Radix primitives for accessibility. The desktop app is Tauri 2 wrapping the web app.
Mobile is Expo, sharing `packages/core` — state and the protocol client — not UI components.

## Consequences

- The tokens in the blueprint's `<style>` block are copied once into `packages/ui` and become
  the only definition; a colour that is not a token is a bug.
- Light and dark are both first-class, and visual snapshots cover both.
- Mobile shares logic, not components, so it can feel native without dragging the web app's
  layout assumptions with it.

## Addendum, 21 September 2026: the palette was lifted, and two avatar hues respaced

Arjun asked for more contrast and more vibrancy — "a very minor lift", with Spotify named as the
right balance. The method, which matters more than the values:

- Every coloured token kept its **OKLCH hue angle** and gained chroma: the status colours ×1.22,
  the rest ×1.15, and the brand gold only ×1.06, because the gold is the brand and should not
  wobble. Lightness was held except where contrast demanded otherwise, so nothing changed
  identity — blue is the same blue, louder.
- Light `--ink-2` and `--ink-3` deepened a step and dark `--ink` brightened one. Dark `--bg`
  dropped from #111215 to #0f1013 while the surfaces stayed, so a card reads as raised rather
  than as the same grey. That separation, not the saturation, is the part that reads as Spotify.
- It fixed two marks that were **under the 3:1** a non-text mark needs: light `--amber` at
  2.92:1 and `--gray` at 2.71:1, now 3.48 and 3.23.
- Two of the eight avatar hues were respaced. `--avatar-7` sat **1.1 degrees** from `--avatar-1`
  — the same pink twice — and `--avatar-4` had a chroma of 0.022, which is a grey with an
  opinion, ten degrees off `--avatar-5`. The eight were really six, which the muted palette hid
  and the lift exposed. The hash that picks a hue by name is untouched, so a name keeps its slot
  and only the slot's paint changed.

Four grounds were added beside the eight (`--icon-ground-1` to `-4`) for the faces a person may
choose for a space; white clears 4.5:1 on all twelve. Fifteen more followed on 26 September 2026
(`--icon-ground-5` to `-19`, ADR 0064's amendment), and white clears 4.6:1 on each of them. The consequence the original decision
already anticipated holds: the tokens are still the only definition, the phone still transcribes
them, and `tokens.vitest.ts` still fails on drift.
