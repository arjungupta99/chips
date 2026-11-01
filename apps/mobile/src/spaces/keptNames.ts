/**
 * How a file kept on this phone is named (`keepLocally` in `local.ts`), and how a name is read
 * back: the attachment's id, a dash, then what the file is of it.
 *
 *   `<id>-thumb-thumb.webp`    its thumbnail
 *   `<id>-view-view.<ext>`     a photo's viewer's copy, no longer than 2,048 pixels (ADR 0058)
 *   `<id>-play-<name>`         a video's copy that plays everywhere, or its original while that
 *                              was still being made (ADR 0053)
 *   `<id>-<name>`              the file itself, under the name it was sent as
 *
 * Read back by the file service, to find a file the phone already keeps before fetching it
 * (ADR 0161), and by Media on this phone, to put every kept file under its attachment (ADR 0159).
 * Pure, so `keptNames.vitest.ts` holds the two directions to each other.
 */

/** What one kept file is of its attachment. */
export type KeptPart = "thumb" | "view" | "play" | "file";

/** Only letters, digits and a few marks survive into a filename on disk. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  return cleaned === "" ? "file" : cleaned;
}

/**
 * A name as it was sent, made fit to be a file's: no folder in it and nothing unprintable, but its
 * spaces and its brackets kept, since it is the name the next app shows and saves (`asSent` in
 * `local.ts`).
 */
export function sentName(name: string): string {
  const cleaned = name
    .replace(/[\p{Cc}/\\:]+/gu, "_")
    .trim()
    .slice(-120);
  return cleaned === "" || /^\.+$/.test(cleaned) ? "file" : cleaned;
}

/** The attachment a kept file belongs to, which part of it the file is, and what follows the id. */
export function partOf(name: string): {
  readonly id: string;
  readonly part: KeptPart;
  readonly rest: string;
} {
  const dash = name.indexOf("-");
  if (dash === -1) return { id: name, part: "file", rest: name };
  const id = name.slice(0, dash);
  const rest = name.slice(dash + 1);
  if (rest === "thumb-thumb.webp") return { id, part: "thumb", rest };
  if (/^view-view\.[a-z]+$/.test(rest)) return { id, part: "view", rest };
  if (rest.startsWith("play-")) return { id, part: "play", rest };
  return { id, part: "file", rest };
}
