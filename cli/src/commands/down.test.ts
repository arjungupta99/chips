import { describe, expect, it } from "vitest";
import { scriptedConsole } from "../output.js";
import type { Command } from "../service.js";
import { launchdPlist } from "../service.js";
import { down } from "./down.js";

const machine = { platform: "darwin", home: "/Users/ada", environment: {} };
const PLIST = "/Users/ada/Library/LaunchAgents/chat.chips.serve.plist";
const ours = launchdPlist({ command: ["/x/runtime/node"], logFile: "/x.log", environment: {} });

function deps(file: string | undefined) {
  const ran: Command[] = [];
  return {
    ran,
    deps: {
      machine,
      uid: 501,
      readFile: (path: string) => (path === PLIST ? file : undefined),
      run: async (command: Command) => {
        ran.push(command);
        return { ok: true, output: "" };
      },
    },
  };
}

describe("chips down", () => {
  it("stops its own service and keeps it from starting at login", async () => {
    const out = scriptedConsole(true);
    const machine = deps(ours);
    expect(await down(out, machine.deps)).toBe(true);
    expect(machine.ran.map((command) => command[1])).toEqual(["bootout", "disable"]);
    expect(out.lines.join("\n")).toContain("will not start at login");
  });

  it("touches a service somebody else wrote not at all", async () => {
    const machine = deps("<plist>theirs</plist>");
    expect(await down(scriptedConsole(true), machine.deps)).toBe(false);
    expect(machine.ran).toEqual([]);
  });

  it("says there is nothing to stop when there is no service", async () => {
    const out = scriptedConsole(true);
    const machine = deps(undefined);
    expect(await down(out, machine.deps)).toBe(true);
    expect(machine.ran).toEqual([]);
    expect(out.lines.join("\n")).toContain("Ctrl-C");
  });
});
