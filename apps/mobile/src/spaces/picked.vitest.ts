import { NO_CAPS } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { fromAsset, mimeFromName, nameFromUri, refusalFor, voiceNote } from "./picked";

const MB = 1024 * 1024;

describe("a picked file", () => {
  it("is named and typed from what the picker knew, else from its URI and its extension", () => {
    const photo = fromAsset(
      { uri: "file:///tmp/IMG_2210.jpg", width: 4032, height: 3024, fileSize: 3 * MB } as never,
      0,
    );
    expect(photo).toEqual({
      name: "IMG_2210.jpg",
      mimeType: "image/jpeg",
      size: 3 * MB,
      uri: "file:///tmp/IMG_2210.jpg",
      width: 4032,
      height: 3024,
    });
    const clip = fromAsset(
      { uri: "file:///tmp/", width: 1920, height: 1080, type: "video", fileName: null } as never,
      2,
    );
    expect(clip.name).toBe("video-3.mp4");
    expect(clip.mimeType).toBe("video/mp4");
    expect(clip.size).toBeUndefined();
  });

  it("names a photo or a video Android's picker gave only its id as a nameless pick is", () => {
    const photo = fromAsset(
      {
        uri: "file:///cache/ImagePicker/a1.jpeg",
        fileName: "19.jpg",
        mimeType: "image/jpeg",
      } as never,
      0,
    );
    expect(photo.name).toBe("photo-1.jpg");
    expect(photo.mimeType).toBe("image/jpeg");
    const clip = fromAsset(
      { uri: "file:///cache/ImagePicker/b2.mp4", fileName: "20.mp4", type: "video" } as never,
      1,
    );
    expect(clip.name).toBe("video-2.mp4");
    expect(clip.mimeType).toBe("video/mp4");
    const png = fromAsset({ uri: "file:///cache/c3.png", fileName: "1000000034.png" } as never, 2);
    expect(png.name).toBe("photo-3.png");
    expect(fromAsset({ uri: "file:///x", fileName: "2026 trip.jpg" } as never, 0).name).toBe(
      "2026 trip.jpg",
    );
  });

  it("names a picture the camera saved under a UUID as a nameless pick is", () => {
    const shot = fromAsset(
      {
        uri: "file:///cache/ImagePicker/01a394c0-1223-4f72-8c97-a05d01222424.jpeg",
        fileName: "01a394c0-1223-4f72-8c97-a05d01222424.jpeg",
      } as never,
      0,
    );
    expect(shot.name).toBe("photo-1.jpeg");
    expect(shot.mimeType).toBe("image/jpeg");
    const nameless = fromAsset(
      { uri: "file:///cache/ImagePicker/9F2C1E7A-55B0-4D3B-A2C4-0E1F2A3B4C5D.jpg" } as never,
      1,
    );
    expect(nameless.name).toBe("photo-2.jpg");
  });

  it("names a voice note for when it was made, and types it as the recorder makes it (ADR 0054)", () => {
    const at = new Date(2026, 8, 3, 9, 5);
    expect(voiceNote("file:///tmp/recording.m4a", at, false)).toEqual({
      name: "voice-note-0903-0905.m4a",
      mimeType: "audio/mp4",
      size: undefined,
      uri: "file:///tmp/recording.m4a",
    });
    expect(voiceNote("blob:http://localhost/1", at, true)).toMatchObject({
      name: "voice-note-0903-0905.webm",
      mimeType: "audio/webm",
    });
  });

  it("guesses a type from a name, and calls the rest a stream of bytes", () => {
    expect(mimeFromName("photo.HEIC")).toBe("image/heic");
    expect(mimeFromName("notes")).toBe("application/octet-stream");
    expect(nameFromUri("file:///a/b/report%20final.pdf?x=1", "file")).toBe("report final.pdf");
    expect(nameFromUri("file:///a/b/", "file")).toBe("file");
  });

  it("refuses by the kind, judging an unknown type by the name, and never a size it does not know", () => {
    const caps = { ...NO_CAPS, image: 1 * MB, file: 2 * MB };
    const photo = { name: "a.png", mimeType: "image/png", size: 1.5 * MB, uri: "u" };
    expect(refusalFor(photo, caps)).toBe("Photos here are capped at 1 MB, and this one is 1.5 MB.");
    const bytes = {
      name: "clip.mov",
      mimeType: "application/octet-stream",
      size: 3 * MB,
      uri: "u",
    };
    expect(refusalFor(bytes, caps)).toBeUndefined();
    const doc = { name: "x.bin", mimeType: "application/octet-stream", size: 3 * MB, uri: "u" };
    expect(refusalFor(doc, caps)).toBe("Files here are capped at 2 MB, and this one is 3 MB.");
    expect(refusalFor({ ...photo, size: undefined }, caps)).toBeUndefined();
    expect(refusalFor(photo, NO_CAPS)).toBeUndefined();
  });
});
