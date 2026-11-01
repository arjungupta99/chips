/**
 * Whose context files a screen shows (ADR 0135): one of an agent's, or its harness's own set,
 * what its agents share and what a new one starts with. The two are read, edited and opened the
 * same way, so one editor and one page take either.
 */

import type { ContextOwner } from "@chipschat/core";
import type { Href } from "expo-router";

export type { ContextOwner };

/** The editor or the read-only page of one file, and how it was opened. */
export function fileHref(owner: ContextOwner, name: string, mode: "open" | "own" = "open"): Href {
  return {
    pathname: "/context",
    params: { [owner.kind]: owner.id, name, ...(mode === "own" ? { own: "1" } : {}) },
  };
}

/** One file of a harness's own set: what its agents share, or what a new one starts with. */
export const harnessFileHref = (harnessId: string, name: string): Href =>
  fileHref({ kind: "harness", id: harnessId }, name);

/** The owner a screen was opened for, from its route's words. */
export function ownerFrom(params: {
  readonly agent?: string | undefined;
  readonly harness?: string | undefined;
}): ContextOwner | undefined {
  if (params.agent !== undefined) return { kind: "agent", id: params.agent };
  if (params.harness !== undefined) return { kind: "harness", id: params.harness };
  return undefined;
}

/** A key to remember things by, per owner. */
export const ownerKey = (owner: ContextOwner): string => `${owner.kind}:${owner.id}`;
