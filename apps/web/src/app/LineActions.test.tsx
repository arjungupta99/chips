/**
 * The thing that stands under a bubble — the form that changes its words — and the rule the room
 * uses to decide whether a row need redraw.
 */

import type { Line } from "@chipschat/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteForm } from "./Feedback.tsx";
import { EditForm, type LineMay, sameMay } from "./LineActions.tsx";

afterEach(cleanup);

const LINE = {
  id: "evt_1",
  seq: 4,
  kind: "text",
  authorId: "usr_arjun",
  authorKind: "person",
  text: "The PO is for the 12th.",
  ts: "2026-09-08T10:00:00.000Z",
} as Line;

const MAY: LineMay = { edit: true, remove: true, hide: true, pin: true };

describe("changing a line's words", () => {
  const editing = () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<EditForm line={LINE} onSave={onSave} onCancel={onCancel} />);
    return { onSave, onCancel, box: screen.getByLabelText("Edit message") };
  };

  it("sends on Enter, and leaves a new line on shift", () => {
    const { onSave, box } = editing();
    fireEvent.change(box, { target: { value: "The PO is for the 19th." } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("The PO is for the 19th.");
  });

  it("drops the change on Escape, and will not send words that did not change", () => {
    const { onSave, onCancel, box } = editing();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Not right? (ADR 0200)", () => {
  const noting = () => {
    const onFeedback = vi.fn();
    const onClose = vi.fn();
    render(
      <NoteForm line={LINE} name="Scout" busy={false} onFeedback={onFeedback} onClose={onClose} />,
    );
    return { onFeedback, onClose, form: screen.getByTestId("correction-form") };
  };

  it("lands on the first reason, since the reader asked for it", () => {
    const { form } = noting();
    expect(document.activeElement).toBe(within(form).getByRole("button", { name: "Wrong facts" }));
  });

  it("closes on Escape, and sends nothing until a reason is picked or words are written", () => {
    const { onFeedback, onClose, form } = noting();
    fireEvent.keyDown(within(form).getByLabelText("Anything else"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText("Anything else"), { target: { value: "  " } });
    fireEvent.submit(form);
    expect(onFeedback).not.toHaveBeenCalled();
    expect(within(form).getByText("Pick a reason or say what to fix.")).toBeTruthy();
    const send = within(form).getByRole("button", { name: "Send to Scout" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("sends the reasons, then the words, as the note", () => {
    const { onFeedback, onClose, form } = noting();
    const reason = within(form).getByRole("button", { name: "Missed what I asked" });
    fireEvent.click(reason);
    expect(reason.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(within(form).getByLabelText("Anything else"), {
      target: { value: "The 19th, not the 12th." },
    });
    fireEvent.submit(form);
    expect(onFeedback).toHaveBeenCalledWith(LINE, {
      kind: "correction",
      text: "Missed what I asked. The 19th, not the 12th.",
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("whether a row need redraw", () => {
  it("is the same only when both sides say the same about every action", () => {
    expect(sameMay(undefined, undefined)).toBe(true);
    expect(sameMay(MAY, undefined)).toBe(false);
    expect(sameMay(undefined, MAY)).toBe(false);
    expect(sameMay(MAY, { ...MAY })).toBe(true);
    expect(sameMay(MAY, { ...MAY, pin: false })).toBe(false);
  });
});
