/**
 * A registry list on You — passkeys, devices, invites — fetched when the card opens rather than
 * kept in the fold: they are rows at the server, not events, so nothing streams them. And fetched
 * again each time the connection opens: asked while it was down — a laptop back from sleep, the
 * desktop app opening on You before it had found its server — a list said only why it could not
 * be read until You was opened again (the phone's, 16 October 2026).
 */

import { useCallback, useEffect, useState } from "react";
import { reasonOf } from "./controls.tsx";

/**
 * Load a list once connected, and again each time the connection opens; run one change and
 * reload. One error line for the card: a change refused stays until the next change goes through
 * — a reload alone does not clear it, so the reason something failed is still there to read when
 * the list refreshes — and a list that could not be read stays until it is.
 */
export function useList<T>(load: () => Promise<T[]>, connected: boolean) {
  const [items, setItems] = useState<readonly T[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [unread, setUnread] = useState<string | undefined>(undefined);
  const reload = useCallback(async () => {
    try {
      setItems(await load());
      setUnread(undefined);
    } catch (failure) {
      setUnread(reasonOf(failure, String(failure)));
    }
  }, [load]);
  useEffect(() => {
    if (connected) void reload();
  }, [connected, reload]);
  const act = async (what: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await what();
      await reload();
    } catch (failure) {
      setError(reasonOf(failure, String(failure)));
    } finally {
      setBusy(false);
    }
  };
  return { items, busy, error: error ?? unread, act, reload };
}
