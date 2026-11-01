/**
 * A harness's state on its card and its profile, and while it works what it is working at, in the
 * words of its thinking bubble's top line, held as the bubble holds them (ADR 0147, core's
 * `fleetDoing`). Until 10 October 2026 the pill carried Jacobian's `run.status` as it came: a
 * line of reasoning two hundred characters long, `Writing…`, or the reply's own first words.
 */

import type { Doing, FleetHarness, Snapshot } from "@chipschat/core";
import { fleetDoing } from "@chipschat/core";
import { useHeld } from "../spaces/Thinking";
import { StatusPill } from "../ui/Pill";
import type { HarnessStatus } from "../ui/vocabulary";

export function WorkingPill({
  snapshot,
  entry,
  status,
}: {
  readonly snapshot: Snapshot;
  readonly entry: FleetHarness | undefined;
  readonly status: HarnessStatus;
}) {
  const doing = status === "working" ? fleetDoing(snapshot.model.spaces, entry) : undefined;
  return doing === undefined ? (
    <StatusPill status={status} />
  ) : (
    <HeldPill status={status} doing={doing} />
  );
}

function HeldPill({ status, doing }: { readonly status: HarnessStatus; readonly doing: Doing }) {
  return <StatusPill status={status} verbPhrase={useHeld(doing).label} />;
}
