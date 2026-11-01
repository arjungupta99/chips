/**
 * Where the phone keeps its devices, and where it keeps their keys.
 *
 * Two stores, because they hold different things. The records — which workspace, which
 * participant, which server, which relay — are ordinary rows in SQLite. The private half of the
 * device key is not: it goes to the Keychain through `expo-secure-store`, marked
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` so it never travels in a backup and is unreadable while the
 * phone is locked, and the row holds only the reference.
 *
 * That split is what `DeviceStorage.keepKey`/`loadKey` are for (ADR 0044). A browser needs
 * neither: IndexedDB holds a non-extractable `CryptoKey` by structured clone, which is a
 * stronger thing than this — a key the page cannot read at all. A JavaScript implementation
 * cannot offer that, and the ADR says so plainly rather than implying otherwise.
 */

import type { DeviceStorage } from "@chipschat/core";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { fromBase64, toBase64 } from "../runtime/base64";

const DATABASE = "chips-devices.db";
const KEY_PREFIX = "chips_device_key_";
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface Row {
  readonly name: string;
  readonly json: string;
}

/** What the record holds in place of the key: a name in the Keychain, and nothing secret. */
interface KeyRef {
  readonly keyRef: string;
}

function isKeyRef(value: unknown): value is KeyRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { keyRef?: unknown }).keyRef === "string"
  );
}

let opening: Promise<SQLite.SQLiteDatabase> | undefined;

function database(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE);
    await db.execAsync(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS devices (name TEXT PRIMARY KEY, json TEXT NOT NULL)",
    );
    return db;
  })();
  return opening;
}

/** The reference a row holds, when it holds one — the only thing `remove` needs to tidy. */
async function refIn(name: string): Promise<string | undefined> {
  const db = await database();
  const row = await db.getFirstAsync<Row>("SELECT name, json FROM devices WHERE name = ?", name);
  if (row === null) return undefined;
  const held = (JSON.parse(row.json) as { privateKey?: unknown }).privateKey;
  return isKeyRef(held) ? held.keyRef : undefined;
}

export const deviceStorage: DeviceStorage = {
  async entries() {
    const db = await database();
    const rows = await db.getAllAsync<Row>("SELECT name, json FROM devices");
    return rows.map((row) => [row.name, JSON.parse(row.json) as unknown]);
  },

  async put(key, value) {
    const db = await database();
    await db.runAsync(
      "INSERT INTO devices (name, json) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json",
      key,
      JSON.stringify(value),
    );
  },

  async remove(key) {
    const reference = await refIn(key);
    const db = await database();
    await db.runAsync("DELETE FROM devices WHERE name = ?", key);
    // The row is gone; the Keychain entry it named would otherwise outlive it forever.
    if (reference !== undefined) {
      await SecureStore.deleteItemAsync(`${KEY_PREFIX}${reference}`, KEYCHAIN);
    }
  },

  async keepKey(privateKey) {
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
    const reference = crypto.randomUUID();
    await SecureStore.setItemAsync(
      `${KEY_PREFIX}${reference}`,
      toBase64(new Uint8Array(pkcs8)),
      KEYCHAIN,
    );
    return { keyRef: reference } satisfies KeyRef;
  },

  async loadKey(kept) {
    // Nothing for a record that holds no reference, or one the Keychain has no entry for: that
    // key is gone. A locked phone is not that: the Keychain refuses the read, and the refusal
    // goes up as a throw, so the app reads again once the phone is open (ADR 0228).
    if (!isKeyRef(kept)) return undefined;
    const stored = await SecureStore.getItemAsync(`${KEY_PREFIX}${kept.keyRef}`, KEYCHAIN);
    if (stored === null) return undefined;
    return await crypto.subtle.importKey(
      "pkcs8",
      fromBase64(stored) as BufferSource,
      { name: "Ed25519" },
      false,
      ["sign"],
    );
  },
};
