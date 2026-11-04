/**
 * The phone's CryptoKit against `@chipschat/subtle` and Node's WebCrypto, both directions (ADR 0277).
 *
 * The iPhone runs X25519, Ed25519, HMAC-SHA-256 and AES-GCM in CryptoKit
 * (`modules/frame-cipher/ios/Primitives.swift`), and a phone paired before that holds keys
 * `@chipschat/subtle` made in JavaScript. Both have to keep working with the server, which is Node,
 * and with each other, or a phone re-pairs. CryptoKit is the same framework on the Mac, so the
 * Swift file the phone ships is compiled here beside a small driver (`interop/main.swift`) and
 * asked over its standard input; the answers are held against JavaScript the way
 * `packages/subtle/src/interop.test.ts` holds the shim against Node.
 *
 * Only on a Mac with Xcode's `swiftc`. Elsewhere — CI's Linux runners — it is skipped, and the
 * Runtime screen's checks on the phone itself are what is left (`platform.ts`).
 */

import { spawn, spawnSync } from "node:child_process";
import { createPrivateKey, createPublicKey, verify as nodeVerify, webcrypto } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createWebCrypto, type Primitives } from "@chipschat/subtle";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MODULE = fileURLToPath(new URL("../../modules/frame-cipher", import.meta.url));
const swiftc = spawnSync("xcrun", ["--find", "swiftc"], { encoding: "utf8" });
const onMac = process.platform === "darwin" && swiftc.status === 0;

const node = webcrypto.subtle as unknown as SubtleCrypto;
const inJs = createWebCrypto().subtle;
const random = (length: number) => webcrypto.getRandomValues(new Uint8Array(length));
const bytes = (buffer: ArrayBuffer) => new Uint8Array(buffer);
const hex = (data: Uint8Array) => (data.length === 0 ? "-" : Buffer.from(data).toString("hex"));
const PKCS8 = {
  X25519: Buffer.from("302e020100300506032b656e04220420", "hex"),
  Ed25519: Buffer.from("302e020100300506032b657004220420", "hex"),
};
const pkcs8Of = (curve: keyof typeof PKCS8, seed: Uint8Array) =>
  new Uint8Array(Buffer.concat([PKCS8[curve], seed]));
const seedOf = (pkcs8: ArrayBuffer) => new Uint8Array(pkcs8).slice(-32);
const flipped = (data: Uint8Array) => {
  const out = data.slice();
  out[0] = (out[0] ?? 0) ^ 1;
  return out;
};

/** The driver: one line asked, one line answered, in order. */
class CryptoKit {
  private readonly waiting: ((line: string) => void)[] = [];
  private readonly child;
  constructor(binary: string) {
    this.child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });
    createInterface({ input: this.child.stdout }).on("line", (line) =>
      this.waiting.shift()?.(line),
    );
  }
  private ask(name: string, ...args: Uint8Array[]): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiting.push((line) => {
        if (line.startsWith("ok ")) resolve(line.slice(3));
        else reject(new Error(line.replace(/^error /, "")));
      });
      this.child.stdin.write(`${[name, ...args.map(hex)].join(" ")}\n`);
    });
  }
  async bytes(name: string, ...args: Uint8Array[]): Promise<Uint8Array<ArrayBuffer>> {
    const answer = await this.ask(name, ...args);
    return answer === "-" ? new Uint8Array(0) : new Uint8Array(Buffer.from(answer, "hex"));
  }
  async yes(name: string, ...args: Uint8Array[]): Promise<boolean> {
    return (await this.ask(name, ...args)) === "true";
  }
  async pair(name: string) {
    const made = await this.bytes(name);
    return { secretKey: made.slice(0, 32), publicKey: made.slice(32) };
  }
  close(): void {
    this.child.stdin.end();
  }
}

describe.skipIf(!onMac)("CryptoKit, as the phone runs it, against JavaScript and Node", () => {
  let folder: string;
  let kit: CryptoKit;

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "chips-cryptokit-"));
    const binary = join(folder, "interop");
    const built = spawnSync(
      "xcrun",
      [
        "swiftc",
        join(MODULE, "ios", "Primitives.swift"),
        join(MODULE, "interop", "main.swift"),
        "-o",
        binary,
      ],
      { encoding: "utf8" },
    );
    if (built.status !== 0) throw new Error(`swiftc failed:\n${built.stderr}`);
    kit = new CryptoKit(binary);
  }, 120_000);

  afterAll(() => {
    kit?.close();
    if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  });

  describe("X25519", () => {
    it("agrees with a key made in JavaScript, and with Node, from either side", async () => {
      for (let round = 0; round < 20; round++) {
        // A phone's key from before ADR 0277: made by `@chipschat/subtle`, kept as PKCS#8.
        const old = (await inJs.generateKey({ name: "X25519" }, true, [
          "deriveBits",
        ])) as CryptoKeyPair;
        const oldSeed = seedOf(await inJs.exportKey("pkcs8", old.privateKey));
        const oldPublic = bytes(await inJs.exportKey("raw", old.publicKey));
        const made = await kit.pair("x25519Generate");

        const native = await kit.bytes("x25519Derive", oldSeed, made.publicKey);
        const nativeAcross = await kit.bytes("x25519Derive", made.secretKey, oldPublic);
        const peer = await inJs.importKey("raw", made.publicKey, { name: "X25519" }, true, []);
        const javascript = bytes(
          await inJs.deriveBits({ name: "X25519", public: peer }, old.privateKey, 256),
        );
        expect(native).toEqual(javascript);
        expect(nativeAcross).toEqual(javascript);

        // The server is Node: it reads a native key's PKCS#8 and gets the same secret.
        const kept = await node.importKey(
          "pkcs8",
          pkcs8Of("X25519", made.secretKey),
          { name: "X25519" },
          false,
          ["deriveBits"],
        );
        const theirs = await node.importKey("raw", oldPublic, { name: "X25519" }, true, []);
        expect(bytes(await node.deriveBits({ name: "X25519", public: theirs }, kept, 256))).toEqual(
          javascript,
        );
      }
    });

    it("makes the public key Node computes from its private key", async () => {
      const made = await kit.pair("x25519Generate");
      const key = createPublicKey(
        createPrivateKey({
          key: Buffer.from(pkcs8Of("X25519", made.secretKey)),
          format: "der",
          type: "pkcs8",
        }),
      );
      expect(new Uint8Array(key.export({ format: "der", type: "spki" })).slice(-32)).toEqual(
        made.publicKey,
      );
    });

    it("refuses a point of small order, as JavaScript does", async () => {
      const made = await kit.pair("x25519Generate");
      const one = new Uint8Array(32);
      one[0] = 1;
      for (const point of [new Uint8Array(32), one]) {
        await expect(kit.bytes("x25519Derive", made.secretKey, point)).rejects.toThrow();
        const mine = await inJs.importKey(
          "pkcs8",
          pkcs8Of("X25519", made.secretKey),
          { name: "X25519" },
          false,
          ["deriveBits"],
        );
        const low = await inJs.importKey("raw", point, { name: "X25519" }, true, []);
        await expect(
          inJs.deriveBits({ name: "X25519", public: low }, mine, 256),
        ).rejects.toMatchObject({ name: "OperationError" });
      }
    });
  });

  describe("Ed25519", () => {
    it("signs with a device key made in JavaScript, and the server's check passes", async () => {
      // `apps/mobile/src/device/storage.ts` keeps the key as PKCS#8 in the Keychain; the server
      // checks with Node's `verify` and the spki it was given at pairing (`verifyDeviceSignature`).
      const old = (await inJs.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const seed = seedOf(await inJs.exportKey("pkcs8", old.privateKey));
      const spki = Buffer.from(await inJs.exportKey("spki", old.publicKey));
      const server = createPublicKey({ key: spki, format: "der", type: "spki" });
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), async (message) => {
          const signature = await kit.bytes("ed25519Sign", seed, message);
          expect(signature.length).toBe(64);
          expect(nodeVerify(null, message, server, signature)).toBe(true);
          expect(await inJs.verify({ name: "Ed25519" }, old.publicKey, signature, message)).toBe(
            true,
          );
          expect(nodeVerify(null, new Uint8Array([...message, 0]), server, signature)).toBe(false);
        }),
        { numRuns: 25 },
      );
    });

    it("verifies what JavaScript and Node signed, and refuses what they did not", async () => {
      const made = await kit.pair("ed25519Generate");
      const mine = await inJs.importKey(
        "pkcs8",
        pkcs8Of("Ed25519", made.secretKey),
        { name: "Ed25519" },
        false,
        ["sign"],
      );
      const theirs = await node.importKey(
        "pkcs8",
        pkcs8Of("Ed25519", made.secretKey),
        { name: "Ed25519" },
        false,
        ["sign"],
      );
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 512 }), async (message) => {
          const byJs = bytes(await inJs.sign({ name: "Ed25519" }, mine, message));
          const byNode = bytes(await node.sign({ name: "Ed25519" }, theirs, message));
          expect(await kit.yes("ed25519Verify", made.publicKey, byJs, message)).toBe(true);
          expect(await kit.yes("ed25519Verify", made.publicKey, byNode, message)).toBe(true);
          expect(await kit.yes("ed25519Verify", made.publicKey, byJs, flipped(message))).toBe(
            false,
          );
          expect(await kit.yes("ed25519Verify", made.publicKey, flipped(byJs), message)).toBe(
            false,
          );
        }),
        { numRuns: 25 },
      );
      // A malformed signature or key is a false, not a throw, as WebCrypto has it.
      expect(await kit.yes("ed25519Verify", made.publicKey, random(10), random(4))).toBe(false);
      expect(await kit.yes("ed25519Verify", random(5), random(64), random(4))).toBe(false);
    });

    it("signs the same bytes differently each time, and every one verifies", async () => {
      const made = await kit.pair("ed25519Generate");
      const message = random(64);
      const verifying = await node.importKey("raw", made.publicKey, { name: "Ed25519" }, true, [
        "verify",
      ]);
      for (let round = 0; round < 4; round++) {
        const signature = await kit.bytes("ed25519Sign", made.secretKey, message);
        expect(await node.verify({ name: "Ed25519" }, verifying, signature, message)).toBe(true);
      }
    });
  });

  describe("HMAC-SHA-256", () => {
    it("is the same tag, for keys shorter and longer than a block", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 100 }),
          fc.uint8Array({ maxLength: 1024 }),
          async (raw, data) => {
            const key = await inJs.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
              "sign",
            ]);
            const tag = bytes(await inJs.sign("HMAC", key, data));
            expect(await kit.bytes("hmacSha256Sign", raw, data)).toEqual(tag);
            expect(await kit.yes("hmacSha256Verify", raw, tag, data)).toBe(true);
            expect(await kit.yes("hmacSha256Verify", raw, flipped(tag), data)).toBe(false);
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe("AES-GCM", () => {
    it("seals the bytes JavaScript seals, opens them, and refuses a changed one", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ maxLength: 4096 }),
          fc.uint8Array({ maxLength: 64 }),
          async (plaintext, additionalData) => {
            const raw = random(32);
            const iv = random(12);
            const key = await inJs.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
            const sealed = bytes(
              await inJs.encrypt(
                { name: "AES-GCM", iv, additionalData, tagLength: 128 },
                key,
                plaintext,
              ),
            );
            expect(await kit.bytes("seal", raw, iv, additionalData, plaintext)).toEqual(sealed);
            expect(await kit.bytes("open", raw, iv, additionalData, sealed)).toEqual(plaintext);
            await expect(
              kit.bytes("open", raw, iv, additionalData, flipped(sealed)),
            ).rejects.toThrow();
          },
        ),
        { numRuns: 20 },
      );
      await expect(
        kit.bytes("open", random(32), random(12), random(0), random(15)),
      ).rejects.toThrow("sixteen-byte tag");
    });
  });

  describe("through @chipschat/subtle, as install.ts hands it over", () => {
    it("pairs, agrees and signs with every primitive native, and Node takes all of it", async () => {
      const native: Primitives = {
        aesGcm: {
          seal: (key, iv, aad, plaintext) => kit.bytes("seal", key, iv, aad, plaintext),
          open: (key, iv, aad, sealed) => kit.bytes("open", key, iv, aad, sealed),
        },
        x25519: {
          generate: () => kit.pair("x25519Generate"),
          derive: (privateKey, publicKey) => kit.bytes("x25519Derive", privateKey, publicKey),
        },
        ed25519: {
          generate: () => kit.pair("ed25519Generate"),
          sign: (privateKey, data) => kit.bytes("ed25519Sign", privateKey, data),
          verify: (publicKey, signature, data) =>
            kit.yes("ed25519Verify", publicKey, signature, data),
        },
        hmacSha256: {
          sign: (key, data) => kit.bytes("hmacSha256Sign", key, data),
          verify: (key, mac, data) => kit.yes("hmacSha256Verify", key, mac, data),
        },
      };
      const phone = createWebCrypto(native).subtle;

      // The device key a phone already holds, read back from its PKCS#8 as `storage.ts` reads it.
      const old = (await inJs.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const kept = bytes(await inJs.exportKey("pkcs8", old.privateKey));
      const spki = bytes(await inJs.exportKey("spki", old.publicKey));
      const loaded = await phone.importKey("pkcs8", kept, { name: "Ed25519" }, false, ["sign"]);
      const payload = new TextEncoder().encode("POST\n/v1/events\n1\nabc");
      const signature = Buffer.from(await phone.sign({ name: "Ed25519" }, loaded, payload));
      const server = createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
      expect(nodeVerify(null, payload, server, signature)).toBe(true);

      // A new device key: made natively, its spki read by Node, its signature taken.
      const fresh = (await phone.generateKey({ name: "Ed25519" }, false, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const freshSpki = Buffer.from(await phone.exportKey("spki", fresh.publicKey));
      const freshSigned = Buffer.from(
        await phone.sign({ name: "Ed25519" }, fresh.privateKey, payload),
      );
      expect(
        nodeVerify(
          null,
          payload,
          createPublicKey({ key: freshSpki, format: "der", type: "spki" }),
          freshSigned,
        ),
      ).toBe(true);
      expect(await phone.verify({ name: "Ed25519" }, fresh.publicKey, freshSigned, payload)).toBe(
        true,
      );

      // The tunnel's ephemeral against the server's static key, and HKDF's HMAC over the secret.
      const ephemeral = (await phone.generateKey({ name: "X25519" }, false, [
        "deriveBits",
      ])) as CryptoKeyPair;
      const serverStatic = (await node.generateKey({ name: "X25519" }, true, [
        "deriveBits",
      ])) as CryptoKeyPair;
      const serverPublic = await phone.importKey(
        "raw",
        bytes(await node.exportKey("raw", serverStatic.publicKey)),
        { name: "X25519" },
        false,
        [],
      );
      const ours = bytes(
        await phone.deriveBits({ name: "X25519", public: serverPublic }, ephemeral.privateKey, 256),
      );
      const ephemeralPublic = await node.importKey(
        "raw",
        bytes(await phone.exportKey("raw", ephemeral.publicKey)),
        { name: "X25519" },
        true,
        [],
      );
      const theirs = bytes(
        await node.deriveBits(
          { name: "X25519", public: ephemeralPublic },
          serverStatic.privateKey,
          256,
        ),
      );
      expect(ours).toEqual(theirs);
      const chain = await phone.importKey("raw", ours, { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify",
      ]);
      const nodeChain = await node.importKey(
        "raw",
        theirs,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const tag = bytes(await phone.sign("HMAC", chain, new Uint8Array([1])));
      expect(tag).toEqual(bytes(await node.sign("HMAC", nodeChain, new Uint8Array([1]))));
      expect(await phone.verify("HMAC", chain, tag, new Uint8Array([1]))).toBe(true);

      // And a frame sealed on the phone opens on the server.
      const frameKey = random(32);
      const iv = random(12);
      const sealing = await phone.importKey("raw", frameKey, { name: "AES-GCM" }, false, [
        "encrypt",
      ]);
      const opening = await node.importKey("raw", frameKey, { name: "AES-GCM" }, false, [
        "decrypt",
      ]);
      const frame = random(32 * 1024);
      const sealed = await phone.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, sealing, frame);
      expect(
        bytes(await node.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, opening, sealed)),
      ).toEqual(frame);
    });
  });
});
