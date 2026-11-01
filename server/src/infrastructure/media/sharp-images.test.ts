import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createSharpImages } from "./sharp-images.js";

const images = createSharpImages();

/** A photo the way a phone writes one: orientation and location tags in its metadata. */
async function photo(): Promise<Uint8Array> {
  const data = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg({ quality: 80 })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Copyright: "Arjun" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .toBuffer();
  return new Uint8Array(data);
}

describe("images, with sharp", () => {
  it("reads a photo's size, and nothing from a file that is not one", async () => {
    expect(await images.inspect(await photo())).toEqual({ width: 1600, height: 1200 });
    expect(await images.inspect(new TextEncoder().encode("<html></html>"))).toBeUndefined();
  });

  it("strips the metadata — location included — and straightens the photo, by default", async () => {
    const before = await sharp(await photo()).metadata();
    expect(before.exif).toBeDefined();

    const kept = await images.prepare(await photo(), { keepMetadata: false });
    const after = await sharp(kept.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(kept.mimeType).toBe("image/jpeg");
    // Orientation 6 is a quarter turn: applying it swaps the sides, and the tag is gone.
    expect([kept.width, kept.height]).toEqual([1200, 1600]);
    expect(after.orientation).toBeUndefined();
  });

  it("keeps the metadata when the uploader asks", async () => {
    const kept = await images.prepare(await photo(), { keepMetadata: true });
    const meta = await sharp(kept.bytes).metadata();
    expect(meta.exif).toBeDefined();
  });

  it("makes a thumbnail no larger than the edge asked for, as WebP, never enlarging", async () => {
    const thumb = await images.thumbnail(await photo(), 512);
    expect(thumb.mimeType).toBe("image/webp");
    expect(Math.max(thumb.width, thumb.height)).toBe(512);

    const tiny = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    const small = await images.thumbnail(new Uint8Array(tiny), 512);
    expect([small.width, small.height]).toEqual([40, 30]);
  });
});
