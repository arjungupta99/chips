# 0213. A newcomer watches Chips play a made-up workspace before setting anything up

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "Accept ADR 0213 and start building DM1", after his
"C Stage, but also add those cool green progress bars" on the mock. Built to the
[demo mode build plan](../proposals/demo-mode-build.md). Changes the top of the first
screen a phone with no workspace shows (`app/pair.tsx`) and the web's and the Mac's unpaired page;
the ways in below it (ADRs 0164, 0172, 0207) are unchanged. First-time notes and Learn Chips, also
on the mock, are not part of it.

## Context

Arjun, 20 October 2026: "We need to build a beautiful and cool onboarding for first time chips
users… My goal is that user can understand the app features and how to use it. I was also
wondering if we should have some kind of 'Demo mode' that basically shows app running with like
beautiful text commentary."

A phone with no workspace opens on **Welcome to Chips**: paste an invite, Chips found on this
Wi-Fi, or your own Chips paired from a computer. Each needs a server somebody already runs. A link
from an invite opens its own join card (ADR 0207), so the people who meet this page are mostly the
ones who found Chips without one, from the App Store or the website. They have nothing to tap, and
nothing on the page says what Chips does. A browser or the Mac app with no server is no better off.

The mock (<https://claude.ai/artifact/Jj6hN3L16NcvFejmgDute8>, private, kept out of the repo) drew
eight ideas and built five. Its centre is a one-minute film of the app's real screens playing a
made-up workspace, in ten chapters, captioned three ways: A, a capsule grown out of the Dynamic
Island; B, a spotlight that dims all but one thing; C, the app stepping back onto a stage with big
captions under it. He took **C**, and asked for "those cool green progress bars": the green segment
bar of the mock's Learn Chips card, under the stage. He also asked that the captions claim nothing
that could cause liability, so "Nothing risky without you" became "When it asks, you decide".

The store already takes its connection, its reads and writes and its cache as options
(`StoreOptions`), which the core tests use to run it with no server. That is the seam a demo needs.

## Decision

1. **The demo is a workspace that lives only on the device.** The app's own screens draw it, over
   the store every workspace has (`createStore`), with the store's own seams handed a script:
   - the connection (`connect`): a transport that opens, says hello with the demo's rooms, and
     then plays the script's events, and that does for a sent event what the server does: echoes
     a message or a steer with its key, acks an answer, and says a message sent mid-run was steered;
   - the reads and writes (`get`, `post`, `put`, `patch`, `remove`), answered from the made-up
     workspace; Search searches the demo's own messages;
   - the cache (`openCache`), in memory;
   - a link for the demo's device (`useLink`), which answers a file asked for by id with a picture
     the app carries, so a room's picture draws as any other.

   The demo's device signs its requests, as every device does, with a key made in memory when the
   demo starts; nothing reads the signature. No server, relay, network request or pairing is
   involved, and nothing the demo does leaves the device. A demo device (`isDemo`) shows no setup
   card and no welcome, registers no push token, asks for no permission, hears no join request, and
   counts nothing at the relay (ADR 0208).
2. **One script, in core, for every client.** `packages/core/src/demo/` holds the made-up
   workspace, its ten chapters and the player that runs them. A chapter is the events it plays,
   the waits between them, the caption it shows, and at most one **Your turn**: a wait for an event
   the person's own tap sends through the store, a message from the composer (Ask) and the
   approval card's Approve (Approve). The real composer and the real card send them, so the tap is
   the real one. Nobody tapping, the player sends the same event itself after five seconds. The
   phone, the web and the Mac draw the same film from the same script.
3. **The film is Stage, with the chapter bar** (his C). While it plays, the app's root view steps
   back onto a stage: scaled to three-quarters, under the status bar, with rounded corners and a
   shadow. Under it:
   - **The chapter bar**: ten segments, one per chapter, in green. A finished chapter is solid;
     the one playing fills with the player's clock and glows; one just finished gives a small
     jump. A tap on a segment plays that chapter.
   - **The caption**: the chapter's name small, then its line, a word at a time, then a sentence
     under it. A Your turn says so in the accent and names the one control to tap, which wears a
     ring until it is tapped.
   - Leave (✕) at the top right; a tap on the stage pauses and plays. With Reduce Motion on, the
     words come at once, and the stage, the bar and the screens change without springs.
4. **The made-up workspace names nothing real.** Chips names no harness in what it ships (ADR
   0051's guardrail, `no-harness-named`), so the demo's harnesses are invented: **Errand** (an
   assistant), **Studio** (draws and builds) and **Herald** (a morning brief), named so their faces
   come out in different colours. Its agents take first names from the list new agents get (ADR
   0150), each in one room at a time (ADR 0087): Milo and Oscar on Errand, Theo and Felix on
   Studio, Hugo on Herald. Its people are you and Rosa. Places, prices and people are made up, so
   the film says nothing about a real business, and its Spaces title says Demo.
5. **The first film's ten chapters** are the mock's: Spaces, Ask (your tap), Watch, Steer,
   Results, Teamwork, Approve (your tap), Lock screen, Agents, and the end card. Its room holds a
   person and two agents on two harnesses. It plays the wire's own events, the ones a harness's
   would be: `run.started`, `run.status` and `step.log` (from which the thinking bubble says what it
   says, ADR 0147), `message.post` with a table (ADR 0184) and with a picture, Milo's message to
   Theo in the same room with the `mentions` and `addressed_to` the server would write (a lane
   would hand the work to another room), `approval.request` (ADR 0142), and `run.completed` with
   what the run cost.
   **The lock screen is a picture**: the player draws a lock screen with the question on it inside
   the stage, and the Approve on it is the picture's own. The demo never posts a notification.
6. **Captions describe what you can do, and promise nothing an agent does.** When an agent asks is
   its harness's choice (ADR 0195), so no caption says agents ask before anything risky, that a
   notification always arrives, or that setting up takes minutes. The words live in the script, in
   one place, so they are read and changed together.
7. **The end card offers four ways on**: **Set up my own Chips** (the pairing page, as today), **I
   have an invite** (the paste field), **Look around**, and **Watch again**. Look around keeps the
   demo in the workspace switcher (ADR 0197) as **Chips demo**, with a Demo tag on its Spaces title,
   until it is removed like any workspace. In it the rooms scroll and open; a message sent gets one
   canned answer; what needs a server (connecting a harness, inviting somebody, pairing a device,
   an agent's model or context) says it is not in the demo, with Set up my own Chips beside it.
   **The demo is never written where the device keeps its workspaces**, where one key that fails to
   load empties the whole list. The app holds it beside them, as a word in its own preferences, and
   builds it again at each launch from the script, played to its end at once.
8. **Two short films follow the first**, from where it stops, offered on its end card under
   **More to see**. **Your agents, up close**: an agent's page, its model and effort, its
   instructions edited and saved, its context compacted, a fork into a new room, a move to another.
   **Costs and trouble**: what a job did and cost, the room's spend per job, Not right? on a reply,
   and an agent whose harness is offline. Each has one Your turn (Save; Send to Milo). They open the
   app's own pages and sheets: the player names the screen and the sheet, and the client opens it.
9. **The first screen plays the idea before it asks for anything.** At the top of the phone's
   Welcome to Chips, and of the web's and the Mac's unpaired page: a nine-second preview, looping
   (you ask, an agent works, it asks, you approve), then **Chat with your AI agents**, a line, and
   three ways on: **Watch Chips work · 1 min** (the film), **Paste an invite link**, and **Set up my
   own Chips**, which opens the page's ways in as they are today. Chips found on this Wi-Fi (ADR
   0172) slides up from the foot when it is found. The preview is plain animation, with no store
   under it.

## Consequences

- No server change, no migration, nothing to restart: the work is core and the three clients, and
  it goes live as the web build, the Mac app and a phone build.
- The script is written against the wire's events, so a change to the wire can break the film. A
  core test plays every chapter through the real fold and checks what each one leaves on the
  snapshot, and the protocol's schemas parse every event the script holds, so the break shows in CI
  rather than on a newcomer's phone. What the server writes into an event (who answered and when,
  who a message is for, its mentions) the script writes too.
- The demo's store must never reach the network: a test plays the whole film with `fetch` and the
  transport's own `connect` made to throw.
- The places that make a store (the phone's `workspaces.ts`, the web's `App.tsx` and
  `useWorkspaces.ts`) each learn one branch: a demo device's store is made with the demo's options.
- Two "Chips demo" workspaces cannot exist: the demo's device is one fixed id, which pairing never
  makes.
- A screen that reads something the script does not answer draws its empty or failed state in the
  demo. Each chapter's screens are walked on the phone, the web and the Mac before it is done.
- With Apple's prior approval, a built-in demo mode can stand in for App Review's demo account,
  which would retire the `chat.chips.demo` server and its link renewed every 30 days. Asking is his.
- First-time notes (the mock keeps the island's capsule for them) and Learn Chips with Show me are
  left for a decision of their own.

## Addendum, 20 October 2026: the short films' agents answer

Building the two short films (DM5) changed two details above:

- **Errand answers an agent's page.** To play Your agents, up close, the demo's Errand declares
  models, context files, context windows and forks, and the demo answers them from memory. So in
  Look around, an Errand agent's model, instructions, Compact now, fork and move work, and the
  change stays on the device until the demo is built again. Point 7's "not in the demo" still
  covers connecting a harness, inviting somebody and pairing a device, and the pages of the agents
  on Studio and Herald, which declare none of these.
- **The copy's room is Milo · fork**, the name the room picker gives a copy's new room
  (`forkRoomTitle`), so the room is called what the sheet said it would be. The mock's name was
  "Birthday dinner · fork".
