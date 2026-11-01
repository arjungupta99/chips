# 0077. Chips promises for a harness only what it declares, and keeps each harness apart

Date: 26 September 2026
Status: Accepted. Extends 0046 and 0051; narrows the sheets of 0066 and 0069. Amended by [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md),
29 September 2026: point 3's lane lands in the agent's room, and open decision 8 is decided.

## Context

Arjun, 26 September 2026: "I need to make sure Chips will work with multiple harnesses." Chips has
had one real harness since the day it was built, Jacobian, and the demo's Scout beside it. The wire
and the server were built for several from the start: a workspace holds any number, a room holds
several with people (M3.3, `group.spec.ts`), a mention picks one out, and the + offers every
harness that takes new spaces. ADR 0051 moved Jacobian's adapter out of this repository and took
its name out of the CLI's commands.

A read of the code that day found what had grown one-harness-shaped since, none of it visible
with only Jacobian connected:

- **The delete and archive sheets promised Jacobian's behaviour for every harness.** Any room a
  harness opened under a key got *It's deleted in <harness> too* and *unarchive it, here or in
  <harness>*. That is what Jacobian does (ADR 0066, ADR 0069). ADR 0066 itself says another
  harness may ignore `moved_by`, and nothing told the sheets which one does.
- **The CLI kept one record per adapter.** A second `chips connect custom` wrote over the first
  harness's record: its token stayed live in the keychain with nothing pointing at it, `doctor`
  stopped checking it, and `disconnect` could reach only the newest.
- **A lane landed in the oldest direct room** the person shared with the harness. A harness that
  opens a room per thing it keeps — Jacobian's fifty-odd, most of them archived — got its lanes
  in whichever was made first, not its home.
- **Nothing stopped two harnesses answering each other.** Every harness in a room hears what every
  other says as `message.new`. Scout drops what is not a person's; the SDK did not.
- **Jacobian was named in copy**: the Add a harness hint and two lines of the CLI's help.

His call: the cleanup and a guard against the drift now, then the OpenClaw bridge (M7.1) as the
second real harness that proves it. He weighed and deferred two larger pieces: a harness declaring
its own capabilities in `hello`, and a room drawing two live runs at once.

## Decision

1. **A promise made on a harness's behalf needs a capability it declared.** `follows_rooms`
   joins `autonomy` and `new_spaces` in `HARNESS_CAPABILITIES`. It means the harness keeps its side
   of a room it opened in step with the room. An archive or unarchive here is carried over to it.
   A delete deletes the harness's thing when its owner deletes, and archives it for the owner when
   anyone else does. The sheets (`putAway.ts`) name the harness only when it declares this;
   otherwise they say what happens here and nothing about there. The rule is ADR 0046's, stated
   generally: **any feature that needs a harness's cooperation names a capability, and the clients
   draw or promise it only for a harness that declared it.**
2. **The CLI keeps one record per harness, by its id.** `connect` always makes a new harness and
   writes it beside the others. When a harness of the same name is already here, it says so first.
   `disconnect`, `--rotate`, `declare` and `doctor` find a harness by its id, its name, or its
   adapter's word while that adapter made only one. They refuse the adapter's word when it means
   several, naming the choices. `doctor`'s checks and fixes use the word that means that harness
   alone (`nameFor`). Since 27 September 2026 that word is the harness's name even while it is the
   only one of its adapter, and its id when the name is shared. The adapter's word had it saying
   `harness:custom` for OpenClaw, which says nothing about which harness (the OpenClaw test,
   finding 19). The way back that `disconnect` and `doctor` print keeps the name too.
3. **A lane lands in the specialist's home.** `directSpaceBetween` orders the harness's home
   first (ADR 0069), then an open room before an archived one, then the oldest.
4. **The SDK hands a harness another harness's words only when they name it.** A `message.new`
   from a harness reaches `chips.on("message.new")` and a run's `message` only when its
   `mentions` hold this harness. `hearHarnesses: true` hears all of it, and the `event` stream
   carries everything either way. This is the SDK's default, not a rule of the server. A harness
   speaking the wire by hand decides for itself; the connect guides say so.
   Superseded on 27 September 2026 by ADR 0081: Chips decides who every message is for, and a
   harness a message is not for hears it as `message.overheard`, so the SDK's filter and
   `hearHarnesses` go.
5. **Chips names no harness in what it ships.** `tools/guardrails/no-harness-named.test.ts`
   parses the source of the server, the clients, the CLI and the packages. It fails on *Jacobian*
   or *OpenClaw* in an identifier, a string, template text or JSX text. Comments and tests are not
   read, and neither is `adapters/`, where a first-party adapter will carry its own name.
6. **The web end-to-end suite runs three shapes at once** (`shapes.spec.ts`): Scout, Tree
   (`new_spaces`, `follows_rooms`, the shape Jacobian has) and Plain (nothing declared). The spec
   checks that the + offers Scout and Tree and never Plain, and that the delete sheet promises for
   Tree and not for Plain. `POST /v1/dev/harnesses` takes `capabilities` so a spec can make these.

## Consequences

- **Jacobian's sheets go quiet until it declares `follows_rooms`.** On his server it declares
  `new_spaces` alone today. `chips declare Jacobian new_spaces follows_rooms` puts the promise back,
  and a person does it, since only a person may declare (ADR 0046). The connect guide says so.
- A harness that follows rooms without declaring it loses nothing but the sentence on the sheet;
  the events it reads are unchanged.
- `Connected.connection` is absent when a new connection is declined, since no record exists.
- Two harnesses given the same name are told apart by id. The CLI does not stop you making them.
- Left for later, and weighed on 26 September 2026:
  - **Capabilities declared by the harness in `hello`.** Only a person may declare, and a change
    reaches clients only when they next read the directory.
  - **A room drawing each harness's live run.** `Space.run` is still the room's newest run. Since
    27 September 2026 a room shows a thinking bubble for each harness still working (core's
    `spaceDoing`) and the open asks of every run, on the desktop as on the phone: with Jacobian
    and OpenClaw in one room, Jacobian worked on for 28 seconds with no bubble once OpenClaw had
    answered (the OpenClaw test, finding 22). Drawing every live run in full, with a header, a
    run panel and steering for each, is still left for later.
  - **One connection carrying several agents** (open decision 8). The OpenClaw bridge will force
    this one.
  - **The task bubble reads Jacobian's text convention** (`taskWords.ts`). It is harmless for
    another harness, which it gives up on quietly. It should become structured events when a
    second harness wants the same bubble.
