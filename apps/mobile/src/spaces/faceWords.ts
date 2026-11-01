/**
 * What a face wears, in the words its Icon row says them (ADR 0174): *Cup on Teal*, *AB on Navy*,
 * *Teal* for a colour chosen on its own, and *Default* for no face chosen, which is the initials
 * on the hue the name hashes to and what *Use the default* puts back.
 *
 * A mark this build has never heard of is drawn as the colour alone (`Avatar`), so it is said as
 * the colour alone too.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { LIBRARY_MARKS } from "../ui/marks";
import { ICON_GROUND_NAMES } from "../ui/tokens";

export function faceWords(face: SpaceIcon | undefined): string {
  if (face === undefined) return "Default";
  const colour = ICON_GROUND_NAMES[face.ground] ?? `Colour ${face.ground + 1}`;
  if (face.letters !== undefined && face.letters !== "") return `${face.letters} on ${colour}`;
  if (!(face.icon in LIBRARY_MARKS)) return colour;
  return `${face.icon.charAt(0).toUpperCase()}${face.icon.slice(1)} on ${colour}`;
}
