/**
 * The wait for a link's Allow (ADR 0232), as the phone reads it: core keeps it, every way of
 * pairing or joining starts one, and `WaitingForAllow` draws it over the whole app.
 */

import { type AllowWaiting, allowWaiting, onAllowWaiting } from "@chipschat/core";
import { useSyncExternalStore } from "react";

export { waitForAllow } from "@chipschat/core";

export function useWaitingForAllow(): AllowWaiting | undefined {
  return useSyncExternalStore(onAllowWaiting, allowWaiting);
}
