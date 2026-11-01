/**
 * The two pure things in `device.ts`: where a request goes, and where the socket goes.
 *
 * The rest of the file is a real Ed25519 key in a real IndexedDB and stays Playwright's. These
 * two are arithmetic on strings, and they are what lets the same client talk to a server it was
 * not served by — which is the whole of the desktop shell's relationship with `chipsd` (M2.2).
 */

import { describe, expect, it, vi } from "vitest";
import { allowWaiting, waitForAllow } from "./allowWait.js";
import { cacheKey } from "./cache.js";
import type { Device } from "./device.js";
import {
  askToJoin,
  creationOptionsFromJson,
  credentialToJson,
  type DeviceStorage,
  endpoint,
  forgetDevice,
  inviteFromUrl,
  joinByInvite,
  loadDevice,
  loadDevices,
  nameTaken,
  PairingError,
  pairDevice,
  passkeysSupported,
  peekInvite,
  readDevices,
  rememberReach,
  rememberRelay,
  rememberWorkspaceName,
  requestOptionsFromJson,
  setDeviceMuted,
  signRequest,
  socketOrigin,
  switchDevice,
  workspaceLabel,
} from "./device.js";
import { directLink, doorLink, dropLink, type Link, linkFor, useLink } from "./link.js";
import { fakeServer, okJson } from "./testing/fake-server.js";

const device = (serverUrl?: string): Device => ({
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  privateKey: {} as CryptoKey,
  ...(serverUrl === undefined ? {} : { serverUrl }),
});

describe("where a request goes", () => {
  it("is the page's own origin for a browser the server served", () => {
    expect(endpoint(device(), "/v1/participants")).toBe("/v1/participants");
    expect(endpoint(device(""), "/v1/participants")).toBe("/v1/participants");
  });

  it("is the paired server for a client that was served by something else", () => {
    expect(endpoint(device("http://mini.local:4431"), "/v1/participants")).toBe(
      "http://mini.local:4431/v1/participants",
    );
  });

  it("leaves the path alone, because that is what the signature covers", () => {
    const path = "/v1/attachments/att_1?variant=thumb";
    expect(endpoint(device("http://mini.local:4431"), path).endsWith(path)).toBe(true);
  });
});

describe("a signed request (ADR 0006; ADR 0191, decision 6)", () => {
  const LAN = "http://192.168.1.20:4431";
  const hex = (bytes: ArrayBuffer) =>
    [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

  /** A real key, and a check of a signature over the lines the server would rebuild. */
  async function signer() {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const paired = { ...device(LAN), privateKey: pair.privateKey };
    const verify = async (headers: Record<string, string>, lines: string[]) => {
      const signature = Uint8Array.from(atob(headers["x-chips-signature"] ?? ""), (c) =>
        c.charCodeAt(0),
      );
      const payload = [...lines.slice(0, 2), headers["x-chips-timestamp"], ...lines.slice(2)];
      return crypto.subtle.verify(
        { name: "Ed25519" },
        pair.publicKey,
        signature,
        new TextEncoder().encode(payload.join("\n")),
      );
    };
    return { paired, verify };
  }

  it("signs the four-line shape on the plain link, and says nothing of a tunnel", async () => {
    const { paired, verify } = await signer();
    const body = '{"a":1}';
    const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
    const headers = await signRequest(paired, "post", "/v1/events?x=1", body, directLink);
    expect(headers["x-chips-device"]).toBe("dev_1");
    expect(headers["x-chips-signed"]).toBeUndefined();
    expect(await verify(headers, ["POST", "/v1/events?x=1", digest])).toBe(true);
    expect(await verify(headers, ["POST", "/v1/events?x=1", digest, "ab".repeat(32)])).toBe(false);
  });

  it("names the tunnel's handshake hash as a fifth line inside one, and says so", async () => {
    const { paired, verify } = await signer();
    const empty = hex(await crypto.subtle.digest("SHA-256", new Uint8Array()));
    const home = await fakeServer(okJson);
    const tunnel = await doorLink(LAN, home.serverKey, { socket: home.factory });
    const hash = home.handshakeHash() ?? "";
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const headers = await signRequest(paired, "GET", "/v1/participants", "", tunnel);
    expect(headers["x-chips-signed"]).toBe("v2");
    expect(await verify(headers, ["GET", "/v1/participants", empty, hash])).toBe(true);
    expect(await verify(headers, ["GET", "/v1/participants", empty])).toBe(false);
    tunnel.close();
  });

  it("signs for the link the device is using, waiting for the transport's choice before it", async () => {
    const { paired, verify } = await signer();
    const empty = hex(await crypto.subtle.digest("SHA-256", new Uint8Array()));
    const home = await fakeServer(okJson);
    // Nothing chosen yet: the signing waits, so what it names is the tunnel the request crosses.
    const signing = signRequest(paired, "GET", "/v1/server", "");
    const tunnel = await doorLink(LAN, home.serverKey, { socket: home.factory });
    useLink(paired.deviceId, tunnel);
    const headers = await signing;
    expect(headers["x-chips-signed"]).toBe("v2");
    expect(await verify(headers, ["GET", "/v1/server", empty, home.handshakeHash() ?? ""])).toBe(
      true,
    );
    // The plain link chosen, as for a server from before keys: four lines again.
    useLink(paired.deviceId, directLink);
    const plain = await signRequest(paired, "GET", "/v1/server", "");
    expect(plain["x-chips-signed"]).toBeUndefined();
    expect(await verify(plain, ["GET", "/v1/server", empty])).toBe(true);
    dropLink(paired.deviceId);
  });
});

describe("where the socket goes", () => {
  it("follows the paired server, http to ws and https to wss", () => {
    expect(socketOrigin(device("http://mini.local:4431"))).toBe("ws://mini.local:4431");
    expect(socketOrigin(device("https://chips.example"))).toBe("wss://chips.example");
  });

  it("says so when a device names no server and there is no page either", () => {
    // Under Node there is no `location`: a device with nowhere to connect is a real fault, and
    // naming it beats building `ws://undefined`.
    expect(() => socketOrigin(device())).toThrow(/no server/);
  });
});

describe("an invite in a link", () => {
  it("is read from the hash, or from the query for a link somebody rewrote", () => {
    expect(inviteFromUrl({ search: "", hash: "#invite=chips_inv_abc" })).toBe("chips_inv_abc");
    expect(inviteFromUrl({ search: "?invite=chips_inv_q", hash: "" })).toBe("chips_inv_q");
    expect(inviteFromUrl({ search: "", hash: "#pair=ABC-234" })).toBe("");
  });
});

describe("WebAuthn's JSON form and the browser's", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  const b64u = (text: string) => Buffer.from(text).toString("base64url");

  it("turns the server's creation options into what navigator.credentials.create takes", () => {
    const options = creationOptionsFromJson({
      challenge: b64u("a-challenge"),
      rp: { name: "Chips" },
      user: { id: b64u("usr_1"), name: "Arjun", displayName: "Arjun" },
      pubKeyCredParams: [{ type: "public-key", alg: -8 }],
      authenticatorSelection: { residentKey: "preferred" },
      excludeCredentials: [{ type: "public-key", id: b64u("cred"), transports: ["internal"] }],
      timeout: 1000,
      attestation: "none",
    });
    expect(new TextDecoder().decode(options.challenge as ArrayBuffer)).toBe("a-challenge");
    expect(new TextDecoder().decode(options.user.id as ArrayBuffer)).toBe("usr_1");
    expect(options.rp).toEqual({ name: "Chips" });
    expect(options.excludeCredentials?.[0]?.transports).toEqual(["internal"]);
    expect(new TextDecoder().decode(options.excludeCredentials?.[0]?.id as ArrayBuffer)).toBe(
      "cred",
    );
    expect(options.attestation).toBe("none");
    expect(
      creationOptionsFromJson({
        challenge: b64u("x"),
        rp: { name: "Chips", id: "chips.example" },
        user: { id: b64u("u"), name: "n", displayName: "n" },
        pubKeyCredParams: [],
      }).rp,
    ).toEqual({ name: "Chips", id: "chips.example" });
  });

  it("turns the server's request options into what navigator.credentials.get takes", () => {
    const options = requestOptionsFromJson({ challenge: b64u("c"), userVerification: "preferred" });
    expect(new TextDecoder().decode(options.challenge as ArrayBuffer)).toBe("c");
    expect(options.userVerification).toBe("preferred");
    expect(options.rpId).toBeUndefined();
  });

  it("turns the browser's credential into base64url the server reads", () => {
    const json = credentialToJson({
      id: "cred",
      rawId: bytes("cred").buffer as ArrayBuffer,
      type: "public-key",
      response: {
        clientDataJSON: bytes("{}").buffer as ArrayBuffer,
        attestationObject: bytes("att").buffer as ArrayBuffer,
        getTransports: () => ["internal"],
      },
    });
    expect(json).toEqual({
      id: "cred",
      rawId: b64u("cred"),
      type: "public-key",
      response: {
        clientDataJSON: b64u("{}"),
        attestationObject: b64u("att"),
        transports: ["internal"],
      },
    });
    const assertion = credentialToJson({
      id: "cred",
      rawId: bytes("cred").buffer as ArrayBuffer,
      type: "public-key",
      response: {
        clientDataJSON: bytes("{}").buffer as ArrayBuffer,
        authenticatorData: bytes("auth").buffer as ArrayBuffer,
        signature: bytes("sig").buffer as ArrayBuffer,
        userHandle: null,
      },
    });
    expect(assertion["response"]).toEqual({
      clientDataJSON: b64u("{}"),
      authenticatorData: b64u("auth"),
      signature: b64u("sig"),
    });
  });

  it("knows when a browser has no passkeys", () => {
    expect(passkeysSupported({} as typeof globalThis)).toBe(false);
    expect(
      passkeysSupported({ PublicKeyCredential: class {}, navigator: { credentials: {} } } as never),
    ).toBe(true);
  });
});

describe("a storage that keeps the key its own way (ADR 0042 … M4.2)", () => {
  /**
   * The phone's shape: SQLite cannot hold a `CryptoKey`, so it exports the private half to the
   * Keychain and the record holds a reference. Node's own WebCrypto stands in for the phone's
   * here; what is being tested is the seam, not the crypto.
   */
  function keychain() {
    const vault = new Map<string, Uint8Array>();
    /** References the Keychain will not open just now: a locked phone's (ADR 0228). */
    const shut = new Set<string>();
    const storage = {
      ...memory(),
      keepKey: async (privateKey: CryptoKey) => {
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
        const reference = `key-${vault.size + 1}`;
        vault.set(reference, pkcs8);
        return { keyRef: reference };
      },
      loadKey: async (kept: unknown) => {
        const reference = (kept as { keyRef?: string }).keyRef ?? "";
        if (shut.has(reference)) throw new Error("User interaction is not allowed.");
        const bytes = vault.get(reference);
        if (bytes === undefined) return undefined;
        // Non-extractable coming back: nothing reads it again after the Keychain gave it up.
        return crypto.subtle.importKey("pkcs8", bytes.slice(), { name: "Ed25519" }, false, [
          "sign",
        ]);
      },
    };
    return { storage, vault, shut };
  }

  /** A device kept the phone's way, under `id`, with a real key in the vault. */
  async function kept(
    storage: ReturnType<typeof keychain>["storage"],
    id: string,
    workspaceId = "ws_1",
  ) {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const privateKey = await storage.keepKey(pair.privateKey);
    await storage.put(id, {
      ...device(`http://${id}.local:4431`),
      deviceId: id,
      workspaceId,
      privateKey,
    });
    return privateKey;
  }

  it("hands the private half away on the way in and takes it back on the way out", async () => {
    const { storage, vault } = keychain();
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    await storage.put("dev_9", { ...device("http://mini.local:4431"), deviceId: "dev_9" });
    // What `keep` does, through the seam: the record holds the reference, not a key.
    const kept = await storage.keepKey(pair.privateKey);
    await storage.put("dev_9", {
      ...device("http://mini.local:4431"),
      deviceId: "dev_9",
      privateKey: kept,
    });
    await storage.put("current", { pointer: "dev_9" });
    expect(vault.size).toBe(1);
    expect((storage.data.get("dev_9") as { privateKey: unknown }).privateKey).toEqual({
      keyRef: "key-1",
    });

    const loaded = await loadDevice(storage);
    expect(loaded?.deviceId).toBe("dev_9");
    // And it signs: a key that came back through the Keychain is a key.
    const signature = await crypto.subtle.sign(
      { name: "Ed25519" },
      loaded?.privateKey as CryptoKey,
      new TextEncoder().encode("hello"),
    );
    expect(
      await crypto.subtle.verify(
        { name: "Ed25519" },
        pair.publicKey,
        signature,
        new TextEncoder().encode("hello"),
      ),
    ).toBe(true);
  });

  it("hands the caller a key it can sign with, not the reference it wrote down", async () => {
    // The bug this covers: `keep` wrote the Keychain reference into the record *and* returned
    // it, so the device `pairDevice` handed back could not sign. A phone signs immediately —
    // the socket ticket is the very next thing it asks for — and the app sat paired and offline
    // until it was restarted, which is the only path that ran `loadKey`. A browser never saw it:
    // with no `keepKey` the record holds the key itself and the two halves are the same object.
    const { storage, vault } = keychain();
    vi.stubGlobal("fetch", async () =>
      Response.json({
        device_id: "dev_new",
        participant_id: "usr_1",
        workspace_id: "ws_1",
        display_name: "A phone",
      }),
    );
    const paired = await pairDevice("ABC-234", "A phone", "http://mini.local:4431", undefined, {
      ...storage,
    });

    expect(vault.size).toBe(1);
    // What was written down is the reference; what came back is the key.
    expect((storage.data.get("dev_new") as { privateKey: unknown }).privateKey).toEqual({
      keyRef: "key-1",
    });
    const signature = await crypto.subtle.sign(
      { name: "Ed25519" },
      paired.privateKey,
      new TextEncoder().encode("the socket ticket"),
    );
    expect(signature.byteLength).toBe(64);
  });

  it("costs a key that will not open only its own device, and says it could not be read (ADR 0228)", async () => {
    const { storage, shut } = keychain();
    await kept(storage, "dev_home");
    const work = await kept(storage, "dev_work", "ws_2");
    await storage.put("current", { pointer: "dev_work" });
    shut.add(work.keyRef);

    // Until ADR 0228 the one shut key emptied the list, and a locked phone showed Welcome.
    expect((await loadDevices(storage)).map((each) => each.deviceId)).toEqual(["dev_home"]);
    const held = await readDevices(storage);
    expect(held.devices.map((each) => each.deviceId)).toEqual(["dev_home"]);
    expect(held.unreadable).toBe(1);

    // Opened again, both come back, the one in front first.
    shut.clear();
    const whole = await readDevices(storage);
    expect(whole.devices.map((each) => each.deviceId)).toEqual(["dev_work", "dev_home"]);
    expect(whole.unreadable).toBe(0);
  });

  it("leaves out a device whose key is gone, and does not count it as one to read again", async () => {
    const { storage, vault } = keychain();
    await kept(storage, "dev_home");
    const gone = await kept(storage, "dev_old", "ws_2");
    vault.delete(gone.keyRef);
    const held = await readDevices(storage);
    expect(held.devices.map((each) => each.deviceId)).toEqual(["dev_home"]);
    expect(held.unreadable).toBe(0);
  });

  it("answers a storage that will not open with a throw where loadDevices answers nothing", async () => {
    const shutFiles: DeviceStorage = {
      entries: async () => Promise.reject(new Error("protected data unavailable")),
      put: async () => undefined,
      remove: async () => undefined,
    };
    await expect(readDevices(shutFiles)).rejects.toThrow("protected data unavailable");
    expect(await loadDevices(shutFiles)).toEqual([]);
  });

  it("keeps the Keychain reference when a workspace is muted, so the next launch finds its key", async () => {
    // The bug: muting wrote back the device as read, its key where the reference was, which a
    // phone's SQLite keeps as `{"type":"private",…}`, and the next launch found no key at all.
    const { storage } = keychain();
    const reference = await kept(storage, "dev_home");
    await kept(storage, "dev_work", "ws_2");
    await setDeviceMuted("dev_work", true, storage);
    await setDeviceMuted("dev_home", true, storage);
    expect((storage.data.get("dev_home") as { privateKey: unknown }).privateKey).toEqual(reference);
    const held = await readDevices(storage);
    expect(held.devices.map((each) => [each.deviceId, each.muted])).toEqual([
      ["dev_home", true],
      ["dev_work", true],
    ]);
    expect(held.unreadable).toBe(0);
  });

  it("hands out copies: the records keep their references whatever a read hands out", async () => {
    const { storage } = keychain();
    const reference = await kept(storage, "dev_home");
    const [front] = await loadDevices(storage);
    expect(front?.privateKey).not.toEqual(reference);
    expect((storage.data.get("dev_home") as { privateKey: unknown }).privateKey).toEqual(reference);
  });

  it("forgets a device whose key is gone, cache and all", async () => {
    const { storage, vault } = keychain();
    await kept(storage, "dev_home");
    const gone = await kept(storage, "dev_old", "ws_2");
    await storage.put("current", { pointer: "dev_home" });
    vault.delete(gone.keyRef);
    const deleted: string[] = [];
    const next = await forgetDevice("dev_old", storage, {
      delete: async (key) => void deleted.push(key),
    });
    expect(next?.deviceId).toBe("dev_home");
    expect(storage.data.has("dev_old")).toBe(false);
    expect(deleted).toHaveLength(1);
  });

  it("changes nothing for a storage that holds a key itself", async () => {
    const storage = memory({
      dev_1: device("http://mini.local:4431"),
      current: { pointer: "dev_1" },
    });
    expect(storage.keepKey).toBeUndefined();
    expect((await loadDevice(storage))?.deviceId).toBe("dev_1");
  });
});

/** A map standing in for IndexedDB, so the list of paired workspaces is tested under Node. */
function memory(
  initial: Record<string, unknown> = {},
): DeviceStorage & { readonly data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    entries: async () => [...data.entries()],
    put: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

const home = device("http://mini.local:4431");
const work = {
  ...device("https://chips.example"),
  deviceId: "dev_2",
  workspaceId: "ws_2",
  workspaceName: "Northwind",
};

describe("an invite, through the relay (ADR 0164)", () => {
  it("asks what the link is for and joins by the link it is handed, and the device keeps it", async () => {
    const asked: string[] = [];
    const answers: Record<string, unknown> = {
      "/v1/invites/peek": {
        invite_id: "inv_1",
        workspace_id: "ws_1",
        workspace_name: "Demo",
        role: "member",
        single_use: true,
        expires_at: "2099-01-01T00:00:00.000Z",
        invited_by_name: "Arjun",
      },
      "/v1/invites/redeem": {
        device_id: "dev_joined",
        participant_id: "usr_9",
        workspace_id: "ws_1",
        workspace_name: "Demo",
        display_name: "Priya Nair",
      },
    };
    const tunnel: Link = {
      kind: "relay",
      fetch: async (url) => {
        const path = new URL(url).pathname;
        asked.push(path);
        return Response.json(answers[path]);
      },
      socket: () => {
        throw new Error("no socket here");
      },
      close: () => undefined,
    };
    const reach = { serverKey: "k".repeat(43), relayUrl: "wss://relay.example" };
    const storage = memory();

    const peeked = await peekInvite("chips_inv_1", "http://mini.local:4431", tunnel);
    expect(peeked).toMatchObject({ workspaceName: "Demo", role: "member", invitedByName: "Arjun" });
    const joined = await joinByInvite(
      "chips_inv_1",
      "Priya Nair",
      "iPhone 17",
      "http://mini.local:4431",
      storage,
      { link: tunnel, ...reach },
    );

    expect(asked).toEqual(["/v1/invites/peek", "/v1/invites/redeem"]);
    expect(joined).toMatchObject({ deviceId: "dev_joined", workspaceName: "Demo", ...reach });
    expect(storage.data.get("dev_joined")).toMatchObject(reach);
    // What the device says next goes the same way the join went.
    expect(linkFor(joined)).toBe(tunnel);
  });

  it("waits for the inviter's Allow through the same tunnel, showing six digits, when the link asks (ADR 0232)", async () => {
    const asked: string[] = [];
    const answers = [
      Response.json(
        {
          state: "waiting",
          request_id: "jrq_1",
          secret: "s".repeat(32),
          code: "742913",
          expires_in: 600,
          interval: 3,
        },
        { status: 202 },
      ),
      Response.json({ state: "waiting", interval: 2 }, { status: 202 }),
      Response.json({
        kind: "device",
        url: "http://mini.local:4431",
        device_id: "dev_waited",
        participant_id: "usr_9",
        workspace_id: "ws_1",
        workspace_name: "Demo",
        display_name: "Priya Nair",
        role: "guest",
      }),
    ];
    const tunnel: Link = {
      kind: "relay",
      fetch: async (url) => {
        asked.push(new URL(url).pathname);
        return answers.shift() as Response;
      },
      socket: () => {
        throw new Error("no socket here");
      },
      close: () => undefined,
    };
    const wait = waitForAllow("invite", { inviter: "Arjun", place: "Japan trip" });
    const shown: (string | undefined)[] = [];
    const slept: number[] = [];
    const joined = await joinByInvite(
      "chips_inv_1",
      "Priya Nair",
      "iPhone 17",
      "http://mini.local:4431",
      memory(),
      { link: tunnel },
      {
        ...wait,
        sleep: async (ms) => {
          slept.push(ms);
          shown.push(allowWaiting()?.code);
        },
        now: () => 0,
      },
    );
    wait.done();

    expect(asked).toEqual(["/v1/invites/redeem", "/v1/join/jrq_1/redeem", "/v1/join/jrq_1/redeem"]);
    // The six digits were up while it waited, with whom it waited for; and gone once done.
    expect(shown).toEqual(["742913", "742913"]);
    expect(slept).toEqual([3000, 2000]);
    expect(joined).toMatchObject({ deviceId: "dev_waited", workspaceName: "Demo" });
    expect(allowWaiting()).toBeUndefined();
  });

  it("stops waiting when told to, and keeps nothing (ADR 0232)", async () => {
    const tunnel: Link = {
      kind: "direct",
      fetch: async () =>
        Response.json(
          {
            state: "waiting",
            request_id: "jrq_1",
            secret: "s".repeat(32),
            code: "742913",
            expires_in: 600,
            interval: 3,
          },
          { status: 202 },
        ),
      socket: () => {
        throw new Error("no socket here");
      },
      close: () => undefined,
    };
    const wait = waitForAllow("invite");
    const storage = memory();
    const stopped = await joinByInvite(
      "chips_inv_1",
      "Priya",
      "iPhone",
      "",
      storage,
      {
        link: tunnel,
      },
      {
        ...wait,
        sleep: async () => allowWaiting()?.stop(),
      },
    ).catch((error: unknown) => error);
    expect(stopped).toBeInstanceOf(PairingError);
    expect((stopped as Error).message).toBe("Stopped asking.");
    expect(allowWaiting()).toBeUndefined();
    expect(await loadDevice(storage)).toBeUndefined();
  });

  it("says a join refused for its name was, so the joiner is asked for another (ADR 0197)", async () => {
    const refusing = (error: Record<string, unknown>): Link => ({
      kind: "direct",
      fetch: async () =>
        Response.json({ error: { code: "invalid_event", ...error } }, { status: 422 }),
      socket: () => {
        throw new Error("no socket here");
      },
      close: () => undefined,
    });
    const join = (link: Link) =>
      joinByInvite("chips_inv_1", "Meera", "iPhone 17", "", memory(), { link }).catch(
        (error: unknown) => error,
      );

    const taken = await join(
      refusing({ message: "Somebody here goes by Meera already.", refusal: "name_taken" }),
    );
    expect(taken).toBeInstanceOf(PairingError);
    expect(taken).toMatchObject({ message: "Somebody here goes by Meera already." });
    expect(nameTaken(taken)).toBe(true);
    // Anything else the answer was refused for asks for no name.
    const blank = await join(
      refusing({ message: "Give the person a name, up to 120 characters." }),
    );
    expect(nameTaken(blank)).toBe(false);
    expect(nameTaken(new Error("Somebody here goes by Meera already."))).toBe(false);
  });
});

describe("several workspaces on one device (M5.3)", () => {
  it("moves a device paired before there could be several under its own id, once", async () => {
    const storage = memory({ current: home });
    expect(await loadDevice(storage)).toEqual(home);
    expect(storage.data.get("current")).toEqual({ pointer: "dev_1" });
    expect(storage.data.get("dev_1")).toEqual(home);
    expect(await loadDevices(storage)).toEqual([home]);
  });

  it("lists the one in front first, switches, and forgets one at a time", async () => {
    const storage = memory({ dev_1: home, dev_2: work, current: { pointer: "dev_2" } });
    expect((await loadDevices(storage)).map((each) => each.deviceId)).toEqual(["dev_2", "dev_1"]);
    expect((await loadDevice(storage))?.deviceId).toBe("dev_2");
    expect((await switchDevice("dev_1", storage))?.deviceId).toBe("dev_1");
    expect((await loadDevice(storage))?.deviceId).toBe("dev_1");
    expect(await switchDevice("dev_9", storage)).toBeUndefined();
    // Forgetting the one in front brings the other forward; forgetting the last leaves nothing.
    expect((await forgetDevice(undefined, storage))?.deviceId).toBe("dev_2");
    expect((await loadDevices(storage)).map((each) => each.deviceId)).toEqual(["dev_2"]);
    expect(await forgetDevice("dev_2", storage)).toBeUndefined();
    expect(await loadDevice(storage)).toBeUndefined();
    expect(storage.data.has("current")).toBe(false);
  });

  it("forgets a device's cache with its key, under the key the cache was opened with (SEC-32)", async () => {
    const storage = memory({ dev_1: home, dev_2: work, current: { pointer: "dev_1" } });
    const deleted: string[] = [];
    const cache = { delete: async (key: string) => void deleted.push(key) };
    expect((await forgetDevice("dev_2", storage, cache))?.deviceId).toBe("dev_1");
    expect(deleted).toEqual([cacheKey(work)]);
    // A cache that will not go does not keep the key: the device is forgotten either way.
    const stubborn = { delete: async () => Promise.reject(new Error("blocked")) };
    expect(await forgetDevice("dev_1", storage, stubborn)).toBeUndefined();
    expect(await loadDevice(storage)).toBeUndefined();
  });

  it("forgets one that is not in front without moving the front", async () => {
    const storage = memory({ dev_1: home, dev_2: work, current: { pointer: "dev_1" } });
    expect((await forgetDevice("dev_2", storage))?.deviceId).toBe("dev_1");
    expect(storage.data.get("current")).toEqual({ pointer: "dev_1" });
  });

  it("mutes a workspace on this device, and on nothing else", async () => {
    const storage = memory({ dev_1: home, dev_2: work, current: { pointer: "dev_1" } });
    expect((await setDeviceMuted("dev_2", true, storage))?.muted).toBe(true);
    expect((await loadDevices(storage)).find((each) => each.deviceId === "dev_2")?.muted).toBe(
      true,
    );
    expect(
      (await loadDevices(storage)).find((each) => each.deviceId === "dev_1")?.muted,
    ).toBeUndefined();
    expect(await setDeviceMuted("dev_9", true, storage)).toBeUndefined();
  });

  it("keeps a relay its server named with that device, and the key reference as stored", async () => {
    const kept = { ...home, privateKey: { keyRef: "key-1" } as unknown as CryptoKey };
    const storage = memory({ dev_1: kept, dev_2: work, current: { pointer: "dev_1" } });
    const relay = { url: "wss://relay.chipschat.ai", serverKey: "k".repeat(43) };
    const held = { serverKey: relay.serverKey, relayUrl: relay.url };
    expect(await rememberRelay("dev_1", relay, storage)).toMatchObject(held);
    expect(storage.data.get("dev_1")).toEqual({ ...kept, ...held });
    expect(storage.data.get("dev_2")).toEqual(work);
    expect(await rememberRelay("dev_9", relay, storage)).toBeUndefined();
    const broken = { ...memory(), entries: () => Promise.reject(new Error("closed")) };
    expect(await rememberRelay("dev_1", relay, broken)).toBeUndefined();
  });

  it("keeps the name a workspace has now with that device, and the key reference as stored", async () => {
    const kept = { ...home, privateKey: { keyRef: "key-1" } as unknown as CryptoKey };
    const storage = memory({ dev_1: kept, dev_2: work, current: { pointer: "dev_1" } });
    expect(await rememberWorkspaceName("dev_1", "Gupta Labs", storage)).toMatchObject({
      workspaceName: "Gupta Labs",
    });
    expect(storage.data.get("dev_1")).toEqual({ ...kept, workspaceName: "Gupta Labs" });
    expect(storage.data.get("dev_2")).toEqual(work);
    expect(await rememberWorkspaceName("dev_9", "Gupta Labs", storage)).toBeUndefined();
  });

  it("keeps a first key its server named with that device, with or without a relay (ADR 0191, Phase 3)", async () => {
    const KEY = "k".repeat(43);
    const kept = { ...home, privateKey: { keyRef: "key-1" } as unknown as CryptoKey };
    const storage = memory({ dev_1: kept, dev_2: work, current: { pointer: "dev_1" } });
    // A server with no relay names its key alone: the record gains the key and nothing else.
    expect(await rememberReach("dev_1", { serverKey: KEY }, storage)).toMatchObject({
      serverKey: KEY,
    });
    expect(storage.data.get("dev_1")).toEqual({ ...kept, serverKey: KEY });
    expect(storage.data.get("dev_2")).toEqual(work);
    // Named with a relay, the relay comes too, as `rememberRelay` keeps it.
    const relayUrl = "wss://relay.chipschat.ai";
    await rememberReach("dev_1", { serverKey: KEY, relayUrl }, storage);
    expect(storage.data.get("dev_1")).toEqual({ ...kept, serverKey: KEY, relayUrl });
    expect(await rememberReach("dev_9", { serverKey: KEY }, storage)).toBeUndefined();
  });

  it("moves the key out of a record's relay and beside its address, once (ADR 0191)", async () => {
    // Before ADR 0191 the key lived inside the relay, so a server with no relay had none; now the
    // key stands on its own and the relay is an address. A record from then is read as it is kept
    // now and written back, with the Keychain reference it held as it was.
    const KEY = "k".repeat(43);
    const old = {
      ...home,
      privateKey: { keyRef: "key-1" } as unknown as CryptoKey,
      relay: { url: "wss://relay.chipschat.ai", serverKey: KEY },
    };
    const storage = memory({ dev_1: old, dev_2: work, current: { pointer: "dev_1" } });
    const [front] = await loadDevices(storage);
    expect(front).toMatchObject({ deviceId: "dev_1", serverKey: KEY, relayUrl: old.relay.url });
    expect(front).not.toHaveProperty("relay");
    const { relay: _gone, ...rest } = old;
    expect(storage.data.get("dev_1")).toEqual({ ...rest, serverKey: KEY, relayUrl: old.relay.url });
    expect(storage.data.get("dev_2")).toEqual(work);
    // The one device of a browser paired before there could be several, from before keys too.
    const single = memory({ current: old });
    expect(await loadDevice(single)).toMatchObject({ serverKey: KEY, relayUrl: old.relay.url });
    expect(single.data.get("dev_1")).toEqual({ ...rest, serverKey: KEY, relayUrl: old.relay.url });
    expect(single.data.get("current")).toEqual({ pointer: "dev_1" });
  });

  it("names a workspace by its name, else its host, else here", () => {
    expect(workspaceLabel({ workspaceName: "Northwind", serverUrl: "https://chips.example" })).toBe(
      "Northwind",
    );
    expect(workspaceLabel({ serverUrl: "http://mini.local:4431" })).toBe("mini.local:4431");
    expect(workspaceLabel({ serverUrl: "not a url" })).toBe("not a url");
    expect(workspaceLabel({})).toBe("This server");
  });
});

describe("pairing by a typed code (ADR 0191, decision 5)", () => {
  const SERVER = "http://192.168.1.20:4431";
  const answer = (server_key?: string) => ({
    device_id: "dev_typed",
    participant_id: "usr_1",
    workspace_id: "ws_1",
    display_name: "Arjun",
    ...(server_key === undefined ? {} : { server_key }),
  });
  /** The runtime's `WebSocket`, played by the fake server's factory: `new` hands back its socket. */
  const socketsOf = (server: Awaited<ReturnType<typeof fakeServer>>) =>
    class {
      constructor(url: string) {
        // biome-ignore lint/correctness/noConstructorReturn: a constructor that is a factory
        return server.factory(url);
      }
    };

  it("pairs on the plain link once, pins the key the answer carries, and opens the tunnel to it", async () => {
    const home = await fakeServer(okJson);
    const plain: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      plain.push(url);
      return Response.json(answer(home.serverKey), { status: 201 });
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const storage = memory();
    const device = await pairDevice("abc-234", "iPhone", SERVER, {}, storage);
    vi.unstubAllGlobals();
    expect(plain).toEqual([`${SERVER}/v1/pair`]);
    expect(device.serverKey).toBe(home.serverKey);
    expect(storage.data.get("dev_typed")).toMatchObject({ serverKey: home.serverKey });
    // The next thing it says goes inside the tunnel, through the door.
    expect(linkFor(device).kind).toBe("tunnel");
    expect(home.opened).toEqual(["ws://192.168.1.20:4431/v1/tunnel"]);
    dropLink(device.deviceId);
  });

  it("is paired all the same when the door does not answer yet, and chooses no link", async () => {
    const home = await fakeServer(okJson, { door: "refuses" });
    vi.stubGlobal("fetch", async () => Response.json(answer(home.serverKey), { status: 201 }));
    vi.stubGlobal("WebSocket", socketsOf(home));
    const storage = memory();
    const device = await pairDevice("ABC-234", "iPhone", SERVER, {}, storage);
    vi.unstubAllGlobals();
    expect(device.serverKey).toBe(home.serverKey);
    // Nothing chosen: what it says next waits for the transport's tunnel, and never goes plain.
    expect(linkFor(device).kind).toBe("tunnel");
    await expect(linkFor(device, 10).fetch(`${SERVER}/v1/server`)).rejects.toThrow(
      "No tunnel to the server was open in time.",
    );
    expect((await loadDevice(storage))?.deviceId).toBe("dev_typed");
  });

  it("keeps the plain link for a server from before keys, which hands it none", async () => {
    const opened: string[] = [];
    vi.stubGlobal("fetch", async () => Response.json(answer(), { status: 201 }));
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor(url: string) {
          opened.push(url);
        }
      },
    );
    const device = await pairDevice("ABC-234", "iPhone", SERVER, {}, memory());
    vi.unstubAllGlobals();
    expect(device.serverKey).toBeUndefined();
    expect(linkFor(device)).toBe(directLink);
    expect(opened).toEqual([]);
  });

  it("pairs inside the tunnel from its first request when the payload carries the key", async () => {
    const home = await fakeServer(async (input) => ({
      status: 201,
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(
        JSON.stringify(input.target === "/v1/pair" ? answer(home.serverKey) : {}),
      ),
    }));
    const plain: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      plain.push(url);
      throw new TypeError("plain fetch");
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const device = await pairDevice(
      "ABC-234",
      "iPhone",
      SERVER,
      { serverKey: home.serverKey },
      memory(),
    );
    vi.unstubAllGlobals();
    expect(plain).toEqual([]);
    expect(home.seen.map((each) => each.target)).toEqual(["/v1/pair"]);
    expect(device.serverKey).toBe(home.serverKey);
    expect(linkFor(device).kind).toBe("tunnel");
    dropLink(device.deviceId);
  });
});

describe("askToJoin", () => {
  const SERVER = "http://192.168.1.20:4431";
  const asked = {
    request_id: "jrq_1",
    secret: "s".repeat(32),
    code: "ABC-234",
    expires_in: 600,
    interval: 3,
  };
  const joined = {
    kind: "device",
    url: SERVER,
    device_id: "dev_phone",
    participant_id: "usr_1",
    workspace_id: "ws_1",
    display_name: "Arjun",
    workspace_name: "My workspace",
  };

  it("asks with its key, shows the code, waits while a person decides, and keeps what it is given", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const answers = [
      new Response(JSON.stringify(asked), { status: 201 }),
      new Response(JSON.stringify({ state: "waiting", interval: 2 }), { status: 202 }),
      new Response(JSON.stringify(joined), { status: 200 }),
    ];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return answers.shift() as Response;
    });
    const waits: number[] = [];
    const shown: string[] = [];
    const storage = memory();
    const device = await askToJoin({
      serverUrl: SERVER,
      name: "iPhone 17 Pro",
      storage,
      onWaiting: (waiting) => shown.push(waiting.code),
      sleep: async (ms) => {
        waits.push(ms);
      },
      now: () => 0,
    });
    vi.unstubAllGlobals();

    expect(calls[0]).toMatchObject({
      url: `${SERVER}/v1/join`,
      body: { kind: "device", name: "iPhone 17 Pro" },
    });
    expect(typeof calls[0]?.body["public_key"]).toBe("string");
    expect(calls.slice(1).map((call) => [call.url, call.body["secret"]])).toEqual([
      [`${SERVER}/v1/join/jrq_1/redeem`, asked.secret],
      [`${SERVER}/v1/join/jrq_1/redeem`, asked.secret],
    ]);
    expect(shown).toEqual(["ABC-234"]);
    // The server's interval, then the one its last answer said.
    expect(waits).toEqual([3000, 2000]);
    expect(device).toMatchObject({
      deviceId: "dev_phone",
      participantId: "usr_1",
      serverUrl: SERVER,
      workspaceName: "My workspace",
    });
    expect((await loadDevice(storage))?.deviceId).toBe("dev_phone");
    // A server from before ADR 0191 named no key: the device holds none, and keeps the plain link.
    expect(device.serverKey).toBeUndefined();
  });

  it("pins the server's key the join answer carries, and not a key that is not one (ADR 0191)", async () => {
    const KEY = "k".repeat(43);
    const answersWith = (server_key: string) => [
      new Response(JSON.stringify(asked), { status: 201 }),
      new Response(JSON.stringify({ ...joined, server_key }), { status: 200 }),
    ];
    const ask = async (server_key: string) => {
      const answers = answersWith(server_key);
      vi.stubGlobal("fetch", async () => answers.shift() as Response);
      const storage = memory();
      const device = await askToJoin({
        serverUrl: SERVER,
        name: "iPhone",
        storage,
        onWaiting: () => undefined,
        sleep: async () => undefined,
      });
      vi.unstubAllGlobals();
      return { device, stored: storage.data.get("dev_phone") as { serverKey?: string } };
    };
    const pinned = await ask(KEY);
    expect(pinned.device.serverKey).toBe(KEY);
    expect(pinned.stored.serverKey).toBe(KEY);
    expect(pinned.device.relayUrl).toBeUndefined();
    // Not the shape of a key: a handshake against it could never complete, so it is not pinned.
    const odd = await ask("not-a-key");
    expect(odd.device.serverKey).toBeUndefined();
    expect(odd.stored.serverKey).toBeUndefined();
  });

  it("says why when a person doesn't allow it", async () => {
    const answers = [
      new Response(JSON.stringify(asked), { status: 201 }),
      new Response(JSON.stringify({ error: { message: "Arjun didn't allow it." } }), {
        status: 403,
      }),
    ];
    vi.stubGlobal("fetch", async () => answers.shift() as Response);
    await expect(
      askToJoin({
        serverUrl: SERVER,
        name: "iPhone",
        storage: memory(),
        onWaiting: () => undefined,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("Arjun didn't allow it.");
    vi.unstubAllGlobals();
  });
});
