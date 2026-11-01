import { describe, expect, it } from "vitest";
import { shareLinkOf } from "./direct-asks.js";

describe("a Tailscale share link", () => {
  it("is taken, trimmed, from tailscale.com and its names on https", () => {
    expect(shareLinkOf(" https://login.tailscale.com/admin/invite/a ")).toBe(
      "https://login.tailscale.com/admin/invite/a",
    );
    expect(shareLinkOf("https://tailscale.com/x")).toBe("https://tailscale.com/x");
    expect(shareLinkOf("https://tailscale.com")).toBe("https://tailscale.com");
    expect(shareLinkOf("HTTPS://Login.Tailscale.com/x?y=1")).toBe(
      "HTTPS://Login.Tailscale.com/x?y=1",
    );
  });

  it("is refused for anything that only looks like it", () => {
    for (const text of [
      "https://tailscale.com.evil.io/x",
      "https://nottailscale.com/x",
      "http://login.tailscale.com/x",
      "https://evil.io@login.tailscale.com/x",
      "https://login.tailscale.com@evil.io/x",
      "https://login.tailscale.com:8443/x",
      "https://login.tailscale.com/a b",
      "not a link",
      "",
      `https://tailscale.com/${"a".repeat(2048)}`,
    ]) {
      expect(shareLinkOf(text), text).toBeUndefined();
    }
  });
});
