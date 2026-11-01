import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import { connectorGallery, GALLERY_KEPT_MS, GALLERY_RETRY_MS, readableUrl } from "./gallery.js";

const logger = createLogger({ level: "silent" });
const CARD = { id: "hermes", name: "Hermes", line: "With its Chips plugin", kind: "one-line" };

function answering(bodies: Array<string | number>) {
  const asked: string[] = [];
  const fetching = (async (url: URL) => {
    asked.push(String(url));
    const next = bodies.shift();
    if (next === undefined || typeof next === "number") {
      return new Response("no", { status: typeof next === "number" ? next : 503 });
    }
    return new Response(next, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetching, asked };
}

describe("readableUrl", () => {
  it("reads https anywhere and http only on this machine", () => {
    expect(readableUrl("https://chipschat.ai/connectors.json")?.href).toBe(
      "https://chipschat.ai/connectors.json",
    );
    expect(readableUrl("http://127.0.0.1:4321/connectors.json")).toBeDefined();
    expect(readableUrl("http://example.com/connectors.json")).toBeUndefined();
    expect(readableUrl("/Users/a/connectors.json")).toBeUndefined();
  });
});

describe("connectorGallery from a URL", () => {
  it("reads once a day, and keeps the cards when a read fails", async () => {
    const clock = manualClock(Date.parse("2026-10-15T08:00:00Z"));
    const { fetching, asked } = answering([JSON.stringify([CARD]), 503, JSON.stringify([])]);
    const gallery = connectorGallery({
      source: "https://chipschat.ai/connectors.json",
      clock,
      logger,
      fetch: fetching,
    });
    expect((await gallery.read()).connectors).toEqual([CARD]);
    expect((await gallery.read()).connectors).toEqual([CARD]);
    expect(asked).toHaveLength(1);

    clock.advance(GALLERY_KEPT_MS);
    expect((await gallery.read()).connectors).toEqual([CARD]);
    expect(asked).toHaveLength(2);
    // Failed: not asked again for ten minutes.
    clock.advance(GALLERY_RETRY_MS - 1);
    await gallery.read();
    expect(asked).toHaveLength(2);
    clock.advance(1);
    expect((await gallery.read()).connectors).toEqual([]);
    expect(asked).toHaveLength(3);
  });

  it("asks once for readers who arrive together", async () => {
    const clock = manualClock(0);
    const { fetching, asked } = answering([JSON.stringify([CARD])]);
    const gallery = connectorGallery({
      source: "https://x.test/c.json",
      clock,
      logger,
      fetch: fetching,
    });
    await Promise.all([gallery.read(), gallery.read(), gallery.read()]);
    expect(asked).toHaveLength(1);
  });

  it("is no cards for a page that isn't JSON", async () => {
    const { fetching } = answering(["<html>"]);
    const gallery = connectorGallery({
      source: "https://x.test/c.json",
      clock: manualClock(0),
      logger,
      fetch: fetching,
    });
    expect(await gallery.read()).toEqual({ connectors: [] });
  });
});

describe("connectorGallery from a file", () => {
  it("reads it when asked, and is no cards for one too big", async () => {
    let text = JSON.stringify({ connectors: [CARD] });
    const gallery = connectorGallery({
      source: "/docs/connectors.json",
      clock: manualClock(0),
      logger,
      readText: async () => text,
    });
    expect((await gallery.read()).connectors).toEqual([CARD]);
    text = " ".repeat(300 * 1024);
    expect((await gallery.read()).connectors).toEqual([]);
  });
});
