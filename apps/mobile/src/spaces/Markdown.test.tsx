/**
 * A picture in a message's words on the phone (ADR 0068), and the words a search found marked in
 * them (ADR 0133). What counts as either is core's (`packages/core/src/markdown.test.ts`,
 * `search.test.ts`); this is how the room draws it.
 */

import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Dimensions, Linking } from "react-native";
import { light } from "../ui/tokens";
import { TILE_MAX } from "./Attachments";
import { Markdown } from "./Markdown";

const TRUCK = "https://www.lego.com/cdn/cs/set/assets/blt085c6e38ce337804/42203_boxprod_v39.png";

/** The picture came, this wide and this tall. */
async function arrives(width: number, height: number) {
  await fireEvent(screen.getByTestId("md-picture-image"), "load", {
    nativeEvent: { source: { width, height } },
  });
}

describe("a picture in a message", () => {
  it("draws it between the words as a thumbnail, at a photo's shape until it has come", async () => {
    await render(
      <Markdown
        text={`Here’s the truck:\n\n![Blue LEGO Technic Tipping Dump Truck](${TRUCK})\n\nIt tips up.`}
      />,
    );
    expect(screen.getByText("Here’s the truck:")).toBeTruthy();
    expect(screen.getByText("It tips up.")).toBeTruthy();
    // No stray `!`, and no link where the picture should be.
    expect(screen.queryByText(/!/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    const tile = screen.getByRole("imagebutton", { name: "Blue LEGO Technic Tipping Dump Truck" });
    expect(tile).toHaveStyle({ width: TILE_MAX, aspectRatio: 4 / 3 });
  });

  it("takes the picture's own shape once it has come, within a thumbnail's", async () => {
    await render(<Markdown text={`![square](${TRUCK}?square)`} />);
    await arrives(1000, 1000);
    expect(screen.getByTestId("md-picture")).toHaveStyle({ aspectRatio: 1 });
  });

  it("holds a panorama to the widest a tile may be", async () => {
    await render(<Markdown text={`![wide](${TRUCK}?wide)`} />);
    await arrives(4000, 1000);
    expect(screen.getByTestId("md-picture")).toHaveStyle({ aspectRatio: 1.8 });
  });

  it("draws a picture it has seen at its shape at once, with no placeholder to jump from", async () => {
    await render(<Markdown text={`![again](${TRUCK}?again)`} />);
    await arrives(1000, 1000);
    await render(<Markdown text={`![again](${TRUCK}?again)`} />);
    expect(screen.getByTestId("md-picture")).toHaveStyle({ aspectRatio: 1 });
  });

  it("opens the picture, or what it links to, in the phone's browser", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(
      <Markdown text="[![box](https://x.example/box.png)](https://x.example/product)" />,
    );
    await userEvent.press(screen.getByRole("imagebutton", { name: "box" }));
    expect(open).toHaveBeenCalledWith("https://x.example/product");
    open.mockRestore();
  });

  it("says its words as a link when it will not load", async () => {
    await render(<Markdown text={`![Blue truck](${TRUCK}?gone)`} />);
    await fireEvent(screen.getByTestId("md-picture-image"), "error", {
      nativeEvent: { error: "404" },
    });
    expect(screen.queryByTestId("md-picture")).toBeNull();
    expect(screen.getByRole("link", { name: "Blue truck" })).toBeTruthy();
  });

  it("lays pictures side by side out as square tiles, two to a row", async () => {
    await render(
      <Markdown
        text={
          "![a](https://x.example/a.png)\n![b](https://x.example/b.png)\n![c](https://x.example/c.png)"
        }
      />,
    );
    const tiles = screen.getAllByTestId("md-picture");
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) expect(tile).toHaveStyle({ aspectRatio: 1 });
    expect(screen.getByTestId("md-pictures")).toHaveStyle({ maxWidth: TILE_MAX });
  });
});

describe("the words a search found, marked in a message (ADR 0133)", () => {
  /** What is marked, in order. */
  const marked = () => screen.queryAllByTestId("mark").map((mark) => mark.props["children"]);

  it("marks each word the search looked for inside the run it is in, the rest left as said", async () => {
    await render(
      <Markdown text="The waterfall plunges into a misty gorge." marks={["misty", "water"]} />,
    );
    expect(marked()).toEqual(["waterfall", "misty"]);
    expect(screen.getByText(/The .* plunges into a .* gorge\./)).toBeTruthy();
  });

  it("keeps a bold or italic word's weight, and marks a mention's name", async () => {
    await render(
      <Markdown
        text="**Ficus auriculata**, the *elephant ear* fig, @figtree says"
        marks={["fig"]}
      />,
    );
    expect(marked()).toEqual(["fig", "figtree"]);
    // The bold run is still bold round its words: the mark is a run inside it, not in place of it.
    await render(<Markdown text="**elephant ear fig**" marks={["fig"]} />);
    const mark = screen.getByTestId("mark");
    expect(mark.parent?.parent?.props["style"]).toEqual(
      expect.objectContaining({ fontWeight: "700" }),
    );
  });

  it("leaves code and links as they are", async () => {
    await render(
      <Markdown
        text={"Run `fig build` or see [fig docs](https://x.example/fig).\n\n```\nfig\n```"}
        marks={["fig"]}
      />,
    );
    expect(marked()).toEqual([]);
  });

  it("finds a word whatever its case or accents, as the server did", async () => {
    await render(<Markdown text="Café au lait at the CAFE" marks={["cafe"]} />);
    expect(marked()).toEqual(["Café", "CAFE"]);
  });

  it("marks nothing with no words to mark", async () => {
    await render(<Markdown text="The waterfall" />);
    expect(marked()).toEqual([]);
    await render(<Markdown text="The waterfall" marks={[]} />);
    expect(marked()).toEqual([]);
  });
});

describe("headings, lists, quotes and tables (ADR 0184)", () => {
  // Garage door replacement, 15 October 2026: the room showed this as `##`, pipes and dashes.
  const GARAGE = [
    "## Why it’s plausible for your door",
    "",
    "| Your door/conditions | What the guidance says |",
    "|---|---|",
    "| **15-foot-wide door** | Wider doors have greater potential bowing. |",
    "| **Center sticks outward** | That direction is consistent with a hotter exterior skin. |",
  ].join("\n");

  it("draws a heading as one, and no #s", async () => {
    await render(<Markdown text={GARAGE} />);
    expect(screen.getByRole("header", { name: "Why it’s plausible for your door" })).toBeTruthy();
    expect(screen.queryByText(/##|\|/)).toBeNull();
  });

  it("draws two columns of a table to fit the bubble, every cell its words", async () => {
    await render(<Markdown text={GARAGE} />);
    expect(screen.getByTestId("md-table-fits")).toBeTruthy();
    for (const words of [
      "Your door/conditions",
      "What the guidance says",
      "15-foot-wide door",
      "That direction is consistent with a hotter exterior skin.",
    ]) {
      expect(screen.getByText(words)).toBeTruthy();
    }
    expect(screen.queryByText(/---/)).toBeNull();
  });

  it("scrolls a table too wide for the bubble sideways, inside it", async () => {
    // A 402-point iPhone; Jest's own window is a tablet's.
    const window = jest
      .spyOn(Dimensions, "get")
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    await render(
      <Markdown
        text={[
          "| Set | Age | Why it’s a good match | Price guide* |",
          "|---|---|---|---|",
          "| **Heavy-Duty Recovery Tow Truck with Crane — 60467** | 8+ | A working crane, stabilizing legs, towing lift, and winch. | Check current price |",
        ].join("\n")}
      />,
    );
    expect(screen.getByTestId("md-table-scrolls")).toBeTruthy();
    expect(screen.getByText("Check current price")).toBeTruthy();
    // ADR 0186: a dot per column says how much more there is.
    expect(screen.getByTestId("md-table-dots")).toBeTruthy();
    expect(screen.getAllByTestId("md-table-dot")).toHaveLength(4);
    window.mockRestore();
  });

  it("puts no dots over a table that fits", async () => {
    await render(<Markdown text={GARAGE} />);
    expect(screen.queryByTestId("md-table-dots")).toBeNull();
  });

  it("aligns a column as its line of dashes says", async () => {
    await render(<Markdown text={"| Item | Price |\n|---|--:|\n| Mixer | ~$40 |"} />);
    // The words are a run inside the cell's own text, which is what is aligned.
    expect(screen.getByText("~$40").parent).toHaveStyle({ textAlign: "right" });
    expect(screen.getByText("Mixer").parent).toHaveStyle({ textAlign: "left" });
  });

  it("hangs a list's bullets and numbers beside their items, numbered from where it starts", async () => {
    await render(
      <Markdown text={"3. Compare the door\n4. Ask for a callback\n\n- the header\n- the track"} />,
    );
    expect(screen.getByText("3.")).toBeTruthy();
    expect(screen.getByText("4.")).toBeTruthy();
    expect(screen.getAllByText("•")).toHaveLength(2);
    expect(screen.getByText("Ask for a callback")).toBeTruthy();
    expect(screen.queryByText(/^- /)).toBeNull();
  });

  it("sets a quotation in the quieter ink, without its >", async () => {
    await render(<Markdown text={"> All insulated panels will exhibit some thermal bowing."} />);
    const words = screen.getByText("All insulated panels will exhibit some thermal bowing.");
    expect(words.parent).toHaveStyle({ color: light.ink2 });
  });
});
