/**
 * The demo held beside the paired workspaces (ADR 0213, point 7): its device, made in memory, and
 * what its store plays. Never one of the devices IndexedDB keeps, where one key that fails to load
 * empties the list; Look around is remembered as a word of the page's own (`kept.ts`) and builds
 * the demo again at the next launch, played to its end.
 */

import type { Device } from "@chipschat/core";
import { useCallback, useState } from "react";
import { keepDemo, keptDemo } from "./kept.ts";
import { type DemoRun, lookedAround } from "./store.ts";

export interface HeldDemo {
  readonly device: Device;
  readonly run: DemoRun;
}

export interface DemoHold {
  readonly held: HeldDemo | undefined;
  /** A film from a chapter, in the render mode (ADR 0217): a fresh store and player each time. */
  readonly play: (device: Device, film: string, from: number) => void;
  /**
   * Look around: the first film played whole, kept for the next launch, in front. After any film's
   * video (ADR 0217), which made no demo, it is made here on `device`; one already looked around
   * stays as it is.
   */
  readonly lookAround: (device?: Device) => void;
  /** Gone, and kept no more: Remove, or a film left that was never looked around. */
  readonly forget: () => void;
  /** In front or behind another workspace, for the next launch to put it back. */
  readonly standing: (front: boolean) => void;
}

export function useHeldDemo(atLaunch: Device | undefined): DemoHold {
  const [held, setHeld] = useState<HeldDemo | undefined>(() =>
    atLaunch === undefined ? undefined : { device: atLaunch, run: lookedAround() },
  );
  const play = useCallback((device: Device, film: string, from: number) => {
    setHeld((was) => ({
      device: was?.device ?? device,
      run: { film, from, playing: true, n: (was?.run.n ?? 0) + 1 },
    }));
  }, []);
  const lookAround = useCallback((device?: Device) => {
    keepDemo("front");
    setHeld((was) => {
      if (was !== undefined && !was.run.playing) return was;
      const made = was?.device ?? device;
      if (made === undefined) return undefined;
      return { device: made, run: lookedAround((was?.run.n ?? 0) + 1) };
    });
  }, []);
  const forget = useCallback(() => {
    keepDemo(undefined);
    setHeld(undefined);
  }, []);
  const standing = useCallback((front: boolean) => {
    if (keptDemo() !== undefined) keepDemo(front ? "front" : "behind");
  }, []);
  return { held, play, lookAround, forget, standing };
}
