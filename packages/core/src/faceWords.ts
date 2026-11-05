import type { SpaceIcon } from "@chipschat/protocol";

/**
 * The face picker's words, which both clients say (ADR 0139, ADR 0174, ADR 0272): the phone's in
 * its icon sheet and a space's Icon page, the Mac's and the web's in the page your face opens on
 * You. The colours' names, in the order both pickers lay them out; what the letters field says;
 * the way back to the initials; and why a pick did not stick.
 */

/** Each ground by its index on the wire (`SpaceIcon.ground`), as a person would call it. */
export const FACE_GROUND_NAMES: readonly string[] = [
  "Pink",
  "Cyan",
  "Terracotta",
  "Teal",
  "Blue",
  "Violet",
  "Orchid",
  "Green",
  "Sea",
  "Ochre",
  "Moss",
  "Plum",
  "Red",
  "Orange",
  "Slate",
  "Brick",
  "Olive",
  "Graphite",
  "Maroon",
  "Espresso",
  "Bronze",
  "Forest",
  "Deep teal",
  "Navy",
  "Aubergine",
  "Wine",
  "Ink",
];

/**
 * The grounds as a picker lays them out, by index: nine hues across (red, orange, gold, green,
 * teal, blue, violet, pink, grey) and three depths down (bright, mid, deep), so every colour is in
 * view at once and its darker sister is under it.
 */
export const FACE_GROUND_ROWS: readonly (readonly number[])[] = [
  [12, 13, 9, 7, 8, 1, 6, 0, 14],
  [15, 2, 16, 10, 3, 4, 5, 11, 17],
  [18, 19, 20, 21, 22, 23, 24, 25, 26],
];

/** A ground's name, or its place in the list for one this build has never heard of. */
export function groundName(ground: number): string {
  return FACE_GROUND_NAMES[ground] ?? `Colour ${ground + 1}`;
}

export const FACE_PICKER_WORDS = {
  colours: "Colours",
  letters: "Letters",
  lettersField: "Letters for the face",
  lettersHint: "Type one or two letters, or an emoji, for the face",
  lettersPlaceholder: "A letter or two, or an emoji",
  clearLetters: "Clear the letters",
  useDefault: "Use the default",
  yourFace: "Your face",
  yourFaceHint: "Chooses the face you wear beside your name",
} as const;

/**
 * What a face wears, in the words its Icon row says them (ADR 0174): *Cup on Teal*, *AB on Navy*,
 * *Teal* for a colour chosen on its own, and *Default* for no face chosen, which is the initials on
 * the hue the name hashes to and what *Use the default* puts back. A mark this build has never
 * heard of (`known` says) is drawn as the colour alone, so it is said as the colour alone too.
 */
export function faceWords(face: SpaceIcon | undefined, known: (mark: string) => boolean): string {
  if (face === undefined) return "Default";
  const colour = groundName(face.ground);
  if (face.letters !== undefined && face.letters !== "") return `${face.letters} on ${colour}`;
  if (!known(face.icon)) return colour;
  return `${face.icon.charAt(0).toUpperCase()}${face.icon.slice(1)} on ${colour}`;
}

/**
 * Why a face did not stick, in words a person can act on. A 404 from these routes is not "no such
 * room" (the room was there to be clicked) and is worth saying plainly: the app is newer than the
 * server it is talking to, which is what a server that has not been restarted since the faces went
 * in looks like from here.
 */
export function whyFaceNotSaved(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  // A server that predates the route answers 404, and says so in words rather than in the code:
  // "No route matches that." is what one actually replied on the phone.
  if (/404|no route matches/i.test(said)) {
    return "Not saved: this server is older than the app, and has no icons yet.";
  }
  return said === "" ? "Not saved: the server would not take it." : `Not saved: ${said}`;
}
