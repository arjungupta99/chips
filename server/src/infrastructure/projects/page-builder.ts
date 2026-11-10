/**
 * A page of the room's project built into one document (ADR 0223), so it runs where a page runs:
 * under `HTML_POLICY`, with its own inline script and styles, pictures and fonts as `data:`, and
 * no network.
 *
 * The page is parsed (parse5), and every file it names by a path inside the project is folded in:
 * a stylesheet as `<style>`, its `@import`s and `url()`s the same way; a script inline; a module
 * script bundled with the modules it imports (esbuild, loaded when a page first needs it); and
 * pictures, media, icons and fonts as `data:` URLs. A path is the naming file's own, or the
 * project's top for one starting `/`. An address, a path out of the project, or a file that isn't
 * there is left as it is: the policy keeps it from loading, and the page opens without it.
 *
 * A link to another file of the project becomes `chips-file:` and its path (ADR 0227), so it opens
 * in Chips: the phone's page view catches the tap, and in a frame a few lines of script the builder
 * adds hand the path to the window. A link to a web or mail address asks for a window of its own,
 * the one way out of a frame, so it opens in the person's browser. Links to the page itself or to a
 * place in it stay as they are.
 */

import { posix } from "node:path";
import { FILE_LINK, projectFileType } from "@chipschat/protocol";
import type { Plugin } from "esbuild";
import { type DefaultTreeAdapterTypes, defaultTreeAdapter, html, parse, serialize } from "parse5";
import type { BuiltPage, PageBuilder } from "../../application/ports/projects.js";

type Node = DefaultTreeAdapterTypes.ChildNode | DefaultTreeAdapterTypes.ParentNode;
type Element = DefaultTreeAdapterTypes.Element;

/** What a page too big once its files are in it is refused with. */
const TOO_BIG = "The page is bigger than a file may be once its files are in it.";

/** How deep stylesheets may `@import` each other before the rest are left as they are. */
const IMPORT_DEPTH = 8;

/** Attributes that name a file the page shows, on the elements that have them. */
const FILE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  img: ["src"],
  audio: ["src"],
  video: ["src", "poster"],
  source: ["src"],
  track: ["src"],
  embed: ["src"],
  input: ["src"],
};

/** Why a page can't be built, thrown inside the build and answered as a refusal. */
class Refused extends Error {
  constructor(
    readonly kind: Extract<BuiltPage, { ok: false }>["kind"],
    why: string,
  ) {
    super(why);
  }
}

/**
 * A path the page names, as a path in the project, from the file that names it; nothing for an
 * address, a fragment, or a path out of the project.
 */
export function inProject(ref: string, from: string): string | undefined {
  const bare = ref.trim().split(/[?#]/)[0] ?? "";
  if (bare === "" || bare.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return undefined;
  }
  const joined = decoded.startsWith("/")
    ? decoded.slice(1)
    : posix.join(posix.dirname(from), decoded);
  const path = posix.normalize(joined);
  if (path === "." || path === ".." || path.startsWith("../")) return undefined;
  return path;
}

/** A module a script imports, as a path in the project: only `./`, `../` and `/` are paths. */
function importedPath(specifier: string, from: string): string | undefined {
  return /^\.{0,2}\//.test(specifier) ? inProject(specifier, from) : undefined;
}

/** What esbuild reads a file as, by its extension. */
function loaderOf(path: string) {
  const extension = posix.extname(path).toLowerCase();
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "js" as const;
  if ([".ts", ".mts", ".cts"].includes(extension)) return "ts" as const;
  if (extension === ".jsx") return "jsx" as const;
  if (extension === ".tsx") return "tsx" as const;
  if (extension === ".json") return "json" as const;
  if (extension === ".css") return "css" as const;
  const type = projectFileType(path);
  return /^(image|font|audio|video)\//.test(type) ? ("dataurl" as const) : ("text" as const);
}

/** The words of a script or a stylesheet, kept from closing the element they stand in. */
function safeIn(tag: "script" | "style", text: string): string {
  return text.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

/** `replace` with an asynchronous replacer, each match in turn. */
async function replaceEach(
  text: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
    parts.push(text.slice(last, match.index), await replacer(match as RegExpExecArray));
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.join("");
}

const attr = (element: Element, name: string) =>
  element.attrs.find((each) => each.name === name)?.value;

function setAttr(element: Element, name: string, value: string): void {
  const found = element.attrs.find((each) => each.name === name);
  if (found === undefined) element.attrs.push({ name, value });
  else found.value = value;
}

const dropAttr = (element: Element, name: string) => {
  element.attrs = element.attrs.filter((each) => each.name !== name);
};

/** An element's words, as a script or a style holds them. */
function textOf(element: Element): string {
  return element.childNodes
    .map((child) => (defaultTreeAdapter.isTextNode(child) ? child.value : ""))
    .join("");
}

function setText(element: Element, text: string): void {
  for (const child of [...element.childNodes]) defaultTreeAdapter.detachNode(child);
  defaultTreeAdapter.insertText(element, text);
}

/** One build: the page's files read once each, and every byte put in counted against the limit. */
class Build {
  private readonly cache = new Map<string, Promise<Uint8Array | undefined>>();
  private spent = 0;
  /** Stylesheets the bundler made from modules' CSS imports, for the page's head. */
  readonly bundledStyles: string[] = [];
  /** How many links to files of the project the page has, made `chips-file:` links. */
  links = 0;
  /** How many links to web addresses it has, which its window may ask about first. */
  addresses = 0;

  constructor(
    private readonly read: (path: string) => Promise<Uint8Array | undefined>,
    private readonly maxBytes: number,
    private readonly bundler: () => Promise<typeof import("esbuild")>,
  ) {}

  bytes(path: string): Promise<Uint8Array | undefined> {
    let found = this.cache.get(path);
    if (found === undefined) {
      found = this.read(path);
      this.cache.set(path, found);
    }
    return found;
  }

  /** Bytes put into the page, held to the limit. */
  spend(count: number): void {
    this.spent += count;
    if (this.spent > this.maxBytes) {
      throw new Refused("too_big", TOO_BIG);
    }
  }

  async text(path: string): Promise<string | undefined> {
    const bytes = await this.bytes(path);
    if (bytes === undefined) return undefined;
    this.spend(bytes.byteLength);
    return new TextDecoder().decode(bytes);
  }

  /** A file as a `data:` URL, or nothing when it isn't there. */
  async dataUrl(path: string): Promise<string | undefined> {
    const bytes = await this.bytes(path);
    if (bytes === undefined) return undefined;
    const base64 = Buffer.from(bytes).toString("base64");
    this.spend(base64.length);
    return `data:${projectFileType(path)};base64,${base64}`;
  }

  /** `url()` in a stylesheet, each a `data:` URL, and its `@import`s folded in. */
  async css(text: string, from: string, depth = 0): Promise<string> {
    const imported = await replaceEach(
      text,
      /@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*([^;]*);/g,
      async (match) => {
        const path = inProject(match[2] ?? "", from);
        const words =
          path === undefined || depth >= IMPORT_DEPTH ? undefined : await this.text(path);
        if (path === undefined || words === undefined) return match[0];
        const folded = await this.css(words, path, depth + 1);
        const media = (match[3] ?? "").trim();
        return media === "" ? folded : `@media ${media} {\n${folded}\n}`;
      },
    );
    return replaceEach(imported, /url\(\s*(['"]?)([^'")]+?)\1\s*\)/g, async (match) => {
      const path = inProject(match[2] ?? "", from);
      const url = path === undefined ? undefined : await this.dataUrl(path);
      return url === undefined ? match[0] : `url("${url}")`;
    });
  }

  /** A module and every module of the project it imports, as one module. */
  async bundle(entry: { path: string } | { words: string; from: string }): Promise<string> {
    let esbuild: typeof import("esbuild");
    try {
      esbuild = await this.bundler();
    } catch {
      throw new Refused(
        "unavailable",
        "This server can't put the page's modules together: esbuild isn't installed with it.",
      );
    }
    const built = await esbuild
      .build({
        ...("path" in entry
          ? { entryPoints: [entry.path] }
          : {
              stdin: {
                contents: entry.words,
                resolveDir: `/${posix.dirname(entry.from)}`,
                sourcefile: entry.from,
                loader: "js" as const,
              },
            }),
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        target: "es2022",
        outdir: "/out",
        logLevel: "silent",
        legalComments: "none",
        charset: "utf8",
        plugins: [this.plugin()],
      })
      .catch((failure: unknown) => {
        const first = (
          failure as { errors?: { text: string; location?: { file: string; line: number } }[] }
        ).errors?.[0];
        const file = first?.location?.file.replace(/^project:/, "");
        const where = first?.location === undefined ? "" : `${file}:${first.location.line}: `;
        throw new Refused(
          "invalid",
          `The page's scripts don't build: ${where}${first?.text ?? String(failure)}`,
        );
      });
    let script = "";
    for (const file of built.outputFiles ?? []) {
      this.spend(file.contents.byteLength);
      if (file.path.endsWith(".css")) this.bundledStyles.push(file.text);
      else if (file.path.endsWith(".js")) script = file.text;
    }
    return script;
  }

  /** Where the bundler finds a module: in the project, or left for the page, which can't load it. */
  private plugin(): Plugin {
    return {
      name: "chips-project",
      setup: (build) => {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === "entry-point") return { path: args.path, namespace: "project" };
          const from =
            args.namespace === "project"
              ? args.importer
              : posix.join(args.resolveDir.slice(1), "_");
          const path = importedPath(args.path, from);
          return path === undefined
            ? { path: args.path, external: true }
            : { path, namespace: "project" };
        });
        build.onLoad({ filter: /.*/, namespace: "project" }, async (args) => {
          const bytes = await this.bytes(args.path);
          if (bytes === undefined)
            return { errors: [{ text: `${args.path} isn't in the space's project` }] };
          return {
            contents: bytes,
            loader: loaderOf(args.path),
            resolveDir: `/${posix.dirname(args.path)}`,
          };
        });
      },
    };
  }
}

/** Every element under a node, in the document's order. */
function elementsIn(node: Node): Element[] {
  const found: Element[] = [];
  const walk = (at: Node) => {
    if (!("childNodes" in at)) return;
    for (const child of at.childNodes) {
      if (defaultTreeAdapter.isElementNode(child)) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

/** A stylesheet the page links, as `<style>` in its place, its media kept. */
async function foldStylesheet(build: Build, element: Element, page: string): Promise<void> {
  const path = inProject(attr(element, "href") ?? "", page);
  const words = path === undefined ? undefined : await build.text(path);
  if (path === undefined || words === undefined) return;
  const style = defaultTreeAdapter.createElement("style", html.NS.HTML, []);
  const media = attr(element, "media");
  if (media !== undefined) style.attrs.push({ name: "media", value: media });
  defaultTreeAdapter.insertText(style, safeIn("style", await build.css(words, path)));
  const parent = element.parentNode;
  if (parent === null) return;
  defaultTreeAdapter.insertBefore(parent, style, element);
  defaultTreeAdapter.detachNode(element);
}

/** A script: a module bundled with what it imports, any other read in; inline either way. */
async function foldScript(build: Build, element: Element, page: string): Promise<void> {
  const module = (attr(element, "type") ?? "").trim().toLowerCase() === "module";
  const src = attr(element, "src");
  if (src === undefined) {
    // An inline module that imports the project's modules is bundled with them.
    if (module && /\bimport\b/.test(textOf(element))) {
      setText(
        element,
        safeIn("script", await build.bundle({ words: textOf(element), from: page })),
      );
    }
    return;
  }
  const path = inProject(src, page);
  if (path === undefined || (await build.bytes(path)) === undefined) return;
  const words = module ? await build.bundle({ path }) : await build.text(path);
  if (words === undefined) return;
  dropAttr(element, "src");
  setText(element, safeIn("script", words));
}

/** A file an element shows, as a `data:` URL: a picture, a sound, a video's poster, an icon. */
async function foldFiles(build: Build, element: Element, page: string): Promise<void> {
  for (const name of FILE_ATTRIBUTES[element.tagName] ?? []) {
    const path = inProject(attr(element, name) ?? "", page);
    const url = path === undefined ? undefined : await build.dataUrl(path);
    if (url !== undefined) setAttr(element, name, url);
  }
  const srcset = attr(element, "srcset");
  if (srcset !== undefined && (element.tagName === "img" || element.tagName === "source")) {
    const each = await Promise.all(
      srcset.split(",").map(async (candidate) => {
        const [ref = "", ...size] = candidate.trim().split(/\s+/);
        const path = inProject(ref, page);
        const url = path === undefined ? undefined : await build.dataUrl(path);
        return [url ?? ref, ...size].join(" ");
      }),
    );
    setAttr(element, "srcset", each.join(", "));
  }
}

/** An icon a page links, as a `data:` URL. */
async function foldIcon(build: Build, element: Element, page: string): Promise<void> {
  const path = inProject(attr(element, "href") ?? "", page);
  const url = path === undefined ? undefined : await build.dataUrl(path);
  if (url !== undefined) setAttr(element, "href", url);
}

/** A `<style>`'s `url()`s and `@import`s, or a `style=""`'s, folded in. */
async function foldStyle(build: Build, element: Element, page: string): Promise<void> {
  if (element.tagName === "style") {
    setText(element, safeIn("style", await build.css(textOf(element), page)));
    return;
  }
  const style = attr(element, "style");
  if (style !== undefined && /url\(/.test(style))
    setAttr(element, "style", await build.css(style, page));
}

/**
 * In a frame, a tap on a link to a file of the project tells the window which file, rather than
 * leaving for a scheme the frame can't load; at the top, as on the phone, the link is followed and
 * the page view catches it.
 */
const FILE_LINK_SCRIPT =
  'document.addEventListener("click",function(e){var a=e.target instanceof Element?e.target.closest("a[data-chips-file]"):null;if(!a||window.parent===window)return;e.preventDefault();window.parent.postMessage({chipsFile:a.getAttribute("data-chips-file")},"*")},true);';

/**
 * In a frame, a click on a link to a web address goes on to its window when the window has said it
 * asks about them (ADR 0227's addendum of 9 November 2026): every one while the person's program
 * isn't running, so the banner over the page can ask to run it first; only localhost in a browser
 * that isn't on the Mac. Until the window says so, and in a window that never does, the link opens
 * a window as it would. The window is told the address; whether anything opens is its person's.
 */
const ADDRESS_SCRIPT =
  '(function(){if(window.parent===window)return;var asks="none";window.addEventListener("message",function(e){if(e.source!==window.parent)return;var m=e.data&&e.data.chipsAsks;if(m==="every"||m==="own"||m==="none")asks=m});document.addEventListener("click",function(e){if(asks==="none")return;var a=e.target instanceof Element?e.target.closest("[data-chips-address]"):null;if(!a||!a.href)return;var h=a.hostname.toLowerCase();var own=h==="localhost"||/\\.localhost$/.test(h)||/^127(\\.\\d{1,3}){3}$/.test(h)||h==="[::1]"||h==="0.0.0.0";if(asks==="own"&&!own)return;e.preventDefault();window.parent.postMessage({chipsAddress:a.href},"*")},true)})();';

/** What a person's browser or mail opens, and a page's frame may not go to. */
const ADDRESS = /^\s*(https?|mailto):/i;

/** A web address, which may need the space's program running. */
const WEB = /^\s*https?:/i;

/**
 * A link to another file of the project, as a `chips-file:` link (ADR 0227); a link to an address,
 * as one that opens a window. Left to load in the frame, the app's policy stops it and the tap does
 * nothing.
 */
function foldLink(build: Build, element: Element, page: string): void {
  const href = attr(element, "href");
  if (href === undefined || href.trim().startsWith("#")) return;
  if (ADDRESS.test(href)) {
    setAttr(element, "target", "_blank");
    if (WEB.test(href)) {
      setAttr(element, "data-chips-address", "");
      build.addresses += 1;
    }
    return;
  }
  const path = inProject(href, page);
  if (path === undefined || path === page) return;
  setAttr(element, "href", `${FILE_LINK}${encodeURIComponent(path)}`);
  setAttr(element, "data-chips-file", path);
  dropAttr(element, "target");
  build.links += 1;
}

/** What a page's elements name, folded in, element by element. */
async function foldElement(build: Build, element: Element, page: string): Promise<void> {
  if (element.tagName === "a" || element.tagName === "area") foldLink(build, element, page);
  const rel = (attr(element, "rel") ?? "").toLowerCase().split(/\s+/);
  if (element.tagName === "link" && rel.includes("stylesheet"))
    return foldStylesheet(build, element, page);
  if (element.tagName === "link" && rel.some((each) => each.includes("icon")))
    return foldIcon(build, element, page);
  if (element.tagName === "script") return foldScript(build, element, page);
  await foldStyle(build, element, page);
  await foldFiles(build, element, page);
}

/** The page, parsed, everything it names folded in, and the bundles' styles in its head. */
async function folded(build: Build, words: string, path: string): Promise<string> {
  const document = parse(words);
  for (const element of elementsIn(document)) await foldElement(build, element, path);
  const head = elementsIn(document).find((element) => element.tagName === "head");
  for (const css of head === undefined ? [] : build.bundledStyles) {
    const style = defaultTreeAdapter.createElement("style", html.NS.HTML, []);
    defaultTreeAdapter.insertText(style, safeIn("style", css));
    if (head !== undefined) defaultTreeAdapter.appendChild(head, style);
  }
  const body = elementsIn(document).find((element) => element.tagName === "body");
  const lines = [
    build.links > 0 ? FILE_LINK_SCRIPT : "",
    build.addresses > 0 ? ADDRESS_SCRIPT : "",
  ].join("");
  if (lines !== "" && body !== undefined) {
    const script = defaultTreeAdapter.createElement("script", html.NS.HTML, []);
    defaultTreeAdapter.insertText(script, lines);
    defaultTreeAdapter.appendChild(body, script);
  }
  return serialize(document);
}

export function createPageBuilder(
  bundler: () => Promise<typeof import("esbuild")> = () => import("esbuild"),
): PageBuilder {
  return {
    async build({ path, read, maxBytes }) {
      const build = new Build(read, maxBytes, bundler);
      try {
        const words = await build.text(path);
        if (words === undefined)
          return { ok: false, kind: "not_found", why: "No such page in the space's project." };
        const built = await folded(build, words, path);
        if (Buffer.byteLength(built) > maxBytes)
          return { ok: false, kind: "too_big", why: TOO_BIG };
        return { ok: true, html: built };
      } catch (failure) {
        if (failure instanceof Refused)
          return { ok: false, kind: failure.kind, why: failure.message };
        throw failure;
      }
    },
  };
}
