/**
 * An agent's face (ADR 0089): the Chips mark, its bitten body wearing a mark or its initials and
 * its pins always out, with its state in its outline: a light round the pins while it works, a dot
 * in the bite when it can't answer, and a green dot in place of pins where the face is too small
 * for them.
 */

import { act, render, screen } from "@testing-library/react-native";
import { AgentFace } from "./AgentFace";
import { Avatar } from "./Avatar";
import { chooseAppearance } from "./appearance";
import { PIN_REST, PINS } from "./outline";
import { dark, light } from "./tokens";

const PAINT = { amber: "#d76c00", green: "#009b5c" } as const;

/** A pin's colour, which lies over its metal and is lit by opacity. */
function colourOf(pin: unknown) {
  const [colour] = (pin as { children: unknown[] }).children;
  return colour as Parameters<typeof expect>[0];
}

describe("an agent's face", () => {
  it("wears its initials until a mark is chosen, and then the mark", async () => {
    const { rerender } = await render(
      <AgentFace ground="#1c6aa8" letters="S" side={44} {...PAINT} />,
    );
    expect(screen.getByText("S")).toBeTruthy();
    await rerender(<AgentFace mark="cart" ground="#1c6aa8" letters="S" side={44} {...PAINT} />);
    expect(screen.queryByText("S")).toBeNull();
  });

  it("wears its ten pins at rest, on metal with none of its colour in light, and nothing in the bite", async () => {
    await render(<AgentFace mark="cart" ground="#1c6aa8" letters="S" side={44} {...PAINT} />);
    const pins = screen.getByTestId("agent-pins").children;
    expect(pins).toHaveLength(10);
    for (const pin of pins) {
      expect(pin).toHaveStyle({ backgroundColor: light.pinMetal });
      expect(colourOf(pin)).toHaveStyle({ opacity: 0 });
    }
    expect(screen.queryByTestId("working-dot")).toBeNull();
    expect(screen.queryByTestId("cant-answer-mark")).toBeNull();
  });

  it("rests its pins in its own colour, dim, in dark, where there is no metal", async () => {
    await act(async () => chooseAppearance("dark"));
    try {
      await render(<AgentFace mark="cart" ground="#1c6aa8" letters="S" side={44} {...PAINT} />);
      expect(dark.pinMetal).toBe("transparent");
      for (const pin of screen.getByTestId("agent-pins").children) {
        expect(pin).not.toHaveStyle({ backgroundColor: light.pinMetal });
        expect(colourOf(pin)).toHaveStyle({ opacity: PIN_REST.inside });
      }
    } finally {
      await act(async () => chooseAppearance("system"));
    }
  });

  it("keeps its pins inside its box, so with them it is the size a room's face is", async () => {
    const { rerender } = await render(
      <AgentFace ground="#1c6aa8" letters="S" side={56} {...PAINT} />,
    );
    // Thirteen hundredths of the body stand out on every side: 56 is a body of 44.4 and its pins.
    const body = screen.getByTestId("agent-body").props["style"];
    expect(body.width).toBeCloseTo(56 / 1.26);
    expect(body.left).toBeCloseTo((56 - 56 / 1.26) / 2);
    // Where it has no pins, the body is the whole box.
    await rerender(<AgentFace ground="#1c6aa8" letters="S" side={28} {...PAINT} />);
    expect(screen.getByTestId("agent-body")).toHaveStyle({ left: 0, width: 28 });
  });

  it("keeps its pins out while it works, and puts no dot in the bite", async () => {
    await render(<AgentFace ground="#1c6aa8" letters="S" side={44} working {...PAINT} />);
    expect(screen.getByTestId("agent-pins").children).toHaveLength(10);
    expect(screen.queryByTestId("working-dot")).toBeNull();
  });

  it("has no pins where it has no room for them, and says it is working with a dot", async () => {
    const { rerender } = await render(
      <AgentFace ground="#1c6aa8" letters="S" side={28} {...PAINT} />,
    );
    expect(screen.queryByTestId("agent-pins")).toBeNull();
    expect(screen.queryByTestId("working-dot")).toBeNull();
    await rerender(<AgentFace ground="#1c6aa8" letters="S" side={28} working {...PAINT} />);
    expect(screen.queryByTestId("agent-pins")).toBeNull();
    expect(screen.getByTestId("working-dot")).toHaveStyle({ backgroundColor: PAINT.green });
  });

  it("wears its pins round a body the size of the face where asked, a little less dim", async () => {
    const { rerender } = await render(
      <AgentFace ground="#1c6aa8" letters="S" side={28} pinsOut {...PAINT} />,
    );
    // The face beside a line (ADR 0103): too small for pins inside its box, so they stand past it.
    expect(screen.getByTestId("agent-body")).toHaveStyle({ left: 0, width: 28 });
    const pins = screen.getByTestId("agent-pins").children;
    expect(pins).toHaveLength(10);
    await act(async () => chooseAppearance("dark"));
    try {
      for (const pin of screen.getByTestId("agent-pins").children) {
        expect(colourOf(pin)).toHaveStyle({ opacity: PIN_REST.outside });
      }
    } finally {
      await act(async () => chooseAppearance("system"));
    }
    // The top pins stand above the face, as far as the pins stand out of its body.
    expect(pins[0]).toHaveStyle({ top: -(PINS.over * 28) });
    // At work the light runs round them, and no dot is needed in the bite.
    await rerender(<AgentFace ground="#1c6aa8" letters="S" side={28} pinsOut working {...PAINT} />);
    expect(screen.getByTestId("agent-pins").children).toHaveLength(10);
    expect(screen.queryByTestId("working-dot")).toBeNull();
  });

  it("wears the amber dot in its bite when it can't answer, at any size", async () => {
    await render(
      <AgentFace ground="#1c6aa8" letters="S" side={20} working cantAnswer {...PAINT} />,
    );
    expect(screen.getByTestId("cant-answer-mark")).toHaveStyle({ backgroundColor: PAINT.amber });
    // One dot: can't answer says more than working does.
    expect(screen.queryByTestId("working-dot")).toBeNull();
  });
});

describe("an agent, as an avatar", () => {
  it("names itself and its state, as a harness's does", async () => {
    await render(<Avatar name="Shopping" kind="agent" status="working" />);
    expect(screen.getByLabelText("Shopping, working")).toBeTruthy();
  });

  it("keeps the ground a person chose under its initials when this build lacks the mark", async () => {
    await render(
      <Avatar name="Chess Game" kind="agent" icon={{ icon: "somethinglater", ground: 4 }} />,
    );
    expect(screen.getByText("CG")).toBeTruthy();
  });

  it("is a room's row size on the Agents tab, as on Spaces", async () => {
    await render(<Avatar name="Shopping" kind="agent" size="row" testID="face" />);
    expect(screen.getByTestId("face").children[0]).toHaveStyle({ width: 56, height: 56 });
  });
});
