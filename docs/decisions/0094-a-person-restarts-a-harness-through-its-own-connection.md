# 0094. A person restarts a harness through its own connection

Date: 2 October 2026
Status: Accepted. Builds on 0083 (an agent's state) and 0046 (a harness declares what it takes).

## Context

On 2 October Colima's VM died for the third time in a week, and with it OpenClaw. The bridge that
connects OpenClaw to Chips stayed connected each time, so Chips said "Can't reach its gateway"
(ADR 0083) and nothing more could be done from it. Each time the fix was the same two commands,
typed by hand on the Mac. Arjun asked for a way to start or restart a harness from its page in
Chips: "Chips will only have a hook, the actual restart script would reside at jacobian / open
claw".

Chips reaches a harness only through the harness's own connection. So the hook is a message on
that connection, and whatever holds the connection runs the harness's own script. A harness of
which nothing is connected cannot hear it. Of the mock's three options
(the session's `harness-restart-mocks.html`), he picked A: the hook over the harness's own
connection. Not B, a keeper process per machine that could start a harness from nothing; not C,
chipsd running a script itself, which would make a tap on a phone run a shell command on the
server.

## Decision

1. **A harness declares that it takes restarts.** The capability `restarts` (beside `forks` and
   `new_spaces`) says so, and only then do the apps draw Restart (ADR 0046). The harness is
   saying that it has a restart of its own and runs it when asked.
2. **A socket says that it hears them.** A harness's socket that says `restart` in its `hello`'s
   `accepts` is the one Chips asks. It is sent `{ "frame": "restart", "asked_by", "asked_at" }`.
   A frame and not an event in the log: an event would be replayed to the harness when it
   reconnects after restarting, and would restart it again. A frame reaches it now or never.
   Chips sends no command, no path and no arguments: what runs is the harness's.
3. **A person asks.** `POST /v1/harnesses/:id/restart`, with no body, is a person's: the
   harness's owner, or an owner or admin of the workspace, the people who may remove it (ADR
   0078). It is refused, in words, for a harness that is removed, one that doesn't declare
   `restarts`, and one with no socket that hears `restart` ("Chips can't reach OpenClaw: nothing
   of it is connected"). Asked again while a restart stands, it is the same restart, and the
   answer says so. chipsd's log records who asked, and how many sockets were sent the frame.
4. **Restarting is part of the agent's state.** ADR 0083's state gains `restarting: { since, by }`,
   kept in memory like the rest, and heard by every person's device through the `presence`
   frame and the directory. It ends at the harness's next word: a socket of it that opens after
   the ask (a harness that restarts its own process reconnects), or a status it reports, fine or
   in trouble (a harness that restarts something behind it says how that went). Otherwise it
   ends after three minutes, and the state says again whatever is true then, offline or in
   trouble, with Restart offered again. A harness restarting can't answer: its face wears the
   amber mark, as for any other trouble. So a harness that hears `restart` says nothing more
   until it is back, or until it knows it couldn't be.
5. **What the apps show,** on the harness's page, on the phone and the desktop alike, and only to
   the people who may ask:
   - connected and fine: "Restart <name>…", drawn quietly;
   - connected and in trouble: the same, in gold, under the line that says what is wrong;
   - restarting: "Restarting…" in place of the button, and at the top, "Restarting · asked by
     you 8:31 AM", until the harness is back, when a page that watched it says "Back · 8:33 AM";
   - offline: no button, and the reason in words: nothing of it is connected, so there is nobody
     to ask; start it on its machine.
   Restart asks first, on the sheet Remove uses: a restart stops whatever the harness is doing.
6. **The SDK** takes `onRestart` with `connect`: given it, the connection says `restart` in its
   `hello`, and it is called with who asked and when. Declaring `restarts` stays the harness's own
   act (`chips declare`), as for `forks`.

## Consequences

- OpenClaw's outages this week would each have been one press. Its bridge runs
  `scripts/restart.sh` in its own repo: Colima's VM started again if it is dead, then the
  container. It is run by hand as well.
- Jacobian restarts the process it is. `bin/jacobian restart` bounces launchd's job, which
  restarts nothing when Jacobian was started by hand (19 September), so its handler is Jacobian's
  to choose, on Arjun's word.
- A harness whose connection is closed cannot be started from Chips. For OpenClaw that is the
  bridge being down, which runs by hand today; running it under launchd makes that rare. A
  keeper that could start anything from nothing (option B) waits for a real need.
- Nothing is logged, so there is no history of restarts in Chips, as there is none of outages.
- A restart cuts off what the harness was doing. The sheet says so; runs it was in end, or not,
  as the harness's own restart leaves them.
