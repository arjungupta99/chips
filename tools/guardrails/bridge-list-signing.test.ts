/**
 * What `pnpm release:sign-bridges` puts in the signed list of bridge releases
 * (`tools/release/bridge-list.mjs`; bridges-keep-current.md, rule 6): which releases npm lists may
 * arrive on their own, the marks kept from the list before, and a mark that names nothing refused
 * before anything is signed. And that a computer reads all of it back.
 */

import { describe, expect, it } from "vitest";
import { readBridgeList } from "../../server/src/infrastructure/updates/bridge-list.js";
import {
  chooseRelease,
  laterThan,
} from "../../server/src/infrastructure/updates/bridge-updater.js";
import { bridgeListOf, cardsOn, KEEP, named, packagesOf } from "../release/bridge-list.mjs";

const SIGNED = "2026-11-20T10:00:00.000Z";
const sri = (n: number) => `sha512-${"A".repeat(84)}${String(n).padStart(2, "0")}==`;

/** npm's listing of one package: each version with its checksum and when it was published. */
function packument(
  versions: Record<
    string,
    {
      day: number;
      deprecated?: string;
      integrity?: string;
      chips?: string;
      engines?: Record<string, unknown>;
    }
  >,
) {
  const entries = Object.entries(versions);
  return {
    versions: Object.fromEntries(
      entries.map(([version, each], n) => [
        version,
        {
          version,
          dist: { integrity: each.integrity ?? sri(n) },
          ...(each.deprecated === undefined ? {} : { deprecated: each.deprecated }),
          ...(each.chips === undefined && each.engines === undefined
            ? {}
            : {
                engines: {
                  ...each.engines,
                  ...(each.chips === undefined ? {} : { chips: each.chips }),
                },
              }),
        },
      ]),
    ),
    time: Object.fromEntries(
      entries.map(([version, each]) => [
        version,
        `2026-11-${String(each.day).padStart(2, "0")}T10:00:00.000Z`,
      ]),
    ),
  };
}

const ACP = "@chipschat/acp";

describe("the bridges the cards name", () => {
  it("are each card's package, once, whether the file is a list or holds one", () => {
    const cards = [
      { id: "claude", package: "@chipschat/acp@1" },
      { id: "codex", package: "@chipschat/acp@1" },
      { id: "hermes", package: "@chipschat/hermes@1" },
      { id: "generic" },
      { id: "odd", package: "left-pad" },
    ];
    expect(packagesOf(cards)).toEqual(["@chipschat/acp", "@chipschat/hermes"]);
    expect(packagesOf({ connectors: cards })).toEqual(["@chipschat/acp", "@chipschat/hermes"]);
    expect(packagesOf({})).toEqual([]);
  });

  it("are marked by package and version, written exactly", () => {
    expect(named("@chipschat/acp@1.0.31")).toEqual({ name: ACP, version: "1.0.31" });
    for (const not of [
      "@chipschat/acp",
      "acp@1.0.31",
      "@chipschat/acp@1.0",
      "@chipschat/acp@latest",
    ]) {
      expect(() => named(not)).toThrow("is not <package>@<version>");
    }
  });
});

describe("the list that is signed", () => {
  it("names each release npm lists with its SHA-512 and its day, newest first, and when it was signed", () => {
    const list = bridgeListOf({
      packuments: {
        [ACP]: packument({
          "1.0.30": { day: 10 },
          "1.0.32": { day: 14, chips: ">=1.3.0" },
          "1.0.31": { day: 12 },
        }),
      },
      kept: { packages: {} },
      signed: SIGNED,
    });
    expect(list).toEqual({
      format: 1,
      signed: SIGNED,
      packages: {
        [ACP]: {
          releases: [
            {
              version: "1.0.32",
              integrity: sri(1),
              published: "2026-11-14T10:00:00.000Z",
              computer: "1.3.0",
            },
            { version: "1.0.31", integrity: sri(2), published: "2026-11-12T10:00:00.000Z" },
            { version: "1.0.30", integrity: sri(0), published: "2026-11-10T10:00:00.000Z" },
          ],
          withdrawn: [],
        },
      },
    });
  });

  it("leaves out what can't arrive on its own: a prerelease, one with no SHA-512, one npm gives no day for", () => {
    const listed = packument({
      "1.0.30": { day: 10 },
      "1.0.31-beta.1": { day: 11 },
      "1.0.32": { day: 12, integrity: "sha1-abc" },
      "1.0.33": { day: 13, integrity: `sha1-abc ${sri(9)}` },
      "1.0.34": { day: 14 },
    });
    delete (listed.time as Record<string, string>)["1.0.34"];
    const list = bridgeListOf({ packuments: { [ACP]: listed }, kept: undefined, signed: SIGNED });
    expect(list.packages[ACP].releases.map((each: { version: string }) => each.version)).toEqual([
      "1.0.33",
      "1.0.30",
    ]);
    // Of two checksums npm lists, the SHA-512 is the one a computer checks.
    expect(list.packages[ACP].releases[0].integrity).toBe(sri(9));
  });

  it("takes back a release npm has deprecated, and keeps the newest twenty of each major", () => {
    const versions: Record<string, { day: number; deprecated?: string }> = {};
    for (let patch = 0; patch < KEEP + 5; patch += 1) {
      versions[`1.0.${patch}`] = { day: 1 + (patch % 28) };
    }
    versions["2.0.0"] = { day: 28 };
    versions["1.0.3"] = { day: 4, deprecated: "It lost messages." };
    const list = bridgeListOf({
      packuments: { [ACP]: packument(versions) },
      kept: undefined,
      signed: SIGNED,
    });
    const listed = list.packages[ACP].releases.map((each: { version: string }) => each.version);
    expect(listed.filter((each: string) => each.startsWith("1."))).toHaveLength(KEEP);
    expect(listed).toContain("2.0.0");
    expect(listed).not.toContain("1.0.3");
    expect(list.packages[ACP].withdrawn).toEqual(["1.0.3"]);
  });

  it("keeps the marks of the list signed before, and adds the ones asked for now", () => {
    const packuments = {
      [ACP]: packument({ "1.0.30": { day: 10 }, "1.0.31": { day: 12 }, "1.0.32": { day: 14 } }),
    };
    const before = bridgeListOf({
      packuments,
      kept: undefined,
      withdraw: ["@chipschat/acp@1.0.30"],
      urgent: ["@chipschat/acp@1.0.31"],
      signed: SIGNED,
    });
    expect(before.packages[ACP].withdrawn).toEqual(["1.0.30"]);
    // Signed again after the next release, with nothing said: the marks are still there.
    const after = bridgeListOf({ packuments, kept: before, signed: "2026-11-21T10:00:00.000Z" });
    expect(after.packages[ACP].withdrawn).toEqual(["1.0.30"]);
    expect(
      after.packages[ACP].releases.filter((each: { urgent?: true }) => each.urgent === true),
    ).toEqual([expect.objectContaining({ version: "1.0.31" })]);
    const more = bridgeListOf({
      packuments,
      kept: after,
      withdraw: ["@chipschat/acp@1.0.31"],
      signed: "2026-11-22T10:00:00.000Z",
    });
    expect(more.packages[ACP].withdrawn).toEqual(["1.0.30", "1.0.31"]);
  });

  it("stops at a mark that names nothing, before anything is signed", () => {
    const packuments = { [ACP]: packument({ "1.0.30": { day: 10 } }) };
    const mark = (flag: "withdraw" | "urgent", spec: string) => () =>
      bridgeListOf({ packuments, kept: undefined, [flag]: [spec], signed: SIGNED });
    expect(mark("withdraw", "@chipschat/apc@1.0.30")).toThrow(
      "--withdraw @chipschat/apc@1.0.30: the cards name no bridge @chipschat/apc",
    );
    expect(mark("withdraw", "@chipschat/acp@1.0.3")).toThrow(
      "--withdraw @chipschat/acp@1.0.3: npm lists no @chipschat/acp 1.0.3",
    );
    expect(mark("urgent", "@chipschat/acp@1.0.31")).toThrow(
      "--urgent @chipschat/acp@1.0.31: npm lists no @chipschat/acp 1.0.31",
    );
    expect(mark("urgent", "acp@1.0.30")).toThrow("is not <package>@<version>");
  });
});

describe("the harness a release needs", () => {
  const CARDS = [
    { id: "claude-code", package: "@chipschat/acp@1" },
    { id: "codex", package: "@chipschat/acp@1" },
    { id: "hermes", package: "@chipschat/hermes@1" },
    { id: "generic" },
  ];
  const listOf = (engines: Record<string, unknown>, cards: unknown = CARDS) =>
    bridgeListOf({
      packuments: {
        [ACP]: packument({ "1.0.30": { day: 10 }, "1.0.31": { day: 12, engines } }),
      },
      kept: { packages: {} },
      signed: SIGNED,
      cards,
    }).packages[ACP].releases;

  it("names the cards kept on a package", () => {
    expect(cardsOn(CARDS, ACP)).toEqual(["claude-code", "codex"]);
    expect(cardsOn({ connectors: CARDS }, "@chipschat/hermes")).toEqual(["hermes"]);
    expect(cardsOn(CARDS, "@chipschat/opencode")).toEqual([]);
  });

  it("is listed by the card it is kept for, beside the Node and the computer it names", () => {
    const releases = listOf({
      node: ">=22.19.0",
      chips: ">=1.3.0",
      "claude-code": ">=2.1.0",
      codex: ">= 0.150.0",
    });
    expect(releases[0]).toEqual({
      version: "1.0.31",
      integrity: sri(1),
      published: "2026-11-12T10:00:00.000Z",
      computer: "1.3.0",
      needs: { "claude-code": "2.1.0", codex: "0.150.0" },
    });
    // A release that names none is listed as before.
    expect(releases[1]).toEqual({
      version: "1.0.30",
      integrity: sri(0),
      published: "2026-11-10T10:00:00.000Z",
    });
    expect(listOf({ node: ">=22.19.0", npm: ">=10" })[0]).not.toHaveProperty("needs");
  });

  it("stops the script when it is written any way but >=1.2.3, naming the release", () => {
    for (const range of ["^2.1.0", ">=2.1", "2.1.0", ">=2.1.0 <3", "*", 3, null]) {
      expect(() => listOf({ "claude-code": range })).toThrow(
        /@chipschat\/acp 1\.0\.31 names engines\.claude-code as .*: write the oldest it works with as ">=1\.2\.3", or deprecate the release/,
      );
    }
  });

  it("stops the script for a harness no card kept on the package is called", () => {
    expect(() => listOf({ hermes: ">=0.9.0" })).toThrow(
      "@chipschat/acp 1.0.31 names engines.hermes, and no card kept on @chipschat/acp is called hermes (claude-code, codex)",
    );
    // With no cards to check against, the name is taken as written.
    const unchecked = bridgeListOf({
      packuments: { [ACP]: packument({ "1.0.31": { day: 12, engines: { hermes: ">=0.9.0" } } }) },
      kept: { packages: {} },
      signed: SIGNED,
    });
    expect(unchecked.packages[ACP].releases[0]?.needs).toEqual({ hermes: "0.9.0" });
  });

  it("holds nothing up for a release too old to be listed, or one deprecated", () => {
    const versions: Record<
      string,
      { day: number; engines?: Record<string, unknown>; deprecated?: string }
    > = {
      "1.0.0": { day: 1, engines: { "claude-code": "soon" } },
      "1.0.1": { day: 2, engines: { "claude-code": "soon" }, deprecated: "its floor is wrong" },
    };
    for (let n = 2; n < KEEP + 2; n += 1) versions[`1.0.${n}`] = { day: Math.min(28, n + 1) };
    // 1.0.1 is deprecated; 1.0.0 is past the twenty kept. Their dates differ so the order holds.
    const list = bridgeListOf({
      packuments: { [ACP]: packument(versions) },
      kept: { packages: {} },
      signed: SIGNED,
      cards: CARDS,
    });
    expect(list.packages[ACP].releases).toHaveLength(KEEP);
    expect(list.packages[ACP].releases.map((each) => each.version)).not.toContain("1.0.0");
  });

  it("is read back by a computer, which then takes only what its harness is new enough for", () => {
    const list = bridgeListOf({
      packuments: {
        [ACP]: packument({
          "1.0.30": { day: 1 },
          "1.0.31": { day: 2 },
          "1.0.32": { day: 3, engines: { "claude-code": ">=3.0.0" } },
        }),
      },
      kept: { packages: {} },
      signed: SIGNED,
      cards: CARDS,
    });
    const read = readBridgeList(JSON.parse(JSON.stringify(list)), SIGNED, Date.parse(SIGNED));
    expect(read.packages[ACP]).toEqual(list.packages[ACP]);
    const choose = (have: string) =>
      chooseRelease({
        listed: read.packages[ACP],
        major: 1,
        running: "1.0.30",
        computer: "1.2.5",
        siteNow: Date.parse(SIGNED),
        now: Date.parse(SIGNED),
        waitMs: 0,
        skips: {},
        fits: (release) =>
          release.needs?.["claude-code"] === undefined ||
          !laterThan(release.needs["claude-code"], have),
      })?.version;
    expect(choose("2.9.0")).toBe("1.0.31");
    expect(choose("3.0.0")).toBe("1.0.32");
  });
});

describe("a computer reading what was signed", () => {
  const list = bridgeListOf({
    packuments: {
      [ACP]: packument({
        "1.0.30": { day: 10 },
        "1.0.31": { day: 12 },
        "1.0.32": { day: 14, chips: ">=1.3.0" },
        "1.0.33": { day: 15 },
      }),
    },
    kept: undefined,
    withdraw: ["@chipschat/acp@1.0.33"],
    urgent: ["@chipschat/acp@1.0.31"],
    signed: SIGNED,
  });
  const read = readBridgeList(JSON.parse(JSON.stringify(list)), SIGNED, Date.parse(SIGNED));

  it("reads every release, mark and the day it was signed, losing none", () => {
    expect(read.signed).toBe(SIGNED);
    expect(read.packages[ACP]).toEqual(list.packages[ACP]);
  });

  it("takes from it what the marks say: not the one taken back, the urgent one at once", () => {
    const choose = (running: string, computer: string) =>
      chooseRelease({
        listed: read.packages[ACP],
        major: 1,
        running,
        computer,
        siteNow: Date.parse("2026-11-12T11:00:00.000Z"),
        now: Date.parse("2026-11-12T11:00:00.000Z"),
        waitMs: 2 * 24 * 60 * 60_000,
        skips: {},
      })?.version;
    // An hour after 1.0.31 came out: urgent, so taken; 1.0.32 is for a newer computer.
    expect(choose("1.0.30", "1.2.5")).toBe("1.0.31");
    // A computer on the one taken back goes to the newest it may have.
    expect(choose("1.0.33", "1.2.5")).toBe("1.0.31");
    expect(choose("1.0.33", "1.3.0")).toBe("1.0.32");
  });
});
