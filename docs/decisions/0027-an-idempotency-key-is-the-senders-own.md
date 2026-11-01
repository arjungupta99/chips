# 0027. An idempotency key is the sender's own

5 September 2026 · Status: accepted

Found by the docs' cold read at M2.6, on the third curl line of the second harness.

## Context

Every client-originated write carries an `idempotency_key`, and sending the same key twice is a
no-op: the second call is answered `200`, `"duplicate": true`, with the sequence number of the
first. The first schema made that promise with a unique index on `(workspace_id,
idempotency_key)` — a key was unique per workspace.

Add harness, Custom suggests the same three lines to every new harness, and the third says
`"idempotency_key": "hello-1"`. Two harnesses added in one workspace both say `hello-1`: the
second's message was answered as a duplicate of the first's, its Messages row stayed dark, and
nothing said why. The same shape lets any credential silence another's write by guessing its
key — a harness that sends `arjun-yes` before the person does would have the person's decision
answered as a duplicate of its own event — which is an integrity hole as well as a surprise.

## Decision

A key is one sender's promise that a retry changes nothing; it says nothing about anybody
else's events. Uniqueness is per `(workspace_id, actor_id, idempotency_key)`. The store looks a
duplicate up by the sender's id and key, never by the key alone; migration
`0006-idempotency-keys-are-the-senders` rebuilds the index, which cannot fail on an existing
log because every row was already unique under the wider constraint. The conformance kit's fake
restates the rule, and the docs say it in the three places a harness author reads about keys.

For one sender nothing changes: a resend is still `duplicate: true`, and a key is still
required on every write.

## Consequences

- `hello-1` works for every harness, so the app's suggested lines keep their key.
- A credential cannot pre-empt another's write. A person's `approval.resolved` and a harness's
  event never share a namespace.
- The server's `findExisting` and the kit's `Workspace` agree; `gateway.test.ts` and
  `workspace.test.ts` each carry the two-senders case.
- Postgres (Phase 6) inherits the three-column index.
