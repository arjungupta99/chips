/**
 * A chipsd for the samples to talk to: the real server, in this process, on a port of its own,
 * with the rows `chips serve`, pairing and Add harness would have made — a workspace, a person,
 * a harness with a token, and a space they are both in. Every sample that speaks to a server
 * starts here, so what a page shows is the wire and not the furniture.
 *
 * Not a sample itself: `pnpm docs:check` runs the files beside this directory, not in it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import {
  buildGateway,
  type Gateway,
  migrateToLatest,
  mintHarnessToken,
  openDatabase,
} from "@chipschat/server";

export interface SampleChipsd {
  /** Where the server is: `http://127.0.0.1:<port>`. */
  readonly url: string;
  readonly workspaceId: string;
  readonly personId: string;
  readonly harnessId: string;
  /** The harness's token, as Add harness shows it once. */
  readonly token: string;
  /** The space the person and the harness share. */
  readonly spaceId: string;
  readonly gateway: Gateway;
  /** Append an event as the person, the way a tap in the app does. */
  readonly asPerson: (event: Record<string, unknown>) => Promise<void>;
  /** A join link the person makes, as Agents → Connect a harness does (ADR 0122). */
  readonly makeJoinLink: (capabilities: readonly string[]) => Promise<string>;
  /** The person allows the request showing this code, with what they grant of what it asked. */
  readonly allowJoin: (code: string, capabilities: readonly string[]) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface SampleOptions {
  /** The harness's autonomy. L2 — ask when it matters — unless the sample says otherwise. */
  readonly autonomy?: 0 | 1 | 2 | 3;
  /** What the harness takes, as a person granted it (ADR 0046). Nothing unless said. */
  readonly capabilities?: readonly string[];
}

export async function startSampleChipsd(options: SampleOptions = {}): Promise<SampleChipsd> {
  const directory = mkdtempSync(join(tmpdir(), "chips-sample-"));
  const { db, close } = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(db, () => new Date().toISOString());

  const ids = createIdGenerator();
  const at = new Date().toISOString();
  const workspaceId = ids.next("workspace");
  const personId = ids.next("person");
  const harnessId = ids.next("harness");
  await db
    .insertInto("workspaces")
    .values({ id: workspaceId, name: "Sample", created_at: at })
    .execute();
  const granted = options.capabilities === undefined ? null : JSON.stringify(options.capabilities);
  for (const [id, kind, name, owner, capabilities] of [
    [personId, "person", "Arjun", null, null],
    [harnessId, "harness", "Scout", personId, granted],
  ] as const) {
    await db
      .insertInto("participants")
      .values({
        id,
        workspace_id: workspaceId,
        kind,
        display_name: name,
        owner_id: owner,
        parent_id: null,
        ephemeral: 0,
        capabilities,
        created_at: at,
      })
      .execute();
  }
  const minted = mintHarnessToken();
  await db
    .insertInto("harness_tokens")
    .values({
      id: ids.next("token"),
      workspace_id: workspaceId,
      harness_id: harnessId,
      token_hash: minted.hash,
      name: "sample",
      created_at: at,
      last_used_at: null,
      revoked_at: null,
    })
    .execute();

  const base = defaultConfig();
  const gateway = buildGateway({
    config: {
      ...base,
      server: { ...base.server, port: 0 },
      log: { ...base.log, level: "silent" },
    },
    db,
    ids,
    version: "sample",
  });

  // The space, its two members, and the dial: what a person's clicks in the app append.
  const spaceId = ids.next("space");
  const append = (event: Record<string, unknown>) =>
    gateway.deps.store.append({
      v: 1,
      id: ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: personId },
      ...event,
    } as unknown as Parameters<typeof gateway.deps.store.append>[0]);
  await append({
    type: "space.created",
    space_id: spaceId,
    idempotency_key: "room",
    kind: "group",
    title: "PO-4471",
  });
  await append({
    type: "membership.added",
    space_id: spaceId,
    idempotency_key: "m-person",
    participant_id: personId,
    participant_kind: "person",
    role: "owner",
  });
  await append({
    type: "membership.added",
    space_id: spaceId,
    idempotency_key: "m-harness",
    participant_id: harnessId,
    participant_kind: "harness",
    role: "member",
  });
  // The person owns the workspace, as its first person does, so they may let a harness in.
  await append({
    type: "person.joined",
    idempotency_key: "person",
    participant_id: personId,
    display_name: "Arjun",
    role: "owner",
  });
  await append({
    type: "policy.updated",
    idempotency_key: "policy",
    harness_id: harnessId,
    policy: { autonomy: options.autonomy ?? 2, rules: [] },
    workspace_max_autonomy: 3,
    changed_by: personId,
  });

  const { port } = await gateway.listen();
  const person = {
    kind: "person" as const,
    participantId: personId,
    workspaceId,
    displayName: "Arjun",
    role: "owner" as const,
    via: "device_key" as const,
  };
  return {
    url: `http://127.0.0.1:${port}`,
    workspaceId,
    personId,
    harnessId,
    token: minted.token,
    spaceId,
    gateway,
    asPerson: async (event) => {
      await gateway.deps.submitEvent({
        principal: {
          kind: "person",
          participantId: personId,
          workspaceId,
          displayName: "Arjun",
          via: "device_key",
        },
        event,
      });
    },
    makeJoinLink: async (capabilities) => {
      const made = await gateway.deps.joinRequests.makeLink({
        principal: person,
        capabilities,
        url: `http://127.0.0.1:${port}`,
      });
      if (!made.ok) throw new Error(made.error.message);
      return `http://127.0.0.1:${port}/j/${made.value.secret}`;
    },
    allowJoin: async (code, capabilities) => {
      const waiting = await gateway.deps.joinRequests.list(person, ["waiting"]);
      const asking = waiting.ok ? waiting.value.find((each) => each.code === code) : undefined;
      if (asking === undefined) throw new Error(`Nothing asks with ${code}.`);
      const allowed = await gateway.deps.joinRequests.allow({
        principal: person,
        id: asking.id,
        capabilities,
      });
      if (!allowed.ok) throw new Error(allowed.error.message);
    },
    close: async () => {
      await gateway.close();
      await close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
