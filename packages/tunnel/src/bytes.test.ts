/**
 * Bytes, the few ways this package needs them: encodings that round-trip, an equality that reads
 * every byte, and whatever a socket hands over becoming bytes of our own.
 */

import { describe, expect, it } from "vitest";
import {
  asBytes,
  concat,
  equalBytes,
  fromBase64,
  fromBase64url,
  fromHex,
  randomBytes,
  text,
  toBase64,
  toBase64url,
  toHex,
  utf8,
} from "./bytes.js";

describe("bytes", () => {
  it("round-trip through base64, base64url and hex", () => {
    const data = randomBytes(37);
    expect(fromBase64(toBase64(data))).toEqual(data);
    expect(fromBase64url(toBase64url(data))).toEqual(data);
    expect(fromHex(toHex(data))).toEqual(data);
    expect(toBase64url(data)).not.toMatch(/[+/=]/);
    expect(text(utf8("héllo"))).toBe("héllo");
  });

  it("compare every byte, and concatenate in order", () => {
    expect(equalBytes(utf8("abc"), utf8("abc"))).toBe(true);
    expect(equalBytes(utf8("abc"), utf8("abd"))).toBe(false);
    expect(equalBytes(utf8("abc"), utf8("ab"))).toBe(false);
    expect(text(concat(utf8("ab"), utf8("c"), new Uint8Array(0)))).toBe("abc");
  });

  it("take an ArrayBuffer, a view, or a Buffer as bytes, and nothing else", () => {
    const view = utf8("view");
    expect(asBytes(view.buffer)).toEqual(view);
    expect(asBytes(new DataView(view.buffer, 1, 2))).toEqual(utf8("ie"));
    expect(asBytes(Buffer.from("buf"))).toEqual(utf8("buf"));
    expect(asBytes("text")).toBeUndefined();
    expect(asBytes(undefined)).toBeUndefined();
  });
});
