/**
 * What the phone's specs share. The demo's details, a fresh pairing code and the fake harness
 * are the web suite's — one server, one demo bootstrap, one harness worth maintaining — and are
 * re-exported here rather than copied.
 *
 * What is this app's own is how a phone gets in: the web app pairs with a code alone because
 * the page it is served from is the server's, and the phone's pairing screen needs an address
 * as well, because six characters say nothing about where the server is.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Device, DeviceStorage } from "@chipschat/core";
import { getJson, pairDevice, postJson } from "@chipschat/core";
import { expect, type Page } from "@playwright/test";

export {
  demo,
  eventType,
  type Frame,
  freshCode,
  Harness,
  newApprovalId,
  newLaneId,
  newRunId,
  RELAY,
  RELAY_PORT,
  registerPerson,
  registerSpecialist,
  SERVER,
  SERVER_PORT,
  seatMainAgent,
} from "../../web/e2e/support.ts";

import { demo, freshCode, RELAY_PORT, SERVER } from "../../web/e2e/support.ts";

export const WEB_PORT = process.env["CHIPS_MOBILE_E2E_PORT"] ?? "5198";
export const WEB = `http://127.0.0.1:${WEB_PORT}`;

/**
 * The address the app is told to reach the server at. Its own origin: `e2e/serve.ts` proxies
 * `/v1` there, so the browser is same-origin with `chipsd` and the app's signed requests carry
 * exactly what they carry on a phone.
 */
export const THROUGH = WEB;

/**
 * The first screen's pairing code page (ADR 0217's addendum of 26 October), where a code and its
 * server's address are typed: from That's Chips' Have a pairing code?, or at once with
 * `/pair?code=1`, as a spec that only needs to type a code opens it.
 */
export async function codePage(page: Page): Promise<void> {
  await page.goto("/pair");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Type a pairing code" }).click();
}

/** Pair the app with a fresh code, and wait for Spaces, where the app opens. */
export async function pair(page: Page, code?: string, address = THROUGH): Promise<void> {
  await codePage(page);
  await page.getByLabel("Pairing code", { exact: true }).fill(code ?? (await freshCode()));
  await page.getByLabel("Server address").fill(address);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  // Spaces, named for the workspace (ADR 0197 addendum). `first`: a tablet draws the list beside a pane.
  await expect(page.getByTestId("workspace-title").first()).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * A whole pairing payload — code, network address, relay and the key to ask for there — as the
 * QR would carry it, minted from Node.
 *
 * The dev route hands out a bare code; only `POST /v1/pairing-codes` carries the relay, and
 * only a paired person's device may call it. So this pairs one: `pairDevice` is core's own,
 * WebCrypto is Node's, and the storage is a `Map`. The device is thrown away afterwards; what
 * it was for is the payload.
 *
 * The pairing screen takes the whole URL in the code field — `offerFrom` parses a scanned line
 * exactly as it parses a typed one — which is how a spec offers a payload with no camera to
 * point at anything.
 *
 * A code from `registerPerson` pairs the spec's device as that person, so the payload pairs the
 * app as them too: a member, say, where the dev route's code is always the owner's.
 */
export async function payload(lan: string, code?: string): Promise<string> {
  const device = await specDevice(code);
  issuer = device;
  const issued = await postJson<{ code: string; relay: string | null; server_key: string | null }>(
    device,
    "/v1/pairing-codes",
    undefined,
  );
  if (issued.relay === null || issued.server_key === null) {
    throw new Error("this server has no relay; check CHIPS_RELAY_URL in playwright.config.ts");
  }
  const parts = new URLSearchParams({
    pair: issued.code,
    lan,
    relay: issued.relay,
    key: issued.server_key,
    v: "1",
  });
  return `${SERVER}/#${parts.toString()}`;
}

/** The device that made the last payload's code: whose Allow it waits for (ADR 0232). */
let issuer: Device | undefined;

/**
 * The payload's code asks (ADR 0232), since this server has a relay: the phone shows six digits
 * and waits, and the device that made the code allows the request showing the same six, as its
 * person would on their own phone.
 */
export async function allowAsIssuer(page: Page): Promise<void> {
  const shown = page.getByTestId("waiting-code");
  await expect(shown).toBeVisible({ timeout: 40_000 });
  const code = ((await shown.textContent()) ?? "").replace(/\s/g, "");
  const by = issuer;
  if (by === undefined) throw new Error("no payload was made, so nobody made its code");
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const { requests } = await getJson<{
          requests: { request_id: string; kind: string; code?: string }[];
        }>(by, "/v1/join?state=waiting");
        id = requests.find((each) => each.kind === "pairing" && each.code === code)?.request_id;
        return id;
      },
      { timeout: 20_000 },
    )
    .toBeDefined();
  await postJson(by, `/v1/join/${String(id)}/allow`, { capabilities: [] });
}

/**
 * A device paired from Node with a fresh code, the owner's unless a person's code is given: what
 * a spec signs its own requests with, as a person's other device would.
 */
export async function specDevice(code?: string): Promise<Device> {
  const held = new Map<string, unknown>();
  const storage: DeviceStorage = {
    entries: async () => [...held.entries()],
    put: async (key, value) => {
      held.set(key, value);
    },
    remove: async (key) => {
      held.delete(key);
    },
  };
  return await pairDevice(code ?? (await freshCode()), "A spec", SERVER, undefined, storage);
}

/** What the relay has seen: how many servers are dialled in, and how many tunnels are open. */
export async function relayStats(): Promise<{ servers: number; sessions: number }> {
  const response = await fetch(`http://127.0.0.1:${RELAY_PORT}/health`);
  return (await response.json()) as { servers: number; sessions: number };
}

/**
 * What a harness uploads, over the same two requests a phone makes, with its own token. The media
 * specs share it: a spec that needs a photo in the room puts one there itself rather than counting
 * on what another spec left behind.
 */
export async function uploadAsHarness(name: string, bytes: Buffer): Promise<string> {
  const token = demo().harness.token;
  const slot = await fetch(`${SERVER}/v1/uploads`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ filename: name, byte_size: bytes.byteLength }),
  });
  expect(slot.status).toBe(201);
  const { attachment_id, upload_url } = (await slot.json()) as {
    attachment_id: string;
    upload_url: string;
  };
  const put = await fetch(`${SERVER}${upload_url}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
  expect(put.status).toBe(201);
  return attachment_id;
}

/** The demo room, from wherever the app stands: the tab, the space, and the composer to say so. */
export async function openRoom(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page
    .getByText(/PO-4471/)
    .first()
    .click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
}

/**
 * A clip a harness can send: a test card with a running clock, and a tone, as H.264 and AAC in an
 * MP4 that starts at once (`faststart`). Nothing where ffmpeg is not, since the server measures a
 * video with the same ffmpeg and without it there is no tile to open; a spec skips then.
 */
export function clipOf({
  seconds,
  width,
  height,
}: {
  readonly seconds: number;
  readonly width: number;
  readonly height: number;
}): Buffer | undefined {
  const directory = mkdtempSync(join(tmpdir(), "chips-mobile-clip-"));
  try {
    const out = join(directory, "clip.mp4");
    execFileSync("ffmpeg", [
      ...["-hide_banner", "-v", "error"],
      ...["-f", "lavfi", "-i", `testsrc=size=${width}x${height}:rate=30:duration=${seconds}`],
      ...["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`],
      ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"],
      ...["-movflags", "+faststart", "-y", out],
    ]);
    return readFileSync(out);
  } catch {
    return undefined;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
