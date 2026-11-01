# 0022. Who may append an event is one function in the domain

3 September 2026 · Status: accepted

## Context

By the end of M1.3 the question "may this sender append this event?" was answered in five
places, in five shapes: the direction rule and the idempotency rule inside `submitEvent`; the
membership rule beside them, through a port; run ownership and the state machine's word in
another function of the same file; and an agent-only check in one HTTP route. Visibility — who
may *read* an event — lived in its own module with a SQL twin. The Phase 1 interim review said
this would hurt, and named M1.4 as the last cheap moment, because M1.4 adds the policy engine
and first-answer-wins: two more rules, and a sixth place.

## Decision

`server/src/domain/authorize.ts` holds every rule about appending, pure, in the order they are
asked:

1. the event stays in the sender's workspace, on the sender's own behalf;
2. it is the kind of event that kind of sender sends; a message is the one both send;
3. it carries an idempotency key;
4. an event into a run names one that exists, in its own conversation, that the sending agent
   started, and that its state takes;
5. an event into a conversation comes from a member; opening one is the exception;
6. a decision is the first: an approval already resolved and a question already answered take
   no second answer.

`authorize(event, sender, context)` composes them; the per-rule functions are exported too, so
the use case can ask each one right after the lookup it needs and stop at the first refusal —
a forgery costs no query beyond the one that caught it. The context is what was looked up, with
every field required and `null` for "looked up, nothing there", so a use case cannot forget a
lookup and have a rule silently pass.

The policy engine is a separate pure function, `evaluate`, because it answers a different
question: not "may this be appended?" but "does this action need a person?". The use case asks
`authorize` before the append and `evaluate` after it, and what the engine decides is appended
as an event of Chips' own.

Visibility stays where it is. A read has no sender, and the SQL twin has to stay beside the
predicate it mirrors.

## Consequences

- The rules can be read in one sitting, and each has a test that says what it means without a
  database; the use case's tests say how the lookups feed them.
- The HTTP route's agent-only check is the one rule left outside: it is about the *route*, not
  the event, and stays at the edge.
- A new rule is a function in one file and a line in the composition. M1.5's attachment rules
  and Phase 3's lane rules go there.
- `SHARED_EVENTS` moved into the domain with the direction rule; the application layer
  re-exports it, so nothing that imported it changed.
