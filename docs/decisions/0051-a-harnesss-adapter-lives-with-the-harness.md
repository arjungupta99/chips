# 0051. A harness's adapter lives with the harness

12 September 2026 · Status: accepted

Amended by [0188](0188-the-sample-harness-is-withdrawn.md), 17 October 2026: the sample harness and
its `scout` adapter are withdrawn, and CI walks no adapter; `custom` is the manifest's one entry.

Taken on Arjun's call, the same day two fixes to the Jacobian channel were found to have been
made on Jacobian's copy of it and not on the package here that was its source of truth.

## Context

Chips is for harnesses that run themselves ([ADR 0041](0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md)):
Jacobian, Hermes, OpenClaw, anything on `@chipschat/harness`. Since M2.4 this repository held
`adapters/jacobian` — the Jacobian channel plugin, stubs of the slice of Jacobian it compiled
against, its tests, a conformance subject, and a script that vendored the plugin's modules into
the Jacobian repository. The CLI depended on that package for `chips conformance jacobian`,
carried a `jacobian` branch in `connect`, `disconnect` and `doctor`, and CI walked it through the
golden scenario.

That put the dependency arrow the wrong way round. Chips knew Jacobian — a union in
`connections.ts`, tables in three commands, a hint on the Harnesses page — while Jacobian, which
speaks Chips's public wire by hand and installs nothing of Chips, could not depend on any of it:
`@chipschat/*` is private and workspace-linked, and Jacobian is on npm. The vendoring existed to
bridge exactly that gap, and on 12 September it was found to have failed the way vendoring
fails: the picture-name fix (Jacobian's debug-jacobian #93) and the turn brackets (#95) had been
made on Jacobian's copy, a re-vendor would have erased both, and the drift guard added that
morning was a second mechanism policing the first.

Arjun's ruling, the same day: *Jacobian may depend on Chips libraries once they are published,
the way it depends on grammY for Telegram. Chips must not depend on Jacobian. Jacobian must keep
working with just Telegram or any other messenger.* And the question behind it — whether Chips
was growing Jacobian-shaped — answered: the server, the protocol and the clients name Jacobian
only in prose; the adapter package, the CLI's tables and one hint were where it was structural.

## Decision

1. **A harness's adapter lives with the harness.** Jacobian's Chips channel is Jacobian's own
   (`src/channels/chips/` there, its tests beside its Telegram channel's). `adapters/jacobian`,
   its stubs, its vendor script and its drift guard are removed, not moved.
2. **Chips names no harness in a command.** `connect`, `disconnect`, `doctor` and `conformance`
   read a manifest of adapters (`cli/src/harnesses.ts`): a descriptor says what to register,
   what to say, what to leave, and what the kit can bring up. The manifest holds `custom` — any
   harness, a token and four lines — and `scout`, the sample on `@chipschat/harness`, as the
   conformance exhibit. A first-party adapter for a harness that runs itself would be one more
   entry (OpenClaw, in Phase 7); a harness that keeps its adapter in its own repository is
   `custom`.
3. **What Jacobian needed by name is generic now.** `chips connect custom --no-dial` registers a
   harness whose permission model is its own, declaring no `autonomy` capability
   ([ADR 0046](0046-a-harness-declares-that-it-takes-the-dial.md)); the app's Add a harness
   gained the same checkbox, on by default, so both paths declare the dial explicitly rather
   than one of them by omission. The direct space registration opens is the harness's to use:
   Jacobian adopts it as J's room (`channels.chips.space_id`), so `open_direct_space: false` has
   no first-party user and stays on the wire for one that wants it.
4. **Conformance for Jacobian is run from Jacobian's side.** The kit (`@chipschat/conformance`) and
   the protocol's schemas return to Jacobian as dev dependencies the day they are published;
   until then Jacobian's own suite covers the adapter and a live smoke covers the wire. CI here
   walks Scout.
5. **A record an older build wrote under `jacobian` still reads.** `Harness` is a string.
   `doctor` warns that the adapter is gone and reads the record as a custom harness; `--rotate`
   and `disconnect` work on it; `connect jacobian` is refused.

## Consequences

- The CLI loses `@chipschat/jacobian` from its dependencies, `commands/jacobian.ts`, and every
  branch on a harness's name; it gains `harnesses.ts`, `scout.ts` and `--no-dial`. A synthetic
  adapter that exists only in a test walks every command through an injected manifest
  (`harnesses.test.ts`), which is what keeps the commands from growing a name again.
- `Connection.harness` is `string`; `accountFor` is unchanged, so no keychain entry moves.
- CI's conformance matrix is `[scout]`. Scout reads the four lines from its environment before it
  reads the demo file, so a deployment can start it the way any harness is started.
- **What is lost, said plainly.** The integration test that ran Jacobian's channel against a
  real in-process chipsd, and the `chips conformance jacobian` gate with it. Until Jacobian can
  take the kit as a dev dependency, the wire between them is proven by a live smoke after a
  restart, not by CI.
- The docs page for Jacobian describes a harness connected like any other; its vendoring section
  is gone. `docs/technical-plan.md`'s M2.4 line is marked changed the way ADR 0041 marked M2.3.
- Nothing in the protocol, the server or the clients changes: they never depended on it.
