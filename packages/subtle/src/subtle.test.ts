/**
 * What the shim refuses, and what it hands to the runtime instead of doing itself.
 *
 * `interop.test.ts` says the answers are right; this says the edges are: a key used for what it
 * was not made for, a format nothing declares, an algorithm this package does not do — each
 * refused by the name WebCrypto uses, so a caller that branches on `error.name` reads the same
 * on a phone as in a browser.
 */

import { describe, expect, it, vi } from "vitest";
import { createWebCrypto, installWebCrypto } from "./index.js";

const shim = createWebCrypto();
const raw = (length: number) => new Uint8Array(length).fill(7);

describe("what it will not do", () => {
  it("names the algorithms it does not have, rather than failing somewhere deeper", async () => {
    await expect(shim.subtle.digest("SHA-512", raw(4))).rejects.toMatchObject({
      name: "NotSupportedError",
    });
    await expect(
      shim.subtle.generateKey({ name: "RSA-PSS" } as never, true, ["sign"]),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
    await expect(
      shim.subtle.importKey("jwk", {} as never, { name: "Ed25519" }, true, ["verify"]),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
    await expect(
      shim.subtle.importKey("raw", raw(32), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
  });

  it("keeps a key that was made unexportable unexportable", async () => {
    const pair = await shim.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    await expect(shim.subtle.exportKey("pkcs8", pair.privateKey)).rejects.toMatchObject({
      name: "InvalidAccessError",
    });
    // The public half has nothing to keep, and comes out either way.
    await expect(shim.subtle.exportKey("spki", pair.publicKey)).resolves.toBeDefined();
  });

  it("checks what a key was made for", async () => {
    const pair = await shim.subtle.generateKey({ name: "Ed25519" }, true, ["verify"]);
    await expect(
      shim.subtle.sign({ name: "Ed25519" }, pair.privateKey, raw(4)),
    ).rejects.toMatchObject({ name: "InvalidAccessError" });

    const key = await shim.subtle.importKey("raw", raw(32), { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    await expect(
      shim.subtle.encrypt({ name: "AES-GCM", iv: raw(12) }, key, raw(4)),
    ).rejects.toMatchObject({ name: "InvalidAccessError" });
  });

  it("refuses key material of the wrong size and bytes that are not the key they claim", async () => {
    await expect(
      shim.subtle.importKey("raw", raw(20), { name: "AES-GCM" }, false, ["encrypt"]),
    ).rejects.toMatchObject({ name: "DataError" });
    await expect(
      shim.subtle.importKey("raw", raw(31), { name: "X25519" }, true, []),
    ).rejects.toMatchObject({ name: "DataError" });
    await expect(
      shim.subtle.importKey("pkcs8", raw(48), { name: "Ed25519" }, false, ["sign"]),
    ).rejects.toMatchObject({ name: "DataError" });
  });

  it("will not take one kind of key for another", async () => {
    const aes = await shim.subtle.importKey("raw", raw(32), { name: "AES-GCM" }, false, [
      "encrypt",
    ]);
    await expect(shim.subtle.sign("HMAC", aes, raw(4))).rejects.toMatchObject({
      name: "InvalidAccessError",
    });
    await expect(shim.subtle.exportKey("raw", {} as never)).rejects.toMatchObject({
      name: "InvalidAccessError",
    });
  });
});

describe("what the runtime may do itself", () => {
  it("uses the primitives it is given, and the JavaScript path when it is given none", async () => {
    const sha256 = vi.fn(async () => new Uint8Array(32).fill(1));
    const seal = vi.fn(async () => new Uint8Array([9]));
    const open = vi.fn(async () => new Uint8Array([8]));
    const native = createWebCrypto({ sha256, aesGcm: { seal, open } });

    expect(new Uint8Array(await native.subtle.digest("SHA-256", raw(4)))).toEqual(
      new Uint8Array(32).fill(1),
    );
    expect(sha256).toHaveBeenCalledOnce();

    const key = await native.subtle.importKey("raw", raw(32), { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    const algorithm = { name: "AES-GCM", iv: raw(12), additionalData: raw(3) };
    expect(new Uint8Array(await native.subtle.encrypt(algorithm, key, raw(2)))).toEqual(
      new Uint8Array([9]),
    );
    expect(new Uint8Array(await native.subtle.decrypt(algorithm, key, raw(2)))).toEqual(
      new Uint8Array([8]),
    );
    // What it was handed: the key, the nonce and the additional data, unchanged.
    expect(seal.mock.calls[0]?.slice(0, 3)).toEqual([raw(32), raw(12), raw(3)]);

    // Given none, the same call goes through JavaScript and gives a real answer.
    expect(new Uint8Array(await shim.subtle.digest("SHA-256", raw(4)))).not.toEqual(
      new Uint8Array(32).fill(1),
    );
  });

  it("makes a v4 UUID from random bytes", () => {
    const uuid = shim.randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(shim.randomUUID()).not.toBe(uuid);
  });

  it("fills the view it is given, in place", () => {
    const out = new Uint8Array(16);
    expect(shim.getRandomValues(out)).toBe(out);
    expect(out.some((byte) => byte !== 0)).toBe(true);
  });
});

describe("installing it", () => {
  it("leaves a real subtle alone: this is a fallback, not a replacement", () => {
    const before = globalThis.crypto;
    expect(installWebCrypto()).toBe(before);
    expect(globalThis.crypto).toBe(before);
  });
});
