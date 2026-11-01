/**
 * Base64, both ways, over bytes.
 *
 * `btoa` and `atob` are on the phone and the runtime check says so, but they speak in
 * characters rather than bytes and every caller here has bytes: a key on its way to the
 * Keychain, a key on its way back. Doing it once, plainly, is cheaper than the two conversions
 * at every call site — and it is a pure module, so it is tested under Vitest with the rest.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const INDEX: ReadonlyMap<string, number> = new Map(
  [...ALPHABET].map((character, position) => [character, position]),
);

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 3) {
    const one = bytes[at] ?? 0;
    const two = bytes[at + 1];
    const three = bytes[at + 2];
    const word = (one << 16) | ((two ?? 0) << 8) | (three ?? 0);
    out += ALPHABET[(word >> 18) & 63];
    out += ALPHABET[(word >> 12) & 63];
    out += two === undefined ? "=" : ALPHABET[(word >> 6) & 63];
    out += three === undefined ? "=" : ALPHABET[word & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const trimmed = text.replace(/[=\s]+$/, "");
  const bytes = new Uint8Array(Math.floor((trimmed.length * 6) / 8));
  let word = 0;
  let bits = 0;
  let out = 0;
  for (const character of trimmed) {
    const value = INDEX.get(character);
    if (value === undefined) throw new Error("not base64");
    word = (word << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (word >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, out);
}
