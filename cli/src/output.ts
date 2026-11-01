/**
 * How the CLI talks.
 *
 * Two rules, both from the blueprint's voice and from M2.1's own wording — `chips connect`
 * "explains what it will change, then writes". First: say what is about to happen to somebody's
 * machine before it happens, in the plainest terms, and stop if they say no. Second: a failure
 * names the fix, not the stack.
 *
 * Everything is written through an injected pair of streams so a test reads what a person would
 * have seen rather than capturing the process's own.
 */

export interface Console {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  /** Yes or no, at a terminal. Non-interactive callers answer from a flag instead. */
  readonly confirm: (question: string) => Promise<boolean>;
}

export function systemConsole(): Console {
  return {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    async confirm(question) {
      process.stdout.write(`${question} [y/N] `);
      const answer = await new Promise<string>((resolve) => {
        process.stdin.setEncoding("utf8");
        process.stdin.once("data", (chunk) => resolve(String(chunk)));
        process.stdin.resume();
      });
      process.stdin.pause();
      return /^y(es)?$/i.test(answer.trim());
    },
  };
}

/** A console that answers every question the same way, for `--yes` and for tests. */
export function scriptedConsole(answer: boolean): Console & { readonly lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
    confirm: async (question) => {
      lines.push(`${question} [y/N] ${answer ? "y" : "n"}`);
      return answer;
    },
  };
}

/** A heading with a rule under it, so a wall of output has shape. */
export function heading(title: string): string {
  return `\n  ${title}\n  ${"─".repeat(title.length)}`;
}

/** `  key   value`, aligned, for the facts a command reports. */
export function facts(rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `    ${key.padEnd(width)}   ${value}`).join("\n");
}
