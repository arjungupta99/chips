/**
 * Which node Xcode's script phases run, from `ios/.xcode.env.local`, and whether it will still be
 * there. Pure, so it is tested (`tools/guardrails/phone-node.test.ts`) without Homebrew.
 *
 * Why it exists: React Native writes that file once, when it is missing, naming the node it ran
 * from, which is Homebrew's folder for that one version (`/opt/homebrew/Cellar/node/26.0.0/…`).
 * The next `brew upgrade` deletes the folder, and the build dies in a Pods phase, "[Hermes]
 * Replace Hermes for the right configuration", saying only `node: No such file or directory`
 * (16 October 2026, node 26.0.0 to 26.11.1).
 */

/** Homebrew's own links to whichever node it has now, which outlive every upgrade. */
export const STEADY_NODES = ["/opt/homebrew/bin/node", "/usr/local/bin/node"];

const LINE = /^export NODE_BINARY=(.*)$/m;

/**
 * What is wrong with the node the file names: `gone`, or `pinned` to one version's folder; else
 * nothing. A file that leaves it to the shell (`$(command -v node)`) is the shell's to get right.
 */
export function nodeTrouble(envText, exists) {
  const path = LINE.exec(envText)?.[1]?.trim();
  if (path === undefined || path === "" || path.includes("$")) return undefined;
  if (!exists(path)) return { path, trouble: "gone" };
  if (/\/Cellar\/node[^/]*\//.test(path)) return { path, trouble: "pinned" };
  return undefined;
}

/** The file naming `path` for node, and everything else in it as it was. */
export function withNode(envText, path) {
  const line = `export NODE_BINARY=${path}`;
  if (LINE.test(envText)) return envText.replace(LINE, line);
  return `${envText}${envText === "" || envText.endsWith("\n") ? "" : "\n"}${line}\n`;
}
