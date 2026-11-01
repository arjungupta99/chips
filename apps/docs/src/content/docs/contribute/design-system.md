---
title: Design system
description: The tokens, the components, and how the pictures are kept honest.
sidebar:
  order: 2
---

Chips has one design language, and it lives in one package: `@chipschat/ui`. The blueprint's
tokens were copied into it once and have been the only definition since. Plain CSS, React,
no utility framework — a colour that is not a token is a bug.

## Tokens

Ink and paper carry the interface. Chip gold is the brand and stays out of status. Status
colours are reserved for meaning and always travel with a word.

| Token | What it is for |
|---|---|
| `--bg`, `--surface`, `--surface-2`, `--surface-3` | The page, a card, a quiet panel, a pressed control. |
| `--line`, `--line-2` | Hairlines, and the firmer ones on inputs. |
| `--ink`, `--ink-2`, `--ink-3` | Text, secondary text, the smallest labels. |
| `--ink-4` | Rails, chevrons and placeholder icons. Never text: at 2.3:1 it cannot carry a word. |
| `--gold`, `--gold-deep`, `--gold-soft` | The brand: the mark, selection, nowhere near a status. |
| `--blue`, `--amber`, `--red`, `--green`, `--gray` | Working, needs you, blocked, done, idle — each with an `-ink` and a `-soft`. |
| `--font-display`, `--font-body`, `--font-mono` | Bricolage Grotesque, Instrument Sans, JetBrains Mono, self-hosted. |
| `--radius-*`, `--space-*`, `--text-*`, `--motion-*` | Shapes, rhythm, sizes and timing. Twelve-pixel corners almost everywhere. |

Dark is designed, not inverted, and there are three ways to get it: the system's preference,
`data-theme="dark"` on `<html>` when a person chooses, and `data-theme` on any element to
theme a subtree — which is how the kitchen sink shows both at once. The stylesheet says the
dark palette twice, once for each route, and a test keeps the copies identical.

Two values differ from the blueprint, for contrast. Light `--ink-3` is a shade darker than
drawn, so 13-pixel labels reach 4.5:1 on white; and `--ink-4` is kept off text altogether.

## Components

The primitives and cards the plan names, each in its own folder with its stylesheet and its
test: avatars with a status ring, the context ring, pills, buttons, cards, the tier badge,
attachment chips, the receipt, the timeline, the autonomy dial, the approval card, the
question card, the composer, and the route and task cards that Phase 3 will wire to lanes.

Class names carry the `ui-` prefix and variants are `data-` attributes —
`<button class="ui-button" data-variant="primary">` — so a screen's own rules never collide
with a component's. State is always a colour plus a word; the accessible name of a harness's
avatar says its state, a receipt's tick is an image named "done", and a context ring is a real
`<meter>` underneath the picture.

## The kitchen sink

`/kitchen-sink` in the web app renders every component in both themes, side by side, with
nothing live on it. It is where you look when building a screen, and what the visual
regression suite photographs.

## How the pictures stay honest

`apps/web/visual/kitchen-sink.spec.ts` takes a snapshot of every component in each theme and
compares it, pixel for pixel, with the one committed under `apps/web/visual/__snapshots__/`.
It then runs axe over the whole page, and checks that the page turns dark the three ways the
tokens promise.

Pixels depend on the browser, the operating system and the fonts, so the suite only ever runs
in one place: the Playwright container image whose version matches `@playwright/test`. CI runs
it there; `pnpm visual` runs it there from any machine with Docker, against a copy of your
working tree, and copies new snapshots back. `pnpm visual:update` rewrites them — look at the
diff before you commit it, because the diff is the review.
