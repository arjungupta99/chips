# 0289. What a harness was sent waits until it is listening

Date: 9 November 2026
Status: Accepted. Arjun, 9 November 2026: "Yes, start there", to reproducing and fixing the
start-up loss before the rest of the group-messaging audit's list.

## Context

A harness passes `since`, or a `store` that keeps it, so that what was said while it was down
reaches it at its next start. The SDK held that replay for one tick after `connect` resolved. The
contract was that a harness attaches its handlers right after `await connect(...)`. The Phase 1
review asked whether that contract was acceptable (question 3) and it was left as it was.

Three bridges did not keep it. The Claude Code and Codex bridge, the Hermes bridge and the OpenCode
bridge each look for git, and list or register their agents, before they attach a handler. So the
replay was handed to nobody. The SDK's place in the log had moved past it, so a later restart did
not bring it back either. A message sent while one of those bridges was down, or restarting for an
update, got no run and no answer, and nothing said so.

It was found by reading on 9 November 2026 and reproduced the same day:

- in the SDK's suite, with a handler attached after a short wait and a call to `agents.list()`;
- on each of the three bridges as released (1.0.17, 1.0.21 and 1.0.19, on SDK 1.0.3), started in
  the order its `main.ts` starts it, against the conformance fake.

The OpenClaw bridge was not affected. It attaches its handler at once and keeps a cursor of its
own, which moves only when an event has been handled. Jacobian has its own client.

## Decision

1. **An event nothing could take is not heard.** The SDK's first hold lasts until the harness is
   listening: it has attached a handler for an event (`on`), a handler for rooms asked of it
   (`onSpaceAsked`), a waiter (`waitFor`), or it has a run, which takes what a person does to it
   with no handler at all. `hello`, `state` and `receipt` are the connection's own, and a handler
   for one of those alone is not listening.
2. **The hold ends a tick after the first of those**, so handlers attached together all hear what
   was held, in order, before anything said after it.
3. **The place in the log does not move while events are held.** A harness that stops before it
   listens is sent them again at its next start.
4. **A harness that never listens holds only so much**: the newest 20,000 events (`HELD_MOST`).
   Without that it would keep every event of its rooms for as long as it ran.
5. **Nothing a harness calls has changed.** `connect` does not take the handlers: every bridge
   builds the thing that handles events from the connection, so it could not hand them over first.

## Consequences

- The three bridges need no change of their own. They need the next SDK release, and a release
  each on it.
- Checked on each bridge with only the SDK's `connect.js` replaced: a message said while it was
  down is answered when it starts, and its whole suite passes (101, 151 and 92 tests).
- A harness that attaches one event handler, waits on something, and then attaches the rest still
  loses to the later ones what arrived in between. The SDK's page says to attach them together.
- A message is still run at most once. The place in the log moves when a message is heard, not
  when its turn ends, so a turn that was waiting or going when a bridge stops is not run again.
  That is the audit's next finding and is not changed here.
- A harness that never listens used to drop events as they came. It now holds up to 20,000.
