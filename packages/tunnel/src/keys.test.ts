/**
 * Keys: a stored pair comes back as the same key, and the proof a server gives the relay holds
 * for the key's owner and for nobody else.
 */

import { describe, expect, it } from "vitest";
import { equalBytes, fromBase64url, randomBytes } from "./bytes.js";
import {
  checkProof,
  dh,
  generateKeyPair,
  generateStoredKeyPair,
  importPublicKey,
  importStoredKeyPair,
  KeyError,
  proveKey,
} from "./keys.js";

describe("X25519 keys", () => {
  it("keeps a pair as strings and brings it back as the same key", async () => {
    const stored = await generateStoredKeyPair();
    expect(stored.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const pair = await importStoredKeyPair(stored);
    expect(equalBytes(pair.publicKey, fromBase64url(stored.publicKey))).toBe(true);
    // The same shared secret from both sides proves the private half is the one exported.
    const other = await generateKeyPair();
    const ours = await dh(pair.privateKey, other.publicKey);
    const theirs = await dh(other.privateKey, pair.publicKey);
    expect(equalBytes(ours, theirs)).toBe(true);
  });

  it("refuses what is not a key", async () => {
    await expect(
      importStoredKeyPair({ publicKey: "x", privateKey: "nope" }),
    ).rejects.toBeInstanceOf(KeyError);
    await expect(importPublicKey(randomBytes(31))).rejects.toBeInstanceOf(KeyError);
  });

  it("proves possession to the relay, and only for the key's own holder", async () => {
    const server = await generateKeyPair();
    const ephemeral = await generateKeyPair();
    const nonce = randomBytes(32);
    const proof = await proveKey(server, nonce, ephemeral.publicKey);
    expect(proof.length).toBe(32);
    expect(await checkProof({ claimedKey: server.publicKey, ephemeral, nonce, proof })).toBe(true);

    const impostor = await generateKeyPair();
    const forged = await proveKey(impostor, nonce, ephemeral.publicKey);
    expect(
      await checkProof({ claimedKey: server.publicKey, ephemeral, nonce, proof: forged }),
    ).toBe(false);
    expect(
      await checkProof({ claimedKey: server.publicKey, ephemeral, nonce: randomBytes(32), proof }),
    ).toBe(false);
    expect(await checkProof({ claimedKey: randomBytes(5), ephemeral, nonce, proof })).toBe(false);
  });
});
