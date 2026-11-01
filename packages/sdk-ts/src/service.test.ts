/**
 * A harness kept running (setup audit HS-15): the launch agent and the systemd unit it writes, the
 * commands it runs, a file of somebody's own left alone, and what a kept bridge takes with it from
 * the shell it joined from.
 */

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appHolding,
  type Command,
  type KeepSpec,
  keepEnvironment,
  keepRunning,
  keptNode,
  nodeOnPath,
  serviceFile,
  stopKeeping,
} from "./service.js";

const spec: KeepSpec = {
  label: "chat.chips.hermes",
  command: ["/opt/node/bin/node", "--import", "tsx", "src/main.ts"],
  folder: "/Users/sam/Work/chips-hermes",
  environment: { CHIPS_URL: "https://chips.example", PATH: "/opt/node/bin:/usr/bin" },
};

let home: string;
let ran: Command[];
const run = (command: Command) => {
  ran.push(command);
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-keep-"));
  ran = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("the service's file", () => {
  it("is a launch agent on a Mac: the bridge from its folder, at login and again when it stops", () => {
    const file = serviceFile(spec, { platform: "darwin", home, env: {} });
    expect(file?.path).toBe(join(home, "Library/LaunchAgents/chat.chips.hermes.plist"));
    expect(file?.logFile).toBe(join(home, "Library/Logs/chips-hermes.log"));
    const plist = file?.contents ?? "";
    expect(plist).toContain("<string>chat.chips.hermes</string>");
    expect(plist).toContain("<string>/opt/node/bin/node</string>\n    <string>--import</string>");
    expect(plist).toContain(
      "<key>WorkingDirectory</key>\n  <string>/Users/sam/Work/chips-hermes</string>",
    );
    expect(plist).toContain("<key>CHIPS_URL</key>\n    <string>https://chips.example</string>");
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\n {2}<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\n {2}<true\/>/);
  });

  it("is a systemd user unit on Linux, where XDG says", () => {
    const file = serviceFile(spec, {
      platform: "linux",
      home,
      env: { XDG_CONFIG_HOME: join(home, "cfg") },
    });
    expect(file?.path).toBe(join(home, "cfg/systemd/user/chat.chips.hermes.service"));
    expect(file?.logFile).toBe(join(home, ".local/state/chips/chips-hermes.log"));
    expect(file?.contents).toContain(
      'ExecStart="/opt/node/bin/node" "--import" "tsx" "src/main.ts"',
    );
    expect(file?.contents).toContain('Environment="CHIPS_URL=https://chips.example"');
    expect(file?.contents).toContain("Restart=always");
  });

  it("names the Mac app its Node is inside, so Login Items say Chips rather than Node", () => {
    const app = join(home, "Applications", "Chips.app");
    mkdirSync(join(app, "Contents"), { recursive: true });
    writeFileSync(
      join(app, "Contents", "Info.plist"),
      "<plist><dict>\n  <key>CFBundleIdentifier</key>\n  <string>chat.chips.desktop</string>\n</dict></plist>",
    );
    const node = join(app, "Contents", "Resources", "chips", "runtime", "node");
    const kept = { ...spec, command: [node, "dist/main.js"] as const };
    expect(appHolding(node)).toBe("chat.chips.desktop");
    const plist = serviceFile(kept, { platform: "darwin", home, env: {} })?.contents ?? "";
    expect(plist).toContain(
      "<key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>chat.chips.desktop</string>\n  </array>\n  <key>ProgramArguments</key>",
    );
    // Node from anywhere else, or an app that doesn't say who it is, names nothing.
    expect(serviceFile(spec, { platform: "darwin", home, env: {} })?.contents).not.toContain(
      "AssociatedBundleIdentifiers",
    );
    expect(appHolding(join(home, "Elsewhere.app", "Contents", "MacOS", "node"))).toBeUndefined();
    expect(appHolding(node, () => "<plist></plist>")).toBeUndefined();
    // A unit on Linux has no such thing.
    expect(serviceFile(kept, { platform: "linux", home, env: {} })?.contents).not.toContain(
      "chat.chips.desktop",
    );
  });

  it("is nothing where there is no service manager it knows", () => {
    expect(serviceFile(spec, { platform: "win32", home, env: {} })).toBeUndefined();
    expect(keepRunning(spec, { machine: { platform: "win32", home, env: {} }, run }).state).toBe(
      "unsupported",
    );
  });
});

describe("keeping it running", () => {
  const mac = () => ({ machine: { platform: "darwin", home, env: {} }, run, uid: 501 });

  it("writes the launch agent, read by its user only, and loads it afresh", () => {
    const kept = keepRunning(spec, mac());
    expect(kept.state).toBe("kept");
    expect(statSync(kept.path ?? "").mode & 0o777).toBe(0o600);
    expect(ran).toEqual([
      ["launchctl", "enable", "gui/501/chat.chips.hermes"],
      ["launchctl", "bootout", "gui/501/chat.chips.hermes"],
      ["launchctl", "bootstrap", "gui/501", kept.path],
    ]);
  });

  it("goes on when the agent wasn't loaded, and replaces a file it wrote before", () => {
    const failing = (command: Command) => {
      run(command);
      if (command[1] === "bootout") throw new Error("not loaded");
    };
    keepRunning(spec, { ...mac(), run: failing });
    const kept = keepRunning(
      { ...spec, environment: { CHIPS_URL: "https://other.example" } },
      { ...mac(), run: failing },
    );
    expect(kept.state).toBe("kept");
    expect(readFileSync(kept.path ?? "", "utf8")).toContain("https://other.example");
  });

  it("loads it again once launchd has let the copy it stopped go", () => {
    let refused = 2;
    const busy = (command: Command) => {
      run(command);
      if (command[1] === "bootstrap" && refused-- > 0)
        throw new Error("Bootstrap failed: 5: Input/output error");
    };
    expect(keepRunning(spec, { ...mac(), run: busy, retryMs: 1 }).state).toBe("kept");
    expect(ran.filter((command) => command[1] === "bootstrap")).toHaveLength(3);
  });

  it("on Linux, keeps it running after logout, or says it stops then and the line that fixes it", () => {
    const said: string[] = [];
    const linux = (answer: (command: Command) => unknown) => ({
      machine: { platform: "linux", home, env: {} },
      run: (command: Command) => {
        ran.push(command);
        return answer(command);
      },
      uid: 1000,
      say: (line: string) => void said.push(line),
    });
    const turnOn: Command = ["loginctl", "enable-linger", "1000"];

    const allowed = linux(() => "no\n");
    expect(keepRunning(spec, allowed).state).toBe("kept");
    expect(ran).toContainEqual(["loginctl", "show-user", "1000", "--property=Linger", "--value"]);
    expect(ran).toContainEqual(turnOn);
    expect(said).toEqual([]);

    // On already: not turned on again, which over SSH is refused even then.
    ran = [];
    const already = linux((command) => (command[1] === "show-user" ? "yes\n" : ""));
    keepRunning(spec, already);
    expect(ran).not.toContainEqual(turnOn);
    expect(said).toEqual([]);

    // Refused, as over SSH without sudo: still kept, and said.
    const refused = linux((command) => {
      if (command[1] === "enable-linger") throw new Error("Access denied");
      return "no\n";
    });
    expect(keepRunning(spec, refused).state).toBe("kept");
    expect(said).toEqual([
      "It stops when you log out. To keep it running on a machine nobody logs in to, run this once: sudo loginctl enable-linger $USER",
    ]);
  });

  it("writes nothing and runs nothing with CHIPS_KEEP=off, as a test of a card's line sets", () => {
    const off = {
      machine: { platform: "darwin", home, env: { CHIPS_KEEP: "off" } },
      run,
      uid: 501,
    };
    expect(keepRunning(spec, off).state).toBe("off");
    expect(serviceFile(spec, off.machine)?.path).toBeDefined();
    expect(() => statSync(join(home, "Library/LaunchAgents/chat.chips.hermes.plist"))).toThrow();
    expect(ran).toEqual([]);
  });

  it("leaves a launch agent of somebody's own, written by hand, exactly as it is", () => {
    const path = join(home, "Library/LaunchAgents/chat.chips.hermes.plist");
    mkdirSync(join(home, "Library/LaunchAgents"), { recursive: true });
    writeFileSync(path, "<plist>mine</plist>");
    expect(keepRunning(spec, mac()).state).toBe("theirs");
    expect(stopKeeping(spec.label, mac()).state).toBe("theirs");
    expect(readFileSync(path, "utf8")).toBe("<plist>mine</plist>");
    expect(ran).toEqual([]);
  });

  it("stops one it wrote and removes its file, and says when there is none", () => {
    const kept = keepRunning(spec, mac());
    ran = [];
    expect(stopKeeping(spec.label, mac()).state).toBe("stopped");
    expect(ran).toEqual([["launchctl", "bootout", "gui/501/chat.chips.hermes"]]);
    expect(() => statSync(kept.path ?? "")).toThrow();
    expect(stopKeeping(spec.label, mac()).state).toBe("none");
  });
});

describe("what a kept bridge takes from the shell it joined from", () => {
  it("the server's address, the PATH, Chips's own settings and the names asked for, never the spent link", () => {
    const env = {
      PATH: "/opt/node/bin:/usr/bin",
      CHIPS_NO_KEYCHAIN: "true",
      CHIPS_JOIN_LINK: "https://chips.example/join#secret",
      CHIPS_URL: "https://old.example",
      OPENCODE_PASSWORD: "hunter22",
      HERMES_HOME: "",
      SHELL: "/bin/zsh",
    };
    expect(
      keepEnvironment("https://chips.example", env, ["OPENCODE_PASSWORD", "HERMES_HOME"]),
    ).toEqual({
      CHIPS_URL: "https://chips.example",
      PATH: "/opt/node/bin:/usr/bin",
      CHIPS_NO_KEYCHAIN: "true",
      OPENCODE_PASSWORD: "hunter22",
    });
  });

  it("none of what `chips connect` hands over for the run alone (ADR 0218)", () => {
    const env = {
      PATH: "/usr/bin",
      CHIPS_CONFIG_HOME: "/Users/sam/.config/chips",
      CHIPS_JOIN_LINK: "https://chips.example/j/chips_j_secret",
      CHIPS_NODE: "/Users/sam/.local/lib/chips/current/runtime/node",
      CHIPS_STOP_COMMAND: "chips disconnect hermes",
      CHIPS_STEPS: "json",
    };
    expect(Object.keys(keepEnvironment("https://chips.example", env)).sort()).toEqual([
      "CHIPS_CONFIG_HOME",
      "CHIPS_URL",
      "PATH",
    ]);
  });

  it("the node it is kept on first on the PATH, for an agent run as `#!/usr/bin/env node`", () => {
    const node = "/Users/sam/.local/lib/chips/current/runtime/node";
    const folder = "/Users/sam/.local/lib/chips/current/runtime";
    expect(keepEnvironment("https://chips.example", { PATH: "/usr/bin:/bin" }, [], node)).toEqual({
      CHIPS_URL: "https://chips.example",
      PATH: `${folder}:/usr/bin:/bin`,
    });
    // Once, however it was given, and a PATH of nothing is that folder alone.
    expect(keepEnvironment("https://x", { PATH: `/usr/bin:${folder}` }, [], node)["PATH"]).toBe(
      `${folder}:/usr/bin`,
    );
    expect(keepEnvironment("https://x", {}, [], node)["PATH"]).toBe(folder);
  });
});

describe("the node a kept bridge runs on", () => {
  it("is the first on the PATH, the link an upgrade keeps, else this process's own", () => {
    const bin = join(home, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "node"), "#!/bin/sh\n");
    chmodSync(join(bin, "node"), 0o755);
    expect(nodeOnPath({ PATH: `${join(home, "none")}:${bin}` })).toBe(join(bin, "node"));
    expect(nodeOnPath({ PATH: "" })).toBe(process.execPath);
  });

  it("is the one `chips connect` hands over, which an upgrade of Chips keeps (ADR 0218)", () => {
    const bin = join(home, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "node"), "#!/bin/sh\n");
    chmodSync(join(bin, "node"), 0o755);
    const chips = "/Users/sam/.local/lib/chips/current/runtime/node";
    expect(keptNode({ PATH: bin, CHIPS_NODE: chips })).toBe(chips);
    expect(keptNode({ PATH: bin, CHIPS_NODE: "" })).toBe(join(bin, "node"));
    expect(keptNode({ PATH: bin })).toBe(join(bin, "node"));
  });
});
