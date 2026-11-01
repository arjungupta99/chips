import { GRANTABLE, JOIN_ASKS_PER_MINUTE, joinState } from "@chipschat/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAskCounter, granted, onThisNetwork, stateAt, unknownCapabilities } from "./join.js";

const instant = fc.integer({ min: Date.parse("2026-01-01"), max: Date.parse("2027-01-01") });

describe("a join request's state at a moment", () => {
  it("is what was stored until its expiry, and expired after it, unless it was decided or spent", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...joinState.options),
        instant,
        instant,
        (state, expires, now) => {
          const read = stateAt({ state, expiresAt: new Date(expires).toISOString() }, now);
          const live = state === "waiting" || state === "allowed";
          expect(read).toBe(live && expires <= now ? "expired" : state);
        },
      ),
    );
  });

  it("never turns a redeemed request back into anything else", () => {
    fc.assert(
      fc.property(instant, instant, (expires, now) => {
        expect(
          stateAt({ state: "redeemed", expiresAt: new Date(expires).toISOString() }, now),
        ).toBe("redeemed");
      }),
    );
  });
});

describe("where a device may ask from", () => {
  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["10.0.0.41", true],
    ["172.16.4.2", true],
    ["172.31.255.255", true],
    ["192.168.1.41", true],
    ["169.254.10.1", true],
    ["100.64.0.7", true],
    ["fd7a:115c:a1e0::1", true],
    ["fe80::1", true],
    ["172.32.0.1", false],
    ["100.128.0.1", false],
    ["8.8.8.8", false],
    ["2a01:4f8::1", false],
    ["relay:1.2.3.4", false],
    ["", false],
    [undefined, false],
  ])("%s: %s", (address, expected) => {
    expect(onThisNetwork(address)).toBe(expected);
  });

  it("is never an address on the open internet", () => {
    const publicV4 = fc
      .tuple(fc.integer({ min: 1, max: 223 }), fc.nat(255), fc.nat(255), fc.nat(255))
      .filter(([a, b]) => ![10, 127, 169, 172, 192, 100].includes(a) || (a === 172 && b > 31))
      .map((parts) => parts.join("."));
    fc.assert(
      fc.property(publicV4, (address) => {
        expect(onThisNetwork(address)).toBe(false);
      }),
    );
  });
});

describe("what a person grants", () => {
  const names = fc.array(fc.constantFrom(...GRANTABLE, "teleport", "root"), { maxLength: 12 });

  it("is only what they chose, of what may be granted, of what was asked, each once", () => {
    fc.assert(
      fc.property(names, fc.option(names, { nil: undefined }), (chosen, asked) => {
        const result = granted(chosen, asked);
        expect(new Set(result).size).toBe(result.length);
        for (const each of result) {
          expect(chosen).toContain(each);
          expect(GRANTABLE).toContain(each);
          if (asked !== undefined) expect(asked).toContain(each);
        }
      }),
    );
  });

  it("names what is not a capability", () => {
    expect(unknownCapabilities(["autonomy", "teleport"])).toEqual(["teleport"]);
  });
});

describe("ten asks a minute from one address", () => {
  it("never lets more than the allowance through in any minute", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(5000), { maxLength: 60 }), (gaps) => {
        const counter = createAskCounter();
        let at = Date.parse("2026-10-05T21:00:00Z");
        const letThrough: number[] = [];
        for (const gap of gaps) {
          at += gap;
          if (counter.note("100.88.4.12", at) === undefined) letThrough.push(at);
        }
        for (const [index, start] of letThrough.entries()) {
          const within = letThrough.slice(index).filter((each) => each < start + 60_000);
          expect(within.length).toBeLessThanOrEqual(JOIN_ASKS_PER_MINUTE);
        }
      }),
    );
  });

  it("counts each address on its own, and says how long to wait", () => {
    const counter = createAskCounter(2);
    const at = 1_000_000;
    expect(counter.note("a", at)).toBeUndefined();
    expect(counter.note("a", at + 1)).toBeUndefined();
    expect(counter.note("a", at + 2)).toBe(60);
    expect(counter.note("b", at + 3)).toBeUndefined();
    expect(counter.note("a", at + 60_001)).toBeUndefined();
  });
});
