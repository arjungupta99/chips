/**
 * The design system on the phone. These are component tests under Jest, because Vitest cannot
 * host React Native; the pure tables they draw from are checked against the design system's own
 * in `vocabulary.vitest.ts`, so what is left to prove here is what a person sees and hears.
 *
 * The through-line: state is a colour *and* a word. Nearly every test below asserts on the
 * word or on the accessible name rather than on a hex value, because a screen reader gets the
 * same information as an eye or the rule is broken.
 */

import { render, screen, userEvent } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Avatar, avatarHue, ROW_AVATAR } from "./Avatar";
import { Bar } from "./Bar";
import { Button, IconButton } from "./Button";
import { Card } from "./Card";
import { Pane } from "./Pane";
import { Pill, StatusPill } from "./Pill";
import { Risk } from "./Risk";
import { Segment } from "./Segment";
import { Split } from "./Split";
import { light } from "./tokens";

describe("a button", () => {
  it("presses", async () => {
    const pressed = jest.fn();
    await render(<Button label="Approve" onPress={pressed} variant="primary" />);
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("does not press while it is disabled, nor while a decision is in flight", async () => {
    const pressed = jest.fn();
    await render(<Button label="Deny" onPress={pressed} disabled />);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await screen.rerender(<Button label="Deny" onPress={pressed} busy />);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    expect(pressed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });

  it("is at least as tall as a thumb, whatever it is asked to be", async () => {
    // Apple's minimum touch target, and the reason the phone's buttons are not the web's 30
    // pixels. Approve and Deny sit side by side on a decision card; they are the worst two
    // things on the phone to miss.
    await render(<Button label="Approve" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Approve" })).toHaveStyle({ minHeight: 44 });
  });
});

describe("a round button", () => {
  it("is a mark to the eye and a word to a screen reader, and presses", async () => {
    const pressed = jest.fn();
    await render(<IconButton icon="up" label="Send" onPress={pressed} />);
    expect(screen.queryByText("Send")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("goes grey rather than gone while there is nothing to send", async () => {
    const pressed = jest.fn();
    await render(<IconButton icon="up" label="Send" onPress={pressed} disabled />);
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
    // Grey, not faded: a fade takes the white mark down with the circle (22 September 2026).
    const skin = StyleSheet.flatten(button.props["style"]);
    expect(skin.backgroundColor).toBe(light.gray);
    expect(skin.opacity).toBe(1);
    await userEvent.press(button);
    expect(pressed).not.toHaveBeenCalled();
  });

  it("keeps a thumb's target around a circle smaller than one", async () => {
    await render(<IconButton icon="up" label="Send" onPress={() => undefined} size={36} />);
    const button = screen.getByRole("button", { name: "Send" });
    expect(StyleSheet.flatten(button.props["style"]).width).toBe(36);
    expect(button.props["hitSlop"]).toBe(4);
  });
});

describe("a pill", () => {
  it("says the state in words, not only in colour", async () => {
    await render(<StatusPill status="waiting" />);
    expect(screen.getByText("Waiting on you")).toBeTruthy();
  });

  it("carries the verb phrase while a harness is working", async () => {
    await render(<StatusPill status="working" verbPhrase="Drafting the reply" />);
    expect(screen.getByText("Working · Drafting the reply")).toBeTruthy();
  });

  it("can be a plain label with no dot at all", async () => {
    await render(<Pill tone="blue">via relay</Pill>);
    expect(screen.getByText("via relay")).toBeTruthy();
  });
});

describe("an avatar", () => {
  it("gives a person their initials and a harness its state in the name", async () => {
    await render(<Avatar name="Dana Ruiz" />);
    expect(screen.getByLabelText("Dana Ruiz")).toBeTruthy();
    expect(screen.getByText("DR")).toBeTruthy();

    await render(<Avatar name="Scout" kind="harness" status="blocked" />);
    expect(screen.getByLabelText("Scout, blocked")).toBeTruthy();
  });

  it("wears a chosen mark as paper on its lit ground, and a chosen colour with the initials", async () => {
    // The Folded marks (22 September 2026): the mark is the whole face, drawn as SVG over the
    // ground, so the initials go. A face chosen as a colour alone keeps them, on that colour.
    await render(<Avatar name="Chess Game" kind="harness" icon={{ icon: "rocket", ground: 0 }} />);
    expect(screen.queryByText("CG")).toBeNull();
    expect(screen.getByLabelText("Chess Game")).toHaveStyle({ backgroundColor: "#b84d86" });

    await render(<Avatar name="Chess Game" kind="harness" icon={{ icon: "", ground: 4 }} />);
    expect(screen.getByText("CG")).toBeTruthy();
    expect(screen.getByLabelText("Chess Game")).toHaveStyle({ backgroundColor: "#1c6aa8" });

    // And a name this build has never heard of is the initials again, on the chosen colour.
    await render(<Avatar name="Chess Game" icon={{ icon: "somethinglater", ground: 4 }} />);
    expect(screen.getByText("CG")).toBeTruthy();
  });

  it("draws a channel as a hash on a hue of its own, not on the quiet surface", async () => {
    await render(<Avatar name="#supplier-updates" kind="channel" />);
    const hash = screen.getByText("#");
    expect(hash).toBeTruthy();
    // A channel used to be grey on grey, which read as a hole once the face grew to 56.
    expect(StyleSheet.flatten(hash.props["style"]).color).toBe("#ffffff");
  });

  it("gives a list row a face a thumb can aim at", async () => {
    // The list's hairline starts where the words start, and that inset is this plus the page's
    // margin and the row's gap — so if this moves and the list does not, they come apart.
    expect(ROW_AVATAR).toBe(56);
  });

  it("wears the same hue for the same name every time", () => {
    expect(avatarHue("Dana Ruiz")).toBe(avatarHue("Dana Ruiz"));
    expect(avatarHue("Scout")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("the risk chips", () => {
  it("name every class the approval carried, and nothing when it carried none", async () => {
    await render(<Risk classes={["financial", "privacy"]} />);
    expect(screen.getByText("Money")).toBeTruthy();
    expect(screen.getByText("Personal data")).toBeTruthy();
    await screen.rerender(<Risk classes={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("shows a class it has never heard of rather than swallowing it", async () => {
    await render(<Risk classes={["something_new"]} />);
    expect(screen.getByText("something_new")).toBeTruthy();
  });
});

describe("the autonomy dial", () => {
  it("turns, and says what the level it landed on means", async () => {
    const chose = jest.fn();
    await render(<Segment value={1} onChange={chose} />);
    expect(screen.getByText("Ask first")).toBeTruthy();
    await userEvent.press(screen.getByRole("radio", { name: "L3, Autonomous, report back" }));
    expect(chose).toHaveBeenCalledWith(3);
  });

  it("shows the levels above the workspace cap and refuses them", async () => {
    const chose = jest.fn();
    await render(<Segment value={1} onChange={chose} max={2} />);
    const capped = screen.getByRole("radio", { name: "L3, Autonomous, report back" });
    expect(capped).toBeTruthy();
    await userEvent.press(capped);
    expect(chose).not.toHaveBeenCalled();
  });

  it("is read-only with nothing to change it", async () => {
    await render(<Segment value={2} />);
    expect(screen.getByRole("radio", { name: "L2, Ask when it matters" })).toBeDisabled();
    expect(screen.getByText("Ask when it matters")).toBeTruthy();
  });
});

describe("a bar", () => {
  it("reads out the number, not only the fill", async () => {
    await render(<Bar used={4.1} of={20} label="Budget" caption="$4.10 of $20" />);
    expect(screen.getByLabelText("Budget: $4.10 of $20")).toBeTruthy();
    expect(screen.getByText("$4.10 of $20")).toBeTruthy();
  });

  it("survives a budget of nothing rather than dividing by it", async () => {
    await render(<Bar used={3} of={0} label="Budget" caption="no budget set" />);
    expect(screen.getByLabelText("Budget: no budget set")).toBeTruthy();
  });
});

describe("a card", () => {
  it("holds what it is given", async () => {
    await render(
      <Card tone="ask">
        <Text>Scout wants to send an email</Text>
      </Card>,
    );
    expect(screen.getByText("Scout wants to send an email")).toBeTruthy();
  });
});

describe("a split and a pane", () => {
  it("shows the list and what it opened side by side", async () => {
    await render(<Split list={<Text>the list</Text>} detail={<Text>the room</Text>} />);
    expect(screen.getByText("the list")).toBeTruthy();
    expect(screen.getByText("the room")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("split").props["style"]).flexDirection).toBe(
      "row",
    );
  });

  it("names what is open, and offers a way back only when there is somewhere to go", async () => {
    const back = jest.fn();
    await render(
      <Pane title="Supplier email">
        <Text>words</Text>
      </Pane>,
    );
    expect(screen.getByRole("header", { name: "Supplier email" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await screen.rerender(
      <Pane title="Thread · Supplier email" onBack={back}>
        <Text>words</Text>
      </Pane>,
    );
    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
