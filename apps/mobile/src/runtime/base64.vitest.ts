import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "./base64";

describe("base64", () => {
  it("agrees with Node, both ways, on any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        const expected = Buffer.from(bytes).toString("base64");
        expect(toBase64(bytes)).toBe(expected);
        expect([...fromBase64(expected)]).toEqual([...bytes]);
      }),
    );
  });

  it("pads the way the alphabet says", () => {
    expect(toBase64(new Uint8Array([1]))).toBe("AQ==");
    expect(toBase64(new Uint8Array([1, 2]))).toBe("AQI=");
    expect(toBase64(new Uint8Array([1, 2, 3]))).toBe("AQID");
    expect(toBase64(new Uint8Array(0))).toBe("");
  });

  it("refuses a character that is not in the alphabet", () => {
    expect(() => fromBase64("not base64!")).toThrow();
  });
});
