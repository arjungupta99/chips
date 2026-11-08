/**
 * Reading an owner's context files (ADR 0134, 0135): an agent's, with its harness's set beside
 * it, or the harness's set alone. Read when the page opens, again each time the window comes back
 * to the front (Chips hears nothing when a harness sends a new copy), and only for who may read
 * them: anybody else's page has no Context group, and never asks.
 */

import {
  type AgentContext,
  agentContextOf,
  type ContextOwner,
  type ContextReads,
  type Directory,
  type HarnessContext,
  harnessContextOf,
  mayReadContext,
  type WorkspaceModel,
} from "@chipschat/core";
import type { AgentContextView, HarnessContextView } from "@chipschat/protocol";
import { useEffect, useMemo, useState } from "react";
import { recall, remember, watch } from "./memory.ts";

export const agentKey = (agentId: string) => `agent:${agentId}`;
export const harnessKey = (harnessId: string) => `harness:${harnessId}`;
export const ownerKey = (owner: ContextOwner) => `${owner.kind}:${owner.id}`;

/** A number that moves each time the window comes back to the front. */
export function useFocusCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState === "visible") setCount((was) => was + 1);
    };
    const focused = () => setCount((was) => was + 1);
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("focus", focused);
    return () => {
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("focus", focused);
    };
  }, []);
  return count;
}

/** A read that leaves the last copy standing when it fails: a page with old files beats none. */
export function useRead<T>(key: string, read: (() => Promise<T>) | undefined, focus: number) {
  return useReadState(key, read, focus).copy;
}

/** The same, and whether the first read since the page opened is still on its way. */
function useReadState<T>(key: string, read: (() => Promise<T>) | undefined, focus: number) {
  const [copy, setCopy] = useState<T | undefined>(() => recall<T>(key));
  const [reading, setReading] = useState(true);
  // A page still drawn beside the one that changed its files (ADR 0284): a new copy is shown, and
  // a file saved is read again, as it would be had the page been drawn anew.
  const [landed, setLanded] = useState(0);
  useEffect(
    () =>
      watch(key, (told) => {
        if (told === "copy") setCopy(recall<T>(key));
        else setLanded((was) => was + 1);
      }),
    [key],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` and `landed` are why it reads again.
  useEffect(() => {
    setCopy(recall<T>(key));
    if (read === undefined) return;
    let alive = true;
    read()
      .then(
        (fresh) => {
          remember(key, fresh);
          if (alive) setCopy(fresh);
        },
        () => undefined,
      )
      .finally(() => alive && setReading(false));
    return () => {
      alive = false;
    };
  }, [key, read === undefined, focus, landed]);
  return { copy, reading };
}

export interface AgentReading {
  /** No copy yet, and the first read is on its way: the group stands blank in its place. */
  readonly waiting: boolean;
  readonly context: AgentContext | undefined;
  readonly set: HarnessContext | undefined;
}

export function useAgentContext(
  reads: ContextReads | undefined,
  model: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string,
): AgentReading {
  const focus = useFocusCount();
  const harnessId = directory[agentId]?.harnessId;
  const may =
    reads !== undefined &&
    harnessId !== undefined &&
    mayReadContext(model, directory, harnessId, selfId);
  const { copy: view, reading } = useReadState<AgentContextView>(
    agentKey(agentId),
    may ? () => reads.agentContext(agentId) : undefined,
    focus,
  );
  const setView = useRead<HarnessContextView>(
    harnessKey(harnessId ?? ""),
    may && harnessId !== undefined ? () => reads.harnessContext(harnessId) : undefined,
    focus,
  );
  return useMemo(
    () => ({
      waiting: may && view === undefined && reading,
      context: may && view !== undefined ? agentContextOf(view, directory, setView) : undefined,
      set: may && setView !== undefined ? harnessContextOf(setView, directory) : undefined,
    }),
    [may, view, reading, setView, directory],
  );
}

export function useHarnessContext(
  reads: ContextReads | undefined,
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string | undefined,
): HarnessContext | undefined {
  const focus = useFocusCount();
  const may =
    reads !== undefined &&
    selfId !== undefined &&
    mayReadContext(model, directory, harnessId, selfId);
  const setView = useRead<HarnessContextView>(
    harnessKey(harnessId),
    may ? () => reads.harnessContext(harnessId) : undefined,
    focus,
  );
  return useMemo(
    () => (may && setView !== undefined ? harnessContextOf(setView, directory) : undefined),
    [may, setView, directory],
  );
}
