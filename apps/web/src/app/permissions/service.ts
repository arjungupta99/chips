/**
 * What a harness's Permissions (ADR 0299) needs of the store: its rules, its snooze, the rules for
 * every harness, and what a harness last said it runs on its own; and whether the server keeps
 * them, from its hello. The Shell hands the store itself in, with the snapshot's two flags.
 */

import {
  type Directory,
  EVERY_HARNESS,
  NOT_SAID,
  nameOf,
  type OwnRulesView,
  ownRulesView,
  type Rule,
  type SetRulesInput,
  type Snapshot,
  type SnoozeInput,
  type Store,
} from "@chipschat/core";
import type { OwnRulesRead } from "@chipschat/protocol";
import { useEffect, useRef, useState } from "react";

export interface PermissionsService {
  readonly setRules: (input: SetRulesInput) => void;
  readonly snoozeHarness: (harnessId: string, snooze: SnoozeInput) => void;
  readonly resumeHarness: (harnessId: string) => void;
  /** Switch its Chips's rules on or off (ADR 0300). */
  readonly setChipsRules: (harnessId: string, on: boolean) => void;
  /** Put its sessions in a mode it offers, or back (`null`) (ADR 0300, 19 November addendum). */
  readonly setMode: Store["setMode"];
  readonly setWorkspaceRules: (input: {
    readonly rules?: readonly Rule[] | undefined;
    readonly hold?: SnoozeInput | null | undefined;
  }) => void;
  readonly readOwnRules: (harnessId: string) => Promise<OwnRulesRead>;
  /** False from a server older than ADR 0299: nothing here is offered. */
  readonly keepsHarnessRules?: boolean | undefined;
  /** False from a server that keeps no copy of what a harness runs on its own. */
  readonly keepsOwnRules?: boolean | undefined;
  /** False from a server that keeps no Chips's rules switch (ADR 0300): the switch is still. */
  readonly keepsChipsRules?: boolean | undefined;
  /** False from a server that keeps no mode (ADR 0300, 19 November addendum): no picker. */
  readonly keepsHarnessMode?: boolean | undefined;
}

/** The store and the snapshot's two flags, as the pages want them. */
export function permissionsServiceOf(store: Store, snapshot: Snapshot): PermissionsService {
  return {
    setRules: (input) => store.setRules(input),
    snoozeHarness: (harnessId, snooze) => store.snoozeHarness(harnessId, snooze),
    resumeHarness: (harnessId) => store.resumeHarness(harnessId),
    setChipsRules: (harnessId, on) => store.setChipsRules(harnessId, on),
    setMode: (harnessId, mode) => store.setMode(harnessId, mode),
    setWorkspaceRules: (input) => store.setWorkspaceRules(input),
    readOwnRules: (harnessId) => store.readOwnRules(harnessId),
    keepsHarnessRules: snapshot.keepsHarnessRules,
    keepsOwnRules: snapshot.keepsOwnRules,
    keepsChipsRules: snapshot.keepsChipsRules,
    keepsHarnessMode: snapshot.keepsHarnessMode,
  };
}

/**
 * A scope's rules sent: a harness's through `setRules`, the rules for every harness through
 * `setWorkspaceRules` (`EVERY_HARNESS`), so one list draws both.
 */
export function rulesSender(
  service: PermissionsService | undefined,
): ((input: SetRulesInput) => void) | undefined {
  if (service === undefined) return undefined;
  return (input) =>
    input.harnessId === EVERY_HARNESS
      ? service.setWorkspaceRules({ rules: input.rules })
      : service.setRules(input);
}

/** What each harness last said, kept for the session so a page opened again draws it at once. */
const heard = new Map<string, OwnRulesView>();

/** Read again each time a page asks; a read that fails says nothing was said. */
function readOne(
  service: PermissionsService,
  directory: Directory,
  harnessId: string,
): Promise<OwnRulesView> {
  return service.readOwnRules(harnessId).then(
    (read) => {
      const view = ownRulesView(nameOf(directory, harnessId), read);
      heard.set(harnessId, view);
      return view;
    },
    () => heard.get(harnessId) ?? NOT_SAID,
  );
}

/**
 * After a mode is picked or ends, the harness says what it runs in again: read it a moment later,
 * and once more after that, by when a bridge has moved its sessions (ADR 0300, 19 November addendum).
 */
export const READ_AGAIN_MS: readonly number[] = [1500, 6000];

/**
 * What a harness last said it runs on its own, read as its page opens: what was heard before while
 * the read is on its way, `undefined` before anything was, and `NOT_SAID` from a server that keeps
 * none. `again` changing (its mode picked, put back, or its time up) reads it again shortly after.
 */
export function useOwnRules(
  service: PermissionsService | undefined,
  directory: Directory,
  harnessId: string,
  again?: string,
): OwnRulesView | undefined {
  const keeps = service !== undefined && service.keepsOwnRules !== false;
  const [view, setView] = useState<OwnRulesView | undefined>(() =>
    keeps ? heard.get(harnessId) : NOT_SAID,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again for another harness only.
  useEffect(() => {
    if (!keeps || service === undefined) {
      setView(NOT_SAID);
      return;
    }
    let live = true;
    setView(heard.get(harnessId));
    void readOne(service, directory, harnessId).then((next) => {
      if (live) setView(next);
    });
    return () => {
      live = false;
    };
  }, [keeps, harnessId]);
  // What `again` was as the page opened: the read above covers that one.
  const opened = useRef(again);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when `again` changes only.
  useEffect(() => {
    if (again === opened.current || !keeps || service === undefined) return;
    opened.current = undefined;
    let live = true;
    const timers = READ_AGAIN_MS.map((ms) =>
      setTimeout(() => {
        void readOne(service, directory, harnessId).then((next) => {
          if (live) setView(next);
        });
      }, ms),
    );
    return () => {
      live = false;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [again]);
  return view;
}

/** What every one of these harnesses last said, by id, for You → Permissions. */
export function useOwnRulesOf(
  service: PermissionsService | undefined,
  directory: Directory,
  harnessIds: readonly string[],
): Readonly<Record<string, OwnRulesView | undefined>> {
  const keeps = service !== undefined && service.keepsOwnRules !== false;
  const key = harnessIds.join(",");
  const [views, setViews] = useState<Readonly<Record<string, OwnRulesView | undefined>>>(() =>
    Object.fromEntries(harnessIds.map((id) => [id, heard.get(id)])),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the harnesses change.
  useEffect(() => {
    if (!keeps || service === undefined) return;
    let live = true;
    for (const id of harnessIds) {
      void readOne(service, directory, id).then((view) => {
        if (live) setViews((now) => ({ ...now, [id]: view }));
      });
    }
    return () => {
      live = false;
    };
  }, [keeps, key]);
  return views;
}
