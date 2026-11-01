# `@chipschat/ui`

The design system: the blueprint's tokens, primitives and cards, in plain CSS and React
([ADR 0009](../../docs/decisions/0009-ui-react-plain-css.md)). No utility framework, so the
design language survives; a colour that is not a token is a bug.

A page imports `@chipschat/ui/styles.css` once — the three faces, the tokens, the base — and each
component brings its own stylesheet with it. `@chipschat/ui/tokens.css` and `@chipschat/ui/fonts.css`
are exported on their own for a page that wants only those; the docs site is one.

## What it holds

| Module | What it is |
|---|---|
| `styles/tokens.css` | The palette in light and dark, the type, the radii, the motion. Copied once from the blueprint and the only definition since. |
| `styles/fonts.css` | Bricolage Grotesque, Instrument Sans and JetBrains Mono, self-hosted through Fontsource. |
| `styles/base.css` | The box model, the body, one focus ring, reduced motion honoured everywhere, `.ui-visually-hidden`. |
| `theme.ts` | `applyTheme`: light, dark, or the system's choice, written as `data-theme` on the root or on any subtree. |
| `vocabulary/` | The words the components share: the seven harness statuses, the four autonomy levels, the three tiers of attention, the risk classes, the context ring's thresholds. |
| `format.ts` | Sizes, costs, durations, what is left on a clock, token counts, initials. |
| `components/` | The primitives and cards below. |

## The components

| Component | What it is |
|---|---|
| `ChipMark`, `Icon` | The mark, and the line icons the mockups use. Decoration unless given a label. |
| `Avatar` | A circle for a person, a squircle for a harness with a ring that says its state, a hash for a channel. |
| `ContextRing` | How full a harness's context window is: neutral to 70 percent, amber to 90, red past that. A native `<meter>` drawn as a ring. |
| `Pill`, `StatusPill`, `Dot` | A word with a dot in one of the five status colours. Never a colour alone. |
| `Button` | Default, primary (ink on paper), danger (quiet until hovered), ghost. |
| `Card` | A surface with a line and twelve-pixel corners; the `ask` tone is the one warm colour on a screen. |
| `TierBadge` | Decide now, Review today, FYI. |
| `AttachmentChip` | A file by name, kind and size; removable in a composer, a link in a message. |
| `Receipt` | What a harness did, collapsed under its message until somebody asks. A native disclosure. |
| `Timeline` | The plan as a rail of dots, with a tick where the context was compacted. |
| `AutonomyDial` | L0 to L3 as four radios styled as a switch, or as four bars when read-only. Levels above the workspace cap cannot be chosen. |
| `ApprovalCard` | Who wants to do what, a preview, the risk, how long is left, Deny · Edit · Approve, and the scope of a yes. Cools to green or red once decided. |
| `QuestionCard` | A prompt with tappable options, a place to type when allowed, and the default the harness will take. |
| `Composer` | Enter sends, Shift+Enter makes a line, the box grows, chips beside it. |
| `RouteCard`, `TaskCard` | One lane, two views: the lead's and the specialist's. Visual until Phase 3. |

Every component is on `/kitchen-sink` in the web app, in both themes.

## Invariants

| Invariant | Protected by |
|---|---|
| The dark palette is the same whether the system chose it or a person did. | `src/styles/tokens.test.ts` |
| An explicit light theme has exactly the root's values, and dark redefines exactly what light does. | `src/styles/tokens.test.ts` |
| No stylesheet in the package names a colour that is not a token, and none puts `--ink-4` on text. | `src/styles/tokens.test.ts` |
| Status is never gold, and idle has no ring. | `src/vocabulary/vocabulary.test.ts` |
| There is a word for every risk class the protocol knows. | `src/vocabulary/risk.test.ts` |
| Cost is always shown as an estimate. | `src/format.test.ts` |
| A harness's avatar says its state in its accessible name. | `src/components/avatar/avatar.test.tsx` |
| The dial cannot be turned above the workspace cap. | `src/components/dial/dial.test.tsx` |
| An approval card offers no buttons once decided, and says who decided and what happened next. | `src/components/approval/approval.test.tsx` |
| A question cannot be answered with nothing. | `src/components/question/question.test.tsx` |
| The composer sends on Enter, not on Shift+Enter, and never sends blank space. | `src/components/composer/composer.test.tsx` |
| Every component looks the same as it did, in both themes; the kitchen sink passes axe. | `apps/web/visual/kitchen-sink.spec.ts` |

## Adding a component

A folder under `src/components/` with the component, its stylesheet and its test; a line in
`components/index.ts`; a section on the kitchen sink; then `pnpm visual:update` to photograph
it, and a look at the two new pictures before committing them. Class names carry the `ui-`
prefix and variants are `data-` attributes, so a screen's own CSS never collides with a
component's.

## Testing

```bash
pnpm --filter @chipschat/ui test    # the behaviour, under jsdom
pnpm visual                     # the pictures, in the Playwright container (needs Docker)
```
