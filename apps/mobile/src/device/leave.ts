/**
 * A workspace leaving this phone: signed out of, or the person removed from it (ADR 0160). Only it
 * goes (ADR 0197): its key and cache, and its rooms' drafts and picks. The next workspace this
 * phone holds comes forward, or Welcome when it was the last.
 *
 * The demo's made-up workspace (ADR 0213) has no key or cache where the device keeps them: it goes
 * as the switcher's Remove takes it, its word in this app's preferences with it.
 */

import { type Device, isDemo } from "@chipschat/core";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { WAYS_IN } from "../demo/home";
import { forgetDrafts } from "../spaces/Composer";
import { useChips } from "../store/provider";
import { forgetHere } from "./forget";

export function useLeave(): (device: Device, spaceIds: readonly string[]) => Promise<void> {
  const { ended, demo } = useChips();
  const router = useRouter();
  return useCallback(
    async (device, spaceIds) => {
      if (isDemo(device)) {
        forgetDrafts(spaceIds);
        const next = demo.remove();
        if (router.canDismiss()) router.dismissAll();
        router.replace(next === undefined ? WAYS_IN : "/");
        return;
      }
      const next = await forgetHere(device.deviceId);
      // The last one: every draft goes with it, as before there could be several.
      forgetDrafts(next === undefined ? undefined : spaceIds);
      ended(next);
      router.replace(next === undefined ? WAYS_IN : "/");
    },
    [ended, demo, router],
  );
}
