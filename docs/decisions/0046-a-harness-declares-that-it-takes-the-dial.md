# 46. A harness declares that it takes the dial, and a timeline is shown where it has a milestone

Date: 9 September 2026 · Status: accepted

## Context

Every harness profile carried the autonomy dial — L0 to L3 and the rules under it — and every
run panel a Timeline section, from the day they were built. Both are promises: turn the dial
and the harness asks differently; read the timeline and you know how far along the run is.
Jacobian keeps neither. Its permission model is its own, per tool category and per connector,
and its channel logs the level Chips sends it and does nothing further with it; its runs are a
message and a stretch of tool calls, with no plan and no milestones. So on Jacobian's profile the
dial was a control that changed nothing the harness could see, and in its run panel the Timeline
was one row saying *ten calls · mostly web_search* (Arjun, 9 September 2026: *not very useful,
at least for Jacobian they will not be; disable or hide it where it is not needed*).

Two rules were considered for the dial. One infers from the log: a harness that has sent
`approval.request` has earned the dial, which is the checklist's own principle (ADR 0019's
projection, `CONNECTION_CHECKLIST`). It fails Jacobian, which asked once, in a test on 6
September, and would show the dial for good. The other lets the harness say so, in the slot the
protocol already has for it: the manifest's `capabilities`, "what the harness can do", stored at
registration and presented back in `hello`.

## Decision

1. **The dial is shown for a harness whose manifest declares the capability `autonomy`**, and
   for no other. `@chipschat/protocol` names the string once (`HARNESS_CAPABILITIES.autonomy`),
   `GET /v1/participants` carries a harness's capabilities to every client, and both clients
   read `takesAutonomy(directory, harnessId)` from `@chipschat/core`. The fleet's level line, the
   profile's dial and its rules, and the run panel's dial all go together.
2. **Whoever registers a harness declares for it.** `chips connect custom` declares `autonomy`,
   because a harness on the SDK reads `hello.autonomy` and `policy.updated`; `chips connect
   jacobian` declares nothing, because Jacobian does not. The demo's Scout declares it, and the
   dev route's specialists do, so the desktop's tests and the golden scenario keep their dial.
   A registration that declares nothing — Jacobian's today — gets no dial, which is the honest
   default: a control that cannot keep its promise is worse than none.
3. **A timeline is shown when it has a milestone.** `hasTimeline(run)` in core is true when
   `runTimeline(run)` holds anything other than a stretch: a plan step, a checkpoint, an
   approval, a question, a failure. A run that is only a stretch of tool calls has a receipt,
   under its summary, and no Timeline section. This needs no declaration; a plan is one.

## Consequences

- Jacobian's profile shows its status, its spaces, its budget when it has one, and its recent
  runs; its run panel shows the run, the controls, context and cost. Neither shows a dial or a
  timeline until Jacobian's channel honours the level and sends a plan — at which point
  `chips connect jacobian` declares `autonomy`, and the plan is the timeline.
- A harness registered before this decision with a capability list that names tools and not
  `autonomy` loses the dial until it is re-declared. The demo bootstrap re-declares Scout on
  every start. Nobody else's harness exists yet.
- The budget stays where it was: money is real whether or not the harness takes a level.
- The checklist is unchanged. `step.log` still "gives a timeline and a receipt"; what it gives
  is the receipt always and the timeline when there is one.
