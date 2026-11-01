/**
 * The cards this Chips carries, as `chips connect` reads them (ADR 0218): from a file or a URL,
 * the ones with a bridge, and the list `chips connect` shows on its own.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectableLines, connectIds, isBridgeCard, readCards } from "./cards.js";

const HERMES = {
  id: "hermes",
  name: "Hermes",
  line: "Hermes Agent's API server",
  kind: "one-line",
  command: "chips connect hermes '{link}'",
  package: "@chipschat/hermes@1",
} as const;
const GUIDE = { id: "guide", name: "A guide", line: "A page to follow", kind: "guide" } as const;
const CUSTOM = { id: "custom", name: "Custom harness", line: "your own" };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-cards-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the cards", () => {
  it("are read from the file the server reads, and are none without one", async () => {
    const file = join(dir, "connectors.json");
    writeFileSync(file, JSON.stringify({ connectors: [HERMES, GUIDE] }));
    expect(await readCards(file)).toEqual([HERMES, GUIDE]);
    expect(await readCards(undefined)).toEqual([]);
  });

  it("are read from a URL, and say where they couldn't be read from", async () => {
    const answer = (async () => Response.json([HERMES])) as typeof fetch;
    expect(await readCards("https://chipschat.ai/connectors.json", answer)).toEqual([HERMES]);
    await expect(readCards(join(dir, "none.json"))).rejects.toThrow(
      `This Chips's cards couldn't be read from ${join(dir, "none.json")}`,
    );
  });

  it("with a bridge are the one-line cards that name a package", () => {
    expect(isBridgeCard(HERMES)).toBe(true);
    expect(isBridgeCard(GUIDE)).toBe(false);
    expect(isBridgeCard({ ...HERMES, package: undefined })).toBe(false);
  });

  it("name the ids `chips connect` and `chips help` give: each card with a bridge, then the adapters", () => {
    expect(connectIds([HERMES, GUIDE], ["custom"])).toBe("hermes, custom");
    expect(connectIds([], ["custom"])).toBe("custom");
  });

  it("are listed, with the adapters, by `chips connect` on its own", () => {
    expect(connectableLines([HERMES, GUIDE], [CUSTOM])).toEqual([
      "    hermes   Hermes           Hermes Agent's API server",
      "    custom   Custom harness   your own",
      "",
      "  CHIPS_JOIN_LINK='<link>' chips connect <id> connects one, with a link made in Chips: Connect a harness, then its card.",
    ]);
    expect(connectableLines([], [CUSTOM])).toEqual(["    custom   Custom harness   your own", ""]);
  });
});
