/**
 * A second device's code comes from a first: a paired person asks for one, and the code pairs
 * exactly as the one `chips serve` printed would. A harness's token gets no such thing.
 */

import { generateKeyPairSync } from "node:crypto";
import { type ChipsConfig, networkUrl } from "@chipschat/platform";
import { pairingFromLink } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function issue(headers: Record<string, string>): Promise<Response> {
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/pairing-codes`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

/** The public half of a fresh device key, as a browser or the CLI would send it. */
function publicKey(): string {
  return generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "der" })
    .toString("base64");
}

describe("POST /v1/pairing-codes", () => {
  it("gives a paired person a code that pairs another device as them", async () => {
    const response = await issue(ws.arjun.sign("POST", "/v1/pairing-codes", ""));
    expect(response.status).toBe(201);
    const issued = (await response.json()) as { code: string; expires_at: string };
    expect(issued.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(Date.parse(issued.expires_at)).toBeGreaterThan(Date.now());

    const paired = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: issued.code, public_key: publicKey(), name: "Laptop" }),
      }),
    );
    expect(paired.status).toBe(201);
    const device = (await paired.json()) as { participant_id: string; workspace_id: string };
    expect(device.participant_id).toBe(ws.arjun.participantId);
    expect(device.workspace_id).toBe(ws.workspaceId);
  });

  it("is single use, like the one chips serve prints", async () => {
    const response = await issue(ws.arjun.sign("POST", "/v1/pairing-codes", ""));
    const { code } = (await response.json()) as { code: string };
    const body = (key: string) => JSON.stringify({ code, public_key: key, name: "Laptop" });
    const request = (key: string) =>
      new Request(`${BASE}/v1/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body(key),
      });
    expect((await ws.gateway.app.fetch(request(publicKey()))).status).toBe(201);
    expect((await ws.gateway.app.fetch(request(publicKey()))).status).toBe(401);
  });

  it("refuses a harness, whose token is not a person", async () => {
    const response = await issue(ws.scout.headers);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("refuses a request with no credential", async () => {
    expect((await issue({})).status).toBe(401);
  });
});

/** A code asked for with a body, as an owner asks for one for somebody else (ADR 0206). */
async function issueFor(
  as: Pick<TestWorkspace["arjun"], "sign">,
  body: Record<string, unknown>,
): Promise<Response> {
  const raw = JSON.stringify(body);
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/pairing-codes`, {
      method: "POST",
      headers: { "content-type": "application/json", ...as.sign("POST", "/v1/pairing-codes", raw) },
      body: raw,
    }),
  );
}

/** Pair a fresh key with a code: whom the device speaks as, or the status it was refused with. */
async function pairWith(code: string): Promise<string | number> {
  const paired = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, public_key: publicKey(), name: "iPhone 16" }),
    }),
  );
  if (paired.status !== 201) return paired.status;
  return ((await paired.json()) as { participant_id: string }).participant_id;
}

describe("a new phone for somebody already here (ADR 0206)", () => {
  it("gives an owner a code that pairs a phone as Dana, whose own phone was wiped", async () => {
    const response = await issueFor(ws.arjun, { for: ws.dana.participantId });
    expect(response.status).toBe(201);
    const { code } = (await response.json()) as { code: string };
    expect(await pairWith(code)).toBe(ws.dana.participantId);
  });

  it("is the caller's own code when the body names the caller, or nobody", async () => {
    const own = await issueFor(ws.arjun, { for: ws.arjun.participantId });
    expect(await pairWith(((await own.json()) as { code: string }).code)).toBe(
      ws.arjun.participantId,
    );
    const none = await issueFor(ws.dana, {});
    expect(await pairWith(((await none.json()) as { code: string }).code)).toBe(
      ws.dana.participantId,
    );
  });

  it("refuses a member, and an admin, who would read as the person they paired for", async () => {
    const member = await issueFor(ws.dana, { for: ws.arjun.participantId });
    expect(member.status).toBe(403);
    const admin = await ws.addPerson("Priya", "admin");
    const asAdmin = await issueFor(admin, { for: ws.dana.participantId });
    expect(asAdmin.status).toBe(403);
    expect(((await asAdmin.json()) as { error: { message: string } }).error.message).toBe(
      "Only an owner pairs a device for somebody else.",
    );
  });

  it("refuses an agent's harness, somebody removed, and nobody at all", async () => {
    expect((await issueFor(ws.arjun, { for: ws.scout.participantId })).status).toBe(404);
    expect((await issueFor(ws.arjun, { for: "usr_01NOBODYNOBODYNOBODYNOBODY" })).status).toBe(404);
    const removed = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/people/${ws.dana.participantId}`, {
        method: "DELETE",
        headers: ws.arjun.sign("DELETE", `/v1/people/${ws.dana.participantId}`, ""),
      }),
    );
    expect(removed.status).toBeLessThan(300);
    expect((await issueFor(ws.arjun, { for: ws.dana.participantId })).status).toBe(404);
  });

  it("says what is wrong with a body that is not one", async () => {
    expect((await issueFor(ws.arjun, { for: 7 })).status).toBe(422);
  });
});

/** When a device was signed out, or null while it is live. */
async function revokedAt(deviceId: string): Promise<string | null | undefined> {
  const row = await ws.db
    .selectFrom("devices")
    .select("revoked_at")
    .where("id", "=", deviceId)
    .executeTakeFirst();
  return row?.revoked_at;
}

describe("reconnecting a phone in the place of the old one (ADR 0236)", () => {
  it("pairs Dana's reinstalled phone as her and signs her old phone out", async () => {
    const response = await issueFor(ws.arjun, {
      for: ws.dana.participantId,
      replaces: ws.dana.deviceId,
    });
    expect(response.status).toBe(201);
    const { code } = (await response.json()) as { code: string };
    expect(await revokedAt(ws.dana.deviceId)).toBeNull();
    expect(await pairWith(code)).toBe(ws.dana.participantId);
    expect(await revokedAt(ws.dana.deviceId)).not.toBeNull();
    const old = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/devices`, { headers: ws.dana.sign("GET", "/v1/devices", "") }),
    );
    expect(old.status).toBe(401);
  });

  it("lets a person reconnect a device of their own", async () => {
    const response = await issueFor(ws.dana, { replaces: ws.dana.deviceId });
    expect(response.status).toBe(201);
    const { code } = (await response.json()) as { code: string };
    expect(await pairWith(code)).toBe(ws.dana.participantId);
    expect(await revokedAt(ws.dana.deviceId)).not.toBeNull();
  });

  it("refuses a device of somebody else's, one nobody has, and one signed out already", async () => {
    const others = await issueFor(ws.arjun, {
      for: ws.dana.participantId,
      replaces: ws.arjun.deviceId,
    });
    expect(others.status).toBe(404);
    expect(await revokedAt(ws.arjun.deviceId)).toBeNull();
    expect((await issueFor(ws.dana, { replaces: "dev_01NOBODYNOBODYNOBODYNOBODY" })).status).toBe(
      404,
    );
    const signedOut = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/devices/${ws.dana.deviceId}`, {
        method: "DELETE",
        headers: ws.arjun.sign("DELETE", `/v1/devices/${ws.dana.deviceId}`, ""),
      }),
    );
    expect(signedOut.status).toBe(200);
    const gone = await issueFor(ws.arjun, {
      for: ws.dana.participantId,
      replaces: ws.dana.deviceId,
    });
    expect(gone.status).toBe(404);
  });

  it("still pairs when the old device was signed out after the code was made", async () => {
    const response = await issueFor(ws.arjun, {
      for: ws.dana.participantId,
      replaces: ws.dana.deviceId,
    });
    const { code } = (await response.json()) as { code: string };
    await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/devices/${ws.dana.deviceId}`, {
        method: "DELETE",
        headers: ws.arjun.sign("DELETE", `/v1/devices/${ws.dana.deviceId}`, ""),
      }),
    );
    expect(await pairWith(code)).toBe(ws.dana.participantId);
  });

  it("says what is wrong with a device that is not an id", async () => {
    expect((await issueFor(ws.arjun, { for: ws.dana.participantId, replaces: 7 })).status).toBe(
      422,
    );
  });
});

describe("what comes beside the code (M4.1, ADR 0038)", () => {
  it("carries the version, the server's key and an empty candidate list, and no relay when the server has none", async () => {
    const response = await issue(ws.arjun.sign("POST", "/v1/pairing-codes", ""));
    const issued = (await response.json()) as Record<string, unknown>;
    // The key rides with or without a relay (ADR 0191): the tunnel door answers to it.
    expect(issued).toMatchObject({
      v: 1,
      relay: null,
      server_key: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      candidates: [],
    });
  });

  it("sends a computer this server's own page when there is no relay (ADR 0210)", async () => {
    const response = await issue(ws.arjun.sign("POST", "/v1/pairing-codes", ""));
    const issued = (await response.json()) as Record<string, string>;
    const lan = issued["server_url"] ?? "";
    expect(issued["link"]?.startsWith(`${lan}/#pair=${issued["code"]}`)).toBe(true);
    expect(pairingFromLink(issued["link"] ?? "")).toMatchObject({
      code: issued["code"],
      lan,
      key: issued["server_key"],
    });
  });

  it("sends a computer the relay's /pair page, with this server, the key and when it runs out, when there is a relay (ADR 0210)", async () => {
    const withRelay = await createTestWorkspace({
      config: {
        relay: {
          url: "wss://relay.example",
          host: "127.0.0.1",
          port: 4440,
          maxSessionsPerServer: 32,
        },
      },
    });
    try {
      const response = await withRelay.gateway.app.fetch(
        new Request(`${BASE}/v1/pairing-codes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...withRelay.arjun.sign("POST", "/v1/pairing-codes", ""),
          },
        }),
      );
      const issued = (await response.json()) as Record<string, string>;
      const link = issued["link"] ?? "";
      expect(link).toMatch(/^https:\/\/relay\.example\/pair#pair=[A-Z2-9]{3}-[A-Z2-9]{3}&v=1&lan=/);
      expect(pairingFromLink(link)).toMatchObject({
        code: issued["code"],
        lan: issued["server_url"],
        relay: "wss://relay.example",
        key: issued["server_key"],
      });
      const until = Number(new URLSearchParams(link.slice(link.indexOf("#") + 1)).get("until"));
      expect(until).toBe(Math.floor(Date.parse(issued["expires_at"] ?? "") / 1000));
    } finally {
      await withRelay.close();
    }
  });

  /** The address a server with this `server` config hands out beside a code. */
  async function serverUrlOf(server: Partial<ChipsConfig["server"]>): Promise<unknown> {
    const configured = await createTestWorkspace({ config: { server: server as never } });
    try {
      const response = await configured.gateway.app.fetch(
        new Request(`${BASE}/v1/pairing-codes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...configured.arjun.sign("POST", "/v1/pairing-codes", ""),
          },
        }),
      );
      return ((await response.json()) as Record<string, unknown>)["server_url"];
    } finally {
      await configured.close();
    }
  }

  it("says where it is, because the browser drawing the QR only knows its own origin", async () => {
    // Loopback is what a server bound to loopback has to say, however little use it is: the QR
    // is honest about reaching one machine rather than quietly naming the wrong one.
    expect(await serverUrlOf({ host: "127.0.0.1", port: 4431 })).toBe("http://127.0.0.1:4431");
  });

  it("names a network address when it is bound to the network, not the host it bound", async () => {
    const said = await serverUrlOf({ host: "0.0.0.0", port: 4431 });
    expect(said).not.toContain("0.0.0.0");
    // Whatever this machine's networks are — a build box with only loopback included.
    expect(said).toBe(networkUrl(4431) ?? "http://127.0.0.1:4431");
  });

  it("says the address it was configured to advertise, whatever it bound", async () => {
    const said = await serverUrlOf({
      host: "0.0.0.0",
      port: 4431,
      publicUrl: "http://100.64.0.7:4431",
    });
    expect(said).toBe("http://100.64.0.7:4431");
  });

  it("names the relay and the server's tunnel key when the server dials out to one", async () => {
    const withRelay = await createTestWorkspace({
      config: {
        relay: {
          url: "wss://relay.example",
          host: "127.0.0.1",
          port: 4440,
          maxSessionsPerServer: 32,
        },
      },
    });
    try {
      const response = await withRelay.gateway.app.fetch(
        new Request(`${BASE}/v1/pairing-codes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...withRelay.arjun.sign("POST", "/v1/pairing-codes", ""),
          },
        }),
      );
      const issued = (await response.json()) as Record<string, unknown>;
      expect(issued["relay"]).toBe("wss://relay.example");
      expect(issued["server_key"]).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // The same key every time: it was made once and kept.
      const again = await withRelay.gateway.app.fetch(
        new Request(`${BASE}/v1/pairing-codes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...withRelay.arjun.sign("POST", "/v1/pairing-codes", ""),
          },
        }),
      );
      expect(((await again.json()) as Record<string, unknown>)["server_key"]).toBe(
        issued["server_key"],
      );
    } finally {
      await withRelay.close();
    }
  });
});
