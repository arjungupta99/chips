# `@chipschat/web`

The web client. The desktop shell and browsers load this ([ADR 0009](../../docs/decisions/0009-ui-react-plain-css.md)).
React 19 with Vite, the design system from [`@chipschat/ui`](../../packages/ui), the protocol
client and state from [`@chipschat/core`](../../packages/core). No utility framework — the design
language lives in `@chipschat/ui`.

This app is thin. It holds no idea of what happened that the log does not: `@chipschat/core` folds
the event stream into a model, and these components render it. The two things it keeps that are
not in the log are which space is open and which tab is selected.

## The shell

The blueprint's desktop: a sidebar, the space, and the live run.

| Part | What it is |
|---|---|
| `app/App.tsx` | The pairing gate. A paired browser goes straight to the shell. |
| `app/Shell.tsx` | Subscribes to the store; lays out the three panes; holds the open space and the tab. |
| `app/Sidebar.tsx` | Spaces, Search, Agents and Audit; the spaces; the person (You). |
| `app/SpaceView.tsx` | One space: the header, the messages, the approval and question cards the run waits on, and the composer. Where the golden loop plays out. |
| `app/room/` | The room's sheet, the phone's as a dialog from the room's name (ADR 0151): who is here, Add, Lead, Spend per job, Files. |
| `app/RunPanel.tsx` | The live run: goal, autonomy, context ring, the timeline, the cost. |
| `app/NeedsYou.tsx` | The queue of everything waiting on a person, across every space. |
| `app/Markdown.tsx` | Renders `@chipschat/core`'s safe Markdown tree — never HTML — and resolves @mentions against the people in the space. |
| `src/kitchen-sink/` | `/kitchen-sink`: every `@chipschat/ui` component, both themes. What the visual regression suite photographs. |

## Authentication

There is no password. The browser generates an Ed25519 key pair — in `@chipschat/core`'s
`device.ts`, as a non-extractable key in IndexedDB — and pairs it with a short-lived, single-use
code. Every request afterwards is signed over its method, full target, timestamp and body digest.
A WebSocket handshake carries no header, so the client trades a signed request for a single-use
socket ticket and opens the socket with that ([ADR 0006](../../docs/decisions/0006-auth-device-keys-harness-tokens.md)).

## Invariants

| Invariant | Protected by |
|---|---|
| A person approves in the browser, and the harness hears it and finishes. | `e2e/approval-loop.spec.ts` |
| An ask handed to somebody outside the room reaches them, says it is in a room they are not in, offers no room to open, and is answered from their queue (ADR 0042). | `e2e/outsider.spec.ts` |
| The approval card carries the action, risk classes, preview, sources and the injection flag. | `e2e/approval-loop.spec.ts` |
| A pairing code works once. | `e2e/approval-loop.spec.ts` |
| Two tabs stay in sync under a 500-message burst. | `e2e/sync.spec.ts` |
| Reloading with the server unreachable shows cached history. | `e2e/sync.spec.ts` |
| Every component looks the same as it did, in both themes; the kitchen sink passes axe. | `visual/kitchen-sink.spec.ts` |

The model, the safe Markdown, optimistic sends and read state are `@chipschat/core`'s, and tested
there under Vitest; this app's own logic is thin enough that the end-to-end suite is where it is
proven.

## Running it

```bash
pnpm dev            # from the repository root: chipsd and this app
pnpm e2e            # the approval loop and the sync tests, end to end, in a real browser
                    # fresh temporary data directory every run; ports CHIPS_E2E_WEB_PORT (5174)
                    # and CHIPS_E2E_SERVER_PORT (4432) when something else has those
pnpm visual         # every component in both themes, in the Playwright container
```
