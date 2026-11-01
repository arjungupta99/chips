# Working on Chips

How the people who make Chips work on it. Anyone else asks for a change with a feedback prompt
([`CONTRIBUTING.md`](../CONTRIBUTING.md),
[ADR 0237](decisions/0237-chips-takes-feedback-prompts-not-pull-requests.md)).

## Every commit is signed off

A commit ends with a sign-off line, which `git commit -s` adds:

```
Signed-off-by: Your Name <you@example.com>
```

CI's first job refuses a commit without one ([ADR 0014](decisions/0014-licensing-and-contribution.md)).
No code comes in from outside, so it no longer licenses anybody's contribution. It says who made
each commit.

## How we work

- **Trunk-based.** Small commits on `main`. Feature branches are for experiments.
- **[Conventional Commits](https://www.conventionalcommits.org/).** `feat:`, `fix:`, `docs:`,
  `test:`, `chore:`, `refactor:`, `build:`, `ci:`. A commit that adds a runtime dependency says
  in one line why it is needed.
- **Done means tested and documented.** Code, tests at the right level, and the docs updated in
  the same commit. A failing test is never skipped to move on.
- **The engineering standards are requirements**, not aspirations. They are in
  [`technical-plan.md`](technical-plan.md) section 6, with a self-review checklist in
  Appendix G. Run it before a change lands on `main`.
- **Decisions get written down.** If you have to make an architectural choice, add an ADR in
  [`decisions/`](decisions/) using the template in Appendix E of the plan.

## What CI enforces

`pnpm lint` (Biome plus the dependency-cruiser layer rules), `pnpm typecheck`, and `pnpm test`
with coverage thresholds. Layer violations, dependency cycles, coverage below threshold and a
stale architecture graph all fail the build. See [`architecture.md`](architecture.md).
