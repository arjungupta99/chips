/**
 * The new-space dialog on its own (Phase 4; ADR 0084): the phone's words, who is asked — the faces
 * picked, or Empty for a room of people made by its name (ADR 0148) — the send on Enter, and the
 * ways out, which keep what was typed. What the send makes, and the room it opens, are the shell's (`Shell.test.tsx`); the
 * growing is a browser's to draw (`e2e/newSpace.spec.ts`).
 */

import type { Directory, Participant } from "@chipschat/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NewSpace, useNewSpaceDialog } from "./NewSpace.tsx";

const SCOUT: Participant = { id: "hrn_scout", kind: "harness", displayName: "Scout" };
const LEDGER: Participant = { id: "hrn_ledger", kind: "harness", displayName: "Ledger" };

/** The dialog as the rail holds it: the draft and the pick outside it, so they outlive a fold. */
function open(harnesses: readonly Participant[], initial = "", lastAsked?: string) {
  const onAsk = vi.fn<(harnessIds: readonly string[], text: string) => void>();
  const onGroup = vi.fn<(title: string) => void>();
  const onClosed = vi.fn<() => void>();
  const drafts: string[] = [];
  function Held() {
    const [draft, setDraft] = useState(initial);
    const [chosen, setChosen] = useState<readonly string[] | undefined>(undefined);
    return (
      <NewSpace
        harnesses={harnesses}
        draft={draft}
        onDraft={(next) => {
          drafts.push(next);
          setDraft(next);
        }}
        chosen={chosen}
        onChosen={setChosen}
        lastAsked={lastAsked}
        onAsk={onAsk}
        onGroup={onGroup}
        onClosed={onClosed}
      />
    );
  }
  render(<Held />);
  const dialog = screen.getByTestId("new-space-window");
  const field = screen.getByRole("textbox");
  return { onAsk, onGroup, onClosed, drafts, dialog, field };
}

const type = (field: HTMLElement, text: string) =>
  fireEvent.change(field, { target: { value: text } });
const enter = (field: HTMLElement) => fireEvent.keyDown(field, { key: "Enter" });
/** The fade out ends, as a browser says it has. */
const faded = (dialog: HTMLElement) => fireEvent.animationEnd(dialog);
const face = (name: string) => screen.getByRole("checkbox", { name });
const checked = () =>
  screen
    .getAllByRole("checkbox")
    .filter((each) => (each as HTMLInputElement).checked)
    .map((each) => each.getAttribute("aria-label"));
const says = () => screen.getByTestId("new-space-says").textContent;

describe("the new-space dialog", () => {
  it("says what the phone's window says, and puts the cursor in the field", () => {
    const { dialog, field } = open([SCOUT]);
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(screen.getByRole("heading", { name: "New space" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ask" })).toBeTruthy();
    expect(checked()).toEqual(["Scout"]);
    // Whoever is picked waits in the room for the first message, so the field names it (ADR 0149).
    expect(says()).toBe("Scout joins · waits for your first message");
    expect(field.getAttribute("aria-label")).toBe("Name the space");
    expect(field.getAttribute("placeholder")).toBe("Name the space");
    expect(document.activeElement).toBe(field);
  });

  it("asks the harness on Enter, for a room by the name typed on one line, and goes with the draft emptied", () => {
    const { onAsk, onClosed, drafts, dialog, field } = open([SCOUT]);
    type(field, "  Kitchen\n remodel \n");
    enter(field);
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(["hrn_scout"], "Kitchen remodel");
    expect(dialog.dataset["leaving"]).toBe("true");
    // Still fading, the words are still there; gone, they are the room's.
    expect(drafts.at(-1)).toBe("  Kitchen\n remodel \n");
    faded(dialog);
    expect(onClosed).toHaveBeenCalled();
    expect(drafts.at(-1)).toBe("");
    // An Enter while it fades is not a second room.
    enter(field);
    expect(onAsk).toHaveBeenCalledOnce();
  });

  it("sends nothing blank, and Shift+Enter is a new line", () => {
    const { onAsk, dialog, field } = open([SCOUT]);
    type(field, "   ");
    enter(field);
    type(field, "Two lines");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onAsk).not.toHaveBeenCalled();
    expect(dialog.dataset["leaving"]).toBeUndefined();
  });

  it("offers a face for each harness that takes new spaces, and the first click chooses one", () => {
    const { onAsk, field } = open([LEDGER, SCOUT]);
    // Empty leads them (ADR 0148).
    expect(screen.getAllByRole("checkbox").map((each) => each.getAttribute("aria-label"))).toEqual([
      "Empty space",
      "Ledger",
      "Scout",
    ]);
    // By name, so the first offered is Ledger; a click on Scout is Scout instead (ADR 0084).
    expect(checked()).toEqual(["Ledger"]);
    fireEvent.click(face("Scout"));
    expect(checked()).toEqual(["Scout"]);
    expect(says()).toBe("Scout joins · waits for your first message");
    type(field, "Close the books");
    enter(field);
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(["hrn_scout"], "Close the books");
  });

  it("adds a face on every click after the first, and asks the first of them", () => {
    const { onAsk, field } = open([LEDGER, SCOUT]);
    fireEvent.click(face("Scout"));
    fireEvent.click(face("Ledger"));
    expect(checked()).toEqual(["Ledger", "Scout"]);
    // Scout was picked first, so Scout leads.
    expect(says()).toBe("Scout leads ⇄ · Ledger joins · they wait for you");
    type(field, "Offsite");
    enter(field);
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(["hrn_scout", "hrn_ledger"], "Offsite");
  });

  it("hands the lead to the next one picked when the lead's name is clicked (ADR 0149's addendum)", () => {
    const { onAsk, field } = open([LEDGER, SCOUT]);
    fireEvent.click(face("Scout"));
    fireEvent.click(face("Ledger"));
    const lead = screen.getByRole("button", { name: "Scout leads" });
    expect(lead.getAttribute("title")).toBe("Hands the lead to Ledger");
    fireEvent.click(lead);
    // The faces are as they were; only who leads has changed, and the button keeps the keyboard.
    expect(checked()).toEqual(["Ledger", "Scout"]);
    expect(says()).toBe("Ledger leads ⇄ · Scout joins · they wait for you");
    expect(screen.getByRole("button", { name: "Ledger leads" })).toBe(lead);
    type(field, "Offsite");
    enter(field);
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(["hrn_ledger", "hrn_scout"], "Offsite");
  });

  it("offers no lead to hand on with one picked", () => {
    open([LEDGER, SCOUT]);
    expect(screen.queryByTestId("new-space-lead")).toBeNull();
  });

  it("opens on whoever was asked last, while they are offered", () => {
    open([LEDGER, SCOUT], "", "hrn_scout");
    expect(checked()).toEqual(["Scout"]);
    cleanup();
    open([LEDGER, SCOUT], "", "hrn_gone");
    expect(checked()).toEqual(["Ledger"]);
  });

  it("sends nothing when nobody is picked, and says to pick someone", () => {
    const { onAsk, onGroup, field } = open([SCOUT]);
    fireEvent.click(face("Scout"));
    expect(checked()).toEqual([]);
    expect(says()).toBe("Pick who to ask");
    type(field, "Northwind quotes");
    enter(field);
    expect(onGroup).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
    // As on the phone, Send waits for somebody to ask, with the words typed.
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(face("Scout"));
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("makes an empty room with Empty picked, named by the words on one line (ADR 0148)", () => {
    const { onAsk, onGroup, field } = open([SCOUT]);
    fireEvent.click(face("Empty space"));
    expect(checked()).toEqual(["Empty space"]);
    expect(says()).toBe("An empty space · you add agents next");
    expect(field.getAttribute("aria-label")).toBe("Name the space");
    expect(field.getAttribute("placeholder")).toBe("Name the space");
    type(field, "  Northwind\n quotes ");
    enter(field);
    expect(onGroup).toHaveBeenCalledExactlyOnceWith("Northwind quotes");
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("picks Empty alone, and a face clicked while it is picked is that face instead", () => {
    open([LEDGER, SCOUT], "", "empty");
    expect(checked()).toEqual(["Empty space"]);
    fireEvent.click(face("Scout"));
    expect(checked()).toEqual(["Scout"]);
    fireEvent.click(face("Ledger"));
    fireEvent.click(face("Empty space"));
    expect(checked()).toEqual(["Empty space"]);
  });

  it("has nothing to choose where no harness takes new spaces: the room is a room of people", () => {
    const { onGroup, field } = open([]);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(says()).toBe("A space for people, named by what you type");
    expect(field.getAttribute("aria-label")).toBe("Name the space");
    type(field, "Northwind");
    enter(field);
    expect(onGroup).toHaveBeenCalledExactlyOnceWith("Northwind");
  });

  it("folds away on Escape, the × or a click on the dim, and keeps the words", () => {
    for (const leave of ["escape", "close", "dim"] as const) {
      const { onAsk, onClosed, drafts, dialog } = open([SCOUT], "Half a thought");
      if (leave === "escape") fireEvent(dialog, new Event("cancel", { cancelable: true }));
      if (leave === "close") fireEvent.click(screen.getByRole("button", { name: "Close" }));
      if (leave === "dim") {
        fireEvent.pointerDown(dialog);
        fireEvent.click(dialog);
      }
      expect(dialog.dataset["leaving"]).toBe("true");
      faded(dialog);
      expect(onClosed).toHaveBeenCalled();
      expect(onAsk).not.toHaveBeenCalled();
      expect(drafts).not.toContain("");
      cleanup();
    }
  });

  it("stays when a press on the card is let go over the dim, which is a selection", () => {
    const { dialog, field } = open([SCOUT], "Select me");
    fireEvent.pointerDown(field);
    fireEvent.click(dialog);
    expect(dialog.dataset["leaving"]).toBeUndefined();
  });

  it("goes by itself when no fade says it has ended", () => {
    vi.useFakeTimers();
    try {
      const { onClosed } = open([SCOUT]);
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClosed).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(400));
      expect(onClosed).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the dialog the shell holds", () => {
  const takes = { capabilities: ["new_spaces"] };
  const directory = {
    hrn_scout: { ...SCOUT, ...takes },
    hrn_ledger: { ...LEDGER, ...takes },
  } as Directory;

  /** The rail's + and the dialog it opens, for one workspace, as the shell holds them. */
  function Shell(props: { readonly onAsk: (ids: readonly string[], title: string) => void }) {
    const dialog = useNewSpaceDialog({
      directory,
      workspace: "dev_one",
      onAsk: props.onAsk,
      onGroup: () => undefined,
    });
    return (
      <>
        <button type="button" onClick={(event) => dialog.open(event.currentTarget)}>
          New space
        </button>
        {dialog.dialog}
      </>
    );
  }
  const plus = () => fireEvent.click(screen.getByRole("button", { name: "New space" }));
  const fold = () => {
    const dialog = screen.getByTestId("new-space-window");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    faded(dialog);
  };

  it("keeps who was picked when it folds away unsent, as the phone does", () => {
    render(<Shell onAsk={vi.fn()} />);
    plus();
    expect(checked()).toEqual(["Ledger"]);
    // The first click chooses, the next adds.
    fireEvent.click(face("Scout"));
    fireEvent.click(face("Ledger"));
    expect(checked()).toEqual(["Ledger", "Scout"]);
    fold();
    plus();
    expect(checked()).toEqual(["Ledger", "Scout"]);
  });

  it("opens on whoever was asked last, after a reload too", () => {
    const onAsk = vi.fn();
    render(<Shell onAsk={onAsk} />);
    plus();
    fireEvent.click(face("Scout"));
    const field = screen.getByRole("textbox");
    type(field, "Quotes");
    enter(field);
    expect(onAsk).toHaveBeenCalledWith(["hrn_scout"], "Quotes");
    faded(screen.getByTestId("new-space-window"));
    cleanup();
    // The page loaded again: nothing in memory, the browser's storage kept.
    render(<Shell onAsk={vi.fn()} />);
    plus();
    expect(checked()).toEqual(["Scout"]);
  });
});
