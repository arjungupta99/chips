/**
 * `chips relay`: the switchboard from the same binary, on the port the configuration names, and
 * the two addresses it prints are the ones a server and a phone dial.
 */

import { defaultConfig } from "@chipschat/platform";
import { afterEach, describe, expect, it } from "vitest";
import { scriptedConsole } from "../output.js";
import { relay } from "./relay.js";

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

describe("chips relay", () => {
  it("listens where the configuration says, and prints the doors", async () => {
    const base = defaultConfig();
    const out = scriptedConsole(true);
    const running = await relay({
      config: {
        ...base,
        relay: { ...base.relay, host: "127.0.0.1", port: 0, maxSessionsPerServer: 3 },
        log: { ...base.log, level: "silent" },
      },
      console: out,
    });
    stops.push(running.close);
    expect(running.port).toBeGreaterThan(0);
    expect(running.url).toBe(`ws://127.0.0.1:${running.port}`);
    const printed = out.lines.join("\n");
    expect(printed).toContain("Chips Relay is running");
    expect(printed).toContain(`${running.url}/v1/serve`);
    expect(printed).toContain(`${running.url}/v1/connect`);
    expect(printed).toContain(`CHIPS_RELAY_URL=${running.url}`);
    expect(printed).toContain("any server that proves its key");
    const health = await fetch(`http://127.0.0.1:${running.port}/health`);
    expect(await health.json()).toMatchObject({ status: "ok", name: "chips-relay", servers: 0 });
  });

  it("says when it serves a list, and answers health with the release's version", async () => {
    const base = defaultConfig();
    const out = scriptedConsole(true);
    const running = await relay({
      config: {
        ...base,
        relay: { ...base.relay, port: 0, allowKeys: ["a".repeat(43), "b".repeat(43)] },
        log: { ...base.log, level: "silent" },
      },
      console: out,
      version: "0.3.0",
    });
    stops.push(running.close);
    expect(out.lines.join("\n")).toContain("the 2 servers in CHIPS_RELAY_ALLOW_KEYS");
    const health = await fetch(`http://127.0.0.1:${running.port}/health`);
    expect(await health.json()).toMatchObject({ version: "0.3.0" });
  });
});
