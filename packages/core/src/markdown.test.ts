import { handlesIn } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  holdsTable,
  type Inline,
  parseInline,
  parseMarkdown,
  plainWords,
  safeHref,
} from "./markdown.js";

describe("blocks", () => {
  it("splits paragraphs on a blank line", () => {
    const blocks = parseMarkdown("first\n\nsecond");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
  });

  it("keeps fenced code literal", () => {
    const blocks = parseMarkdown("before\n\n```\nrm -rf /\n**not bold**\n```\n\nafter");
    expect(blocks[1]).toEqual({ type: "code", text: "rm -rf /\n**not bold**" });
  });

  it("keeps a paragraph's own line breaks, and runs an unclosed fence to the end", () => {
    expect(parseMarkdown("one\ntwo")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "one\ntwo" }] },
    ]);
    expect(parseMarkdown("```ts\nconst a = 1;\n\nconst b = 2;")).toEqual([
      { type: "code", text: "const a = 1;\n\nconst b = 2;" },
    ]);
  });

  it("reads a heading by its #s, and a # with no space as words", () => {
    expect(parseMarkdown("## Why it’s plausible for your door\n\n#1 pick")).toEqual([
      {
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "Why it’s plausible for your door" }],
      },
      { type: "paragraph", children: [{ type: "text", text: "#1 pick" }] },
    ]);
    expect(parseMarkdown("#")).toEqual([]);
  });

  it("reads a list, ordered from where it starts, with a list inside an item", () => {
    expect(
      parseMarkdown("3. **Ask** for a callback\n4. Check:\n   - the header\n   - the track"),
    ).toEqual([
      {
        type: "list",
        ordered: true,
        start: 3,
        items: [
          [
            {
              type: "paragraph",
              children: [
                { type: "strong", children: [{ type: "text", text: "Ask" }] },
                { type: "text", text: " for a callback" },
              ],
            },
          ],
          [
            { type: "paragraph", children: [{ type: "text", text: "Check:" }] },
            {
              type: "list",
              ordered: false,
              start: 1,
              items: [
                [{ type: "paragraph", children: [{ type: "text", text: "the header" }] }],
                [{ type: "paragraph", children: [{ type: "text", text: "the track" }] }],
              ],
            },
          ],
        ],
      },
    ]);
  });

  it("reads a quote, and a rule between paragraphs", () => {
    expect(
      parseMarkdown("> “All insulated panels will exhibit some thermal bowing”\n\n---\n\nNext"),
    ).toEqual([
      {
        type: "quote",
        blocks: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "“All insulated panels will exhibit some thermal bowing”" },
            ],
          },
        ],
      },
      { type: "rule" },
      { type: "paragraph", children: [{ type: "text", text: "Next" }] },
    ]);
  });

  it("reads a line of dashes under words as a rule, not as a heading", () => {
    expect(parseMarkdown("Done\n---").map((block) => block.type)).toEqual(["paragraph", "rule"]);
  });

  it("keeps an indented line, an HTML tag and a link reference as the words they are", () => {
    for (const text of ["    four spaces in", "<div>hi</div>", "[docs]: https://x.example/docs"]) {
      expect(parseMarkdown(text)).toEqual([
        { type: "paragraph", children: [{ type: "text", text: text.trim() }] },
      ]);
    }
  });
});

describe("tables", () => {
  // Garage door replacement, 15 October 2026: the room showed this as pipes and dashes.
  const garage = [
    "| Your door/conditions | What the guidance says |",
    "|---|---|",
    "| **15-foot-wide door** | Wider doors have greater potential bowing. |",
    "| **Center sticks outward** | That direction is consistent with a hotter exterior skin. |",
  ].join("\n");

  it("reads the heading row and the rows under it, each cell's words read as a paragraph's", () => {
    expect(parseMarkdown(garage)).toEqual([
      {
        type: "table",
        align: [undefined, undefined],
        head: [
          [{ type: "text", text: "Your door/conditions" }],
          [{ type: "text", text: "What the guidance says" }],
        ],
        rows: [
          [
            [{ type: "strong", children: [{ type: "text", text: "15-foot-wide door" }] }],
            [{ type: "text", text: "Wider doors have greater potential bowing." }],
          ],
          [
            [{ type: "strong", children: [{ type: "text", text: "Center sticks outward" }] }],
            [{ type: "text", text: "That direction is consistent with a hotter exterior skin." }],
          ],
        ],
      },
    ]);
  });

  it("ends the words before it, and runs to a blank line, as GitHub's does", () => {
    const blocks = parseMarkdown(
      `## Why it’s plausible\nHere is how:\n${garage}\n\n**The useful clue** is the sun.`,
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "table",
      "paragraph",
    ]);
    // A line straight after the last row is one more row, with its words in the first cell.
    const after = parseMarkdown(`Here is how:\n${garage}\nmore words`);
    expect(after.map((block) => block.type)).toEqual(["paragraph", "table"]);
    const table = after[1];
    expect(table?.type === "table" && table.rows.at(-1)?.[0]).toEqual([
      { type: "text", text: "more words" },
    ]);
  });

  it("takes each column's alignment, makes every row as wide as the heading, and keeps an escaped pipe", () => {
    const [table] = parseMarkdown(
      "Set | Age | Price\n:-- | :-: | --:\nMixer | 7+\nA \\| B | 8+ | ~$90 | extra",
    );
    expect(table?.type === "table" && table.align).toEqual(["left", "center", "right"]);
    expect(table?.type === "table" && table.rows.map((row) => row.length)).toEqual([3, 3]);
    expect(table?.type === "table" && table.rows[1]?.[0]).toEqual([
      { type: "text", text: "A | B" },
    ]);
  });

  it("links a cell's picture, and keeps a cell's unsafe link as its words", () => {
    const [table] = parseMarkdown(
      "| Set | Look |\n|---|---|\n| [Mixer](javascript:alert(1)) | ![box](https://x.example/box.png) |",
    );
    expect(table?.type === "table" && table.rows[0]).toEqual([
      [{ type: "text", text: "Mixer" }],
      [{ type: "link", href: "https://x.example/box.png", text: "box" }],
    ]);
  });

  it("says whether a message holds one, in a list or a quotation too", () => {
    expect(holdsTable(garage)).toBe(true);
    expect(holdsTable(`- the options:\n\n  ${garage.replaceAll("\n", "\n  ")}`)).toBe(true);
    expect(holdsTable(`> ${garage.replaceAll("\n", "\n> ")}`)).toBe(true);
    expect(holdsTable("a | b\n\n---\n\n```\n| a |\n|---|\n```")).toBe(false);
    expect(holdsTable("Plain words.")).toBe(false);
  });

  // The OpenCode room, 17 October 2026: big-pickle wrote its table with no line of dashes, and
  // the rows drew as pipes.
  const dashless = [
    "| Model | Scaffold | Resolve rate |",
    "| Opus 5 | Claude Code xHigh | 63.2 |",
    "| GLM 5.2 | Mini-SWE-Agent | 48.1 |",
  ].join("\n");
  const words = (cell: readonly { type: string; text?: string }[]) =>
    cell.map((run) => run.text ?? "").join("");

  it("reads rows written without a line of dashes as a table, the first row its heading", () => {
    const blocks = parseMarkdown(`Table 1: SWE Atlas.\n\n${dashless}\n\nAnd a note.`);
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "table", "paragraph"]);
    const table = blocks[1];
    expect(table?.type === "table" && table.head.map(words)).toEqual([
      "Model",
      "Scaffold",
      "Resolve rate",
    ]);
    expect(table?.type === "table" && table.rows.map((row) => row.map(words))).toEqual([
      ["Opus 5", "Claude Code xHigh", "63.2"],
      ["GLM 5.2", "Mini-SWE-Agent", "48.1"],
    ]);
    expect(table?.type === "table" && table.align).toEqual([undefined, undefined, undefined]);
    expect(holdsTable(dashless)).toBe(true);
  });

  it("leaves rows of differing widths, a row alone, one column and a code block's rows as words", () => {
    const kinds = (source: string) => parseMarkdown(source).map((block) => block.type);
    expect(kinds("| a | b |\n| c |")).toEqual(["paragraph"]);
    expect(kinds("| a | b |")).toEqual(["paragraph"]);
    expect(kinds("| a |\n| b |")).toEqual(["paragraph"]);
    expect(parseMarkdown("```\n| a | b |\n| c | d |\n```")).toEqual([
      { type: "code", text: "| a | b |\n| c | d |" },
    ]);
    expect(holdsTable("| a | b |\n| c |")).toBe(false);
  });
});

describe("pictures", () => {
  const src = "https://www.lego.com/cdn/cs/set/assets/blt085c6e38ce337804/42203_boxprod_v39.png";

  it("draws a picture as a block of its own, as J sent one to Shopping", () => {
    // 23 September 2026: this came out as a `!` and a link, and Arjun saw no picture.
    const blocks = parseMarkdown(
      "Here’s the truck:\n\n![Blue LEGO Technic Tipping Dump Truck](" +
        src +
        ")\n\nIt’s a blue, six-wheeled truck.",
    );
    expect(blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Here’s the truck:" }] },
      {
        type: "pictures",
        pictures: [{ src, alt: "Blue LEGO Technic Tipping Dump Truck", href: src }],
      },
      { type: "paragraph", children: [{ type: "text", text: "It’s a blue, six-wheeled truck." }] },
    ]);
  });

  it("keeps a picture's words, not the picture, when its host is this machine or the reader's own network (SEC-30)", () => {
    const nearby = [
      "http://192.168.1.1/cam.jpg",
      "http://10.0.0.5:8080/x.png",
      "http://[::1]/x.png",
      "http://[fe80::1]:4431/x.png",
      "http://localhost:4431/x.png",
      "http://LOCALHOST/x.png",
      "http://chips.localhost/x.png",
      "http://printer.local/x.png",
      "http://2130706433/x.png",
      "http://127.1/x.png",
      "http://0x7f000001/x.png",
    ];
    for (const each of nearby) {
      expect(parseMarkdown(`![cam](${each})`), each).toEqual([
        { type: "paragraph", children: [{ type: "text", text: "cam" }] },
      ]);
    }
    expect(parseMarkdown("![ok](https://example.com/x.png)")).toEqual([
      {
        type: "pictures",
        pictures: [
          { src: "https://example.com/x.png", alt: "ok", href: "https://example.com/x.png" },
        ],
      },
    ]);
  });

  it("cuts a paragraph around a picture written among its words", () => {
    expect(parseMarkdown(`Look ![it](${src}) there`)).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Look" }] },
      { type: "pictures", pictures: [{ src, alt: "it", href: src }] },
      { type: "paragraph", children: [{ type: "text", text: "there" }] },
    ]);
  });

  it("makes one block of pictures side by side, whatever white space is between them", () => {
    const blocks = parseMarkdown(
      "![a](https://x.example/a.png)![b](https://x.example/b.png)\n![c](https://x.example/c.png)\n\n![d](https://x.example/d.png)",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type === "pictures" && blocks[0].pictures.map((p) => p.alt)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("follows a linked picture to its link, and keeps a title out of the address", () => {
    expect(
      parseMarkdown('[![box](https://x.example/box.png "The box")](https://x.example/product)'),
    ).toEqual([
      {
        type: "pictures",
        pictures: [
          { src: "https://x.example/box.png", alt: "box", href: "https://x.example/product" },
        ],
      },
    ]);
  });

  it("keeps an address's own parentheses, and takes a picture with no words", () => {
    const wiki = "https://en.wikipedia.org/wiki/File:Lego_(toy).png";
    expect(parseMarkdown(`![](${wiki})`)).toEqual([
      { type: "pictures", pictures: [{ src: wiki, alt: "", href: wiki }] },
    ]);
  });

  it("draws nothing from an address that is not absolute http, leaving its words", () => {
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "/v1/files/1"]) {
      expect(parseMarkdown(`![shh](${bad})`)).toEqual([
        { type: "paragraph", children: [{ type: "text", text: "shh" }] },
      ]);
    }
  });

  it("reads a picture inside bold, or asked for inline, as a link to itself", () => {
    expect(parseMarkdown(`**![it](${src})**`)).toEqual([
      {
        type: "paragraph",
        children: [{ type: "strong", children: [{ type: "link", href: src, text: "it" }] }],
      },
    ]);
    expect(parseInline(`![](${src})`)).toEqual([{ type: "link", href: src, text: "Image" }]);
  });

  it("leaves a picture in a code span as the code it is", () => {
    expect(parseMarkdown(`\`![it](${src})\``)).toEqual([
      { type: "paragraph", children: [{ type: "code", text: `![it](${src})` }] },
    ]);
  });
});

describe("inline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("**bold** and *soft* and `mono`")).toEqual([
      { type: "strong", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " and " },
      { type: "em", children: [{ type: "text", text: "soft" }] },
      { type: "text", text: " and " },
      { type: "code", text: "mono" },
    ]);
  });

  it("reads underscores as emphasis, the way Jacobian writes a title", () => {
    expect(parseInline("try _Robin Hood_ (1973) next")).toEqual([
      { type: "text", text: "try " },
      { type: "em", children: [{ type: "text", text: "Robin Hood" }] },
      { type: "text", text: " (1973) next" },
    ]);
    expect(parseInline("**_Robin Hood_ (1973)**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "em", children: [{ type: "text", text: "Robin Hood" }] },
          { type: "text", text: " (1973)" },
        ],
      },
    ]);
    expect(parseInline("__loud__ and _soft_")).toEqual([
      { type: "strong", children: [{ type: "text", text: "loud" }] },
      { type: "text", text: " and " },
      { type: "em", children: [{ type: "text", text: "soft" }] },
    ]);
  });

  it("leaves an identifier's underscores alone", () => {
    for (const plain of [
      "snake_case_name",
      "file_name.ts",
      "_private",
      "2_000 and 3_000",
      "a _ b",
    ]) {
      expect(parseInline(plain)).toEqual([{ type: "text", text: plain }]);
    }
    // A word's underscore beside a real one: only the pair that stands apart is emphasis.
    expect(parseInline("call_me _now_")).toEqual([
      { type: "text", text: "call_me " },
      { type: "em", children: [{ type: "text", text: "now" }] },
    ]);
  });

  it("keeps a code span's content literal", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ type: "code", text: "**not bold**" }]);
  });

  it("reads a link, and keeps its target http or relative", () => {
    expect(parseInline("see [the PO](https://x.example/po)")).toContainEqual({
      type: "link",
      href: "https://x.example/po",
      text: "the PO",
    });
  });

  it("refuses a dangerous link target, showing its text instead", () => {
    const inlines = parseInline("[click](javascript:alert(1))");
    expect(inlines).toEqual([{ type: "text", text: "click" }]);
  });

  it("reads a mention", () => {
    const inlines = parseInline("thanks @scout and @ledger");
    const mentions = inlines.filter(
      (i): i is Extract<Inline, { type: "mention" }> => i.type === "mention",
    );
    expect(mentions.map((m) => m.handle)).toEqual(["scout", "ledger"]);
  });

  it("does not treat an email as a mention", () => {
    // The @ in an address is preceded by a word character, not a boundary.
    const inlines = parseInline("mail dana@northwind.com");
    expect(inlines.some((i) => i.type === "mention")).toBe(false);
  });

  it("draws only mentions the server hears, inside emphasis too (AW-20)", () => {
    // Every mention token the blocks hold, however deep in emphasis or lists.
    const drawn = (text: string): string[] =>
      [...JSON.stringify(parseMarkdown(text)).matchAll(/"type":"mention","handle":"([^"]+)"/g)].map(
        (match) => (match[1] as string).toLowerCase(),
      );
    const texts = [
      "1. **@OpenClaw3:** find the renderings",
      "*@Scout* then _@Ledger_ then __@arjun__.",
      '- (@Scout) and "@Ledger"',
      "> **Over to @Scout**",
    ];
    for (const text of texts) {
      expect(drawn(text).length).toBeGreaterThan(0);
      expect(handlesIn(text)).toEqual(expect.arrayContaining(drawn(text)));
    }
  });

  it("never emits html; angle brackets stay text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("safeHref", () => {
  it("passes http and relative, refuses the rest", () => {
    expect(safeHref("https://x.example")).toBe("https://x.example");
    expect(safeHref("/v1/attachments/1")).toBe("/v1/attachments/1");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("//evil.example")).toBeUndefined();
    // A backslash is a slash to the URL parser: this resolves to http://evil.example/login
    // (phase-1-interim-review finding 6).
    expect(safeHref("/\\evil.example/login")).toBeUndefined();
    expect(safeHref("/\\\\evil.example")).toBeUndefined();
    expect(safeHref("http:evil.example")).toBeUndefined();
    expect(safeHref("foo/bar")).toBeUndefined();
    expect(safeHref("not a url at all ://")).toBeUndefined();
  });
});

describe("a message as one line of plain words", () => {
  it("says what the marks were around, not the marks", () => {
    expect(plainWords("The stop is **2421 Golden Hill Rd**, Paso Robles.")).toBe(
      "The stop is 2421 Golden Hill Rd, Paso Robles.",
    );
    expect(plainWords("that was *fast*")).toBe("that was fast");
  });

  it("keeps a link's words and drops its target", () => {
    expect(plainWords("see [the tickets](https://example.com/t)")).toBe("see the tickets");
  });

  it("keeps an @mention as one", () => {
    expect(plainWords("@arjun what do you think")).toBe("@arjun what do you think");
  });

  it("puts a paragraph and a fenced block on one line", () => {
    expect(plainWords("Ran it:\n\n```\npnpm check\n```\n\nGreen.")).toBe(
      "Ran it: pnpm check Green.",
    );
  });

  it("says a picture by its words, and Image when it has none", () => {
    expect(plainWords("Here:\n\n![The blue truck](https://x.example/t.png)\n\nNice.")).toBe(
      "Here: The blue truck Nice.",
    );
    expect(plainWords("![](https://x.example/t.png)")).toBe("Image");
  });

  it("says a heading, a list, a quote and a table by their words", () => {
    expect(
      plainWords(
        "## Plan\n\n- one\n- **two**\n\n> said\n\n| Set | Age |\n|---|---|\n| Mixer | 7+ |",
      ),
    ).toBe("Plan one two said Set Age Mixer 7+");
  });

  it("says nothing for nothing", () => {
    expect(plainWords("   ")).toBe("");
  });
});

describe("a hostile message is read in one pass (SEC-3)", () => {
  /** The worst of what a 64 KB message may hold, as the review's probe tried them. */
  const hostile = {
    "[ × 20,000": "[".repeat(20_000),
    "@ab × 5,000": "@ab ".repeat(5000),
    "a** × 5,000": "a**".repeat(5000),
    "![ × 10,000": "![".repeat(10_000),
    "[a]( × 5,000": "[a](".repeat(5000),
    "_a × 10,000": "_a ".repeat(10_000),
    "`a × 10,000": "`a ".repeat(10_000),
    // A link reference whose title or label never closes (SEC-44, markdown-it's block rules).
    '[a]: b " then c × 15,000 lines': `[a]: b "${"c\n".repeat(15_000)}`,
    "[ then a × 15,000 lines": `[${"a\n".repeat(15_000)}`,
  };

  /** How long one read takes, the second of two so the engine is warm. */
  function millis(read: () => unknown): number {
    read();
    const start = performance.now();
    read();
    return performance.now() - start;
  }

  it("parses each in well under a hundred milliseconds, blocks and one line of words alike", () => {
    // Before: 20,000 of `[` took 495 ms and 5,000 mentions a quarter of a second, on every draw,
    // for everybody in the room; the protocol allows three times as much. Now each is read
    // once, left to right, and a pattern with nothing more to find is not asked again.
    for (const [name, text] of Object.entries(hostile)) {
      expect(
        millis(() => parseMarkdown(text)),
        name,
      ).toBeLessThan(100);
      expect(
        millis(() => plainWords(text)),
        name,
      ).toBeLessThan(100);
    }
  });

  it("reads the same tokens it did, one pass or many", () => {
    expect(parseInline("@ab @ab")).toEqual([
      { type: "mention", handle: "ab" },
      { type: "text", text: " " },
      { type: "mention", handle: "ab" },
    ]);
    expect(parseInline("a**a**a**")).toEqual([
      { type: "text", text: "a" },
      { type: "strong", children: [{ type: "text", text: "a" }] },
      { type: "text", text: "a**" },
    ]);
    // A find is kept until the cursor passes it: the italics after the bold are still read, and
    // a `_` the bold's closing `**` stands before still opens them.
    expect(parseInline("**bold**_soft_ and `x`_y_")).toEqual([
      { type: "strong", children: [{ type: "text", text: "bold" }] },
      { type: "em", children: [{ type: "text", text: "soft" }] },
      { type: "text", text: " and " },
      { type: "code", text: "x" },
      { type: "em", children: [{ type: "text", text: "y" }] },
    ]);
    // A link's words hold no bracket, and its address's parentheses come in pairs.
    expect(parseInline("[w](https://en.wikipedia.org/wiki/Foo_(bar)) then")).toEqual([
      { type: "link", href: "https://en.wikipedia.org/wiki/Foo_(bar)", text: "w" },
      { type: "text", text: " then" },
    ]);
    expect(parseInline("[[x](https://a.example)")).toEqual([
      { type: "text", text: "[" },
      { type: "link", href: "https://a.example", text: "x" },
    ]);
  });
});
