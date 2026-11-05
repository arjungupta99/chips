/**
 * Files dragged over a room (ADR 0268, the phone's `RoomDrop`): the frame stands while they are
 * over it, through the bubbles inside it, and goes when they leave or land; what lands is handed
 * over. A drag of words is not the room's, so it neither shows the frame nor takes the drop.
 */

import { ROOM_DROP_WORDS } from "@chipschat/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refuseStrayDrops } from "../MacWindow.tsx";
import { RoomDropOver, useRoomDrop } from "./RoomDrop.tsx";

afterEach(() => {
  cleanup();
});

function Room({ take }: { readonly take: (files: FileList) => void }) {
  const drop = useRoomDrop(take);
  return (
    <main data-testid="room" {...drop.handlers}>
      <p data-testid="bubble">Hello</p>
      <RoomDropOver over={drop.over} />
    </main>
  );
}

/** Whether the frame is shown: it is always drawn, and fades up and away. */
function shown(): boolean {
  return screen.getByTestId("room-drop").getAttribute("data-over") === "true";
}

const photo = new File(["x"], "pallet.jpg", { type: "image/jpeg" });
const files = { dataTransfer: { types: ["Files"], files: [photo], dropEffect: "none" } };
const words = { dataTransfer: { types: ["text/plain"], files: [], dropEffect: "none" } };

describe("useRoomDrop", () => {
  it("stands the frame while files are over the room, through the bubbles in it", () => {
    render(<Room take={() => undefined} />);
    const room = screen.getByTestId("room");
    const bubble = screen.getByTestId("bubble");
    fireEvent.dragEnter(room, files);
    expect(shown()).toBe(true);
    expect(screen.getByTestId("room-drop").textContent).toBe(ROOM_DROP_WORDS);
    // Into a bubble: the bubble is entered before the room is left.
    fireEvent.dragEnter(bubble, files);
    fireEvent.dragLeave(room, files);
    expect(fireEvent.dragOver(bubble, files)).toBe(false);
    expect(shown()).toBe(true);
    fireEvent.dragLeave(bubble, files);
    expect(shown()).toBe(false);
  });

  it("hands over what lands and takes the frame away", () => {
    const take = vi.fn();
    render(<Room take={take} />);
    const room = screen.getByTestId("room");
    fireEvent.dragEnter(room, files);
    expect(fireEvent.drop(room, files)).toBe(false);
    expect(take).toHaveBeenCalledWith([photo]);
    expect(shown()).toBe(false);
  });

  it("leaves a drag of words alone", () => {
    const take = vi.fn();
    render(<Room take={take} />);
    const room = screen.getByTestId("room");
    fireEvent.dragEnter(room, words);
    expect(fireEvent.dragOver(room, words)).toBe(true);
    expect(shown()).toBe(false);
    expect(fireEvent.drop(room, words)).toBe(true);
    expect(take).not.toHaveBeenCalled();
  });

  it("is a drop the Mac's window lets through, where one beside the room is refused", () => {
    const stop = refuseStrayDrops(window);
    try {
      render(
        <>
          <Room take={() => undefined} />
          <p data-testid="beside">Sidebar</p>
        </>,
      );
      const dropEffect = (target: HTMLElement) => {
        // Neither "copy" nor "none" to start with, so either is somebody's answer.
        const dataTransfer = { types: ["Files"], files: [photo], dropEffect: "move" };
        fireEvent.dragOver(target, { dataTransfer });
        return dataTransfer.dropEffect;
      };
      expect(dropEffect(screen.getByTestId("bubble"))).toBe("copy");
      expect(dropEffect(screen.getByTestId("beside"))).toBe("none");
    } finally {
      stop();
    }
  });
});
