import { describe, expect, it } from "vitest";
import {
  attachmentCap,
  capsOverCeiling,
  formatLimit,
  kindFromName,
  NO_CAPS,
  sizeRefusal,
} from "./limits.js";

const MB = 1024 * 1024;
const CEILING = 100 * MB;

describe("attachment caps", () => {
  it("applies the workspace's cap under the ceiling, and the ceiling where there is none", () => {
    expect(attachmentCap(NO_CAPS, "image", CEILING)).toBe(CEILING);
    expect(attachmentCap({ ...NO_CAPS, image: 25 * MB }, "image", CEILING)).toBe(25 * MB);
    expect(attachmentCap({ ...NO_CAPS, image: 250 * MB }, "image", CEILING)).toBe(CEILING);
  });

  it("caps audio and everything else as a file", () => {
    const caps = { image: 1 * MB, video: 2 * MB, file: 3 * MB };
    expect(attachmentCap(caps, "audio", CEILING)).toBe(3 * MB);
    expect(attachmentCap(caps, "file", CEILING)).toBe(3 * MB);
    expect(attachmentCap(caps, "video", CEILING)).toBe(2 * MB);
  });

  it("says whose limit stopped a file, in one sentence", () => {
    expect(sizeRefusal({ ...NO_CAPS, video: 50 * MB }, "video", 62.3 * MB, CEILING)).toBe(
      "Videos here are capped at 50 MB, and this one is 62.3 MB.",
    );
    expect(sizeRefusal(NO_CAPS, "image", 120 * MB, CEILING)).toBe(
      "This server takes photos up to 100 MB, and this one is 120 MB.",
    );
    expect(sizeRefusal({ ...NO_CAPS, file: 5 * MB }, "audio", 6 * MB, CEILING)).toBe(
      "Files here are capped at 5 MB, and this one is 6 MB.",
    );
    expect(sizeRefusal({ ...NO_CAPS, file: 5 * MB }, "file", 5 * MB, CEILING)).toBeUndefined();
  });

  it("says a size more finely when it would read as the cap itself", () => {
    expect(sizeRefusal({ ...NO_CAPS, image: 1 * MB }, "image", 1 * MB + 40_000, CEILING)).toBe(
      "Photos here are capped at 1 MB, and this one is 1.04 MB.",
    );
  });

  it("formats whole megabytes without a decimal, and less than one in kilobytes", () => {
    expect(formatLimit(50 * MB)).toBe("50 MB");
    expect(formatLimit(1.5 * MB)).toBe("1.5 MB");
    expect(formatLimit(512 * 1024)).toBe("512 KB");
    expect(formatLimit(700)).toBe("1 KB");
  });

  it("refuses a cap above the ceiling by name", () => {
    expect(capsOverCeiling({ ...NO_CAPS, video: 200 * MB }, CEILING)).toBe(
      "A cap of 200 MB on videos is more than this server takes (100 MB).",
    );
    expect(capsOverCeiling({ image: CEILING, video: 1, file: null }, CEILING)).toBeUndefined();
  });

  it("guesses a kind from a name, and calls an SVG a file", () => {
    expect(kindFromName("IMG_2210.HEIC")).toBe("image");
    expect(kindFromName("clip.mov")).toBe("video");
    expect(kindFromName("note.m4a")).toBe("audio");
    expect(kindFromName("logo.svg")).toBe("file");
    expect(kindFromName("Makefile")).toBe("file");
  });
});
