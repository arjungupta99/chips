/**
 * A workspace to test against: a database in a temporary directory, a person with a paired
 * device, a harness with a token, and a space they are both in.
 *
 * This is not test-only sugar for its own sake. Setting a workspace up is the thing `chips
 * pair` and `chips connect` will do in Phase 1, and writing it once here means the integration
 * tests and the golden scenario agree on what a workspace looks like from the first commit.
 */

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChipsConfig, defaultConfig, type Logger } from "@chipschat/platform";
import { createIdGenerator, type IdGenerator } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type { MacApp, Sounds, Videos } from "../application/index.js";
import { buildGateway, type Gateway } from "../gateway.js";
import { mintHarnessToken, signingPayload } from "../infrastructure/auth/credentials.js";
import { openDatabase } from "../infrastructure/db/connection.js";
import { migrateToLatest } from "../infrastructure/db/migrator.js";
import type { Database } from "../infrastructure/db/schema.js";

export interface TestPerson {
  readonly participantId: string;
  readonly deviceId: string;
  /**
   * Sign a request the way a paired device does (ADR 0006). `target` is the path and query;
   * the body may be bytes, as an upload's is. With `handshakeHash`, the five-line shape a device
   * signs inside a tunnel, and the header that says so (ADR 0191, decision 6).
   */
  readonly sign: (
    method: string,
    target: string,
    body: string | Uint8Array,
    handshakeHash?: string,
  ) => Record<string, string>;
  /** Open a socket the way a browser does: get a single-use ticket, then connect with it. */
  readonly socketTicket: () => Promise<string>;
}

export interface TestHarness {
  readonly participantId: string;
  readonly token: string;
  readonly headers: Record<string, string>;
}

export interface TestWorkspace {
  readonly config: ChipsConfig;
  readonly db: Kysely<Database>;
  readonly gateway: Gateway;
  readonly ids: IdGenerator;
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly arjun: TestPerson;
  readonly dana: TestPerson;
  readonly scout: TestHarness;
  /** Another person, with a paired device and a role in the workspace (ADR 0034). */
  readonly addPerson: (
    name: string,
    role: "owner" | "admin" | "member" | "guest",
  ) => Promise<TestPerson>;
  /**
   * A room that is this person's own, opened past the door. A member opens no space (ADR 0196),
   * so a test of what a room's owner may do, when that owner is a member, starts from one an
   * admin made for them. Returns the room's id.
   */
  readonly roomOf: (participantId: string, title: string) => Promise<string>;
  /**
   * An agent put in a member's room for them, as an owner or admin would: a member puts only an
   * agent of their own harness in a room (ADR 0034's addendum), and an admin is not in theirs.
   */
  readonly agentInto: (spaceId: string, agentId: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface TestWorkspaceOptions {
  /** Overrides merged onto the default configuration. */
  readonly config?: Partial<ChipsConfig>;
  /**
   * What measures and copies video (ADR 0053). None unless a test gives one, so a test that is
   * not about video behaves the same whether or not ffmpeg is installed where it runs.
   */
  readonly videos?: Videos;
  /** What hears sound (ADR 0054). None unless a test gives one, for the same reason. */
  readonly sounds?: Sounds;
  /** Where the server's log lines go, for a test that reads them; silent otherwise. */
  readonly logger?: Logger;
  /** What the machine is called (ADR 0170): never asked of the system the tests run on. */
  readonly machine?: string;
  /** Chips for Mac on the server's machine (ADR 0227): none unless a test gives one. */
  readonly macApp?: MacApp;
}

export async function createTestWorkspace(
  options: TestWorkspaceOptions = {},
): Promise<TestWorkspace> {
  const directory = mkdtempSync(join(tmpdir(), "chips-gateway-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(connection.db, () => "2026-09-02T00:00:00.000Z");

  const base = defaultConfig();
  const config: ChipsConfig = {
    ...base,
    ...options.config,
    server: { ...base.server, port: 0, ...options.config?.server },
    data: {
      dir: directory,
      databaseUrl: `sqlite:${join(directory, "chips.db")}`,
      ...options.config?.data,
    },
    realtime: { ...base.realtime, ...options.config?.realtime },
    limits: { ...base.limits, ...options.config?.limits },
    log: { ...base.log, level: "silent", ...options.config?.log },
  };

  const ids = createIdGenerator();
  const at = "2026-09-02T14:00:00.000Z";
  const workspaceId = ids.next("workspace");

  await connection.db
    .insertInto("workspaces")
    .values({ id: workspaceId, name: "Solo", created_at: at })
    .execute();

  const gateway = buildGateway({
    config,
    db: connection.db,
    ids,
    version: "0.0.0-test",
    videos: options.videos ?? null,
    sounds: options.sounds ?? null,
    machine: options.machine ?? "The test machine",
    relayTellMs: 0,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.macApp === undefined ? {} : { macApp: options.macApp }),
  });

  async function addPerson(
    name: string,
    role: "owner" | "admin" | "member" | "guest",
  ): Promise<TestPerson> {
    const participantId = ids.next("person");
    await connection.db
      .insertInto("participants")
      .values({
        id: participantId,
        workspace_id: workspaceId,
        kind: "person",
        display_name: name,
        owner_id: null,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: at,
      })
      .execute();
    // Their standing in the workspace is a projection of `person.joined` (ADR 0034).
    await gateway.deps.store.append({
      v: 1,
      type: "person.joined",
      id: ids.next("event"),
      ts: at,
      workspace_id: workspaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `setup-joined-${participantId}`,
      participant_id: participantId,
      display_name: name,
      role,
    } as Parameters<typeof gateway.deps.store.append>[0]);

    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const deviceId = ids.next("device");
    await connection.db
      .insertInto("devices")
      .values({
        id: deviceId,
        workspace_id: workspaceId,
        participant_id: participantId,
        public_key: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        name: `${name}'s laptop`,
        paired_at: at,
        last_seen_at: null,
        revoked_at: null,
      })
      .execute();

    const signHeaders = (
      method: string,
      target: string,
      body: string | Uint8Array,
      handshakeHash?: string,
    ) => {
      const timestamp = Date.now();
      const payload =
        typeof body === "string"
          ? signingPayload({ method, target, timestamp, body, handshakeHash })
          : signingPayload({
              method,
              target,
              timestamp,
              body: "",
              bodyDigest: createHash("sha256").update(body).digest("hex"),
              handshakeHash,
            });
      const signature = sign(null, Buffer.from(payload, "utf8"), privateKey);
      return {
        "x-chips-device": deviceId,
        "x-chips-timestamp": String(timestamp),
        "x-chips-signature": signature.toString("base64"),
        ...(handshakeHash === undefined ? {} : { "x-chips-signed": "v2" }),
      };
    };

    return {
      participantId,
      deviceId,
      sign: signHeaders,
      async socketTicket() {
        const response = await gateway.app.fetch(
          new Request("http://chips.local/v1/socket-tickets", {
            method: "POST",
            headers: { ...signHeaders("POST", "/v1/socket-tickets", "") },
          }),
        );
        const body = (await response.json()) as { ticket: string };
        return body.ticket;
      },
    };
  }

  const arjun = await addPerson("Arjun", "owner");
  const dana = await addPerson("Dana", "member");

  const scoutId = ids.next("harness");
  await connection.db
    .insertInto("participants")
    .values({
      id: scoutId,
      workspace_id: workspaceId,
      kind: "harness",
      display_name: "Scout",
      owner_id: arjun.participantId,
      parent_id: null,
      ephemeral: 0,
      capabilities: JSON.stringify(["drive.read", "email.send"]),
      created_at: at,
    })
    .execute();

  const minted = mintHarnessToken();
  await connection.db
    .insertInto("harness_tokens")
    .values({
      id: ids.next("token"),
      workspace_id: workspaceId,
      harness_id: scoutId,
      token_hash: minted.hash,
      name: "laptop",
      created_at: at,
      last_used_at: null,
      revoked_at: null,
    })
    .execute();

  const scout: TestHarness = {
    participantId: scoutId,
    token: minted.token,
    headers: { authorization: `Bearer ${minted.token}` },
  };

  // The space is a read model, so it is opened by an event (ADR 0018).
  const spaceId = ids.next("space");
  await gateway.deps.store.append({
    v: 1,
    type: "space.created",
    id: ids.next("event"),
    ts: at,
    workspace_id: workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: arjun.participantId },
    idempotency_key: "setup-space",
    kind: "group",
    title: "PO-4471",
  } as Parameters<typeof gateway.deps.store.append>[0]);

  for (const [participant, kind, role] of [
    [arjun.participantId, "person", "owner"],
    [dana.participantId, "person", "member"],
    [scoutId, "harness", "member"],
  ] as const) {
    await gateway.deps.store.append({
      v: 1,
      type: "membership.added",
      id: ids.next("event"),
      ts: at,
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: arjun.participantId },
      idempotency_key: `setup-member-${participant}`,
      participant_id: participant,
      participant_kind: kind,
      role,
    } as Parameters<typeof gateway.deps.store.append>[0]);
  }

  // What Scout may do is a projection of `policy.updated` (ADR 0019): L2, no rules, $25.
  await gateway.deps.store.append({
    v: 1,
    type: "policy.updated",
    id: ids.next("event"),
    ts: at,
    workspace_id: workspaceId,
    actor: { kind: "person", id: arjun.participantId },
    idempotency_key: "setup-policy",
    harness_id: scoutId,
    policy: { autonomy: 2, rules: [] },
    workspace_max_autonomy: 2,
    budget_usd: 25,
    changed_by: arjun.participantId,
  } as Parameters<typeof gateway.deps.store.append>[0]);

  return {
    config,
    db: connection.db,
    gateway,
    ids,
    workspaceId,
    spaceId,
    arjun,
    dana,
    scout,
    addPerson,
    roomOf: async (participantId, title) => {
      const id = ids.next("space");
      await gateway.deps.store.append({
        v: 1,
        type: "space.created",
        id: ids.next("event"),
        ts: new Date().toISOString(),
        workspace_id: workspaceId,
        space_id: id,
        actor: { kind: "person", id: participantId },
        idempotency_key: `room-of-${id}`,
        kind: "group",
        title,
      } as Parameters<typeof gateway.deps.store.append>[0]);
      return id;
    },
    agentInto: async (spaceId, agentId) => {
      await gateway.deps.store.append({
        v: 1,
        type: "membership.added",
        id: ids.next("event"),
        ts: new Date().toISOString(),
        workspace_id: workspaceId,
        space_id: spaceId,
        actor: { kind: "person", id: arjun.participantId },
        idempotency_key: `agent-into-${spaceId}-${agentId}`,
        participant_id: agentId,
        participant_kind: "agent",
        role: "member",
      } as Parameters<typeof gateway.deps.store.append>[0]);
    },
    close: async () => {
      await gateway.close();
      await connection.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
