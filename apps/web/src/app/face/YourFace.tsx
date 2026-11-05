/**
 * Your face, as a page of You's (ADR 0272): the picker with you at its head, what you go by and
 * "Owner · Demo" under it, opened by a click on your face at the top of the list. It is one face
 * for everybody, beside your words in every room, and harnesses are not told (ADR 0139).
 *
 * A pick the server turns away puts the old face back (the store does that) and says why here,
 * at the top of the page, rather than looking as if the click did nothing.
 */

import { whyFaceNotSaved } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useState } from "react";
import { FacePicker } from "./FacePicker.tsx";

export function YourFace(props: {
  readonly name: string;
  readonly standing: string;
  readonly face: SpaceIcon | undefined;
  readonly save: (face: SpaceIcon | undefined) => Promise<void>;
}) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  return (
    <FacePicker
      title={props.name}
      subtitle={props.standing}
      kind="person"
      chosen={props.face}
      failed={failed}
      testId="your-face"
      onChoose={(face) => {
        setFailed(undefined);
        void props.save(face).catch((error: unknown) => setFailed(whyFaceNotSaved(error)));
      }}
    />
  );
}
