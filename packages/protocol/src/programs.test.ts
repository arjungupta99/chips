/**
 * A run file of several programs (ADR 0303): `runPrograms` reads both forms, each program by its
 * name and folder, with what it needs; a press starts the needed ones first, and says what it runs
 * as the Mac compares it.
 */

import { describe, expect, it } from "vitest";
import {
  commandOf,
  neededBy,
  pressCommand,
  programNamed,
  programsInOrder,
  runPrograms,
} from "./project.js";

const SHOP = {
  name: "Shop",
  in: "shop",
  run: "npm run dev",
  opens: "http://localhost:5173",
  setup: "npm install",
  needs: ["API"],
};
const ADMIN = { name: "Admin", in: "admin/", run: "npm run dev", needs: ["api"] };
const API = { name: "API", in: "./api", run: "uvicorn main:app --port 8000" };
const listed = (...programs: unknown[]) => JSON.stringify({ programs });

describe("a run file of programs", () => {
  it("reads a file of one run as one program with no name, as before", () => {
    expect(runPrograms('{"run": "npm start", "opens": "http://localhost:3000"}')).toEqual({
      programs: [{ run: "npm start", opens: "http://localhost:3000" }],
    });
    expect(runPrograms("{}")).toEqual({ why: ".chips/run.json doesn't say what to run or open." });
  });

  it("reads each listed program by its name and folder, with what it needs", () => {
    expect(runPrograms(listed(SHOP, ADMIN, API))).toEqual({
      programs: [
        { ...SHOP },
        { name: "Admin", in: "admin", run: "npm run dev", needs: ["api"] },
        { name: "API", in: "api", run: "uvicorn main:app --port 8000" },
      ],
    });
  });

  it("refuses what can't be run, in words that name the program", () => {
    const why = (text: string) => (runPrograms(text) as { why?: string }).why;
    expect(why(JSON.stringify({ run: "x", programs: [API] }))).toBe(
      '.chips/run.json lists programs and says "run" too. Keep one of them.',
    );
    expect(why(listed())).toBe(".chips/run.json lists no programs.");
    expect(
      why(listed(...Array.from({ length: 7 }, (_, at) => ({ name: `P${at}`, run: "x" })))),
    ).toBe(".chips/run.json lists 7 programs, and Chips runs 6 at most.");
    expect(why(listed("npm start"))).toBe(".chips/run.json lists something that isn't a program.");
    expect(why(listed({ run: "x" }))).toBe(".chips/run.json lists a program with no name.");
    expect(why(listed({ name: "a/b", run: "x" }))).toContain('names a program "a/b"');
    expect(why(listed(API, { ...API, name: "api" }))).toBe(
      ".chips/run.json names two programs api.",
    );
    expect(why(listed({ ...API, in: "../elsewhere" }))).toBe(
      ".chips/run.json's API runs in ../elsewhere, which isn't a folder of the project.",
    );
    expect(why(listed({ ...API, in: "/Users/me/api" }))).toContain("isn't a folder of the project");
    expect(why(listed({ name: "Site", opens: "index.html" }))).toBe(
      ".chips/run.json's Site doesn't say what to run.",
    );
    expect(why(listed({ ...API, run: "cd ~/api && make" }))).toBe(
      ".chips/run.json's API uses ~/api, outside the project's folder. Ask the agents to put what it runs in the project.",
    );
    expect(why(listed({ ...API, opens: "https://example.com" }))).toContain(
      "Run opens only the Mac's own addresses",
    );
    expect(why(listed({ ...API, needs: "Shop" }))).toBe(
      ".chips/run.json's API says what it needs, but not as a list of names.",
    );
    expect(why(listed({ ...API, needs: ["API"] }))).toBe(".chips/run.json's API needs itself.");
    expect(why(listed(SHOP))).toBe(
      ".chips/run.json's Shop needs API, which the file doesn't list.",
    );
    expect(why(listed({ ...SHOP, needs: ["Admin"] }, { ...ADMIN, needs: ["Shop"] }))).toBe(
      ".chips/run.json's Shop and Admin need each other.",
    );
  });

  it("starts what a program needs first, and every program after what it needs", () => {
    const file = runPrograms(listed(SHOP, ADMIN, API));
    if ("why" in file) throw new Error(file.why);
    expect(programsInOrder(file, "shop").map((each) => each.name)).toEqual(["API", "Shop"]);
    expect(programsInOrder(file, "API").map((each) => each.name)).toEqual(["API"]);
    expect(programsInOrder(file).map((each) => each.name)).toEqual(["API", "Shop", "Admin"]);
    expect(programsInOrder(file, "Docs")).toEqual([]);
    expect(neededBy(file, "API").map((each) => each.name)).toEqual(["Shop", "Admin"]);
    expect(programNamed(file, "admin")?.name).toBe("Admin");
    expect(programNamed(file, undefined)).toBeUndefined();
  });

  it("says what a press runs: each program by name and folder, the needed ones first", () => {
    const file = runPrograms(listed(SHOP, API));
    if ("why" in file) throw new Error(file.why);
    expect(pressCommand(file, "Shop")).toBe(
      [
        "program API in api",
        "uvicorn main:app --port 8000",
        "program Shop in shop",
        "npm install",
        "npm run dev",
        "open http://localhost:5173",
      ].join("\n"),
    );
    // A run file of one run presses as it did.
    const one = runPrograms('{"run": "npm start", "setup": "npm ci"}');
    if ("why" in one) throw new Error(one.why);
    expect(pressCommand(one)).toBe("npm ci\nnpm start");
    expect(commandOf({ run: "npm start" })).toBe("npm start");
  });
});
