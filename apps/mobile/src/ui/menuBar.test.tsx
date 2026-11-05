/**
 * The menu bar's commands (ADR 0256): each in its place whether or not it can be done, dimmed while
 * nobody holds it, named for now by whoever does, and run by the newest holder. Esc closes what was
 * opened last, then what is under it.
 */

import { act, render } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { type CommandId, commandsNow, runCommand, useEscape, useMenuCommand } from "./menuBar";

const of = (id: CommandId) => commandsNow().find((each) => each.id === id);

function Holds({
  id,
  run,
  title,
}: {
  readonly id: CommandId;
  readonly run: (() => void) | undefined;
  readonly title?: string;
}) {
  useMenuCommand(id, run, title);
  return null;
}

/** Something that stands over the window, open until Esc closes it. */
function Over({
  name,
  onClosed,
}: {
  readonly name: string;
  readonly onClosed: (name: string) => void;
}) {
  const [open, setOpen] = useState(true);
  useEscape(open, () => {
    setOpen(false);
    onClosed(name);
  });
  return open ? <Text>{name}</Text> : null;
}

describe("the menu bar's commands", () => {
  it("lists every command in its menu with its keys, dimmed while nobody holds it", () => {
    const all = commandsNow();
    expect(all.map((each) => each.id)).toEqual([
      "tab-spaces",
      "tab-agents",
      "tab-search",
      "tab-you",
      "new-space",
      "search-everything",
      "details",
      "list",
      "previous-space",
      "next-space",
      "escape",
    ]);
    expect(of("new-space")).toMatchObject({
      title: "New Space",
      input: "n",
      modifiers: ["command"],
      menu: "space",
      enabled: false,
    });
    expect(of("next-space")).toMatchObject({ input: "down", modifiers: ["option"] });
    expect(of("escape")).toMatchObject({ menu: "hidden", input: "escape" });
  });

  it("is able while a screen holds it, named as it says, and dimmed again when it lets go", async () => {
    const run = jest.fn();
    const screen = await render(<Holds id="details" run={run} title="Hide Details" />);
    expect(of("details")).toMatchObject({ enabled: true, title: "Hide Details" });
    runCommand("details");
    expect(run).toHaveBeenCalledTimes(1);
    await screen.rerender(<Holds id="details" run={undefined} />);
    expect(of("details")).toMatchObject({ enabled: false, title: "Show Details" });
    runCommand("details");
    expect(run).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("is run by the newest holder, and by the one before once it lets go", async () => {
    const first = jest.fn();
    const second = jest.fn();
    const screen = await render(
      <>
        <Holds id="next-space" run={first} />
        <Holds id="next-space" run={second} />
      </>,
    );
    runCommand("next-space");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    await screen.rerender(<Holds id="next-space" run={first} />);
    runCommand("next-space");
    expect(first).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("closes what was opened last with Esc, then what is under it", async () => {
    const closed: string[] = [];
    const screen = await render(
      <>
        <Over name="details" onClosed={(name) => closed.push(name)} />
        <Over name="face picker" onClosed={(name) => closed.push(name)} />
      </>,
    );
    expect(of("escape")?.enabled).toBe(true);
    await act(() => runCommand("escape"));
    expect(closed).toEqual(["face picker"]);
    await act(() => runCommand("escape"));
    expect(closed).toEqual(["face picker", "details"]);
    expect(of("escape")?.enabled).toBe(false);
    await screen.unmount();
  });
});
