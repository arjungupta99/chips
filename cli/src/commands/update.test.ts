/**
 * `chips update` (everything in step, phase 6): the install line this release carries, run with
 * the bridges left to the computer, then the new release's `chips up`, with what happened written
 * for the next server to say.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  inMacApp,
  notStartedAgain,
  outcomeHere,
  prefixOf,
  type Ran,
  RESTART_FOR_MS,
  readUpdate,
  restartOntoHere,
  runPassing,
  STOPPED_HALFWAY,
  selfUpdateHere,
  UPDATE_FILE,
  UPDATING_FOR_MS,
  unitArgs,
  updateComputer,
  versionIn,
} from "./update.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-update-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const quiet = { out: () => undefined, err: () => undefined, confirm: async () => false };

/** An install from the install line: `<prefix>/lib/chips/<version>`, with `current` at it. */
function installed(version: string, withScript = true) {
  const prefix = join(dir, "local");
  const root = join(prefix, "lib", "chips", version);
  mkdirSync(join(root, "bin"), { recursive: true });
  if (withScript) writeFileSync(join(root, "install.sh"), "#!/bin/sh\n");
  rmSync(join(prefix, "lib", "chips", "current"), { force: true });
  symlinkSync(version, join(prefix, "lib", "chips", "current"));
  return { prefix, root, release: { version, root } };
}

describe("where a release is", () => {
  it("is under a prefix from the install line, or inside Chips for Mac", () => {
    expect(prefixOf("/home/ada/.local/lib/chips/1.2.5")).toBe("/home/ada/.local");
    expect(prefixOf("/opt/chips/1.2.5")).toBeUndefined();
    expect(inMacApp("/Applications/Chips.app/Contents/Resources/chips")).toBe(true);
    expect(inMacApp("/home/ada/.local/lib/chips/1.2.5")).toBe(false);
  });
});

describe("chips update", () => {
  it("runs its own install line without the bridges, then the new release's chips up", async () => {
    const { prefix, root, release } = installed("1.2.5");
    const ran: string[] = [];
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: { HOME: "/home/ada" },
      now: () => "2026-11-20T02:30:00.000Z",
      run: async (command, args, env): Promise<Ran> => {
        ran.push([command, ...args].join(" "));
        if (args[0] === join(root, "install.sh")) {
          expect(env["CHIPS_PREFIX"]).toBe(prefix);
          expect(readUpdate(dir)?.state).toBe("updating");
          installed("1.2.6");
        } else {
          // The server is stopped by this: what happened is written already.
          expect(readUpdate(dir)).toMatchObject({ state: "updated", from: "1.2.5", to: "1.2.6" });
        }
        return { code: 0, last: "" };
      },
    });
    expect(code).toBe(0);
    expect(ran).toEqual([
      `/bin/sh ${join(root, "install.sh")} --no-path --no-bridges --if-newer`,
      `${join(prefix, "lib", "chips", "current", "bin", "chips")} up --no-open --json`,
    ]);
  });

  it("says it is the newest when the install line found nothing newer, and starts nothing", async () => {
    const { release } = installed("1.2.5");
    const ran: string[] = [];
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: {},
      run: async (command) => {
        ran.push(command);
        return { code: 0, last: "" };
      },
    });
    expect(code).toBe(0);
    expect(ran).toEqual(["/bin/sh"]);
    expect(readUpdate(dir)?.state).toBe("current");
  });

  it("says it is the newest when the install line left no release to point at", async () => {
    // The install line ended well and `current` can't be read: nothing is known to have changed.
    const { prefix, release } = installed("1.2.5");
    const ran: string[] = [];
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: {},
      run: async (command) => {
        ran.push(command);
        rmSync(join(prefix, "lib", "chips", "current"), { force: true });
        return { code: 0, last: "" };
      },
    });
    expect(code).toBe(0);
    expect(ran).toEqual(["/bin/sh"]);
    expect(readUpdate(dir)).toMatchObject({ state: "current", from: "1.2.5" });
  });

  it("says the new release didn't start again when chips up fails without a word", async () => {
    const { root, release } = installed("1.2.5");
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: {},
      run: async (_command, args) => {
        if (args[0] === join(root, "install.sh")) {
          installed("1.2.6");
          return { code: 0, last: "" };
        }
        return { code: 7, last: "" };
      },
    });
    expect(code).toBe(7);
    expect(readUpdate(dir)).toMatchObject({
      state: "failed",
      from: "1.2.5",
      to: "1.2.6",
      why: notStartedAgain("1.2.6"),
    });
  });

  it("reads nothing from a file that doesn't say what happened", () => {
    const held = (what: unknown) => {
      writeFileSync(join(dir, UPDATE_FILE), typeof what === "string" ? what : JSON.stringify(what));
      return readUpdate(dir);
    };
    expect(held("{ half")).toBeUndefined();
    expect(held({ state: "updated", from: "1.2.5" })).toBeUndefined();
    expect(held({ state: "updated", at: "2026-11-20T02:30:00.000Z" })).toBeUndefined();
    expect(held({ state: "soon", from: "1.2.5", at: "2026-11-20T02:30:00.000Z" })).toBeUndefined();
    // What it holds beside those is kept only when it is words.
    expect(
      held({ state: "failed", from: "1.2.5", at: "2026-11-20T02:30:00.000Z", to: 126, why: [] }),
    ).toEqual({ state: "failed", from: "1.2.5", at: "2026-11-20T02:30:00.000Z" });
    rmSync(join(dir, UPDATE_FILE));
    expect(readUpdate(dir)).toBeUndefined();
  });

  it("keeps why the install line failed, and leaves the server as it is", async () => {
    const { release } = installed("1.2.5");
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: {},
      run: async () => ({ code: 1, last: "Could not download the release's signature." }),
    });
    expect(code).toBe(1);
    expect(readUpdate(dir)).toMatchObject({
      state: "failed",
      from: "1.2.5",
      why: "Could not download the release's signature.",
    });
  });

  it("can't update a release that carries no install line, Chips for Mac's, or a checkout", async () => {
    const run = async (): Promise<Ran> => {
      throw new Error("nothing runs");
    };
    const old = installed("1.2.4", false);
    expect(
      await updateComputer({ release: old.release, dataDir: dir, console: quiet, env: {}, run }),
    ).toBe(1);
    expect(readUpdate(dir)?.state).toBe("failed");
    const mac = { version: "1.2.5", root: "/Applications/Chips.app/Contents/Resources/chips" };
    expect(await updateComputer({ release: mac, dataDir: dir, console: quiet, env: {}, run })).toBe(
      1,
    );
    expect(
      await updateComputer({ release: undefined, dataDir: dir, console: quiet, env: {}, run }),
    ).toBe(1);
  });
});

/** A script a test runs for real, in place of the install line or a release's `chips`. */
function script(path: string, lines: readonly string[]) {
  writeFileSync(path, ["#!/bin/sh", ...lines, ""].join("\n"));
  chmodSync(path, 0o755);
}

/** Waits for a file another process writes. */
async function written(path: string): Promise<string> {
  for (let tries = 0; tries < 200; tries += 1) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`${path} was never written`);
}

describe("chips update, with the install line and chips up run for real", () => {
  it("goes from one release to the next, and says each line the two said", async () => {
    const { prefix, root, release } = installed("1.2.5");
    const next = join(prefix, "lib", "chips", "1.2.6");
    // The install line: it unpacks the next release beside this one and moves `current`.
    script(join(root, "install.sh"), [
      'echo "args: $*"',
      'echo "prefix: $CHIPS_PREFIX"',
      `mkdir -p "${next}/bin"`,
      `printf '#!/bin/sh\\necho "up: $*"\\necho started > "${join(dir, "up.ran")}"\\n' > "${next}/bin/chips"`,
      `chmod +x "${next}/bin/chips"`,
      `ln -sfn 1.2.6 "${join(prefix, "lib", "chips", "current")}"`,
      'echo "installed chips 1.2.6" >&2',
    ]);
    const said: string[] = [];
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: { ...quiet, out: (line: string) => said.push(line) },
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(code).toBe(0);
    expect(said).toEqual([
      "args: --no-path --no-bridges --if-newer",
      `prefix: ${prefix}`,
      "installed chips 1.2.6",
      "up: up --no-open --json",
    ]);
    expect(readFileSync(join(dir, "up.ran"), "utf8")).toBe("started\n");
    expect(readUpdate(dir)).toMatchObject({ state: "updated", from: "1.2.5", to: "1.2.6" });
  });

  it("keeps the install line's last words when it fails, and never runs chips up", async () => {
    const { root, release } = installed("1.2.5");
    script(join(root, "install.sh"), [
      'echo "Downloading chips"',
      'echo "The download isn\'t signed by Chips." >&2',
      "exit 3",
    ]);
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(code).toBe(3);
    expect(readUpdate(dir)).toMatchObject({
      state: "failed",
      from: "1.2.5",
      why: "The download isn't signed by Chips.",
    });
  });

  it("says so when the new release's chips up fails: installed, and not started again", async () => {
    const { prefix, root, release } = installed("1.2.5");
    const next = join(prefix, "lib", "chips", "1.2.6");
    script(join(root, "install.sh"), [
      `mkdir -p "${next}/bin"`,
      `printf '#!/bin/sh\\necho "The port is taken." >&2\\nexit 1\\n' > "${next}/bin/chips"`,
      `chmod +x "${next}/bin/chips"`,
      `ln -sfn 1.2.6 "${join(prefix, "lib", "chips", "current")}"`,
    ]);
    const code = await updateComputer({
      release,
      dataDir: dir,
      console: quiet,
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(code).toBe(1);
    expect(readUpdate(dir)).toMatchObject({
      state: "failed",
      from: "1.2.5",
      to: "1.2.6",
      why: "The port is taken.",
    });
  });

  it("makes the data folder for what it writes, on a computer that never served", async () => {
    const { release } = installed("1.2.5");
    const fresh = join(dir, "never", "served");
    const code = await updateComputer({
      release,
      dataDir: fresh,
      console: quiet,
      env: {},
      run: async () => ({ code: 0, last: "" }),
    });
    expect(code).toBe(0);
    expect(readUpdate(fresh)?.state).toBe("current");
  });

  it("says a command that isn't there failed, with why", async () => {
    const ran = await runPassing(join(dir, "no-such-command"), [], {}, () => undefined);
    expect(ran.code).toBe(1);
    expect(ran.last).toContain("ENOENT");
  });
});

describe("what the last update says, for the release running now", () => {
  const at = "2026-11-20T02:10:00.000Z";
  const now = Date.parse(at);

  it("is what chips update wrote, while it is about this release", () => {
    const failed = { state: "failed", from: "1.2.5", at, why: "No network." } as const;
    expect(outcomeHere(failed, "1.2.5", now)).toEqual(failed);
    const updated = { state: "updated", from: "1.2.5", to: "1.2.6", at } as const;
    expect(outcomeHere(updated, "1.2.6", now)).toEqual(updated);
    expect(outcomeHere(undefined, "1.2.5", now)).toBeUndefined();
  });

  it("is nothing for a failure on a release this computer has since left", () => {
    const failed = { state: "failed", from: "1.2.5", at, why: "No network." } as const;
    expect(outcomeHere(failed, "1.2.6", now)).toBeUndefined();
    expect(outcomeHere({ state: "updating", from: "1.2.5", at }, "1.2.6", now)).toBeUndefined();
  });

  it("is a failure when the new release is installed and this computer never started again on it", () => {
    const updated = { state: "updated", from: "1.2.5", to: "1.2.6", at } as const;
    // For the minutes the old server lives on while `chips up` starts the new one, it is as written.
    expect(outcomeHere(updated, "1.2.5", now + RESTART_FOR_MS - 1)).toEqual(updated);
    expect(outcomeHere(updated, "1.2.5", now + RESTART_FOR_MS)).toEqual({
      state: "failed",
      from: "1.2.5",
      to: "1.2.6",
      at,
      why: notStartedAgain("1.2.6"),
    });
    // Running the release it went to, it is true for good.
    expect(outcomeHere(updated, "1.2.6", now + 30 * 24 * 60 * 60_000)).toEqual(updated);
    // And about nothing once this computer runs neither.
    expect(outcomeHere(updated, "1.2.7", now)).toBeUndefined();
    const current = { state: "current", from: "1.2.5", at } as const;
    expect(outcomeHere(current, "1.2.6", now)).toEqual(current);
  });

  it("is a failure once an update has said it is going for an hour", () => {
    const going = { state: "updating", from: "1.2.5", at } as const;
    expect(outcomeHere(going, "1.2.5", now + UPDATING_FOR_MS - 1)).toEqual(going);
    expect(outcomeHere(going, "1.2.5", now + UPDATING_FOR_MS)).toEqual({
      state: "failed",
      from: "1.2.5",
      at,
      why: STOPPED_HALFWAY,
    });
  });
});

describe("the hands a server from the install line gets on its own update", () => {
  const hands = (release: { version: string; root: string }, platform = "darwin") =>
    selfUpdateHere({
      release,
      dataDir: dir,
      logFile: join(dir, "serve.log"),
      platform,
      env: { PATH: "/usr/bin:/bin", MARK: join(dir, "started") },
      hasSystemdRun: () => false,
    });

  it("are none inside Chips for Mac, or outside a prefix", () => {
    const mac = { version: "1.2.5", root: "/Applications/Chips.app/Contents/Resources/chips" };
    expect(hands(mac)).toBeUndefined();
    expect(hands({ version: "1.2.5", root: "/opt/chips/1.2.5" })).toBeUndefined();
  });

  it("start this release's chips update apart from the server, its lines in the server's log", async () => {
    const { root, release } = installed("1.2.5");
    script(join(root, "bin", "chips"), ['echo "chips $*"', 'echo "$*" > "$MARK"']);
    hands(release)?.start();
    expect(await written(join(dir, "started"))).toBe("update\n");
    expect(await written(join(dir, "serve.log"))).toContain("chips update");
  });

  it("start it in a unit of its own on Linux, handed the server's own settings by name", () => {
    expect(
      unitArgs(
        "/home/ada/.local/lib/chips/1.2.5/bin/chips",
        "/srv/chips",
        {
          CHIPS_PORT: "4500",
          CHIPS_DATA_DIR: "/somewhere/else",
          CHIPS_ODD: "two\nlines",
          CHIPS_UNSET: undefined,
          HOME: "/home/ada",
        },
        "chips-update-1",
      ),
    ).toEqual([
      "--user",
      "--collect",
      "--quiet",
      "--unit=chips-update-1",
      "--setenv=CHIPS_PORT=4500",
      "--setenv=CHIPS_DATA_DIR=/srv/chips",
      "/home/ada/.local/lib/chips/1.2.5/bin/chips",
      "update",
    ]);
    expect(unitArgs("chips", "/srv/chips", {})[3]).toMatch(/^--unit=chips-update-\d+$/);
  });

  it("run systemd-run where a Linux has it, and live through one that isn't on the PATH", async () => {
    const { root, release } = installed("1.2.5");
    script(join(root, "bin", "chips"), ['echo "$*" > "$MARK"']);
    // A stand-in `systemd-run` first on the PATH, which runs the command it was given.
    const bin = join(dir, "bin");
    mkdirSync(bin);
    script(join(bin, "systemd-run"), [
      'echo "$*" > "$ARGS"',
      "while [ $# -gt 2 ]; do shift; done",
      'exec "$@"',
    ]);
    const start = (path: string) =>
      selfUpdateHere({
        release,
        dataDir: dir,
        logFile: join(dir, "serve.log"),
        platform: "linux",
        env: { PATH: path, MARK: join(dir, "started"), ARGS: join(dir, "args") },
        hasSystemdRun: () => true,
      })?.start();
    start(`${bin}:/usr/bin:/bin`);
    expect(await written(join(dir, "started"))).toBe("update\n");
    expect(readFileSync(join(dir, "args"), "utf8")).toContain(`--setenv=CHIPS_DATA_DIR=${dir}`);
    // Nowhere on the PATH: the spawn fails as an event, and nothing is thrown at the server.
    start(join(dir, "nowhere"));
    await new Promise((done) => setTimeout(done, 50));
  });

  it("read the last update as it stands for this release", () => {
    const { release } = installed("1.2.6");
    const stale = { state: "failed", from: "1.2.5", at: "2026-11-20T02:10:00.000Z", why: "x" };
    writeFileSync(join(dir, UPDATE_FILE), JSON.stringify(stale));
    expect(readUpdate(dir)?.state).toBe("failed");
    expect(hands(release)?.last()).toBeUndefined();
    writeFileSync(join(dir, UPDATE_FILE), "not json");
    expect(hands(release)?.last()).toBeUndefined();
    writeFileSync(join(dir, UPDATE_FILE), JSON.stringify({ state: "odd", from: "1.2.6", at: "x" }));
    expect(hands(release)?.last()).toBeUndefined();
  });
});

describe("a computer in Chips for Mac starting again on the app's release (ADR 0298)", () => {
  it("reads the version the app holds now, and only a release's number", () => {
    const root = join(dir, "Chips.app", "Contents", "Resources", "chips");
    mkdirSync(root, { recursive: true });
    expect(versionIn(root)).toBeUndefined();
    writeFileSync(join(root, "VERSION"), "1.2.6\n");
    expect(versionIn(root)).toBe("1.2.6");
    writeFileSync(join(root, "VERSION"), "not a version\n");
    expect(versionIn(root)).toBeUndefined();
  });

  it("has the hands only inside Chips for Mac", () => {
    const root = join(dir, "Chips.app", "Contents", "Resources", "chips");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "VERSION"), "1.2.6\n");
    const restart = ["launchctl", "kickstart", "-k", "gui/501/chat.chips.serve"];
    const hands = restartOntoHere({ release: { version: "1.2.5", root }, restart });
    expect(hands?.onDisk()).toBe("1.2.6");
    const fromTheLine = installed("1.2.5");
    expect(restartOntoHere({ release: fromTheLine.release, restart })).toBeUndefined();
    expect(restartOntoHere({ release: { version: "1.2.5", root }, restart: [] })).toBeUndefined();
  });

  it("runs the restart it was given, apart from itself", async () => {
    const root = join(dir, "Chips.app", "Contents", "Resources", "chips");
    mkdirSync(root, { recursive: true });
    const mark = join(dir, "restarted");
    const hands = restartOntoHere({
      release: { version: "1.2.5", root },
      restart: ["/bin/sh", "-c", `echo kickstart > "${mark}"`],
    });
    hands?.restart();
    expect(await written(mark)).toBe("kickstart\n");
    // A restart command that isn't there fails as an event, and nothing is thrown at the server.
    restartOntoHere({
      release: { version: "1.2.5", root },
      restart: [join(dir, "no-such-launchctl"), "kickstart"],
    })?.restart();
    await new Promise((done) => setTimeout(done, 50));
  });
});
