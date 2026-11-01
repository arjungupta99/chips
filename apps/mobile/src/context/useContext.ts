/**
 * Reading an owner's context files (ADR 0134, 0135): an agent's, with its harness's set beside
 * it, or the harness's set alone. Read when the page opens and each time it comes back to the
 * front, and only for who may read them: anybody else's page has no Context group, and never
 * asks.
 */

import {
  type AgentContext,
  agentContextOf,
  type HarnessContext,
  harnessContextOf,
  mayReadContext,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import type { AgentContextView, HarnessContextView } from "@chipschat/protocol";
import { useEffect, useMemo, useState } from "react";
import { recall, remember } from "./memory";

export interface AgentReading {
  /** Whether this person may read it at all: none of the rest is asked for otherwise. */
  readonly may: boolean;
  /** No copy yet, and the first read is on its way: the group stands blank in its place. */
  readonly waiting: boolean;
  readonly context: AgentContext | undefined;
  readonly set: HarnessContext | undefined;
}

export interface HarnessReading {
  readonly may: boolean;
  readonly set: HarnessContext | undefined;
}

export const agentKey = (agentId: string) => `agent:${agentId}`;
export const harnessKey = (harnessId: string) => `harness:${harnessId}`;

/** A read that leaves the last copy standing when it fails: a page with old files beats none. */
export function useRead<T>(key: string, read: (() => Promise<T>) | undefined, focus: number) {
  return useReadState(key, read, focus).copy;
}

/** The same, and whether the first read since the page opened is still on its way. */
function useReadState<T>(key: string, read: (() => Promise<T>) | undefined, focus: number) {
  const [copy, setCopy] = useState<T | undefined>(() => recall<T>(key));
  const [reading, setReading] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` is why it reads again.
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
  }, [key, read === undefined, focus]);
  return { copy, reading };
}

export function useAgentContext(
  store: Store,
  snapshot: Snapshot,
  agentId: string,
  selfId: string,
  focus: number,
): AgentReading {
  const harnessId = snapshot.directory[agentId]?.harnessId;
  const may =
    harnessId !== undefined &&
    mayReadContext(snapshot.model, snapshot.directory, harnessId, selfId);
  const { copy: view, reading } = useReadState<AgentContextView>(
    agentKey(agentId),
    may ? () => store.agentContext(agentId) : undefined,
    focus,
  );
  const setView = useRead<HarnessContextView>(
    harnessKey(harnessId ?? ""),
    may && harnessId !== undefined ? () => store.harnessContext(harnessId) : undefined,
    focus,
  );
  const { directory } = snapshot;
  return useMemo(
    () => ({
      may,
      waiting: may && view === undefined && reading,
      context: may && view !== undefined ? agentContextOf(view, directory, setView) : undefined,
      set: may && setView !== undefined ? harnessContextOf(setView, directory) : undefined,
    }),
    [may, view, reading, setView, directory],
  );
}

export function useHarnessContext(
  store: Store,
  snapshot: Snapshot,
  harnessId: string,
  selfId: string | undefined,
  focus: number,
): HarnessReading {
  const may =
    selfId !== undefined && mayReadContext(snapshot.model, snapshot.directory, harnessId, selfId);
  const setView = useRead<HarnessContextView>(
    harnessKey(harnessId),
    may ? () => store.harnessContext(harnessId) : undefined,
    focus,
  );
  const { directory } = snapshot;
  return useMemo(
    () => ({
      may,
      set: may && setView !== undefined ? harnessContextOf(setView, directory) : undefined,
    }),
    [may, setView, directory],
  );
}
