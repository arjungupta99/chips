import { describe, expect, it } from "vitest";
import {
  isRasterImage,
  kindOf,
  servesInline,
  servingHeaders,
  sniffMime,
  soundOnlyMime,
} from "./sniff.js";

const bytes = (...values: (number | string)[]): Uint8Array =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "number" ? [value] : [...value].map((c) => c.charCodeAt(0)),
    ),
  );

describe("what a file is, from its bytes", () => {
  it("knows the photo and document formats by their signatures, whatever the name says", () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0), "holiday.txt")).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a), "x.jpg")).toBe("image/png");
    expect(sniffMime(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMime(bytes("RIFF", 1, 2, 3, 4, "WEBP"))).toBe("image/webp");
    expect(sniffMime(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypisom"))).toBe("video/mp4");
    expect(sniffMime(bytes(0, 0, 0, 0x14, "ftypqt  "))).toBe("video/quicktime");
    // A phone's photo lives in the same box as a video; the brand tells them apart (M4.4).
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypheic"))).toBe("image/heic");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypmif1"))).toBe("image/heif");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypavif"))).toBe("image/avif");
    expect(sniffMime(bytes("PK", 3, 4))).toBe("application/zip");
  });

  it("knows recorded sound, and a voice memo from a video in the same box (ADR 0054)", () => {
    expect(sniffMime(bytes(0, 0, 0, 0x1c, "ftypM4A "), "note.mp4")).toBe("audio/mp4");
    expect(sniffMime(bytes(0, 0, 0, 0x1c, "ftypM4B "))).toBe("audio/mp4");
    expect(sniffMime(bytes("ID3", 4, 0))).toBe("audio/mpeg");
    expect(sniffMime(bytes(0xff, 0xf3, 0x90))).toBe("audio/mpeg");
    expect(sniffMime(bytes(0xff, 0xf1, 0x50))).toBe("audio/aac");
    expect(sniffMime(bytes("fLaC", 0, 0, 0, 0x22))).toBe("audio/flac");
    expect(sniffMime(bytes("caff", 0, 1))).toBe("audio/x-caf");
    expect(sniffMime(bytes("RIFF", 1, 2, 3, 4, "WAVE"))).toBe("audio/wav");
    expect(sniffMime(bytes("OggS", 0))).toBe("audio/ogg");
  });

  it("calls a video with no picture the sound it is", () => {
    expect(soundOnlyMime("video/webm")).toBe("audio/webm");
    expect(soundOnlyMime("video/mp4")).toBe("audio/mp4");
    expect(soundOnlyMime("video/quicktime")).toBe("audio/mp4");
  });

  it("recognises markup by what it contains, since a script needs no signature", () => {
    expect(sniffMime(bytes("<!DOCTYPE html><html><body>hi</body></html>"), "po.pdf")).toBe(
      "text/html",
    );
    expect(sniffMime(bytes("<script>alert(1)</script>"))).toBe("text/html");
    expect(sniffMime(bytes('<?xml version="1.0"?><svg xmlns="x"></svg>'), "logo.png")).toBe(
      "image/svg+xml",
    );
  });

  it("calls plain text by its extension, and the rest a stream of bytes", () => {
    expect(sniffMime(bytes("# Notes\\n"), "notes.md")).toBe("text/markdown");
    expect(sniffMime(bytes("a,b\\n1,2\\n"), "rows.csv")).toBe("text/csv");
    expect(sniffMime(bytes("hello"), "whatever.bin")).toBe("text/plain");
    expect(sniffMime(bytes(0x00, 0x01, 0x02, 0x03))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array(0))).toBe("application/octet-stream");
  });
});

describe("what may render in place", () => {
  it("shows photos, PDFs, recorded video and sound inline, and everything else as a download", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/webm",
      "audio/ogg",
      "audio/wav",
    ]) {
      expect(servesInline(mime), mime).toBe(true);
    }
    for (const mime of [
      "text/html",
      "image/svg+xml",
      "text/plain",
      "application/zip",
      "audio/x-caf",
    ]) {
      expect(servesInline(mime), mime).toBe(false);
    }
  });

  it("serves a download as opaque bytes, with a safe filename", () => {
    expect(servingHeaders("text/html", 'evil".html')).toEqual({
      contentType: "application/octet-stream",
      disposition: 'attachment; filename="evil_.html"',
    });
    expect(servingHeaders("image/jpeg", "IMG_2210.jpg")).toEqual({
      contentType: "image/jpeg",
      disposition: 'inline; filename="IMG_2210.jpg"',
    });
  });

  it("sorts a MIME type into a kind, and an SVG into a file", () => {
    expect(kindOf("image/png")).toBe("image");
    expect(kindOf("image/svg+xml")).toBe("file");
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("audio/ogg")).toBe("audio");
    expect(kindOf("application/pdf")).toBe("file");
    expect(isRasterImage("image/webp")).toBe(true);
    expect(isRasterImage("image/svg+xml")).toBe(false);
  });
});
