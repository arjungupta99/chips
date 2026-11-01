/**
 * A device signature held to the tunnel it arrived through (ADR 0191, decision 6). The signing
 * itself is `credentials.test.ts`'s; this is the authenticator's rule for which shape is good
 * where: the five-line shape inside the tunnel it names and nowhere else, and the four-line shape
 * on the plain port and nowhere else (refused inside a tunnel since 25 October 2026).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthAttempt } from "../../application/ports/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { createAuthenticator } from "./authenticator.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const TUNNEL = "ab".repeat(32);
const OTHER_TUNNEL = "cd".repeat(32);
const TARGET = "/v1/participants";

/** The attempt the app would build from these headers, arriving where `tunnelHash` says. */
function attemptOf(headers: Record<string, string>, tunnelHash?: string): AuthAttempt {
  return {
    deviceId: headers["x-chips-device"],
    signature: headers["x-chips-signature"],
    timestamp: headers["x-chips-timestamp"],
    signed: headers["x-chips-signed"],
    tunnelHash,
    method: "GET",
    target: TARGET,
    body: "",
  };
}

describe("a device signature and the tunnel it arrived through (ADR 0191, decision 6)", () => {
  it("is good inside the tunnel it names, and in no other", async () => {
    const authenticator = createAuthenticator({ db: ws.db });
    const bound = ws.arjun.sign("GET", TARGET, "", TUNNEL);
    expect(bound["x-chips-signed"]).toBe("v2");
    const admitted = await authenticator.authenticate(attemptOf(bound, TUNNEL));
    expect(admitted).toMatchObject({ ok: true, principal: { deviceId: ws.arjun.deviceId } });
    // The same headers through another tunnel: a signature over the wrong hash.
    expect(await authenticator.authenticate(attemptOf(bound, OTHER_TUNNEL))).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    // And on the plain port, where there is no tunnel for it to name.
    expect(await authenticator.authenticate(attemptOf(bound))).toEqual({
      ok: false,
      reason: "signature_not_bound",
    });
  });

  it("refuses the four-line shape inside a tunnel, from a device that never signed five too: a captured request played back", async () => {
    const authenticator = createAuthenticator({ db: ws.db });
    const plain = ws.arjun.sign("GET", TARGET, "");
    expect(plain["x-chips-signed"]).toBeUndefined();
    expect(await authenticator.authenticate(attemptOf(plain, TUNNEL))).toEqual({
      ok: false,
      reason: "signature_not_bound",
    });
    // The plain port still takes it: the CLI on loopback, a browser the server served, signs there.
    expect(await authenticator.authenticate(attemptOf(plain))).toMatchObject({
      ok: true,
      principal: { deviceId: ws.arjun.deviceId },
    });
    // And a device that signs five inside the tunnel is let in there, the four-line copy still not.
    const bound = ws.arjun.sign("GET", TARGET, "", TUNNEL);
    expect(await authenticator.authenticate(attemptOf(bound, TUNNEL))).toMatchObject({ ok: true });
    expect(await authenticator.authenticate(attemptOf(plain, OTHER_TUNNEL))).toEqual({
      ok: false,
      reason: "signature_not_bound",
    });
  });

  it("takes no other word for the shape", async () => {
    const authenticator = createAuthenticator({ db: ws.db });
    const headers = { ...ws.arjun.sign("GET", TARGET, ""), "x-chips-signed": "v3" };
    expect(await authenticator.authenticate(attemptOf(headers, TUNNEL))).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await authenticator.authenticate(attemptOf(headers))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
