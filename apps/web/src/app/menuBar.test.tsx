/**
 * The Mac's menu commands, from the page's side (ADR 0267): who holds each, what it is called, and
 * the space before and after. The rows and keys are the shell's (`apps/desktop/src-tauri/src/menu.rs`,
 * whose own test checks the two name the same commands).
 */

import { listRuns } from "@chipschat/core";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type CommandId, commandsNow, runCommand, stepSpace, useMenuCommand } from "./menuBar.ts";

function Holds(props: { id: CommandId; run: (() => void) | undefined; title?: string }) {
  useMenuCommand(props.id, props.run, props.title);
  return null;
}

const standing = (id: CommandId) => commandsNow().find((each) => each.id === id);

describe("the menus' commands", () => {
  it("are dim until a screen can do them, and done by the newest holder", () => {
    expect(standing("new-space")).toEqual({ id: "new-space", title: "New Space", enabled: false });
    const done: string[] = [];
    const first = render(<Holds id="new-space" run={() => done.push("first")} />);
    const second = render(<Holds id="new-space" run={() => done.push("second")} />);
    expect(standing("new-space")?.enabled).toBe(true);
    act(() => runCommand("new-space"));
    expect(done).toEqual(["second"]);
    second.unmount();
    act(() => runCommand("new-space"));
    expect(done).toEqual(["second", "first"]);
    first.unmount();
    expect(standing("new-space")?.enabled).toBe(false);
  });

  it("go dim while their screen cannot do them, and carry the name it gives", () => {
    const view = render(<Holds id="feedback" run={undefined} />);
    expect(standing("feedback")?.enabled).toBe(false);
    view.rerender(<Holds id="feedback" run={() => undefined} title="Send Feedback on GitHub…" />);
    expect(standing("feedback")).toEqual({
      id: "feedback",
      title: "Send Feedback on GitHub…",
      enabled: true,
    });
    view.unmount();
  });

  it("do nothing for an id they do not have, or one nobody holds", () => {
    expect(() => runCommand("print")).not.toThrow();
    expect(() => runCommand("next-space")).not.toThrow();
  });
});

describe("the space before and after", () => {
  const order = ["spc_pinned", "spc_a", "spc_b"];

  it("goes down and up the rail and stops at its ends", () => {
    expect(stepSpace(order, "spc_a", 1)).toBe("spc_b");
    expect(stepSpace(order, "spc_a", -1)).toBe("spc_pinned");
    expect(stepSpace(order, "spc_b", 1)).toBeUndefined();
    expect(stepSpace(order, "spc_pinned", -1)).toBeUndefined();
  });

  it("starts at the first or the last with no room open, or one not in the run", () => {
    expect(stepSpace(order, undefined, 1)).toBe("spc_pinned");
    expect(stepSpace(order, undefined, -1)).toBe("spc_b");
    expect(stepSpace(order, "spc_hidden", 1)).toBe("spc_pinned");
    expect(stepSpace([], undefined, 1)).toBeUndefined();
  });

  it("reads the rail's order: pinned first, a hidden room left out", () => {
    const space = (id: string) => ({ id, state: "open" }) as Parameters<typeof listRuns>[0][number];
    const runs = listRuns([space("spc_a"), space("spc_b"), space("spc_c")], new Set(["spc_b"]), [
      "spc_c",
    ]);
    expect(runs.open.map((each) => each.id)).toEqual(["spc_c", "spc_a"]);
  });
});
