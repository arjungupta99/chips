import { describe, expect, it } from "vitest";
import {
  contentDisposition,
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

  it("keeps a plain ASCII name in its one plain form", () => {
    expect(contentDisposition("inline", "IMG_2210.jpg")).toBe('inline; filename="IMG_2210.jpg"');
    expect(contentDisposition("attachment", "it's (final) 100%.txt")).toBe(
      `attachment; filename="it's (final) 100%.txt"`,
    );
  });

  it("takes out what would end the quoted string or the header", () => {
    expect(contentDisposition("attachment", 'evil".html')).toBe(
      'attachment; filename="evil_.html"',
    );
    expect(contentDisposition("attachment", "back\\slash.txt")).toBe(
      'attachment; filename="back_slash.txt"',
    );
    expect(contentDisposition("attachment", "two\r\nSet-Cookie: a=b.txt")).toBe(
      'attachment; filename="two__Set-Cookie: a=b.txt"',
    );
    expect(contentDisposition("attachment", "nul\u0000 tab\t del\u007f.txt")).toBe(
      'attachment; filename="nul_ tab_ del_.txt"',
    );
  });

  it("sends a Mac's screen recording, whose name has U+202F before the PM, in both forms", () => {
    expect(
      servingHeaders("video/quicktime", "Screen Recording 2026-11-08 at 7.23.58 PM.mov"),
    ).toEqual({
      contentType: "video/quicktime",
      disposition:
        'inline; filename="Screen Recording 2026-11-08 at 7.23.58 PM.mov"; ' +
        "filename*=UTF-8''Screen%20Recording%202026-11-08%20at%207.23.58%E2%80%AFPM.mov",
    });
  });

  it("sends an emoji, CJK and an accent in both forms, one stand-in to a character", () => {
    expect(contentDisposition("attachment", "party \u{1f389}.png")).toBe(
      `attachment; filename="party _.png"; filename*=UTF-8''party%20%F0%9F%8E%89.png`,
    );
    expect(contentDisposition("inline", "日本語.txt")).toBe(
      `inline; filename="___.txt"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt`,
    );
    expect(contentDisposition("inline", "café.pdf")).toBe(
      `inline; filename="caf_.pdf"; filename*=UTF-8''caf%C3%A9.pdf`,
    );
  });

  it("percent-encodes the marks RFC 5987 leaves out and encodeURIComponent keeps", () => {
    expect(contentDisposition("attachment", "it's (é)*.txt")).toBe(
      `attachment; filename="it's (_)*.txt"; filename*=UTF-8''it%27s%20%28%C3%A9%29%2A.txt`,
    );
  });

  it("takes the same marks out of a name that goes in both forms", () => {
    const disposition = contentDisposition("attachment", '日"\\\r\n.txt');
    expect(disposition).toBe(
      `attachment; filename="_____.txt"; filename*=UTF-8''%E6%97%A5____.txt`,
    );
  });

  it("takes out half an emoji, which the 255-character cut can leave and encodeURIComponent throws on", () => {
    const cut = `${"a".repeat(254)}\u{1f389}`.slice(0, 255);
    expect(contentDisposition("inline", cut)).toBe(`inline; filename="${"a".repeat(254)}_"`);
    expect(contentDisposition("inline", "日\udc00.txt")).toBe(
      `inline; filename="__.txt"; filename*=UTF-8''%E6%97%A5_.txt`,
    );
  });

  it("gives Node a value it will send, and a client the name back, whatever the name", () => {
    const names = [
      "Screen Shot PM.png",
      " no-break.txt",
      "\u{1f468}‍\u{1f469}‍\u{1f467}.png",
      "ملف.pdf",
      "Ā.txt",
      "ÿ.txt",
      "%41.txté",
    ];
    for (const name of names) {
      const disposition = contentDisposition("attachment", name);
      expect(disposition, name).toMatch(/^[\x20-\x7e]+$/);
      expect(
        () => new Response(null, { headers: { "content-disposition": disposition } }),
      ).not.toThrow();
      expect(decodeURIComponent(disposition.split("''")[1] ?? "")).toBe(name);
    }
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
