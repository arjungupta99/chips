import { describe, expect, it } from "vitest";
import { scriptedConsole } from "../output.js";
import { launchdPlist } from "../service.js";
import { type UninstallDeps, uninstall } from "./uninstall.js";

const HOME = "/Users/ada";
const PLIST = `${HOME}/Library/LaunchAgents/chat.chips.serve.plist`;
const DATA = `${HOME}/Library/Application Support/Chips`;
const ours = launchdPlist({ command: ["/x/runtime/node"], logFile: "/x.log", environment: {} });

function machine(over: Partial<UninstallDeps> = {}) {
  const removed: string[] = [];
  const deps: UninstallDeps = {
    machine: { platform: "darwin", home: HOME, environment: {} },
    uid: 501,
    release: { version: "0.2.0", root: `${HOME}/.local/lib/chips/0.2.0` },
    install: { lib: `${HOME}/.local/lib/chips`, link: `${HOME}/.local/bin/chips` },
    data: [DATA, `${HOME}/Library/Logs/Chips`, `${HOME}/.config/chips`],
    readFile: (path) => (path === PLIST ? ours : undefined),
    writeFile: () => {
      throw new Error("no profile here to write");
    },
    exists: () => true,
    remove: (path) => removed.push(path),
    run: async () => ({ ok: true, output: "" }),
    ...over,
  };
  return { deps, removed };
}

/** Chips's PATH lines as install.sh and Chips for Mac write them, for ~/.local/bin. */
const OUR_LINES = `\n# Chips\nexport PATH="${HOME}/.local/bin:$PATH"\n`;

describe("chips uninstall", () => {
  it("removes the service, the link and the install, and keeps the workspace with --yes", async () => {
    const out = scriptedConsole(true);
    const { deps, removed } = machine();
    expect(await uninstall(out, { yes: true, removeData: false }, deps)).toBe(true);
    expect(removed).toEqual([PLIST, `${HOME}/.local/bin/chips`, `${HOME}/.local/lib/chips`]);
    expect(out.lines.join("\n")).toContain(
      "Your workspace is still at ~/Library/Application Support/Chips",
    );
  });

  it("removes the workspace too only when told to", async () => {
    const { deps, removed } = machine();
    await uninstall(scriptedConsole(true), { yes: true, removeData: true }, deps);
    expect(removed).toContain(DATA);
    expect(removed).toContain(`${HOME}/.config/chips`);
  });

  it("asks about the workspace on its own, at a terminal", async () => {
    const out = scriptedConsole(true);
    const { deps, removed } = machine();
    await uninstall(out, { yes: false, removeData: false }, deps);
    expect(out.lines.join("\n")).toContain("Remove your workspace too? [y/N] y");
    expect(removed).toContain(DATA);
  });

  it("removes nothing when the answer is no", async () => {
    const { deps, removed } = machine();
    expect(await uninstall(scriptedConsole(false), { yes: false, removeData: false }, deps)).toBe(
      false,
    );
    expect(removed).toEqual([]);
  });

  it("leaves a service it did not write", async () => {
    const { deps, removed } = machine({ readFile: () => "<plist>theirs</plist>" });
    await uninstall(scriptedConsole(true), { yes: true, removeData: false }, deps);
    expect(removed).not.toContain(PLIST);
  });

  it("stops each bridge kept running, then removes the bridges with the install (ADR 0218)", async () => {
    const bridges = `${DATA}/bridges`;
    const said: string[] = [];
    const { deps, removed } = machine({
      bridges: {
        dir: bridges,
        stop: async () => {
          // Stopped while the install's Node is still there to stop them on.
          said.push(`stopped with ${removed.length} removed`);
        },
      },
    });
    const out = scriptedConsole(true);
    await uninstall(out, { yes: true, removeData: false }, deps);
    expect(said).toEqual(["stopped with 0 removed"]);
    expect(removed).toEqual([
      PLIST,
      bridges,
      `${HOME}/.local/bin/chips`,
      `${HOME}/.local/lib/chips`,
    ]);
    expect(out.lines.join("\n")).toContain("~/Library/Application Support/Chips/bridges");
  });

  it("has no bridges to stop where none was fetched", async () => {
    let stopped = false;
    const { deps, removed } = machine({
      exists: (path) => !path.endsWith("/bridges"),
      bridges: {
        dir: `${DATA}/bridges`,
        stop: async () => {
          stopped = true;
        },
      },
    });
    await uninstall(scriptedConsole(true), { yes: true, removeData: false }, deps);
    expect(stopped).toBe(false);
    expect(removed).not.toContain(`${DATA}/bridges`);
  });

  it("run through Chips for Mac's link, removes the service and the link but nothing in the app", async () => {
    const root = "/Applications/Chips.app/Contents/Resources/chips";
    const { deps, removed } = machine({
      release: { version: "0.2.0", root },
      install: { lib: root, link: `${HOME}/.local/bin/chips` },
    });
    const out = scriptedConsole(true);
    expect(await uninstall(out, { yes: true, removeData: false }, deps)).toBe(true);
    expect(removed).toEqual([PLIST, `${HOME}/.local/bin/chips`]);
    const said = out.lines.join("\n");
    expect(said).not.toContain("Chips is uninstalled");
    expect(said).toContain(
      "Chips for Mac is still at /Applications/Chips.app. Drag it to the Trash to remove it.",
    );
  });

  it("takes Chips's PATH lines out of a profile and leaves the rest of it (the onboarding audit, item 25)", async () => {
    const zshrc = `${HOME}/.zshrc`;
    const bashrc = `${HOME}/.bashrc`;
    const files: Record<string, string> = {
      [PLIST]: ours,
      [zshrc]: `export EDITOR=vim\n${OUR_LINES}alias ll="ls -l"\n`,
      // Somebody's own line for the same folder, not written as Chips writes it, is theirs.
      [bashrc]: `export PATH="${HOME}/.local/bin:$PATH"\n`,
    };
    const { deps } = machine({
      readFile: (path) => files[path],
      writeFile: (path, text) => {
        files[path] = text;
      },
    });
    const out = scriptedConsole(true);
    await uninstall(out, { yes: true, removeData: false }, deps);
    expect(out.lines.join("\n")).toContain("the PATH line in ~/.zshrc");
    expect(files[zshrc]).toBe('export EDITOR=vim\nalias ll="ls -l"\n');
    expect(files[bashrc]).toBe(`export PATH="${HOME}/.local/bin:$PATH"\n`);
  });

  it("leaves the line before them whole when it had no newline of its own", async () => {
    const zshrc = `${HOME}/.zshrc`;
    const files: Record<string, string> = { [zshrc]: `export A=1${OUR_LINES}export B=2\n` };
    const { deps } = machine({
      readFile: (path) => (path === PLIST ? ours : files[path]),
      writeFile: (path, text) => {
        files[path] = text;
      },
    });
    await uninstall(scriptedConsole(true), { yes: true, removeData: false }, deps);
    expect(files[zshrc]).toBe("export A=1\nexport B=2\n");
  });

  it("takes the lines from the top of a profile they begin", async () => {
    const zprofile = `${HOME}/.zprofile`;
    const files: Record<string, string> = { [zprofile]: `${OUR_LINES.slice(1)}export A=1\n` };
    const { deps } = machine({
      readFile: (path) => (path === PLIST ? ours : files[path]),
      writeFile: (path, text) => {
        files[path] = text;
      },
    });
    await uninstall(scriptedConsole(true), { yes: true, removeData: false }, deps);
    expect(files[zprofile]).toBe("export A=1\n");
  });

  it("forgets the keys in the login keychain with the workspace, and only then", async () => {
    let forgot = 0;
    const forgetSecrets = () => {
      forgot += 1;
    };
    await uninstall(
      scriptedConsole(true),
      { yes: true, removeData: false },
      machine({ forgetSecrets }).deps,
    );
    expect(forgot).toBe(0);
    const out = scriptedConsole(true);
    await uninstall(out, { yes: false, removeData: false }, machine({ forgetSecrets }).deps);
    expect(out.lines.join("\n")).toContain("the keys Chips kept in your login keychain");
    expect(forgot).toBe(1);
  });

  it("has nothing to remove from a checkout", async () => {
    const out = scriptedConsole(true);
    const { deps, removed } = machine({ release: undefined, install: undefined });
    expect(await uninstall(out, { yes: true, removeData: true }, deps)).toBe(false);
    expect(removed).toEqual([]);
    expect(out.lines.join("\n")).toContain("checkout");
  });
});
