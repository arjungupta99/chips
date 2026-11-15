/**
 * The computer as About says it (ADR 0295): its machine and the Chips it runs, from
 * `GET /v1/server`, read again each time the page comes into view, so an update made at the
 * computer shows the next time About is opened. A server that can't be reached is said so, and the
 * rest of the page doesn't wait on it. The read is the updates provider's (ADR 0296), which the
 * dot shares; coming into view is also what puts the dot out, and it stays out for whatever comes
 * to light it for as long as the page is in view.
 */

import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { type Computer, useUpdates } from "../updates/updates";

export type { Computer } from "../updates/updates";

export function useComputer(): Computer {
  const { computer, opened } = useUpdates();
  // What `opened` returns says the page has gone, which is what leaving it does.
  useFocusEffect(useCallback(() => opened(), [opened]));
  return computer;
}
