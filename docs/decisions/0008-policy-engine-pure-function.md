# 0008. The policy engine is a pure function

2 September 2026 · Status: accepted

## Context

Policy decides whether an action needs a person. It is the most security-sensitive code in the
product and the thing a reviewer most needs to be able to read in one sitting.

## Decision

```ts
evaluate(action, agentPolicy, workspacePolicy) -> { decision: 'allow' | 'ask' | 'deny', approvers?, reason }
```

A pure function, in the domain layer, with no I/O. Autonomy levels L0 to L3 are presets that
expand to rules. Rules match on `kind` globs and on flags: `external`, `irreversible`,
`money_usd`. Tested exhaustively with a table, and with property tests for the invariants.

## Consequences

- The workspace cap always wins, so a workspace can forbid what an agent's own policy allows.
- A decision is reproducible from its inputs, which is what makes the audit record meaningful.
- 90 percent line and branch coverage applies here, and the reason string is part of the
  contract: an agent gets to read why it was refused.
