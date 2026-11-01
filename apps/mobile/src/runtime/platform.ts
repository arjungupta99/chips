/**
 * The three checks that can only be answered where the app actually runs: the Keychain, SQLite,
 * and the phone's native cipher against the JavaScript one (ADR 0152).
 *
 * They are in their own module so the web target never imports `expo-sqlite` — its web build
 * pulls a WebAssembly file Metro will not bundle, and the design says the browser uses core's
 * IndexedDB cache and browser storage instead (`cache/sqlite.web.ts`, `device/storage.web.ts`).
 * `platform.web.ts` is the other half and says so on screen.
 */

import { createWebCrypto } from "@chipschat/subtle";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { nativeAesGcm } from "./aes";
import { because, type Check, type Timing } from "./checks";

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function platformChecks(): Promise<readonly Check[]> {
  return [await keychain(), await sqlite(), await nativeAes()];
}

async function keychain(): Promise<Check> {
  const name = "Keychain round trip";
  try {
    const key = "chips_runtime_probe";
    await SecureStore.setItemAsync(key, "ok", KEYCHAIN);
    const back = await SecureStore.getItemAsync(key, KEYCHAIN);
    await SecureStore.deleteItemAsync(key, KEYCHAIN);
    return { name, ok: back === "ok", note: undefined };
  } catch (error) {
    return { name, ok: false, note: because(error) };
  }
}

async function sqlite(): Promise<Check> {
  const name = "SQLite round trip";
  try {
    const db = await SQLite.openDatabaseAsync("chips-runtime-probe.db");
    await db.execAsync("CREATE TABLE IF NOT EXISTS probe (n INTEGER PRIMARY KEY, s TEXT)");
    await db.runAsync("INSERT OR REPLACE INTO probe (n, s) VALUES (1, ?)", "ok");
    const row = await db.getFirstAsync<{ s: string }>("SELECT s FROM probe WHERE n = 1");
    await db.closeAsync();
    return { name, ok: row?.s === "ok", note: undefined };
  } catch (error) {
    return { name, ok: false, note: because(error) };
  }
}

/**
 * `@chipschat/subtle` with nothing native in it: what the native cipher is held against, now that the
 * `crypto.subtle` the app runs on is the native cipher itself (`install.ts`).
 */
const inJavaScript = createWebCrypto({ random: (out) => crypto.getRandomValues(out) }).subtle;

/** The relay's frame: what a body is cut into to cross the tunnel (`@chipschat/tunnel`'s mux). */
const FRAME_BYTES = 32 * 1024;

/**
 * One case: seal both ways and compare bytes, open the JavaScript ciphertext natively, and see a
 * changed byte refused.
 */
async function bothAgree(
  native: NonNullable<typeof nativeAesGcm>,
  bytes: number,
  aadBytes: number,
): Promise<boolean> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = crypto.getRandomValues(new Uint8Array(aadBytes));
  const plaintext = crypto.getRandomValues(new Uint8Array(bytes));

  const key = await inJavaScript.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  const inJs = new Uint8Array(
    await inJavaScript.encrypt(
      { name: "AES-GCM", iv, additionalData, tagLength: 128 },
      key,
      plaintext,
    ),
  );
  const natively = await native.seal(raw, iv, additionalData, plaintext);
  if (inJs.length !== natively.length || !inJs.every((byte, at) => byte === natively[at])) {
    return false;
  }
  // And the other direction: the native side opens what JavaScript sealed.
  const opened = await native.open(raw, iv, additionalData, inJs);
  if (opened.length !== plaintext.length || !opened.every((byte, at) => byte === plaintext[at])) {
    return false;
  }
  // And it refuses a frame somebody changed, as the tunnel needs it to.
  const changed = inJs.slice();
  changed[0] = (changed[0] ?? 0) ^ 1;
  try {
    await native.open(raw, iv, additionalData, changed);
    return false;
  } catch {
    return true;
  }
}

/**
 * The native cipher against the JavaScript one, across the shapes the tunnel actually produces:
 * an empty payload and empty additional data are their own paths in both, a frame is what every
 * message is, and a megabyte is an attachment.
 */
async function nativeAes(): Promise<Check> {
  const name = "Native AES-GCM agrees with @chipschat/subtle";
  if (nativeAesGcm === undefined) {
    return { name, ok: false, note: "not in this build: frames are sealed in JavaScript" };
  }
  const cases: readonly (readonly [string, number, number])[] = [
    ["empty payload", 0, 8],
    ["no additional data", 1024, 0],
    ["a frame", FRAME_BYTES, 8],
    ["a megabyte", 1024 * 1024, 16],
  ];
  try {
    for (const [what, bytes, aad] of cases) {
      if (!(await bothAgree(nativeAesGcm, bytes, aad))) {
        return { name, ok: false, note: `differs on ${what}` };
      }
    }
    return { name, ok: true, note: `${cases.length} shapes, both directions, a change refused` };
  } catch (error) {
    return { name, ok: false, note: because(error) };
  }
}

/**
 * What a megabyte through the relay costs to open, in frames as the tunnel cuts it, natively and
 * in JavaScript side by side: the number ADR 0152 was decided on.
 */
export async function platformTimings(): Promise<readonly Timing[]> {
  try {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const empty = new Uint8Array(0);
    const key = await inJavaScript.importKey("raw", raw, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    const frames: Uint8Array<ArrayBuffer>[] = [];
    for (let at = 0; at < 1024 * 1024; at += FRAME_BYTES) {
      const plain = crypto.getRandomValues(new Uint8Array(FRAME_BYTES));
      frames.push(
        new Uint8Array(
          await inJavaScript.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, plain),
        ),
      );
    }
    const timed = async (
      name: string,
      open: (frame: Uint8Array<ArrayBuffer>) => Promise<unknown>,
    ) => {
      const began = Date.now();
      for (let round = 0; round < 3; round++) for (const frame of frames) await open(frame);
      return { name, ms: Math.round(((Date.now() - began) / 3) * 100) / 100, note: undefined };
    };
    const javascript = await timed("AES-GCM open, 1 MB in frames (JavaScript)", (frame) =>
      inJavaScript.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, frame),
    );
    if (nativeAesGcm === undefined) return [javascript];
    const native = nativeAesGcm;
    return [
      await timed("AES-GCM open, 1 MB in frames (native)", (frame) =>
        native.open(raw, iv, empty, frame),
      ),
      javascript,
    ];
  } catch {
    return [];
  }
}
