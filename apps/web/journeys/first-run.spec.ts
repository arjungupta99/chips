/**
 * Onboarding on the built release (the install plan, §3.9; ADRs 0119–0122), one home walked in
 * order, as a person who has never had Chips walks it:
 *
 * - J1: installed and up, the browser paired and welcomed (ADR 0170), and a first agent brought in
 *   from the welcome by a link and its hello in its room, then the phone card — then the same by
 *   the card's other lines: `eval "$(chips join …)"` and the `curl` for anything with HTTP, each
 *   run exactly as the card shows it.
 * - J2: a harness that asks with a code (`chips join <address>`), allowed from the browser with a
 *   switch off; a device that asks to pair, allowed and listed.
 * - J4: Don't allow, and a link used twice, as `chips join` says them.
 * - J5: again and after a restart: still paired, every agent back with the key it kept.
 * - J6: uninstalled, with no file left.
 *
 * The times each step took are written beside the release as `journeys.json`. The scenario that
 * runs this with the rest of onboarding is `testing/scenarios/onboarding/first-run.md`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type Connected, connector } from "./connector.js";
import {
  asking,
  chips,
  filesUnder,
  freshHome,
  install,
  REPO,
  shell,
  stop,
  tarball,
  type Upped,
  up,
} from "./release.js";
import {
  askAsDevice,
  capabilitiesOf,
  exportsOf,
  type FourLines,
  helloLine,
  linesOf,
  poll,
} from "./ways.js";

const PORT = "4450";
const URL_HERE = `http://127.0.0.1:${PORT}`;
const HOME = freshHome();
const RELEASE = tarball();
const DATA =
  process.platform === "darwin"
    ? join(HOME, "Library", "Application Support", "Chips")
    : join(HOME, ".local", "share", "chips");
const times: Record<string, number> = {};
let server: Upped | undefined;
/** The agent J1 brings in, and the link it was brought in by. */
let agent: Connected | undefined;
let link = "";
/** The four lines the harness that asked with a code was handed. */
let askerLines: Record<string, string> = {};
// One browser for the whole walk: the one J1 pairs is the one J5 expects to stay paired.
let context: BrowserContext;
let page: Page;

/** Agents → Connect a harness → one of the gallery's ways, with its link made. */
async function addAnAgent(way: "own" | "http"): Promise<void> {
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page.getByRole("button", { name: "Connect a harness" }).click();
  await page.getByTestId(`join-way-${way}`).click();
  await expect(page.getByTestId("join-connect")).toHaveAttribute("data-link", /\/j\/chips_j_/);
}

/** The card follows the agent to its hello, gives way to its arrival (ADR 0190), and Say hello opens its room. */
async function helloSeen(text: string): Promise<void> {
  await expect(page.getByTestId("join-arrived")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("join-arrived-hello").click();
  await expect(page.getByTestId("messages").getByText(text, { exact: true })).toBeVisible();
}

const requestDialog = () => page.getByTestId("join-request-dialog");

async function timed<T>(step: string, work: () => Promise<T> | T): Promise<T> {
  const started = performance.now();
  const result = await work();
  times[step] = Math.round(performance.now() - started);
  return result;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
});

test.afterAll(async () => {
  agent?.chips.close();
  await context.close();
  await stop(server);
  writeFileSync(
    join(RELEASE, "..", "journeys.json"),
    `${JSON.stringify({ release: RELEASE, platform: `${process.platform}-${process.arch}`, ms: times }, null, 2)}\n`,
  );
});

test("J1: installed and up, the browser it opens is paired, with nothing else on the machine", async () => {
  const installed = await timed("install", () => install(HOME, RELEASE));
  expect(installed.status, installed.output).toBe(0);
  expect(installed.output).toContain("no Node needed");

  server = await timed("up", () => up(HOME, "--no-service", "--reach", "local", "--port", PORT));
  expect(server.said).toMatchObject({
    url: `http://127.0.0.1:${PORT}`,
    data_dir: DATA,
    service: "none",
    reach: "local",
    already_running: false,
    created: true,
    // Only this machine can reach it, so there is no code for a phone.
    phone_link: null,
  });
  // The workspace is where the platform keeps such things, not wherever chips was run from.
  expect(filesUnder(HOME)).toContain(join(DATA.slice(HOME.length + 1), "chips.db"));
  expect(filesUnder(HOME).some((file) => file.startsWith(".chips/"))).toBe(false);

  await timed("pair", async () => {
    await page.goto(String(server?.said["pair_link"]));
    await expect(page.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
  });
  // The code is gone from the address once read.
  expect(new URL(page.url()).hash).toBe("");

  // The welcome (ADR 0170): where Chips runs and the name to go by, from the account where the
  // machine says one, then the gallery.
  const welcome = page.getByTestId("first-run");
  await expect(welcome).toContainText("Chips is running on");
  await timed("welcome", async () => {
    const name = welcome.getByTestId("first-run-name-field");
    if ((await name.inputValue()) === "") await name.fill("Journey");
    await welcome.getByTestId("first-run-continue").click();
    await expect(welcome.getByTestId("join-way-own")).toBeVisible();
  });

  // The first agent (ADR 0122), from the welcome: a link, taken up by a connector on the SDK, and
  // the card following it to the agent's hello, with no token copied by hand.
  await timed("link", async () => {
    await welcome.getByTestId("join-way-own").click();
    await expect(page.getByTestId("join-sdk")).toBeVisible();
  });
  link = (await page.getByTestId("join-connect").getAttribute("data-link")) ?? "";
  expect(link).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${PORT}/j/chips_j_`));
  agent = await timed("hello", async () => {
    const joined = await connector(link, HOME, true);
    // The link's three steps, as the phone draws them (ADR 0257), to the last: it said hello.
    await expect(page.getByTestId("join-steps-hello")).toHaveAttribute("data-state", "done", {
      timeout: 20_000,
    });
    return joined;
  });
  await page.getByTestId("join-open-room").click();
  await expect(welcome).toHaveCount(0);
  await expect(
    page.getByTestId("messages").getByText("Hello from the journey agent."),
  ).toBeVisible();
  await expect(page.getByTestId("setup-hello")).toHaveAttribute("data-done", "true");

  // Then the phone. Up for this machine alone, no phone could reach it, and the card says so.
  const phone = page.getByTestId("phone-offer");
  await expect(phone).toContainText("answers only this computer");
  await expect(phone.getByRole("img")).toHaveCount(0);
  await phone.getByTestId("phone-offer-later").click();
  await expect(phone).toHaveCount(0);
});

test("J1, in any language: the card's shell line, run as shown, joins; its hello is a curl", async () => {
  await addAnAgent("own");
  await page.getByTestId("join-shell-tab").click();
  const line = (await page.getByTestId("join-shell").textContent()) ?? "";
  expect(line).toMatch(/^eval "\$\(chips join http:\/\/127\.0\.0\.1:4450\/j\/chips_j_[\w-]+\)"$/);
  const ran = await timed("shell line", () =>
    shell(HOME, `${line}\n${helloLine("Hello from a shell.")}`),
  );
  expect(ran.status, ran.stderr).toBe(0);
  expect(JSON.parse(ran.stdout)).toMatchObject({ duplicate: false });
  await helloSeen("Hello from a shell.");
});

test("J1, anything with HTTP: the card's curl, run as shown, is the key; Advanced is still there", async () => {
  await addAnAgent("http");
  const line = (await page.getByTestId("join-curl").textContent()) ?? "";
  const ran = await timed("curl", () => shell(HOME, line));
  expect(ran.status, ran.stderr).toBe(0);
  const answer = JSON.parse(ran.stdout) as Record<string, unknown>;
  expect(answer).toMatchObject({ kind: "harness", url: URL_HERE, capabilities: ["autonomy"] });
  const hello = shell(HOME, helloLine("Hello over HTTP."), linesOf(answer));
  expect(hello.status, hello.stderr).toBe(0);
  await helloSeen("Hello over HTTP.");

  // Today's token and four lines, for whoever wants them.
  await addAnAgent("http");
  await page.getByTestId("join-advanced").click();
  await expect(page.getByLabel("Name")).toBeVisible();
  await page.keyboard.press("Escape");
  // The card goes, and its gallery stays beside the list (ADR 0284's addendum, point 4).
  await expect(page.getByTestId("add-harness-card")).toBeHidden();
  await expect(page.getByTestId("join-gallery")).toBeVisible();
});

test("J2: a harness asks with a code, and the browser allows it with its switch off", async () => {
  const asker = asking(HOME, URL_HERE, "--name", "Asker");
  const code = await asker.code;
  await timed("code allowed", async () => {
    await expect(requestDialog().getByText("Asker wants to join")).toBeVisible({ timeout: 20_000 });
    await expect(requestDialog().getByTestId("join-code")).toHaveText(code);
    await expect(requestDialog()).toContainText("chips join");
    await requestDialog().getByTestId("join-cap-autonomy").getByRole("switch").click();
    await requestDialog().getByTestId("join-allow").click();
  });
  const ended = await asker.done;
  expect(ended.status, ended.stderr).toBe(0);
  askerLines = exportsOf(ended.stdout);
  expect(Object.keys(askerLines)).toEqual([
    "CHIPS_URL",
    "CHIPS_HARNESS_ID",
    "CHIPS_HARNESS_TOKEN",
    "CHIPS_SPACE_ID",
  ]);
  expect(askerLines["CHIPS_URL"]).toBe(URL_HERE);
  // Granted what was left on, which is nothing; nobody ran `chips declare`.
  expect(await capabilitiesOf(askerLines as FourLines)).toEqual([]);
  // Decided, in the phone's words (ADR 0271): it joined.
  await expect(requestDialog().getByTestId("join-decided")).toContainText("Asker joined");
  await requestDialog().getByRole("button", { name: "Done" }).click();
  await expect(requestDialog()).toBeHidden();
});

test("J2, a device: it asks to pair, is allowed, and is among this person's devices", async () => {
  const phone = await askAsDevice(URL_HERE, "Test phone");
  await expect(requestDialog().getByText("Test phone wants to pair")).toBeVisible({
    timeout: 20_000,
  });
  // The device shows its code, and the person types it here (SEC-6).
  await requestDialog().getByTestId("join-code-field").fill(phone.code);
  await requestDialog().getByTestId("join-allow").click();
  let paired: Record<string, unknown> = {};
  await expect
    .poll(async () => {
      const polled = await poll(URL_HERE, phone);
      paired = polled.body;
      return polled.status;
    })
    .toBe(200);
  expect(paired).toMatchObject({ kind: "device", url: URL_HERE });
  await expect(requestDialog().getByTestId("join-decided")).toContainText("Test phone is paired");
  await requestDialog().getByRole("button", { name: "Done" }).click();
  await page.getByTestId("you").click();
  await expect(page.getByTestId("device-row").filter({ hasText: "Test phone" })).toHaveCount(1);
});

test("J4: Don't allow, and a link used twice, are refusals chips join says", async () => {
  const pest = asking(HOME, URL_HERE, "--name", "Pest");
  const code = await pest.code;
  await expect(requestDialog().getByTestId("join-code")).toHaveText(code, { timeout: 20_000 });
  await requestDialog().getByTestId("join-deny").click();
  await expect(requestDialog()).toBeHidden();
  const refused = await pest.done;
  expect(refused.status).toBe(1);
  expect(refused.stdout).toBe("");
  expect(refused.stderr).toContain("A person said no");

  const twice = chips(HOME, "join", link, "--name", "Second agent");
  expect(twice.status).toBe(1);
  expect(twice.output).toContain("It was used already");
});

test("J5: run again it only pairs another browser; restarted, the first is still paired", async ({
  browser,
}) => {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await expect(page.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });

  const again = await timed("up again", () => up(HOME, "--port", PORT));
  expect(again.said).toMatchObject({ already_running: true, created: false, reach: null });
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto(String(again.said["pair_link"]));
  await expect(other.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
  await second.close();
  await stop(again);

  agent?.chips.close();
  await stop(server);
  server = await timed("restart", () =>
    up(HOME, "--no-service", "--reach", "local", "--port", PORT),
  );
  expect(server.said).toMatchObject({ created: false, already_running: false });
  await page.reload();
  await expect(page.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Pairing code")).toHaveCount(0);

  // The agent comes back with the key it kept: the spent link is never asked for again.
  const back = await timed("reconnect", () => connector(link, HOME, false));
  expect(back.harnessId).toBe(agent?.harnessId);
  agent = back;

  // So does the one that asked with a code: the same four lines, and nobody is asked.
  const kept = chips(HOME, "join", URL_HERE, "--name", "Asker");
  expect(kept.status, kept.output).toBe(0);
  expect(exportsOf(kept.output)).toEqual(askerLines);
  await expect(requestDialog()).toHaveCount(0);
});

test("J6: uninstalled with its workspace, it leaves no file behind", async () => {
  agent?.chips.close();
  agent = undefined;
  await stop(server);
  server = undefined;
  const doctor = chips(HOME, "doctor");
  // The release's own version, as its build stamped it from the root package.json.
  const { version } = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
    version: string;
  };
  expect(doctor.output).toContain(`chips ${version},`);
  const gone = await timed("uninstall", () => chips(HOME, "uninstall", "--yes", "--remove-data"));
  expect(gone.status, gone.output).toBe(0);
  expect(gone.output).toContain("Chips is uninstalled");
  expect(filesUnder(HOME)).toEqual([]);
});
