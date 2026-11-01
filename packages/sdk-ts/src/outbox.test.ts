import { describe, expect, it } from "vitest";
import { createOutbox, RefusedError } from "./outbox.js";

describe("the outbox", () => {
  it("holds an event until its key is answered, then resolves with the ack", async () => {
    const outbox = createOutbox();
    const answer = outbox.add("k1", { type: "run.status", idempotency_key: "k1" });
    expect(outbox.unanswered()).toEqual([{ type: "run.status", idempotency_key: "k1" }]);
    outbox.acked({ idempotencyKey: "k1", seq: 7, duplicate: false });
    expect(await answer).toEqual({ idempotencyKey: "k1", seq: 7, duplicate: false });
    expect(outbox.size()).toBe(0);
  });

  it("rejects with the server's refusal, and everything left when abandoned", async () => {
    const outbox = createOutbox();
    const refused = outbox.add("k1", { idempotency_key: "k1" });
    const dropped = outbox.add("k2", { idempotency_key: "k2" });
    outbox.refused(new RefusedError("invalid_event", "no such run", "k1"));
    await expect(refused).rejects.toMatchObject({ code: "invalid_event", message: "no such run" });
    outbox.refused(new RefusedError("forbidden", "at large"));
    expect(outbox.size()).toBe(1);
    outbox.abandon("closed");
    await expect(dropped).rejects.toMatchObject({ code: "closed" });
  });
});
