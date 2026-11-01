import { createWebCrypto } from "@chipschat/subtle";
import { afterEach, describe, expect, it } from "vitest";
import { capabilities, responseFromBytes, timings } from "./checks";

/**
 * The Runtime screen's two halves, run here so a change to them is caught without a phone.
 *
 * Node is not a phone — it has no `requestAnimationFrame`, and it has a real `crypto.subtle` —
 * so what is asserted is the shape and the honesty of the answers, plus the one thing that does
 * carry over: the timings run to completion against `@chipschat/subtle`, which is the crypto the
 * phone actually uses.
 */

const nodesCrypto = globalThis.crypto;

function useShim(): void {
  Object.defineProperty(globalThis, "crypto", {
    value: createWebCrypto({ random: (out) => nodesCrypto.getRandomValues(out) }),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: nodesCrypto,
    configurable: true,
    writable: true,
  });
});

describe("capabilities", () => {
  it("names every global the shared packages reach for", () => {
    expect(capabilities().map((one) => one.name)).toEqual([
      "crypto.subtle",
      "crypto.randomUUID",
      "TextEncoder / TextDecoder",
      "btoa / atob",
      "URL with a base",
      "URLSearchParams.get",
      "WebSocket",
      "requestAnimationFrame",
      "BigInt",
      "structuredClone",
    ]);
  });

  it("passes the ones Node has, and reports the one it does not rather than throwing", () => {
    const by = new Map(capabilities().map((one) => [one.name, one]));
    for (const name of ["crypto.subtle", "TextEncoder / TextDecoder", "btoa / atob", "BigInt"]) {
      expect({ name, ok: by.get(name)?.ok }).toEqual({ name, ok: true });
    }
    expect(by.get("requestAnimationFrame")?.ok).toBe(false);
  });

  it("passes them against @chipschat/subtle too, which is what the phone runs", () => {
    useShim();
    const by = new Map(capabilities().map((one) => [one.name, one]));
    expect(by.get("crypto.subtle")?.ok).toBe(true);
    expect(by.get("crypto.randomUUID")?.ok).toBe(true);
  });
});

describe("a check whose global is missing", () => {
  it("reports what the runtime said rather than throwing out of the screen", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues: () => {
          throw new Error("no random on this runtime");
        },
        randomUUID: () => {
          throw new Error("no randomUUID on this runtime");
        },
      },
      configurable: true,
      writable: true,
    });
    const by = new Map(capabilities().map((one) => [one.name, one]));
    expect(by.get("crypto.subtle")).toEqual({
      name: "crypto.subtle",
      ok: false,
      note: expect.stringContaining("generateKey"),
    });
    expect(by.get("crypto.randomUUID")).toEqual({
      name: "crypto.randomUUID",
      ok: false,
      note: "no randomUUID on this runtime",
    });
  });

  it("says something legible when the runtime threw a thing that is not an Error", () => {
    // A native module rejecting with a string rather than an Error is a real thing phones do.
    const notAnError: unknown = "nope";
    Object.defineProperty(globalThis, "crypto", {
      value: {
        randomUUID: () => {
          throw notAnError;
        },
      },
      configurable: true,
      writable: true,
    });
    const by = new Map(capabilities().map((one) => [one.name, one]));
    expect(by.get("crypto.randomUUID")?.note).toBe("threw");
  });
});

describe("Response from bytes", () => {
  it("is a check that passes where Response is whole", async () => {
    await expect(responseFromBytes()).resolves.toEqual({
      name: "Response from bytes, then .json()",
      ok: true,
      note: undefined,
    });
  });
});

describe("Response from bytes, where there is none", () => {
  it("is a failed check rather than a screen that will not draw", async () => {
    const real = globalThis.Response;
    Object.defineProperty(globalThis, "Response", { value: undefined, configurable: true });
    try {
      const answer = await responseFromBytes();
      expect({ ok: answer.ok, said: answer.note !== undefined }).toEqual({ ok: false, said: true });
    } finally {
      Object.defineProperty(globalThis, "Response", { value: real, configurable: true });
    }
  });
});

describe("timings", () => {
  it("times the five costs that are on every request, frame and replay", async () => {
    useShim();
    const timed = await timings();
    expect(timed.map((one) => one.name)).toEqual([
      "Ed25519 sign",
      "Ed25519 verify",
      "X25519 derive",
      "SHA-256, 1 MB",
      "AES-GCM seal, 1 MB",
    ]);
    for (const one of timed) {
      expect({ name: one.name, sane: Number.isFinite(one.ms) && one.ms >= 0 }).toEqual({
        name: one.name,
        sane: true,
      });
    }
  }, 30_000);
});
