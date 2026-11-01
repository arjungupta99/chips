import { describe, expect, it } from "vitest";
import { err, isErr, isOk, map, ok, unwrap } from "./result.js";

describe("Result", () => {
  it("carries the value on success", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it("carries the error on failure", () => {
    expect(err("nope")).toEqual({ ok: false, error: "nope" });
  });

  it("narrows to Ok through isOk", () => {
    const result = ok(3);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it("narrows to Err through isErr", () => {
    const result = err("nope");
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it("unwraps a success without throwing", () => {
    expect(unwrap(ok(7), () => new Error("unused"))).toBe(7);
  });

  it("throws the caller's error when unwrapping a failure", () => {
    expect(() => unwrap(err("bad"), (e) => new Error(`boom: ${e}`))).toThrow("boom: bad");
  });

  it("maps over a success", () => {
    expect(map(ok(2), (n) => n * 5)).toEqual({ ok: true, value: 10 });
  });

  it("leaves a failure untouched when mapping", () => {
    expect(map(err("bad"), (n: number) => n * 5)).toEqual({ ok: false, error: "bad" });
  });
});
