import { describe, expect, it } from "vitest";
import { capsOf, refuseCapsOverCeiling } from "./attachment-limits.js";

const MB = 1024 * 1024;
const EVENT = {
  type: "attachment.limits_set",
  image_bytes: 25 * MB,
  video_bytes: null,
  file_bytes: 50 * MB,
};

describe("attachment caps", () => {
  it("reads the three caps, null where the server's own limit applies", () => {
    expect(capsOf(EVENT)).toEqual({ image: 25 * MB, video: null, file: 50 * MB });
    expect(capsOf({ type: "attachment.limits_set" })).toEqual({
      image: null,
      video: null,
      file: null,
    });
  });

  it("refuses a cap above the ceiling, and nothing else", () => {
    expect(refuseCapsOverCeiling(EVENT, 100 * MB)).toBeUndefined();
    expect(refuseCapsOverCeiling({ ...EVENT, video_bytes: 200 * MB }, 100 * MB)).toEqual({
      kind: "invalid",
      message: "A cap of 200 MB on videos is more than this server takes (100 MB).",
    });
    // Without a ceiling to judge by, and for any other event, nothing is said.
    expect(refuseCapsOverCeiling({ ...EVENT, video_bytes: 200 * MB }, undefined)).toBeUndefined();
    expect(refuseCapsOverCeiling({ type: "role.changed", image_bytes: 1e12 }, 1)).toBeUndefined();
  });
});
