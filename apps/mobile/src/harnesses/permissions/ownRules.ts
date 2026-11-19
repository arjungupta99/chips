/**
 * What a harness last said it runs on its own (ADR 0299), as a harness's Permissions and You →
 * Permissions read it: asked of the server each time a page opens, and kept for the session so a
 * page opened again draws it at once. The web's (`apps/web/src/app/permissions/service.ts`) in the
 * phone's terms, reading the store itself.
 */

import {
  type Directory,
  NOT_SAID,
  nameOf,
  type OwnRulesView,
  ownRulesView,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { useEffect, useState } from "react";

/** What each harness last said, kept for the session. */
const heard = new Map<string, OwnRulesView>();

/** Read again each time a page asks; a read that fails says what was heard before, or nothing. */
function readOne(store: Store, directory: Directory, harnessId: string): Promise<OwnRulesView> {
  return store.readOwnRules(harnessId).then(
    (read) => {
      const view = ownRulesView(nameOf(directory, harnessId), read);
      heard.set(harnessId, view);
      return view;
    },
    () => heard.get(harnessId) ?? NOT_SAID,
  );
}

/** Whether the server keeps a copy of what a harness runs on its own. */
const keepsOwn = (snapshot: Snapshot) => snapshot.keepsOwnRules !== false;

/**
 * What a harness last said, read as its page opens: what was heard before while the read is on its
 * way, `undefined` before anything was, and `NOT_SAID` from a server that keeps none.
 */
export function useOwnRules(
  store: Store,
  snapshot: Snapshot,
  harnessId: string,
): OwnRulesView | undefined {
  const keeps = keepsOwn(snapshot);
  const [view, setView] = useState<OwnRulesView | undefined>(() =>
    keeps ? heard.get(harnessId) : NOT_SAID,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again for another harness only.
  useEffect(() => {
    if (!keeps) {
      setView(NOT_SAID);
      return;
    }
    let live = true;
    setView(heard.get(harnessId));
    void readOne(store, snapshot.directory, harnessId).then((next) => {
      if (live) setView(next);
    });
    return () => {
      live = false;
    };
  }, [keeps, harnessId, store]);
  return view;
}

/** What every one of these harnesses last said, by id, for You → Permissions. */
export function useOwnRulesOf(
  store: Store,
  snapshot: Snapshot,
  harnessIds: readonly string[],
): Readonly<Record<string, OwnRulesView | undefined>> {
  const keeps = keepsOwn(snapshot);
  const key = harnessIds.join(",");
  const [views, setViews] = useState<Readonly<Record<string, OwnRulesView | undefined>>>(() =>
    Object.fromEntries(harnessIds.map((id) => [id, heard.get(id)])),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the harnesses change.
  useEffect(() => {
    if (!keeps) return;
    let live = true;
    for (const id of harnessIds) {
      void readOne(store, snapshot.directory, id).then((view) => {
        if (live) setViews((now) => ({ ...now, [id]: view }));
      });
    }
    return () => {
      live = false;
    };
  }, [keeps, key, store]);
  return views;
}
