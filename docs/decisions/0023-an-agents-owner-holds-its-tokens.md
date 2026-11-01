# 0023. An agent's owner holds its tokens

4 September 2026 · Status: accepted

Answers the plan's open decision 3, "Who may add an agent, and revoke its token?", raised by the
Phase 1 review and blocking M2.1.

## Context

`POST /v1/agents` mints a token and hands it over once. Nothing takes it back. The registry has
had a `revoked_at` column since M0.3 and the authenticator has honoured it since M0.4, but no
route and no screen ever set it, so a Custom agent's token lived until somebody edited a row —
which is the Phase 1 review's condition 2, and known issue 3 in its packet.

Revocation needs an answer to a question Phase 1 left open, because in solo mode it did not
matter: who may do it. Every participant row already carries an `owner_id` — "the person
accountable for it" — and `addAgent` fills it in with whoever added the agent. Nothing has ever
read it for a decision.

Two shapes were available. A workspace-wide role ("owners may manage every agent") is what a
team eventually wants, but roles are M5.2 and inventing half of one here would be a rule to
unpick later. Per-agent ownership is already in the schema, already written on every agent, and
in solo mode is indistinguishable from the alternative.

## Decision

**Adding an agent stays open to any person in the workspace. Its tokens belong to its owner.**

- `POST /v1/agents` is unchanged: any person may add one, and becomes its `owner_id`.
- `POST /v1/agents/:id/tokens` issues a new token, and `DELETE /v1/agents/:id/tokens/:tokenId`
  revokes one. Both are refused unless the caller is a person, in the agent's workspace, and is
  the agent's owner. Rotation is the two together, in that order — issue, then revoke — because
  the other way round leaves an agent unable to speak in between.
- `GET /v1/agents/:id/tokens` lists what exists without ever returning a token: an id, a name,
  when it was made, when it was last used, and whether it has been revoked. Chips keeps only
  digests (ADR 0006), so this is all it could say even if it wanted to.
- Revoking is a registry write, not an event, for the same reason minting is (ADR 0018): a
  token's digest must never be in the log, and neither must the fact of a particular digest.
  What the audit log records is the `policy.updated` that follows a change in what an agent may
  do — not the credential it uses.
- A revoked token is refused at the next request and the next socket frame. The socket a revoked
  token already holds is closed rather than left open until its next heartbeat: a credential
  that has been withdrawn should stop working now, not within a minute.

When roles arrive (M5.2), a workspace owner is added to the rule rather than replacing it: the
owner of an agent, or an owner of the workspace.

## Consequences

- `chips connect` can offer `--rotate` honestly, and the Agents tab can show a token's life and
  end it.
- The rule is one predicate, `ownsAgent`, beside `authorize` rather than inside it: `authorize`
  answers "may this be appended?", and a token is not an event (ADR 0022).
- A person who adds an agent and then leaves takes its tokens with them until roles arrive. In
  solo mode there is one person, so this is not yet a hole; it is why M5.2 adds to the rule.
- The plan's open decision 3 is answered. The plan is edited only at gates, so the row is
  struck at Gate 2; `STATUS.md` records the answer meanwhile.

## Addendum, M5.2 (6 September 2026)

Roles arrived (ADR 0034), and the rule grew as this record said it would: a harness's tokens are
its owner's, or a workspace owner's or admin's — `ownsHarness` in `domain/ownership.ts` reads the
caller's role beside the registry's `owner_id`. Ownership moves by `POST /v1/harnesses/:id/owner`,
the same people's to do, to a person in the workspace who is not a guest. The registry column
stays the truth for who owns a harness, and the handover is recorded as `harness.transferred`
for the audit and the screens; a replay changes no registry row, which is the line ADR 0018
draws. A person who adds a harness and then leaves no longer takes its tokens with them.
