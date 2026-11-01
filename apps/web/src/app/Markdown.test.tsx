/**
 * A picture in a message's words (ADR 0068). What counts as one is core's
 * (`packages/core/src/markdown.test.ts`); this is how the room draws it.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown.tsx";

const TRUCK = "https://www.lego.com/cdn/cs/set/assets/blt085c6e38ce337804/42203_boxprod_v39.png";

function drawn(text: string) {
  return render(<Markdown text={text} directory={{}} />);
}

describe("a picture in a message", () => {
  it("draws it between the words, as a photo, opening in a new tab with no referrer", () => {
    const { container } = drawn(
      `Here’s the truck:\n\n![Blue LEGO Technic Tipping Dump Truck](${TRUCK})\n\nIt tips up.`,
    );
    const grid = screen.getByTestId("md-pictures");
    expect(grid.className).toContain("photo-grid");
    expect(grid.getAttribute("data-count")).toBe("1");
    const tile = screen.getByTestId("md-picture");
    expect(tile.getAttribute("href")).toBe(TRUCK);
    expect(tile.getAttribute("target")).toBe("_blank");
    const image = screen.getByAltText("Blue LEGO Technic Tipping Dump Truck");
    expect(image.getAttribute("src")).toBe(TRUCK);
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    // No stray `!` where the picture was written.
    expect(container.textContent).toBe("Here’s the truck:It tips up.");
    expect([...container.querySelectorAll(".md > *")].map((each) => each.tagName)).toEqual([
      "P",
      "DIV",
      "P",
    ]);
  });

  it("holds its placeholder until the picture has come", () => {
    drawn(`![truck](${TRUCK})`);
    const image = screen.getByAltText("truck");
    expect(image.hasAttribute("data-loading")).toBe(true);
    expect(document.querySelector(".photo-loading")).not.toBeNull();
    fireEvent.load(image);
    expect(image.hasAttribute("data-loading")).toBe(false);
    expect(document.querySelector(".photo-loading")).toBeNull();
  });

  it("says its words as a link when it will not load", () => {
    drawn(`![Blue truck](${TRUCK})`);
    fireEvent.error(screen.getByAltText("Blue truck"));
    expect(screen.queryByTestId("md-picture")).toBeNull();
    const link = screen.getByRole("link", { name: "Blue truck" });
    expect(link.getAttribute("href")).toBe(TRUCK);
  });

  it("lays pictures side by side out as one grid, and follows a linked one to its link", () => {
    drawn(
      "[![a](https://x.example/a.png)](https://x.example/product)\n![b](https://x.example/b.png)\n![c](https://x.example/c.png)",
    );
    expect(screen.getByTestId("md-pictures").getAttribute("data-count")).toBe("3");
    const tiles = screen.getAllByTestId("md-picture");
    expect(tiles.map((each) => each.getAttribute("href"))).toEqual([
      "https://x.example/product",
      "https://x.example/b.png",
      "https://x.example/c.png",
    ]);
  });
});

describe("a mention in a message", () => {
  it("draws @all as a chip, which names every harness and nobody by name (ADR 0081)", () => {
    const { container } = render(
      <Markdown
        text="@all over to you, and @Ledger first; @nobody stays words"
        directory={{
          hrn_ledger: { id: "hrn_ledger", kind: "harness", displayName: "Ledger" },
        }}
      />,
    );
    const chips = [...container.querySelectorAll(".md-mention")].map((each) => each.textContent);
    expect(chips).toEqual(["@all", "@Ledger"]);
    expect(container.textContent).toContain("@nobody stays words");
  });

  it("draws the chip for whoever the server found it names, whole names first (ADR 0091)", () => {
    const directory = {
      agt_one: { id: "agt_one", kind: "agent" as const, displayName: "OpenClaw" },
      agt_two: { id: "agt_two", kind: "agent" as const, displayName: "OpenClaw 2" },
    };
    const both = render(
      <Markdown
        text="@OpenClaw2 then @OpenClaw"
        directory={directory}
        mentions={["agt_two", "agt_one"]}
      />,
    );
    const chips = [...both.container.querySelectorAll(".md-mention")].map(
      (each) => each.textContent,
    );
    expect(chips).toEqual(["@OpenClaw 2", "@OpenClaw"]);
    // The server found only OpenClaw 2: a handle for somebody not in the room stays words.
    const one = render(
      <Markdown
        text="@OpenClaw2 then @Hello"
        directory={{
          ...directory,
          agt_hello: { id: "agt_hello", kind: "agent" as const, displayName: "Hello" },
        }}
        mentions={["agt_two"]}
      />,
    );
    const only = [...one.container.querySelectorAll(".md-mention")].map((each) => each.textContent);
    expect(only).toEqual(["@OpenClaw 2"]);
  });
});

describe("the words a search opened a line on (ADR 0133)", () => {
  const people = {
    usr_kit: { id: "usr_kit", kind: "person" as const, displayName: "Kit" },
  };
  const marked = (container: HTMLElement) =>
    [...container.querySelectorAll("mark")].map((each) => each.textContent);

  it("marks them in plain, bold and italic words and in a mention, as the server found them", () => {
    const { container } = render(
      <Markdown
        text={"Garage door **garages** _garaged_ @Kit, the garage"}
        directory={people}
        marks={["kit", "garage"]}
      />,
    );
    // Whole words for the terms before the last, a prefix for the last, as FTS5 matches.
    expect(marked(container)).toEqual(["Garage", "garages", "garaged", "Kit", "garage"]);
    expect(container.textContent).toBe("Garage door garages garaged @Kit, the garage");
  });

  it("leaves code and links as they are, and marks nothing without terms", () => {
    const { container } = render(
      <Markdown
        text={"`garage` and [garage](https://example.com) and garage"}
        directory={{}}
        marks={["garage"]}
      />,
    );
    expect(marked(container)).toEqual(["garage"]);
    const plain = render(<Markdown text="garage" directory={{}} marks={[]} />);
    expect(marked(plain.container)).toEqual([]);
  });
});

describe("headings, lists, quotes and tables (ADR 0184)", () => {
  // Garage door replacement, 15 October 2026: the room showed this as `##`, pipes and dashes.
  const GARAGE = [
    "## Why it’s plausible for your door",
    "",
    "| Your door/conditions | What the guidance says |",
    "|---|---:|",
    "| **15-foot-wide door** | Wider doors have greater potential bowing. |",
    "",
    "> “All insulated panels will exhibit some thermal bowing.”",
    "",
    "3. Compare the door",
    "4. Ask for a callback",
    "",
    "---",
  ].join("\n");

  it("draws each block as the element it is, under the room's own headings", () => {
    const { container } = drawn(GARAGE);
    expect([...container.querySelectorAll(".md > *")].map((each) => each.tagName)).toEqual([
      "H4",
      "DIV",
      "BLOCKQUOTE",
      "OL",
      "HR",
    ]);
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
      "Why it’s plausible for your door",
    );
    expect(container.textContent).not.toMatch(/##|\||---|>/);
  });

  it("draws a table with its heading row, its cells' words and its columns' alignment", () => {
    drawn(GARAGE);
    const table = screen.getByTestId("md-table");
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual([
      "Your door/conditions",
      "What the guidance says",
    ]);
    const cells = [...table.querySelectorAll("td")];
    expect(cells[0]?.querySelector("strong")?.textContent).toBe("15-foot-wide door");
    expect(cells[1]?.style.textAlign).toBe("right");
    expect(cells[0]?.style.textAlign).toBe("");
  });

  it("keeps a column of long words a few words wide, and a short one as narrow as it is", () => {
    drawn(
      "| Set | Age | Why |\n|---|---|---|\n| Mixer | 7+ | A rotating drum with an internal screw mechanism |",
    );
    const cells = [...screen.getByTestId("md-table").querySelectorAll("td")];
    expect(cells.map((cell) => cell.querySelector(".md-long") !== null)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("puts a dot per column over a table wider than its bubble (ADR 0186)", () => {
    // jsdom lays nothing out: the table is as wide as a 4-column one in a phone-width bubble.
    const wide = vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(693);
    const box = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(340);
    const { container } = drawn(
      "| Set | Age | Why | Price |\n|---|---|---|---|\n| Mixer | 7+ | A drum | ~$40 |",
    );
    expect(screen.getByTestId("md-table-dots").querySelectorAll("i")).toHaveLength(4);
    const marked = container.querySelector<HTMLElement>(".md-table-box");
    expect(marked?.hasAttribute("data-wide")).toBe(true);
    // Nothing past the start yet, and all the fade at the far side.
    expect(marked?.style.getPropertyValue("--md-l")).toBe("0");
    expect(marked?.style.getPropertyValue("--md-r")).toBe("1");
    wide.mockRestore();
    box.mockRestore();
  });

  it("puts no dots over a table that fits", () => {
    drawn(GARAGE);
    expect(screen.queryByTestId("md-table-dots")).toBeNull();
  });

  it("numbers a list from where it starts", () => {
    const { container } = drawn(GARAGE);
    const list = container.querySelector("ol");
    expect(list?.getAttribute("start")).toBe("3");
    expect([...(list?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual([
      "Compare the door",
      "Ask for a callback",
    ]);
  });
});
