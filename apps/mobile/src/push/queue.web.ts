/**
 * The same queue in a browser: `localStorage`, which the web target has and `expo-sqlite`'s
 * WASM build would only complicate. Metro picks this file for the web platform.
 */

import type { PendingDecision } from "./payload";

const KEY = "chips.pending-decisions";

function held(): PendingDecision[] {
  const raw = globalThis.localStorage?.getItem(KEY);
  if (raw === null || raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingDecision[]) : [];
  } catch {
    return [];
  }
}

function keep(decisions: readonly PendingDecision[]): void {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(decisions));
}

export async function remember(decision: PendingDecision): Promise<void> {
  const already = held();
  if (already.some((one) => one.approvalId === decision.approvalId)) return;
  keep([...already, decision]);
}

export async function pending(): Promise<PendingDecision[]> {
  return [...held()].sort((a, b) => a.at.localeCompare(b.at));
}

export async function forget(approvalId: string): Promise<void> {
  keep(held().filter((one) => one.approvalId !== approvalId));
}

export async function forgetSpace(spaceId: string): Promise<void> {
  keep(held().filter((one) => one.spaceId !== spaceId));
}
