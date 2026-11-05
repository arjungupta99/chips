/**
 * What the end-to-end specs share: the demo's details, a fresh pairing, and a harness played by
 * the test itself over Node's own WebSocket — one event at a time, every frame kept — so a
 * spec can drive the browser and the harness from the same place and assert after each step.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

const DATA_DIR = process.env["CHIPS_E2E_DATA_DIR"];
if (DATA_DIR === undefined) throw new Error("run this through playwright.config.ts");
const DEMO_FILE = join(DATA_DIR, "demo.json");
export const SERVER_PORT = process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432";
export const SERVER = `http://127.0.0.1:${SERVER_PORT}`;
export const WEB_PORT = process.env["CHIPS_E2E_WEB_PORT"] ?? "5174";
export const WEB = `http://127.0.0.1:${WEB_PORT}`;
/** The production build, served beside the dev server (`playwright.config.ts`). */
export const BUILD = `http://127.0.0.1:${process.env["CHIPS_E2E_BUILD_PORT"] ?? "5175"}`;
export const RELAY_PORT = process.env["CHIPS_E2E_RELAY_PORT"] ?? "4433";
export const RELAY = `ws://127.0.0.1:${RELAY_PORT}`;

export interface Demo {
  workspace_id: string;
  space_id: string;
  person: { id: string; displayName: string };
  harness: { id: string; token: string };
}

export function demo(): Demo {
  return JSON.parse(readFileSync(DEMO_FILE, "utf8")) as Demo;
}

export async function freshCode(): Promise<string> {
  const response = await fetch(`${SERVER}/v1/dev/pairing-code`, { method: "POST" });
  if (!response.ok) throw new Error(`pairing-code endpoint answered ${response.status}`);
  return ((await response.json()) as { code: string }).code;
}

export interface Specialist {
  id: string;
  name: string;
  token: string;
  /** The direct space the person shares with it, which a lane routed to it comes home to. */
  space: string;
}

/**
 * A second harness with a token and a direct space, so a lane can be routed to a real one; the
 * demo person's unless `ownerId` names another person (M3.3). It takes the dial unless
 * `capabilities` says what it declares instead (ADR 0077).
 */
export async function registerSpecialist(
  name = "Ledger",
  ownerId?: string,
  capabilities?: readonly string[],
): Promise<Specialist> {
  const response = await fetch(`${SERVER}/v1/dev/harnesses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      count: 1,
      display_name: name,
      ...(ownerId === undefined ? {} : { owner_id: ownerId }),
      ...(capabilities === undefined ? {} : { capabilities }),
    }),
  });
  if (!response.ok) throw new Error(`dev/harnesses answered ${response.status}`);
  const { harnesses } = (await response.json()) as {
    harnesses: { harness_id: string; display_name: string; token: string; space_id: string }[];
  };
  const one = harnesses[0];
  if (one === undefined) throw new Error("dev/harnesses returned nothing");
  return { id: one.harness_id, name: one.display_name, token: one.token, space: one.space_id };
}

/**
 * A harness's Main agent in its Main space with the demo person, as a bridge seats one: the
 * default agent Chips made in a new harness's direct space, registered by the harness's id as the
 * lead (ADR 0183), and the space named its home (ADR 0069). Send feedback's Write it with offers
 * it (ADR 0237).
 */
export async function seatMainAgent(
  name: string,
): Promise<{ harness: Specialist; spaceId: string }> {
  const harness = await registerSpecialist(`${name}'s harness`, undefined, ["agents"]);
  const asHarness = (path: string, body: unknown) =>
    fetch(`${SERVER}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const main = await asHarness(`/v1/harnesses/${harness.id}/agents`, {
    key: harness.id,
    name,
    lead: true,
  });
  if (!main.ok) throw new Error(`registering the Main agent answered ${main.status}`);
  const home = await asHarness(`/v1/harnesses/${harness.id}/events`, {
    type: "space.updated",
    space_id: harness.space,
    home: true,
    idempotency_key: `home-${newRunId()}`,
  });
  if (!home.ok) throw new Error(`naming the Main space answered ${home.status}`);
  return { harness, spaceId: harness.space };
}

export interface Person {
  id: string;
  name: string;
  /** The pairing code a second browser pairs with. */
  code: string;
}

/** A second person in the workspace, the dev-mode stand-in for an invite (M3.3). */
export async function registerPerson(name = "Dana"): Promise<Person> {
  const response = await fetch(`${SERVER}/v1/dev/people`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: name }),
  });
  if (!response.ok) throw new Error(`dev/people answered ${response.status}`);
  const body = (await response.json()) as { person_id: string; display_name: string; code: string };
  return { id: body.person_id, name: body.display_name, code: body.code };
}

export type Frame = Record<string, unknown>;

export function eventType(frame: Frame): unknown {
  return (frame["event"] as Frame | undefined)?.["type"];
}

/** A harness on the wire, played by the test: one socket, every frame kept, one event at a time. */
export class Harness {
  readonly frames: Frame[] = [];
  private readonly waiters: {
    match: (frame: Frame) => boolean;
    resolve: (frame: Frame) => void;
  }[] = [];
  /** Frames a `next()` has already handed out, so the same event is never returned twice. */
  private readonly taken = new Set<Frame>();
  private sequence = 0;

  private constructor(
    private readonly socket: WebSocket,
    /** The run its `send`s belong to. A lane's specialist learns its own from `run.requested`. */
    public runId: string,
    /**
     * The space its `send`s post into. The demo space unless a specialist names its home; a
     * harness added to a room learns it from `membership.added` (M3.3).
     */
    public space: string,
  ) {}

  /**
   * Connect a harness played by the test. Defaults to the demo harness in the demo space; a
   * lane's specialist passes its own `token` and `space` (its home), so one spec can drive both
   * the lead and the specialist over their own sockets.
   */
  static async connect(
    runId: string,
    options: {
      token?: string;
      space?: string;
      since?: number;
      /** Frames beyond events it takes down its socket, as its `hello` says: `context` (ADR 0134). */
      accepts?: readonly string[];
    } = {},
  ): Promise<Harness> {
    const details = demo();
    const token = options.token ?? details.harness.token;
    const url = `ws://127.0.0.1:${SERVER_PORT}/v1/ws?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    const harness = new Harness(socket, runId, options.space ?? details.space_id);
    socket.addEventListener("message", (message) => harness.receive(String(message.data)));
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("the harness's socket failed")));
    });
    socket.send(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "e2e", version: "0.0.0" },
        ...(options.accepts === undefined ? {} : { accepts: [...options.accepts] }),
      }),
    );
    await harness.waitFor((frame) => eventType(frame) === "hello", "hello");
    socket.send(
      JSON.stringify({
        frame: "subscribe",
        workspace_id: details.workspace_id,
        // Replay from here first, as a harness coming back after a restart does.
        ...(options.since === undefined ? {} : { since: options.since }),
      }),
    );
    return harness;
  }

  private receive(raw: string): void {
    const frame = JSON.parse(raw) as Frame;
    if (frame["frame"] === "ping") {
      this.socket.send(JSON.stringify({ frame: "pong", ts: frame["ts"] }));
      return;
    }
    this.frames.push(frame);
    for (const waiter of [...this.waiters]) {
      if (waiter.match(frame)) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(frame);
      }
    }
  }

  waitFor(match: (frame: Frame) => boolean, what: string, timeoutMs = 10_000): Promise<Frame> {
    const already = this.frames.find(match);
    if (already !== undefined) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), timeoutMs);
      this.waiters.push({
        match,
        resolve: (frame) => {
          clearTimeout(timer);
          resolve(frame);
        },
      });
    });
  }

  /** The first event of a type, however long ago it arrived. */
  event(type: string): Promise<Frame> {
    return this.waitFor((frame) => eventType(frame) === type, type).then(
      (frame) => frame["event"] as Frame,
    );
  }

  /** The next event of a type that no earlier `next()` has handed out. */
  async next(type: string): Promise<Frame> {
    const frame = await this.waitFor(
      (each) => eventType(each) === type && !this.taken.has(each),
      `another ${type}`,
    );
    this.taken.add(frame);
    return frame["event"] as Frame;
  }

  /** Send one event into the run and wait for the server's answer: the ack, or the refusal. */
  async send(type: string, payload: Frame): Promise<Frame> {
    this.sequence += 1;
    const key = `e2e-${this.runId}-${this.sequence}`;
    this.socket.send(
      JSON.stringify({
        frame: "event",
        event: {
          type,
          space_id: this.space,
          run_id: this.runId,
          idempotency_key: key,
          ...payload,
        },
      }),
    );
    return this.waitFor(
      (frame) =>
        (frame["frame"] === "ack" || frame["frame"] === "error") &&
        frame["idempotency_key"] === key,
      `an answer for ${type}`,
    );
  }

  close(): void {
    this.socket.close();
  }
}

/** A fresh run id, the way a harness mints one: a ULID with the run prefix. */
export function newRunId(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let id = "01K4ZQPX";
  for (let i = 0; i < 18; i += 1) id += alphabet[Math.floor(Math.random() * 32)];
  return `run_${id}`;
}

export function newApprovalId(): string {
  return newRunId().replace(/^run_/, "apr_");
}

export function newLaneId(): string {
  return newRunId().replace(/^run_/, "lane_");
}

/**
 * An invite link opened in a browser, as somebody it was sent to opens it: at the relay's page
 * (ADR 0207), since these servers have a relay, then on to the server's own join page by "Join in
 * this browser", where a browser on the server's network goes.
 */
export async function openInvite(page: Page, url: string): Promise<void> {
  await page.goto(url);
  if (!new URL(url).pathname.startsWith("/join")) return;
  await expect(page.getByRole("heading", { name: "Join on Chips" })).toBeVisible();
  await page.getByRole("link", { name: "Join in this browser" }).click();
}

/**
 * A link that asks (ADR 0232), allowed on the page of whoever sent it: the joining page shows six
 * digits and waits, the sender's page asks with the same six, and Allow lets the joiner in; Done
 * puts the dialog away.
 */
export async function allowFrom(sender: Page, joining: Page, title: RegExp): Promise<void> {
  const shown = joining.getByTestId("waiting-code");
  await expect(shown).toBeVisible({ timeout: 20_000 });
  const code = (await shown.textContent()) ?? "";
  expect(code).toMatch(/^[0-9]{3} [0-9]{3}$/);
  const dialog = sender.getByTestId("join-request-dialog");
  await expect(dialog.getByRole("heading")).toHaveText(title, { timeout: 20_000 });
  await expect(dialog.getByTestId("join-code")).toHaveText(code);
  await dialog.getByTestId("join-allow").click();
  // The dialog says it was allowed, then that they're in, until Done puts it away.
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * The unpaired page, open on its ways in: a newcomer's page opens on the film, Skip puts That's
 * Chips in its place, and its Set up my own Chips opens the code and the rest under it (ADR 0217's
 * addendum of 26 October).
 */
export async function pairingPage(page: Page): Promise<void> {
  await page.goto("/");
  await waysIn(page);
}

/** That's Chips' Set up my own Chips, from the film's Skip: the ways in. */
export async function waysIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Set up my own Chips" }).click();
}

/**
 * The workspace's log (ADR 0261), opened from You's Workspace log row, an owner's or an admin's,
 * as a page beside the list (ADR 0265): it was Audit in the sidebar until 3 November 2026.
 */
export async function openLog(page: Page): Promise<void> {
  await page.getByTestId("you").click();
  await page.getByTestId("workspace-log").click();
  await expect(page.getByRole("region", { name: "Workspace log" })).toBeVisible();
}

/** A row of You's opened: its page beside the list, or its form over it (ADR 0265). */
export async function openYouRow(page: Page, row: string): Promise<void> {
  await page.getByTestId("you").click();
  await page.getByTestId(row).click();
}

/** Somebody's page, from People on You (ADR 0209, ADR 0265): what it holds is theirs. */
export async function openPerson(page: Page, participantId: string): Promise<Locator> {
  await openYouRow(page, "people-row");
  await page.locator(`[data-testid=person-row][data-participant="${participantId}"]`).click();
  const details = page.getByTestId("person-details");
  await expect(details).toHaveAttribute("data-participant", participantId);
  return details;
}

export async function pair(page: Page): Promise<void> {
  await pairingPage(page);
  await page.getByLabel("Pairing code").fill(await freshCode());
  await page.getByRole("button", { name: "Pair" }).click();
  // At a phone's width the list is a menu behind the bar over the room (JR-15), as the `pixel`
  // project's window is: the menu opens to reach the row, and choosing the row closes it.
  const menu = page.getByTestId("narrow-menu");
  const room = page.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
  await expect(room.or(menu).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
  if (await menu.isVisible()) await menu.click();
  await expect(room).toBeVisible();
  // The shell opens the most recent space, which after Custom connect is the new
  // harness's; the golden scenario lives in PO-4471.
  await room.click();
}

/**
 * Pair a page as somebody else, with their own code. They may be in no space yet. A code made on
 * a device asks (ADR 0232): `asks` is the page that made it, which allows it as `title` says.
 */
export async function pairWith(
  page: Page,
  code: string,
  asks?: { readonly from: Page; readonly title: RegExp },
): Promise<void> {
  await pairingPage(page);
  await page.getByLabel("Pairing code").fill(code);
  await page.getByRole("button", { name: "Pair" }).click();
  if (asks !== undefined) await allowFrom(asks.from, page, asks.title);
  await expect(page.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
}

export const runPanel = (page: Page): Locator => page.getByRole("complementary", { name: "Run" });
export const steps = (page: Page, status: string): Locator =>
  runPanel(page).locator(`.ui-timeline__item[data-kind="step"][data-status="${status}"]`);

/**
 * One more agent for a harness, registered by a key of its own (ADR 0087): in no room, so a
 * person adds it to one without taking the harness's first agent out of the room it is in, which
 * the specs after this one still talk to.
 */
export async function registerAgent(
  harness: { readonly id: string; readonly token: string },
  key: string,
  name: string,
): Promise<string> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, name }),
  });
  if (response.status !== 201) throw new Error(`registering an agent answered ${response.status}`);
  return String(((await response.json()) as { agent_id: string }).agent_id);
}

/**
 * The + window's Empty (ADR 0148): a room asking nobody. Picked unless the window opened on it, as
 * it does once a room was made empty; a tap on it then would leave nobody picked, and send nothing.
 */
export async function pickEmpty(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "New space" });
  await expect(dialog).toBeVisible();
  const empty = dialog.getByRole("checkbox", { name: "Empty space" });
  if (!(await empty.isChecked())) await dialog.getByText("Empty", { exact: true }).click();
  await expect(empty).toBeChecked();
}

/**
 * The open room's sheet (ADR 0151), opened from *N members* if it is not up already. By its test id:
 * the button is named by its words, which are "1 member" in a room of one.
 */
export async function roomSheet(page: Page): Promise<Locator> {
  const sheet = page.getByTestId("room-sheet");
  if (!(await sheet.isVisible())) await page.getByTestId("members").click();
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Add somebody to the open room from its sheet's Add page (ADR 0151), opening the sheet and the
 * page if they are not up: a person, a free agent or an agentless harness by its id, ticked where
 * it stands, or an agent in another room by its name, from In other rooms and its Move. The sheet
 * stays on Add, as the phone's does, for the next.
 */
export async function addMember(
  page: Page,
  who: { id: string } | { moving: string },
): Promise<void> {
  const sheet = await roomSheet(page);
  const done = sheet.getByTestId("room-sheet-add-page");
  if (!(await done.isVisible())) await sheet.getByTestId("room-sheet-add").click();
  await expect(done).toBeVisible();
  if ("id" in who) {
    const row = sheet.locator(
      ["agent", "harness", "person"]
        .map((kind) => `[data-testid="room-sheet-${kind}-${who.id}"]`)
        .join(", "),
    );
    await row.click();
    await expect(row.getByRole("checkbox")).toBeChecked();
    return;
  }
  await sheet.getByTestId("room-sheet-other-rooms").click();
  await sheet.locator('[data-testid^="room-sheet-agent-"]', { hasText: who.moving }).click();
  await expect(sheet).toContainText(`Move ${who.moving} here?`);
  await sheet.getByTestId("room-sheet-move").click();
  await expect(done).toBeVisible();
}

/** Back from the sheet's page to its first, where who is in the room is listed. */
export async function sheetBack(page: Page): Promise<Locator> {
  const sheet = page.getByTestId("room-sheet");
  await sheet.getByRole("button", { name: "Back" }).click();
  await expect(sheet.getByTestId("room-sheet-icon")).toBeVisible();
  return sheet;
}

/** Put the sheet away with its X, on whatever page it is, and wait for it to have gone. */
export async function closeSheet(page: Page): Promise<void> {
  const sheet = page.getByTestId("room-sheet");
  await sheet.getByTestId("room-sheet-close").click();
  await expect(sheet).toHaveCount(0);
}

/**
 * Today's Add a harness (ADR 0122): Agents → Connect a harness → Anything with HTTP → Advanced, where
 * the name, the token and the curl lines are, unchanged. An owner meets the gallery first; anybody
 * else is shown the form at once.
 */
export async function openAddHarnessForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page.getByRole("button", { name: "Connect a harness" }).click();
  const gallery = page.getByTestId("join-gallery");
  await expect(gallery.or(page.getByLabel("Name"))).toBeVisible();
  if (await gallery.isVisible()) {
    await page.getByTestId("join-way-http").click();
    await page.getByTestId("join-advanced").click();
  }
  await expect(page.getByLabel("Name")).toBeVisible();
}
