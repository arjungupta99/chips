/**
 * A space's face as its row on Spaces draws it, and as everything else that stands for a room
 * draws it too: Search's results, Media on this phone, and the Icon row of the room's own sheet
 * (ADR 0174). Its own module, so that drawing a room's face does not bring the Spaces screen with
 * it.
 */

import type { Directory, Space } from "@chipschat/core";
import { nameOf, spaceFace } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, type AvatarSize } from "../ui/Avatar";

/**
 * The avatar a row wears: the name the space goes by — its harness with a status ring when it
 * is called after the harness, the title's initials when it has one, a hash for a channel.
 * Core's `spaceFace` decides which, the same way for the desktop's rail, so fifty titled spaces
 * of one harness wear fifty titles and not fifty copies of its face.
 */
export function RowAvatar({
  space,
  directory,
  title,
  icon,
  busy,
  size = "row",
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly title: string;
  /** A list row's, unless said: Search's results wear a size down (ADR 0132). */
  readonly size?: AvatarSize;
  /** The mark this person chose for the room, where they chose one. */
  readonly icon: SpaceIcon | undefined;
  /**
   * There is work going in the room: its face wears the pins (ADR 0285). Left out by default: the
   * face at the head of a sheet asking whether to archive the room is not a list row, and pins
   * going round it there are a room asking to be watched while it is being decided on.
   */
  readonly busy?: boolean | undefined;
}) {
  const face = spaceFace(space, directory);
  if (face.kind !== "harness")
    return <Avatar name={title} kind={face.kind} size={size} icon={icon} busy={busy} decorative />;
  return (
    <Avatar
      name={faceName(space, directory, title)}
      kind="harness"
      size={size}
      status={face.status}
      icon={icon}
      busy={busy}
      decorative
    />
  );
}

/** The name a row's face is drawn from (`RowAvatar`): its harness's, where it wears the harness. */
export function faceName(space: Space, directory: Directory, title: string): string {
  const face = spaceFace(space, directory);
  return face.kind === "harness" ? nameOf(directory, face.harnessId) : title;
}
