/**
 * `tsc` emits the JavaScript and the declarations; the stylesheets beside them are copied by
 * hand, keeping their paths, so a published `dist/` holds the same tree `src/` does.
 */

import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

cpSync(SRC, DIST, {
  recursive: true,
  filter: (source) => source.endsWith(".css") || !source.includes("."),
});
console.log("Copied the stylesheets into dist/");
