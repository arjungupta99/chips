/**
 * The handshake: two messages of forty-eight bytes, a tunnel that only the holder of the
 * server's key can complete, and transport messages that authenticate or are refused.
 */

import { describe, expect, it } from "vitest";
import { bytes, text, utf8 } from "./bytes.js";
import { generateKeyPair } from "./keys.js";
import {
  HANDSHAKE_MESSAGE_BYTES,
  initiateHandshake,
  MAX_PLAINTEXT_BYTES,
  respondHandshake,
  TunnelError,
} from "./noise.js";

async function tunnelPair() {
  const server = await generateKeyPair();
  const phone = await initiateHandshake(server.publicKey);
  const answered = await respondHandshake(server, phone.message);
  const theirs = await phone.complete(answered.message);
  return { phone: theirs, server: answered.tunnel, key: server };
}

describe("Noise NK over WebCrypto", () => {
  it("opens a tunnel both ends agree on, in two messages of forty-eight bytes", async () => {
    const server = await generateKeyPair();
    const phone = await initiateHandshake(server.publicKey);
    expect(phone.message.length).toBe(HANDSHAKE_MESSAGE_BYTES);
    const answered = await respondHandshake(server, phone.message);
    expect(answered.message.length).toBe(HANDSHAKE_MESSAGE_BYTES);
    const theirs = await phone.complete(answered.message);
    expect(theirs.handshakeHash).toEqual(answered.tunnel.handshakeHash);

    const toServer = await theirs.encrypt(utf8("hello from the phone"));
    expect(text(await answered.tunnel.decrypt(toServer))).toBe("hello from the phone");
    const toPhone = await answered.tunnel.encrypt(utf8("hello from the server"));
    expect(text(await theirs.decrypt(toPhone))).toBe("hello from the server");
  });

  it("cannot be completed by anyone but the holder of the key the phone was given", async () => {
    const real = await generateKeyPair();
    const impostor = await generateKeyPair();
    const phone = await initiateHandshake(real.publicKey);
    // The impostor cannot even read the first message: it was made for the real key.
    await expect(respondHandshake(impostor, phone.message)).rejects.toBeInstanceOf(TunnelError);
    // And an answer it forges for the phone does not complete the handshake.
    const forged = await initiateHandshake(impostor.publicKey);
    const forgedAnswer = await respondHandshake(impostor, forged.message);
    await expect(phone.complete(forgedAnswer.message)).rejects.toBeInstanceOf(TunnelError);
  });

  it("refuses a transport message that was tampered with, replayed or reordered", async () => {
    const { phone, server } = await tunnelPair();
    const first = await phone.encrypt(utf8("one"));
    const second = await phone.encrypt(utf8("two"));
    const tampered = new Uint8Array(first);
    tampered[3] = (tampered[3] ?? 0) ^ 1;
    const fresh = await tunnelPair();
    await expect(fresh.server.decrypt(tampered)).rejects.toBeInstanceOf(TunnelError);
    // Out of order: the nonce does not match, so the second message fails to authenticate.
    await expect(server.decrypt(second)).rejects.toBeInstanceOf(TunnelError);
    // A replay on a fresh pair fails too: it was made under another key.
    await expect(fresh.server.decrypt(first)).rejects.toBeInstanceOf(TunnelError);
  });

  it("keeps each direction in order however the calls interleave", async () => {
    const { phone, server } = await tunnelPair();
    const sent = await Promise.all([1, 2, 3, 4, 5].map((n) => phone.encrypt(utf8(`m${n}`))));
    const received = await Promise.all(sent.map((each) => server.decrypt(each)));
    expect(received.map(text)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  it("carries the largest message the specification allows, and refuses a longer one", async () => {
    const { phone, server } = await tunnelPair();
    const big = bytes(MAX_PLAINTEXT_BYTES).fill(7);
    expect(await server.decrypt(await phone.encrypt(big))).toEqual(big);
    await expect(phone.encrypt(bytes(MAX_PLAINTEXT_BYTES + 1))).rejects.toBeInstanceOf(TunnelError);
    await expect(server.decrypt(bytes(3))).rejects.toBeInstanceOf(TunnelError);
  });

  it("refuses a handshake message of the wrong shape, and a handshake completed twice", async () => {
    const server = await generateKeyPair();
    await expect(respondHandshake(server, bytes(47))).rejects.toBeInstanceOf(TunnelError);
    await expect(initiateHandshake(bytes(31))).rejects.toBeInstanceOf(TunnelError);
    const phone = await initiateHandshake(server.publicKey);
    await expect(phone.complete(bytes(10))).rejects.toBeInstanceOf(TunnelError);
    const again = await initiateHandshake(server.publicKey);
    const answered = await respondHandshake(server, again.message);
    await again.complete(answered.message);
    await expect(again.complete(answered.message)).rejects.toBeInstanceOf(TunnelError);
  });

  it("binds the prologue: two ends with different prologues never agree", async () => {
    const server = await generateKeyPair();
    const phone = await initiateHandshake(server.publicKey, "chips/tunnel/2");
    await expect(respondHandshake(server, phone.message, "chips/tunnel/1")).rejects.toBeInstanceOf(
      TunnelError,
    );
  });
});
