/**
 * Words sealed to one phone (ADR 0158): the layout CryptoKit opens, nonce ‖ ciphertext ‖ tag, and
 * a lock screen's line of plain words.
 */

import { createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lockScreenLine, sealTo } from "./seal.js";

/** What the phone's extension does, in Node's words. */
function open(keyBase64: string, sealed: string): string {
  const bytes = Buffer.from(sealed, "base64");
  const nonce = bytes.subarray(0, 12);
  const tag = bytes.subarray(bytes.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(bytes.subarray(12, bytes.length - 16)),
    decipher.final(),
  ]).toString("utf8");
}

describe("sealing", () => {
  const key = randomBytes(32).toString("base64");

  it("opens with the phone's key, as nonce, ciphertext and tag", () => {
    const words = JSON.stringify({
      title: "Boris · Cholesterol",
      body: "@Arjun ⏰ call the dentist",
    });
    const sealed = sealTo(key, words);
    expect(open(key, sealed)).toBe(words);
    expect(Buffer.from(sealed, "base64")).toHaveLength(12 + Buffer.byteLength(words) + 16);
  });

  it("is new each time, and opens with no other key", () => {
    expect(sealTo(key, "same")).not.toBe(sealTo(key, "same"));
    expect(() => open(randomBytes(32).toString("base64"), sealTo(key, "same"))).toThrow();
  });
});

describe("a lock screen's line", () => {
  it("keeps the words and drops the marks", () => {
    expect(
      lockScreenLine(
        "## Done\n\n**@Arjun** the [report](https://example.com/r) is in `out.md`:\n- one\n- _two_\n\n![chart](x.png)",
        240,
      ),
    ).toBe("Done @Arjun the report is in out.md: one two chart");
  });

  it("is cut at a word near the end, with an ellipsis", () => {
    const line = lockScreenLine("word ".repeat(100), 40);
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line).toMatch(/word…$/);
  });
});
