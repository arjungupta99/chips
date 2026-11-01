/**
 * The tunnel key: made on first use, the same on every use after, the same to a second process
 * over the same database, and good for a handshake.
 */

import { systemClock } from "@chipschat/platform";
import { fromBase64url, initiateHandshake, respondHandshake } from "@chipschat/tunnel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { createServerKeys } from "../store/server-keys.js";
import { createRelayIdentity } from "./identity.js";

let ws: TestWorkspace;
beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

describe("the relay identity", () => {
  it("makes a key on first use, keeps it, and is the same key to another process", async () => {
    const keys = createServerKeys(ws.db);
    expect(await keys.get("relay")).toBeUndefined();
    const identity = createRelayIdentity({ keys, clock: systemClock });
    const key = await identity.publicKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await identity.publicKey()).toBe(key);
    expect((await keys.get("relay"))?.publicKey).toBe(key);

    const other = createRelayIdentity({ keys: createServerKeys(ws.db), clock: systemClock });
    expect(await other.publicKey()).toBe(key);

    // And the pair completes a handshake a phone starts with the public half alone.
    const phone = await initiateHandshake(fromBase64url(key));
    const answered = await respondHandshake(await other.keyPair(), phone.message);
    const tunnel = await phone.complete(answered.message);
    expect(tunnel.handshakeHash).toEqual(answered.tunnel.handshakeHash);
  });

  it("tries again after the registry failed, rather than remembering the failure", async () => {
    const keys = createServerKeys(ws.db);
    let failures = 1;
    const flaky = {
      get: async (kind: string) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("the database is busy");
        }
        return keys.get(kind);
      },
      keep: keys.keep,
    };
    const identity = createRelayIdentity({ keys: flaky, clock: systemClock });
    await expect(identity.publicKey()).rejects.toThrow("busy");
    const key = await identity.publicKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await keys.get("relay"))?.publicKey).toBe(key);
  });
});
