/**
 * Connecting a harness from its card, on the built release (ADR 0218), from a home with no Node:
 *
 * - J7: installed and up, the gallery has the cards the release carries (HS-1); each one-line
 *   card's line, run as copied, fetches its bridge from a stand-in npm registry serving the
 *   bridges' packed tarballs, checks it, runs it on the Node Chips carries, and stops at the
 *   bridge's own check for its harness, which isn't here, with the link still good. Uninstalled,
 *   nothing is left, bridges and all.
 * - J8: the card's line as a browser shows it, for another computer, `curl … |
 *   CHIPS_JOIN_LINK='<link>' sh -s -- connect <id>`, on a second bare home: Chips installed and the
 *   harness connected in one go; run again, the install is skipped.
 *
 * The bridges are each repository's `npm run release` tarball: `CHIPS_JOURNEY_BRIDGES` names a
 * folder of them, or they are found beside this checkout under ~/Work/Chips. Without one for every
 * card, the journey is skipped and says which are missing. Nothing here names a harness: the cards,
 * their ids and their packages are read from the release.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type StandInRegistry, standInRegistry } from "../../../tools/connect-kit/registry.mts";
import {
  chips,
  filesUnder,
  freshHome,
  install,
  REPO,
  shell,
  shellAsync,
  stop,
  tarball,
  type Upped,
  up,
} from "./release.js";

const PORT = "4452";
const HOME = freshHome();
const RELEASE = tarball();
/** What a card's line runs with on a machine with no harness: never a real login service. */
const RUN_WITH = { CHIPS_KEEP: "off" } as const;
/** The bridges' sentence when what they need isn't there: the link is spent only once joined. */
const STILL_GOOD = "The link is still good";

interface Card {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly command?: string;
  readonly package?: string;
}

/** The cards the release carries, as its server and `chips connect` read them. */
function releaseCards(): readonly Card[] {
  const file = join(HOME, ".local", "lib", "chips", "current", "connectors", "connectors.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { connectors: Card[] }).connectors;
}

/** `@chipschat/hermes@1` → `@chipschat/hermes`. */
const packageName = (spec: string) => spec.replace(/@\d+$/, "");

/** Each bridge's newest packed tarball: from `CHIPS_JOURNEY_BRIDGES`, else beside this checkout. */
function bridgeTarballs(): readonly string[] {
  // biome-ignore lint/style/noProcessEnv: the journeys are told where the bridges were packed.
  const given = process.env["CHIPS_JOURNEY_BRIDGES"];
  const beside = join(homedir(), "Work", "Chips");
  const folders =
    given !== undefined && given !== ""
      ? [given]
      : existsSync(beside)
        ? readdirSync(beside, { withFileTypes: true })
            .filter((each) => each.isDirectory())
            .flatMap((each) => [join(beside, each.name), join(beside, each.name, "bridge")])
        : [];
  return folders
    .filter((folder) => existsSync(folder))
    .flatMap((folder) =>
      readdirSync(folder)
        .filter((file) => /^chipschat-.*\.tgz$/.test(file))
        .map((file) => join(folder, file)),
    )
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/** The newest tarball of each package, by the name in its own package.json. */
function newestOfEach(tarballs: readonly string[]): Map<string, string> {
  const newest = new Map<string, string>();
  for (const path of tarballs) {
    const text = execFileSync("tar", ["-xzOf", path, "package/package.json"], { encoding: "utf8" });
    const { name } = JSON.parse(text) as { name: string };
    if (!newest.has(name)) newest.set(name, path);
  }
  return newest;
}

/**
 * The release and install.sh served as GitHub's releases and `chipschat.ai/install` serve them,
 * SHA256SUMS signed (SEC-36). The release key never leaves Arjun's Mac, so the journey signs with a
 * key of its own, and the install.sh it serves carries that key in its place: the one line changed.
 */
async function releaseHost(): Promise<{ readonly url: string; readonly server: Server }> {
  const file = basename(RELEASE);
  const version = /^chips-(.+)-[a-z]+-[a-z0-9]+\.tar\.gz$/.exec(file)?.[1] ?? "";
  const bytes = readFileSync(RELEASE);
  const sum = createHash("sha256").update(bytes).digest("hex");
  const keys = mkdtempSync(join(tmpdir(), "chips-journey-key-"));
  const key = join(keys, "release-key");
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "journey", "-f", key]);
  const sums = join(keys, "SHA256SUMS");
  writeFileSync(sums, `${sum}  ${file}\n`);
  execFileSync("ssh-keygen", ["-Y", "sign", "-q", "-f", key, "-n", "chips-release", sums]);
  const pub = readFileSync(`${key}.pub`, "utf8").trim().split(" ").slice(0, 2).join(" ");
  const script = readFileSync(join(REPO, "packaging", "install.sh"), "utf8").replace(
    /^SIGNER='[^']+'$/m,
    `SIGNER='release@chipschat.ai namespaces="chips-release" ${pub}'`,
  );
  const files: Record<string, () => Buffer> = {
    [file]: () => bytes,
    SHA256SUMS: () => readFileSync(sums),
    "SHA256SUMS.sig": () => readFileSync(`${sums}.sig`),
  };
  const routes: Record<string, () => Buffer | string> = { "/install": () => script };
  for (const [name, read] of Object.entries(files)) {
    routes[`/latest/download/${name}`] = read;
    routes[`/download/v${version}/${name}`] = read;
  }
  const server = createServer((request, response) => {
    const route = routes[request.url ?? ""];
    if (route === undefined) response.writeHead(404).end();
    else response.writeHead(200).end(route());
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, server };
}

const NEEDED = (() => {
  try {
    return [...new Set(bridgeCardsOf(cardsInRepo()).map((card) => packageName(card.package)))];
  } catch {
    return [];
  }
})();
const TARBALLS = newestOfEach(bridgeTarballs());
const MISSING = NEEDED.filter((name) => !TARBALLS.has(name));

/** The cards in this checkout, which the release under test was built from. */
function cardsInRepo(): readonly Card[] {
  const file = join(REPO, "apps", "docs", "public", "connectors.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { connectors: Card[] }).connectors;
}

function bridgeCardsOf(cards: readonly Card[]): (Card & { package: string; command: string })[] {
  return cards.filter(
    (card): card is Card & { package: string; command: string } =>
      card.kind === "one-line" && card.package !== undefined && card.command !== undefined,
  );
}

let server: Upped | undefined;
let registry: StandInRegistry | undefined;
let context: BrowserContext;
let page: Page;

test.describe.configure({ mode: "serial" });
test.skip(
  MISSING.length > 0,
  `No packed tarball for ${MISSING.join(", ")}: run \`npm run release\` in each bridge's repository, or set CHIPS_JOURNEY_BRIDGES to a folder of them.`,
);

test.beforeAll(async ({ browser }) => {
  registry = await standInRegistry([...TARBALLS.values()]);
  context = await browser.newContext();
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await stop(server);
  await registry?.stop();
});

/**
 * What the installer's line opens with, which installs Chips where it isn't (ADR 0218), the link
 * in the environment (SEC-50).
 */
const INSTALLER =
  /^curl -fsSL https:\/\/chipschat\.ai\/install \| (CHIPS_JOIN_LINK='[^']+') sh -s -- /;

/**
 * A card's line, as the gallery shows a browser it to copy, with a fresh link in it: the
 * installer's, for the computer where the harness runs (phase 5).
 */
async function lineOf(card: Card): Promise<string> {
  await page.getByTestId(`join-card-${card.id}`).click();
  const shown = page.getByTestId("join-command");
  await expect(shown).toContainText("/j/chips_j_");
  const line = ((await shown.textContent()) ?? "").trim();
  expect(line).toMatch(INSTALLER);
  return line;
}

/** The card's own line inside the installer's, for a machine that has Chips already. */
const ownLine = (line: string) => line.replace(INSTALLER, "$1 chips ");

test("J7: installed and up with no Node, the gallery has the cards the release carries", async () => {
  const installed = install(HOME, RELEASE);
  expect(installed.status, installed.output).toBe(0);
  // Nothing on this home's PATH is a Node: whatever runs a bridge here is the one Chips carries.
  expect(shell(HOME, "command -v node").status).not.toBe(0);

  server = await up(HOME, "--no-service", "--reach", "local", "--port", PORT);
  await page.goto(String(server.said["pair_link"]));
  const welcome = page.getByTestId("first-run");
  await expect(welcome).toBeVisible({ timeout: 20_000 });
  const name = welcome.getByTestId("first-run-name-field");
  if ((await name.inputValue()) === "") await name.fill("Journey");
  await welcome.getByTestId("first-run-continue").click();

  const cards = releaseCards();
  expect(cards).toHaveLength(5);
  await expect(welcome.locator('[data-testid^="join-card-"]')).toHaveCount(cards.length);
  for (const card of cards) await expect(welcome.getByTestId(`join-card-${card.id}`)).toBeVisible();
});

test("J7: each card's line fetches its bridge, runs it on Chips's Node, and stops at its harness", async () => {
  const cards = bridgeCardsOf(releaseCards());
  expect(cards.length).toBeGreaterThan(0);
  const exported = { ...RUN_WITH, CHIPS_NPM_REGISTRY: registry?.url ?? "" };
  for (const card of cards) {
    const line = ownLine(await lineOf(card));
    expect(line).toMatch(
      new RegExp(
        `^CHIPS_JOIN_LINK='http://127\\.0\\.0\\.1:${PORT}/j/chips_j_[\\w-]+' chips connect ${card.id}$`,
      ),
    );
    const ran = await shellAsync(HOME, line, exported);
    const said = `${ran.stdout}${ran.stderr}`;
    expect(ran.status, said).toBe(1);
    // Downloaded the first time a package is asked for, and here already for a second card of it.
    expect(ran.stdout, said).toContain(packageName(card.package));
    expect(ran.stderr, said).toContain(STILL_GOOD);

    // Its steps, as the Mac's sheet will read them: here already, checked for, and its sentence.
    const json = await shellAsync(HOME, `${line} --json`, exported);
    const lines = json.stdout
      .trim()
      .split("\n")
      .map((each) => JSON.parse(each) as Record<string, unknown>);
    // Here already, checked for (by Chips, then by the bridge in its own words), and stopped.
    const steps = lines.map((each) => each["step"]);
    expect(steps[0]).toBe("downloading");
    expect(steps.at(-1)).toBe("failed");
    expect([...new Set(steps.slice(1, -1))]).toEqual(["checking"]);
    expect(lines[0]).toMatchObject({ package: packageName(card.package), reused: true });
    expect(String(lines.at(-1)?.["sentence"])).toContain(STILL_GOOD);
    await page.getByTestId("first-run-back").click();
  }
  // Each package was downloaded once, however many cards share it.
  const downloads = (registry?.asked() ?? []).filter((path) => path.includes("/-/"));
  expect(downloads).toHaveLength(new Set(cards.map((card) => card.package)).size);
});

test("J8: the curl line with connect, on a second bare home, installs Chips and connects", async () => {
  const card = bridgeCardsOf(releaseCards())[0];
  if (card === undefined) throw new Error("The release carries no bridge's card.");
  const line = await lineOf(card);
  const host = await releaseHost();
  const other = freshHome();
  try {
    // The card's line as given, its installer fetched from the stand-in host.
    const curl = line.replace("https://chipschat.ai/install", `${host.url}/install`);
    const exported = {
      ...RUN_WITH,
      CHIPS_DOWNLOAD_BASE: host.url,
      CHIPS_NPM_REGISTRY: registry?.url ?? "",
    };
    const first = await shellAsync(other, curl, exported);
    expect(first.status, `${first.stdout}${first.stderr}`).toBe(1);
    expect(first.stdout).toContain("✓ Checked its signature");
    expect(first.stdout).toContain("✓ Checked its SHA-256");
    expect(first.stdout).toMatch(/✓ Installed chips \S+ in .*\/\.local\/bin\/chips/);
    expect(first.stdout).toContain(`Downloading ${packageName(card.package)}`);
    expect(first.stdout).not.toContain("Next: chips up");
    expect(first.stderr).toContain(STILL_GOOD);

    const again = await shellAsync(other, curl, exported);
    expect(again.status, `${again.stdout}${again.stderr}`).toBe(1);
    expect(again.stdout).toMatch(/chips \S+ is here already/);
    expect(again.stdout).not.toContain("Downloading chips-");
    expect(again.stdout).toContain(`${packageName(card.package)}`);
    expect(again.stdout).toContain("is on this machine already");

    const gone = chips(other, "uninstall", "--yes", "--remove-data");
    expect(gone.status, gone.output).toBe(0);
    expect(filesUnder(other)).toEqual([]);
  } finally {
    await new Promise((done) => host.server.close(done));
  }
});

test("J7: uninstalled, nothing is left, the bridges with the rest", async () => {
  await stop(server);
  server = undefined;
  const bridges = filesUnder(HOME).filter((file) => file.includes("/bridges/"));
  expect(bridges.length).toBeGreaterThan(0);
  const gone = chips(HOME, "uninstall", "--yes", "--remove-data");
  expect(gone.status, gone.output).toBe(0);
  expect(filesUnder(HOME)).toEqual([]);
});
