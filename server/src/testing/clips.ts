/**
 * Videos and sound for the tests that run the real ffmpeg (ADR 0053, ADR 0054): the test pattern
 * with a tone, in the codec and container asked for, turned the way a phone held upright records
 * one, and saying where it was taken the way a phone does; a tone or silence; and speech, where the
 * Mac's own voice can say it. Made by the tools under test, so no fixture is checked in.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

export interface ClipOptions {
  readonly seconds: number;
  /** Encoder options: `["-c:v", "libx265", "-tag:v", "hvc1", "-c:a", "aac"]`. */
  readonly encode: readonly string[];
  /** Recorded sideways, with a rotation of 90 degrees. */
  readonly sideways?: boolean;
  /**
   * Where it was taken, in ISO 6709 (`+51.5007-000.1246+020.000/`), written into an MP4 or a
   * QuickTime file as an iPhone writes it and as an Android phone does.
   */
  readonly location?: string;
}

/** A clip at `directory/name`, and its bytes. */
export function makeClip(
  ffmpeg: string,
  directory: string,
  name: string,
  options: ClipOptions,
): Uint8Array<ArrayBuffer> {
  const path = join(directory, name);
  const encoded = join(directory, `encoded-${name}`);
  const turned = options.sideways === true ? join(directory, `turned-${name}`) : encoded;
  execFileSync(ffmpeg, [
    ...["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30"],
    ...["-f", "lavfi", "-i", "sine=frequency=440", "-t", String(options.seconds)],
    ...options.encode,
    ...["-y", encoded],
  ]);
  if (options.sideways === true) turn(ffmpeg, encoded, turned);
  if (options.location === undefined) renameSync(turned, path);
  else locate(ffmpeg, turned, path, options.location);
  return new Uint8Array(readFileSync(path));
}

/**
 * Say where a clip was taken, without encoding it again: an iPhone's key in QuickTime's own
 * metadata, and the `©xyz` box an Android phone writes, which ffmpeg calls `location`.
 */
function locate(ffmpeg: string, from: string, to: string, location: string): void {
  execFileSync(ffmpeg, [
    ...["-hide_banner", "-v", "error", "-i", from, "-c", "copy"],
    ...["-movflags", "use_metadata_tags"],
    ...["-metadata", `com.apple.quicktime.location.ISO6709=${location}`],
    ...["-metadata", "com.apple.quicktime.make=Apple"],
    ...["-metadata", `location=${location}`],
    ...["-y", to],
  ]);
}

/**
 * Say a clip is turned a quarter, without encoding it again. ffmpeg 7 and later take
 * `-display_rotation` before the input; the 6.1 a Linux distribution packages still takes the
 * `rotate` tag, which later versions ignore.
 */
function turn(ffmpeg: string, from: string, to: string): void {
  try {
    execFileSync(
      ffmpeg,
      ["-v", "error", "-display_rotation", "90", "-i", from, "-c", "copy", "-y", to],
      {
        stdio: "pipe",
      },
    );
  } catch {
    execFileSync(ffmpeg, [
      ...["-v", "error", "-i", from, "-c", "copy", "-metadata:s:v:0", "rotate=90", "-y", to],
    ]);
  }
}

/** Sound at `directory/name`, and its bytes: a tone, or silence, in the encoding asked for. */
export function makeSound(
  ffmpeg: string,
  directory: string,
  name: string,
  options: {
    readonly seconds: number;
    readonly silent?: boolean;
    /** Encoder options: `["-c:a", "aac"]`. */
    readonly encode: readonly string[];
  },
): Uint8Array<ArrayBuffer> {
  const path = join(directory, name);
  const source = options.silent === true ? "anullsrc=r=44100:cl=mono" : "sine=frequency=330";
  execFileSync(ffmpeg, [
    ...["-hide_banner", "-v", "error", "-f", "lavfi", "-i", source, "-t", String(options.seconds)],
    ...options.encode,
    ...["-y", path],
  ]);
  return new Uint8Array(readFileSync(path));
}

/** Where macOS keeps the command that speaks. Nowhere else has it. */
const SAY = "/usr/bin/say";

/**
 * Words spoken by the Mac's own voice into `directory/name`, encoded as asked: what a person says
 * into a phone, for the test of the real whisper. Nothing where there is no voice to say them.
 */
export function makeSpeech(
  ffmpeg: string,
  directory: string,
  name: string,
  words: string,
  encode: readonly string[],
): Uint8Array<ArrayBuffer> | undefined {
  if (!existsSync(SAY)) return undefined;
  const spoken = join(directory, `${name}.aiff`);
  execFileSync(SAY, ["-o", spoken, words]);
  const path = join(directory, name);
  execFileSync(ffmpeg, ["-hide_banner", "-v", "error", "-i", spoken, ...encode, "-y", path]);
  return new Uint8Array(readFileSync(path));
}
