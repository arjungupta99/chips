import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connector, fillLink, readConnectors } from "./connectors.js";

const CARD = { id: "hermes", name: "Hermes", line: "With its plugin", kind: "one-line" };

describe("readConnectors", () => {
  it("keeps each card that reads, once, and leaves out the rest", () => {
    const read = readConnectors({
      connectors: [CARD, { ...CARD }, { id: "Bad Id", name: "x", line: "y", kind: "one-line" }, 7],
    });
    expect(read).toEqual([CARD]);
  });

  it("takes a bare list, and is nothing for anything else", () => {
    expect(readConnectors([CARD])).toEqual([CARD]);
    expect(readConnectors("cards")).toEqual([]);
    expect(readConnectors(null)).toEqual([]);
    expect(readConnectors({ connectors: "x" })).toEqual([]);
  });

  it("reads a card from before a card had no face, and leaves its face out (ADR 0190)", () => {
    expect(readConnectors([{ ...CARD, face: { ground: 5 } }])).toEqual([CARD]);
  });

  it("keeps no more than the gallery shows", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...CARD, id: `c${i}` }));
    expect(readConnectors(many)).toHaveLength(24);
  });
});

describe("a card with a bridge (ADR 0218)", () => {
  it("names its package and major, and what its bridge is handed first", () => {
    const card = {
      ...CARD,
      command: "chips connect codex '{link}'",
      package: "@chipschat/acp@1",
      args: ["~/Chips/.bridges/acp/codex.json"],
    };
    expect(connector.parse(card)).toEqual(card);
  });

  it("is read without a package that isn't a name and a major, or args that are flags", () => {
    for (const bad of [
      { package: "@chipschat/acp" },
      { package: "@chipschat/acp@^1" },
      { package: "@chipschat/acp@1.0.0" },
      { args: ["--keep"] },
      { args: ["a b"] },
      { args: ["a", "b", "c", "d", "e"] },
    ]) {
      expect(connector.safeParse({ ...CARD, ...bad }).success).toBe(false);
    }
  });
});

describe("fillLink", () => {
  it("puts the link wherever {link} is", () => {
    expect(fillLink("CHIPS_JOIN_LINK='{link}' npx a; echo {link}", "https://x/j/s")).toBe(
      "CHIPS_JOIN_LINK='https://x/j/s' npx a; echo https://x/j/s",
    );
  });
});

describe("the docs' connectors.json", () => {
  it("reads whole: every card it lists is one the apps can show (ADR 0171)", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../../../apps/docs/public/connectors.json", import.meta.url), "utf8"),
    ) as { connectors: unknown[] };
    for (const each of raw.connectors) expect(connector.parse(each)).toEqual(each);
    expect(readConnectors(raw)).toHaveLength(raw.connectors.length);
    for (const card of readConnectors(raw)) {
      // A card with a command or a sentence has somewhere to put the link.
      if (card.command !== undefined) expect(card.command).toContain("{link}");
      if (card.sentence !== undefined) expect(card.sentence).toContain("{link}");
    }
  });
});
