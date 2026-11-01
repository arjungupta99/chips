/**
 * The gallery's cards (ADR 0171) run nothing that isn't ours. A card's command or sentence that
 * fetches a package to run it (`npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`, a global install)
 * may name only a package we have published. Until 16 October 2026 every card said
 * `npx chips-openclaw` and the like: names nobody had published, so whoever took one first would
 * have been run by the gallery with a live join link in its environment.
 *
 * Since ADR 0218 a one-line card is exactly `chips connect <its id> '{link}'`, and the package
 * `chips connect` fetches is the card's `package`, which is ours: `@chipschat/…`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GALLERY = fileURLToPath(new URL("../../apps/docs/public/connectors.json", import.meta.url));

/** Packages published on npm under our own account. Add one only once it is there. */
const PUBLISHED: ReadonlySet<string> = new Set<string>([
  // ADR 0218's phase 6, 23 October 2026: each bridge at 1.0.0, from its own repository.
  "@chipschat/hermes",
  "@chipschat/opencode",
  "@chipschat/acp",
  "@chipschat/openclaw",
]);

const RUNNER =
  /(?:^|[\s;&|(])(?:npx|bunx|pnpm\s+dlx|yarn\s+dlx|npm\s+(?:exec|x)|(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\s+(?:-g|--global))((?:\s+-[^\s]*)*)\s+(@?[^\s@'"]+(?:\/[^\s@'"]+)?)/g;

/** The packages a line fetches to run, by name, without their versions. */
function fetchedPackages(text: string): string[] {
  return [...text.matchAll(RUNNER)].map((found) => found[2] ?? "");
}

describe("a gallery card", () => {
  it("knows a fetched package when it sees one", () => {
    expect(fetchedPackages("CHIPS_JOIN_LINK='{link}' npx chips-openclaw")).toEqual([
      "chips-openclaw",
    ]);
    expect(fetchedPackages("npx --yes @scope/tool@1.2 go")).toEqual(["@scope/tool"]);
    expect(fetchedPackages("pnpm dlx chips-acp && bunx other")).toEqual(["chips-acp", "other"]);
    expect(fetchedPackages("npm install -g chips-hermes")).toEqual(["chips-hermes"]);
    expect(fetchedPackages("cd ~/Work/chips-acp && CHIPS_JOIN_LINK='{link}' npm start")).toEqual(
      [],
    );
  });

  it("runs only a package we have published", () => {
    const gallery = JSON.parse(readFileSync(GALLERY, "utf8")) as {
      connectors: { id: string; command?: string; sentence?: string }[];
    };
    const strangers = gallery.connectors.flatMap((card) =>
      [card.command, card.sentence]
        .flatMap((text) => fetchedPackages(text ?? ""))
        .filter((name) => !PUBLISHED.has(name))
        .map((name) => `${card.id}: ${name}`),
    );
    expect(strangers).toEqual([]);
  });

  it("is one line, `chips connect` with its own id and the link, fetching a package of ours (ADR 0218)", () => {
    const gallery = JSON.parse(readFileSync(GALLERY, "utf8")) as {
      connectors: { id: string; kind: string; command?: string; package?: string }[];
    };
    const lines = gallery.connectors.filter((card) => card.kind === "one-line");
    expect(lines.length).toBeGreaterThan(0);
    for (const card of lines) {
      expect(card.command, card.id).toBe(`chips connect ${card.id} '{link}'`);
      expect(card.package, card.id).toMatch(/^@chipschat\/[a-z0-9-]+@\d+$/);
    }
  });

  it("says it is published only when the package it fetches is", () => {
    const gallery = JSON.parse(readFileSync(GALLERY, "utf8")) as {
      connectors: { id: string; package?: string; published?: boolean }[];
    };
    const early = gallery.connectors
      .filter((card) => card.package !== undefined && card.published !== false)
      .filter((card) => !PUBLISHED.has(card.package?.replace(/@\d+$/, "") ?? ""))
      .map((card) => `${card.id}: ${card.package}`);
    expect(early).toEqual([]);
  });
});
