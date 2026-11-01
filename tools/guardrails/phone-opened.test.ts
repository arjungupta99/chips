/**
 * `pnpm phone`'s other way of seeing the phone come back (`tools/phone/opened.mjs`): the devices
 * that opened a socket, read from the server's log, since the registry's last seen is written at
 * most once a minute.
 */

import { describe, expect, it } from "vitest";
import { devicesThatOpened } from "../phone/opened.mjs";

const ESC = String.fromCharCode(27);

/** An entry as the launch agent's log has it: pino-pretty, in colour. */
function pretty(time: string, message: string, fields: Record<string, string | number>): string {
  const head = `[${time}] ${ESC}[32mINFO${ESC}[39m (chips): ${ESC}[36m${message}${ESC}[39m`;
  const lines = Object.entries(fields).map(([key, value]) =>
    typeof value === "number" ? `    ${key}: ${value}` : `    ${key}: "${value}"`,
  );
  return [head, ...lines].join("\n");
}

describe("the devices that opened a socket", () => {
  it("are read from the log's entries, in order, the harnesses' left out", () => {
    const log = [
      pretty("08:26:12.491", "tunnel open", { relaySession: "9b6e" }),
      pretty("08:26:13.455", "socket open", {
        workspaceId: "ws_1",
        deviceId: "dev_phone",
        sessions: 3,
        via: "relay",
      }),
      pretty("08:26:13.460", "socket open", {
        workspaceId: "ws_1",
        harnessId: "har_j",
        sessions: 4,
      }),
      pretty("08:26:14.001", "hello negotiated", { workspaceId: "ws_1", deviceId: "dev_other" }),
      pretty("08:27:03.778", "socket open", {
        workspaceId: "ws_1",
        deviceId: "dev_mac",
        via: "socket",
      }),
      "",
    ].join("\n");
    expect(devicesThatOpened(log)).toEqual(["dev_phone", "dev_mac"]);
  });

  it("reads JSON lines too, and a log cut mid-entry", () => {
    const log = [
      '    via: "relay"',
      JSON.stringify({ level: 30, msg: "socket open", deviceId: "dev_phone", via: "relay" }),
      JSON.stringify({ level: 30, msg: "socket closed", deviceId: "dev_phone" }),
      "not a line anybody wrote",
    ].join("\n");
    expect(devicesThatOpened(log)).toEqual(["dev_phone"]);
  });

  it("finds nothing in a log from before sockets named their device", () => {
    expect(
      devicesThatOpened(
        pretty("22:34:02.579", "socket open", { workspaceId: "ws_1", via: "relay" }),
      ),
    ).toEqual([]);
    expect(devicesThatOpened("")).toEqual([]);
  });
});
