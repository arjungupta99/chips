/**
 * Join requests (ADR 0122) on a test workspace, with the test's own clock: the use case as the
 * gateway builds it, over the workspace's database, so a test can move time and see a code expire.
 */

import type { Clock } from "@chipschat/platform";
import type { JoinRequestView } from "@chipschat/protocol";
import { createJoinRequests, type JoinRequests } from "../application/use-cases/join.js";
import { readableCode } from "../application/use-cases/pair-device.js";
import {
  digestsMatch,
  hashHarnessToken,
  joinCheck,
  keyCode,
  mintJoinSecret,
} from "../infrastructure/auth/credentials.js";
import { createJoinRegistry } from "../infrastructure/store/join-registry.js";
import type { TestWorkspace } from "./workspace.js";

export function joinRequestsOn(
  ws: TestWorkspace,
  clock: Clock,
  tell?: (workspaceId: string, request: JoinRequestView, to: string | undefined) => void,
): JoinRequests {
  const { deps } = ws.gateway;
  return createJoinRequests({
    registry: createJoinRegistry(ws.db),
    addHarness: deps.addHarness,
    declareCapabilities: deps.declareCapabilities,
    pairDevice: deps.pairDevice,
    pairingCodes: deps.pairingCodes,
    store: deps.store,
    readModels: deps.readModels,
    clock,
    ids: ws.ids,
    mint: mintJoinSecret,
    hash: hashHarnessToken,
    matches: digestsMatch,
    code: () => readableCode(),
    keyCode,
    check: joinCheck,
    tell,
    serverKey: () => deps.relay.publicKey(),
  });
}

/** The server's halves of a Wi-Fi device's check (ADR 0278), for a test to play the device with. */
export { joinCheck };
