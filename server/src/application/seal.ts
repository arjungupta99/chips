/**
 * Words sealed to one phone (ADR 0158).
 *
 * A push passes through Expo's service and Apple's on its way to the lock screen. What an agent
 * said to a person goes through them sealed: AES-256-GCM under the 32-byte key the phone made
 * and registered, with a fresh 12-byte nonce each time. The phone's notification extension opens
 * it with CryptoKit, which reads the same layout (`AES.GCM.SealedBox(combined:)`): nonce, then
 * the ciphertext, then the 16-byte tag, all as one base64 string. Anything between here and the
 * phone sees ciphertext of about the words' length.
 */

import { createCipheriv, randomBytes } from "node:crypto";

const NONCE_BYTES = 12;

/** `plaintext` sealed to the phone's key (base64 of 32 bytes), as base64 of nonce ‖ ciphertext ‖ tag. */
export function sealTo(
  keyBase64: string,
  plaintext: string,
  nonce = randomBytes(NONCE_BYTES),
): string {
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), nonce);
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, sealed, cipher.getAuthTag()]).toString("base64");
}

/**
 * A message as one line for a lock screen: links and pictures by their words, the marks gone,
 * the whitespace folded, cut at a word near `max` with an ellipsis. Not the apps' parser, which the
 * server may not import; a lock screen needs words, not fidelity.
 */
export function lockScreenLine(text: string, max: number): string {
  const plain = text
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_all, alt: string) => alt || "Image")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
