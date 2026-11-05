/**
 * What the space pane says with no room to open (ADR 0131), where it says what the phone's list
 * says: a device that knows no relay is told it reaches the server only on its network.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoRooms } from "./NoRooms.tsx";

function pane(relay: boolean | undefined) {
  render(
    <NoRooms
      empty="closed"
      server="chips-home.local"
      harnesses={[]}
      onRetry={vi.fn()}
      onNewSpace={undefined}
      relay={relay}
    />,
  );
  return screen.getByTestId("no-rooms-closed").textContent ?? "";
}

describe("a server that can't be reached", () => {
  it("says the relay isn't on, on a device that knows none, as the phone does", () => {
    expect(pane(false)).toContain("only on the server's own network, because the relay isn't on");
  });

  it("says Chips keeps trying where a relay is there to try through", () => {
    expect(pane(true)).toContain("Chips keeps trying on its own.");
  });
});
