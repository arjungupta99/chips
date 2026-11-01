/**
 * What an agent's name is for, under the field that renames it (ADR 0091): who calls it that, its
 * @, and that its harness can't change it back. Its card and its page in a room's sheet
 * (ADR 0111) both say it.
 *
 * "@‑name" is written with a non-breaking hyphen (U+2011): in the narrow column beside a face on
 * the card the words wrap, and they wrapped there as "@-" and "name".
 */

import { isHandle } from "@chipschat/protocol";

/** A hyphen a line never breaks at. */
const HYPHEN = "\u2011";

export function nameWords(draft: string, harness: string): string {
  const handle = draft.trim().replace(/\s+/g, "");
  return isHandle(handle)
    ? `What people and agents here call it. Its @${HYPHEN}name is @${handle}, and ${harness} can't change it back.`
    : `What people and agents here call it. ${harness} can't change it back.`;
}
