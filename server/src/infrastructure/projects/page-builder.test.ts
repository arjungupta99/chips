/**
 * A page of the room's project built into one document (ADR 0223): its stylesheets, scripts,
 * pictures and fonts folded in; modules that import each other bundled; an address, a path out of
 * the project and a missing file left as they are; the limit held; and scripts that don't build
 * said in words.
 */

import { describe, expect, it } from "vitest";
import { createPageBuilder, inProject } from "./page-builder.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function project(files: Record<string, string | Uint8Array>) {
  return async (path: string) => {
    const found = files[path];
    if (found === undefined) return undefined;
    return typeof found === "string" ? new TextEncoder().encode(found) : found;
  };
}

const builder = createPageBuilder();
const build = (
  files: Record<string, string | Uint8Array>,
  path = "index.html",
  maxBytes = 1_000_000,
) => builder.build({ path, read: project(files), maxBytes });

async function built(files: Record<string, string | Uint8Array>, path?: string): Promise<string> {
  const answer = await build(files, path);
  if (!answer.ok) throw new Error(answer.why);
  return answer.html;
}

describe("a path a page names", () => {
  it("is the naming file's own, or the project's top for one starting /, and nothing outside it", () => {
    expect(inProject("style.css", "index.html")).toBe("style.css");
    expect(inProject("./board.js", "src/game.js")).toBe("src/board.js");
    expect(inProject("../art/a.png?v=2#top", "src/game.css")).toBe("art/a.png");
    expect(inProject("/art/a.png", "src/deep/game.css")).toBe("art/a.png");
    expect(inProject("../../secret", "src/game.js")).toBeUndefined();
    expect(inProject("https://example.com/a.js", "index.html")).toBeUndefined();
    expect(inProject("//cdn.example.com/a.js", "index.html")).toBeUndefined();
    expect(inProject("data:image/png;base64,AA", "index.html")).toBeUndefined();
    expect(inProject("#board", "index.html")).toBeUndefined();
  });
});

describe("a page of the project", () => {
  it("folds in its stylesheet, its url()s and @imports, and its pictures as data", async () => {
    const html = await built({
      "index.html":
        '<!doctype html><html><head><link rel="stylesheet" href="style.css" media="screen"><link rel="icon" href="art/icon.png"></head><body><img src="art/cat.png" srcset="art/cat.png 1x, art/cat2.png 2x"><div style="background: url(art/cat.png)"></div></body></html>',
      "style.css": '@import "theme.css";\nbody { background: url("art/bg.png"); }',
      "theme.css": "h1 { color: red; }",
      "art/icon.png": PNG,
      "art/cat.png": PNG,
      "art/cat2.png": PNG,
      "art/bg.png": PNG,
    });
    const data = "data:image/png;base64,iVBORw==";
    expect(html).toContain('<style media="screen">h1 { color: red; }');
    expect(html).toContain(`body { background: url("${data}"); }`);
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).toContain(`<link rel="icon" href="${data}">`);
    expect(html).toContain(`<img src="${data}" srcset="${data} 1x, ${data} 2x">`);
    expect(html).toContain(`style="background: url(&quot;${data}&quot;)"`);
  });

  it("puts a script in, and bundles modules that import each other into one", async () => {
    const html = await built({
      "index.html":
        '<html><body><div id="board"></div><script src="classic.js"></script><script type="module" src="src/game.js"></script></body></html>',
      "classic.js": "window.ready = true;",
      "src/game.js":
        'import { size } from "./board.js";\nimport "../theme.css";\ndocument.getElementById("board").textContent = String(size);',
      "src/board.js": "export const size = 9;",
      "theme.css": "#board { color: blue; }",
    });
    expect(html).toContain("<script>window.ready = true;</script>");
    expect(html).toMatch(
      /<script type="module">[\s\S]*var size = 9;[\s\S]*String\(size\)[\s\S]*<\/script>/,
    );
    expect(html).not.toContain('src="src/game.js"');
    // The CSS a module imports comes into the head.
    expect(html).toMatch(/<head>[\s\S]*#board \{[\s\S]*color: blue;[\s\S]*<\/head>/);
  });

  it("bundles an inline module that imports the project's, and leaves a package or an address", async () => {
    const html = await built({
      "index.html":
        '<script type="module">import { size } from "./board.js"; import confetti from "canvas-confetti"; import x from "https://cdn.example.com/x.js"; console.log(size, confetti, x);</script>',
      "board.js": "export const size = 4;",
    });
    expect(html).toContain("var size = 4;");
    expect(html).toContain('from "canvas-confetti"');
    expect(html).toContain('from "https://cdn.example.com/x.js"');
  });

  it("leaves an address, a path out of the project and a missing file as they are", async () => {
    const html = await built({
      "index.html":
        '<link rel="stylesheet" href="https://fonts.example.com/a.css"><script src="../outside.js"></script><img src="missing.png"><script src="gone.js"></script>',
    });
    expect(html).toContain('href="https://fonts.example.com/a.css"');
    expect(html).toContain('src="../outside.js"');
    expect(html).toContain('src="missing.png"');
    expect(html).toContain('src="gone.js"');
  });

  it("makes a link to another file of the project a chips-file: link, which opens in Chips (ADR 0227)", async () => {
    const html = await built(
      {
        ".chips/index.html":
          '<a href="../reports/overview.html" target="_blank">Overview</a><a href="../reports/supply%20chain.pdf">Risks</a><a href="#top">Top</a><a href="https://example.com">Out</a><a href="index.html">Here</a><a href="../../up.html">Up</a>',
      },
      ".chips/index.html",
    );
    expect(html).toContain(
      '<a href="chips-file:reports%2Foverview.html" data-chips-file="reports/overview.html">Overview</a>',
    );
    expect(html).toContain('data-chips-file="reports/supply chain.pdf"');
    expect(html).toContain('href="#top"');
    expect(html).toContain('<a href="index.html">Here</a>');
    expect(html).toContain('href="../../up.html"');
    // In a frame, the window is told which file.
    expect(html).toContain("window.parent.postMessage({chipsFile:");
    // A page with no such links has no script added.
    expect(await built({ "index.html": '<a href="#x">x</a>' })).not.toContain("chipsFile");
  });

  it("makes a link to an address ask for a window, the one way out of a frame (ADR 0227)", async () => {
    const html = await built({
      "index.html":
        '<a href="http://localhost:4173/home.html">App</a><a href="https://example.com" target="_self">Out</a><a href="mailto:a@example.com">Mail</a><area href="https://example.com/map"><a href="#top">Top</a>',
    });
    expect(html).toContain('<a href="http://localhost:4173/home.html" target="_blank">App</a>');
    expect(html).toContain('<a href="https://example.com" target="_blank">Out</a>');
    expect(html).toContain('<a href="mailto:a@example.com" target="_blank">Mail</a>');
    expect(html).toContain('<area href="https://example.com/map" target="_blank">');
    expect(html).toContain('<a href="#top">Top</a>');
    // Going out needs no script of the builder's.
    expect(html).not.toContain("chipsFile");
  });

  it("keeps a script's words from closing the element they stand in", async () => {
    const html = await built({
      "index.html": '<script src="a.js"></script>',
      "a.js": 'document.write("</script><b>hi</b>");',
    });
    expect(html).toContain('document.write("<\\/script><b>hi</b>");');
  });

  it("is built from a page in a folder, its paths its own", async () => {
    const html = await built(
      {
        "game/index.html": '<link rel="stylesheet" href="game.css">',
        "game/game.css": "p { margin: 0; }",
      },
      "game/index.html",
    );
    expect(html).toContain("<style>p { margin: 0; }</style>");
  });

  it("is refused in words: no such page, too big, and scripts that don't build", async () => {
    expect(await build({})).toEqual({
      ok: false,
      kind: "not_found",
      why: "No such page in the space's project.",
    });
    const big = await build(
      { "index.html": '<img src="a.png">', "a.png": new Uint8Array(2000) },
      "index.html",
      1000,
    );
    expect(big).toMatchObject({ ok: false, kind: "too_big" });
    const broken = await build({
      "index.html": '<script type="module" src="a.js"></script>',
      "a.js": "export const = ;",
    });
    expect(broken).toMatchObject({ ok: false, kind: "invalid" });
    expect(broken.ok ? "" : broken.why).toMatch(/^The page's scripts don't build: a\.js:1: /);
  });

  it("opens a page with no modules where the server has no bundler, and says so for one with them", async () => {
    const without = createPageBuilder(() => Promise.reject(new Error("no esbuild")));
    const plain = await without.build({
      path: "index.html",
      read: project({ "index.html": '<script src="a.js"></script>', "a.js": "go();" }),
      maxBytes: 10_000,
    });
    expect(plain).toMatchObject({ ok: true });
    const modules = await without.build({
      path: "index.html",
      read: project({
        "index.html": '<script type="module" src="a.js"></script>',
        "a.js": "go();",
      }),
      maxBytes: 10_000,
    });
    expect(modules).toEqual({
      ok: false,
      kind: "unavailable",
      why: "This server can't put the page's modules together: esbuild isn't installed with it.",
    });
  });
});
