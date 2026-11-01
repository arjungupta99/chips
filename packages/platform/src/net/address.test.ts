/**
 * What one address is counted as: IPv4 as itself, an IPv4-mapped address as the IPv4 it
 * carries, a Tailscale address as itself, any other IPv6 address as its /64, and anything else as
 * it was given (ADR 0056).
 */

import { describe, expect, it } from "vitest";
import { countedAs } from "./address.js";

describe("countedAs", () => {
  it("counts an IPv4 address as itself", () => {
    expect(countedAs("203.0.113.5")).toBe("203.0.113.5");
    expect(countedAs("100.64.0.7")).toBe("100.64.0.7");
  });

  it("counts an IPv4-mapped IPv6 address as the IPv4 address it carries, however it is written", () => {
    expect(countedAs("::ffff:192.0.2.1")).toBe("192.0.2.1");
    expect(countedAs("::FFFF:c000:0201")).toBe("192.0.2.1");
    expect(countedAs("0:0:0:0:0:ffff:192.0.2.255")).toBe("192.0.2.255");
  });

  it("counts every address in one /64 as the same, however it is written", () => {
    const one = [
      "2001:db8:1:2::1",
      "2001:DB8:1:2:ffff:ffff:ffff:ffff",
      "2001:0db8:0001:0002:0000:0000:0000:0000",
      "2001:db8:1:2:dead:beef::",
      "2001:db8:1:2::c000:201",
      "2001:db8:1:2::192.0.2.1",
    ];
    expect(new Set(one.map(countedAs))).toEqual(new Set(["2001:db8:1:2::/64"]));
    expect(countedAs("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(countedAs("fe80::1%en0")).toBe("fe80:0:0:0::/64");
    expect(countedAs("::")).toBe("0:0:0:0::/64");
  });

  it("counts a Tailscale address as itself, since a whole tailnet shares one /64", () => {
    const phone = countedAs("fd7a:115c:a1e0::6465:6667");
    const laptop = countedAs("fd7a:115c:a1e0::6465:6668");
    expect(phone).toBe("fd7a:115c:a1e0:0:0:0:6465:6667");
    expect(laptop).not.toBe(phone);
    // The older scheme's single /64, `fd7a:115c:a1e0:ab12::/64`, is inside the same /48.
    expect(countedAs("fd7a:115c:a1e0:ab12:4843:cd96:6258:b240")).toBe(
      "fd7a:115c:a1e0:ab12:4843:cd96:6258:b240",
    );
    // Any other unique local address is a /64 like the rest.
    expect(countedAs("fd00:1:2:3::4")).toBe("fd00:1:2:3::/64");
  });

  it("leaves anything that is not an address as it was given", () => {
    for (const word of ["local", "[2001:db8::1]:443", "203.0.113.5:8080", "unknown", ""]) {
      expect(countedAs(word)).toBe(word);
    }
  });
});
