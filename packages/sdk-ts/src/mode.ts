/**
 * The mode a person picked in Chips for this harness's sessions (Chips ADR 0300, addendum of 19
 * November 2026), while it holds. It comes in the hello's `policy.mode`, and again on each
 * `policy.updated` for this harness that says one; once its `until` has passed it is nothing. A
 * bridge puts its sessions in it, where its agent offers it, and back in the mode they start in
 * when it is nothing.
 *
 * A change is said once things settle, a tick after the event that made it: a reconnect's replay
 * can carry several changes made while it was away, and only where they end up matters.
 */

import type { PolicyMode } from "@chipschat/protocol";

/** setTimeout's longest wait; an end further off is looked at again then. */
const LONGEST_WAIT_MS = 2_147_483_647;

/** Whether a mode still holds at `now`: no end, or an end still to come. */
export function modeHolds(mode: PolicyMode | undefined, now: number): PolicyMode | undefined {
  if (mode === undefined) return undefined;
  return mode.until === undefined || Date.parse(mode.until) > now ? mode : undefined;
}

const keyOf = (mode: PolicyMode | undefined) =>
  mode === undefined ? "" : `${mode.id}|${mode.until ?? ""}`;

export class ModeWatch {
  private picked: PolicyMode | undefined;
  /** What was said last, as `keyOf` writes it. */
  private said = "";
  private ends: ReturnType<typeof setTimeout> | undefined;
  private settling: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly options: {
      readonly now: () => number;
      readonly changed: (mode: PolicyMode | undefined) => void;
    },
  ) {}

  /** The mode that holds now, or nothing. */
  get current(): PolicyMode | undefined {
    return modeHolds(this.picked, this.options.now());
  }

  /** A hello's policy: the mode as the server keeps it now, or none. */
  fromHello(policy: { readonly mode?: PolicyMode | null | undefined } | undefined): void {
    this.picked = policy?.mode ?? undefined;
    this.settle();
  }

  /** An event heard: a `policy.updated` for this harness, for every space, that says a mode. */
  heard(event: Readonly<Record<string, unknown>>, harnessId: string | undefined): void {
    if (event["type"] !== "policy.updated" || event["space_id"] != null) return;
    if (harnessId === undefined || event["harness_id"] !== harnessId) return;
    const policy = event["policy"] as { readonly mode?: PolicyMode | null } | undefined;
    if (policy?.mode === undefined) return;
    this.picked = policy.mode ?? undefined;
    this.settle();
  }

  stop(): void {
    clearTimeout(this.ends);
    clearTimeout(this.settling);
    this.ends = undefined;
    this.settling = undefined;
  }

  private settle(): void {
    clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = undefined;
      this.say();
    }, 0);
  }

  /** Say the mode that holds now if it changed, and look again when it ends. */
  private say(): void {
    clearTimeout(this.ends);
    this.ends = undefined;
    const now = this.options.now();
    const mode = modeHolds(this.picked, now);
    const until = mode?.until === undefined ? undefined : Date.parse(mode.until);
    if (until !== undefined) {
      this.ends = setTimeout(() => this.say(), Math.min(Math.max(until - now, 0), LONGEST_WAIT_MS));
    }
    const key = keyOf(mode);
    if (key === this.said) return;
    this.said = key;
    this.options.changed(mode);
  }
}
