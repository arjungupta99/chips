/**
 * The server's own person (ADR 0048): who the operator's door and a device join issue a code
 * for. The oldest owner still here, never one who was removed (SEC-25).
 */

import { describe, expect, it } from "vitest";
import { createTestWorkspace } from "../../testing/workspace.js";

const REMOVED_AT = "2026-10-18T00:00:00.000Z";

describe("anyPerson (SEC-25)", () => {
  it("is the oldest owner still here, not the oldest person, and never one who was removed", async () => {
    const ws = await createTestWorkspace();
    try {
      const { readModels } = ws.gateway.deps;
      expect((await readModels.anyPerson())?.participantId).toBe(ws.arjun.participantId);

      // A second owner, younger than Dana, who is a member. Arjun removed: Owen is the oldest
      // owner left, though Dana is the oldest person.
      const owen = await ws.addPerson("Owen", "owner");
      await ws.db
        .updateTable("participants")
        .set({ removed_at: REMOVED_AT })
        .where("id", "=", ws.arjun.participantId)
        .execute();
      expect((await readModels.anyPerson())?.participantId).toBe(owen.participantId);

      // No owner left at all: the oldest person still here.
      await ws.db
        .updateTable("participants")
        .set({ removed_at: REMOVED_AT })
        .where("id", "=", owen.participantId)
        .execute();
      expect((await readModels.anyPerson())?.participantId).toBe(ws.dana.participantId);
    } finally {
      await ws.close();
    }
  });
});
