/**
 * The two face themes in You's Appearance card (ADR 0176), as the phone offers them: a card for
 * each with six faces in its own theme — three agents, two rooms and you — whichever theme the
 * page is in, a round tick under it and a gold ring round the faces of the one in use.
 *
 * Each preview holds its faces in its theme with `data-faces` on itself, which `tokens.css` reads
 * on any element: the faces are the same `Avatar` everything else draws, so a preview cannot
 * drift from what the choice will do.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, FACE_THEMES, type FaceTheme } from "@chipschat/ui";
import { useId } from "react";

const WORDS: Readonly<Record<FaceTheme, string>> = { soothing: "Soothing", bright: "Bright" };

/** Who the previews show, besides you: agents with letters, rooms with marks. */
const SAMPLES: readonly {
  readonly name: string;
  readonly kind: "agent" | "channel";
  readonly icon: SpaceIcon;
}[] = [
  { name: "J", kind: "agent", icon: { icon: "chip", ground: 9, letters: "J" } },
  { name: "M", kind: "agent", icon: { icon: "chip", ground: 4, letters: "M" } },
  { name: "O", kind: "agent", icon: { icon: "chip", ground: 7, letters: "O" } },
  { name: "Chess", kind: "channel", icon: { icon: "knight", ground: 5 } },
  { name: "Garden", kind: "channel", icon: { icon: "sprout", ground: 2 } },
];

export function FaceThemes(props: {
  readonly chosen: FaceTheme;
  readonly onChoose: (theme: FaceTheme) => void;
  /** Your own face, the sixth in each preview. */
  readonly me: { readonly name: string; readonly face: SpaceIcon | undefined };
}) {
  const name = useId();
  return (
    <div className="you-themes" role="radiogroup" aria-label="Theme" data-testid="face-themes">
      {FACE_THEMES.map((theme) => {
        const on = theme === props.chosen;
        return (
          <label key={theme} className="you-theme" data-testid={`face-theme-${theme}`}>
            <input
              type="radio"
              name={name}
              value={theme}
              checked={on}
              onChange={() => props.onChoose(theme)}
            />
            <span className="you-theme-faces" data-faces={theme} aria-hidden="true">
              {SAMPLES.map((sample) => (
                <Avatar
                  key={sample.name}
                  name={sample.name}
                  kind={sample.kind}
                  icon={sample.icon}
                  size="sm"
                />
              ))}
              <Avatar name={props.me.name} kind="person" icon={props.me.face} size="sm" />
            </span>
            <span className="you-theme-name">
              <span className="you-theme-tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path d="M5 12.5l4.2 4L19 7" />
                </svg>
              </span>
              {WORDS[theme]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
