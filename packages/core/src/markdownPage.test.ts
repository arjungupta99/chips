import { describe, expect, it } from "vitest";
import { isMarkdown, isPage } from "./attachments.js";
import {
  HTML_POLICY,
  markdownPage,
  PAGE_POLICY,
  type PageInk,
  withHtmlPolicy,
} from "./markdownPage.js";

const light: PageInk = {
  scheme: "light",
  bg: "#fbfbf8",
  ink: "#14161b",
  ink2: "#454851",
  line: "#e4e4dc",
  line2: "#c4c4ba",
  surface2: "#f2f2ec",
  blueInk: "#1048ce",
  size: 17,
};

/** The document's body, between the tags the page wraps it in. */
const body = (source: string) => /<body>\n([\s\S]*)<\/body>/.exec(markdownPage(source, light))?.[1];

describe("which files are Markdown (ADR 0123)", () => {
  it("is the type the server sniffs from a .md or .markdown file, and it opens as a page", () => {
    expect(isMarkdown("text/markdown")).toBe(true);
    expect(isMarkdown("Text/Markdown; charset=utf-8")).toBe(true);
    expect(isMarkdown("text/plain")).toBe(false);
    expect(isMarkdown("text/html")).toBe(false);
    expect(isPage("text/markdown")).toBe(true);
  });
});

describe("a Markdown file as a page", () => {
  it("draws the walking tour's headings, lists, rules and sourced links", () => {
    const html = body(
      [
        "# Mission murals: an eight-stop walking tour",
        "",
        "**Final tour page.** Allow *2½–3 hours*.",
        "",
        "---",
        "",
        "## 1. MaestraPeace",
        "",
        "- **Address:** 3543 18th Street",
        "- [NoeHill](https://noehill.com/sf/landmarks/sf178.asp)",
        "",
        "1. first",
        "2. second",
        "",
        "> a quotation",
        "",
        "Use `pnpm phone`.",
      ].join("\n"),
    );
    expect(html).toContain("<h1>Mission murals: an eight-stop walking tour</h1>");
    expect(html).toContain("<h2>1. MaestraPeace</h2>");
    expect(html).toContain("<strong>Final tour page.</strong>");
    expect(html).toContain("<em>2½–3 hours</em>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<li><strong>Address:</strong> 3543 18th Street</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>pnpm phone</code>");
  });

  it("opens a link to the web or to mail outside the page, and leaves the rest as written", () => {
    const html = body("[a](https://example.com) [b](mailto:j@example.com) [c](#stop-3)");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">a</a>',
    );
    expect(html).toContain(
      '<a href="mailto:j@example.com" target="_blank" rel="noopener noreferrer">b</a>',
    );
    expect(html).toContain('<a href="#stop-3">c</a>');
  });

  it("makes a bare web address a link", () => {
    expect(body("See https://www.foundsf.org for more.")).toContain(
      '<a href="https://www.foundsf.org" target="_blank" rel="noopener noreferrer">',
    );
  });

  it("draws a table in a box of its own that scrolls sideways", () => {
    const html = body("| Stop | Café |\n|---|---|\n| 1 | Linea |");
    expect(html).toContain('<div class="wide"><table>');
    expect(html).toContain("<th>Café</th>");
    expect(html).toContain("<td>Linea</td>");
    expect(html).toContain("</table></div>");
  });

  it("draws a picture from the web", () => {
    expect(body("![Carnaval](https://example.com/carnaval.jpg)")).toContain(
      '<img src="https://example.com/carnaval.jpg" alt="Carnaval">',
    );
  });

  it("never carries the author's HTML: a script, a frame or a handler is words", () => {
    const html = body(
      '<script>alert(1)</script>\n\n<iframe src="chips://pair?pair=x"></iframe>\n\n<img src=x onerror="alert(1)">',
    );
    expect(html).not.toMatch(/<script|<iframe|<img/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("never makes a live link of javascript:, vbscript:, file: or a data: page", () => {
    const html = body(
      "[a](javascript:alert(1)) [b](vbscript:msgbox) [c](file:///etc/passwd) [d](data:text/html,<b>x</b>) ![e](data:text/html,x)",
    );
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
  });

  it("makes no link at all of chips:, ftp:, a relative path or a protocol-relative address (SEC-31)", () => {
    const html = body(
      "[a](chips://pair?pair=ABC-DEF) [b](ftp://files.example/x) [c](stop-3.md) [d](//evil.example/x) ![e](chips://spaces/x)",
    );
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).toContain("chips://pair?pair=ABC-DEF");
  });

  it("allows no script and fetches nothing but pictures", () => {
    const page = markdownPage("words", light);
    expect(page).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'">`,
    );
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it("draws a long link reference that never closes in one pass (SEC-44)", () => {
    // markdown-it 15.0.2 read a reference's label or title that never closes again from every
    // line (GHSA-gfr2-rv44-r23c): these 200 KB took 950 and 850 ms here, and four times as long at
    // twice the size, on whoever opened the file. 15.0.3 reads each in about 80 ms. A clock bound
    // fails on a slow machine (CI with coverage took 970 ms), so this asks how the time grows:
    // twice the lines take about twice as long now, and took four times as long then.
    const drawn = (source: string) => {
      markdownPage(source, light);
      let fastest = Infinity;
      for (let i = 0; i < 2; i += 1) {
        const start = performance.now();
        expect(markdownPage(source, light)).toContain("<body>");
        fastest = Math.min(fastest, performance.now() - start);
      }
      return fastest;
    };
    for (const open of [
      (lines: number) => '[a]: b "' + "c\n".repeat(lines),
      (lines: number) => `[${"a\n".repeat(lines)}`,
    ]) {
      expect(drawn(open(100_000)) / drawn(open(50_000))).toBeLessThan(3);
    }
    // Twelve drawings of up to 200 KB: CI with coverage needs more than the usual 5 seconds.
  }, 30_000);

  it("is drawn in the client's own colours and size, light or dark", () => {
    const page = markdownPage("words", light);
    expect(page).toContain("color-scheme: light;");
    expect(page).toContain("background: #fbfbf8;");
    expect(page).toContain("color: #14161b;");
    expect(page).toContain("font: 17px/1.5");
    expect(page).toContain("a { color: #1048ce;");
    const dark = markdownPage("words", {
      ...light,
      scheme: "dark",
      bg: "#0f1013",
      ink: "#f1f2ed",
      size: 15,
    });
    expect(dark).toContain("color-scheme: dark;");
    expect(dark).toContain("background: #0f1013;");
    expect(dark).toContain("font: 15px/1.5");
  });
});

describe("somebody else's HTML under a policy of its own (ADR 0059's addendum, SEC-7)", () => {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${HTML_POLICY}">`;
  const directives = new Map(
    HTML_POLICY.split(";").map((directive) => {
      const [name = "", ...sources] = directive.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );

  it("runs the page's own script and lets nothing leave", () => {
    expect(HTML_POLICY).toBe(
      "default-src 'none'; img-src data: blob:; font-src data:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    );
    // A script written in the page, an inline handler among them, and none by address.
    expect(directives.get("script-src")).toEqual(["'unsafe-inline'"]);
    // Nothing fetched, sent, framed or connected: those fall back to `default-src`.
    expect(directives.get("default-src")).toEqual(["'none'"]);
    for (const fetches of ["connect-src", "frame-src", "child-src", "worker-src", "object-src"]) {
      expect(directives.has(fetches)).toBe(false);
    }
    // A picture, a font, a sound or a clip only from the page itself (a `data:` address, or a
    // `blob:` its script made), so none can be loaded from the network and timed.
    expect(directives.get("img-src")).toEqual(["data:", "blob:"]);
    expect(directives.get("font-src")).toEqual(["data:"]);
    expect(directives.get("media-src")).toEqual(["data:", "blob:"]);
    expect(HTML_POLICY).not.toMatch(/https?:|'self'|\*|'unsafe-eval'/);
  });

  it("leaves a Markdown page's policy as it was, with no script", () => {
    expect(PAGE_POLICY).toBe(
      "default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'",
    );
    const page = markdownPage("words", light);
    expect(page).toContain(`<meta http-equiv="Content-Security-Policy" content="${PAGE_POLICY}">`);
    expect(page).not.toContain(HTML_POLICY);
  });

  it("keeps everything of the author's", () => {
    const mock =
      "<!doctype html>\n<html><head><title>Bronze</title></head><body><p>The mock</p></body></html>";
    const policed = withHtmlPolicy(mock);
    expect(policed).toBe(
      `<!doctype html>${meta}\n<html><head><title>Bronze</title></head><body><p>The mock</p></body></html>`,
    );
    expect(policed.replace(meta, "")).toBe(mock);
  });

  it("stands before anything the author wrote, so a script ahead of the head runs under it too", () => {
    const sly =
      "<script>fetch('http://192.168.1.1')</script><html><head></head><body></body></html>";
    const policed = withHtmlPolicy(sly);
    expect(policed.indexOf(meta)).toBe(0);
    expect(policed.indexOf(meta)).toBeLessThan(policed.indexOf("<script"));
    // After the doctype alone, whatever its case or the space around it, so it still counts.
    expect(withHtmlPolicy("  <!DOCTYPE html>\n<p>hi</p>")).toBe(
      `  <!DOCTYPE html>${meta}\n<p>hi</p>`,
    );
    // A fragment with no document around it, and an empty file, get it first all the same.
    expect(withHtmlPolicy("<p>hi</p>")).toBe(`${meta}<p>hi</p>`);
    expect(withHtmlPolicy("")).toBe(meta);
  });
});
