import { describe, expect, it } from "vitest";
import {
  askedCommand,
  commandParts,
  commandStarts,
  neverStanding,
  standingOffer,
  startOf,
  startsWith,
} from "./commands.js";

/** Words of each part, joined, for reading a test at a glance. */
const read = (command: string) => commandParts(command)?.map((part) => part.join(" "));

describe("reading a command (ADR 0239)", () => {
  it("finds the command in an ask's input, a string or an array of words", () => {
    const shell = (input: unknown) => askedCommand({ kind: "shell.exec", input });
    expect(shell({ command: "ls -la", cwd: "/x" })).toBe("ls -la");
    expect(shell({ command: ["git", "status"] })).toEqual(["git", "status"]);
    expect(shell({ command: "  " })).toBeUndefined();
    expect(shell({ command: ["git", 4] })).toBeUndefined();
    expect(shell({ files: ["a"] })).toBeUndefined();
    // `input.command` is the command whatever the kind says.
    expect(askedCommand({ kind: "tool.call", input: { command: "ls" } })).toBe("ls");
    expect(askedCommand({ input: { command: "ls" } })).toBe("ls");
    expect(commandParts(["sh", "-c", "rm -rf x"])).toEqual([["sh", "-c", "rm -rf x"]]);
  });

  it("takes a shell's input as its command when it is the command line itself (addendum of 10 November 2026)", () => {
    // Jacobian's shell ask: the command line is the input, not `{ command }`.
    expect(askedCommand({ kind: "jacobian.shell.shell", input: "git log --oneline | head" })).toBe(
      "git log --oneline | head",
    );
    for (const kind of ["shell.exec", "acp.bash", "acp.execute", "x.zsh", "sh.run", "x.terminal"]) {
      expect(askedCommand({ kind, input: "ls" })).toBe("ls");
    }
    expect(askedCommand({ kind: "jacobian.shell.shell", input: "   " })).toBeUndefined();
    // A path or an address from an action that runs no shell is not a command; nor is a kind
    // whose word only begins like one.
    expect(askedCommand({ kind: "jacobian.filesystem.write", input: "/tmp/a.md" })).toBeUndefined();
    expect(
      askedCommand({ kind: "jacobian.browser.navigate", input: "https://x.y" }),
    ).toBeUndefined();
    expect(askedCommand({ kind: "jacobian.shellfish.eat", input: "ls" })).toBeUndefined();
    expect(askedCommand({ kind: "acp.executor_pick", input: "ls" })).toBeUndefined();
    expect(askedCommand({ input: "ls" })).toBeUndefined();
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
      ["pwd; ls -la /home/me/.claw; ls -la /home/me/.claw/chips", ["pwd", "ls -la"]],
      ['find /home/me/media/inbound -maxdepth 1 -type f -name "*4c75*"', ["find"]],
      ["python3 validate-report.py", ["python3 validate-report.py"]],
      ["rm /Users/me/acp/claude/second.txt && ls /Users/me/acp/claude", ["rm", "ls"]],
      ["curl -sI https://example.com | head -1", ["curl -sI", "head"]],
      [
        "grep -nE 'card|toolbar' game.js | grep -v data-index; node --check game.js && echo ok",
        ["grep -nE", "grep -v", "node --check", "echo"],
      ],
      [
        'cd /Users/me/room && git log --oneline -8 -- style.css; git status --short; grep -n "x" style.css | head -3',
        ["cd", "git log", "git status", "grep -n", "head"],
      ],
      [
        "cd /Users/me/Work/Chips/chips-main; ls -la; git log --oneline | wc -l; ls ../chips-notes ../chips-acp; cat package.json 2>/dev/null | head -60",
        ["cd", "git log", "wc -l", "ls", "cat", "head"],
      ],
      [
        "cd /Users/me; ls -la Chips Work 2>&1 | head -80; ls /Applications | grep -i chip; ls ~/Library/Application\\ Support | grep -i chip",
        ["cd", "head", "ls", "grep -i"],
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

  it("reads output thrown away or merged, and drops it from the words", () => {
    expect(read("ls 2>/dev/null")).toEqual(["ls"]);
    expect(read("ls 2> /dev/null")).toEqual(["ls"]);
    expect(read("ls -la x 2>&1 | head")).toEqual(["ls -la x", "head"]);
    expect(read("make >/dev/null 2>&1")).toEqual(["make"]);
    expect(read("make 1>/dev/null")).toEqual(["make"]);
    expect(read("node a.js &>/dev/null; pwd")).toEqual(["node a.js", "pwd"]);
    expect(read("echo oops >&2")).toEqual(["echo oops"]);
    expect(read("echo 2 >/dev/null")).toEqual(["echo 2"]);
    expect(read("cat 'a 2>/dev/null b'")).toEqual(["cat a 2>/dev/null b"]);
  });

  it("can't read what does more than run programs in a row", () => {
    for (const command of [
      "echo hi > out.txt",
      "echo hi 2> out.txt",
      "echo hi >> log.txt",
      "ls 2>/dev/nullx",
      "ls 3>/dev/null",
      "ls>/dev/null",
      "ls 2>&3",
      "ls 2>/dev/null)",
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
  it("remembers each part's program and the word that picks what it does, once each", () => {
    const parts = commandParts("grep -noE a x | sort | uniq -c | sort -k2 | sort");
    expect(parts === undefined ? undefined : commandStarts(parts)).toEqual([
      ["grep", "-noE"],
      ["sort"],
      ["uniq", "-c"],
    ]);
    const start = (command: string) => startOf(command.split(" ")).join(" ");
    expect(start("cat README.md")).toBe("cat");
    expect(start("cd /Users/me/room")).toBe("cd");
    expect(start("head -50")).toBe("head");
    expect(start("head -c 9000")).toBe("head -c");
    expect(start("echo ----")).toBe("echo");
    expect(start("ls")).toBe("ls");
    expect(start("ls -la")).toBe("ls -la");
    expect(start("sed -n 1,5p a")).toBe("sed -n");
    expect(start("git log --oneline")).toBe("git log");
    expect(start("git -C dir status")).toBe("git -C");
    expect(start("/usr/bin/git status")).toBe("/usr/bin/git status");
    expect(start("pnpm test")).toBe("pnpm test");
    expect(start("node --check a.js")).toBe("node --check");
    expect(start("node game.js")).toBe("node game.js");
    expect(start("python3 build.py")).toBe("python3 build.py");
    expect(start("npx prettier")).toBe("npx prettier");
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
    expect(never("cp a b")).toBe("cp");
    expect(never("ls && mv a b")).toBe("mv");
    expect(never("ls | tee out.txt")).toBe("tee");
    expect(never("sed -i '' s/a/b/ f")).toBe("sed -i");
    expect(never("sed -n 1p f")).toBeUndefined();
    expect(never("pnpm publish --access public")).toBe("pnpm publish");
    expect(never("npm test")).toBeUndefined();
  });

  it("says what a card's standing yes would remember, or why there is none", () => {
    const offer = (input: unknown) => standingOffer({ kind: "acp.bash", input });
    expect(offer({ command: "node --check game.js && echo ok" })).toEqual({
      kind: "starts",
      starts: [["node", "--check"], ["echo"]],
    });
    expect(offer({ command: "echo hi > x" })).toEqual({ kind: "unreadable" });
    expect(offer({ command: "cat package.json 2>/dev/null | head -60" })).toEqual({
      kind: "starts",
      starts: [["cat"], ["head"]],
    });
    expect(offer({ command: "ls && rm x" })).toEqual({ kind: "never", command: "rm" });
    expect(offer({ path: "a.md" })).toBeUndefined();
  });

  it("remembers a Jacobian shell command's starts, not the whole kind (addendum of 10 November 2026)", () => {
    const jacobian = (input: string) => standingOffer({ kind: "jacobian.shell.shell", input });
    expect(jacobian("git log --oneline | head -20")).toEqual({
      kind: "starts",
      starts: [["git", "log"], ["head"]],
    });
    expect(jacobian("rm -rf /tmp/hv")).toEqual({ kind: "never", command: "rm" });
    expect(jacobian("P=$(lsof -t -i :4199); kill $P")).toEqual({ kind: "unreadable" });
    // A file's path keeps what it kept: the kind, with no command to read.
    expect(
      standingOffer({ kind: "jacobian.filesystem.write", input: "/tmp/a.md" }),
    ).toBeUndefined();
  });
});
