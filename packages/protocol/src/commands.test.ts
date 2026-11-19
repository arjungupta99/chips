import { describe, expect, it } from "vitest";
import {
  askedCommand,
  commandParts,
  commandStarts,
  NEVER_STANDING,
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

describe("the never list's holes (ADR 0300, addendum of 19 November 2026)", () => {
  const offer = (command: string) => standingOffer({ kind: "acp.bash", input: { command } });
  const part = (command: string) => commandParts(command)?.[0] ?? [];

  it("gives no Always whose start lets a worse command through", () => {
    // An Always on the first kept a start the second begins with, so the second went ahead.
    const kept: readonly (readonly [string, string, string])[] = [
      ["gh repo view o/x", "gh repo delete o/x --yes", "gh repo delete"],
      ["gh pr view 12", "gh pr merge 12 --admin", "gh pr merge"],
      ["gh release view v1", "gh release delete v1 --yes", "gh release delete"],
      ["kubectl get pods", "kubectl delete pod web-1", "kubectl delete"],
    ];
    for (const [first, second, listed] of kept) {
      const starts = offer(first);
      expect(starts?.kind, first).toBe("starts");
      if (starts?.kind !== "starts") continue;
      const lets = starts.starts.some((start) => startsWith(part(second), start));
      // `kubectl get` never began `kubectl delete`; the `gh` ones did.
      expect(lets, first).toBe(first.startsWith("gh"));
      expect(offer(second), second).toEqual({ kind: "never", command: listed });
    }
    // These took an Always themselves, for a start that runs anything.
    const never: readonly (readonly [string, string, string])[] = [
      ["gh api repos/o/r", "gh api -X DELETE repos/o/r", "gh api"],
      ["pnpm exec tsc", "pnpm exec rm -rf dist", "pnpm exec"],
      ["pnpm dlx cowsay hi", "pnpm dlx rimraf dist", "pnpm dlx"],
      ["npm exec -- eslint .", "npm exec -- rimraf dist", "npm exec"],
      ["yarn exec tsc", "yarn exec rm -rf dist", "yarn exec"],
      ["yarn dlx cowsay hi", "yarn dlx rimraf dist", "yarn dlx"],
      ["uv run pytest", "uv run rm -rf dist", "uv run"],
      ["docker run --rm alpine ls", "docker run -v /:/host alpine rm -rf /host/tmp", "docker run"],
      ["docker exec web ls", "docker exec web rm -rf /data", "docker exec"],
      ["kubectl exec web -- ls", "kubectl exec web -- rm -rf /data", "kubectl exec"],
      ["osascript -e 'return 1'", "osascript -e 'do shell script \"rm -rf x\"'", "osascript -e"],
      ["awk '{print $1}' a.txt", "awk 'BEGIN{system(\"rm -rf x\")}'", "awk"],
      ["git checkout main", "git checkout -- .", "git checkout"],
      ["git restore --staged a.txt", "git restore .", "git restore"],
      ["deno eval '1'", "deno eval 'Deno.removeSync(\"x\")'", "deno eval"],
      ["node -p '1+1'", 'node -p \'require("fs").rmSync("x")\'', "node -p"],
      ["node --print '1+1'", "node --print 'process.exit()'", "node --print"],
    ];
    for (const [first, second, listed] of never) {
      expect(offer(first), first).toEqual({ kind: "never", command: listed });
      expect(offer(second), second).toEqual({ kind: "never", command: listed });
    }
    // What they stand beside still takes one.
    expect(offer("gh repo view o/x")).toEqual({ kind: "starts", starts: [["gh", "repo"]] });
    expect(offer("git status && git log -3")).toEqual({
      kind: "starts",
      starts: [
        ["git", "status"],
        ["git", "log"],
      ],
    });
    expect(offer("pnpm test")).toEqual({ kind: "starts", starts: [["pnpm", "test"]] });
    expect(offer("node --check a.js")).toEqual({ kind: "starts", starts: [["node", "--check"]] });
  });

  it("matches an entry of three words in order, wherever they stand", () => {
    const never = (command: string) => neverStanding(commandParts(command) ?? []);
    expect(never("gh -R o/x repo delete --yes")).toBe("gh repo delete");
    expect(never("gh repo list")).toBeUndefined();
    expect(never("gh release list")).toBeUndefined();
    expect(never("gh pr checks 12")).toBeUndefined();
    // In order: `delete` before `repo` is some other command.
    expect(never("gh secret delete repo")).toBeUndefined();
    expect(NEVER_STANDING.every((entry) => entry.length >= 1 && entry.length <= 3)).toBe(true);
  });
});
