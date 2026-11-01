/**
 * The sheet a face is chosen in (`FacePicker`): from a long press on a row on Spaces or Agents, a
 * tap on an agent's face or its Icon row on its card (ADR 0174), and your own face on You. A
 * space's sheet holds the same picker as a page of its own instead.
 *
 * As tall as three quarters of the screen, so the room it came from stays in sight above it. It
 * rides the keys while letters are typed in, with the colours above the field still in sight, so
 * a colour can be tried under the letters with the keys still up. Its X stands at the right of
 * the head, and saves what was typed as it closes, as Done there did (ADR 0169).
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { useRef } from "react";
import type { AvatarKind } from "../ui/Avatar";
import { Sheet } from "../ui/Sheet";
import { SPACE } from "../ui/tokens";
import { FacePicker, type FacePickerHandle } from "./FacePicker";

/** As tall as the sheet gets: the room it came from stays in sight above it. */
const THREE_QUARTERS = 0.75;

export function IconSheet({
  open,
  onClose,
  onGone,
  title,
  subtitle,
  kind,
  chosen,
  onChoose,
  failed,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The exit has finished and the modal is down: the caller unmounts here, not on close. */
  readonly onGone?: (() => void) | undefined;
  /** The space being changed: its name and the line under it, so the preview is the real row. */
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly kind: AvatarKind;
  readonly chosen: SpaceIcon | undefined;
  /** `undefined` puts the face back to the default. */
  readonly onChoose: (icon: SpaceIcon | undefined) => void;
  /** Why the last pick did not stick, when it did not. */
  readonly failed?: string | undefined;
}) {
  const picker = useRef<FacePickerHandle>(null);
  // Closing saves what was typed: the X, the scrim, a drag, all of them.
  const close = () => {
    picker.current?.flush();
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      onGone={onGone}
      sizing="bounded"
      cap={THREE_QUARTERS}
      keyboard
      testID="icon-sheet"
    >
      <FacePicker
        ref={picker}
        title={title}
        subtitle={subtitle}
        kind={kind}
        chosen={chosen}
        onChoose={onChoose}
        failed={failed}
        inset={SPACE.lg}
      />
    </Sheet>
  );
}

/**
 * Why a face did not stick, in words a person can act on. A 404 from this route is not "no such
 * room" (the row was pressed, so the room is there) and is worth saying plainly: the app is newer
 * than the server it is talking to, which is what a server that has not been restarted since the
 * faces went in looks like from here.
 */
export function whyNotSaved(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  // A server that predates the route answers 404, and says so in words rather than in the code:
  // "No route matches that." is what one actually replied on the phone.
  if (/404|no route matches/i.test(said)) {
    return "Not saved: this server is older than the app, and has no icons yet.";
  }
  return said === "" ? "Not saved: the server would not take it." : `Not saved: ${said}`;
}
