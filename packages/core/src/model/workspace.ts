/**
 * The workspace itself, named again by an owner (ADR 0194). What it is called is not the fold's:
 * the snapshot holds it, from the hello (ADR 0193) and from this event alike, so a device that
 * folds an old rename out of its cache is not called by it. The fold keeps the audit's line.
 */

import { type FoldStep, required } from "./state.js";

export const WORKSPACE_FOLDS: Readonly<Record<string, FoldStep>> = {
  // The owner's relay switch (ADR 0211, Phase 4): who turned it, and when, for a device that
  // cannot connect to say why.
  "relay.set": (state, event) => {
    const on = required<boolean>(event, "on");
    state.relay = { on, by: event.actor.id, at: event.ts };
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "policy",
      who: event.actor.id,
      what: on ? "turned the relay on" : "turned the relay off",
    });
  },
  "workspace.renamed": (state, event) => {
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "policy",
      who: event.actor.id,
      what: `renamed the workspace from ${required<string>(event, "previous_name")} to ${required<string>(event, "name")}`,
    });
  },
};
