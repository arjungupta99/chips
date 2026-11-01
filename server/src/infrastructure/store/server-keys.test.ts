/**
 * The server's keys: one per kind, the first kept wins, and a second keeper is handed the first.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { createServerKeys } from "./server-keys.js";

let ws: TestWorkspace;
beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

describe("the server's keys", () => {
  it("keeps the first key of a kind, and answers it to whoever keeps a second", async () => {
    const keys = createServerKeys(ws.db);
    expect(await keys.get("relay")).toBeUndefined();
    const first = { publicKey: "p1", privateKey: "s1", createdAt: "2026-09-06T00:00:00.000Z" };
    expect(await keys.keep("relay", first)).toEqual(first);
    const second = { publicKey: "p2", privateKey: "s2", createdAt: "2026-09-06T00:00:01.000Z" };
    expect(await keys.keep("relay", second)).toEqual(first);
    expect(await keys.get("relay")).toEqual(first);
    // Another kind is another key.
    expect(await keys.keep("other", second)).toEqual(second);
  });
});
