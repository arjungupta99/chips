/**
 * Chips as a login service: a launch agent on a Mac, a systemd user unit on Linux (ADR 0121).
 *
 * `chips up` writes one, `chips down` stops it, `chips uninstall` removes it. Each file says it was
 * written by `chips up`, and a file without those words is somebody else's: a launch agent a
 * checkout installed (`pnpm phone server`), or one written by hand. Chips leaves those exactly as
 * they are and says so, because the label is the same and replacing it would replace a server
 * somebody is running.
 *
 * The files and the commands are worked out here, purely; running them is the caller's.
 */

import { join } from "node:path";
import type { Environment, Machine } from "@chipschat/platform";

export const LABEL = "chat.chips.serve";
export const UNIT = "chips.service";
const MARK = "Written by chips up";

export type ServiceKind = "launchd" | "systemd";
export type ServiceState = "none" | "ours" | "foreign";

/** What the service runs, and with what. */
export interface ServiceSpec {
  /**
   * What runs `serve`: the install's own Node and the CLI bundled beside it, by the install's
   * stable link, so an update does not orphan the service. Node itself rather than `bin/chips`,
   * the script that finds them: macOS names a background item after its program, and a script is
   * signed by nobody.
   */
  readonly command: readonly [string, ...string[]];
  readonly environment: Readonly<Record<string, string>>;
  readonly logFile: string;
  /**
   * The Mac app this Chips came inside, by its bundle identifier (`chat.chips.desktop`): the
   * background-item notice and Login Items name it, rather than Node (ADR 0218's addendum).
   */
  readonly app?: string | undefined;
}

/** A command to run, as its words. */
export type Command = readonly [string, ...string[]];

export function serviceKind(platform: string): ServiceKind | undefined {
  if (platform === "darwin") return "launchd";
  if (platform === "linux") return "systemd";
  return undefined;
}

/** Where the service's file lives. */
export function servicePath(kind: ServiceKind, machine: Machine): string {
  if (kind === "launchd") return join(machine.home, "Library", "LaunchAgents", `${LABEL}.plist`);
  const xdg = machine.environment["XDG_CONFIG_HOME"];
  const config = xdg !== undefined && xdg !== "" ? xdg : join(machine.home, ".config");
  return join(config, "systemd", "user", UNIT);
}

/** This machine's Chips service, when there is a file for one: whose it is, and its environment. */
export function serviceHere(
  machine: Machine,
  read: (path: string) => string | undefined,
):
  | { readonly state: Exclude<ServiceState, "none">; readonly environment: Record<string, string> }
  | undefined {
  const kind = serviceKind(machine.platform);
  const contents = kind === undefined ? undefined : read(servicePath(kind, machine));
  if (contents === undefined) return undefined;
  const state = stateOf(contents) === "ours" ? "ours" : "foreign";
  return { state, environment: serviceEnvironment(contents) };
}

/**
 * The environment the server here is configured by: the `CHIPS_` settings in the service's file
 * `chips up` wrote, under this shell's, which win. So `chips up`, `doctor` and `pair --issue` find
 * the port and the workspace an earlier `chips up` was given, not the defaults.
 */
export function withServiceSettings(
  environment: Environment,
  service: ReturnType<typeof serviceHere>,
): Environment {
  if (service?.state !== "ours") return environment;
  const settings = Object.entries(service.environment).filter(([name]) =>
    name.startsWith("CHIPS_"),
  );
  return { ...Object.fromEntries(settings), ...environment };
}

/** Whose file this is: none, ours, or somebody else's. */
export function stateOf(contents: string | undefined): ServiceState {
  if (contents === undefined) return "none";
  return contents.includes(MARK) ? "ours" : "foreign";
}

const xml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The launch agent: started at login, started again if it stops, and credited to its app. */
export function launchdPlist(spec: ServiceSpec): string {
  const args = [...spec.command, "serve"]
    .map((word) => `    <string>${xml(word)}</string>`)
    .join("\n");
  const app =
    spec.app === undefined
      ? ""
      : `  <key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>${xml(spec.app)}</string>\n  </array>\n`;
  const env = Object.entries(spec.environment)
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${MARK}. \`chips down\` stops it; \`chips uninstall\` removes it. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
${app}  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(spec.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(spec.logFile)}</string>
</dict>
</plist>
`;
}

/**
 * The systemd user unit: started at login, started again if it fails. Every value is written as
 * itself: systemd reads `%` as the start of a specifier (`%h`, `%u`), so it is doubled, and a
 * token or an address that holds one reaches Chips unchanged.
 */
export function systemdUnit(spec: ServiceSpec): string {
  const literal = (value: string) => value.replace(/%/g, "%%");
  const quote = (value: string) =>
    `"${literal(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const log = literal(spec.logFile);
  const env = Object.entries(spec.environment)
    .map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`)
    .join("\n");
  return `# ${MARK}. \`chips down\` stops it; \`chips uninstall\` removes it.
[Unit]
Description=Chips
After=network-online.target

[Service]
ExecStart=${spec.command.map(quote).join(" ")} serve
${env}
Restart=on-failure
StandardOutput=append:${log}
StandardError=append:${log}

[Install]
WantedBy=default.target
`;
}

export function serviceFile(kind: ServiceKind, spec: ServiceSpec): string {
  return kind === "launchd" ? launchdPlist(spec) : systemdUnit(spec);
}

/**
 * The environment a service's file runs Chips with, read back: what `chips up` wrote and what was
 * added by hand since, from a launch agent or a unit alike. Empty when there is no file.
 */
export function serviceEnvironment(contents: string | undefined): Record<string, string> {
  if (contents === undefined) return {};
  return contents.includes("<plist") ? plistEnvironment(contents) : unitEnvironment(contents);
}

const unxml = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** `EnvironmentVariables`' keys and strings, however the plist was laid out (`plutil` uses tabs). */
function plistEnvironment(plist: string): Record<string, string> {
  const dict = /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(plist)?.[1];
  const environment: Record<string, string> = {};
  for (const [, key, value] of (dict ?? "").matchAll(
    /<key>([^<]*)<\/key>\s*(?:<string>([^<]*)<\/string>|<string\/>)/g,
  )) {
    environment[unxml(key ?? "")] = unxml(value ?? "");
  }
  return environment;
}

/** Every `Environment=` line's assignments, quoted as `systemdUnit` writes them or bare. */
function unitEnvironment(unit: string): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const line of unit.split("\n")) {
    const assignments = /^\s*Environment=(.*)$/.exec(line)?.[1];
    for (const word of words(assignments ?? "")) {
      const at = word.indexOf("=");
      if (at > 0) environment[word.slice(0, at)] = word.slice(at + 1).replace(/%%/g, "%");
    }
  }
  return environment;
}

/** A unit line's words: each `"…"` with its `\\` and `\"` undone, or a run without spaces. */
function words(line: string): string[] {
  const found: string[] = [];
  for (const [, quoted, bare] of line.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) {
    found.push(quoted === undefined ? (bare ?? "") : quoted.replace(/\\(.)/g, "$1"));
  }
  return found;
}

/** Start it: load the agent (or restart it, when it is loaded), or enable the unit now. */
export function startCommands(kind: ServiceKind, path: string, uid: number): readonly Command[] {
  if (kind === "launchd") {
    return [
      ["launchctl", "enable", `gui/${uid}/${LABEL}`],
      ["launchctl", "bootout", `gui/${uid}/${LABEL}`],
      ["launchctl", "bootstrap", `gui/${uid}`, path],
    ];
  }
  return [
    ["systemctl", "--user", "daemon-reload"],
    ["systemctl", "--user", "enable", "--now", UNIT],
    ["systemctl", "--user", "restart", UNIT],
  ];
}

/**
 * On Linux, a user's units run only while they are logged in, unless systemd is told to keep that
 * user's manager running from boot ("lingering"). A user may turn it on for themselves where
 * polkit allows, which it does in a local session; over SSH it usually asks for sudo.
 */
export function lingerCommand(uid: number): Command {
  return ["loginctl", "enable-linger", String(uid)];
}

/**
 * Whether lingering is on already, which `loginctl` answers `yes` to. Asked first, because turning
 * it on is refused over SSH even when it is on (Ubuntu 24.04, 29 October 2026).
 */
export function lingeringCommand(uid: number): Command {
  return ["loginctl", "show-user", String(uid), "--property=Linger", "--value"];
}

/**
 * A harness's bridge kept running, started again (ADR 0218): after an upgrade it runs on the Node
 * the upgrade put in place. Its label is the bridge's (`chat.chips.hermes`), its file keep's.
 */
export function restartCommand(kind: ServiceKind, label: string, uid: number): Command {
  return kind === "launchd"
    ? ["launchctl", "kickstart", "-k", `gui/${uid}/${label}`]
    : ["systemctl", "--user", "restart", `${label}.service`];
}

/** Stop it, and keep it from starting at the next login. */
export function stopCommands(kind: ServiceKind, uid: number): readonly Command[] {
  if (kind === "launchd") {
    return [
      ["launchctl", "bootout", `gui/${uid}/${LABEL}`],
      ["launchctl", "disable", `gui/${uid}/${LABEL}`],
    ];
  }
  return [["systemctl", "--user", "disable", "--now", UNIT]];
}

/**
 * What says whether this shell has a session a login service can be started in: launchd's
 * domain for this user, which exists only while somebody is logged in at the Mac's screen, or
 * the user's systemd manager, which a shell under `su`, in most containers or on WSL has no bus to.
 */
export function sessionCommand(kind: ServiceKind, uid: number): Command {
  return kind === "launchd"
    ? ["launchctl", "print", `gui/${uid}`]
    : ["systemctl", "--user", "show-environment"];
}

/** What launchd and systemctl print when there is no session to start a service in. */
export const NO_SESSION = {
  launchd: /Bootstrap failed: (5|125)|Domain does not support|Could not find domain/,
  systemd:
    /Failed to connect to (user scope )?bus|DBUS_SESSION_BUS_ADDRESS|not been booted with systemd/,
} as const;

/**
 * Which commands may fail without anything being wrong: unloading an agent that was not loaded
 * is how a first start begins.
 */
export function mayFail(command: Command): boolean {
  return command[0] === "launchctl" && command[1] === "bootout";
}
