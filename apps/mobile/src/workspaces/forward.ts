/**
 * Something asked for in a workspace behind the one in front (ADR 0197) — a push tapped, a banner
 * pressed: that workspace comes forward first, over Spaces with nothing pushed on top, and the
 * thing is done once its store is the one in front. The provider holds it until then
 * (`switchTo`): a switch draws the screens afresh, this hook's caller with them.
 */

import type { Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useChips } from "../store/provider";

export function useBringForward(): (deviceId: string, act: (store: Store) => void) => void {
  const { switchTo } = useChips();
  const router = useRouter();
  return useCallback(
    (deviceId, act) => {
      if (router.canDismiss()) router.dismissAll();
      void switchTo(deviceId, act);
    },
    [router, switchTo],
  );
}
