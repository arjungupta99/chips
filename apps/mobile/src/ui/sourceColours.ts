/** Restrained identity colours, shared by routes and replies. Never use the receiving space. */
import { AVATAR_HUES } from "./tokens";

/**
 * Which of the hues a name lands on. It is also a ground index, because `ICON_GROUNDS` opens
 * with these eight — so the icon picker can put its tick on the colour a room is already
 * wearing instead of claiming the first swatch (Arjun, 22 September 2026).
 */
export function avatarHueIndex(name: string): number {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1_000_003;
  return hash % AVATAR_HUES.length;
}

/** The existing avatar name mapping: one hue across every place an identity appears. */
export function avatarHue(name: string): string {
  return AVATAR_HUES[avatarHueIndex(name)] ?? AVATAR_HUES[0];
}

function mix(a: string, b: string, amount: number): string {
  return `#${[1, 3, 5]
    .map((at) => {
      const from = Number.parseInt(a.slice(at, at + 2), 16);
      const to = Number.parseInt(b.slice(at, at + 2), 16);
      return Math.round(from + (to - from) * amount)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** Hue-preserving surface and ink pairs; each palette member is contrast-tested in both themes. */
export function sourceColours(name: string, scheme: "light" | "dark") {
  return hueColours(avatarHue(name), scheme);
}

/**
 * The same pair for a hue given outright: a room's chosen ground rather than the one its name
 * hashes to (22 September 2026). A room wearing the rocket on rose should say its name in rose
 * beside it, not in whatever colour the letters of the name happen to land on.
 */
export function hueColours(hue: string, scheme: "light" | "dark") {
  return scheme === "dark"
    ? { ground: mix(hue, "#17181c", 0.78), ink: mix(hue, "#ffffff", 0.64) }
    : { ground: mix(hue, "#ffffff", 0.89), ink: mix(hue, "#000000", 0.32) };
}
