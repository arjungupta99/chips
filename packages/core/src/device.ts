/**
 * The device key.
 *
 * Decision 6: a person is identified by an Ed25519 key that lives on their device, paired by a
 * short-lived code. The private half is generated in the browser as a **non-extractable**
 * `CryptoKey` and stored in IndexedDB, which is the only browser store that can hold one. It
 * cannot be read back out by anything — including this code — only used to sign.
 *
 * That is the whole reason for using IndexedDB rather than `localStorage`: a JWK in
 * `localStorage` is a private key that any script on the page can read.
 *
 * One app, several workspaces (M5.3): a person can belong to a home server and a company
 * server at once, each an account on that server with a key of its own. The store holds one
 * device per pairing, keyed by its id, and a pointer to the one in front; a device paired before
 * there could be several sits under the pointer's old name and is moved on first read.
 */

import { serverKey as serverKeyShape } from "@chipschat/protocol";
import { cacheKey } from "./cacheKey.js";
import {
  directLink,
  establishLink,
  type Link,
  linkFor,
  type NamedReach,
  type Reachable,
  type RelayAddress,
  useLink,
} from "./link.js";

const DB_NAME = "chips";
const STORE = "device";
/** The record that names the device in front — and, before M5.3, held the only device. */
const RECORD = "current";

export interface Device {
  readonly deviceId: string;
  readonly participantId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly privateKey: CryptoKey;
  /** The workspace's name, when the server said it (an invite, a passkey sign-in). */
  readonly workspaceName?: string;
  /** Notifications for this workspace are off on this device (M5.3). A device's own setting. */
  readonly muted?: boolean;
  /**
   * Where the server this device is paired with lives, as an origin — `http://mini.local:4431`.
   * Empty, or absent on a device paired before there was anywhere else to be, means the page's
   * own origin, which is what a browser served by the server itself has. The desktop shell sets
   * it, because its page is loaded from the app rather than from chipsd (M2.2).
   */
  readonly serverUrl?: string;
  /**
   * The server's tunnel key, base64url, pinned at pairing (ADR 0039, ADR 0191): what every tunnel
   * to the server — through the door on its own network, or through the relay — is a handshake
   * against. It changes only by pairing again. Absent on a device paired before servers had keys,
   * which takes its first from health once, on its first connection after the update (ADR 0191,
   * Phase 3; `rememberReach`).
   */
  readonly serverKey?: string;
  /**
   * The relay the server dials out to, when it has one (M4.1, ADR 0038): where this device
   * reaches the server when its network does not answer. Beside the key rather than holding it,
   * since ADR 0191: a server with no relay has a key all the same.
   */
  readonly relayUrl?: string;
  /**
   * Only direct (ADR 0211, Phase 2): on its person's word, this device never goes through the
   * relay. With the server's own address out of reach it does not connect, and says why. A
   * device's own setting, as `muted` is; the server never hears of it.
   */
  readonly onlyDirect?: boolean;
  /** This device has reached its server at its own address at least once: Only direct is offered. */
  readonly wentDirect?: boolean;
}

interface StoredDevice {
  deviceId: string;
  participantId: string;
  workspaceId: string;
  displayName: string;
  privateKey: CryptoKey;
  workspaceName?: string;
  serverUrl?: string;
  muted?: boolean;
  serverKey?: string;
  relayUrl?: string;
  onlyDirect?: boolean;
  wentDirect?: boolean;
}

/** How a record from before ADR 0191 held the key: inside its relay, so a server with none had none. */
interface StoredBeforeKeys extends StoredDevice {
  relay?: RelayAddress;
}

/** The pointer record: which device is in front. */
interface Pointer {
  readonly pointer: string;
}

/**
 * Where devices are kept. IndexedDB in a browser; a test hands in a map. Every function below
 * takes one, and defaults to the browser's.
 */
export interface DeviceStorage {
  /** Every record: devices by their id, and the pointer, or a legacy device under its name. */
  readonly entries: () => Promise<[string, unknown][]>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  /**
   * A storage that cannot hold a `CryptoKey` puts the private half away its own way (M4.2).
   * IndexedDB holds one by structured clone and needs neither of these; SQLite on a phone
   * cannot, so the phone exports the key to the Keychain here and hands back a reference, which
   * is what the device record then holds. Whatever this returns must survive the storage's own
   * round trip, and `remove` is where the storage forgets it again.
   *
   * The bytes rest wherever the storage puts them, and are in JavaScript memory while a request
   * is signed. A key the runtime itself cannot read needs a native module (ADR 0044).
   */
  readonly keepKey?: ((privateKey: CryptoKey) => Promise<unknown>) | undefined;
  /**
   * The other half: what `keepKey` returned, back as a key that can sign. Nothing when the
   * storage no longer holds it, and a throw when it cannot be read just now — a phone's Keychain
   * is shut while the phone is locked (ADR 0228). The two are not the same: a device whose key is
   * gone can never sign again, and one whose key is shut can, once the phone is unlocked.
   */
  readonly loadKey?: ((kept: unknown) => Promise<CryptoKey | undefined>) | undefined;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB, which holds a non-extractable `CryptoKey` by structured clone: the key rests in
 * the browser and the page cannot read it. Exported so a client whose platform storage is
 * something else — the phone app's web target — can name this one rather than lean on a
 * default (ADR 0044).
 */
export const browserStorage: DeviceStorage = {
  async entries() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const store = db.transaction(STORE, "readonly").objectStore(STORE);
      const keys = store.getAllKeys();
      const values = store.getAll();
      values.onsuccess = () => {
        const names = keys.result as string[];
        resolve(names.map((name, index) => [name, values.result[index]]));
      };
      values.onerror = () => reject(values.error);
    });
  },
  async put(key, value) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  async remove(key) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};

function isDevice(value: unknown): value is StoredDevice {
  return (
    typeof value === "object" && value !== null && "deviceId" in value && "privateKey" in value
  );
}

function isPointer(value: unknown): value is Pointer {
  return (
    typeof value === "object" && value !== null && typeof (value as Pointer).pointer === "string"
  );
}

/**
 * A record as it is kept now. One from before ADR 0191 held the server's key inside its relay;
 * the key is moved beside the address, once, and the record written back, so a device paired
 * when its server had a relay keeps the key it pinned, and nothing else has to know the old shape.
 */
async function keptAsNow(storage: DeviceStorage, stored: StoredDevice): Promise<StoredDevice> {
  const { relay, ...rest } = stored as StoredBeforeKeys;
  if (relay === undefined) return stored;
  const now: StoredDevice = {
    ...rest,
    serverKey: rest.serverKey ?? relay.serverKey,
    relayUrl: rest.relayUrl ?? relay.url,
  };
  await storage.put(now.deviceId, now);
  return now;
}

/**
 * What a read of the device storage answers: the devices whose keys came back, the one in front
 * first, and how many keys could not be read just now (ADR 0228). A device whose key is gone is
 * in neither: nothing can sign for it again, and pairing again replaces it.
 */
export interface HeldDevices {
  readonly devices: Device[];
  readonly unreadable: number;
}

/**
 * Every device this app holds, the one in front first: `records` as stored, which on a phone
 * hold a Keychain reference where the key goes, and `devices`, copies with the key in its place.
 * Copies, so that nothing which writes a device back can put a key where its reference was. A
 * device paired before M5.3 sits under the pointer's name, and is moved under its own id here,
 * once, so nothing else has to know.
 */
async function readAll(
  storage: DeviceStorage,
): Promise<HeldDevices & { records: StoredDevice[]; current: string | undefined }> {
  const entries = await storage.entries();
  const devices: StoredDevice[] = [];
  let current: string | undefined;
  for (const [key, value] of entries) {
    if (key === RECORD && isPointer(value)) {
      current = value.pointer;
      continue;
    }
    if (!isDevice(value)) continue;
    const device = await keptAsNow(storage, value);
    devices.push(device);
    if (key === RECORD) {
      // The one device of a browser paired before there could be several.
      await storage.put(device.deviceId, device);
      await storage.put(RECORD, { pointer: device.deviceId });
      current = device.deviceId;
    }
  }
  const front = devices.find((device) => device.deviceId === current) ?? devices[0];
  const rest = devices.filter((device) => device !== front);
  const records = front === undefined ? [] : [front, ...rest];
  return { records, ...(await withKeys(storage, records)), current: front?.deviceId };
}

/**
 * The private halves back from wherever the storage put them (M4.2), each on a copy of its
 * record. A browser's records hold the key itself. One key that will not come back costs only its
 * own device: until ADR 0228 it emptied the whole list, and a phone started while locked showed
 * Welcome to somebody paired all along.
 */
async function withKeys(
  storage: DeviceStorage,
  records: readonly StoredDevice[],
): Promise<HeldDevices> {
  const load = storage.loadKey;
  if (load === undefined) return { devices: [...records], unreadable: 0 };
  const devices: StoredDevice[] = [];
  let unreadable = 0;
  for (const record of records) {
    try {
      const privateKey = await load(record.privateKey);
      if (privateKey !== undefined) devices.push({ ...record, privateKey });
    } catch {
      unreadable += 1;
    }
  }
  return { devices, unreadable };
}

/**
 * Every workspace this device holds, and how many of their keys could not be read just now
 * (ADR 0228). Where `loadDevices` answers a storage that will not open with nothing, this throws:
 * a phone whose Keychain and files iOS keeps shut until it is unlocked is not a phone with
 * nothing paired, and only its caller can tell when to read again.
 */
export async function readDevices(storage: DeviceStorage = browserStorage): Promise<HeldDevices> {
  const { devices, unreadable } = await readAll(storage);
  return { devices, unreadable };
}

/** The device in front, or nothing when this browser is paired with no workspace. */
export async function loadDevice(
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  try {
    return (await readAll(storage)).devices[0];
  } catch {
    // A private window, or storage the browser has cleared. Pairing again is the answer.
    return undefined;
  }
}

/** Every workspace this browser is paired with, the one in front first (M5.3). */
export async function loadDevices(storage: DeviceStorage = browserStorage): Promise<Device[]> {
  try {
    return (await readAll(storage)).devices;
  } catch {
    return [];
  }
}

/** Put another paired workspace in front. Answers it, or nothing when there is no such device. */
export async function switchDevice(
  deviceId: string,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  const { devices } = await readAll(storage);
  const chosen = devices.find((device) => device.deviceId === deviceId);
  if (chosen === undefined) return undefined;
  await storage.put(RECORD, { pointer: deviceId });
  return chosen;
}

/**
 * Notifications for a workspace, on this device only (M5.3): off, and nothing from it reaches
 * the notification centre or the menu bar; on again, and it does. The server never hears of it.
 */
export function setDeviceMuted(
  deviceId: string,
  muted: boolean,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  // The record as stored: until ADR 0228 this wrote back the device as read, key in place of
  // the phone's Keychain reference, and the next launch found no key and showed Welcome.
  return amend(deviceId, { muted }, storage);
}

/**
 * How a device's server is reached, as health named it, kept with the device: the key, and the
 * relay when the server has one. The key a device paired before servers had keys took as its
 * first (ADR 0191, Phase 3) goes here, so the next launch starts with it and tunnels from its
 * first request. A relay stays as it was when the server names none.
 */
export function rememberReach(
  deviceId: string,
  named: NamedReach,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  return amend(
    deviceId,
    {
      serverKey: named.serverKey,
      ...(named.relayUrl === undefined ? {} : { relayUrl: named.relayUrl }),
    },
    storage,
  );
}

/** Only direct, on or off, kept with the device (ADR 0211, Phase 2). */
export function rememberOnlyDirect(
  deviceId: string,
  onlyDirect: boolean,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  return amend(deviceId, { onlyDirect }, storage);
}

/** That the device has reached its server at its own address, kept so Only direct stays offered. */
export function rememberWentDirect(
  deviceId: string,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  return amend(deviceId, { wentDirect: true }, storage);
}

/**
 * What the workspace is called now, as the server's hello says, kept with the device: it was
 * told the name once, when it paired, and a workspace renamed since would otherwise go on by its
 * old one here, and in the list of workspaces this device holds, until it paired again.
 */
export function rememberWorkspaceName(
  deviceId: string,
  workspaceName: string,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  return amend(deviceId, { workspaceName }, storage);
}

/**
 * A kept device with some of what it knows changed. Storage that will not open keeps nothing,
 * and the device learns it again on its next connection.
 */
async function amend(
  deviceId: string,
  change: Partial<StoredDevice>,
  storage: DeviceStorage,
): Promise<Device | undefined> {
  try {
    const entries = await storage.entries();
    const stored = entries.find(([key, value]) => key === deviceId && isDevice(value))?.[1];
    if (stored === undefined) return undefined;
    // The record as stored, private half and all, so a phone's Keychain reference stays one.
    const changed: StoredDevice = { ...(stored as StoredDevice), ...change };
    await storage.put(deviceId, changed);
    return changed;
  } catch {
    return undefined;
  }
}

/**
 * The relay a device's server named, kept with the device (ADR 0038), and the key the server is
 * known by there, which `relayVerdict` has already held against the one pinned: from the next
 * launch the device reaches its server through the relay when the network does not answer. A
 * device paired before its server had a relay learns it this way rather than by pairing again.
 */
export function rememberRelay(
  deviceId: string,
  relay: RelayAddress,
  storage: DeviceStorage = browserStorage,
): Promise<Device | undefined> {
  return rememberReach(deviceId, { serverKey: relay.serverKey, relayUrl: relay.url }, storage);
}

/**
 * What forgets a device's cache, by the key `cacheKey` gives it: the web hands in `deleteCache`
 * (IndexedDB), the phone its SQLite's. Handed in rather than imported here, since the cache
 * module reaches the model and the model reaches this one.
 */
export interface CacheDeleter {
  readonly delete: (key: string) => Promise<void>;
}

/**
 * Forget a device's key: the one in front, or the one named. What happens when the server says
 * it has never heard of it — the key is no longer good for anything, and keeping it would mean
 * pairing can never be offered again — and what signing out does. Another paired workspace, if
 * there is one, comes to the front. The device's cache goes with its key (SEC-32): a shared
 * browser, or the next person with this phone, reads nothing of a workspace it is no longer in.
 */
/** For a caller with no cache to forget: the CLI, a test. The apps hand in theirs. */
const NO_CACHE: CacheDeleter = { delete: async () => undefined };

export async function forgetDevice(
  deviceId?: string,
  storage: DeviceStorage = browserStorage,
  cache: CacheDeleter = NO_CACHE,
): Promise<Device | undefined> {
  try {
    const { records, devices, current } = await readAll(storage);
    const gone = deviceId ?? current;
    if (gone === undefined) return undefined;
    // Its record, not its device: one whose key will not come back has a cache to forget all the same.
    const forgotten = records.find((record) => record.deviceId === gone);
    await storage.remove(gone);
    const left = devices.filter((device) => device.deviceId !== gone);
    const next = gone === current ? left[0] : devices.find((device) => device.deviceId === current);
    if (next === undefined) await storage.remove(RECORD);
    else await storage.put(RECORD, { pointer: next.deviceId });
    if (forgotten !== undefined) await cache.delete(cacheKey(forgotten)).catch(() => undefined);
    return next;
  } catch {
    // Storage the browser will not open. There was nothing to forget.
    return undefined;
  }
}

/** What to call a paired workspace in a list: its name, else where it is, else here. */
export function workspaceLabel(device: Pick<Device, "workspaceName" | "serverUrl">): string {
  if (device.workspaceName !== undefined && device.workspaceName !== "")
    return device.workspaceName;
  if (device.serverUrl !== undefined && device.serverUrl !== "") {
    try {
      return new URL(device.serverUrl).host;
    } catch {
      return device.serverUrl;
    }
  }
  return "This server";
}

export class PairingError extends Error {
  override readonly name = "PairingError";
  constructor(
    message: string,
    /** Which rule refused it, when the server named one: `name_taken`. */
    readonly refusal?: string | undefined,
  ) {
    super(message);
  }
}

/**
 * Whether a join was refused for its name: somebody, or an agent, goes by it there already
 * (ADR 0197). The joiner is asked for another, on the same link: nothing was spent.
 */
export function nameTaken(error: unknown): boolean {
  return error instanceof PairingError && error.refusal === "name_taken";
}

/**
 * A fresh Ed25519 pair, and the public half as the server takes it. The private half is
 * non-extractable — the browser holds a key the page itself cannot read — unless the storage
 * says it will keep the key its own way, which it can only do with the bytes (ADR 0044).
 */
async function newDeviceKey(
  storage: DeviceStorage = browserStorage,
): Promise<{ pair: CryptoKeyPair; publicKey: string }> {
  if (crypto.subtle === undefined) {
    throw new PairingError("This page needs a secure context to generate a key.");
  }
  const pair = (await crypto.subtle.generateKey(
    { name: "Ed25519" },
    storage.keepKey !== undefined,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  return { pair, publicKey: btoa(String.fromCharCode(...new Uint8Array(spki))) };
}

/** What every door that hands out a device answers with (`POST /v1/pair` and its kin). */
interface PairedOnTheWire {
  device_id: string;
  participant_id: string;
  workspace_id: string;
  display_name: string;
  workspace_name?: string;
  /** The server's tunnel key (ADR 0191, decision 5): what a device with no key yet pins. */
  server_key?: string;
}

/** How to reach the server beside its address: the key to shake hands against, and its relay. */
export type ServerReach = Pick<Reachable, "serverKey" | "relayUrl">;

/**
 * A door's `202` (ADR 0232): the link asks, so this device waits for the person who sent it, and
 * shows the six digits that person's sheet shows.
 */
interface WaitingOnTheWire {
  state: "waiting";
  request_id: string;
  secret: string;
  code: string;
  expires_in: number;
  interval: number;
}

/**
 * What a device that may have to wait for an Allow is told, and how it waits (ADR 0232): the code
 * to show, once, and the signal that stops it. The tests pass a `sleep` that doesn't sleep.
 */
export interface AllowWait {
  readonly onWaiting: (waiting: JoinWaiting) => void;
  readonly signal?: AbortSignal | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
}

function waitsForAllow(answer: object): answer is WaitingOnTheWire {
  return "state" in answer && answer.state === "waiting" && "request_id" in answer;
}

/**
 * The device a door handed out: at once, or, for a link that asks (ADR 0232), once the person who
 * sent it allows it. Polled the way the door was reached, through the tunnel when it was one.
 */
async function handedOut(
  answer: PairedOnTheWire | WaitingOnTheWire,
  serverUrl: string,
  link: Link,
  wait: AllowWait | undefined,
): Promise<PairedOnTheWire> {
  if (!waitsForAllow(answer)) return answer;
  const now = wait?.now ?? Date.now;
  wait?.onWaiting({ code: answer.code, expiresAt: now() + answer.expires_in * 1000 });
  return await untilAllowed(serverUrl, answer, link, wait);
}

/** An unauthenticated POST to one of the doors, with the failure as a `PairingError`. */
async function knock<T>(
  serverUrl: string,
  path: string,
  body: unknown,
  fallback: string,
  link: Link = directLink,
): Promise<T> {
  const response = await link.fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; refusal?: string };
    };
    throw new PairingError(failure.error?.message ?? fallback, failure.error?.refusal);
  }
  return (await response.json()) as T;
}

/**
 * The key this device pins (ADR 0191, decision 5): the one the tunnel it paired through was made
 * to, when it came holding one, else the one the door's answer carries — a typed code's one plain
 * exchange, or a join over the Wi-Fi — trusted on first use and bound to that one answer. A key
 * that is not the shape of one is not pinned: a handshake against it could never complete.
 */
function pinnedKey(reach: ServerReach, paired: PairedOnTheWire): string | undefined {
  if (reach.serverKey !== undefined) return reach.serverKey;
  return serverKeyShape.safeParse(paired.server_key).success ? paired.server_key : undefined;
}

/** Keep what a door answered, with the private half, as this device — and put it in front. */
async function keep(
  paired: PairedOnTheWire,
  privateKey: CryptoKey,
  serverUrl: string,
  storage: DeviceStorage = browserStorage,
  reach: ServerReach = {},
): Promise<Device> {
  const serverKey = pinnedKey(reach, paired);
  const device: StoredDevice = {
    deviceId: paired.device_id,
    participantId: paired.participant_id,
    workspaceId: paired.workspace_id,
    displayName: paired.display_name,
    // What the record holds is the key itself where the storage can keep one, and whatever the
    // storage handed back where it cannot (M4.2). `readAll` reads it the same way round.
    privateKey: (storage.keepKey === undefined
      ? privateKey
      : await storage.keepKey(privateKey)) as CryptoKey,
    ...(paired.workspace_name === undefined ? {} : { workspaceName: paired.workspace_name }),
    ...(serverUrl === "" ? {} : { serverUrl }),
    ...(serverKey === undefined ? {} : { serverKey }),
    ...(reach.relayUrl === undefined ? {} : { relayUrl: reach.relayUrl }),
  };

  // One device per workspace on one server: pairing again replaces the old key rather than
  // listing the same place twice — a record whose key is gone included, which no read hands out.
  for (const old of (await readAll(storage)).records) {
    if (old.workspaceId === device.workspaceId && (old.serverUrl ?? "") === serverUrl) {
      await storage.remove(old.deviceId);
    }
  }
  await storage.put(device.deviceId, device);
  await storage.put(RECORD, { pointer: device.deviceId });
  // The record keeps the reference; the caller gets the key. A phone pairs and then signs
  // immediately — the socket ticket is the very next thing it asks for — and a Keychain
  // reference cannot sign, so handing back what was written down left the app paired and
  // offline until it was restarted, which is when `readAll` swaps the halves for it.
  return { ...device, privateKey };
}

/**
 * Generate a key pair, send the public half with the pairing code, and keep the private half
 * where it cannot be exported. With the server's key in the payload — a QR, a link — the knock
 * goes the way every call after it will: inside a tunnel to that key, through the door on the
 * server's network or through the relay (ADR 0191). With a typed code there is no key yet, so
 * the knock is the one plain exchange this device makes, and the key its answer carries is pinned.
 */
export async function pairDevice(
  code: string,
  name: string,
  serverUrl = "",
  reach: ServerReach = {},
  storage: DeviceStorage = browserStorage,
  /** For a code that asks (ADR 0232): what this device shows while the person allows it. */
  wait?: AllowWait,
): Promise<Device> {
  const link = await establishLink({ serverUrl, ...reach });
  const { pair, publicKey } = await newDeviceKey(storage);
  let paired: PairedOnTheWire;
  try {
    const answer = await knock<PairedOnTheWire | WaitingOnTheWire>(
      serverUrl,
      "/v1/pair",
      { code: code.trim().toUpperCase(), public_key: publicKey, name },
      "That pairing code is not valid.",
      link,
    );
    paired = await handedOut(answer, serverUrl, link, wait);
  } catch (error) {
    link.close();
    throw error;
  }
  const device = await keep(paired, pair.privateKey, serverUrl, storage, reach);
  const kept = await linkAfterPairing(device, link);
  if (kept !== undefined) useLink(device.deviceId, kept);
  return device;
}

/**
 * The link a device just paired keeps. One that paired inside a tunnel keeps it. One that paired
 * on the plain link by a typed code has just pinned the key the answer carried (ADR 0191,
 * decision 5): that exchange was its last plain one, so the tunnel to the key is opened now and
 * the plain link let go, rather than the first reads after pairing going the way the pairing
 * did. A door that does not answer yet leaves no link chosen, and the transport chooses on its
 * connect; a device that pinned nothing, from a server with no key to give, keeps the plain link.
 */
async function linkAfterPairing(device: Device, link: Link): Promise<Link | undefined> {
  if (link.kind !== "direct" || device.serverKey === undefined) return link;
  try {
    return await establishLink(device);
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ asking to join

/** What `askToJoin` says while it waits: the code to compare, and when it stops being good. */
export interface JoinWaiting {
  readonly code: string;
  readonly expiresAt: number;
}

/**
 * Ask the Chips at `serverUrl` to let this device in (ADR 0122's device request), from the same
 * network: a phone that found it on the Wi-Fi. The server answers with a code, which this device
 * shows and the computer shows too; a person allows it there, and this device collects its
 * credential, and the server's key beside it, which it pins (ADR 0191, decision 5). No code is
 * typed. Stops with a `PairingError` when it is refused or runs out, and when `signal` is aborted.
 */
export async function askToJoin(input: {
  readonly serverUrl: string;
  readonly name: string;
  readonly storage?: DeviceStorage;
  readonly onWaiting: (waiting: JoinWaiting) => void;
  readonly signal?: AbortSignal;
  /** How a wait between polls is made; the tests pass one that doesn't sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}): Promise<Device> {
  const storage = input.storage ?? browserStorage;
  const sleep = input.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const now = input.now ?? Date.now;
  const { pair, publicKey } = await newDeviceKey(storage);
  const asked = await knock<{
    request_id: string;
    secret: string;
    code: string;
    expires_in: number;
    interval: number;
  }>(
    input.serverUrl,
    "/v1/join",
    { kind: "device", name: input.name, public_key: publicKey },
    "Chips there didn't take the request.",
  );
  input.onWaiting({ code: asked.code, expiresAt: now() + asked.expires_in * 1000 });
  const polled = await untilAllowed(input.serverUrl, asked, directLink, { ...input, sleep });
  return await keep(polled, pair.privateKey, input.serverUrl, storage);
}

/**
 * Poll a request until a person allows it, and answer what it was given: a device that asked over
 * the Wi-Fi, or one that used a link that asks (ADR 0232). Refused, run out or stopped, a
 * `PairingError`.
 */
async function untilAllowed(
  serverUrl: string,
  asked: { readonly request_id: string; readonly secret: string; readonly interval: number },
  link: Link,
  wait: Pick<AllowWait, "signal" | "sleep"> | undefined,
): Promise<PairedOnTheWire> {
  const sleep = wait?.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  let interval = asked.interval;
  for (;;) {
    await sleep(interval * 1000);
    if (wait?.signal?.aborted === true) throw new PairingError("Stopped asking.");
    const polled = await pollJoin(serverUrl, asked.request_id, asked.secret, link);
    if (!("interval" in polled)) return polled;
    interval = polled.interval ?? interval;
  }
}

/** One poll of a device's request: wait again, or what it was given. Refused, a `PairingError`. */
async function pollJoin(
  serverUrl: string,
  requestId: string,
  secret: string,
  link: Link,
): Promise<{ readonly interval: number | undefined } | PairedOnTheWire> {
  const response = await link.fetch(`${serverUrl}/v1/join/${requestId}/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    interval?: number;
    error?: { message?: string };
  } & Partial<PairedOnTheWire>;
  if (response.status === 202) return { interval: body.interval };
  if (!response.ok || body.device_id === undefined) {
    throw new PairingError(body.error?.message ?? "Chips there didn't let this device in.");
  }
  return body as PairedOnTheWire;
}

// ------------------------------------------------------------------ invites

/** What an invite link is for, before the person has a name here (ADR 0034). */
export interface InvitePeek {
  readonly inviteId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: "owner" | "admin" | "member" | "guest";
  readonly singleUse: boolean;
  readonly expiresAt: string;
  /** Who sent the link, as they go by now, when the server says (JR-13). */
  readonly invitedByName?: string | undefined;
  /** The space the link brings them into, and its name (ADR 0168); absent for none. */
  readonly spaceId?: string | undefined;
  readonly spaceName?: string | undefined;
}

/** The invite token in a link: `#invite=…`, or `?invite=…` for a link somebody rewrote. */
export function inviteFromUrl(url: { search: string; hash: string }): string {
  const query = new URLSearchParams(url.search).get("invite");
  if (query !== null) return query;
  return new URLSearchParams(url.hash.replace(/^#/, "")).get("invite") ?? "";
}

/**
 * What a link is for, asked of its server. `link` is how to reach it: the network, or the relay an
 * app off that network goes through, made once with `establishLink` and handed on to the join
 * that follows (ADR 0164).
 */
export async function peekInvite(
  token: string,
  serverUrl = "",
  link: Link = directLink,
): Promise<InvitePeek> {
  const peeked = await knock<{
    invite_id: string;
    workspace_id: string;
    workspace_name: string;
    role: InvitePeek["role"];
    single_use: boolean;
    expires_at: string;
    invited_by_name?: string | null;
    space_id?: string | null;
    space_name?: string | null;
  }>(serverUrl, "/v1/invites/peek", { token }, "That invite is not valid.", link);
  return {
    inviteId: peeked.invite_id,
    workspaceId: peeked.workspace_id,
    workspaceName: peeked.workspace_name,
    role: peeked.role,
    singleUse: peeked.single_use,
    expiresAt: peeked.expires_at,
    ...(typeof peeked.invited_by_name === "string"
      ? { invitedByName: peeked.invited_by_name }
      : {}),
    ...(typeof peeked.space_id === "string"
      ? { spaceId: peeked.space_id, spaceName: peeked.space_name ?? "a space" }
      : {}),
  };
}

/**
 * Join by an invite: this device makes its key, and the invite is its pairing code. The person
 * is made with the invite's role, and this device speaks as them from now on. Through `via`, the
 * link the peek went by and the key and relay it was made to, which the device keeps as a paired
 * one does (ADR 0164).
 */
export async function joinByInvite(
  token: string,
  displayName: string,
  deviceName: string,
  serverUrl = "",
  storage: DeviceStorage = browserStorage,
  via?: { readonly link: Link } & ServerReach,
  /** For a link that asks (ADR 0232): what this device shows while the inviter allows it. */
  wait?: AllowWait,
): Promise<Device> {
  const { pair, publicKey } = await newDeviceKey(storage);
  const link = via?.link ?? directLink;
  const answer = await knock<PairedOnTheWire | WaitingOnTheWire>(
    serverUrl,
    "/v1/invites/redeem",
    { token, display_name: displayName, public_key: publicKey, device_name: deviceName },
    "That invite is not valid.",
    link,
  );
  const joined = await handedOut(answer, serverUrl, link, wait);
  const device = await keep(joined, pair.privateKey, serverUrl, storage, {
    serverKey: via?.serverKey,
    relayUrl: via?.relayUrl,
  });
  if (via !== undefined) useLink(device.deviceId, via.link);
  return device;
}

// ----------------------------------------------------------------- passkeys

/** Whether this browser can make and use a passkey at all. */
export function passkeysSupported(where: typeof globalThis = globalThis): boolean {
  const w = where as { PublicKeyCredential?: unknown; navigator?: { credentials?: unknown } };
  return w.PublicKeyCredential !== undefined && w.navigator?.credentials !== undefined;
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The server's creation options, in WebAuthn's JSON form, as the browser API takes them. */
export function creationOptionsFromJson(json: {
  readonly challenge: string;
  readonly rp: { readonly name: string; readonly id?: string | undefined };
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string };
  readonly pubKeyCredParams: readonly { readonly type: "public-key"; readonly alg: number }[];
  readonly authenticatorSelection?: Record<string, unknown> | undefined;
  readonly excludeCredentials?:
    | readonly {
        readonly type: "public-key";
        readonly id: string;
        readonly transports?: readonly string[] | undefined;
      }[]
    | undefined;
  readonly timeout?: number | undefined;
  readonly attestation?: string | undefined;
}): PublicKeyCredentialCreationOptions {
  return {
    challenge: fromBase64url(json.challenge),
    rp: json.rp.id === undefined ? { name: json.rp.name } : { name: json.rp.name, id: json.rp.id },
    user: { ...json.user, id: fromBase64url(json.user.id) },
    pubKeyCredParams: [...json.pubKeyCredParams],
    ...(json.authenticatorSelection === undefined
      ? {}
      : { authenticatorSelection: json.authenticatorSelection as AuthenticatorSelectionCriteria }),
    excludeCredentials: (json.excludeCredentials ?? []).map((each) => ({
      type: each.type,
      id: fromBase64url(each.id),
      ...(each.transports === undefined
        ? {}
        : { transports: [...each.transports] as AuthenticatorTransport[] }),
    })),
    ...(json.timeout === undefined ? {} : { timeout: json.timeout }),
    ...(json.attestation === undefined
      ? {}
      : { attestation: json.attestation as AttestationConveyancePreference }),
  };
}

/** The server's request options for a sign-in, as the browser API takes them. */
export function requestOptionsFromJson(json: {
  readonly challenge: string;
  readonly rpId?: string | undefined;
  readonly userVerification?: string | undefined;
  readonly timeout?: number | undefined;
}): PublicKeyCredentialRequestOptions {
  return {
    challenge: fromBase64url(json.challenge),
    ...(json.rpId === undefined ? {} : { rpId: json.rpId }),
    ...(json.userVerification === undefined
      ? {}
      : { userVerification: json.userVerification as UserVerificationRequirement }),
    ...(json.timeout === undefined ? {} : { timeout: json.timeout }),
  };
}

/** A credential the browser handed back, as the server reads it: everything binary as base64url. */
export function credentialToJson(credential: {
  readonly id: string;
  readonly rawId: ArrayBuffer;
  readonly type: string;
  readonly response: {
    readonly clientDataJSON: ArrayBuffer;
    readonly attestationObject?: ArrayBuffer | undefined;
    readonly authenticatorData?: ArrayBuffer | undefined;
    readonly signature?: ArrayBuffer | undefined;
    readonly userHandle?: ArrayBuffer | null | undefined;
    readonly getTransports?: (() => string[]) | undefined;
  };
}): Record<string, unknown> {
  const { response } = credential;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      ...(response.attestationObject === undefined
        ? {}
        : { attestationObject: toBase64url(response.attestationObject) }),
      ...(response.authenticatorData === undefined
        ? {}
        : { authenticatorData: toBase64url(response.authenticatorData) }),
      ...(response.signature === undefined ? {} : { signature: toBase64url(response.signature) }),
      ...(response.userHandle == null ? {} : { userHandle: toBase64url(response.userHandle) }),
      ...(typeof response.getTransports === "function"
        ? { transports: response.getTransports() }
        : {}),
    },
  };
}

/** A signed JSON call from a paired device, for the passkey routes that need one. */
async function signedJson<T>(
  device: Device,
  method: "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await linkFor(device).fetch(endpoint(device, path), {
    method,
    headers: {
      "content-type": "application/json",
      ...(await signRequest(device, method, path, raw)),
    },
    ...(raw === "" ? {} : { body: raw }),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new PairingError(failure.error?.message ?? `${path} answered ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Make a passkey for this device's person: the server's options, the browser's authenticator,
 * and the answer back to the server, which keeps the public key (ADR 0034).
 */
export async function registerPasskey(
  device: Device,
  name: string,
): Promise<{ passkeyId: string; name: string }> {
  if (!passkeysSupported()) throw new PairingError("This browser cannot make a passkey.");
  const options = await signedJson<Parameters<typeof creationOptionsFromJson>[0]>(
    device,
    "POST",
    "/v1/passkeys/options",
  );
  const credential = (await navigator.credentials.create({
    publicKey: creationOptionsFromJson(options),
  })) as PublicKeyCredential | null;
  if (credential === null) throw new PairingError("No passkey was made.");
  const registered = await signedJson<{ passkey_id: string; name: string }>(
    device,
    "POST",
    "/v1/passkeys",
    {
      challenge: options.challenge,
      credential: credentialToJson(credential as never),
      name,
    },
  );
  return { passkeyId: registered.passkey_id, name: registered.name };
}

/**
 * Come back on a new device: the authenticator answers the server's challenge, and the server
 * pairs the key this device just made for the person the passkey names.
 */
export async function signInWithPasskey(
  deviceName: string,
  serverUrl = "",
  storage: DeviceStorage = browserStorage,
): Promise<Device> {
  if (!passkeysSupported()) throw new PairingError("This browser cannot use a passkey.");
  const options = await knock<Parameters<typeof requestOptionsFromJson>[0]>(
    serverUrl,
    "/v1/passkeys/assertion-options",
    {},
    "The server is not taking passkeys right now.",
  );
  const credential = (await navigator.credentials.get({
    publicKey: requestOptionsFromJson(options),
  })) as PublicKeyCredential | null;
  if (credential === null) throw new PairingError("No passkey was offered.");
  const { pair, publicKey } = await newDeviceKey(storage);
  const signedIn = await knock<PairedOnTheWire>(
    serverUrl,
    "/v1/passkeys/assert",
    {
      challenge: options.challenge,
      credential: credentialToJson(credential as never),
      public_key: publicKey,
      device_name: deviceName,
    },
    "That passkey is not known here.",
  );
  return keep(signedIn, pair.privateKey, serverUrl, storage);
}

/**
 * A path on the server this device is paired with. The signature always covers the path alone,
 * never the origin, because that is what the server sees and verifies — so everything signs
 * `target` and fetches `endpoint(device, target)`.
 */
export function endpoint(device: Device, path: string): string {
  return `${device.serverUrl ?? ""}${path}`;
}

/**
 * The same server, as a WebSocket origin. A device that names no server is a browser the server
 * served, so the page's own origin is the answer; anywhere else that is a device with nowhere
 * to connect, and saying so beats building `ws://undefined`.
 */
export function socketOrigin(device: Device): string {
  const base = device.serverUrl ?? "";
  if (base !== "") return base.replace(/^http/, "ws");
  const page = globalThis.location as Location | undefined;
  if (page === undefined) {
    throw new Error("This device names no server, and there is no page to take one from.");
  }
  return `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}`;
}

/**
 * The headers a signed request carries. The signature covers the method, the full request
 * target — path and query — a timestamp and a digest of the body, so it cannot be moved to
 * another route, reused with a different query, replayed later, or reused with different content
 * (ADR 0006, phase-0-review finding 5). Inside a tunnel it covers the tunnel's handshake hash as
 * a fifth line too, and says so with `x-chips-signed: v2` (ADR 0191, decision 6): the signature
 * is then good in that tunnel and nowhere else, not through another tunnel and not on the plain
 * port, so a captured request replays nowhere. `link` is the link the request will go by: the
 * device's own unless the caller has one in hand; a tunnel still to be chosen is waited for, so
 * what is signed is the tunnel the request will cross.
 */
export async function signRequest(
  device: Device,
  method: string,
  target: string,
  body: string | Uint8Array<ArrayBuffer>,
  link: Pick<Link, "handshakeHash"> = linkFor(device),
): Promise<Record<string, string>> {
  const handshakeHash = await link.handshakeHash?.();
  const timestamp = Date.now();
  const bytes: Uint8Array<ArrayBuffer> =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const payload = [
    method.toUpperCase(),
    target,
    String(timestamp),
    hex,
    ...(handshakeHash === undefined ? [] : [handshakeHash]),
  ].join("\n");

  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    device.privateKey,
    new TextEncoder().encode(payload),
  );

  return {
    "x-chips-device": device.deviceId,
    "x-chips-timestamp": String(timestamp),
    "x-chips-signature": btoa(String.fromCharCode(...new Uint8Array(signature))),
    ...(handshakeHash === undefined ? {} : { "x-chips-signed": "v2" }),
  };
}
