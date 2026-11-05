/**
 * The Icon page of a room's sheet (ADR 0174 on the phone; ADR 0264's addendum here): the face
 * picker (ADR 0272) under a way back, opened from the face at the sheet's head or from Change icon
 * on the room's row in the rail. The face is the reader's own setting, so anybody in the room has
 * it, a guest too. Each pick saves at once; one the server turns away puts the old face back (the
 * store does that) and says why at the top of the picker, as Your face on You does.
 */

import { whyFaceNotSaved } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import type { AvatarKind } from "@chipschat/ui";
import { useState } from "react";
import { FacePicker } from "../face/FacePicker.tsx";
import { Back } from "./parts.tsx";

export function IconPage(props: {
  readonly titleId: string;
  /** The room's name, and what its first page says under it: the head is its row. */
  readonly title: string;
  readonly hint: string;
  readonly kind: AvatarKind;
  readonly chosen: SpaceIcon | undefined;
  readonly save: (face: SpaceIcon | undefined) => Promise<void>;
  readonly onBack: () => void;
}) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  return (
    <>
      <Back
        titleId={props.titleId}
        title="Icon"
        onBack={props.onBack}
        testId="room-sheet-icon-back"
        pageTestId="room-sheet-icon-page"
      />
      <div className="sheet-scroll sheet-icon">
        <FacePicker
          title={props.title}
          subtitle={props.hint}
          kind={props.kind}
          chosen={props.chosen}
          failed={failed}
          testId="room-icon"
          onChoose={(face) => {
            setFailed(undefined);
            void props.save(face).catch((error: unknown) => setFailed(whyFaceNotSaved(error)));
          }}
        />
      </div>
    </>
  );
}
