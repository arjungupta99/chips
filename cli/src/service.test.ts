import { describe, expect, it } from "vitest";
import {
  LABEL,
  launchdPlist,
  mayFail,
  restartCommand,
  serviceEnvironment,
  serviceHere,
  serviceKind,
  servicePath,
  startCommands,
  stateOf,
  stopCommands,
  systemdUnit,
  withServiceSettings,
} from "./service.js";

const spec = {
  command: [
    "/Users/ada/.local/lib/chips/current/runtime/node",
    "/Users/ada/.local/lib/chips/current/lib/chips.mjs",
  ] as const,
  logFile: "/Users/ada/Library/Logs/Chips/chips.log",
  environment: { CHIPS_HOST: "0.0.0.0", CHIPS_PUBLIC_URL: "http://100.64.0.7:4431" },
};

describe("the login service", () => {
  it("is a launch agent on a Mac, a user unit on Linux, and nothing elsewhere", () => {
    expect(serviceKind("darwin")).toBe("launchd");
    expect(serviceKind("linux")).toBe("systemd");
    expect(serviceKind("win32")).toBeUndefined();
    expect(
      servicePath("launchd", { platform: "darwin", home: "/Users/ada", environment: {} }),
    ).toBe(`/Users/ada/Library/LaunchAgents/${LABEL}.plist`);
    expect(servicePath("systemd", { platform: "linux", home: "/home/ada", environment: {} })).toBe(
      "/home/ada/.config/systemd/user/chips.service",
    );
    expect(
      servicePath("systemd", {
        platform: "linux",
        home: "/home/ada",
        environment: { XDG_CONFIG_HOME: "/cfg" },
      }),
    ).toBe("/cfg/systemd/user/chips.service");
  });

  it("runs the install's Node and CLI with the environment it was given, and logs where it says", () => {
    const plist = launchdPlist(spec);
    expect(plist).toContain(
      [
        "<key>ProgramArguments</key>",
        "  <array>",
        "    <string>/Users/ada/.local/lib/chips/current/runtime/node</string>",
        "    <string>/Users/ada/.local/lib/chips/current/lib/chips.mjs</string>",
        "    <string>serve</string>",
        "  </array>",
      ].join("\n"),
    );
    expect(plist).toContain(
      "<key>CHIPS_PUBLIC_URL</key>\n    <string>http://100.64.0.7:4431</string>",
    );
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain(spec.logFile);
    const unit = systemdUnit(spec);
    expect(unit).toContain(
      'ExecStart="/Users/ada/.local/lib/chips/current/runtime/node" "/Users/ada/.local/lib/chips/current/lib/chips.mjs" serve',
    );
    expect(unit).toContain('Environment="CHIPS_HOST=0.0.0.0"');
    expect(unit).toContain(`StandardOutput=append:${spec.logFile}`);
  });

  it("writes a % in a unit as itself, not as the start of a systemd specifier", () => {
    const unit = systemdUnit({
      ...spec,
      environment: { CHIPS_PUBLIC_URL: "https://chips.example/a%20b" },
    });
    expect(unit).toContain('Environment="CHIPS_PUBLIC_URL=https://chips.example/a%%20b"');
  });

  it("escapes what a plist cannot hold as it is", () => {
    expect(launchdPlist({ ...spec, command: ["/a&b/<c>/node"] })).toContain(
      "/a&amp;b/&lt;c&gt;/node",
    );
  });

  it("names the Mac app it came inside, so Login Items say Chips rather than Node", () => {
    const fromApp = launchdPlist({
      ...spec,
      command: [
        "/Applications/Chips.app/Contents/Resources/chips/runtime/node",
        "/Applications/Chips.app/Contents/Resources/chips/lib/chips.mjs",
      ],
      app: "chat.chips.desktop",
    });
    expect(fromApp).toContain(
      "<key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>chat.chips.desktop</string>\n  </array>",
    );
    expect(launchdPlist(spec)).not.toContain("AssociatedBundleIdentifiers");
    expect(stateOf(fromApp)).toBe("ours");
  });

  it("knows its own file from somebody else's, and from none", () => {
    expect(stateOf(launchdPlist(spec))).toBe("ours");
    expect(stateOf(systemdUnit(spec))).toBe("ours");
    // The launch agent a checkout installs (packaging/launchd) does not say it was written by chips up.
    expect(
      stateOf("<plist><dict><key>Label</key><string>chat.chips.serve</string></dict></plist>"),
    ).toBe("foreign");
    expect(stateOf(undefined)).toBe("none");
  });

  it("starts by enabling, unloading what was loaded, then loading; stops by unloading and disabling", () => {
    expect(startCommands("launchd", "/p.plist", 501)).toEqual([
      ["launchctl", "enable", `gui/501/${LABEL}`],
      ["launchctl", "bootout", `gui/501/${LABEL}`],
      ["launchctl", "bootstrap", "gui/501", "/p.plist"],
    ]);
    expect(stopCommands("launchd", 501).map((command) => command[1])).toEqual([
      "bootout",
      "disable",
    ]);
    expect(startCommands("systemd", "/u", 1000).at(1)).toEqual([
      "systemctl",
      "--user",
      "enable",
      "--now",
      "chips.service",
    ]);
    expect(stopCommands("systemd", 1000)).toEqual([
      ["systemctl", "--user", "disable", "--now", "chips.service"],
    ]);
  });

  it("starts a harness's bridge again by the label keep gave it (ADR 0218)", () => {
    expect(restartCommand("launchd", "chat.chips.hermes", 501)).toEqual([
      "launchctl",
      "kickstart",
      "-k",
      "gui/501/chat.chips.hermes",
    ]);
    expect(restartCommand("systemd", "chat.chips.acp.codex", 1000)).toEqual([
      "systemctl",
      "--user",
      "restart",
      "chat.chips.acp.codex.service",
    ]);
  });

  it("reads back the environment it wrote, from a launch agent or a unit", () => {
    const environment = {
      CHIPS_HOST: "0.0.0.0",
      CHIPS_PUSH_ACCESS_TOKEN: "a&b<c>\"d'e",
      CHIPS_FFMPEG: '/opt/my "tools"/50%/ffmpeg \\ here',
      CHIPS_LOG_LEVEL: "",
    };
    expect(serviceEnvironment(launchdPlist({ ...spec, environment }))).toEqual(environment);
    expect(serviceEnvironment(systemdUnit({ ...spec, environment }))).toEqual(environment);
    expect(serviceEnvironment(undefined)).toEqual({});
  });

  it("reads one edited by hand: plutil's tabs, a bare or a doubled assignment in a unit", () => {
    const plutil = [
      '<plist version="1.0">',
      "<dict>",
      "\t<key>EnvironmentVariables</key>",
      "\t<dict>",
      "\t\t<key>CHIPS_PUBLIC_URL</key>",
      "\t\t<string>https://chips.example.com</string>",
      "\t\t<key>CHIPS_EMPTY</key>",
      "\t\t<string/>",
      "\t</dict>",
      "\t<key>Label</key>",
      "\t<string>chat.chips.serve</string>",
      "</dict>",
      "</plist>",
    ].join("\n");
    expect(serviceEnvironment(plutil)).toEqual({
      CHIPS_PUBLIC_URL: "https://chips.example.com",
      CHIPS_EMPTY: "",
    });
    const unit =
      '[Service]\nEnvironment=CHIPS_PORT=4800 "CHIPS_FFMPEG=/opt/a b/ffmpeg"\nRestart=on-failure\n';
    expect(serviceEnvironment(unit)).toEqual({
      CHIPS_PORT: "4800",
      CHIPS_FFMPEG: "/opt/a b/ffmpeg",
    });
  });

  it("finds the service here, and configures by the settings of one chips up wrote, under the shell's", () => {
    const mac = { platform: "darwin", home: "/Users/ada", environment: {} };
    const plist = launchdPlist({
      ...spec,
      environment: { CHIPS_PORT: "4800", CHIPS_HOST: "0.0.0.0", PATH: "/opt/homebrew/bin" },
    });
    const read = (path: string) =>
      path === `/Users/ada/Library/LaunchAgents/${LABEL}.plist` ? plist : undefined;
    const here = serviceHere(mac, read);
    expect(here?.state).toBe("ours");
    expect(withServiceSettings({ CHIPS_HOST: "127.0.0.1", PATH: "/usr/bin" }, here)).toEqual({
      CHIPS_PORT: "4800",
      CHIPS_HOST: "127.0.0.1",
      PATH: "/usr/bin",
    });
    expect(serviceHere(mac, () => undefined)).toBeUndefined();
    // Somebody else's file is read, but configures nothing.
    const theirs = serviceHere(mac, () => "<plist><dict></dict></plist>");
    expect(theirs?.state).toBe("foreign");
    expect(withServiceSettings({ PATH: "/usr/bin" }, theirs)).toEqual({ PATH: "/usr/bin" });
  });

  it("lets only an unload of something not loaded fail", () => {
    expect(mayFail(["launchctl", "bootout", "gui/501/x"])).toBe(true);
    expect(mayFail(["launchctl", "bootstrap", "gui/501", "/p"])).toBe(false);
    expect(mayFail(["systemctl", "--user", "daemon-reload"])).toBe(false);
  });
});
