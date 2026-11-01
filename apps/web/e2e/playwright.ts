/**
 * The web suite's Playwright, for specs that live outside `apps/web`: `testing/join-and-remove`
 * keeps its specs beside its runbook. A module resolves `@playwright/test` from where it sits, and
 * nothing above `apps/web` has it, so those specs import it from here. It is then the very copy the
 * runner loaded, which Playwright requires.
 */

export * from "@playwright/test";
