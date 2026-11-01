/**
 * The phone's replacement for the browser's `online` and `offline`.
 *
 * The transport wires those up itself and a phone has neither — React Native defines `window`
 * as an alias for the global object and gives it no `addEventListener`, which is what the first
 * run on a real iPhone found. What a phone has instead is `AppState`, and it is a better
 * signal: iOS freezes a backgrounded app's sockets and does not always close them, so an app
 * reopened after an hour can hold one that looks open, will never say anything, and would take
 * the silence check another minute to give up on.
 *
 * So: every time this app comes to the front, the store is told to check. A socket that has
 * gone quiet is replaced at once and one that is down is retried without waiting out the
 * backoff — the difference between opening Chips and seeing your spaces, and opening Chips and
 * watching it think.
 */

import type { Store } from "@chipschat/core";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useAwake(store: Store | undefined): void {
  useEffect(() => {
    if (store === undefined) return;
    const changed = (state: AppStateStatus) => {
      if (state === "active") store.wake();
    };
    const subscription = AppState.addEventListener("change", changed);
    return () => subscription.remove();
  }, [store]);
}
