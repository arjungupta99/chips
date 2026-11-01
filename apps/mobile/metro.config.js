/**
 * Metro, taught two things about this monorepo.
 *
 * One: the workspace is above the app, so the bundler must watch it and look for modules in
 * both the app's `node_modules` and the root's — pnpm links the shared packages into the
 * former and hoists nothing into the latter that the app should shadow.
 *
 * Two: `@chipschat/core`, `@chipschat/protocol`, `@chipschat/subtle` and `@chipschat/tunnel` are consumed as
 * TypeScript sources, and they are written for NodeNext, where a relative import of a sibling
 * spells the file `./link.js` even though `link.ts` is what is on disk. Node resolves that;
 * Metro takes a relative specifier literally and would not find it. So a relative `.js` that
 * is not there, from inside one of our packages, is tried as `.ts` before the default resolver
 * is asked. It is deliberately narrow: only our own sources, only when the `.ts` exists.
 */

const fs = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const packagesRoot = path.join(workspaceRoot, "packages") + path.sep;

const config = getDefaultConfig(__dirname);

config.watchFolders = [workspaceRoot];
// The app's own, then the root's. Hierarchical lookup stays **on**, which pnpm needs: each of
// our packages keeps its dependencies in its own `node_modules` beside it, so `@chipschat/subtle`
// finds `@noble/ciphers` by walking up from its own source and nowhere else. Turning it off —
// the usual advice for a Yarn or npm workspace — makes those unresolvable.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath;
  if (
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    typeof origin === "string" &&
    origin.startsWith(packagesRoot)
  ) {
    const asTypeScript = path.resolve(path.dirname(origin), `${moduleName.slice(0, -3)}.ts`);
    if (fs.existsSync(asTypeScript)) {
      return { type: "sourceFile", filePath: asTypeScript };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
