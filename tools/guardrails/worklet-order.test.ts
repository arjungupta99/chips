/**
 * A worklet is declared after everything of its own file it calls (the media viewer, Phase 1).
 *
 * The worklets Babel plugin turns each `"worklet"` function into a value made where it is
 * declared, and that value holds what the function calls as it stands at that moment. A helper
 * declared further down the file has not been made yet, so on the UI thread it is `undefined`,
 * and the gesture that reaches it throws "undefined is not a function". Under Node the functions
 * are ordinary, hoisted, and every test passes. The phone's first drag in the media viewer found
 * it (14 September 2026), in core's `viewer.ts` and in the stage.
 *
 * So this reads every file in the places worklets live and holds each worklet to the order: every
 * top-level function or constant of the same file that its body names is declared above it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PLACES = ["packages/core/src", "apps/mobile/src"];

interface Declared {
  readonly name: string;
  readonly at: number;
  readonly body: string;
  readonly worklet: boolean;
}

/** The source with its comments blanked out, so a name said in prose is not taken for a call. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

/** The file's top-level functions and constants, in order, each with the text up to the next. */
function declarationsOf(written: string): readonly Declared[] {
  const source = withoutComments(written);
  const heads = [...source.matchAll(/^(?:export )?(?:async )?(?:function|const|let) (\w+)/gm)].map(
    (match) => ({ name: match[1] ?? "", at: match.index }),
  );
  return heads.map((head, index) => {
    const body = source.slice(head.at, heads[index + 1]?.at ?? source.length);
    // A worklet of its own, with the directive at the top of its body; a hook that makes one
    // inline, at render, has it nested deeper and captures nothing when the module loads.
    return { ...head, body, worklet: /^ {2}"worklet";/m.test(body) };
  });
}

/** Each place a worklet names something of its own file declared below it. */
function outOfOrder(source: string): readonly string[] {
  const declared = declarationsOf(source);
  const where = new Map(declared.map((each) => [each.name, each.at]));
  return declared
    .filter((each) => each.worklet)
    .flatMap((worklet) =>
      [...where.entries()]
        .filter(([name, at]) => at > worklet.at && new RegExp(`\\b${name}\\b`).test(worklet.body))
        .map(([name]) => `${worklet.name} names ${name}, declared below it`),
    );
}

function sources(): readonly string[] {
  return PLACES.flatMap((place) =>
    readdirSync(join(ROOT, place), { recursive: true, encoding: "utf8" })
      .filter((path) => /\.tsx?$/.test(path) && !/\.(test|vitest)\.tsx?$/.test(path))
      .map((path) => join(place, path)),
  ).filter((path) => readFileSync(join(ROOT, path), "utf8").includes('"worklet";'));
}

describe("worklets and the order they are declared in", () => {
  it("finds the files that have them: core's viewer arithmetic and the phone's stage", () => {
    expect(sources()).toEqual(
      expect.arrayContaining(["packages/core/src/viewer.ts", "apps/mobile/src/media/Stage.tsx"]),
    );
  });

  it("declares every worklet after what of its own file it calls", () => {
    for (const path of sources()) {
      expect({ path, problems: outOfOrder(readFileSync(join(ROOT, path), "utf8")) }).toEqual({
        path,
        problems: [],
      });
    }
  });

  it("would catch the order the phone's first drag found", () => {
    const before = [
      "export function dismissProgress(dy: number) {",
      '  "worklet";',
      "  return fromOne(0.3, dy);",
      "}",
      "function fromOne(to: number, share: number) {",
      '  "worklet";',
      "  return to * share;",
      "}",
    ].join("\n");
    expect(outOfOrder(before)).toEqual(["dismissProgress names fromOne, declared below it"]);
  });
});
