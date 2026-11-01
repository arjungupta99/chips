import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttachmentChip } from "./attachment.js";

describe("AttachmentChip", () => {
  it("names the file and says how big it is", () => {
    render(<AttachmentChip name="PO-4471.pdf" meta="212 KB · 2 pages" />);
    expect(screen.getByText("PO-4471.pdf")).toBeTruthy();
    expect(screen.getByText("212 KB · 2 pages")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("opens somewhere when it has an address", () => {
    render(<AttachmentChip name="PO-4471.pdf" href="/v1/attachments/att_1" />);
    expect(screen.getByRole("link", { name: /PO-4471\.pdf/ }).getAttribute("href")).toBe(
      "/v1/attachments/att_1",
    );
  });

  it("can be taken back out of a composer", () => {
    const onRemove = vi.fn();
    render(<AttachmentChip name="photo.jpg" kind="image" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo.jpg" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows what kind of thing it is", () => {
    const { container } = render(<AttachmentChip name="note.m4a" kind="audio" />);
    expect(container.querySelector("[data-icon='mic']")).toBeTruthy();
    expect(container.querySelector(".ui-attachment")?.getAttribute("data-kind")).toBe("audio");
  });
});
