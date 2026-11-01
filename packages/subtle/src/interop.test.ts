/**
 * The shim against Node's own WebCrypto, byte for byte.
 *
 * This is the test that matters: a phone that produces keys, signatures and sealed bytes the
 * server cannot read is worse than a phone that cannot connect at all. Node has a real
 * `crypto.subtle`, so every claim below is checked in both directions — what the shim makes,
 * Node accepts, and what Node makes, the shim accepts.
 */

import { createPublicKey, verify, webcrypto } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createWebCrypto } from "./index.js";

const node = webcrypto.subtle as unknown as SubtleCrypto;
const shim = createWebCrypto().subtle;
/** `generateKey` is typed as a key or a pair; for a curve it is always a pair. */
const pairOf = async (algorithm: { name: string }, extractable: boolean, usages: KeyUsage[]) =>
  (await shim.generateKey(algorithm as never, extractable, usages)) as CryptoKeyPair;
const bytes = (buffer: ArrayBuffer) => new Uint8Array(buffer);
const random = (length: number) => webcrypto.getRandomValues(new Uint8Array(length));

describe("SHA-256", () => {
  it("is the same digest", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 4096 }), async (data) => {
        expect(bytes(await shim.digest("SHA-256", data))).toEqual(
          bytes(await node.digest("SHA-256", data)),
        );
      }),
      { numRuns: 50 },
    );
  });
});

describe("Ed25519", () => {
  it("exports the key formats Node exports, and imports what Node exported", async () => {
    const pair = await pairOf({ name: "Ed25519" }, true, ["sign", "verify"]);
    const spki = bytes(await shim.exportKey("spki", pair.publicKey));
    const pkcs8 = bytes(await shim.exportKey("pkcs8", pair.privateKey));
    expect(spki.length).toBe(44);
    expect(pkcs8.length).toBe(48);
    // Node reads both, which is the whole point: the server verifies with the spki it was given.
    await expect(
      node.importKey("spki", spki, { name: "Ed25519" }, true, ["verify"]),
    ).resolves.toBeDefined();
    const theirs = await node.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
    // The two halves belong together: Ed25519 is deterministic, so the same key over the same
    // bytes is the same signature, and Node verifies ours with the `spki` the shim exported.
    const mineToVerify = await node.importKey("spki", spki, { name: "Ed25519" }, true, ["verify"]);
    const proof = await shim.sign({ name: "Ed25519" }, pair.privateKey, new Uint8Array([1, 2, 3]));
    expect(
      await node.verify({ name: "Ed25519" }, mineToVerify, proof, new Uint8Array([1, 2, 3])),
    ).toBe(true);
    const message = random(64);
    expect(bytes(await shim.sign({ name: "Ed25519" }, pair.privateKey, message))).toEqual(
      bytes(await node.sign({ name: "Ed25519" }, theirs, message)),
    );
  });

  it("signs what Node verifies, and verifies what Node signed", async () => {
    const theirs = (await node.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const pkcs8 = bytes(await node.exportKey("pkcs8", theirs.privateKey));
    const spki = bytes(await node.exportKey("spki", theirs.publicKey));
    const mine = await shim.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
    const minePublic = await shim.importKey("spki", spki, { name: "Ed25519" }, true, ["verify"]);

    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), async (message) => {
        const ours = await shim.sign({ name: "Ed25519" }, mine, message);
        expect(await node.verify({ name: "Ed25519" }, theirs.publicKey, ours, message)).toBe(true);
        const theirSignature = await node.sign({ name: "Ed25519" }, theirs.privateKey, message);
        expect(await shim.verify({ name: "Ed25519" }, minePublic, theirSignature, message)).toBe(
          true,
        );
      }),
      { numRuns: 25 },
    );

    // A signature over other words is refused, not thrown at.
    const signature = await shim.sign({ name: "Ed25519" }, mine, new Uint8Array([1, 2, 3]));
    expect(await shim.verify({ name: "Ed25519" }, minePublic, signature, new Uint8Array([1]))).toBe(
      false,
    );
    expect(await shim.verify({ name: "Ed25519" }, minePublic, new Uint8Array(64), signature)).toBe(
      false,
    );
  });
});

describe("X25519", () => {
  it("agrees with Node on the shared secret, from either side", async () => {
    const mine = await pairOf({ name: "X25519" }, true, ["deriveBits"]);
    const theirs = (await node.generateKey({ name: "X25519" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;

    const myPkcs8 = bytes(await shim.exportKey("pkcs8", mine.privateKey));
    const myRaw = bytes(await shim.exportKey("raw", mine.publicKey));
    const theirRaw = bytes(await node.exportKey("raw", theirs.publicKey));
    expect(myRaw.length).toBe(32);

    const theirsFromMine = await node.importKey("raw", myRaw, { name: "X25519" }, true, []);
    const mineFromTheirs = await shim.importKey("raw", theirRaw, { name: "X25519" }, true, []);

    const ours = bytes(
      await shim.deriveBits({ name: "X25519", public: mineFromTheirs }, mine.privateKey, 256),
    );
    const nodes = bytes(
      await node.deriveBits({ name: "X25519", public: theirsFromMine }, theirs.privateKey, 256),
    );
    expect(ours).toEqual(nodes);

    // The same private key, kept and read back by Node, derives the same secret.
    const kept = await node.importKey("pkcs8", myPkcs8, { name: "X25519" }, false, ["deriveBits"]);
    expect(
      bytes(await node.deriveBits({ name: "X25519", public: theirs.publicKey }, kept, 256)),
    ).toEqual(ours);
  });
});

describe("AES-GCM", () => {
  it("seals what Node opens, and opens what Node sealed, additional data and all", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 2048 }),
        fc.uint8Array({ maxLength: 64 }),
        async (plaintext, additionalData) => {
          const raw = random(32);
          const iv = random(12);
          const mine = await shim.importKey("raw", raw, { name: "AES-GCM" }, false, [
            "encrypt",
            "decrypt",
          ]);
          const theirs = await node.importKey("raw", raw, { name: "AES-GCM" }, false, [
            "encrypt",
            "decrypt",
          ]);
          const algorithm = { name: "AES-GCM", iv, additionalData, tagLength: 128 };
          const sealed = bytes(await shim.encrypt(algorithm, mine, plaintext));
          // Ciphertext then a sixteen-byte tag, which is what WebCrypto returns.
          expect(sealed.length).toBe(plaintext.length + 16);
          expect(sealed).toEqual(bytes(await node.encrypt(algorithm, theirs, plaintext)));
          expect(bytes(await node.decrypt(algorithm, theirs, sealed))).toEqual(plaintext);
          expect(bytes(await shim.decrypt(algorithm, mine, sealed))).toEqual(plaintext);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("refuses a flipped tag, a wrong nonce and the wrong additional data, as Node does", async () => {
    const raw = random(32);
    const iv = random(12);
    const additionalData = random(8);
    const mine = await shim.importKey("raw", raw, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    const theirs = await node.importKey("raw", raw, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    const algorithm = { name: "AES-GCM", iv, additionalData, tagLength: 128 };
    const sealed = bytes(await shim.encrypt(algorithm, mine, new Uint8Array([7, 7, 7])));

    const flipped = sealed.slice();
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1;
    await expect(shim.decrypt(algorithm, mine, flipped)).rejects.toThrow();
    await expect(node.decrypt(algorithm, theirs, flipped)).rejects.toThrow();

    const elsewhere = { name: "AES-GCM", iv: random(12), additionalData, tagLength: 128 };
    await expect(shim.decrypt(elsewhere, mine, sealed)).rejects.toThrow();
    const otherData = { name: "AES-GCM", iv, additionalData: random(8), tagLength: 128 };
    await expect(shim.decrypt(otherData, mine, sealed)).rejects.toThrow();
  });
});

describe("HMAC-SHA-256", () => {
  it("is the same tag", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.uint8Array({ maxLength: 1024 }),
        async (raw, data) => {
          const algorithm = { name: "HMAC", hash: "SHA-256" } as const;
          const mine = await shim.importKey("raw", raw, algorithm, false, ["sign"]);
          const theirs = await node.importKey("raw", raw, algorithm, false, ["sign"]);
          expect(bytes(await shim.sign("HMAC", mine, data))).toEqual(
            bytes(await node.sign("HMAC", theirs, data)),
          );
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe("the device signature, as the server checks it", () => {
  it("signs the way `device.ts` signs, and Node verifies it the way the server does", async () => {
    // `packages/core/src/device.ts`: a SHA-256 of the body in hex, four lines, an Ed25519
    // signature over them, and the public key as spki in base64. Rebuilt here rather than
    // imported, because this package knows nothing of Chips — and the server is checked against
    // Node's own `verify`, which is the call `verifyDeviceSignature` makes.
    const pair = await pairOf({ name: "Ed25519" }, true, ["sign", "verify"]);
    const spki = Buffer.from(bytes(await shim.exportKey("spki", pair.publicKey))).toString(
      "base64",
    );

    const body = new TextEncoder().encode(JSON.stringify({ text: "hello from the phone" }));
    const digest = bytes(await shim.digest("SHA-256", body));
    const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const timestamp = Date.now();
    const payload = ["POST", "/v1/events", String(timestamp), hex].join("\n");
    const signature = Buffer.from(
      bytes(
        await shim.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(payload)),
      ),
    );
    expect(signature.length).toBe(64);

    const key = createPublicKey({
      key: Buffer.from(spki, "base64"),
      format: "der" as const,
      type: "spki" as const,
    });
    expect(verify(null, Buffer.from(payload, "utf8"), key, signature)).toBe(true);
    // A body that changed changes the digest, and the signature no longer stands.
    const other = ["POST", "/v1/events", String(timestamp), `${hex.slice(0, -1)}0`].join("\n");
    expect(verify(null, Buffer.from(other, "utf8"), key, signature)).toBe(false);
  });
});
