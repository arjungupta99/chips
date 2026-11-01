/**
 * `chips connect <id> '<link>'`, `chips disconnect <id>` and `chips connect --update` (ADR 0218),
 * with a stand-in registry and a real bridge: a few lines of JavaScript, packed as npm packs one,
 * run on this Node. It writes what it was run with to a file, says its steps as the SDK does, and
 * stops as a bridge does when its harness isn't there.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRecord } from "../bridges.js";
import type { BridgeCard } from "../cards.js";
import { scriptedConsole } from "../output.js";
import { packed, standIn } from "../testing/registry.js";
import {
  type BridgeDeps,
  connectBridge,
  disconnectBridge,
  KEY_KEPT,
  stopEveryBridge,
  updateBridges,
} from "./bridge.js";

/** The bridge: run with what, in what, and its steps; `FAKE_FAIL` stops it at its harness. */
const BRIDGE = `
const fs = require("node:fs");
const words = process.argv.slice(2);
const args = words.filter((word) => !word.startsWith("--"));
fs.appendFileSync(process.env.FAKE_RAN, JSON.stringify({
  words,
  link: process.env.CHIPS_JOIN_LINK,
  card: process.env.CHIPS_CARD_NAME,
  node: process.env.CHIPS_NODE,
  stop: process.env.CHIPS_STOP_COMMAND,
  steps: process.env.CHIPS_STEPS,
  path: process.env.PATH,
  version: require("../package.json").version,
}) + "\\n");
const step = (each) => process.stdout.write("chips-step " + JSON.stringify(each) + "\\n");
if (words.includes("--stop")) {
  console.log("Stopped chat.chips.fake" + (args.length > 0 ? ".kind" : "") + ".");
  process.exit(0);
}
if (process.env.FAKE_FAIL === "words") {
  step({ step: "checking", detail: "Looking for Fake" });
  step({ step: "failed", detail: "Nothing answers on port 1234", says: "Fake is off.", doing: "Start it, then try again.", copy: "fake start", token: "never passed on" });
}
if (process.env.FAKE_FAIL) {
  console.error("Fake isn't installed on this machine: install it. The link is still good: run the same command again once that's done.");
  process.exit(1);
}
step({ step: "joining" });
step({ step: "keeping", label: "chat.chips.fake" + (args.length > 0 ? ".kind" : "") });
console.log("Kept running as chat.chips.fake: " + process.env.CHIPS_STOP_COMMAND + " stops it.");
`;

const LINK = "http://127.0.0.1:4431/j/chips_j_abcdefabcdefabcdefabcdefab";

const card = (id: string, more: Partial<BridgeCard> = {}): BridgeCard => ({
  id,
  name: id === "fake" ? "Fake" : id,
  line: "A harness for the tests",
  kind: "one-line",
  command: `chips connect ${id} '{link}'`,
  package: "@chipschat/fake@1",
  ...more,
});

let dir: string;
let ran: string;
const runs = () =>
  existsSync(ran)
    ? readFileSync(ran, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];

const tarball = (version: string) =>
  packed(
    dir,
    { name: "@chipschat/fake", version, bin: { "chips-fake": "dist/main.js" } },
    { "dist/main.js": BRIDGE },
  );

function depsFor(
  versions: Record<string, Uint8Array>,
  more: Partial<BridgeDeps> = {},
): BridgeDeps & { lines: string[] } {
  const out = scriptedConsole(true);
  const registry = standIn({
    "@chipschat/fake": Object.fromEntries(
      Object.entries(versions).map(([version, bytes]) => [version, { bytes }]),
    ),
  });
  return {
    cards: [card("fake")],
    bridges: join(dir, "bridges"),
    registry: "https://registry.test",
    node: process.execPath,
    env: { PATH: "/usr/bin:/bin", FAKE_RAN: ran },
    console: out,
    fetch: registry.fetch,
    lines: out.lines,
    ...more,
  };
}

const folder = () => join(dir, "bridges", "chipschat-fake");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-connect-bridge-"));
  ran = join(dir, "ran.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("chips connect <id> '<link>'", () => {
  it("fetches the bridge, runs it on Chips's Node with the link in its environment, and keeps it", async () => {
    const deps = depsFor({ "1.0.0": tarball("1.0.0") });
    expect(await connectBridge(card("fake"), LINK, deps)).toBe(0);
    const [run] = runs();
    // Never the link on the command line: a service file or `ps` would keep it.
    expect(run?.["words"]).toEqual(["--keep"]);
    expect(run?.["link"]).toBe(LINK);
    expect(run?.["node"]).toBe(process.execPath);
    expect(run?.["stop"]).toBe("chips disconnect fake");
    expect(run?.["steps"]).toBe("json");
    expect(String(run?.["path"]).split(":")[0]).toBe(dirname(process.execPath));
    expect(readRecord(folder())?.kept).toEqual({ fake: { label: "chat.chips.fake", args: [] } });
    expect(deps.lines).toEqual([
      "  Downloading @chipschat/fake 1.0.0…",
      "  ✓ It matches the registry's checksum.",
      "Kept running as chat.chips.fake: chips disconnect fake stops it.",
    ]);
  });

  it("with --json, says each step as a line of JSON and nothing else", async () => {
    // Packed once: two packings of the same files may differ in length.
    const packed = tarball("1.0.0");
    const deps = depsFor({ "1.0.0": packed }, { json: true });
    expect(await connectBridge(card("fake"), LINK, deps)).toBe(0);
    const lines = deps.lines
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    // How far the download is, as it comes: the last says all of it.
    const progress = lines.filter((line) => "received" in line);
    expect(progress.at(-1)).toMatchObject({
      step: "downloading",
      package: "@chipschat/fake",
      version: "1.0.0",
      received: packed.length,
    });
    const steps = lines.filter((line) => !("received" in line));
    expect(steps).toEqual([
      { step: "downloading", package: "@chipschat/fake", version: "1.0.0", reused: false },
      { step: "checking" },
      { step: "joining" },
      { step: "keeping", label: "chat.chips.fake" },
      { step: "connected" },
    ]);
  });

  it("reuses the bridge it has, and passes the card's args first", async () => {
    const deps = depsFor({ "1.0.0": tarball("1.0.0") }, { json: true });
    const kind = card("kind", { package: "@chipschat/fake@1", args: ["~/.fake/kind.json"] });
    await connectBridge(card("fake"), LINK, deps);
    await connectBridge(kind, LINK, { ...deps, cards: [card("fake"), kind] });
    expect(deps.lines).toContain(
      JSON.stringify({
        step: "downloading",
        package: "@chipschat/fake",
        version: "1.0.0",
        reused: true,
      }),
    );
    expect(runs()[1]?.["words"]).toEqual(["~/.fake/kind.json", "--keep"]);
    expect(readRecord(folder())?.kept).toEqual({
      fake: { label: "chat.chips.fake", args: [] },
      kind: { label: "chat.chips.fake.kind", args: ["~/.fake/kind.json"] },
    });
  });

  it("ends with the bridge's own sentence when its harness isn't there, and keeps nothing", async () => {
    const deps = depsFor(
      { "1.0.0": tarball("1.0.0") },
      { json: true, env: { PATH: "/usr/bin", FAKE_RAN: ran, FAKE_FAIL: "1" } },
    );
    expect(await connectBridge(card("fake"), LINK, deps)).toBe(1);
    const last = JSON.parse(deps.lines.filter((line) => line.startsWith("{")).at(-1) ?? "{}");
    expect(last).toEqual({
      step: "failed",
      sentence:
        "Fake isn't installed on this machine: install it. The link is still good: run the same command again once that's done.",
      code: 1,
    });
    expect(readRecord(folder())?.kept).toEqual({});
  });

  it("ends with the bridge's own words for a sheet, once, beside its sentence", async () => {
    const deps = depsFor(
      { "1.0.0": tarball("1.0.0") },
      { json: true, env: { PATH: "/usr/bin", FAKE_RAN: ran, FAKE_FAIL: "words" } },
    );
    expect(await connectBridge(card("fake"), LINK, deps)).toBe(1);
    const lines = deps.lines
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.filter((line) => line["step"] === "failed")).toHaveLength(1);
    expect(lines.at(-2)).toEqual({ step: "checking", detail: "Looking for Fake" });
    expect(lines.at(-1)).toEqual({
      step: "failed",
      detail: "Nothing answers on port 1234",
      says: "Fake is off.",
      doing: "Start it, then try again.",
      copy: "fake start",
      sentence:
        "Fake isn't installed on this machine: install it. The link is still good: run the same command again once that's done.",
      code: 1,
    });
  });

  it("refuses a line that isn't a link Chips made, before fetching anything", async () => {
    const deps = depsFor({ "1.0.0": tarball("1.0.0") }, { json: true });
    expect(await connectBridge(card("fake"), "not-a-link", deps)).toBe(1);
    expect(JSON.parse(deps.lines[0] ?? "{}")).toEqual({
      step: "failed",
      sentence:
        "That isn't a link Chips made. In Chips, open Connect a harness, then Fake, and copy its line again.",
      code: 1,
    });
    expect(existsSync(folder())).toBe(false);
  });

  it("refuses where the sheet called the card something else, before fetching anything (SEC-51)", async () => {
    const env = { PATH: "/usr/bin:/bin", FAKE_RAN: ran, CHIPS_CARD_NAME: "Calendar helper" };
    const deps = depsFor({ "1.0.0": tarball("1.0.0") }, { json: true, env });
    expect(await connectBridge(card("fake"), LINK, deps)).toBe(1);
    expect(JSON.parse(deps.lines[0] ?? "{}")).toEqual({
      step: "failed",
      sentence:
        "This workspace's card says Calendar helper, but fake here connects Fake, so Chips didn't connect it.",
      code: 1,
    });
    expect(existsSync(folder())).toBe(false);
    // Its own name connects, and the bridge never sees it.
    const named = depsFor(
      { "1.0.0": tarball("1.0.0") },
      { env: { ...env, CHIPS_CARD_NAME: "Fake" } },
    );
    expect(await connectBridge(card("fake"), LINK, named)).toBe(0);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]?.["card"]).toBeUndefined();
  });

  it("says why when the registry has no release of the card's major", async () => {
    const deps = depsFor({ "2.0.0": tarball("2.0.0") });
    expect(await connectBridge(card("fake"), LINK, deps)).toBe(1);
    expect(deps.lines).toEqual(["  https://registry.test has no release 1.x of @chipschat/fake."]);
  });
});

describe("chips connect <id> with no link (ADR 0218, 24 October 2026)", () => {
  const SERVER = "https://chips.example.ts.net";

  /** Chips's settings in a home of the test's own, and a key kept there for these harnesses. */
  function keptFor(names: readonly string[]): Record<string, string> {
    const config = join(dir, "config");
    mkdirSync(config, { recursive: true });
    const kept = Object.fromEntries(
      names.map((name) => [
        `harness:${name}@${SERVER}`,
        JSON.stringify({
          url: SERVER,
          harnessId: "hrn_kept",
          token: "chips_h_kept",
          hello: "said",
        }),
      ]),
    );
    writeFileSync(join(config, "harness-keys.json"), JSON.stringify(kept));
    return { CHIPS_CONFIG_HOME: config, CHIPS_NO_KEYCHAIN: "true", CHIPS_URL: SERVER };
  }

  it("joins with the key kept for its harness, passing on where Chips is, and says so", async () => {
    const deps = depsFor({ "1.0.0": tarball("1.0.0") }, { json: true });
    const env = { ...deps.env, ...keptFor(["Fake"]) };
    expect(await connectBridge(card("fake"), undefined, { ...deps, env })).toBe(0);
    const [run] = runs();
    expect(run?.["link"]).toBeUndefined();
    expect(run?.["words"]).toEqual(["--keep"]);
    expect(run?.["stop"]).toBe("chips disconnect fake");
    const steps = deps.lines
      .filter((line) => line.startsWith("{") && !line.includes('"received"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(steps.map((each) => each["step"])).toEqual([
      "downloading",
      "checking",
      "joining",
      "keeping",
      "connected",
    ]);
    expect(steps[2]).toEqual({ step: "joining", detail: KEY_KEPT });
    expect(readRecord(folder())?.kept).toEqual({ fake: { label: "chat.chips.fake", args: [] } });
  });

  it("never takes a spent link from the environment as its own", async () => {
    const deps = depsFor({ "1.0.0": tarball("1.0.0") });
    const env = { ...deps.env, ...keptFor(["Fake"]), CHIPS_JOIN_LINK: "" };
    expect(await connectBridge(card("fake"), undefined, { ...deps, env })).toBe(0);
    expect(runs()[0]?.["link"]).toBeUndefined();
  });

  it("with no key kept for its harness there, asks for a link before it downloads anything", async () => {
    let asked = 0;
    const deps = depsFor(
      {},
      {
        json: true,
        fetch: async () => {
          asked += 1;
          throw new Error("not to be asked");
        },
      },
    );
    const env = { ...deps.env, ...keptFor(["Another"]) };
    expect(await connectBridge(card("fake"), undefined, { ...deps, env })).toBe(1);
    expect(asked).toBe(0);
    expect(JSON.parse(deps.lines.at(-1) ?? "{}")).toEqual({
      step: "failed",
      sentence: `No key is kept here for Fake at ${SERVER}, so connecting it needs a link. In Chips, open Connect a harness, then Fake, and copy its line.`,
      code: 1,
    });
    const nowhere = depsFor({});
    const bare = {
      ...nowhere.env,
      CHIPS_CONFIG_HOME: join(dir, "none"),
      CHIPS_NO_KEYCHAIN: "true",
    };
    expect(await connectBridge(card("fake"), undefined, { ...nowhere, env: bare })).toBe(1);
    expect(nowhere.lines.join("\n")).toContain(
      "Chips isn't set here (CHIPS_URL, or chips up on this machine), so connecting Fake needs a link.",
    );
  });
});

describe("chips disconnect <id>", () => {
  it("stops it with the bridge's own --stop and removes its download", async () => {
    const deps = depsFor({ "1.0.0": tarball("1.0.0") });
    await connectBridge(card("fake"), LINK, deps);
    deps.lines.length = 0;
    expect(await disconnectBridge(card("fake"), deps)).toBe(0);
    expect(runs()[1]?.["words"]).toEqual(["--stop"]);
    expect(runs()[1]?.["link"]).toBeUndefined();
    expect(existsSync(folder())).toBe(false);
    expect(deps.lines).toEqual([
      "Stopped chat.chips.fake.",
      "  ✓ Removed @chipschat/fake 1.0.0 from this machine.",
    ]);
  });

  it("keeps a download another card still runs on", async () => {
    const kind = card("kind", { name: "Kind", args: ["kind.json"] });
    const deps = depsFor({ "1.0.0": tarball("1.0.0") }, { cards: [card("fake"), kind] });
    await connectBridge(card("fake"), LINK, deps);
    await connectBridge(kind, LINK, deps);
    deps.lines.length = 0;
    await disconnectBridge(kind, deps);
    expect(runs()[2]?.["words"]).toEqual(["kind.json", "--stop"]);
    expect(deps.lines.at(-1)).toBe("  @chipschat/fake stays: Fake still runs on it.");
    expect(readRecord(folder())?.kept).toEqual({ fake: { label: "chat.chips.fake", args: [] } });
  });

  it("says there is nothing to stop where it was never fetched", async () => {
    const deps = depsFor({});
    expect(await disconnectBridge(card("fake"), deps)).toBe(0);
    expect(deps.lines).toEqual([
      "  Fake's bridge isn't on this machine, so there is nothing to stop.",
    ]);
  });
});

describe("chips connect --update", () => {
  it("brings a kept bridge to the newest of its major and starts its service again", async () => {
    const restarted: string[] = [];
    const restart = async (label: string) => {
      restarted.push(label);
      return true;
    };
    await connectBridge(card("fake"), LINK, depsFor({ "1.0.0": tarball("1.0.0") }));
    const deps = depsFor({ "1.0.0": tarball("1.0.0"), "1.1.0": tarball("1.1.0") }, { restart });
    expect(await updateBridges(deps)).toBe(0);
    expect(readRecord(folder())?.version).toBe("1.1.0");
    expect(restarted).toEqual(["chat.chips.fake"]);
    expect(deps.lines).toEqual([
      "  ✓ @chipschat/fake 1.0.0 is now 1.1.0.",
      "  ✓ Started chat.chips.fake again.",
    ]);

    deps.lines.length = 0;
    expect(await updateBridges(deps)).toBe(0);
    expect(deps.lines[0]).toBe("  @chipschat/fake 1.1.0 is the newest of its major.");
  });

  it("leaves a bridge nothing keeps running, and says a service that won't start", async () => {
    await connectBridge(
      card("fake"),
      LINK,
      depsFor({ "1.0.0": tarball("1.0.0") }, { env: { FAKE_RAN: ran, FAKE_FAIL: "1" } }),
    );
    const idle = depsFor({ "1.1.0": tarball("1.1.0") });
    expect(await updateBridges(idle)).toBe(0);
    expect(idle.lines).toEqual([]);

    await connectBridge(card("fake"), LINK, depsFor({ "1.0.0": tarball("1.0.0") }));
    const stuck = depsFor({ "1.0.0": tarball("1.0.0") }, { restart: async () => false });
    expect(await updateBridges(stuck)).toBe(1);
    expect(stuck.lines.at(-1)).toBe(
      "  chat.chips.fake didn't start again. `chips connect` with a new link sets it up afresh.",
    );
  });
});

describe("chips uninstall's bridges", () => {
  it("are each stopped by the bridge's own --stop, with the args each card was kept with", async () => {
    const kind = card("kind", { args: ["kind.json"] });
    const deps = depsFor({ "1.0.0": tarball("1.0.0") }, { cards: [card("fake"), kind] });
    await connectBridge(card("fake"), LINK, deps);
    await connectBridge(kind, LINK, deps);
    await stopEveryBridge(deps);
    expect(
      runs()
        .slice(2)
        .map((run) => run["words"]),
    ).toEqual([["--stop"], ["kind.json", "--stop"]]);
  });
});
