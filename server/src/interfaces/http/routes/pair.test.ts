/**
 * Pairing is the one door with no credential behind it, so it is the one door a guesser can
 * knock on: after five wrong codes in a minute from one address, the sixth is told to wait. An
 * IPv6 address is its /64, codes sent at once are counted as they arrive, and a guess from many
 * addresses at once leaves each of them one try a minute (ADR 0056).
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";
import { WRONG_CODES_BEFORE_STRAIN } from "./pair.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

function publicKey(): string {
  return generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "der" })
    .toString("base64");
}

/**
 * A pairing attempt. With `via`, it arrives the way `@hono/node-server` hands over a socket: from
 * that peer, saying `forwardedFor` in `X-Forwarded-For` when given.
 */
async function pair(
  code: string,
  via?: { readonly peer: string; readonly forwardedFor?: string },
): Promise<Response> {
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(via?.forwardedFor === undefined ? {} : { "x-forwarded-for": via.forwardedFor }),
      },
      body: JSON.stringify({ code, public_key: publicKey(), name: "Probe" }),
    }),
    via === undefined ? undefined : { incoming: { socket: { remoteAddress: via.peer } } },
  );
}

describe("POST /v1/pair", () => {
  it("answers a wrong code with unauthorized, and the sixth in a minute with rate_limited", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await pair(`AAA-00${i}`)).status).toBe(401);
    }
    const sixth = await pair("AAA-005");
    expect(sixth.status).toBe(429);
    const body = (await sixth.json()) as {
      error: { code: string; retry_after_seconds?: number };
    };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retry_after_seconds).toBeGreaterThan(0);
  });

  it("behind Tailscale Serve, slows the device that guessed and not every other with it", async () => {
    const serve = (device: string) => ({ peer: "127.0.0.1", forwardedFor: device });
    for (let i = 0; i < 5; i += 1) {
      expect((await pair(`AAA-00${i}`, serve("100.64.0.7"))).status).toBe(401);
    }
    expect((await pair("AAA-005", serve("100.64.0.7"))).status).toBe(429);
    // Another device through the same proxy is its own address.
    expect((await pair("AAA-006", serve("100.64.0.8"))).status).toBe(401);
  });

  it("does not let a caller on the network pick a fresh address by saying one", async () => {
    for (let i = 0; i < 5; i += 1) {
      const said = { peer: "100.64.0.9", forwardedFor: `198.51.100.${i}` };
      expect((await pair(`AAA-00${i}`, said)).status).toBe(401);
    }
    const sixth = await pair("AAA-005", { peer: "100.64.0.9", forwardedFor: "198.51.100.77" });
    expect(sixth.status).toBe(429);
  });

  it("counts a whole /64 as one address, so a host cannot step to the next address in its block", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await pair(`AAA-00${i}`, { peer: `2001:db8:5:6::${i + 1}` })).status).toBe(401);
    }
    expect((await pair("AAA-005", { peer: "2001:db8:5:6:ffff::1" })).status).toBe(429);
    // Nor by having Caddy on this machine say the next one.
    const caddy = { peer: "::1", forwardedFor: "2001:db8:5:6:aaaa::9" };
    expect((await pair("AAA-006", caddy)).status).toBe(429);
    // The next /64 is somebody else.
    expect((await pair("AAA-007", { peer: "2001:db8:5:7::1" })).status).toBe(401);
  });

  it("counts codes sent all at once as they arrive, so twenty at once are five guesses", async () => {
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        pair(`BBB-${String(i).padStart(3, "0")}`, {
          peer: "203.0.113.9",
        }),
      ),
    );
    const statuses = answers.map((answer) => answer.status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(15);
  });

  it("under a guess from many addresses, leaves each one try a minute and still pairs a right code", async () => {
    for (let i = 0; i < WRONG_CODES_BEFORE_STRAIN; i += 1) {
      expect(
        (await pair(`CCC-${String(i).padStart(3, "0")}`, { peer: `198.51.100.${i}` })).status,
      ).toBe(401);
    }
    // The owner, typing the code they were just given, from an address that has not guessed.
    const { code } = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    }) ?? { code: "" };
    expect((await pair(code, { peer: "192.0.2.10" })).status).toBe(201);

    // Anyone else has one wrong code, and is then told why they wait.
    expect((await pair("DDD-001", { peer: "192.0.2.11" })).status).toBe(401);
    const second = await pair("DDD-002", { peer: "192.0.2.11" });
    expect(second.status).toBe(429);
    expect(((await second.json()) as { error: { message: string } }).error.message).toMatch(
      /many places/,
    );
  });

  it("still pairs a right code while the address is under the limit", async () => {
    for (let i = 0; i < 4; i += 1) await pair(`AAA-00${i}`);
    const { code } = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    }) ?? { code: "" };
    expect((await pair(code)).status).toBe(201);
  });

  // A device gets an id for this place and, without this, nothing to call it: the workspace
  // switcher (M5.3) had every code-paired browser reading "This server".
  it("says what the workspace is called, the way an invite does", async () => {
    const { code } = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    }) ?? { code: "" };
    const paired = await pair(code);
    expect(paired.status).toBe(201);
    expect((await paired.json()) as { workspace_name?: string }).toMatchObject({
      workspace_name: "Solo",
    });
  });

  // A device pairing by a typed code holds no key yet (ADR 0191, decision 5): this answer is the
  // one plain exchange it makes, and the key it carries is what the device pins.
  it("hands the device the server's tunnel key with its credential, the one it names to a person", async () => {
    const { code } = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    }) ?? { code: "" };
    const paired = (await (await pair(code)).json()) as { server_key?: string };
    expect(paired.server_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const facts = (await (
      await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/server`, { headers: ws.arjun.sign("GET", "/v1/server", "") }),
      )
    ).json()) as { relay: { key: string } };
    expect(paired.server_key).toBe(facts.relay.key);
  });
});
