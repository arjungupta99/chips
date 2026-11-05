/**
 * Photos and files dragged onto a room from the Finder or another app (ADR 0268; the phone's and
 * the iPad's `RoomDrop`, ADR 0256 §6): while they are over it, the room says where they will go, a
 * dashed frame inside its edge with the words in the middle, and what lands is staged in the field
 * as the clip stages what it picks.
 *
 * Only a drag that carries files is the room's: words or a link dragged inside the page go where
 * they go, into the field or nowhere. In the Mac's window a drop the room has not taken is refused
 * (`refuseStrayDrops`), so taking one starts with preventing the default.
 */

import { ROOM_DROP_WORDS } from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { type DragEvent, useRef, useState } from "react";

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

/** Whether files are over the room, and the handlers for the element they are dropped on. */
export function useRoomDrop(take: (files: FileList) => void) {
  const [over, setOver] = useState(false);
  // Entering a bubble inside the room leaves the one before it: the room is left only when every
  // enter has had its leave.
  const depth = useRef(0);
  const settle = () => {
    depth.current = 0;
    setOver(false);
  };
  return {
    over,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) settle();
      },
      onDrop: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        settle();
        take(event.dataTransfer.files);
      },
    },
  };
}

/** Said over the room while files are dragged over it. */
/**
 * The frame, drawn always and shown while files are over the room: it fades up as they come and
 * away as they leave or land, on `--motion-fast`, where until 3 November it stood and went in a
 * frame (ADR 0268 addendum).
 */
export function RoomDropOver({ over }: { readonly over: boolean }) {
  return (
    <div
      className="room-drop"
      data-testid="room-drop"
      data-over={over ? "true" : "false"}
      aria-hidden="true"
    >
      <span className="room-drop-word">
        <Icon name="clip" size={20} />
        {ROOM_DROP_WORDS}
      </span>
    </div>
  );
}
