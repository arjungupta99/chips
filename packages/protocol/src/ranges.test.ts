import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { byteRange, contentRange } from "./ranges.js";

const SIZE = 10_000;

describe("a Range header over a file of 10,000 bytes", () => {
  it("serves a first run, a middle one and an open-ended one", () => {
    expect(byteRange("bytes=0-499", SIZE)).toEqual({ kind: "part", start: 0, end: 499 });
    expect(byteRange("bytes=5000-5999", SIZE)).toEqual({ kind: "part", start: 5000, end: 5999 });
    expect(byteRange("bytes=9500-", SIZE)).toEqual({ kind: "part", start: 9500, end: 9999 });
  });

  it("serves the last so many bytes, and the whole file when that is more than there is", () => {
    expect(byteRange("bytes=-500", SIZE)).toEqual({ kind: "part", start: 9500, end: 9999 });
    expect(byteRange("bytes=-20000", SIZE)).toEqual({ kind: "part", start: 0, end: 9999 });
  });

  it("ends a run that goes past the end at the end", () => {
    expect(byteRange("bytes=9000-20000", SIZE)).toEqual({ kind: "part", start: 9000, end: 9999 });
  });

  it("asks AVPlayer's first two bytes", () => {
    expect(byteRange("bytes=0-1", SIZE)).toEqual({ kind: "part", start: 0, end: 1 });
  });

  it("cannot serve a run that starts past the end, or the last nought bytes", () => {
    expect(byteRange("bytes=10000-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(byteRange("bytes=12000-13000", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(byteRange("bytes=-0", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(byteRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
    expect(byteRange("bytes=-5", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("serves the whole file for what it does not read", () => {
    for (const header of [
      undefined,
      null,
      "",
      "bytes=",
      "bytes=-",
      "bytes=500-400",
      "bytes=0-1,5-6",
      "items=0-5",
      "bytes=a-b",
      "bytes=1.5-2",
    ]) {
      expect(byteRange(header, SIZE), String(header)).toEqual({ kind: "whole" });
    }
  });

  it("reads the unit in any case and spaces around the numbers", () => {
    expect(byteRange("Bytes = 10 - 20", SIZE)).toEqual({ kind: "part", start: 10, end: 20 });
  });

  it("says Content-Range for a part and for a range it could not serve", () => {
    expect(contentRange({ kind: "part", start: 0, end: 499 }, SIZE)).toBe("bytes 0-499/10000");
    expect(contentRange({ kind: "unsatisfiable" }, SIZE)).toBe("bytes */10000");
    expect(contentRange({ kind: "whole" }, SIZE)).toBeUndefined();
  });

  it("never serves a byte outside the file, and never an empty run", () => {
    fc.assert(
      fc.property(
        fc.nat(100_000),
        fc.option(fc.nat(200_000), { nil: undefined }),
        fc.option(fc.nat(200_000), { nil: undefined }),
        (size, first, last) => {
          const header = `bytes=${first ?? ""}-${last ?? ""}`;
          const answer = byteRange(header, size);
          if (answer.kind !== "part") return;
          expect(answer.start).toBeGreaterThanOrEqual(0);
          expect(answer.end).toBeLessThan(size);
          expect(answer.end).toBeGreaterThanOrEqual(answer.start);
        },
      ),
    );
  });
});
