# 0013. Astro Starlight, with a generated reference and executed samples

2 September 2026 · Status: accepted

## Context

The blueprint calls documentation a product surface, tested in CI and linked from every card in
the app. Hand-written protocol reference pages go stale within a phase.

## Decision

Astro Starlight in `apps/docs`. The protocol reference is generated from the Zod schemas. Every
code sample in the docs is a file under `apps/docs/samples/` that CI executes and fails on a
non-zero exit. Broken links fail the build.

## Consequences

- A protocol change updates the reference in the same commit or CI goes red.
- A sample that stops working is a build failure, not a support ticket.
- Concept pages are written by hand, one per noun from the blueprint, and use the same words as
  the code (section 6.1, the ubiquitous language).
