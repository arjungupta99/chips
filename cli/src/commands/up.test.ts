import { defaultConfig } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import { scriptedConsole } from "../output.js";
import { type Command, launchdPlist, serviceEnvironment, systemdUnit } from "../service.js";
import type { Serving } from "./serve.js";
import {
  browserFor,
  carriedSettings,
  type Health,
  keptAnswer,
  planUp,
  type UpDeps,
  type UpFlags,
  up,
} from "./up.js";

const HOME = "/Users/ada";
const machine = { platform: "darwin", home: HOME, environment: {} };
const release = { version: "0.2.0", root: `${HOME}/.local/lib/chips/0.2.0` };
const DATA = `${HOME}/Library/Application Support/Chips`;
const PLIST = `${HOME}/Library/LaunchAgents/chat.chips.serve.plist`;

const config = {
  ...defaultConfig(),
  data: { dir: DATA, databaseUrl: `sqlite:${DATA}/chips.db` },
};

const flags = (over: Partial<UpFlags> = {}): UpFlags => ({
  service: true,
  open: true,
  json: false,
  yes: false,
  interactive: false,
  ...over,
});

/** A machine to run `chips up` on, recording what was done to it. */
function world(
  over: Partial<UpDeps> & { answers?: Health[]; files?: Record<string, string> } = {},
) {
  const files: Record<string, string> = { ...over.files };
  const ran: Command[] = [];
  const made: string[] = [];
  const opened: string[] = [];
  const asked: string[][] = [];
  const answers = [...(over.answers ?? ["none"])];
  let codes = 0;
  const deps: UpDeps = {
    machine,
    configHome: `${HOME}/.config/chips`,
    release,
    command: [
      `${HOME}/.local/lib/chips/current/runtime/node`,
      `${HOME}/.local/lib/chips/current/lib/chips.mjs`,
    ],
    app: undefined,
    uid: 501,
    health: async () => (answers.length > 1 ? (answers.shift() as Health) : (answers[0] as Health)),
    networks: async () => ({ tailnet: "100.64.0.7", lan: "10.0.0.96" }),
    readFile: (path) => files[path],
    writeFile: (path, contents) => {
      files[path] = contents;
    },
    makeDirectory: (path) => {
      made.push(path);
    },
    exists: (path) => path in files,
    run: async (command) => {
      ran.push(command);
      return { ok: true, output: "" };
    },
    serve: async () => {
      throw new Error("not in this world");
    },
    requestCode: async () => ({
      code: `CODE-${++codes}`,
      url: "http://100.64.0.7:4431",
      relay: undefined,
      serverKey: undefined,
    }),
    open: async (url) => {
      opened.push(url);
      return true;
    },
    choose: async (_question, choices) => {
      asked.push([...choices]);
      return 1;
    },
    waitFor: async (check) => check(),
    ...over,
  };
  return { deps, files, ran, made, opened, asked };
}

describe("what chips up does, from what it found", () => {
  const found = {
    health: "none" as Health,
    state: "none" as const,
    kind: "launchd" as const,
    wantService: true,
    release: true,
    reachGiven: false,
    changed: false,
  };

  it("installs a service for a release on a Mac or Linux", () => {
    expect(planUp(found)).toBe("service");
    expect(planUp({ ...found, state: "ours" })).toBe("service");
  });

  it("runs in the terminal from a checkout, when asked to, and where there is no service manager", () => {
    expect(planUp({ ...found, release: false })).toBe("foreground");
    expect(planUp({ ...found, wantService: false })).toBe("foreground");
    expect(planUp({ ...found, kind: undefined })).toBe("foreground");
  });

  it("leaves a service somebody else wrote alone", () => {
    expect(planUp({ ...found, state: "foreign" })).toBe("foreign-service");
    // Running anyway, it is only asked for codes.
    expect(planUp({ ...found, state: "foreign", health: "chips" })).toBe("already-running");
  });

  it("finds a running Chips, and rewrites its own service for a new --reach or new settings", () => {
    expect(planUp({ ...found, health: "chips" })).toBe("already-running");
    expect(planUp({ ...found, health: "chips", state: "ours" })).toBe("already-running");
    expect(planUp({ ...found, health: "chips", state: "ours", reachGiven: true })).toBe("service");
    expect(planUp({ ...found, health: "chips", state: "ours", changed: true })).toBe("service");
    expect(planUp({ ...found, health: "chips", state: "ours", stale: true })).toBe("service");
    expect(planUp({ ...found, health: "chips", state: "none", stale: true })).toBe(
      "already-running",
    );
    expect(planUp({ ...found, health: "chips", state: "none", reachGiven: true })).toBe(
      "already-running",
    );
    // A Chips in a terminal, or with `--no-service`, is left as it is.
    expect(planUp({ ...found, health: "chips", state: "none", changed: true })).toBe(
      "already-running",
    );
    expect(
      planUp({ ...found, health: "chips", state: "ours", changed: true, wantService: false }),
    ).toBe("already-running");
  });

  it("stops when something else has the port", () => {
    expect(planUp({ ...found, health: "other" })).toBe("port-taken");
  });
});

describe("chips up", () => {
  it("on a fresh Mac: writes the launch agent, starts it, opens the browser paired, shows the phone's code", async () => {
    const out = scriptedConsole(true);
    const machine = world({ answers: ["none", "chips"] });
    const result = await up({
      config,
      console: out,
      flags: flags({ reach: "tailnet" }),
      deps: machine.deps,
    });

    expect(result).toEqual({ ok: true, hold: false, stop: undefined });
    expect(machine.files[PLIST]).toContain("Written by chips up");
    expect(machine.files[PLIST]).toContain("<string>http://100.64.0.7:4431</string>");
    expect(machine.files[PLIST]).toContain(`<string>${DATA}</string>`);
    expect(machine.ran.map((command) => command[1])).toEqual(["enable", "bootout", "bootstrap"]);
    expect(machine.opened).toEqual(["http://127.0.0.1:4431/#pair=CODE-1&v=1"]);
    const printed = out.lines.join("\n");
    expect(printed).toContain("Made your workspace  ~/Library/Application Support/Chips");
    expect(printed).toContain(
      "Reachable over Tailscale at http://100.64.0.7:4431, and on this Wi-Fi",
    );
    expect(printed).toContain("Starts when you log in");
    // The link is printed opened or not, for when no browser came up.
    expect(printed).toContain(
      "✓ Opened in your browser, already paired:\n    http://127.0.0.1:4431/#pair=CODE-1&v=1",
    );
    // The QR is `chips://pair`, which only the app opens.
    expect(printed).toContain("In the Chips app, scan this");
  });

  it("carries the settings it was given into the service, under what it decides itself", async () => {
    const out = scriptedConsole(true);
    const given = {
      ...machine,
      environment: {
        CHIPS_PUSH_ACCESS_TOKEN: "push-token",
        CHIPS_FFMPEG: "/opt/tools/ffmpeg",
        CHIPS_WHISPER_MODEL: "/models/ggml-base.bin",
        CHIPS_HOST: "0.0.0.0",
        CHIPS_LOG_LEVEL: "",
        HOME,
        EDITOR: "vi",
      },
    };
    const configured = world({ answers: ["none", "chips"], machine: given });
    await up({ config, console: out, flags: flags({ reach: "local" }), deps: configured.deps });
    const plist = configured.files[PLIST] ?? "";
    for (const kept of ["push-token", "/opt/tools/ffmpeg", "/models/ggml-base.bin"]) {
      expect(plist).toContain(`<string>${kept}</string>`);
    }
    // Who can reach it is up's to say: the answer, not the environment's CHIPS_HOST.
    expect(plist).toContain("<key>CHIPS_HOST</key>\n    <string>127.0.0.1</string>");
    expect(plist).not.toContain("0.0.0.0");
    // Only Chips's own settings, and none left empty.
    expect(plist).not.toContain("EDITOR");
    expect(plist).not.toContain("CHIPS_LOG_LEVEL");
  });

  it("on Linux, keeps the service running after logout, or says how when it can't", async () => {
    const linux = { platform: "linux", home: "/home/ada", environment: {} };
    const unit = "/home/ada/.config/systemd/user/chips.service";
    const lingers = world({ answers: ["none", "chips"], machine: linux });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags({ reach: "local" }), deps: lingers.deps });
    expect(lingers.files[unit]).toContain("Written by chips up");
    // systemd opens the log before Chips starts, and makes no folder for it.
    expect(lingers.made).toContain("/home/ada/.local/state/chips");
    expect(lingers.ran).toContainEqual([
      "loginctl",
      "show-user",
      "501",
      "--property=Linger",
      "--value",
    ]);
    expect(lingers.ran).toContainEqual(["loginctl", "enable-linger", "501"]);
    expect(out.lines.join("\n")).toContain(
      "Starts when this machine starts, and runs after you log out",
    );

    const refused = world({
      answers: ["none", "chips"],
      machine: linux,
      run: async (command) => ({ ok: command[0] !== "loginctl", output: "" }),
    });
    const told = scriptedConsole(true);
    await up({ config, console: told, flags: flags({ reach: "local" }), deps: refused.deps });
    const printed = told.lines.join("\n");
    expect(printed).toContain("Starts when you log in");
    expect(printed).toContain("It stops when you log out");
    expect(printed).toContain("sudo loginctl enable-linger $USER");

    // On already, which turning it on over SSH is refused for anyway: nothing to say but that.
    const already = world({
      answers: ["none", "chips"],
      machine: linux,
      run: async (command) =>
        command[1] === "show-user"
          ? { ok: true, output: "yes\n" }
          : { ok: command[0] !== "loginctl", output: "" },
    });
    const on = scriptedConsole(true);
    await up({ config, console: on, flags: flags({ reach: "local" }), deps: already.deps });
    expect(on.lines.join("\n")).toContain("runs after you log out");
    expect(on.lines.join("\n")).not.toContain("sudo loginctl");
  });

  it("from Chips.app, runs the app's own Node and names the app, so Login Items say Chips", async () => {
    const app = "/Applications/Chips.app/Contents/Resources/chips";
    const machine = world({
      answers: ["none", "chips"],
      release: { version: "0.2.0", root: app },
      command: [`${app}/runtime/node`, `${app}/lib/chips.mjs`],
      app: "chat.chips.desktop",
    });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "local" }),
      deps: machine.deps,
    });
    const plist = machine.files[PLIST] ?? "";
    expect(plist).toContain(
      `<string>${app}/runtime/node</string>\n    <string>${app}/lib/chips.mjs</string>\n    <string>serve</string>`,
    );
    expect(plist).toContain(
      "<key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>chat.chips.desktop</string>",
    );
    expect(plist).not.toContain("bin/chips");
  });

  it("says it all as one line of JSON, with nothing else on stdout", async () => {
    const out = scriptedConsole(true);
    const machine = world({ answers: ["none", "chips"] });
    await up({
      config,
      console: out,
      flags: flags({ reach: "lan", json: true }),
      deps: machine.deps,
    });
    expect(out.lines).toHaveLength(1);
    expect(JSON.parse(out.lines[0] ?? "")).toEqual({
      url: "http://127.0.0.1:4431",
      pair_link: "http://127.0.0.1:4431/#pair=CODE-1&v=1",
      phone_link: "chips://pair?pair=CODE-2&v=1&lan=http%3A%2F%2F100.64.0.7%3A4431",
      data_dir: DATA,
      log_file: `${HOME}/Library/Logs/Chips/chips.log`,
      service: "launchd",
      reach: "lan",
      already_running: false,
      created: true,
    });
  });

  it("asks who can reach it at a terminal, and takes the answer", async () => {
    const out = scriptedConsole(true);
    const machine = world({ answers: ["none", "chips"] });
    await up({ config, console: out, flags: flags({ interactive: true }), deps: machine.deps });
    expect(machine.asked).toEqual([
      [
        "Your devices, over Tailscale (found: 100.64.0.7)",
        "Devices on this Wi-Fi (10.0.0.96)",
        "Your devices, anywhere, through the Chips relay (encrypted end to end)",
        "Only this machine",
      ],
    ]);
    // On every address, naming none: the server says this Wi-Fi's as it is then (finding 4).
    expect(machine.files[PLIST]).toContain("<string>0.0.0.0</string>");
    expect(machine.files[PLIST]).not.toContain("CHIPS_PUBLIC_URL");
    expect(machine.files[PLIST]).not.toContain("CHIPS_RELAY_URL");
  });

  it("sets the Chips relay for the service when that is the answer (ADR 0245)", async () => {
    const machine = world({ answers: ["none", "chips"] });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "relay" }),
      deps: machine.deps,
    });
    const plist = machine.files[PLIST] ?? "";
    expect(plist).toContain("<key>CHIPS_RELAY_URL</key>");
    expect(plist).toContain("<string>wss://relay.chipschat.ai</string>");
    // And this Wi-Fi directly, for a phone at home, at whatever address it has then.
    expect(plist).toContain("<string>0.0.0.0</string>");
    expect(plist).not.toContain("CHIPS_PUBLIC_URL");
  });

  it("takes the recommended answer with --yes, and the safest with nobody to ask", async () => {
    const yes = world({ answers: ["none", "chips"] });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ yes: true }),
      deps: yes.deps,
    });
    expect(yes.files[PLIST]).toContain("http://100.64.0.7:4431");
    // With no tailnet the Chips relay is offered first, and waits to be chosen (ADR 0245).
    const noTailnet = world({
      answers: ["none", "chips"],
      networks: async () => ({ tailnet: undefined, lan: "10.0.0.96" }),
    });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ yes: true }),
      deps: noTailnet.deps,
    });
    expect(noTailnet.files[PLIST]).not.toContain("CHIPS_RELAY_URL");
    expect(noTailnet.files[PLIST]).toContain("<string>0.0.0.0</string>");
    const nobody = world({ answers: ["none", "chips"] });
    await up({ config, console: scriptedConsole(true), flags: flags(), deps: nobody.deps });
    expect(nobody.files[PLIST]).toContain("<string>127.0.0.1</string>");
    expect(nobody.files[PLIST]).not.toContain("CHIPS_PUBLIC_URL");
  });

  it("run again, only opens the browser and shows the code: nothing is asked, nothing but where it is written", async () => {
    const out = scriptedConsole(true);
    const machine = world({ answers: ["chips"] });
    const result = await up({
      config,
      console: out,
      flags: flags({ interactive: true }),
      deps: machine.deps,
    });
    expect(result.ok).toBe(true);
    expect(machine.asked).toEqual([]);
    // Only where it is, for a harness on this machine to find it (ADR 0122).
    expect(machine.files).toEqual({
      [`${HOME}/.config/chips/server.json`]: '{"url":"http://127.0.0.1:4431"}\n',
    });
    expect(machine.ran).toEqual([]);
    expect(out.lines.join("\n")).toContain("Chips is already running at http://127.0.0.1:4431");
    expect(machine.opened).toHaveLength(1);
  });

  it("leaves a launch agent it did not write alone, and says what to do", async () => {
    const out = scriptedConsole(true);
    const theirs = "<plist><dict><key>Label</key><string>chat.chips.serve</string></dict></plist>";
    const machine = world({ files: { [PLIST]: theirs } });
    const result = await up({
      config,
      console: out,
      flags: flags({ reach: "local" }),
      deps: machine.deps,
    });
    expect(result.ok).toBe(false);
    expect(machine.files[PLIST]).toBe(theirs);
    expect(machine.ran).toEqual([]);
    expect(out.lines.join("\n")).toContain("chips up --no-service");
  });

  it("says when the service did not come up, and where its log is", async () => {
    const out = scriptedConsole(true);
    const machine = world({ answers: ["none"] });
    const result = await up({
      config,
      console: out,
      flags: flags({ reach: "local" }),
      deps: machine.deps,
    });
    expect(result.ok).toBe(false);
    expect(out.lines.join("\n")).toContain(`${HOME}/Library/Logs/Chips/chips.log`);
  });

  it("stops when something else answers on the port", async () => {
    const out = scriptedConsole(true);
    const machine = world({ answers: ["other"] });
    expect((await up({ config, console: out, flags: flags(), deps: machine.deps })).ok).toBe(false);
    expect(out.lines.join("\n")).toContain("chips up --port");
  });

  it("refuses a --reach this machine cannot give", async () => {
    const out = scriptedConsole(true);
    const machine = world({ networks: async () => ({ tailnet: undefined, lan: "10.0.0.96" }) });
    const result = await up({
      config,
      console: out,
      flags: flags({ reach: "tailnet" }),
      deps: machine.deps,
    });
    expect(result.ok).toBe(false);
    expect(out.lines.join("\n")).toContain("not on a tailnet");
    expect(machine.files).toEqual({});
  });

  it("from a checkout, runs in this terminal; reachable only here, it offers no phone code", async () => {
    const out = scriptedConsole(true);
    let served: Record<string, unknown> | undefined;
    const serving = {
      issueCode: () => "ABC-234",
      offer: {},
      stop: async () => {},
    } as unknown as Serving;
    const machine = world({
      release: undefined,
      command: undefined,
      serve: async (options) => {
        served = options as unknown as Record<string, unknown>;
        return serving;
      },
    });
    const result = await up({
      config,
      console: out,
      flags: flags({ open: false }),
      deps: machine.deps,
    });
    expect(result.hold).toBe(true);
    expect(served?.["announce"]).toBe(false);
    expect((served?.["config"] as typeof config | undefined)?.server.host).toBe("127.0.0.1");
    const printed = out.lines.join("\n");
    expect(printed).toContain("from a checkout there is no login service");
    expect(printed).toContain("http://127.0.0.1:4431/#pair=ABC-234&v=1");
    expect(printed).toContain("no code for a phone");
    // `chips up` again would only find this one running: it has to be stopped first (finding 7).
    expect(printed).toContain("stop Chips\n  in its terminal (Ctrl-C) and run");
    // The relay is the way a phone gets in from anywhere, so it is named first.
    expect(printed).toContain("`chips up --reach relay` for the Chips relay");
    // No service file: only where the server is, for a harness here (ADR 0122).
    expect(Object.keys(machine.files)).toEqual([`${HOME}/.config/chips/server.json`]);
  });

  it("with a relay, shows the phone's code even reachable only here, and says it reaches from anywhere", async () => {
    const out = scriptedConsole(true);
    const relay = "wss://relay.chipschat.ai";
    // Given in the shell, as CHIPS_RELAY_URL reaches the configuration.
    const relayed = { ...machine, environment: { CHIPS_RELAY_URL: relay } };
    const here = world({
      answers: ["none", "chips"],
      machine: relayed,
      requestCode: async () => ({
        code: "CODE-1",
        url: "http://127.0.0.1:4431",
        relay,
        serverKey: "c2VydmVyLWtleQ",
      }),
    });
    await up({
      config: { ...config, relay: { ...config.relay, url: relay } },
      console: out,
      flags: flags({ reach: "local" }),
      deps: here.deps,
    });
    expect(here.files[PLIST]).toContain(`<string>${relay}</string>`);
    const printed = out.lines.join("\n");
    expect(printed).toContain("Reachable directly from this machine only");
    expect(printed).not.toContain("no code for a phone");
    expect(printed).toContain(
      "In the Chips app, scan this. It reaches Chips from anywhere, through the relay\n  at relay.chipschat.ai.",
    );

    const json = scriptedConsole(true);
    await up({
      config: { ...config, relay: { ...config.relay, url: relay } },
      console: json,
      flags: flags({ reach: "local", json: true }),
      deps: world({ answers: ["chips"], requestCode: here.deps.requestCode }).deps,
    });
    const phoneLink = String(JSON.parse(json.lines[0] ?? "")["phone_link"]);
    expect(new URL(phoneLink).searchParams.get("relay")).toBe(relay);
  });

  it("asks with the relay in mind: only this machine is not all that reaches it", async () => {
    const relay = "wss://relay.example.com";
    const here = world({
      answers: ["none", "chips"],
      machine: { ...machine, environment: { CHIPS_RELAY_URL: relay } },
    });
    await up({
      config: { ...config, relay: { ...config.relay, url: relay } },
      console: scriptedConsole(true),
      flags: flags({ interactive: true }),
      deps: here.deps,
    });
    expect(here.asked[0]?.at(-1)).toBe("Only this machine, and phones through the relay");
  });
});

/** The service's file as an earlier `chips up` wrote it, with these settings beside its own. */
function written(settings: Record<string, string>, kind: "launchd" | "systemd" = "launchd") {
  const spec = {
    command: [
      `${HOME}/.local/lib/chips/current/runtime/node`,
      `${HOME}/.local/lib/chips/current/lib/chips.mjs`,
    ] as const,
    logFile: `${HOME}/Library/Logs/Chips/chips.log`,
    environment: {
      CHIPS_HOST: "0.0.0.0",
      CHIPS_PORT: "4431",
      CHIPS_DATA_DIR: DATA,
      ...settings,
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    },
  };
  return kind === "launchd" ? launchdPlist(spec) : systemdUnit(spec);
}

const shell = (environment: Record<string, string>) => ({ ...machine, environment });

describe("the settings a service keeps (the new-person sweep's finding 6)", () => {
  it("run again with nothing new, leaves its service as it is", async () => {
    const before = written({ CHIPS_PUSH_ACCESS_TOKEN: "push-token" });
    const here = world({ answers: ["chips"], files: { [PLIST]: before } });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags({ interactive: true }), deps: here.deps });
    expect(here.files[PLIST]).toBe(before);
    expect(here.ran).toEqual([]);
    expect(here.asked).toEqual([]);
    expect(out.lines.join("\n")).toContain("Chips is already running");
  });

  it("run again with a setting exported, writes it in and restarts, asking nothing", async () => {
    const here = world({
      answers: ["chips"],
      machine: shell({ CHIPS_FFMPEG: "/opt/tools/ffmpeg" }),
      files: { [PLIST]: written({ CHIPS_PUSH_ACCESS_TOKEN: "push-token" }) },
    });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags({ interactive: true }), deps: here.deps });
    expect(here.asked).toEqual([]);
    expect(here.ran.map((command) => command[1])).toEqual(["enable", "bootout", "bootstrap"]);
    const after = serviceEnvironment(here.files[PLIST]);
    expect(after).toMatchObject({
      CHIPS_FFMPEG: "/opt/tools/ffmpeg",
      CHIPS_PUSH_ACCESS_TOKEN: "push-token",
      CHIPS_HOST: "0.0.0.0",
    });
    expect(out.lines.join("\n")).toContain(
      "✓ Restarted Chips with its changed settings: CHIPS_FFMPEG",
    );
  });

  it("run again after the install line put a new release in place, starts the server again on it", async () => {
    const before = written({ CHIPS_PUSH_ACCESS_TOKEN: "push-token" });
    const here = world({
      answers: ["chips"],
      files: { [PLIST]: before },
      runningVersion: async () => "0.1.9",
    });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags({ interactive: true }), deps: here.deps });
    expect(here.asked).toEqual([]);
    expect(here.ran.map((command) => command[1])).toEqual(["enable", "bootout", "bootstrap"]);
    // The same service, its settings as they were.
    expect(serviceEnvironment(here.files[PLIST])).toEqual(serviceEnvironment(before));
    expect(out.lines.join("\n")).toContain("✓ Started Chips again on 0.2.0 (it was 0.1.9)");
    expect(out.lines.join("\n")).not.toContain("changed settings");
  });

  it("leaves a server running this release as it is", async () => {
    const before = written({});
    const here = world({
      answers: ["chips"],
      files: { [PLIST]: before },
      runningVersion: async () => "0.2.0",
    });
    await up({ config, console: scriptedConsole(true), flags: flags(), deps: here.deps });
    expect(here.ran).toEqual([]);
  });

  it("carries what an earlier chips up was given into a new answer: the shell wins, and empty takes one out", async () => {
    const here = world({
      answers: ["chips"],
      machine: shell({ CHIPS_PUSH_ACCESS_TOKEN: "new-token", CHIPS_PUSH_URL: "" }),
      files: {
        [PLIST]: written({
          CHIPS_PUSH_ACCESS_TOKEN: "old-token",
          CHIPS_PUSH_URL: "https://exp.host/--/api/v2/push/send",
          CHIPS_ATTACHMENT_SECRET: "attachment-secret",
          CHIPS_RELAY_URL: "wss://relay.example.com",
        }),
      },
    });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "tailnet" }),
      deps: here.deps,
    });
    const after = serviceEnvironment(here.files[PLIST]);
    expect(after).toMatchObject({
      CHIPS_PUSH_ACCESS_TOKEN: "new-token",
      CHIPS_ATTACHMENT_SECRET: "attachment-secret",
      // A relay of the person's own stays; only the Chips relay is the answer's to say.
      CHIPS_RELAY_URL: "wss://relay.example.com",
      CHIPS_PUBLIC_URL: "http://100.64.0.7:4431",
    });
    expect(after).not.toHaveProperty("CHIPS_PUSH_URL");
  });

  it("drops a Wi-Fi address an older chips up froze in, and an answer's address with its answer", async () => {
    // Finding 4: an older `--reach lan` wrote this Wi-Fi's address. Run again, it goes.
    const frozen = world({
      answers: ["chips"],
      files: { [PLIST]: written({ CHIPS_PUBLIC_URL: "http://10.0.0.96:4431" }) },
    });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags(), deps: frozen.deps });
    expect(serviceEnvironment(frozen.files[PLIST])).not.toHaveProperty("CHIPS_PUBLIC_URL");
    expect(out.lines.join("\n")).toContain("changed settings: CHIPS_PUBLIC_URL");

    // Tailscale's address stays while Tailscale is the answer, and goes with it.
    const tailnet = written({ CHIPS_PUBLIC_URL: "http://100.64.0.7:4431" });
    const kept = world({ answers: ["chips"], files: { [PLIST]: tailnet } });
    await up({ config, console: scriptedConsole(true), flags: flags(), deps: kept.deps });
    expect(kept.files[PLIST]).toBe(tailnet);
    const moved = world({ answers: ["chips"], files: { [PLIST]: tailnet } });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "lan" }),
      deps: moved.deps,
    });
    expect(serviceEnvironment(moved.files[PLIST])).not.toHaveProperty("CHIPS_PUBLIC_URL");

    // The Chips relay goes with its answer too, and is set again by it.
    const relayed = written({ CHIPS_RELAY_URL: "wss://relay.chipschat.ai" });
    const again = world({ answers: ["chips"], files: { [PLIST]: relayed } });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "relay" }),
      deps: again.deps,
    });
    expect(serviceEnvironment(again.files[PLIST])["CHIPS_RELAY_URL"]).toBe(
      "wss://relay.chipschat.ai",
    );
  });

  it("keeps an address of the person's own over the answer's, and one in the shell over both", async () => {
    const own = world({
      answers: ["chips"],
      files: { [PLIST]: written({ CHIPS_PUBLIC_URL: "https://chips.example.com" }) },
    });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "tailnet" }),
      deps: own.deps,
    });
    expect(serviceEnvironment(own.files[PLIST])["CHIPS_PUBLIC_URL"]).toBe(
      "https://chips.example.com",
    );

    const named = world({
      answers: ["none", "chips"],
      machine: shell({ CHIPS_PUBLIC_URL: "https://my-mac.example.ts.net" }),
    });
    await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "tailnet" }),
      deps: named.deps,
    });
    expect(serviceEnvironment(named.files[PLIST])["CHIPS_PUBLIC_URL"]).toBe(
      "https://my-mac.example.ts.net",
    );
  });

  it("reads a Linux unit back the same way", async () => {
    const linux = {
      platform: "linux",
      home: "/home/ada",
      environment: { CHIPS_LOG_LEVEL: "debug" },
    };
    const unit = "/home/ada/.config/systemd/user/chips.service";
    const here = world({
      answers: ["chips"],
      machine: linux,
      files: { [unit]: written({ CHIPS_FFMPEG: '/opt/my "tools"/50%/ffmpeg' }, "systemd") },
    });
    await up({ config, console: scriptedConsole(true), flags: flags(), deps: here.deps });
    expect(here.ran[0]).toEqual(["systemctl", "--user", "daemon-reload"]);
    expect(serviceEnvironment(here.files[unit])).toMatchObject({
      CHIPS_FFMPEG: '/opt/my "tools"/50%/ffmpeg',
      CHIPS_LOG_LEVEL: "debug",
      CHIPS_HOST: "0.0.0.0",
    });
  });

  it("reads back the answer a file was written with", () => {
    expect(keptAnswer({ CHIPS_HOST: "0.0.0.0" })).toEqual({
      reach: "lan",
      host: "0.0.0.0",
      publicUrl: undefined,
      relay: undefined,
    });
    expect(
      keptAnswer({ CHIPS_HOST: "0.0.0.0", CHIPS_PUBLIC_URL: "http://10.0.0.96:4431" }),
    ).toMatchObject({ reach: "lan", publicUrl: undefined });
    expect(
      keptAnswer({ CHIPS_HOST: "0.0.0.0", CHIPS_PUBLIC_URL: "http://100.64.0.7:4431" }),
    ).toMatchObject({ reach: "tailnet", publicUrl: "http://100.64.0.7:4431" });
    expect(keptAnswer({ CHIPS_HOST: "100.64.0.7" })).toMatchObject({ reach: "tailnet" });
    expect(
      keptAnswer({ CHIPS_HOST: "127.0.0.1", CHIPS_RELAY_URL: "wss://relay.chipschat.ai" }),
    ).toMatchObject({ reach: "relay", relay: "wss://relay.chipschat.ai" });
    expect(keptAnswer({})).toMatchObject({ reach: "local", host: "127.0.0.1" });
  });

  it("carries only Chips's settings from the shell, and nothing set empty", () => {
    expect(
      carriedSettings(
        { CHIPS_FFMPEG: "/f", CHIPS_PUSH_URL: "", EDITOR: "vi" },
        { CHIPS_PUSH_URL: "https://p", CHIPS_HOST: "0.0.0.0", HTTPS_PROXY: "http://proxy" },
      ),
    ).toEqual({ CHIPS_FFMPEG: "/f", HTTPS_PROXY: "http://proxy" });
  });
});

describe("a Chips already running in a terminal (the new-person sweep's finding 7)", () => {
  const loopbackCode = async () => ({
    code: "CODE-1",
    url: "http://127.0.0.1:4431",
    relay: undefined,
    serverKey: undefined,
  });

  it("says --reach can't change it, and to stop it there and run chips up again", async () => {
    const here = world({ answers: ["chips"], requestCode: loopbackCode });
    const out = scriptedConsole(true);
    const result = await up({
      config,
      console: out,
      flags: flags({ reach: "lan" }),
      deps: here.deps,
    });
    expect(result.ok).toBe(true);
    expect(here.ran).toEqual([]);
    const printed = out.lines.join("\n");
    expect(printed).toContain(
      "! It runs in a terminal, so `--reach` can't change it. Stop it there (Ctrl-C) and run the\n    same `chips up` again.",
    );
    // Said once: the phone's line doesn't repeat it.
    expect(printed).toContain("so there is no code for a phone.\n");
    expect(printed).not.toContain("To add one");
  });

  it("with no --reach, says a phone needs it stopped first", async () => {
    const here = world({ answers: ["chips"], requestCode: loopbackCode });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags(), deps: here.deps });
    expect(out.lines.join("\n")).toContain(
      "To add one, stop Chips\n  in its terminal (Ctrl-C) and run `chips up --reach relay`",
    );
  });

  it("says --no-service leaves this machine's service as it is", async () => {
    const here = world({
      answers: ["chips"],
      requestCode: loopbackCode,
      files: { [PLIST]: written({}) },
    });
    const out = scriptedConsole(true);
    await up({
      config,
      console: out,
      flags: flags({ reach: "relay", service: false }),
      deps: here.deps,
    });
    expect(here.ran).toEqual([]);
    expect(out.lines.join("\n")).toContain(
      "It runs as this machine's service, which `--no-service` leaves as it is.",
    );
  });
});

describe("where the browser is (the new-person sweep's finding 16)", () => {
  it("is over SSH, nowhere on Linux with no display, and here otherwise", () => {
    const at = (platform: string, environment: Record<string, string>) =>
      browserFor({ platform, home: HOME, environment });
    expect(at("darwin", {})).toBe("here");
    expect(at("darwin", { SSH_CONNECTION: "203.0.113.9 50000 10.0.0.96 22" })).toBe("ssh");
    expect(at("linux", { SSH_TTY: "/dev/pts/0", DISPLAY: ":0" })).toBe("ssh");
    expect(at("linux", {})).toBe("none");
    expect(at("linux", { WAYLAND_DISPLAY: "wayland-0" })).toBe("here");
  });

  it("over SSH opens nothing, and prints the tunnel and the link for the person's own computer", async () => {
    const here = world({
      answers: ["none", "chips"],
      machine: shell({ SSH_CONNECTION: "203.0.113.9 50000 10.0.0.96 22" }),
    });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags({ reach: "lan" }), deps: here.deps });
    expect(here.opened).toEqual([]);
    expect(out.lines.join("\n")).toContain(
      [
        "  To pair a browser, run this on your own computer, then open the link there:",
        "    ssh -L 4431:127.0.0.1:4431 <this machine>",
        "    http://127.0.0.1:4431/#pair=CODE-1&v=1",
      ].join("\n"),
    );
  });

  it("on Linux with no display opens nothing, and prints the link", async () => {
    const here = world({
      answers: ["none", "chips"],
      machine: { platform: "linux", home: "/home/ada", environment: {} },
    });
    const out = scriptedConsole(true);
    await up({ config, console: out, flags: flags({ reach: "local" }), deps: here.deps });
    expect(here.opened).toEqual([]);
    expect(out.lines.join("\n")).toContain(
      "Open this in a browser on this machine to pair it:\n    http://127.0.0.1:4431/#pair=CODE-1&v=1",
    );
  });
});

describe("on a VPS (the new-person sweep's findings 17 and 23)", () => {
  it("binds the tailnet address alone with no home network, and finds Chips there", async () => {
    const asked: string[] = [];
    let started = false;
    const here = world({
      machine: { platform: "linux", home: "/home/ada", environment: {} },
      networks: async () => ({ tailnet: "100.64.0.7", lan: undefined }),
      health: async (url) => {
        asked.push(url);
        return started && url === "http://100.64.0.7:4431" ? "chips" : "none";
      },
      run: async (command) => {
        if (command[1] === "--user" && command[2] === "restart") started = true;
        return { ok: true, output: "" };
      },
      requestCode: async (operator) => {
        asked.push(`code from ${operator.serverUrl}`);
        return {
          code: "CODE-1",
          url: "http://100.64.0.7:4431",
          relay: undefined,
          serverKey: undefined,
        };
      },
    });
    const result = await up({
      config,
      console: scriptedConsole(true),
      flags: flags({ reach: "tailnet" }),
      deps: here.deps,
    });
    expect(result.ok).toBe(true);
    const unit = here.files["/home/ada/.config/systemd/user/chips.service"];
    expect(serviceEnvironment(unit)["CHIPS_HOST"]).toBe("100.64.0.7");
    expect(asked).toContain("code from http://100.64.0.7:4431");
    expect(here.files[`${HOME}/.config/chips/server.json`]).toBe(
      '{"url":"http://100.64.0.7:4431"}\n',
    );
  });

  it("with no user systemd session, says what failed and to run it in the terminal", async () => {
    const here = world({
      machine: { platform: "linux", home: "/home/ada", environment: {} },
      run: async (command) =>
        command[0] === "systemctl"
          ? { ok: false, output: "Failed to connect to bus: No medium found\n" }
          : { ok: true, output: "" },
    });
    const out = scriptedConsole(true);
    const result = await up({
      config,
      console: out,
      flags: flags({ reach: "local" }),
      deps: here.deps,
    });
    expect(result.ok).toBe(false);
    const printed = out.lines.join("\n");
    expect(printed).toContain(
      "`systemctl --user daemon-reload` failed: Failed to connect to bus: No medium found\nThis shell has no systemd user session",
    );
    expect(printed).toContain("`chips up --no-service` to run Chips in this terminal");
  });
});
