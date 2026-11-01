/**
 * Layer rules for Chips, encoding technical-plan section 6.1.
 *
 * The dependency direction is inward only:
 *
 *   protocol -> domain -> application -> infrastructure -> interfaces
 *
 * `packages/platform` sits beside the layers, not inside them: it holds the typed
 * configuration, the logger, metrics, ids and the clock. Anything may import it; it
 * may import nothing of ours. That keeps cross-cutting concerns from becoming a
 * back door through which an outer layer reaches an inner one.
 */

/** Physical homes of each layer. Kept here so a rule reads like the plan. */
const LAYER = {
  protocol: "^packages/protocol/",
  domain: "^server/src/domain/",
  application: "^server/src/application/",
  infrastructure: "^server/src/infrastructure/",
  interfaces: "^(server/src/interfaces/|cli/)",
  platform: "^packages/platform/",
};

/**
 * Modules a bundler invents at build time and no resolver can find on disk. Astro's content
 * collections are the reason this list exists; anything added to it needs a sentence saying why.
 */
const VIRTUAL_MODULES = "^(astro:|virtual:|content\\.d\\.ts$)";

/** A stylesheet. Packages export these beside `index.ts`, so they are not deep imports. */
const STYLESHEET = "\\.css$";

/** Frameworks the domain layer must never see. It is pure, and stays pure. */
const FRAMEWORKS = [
  "hono",
  "ws",
  "kysely",
  "better-sqlite3",
  "pg",
  "pino",
  "sharp",
  "react",
  "vite",
  "@hono/.+",
  "@opentelemetry/.+",
];

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "A cycle means the layers are not layers. Break it at the inward-most edge.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolvable",
      severity: "error",
      comment: "An import that does not resolve is a broken build waiting for a different machine.",
      from: {},
      to: { couldNotResolve: true, pathNot: VIRTUAL_MODULES },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment: "Shipped code may not lean on a devDependency.",
      from: { path: "^(packages|server|cli|apps|adapters|relay)/", pathNot: TEST_LIKE() },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "not-to-unlisted-dep",
      severity: "error",
      comment:
        "Every import of something outside the repository is declared in the importing package's " +
        "package.json. Workspace links are exempt because dependency-cruiser resolves them through " +
        "their symlink and reports `undetermined`; Biome's correctness/noUndeclaredDependencies is " +
        "what checks those against package.json.",
      from: {},
      to: {
        dependencyTypes: ["unknown", "undetermined", "npm-no-pkg", "npm-unknown"],
        pathNot: ["^(packages|server|cli|apps|adapters|relay|examples|tools)/", VIRTUAL_MODULES],
      },
    },
    {
      name: "no-deprecated-core",
      severity: "error",
      comment: "Deprecated Node core modules are removed sooner than we would like.",
      from: {},
      to: { dependencyTypes: ["core"], path: "^(punycode|domain|sys|constants|_.*)$" },
    },

    // ---- layer rules, outward imports forbidden ----
    {
      name: "protocol-is-innermost",
      severity: "error",
      comment: "packages/protocol holds schemas. It imports no layer of ours (plan 6.1).",
      from: { path: LAYER.protocol },
      to: {
        path: `(${LAYER.domain}|${LAYER.application}|${LAYER.infrastructure}|${LAYER.interfaces}|^apps/)`,
      },
    },
    {
      name: "domain-not-to-outer",
      severity: "error",
      comment:
        "The domain layer never imports application, infrastructure or interfaces (plan 6.1).",
      from: { path: LAYER.domain },
      to: { path: `(${LAYER.application}|${LAYER.infrastructure}|${LAYER.interfaces})` },
    },
    {
      name: "domain-not-to-framework",
      severity: "error",
      comment:
        "The domain layer is pure: policy, state machines and invariants, with no framework in sight (plan 6.1).",
      // Two shapes: an installed package resolves inside node_modules, and one that is not
      // installed stays a bare specifier. Matching both keeps the rule honest wherever it runs.
      from: { path: LAYER.domain },
      to: {
        path: `((^|/)node_modules/(${FRAMEWORKS.join("|")})/|^(${FRAMEWORKS.join("|")})$)`,
      },
    },
    {
      name: "application-not-to-outer",
      severity: "error",
      comment: "Use cases depend on ports, not on the adapters that implement them (plan 6.1).",
      from: { path: LAYER.application },
      to: { path: `(${LAYER.infrastructure}|${LAYER.interfaces})` },
    },
    {
      name: "infrastructure-not-to-interfaces",
      severity: "error",
      comment: "Adapters do not reach back into routes, socket handlers or the CLI (plan 6.1).",
      from: { path: LAYER.infrastructure },
      to: { path: LAYER.interfaces },
    },
    {
      name: "platform-imports-nothing-of-ours",
      severity: "error",
      comment:
        "packages/platform is a leaf. If it needs a domain type, the dependency is pointing the wrong way.",
      from: { path: LAYER.platform },
      to: {
        path: "^(packages/(?!platform)|server/|cli/|apps/|adapters/|relay/|examples/)",
      },
    },

    {
      name: "subtle-imports-nothing-of-ours",
      severity: "error",
      comment:
        "packages/subtle is WebCrypto and nothing else: it replaces a runtime's own, so it can " +
        "know nothing about Chips. Its only dependencies are the noble packages.",
      from: { path: "^packages/subtle/" },
      to: { path: "^(packages/(?!subtle)|server/|cli/|apps/|adapters/|relay/|examples/)" },
    },

    {
      name: "clients-not-to-server",
      severity: "error",
      comment:
        "packages/ui and packages/core belong to the clients: they import the protocol and nothing else of ours. " +
        "A component that needs a server type is a component that should take a prop.",
      from: { path: "^packages/(ui|core)/" },
      to: {
        path: "^((server|cli|relay|apps|adapters|examples)/|packages/(platform|sdk-[^/]+|conformance)/)",
      },
    },
    {
      name: "mobile-not-to-ui-or-server",
      severity: "error",
      comment:
        "The phone app is React Native: packages/ui is the web's components and would not render. " +
        "It takes the same core, protocol and subtle the web app takes, and nothing from the " +
        "server, the CLI or the relay.",
      from: { path: "^apps/mobile/" },
      to: { path: "^(packages/(ui|platform|sdk-[^/]+|conformance)/|server/|cli/|relay/)" },
    },
    {
      name: "server-not-to-clients",
      severity: "error",
      comment:
        "Nothing under server/, cli/ or relay/ renders anything, so none of it imports packages/ui or packages/core.",
      from: { path: "^(server|cli|relay)/" },
      to: { path: "^packages/(ui|core)/" },
    },
    {
      name: "ui-and-core-are-siblings",
      severity: "error",
      comment:
        "The design system takes props; the client core holds state. Neither imports the other, so mobile can share core without dragging the web components along.",
      from: { path: "^packages/(ui|core)/" },
      to: { path: "^packages/(ui|core)/", pathNot: "^packages/$1/" },
    },

    // ---- module boundaries ----
    {
      name: "no-deep-import-into-package",
      severity: "error",
      comment:
        "Every package exposes an index.ts. Reaching past it couples callers to a file layout (plan 6.1).",
      // A stylesheet a package lists in its `exports` — `@chipschat/ui/styles.css` — is an entry
      // point in its own right, not a reach past `index.ts`; a `.ts` module never is.
      from: { pathNot: "^packages/" },
      to: {
        path: "^packages/[^/]+/src/(?!index\\.ts$)",
        pathNot: ["^packages/[^/]+/fixtures/", STYLESHEET],
      },
    },
    {
      name: "no-deep-import-between-packages",
      severity: "error",
      comment: "Same rule, applied between packages.",
      from: { path: "^packages/([^/]+)/" },
      to: {
        path: "^packages/[^/]+/src/(?!index\\.ts$)",
        pathNot: ["^packages/$1/", "^packages/[^/]+/fixtures/", STYLESHEET],
      },
    },
  ],

  options: {
    // `doNotFollow`, not `exclude`: an npm package stays in the graph as an edge so rules
    // can see it, but its own imports are not walked.
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        "(^|/)(dist|coverage|target|\\.turbo|\\.astro|\\.git|test-results|playwright-report)(/|$)",
        // An agent's worktree under `.claude` is a second checkout of this repository with no
        // node_modules of its own, so crawling it makes every import in it unresolvable and
        // reddens this check for whoever else is working here.
        "(^|/)\\.claude(/|$)",
        // Documentation, and the fixtures that prove these rules bite.
        "^(docs|tools)/",
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "node", "default"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      mainFields: ["module", "main", "types"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

/** Test and config files are allowed to use devDependencies; product code is not. */
function TEST_LIKE() {
  // `e2e/` and `visual/` are Playwright's: everything in them, spec or helper, is a test.
  // `.vitest.ts` is the phone app's, which tells its Vitest suite from its Jest one by name.
  return "(\\.(test|spec|vitest)\\.[jt]sx?$|(^|/)(test|tests|__tests__|bench|scripts|e2e|visual)/|\\.config\\.m?[jt]s$)";
}
