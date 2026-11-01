/**
 * Chips for Mac's page reaches a Chips wherever it runs (MAC-4): on this Mac, on the Wi-Fi, or
 * through a relay, each on a port of its own (4431 by default). A CSP source with no port matches
 * only its scheme's default, 80 or 443, so `http://*` let the page reach the relay and nothing
 * else: pairing with a server on 4431 said "Pairing failed." and sent nothing. Each network source
 * the app's `connect-src` names carries a port, `*` where any will do.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONFIG = fileURLToPath(
  new URL("../../apps/desktop/src-tauri/tauri.conf.json", import.meta.url),
);

/** The sources one directive of the app's CSP names. */
function sources(directive: string): readonly string[] {
  const config = JSON.parse(readFileSync(CONFIG, "utf8")) as {
    app: { security: { csp: string } };
  };
  const found = config.app.security.csp
    .split(";")
    .map((each) => each.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return found?.slice(1) ?? [];
}

describe("Chips for Mac's connect-src (MAC-4)", () => {
  it("reaches a server on any port, over HTTP and its socket, plain or secure", () => {
    expect(sources("connect-src")).toEqual(
      expect.arrayContaining(["http://*:*", "https://*:*", "ws://*:*", "wss://*:*"]),
    );
  });

  it("names no network source without a port, which would mean 80 or 443 alone", () => {
    const network = sources("connect-src").filter((source) => /^(?:https?|wss?):\/\//.test(source));
    const portless = network.filter(
      (source) => source !== "http://ipc.localhost" && !/:(?:\*|\d+)$/.test(source),
    );
    expect(portless).toEqual([]);
  });
});
