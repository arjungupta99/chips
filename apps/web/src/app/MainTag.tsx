/**
 * "Main", worn by a harness's Main agent and its Main room in the lists (ADR 0145), as the phone
 * wears it: a soft pill in the colour its face stands on (`faceGround`, from the same name and
 * mark the face is drawn with), mixed into the page for its ground and into the ink for its word,
 * more of it in the dark (`styles.css`, `.main-tag`). Never the room lead's gold.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { faceGround } from "@chipschat/ui";
import type { CSSProperties } from "react";

export function MainTag({
  name,
  icon,
}: {
  /** The name the face is drawn from. */
  readonly name: string;
  /** The face chosen for it, where one was. */
  readonly icon: SpaceIcon | undefined;
}) {
  return (
    <span
      className="main-tag"
      style={{ "--main-hue": faceGround(name, icon) } as CSSProperties}
      data-testid="main-tag"
    >
      Main
    </span>
  );
}
