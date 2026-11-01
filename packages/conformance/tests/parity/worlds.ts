/**
 * One Chips, as a parity scenario drives it (agents review, finding 37): the real server, or the
 * conformance fake. A scenario is written once against this and run against both, and what the
 * harness's socket was sent is compared, so the fake follows the server by test and not by hand.
 *
 * The harness's side is the wire itself, the same client for both: HTTP with its token, and a
 * socket. The person's side is each Chips's own: the server's use cases as a paired device would
 * reach them, and the kit's helpers for the fake.
 */

import {
  createTestWorkspace,
  type TestWorkspace,
} from "../../../../server/src/testing/workspace.js";
import { type FakeChips, startFakeChips } from "../../src/fake-chips.js";

/** A caller as the server's use cases take one: here, the person who owns the workspace. */
type ServerPrincipal = Parameters<TestWorkspace["gateway"]["deps"]["addHarness"]>[0]["principal"];

/** Where the harness connects, and who it is there. */
export interface Address {
  readonly url: string;
  readonly workspaceId: string;
  readonly harnessId: string;
  readonly token: string;
  readonly ownerId: string;
  /** The room the harness was given when it was added: the owner, and its default agent. */
  readonly direct: string;
}

/** What the person does, the same in both worlds. `false`, or a thrown error, is a refusal. */
export interface Person {
  /** Any event through the door, as the owner. */
  readonly event: (event: Record<string, unknown>) => Promise<boolean>;
  /** A group room of the owner's, with nobody else in it. */
  readonly room: (title: string) => Promise<string>;
  /** A room asked of the harness from the +, with the owner's first words. */
  readonly ask: (text: string) => Promise<string>;
  readonly move: (agentId: string, spaceId: string) => Promise<boolean>;
  readonly fork: (agentId: string, spaceId: string) => Promise<boolean>;
  /** Ask the harness for a new agent in a room (ADR 0108), and say the ask's id. */
  readonly askAgent: (spaceId: string, name?: string) => Promise<string>;
  readonly erase: (spaceId: string, deleteAgent?: boolean) => Promise<boolean>;
}

export interface World {
  readonly name: "server" | "fake";
  readonly address: Address;
  readonly person: Person;
  readonly close: () => Promise<void>;
}

export interface WorldOptions {
  /** What the harness declares (ADR 0046): `agents`, `new_spaces`, `forks`. */
  readonly capabilities: readonly string[];
}

/** The real server, on a port of its own, with one harness added as a person adds one. */
export async function serverWorld(options: WorldOptions): Promise<World> {
  const ws: TestWorkspace = await createTestWorkspace();
  const { deps } = ws.gateway;
  const owner: ServerPrincipal = {
    kind: "person",
    participantId: ws.arjun.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Arjun",
    via: "device_key",
    deviceId: ws.arjun.deviceId,
    role: "owner",
  };
  const added = await deps.addHarness({ principal: owner, displayName: "Scout" });
  if (!added.ok || added.value.spaceId === undefined) throw new Error("could not add the harness");
  const declared = await deps.declareCapabilities({
    principal: owner,
    harnessId: added.value.harnessId,
    capabilities: options.capabilities,
  });
  if (!declared.ok) throw new Error(declared.error.message);
  const listening = await ws.gateway.listen();

  const event = async (sent: Record<string, unknown>): Promise<boolean> => {
    const result = await deps.submitEvent({
      event: { idempotency_key: `person-${ws.ids.next("event")}`, ...sent },
      principal: owner,
    });
    return result.ok;
  };
  const must = async (sent: Record<string, unknown>): Promise<void> => {
    if (!(await event(sent))) throw new Error(`the server refused the person's ${sent["type"]}`);
  };

  return {
    name: "server",
    address: {
      url: `http://127.0.0.1:${listening.port}`,
      workspaceId: ws.workspaceId,
      harnessId: added.value.harnessId,
      token: added.value.token,
      ownerId: ws.arjun.participantId,
      direct: added.value.spaceId,
    },
    person: {
      event,
      async room(title) {
        const spaceId = ws.ids.next("space");
        await must({ type: "space.created", space_id: spaceId, kind: "group", title });
        return spaceId;
      },
      async ask(text) {
        const spaceId = ws.ids.next("space");
        const harnessId = added.value.harnessId;
        await must({
          type: "space.created",
          space_id: spaceId,
          kind: "direct",
          asked_of: harnessId,
        });
        // With a first name for its agent there, as a person's device proposes one (ADR 0150).
        await must({
          type: "membership.added",
          space_id: spaceId,
          participant_id: harnessId,
          participant_kind: "harness",
          role: "member",
          agent_name: "Milo",
        });
        await must({ type: "message.post", space_id: spaceId, text });
        return spaceId;
      },
      async move(agentId, spaceId) {
        return (await deps.moveAgent({ principal: owner, agentId, spaceId })).ok;
      },
      async fork(agentId, spaceId) {
        return (await deps.forkAgent({ principal: owner, agentId, spaceId })).ok;
      },
      async askAgent(spaceId, name) {
        const harnessId = added.value.harnessId;
        const asked = await deps.askAgent({ principal: owner, harnessId, spaceId, name });
        if (!asked.ok) throw new Error(asked.error.message);
        return asked.askId;
      },
      async erase(spaceId, deleteAgent) {
        return (await deps.eraseSpace({ principal: owner, spaceId, deleteAgent })).ok;
      },
    },
    close: () => ws.close(),
  };
}

/** The conformance fake, as `chips conformance` starts it. */
export async function fakeWorld(options: WorldOptions): Promise<World> {
  const chips: FakeChips = await startFakeChips({
    harnessName: "Scout",
    ownerName: "Arjun",
    capabilities: options.capabilities,
  });
  const event = async (sent: Record<string, unknown>): Promise<boolean> => {
    try {
      await chips.asOwner(sent);
      return true;
    } catch {
      return false;
    }
  };
  return {
    name: "fake",
    address: {
      url: chips.address.url,
      workspaceId: chips.address.workspaceId,
      harnessId: chips.address.harnessId,
      token: chips.address.token,
      ownerId: chips.address.ownerId,
      direct: chips.address.spaceId,
    },
    person: {
      event,
      room: (title) => chips.openRoom(title),
      async ask(text) {
        return (await chips.askForSpace(text)).spaceId;
      },
      async move(agentId, spaceId) {
        return chips.workspace.moveAgent(agentId, spaceId).ok;
      },
      async fork(agentId, spaceId) {
        try {
          await chips.askForFork(agentId, spaceId);
          return true;
        } catch {
          return false;
        }
      },
      async askAgent(spaceId, name) {
        return (await chips.askForAgent(spaceId, name)).askId;
      },
      async erase(spaceId, deleteAgent) {
        return chips.workspace.eraseSpace(spaceId, { deleteAgent: deleteAgent === true }).ok;
      },
    },
    close: () => chips.close(),
  };
}
