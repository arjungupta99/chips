/**
 * The QR an invite is shown as (ADR 0164): one dark path, read back by the same package that drew
 * it, so the modules on the screen are the link's.
 */
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { qrPath } from "./qr";

describe("a QR code for a link", () => {
  it("draws every dark module of the link's code, and nothing else", () => {
    const text = "https://adas-mac-mini.tail2f9c1e.ts.net/#invite=chips_inv_1";
    const { size, path } = qrPath(text);
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    expect(size).toBe(modules.size);
    let dark = 0;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) if (modules.get(y, x)) dark += 1;
    expect(path.match(/M/g)?.length).toBe(dark);
    expect(path.startsWith("M0 0h1v1h-1z")).toBe(true);
  });
});
