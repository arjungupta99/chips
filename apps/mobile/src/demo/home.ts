/**
 * Where the app goes as the demo or a film is left (ADR 0213; ADR 0217's addendum of 26 October):
 * back to a tab with nothing over it; to the first screen opened on That's Chips, every way in on
 * its face (`ways`), or on its pairing code page (`code`); to the first screen alone when no
 * workspace is left once the demo has gone. And Look around, which makes the demo and opens its
 * Spaces.
 */

import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useChips } from "../store/provider";

/**
 * The first screen opened on its ways in, for somebody who has been in the app already: leaving the
 * last workspace, pairing again, or back from an invite. Its film is for a first launch; going back
 * to the first screen played it again from the start (the onboarding audit, Part 2, item 18).
 */
export const WAYS_IN = { pathname: "/pair", params: { ways: "1" } } as const;

/** Go home once the demo has been left, `next` the workspace now in front, if any. */
export function useHome(): (next: unknown, at?: "ways" | "code") => void {
  const router = useRouter();
  return useCallback(
    (next: unknown, at?: "ways" | "code") => {
      if (router.canDismiss()) router.dismissAll();
      const there =
        at === undefined ? undefined : { pathname: "/pair" as const, params: { [at]: "1" } };
      if (next === undefined) {
        router.replace(there ?? "/pair");
      } else if (there !== undefined) {
        router.push(there);
      } else {
        router.navigate("/");
      }
    },
    [router],
  );
}

/**
 * Look around: the demo made as the first film leaves it, after any film, and its Spaces opened, in
 * place of the first screen when no workspace was here, and over the workspace when one was.
 */
export function useLookAround(): () => void {
  const router = useRouter();
  const { paired, demo } = useChips();
  const held = paired !== undefined;
  return useCallback(() => {
    void demo.lookAround().then(() => {
      if (router.canDismiss()) router.dismissAll();
      if (held) router.navigate("/");
      else router.replace("/");
    });
  }, [demo, router, held]);
}
