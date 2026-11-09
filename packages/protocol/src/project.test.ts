/**
 * A room's project (ADR 0220): the path a project is served at, read back; the secrets files and
 * the keys a push is refused for, and the files and words that look like them and aren't. The keys
 * here are made up, and built from pieces so that no scanner reads this file as holding one.
 */

import { describe, expect, it } from "vitest";
import {
  commandOf,
  isSecretsFile,
  namesInWords,
  opensAProgram,
  opensShown,
  type ProjectFacts,
  projectPath,
  projectRequest,
  renderProjectAsks,
  renderProjectFacts,
  renderProjectNote,
  runRecipe,
  secretIn,
} from "./project.js";

const SPACE = "spc_01K8C3Y4Z5A6B7C8D9E0F1G2H3";

describe("a room's project path", () => {
  it("is read back to its room and what follows", () => {
    expect(projectPath(SPACE)).toBe(`/v1/spaces/${SPACE}/project.git`);
    expect(projectRequest(`${projectPath(SPACE)}/info/refs`)).toEqual({
      spaceId: SPACE,
      rest: "/info/refs",
    });
    expect(projectRequest(projectPath(SPACE))).toEqual({ spaceId: SPACE, rest: "/" });
  });

  it("is no other path", () => {
    expect(projectRequest(`/v1/spaces/${SPACE}/files`)).toBeUndefined();
    expect(projectRequest("/v1/spaces/spc_nope/project.git/info/refs")).toBeUndefined();
    expect(projectRequest(`/v1/spaces/${SPACE}/project.gitx`)).toBeUndefined();
  });
});

describe("a secrets file", () => {
  it("is .env and its kin, in any folder", () => {
    for (const path of [".env", ".env.local", "app/.env.production", "a/b/.env"]) {
      expect(isSecretsFile(path), path).toBe(true);
    }
  });

  it("is not an example people commit, nor a name that only starts the same", () => {
    for (const path of [".env.example", "app/.env.sample", ".env.template", ".envrc", "env.ts"]) {
      expect(isSecretsFile(path), path).toBe(false);
    }
  });
});

describe("a key in a file's words", () => {
  const pieces = (...parts: string[]) => parts.join("");

  it("is named by whose it looks like", () => {
    expect(secretIn(`key = "${pieces("sk-", "ant-", "api03-", "a".repeat(40))}"`)).toBe(
      "an Anthropic key",
    );
    expect(secretIn(pieces("OPENAI=", "sk-", "proj-", "b".repeat(48)))).toBe("an OpenAI key");
    expect(secretIn(pieces("id: ", "AKIA", "ABCDEFGHIJKLMNOP"))).toBe("an AWS access key");
    expect(secretIn(pieces("gh", "p_", "c".repeat(36)))).toBe("a GitHub token");
    expect(secretIn(pieces("chips", "_at_", "d".repeat(43)))).toBe("a Chips token");
    expect(secretIn(pieces("-----BEGIN ", "OPENSSH PRIVATE", " KEY-----"))).toBe("a private key");
  });

  it("is not code that talks about keys", () => {
    expect(secretIn('const key = process.env["ANTHROPIC_API_KEY"];')).toBeUndefined();
    expect(secretIn("Keys look like sk-ant-…, and stay outside the project.")).toBeUndefined();
    expect(secretIn("-----BEGIN PUBLIC KEY-----")).toBeUndefined();
  });

  it("is not a link whose words end in sk, as an article's about Musk's do", () => {
    const link = "https://www.teslarati.com/elon-musk-terafab-project-chip-fab-texas-announcement/";
    expect(secretIn(`<a href="${link}">SC3</a>`)).toBeUndefined();
    expect(
      secretIn("bits-chips.com/article/musk-hints-at-fresh-silicon-plans-for-the-terafab"),
    ).toBeUndefined();
    // Glued to a quote, a space or an equals sign, a key is still a key.
    expect(secretIn(pieces('"', "sk-", "proj-", "b".repeat(48), '"'))).toBe("an OpenAI key");
  });
});

describe("the note a turn opens its project with", () => {
  const facts: ProjectFacts = {
    folder: "/agents/hale/room",
    files: 12,
    changed: [],
    by: [],
    clashes: [],
    clashedWith: [],
    keys: [],
    markdown: false,
  };

  it("says where the copy is, that Chips does the git, where the start page and the run file go (ADR 0227), and nothing more on a quiet turn", () => {
    expect(renderProjectNote({ ...facts, files: 1 }, { othersInRoom: false })).toBe(
      "The space's project is a git repository. Your copy is /agents/hale/room (1 file), brought up to date just now.\n" +
        "Work on the project in that folder and leave git to Chips: when your turn ends, what you changed is committed under your name and sent to everyone here. Keep scratch work outside it.\n" +
        "Everyone here sees the project's files, so don't send them with your answer as well.\n" +
        "When what you make is to be read (pages, PDFs, pictures), keep a start page at .chips/index.html that links to the documents worth seeing (its links start ../), with the documents themselves at the top or in folders of their own, and bring it up to date whenever you add, rename or replace one. Chips opens it in the app, where links to the project's files open too and web links open in the browser. One document needs no start page.\n" +
        'When what you make has to run on the person\'s Mac (a server, a script, an app), keep .chips/run.json so Run in Chips can start it from the project\'s folder: {"run": "the one shell command that starts it", "opens": "http://localhost:<port>, to open once it answers", "setup": "a command run first when it changes, like npm install"}. Have it print the address it listens on, like http://localhost:4173, which is what Run opens; "opens" is for a program that prints none. Everything it runs belongs in the project: Run refuses a command that goes anywhere outside the project\'s folder (a cd elsewhere, a path in a home folder). Start an app by its own program rather than with open, so Stop can close it, and leave starting it to Run rather than starting it yourself. Leave out what it doesn\'t need, and check it works in your copy before you say it does.',
    );
  });

  it("refuses a run file that runs anything outside the project's folder (the game of life sim, 24 October 2026)", () => {
    expect(
      runRecipe(
        JSON.stringify({
          run: "cd /Users/ada/JacobianSpaces/evolution-lab && node scripts/serve.js",
          opens: "http://localhost:4173",
        }),
      ),
    ).toEqual({
      why: ".chips/run.json uses /Users/ada/JacobianSpaces/evolution-lab, outside the project's folder. Ask the agents to put what it runs in the project.",
    });
    for (const run of [
      "node ~/games/serve.js",
      'cd "$HOME/games" && npm start',
      "cd .. && npm start",
      "pushd /tmp && make",
      "npm start --prefix /home/arjun/games",
    ]) {
      expect(runRecipe(JSON.stringify({ run }))).toHaveProperty("why");
    }
    expect(runRecipe(JSON.stringify({ run: "npm start", setup: "cd ~/x && npm install" }))).toEqual(
      {
        why: ".chips/run.json uses ~/x, outside the project's folder. Ask the agents to put what it runs in the project.",
      },
    );
    // Inside the folder, and the Mac's own programs, run as they always have.
    for (const run of [
      "cd web && npm start",
      "cd ./app && node serve.js",
      "npm --prefix ./web start",
      "/usr/bin/python3 -m http.server 8000",
    ]) {
      expect(runRecipe(JSON.stringify({ run }))).toEqual({ run });
    }
  });

  it("reads the run file's recipe, and refuses one that opens the internet or says nothing to run (ADRs 0226, 0227)", () => {
    expect(
      runRecipe('{"run": " python3 -m http.server 8000 ", "opens": "http://localhost:8000"}'),
    ).toEqual({
      run: "python3 -m http.server 8000",
      opens: "http://localhost:8000",
    });
    expect(
      runRecipe('{"run": "npm start", "setup": "npm install", "opens": "dist/index.html"}'),
    ).toEqual({
      run: "npm start",
      setup: "npm install",
      opens: "dist/index.html",
    });
    expect(runRecipe("{")).toEqual({ why: ".chips/run.json isn't JSON." });
    // Read from where it was kept before, its words name that file.
    expect(runRecipe("{", "chips.json")).toEqual({ why: "chips.json isn't JSON." });
    expect(runRecipe('{"opens": "http://localhost:3000"}')).toEqual({
      why: ".chips/run.json opens http://localhost:3000 but doesn't say what to run.",
    });
    expect(runRecipe("{}")).toEqual({ why: ".chips/run.json doesn't say what to run or open." });
    expect(runRecipe('{"setup": "npm install", "opens": "index.html"}')).toEqual({
      why: ".chips/run.json has a setup but nothing to run.",
    });
    // Pages that need no starting are only opened.
    expect(runRecipe('{"opens": "index.html"}')).toEqual({ opens: "index.html" });
    // A document opens in its app; a program the Mac would run starts only as `run`.
    expect(runRecipe('{"opens": "docs/Terafab report.pdf"}')).toEqual({
      opens: "docs/Terafab report.pdf",
    });
    for (const opens of ["start.command", "Tool.app", "setup.pkg", "serve.py", "go.webloc"]) {
      expect(runRecipe(JSON.stringify({ opens }))).toEqual({
        why: `.chips/run.json opens ${opens}, which the Mac would run as a program. Say how to start it as "run", where you see what it does.`,
      });
    }
    // A slash or a `.` after its name is still the program (SEC-46).
    for (const opens of ["start.command/.", "start.command/", "Tool.app/./", "a/../serve.py"]) {
      expect(runRecipe(JSON.stringify({ run: "make", opens }))).toHaveProperty("why");
    }
    expect(opensAProgram("/Users/arjun/Chips/Projects/Game/start.command")).toBe(true);
    expect(opensAProgram("http://localhost:8000/")).toBe(false);
    expect(commandOf({ opens: "index.html" })).toBe("open index.html");
    expect(commandOf({ setup: "npm install", run: "npm start" })).toBe("npm install\nnpm start");
    // What it opens is part of what the person is shown and the Mac compares (SEC-46).
    expect(commandOf({ run: "npm start", opens: "http://localhost:3000" })).toBe(
      "npm start\nopen http://localhost:3000",
    );
    const most = { setup: "s".repeat(500), run: "r".repeat(500), opens: `${"o".repeat(100)}.html` };
    expect(runRecipe(JSON.stringify(most))).toEqual({
      why: ".chips/run.json says more than Chips runs.",
    });
    for (const opens of [
      "https://example.com",
      "file:///etc/passwd",
      "/etc/hosts",
      "../up.html",
      "javascript:alert(1)",
    ]) {
      expect(runRecipe(JSON.stringify({ run: "make", opens }))).toHaveProperty("why");
    }
    expect(runRecipe(JSON.stringify({ run: "x".repeat(501) }))).toHaveProperty("why");
    expect(opensShown("http://localhost:8000/")).toBe("localhost:8000");
    expect(opensShown("http://[::1]:8000/")).toBe("localhost:8000");
    expect(opensShown("http://127.0.0.1:4174")).toBe("localhost:4174");
  });

  it("names what others changed and who, and asks agents who share a room to split by file", () => {
    const note = renderProjectNote(
      { ...facts, changed: ["src/store.js", "tests/store.test.js"], by: ["Wren"], markdown: true },
      { othersInRoom: true },
    );
    expect(note).toContain(
      "Changed since your last turn: src/store.js and tests/store.test.js, by Wren.",
    );
    expect(note).toContain("Split the work by file where you can.");
    expect(note).toContain(
      "When your file and another's use different names for the same thing, the one that reached the project first keeps its names, and the other changes its names to match.",
    );
    expect(note).toContain("In Markdown, put each sentence on a line of its own.");
  });

  it("is its facts, said every turn, then its asks, said once a session where it keeps its turns (ADR 0250)", () => {
    const changed = { ...facts, changed: ["plan.md"], by: ["Duncan"], markdown: true };
    const options = { othersInRoom: true };
    const said = renderProjectNote(changed, options);
    expect(said).toBe(`${renderProjectFacts(changed)}\n${renderProjectAsks(changed, options)}`);
    expect(renderProjectFacts(changed)).toBe(
      "The space's project is a git repository. Your copy is /agents/hale/room (12 files), brought up to date just now.\nChanged since your last turn: plan.md, by Duncan.",
    );
    const asks = renderProjectAsks(changed, options);
    expect(asks).toMatch(/^Work on the project in that folder and leave git to Chips/);
    expect(asks).toContain("Split the work by file where you can.");
    expect(asks).not.toContain("plan.md");
  });

  it("asks a project with a page to name every file it needs, since it can't fetch them (ADR 0223)", () => {
    const said = (pages: boolean) =>
      renderProjectNote({ ...facts, pages }, { othersInRoom: false });
    expect(said(true)).toContain(
      "A page opens in Chips as one document: name every file it needs in its tags and imports",
    );
    expect(said(false)).not.toContain("A page opens in Chips");
  });

  it("says a clash, a key and a copy that couldn't be brought up", () => {
    const note = renderProjectNote(
      {
        ...facts,
        clashes: ["src/app.js"],
        clashedWith: ["Duncan"],
        keys: [{ path: "src/config.js", what: "an OpenAI key" }],
        trouble: "the server didn't answer.",
      },
      { othersInRoom: false },
    );
    expect(note).toContain("(12 files), not brought up to date.");
    expect(note).toContain("It couldn't be: the server didn't answer.");
    expect(note).toContain("Your last change to src/app.js clashed with Duncan's");
    expect(note).toContain('yours between "<<<<<<< yours" and "======="');
    expect(note).toContain(
      "src/config.js holds what looks like an OpenAI key, so your last change wasn't sent",
    );
  });

  it("lists names as words", () => {
    expect(namesInWords(["a"])).toBe("a");
    expect(namesInWords(["a", "b", "c"])).toBe("a, b and c");
    expect(namesInWords(["1", "2", "3", "4", "5", "6", "7", "8"])).toBe(
      "1, 2, 3, 4, 5, 6 and 2 more",
    );
  });
});
