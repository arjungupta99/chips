import { describe, expect, it } from "vitest";
import {
  askedCommand,
  commandParts,
  commandStarts,
  neverStanding,
  standingOffer,
  startsWith,
} from "./commands.js";

/** Words of each part, joined, for reading a test at a glance. */
const read = (command: string) => commandParts(command)?.map((part) => part.join(" "));

describe("reading a command (ADR 0239)", () => {
  it("finds the command in an ask's input, a string or an array of words", () => {
    expect(askedCommand({ command: "ls -la", cwd: "/x" })).toBe("ls -la");
    expect(askedCommand({ command: ["git", "status"] })).toEqual(["git", "status"]);
    expect(askedCommand({ command: "  " })).toBeUndefined();
    expect(askedCommand({ command: ["git", 4] })).toBeUndefined();
    expect(askedCommand({ files: ["a"] })).toBeUndefined();
    expect(askedCommand("ls")).toBeUndefined();
    expect(commandParts(["sh", "-c", "rm -rf x"])).toEqual([["sh", "-c", "rm -rf x"]]);
  });

  it("splits a chain into its parts, and each part into words, quotes off", () => {
    expect(read("node --check game.js && echo ok")).toEqual(["node --check game.js", "echo ok"]);
    expect(read("grep -noE 'card-(front|back|face)|toolbar' style.css | sort | uniq -c")).toEqual([
      "grep -noE card-(front|back|face)|toolbar style.css",
      "sort",
      "uniq -c",
    ]);
    expect(
      read('grep -n "card\\|getElementById" game.js; node --check game.js || echo bad'),
    ).toEqual(["grep -n card\\|getElementById game.js", "node --check game.js", "echo bad"]);
    expect(read("pwd\nls -la")).toEqual(["pwd", "ls -la"]);
    expect(read("ls;")).toEqual(["ls"]);
    expect(read("echo '' x")).toEqual(["echo  x"]);
    expect(commandParts("echo '' x")?.[0]).toEqual(["echo", "", "x"]);
    expect(read('echo "a \\"b\\" c"')).toEqual(['echo a "b" c']);
    expect(read("cat my\\ file")).toEqual(["cat my file"]);
  });

  it("reads the shapes of the real asks, and not the two that write into a file", () => {
    const real: readonly [string, readonly string[] | undefined][] = [
      ["pwd; ls -la /home/me/.claw; ls -la /home/me/.claw/chips", ["pwd", "ls -la", "ls -la"]],
      [
        'find /home/me/media/inbound -maxdepth 1 -type f -name "*4c75*"',
        ["find /home/me/media/inbound"],
      ],
      ["python3 validate-report.py", ["python3 validate-report.py"]],
      [
        "rm /Users/me/acp/claude/second.txt && ls /Users/me/acp/claude",
        ["rm /Users/me/acp/claude/second.txt", "ls /Users/me/acp/claude"],
      ],
      ["curl -sI https://example.com | head -1", ["curl -sI", "head -1"]],
      [
        "grep -nE 'card|toolbar' game.js | grep -v data-index; node --check game.js && echo ok",
        ["grep -nE", "grep -v", "node --check", "echo ok"],
      ],
      [
        'cd /Users/me/room && git log --oneline -8 -- style.css; git status --short; grep -n "x" style.css | head -3',
        ["cd /Users/me/room", "git log", "git status", "grep -n", "head -3"],
      ],
      [
        "sed -i '' 's/class=\"toolbar\"/class=\"controls\"/' index.html && grep -n controls index.html",
        ["sed -i", "grep -n"],
      ],
      [
        "cd /Users/me/room && cat limits.js && printf 'export const LIMIT = 40;\\n' > limits.js",
        undefined,
      ],
      ["ls -a && cat limits.js && printf 'x\\n' > limits.js && git status --short", undefined],
    ];
    for (const [command, starts] of real) {
      const parts = commandParts(command);
      expect(
        parts === undefined ? undefined : commandStarts(parts).map((s) => s.join(" ")),
        command,
      ).toEqual(starts === undefined ? undefined : [...new Set(starts)]);
    }
  });

  it("can't read what does more than run programs in a row", () => {
    for (const command of [
      "echo hi > out.txt",
      "sort < in.txt",
      "echo $(rm -rf x)",
      "echo `rm -rf x`",
      'echo "$HOME"',
      "echo $HOME",
      "(cd x && ls)",
      "{ rm x; }",
      "sleep 1 &",
      "FOO=1 node app.js",
      "ls # rm",
      "ls &&",
      "ls |",
      "; ls",
      "ls && && pwd",
      "echo 'open",
      "if rm x; then ls; fi",
      "! rm x",
      "",
      "x".repeat(10_001),
    ]) {
      expect(commandParts(command), command).toBeUndefined();
    }
  });
});

describe("what a standing yes remembers, and what it never covers (ADR 0239)", () => {
  it("remembers each part's first two words, once each", () => {
    const parts = commandParts("grep -noE a x | sort | uniq -c | sort -k2 | sort");
    expect(parts === undefined ? undefined : commandStarts(parts)).toEqual([
      ["grep", "-noE"],
      ["sort"],
      ["uniq", "-c"],
      ["sort", "-k2"],
    ]);
    expect(startsWith(["node", "--check", "a.js"], ["node", "--check"])).toBe(true);
    expect(startsWith(["node", "--check"], ["node", "--check"])).toBe(true);
    expect(startsWith(["node", "-e", "x"], ["node", "--check"])).toBe(false);
    expect(startsWith(["node"], ["node", "--check"])).toBe(false);
    expect(startsWith(["node"], [])).toBe(false);
  });

  it("names a listed command in any part, by its program's own name, its word anywhere after", () => {
    const never = (command: string) => {
      const parts = commandParts(command);
      return parts === undefined ? "unreadable" : neverStanding(parts);
    };
    expect(never("ls && rm x")).toBe("rm");
    expect(never("/bin/rm -rf x")).toBe("rm");
    expect(never("git -C dir push origin")).toBe("git push");
    expect(never("git status && git log")).toBeUndefined();
    expect(never("find . -name '*.tmp' -delete")).toBe("find -delete");
    expect(never("find . -name x")).toBeUndefined();
    expect(never("node -e 'x'")).toBe("node -e");
    expect(never("node --check a.js")).toBeUndefined();
    expect(never("env FOO=1 rm x")).toBe("env");
    expect(never("bash -c 'ls'")).toBe("bash -c");
    expect(never("bash script.sh")).toBeUndefined();
    expect(never("curl -sI https://example.com | head -1")).toBe("curl");
  });

  it("says what a card's standing yes would remember, or why there is none", () => {
    expect(standingOffer({ command: "node --check game.js && echo ok" })).toEqual({
      kind: "starts",
      starts: [
        ["node", "--check"],
        ["echo", "ok"],
      ],
    });
    expect(standingOffer({ command: "echo hi > x" })).toEqual({ kind: "unreadable" });
    expect(standingOffer({ command: "ls && rm x" })).toEqual({ kind: "never", command: "rm" });
    expect(standingOffer({ path: "a.md" })).toBeUndefined();
  });
});
