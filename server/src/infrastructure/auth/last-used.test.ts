import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { createLastUsed } from "./last-used.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

/** Give the fire-and-forget write a turn of the loop. */
async function settled(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe("last used", () => {
  it("stamps a harness token's use, at most once a minute", async () => {
    const token = await ws.db.selectFrom("harness_tokens").select("id").executeTakeFirstOrThrow();
    let at = Date.parse("2026-09-05T15:00:00.000Z");
    const used = createLastUsed({ db: ws.db, now: () => at });
    const harness = {
      kind: "harness" as const,
      participantId: ws.scout.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Scout",
      via: "harness_token" as const,
      tokenId: token.id,
    };

    used(harness);
    await settled();
    const first = await ws.db
      .selectFrom("harness_tokens")
      .select("last_used_at")
      .executeTakeFirstOrThrow();
    expect(first.last_used_at).toBe("2026-09-05T15:00:00.000Z");

    at += 30_000;
    used(harness);
    await settled();
    const soon = await ws.db
      .selectFrom("harness_tokens")
      .select("last_used_at")
      .executeTakeFirstOrThrow();
    expect(soon.last_used_at).toBe("2026-09-05T15:00:00.000Z");

    at += 31_000;
    used(harness);
    await settled();
    const later = await ws.db
      .selectFrom("harness_tokens")
      .select("last_used_at")
      .executeTakeFirstOrThrow();
    expect(later.last_used_at).toBe("2026-09-05T15:01:01.000Z");
  });

  it("stamps a device's last sight, and does nothing for a principal with no credential id", async () => {
    const at = Date.parse("2026-09-05T15:00:00.000Z");
    const used = createLastUsed({ db: ws.db, now: () => at });
    used({
      kind: "person",
      participantId: ws.arjun.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Arjun",
      via: "device_key",
      deviceId: ws.arjun.deviceId,
    });
    used({
      kind: "person",
      participantId: ws.dana.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Dana",
      via: "device_key",
    });
    await settled();
    const devices = await ws.db
      .selectFrom("devices")
      .select(["participant_id", "last_seen_at"])
      .orderBy("participant_id")
      .execute();
    expect(devices.find((d) => d.participant_id === ws.arjun.participantId)?.last_seen_at).toBe(
      "2026-09-05T15:00:00.000Z",
    );
    expect(
      devices.find((d) => d.participant_id === ws.dana.participantId)?.last_seen_at,
    ).toBeNull();
  });

  it("reports a write that failed, and never throws", async () => {
    const errors: unknown[] = [];
    const used = createLastUsed({ db: ws.db, onError: (error) => errors.push(error) });
    await ws.close();
    expect(() =>
      used({
        kind: "harness",
        participantId: "hrn_x",
        workspaceId: "ws_x",
        displayName: "x",
        via: "harness_token",
        tokenId: "tok_missing",
      }),
    ).not.toThrow();
    await settled();
    expect(errors).toHaveLength(1);
    // The workspace is already closed; closing again must not fail the test.
    ws = await createTestWorkspace();
  });
});
