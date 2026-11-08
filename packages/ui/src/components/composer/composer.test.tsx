import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer, rowsFor } from "./composer.js";

describe("Composer", () => {
  it("is a labelled box with a send button that waits for words", () => {
    render(
      <Composer
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        label="Message Scout"
      />,
    );
    expect(screen.getByRole("textbox", { name: "Message Scout" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
  });

  it("keeps the same text box, and the focus in it, when a lead comes or goes", () => {
    // A room's first agent joining brings a lead; the reader may be typing as it lands.
    const box = (lead?: string) => (
      <Composer
        value="still typing"
        onChange={() => undefined}
        onSend={() => undefined}
        label="Message Garden plan"
        lead={lead === undefined ? undefined : <span>{lead}</span>}
      />
    );
    const { rerender } = render(box());
    const before = screen.getByRole("textbox");
    before.focus();
    rerender(box("To Oak"));
    expect(screen.getByRole("textbox")).toBe(before);
    expect(document.activeElement).toBe(before);
    rerender(box());
    expect(screen.getByRole("textbox")).toBe(before);
    expect(document.activeElement).toBe(before);
  });

  it("sends on Enter and keeps Shift+Enter for a new line", () => {
    const onSend = vi.fn();
    render(<Composer value="Confirm it" onChange={() => undefined} onSend={onSend} />);
    const box = screen.getByRole("textbox");
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Confirm it");
  });

  it("tells its owner of Escape in the words, and hands over the box to put the caret in", () => {
    const onEscape = vi.fn();
    const box: { current: HTMLTextAreaElement | null } = { current: null };
    render(
      <Composer
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        onEscape={onEscape}
        inputRef={box}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(box.current).toBe(screen.getByRole("textbox"));
  });

  it("does not send blank space", () => {
    const onSend = vi.fn();
    render(<Composer value="   " onChange={() => undefined} onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("reports every keystroke to its owner", () => {
    const onChange = vi.fn();
    render(<Composer value="" onChange={onChange} onSend={() => undefined} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hi" } });
    expect(onChange).toHaveBeenCalledWith("Hi");
  });

  it("carries the attach button and the chips", () => {
    const onAttach = vi.fn();
    const steer = vi.fn();
    render(
      <Composer
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        onAttach={onAttach}
        chips={[{ id: "steer", label: "Steer", icon: "bolt", onClick: steer }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Attach a photo or file" }));
    fireEvent.click(screen.getByRole("button", { name: "Steer" }));
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(steer).toHaveBeenCalledTimes(1);
  });

  it("offers a microphone only when there is something to record with, and not twice at once", () => {
    const onRecord = vi.fn();
    const composer = (recording: boolean) => (
      <Composer
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        onRecord={onRecord}
        recording={recording}
      />
    );
    const { rerender } = render(composer(false));
    fireEvent.click(screen.getByRole("button", { name: "Record a voice note" }));
    expect(onRecord).toHaveBeenCalledTimes(1);
    rerender(composer(true));
    const mic = screen.getByRole("button", { name: "Record a voice note" }) as HTMLButtonElement;
    expect(mic.disabled).toBe(true);
    expect(mic.getAttribute("aria-pressed")).toBe("true");
    rerender(<Composer value="" onChange={() => undefined} onSend={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Record a voice note" })).toBeNull();
  });

  it("shows what is attached and lets it be taken out", () => {
    const onRemove = vi.fn();
    render(
      <Composer
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        attachments={[{ id: "a", name: "PO-4471.pdf", meta: "212 KB", onRemove }]}
      />,
    );
    expect(screen.getByRole("list", { name: "Attachments" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove PO-4471.pdf" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("grows a line per line break, up to the cap", () => {
    expect(rowsFor("", 8)).toBe(1);
    expect(rowsFor("a\nb\nc", 8)).toBe(3);
    expect(rowsFor("a\n".repeat(20), 8)).toBe(8);
  });

  it("can be switched off", () => {
    render(<Composer value="x" onChange={() => undefined} onSend={() => undefined} disabled />);
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
  });

  it("as the iPad's, holds the clip and the microphone in one + and Send in the field", () => {
    const onAttach = vi.fn();
    const onRecord = vi.fn();
    const { container } = render(
      <Composer
        value="hi"
        onChange={() => undefined}
        onSend={() => undefined}
        onAttach={onAttach}
        onRecord={onRecord}
        chips={[{ id: "steer", label: "Steer" }]}
        plus
      />,
    );
    // Nothing beside the field but the +; Steer and Send stand inside its box.
    expect(screen.queryByRole("button", { name: "Attach a photo or file" })).toBeNull();
    const field = container.querySelector(".ui-composer__field");
    expect(field?.getAttribute("data-bare")).toBeNull();
    expect(field?.contains(screen.getByRole("button", { name: "Send" }))).toBe(true);
    expect(field?.contains(screen.getByRole("button", { name: "Steer" }))).toBe(true);

    const plus = screen.getByRole("button", { name: "Add to the message" });
    expect(plus.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(plus);
    expect(plus.getAttribute("aria-expanded")).toBe("true");
    const first = screen.getByRole("menuitem", { name: "Photo or file" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Voice note" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Voice note" }));
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(plus);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(plus);
    fireEvent.click(plus);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onAttach).not.toHaveBeenCalled();
  });
});
