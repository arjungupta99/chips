/**
 * Chips names no harness in what it ships (ADR 0051, ADR 0077). Jacobian was the first harness to
 * connect and is the one Chips is dogfooded with, so it is the name that creeps in: a hint on the
 * Harnesses page, an example in the CLI's help, a promise on a sheet that only Jacobian keeps. Each
 * of those told a second harness's owner something false about theirs.
 *
 * What is checked is what runs and what a person reads — identifiers, strings, template text and
 * JSX text — in the source of the server, the clients, the CLI and the packages. Comments may name
 * the harness a decision came from, and tests may use it as a fixture; a harness's own adapter, when
 * one lives here, is where its name belongs, so `adapters/` is not read.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** The harnesses Chips is dogfooded with or built beside: the names most likely to creep in. */
const NAMED = /jacobian|openclaw/i;

const SHIPPED = ["apps", "packages", "server", "cli", "relay", "examples"];
/** Tests, fixtures, generated code and the docs site are not what Chips does. */
const NOT_SHIPPED =
  /\.test\.tsx?$|\/e2e\/|\/testing\/|\/fixtures\/|\/generated\/|\.d\.ts$|^apps\/docs\//;

function shippedSources(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", ...SHIPPED], { cwd: REPO })
    .toString("utf8")
    .split("\0")
    .filter((path) => /\.tsx?$/.test(path) && !NOT_SHIPPED.test(path));
}

/** The words of a node a program runs or a person reads, or nothing for anything else. */
function wordsOf(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return node.text;
  }
  return undefined;
}

/** `path:line  words` for every place a harness is named in this file's code. */
function namings(path: string, text: string): string[] {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, kind);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const words = wordsOf(node);
    const at = words?.search(NAMED) ?? -1;
    if (words !== undefined && at >= 0) {
      const start = node.getStart(source);
      const line = source.getLineAndCharacterOfPosition(start + at).line + 1;
      const near = words.slice(Math.max(0, at - 30), at + 40).replace(/\s+/g, " ");
      found.push(`${path}:${line}  …${near}…`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("a harness's name", () => {
  it("is found in code and copy, and not in a comment", () => {
    const text = [
      "// Jacobian taught us this.",
      "/** So did OpenClaw. */",
      "const jacobianRooms = 1;",
      'const hint = "Jacobian\'s is one";',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text with a template in it
      "const where = `in ${place} or in OpenClaw`;",
      "const page = <p>An adapter of its own, Jacobian for one.</p>;",
    ].join("\n");
    expect(namings("x.tsx", text).map((each) => each.split("  ")[0])).toEqual([
      "x.tsx:3",
      "x.tsx:4",
      "x.tsx:5",
      "x.tsx:6",
    ]);
  });

  it("is not in anything Chips ships", () => {
    const sources = shippedSources();
    // The whole of it, not a pattern that quietly matched nothing.
    expect(sources.length).toBeGreaterThan(400);
    const found = sources.flatMap((path) => namings(path, readFileSync(join(REPO, path), "utf8")));
    expect(found).toEqual([]);
  });
});

/** Every tracked file under these paths, as git has them. */
function tracked(...paths: string[]): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: REPO })
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "");
}

/**
 * Chips depends on no harness (Arjun, 27 September 2026: "chips should not have any kind of
 * dependency on OpenClaw"; ADR 0051 for Jacobian). A harness's adapter, its scripts and its
 * packages live with the harness, or in a repository of their own, and depend on Chips — never the
 * other way round. Chips's docs may say how a harness connects; nothing Chips builds, installs or
 * runs may reach for one.
 */
describe("a harness", () => {
  it("is in no package manifest and no lockfile", () => {
    const manifests = tracked("package.json", "*/package.json", "*/*/package.json");
    expect(manifests.length).toBeGreaterThan(10);
    const named = manifests.filter((path) => {
      const manifest = JSON.parse(readFileSync(join(REPO, path), "utf8")) as Record<
        string,
        unknown
      >;
      const deps = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
        .flatMap((key) => Object.keys((manifest[key] as Record<string, string>) ?? {}))
        .concat(String(manifest["name"] ?? ""));
      return deps.some((dep) => NAMED.test(dep));
    });
    expect(named).toEqual([]);
    expect(NAMED.test(readFileSync(join(REPO, "pnpm-lock.yaml"), "utf8"))).toBe(false);
  });

  it("is run by no tool, script or workflow, though a comment may say why", () => {
    const found = tracked("tools", ".github", "scripts", "packaging")
      .filter((path) => !path.startsWith("tools/guardrails/"))
      .flatMap((path) =>
        readFileSync(join(REPO, path), "utf8")
          .split("\n")
          .map((line, index) => ({ line: line.trim(), at: `${path}:${index + 1}` }))
          .filter(({ line }) => NAMED.test(line) && !/^(#|\/\/|\/?\*)/.test(line))
          .map(({ at, line }) => `${at}  ${line.slice(0, 80)}`),
      );
    expect(found).toEqual([]);
  });
});
