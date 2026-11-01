/**
 * What a room mounts to have a viewer (the media viewer proposal, §4.3). It holds the deck a tap
 * opens and draws the lightbox over the page when there is one; the room under it is the
 * platform's business, since a `<dialog>` opened with `showModal()` makes the rest of the document
 * inert by itself.
 *
 * A room and a thread are each a space, so each mounts its own and pages through its own lines.
 * The state is `useViewer.ts`'s; this is the part that draws.
 */

import type { Directory, Lane, Space } from "@chipschat/core";
import type { ReactNode } from "react";
import type { FileService } from "../files.ts";
import { Lightbox } from "./Lightbox.tsx";
import { useViewerState, ViewerContext } from "./useViewer.ts";

export function ViewerHost({
  space,
  lanes,
  directory,
  files,
  onGoToMessage,
  children,
}: {
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly directory: Directory;
  readonly files: FileService;
  /** The viewer closes and the room lands on the line, with the flash it already has. */
  readonly onGoToMessage?: ((lineId: string) => void) | undefined;
  readonly children: ReactNode;
}) {
  const { viewer, opened, tileOf, goTo, close } = useViewerState(space, lanes, directory);
  return (
    <ViewerContext.Provider value={viewer}>
      {children}
      {opened !== undefined && (
        <Lightbox
          deck={opened.deck}
          index={opened.index}
          files={files}
          directory={directory}
          tileOf={tileOf}
          onIndex={goTo}
          onClose={close}
          onGoToMessage={onGoToMessage}
        />
      )}
    </ViewerContext.Provider>
  );
}
