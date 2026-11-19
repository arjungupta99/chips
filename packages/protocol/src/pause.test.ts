import { describe, expect, it } from "vitest";
import { NEVER_STANDING } from "./commands.js";
import { askedForAWhile, NEVER_FOR_A_WHILE, neverForAWhile } from "./pause.js";

/** `${`, spelt so that a linter doesn't take a test's line for a template string. */
const B = ["$", "{"].join("");

describe("what a pause leaves to a person (ADR 0300)", () => {
  const asks = askedForAWhile;

  it("leaves a command on its list, read or not, and lets the rest go", () => {
    expect(neverForAWhile("ls -la && pnpm test")).toBe(false);
    expect(neverForAWhile("pnpm test 2>&1 | tail -5")).toBe(false);
    expect(neverForAWhile("echo $HOME > out.txt")).toBe(false);
    expect(neverForAWhile("git status && git diff")).toBe(false);
    expect(neverForAWhile("rm -rf build")).toBe(true);
    expect(neverForAWhile("cd x && git push origin main")).toBe(true);
    expect(neverForAWhile("for f in *.log; do rm $f; done")).toBe(true);
    expect(neverForAWhile("echo $(sudo cat /etc/hosts)")).toBe(true);
    expect(neverForAWhile("X=1 /bin/rm -f a")).toBe(true);
    expect(neverForAWhile(["git", "push"])).toBe(true);
    expect(neverForAWhile([])).toBe(false);
    // A program named like something every object has is only a program.
    expect(neverForAWhile("constructor x; toString; __proto__ y; hasOwnProperty")).toBe(false);
    // `git` alone, or a word that only looks like one, isn't.
    expect(neverForAWhile("echo git pushed > log; cat log")).toBe(false);
  });

  it("asks for each command on the pause's list, by its name", () => {
    const listed: readonly (readonly [string, string])[] = [
      ["rm -rf build", "rm"],
      ["rmdir build", "rmdir"],
      ["find . -name '*.tmp' -delete", "find -delete"],
      ["dd if=/dev/zero of=disk.img", "dd"],
      ["mkfs -t ext4 /dev/sdb1", "mkfs"],
      ["sudo ls", "sudo"],
      ["su -c ls", "su"],
      ["doas ls", "doas"],
      ["ssh host uptime", "ssh"],
      ["scp a host:b", "scp"],
      ["rsync -a a/ host:b/", "rsync"],
      ["git -C repo push origin main", "git push"],
      ["git reset --hard HEAD~1", "git reset"],
      ["git clean -fd", "git clean"],
      ["npm publish", "npm publish"],
      ["pnpm publish --access public", "pnpm publish"],
      ["yarn publish", "yarn publish"],
      ["gh api -X DELETE repos/o/r", "gh api"],
      ["gh repo delete o/x --yes", "gh repo delete"],
      ["gh pr merge 12 --admin", "gh pr merge"],
      ["gh release delete v1", "gh release delete"],
      ["kubectl delete pod web-1", "kubectl delete"],
      ["shutdown -h now", "shutdown"],
      ["reboot", "reboot"],
    ];
    for (const [command, name] of listed) expect(asks(command), command).toBe(name);
    // Each of them is on the never list too: what a pause asks about takes no Always either.
    const never = new Set(NEVER_STANDING.map((entry) => entry.join(" ")));
    for (const entry of NEVER_FOR_A_WHILE) expect(never.has(entry.join(" ")), entry[0]).toBe(true);
  });

  it("lets go what a pause already lets run: code handed to a program, a file written over", () => {
    const fine = [
      "python3 -c 'import os; print(os.getcwd())'",
      "node -e 'console.log(1)'",
      "perl -e 'print 1'",
      "sed -i '' s/a/b/ notes.txt",
      "cp a b && mv b c",
      "ls | tee out.txt",
      "awk '{print $1}' a.txt",
      "git checkout -b fix && git restore --staged a.txt",
      "gh repo view o/x && gh pr list",
      "kill 4242; pkill -f 'python3 app/server.py'",
      "chmod +x run.sh && ./run.sh",
      "make build && cargo test",
    ];
    for (const command of fine) expect(asks(command), command).toBeUndefined();
  });

  it("reads the program, not the words in a script's text", () => {
    // From the live history: a Python script that edits HTML, fed on its input.
    const script = [
      "python3 - <<'EOF'",
      "import time",
      's = open("sync.html").read()',
      's = s.replace("<dd>", \'<div class="v">\').replace("</dd>", "</div>")',
      "# rm the old markup, in no time; env(safe-area) stays",
      'open("sync.html", "w").write(s)',
      "EOF",
      'grep -n "kv" sync.html | head -12',
    ].join("\n");
    expect(asks(script)).toBeUndefined();
    expect(asks("cat > notes.txt <<'EOF'\nrm -rf build\ndd if=a of=b\ntime sudo ls\nEOF")).toBe(
      undefined,
    );
    expect(asks("cat >> log.txt <<EOF\ngit push failed at $(date)\nEOF\nls")).toBeUndefined();
    expect(asks("echo 'rm -rf build' && echo \"sudo git push\"")).toBeUndefined();
    expect(asks("grep -rn 'rm -rf' scripts | head")).toBeUndefined();
    expect(asks("ls # rm -rf build")).toBeUndefined();
    expect(asks("git commit -m 'rm the dd rows; ssh later'")).toBeUndefined();
    // The same words as programs, after the heredoc closes or beside it, ask.
    expect(asks("cat > notes.txt <<'EOF'\nhello\nEOF\nrm -rf build")).toBe("rm");
    expect(asks("python3 - <<'EOF' && rm -rf build\nprint(1)\nEOF")).toBe("rm");
    expect(asks("cat <<-EOF\n\thello\n\tEOF\ndd if=a of=b")).toBe("dd");
    expect(asks("time dd if=a of=b")).toBe("dd");
  });

  it("reads text a shell runs: a heredoc fed to a shell, and what a shell fills in", () => {
    expect(asks("bash <<'EOF'\ncd build\nrm -rf out\nEOF")).toBe("rm");
    expect(asks("bash -s <<EOF\ngit push\nEOF")).toBe("git push");
    expect(asks("bash <<'EOF'\ncd build\nls\nEOF")).toBeUndefined();
    expect(asks("sh <<< 'rm -rf out'")).toBe("rm");
    // Not quoted, a heredoc's text still runs its `$(…)` and backticks.
    expect(asks("cat <<EOF\n$(rm -rf out)\nEOF")).toBe("rm");
    expect(asks("cat <<EOF\n`git push`\nEOF")).toBe("git push");
    expect(asks("cat <<'EOF'\n$(rm -rf out)\nEOF")).toBeUndefined();
    expect(asks('echo "now $(sudo cat /etc/hosts)"')).toBe("sudo");
    expect(asks("echo `rm -rf out`")).toBe("rm");
    expect(asks("diff <(ssh host cat a) b")).toBe("ssh");
    expect(asks(["X=$", "{Y:-$(rm -rf out)}"].join(""))).toBe("rm");
    // A shell run on what is piped to it runs what Chips can't see; handed a file, it runs the file.
    expect(asks("echo 'ls' | sh")).toBe("a shell run on what is piped to it");
    expect(asks("cat setup.sh | bash -s -- fast")).toBe("a shell run on what is piped to it");
    expect(asks("bash setup.sh && zsh -l run.sh")).toBeUndefined();
    expect(asks("cat list.txt | bash sort.sh")).toBeUndefined();
  });

  it("takes quotes off before it looks, so a quoted program is still the program (B11)", () => {
    expect(asks("r''m -rf x > log.txt")).toBe("rm");
    expect(asks('"rm" -rf x')).toBe("rm");
    expect(asks("\\rm -rf x")).toBe("rm");
    expect(asks("'/bin/rm' -rf x")).toBe("rm");
    expect(asks("g'i't \"pu\"sh origin main 2>&1 | tail -3")).toBe("git push");
    expect(asks("ls; r\\\nm -rf x")).toBe("rm");
    expect(asks("( cd x && rm -rf y ) &")).toBe("rm");
    expect(asks("{ rm -rf y; } 2>/dev/null")).toBe("rm");
    expect(asks("if [ -d y ]; then rm -rf y; fi")).toBe("rm");
    expect(asks("clean() { rm -rf y; }; clean")).toBe("rm");
    expect(asks("! rm -rf y || true")).toBe("rm");
    expect(asks("case $1 in\n  clean) rm -rf y ;;\nesac")).toBe("rm");
  });

  it("reads a wrapper through to what it runs", () => {
    expect(asks("timeout 20 find /Users/a -path '*app/server.py' 2>/dev/null | head")).toBe(
      undefined,
    );
    expect(asks("timeout 20 find /tmp/x -delete")).toBe("find -delete");
    expect(asks("timeout -s KILL --kill-after 5 20 rm -rf x")).toBe("rm");
    expect(asks("timeout 20 pnpm test")).toBeUndefined();
    expect(asks("env FOO=1 BAR=2 rm x")).toBe("rm");
    expect(asks("env -u FOO node a.js")).toBeUndefined();
    expect(asks("env | grep PATH")).toBeUndefined();
    expect(asks("env -S 'rm -rf x'")).toBe("a command Chips can't follow");
    expect(asks("nice -n 10 git push")).toBe("git push");
    expect(asks("nohup python3 app/server.py > server.log 2>&1 &")).toBeUndefined();
    expect(asks("nohup rm -rf x &")).toBe("rm");
    expect(asks("time pnpm test")).toBeUndefined();
    expect(asks("time -p rm -rf x")).toBe("rm");
    expect(asks("command rm -rf x")).toBe("rm");
    expect(asks("command -v rm")).toBeUndefined();
    // A flag after the program is the program's own, not the wrapper's.
    expect(asks("command rm -v x")).toBe("rm");
    expect(asks("env FOO=1 sort -S 1G big.txt")).toBeUndefined();
    expect(asks("env FOO=1 rm -S x")).toBe("rm");
    expect(asks("exec rm -rf x")).toBe("rm");
    expect(asks("exec 3>&1")).toBeUndefined();
    expect(asks("nohup nice timeout 5 sudo ls")).toBe("sudo");
    // What runs a command it is given is read through too.
    expect(asks("git ls-files | xargs wc -l")).toBeUndefined();
    expect(asks("find . -name '*.tmp' | xargs rm")).toBe("rm");
    expect(asks("ls | xargs -n 1 -P 4 -I{} rm {}")).toBe("rm");
    expect(asks("ls | xargs -I % % --version")).toBe("a program Chips can't tell");
    expect(asks("find . -name '*.ts' -exec grep -l foo {} +")).toBeUndefined();
    expect(asks("find . -name '*.tmp' -exec rm {} ;")).toBe("rm");
    expect(asks("find . -type f -execdir {} ;")).toBe("a program Chips can't tell");
    expect(asks("pnpm exec tsc --noEmit")).toBeUndefined();
    expect(asks("pnpm exec rm -rf dist")).toBe("rm");
    expect(asks("npm exec -- rm -rf dist")).toBe("rm");
    expect(asks("npm exec -c 'rm -rf dist'")).toBe("rm");
    expect(asks("pnpm exec -c 'ls && rm -rf dist'")).toBe("rm");
    expect(asks("pnpm exec rm -c dist")).toBe("rm");
    expect(asks("npm exec -- tsc -c tsconfig.json")).toBeUndefined();
    expect(asks("uv run --with requests pytest")).toBeUndefined();
    expect(asks("uv run --with requests rm -rf dist")).toBe("rm");
    expect(asks("pnpm publish")).toBe("pnpm publish");
  });

  it("reads a string a shell is handed as a line of its own", () => {
    expect(asks("bash -lc 'cd x && pnpm test'")).toBeUndefined();
    expect(asks("bash -lc 'cd x && rm -rf y'")).toBe("rm");
    expect(asks(["bash", "-lc", "rm -rf y"])).toBe("rm");
    expect(asks(["/bin/zsh", "-c", "git status && git diff"])).toBeUndefined();
    expect(asks('sh -c "git push origin main"')).toBe("git push");
    expect(asks("bash -o pipefail -c 'ls | head'")).toBeUndefined();
    expect(asks("bash -c \"bash -c 'sudo ls'\"")).toBe("sudo");
    expect(asks("bash build.sh -c rm")).toBeUndefined();
    expect(asks("eval 'rm -rf y'")).toBe("rm");
    expect(asks("eval ls -la")).toBeUndefined();
    expect(asks("trap 'rm -rf \"$tmp\"' EXIT")).toBe("rm");
    expect(asks("trap - EXIT")).toBeUndefined();
    expect(asks("watch -n 5 'git push'")).toBe("git push");
    expect(asks("watch -d rm -rf y")).toBe("rm");
    expect(asks("watch -d ls -la")).toBeUndefined();
    // A string it can't read could be anything.
    expect(asks('eval "$CMD"')).toBe("a program Chips can't tell");
    expect(asks('bash -c "$1"')).toBe("a program Chips can't tell");
  });

  it("reads a name the line itself set, and asks where a program is one it didn't", () => {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    expect(asks(`C="${chrome}"; "$C" --headless --screenshot=a.png http://localhost:4173/`)).toBe(
      undefined,
    );
    expect(asks("S=../scratch/send.sh\n$S one; $S two")).toBeUndefined();
    expect(asks("X=rm; $X -rf y")).toBe("rm");
    expect(asks('export TOOL="git push"; $TOOL origin main')).toBe("git push");
    expect(asks("$CMD -rf y")).toBe("a program Chips can't tell");
    expect(asks('"$TOOL" --version')).toBe("a program Chips can't tell");
    expect(asks("$(which python3) build.py")).toBe("a program Chips can't tell");
    expect(asks("{rm,-rf,y}")).toBe("a program Chips can't tell");
    expect(asks("/bin/r? -rf y")).toBe("a program Chips can't tell");
    // Set twice, by a loop, or to something filled in, a name is not known.
    expect(asks("X=ls; X=rm; $X y")).toBe("a program Chips can't tell");
    expect(asks("X=ls; for X in rm; do $X y; done")).toBe("a program Chips can't tell");
    expect(asks("P=$(lsof -ti :4173); $P")).toBe("a program Chips can't tell");
    // Where the program is known, what it is handed may be filled in.
    expect(asks('P=$(lsof -ti :4173); echo "$P"; ls $DIR/*.log')).toBeUndefined();
    expect(asks('git -C "$REPO" log --oneline | head -5')).toBeUndefined();
    expect(asks("FOO=1 pnpm test")).toBeUndefined();
  });

  it("lets curl and wget go only to this machine", () => {
    expect(asks("curl -s http://localhost:4173/home.html")).toBeUndefined();
    expect(
      asks('curl -s -o /dev/null -w "%{http_code} home\\n" http://127.0.0.1:4175/api/status'),
    ).toBeUndefined();
    expect(
      asks(
        "curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- 'http://[::1]:3000/sync?since=1'",
      ),
    ).toBeUndefined();
    expect(asks("curl -fsSL --max-time=5 localhost:3000 127.0.0.1:3000/x")).toBeUndefined();
    expect(asks('U=http://127.0.0.1:4175; curl -s "$U/api/sync/key" | head -c 300')).toBe(
      undefined,
    );
    expect(asks('curl -s "http://localhost:$PORT/health?at=$NOW"')).toBeUndefined();
    expect(asks("wget -qO- http://localhost:8080/ | head")).toBeUndefined();
    // Anywhere else, or nowhere it can read.
    expect(asks("curl -sI https://example.com | head -1")).toBe("curl");
    expect(asks("curl -s https://adas-mac-mini.example.ts.net:8443/home.html")).toBe("curl");
    expect(asks("curl http://localhost.example.com/")).toBe("curl");
    expect(asks("curl http://localhost@example.com/")).toBe("curl");
    expect(asks("curl http://127.0.0.1.example.com/")).toBe("curl");
    expect(asks("curl -s http://localhost:3000/a https://example.com/b")).toBe("curl");
    expect(asks('curl -s "$URL"')).toBe("curl");
    expect(asks('curl -s "http://$HOST:3000/"')).toBe("curl");
    expect(asks("curl")).toBe("curl");
    expect(asks('H() { curl -s "$@"; }; H http://127.0.0.1:4175/x')).toBe("curl");
    expect(asks("wget https://example.com/install.sh")).toBe("wget");
    expect(asks("timeout 5 curl -s https://example.com")).toBe("curl");
    // A flag that could send it elsewhere, or one it doesn't know.
    expect(asks("curl --proxy http://example.com:8080 http://localhost:3000/")).toBe("curl");
    expect(asks("curl -x example.com:8080 http://localhost:3000/")).toBe("curl");
    expect(asks("curl --resolve localhost:80:203.0.113.9 http://localhost/")).toBe("curl");
    expect(asks("curl --connect-to ::example.com: http://localhost/")).toBe("curl");
    expect(asks("curl -K request.cfg http://localhost/")).toBe("curl");
    expect(asks("curl --url https://example.com http://localhost/")).toBe("curl");
  });

  it("gives up on a line too deep or too long to follow, and asks", () => {
    const deep = `${"echo $(".repeat(14)}ls${")".repeat(14)}`;
    expect(asks(deep)).toBe("a command Chips can't follow");
    expect(asks(`${"echo $(".repeat(3)}ls${")".repeat(3)}`)).toBeUndefined();
    expect(asks(`echo ${"a".repeat(200_001)}`)).toBe("a command Chips can't follow");
    // A quote or a bracket left open is read to the end, not refused.
    expect(asks("echo 'unclosed && rm -rf x")).toBeUndefined();
    expect(asks("echo $(rm -rf x")).toBe("rm");
    expect(asks("cat <<EOF\nnever closed")).toBeUndefined();
  });
});

describe("what the bypass check of 19 November found, each now asking", () => {
  const asks = askedForAWhile;
  const ask = (line: string) => expect(asks(line), line);

  it("reads a shell's flags written together, and a shell run on input it can't see", () => {
    ask("bash -eo pipefail -c 'rm -rf x'").toBe("rm");
    ask("bash -euo pipefail -c 'rm -rf x'").toBe("rm");
    ask("bash -co errexit 'rm -rf x'").toBe("rm");
    ask("zsh --emulate sh -c 'rm -rf x'").toBe("rm");
    ask("bash -eo pipefail -c 'pnpm test'").toBeUndefined();
    ask("echo 'rm -rf x' | bash -eo pipefail").toBe("a shell run on what is piped to it");
    ask("echo 'rm -rf x' | bash /dev/stdin").toBe("a shell run on what is piped to it");
    ask("echo 'rm -rf x' | bash -").toBe("a shell run on what is piped to it");
    ask("bash < <(echo 'rm -rf x')").toBe("a shell run on what is piped to it");
    ask("bash <(echo 'ls')").toBe("a program Chips can't tell");
    ask("echo 'rm -rf x' > >(bash)").toBe("a shell run on what is piped to it");
    ask("echo 'rm -rf x' | tee >(bash)").toBe("a shell run on what is piped to it");
    ask("source /dev/stdin <<< 'rm -rf x'").toBe("rm");
    ask(". <(echo 'ls')").toBe("a program Chips can't tell");
    ask("source .venv/bin/activate && pytest").toBeUndefined();
    ask('bash "$DIR/run.sh"').toBeUndefined();
    ask('bash "$SCRIPT"').toBe("a program Chips can't tell");
  });

  it("reads $'…' and $\"…\" as a shell does", () => {
    ask("bash -c $'\\x72m -rf x'").toBe("rm");
    ask("eval $'\\x72m -rf x'").toBe("rm");
    ask("$'\\162m' -rf x").toBe("rm");
    ask("echo $'\\'' ; rm -rf x #'").toBe("rm");
    ask("echo $'it\\'s done'; rm -rf build").toBe("rm");
    ask("echo $(echo $'a\\')' ; rm -rf x)").toBe("rm");
    ask('$"rm" -rf x').toBe("rm");
    ask("printf $'a\\tb\\n'").toBeUndefined();
  });

  it("reads a program however its name is spelt", () => {
    ask("RM -rf x").toBe("rm");
    ask("CURL https://example.com").toBe("curl");
    ask("{r..r}m -rf x").toBe("a program Chips can't tell");
    ask("{rm,-rf,x}").toBe("a program Chips can't tell");
    ask("{/bin/rm,-rf,x}").toBe("a program Chips can't tell");
    ask("/bin/r[m] -rf x").toBe("a program Chips can't tell");
    ask("X='/bin/r?'; $X -rf x").toBe("a program Chips can't tell");
    ask("=rm -rf x").toBe("rm");
    ask("X='rm -rf x'; $=X").toBe("a program Chips can't tell");
    ask("$~X -rf x; $^X y").toBe("a program Chips can't tell");
    ask(`echo $=X $~X ${B}=X}; ls`).toBeUndefined();
    ask("/bin/(r)m -rf x").toBe("a program Chips can't tell");
    ask("mkfs.ext4 /dev/sdb1").toBe("mkfs");
    // Where only the folder is filled in, the program's name is still known.
    ask('"$(git rev-parse --show-toplevel)/scripts/check.sh"').toBeUndefined();
    ask('"$(pnpm bin)/tsc" --noEmit').toBeUndefined();
    ask('"$TOOLS/rm" -rf x').toBe("rm");
    // The test command and an array's index are no globs.
    ask("[ -d build ] && ls build").toBeUndefined();
    ask("[[ -n $X ]] && ls").toBeUndefined();
    ask("a[0]=x rm -rf x").toBe("rm");
  });

  it("asks where a command's own word is filled in or spelt out of braces", () => {
    ask("git {push,} origin main").toBe("git push");
    ask("find . -name x {-delete,}").toBe("find -delete");
    ask("git $(echo push) origin main").toBe("a program Chips can't tell");
    ask("git $'\\x70ush' origin main").toBe("git push");
    ask("npm $(echo publish)").toBe("a program Chips can't tell");
    ask("gh $(echo api) /user").toBe("a program Chips can't tell");
    ask("gh repo $ACTION o/x").toBe("a program Chips can't tell");
    ask('git -C "$REPO" log --oneline -5').toBeUndefined();
    ask('gh pr view "$N"').toBeUndefined();
    ask('kubectl -n "$NS" get pods').toBeUndefined();
  });

  it("reads a name only where the line set it once, in its opening parts", () => {
    ask("X=echo; unset X; $X rm -rf x").toBe("a program Chips can't tell");
    ask("(X=echo); $X rm -rf x").toBe("a program Chips can't tell");
    ask("X=echo | true; $X rm -rf x").toBe("a program Chips can't tell");
    ask('true "$(X=echo)"; $X rm -rf x').toBe("a program Chips can't tell");
    ask("false && X=echo; $X rm -rf x").toBe("a program Chips can't tell");
    ask("f() { true; X=echo; }; $X rm -rf x").toBe("a program Chips can't tell");
    ask("X=r; X+=m; $X -rf x").toBe("a program Chips can't tell");
    ask(`X=; : ${B}X:=rm}; $X -rf x`).toBe("a program Chips can't tell");
    ask("X=echo; printf -v X rm; $X -rf x").toBe("a program Chips can't tell");
    ask("X=echo; eval X=; $X rm -rf x").toBe("a program Chips can't tell");
    ask("X=echo; echo rm | while read X; do $X -rf x; done").toBe("a program Chips can't tell");
    ask("X=echo; IFS= read -r X <<< rm; $X -rf x").toBe("a program Chips can't tell");
    ask("IFS=,; X=rm,-rf,x; $X").toBe("a program Chips can't tell");
    // Set once at the start, it is read.
    ask("U=http://127.0.0.1:4175; curl -s $U/api").toBeUndefined();
    ask("X=rm; $X -rf y").toBe("rm");
    // Set where the setting might not run, it may be empty: read only quoted on its own.
    ask(
      'cd shots && C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; "$C" --headless',
    ).toBe(undefined);
    ask(`cd shots && C=/bin/rm; "${B}C}" -rf x`).toBe("rm");
    ask("cd x && X=echo; $X rm -rf x").toBe("a program Chips can't tell");
    ask(`false && P=l; "${B}P}rm" -rf x`).toBe("a program Chips can't tell");
    ask("sleep 2 && U=http://127.0.0.1:4175; curl -s $U/api").toBe("curl");
  });

  it("finds what runs inside a list of values, zsh's =(…), and a heredoc whose word is a name", () => {
    ask("a=($(rm -rf x))").toBe("rm");
    ask("a+=(`rm -rf x`)").toBe("rm");
    ask(`files=($(ls *.ts)); echo ${B}#files[@]}`).toBeUndefined();
    ask("cat =(rm -rf x)").toBe("rm");
    ask("cat <<$X >/dev/null\nhello\n$X\nrm -rf x").toBe("rm");
    ask('cat <<"$X"\nhello\n$X\nrm -rf x').toBe("rm");
    ask("cat <<E*\nhello\nE*\nrm -rf x").toBe("rm");
  });

  it("closes $(…) where a shell does: past a comment, past a case pattern", () => {
    ask("echo \"$( # ) '\nrm -rf x\n#'\n)\"").toBe("rm");
    ask("echo $(case x in x) rm -rf x;; esac)").toBe("rm");
    ask("echo $(case x in x) ls;; esac) && pwd").toBeUndefined();
  });

  it("reads trap, alias, hash, mapfile and bash's newer forms", () => {
    ask("trap -- '-x;rm -rf x' EXIT").toBe("rm");
    ask("trap -p").toBeUndefined();
    ask("alias x='rm -rf'; x y").toBe("rm");
    ask("alias ll='ls -la'").toBeUndefined();
    ask("hash -p /bin/rm ls; ls -rf x").toBe("rm");
    ask("hash ls=/bin/rm; ls -rf x").toBe("rm");
    ask("mapfile -C 'rm -rf x' -c 1 a <<< y").toBe("rm");
    ask("{fd}>/dev/null rm -rf x").toBe("rm");
    ask("coproc X { rm -rf x; }").toBe("rm");
    ask("coproc rm -rf x").toBe("rm");
    ask(`echo ${B} rm -rf x; }`).toBe("rm");
    ask(`echo ${B}| rm -rf x; }`).toBe("rm");
  });

  it("reads env, xargs and find -exec with what they are handed", () => {
    ask("env -vS'rm -rf x'").toBe("a command Chips can't follow");
    ask("env -iS'rm -rf x'").toBe("a command Chips can't follow");
    ask("echo rm -rf x | xargs env").toBe("a program Chips can't tell");
    ask("echo rm -rf x | xargs nice").toBe("a program Chips can't tell");
    ask("echo rm -rf x | xargs timeout 5").toBe("a program Chips can't tell");
    ask("echo rm | xargs -I{} env {} -rf x").toBe("a program Chips can't tell");
    ask("find /bin -name rm -exec env {} -rf x ;").toBe("a program Chips can't tell");
    ask("printf 'rm -rf x' | xargs -0 sh -c").toBe("a program Chips can't tell");
    ask("echo 'rm -rf x' | xargs -I{} sh -c '{}'").toBe("a program Chips can't tell");
    ask("ls | xargs -I{} sh -c 'echo \"$1\"' _ {}").toBeUndefined();
    ask("find . -name '*.log' -exec sh -c 'rm \"$1\"' _ {} ;").toBe("rm");
    ask("echo http://example.com | xargs curl -s").toBe("curl");
  });

  it("reads a wrapper's length of time in any form, and the wrappers it missed", () => {
    ask("timeout .5 rm -rf x").toBe("rm");
    ask("timeout 1e3 rm -rf x").toBe("rm");
    ask("timeout 5m pnpm test").toBeUndefined();
    ask("arch -arm64 rm -rf x").toBe("rm");
    ask("arch -arm64 pnpm test").toBeUndefined();
    ask("setsid rm -rf x").toBe("rm");
    ask("xcrun git push").toBe("git push");
    ask("xcrun simctl list").toBeUndefined();
    ask("flock /tmp/l rm -rf x").toBe("rm");
    ask("flock /tmp/l -c 'git push'").toBe("git push");
    ask("script -q /dev/null rm -rf x").toBe("rm");
    ask("repeat 1 rm -rf x").toBe("rm");
    ask("noglob rm -rf x").toBe("rm");
    ask("nocorrect rm -rf x").toBe("rm");
    ask("true; - rm -rf x").toBe("rm");
    ask("{ true } always { rm -rf x }").toBe("rm");
  });

  it("finds a package runner's verb past its flags, and pnpm running a program", () => {
    ask("pnpm -C . exec rm -rf x").toBe("rm");
    ask("pnpm --silent exec rm -rf x").toBe("rm");
    ask("pnpm curl https://example.com").toBe("curl");
    ask("pnpm ssh somehost").toBe("ssh");
    ask("pnpm build && pnpm --filter web test").toBeUndefined();
    ask("pnpm rm left-pad").toBeUndefined();
    ask("npm x -c 'rm -rf x'").toBe("rm");
    ask("npm exec --call='rm -rf x'").toBe("rm");
    ask("npm exec --prefix . -c 'rm -rf x'").toBe("rm");
    ask("npx rimraf dist && npx -c 'rm -rf x'").toBe("rm");
    ask("npx prettier --check .").toBeUndefined();
    ask("uv -q run rm -rf x").toBe("rm");
    ask("uv run --color never rm -rf x").toBe("rm");
    ask("uv run --no-project --cache-dir ./c rm -rf x").toBe("rm");
    ask("uv run --unknown-flag value rm -rf x").toBe("rm");
    ask("uv run --no-project pytest -k rm").toBeUndefined();
  });

  it("reads what git runs of its own", () => {
    ask("git -c alias.p=push p origin main").toBe("a program Chips can't tell");
    ask("git -c help.autocorrect=immediate psuh").toBe("a program Chips can't tell");
    ask("git -c alias.x='!rm -rf x' x").toBe("a program Chips can't tell");
    ask("git config alias.p push && git p").toBe("a program Chips can't tell");
    ask("git submodule foreach 'git push'").toBe("git push");
    ask("git submodule foreach --recursive git pull").toBeUndefined();
    ask("git rebase -x 'rm -rf x' main").toBe("rm");
    ask("git rebase --exec='pnpm test' main").toBeUndefined();
    ask("git bisect run rm -rf x").toBe("rm");
    ask("git -c core.quotepath=off status").toBeUndefined();
  });

  it("sends curl and wget elsewhere when the line sets a proxy or where they read settings", () => {
    ask("http_proxy=http://proxy.example.com:8080 curl http://localhost:3000/").toBe("curl");
    ask("ALL_PROXY=socks5://example.com curl http://localhost:3000/").toBe("curl");
    ask("export HTTPS_PROXY=http://example.com; curl https://localhost:3000/").toBe("curl");
    ask("CURL_HOME=. curl http://localhost:3000/").toBe("curl");
    ask("HOME=/tmp/x curl http://localhost:3000/").toBe("curl");
    ask("env http_proxy=http://example.com curl http://localhost:3000/").toBe("curl");
    ask("WGETRC=./rc wget http://localhost:3000/").toBe("wget");
    // And this machine's other names, and the flags a wait-for loop uses.
    ask("curl -s http://0.0.0.0:3000/health").toBeUndefined();
    ask("curl -s http://127.0.0.2:3000/").toBeUndefined();
    ask("curl --retry 5 --retry-connrefused -sf http://localhost:3000/").toBeUndefined();
    ask("curl --noproxy '*' --create-dirs -o out/a.json http://localhost:3000/a").toBeUndefined();
  });
});
