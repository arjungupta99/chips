import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./timeline.js";

describe("Timeline", () => {
  it("is a list of the plan, with the current step marked", () => {
    render(
      <Timeline
        items={[
          { id: "1", title: "Read PO #4471", status: "done" },
          { id: "2", title: "Found the vendor contact", status: "done" },
          {
            id: "3",
            title: "Send the confirmation email",
            status: "now",
            note: "needs your approval",
          },
          { id: "4", title: "Update the PO tracker" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Timeline" });
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(4);
    expect(items[0]?.getAttribute("data-status")).toBe("done");
    expect(items[2]?.getAttribute("aria-current")).toBe("step");
    expect(items[3]?.getAttribute("data-status")).toBe("planned");
    expect(screen.getByText("needs your approval")).toBeTruthy();
  });

  it("marks a compaction as a tick on the rail", () => {
    render(
      <Timeline items={[{ id: "c", title: "Compacted context · 88% → 31%", kind: "tick" }]} />,
    );
    expect(screen.getByRole("listitem").getAttribute("data-kind")).toBe("tick");
  });
});
