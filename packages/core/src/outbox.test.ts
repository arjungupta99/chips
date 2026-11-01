import { describe, expect, it } from "vitest";
import { createOutbox } from "./outbox.js";

const event = (key: string, text = key) => ({ type: "message.post", idempotency_key: key, text });

describe("the outbox", () => {
  it("holds what was sent, oldest first, until the server answers for it", () => {
    const outbox = createOutbox();
    outbox.add(event("a"));
    outbox.add(event("b"));
    expect(outbox.unanswered().map((e) => e.idempotency_key)).toEqual(["a", "b"]);

    expect(outbox.settle("a")).toMatchObject({ idempotency_key: "a" });
    expect(outbox.unanswered().map((e) => e.idempotency_key)).toEqual(["b"]);
    expect(outbox.size()).toBe(1);
  });

  it("keeps a resent event in its first place, with its first content", () => {
    const outbox = createOutbox();
    outbox.add(event("a", "first"));
    outbox.add(event("b"));
    outbox.add(event("a", "again"));
    expect(outbox.unanswered().map((e) => [e.idempotency_key, e["text"]])).toEqual([
      ["a", "first"],
      ["b", "b"],
    ]);
  });

  it("settles a key it never held as nothing, rather than throwing", () => {
    const outbox = createOutbox();
    expect(outbox.settle("never")).toBeUndefined();
    expect(outbox.size()).toBe(0);
  });
});
