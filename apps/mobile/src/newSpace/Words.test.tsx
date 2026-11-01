/**
 * Who the + may ask, and which of them can't answer now (ADR 0083): an agent that is offline or
 * in trouble says so under its name, so nobody asks it for a room and waits.
 */

import type { Participant } from "@chipschat/core";
import { render, screen } from "@testing-library/react-native";
import { Head } from "./Words";

const jacobian: Participant = {
  id: "har_jacobian",
  kind: "harness",
  displayName: "Jacobian",
  state: { connected: true, since: "2026-09-28T18:00:00.000Z" },
};
const openclaw: Participant = {
  id: "har_openclaw",
  kind: "harness",
  displayName: "OpenClaw",
  state: { connected: false, since: "2026-09-28T18:11:12.000Z" },
};

describe("the +'s agents (ADR 0083)", () => {
  it("says under an agent that can't answer that it can't, and nothing under one that can", async () => {
    await render(
      <Head
        harnesses={[jacobian, openclaw]}
        picked={[jacobian]}
        empty={false}
        onChoose={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "OpenClaw, Can't answer now" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Jacobian" })).toBeTruthy();
  });

  it("says in the line under the faces when the one asked can't answer", async () => {
    await render(
      <Head
        harnesses={[openclaw]}
        picked={[openclaw]}
        empty={false}
        onChoose={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("new-space-says")).toHaveTextContent("OpenClaw can't answer now");
  });
});
