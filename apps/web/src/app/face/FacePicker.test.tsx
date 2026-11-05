/**
 * The face picker on the Mac and the web (ADR 0272), on its own: the head wears each pick before
 * the store answers, a colour saves on its own and a mark on the colour the picker is on, letters
 * save when the typing stops or the page is left, the default puts the initials back, the arrows
 * move the keyboard without choosing, and a refusal says why. Opening it from your face on You is
 * `You.test.tsx`'s.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { LIBRARY_FAMILIES } from "@chipschat/ui";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FacePicker } from "./FacePicker.tsx";
import { SETTLE_MS } from "./LettersField.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The picker over a face the test holds, saving each pick as the store would. */
function renderPicker(
  over: { chosen?: SpaceIcon; kind?: "person" | "agent"; failed?: string } = {},
) {
  const picks: (SpaceIcon | undefined)[] = [];
  let shown = true;
  const draw = (chosen: SpaceIcon | undefined) => (
    <FacePicker
      title="Arjun"
      subtitle="Owner · Demo"
      kind={over.kind ?? "person"}
      chosen={chosen}
      failed={over.failed}
      onChoose={(face) => {
        picks.push(face);
        if (shown) view.rerender(draw(face));
      }}
    />
  );
  const view = render(draw(over.chosen));
  /** The page left: what it saves on the way out is a pick with nothing left to draw it. */
  const leave = () => {
    shown = false;
    view.unmount();
  };
  return { picks, leave };
}

const head = () => screen.getByTestId("face-picker").querySelector(".face-head") as HTMLElement;
const checked = () =>
  within(screen.getByRole("radiogroup", { name: "Colours" }))
    .getAllByRole("radio")
    .filter((each) => each.getAttribute("aria-checked") === "true")
    .map((each) => each.getAttribute("aria-label"));

describe("the face picker (ADR 0272)", () => {
  it("heads itself with the face being changed, and every colour, the face's own ticked", () => {
    renderPicker({ chosen: { icon: "cup", ground: 3 } });
    expect(head().textContent).toContain("Arjun");
    expect(head().textContent).toContain("Owner · Demo");
    expect(
      within(screen.getByRole("radiogroup", { name: "Colours" })).getAllByRole("radio"),
    ).toHaveLength(27);
    expect(checked()).toEqual(["Teal"]);
    const marks = LIBRARY_FAMILIES.reduce((all, each) => all + each.marks.length, 0);
    expect(within(screen.getByTestId("icon-grid")).getAllByRole("button")).toHaveLength(marks);
    expect(screen.getByTestId("mark-cup").getAttribute("aria-pressed")).toBe("true");
    for (const each of LIBRARY_FAMILIES)
      expect(screen.getByRole("button", { name: each.name })).toBeTruthy();
  });

  it("saves a colour on its own, then a mark on that colour, and the default puts the initials back", () => {
    const { picks } = renderPicker();
    expect(screen.getByTestId("face-default").hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Navy" }));
    expect(picks).toEqual([{ icon: "", ground: 23 }]);
    expect(checked()).toEqual(["Navy"]);

    fireEvent.click(screen.getByTestId("mark-rocket"));
    expect(picks.at(-1)).toEqual({ icon: "rocket", ground: 23 });
    expect(screen.getByTestId("mark-rocket").getAttribute("aria-pressed")).toBe("true");
    // The mark keeps its place on another colour.
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));
    expect(picks.at(-1)).toEqual({ icon: "rocket", ground: 12 });

    fireEvent.click(screen.getByTestId("face-default"));
    expect(picks.at(-1)).toBeUndefined();
    expect(screen.getByTestId("face-default").hasAttribute("disabled")).toBe(true);
  });

  it("wears letters as they are typed and saves them once the typing stops", () => {
    vi.useFakeTimers();
    const { picks } = renderPicker({ chosen: { icon: "cup", ground: 4 } });
    const field = screen.getByTestId("face-letters") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "A" } });
    fireEvent.change(field, { target: { value: "A B c" } });
    expect(field.value).toBe("AB");
    expect(head().textContent).toContain("AB");
    expect(picks).toEqual([]);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(picks).toEqual([{ icon: "", ground: 4, letters: "AB" }]);

    // A mark takes the letters' place, and empties the field.
    fireEvent.click(screen.getByTestId("mark-cup"));
    expect(picks.at(-1)).toEqual({ icon: "cup", ground: 4 });
    expect(field.value).toBe("");
  });

  it("saves letters typed and not yet saved when the page is left", () => {
    vi.useFakeTimers();
    const { picks, leave } = renderPicker();
    fireEvent.change(screen.getByTestId("face-letters"), { target: { value: "🦊" } });
    leave();
    expect(picks).toHaveLength(1);
    expect(picks[0]?.letters).toBe("🦊");
  });

  it("moves the keyboard with the arrows without choosing; Enter chooses", () => {
    const { picks } = renderPicker({ chosen: { icon: "", ground: 12 } });
    const red = screen.getByRole("radio", { name: "Red" });
    expect(red.tabIndex).toBe(0);
    red.focus();
    fireEvent.keyDown(red, { key: "ArrowRight" });
    const orange = screen.getByRole("radio", { name: "Orange" });
    expect(document.activeElement).toBe(orange);
    expect(orange.tabIndex).toBe(0);
    fireEvent.keyDown(orange, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Terracotta" }));
    expect(picks).toEqual([]);

    const first = screen.getByTestId(`mark-${LIBRARY_FAMILIES[0]?.marks[0]}`);
    expect(first.tabIndex).toBe(0);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = screen.getByTestId(`mark-${LIBRARY_FAMILIES[0]?.marks[1]}`);
    expect(document.activeElement).toBe(second);
    expect(picks).toEqual([]);
  });

  it("says why a pick did not stick, and puts the face and its colour back", async () => {
    // A store that turns the pick away before it has shown it, as the demo does: a moment later.
    const draw = (failed: string | undefined) => (
      <FacePicker
        title="Arjun"
        kind="person"
        chosen={{ icon: "cup", ground: 3 }}
        failed={failed}
        onChoose={() =>
          void Promise.resolve().then(() =>
            view.rerender(draw("Not saved: This isn't in the demo.")),
          )
        }
      />
    );
    const view = render(draw(undefined));
    fireEvent.click(screen.getByRole("radio", { name: "Navy" }));
    expect(checked()).toEqual(["Navy"]);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Not saved: This isn't in the demo.",
    );
    expect(checked()).toEqual(["Teal"]);
    expect(screen.getByTestId("mark-cup").getAttribute("aria-pressed")).toBe("true");
    expect(head().querySelector(".ui-avatar")?.getAttribute("style")).toContain("--avatar-4");
  });

  it("draws an agent's chosen mark in the agent's outline", () => {
    renderPicker({ kind: "agent", chosen: { icon: "cup", ground: 3 } });
    const cup = screen.getByTestId("mark-cup");
    expect(cup.querySelector('.ui-avatar[data-kind="agent"]')).not.toBeNull();
    expect(screen.getByTestId("mark-rocket").querySelector(".ui-avatar")).toBeNull();
  });
});
