/**
 * When a room a person asked a harness for is named (`Naming.tsx` draws it arriving).
 */

import type { Space } from "@chipschat/core";
import { useState } from "react";

/**
 * How many times this room has been named by its harness while it was open: nought until the
 * first, which is the one that matters. It counts the moment an asked room stops waiting for a
 * name. A room the person named from the + (ADR 0149) never waits for one: the harness's claim
 * keeps the person's name, so nothing arrives.
 */
export function useNamed(space: Space | undefined): number {
  const waiting = space !== undefined && space.askedOf !== undefined && space.title === undefined;
  // Worked out in the render that changes it, not an effect after: the title and the count must
  // arrive together, or the name that leaves is the one that came.
  const [seen, setSeen] = useState({ waiting, named: 0 });
  if (seen.waiting !== waiting) {
    const named = seen.waiting && !waiting ? seen.named + 1 : seen.named;
    setSeen({ waiting, named });
    return named;
  }
  return seen.named;
}
