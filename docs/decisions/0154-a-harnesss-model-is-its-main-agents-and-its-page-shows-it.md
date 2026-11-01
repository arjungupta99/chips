# 0154. A harness's model is its Main agent's, and the harness's page shows it

Date: 12 October 2026

## Status

Accepted (Arjun, 12 October 2026: "go with your recommendations", on
`docs/proposals/claude-api-plan.md`).

## Context

Arjun has Claude API credits and asked for a way to switch Jacobian to the Claude API, from the
harness's page and from an agent's page, OpenClaw not yet.

An agent's page already changes what it runs on (ADR 0140, 0141). The harness offers the models,
their effort levels and every word for them. Chips names none. So Claude on an agent's page needs
nothing from Chips: once Jacobian offers Claude's models, they are in the sheet.

The harness has no model of its own in Chips. What it runs on with nothing chosen is its Main
agent's (ADR 0087; Jacobian's is J): each agent with no model of its own says "Same as Jacobian"
and follows it (21 active on 12 October). Changing the Main agent's model already moves every
follower, but nothing on the harness's page says so.

Three ways were set out. A new harness-wide switch ("ChatGPT sign-in | Claude API") would need a
new copy, a protocol change, a migration and work in both adapters, and would say the same thing
as the Main agent's row. He picked the plan's recommendation: the row.

## Decision

- **The harness's page shows its Main agent's Model row,** under Restart. It is the same row and
  the same sheet as that agent's page, read and changed the same way (`useModelGroup` on the
  phone, `ModelGroup` on the desktop). Its foot says who follows it: "21 agents have no model of
  their own and use Jacobian's."
- **Which agent:** the harness's Main agent that isn't archived (`harnessModelAgent` in core). A
  harness without one shows no row.
- **Who sees it:** the same people as on the agent's page: the harness's owner, or an owner or
  admin of the workspace, while the harness declares `models` (ADR 0140).
- **Any harness:** Chips names no harness, so OpenClaw's page shows its Main agent's row too. It
  has no Claude models to offer yet.
- **The models are the harness's.** Jacobian offers Claude's alongside the ChatGPT sign-in's once a
  key is set on the Mac mini (`npm run setup:auth`, option 3). It never takes one through Chips:
  credentials are issued from a computer, never pasted on a phone. Jacobian offers the newest
  model of each family, as Anthropic's Models API lists them, each with the effort levels the API
  gives it. A switch moves turns only: Jacobian's own background work keeps its utility model.

## Consequences

- No protocol change, migration or server restart. The phone, the web and the Mac app take it in
  their next build.
- Changing the Main agent from the harness's page changes the harness's model for every agent
  without one of its own, as its foot says. An agent with its own keeps it.
- What a Claude turn costs reaches Chips as for any run, from Jacobian's prices for the 5.x
  models. Turns on the ChatGPT sign-in stay at $0.
- If the Main agent is archived, the row goes with it. The harness's page then has no Model row
  until it has a Main agent again.
