import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard, type ApprovalCardProps } from "./approval.js";

const ASK: ApprovalCardProps = {
  harnessName: "Scout",
  title: "Scout wants to send an email",
  subtitle: "To dana@northwind.com · Subject: PO #4471 confirmation",
  icon: "mail",
  preview: {
    format: "markdown",
    body: "Hi Dana, confirming PO #4471: 120 units at $48.20, delivery by Sep 19.",
  },
  risk: ["external_communication", "irreversible"],
  sources: [{ kind: "external", label: "vendor website" }],
  remainingMs: 58 * 60_000,
  editable: true,
};

describe("ApprovalCard, open", () => {
  it("says who wants to do what, what it risks, and how long is left", () => {
    render(<ApprovalCard {...ASK} />);
    const card = screen.getByRole("article", { name: "Approval: Scout wants to send an email" });
    expect(card.getAttribute("data-decision")).toBe("pending");
    expect(card.getAttribute("data-tone")).toBe("ask");
    expect(screen.getByText("Scout wants to send an email")).toBeTruthy();
    expect(screen.getByText(/expires in 58m/)).toBeTruthy();
    const risk = screen.getByRole("list", { name: "Risk" });
    expect(screen.getByText("External message").getAttribute("data-hot")).toBe("true");
    expect(screen.getByText("Not reversible").hasAttribute("data-hot")).toBe(false);
    expect(risk.querySelectorAll("li")).toHaveLength(2);
  });

  it("flags content from outside the workspace as a claim, not an instruction", () => {
    render(<ApprovalCard {...ASK} />);
    expect(
      screen.getByText(/vendor website is outside the workspace/).getAttribute("data-external"),
    ).toBe("true");
  });

  it("lists internal sources without a flag", () => {
    render(<ApprovalCard {...ASK} sources={[{ kind: "internal", label: "Drive" }]} />);
    expect(screen.getByText("Sources: Drive").hasAttribute("data-external")).toBe(false);
  });

  it("offers Deny, Edit and Approve, and reports the choice", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const onEdit = vi.fn();
    render(<ApprovalCard {...ASK} onApprove={onApprove} onDeny={onDeny} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("cannot edit what the harness did not mark editable, or what has no preview", () => {
    render(<ApprovalCard {...ASK} editable={false} />);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveProperty("disabled", true);
  });

  it("holds the buttons while a decision is on its way", () => {
    render(<ApprovalCard {...ASK} busy />);
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
  });

  it("lets a person say how far a yes reaches", () => {
    const onScopeChange = vi.fn();
    render(<ApprovalCard {...ASK} scope="once" onScopeChange={onScopeChange} />);
    expect(screen.getByRole("radio", { name: "Once" })).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("radio", { name: "Always" }));
    expect(onScopeChange).toHaveBeenCalledWith("always");
  });

  it("shows a diff in mono", () => {
    render(
      <ApprovalCard
        {...ASK}
        preview={{ format: "diff", body: "-  120 units\n+  240 units", title: "tracker.csv" }}
      />,
    );
    expect(screen.getByText("tracker.csv")).toBeTruthy();
    expect(screen.getByText(/240 units/).tagName).toBe("PRE");
  });

  it("draws a Markdown body with the app's renderer, and only a Markdown one", () => {
    const renderMarkdown = vi.fn((body: string) => <div data-testid="app-markdown">{body}</div>);
    const { rerender } = render(<ApprovalCard {...ASK} renderMarkdown={renderMarkdown} />);
    expect(renderMarkdown).toHaveBeenCalledWith(ASK.preview?.body);
    expect(screen.getByTestId("app-markdown").textContent).toContain("confirming PO #4471");

    renderMarkdown.mockClear();
    rerender(
      <ApprovalCard
        {...ASK}
        preview={{ format: "plain", body: "Hi Dana, **as written**." }}
        renderMarkdown={renderMarkdown}
      />,
    );
    expect(renderMarkdown).not.toHaveBeenCalled();
    expect(screen.getByText("Hi Dana, **as written**.").tagName).toBe("P");
  });

  it("draws a Markdown body as its words when the app gives it no renderer", () => {
    render(<ApprovalCard {...ASK} />);
    expect(screen.getByText(/confirming PO #4471/).tagName).toBe("P");
  });

  it("carries the trail when it comes from inside a lane", () => {
    render(<ApprovalCard {...ASK} trail="Arjun → Scout → Ledger" />);
    expect(screen.getByText("Arjun → Scout → Ledger")).toBeTruthy();
  });

  it("says who it is waiting on, and offers nobody else the buttons (M3.3)", () => {
    render(<ApprovalCard {...ASK} waitingOn="Dana" onApprove={vi.fn()} />);
    expect(screen.getByText("Waiting on Dana")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("says when the clock has run out", () => {
    render(<ApprovalCard {...ASK} remainingMs={0} />);
    expect(screen.getByText("expired").getAttribute("data-expired")).toBe("true");
  });

  it("asks the question, with what a yes does and how long it lasts (ADR 0142)", () => {
    render(
      <ApprovalCard
        {...ASK}
        title="Let Game of Life work in `~/JacobianSpaces/evolution-lab`?"
        subtitle="Game of Life asks"
        effect="It can run its seven fixed commands as your Mac user."
        lasts="standing"
      />,
    );
    expect(screen.getByText("~/JacobianSpaces/evolution-lab").tagName).toBe("CODE");
    expect(screen.queryByText(/`/)).toBeNull();
    expect(screen.getByText("Game of Life asks")).toBeTruthy();
    expect(screen.getByText("It can run its seven fixed commands as your Mac user.")).toBeTruthy();
    const lasts = screen.getByText("Until you take it back");
    expect(lasts.getAttribute("data-lasts")).toBe("standing");
  });

  it("says a one-off is a one-off, and says nothing when the harness did not", () => {
    const { unmount } = render(<ApprovalCard {...ASK} lasts="once" />);
    expect(screen.getByText("Just this once")).toBeTruthy();
    unmount();
    render(<ApprovalCard {...ASK} />);
    expect(screen.queryByText("Just this once")).toBeNull();
    expect(screen.queryByText("Until you take it back")).toBeNull();
  });
});

describe("ApprovalCard, decided", () => {
  it("cools to green and says who approved, when, and what happened next", () => {
    render(
      <ApprovalCard
        {...ASK}
        resolution={{ decision: "approved", by: "Arjun", at: "10:45", executed: "executed" }}
      />,
    );
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(card.getAttribute("data-tone")).toBe("approved");
    expect(screen.getByText(/Approved by Arjun · 10:45 · logged · sent/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when the yes came with edits", () => {
    render(<ApprovalCard {...ASK} resolution={{ decision: "edited", by: "Arjun" }} />);
    expect(screen.getByText(/Approved with edits by Arjun · logged/)).toBeTruthy();
  });

  it("cools to red for a denial, with the reason", () => {
    render(
      <ApprovalCard
        {...ASK}
        resolution={{ decision: "denied", by: "Arjun", at: "10:45", reason: "Wrong quantity" }}
      />,
    );
    expect(screen.getByRole("article").getAttribute("data-tone")).toBe("denied");
    expect(screen.getByText(/Denied by Arjun · 10:45 · Wrong quantity/)).toBeTruthy();
  });

  it("says when nobody answered and policy decided", () => {
    render(<ApprovalCard {...ASK} resolution={{ decision: "expired", by: "deny", at: "11:42" }} />);
    expect(screen.getByText(/Expired · 11:42 · nobody answered, so policy denied it/)).toBeTruthy();
  });

  it("says when another device answered first", () => {
    render(
      <ApprovalCard
        {...ASK}
        resolution={{ decision: "approved", by: "Arjun", resolvedElsewhere: true }}
      />,
    );
    expect(screen.getByText(/Approved by Arjun on another device/)).toBeTruthy();
  });

  it("reports a yes that could not be carried out", () => {
    render(
      <ApprovalCard
        {...ASK}
        resolution={{ decision: "approved", by: "Arjun", executed: "failed" }}
      />,
    );
    expect(screen.getByText(/failed to send/)).toBeTruthy();
  });
});
