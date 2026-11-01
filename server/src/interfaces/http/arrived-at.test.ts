/**
 * Where a request arrived when it came from this machine straight to the port: the address a
 * harness beside the server is handed back, so it never leans on the tailnet to reach it.
 */

import { describe, expect, it } from "vitest";
import { loopbackOrigin } from "./arrived-at.js";

describe("the address a request arrived at from this machine", () => {
  it("is the loopback host it asked for, from a loopback peer", () => {
    const at = (peer: string, host: string) => loopbackOrigin({ peer, host, forwarded: false });
    expect(at("127.0.0.1", "127.0.0.1:4431")).toBe("http://127.0.0.1:4431");
    expect(at("::ffff:127.0.0.1", "localhost:4431")).toBe("http://localhost:4431");
    expect(at("::1", "[::1]:4431")).toBe("http://[::1]:4431");
  });

  it("is nothing from another machine, for another host, or through a proxy that says so", () => {
    expect(
      loopbackOrigin({ peer: "100.101.102.103", host: "127.0.0.1:4431", forwarded: false }),
    ).toBeUndefined();
    // Tailscale Serve reaches the port from loopback, asking for the tailnet name.
    expect(
      loopbackOrigin({ peer: "127.0.0.1", host: "mini.tail0000.ts.net", forwarded: false }),
    ).toBeUndefined();
    expect(
      loopbackOrigin({ peer: "127.0.0.1", host: "127.0.0.1:4431", forwarded: true }),
    ).toBeUndefined();
    expect(
      loopbackOrigin({ peer: undefined, host: "127.0.0.1:4431", forwarded: false }),
    ).toBeUndefined();
    expect(
      loopbackOrigin({ peer: "127.0.0.1", host: undefined, forwarded: false }),
    ).toBeUndefined();
    expect(loopbackOrigin({ peer: "127.0.0.1", host: "a b", forwarded: false })).toBeUndefined();
  });
});
