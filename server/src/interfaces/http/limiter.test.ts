/**
 * Where a request came from, for the limiter: the relay's word for a request through it, the
 * door's socket for one through the tunnel on this network (ADR 0191), a proxy's on this machine
 * for one it forwarded, the socket's for one on the port, and one bucket for a request with none
 * of those, each counted as `countedAs` says (ADR 0056). Then the limiter itself:
 * five wrong answers a minute from one address, held from the moment they arrive, a bounded
 * memory, and one a minute each while a door is strained.
 */

import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import type { GatewayEnv } from "./context.js";
import { HttpError } from "./errors.js";
import {
  addressOf,
  createLimiter,
  type Limiter,
  REMEMBERED_ADDRESSES,
  WRONG_ANSWERS_PER_MINUTE,
} from "./limiter.js";

const context = (env: unknown, headers: Record<string, string> = {}) =>
  ({ env, req: { header: (name: string) => headers[name] } }) as unknown as Context<GatewayEnv>;

/** A request on the port from `peer`, the way `@hono/node-server` hands over the socket. */
const from = (peer: string, headers: Record<string, string> = {}) =>
  context({ incoming: { socket: { remoteAddress: peer } } }, headers);

describe("addressOf", () => {
  it("takes the address the relay saw for a tunnelled request", () => {
    expect(addressOf(context({ relay: { from: "203.0.113.5" } }))).toBe("relay:203.0.113.5");
  });

  it("takes the socket's address for a request on the port", () => {
    expect(addressOf(from("100.64.0.7"))).toBe("100.64.0.7");
    expect(addressOf(from("127.0.0.1"))).toBe("127.0.0.1");
  });

  it("takes the door's own peer for a request through the tunnel on this network, counted as one on the port (ADR 0191)", () => {
    expect(addressOf(context({ lan: { from: "192.168.1.41" } }))).toBe("192.168.1.41");
    expect(addressOf(context({ lan: { from: "::ffff:192.168.1.41" } }))).toBe("192.168.1.41");
    expect(addressOf(context({ lan: { from: "2001:db8:1:2::9" } }))).toBe("2001:db8:1:2::/64");
    expect(addressOf(context({ lan: { from: "" } }))).toBe("local");
  });

  it("takes a proxy on this machine at its word for who asked, as Tailscale Serve says it", () => {
    for (const loopback of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(addressOf(from(loopback, { "x-forwarded-for": "100.64.0.7" }))).toBe("100.64.0.7");
    }
    // What the caller sent comes first; the proxy's own entry is the last.
    expect(addressOf(from("127.0.0.1", { "x-forwarded-for": "10.9.9.9, 100.64.0.8" }))).toBe(
      "100.64.0.8",
    );
    expect(addressOf(from("127.0.0.1", { "x-forwarded-for": " " }))).toBe("127.0.0.1");
  });

  it("does not read the header from anywhere but this machine, where it is the caller's own claim", () => {
    expect(addressOf(from("100.64.0.9", { "x-forwarded-for": "100.64.0.99" }))).toBe("100.64.0.9");
  });

  it("counts an IPv6 address by its /64, from the socket, from a proxy on this machine and from the relay", () => {
    expect(addressOf(from("2001:db8:1:2::77"))).toBe("2001:db8:1:2::/64");
    expect(addressOf(from("::1", { "x-forwarded-for": "2001:db8:1:2:aaaa::1" }))).toBe(
      "2001:db8:1:2::/64",
    );
    expect(addressOf(context({ relay: { from: "2001:db8:1:2::9" } }))).toBe(
      "relay:2001:db8:1:2::/64",
    );
    // A tailnet device behind Serve is still itself.
    expect(addressOf(from("127.0.0.1", { "x-forwarded-for": "fd7a:115c:a1e0::6465:6667" }))).toBe(
      "fd7a:115c:a1e0:0:0:0:6465:6667",
    );
    // An IPv4 peer on a dual-stack socket is the IPv4 address.
    expect(addressOf(from("::ffff:203.0.113.5"))).toBe("203.0.113.5");
  });

  it("falls to one bucket when there is no socket and no relay to ask", () => {
    expect(addressOf(context(undefined))).toBe("local");
    expect(addressOf(context({}))).toBe("local");
    expect(addressOf(context({ relay: { from: "" } }))).toBe("local");
  });
});

/** A clock the test moves. */
function clock(start = 1_000_000) {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

/** One answer from `address`, right or wrong; a refusal comes back as its HttpError. */
async function answer(
  limiter: Limiter,
  address: string,
  right = false,
): Promise<HttpError | "heard"> {
  try {
    await limiter.attempt(address, (wrong) => {
      if (!right) wrong();
    });
    return "heard";
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
}

describe("createLimiter", () => {
  it("hears five wrong answers a minute from one address, then says when the oldest is a minute old", async () => {
    const time = clock();
    const limiter = createLimiter(time.now, { message: "Wait." });
    for (let i = 0; i < WRONG_ANSWERS_PER_MINUTE; i += 1) {
      expect(await answer(limiter, "203.0.113.5")).toBe("heard");
      time.advance(10_000);
    }
    const refused = await answer(limiter, "203.0.113.5");
    expect(refused).toMatchObject({
      code: "rate_limited",
      message: "Wait.",
      retryAfterSeconds: 10,
    });
    expect(await answer(limiter, "203.0.113.6")).toBe("heard");

    time.advance(10_000);
    expect(await answer(limiter, "203.0.113.5")).toBe("heard");
    expect(await answer(limiter, "203.0.113.5")).toMatchObject({ code: "rate_limited" });
  });

  it("does not count a right answer, or one it never got to hear", async () => {
    const limiter = createLimiter(clock().now, { message: "Wait." });
    for (let i = 0; i < 20; i += 1)
      expect(await answer(limiter, "203.0.113.5", true)).toBe("heard");
    await expect(
      limiter.attempt("203.0.113.5", () => {
        throw new HttpError("invalid_event", "Not JSON.");
      }),
    ).rejects.toMatchObject({ code: "invalid_event" });
    expect(limiter.remembered()).toBe(0);
  });

  it("holds a place for an answer from the moment it arrives, so answers sent at once cannot outrun it", async () => {
    const limiter = createLimiter(clock().now, { message: "Wait." });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = Array.from({ length: WRONG_ANSWERS_PER_MINUTE }, () =>
      limiter.attempt("203.0.113.5", async (wrong) => {
        await gate;
        wrong();
      }),
    );
    // Nothing has come back wrong yet, and the sixth is already refused, for a moment.
    expect(await answer(limiter, "203.0.113.5")).toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 1,
    });
    release();
    await Promise.all(held);
    expect(await answer(limiter, "203.0.113.5")).toMatchObject({ retryAfterSeconds: 60 });
  });

  it("forgets an address a minute after its last wrong answer, without that address coming back", async () => {
    const time = clock();
    const limiter = createLimiter(time.now, { message: "Wait." });
    for (let i = 0; i < 1000; i += 1) await answer(limiter, `2001:db8:${i.toString(16)}::/64`);
    expect(limiter.remembered()).toBe(1000);
    time.advance(60_000);
    await answer(limiter, "203.0.113.5");
    expect(limiter.remembered()).toBe(1);
  });

  it("holds no more than it is allowed to, forgetting whoever answered wrong longest ago", async () => {
    expect(REMEMBERED_ADDRESSES).toBe(10_000);
    const limiter = createLimiter(clock().now, { message: "Wait.", remember: 3 });
    for (let i = 0; i < WRONG_ANSWERS_PER_MINUTE; i += 1) await answer(limiter, "203.0.113.1");
    await answer(limiter, "203.0.113.2");
    await answer(limiter, "203.0.113.3");
    expect(await answer(limiter, "203.0.113.1")).toMatchObject({ code: "rate_limited" });

    await answer(limiter, "203.0.113.4");
    expect(limiter.remembered()).toBe(3);
    expect(await answer(limiter, "203.0.113.1")).toBe("heard");
  });

  it("while strained, allows every address one wrong answer a minute, and still hears each one's first", async () => {
    const time = clock();
    const strains: number[] = [];
    const limiter = createLimiter(time.now, {
      message: "Too many from this address.",
      strainedAt: 10,
      strainedMessage: "Too many from everywhere.",
      onStrained: () => strains.push(time.now()),
    });
    for (let i = 0; i < 4; i += 1) await answer(limiter, "198.51.100.1");
    for (let i = 0; i < 5; i += 1) await answer(limiter, `203.0.113.${i}`);
    expect(strains).toEqual([]);
    // Nine wrong answers from six addresses: not yet. The tenth strains the door.
    expect(await answer(limiter, "198.51.100.1")).toBe("heard");
    expect(strains).toEqual([time.now()]);

    // A newcomer's first answer is heard, right or wrong, and a right one is never counted.
    expect(await answer(limiter, "192.0.2.1", true)).toBe("heard");
    expect(await answer(limiter, "192.0.2.1", true)).toBe("heard");
    expect(await answer(limiter, "192.0.2.2")).toBe("heard");
    expect(await answer(limiter, "192.0.2.2", true)).toMatchObject({
      message: "Too many from everywhere.",
      retryAfterSeconds: 60,
    });
    // An address that used its five is told what it always was.
    expect(await answer(limiter, "198.51.100.1")).toMatchObject({
      message: "Too many from this address.",
    });

    // A minute on, the wrong answers are old, and each address has its five again.
    time.advance(60_000);
    for (let i = 0; i < WRONG_ANSWERS_PER_MINUTE; i += 1) {
      expect(await answer(limiter, "192.0.2.2")).toBe("heard");
    }
    expect(strains).toHaveLength(1);
  });

  it("is never strained when it is not asked to be", async () => {
    const limiter = createLimiter(clock().now, { message: "Wait." });
    for (let i = 0; i < 200; i += 1) await answer(limiter, `203.0.113.${i}`);
    for (let i = 0; i < WRONG_ANSWERS_PER_MINUTE; i += 1) {
      expect(await answer(limiter, "192.0.2.1")).toBe("heard");
    }
  });
});
