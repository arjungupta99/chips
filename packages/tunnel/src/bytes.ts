/**
 * Bytes, the few ways this package needs them. Everything is a `Uint8Array` over its own
 * `ArrayBuffer`, which is what WebCrypto takes without complaint in Node and in a browser.
 */

export type Bytes = Uint8Array<ArrayBuffer>;

export function bytes(length: number): Bytes {
  return new Uint8Array(new ArrayBuffer(length));
}

export function concat(...parts: readonly Uint8Array[]): Bytes {
  const out = bytes(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A copy over its own buffer: what a view into a larger message becomes before it is kept. */
export function copy(view: Uint8Array): Bytes {
  const out = bytes(view.length);
  out.set(view);
  return out;
}

export function utf8(text: string): Bytes {
  return copy(new TextEncoder().encode(text));
}

export function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

export function randomBytes(length: number): Bytes {
  const out = bytes(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function toBase64url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(value: string): Bytes {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const out = bytes(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const out = bytes(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(data: Uint8Array): string {
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fromHex(value: string): Bytes {
  const out = bytes(value.length / 2);
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Equality that does not stop at the first difference. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

/** Whatever a socket handed over — an `ArrayBuffer`, a view, a Node `Buffer` — as bytes of our own. */
export function asBytes(data: unknown): Bytes | undefined {
  if (data instanceof ArrayBuffer) return copy(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return copy(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return undefined;
}
