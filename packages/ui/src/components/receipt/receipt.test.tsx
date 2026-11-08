import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Receipt, type ReceiptStep, receiptSummary } from "./receipt.js";

const STEPS: readonly ReceiptStep[] = [
  { id: "read-po", title: "Read PO #4471", status: "done", source: "Drive", durationMs: 1840 },
  { id: "find-contact", title: "Found the vendor contact", status: "done", source: "CRM" },
  { id: "draft", title: "Drafted the confirmation email", status: "done", source: "draft v2" },
];

describe("Receipt", () => {
  it("summarises the steps, the time and the cost on one line", () => {
    expect(receiptSummary(STEPS, 12_000, 0.04)).toBe("≈$0.04 · 3 steps · 12s");
    expect(receiptSummary([STEPS[0] as ReceiptStep])).toBe("1 step");
    expect(
      receiptSummary([...STEPS, { id: "send", title: "Send", status: "failed" }], 30_000),
    ).toBe("4 steps · 1 failed · 30s");
  });

  it("says what a run that only answered took and cost, with nothing to open", () => {
    expect(receiptSummary([], 3600, 0.029)).toBe("≈$0.03 · 4s");
    const { container } = render(<Receipt steps={[]} durationMs={3600} costUsd={0.029} />);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("≈$0.03 · 4s")).toBeTruthy();
  });

  it("is collapsed unless told to open", () => {
    const { container } = render(<Receipt steps={STEPS} durationMs={12_000} costUsd={0.04} />);
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("≈$0.04 · 3 steps · 12s")).toBeTruthy();
  });

  it("lists each step with its outcome and its source", () => {
    render(<Receipt steps={STEPS} open />);
    expect(screen.getAllByRole("img", { name: "done" })).toHaveLength(3);
    expect(screen.getByText("Drive")).toBeTruthy();
    expect(screen.getByText("2s")).toBeTruthy();
  });

  it("shows a failure and why", () => {
    render(
      <Receipt
        steps={[{ id: "send", title: "Send the email", status: "failed", error: "SMTP refused" }]}
        open
      />,
    );
    expect(screen.getByRole("img", { name: "failed" })).toBeTruthy();
    expect(screen.getByText("· SMTP refused")).toBeTruthy();
  });

  it("says when it is opened or closed", () => {
    const onToggle = vi.fn();
    const { container } = render(<Receipt steps={STEPS} onToggle={onToggle} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
