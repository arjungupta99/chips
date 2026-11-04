/**
 * The checks that can only be answered where the app actually runs: the Keychain, SQLite, and the
 * phone's native primitives against the JavaScript ones — its AES-GCM (ADR 0152), and its X25519,
 * Ed25519 and HMAC-SHA-256 (ADR 0277).
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
import { nativeEd25519, nativeHmacSha256, nativeX25519 } from "./native";

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function platformChecks(): Promise<readonly Check[]> {
  return [
    await keychain(),
    await sqlite(),
    await nativeAes(),
    await agreeing("X25519", nativeX25519 !== undefined, x25519Agrees),
    await agreeing("Ed25519", nativeEd25519 !== undefined, ed25519Agrees),
    await agreeing("HMAC-SHA-256", nativeHmacSha256 !== undefined, hmacAgrees),
  ];
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

/** A PKCS#8 holds a curve's private key as its last thirty-two bytes (`packages/subtle/src/der.ts`). */
const seedOf = (pkcs8: ArrayBuffer) => new Uint8Array(pkcs8).slice(-32);
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, at) => byte === b[at]);
const flipped = (bytes: Uint8Array) => {
  const out = bytes.slice();
  out[0] = (out[0] ?? 0) ^ 1;
  return out;
};

/** One native primitive held against `@chipschat/subtle`: a failure names what differed. */
async function agreeing(
  what: string,
  built: boolean,
  agrees: () => Promise<string | undefined>,
): Promise<Check> {
  const name = `Native ${what} agrees with @chipschat/subtle`;
  if (!built) return { name, ok: false, note: `not in this build: ${what} is JavaScript` };
  try {
    const differs = await agrees();
    return differs === undefined
      ? { name, ok: true, note: undefined }
      : { name, ok: false, note: `differs: ${differs}` };
  } catch (error) {
    return { name, ok: false, note: because(error) };
  }
}

/**
 * A key the phone made in JavaScript — as every phone paired before ADR 0277 holds its keys —
 * and a native one agree on the secret from either side, and a point of small order is refused.
 */
async function x25519Agrees(): Promise<string | undefined> {
  const native = nativeX25519;
  if (native === undefined) return "not built";
  const inJs = (await inJavaScript.generateKey({ name: "X25519" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const jsSeed = seedOf(await inJavaScript.exportKey("pkcs8", inJs.privateKey));
  const jsPublic = new Uint8Array(await inJavaScript.exportKey("raw", inJs.publicKey));
  const made = await native.generate();
  const nativePublic = await inJavaScript.importKey(
    "raw",
    made.publicKey,
    { name: "X25519" },
    true,
    [],
  );
  const byJs = new Uint8Array(
    await inJavaScript.deriveBits({ name: "X25519", public: nativePublic }, inJs.privateKey, 256),
  );
  if (!same(await native.derive(made.secretKey, jsPublic), byJs)) return "a native key's secret";
  if (!same(await native.derive(jsSeed, made.publicKey), byJs)) return "a JavaScript key's secret";
  try {
    await native.derive(jsSeed, new Uint8Array(32));
    return "a point of small order was taken";
  } catch {
    return undefined;
  }
}

/**
 * A device key made in JavaScript signs natively and JavaScript verifies it; a native key's
 * signature verifies in JavaScript; a changed byte is refused. CryptoKit randomizes signatures, so
 * this checks that they verify, never that they match.
 */
async function ed25519Agrees(): Promise<string | undefined> {
  const native = nativeEd25519;
  if (native === undefined) return "not built";
  const message = crypto.getRandomValues(new Uint8Array(96));
  const inJs = (await inJavaScript.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jsSeed = seedOf(await inJavaScript.exportKey("pkcs8", inJs.privateKey));
  const jsPublic = new Uint8Array(await inJavaScript.exportKey("raw", inJs.publicKey));
  const signed = await native.sign(jsSeed, message);
  if (!(await inJavaScript.verify({ name: "Ed25519" }, inJs.publicKey, signed, message))) {
    return "a JavaScript key's native signature";
  }
  const jsSigned = new Uint8Array(
    await inJavaScript.sign({ name: "Ed25519" }, inJs.privateKey, message),
  );
  if (!(await native.verify(jsPublic, jsSigned, message))) return "a JavaScript signature";
  const made = await native.generate();
  const madePublic = await inJavaScript.importKey(
    "raw",
    made.publicKey,
    { name: "Ed25519" },
    true,
    ["verify"],
  );
  const nativeSigned = await native.sign(made.secretKey, message);
  if (!(await inJavaScript.verify({ name: "Ed25519" }, madePublic, nativeSigned, message))) {
    return "a native key's signature";
  }
  if (await native.verify(made.publicKey, nativeSigned, flipped(message))) return "a changed byte";
  return undefined;
}

/** The same tag both ways, for a short key, a long one and an empty message; a changed tag refused. */
async function hmacAgrees(): Promise<string | undefined> {
  const native = nativeHmacSha256;
  if (native === undefined) return "not built";
  for (const [keyBytes, dataBytes] of [
    [32, 0],
    [32, 1024],
    [100, 64],
  ] as const) {
    const raw = crypto.getRandomValues(new Uint8Array(keyBytes));
    const data = crypto.getRandomValues(new Uint8Array(dataBytes));
    const key = await inJavaScript.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const tag = new Uint8Array(await inJavaScript.sign("HMAC", key, data));
    if (!same(await native.sign(raw, data), tag)) return `a ${keyBytes}-byte key's tag`;
    if (!(await native.verify(raw, tag, data))) return `a ${keyBytes}-byte key's tag, verified`;
    if (await native.verify(raw, flipped(tag), data)) return "a changed tag";
  }
  return undefined;
}

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
