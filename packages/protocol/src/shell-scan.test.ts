import { describe, expect, it } from "vitest";
import { FILLED, scanCommands } from "./shell-scan.js";

/** Each command's words, joined, with `␀` where the shell fills something in. */
const words = (line: string) =>
  scanCommands(line)?.map((command) => command.words.join(" ").replaceAll(FILLED, "␀"));

/** `${`, spelt so that a linter doesn't take the test's line for a template string. */
const B = ["$", "{"].join("");

/** One command of the line, by its program. */
const one = (line: string, program: string) =>
  scanCommands(line)?.find((command) => command.words[0] === program);

describe("finding the commands in a line (ADR 0300, addendum of 19 November 2026)", () => {
  it("finds each command of a chain, a group, a loop and a function", () => {
    expect(words("a && b || c; d | e & f\ng")).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(words("( cd x && ls ) ; { pwd; }")).toEqual(["cd x", "ls", "{ pwd", "}"]);
    expect(words("for f in a b; do cat $f; done")).toEqual(["for f in a b", "do cat ␀", "done"]);
    expect(words("build() { make all; }; build")).toEqual(["build", "{ make all", "}", "build"]);
    expect(words("case $1 in\n  a) one ;;\n  b|c) two ;;\nesac")).toEqual([
      "case ␀ in",
      "a",
      "one",
      "b",
      "c",
      "two",
      "esac",
    ]);
    expect(words("")).toEqual([]);
    expect(words("  \n\n ; ")).toEqual([]);
  });

  it("says which commands something is piped into", () => {
    const piped = (line: string) => scanCommands(line)?.map((command) => command.piped);
    expect(piped("a | b |& c || d && e")).toEqual([false, true, true, false, false]);
  });

  it("takes quotes and backslashes off, the way a shell does", () => {
    expect(scanCommands("echo 'a  b' \"c d\" e\\ f ''")?.[0]?.words).toEqual([
      "echo",
      "a  b",
      "c d",
      "e f",
      "",
    ]);
    expect(words("r''m -rf x; \"r\"'m' y; \\rm z")).toEqual(["rm -rf x", "rm y", "rm z"]);
    expect(words('echo "say \\"hi\\" for \\$5 \\\\ and \\n"')).toEqual([
      'echo say "hi" for $5 \\ and \\n',
    ]);
    expect(words("ls \\\n  -la")).toEqual(["ls -la"]);
    expect(words('echo "a\\\nb"')).toEqual(["echo ab"]);
    expect(words("echo a\\")).toEqual(["echo a"]);
    expect(words("echo 'never closed && rm x")).toEqual(["echo never closed && rm x"]);
    expect(words('echo "never closed && rm x')).toEqual(["echo never closed && rm x"]);
  });

  it("leaves a comment out, but not a `#` inside a word", () => {
    expect(words("ls # rm -rf x\npwd #")).toEqual(["ls", "pwd"]);
    expect(words("echo a#b c # d")).toEqual(["echo a#b c"]);
    expect(words("# only a comment")).toEqual([]);
  });

  it("leaves a redirection's file out of the command's words", () => {
    expect(words("ls 2>&1 >&2 > out.txt < in.txt >> more.txt 2> err.txt 10>&1")).toEqual(["ls"]);
    expect(words("make &> out.log && make &>> out.log; echo x >| f; cat <> f")).toEqual([
      "make",
      "make",
      "echo x",
      "cat",
    ]);
    expect(words('echo x > "$OUT/a b.txt" y; echo z>file')).toEqual(["echo x y", "echo z"]);
    // A number is part of the redirection only when it is the whole word before it.
    expect(words("cmd x2>y")).toEqual(["cmd x2"]);
    expect(words("echo >")).toEqual(["echo"]);
  });

  it("marks what a shell fills in, and scans what runs inside it", () => {
    expect(words(`echo $HOME ${B}HOME} $1 $? $@ ${B}x:-y} $ 5`)).toEqual(["echo ␀ ␀ ␀ ␀ ␀ ␀ $ 5"]);
    expect(words('echo "cost: $" "$USER\'s"')).toEqual(["echo cost: $ ␀'s"]);
    expect(words("ls *.ts file?.md '*.ts' \"?\"")).toEqual(["ls ␀.ts file␀.md *.ts ?"]);
    // What runs inside comes first, then the command it stands in.
    expect(words("echo $(date +%s) done")).toEqual(["date +%s", "echo ␀ done"]);
    expect(words('echo "on `hostname -s` now"')).toEqual(["hostname -s", "echo on ␀ now"]);
    expect(words("echo `echo \\`date\\``")).toEqual(["date", "echo ␀", "echo ␀"]);
    expect(words("echo `date")).toEqual(["date", "echo ␀"]);
    expect(words("echo $((1 + 2))")).toEqual(["1 + 2", "echo ␀"]);
    expect(words("diff <(sort a) <(sort b) > >(tee log)")).toEqual([
      "sort a",
      "sort b",
      "tee log",
      "diff ␀ ␀",
    ]);
    expect(words(`X=${B}Y:-$(whoami)} ls`)).toEqual(["whoami", "X=␀ ls"]);
    // Quotes and backslashes inside the brackets don't close them.
    expect(words("echo $(echo \")\" ')' \\) ; date) end")).toEqual([
      "echo ) ) )",
      "date",
      "echo ␀ end",
    ]);
    expect(words('echo $(echo "x')).toEqual(["echo x", "echo ␀"]);
    expect(words("arr=(rm -rf x); echo ok")).toEqual(["arr=␀", "echo ok"]);
  });

  it("reads `$'…'` with its escapes, as a shell does", () => {
    expect(words("printf $'plain'")).toEqual(["printf plain"]);
    expect(words("printf $'a\\tb' x")).toEqual(["printf a\tb x"]);
    expect(words("$'\\x72m' $'\\162m' $'\\u0072m' $'\\U00000072m' $'\\cA' $'\\q'")).toEqual([
      "rm rm rm rm \u0001 \\q",
    ]);
    expect(words("echo $'it\\'s' x")).toEqual(["echo it's x"]);
    expect(words("echo \"$'not one'\"")).toEqual(["echo $'not one'"]);
    expect(words("echo $'never closed")).toEqual(["echo never closed"]);
  });

  it("reads a name where the line set it once, as written", () => {
    expect(words(`U=http://localhost:3000; curl "$U/api" ${B}U}/x`)).toEqual([
      "U=http://localhost:3000",
      "curl http://localhost:3000/api http://localhost:3000/x",
    ]);
    // Outside quotes a value is split into words; an empty one is no word.
    expect(scanCommands('A="x  y"; E=; echo $A "$A" $E end')?.[2]?.words).toEqual([
      "echo",
      "x",
      "y",
      "x  y",
      "end",
    ]);
    expect(words("export A=1 B=2; local C=3; echo $A$B$C")).toEqual([
      "export A=1 B=2",
      "local C=3",
      "echo 123",
    ]);
    // Not known: set twice, to something filled in, by a loop or `read`, or only for one command.
    expect(words("A=1; A=2; echo $A")?.at(-1)).toBe("echo ␀");
    expect(words("A=$(date); echo $A")?.at(-1)).toBe("echo ␀");
    expect(words("A=1; for A in x y; do echo $A; done")?.at(-2)).toBe("do echo ␀");
    expect(words("A=1; read -r A; echo $A")?.at(-1)).toBe("echo ␀");
    expect(words("A=1 env; echo $A")?.at(-1)).toBe("echo ␀");
    expect(words("declare -x A=1; echo $A")?.at(-1)).toBe("echo ␀");
  });

  it("keeps a heredoc's text apart, as what its command is fed", () => {
    const fed = one("python3 - <<'EOF' | tail -1\nimport os\nprint('rm -rf')\nEOF\nls", "python3");
    expect(fed?.fed).toEqual(["import os\nprint('rm -rf')"]);
    expect(words("python3 - <<'EOF' | tail -1\nimport os\nprint('rm -rf')\nEOF\nls")).toEqual([
      "python3 -",
      "tail -1",
      "ls",
    ]);
    // Two on one line, in order; `<<-` drops the tabs before its closing word.
    const two = one("cat <<A <<-'B'\none\nA\n\ttwo\n\tB\nls", "cat");
    expect(two?.fed).toEqual(["one", "\ttwo"]);
    expect(words("cat <<A <<-'B'\none\nA\n\ttwo\n\tB\nls")).toEqual(["cat", "ls"]);
    expect(one('cat << "END"\n$(x)\nEND', "cat")?.fed).toEqual(["$(x)"]);
    expect(one("cat <<\\END\n$(x)\nEND", "cat")?.fed).toEqual(["$(x)"]);
    expect(one("wc -c <<< 'a b'", "wc")).toMatchObject({ words: ["wc", "-c"], fed: ["a b"] });
    // Left open, it runs to the end; opened on the last line, it has no text.
    expect(one("cat <<EOF\nnever closed\nrm x", "cat")?.fed).toEqual(["never closed\nrm x"]);
    expect(one("cat <<EOF", "cat")?.fed).toEqual([""]);
  });

  it("scans what a heredoc runs when its closing word isn't quoted", () => {
    expect(words("cat <<EOF\nnow $(date) and `whoami`\nEOF")).toEqual(["cat", "date", "whoami"]);
    expect(words("cat <<EOF\nnot \\$(date), but `who\nEOF")).toEqual(["cat", "who"]);
    expect(words("cat <<'EOF'\nnow $(date) and `whoami`\nEOF")).toEqual(["cat"]);
  });

  it("stops following past a depth, and says so", () => {
    const nested = (depth: number) => `${"echo $(".repeat(depth)}ls${")".repeat(depth)}`;
    expect(scanCommands(nested(12))).toHaveLength(13);
    expect(scanCommands(nested(13))).toBeUndefined();
  });
});
