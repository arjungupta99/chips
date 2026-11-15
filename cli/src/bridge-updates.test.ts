/**
 * The computer keeping its own bridges current (bridges-keep-current.md, A), on the CLI's side:
 * each release in a folder of its own behind a `package` link, a folder an older Chips left taken
 * back, one at a time under a lock, an exact signed release staged beside the one running, one
 * service switched, and the journal that says where it got to.
 */

import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKeyStore } from "@chipschat/harness";
import { BridgeRefusal } from "@chipschat/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeHands, bridgeServicePath } from "./bridge-hands.js";
import {
  adoptLayout,
  bridgeFolder,
  fetchBridge,
  forgetService,
  LOCK_STALE_MS,
  LockHeld,
  nodeMeets,
  noteJournal,
  pointTo,
  prune,
  readJournal,
  readRecord,
  stagedHere,
  stageRelease,
  startedOnNow,
  switchService,
  takeLock,
  unpack,
  versionInUse,
  writeJournal,
  writeRecord,
} from "./bridges.js";
import { packed, sriOf, standIn } from "./testing/registry.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-bridge-updates-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const NAME = "@chipschat/fake";
const manifest = (version: string) => ({
  name: NAME,
  version,
  bin: { "chips-fake": "dist/main.js" },
});
const bridges = () => join(dir, "bridges");
const folder = () => bridgeFolder(bridges(), NAME);
const tarball = (version: string, main = `// ${version}\n`) =>
  packed(dir, manifest(version), { "dist/main.js": main });

/** A release unpacked by hand as `package-<version>`. */
function unpacked(version: string): void {
  mkdirSync(join(folder(), `package-${version}`, "dist"), { recursive: true });
  writeFileSync(
    join(folder(), `package-${version}`, "package.json"),
    JSON.stringify(manifest(version)),
  );
  writeFileSync(join(folder(), `package-${version}`, "dist", "main.js"), `// ${version}\n`);
}

const kept = {
  claude: { label: "chat.chips.claude", args: [] },
  codex: { label: "chat.chips.codex", args: [] },
};

function recorded(version: string): void {
  writeRecord(folder(), { package: NAME, version, integrity: "sha512-x", kept });
}

describe("each release in a folder of its own", () => {
  it("takes back a plain `package` folder an older Chips unpacked, under its version", () => {
    mkdirSync(join(folder(), "package", "dist"), { recursive: true });
    writeFileSync(join(folder(), "package", "package.json"), JSON.stringify(manifest("1.0.30")));
    adoptLayout(folder());
    expect(lstatSync(join(folder(), "package")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(folder(), "package"))).toBe("package-1.0.30");
    expect(versionInUse(folder())).toBe("1.0.30");
    // Taken back once: a second look changes nothing.
    adoptLayout(folder());
    expect(stagedHere(folder())).toEqual(["1.0.30"]);
  });

  it("moves the link in one rename and remembers the release before", () => {
    unpacked("1.0.30");
    unpacked("1.0.31");
    pointTo(folder(), "1.0.30");
    pointTo(folder(), "1.0.31");
    expect(readFileSync(join(folder(), "package", "dist", "main.js"), "utf8")).toBe("// 1.0.31\n");
    expect(readJournal(folder())).toMatchObject({ current: "1.0.31", previous: "1.0.30" });
    expect(readdirSync(folder()).filter((each) => each.startsWith("package.next"))).toEqual([]);
    expect(() => pointTo(folder(), "1.0.40")).toThrow("isn't unpacked here");
    expect(() => pointTo(folder(), "../evil")).toThrow("is not a version");
  });

  it("keeps the one in use, the one before, and any a service still started on", () => {
    for (const version of ["1.0.28", "1.0.29", "1.0.30", "1.0.31"]) unpacked(version);
    pointTo(folder(), "1.0.30");
    pointTo(folder(), "1.0.31");
    writeJournal(folder(), {
      ...readJournal(folder()),
      startedOn: { "chat.chips.codex": "1.0.28" },
      staged: { "1.0.29": "sha512-a", "1.0.31": "sha512-b" },
    });
    prune(folder());
    expect(stagedHere(folder()).sort()).toEqual(["1.0.28", "1.0.30", "1.0.31"]);
    expect(readJournal(folder()).staged).toEqual({ "1.0.31": "sha512-b" });
  });

  it("is what a bridge still running goes on loading, after the link moves", async () => {
    // A bridge that loads a second file late, as a lazy import does.
    const release = (version: string) => {
      const root = join(folder(), `package-${version}`);
      mkdirSync(join(root, "dist"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify(manifest(version)));
      writeFileSync(join(root, "dist", "late.mjs"), `export default "${version}";\n`);
      writeFileSync(
        join(root, "dist", "main.mjs"),
        [
          "process.stdin.once('data', async () => {",
          "  const late = await import('./late.mjs');",
          "  process.stdout.write(late.default);",
          "  process.exit(0);",
          "});",
          "process.stdout.write('ready');",
        ].join("\n"),
      );
    };
    release("1.0.30");
    release("1.0.31");
    pointTo(folder(), "1.0.30");
    const child = spawn(process.execPath, [join(folder(), "package", "dist", "main.mjs")]);
    let said = "";
    child.stdout.on("data", (chunk: Buffer) => {
      said += chunk.toString();
    });
    await new Promise<void>((resolve) => {
      child.stdout.once("data", () => resolve());
    });
    pointTo(folder(), "1.0.31");
    child.stdin.write("go\n");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(said).toBe("ready1.0.30");
  });
});

describe("one at a time", () => {
  it("refuses a second holder while the first is alive, and takes over one left by a gone process", () => {
    mkdirSync(folder(), { recursive: true });
    const letGo = takeLock(folder());
    // This process holds it: a process that isn't this one would be refused. Pretend the holder
    // is another live process, the test runner's parent.
    writeFileSync(join(folder(), "bridge.lock"), String(process.ppid));
    expect(() => takeLock(folder())).toThrow(LockHeld);
    letGo();
    writeFileSync(join(folder(), "bridge.lock"), "999999999");
    const again = takeLock(folder());
    expect(readFileSync(join(folder(), "bridge.lock"), "utf8")).toBe(String(process.pid));
    again();
    expect(existsSync(join(folder(), "bridge.lock"))).toBe(false);
  });

  it("is taken by `chips connect` too", async () => {
    mkdirSync(folder(), { recursive: true });
    writeFileSync(join(folder(), "bridge.lock"), String(process.ppid));
    const one = tarball("1.0.0");
    await expect(
      fetchBridge({
        registry: "https://registry.test",
        spec: { name: NAME, major: 1 },
        bridges: bridges(),
        fetch: standIn({ [NAME]: { "1.0.0": { bytes: one } } }).fetch,
      }),
    ).rejects.toThrow(LockHeld);
  });
});

describe("Node's range", () => {
  it("reads >=, ^, ~, plain and || clauses, and lets one it can't read pass", () => {
    expect(nodeMeets(">=20", "22.11.0")).toBe(true);
    expect(nodeMeets(">=22.12.0", "22.11.0")).toBe(false);
    expect(nodeMeets("^20.10.0 || >=22", "21.0.0")).toBe(false);
    expect(nodeMeets("^20.10.0 || >=22", "20.11.1")).toBe(true);
    expect(nodeMeets(">=20 <23", "22.0.0")).toBe(true);
    expect(nodeMeets("22.x", "v22.3.0")).toBe(true);
    expect(nodeMeets("lts/*", "18.0.0")).toBe(true);
  });
});

describe("staging an exact signed release", () => {
  const signedFrom = (bytes: Uint8Array) => sriOf(bytes);

  async function stage(
    versions: Record<string, { bytes: Uint8Array; engines?: object; integrity?: string }>,
    version: string,
    integrity: string,
    more: { nodeVersion?: string; free?: number } = {},
  ) {
    await stageRelease({
      registry: "https://registry.test",
      name: NAME,
      version,
      integrity,
      bridges: bridges(),
      nodeVersion: more.nodeVersion ?? "22.11.0",
      fetch: standIn({ [NAME]: versions }).fetch,
      free: () => more.free ?? Number.POSITIVE_INFINITY,
    });
  }

  beforeEach(() => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
  });

  it("unpacks it beside the one running and changes nothing that runs", async () => {
    const next = tarball("1.0.31");
    await stage({ "1.0.31": { bytes: next } }, "1.0.31", signedFrom(next));
    expect(stagedHere(folder()).sort()).toEqual(["1.0.30", "1.0.31"]);
    expect(versionInUse(folder())).toBe("1.0.30");
    expect(readRecord(folder())?.version).toBe("1.0.30");
    expect(readJournal(folder()).staged).toEqual({ "1.0.31": signedFrom(next) });
  });

  it("refuses a release whose npm checksum isn't the signed one", async () => {
    const next = tarball("1.0.31");
    const other = tarball("1.0.31", "// swapped\n");
    const refused = stage({ "1.0.31": { bytes: other } }, "1.0.31", signedFrom(next));
    await expect(refused).rejects.toBeInstanceOf(BridgeRefusal);
    await expect(refused).rejects.toMatchObject({ reason: "checksum" });
    expect(stagedHere(folder())).toEqual(["1.0.30"]);
  });

  it("refuses bytes that don't match, even when npm lists the signed checksum", async () => {
    const next = tarball("1.0.31");
    const other = tarball("1.0.31", "// swapped\n");
    await expect(
      stage(
        { "1.0.31": { bytes: other, integrity: signedFrom(next) } },
        "1.0.31",
        signedFrom(next),
      ),
    ).rejects.toMatchObject({ reason: "checksum" });
    expect(stagedHere(folder())).toEqual(["1.0.30"]);
  });

  it("refuses one this computer's Node is too old for, or the disk too full for", async () => {
    const next = tarball("1.0.31");
    const versions = { "1.0.31": { bytes: next, engines: { node: ">=24" } } };
    await expect(stage(versions, "1.0.31", signedFrom(next))).rejects.toMatchObject({
      reason: "node",
    });
    await expect(
      stage({ "1.0.31": { bytes: next } }, "1.0.31", signedFrom(next), { free: 1000 }),
    ).rejects.toMatchObject({ reason: "room" });
  });

  it("says when npm has no such release, or someone else holds the bridge", async () => {
    const next = tarball("1.0.31");
    await expect(stage({}, "1.0.31", signedFrom(next))).rejects.toMatchObject({
      reason: "registry",
    });
    writeFileSync(join(folder(), "bridge.lock"), String(process.ppid));
    await expect(
      stage({ "1.0.31": { bytes: next } }, "1.0.31", signedFrom(next)),
    ).rejects.toMatchObject({
      reason: "busy",
    });
  });
});

describe("switching one service", () => {
  beforeEach(() => {
    unpacked("1.0.30");
    unpacked("1.0.31");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    writeJournal(folder(), { ...readJournal(folder()), staged: { "1.0.31": "sha512-new" } });
  });

  it("moves the link, starts only that service again, and keeps the others' files", async () => {
    const restarted: string[] = [];
    const trying = {
      label: "chat.chips.claude",
      harnessId: "har_1",
      from: "1.0.30",
      to: "1.0.31",
      at: "2026-11-13T10:00:00.000Z",
    };
    const started = await switchService({
      bridges: bridges(),
      name: NAME,
      label: "chat.chips.claude",
      version: "1.0.31",
      trying,
      restart: async (label) => {
        restarted.push(label);
        // `trying` was written before the service started again.
        expect(readJournal(folder()).trying).toEqual(trying);
        return true;
      },
    });
    expect(started).toBe(true);
    expect(restarted).toEqual(["chat.chips.claude"]);
    expect(versionInUse(folder())).toBe("1.0.31");
    expect(readRecord(folder())).toMatchObject({ version: "1.0.31", integrity: "sha512-new" });
    expect(readJournal(folder()).startedOn).toEqual({
      "chat.chips.claude": "1.0.31",
      "chat.chips.codex": "1.0.30",
    });
    expect(stagedHere(folder()).sort()).toEqual(["1.0.30", "1.0.31"]);

    // Put back, `bridge.json` names the old release with the checksum it had.
    await switchService({
      bridges: bridges(),
      name: NAME,
      label: "chat.chips.claude",
      version: "1.0.30",
      trying: null,
      restart: async () => true,
    });
    expect(readRecord(folder())).toMatchObject({ version: "1.0.30", integrity: "sha512-x" });
    expect(readJournal(folder()).trying).toBeUndefined();
  });

  it("is what the journal is told about after, with skips and outcomes kept", async () => {
    await noteJournal(bridges(), NAME, {
      trying: null,
      skip: { version: "1.0.31", until: "2026-11-20T10:00:00.000Z" },
      outcome: {
        label: "chat.chips.claude",
        said: {
          outcome: "put-back",
          from: "1.0.30",
          to: "1.0.31",
          at: "2026-11-13T10:05:00.000Z",
          reason: "no-return",
        },
      },
    });
    const journal = readJournal(folder());
    expect(journal.trying).toBeUndefined();
    expect(journal.skips).toEqual({ "1.0.31": "2026-11-20T10:00:00.000Z" });
    expect(journal.last?.["chat.chips.claude"]?.outcome).toBe("put-back");
  });
});

describe("the hands the server gets", () => {
  it("list each bridge here with its harnesses, its releases and its journal", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    const hands = bridgeHands({
      cards: async () => [
        { id: "claude", kind: "one-line", name: "Claude Code", package: `${NAME}@1` } as never,
        { id: "codex", kind: "one-line", name: "Codex", package: `${NAME}@1` } as never,
      ],
      bridges: bridges(),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: {},
      restart: async () => true,
      harnessOf: (name) => (name === "Claude Code" ? "har_claude" : undefined),
    });
    expect(await hands.list()).toEqual([
      {
        package: NAME,
        major: 1,
        inUse: "1.0.30",
        recorded: "1.0.30",
        previous: undefined,
        staged: ["1.0.30"],
        verified: { "1.0.30": "sha512-x" },
        kept: [
          {
            id: "claude",
            label: "chat.chips.claude",
            harnessId: "har_claude",
            startedOn: undefined,
          },
          { id: "codex", label: "chat.chips.codex", harnessId: undefined, startedOn: undefined },
        ],
        skips: {},
        trying: undefined,
        proving: {},
        last: {},
      },
    ]);
  });
});

describe("the harness a kept bridge joined as, found where the bridge itself finds it", () => {
  afterEach(() => vi.unstubAllEnvs());

  /** A service file as the bridge wrote it when it was kept, with what it runs the bridge with. */
  function serviceFile(home: string, label: string, environment: Record<string, string>): void {
    const path = bridgeServicePath(label, { platform: process.platform, home, env: {} });
    if (path === undefined) throw new Error("no services on this platform");
    mkdirSync(join(path, ".."), { recursive: true });
    const plist = Object.entries(environment)
      .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
      .join("");
    const unit = Object.entries(environment)
      .map(([key, value]) => `Environment="${key}=${value}"`)
      .join("\n");
    writeFileSync(
      path,
      process.platform === "darwin"
        ? `<plist><dict><key>EnvironmentVariables</key><dict>${plist}</dict></dict></plist>`
        : `[Service]\n${unit}\n`,
    );
  }

  it.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
    "reads the server's address and the key's place from the service's own file",
    async () => {
      const home = join(dir, "home");
      const config = join(dir, "config");
      vi.stubEnv("HOME", home);
      // The key Claude Code's bridge kept when it joined, where a bridge keeps one with no Keychain.
      const settings = { CHIPS_NO_KEYCHAIN: "true", CHIPS_CONFIG_HOME: config };
      openKeyStore(settings).set(
        "harness:Claude Code@http://127.0.0.1:4431",
        JSON.stringify({
          url: "http://127.0.0.1:4431",
          harnessId: "hrn_claude",
          token: "chips_h_test",
          hello: "said",
        }),
      );
      serviceFile(home, "chat.chips.claude", { ...settings, CHIPS_URL: "http://127.0.0.1:4431" });
      // Codex's service names a server no key was kept for; nothing was kept running for Aider.
      serviceFile(home, "chat.chips.codex", { ...settings, CHIPS_URL: "http://127.0.0.1:4499" });
      unpacked("1.0.30");
      pointTo(folder(), "1.0.30");
      writeRecord(folder(), {
        package: NAME,
        version: "1.0.30",
        integrity: "sha512-x",
        kept: { ...kept, aider: { label: "chat.chips.aider", args: [] } },
      });
      const hands = bridgeHands({
        cards: async () =>
          [
            { id: "claude", kind: "one-line", name: "Claude Code", package: `${NAME}@1` },
            { id: "codex", kind: "one-line", name: "Codex", package: `${NAME}@1` },
            { id: "aider", kind: "one-line", name: "Aider", package: `${NAME}@1` },
          ] as never,
        bridges: bridges(),
        registry: "https://registry.test",
        nodeVersion: "22.11.0",
        // The server's own environment says nothing of where it is reached, or of the key.
        env: {},
        restart: async () => true,
      });
      const [bridge] = await hands.list();
      expect(bridge?.kept.map((each) => [each.id, each.harnessId])).toEqual([
        ["claude", "hrn_claude"],
        ["codex", undefined],
        ["aider", undefined],
      ]);
    },
  );
});

describe("a service started again by hand", () => {
  it("is written down as on the release in use", () => {
    unpacked("1.0.31");
    pointTo(folder(), "1.0.31");
    writeJournal(folder(), {
      ...readJournal(folder()),
      startedOn: { "chat.chips.claude": "1.0.30" },
    });
    startedOnNow(folder(), ["chat.chips.claude", "chat.chips.codex"]);
    expect(readJournal(folder()).startedOn).toEqual({
      "chat.chips.claude": "1.0.31",
      "chat.chips.codex": "1.0.31",
    });
  });
});

describe("a kept bridge's service file", () => {
  it("is where keep wrote it: a launch agent on a Mac, a user unit on Linux", () => {
    const env = {};
    expect(
      bridgeServicePath("chat.chips.hermes", { platform: "darwin", home: "/Users/ada", env }),
    ).toBe("/Users/ada/Library/LaunchAgents/chat.chips.hermes.plist");
    expect(
      bridgeServicePath("chat.chips.hermes", { platform: "linux", home: "/home/ada", env }),
    ).toBe("/home/ada/.config/systemd/user/chat.chips.hermes.service");
    expect(
      bridgeServicePath("chat.chips.hermes", {
        platform: "linux",
        home: "/home/ada",
        env: { XDG_CONFIG_HOME: "/cfg" },
      }),
    ).toBe("/cfg/systemd/user/chat.chips.hermes.service");
    expect(
      bridgeServicePath("chat.chips.hermes", { platform: "win32", home: "C:/", env }),
    ).toBeUndefined();
  });
});

describe("a journal read from a disk that holds anything", () => {
  const write = (value: unknown) => {
    mkdirSync(folder(), { recursive: true });
    writeFileSync(join(folder(), "updates.json"), JSON.stringify(value));
  };

  it("is an empty one when the file isn't a journal at all", () => {
    expect(readJournal(folder())).toEqual({ layout: 1 });
    write(["not", "a", "journal"]);
    expect(readJournal(folder())).toEqual({ layout: 1 });
    mkdirSync(folder(), { recursive: true });
    writeFileSync(join(folder(), "updates.json"), "{ cut off");
    expect(readJournal(folder())).toEqual({ layout: 1 });
  });

  it("keeps each field it can read and drops what it can't", () => {
    const updated = {
      outcome: "updated",
      from: "1.0.30",
      to: "1.0.31",
      at: "2026-11-13T10:00:00Z",
    };
    write({
      layout: 1,
      current: 7,
      previous: "1.0.30",
      startedOn: { "chat.chips.claude": "1.0.31", "chat.chips.codex": 3 },
      skips: "none",
      // No `to`: not something a restart could finish.
      trying: { label: "chat.chips.claude", harnessId: "har_1", from: "1.0.30", at: "x" },
      last: {
        "chat.chips.claude": { ...updated, reason: "no-return" },
        "chat.chips.codex": updated,
        "chat.chips.odd": { ...updated, outcome: "exploded" },
        "chat.chips.short": { outcome: "updated", from: "1.0.30" },
        "chat.chips.word": "updated",
      },
      staged: { "1.0.31": "sha512-new", "1.0.32": null },
      proving: {
        "chat.chips.claude": {
          harnessId: "har_1",
          from: "1.0.30",
          to: "1.0.31",
          since: "2026-11-13T10:00:00.000Z",
        },
        // No release to go back to, and a time that isn't one: not a first day anyone can watch.
        "chat.chips.codex": { harnessId: "har_2", to: "1.0.31", since: "2026-11-13T10:00:00.000Z" },
        "chat.chips.odd": { harnessId: "har_3", from: "1.0.30", to: "1.0.31", since: "lately" },
        "chat.chips.word": "proving",
      },
    });
    expect(readJournal(folder())).toEqual({
      layout: 1,
      previous: "1.0.30",
      startedOn: { "chat.chips.claude": "1.0.31" },
      last: {
        "chat.chips.claude": { ...updated, reason: "no-return" },
        "chat.chips.codex": updated,
      },
      staged: { "1.0.31": "sha512-new" },
      proving: {
        "chat.chips.claude": {
          harnessId: "har_1",
          from: "1.0.30",
          to: "1.0.31",
          since: "2026-11-13T10:00:00.000Z",
        },
      },
    });
    write({ trying: "claude", last: [], proving: { "chat.chips.claude": 1 } });
    expect(readJournal(folder())).toEqual({ layout: 1 });
  });
});

describe("a `package` folder from an older Chips, in whatever state it is", () => {
  it("is filed under 0.0.0 when it doesn't say its version, over one already there", () => {
    mkdirSync(join(folder(), "package"), { recursive: true });
    writeFileSync(join(folder(), "package", "package.json"), "{ cut off");
    writeFileSync(join(folder(), "package", "new.txt"), "new");
    mkdirSync(join(folder(), "package-0.0.0"), { recursive: true });
    writeFileSync(join(folder(), "package-0.0.0", "old.txt"), "old");
    adoptLayout(folder());
    expect(versionInUse(folder())).toBe("0.0.0");
    expect(readdirSync(join(folder(), "package-0.0.0")).sort()).toEqual([
      "new.txt",
      "package.json",
    ]);
    // A version that could climb out of the folder is no version.
    rmSync(join(folder(), "package"));
    mkdirSync(join(folder(), "package"));
    writeFileSync(join(folder(), "package", "package.json"), '{"version":"../../x"}');
    adoptLayout(folder());
    expect(versionInUse(folder())).toBe("0.0.0");
  });

  it("has nothing staged where there is no folder, and no version before the link", () => {
    expect(stagedHere(join(dir, "nowhere"))).toEqual([]);
    expect(versionInUse(join(dir, "nowhere"))).toBeUndefined();
  });
});

describe("pointing and unpacking, refused", () => {
  it("never points at something that isn't a version, or isn't unpacked", () => {
    unpacked("1.0.30");
    expect(() => pointTo(folder(), "../1.0.30")).toThrow("is not a version");
    expect(() => pointTo(folder(), "1.0.31")).toThrow("isn't unpacked here");
    expect(versionInUse(folder())).toBeUndefined();
  });

  it("never unpacks under a name that isn't a version, or a download with no package in it", () => {
    expect(() => unpack(folder(), tarball("1.0.31"), "../../x")).toThrow("is not a version");
    // A tarball of something else: nothing under `package/`.
    const other = mkdtempSync(join(dir, "other-"));
    mkdirSync(join(other, "something"));
    writeFileSync(join(other, "something", "x"), "x");
    execFileSync("tar", ["-czf", join(other, "out.tgz"), "-C", other, "something"]);
    const bytes = new Uint8Array(readFileSync(join(other, "out.tgz")));
    expect(() => unpack(folder(), bytes, "1.0.31")).toThrow("holds no package");
    expect(stagedHere(folder())).toEqual([]);
    // And what it was unpacked into is gone.
    expect(readdirSync(folder()).filter((each) => each.startsWith(".unpacking-"))).toEqual([]);
  });
});

describe("the lock, when the folder can't be written", () => {
  it("passes on what the system said, not that someone holds it", () => {
    mkdirSync(folder(), { recursive: true });
    chmodSync(folder(), 0o555);
    try {
      expect(() => takeLock(folder())).toThrow(/EACCES|EPERM/);
    } finally {
      chmodSync(folder(), 0o755);
    }
  });

  it("takes over a lock that names no process once its holder would have written, and its own", () => {
    mkdirSync(folder(), { recursive: true });
    // Made a moment ago with nothing in it yet: its holder is between making it and signing it.
    writeFileSync(join(folder(), "bridge.lock"), "");
    expect(() => takeLock(folder())).toThrow(LockHeld);
    takeLock(folder(), () => Date.now() + 5000)();
    writeFileSync(join(folder(), "bridge.lock"), "not a pid");
    takeLock(folder(), () => Date.now() + 5000)();
    writeFileSync(join(folder(), "bridge.lock"), String(process.pid));
    takeLock(folder())();
    expect(existsSync(join(folder(), "bridge.lock"))).toBe(false);
  });

  it("takes over a lock half an hour old, though a process has its holder's number", () => {
    mkdirSync(folder(), { recursive: true });
    // This test's parent is alive: a process that went, and whose number was given out again.
    writeFileSync(join(folder(), "bridge.lock"), String(process.ppid));
    expect(() => takeLock(folder(), () => Date.now() + LOCK_STALE_MS - 60_000)).toThrow(LockHeld);
    takeLock(folder(), () => Date.now() + LOCK_STALE_MS + 60_000)();
    expect(existsSync(join(folder(), "bridge.lock"))).toBe(false);
  });
});

describe("Node's range, written every way npm takes", () => {
  it("reads a space after the sign, and every clause of a compound range", () => {
    expect(nodeMeets(">= 22.19", "20.0.0")).toBe(false);
    expect(nodeMeets(">= 22.19", "22.30.0")).toBe(true);
    expect(nodeMeets(">=22.19 <25", "20.0.0")).toBe(false);
    expect(nodeMeets(">=22.19 <25", "22.30.0")).toBe(true);
    expect(nodeMeets(">=22.19 <25", "25.0.0")).toBe(false);
    expect(nodeMeets("~22.19.0", "20.0.0")).toBe(false);
    expect(nodeMeets("~22.19.0", "22.30.0")).toBe(false);
    expect(nodeMeets("~22.19.0", "22.19.4")).toBe(true);
  });

  it("reads >, <=, = and an x, and any one alternative of several", () => {
    expect(nodeMeets(">22", "22.0.0")).toBe(false);
    expect(nodeMeets(">22", "22.0.1")).toBe(true);
    expect(nodeMeets("<=22.11.0", "22.11.0")).toBe(true);
    expect(nodeMeets("<=22.11.0", "22.11.1")).toBe(false);
    expect(nodeMeets("=22.11.0", "22.11.0")).toBe(true);
    expect(nodeMeets("=22.11.0", "22.11.1")).toBe(false);
    expect(nodeMeets("22.x", "22.4.0")).toBe(true);
    expect(nodeMeets("22.x", "23.0.0")).toBe(false);
    expect(nodeMeets("^20 || ^22", "22.4.0")).toBe(true);
    expect(nodeMeets("^20 || ^22", "21.0.0")).toBe(false);
    // One alternative it can't read doesn't open the door the other closed.
    expect(nodeMeets("lts/* || >=24", "22.4.0")).toBe(false);
    expect(nodeMeets("lts/*", "22.4.0")).toBe(true);
    expect(nodeMeets("", "22.4.0")).toBe(true);
  });
});

describe("Node's range, at its edges", () => {
  it("compares the minor and the patch, and lets a Node it can't read pass", () => {
    expect(nodeMeets(">=22.12", "22.11.0")).toBe(false);
    expect(nodeMeets(">=22.11", "22.12.0")).toBe(true);
    expect(nodeMeets(">=22.11.1", "22.11.0")).toBe(false);
    expect(nodeMeets(">=22.11.0", "v22.11.0")).toBe(true);
    expect(nodeMeets("^22.11.0", "22.11.0")).toBe(true);
    expect(nodeMeets("^22.11.0", "23.0.0")).toBe(false);
    expect(nodeMeets("~22.11", "22.10.9")).toBe(false);
    expect(nodeMeets(">=24", "somewhere-odd")).toBe(true);
  });
});

describe("staging, refused before anything is fetched", () => {
  const never = (async () => {
    throw new Error("nothing is fetched");
  }) as unknown as typeof fetch;
  const stage = (version: string, fetching: typeof fetch = never, integrity = "sha512-x") =>
    stageRelease({
      registry: "https://registry.test",
      name: NAME,
      version,
      integrity,
      bridges: bridges(),
      nodeVersion: "22.11.0",
      fetch: fetching,
    });

  it("refuses what isn't a version, and a bridge that isn't connected here", async () => {
    await expect(stage("../1.0.31")).rejects.toMatchObject({ reason: "unlisted" });
    await expect(stage("1.0.31")).rejects.toMatchObject({ reason: "unlisted" });
  });

  it("refuses a folder it can't write", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    chmodSync(folder(), 0o555);
    try {
      await expect(stage("1.0.31")).rejects.toMatchObject({ reason: "permission" });
    } finally {
      chmodSync(folder(), 0o755);
    }
  });

  it("fetches nothing for a release unpacked here from the signed checksum", async () => {
    unpacked("1.0.30");
    unpacked("1.0.31");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    writeJournal(folder(), { ...readJournal(folder()), staged: { "1.0.31": "sha512-x" } });
    await stage("1.0.31");
    expect(versionInUse(folder())).toBe("1.0.30");
    // The one in use, which `bridge.json` vouches for with the checksum it was fetched by.
    await stage("1.0.30", never, "sha512-x");
  });

  it("fetches and checks again a folder some other fetch left, or one checked against another checksum", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    // Unpacked by hand, with nothing in the journal to say what it was checked against.
    unpacked("1.0.31");
    const next = tarball("1.0.31", "// the signed one\n");
    const registry = standIn({ [NAME]: { "1.0.31": { bytes: next } } });
    await stage("1.0.31", registry.fetch, sriOf(next));
    expect(registry.asked).toHaveLength(2);
    expect(readFileSync(join(folder(), "package-1.0.31", "dist", "main.js"), "utf8")).toBe(
      "// the signed one\n",
    );
    expect(readJournal(folder()).staged).toEqual({ "1.0.31": sriOf(next) });
    // Asked again with the same signed checksum, nothing is fetched; with another, it is refused.
    await stage("1.0.31", never, sriOf(next));
    await expect(stage("1.0.31", registry.fetch, "sha512-other")).rejects.toMatchObject({
      reason: "checksum",
    });
  });

  it("says the registry couldn't be had when it is down, answers badly, or has no tarball", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    await expect(stage("1.0.31")).rejects.toMatchObject({
      reason: "registry",
      message: expect.stringContaining("Couldn't reach"),
    });
    const down = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(stage("1.0.31", down)).rejects.toMatchObject({
      reason: "registry",
      message: expect.stringContaining("answered 503"),
    });
    // Listed with the signed checksum, but its tarball isn't there to download.
    const next = tarball("1.0.31");
    const listedOnly = (async (input: string | URL) =>
      String(input).endsWith(".tgz")
        ? new Response("gone", { status: 404 })
        : Response.json({
            versions: {
              "1.0.31": {
                version: "1.0.31",
                dist: {
                  tarball: "https://registry.test/@chipschat/fake/-/1.0.31.tgz",
                  integrity: sriOf(next),
                },
              },
            },
          })) as unknown as typeof fetch;
    await expect(stage("1.0.31", listedOnly, sriOf(next))).rejects.toMatchObject({
      reason: "registry",
    });
    // npm lists it with no checksum at all: not the release Chips signed.
    const bare = (async () =>
      Response.json({ versions: { "1.0.31": { version: "1.0.31" } } })) as unknown as typeof fetch;
    await expect(stage("1.0.31", bare, sriOf(next))).rejects.toMatchObject({ reason: "checksum" });
    expect(stagedHere(folder())).toEqual(["1.0.30"]);
    expect(existsSync(join(folder(), "bridge.lock"))).toBe(false);
  });

  it("asks the disk itself how much is free when nobody says", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    const next = tarball("1.0.31");
    await stage("1.0.31", standIn({ [NAME]: { "1.0.31": { bytes: next } } }).fetch, sriOf(next));
    expect(stagedHere(folder()).sort()).toEqual(["1.0.30", "1.0.31"]);
  });
});

describe("switching one service, at its edges", () => {
  const restart = async () => true;

  it("is refused as busy while someone else holds the bridge, and nothing moves", async () => {
    unpacked("1.0.30");
    unpacked("1.0.31");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    writeFileSync(join(folder(), "bridge.lock"), String(process.ppid));
    const refused = switchService({
      bridges: bridges(),
      name: NAME,
      label: "chat.chips.claude",
      version: "1.0.31",
      trying: null,
      restart,
    });
    await expect(refused).rejects.toBeInstanceOf(BridgeRefusal);
    await expect(refused).rejects.toMatchObject({ reason: "busy" });
    expect(versionInUse(folder())).toBe("1.0.30");
  });

  it("passes on any other failure as it is, and lets the lock go", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    await expect(
      switchService({
        bridges: bridges(),
        name: NAME,
        label: "chat.chips.claude",
        version: "1.0.31",
        trying: null,
        restart,
      }),
    ).rejects.toThrow("isn't unpacked here");
    expect(existsSync(join(folder(), "bridge.lock"))).toBe(false);
    expect(versionInUse(folder())).toBe("1.0.30");
  });

  it("writes no checksum it doesn't know: a record with none, a release staged by hand", async () => {
    unpacked("1.0.30");
    unpacked("1.0.31");
    pointTo(folder(), "1.0.30");
    writeRecord(folder(), { package: NAME, version: "1.0.30", integrity: "", kept });
    await switchService({
      bridges: bridges(),
      name: NAME,
      label: "chat.chips.claude",
      version: "1.0.31",
      trying: null,
      restart,
    });
    expect(readRecord(folder())).toMatchObject({ version: "1.0.31", integrity: "" });
    expect(readJournal(folder()).staged).toBeUndefined();
  });

  it("starts a service with no record beside it, and one already on the release", async () => {
    unpacked("1.0.31");
    expect(
      await switchService({
        bridges: bridges(),
        name: NAME,
        label: "chat.chips.claude",
        version: "1.0.31",
        trying: null,
        restart: async () => false,
      }),
    ).toBe(false);
    expect(versionInUse(folder())).toBe("1.0.31");
    expect(readJournal(folder()).startedOn).toEqual({ "chat.chips.claude": "1.0.31" });
    expect(readRecord(folder())).toBeUndefined();
  });
});

describe("what a switch being watched needs kept", () => {
  it("keeps the release to put back until the watch is over, whatever else was pruned", async () => {
    for (const each of ["1.0.30", "1.0.31", "1.0.32"]) unpacked(each);
    pointTo(folder(), "1.0.31");
    recorded("1.0.31");
    pointTo(folder(), "1.0.32");
    // Claude Code is on 1.0.32 already; Codex, still on 1.0.30, is switched now.
    writeJournal(folder(), {
      ...readJournal(folder()),
      startedOn: { "chat.chips.claude": "1.0.32", "chat.chips.codex": "1.0.30" },
    });
    const trying = {
      label: "chat.chips.codex",
      harnessId: "har_2",
      from: "1.0.30",
      to: "1.0.32",
      at: "2026-11-13T10:00:00.000Z",
    };
    const switchTo = (version: string, tried: typeof trying | null) =>
      switchService({
        bridges: bridges(),
        name: NAME,
        label: "chat.chips.codex",
        version,
        trying: tried,
        restart: async () => true,
      });
    await switchTo("1.0.32", trying);
    expect(stagedHere(folder())).toContain("1.0.30");
    // It didn't come back: the release it left is there to go back to.
    await switchTo("1.0.30", null);
    expect(versionInUse(folder())).toBe("1.0.30");
    // Once nothing is being tried and nothing runs it, a release goes.
    await noteJournal(bridges(), NAME, { trying: null });
    prune(folder());
    expect(stagedHere(folder()).sort()).toEqual(["1.0.30", "1.0.32"]);
  });

  it("leaves nothing in the journal to finish when the switch was refused before it began", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    const trying = {
      label: "chat.chips.claude",
      harnessId: "har_1",
      from: "1.0.30",
      to: "1.0.31",
      at: "2026-11-13T10:00:00.000Z",
    };
    const refused = (version: string) =>
      switchService({
        bridges: bridges(),
        name: NAME,
        label: "chat.chips.claude",
        version,
        trying,
        restart: async () => true,
      });
    await expect(refused("1.0.31")).rejects.toThrow("isn't unpacked here");
    await expect(refused("../1.0.31")).rejects.toThrow("is not a version");
    expect(readJournal(folder()).trying).toBeUndefined();
  });
});

describe("the link moved by hand, with another service still running", () => {
  it("writes down the release every kept service was on before it moved", () => {
    unpacked("1.0.30");
    unpacked("1.0.31");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    // `chips connect codex` fetched 1.0.31 and moved the link; Claude Code's service runs on.
    pointTo(folder(), "1.0.31");
    expect(readJournal(folder()).startedOn).toEqual({
      "chat.chips.claude": "1.0.30",
      "chat.chips.codex": "1.0.30",
    });
    startedOnNow(folder(), ["chat.chips.codex"]);
    expect(readJournal(folder()).startedOn).toEqual({
      "chat.chips.claude": "1.0.30",
      "chat.chips.codex": "1.0.31",
    });
    // So the files Claude Code still runs are kept.
    prune(folder());
    expect(stagedHere(folder()).sort()).toEqual(["1.0.30", "1.0.31"]);
  });
});

describe("what the journal is told, a piece at a time", () => {
  const trying = {
    label: "chat.chips.claude",
    harnessId: "har_1",
    from: "1.0.30",
    to: "1.0.31",
    at: "2026-11-13T10:00:00.000Z",
  };

  it("sets `trying`, leaves it when nothing is said of it, and clears it when told", async () => {
    await noteJournal(bridges(), NAME, { trying });
    expect(readJournal(folder()).trying).toEqual(trying);
    await noteJournal(bridges(), NAME, {
      skip: { version: "1.0.31", until: "2026-11-20T10:00:00.000Z" },
    });
    expect(readJournal(folder())).toMatchObject({
      trying,
      skips: { "1.0.31": "2026-11-20T10:00:00.000Z" },
    });
    await noteJournal(bridges(), NAME, { trying: null });
    const journal = readJournal(folder());
    expect(journal.trying).toBeUndefined();
    expect(journal.skips).toEqual({ "1.0.31": "2026-11-20T10:00:00.000Z" });
    expect(journal.last).toBeUndefined();
  });

  it("is refused while someone else holds the bridge", async () => {
    mkdirSync(folder(), { recursive: true });
    writeFileSync(join(folder(), "bridge.lock"), String(process.ppid));
    await expect(noteJournal(bridges(), NAME, { trying: null })).rejects.toBeInstanceOf(LockHeld);
  });

  const firstDay = (label: string, from: string, to: string) => ({
    label,
    said: { harnessId: "har_1", from, to, since: "2026-11-13T10:00:00.000Z" },
  });

  it("begins a service's first day on a release, beside another's, and ends each on its own", async () => {
    await noteJournal(bridges(), NAME, {
      proving: firstDay("chat.chips.claude", "1.0.30", "1.0.31"),
    });
    await noteJournal(bridges(), NAME, {
      proving: firstDay("chat.chips.codex", "1.0.30", "1.0.31"),
    });
    // Something else said: both stay.
    await noteJournal(bridges(), NAME, { trying });
    expect(Object.keys(readJournal(folder()).proving ?? {}).sort()).toEqual([
      "chat.chips.claude",
      "chat.chips.codex",
    ]);
    // A later release for one of them takes its first day over.
    await noteJournal(bridges(), NAME, {
      proving: firstDay("chat.chips.claude", "1.0.31", "1.0.32"),
    });
    expect(readJournal(folder()).proving?.["chat.chips.claude"]).toMatchObject({
      from: "1.0.31",
      to: "1.0.32",
    });
    await noteJournal(bridges(), NAME, { proving: { label: "chat.chips.claude", said: null } });
    expect(Object.keys(readJournal(folder()).proving ?? {})).toEqual(["chat.chips.codex"]);
    await noteJournal(bridges(), NAME, { proving: { label: "chat.chips.codex", said: null } });
    expect(readJournal(folder()).proving).toBeUndefined();
    // Ended twice is ended.
    await noteJournal(bridges(), NAME, { proving: { label: "chat.chips.codex", said: null } });
    expect(readJournal(folder()).proving).toBeUndefined();
    expect(readJournal(folder()).trying).toEqual(trying);
  });
});

describe("a service no longer kept", () => {
  it("takes its first day off the journal with it, and leaves another's", async () => {
    const day = (label: string) => ({
      label,
      said: { harnessId: "har_1", from: "1.0.30", to: "1.0.31", since: "2026-11-13T10:00:00.000Z" },
    });
    await noteJournal(bridges(), NAME, { proving: day("chat.chips.claude") });
    await noteJournal(bridges(), NAME, { proving: day("chat.chips.codex") });
    forgetService(folder(), "chat.chips.claude");
    expect(Object.keys(readJournal(folder()).proving ?? {})).toEqual(["chat.chips.codex"]);
    forgetService(folder(), "chat.chips.codex");
    expect(readJournal(folder()).proving).toBeUndefined();
  });
});

describe("what a first day on a release needs kept", () => {
  it("keeps the release to go back to until the day is over, and lets it go after", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    // Claude Code's service goes to 1.0.31, then 1.0.32: the link's "one before" is 1.0.31 now.
    for (const version of ["1.0.31", "1.0.32"]) {
      unpacked(version);
      await switchService({
        bridges: bridges(),
        name: NAME,
        label: "chat.chips.claude",
        version,
        trying: null,
        restart: async () => true,
      });
    }
    // Codex's too, so that nothing but a first day still names 1.0.30.
    await switchService({
      bridges: bridges(),
      name: NAME,
      label: "chat.chips.codex",
      version: "1.0.32",
      trying: null,
      restart: async () => true,
    });
    unpacked("1.0.30");
    await noteJournal(bridges(), NAME, {
      proving: {
        label: "chat.chips.codex",
        said: {
          harnessId: "har_2",
          from: "1.0.30",
          to: "1.0.32",
          since: "2026-11-13T10:00:00.000Z",
        },
      },
    });
    prune(folder());
    expect(stagedHere(folder())).toContain("1.0.30");
    await noteJournal(bridges(), NAME, { proving: { label: "chat.chips.codex", said: null } });
    prune(folder());
    expect(stagedHere(folder())).not.toContain("1.0.30");
    expect(stagedHere(folder())).toContain("1.0.32");
  });
});

describe("a service started by hand, with nothing to write", () => {
  it("writes nothing before the link is there, or for no services", () => {
    mkdirSync(folder(), { recursive: true });
    startedOnNow(folder(), ["chat.chips.claude"]);
    expect(existsSync(join(folder(), "updates.json"))).toBe(false);
    unpacked("1.0.31");
    pointTo(folder(), "1.0.31");
    const before = readFileSync(join(folder(), "updates.json"), "utf8");
    startedOnNow(folder(), []);
    expect(readFileSync(join(folder(), "updates.json"), "utf8")).toBe(before);
  });
});

describe("the hands the server gets, doing each thing", () => {
  const cards = async () => [
    { id: "claude", kind: "one-line", name: "Claude Code", package: `${NAME}@1` } as never,
  ];

  it("stage, switch and note through to the files, and ask who a service is once an hour", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    const next = tarball("1.0.31");
    const asked: string[] = [];
    const restarted: string[] = [];
    const hands = bridgeHands({
      cards,
      bridges: bridges(),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: {},
      restart: async (label) => {
        restarted.push(label);
        return true;
      },
      fetch: standIn({ [NAME]: { "1.0.31": { bytes: next } } }).fetch,
      harnessOf: (name, label) => {
        asked.push(`${name} ${label}`);
        return "har_claude";
      },
    });
    await hands.stage(NAME, "1.0.31", sriOf(next));
    expect([...((await hands.list())[0]?.staged ?? [])].sort()).toEqual(["1.0.30", "1.0.31"]);
    const trying = {
      label: "chat.chips.claude",
      harnessId: "har_claude",
      from: "1.0.30",
      to: "1.0.31",
      at: "2026-11-13T10:00:00.000Z",
    };
    expect(await hands.switchTo(NAME, "chat.chips.claude", "1.0.31", trying)).toBe(true);
    expect(restarted).toEqual(["chat.chips.claude"]);
    let listed = (await hands.list())[0];
    expect(listed).toMatchObject({ inUse: "1.0.31", previous: "1.0.30", trying });
    expect(listed?.kept[0]).toMatchObject({ harnessId: "har_claude", startedOn: "1.0.31" });
    const said = { outcome: "updated", from: "1.0.30", to: "1.0.31", at: trying.at } as const;
    await hands.note(NAME, { trying: null, outcome: { label: "chat.chips.claude", said } });
    listed = (await hands.list())[0];
    expect(listed?.trying).toBeUndefined();
    expect(listed?.last).toEqual({ "chat.chips.claude": said });
    // Three listings, and the key store was asked once: it is a process each time on a Mac.
    expect(asked).toEqual(["Claude Code chat.chips.claude"]);
  });

  it("say how many times a service was started, as whoever counts says, and none when nobody does", async () => {
    const counted: string[] = [];
    const base = {
      cards,
      bridges: bridges(),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: {},
      restart: async () => true,
      harnessOf: () => "har_claude",
    };
    const hands = bridgeHands({
      ...base,
      starts: async (label) => {
        counted.push(label);
        return 7;
      },
    });
    expect(await hands.starts("chat.chips.claude")).toBe(7);
    expect(counted).toEqual(["chat.chips.claude"]);
    expect(await bridgeHands(base).starts("chat.chips.claude")).toBeUndefined();
  });

  it("ask the harness behind a service what it runs, by its card's own command, in the service's environment", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    const ran: { program: string; path: string | undefined; url: string | undefined }[] = [];
    const base = {
      bridges: bridges(),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: { PATH: "/usr/bin", CHIPS_URL: "http://the-servers" },
      restart: async () => true,
      harnessOf: () => "har_claude",
    };
    const versionOf = async (
      program: string,
      env: Readonly<Record<string, string | undefined>>,
    ) => {
      ran.push({ program, path: env["PATH"], url: env["CHIPS_URL"] });
      return "2.1.0";
    };
    const hands = bridgeHands({
      ...base,
      cards: async () => [
        { id: "claude", name: "Claude Code", package: `${NAME}@1`, program: "claude" } as never,
        { id: "codex", name: "Codex", package: `${NAME}@1` } as never,
      ],
      versionOf,
    });
    expect(await hands.harnessVersion(NAME, "chat.chips.claude")).toBe("2.1.0");
    // No service file here, so the environment is the server's own.
    expect(ran).toEqual([{ program: "claude", path: "/usr/bin", url: "http://the-servers" }]);
    // A card that names no command of its own, a service nobody keeps, a bridge that isn't here.
    expect(await hands.harnessVersion(NAME, "chat.chips.codex")).toBeUndefined();
    expect(await hands.harnessVersion(NAME, "chat.chips.nobody")).toBeUndefined();
    expect(await hands.harnessVersion("@chipschat/elsewhere", "chat.chips.claude")).toBe(undefined);
    expect(ran).toHaveLength(1);
    // Nothing to ask with (a test's hands): it can't be told.
    const none = bridgeHands({ ...base, cards: async () => [] });
    expect(await none.harnessVersion(NAME, "chat.chips.claude")).toBeUndefined();
  });

  it("list a service whose key can't be read as nobody's, and a bridge no card names with no major", async () => {
    unpacked("1.0.30");
    pointTo(folder(), "1.0.30");
    recorded("1.0.30");
    const broken = bridgeHands({
      cards,
      bridges: bridges(),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: {},
      restart: async () => true,
      harnessOf: () => {
        throw new Error("the Keychain is locked");
      },
    });
    expect((await broken.list())[0]?.kept.map((each) => each.harnessId)).toEqual([
      undefined,
      undefined,
    ]);
    const unnamed = bridgeHands({
      cards: async () => [],
      bridges: bridges(),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: {},
      restart: async () => true,
      harnessOf: () => "har_x",
    });
    expect((await unnamed.list())[0]).toMatchObject({ major: undefined });
    const nowhere = bridgeHands({
      cards,
      bridges: join(dir, "none"),
      registry: "https://registry.test",
      nodeVersion: "22.11.0",
      env: {},
      restart: async () => true,
    });
    expect(await nowhere.list()).toEqual([]);
  });
});
