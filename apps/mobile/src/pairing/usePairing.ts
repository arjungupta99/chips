/**
 * Pairing, as a hook: one attempt at a time, with what went wrong in words.
 *
 * The screen is a camera, two fields and a button; this is everything behind them, kept apart
 * so the rules — what a scan means, which address is used, what a failure says — are tested
 * without a phone or a camera (`scanned.ts` and its Vitest suite), and so the screen itself
 * stays under Biome's complexity limit.
 */

import { type Device, pairDevice } from "@chipschat/core";
import * as ExpoDevice from "expo-device";
import { useCallback, useRef, useState } from "react";
import { deviceStorage } from "../device/storage";
import { isPad } from "../device/word";
import { waitForAllow } from "./allowWait";
import { pairingFailure } from "./failure";
import { offerFrom } from "./scanned";

/**
 * What this phone calls itself in the workspace's device list. The name its owner gave it where
 * the system says it; since iOS 16 that is only "iPhone" or "iPad" to an app without Apple's
 * special entitlement, and a list of those says nothing, so the model stands in — "iPhone 15
 * Pro" (ADR 0085).
 */
export function phoneName(): string {
  const given = ExpoDevice.deviceName;
  const generic = given === null || given === undefined || /^(iPhone|iPad)$/.test(given);
  return (generic ? ExpoDevice.modelName : given) ?? given ?? (isPad() ? "An iPad" : "A phone");
}

export interface Pairing {
  readonly working: boolean;
  readonly failure: string | undefined;
  readonly pair: (text: string, typedAddress?: string) => void;
}

/**
 * `firstFailure` is what a pairing link that did not work has to say (`usePairingLink`): the
 * screen opens with it in place, where a scan's failure would go.
 */
export function usePairing(onPaired: (device: Device) => void, firstFailure?: string): Pairing {
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(firstFailure);
  // A camera reports the same code many times a second; one attempt is enough.
  const attempting = useRef(false);

  const pair = useCallback(
    (text: string, typedAddress?: string) => {
      if (attempting.current) return;
      const offer = offerFrom(text, typedAddress);
      if (!offer.ok) {
        setFailure(offer.problem);
        return;
      }
      attempting.current = true;
      setWorking(true);
      setFailure(undefined);
      // A code that asks waits for whoever made it, showing its six digits (ADR 0232).
      const wait = waitForAllow("pairing");
      void pairDevice(offer.code, phoneName(), offer.lan, offer, deviceStorage, wait)
        .then(onPaired)
        .catch((error: unknown) => {
          setFailure(pairingFailure(error, offer));
        })
        .finally(() => {
          wait.done();
          attempting.current = false;
          setWorking(false);
        });
    },
    [onPaired],
  );

  return { working, failure, pair };
}
