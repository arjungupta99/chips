/**
 * The fake follows the server by test (agents review, finding 37).
 *
 * The conformance fake is what an adapter author runs their harness against, so what it does
 * after an event has to be what Chips does. Its door's rules were copied from the server by hand
 * and matched; what follows an event had drifted: no cancel reached a lane, a socket went deaf
 * to a room when one of two agents left it, and a room could not be deleted at all.
 *
 * Each scenario here is written once and played against both: the real server, on a port of its
 * own, and the fake. The same harness client speaks to each over the wire, the person's side is
 * each one's own, and what the harness's socket was sent is compared line for line, with ids,
 * clocks and sequence numbers made comparable (`transcript.ts`). A scenario that passes says the
 * fake told the harness exactly what Chips would have.
 */

import { createIdGenerator } from "@chipschat/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { type Transcript, transcriptOf } from "./transcript.js";
import { HarnessWire } from "./wire.js";
import { fakeWorld, serverWorld, type World, type WorldOptions } from "./worlds.js";

type Json = Record<string, unknown>;

/** What a scenario is handed: a Chips, the harness on its wire, and a few hands. */
interface Stage {
  readonly world: World;
  readonly wire: HarnessWire;
  /** A run id, as a harness mints one. */
  readonly runId: () => string;
  /** Register one of the harness's agents by its key, and say its id. */
  readonly register: (key: string, name: string, extra?: Json) => Promise<string>;
  /** The person adds an agent to a room. */
  readonly add: (spaceId: string, agentId: string) => Promise<boolean>;
  /** The person says something in a room. */
  readonly say: (spaceId: string, text: string) => Promise<boolean>;
  /** An event from the harness as one of its agents. */
  readonly as: (agentId: string, event: Json) => Promise<{ ok: boolean; refusal?: string }>;
  /** The harness's default agent: who it is in the room it was given. */
  readonly defaultAgent: () => Promise<string>;
  /** Something the harness was answered, kept to be compared with the other world's. */
  readonly note: (label: string, value: unknown) => void;
}

const CAPABILITIES = ["agents", "new_spaces", "forks", "new_agents"];
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/**
 * A scenario played against one Chips, and what its harness's socket was sent.
 *
 * Each world keeps a room of its own, with an agent of the harness's that no scenario touches,
 * for telling when the socket has caught up: the person says a numbered line there and the
 * harness waits to hear it. A socket is sent events in order, so everything before it has
 * arrived. That room's events are left out of what is compared.
 */
async function played(
  make: (options: WorldOptions) => Promise<World>,
  scenario: (stage: Stage) => Promise<void>,
): Promise<Transcript> {
  const world = await make({ capabilities: CAPABILITIES });
  closers.push(() => world.close());
  const { address, person } = world;
  const ids = createIdGenerator();

  const before = await HarnessWire.call(
    address,
    "POST",
    `/v1/harnesses/${address.harnessId}/agents`,
    {
      key: "parity-sync",
      name: "Sync",
    },
  );
  const syncAgent = String(before.json["agent_id"]);
  const syncRoom = await person.room("Sync");
  const member = (spaceId: string, agentId: string) => ({
    type: "membership.added",
    space_id: spaceId,
    participant_id: agentId,
    participant_kind: "agent",
    role: "member",
  });
  if (!(await person.event(member(syncRoom, syncAgent)))) throw new Error("no sync room");

  const wire = await HarnessWire.connect(address);
  closers.push(async () => wire.close());
  let marks = 0;
  const caughtUp = async (): Promise<void> => {
    // The first mark may be said before the subscription is live, so it is said again.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      marks += 1;
      const text = `mark ${marks}`;
      await person.event({ type: "message.post", space_id: syncRoom, text });
      try {
        await wire.heard((event) => event["text"] === text, 400);
        return;
      } catch {
        // Not heard yet: say another.
      }
    }
    throw new Error(`${world.name}: the harness's socket never caught up`);
  };
  await caughtUp();

  const notes: { label: string; value: unknown }[] = [];
  const stage: Stage = {
    world,
    wire,
    note: (label, value) => notes.push({ label, value }),
    async defaultAgent() {
      const listed = await wire.http("GET", `/v1/harnesses/${address.harnessId}/agents`);
      const agents = listed.json["agents"] as { agent_id: string; key: string }[];
      const found = agents.find((agent) => agent.key === address.harnessId);
      if (found === undefined) throw new Error(`${world.name}: no default agent`);
      return found.agent_id;
    },
    runId: () => ids.next("run"),
    async register(key, name, extra = {}) {
      const made = await wire.http("POST", `/v1/harnesses/${address.harnessId}/agents`, {
        key,
        name,
        ...extra,
      });
      if (typeof made.json["agent_id"] !== "string") {
        throw new Error(`${world.name} would not register ${key}: ${JSON.stringify(made.json)}`);
      }
      return made.json["agent_id"];
    },
    add: (spaceId, agentId) => person.event(member(spaceId, agentId)),
    say: (spaceId, text) => person.event({ type: "message.post", space_id: spaceId, text }),
    as: (agentId, event) => wire.send({ ...event, actor: { kind: "agent", id: agentId } }),
  };
  await scenario(stage);
  await caughtUp();
  return transcriptOf(wire.events(), (event) => event["space_id"] === syncRoom, notes);
}

/** One scenario, against the server and against the fake, and the two transcripts the same. */
function sameOnBoth(name: string, scenario: (stage: Stage) => Promise<void>): void {
  it(name, async () => {
    const server = await played(serverWorld, scenario);
    const fake = await played(fakeWorld, scenario);
    expect(fake.lines).toEqual(server.lines);
    // And something was heard at all: a scenario that says nothing compares nothing.
    expect(server.lines.length).toBeGreaterThan(0);
  });
}

describe("what a harness is told, by the server and by the fake", () => {
  sameOnBoth("an agent is added to a room, starts work, and a person takes it out", async (s) => {
    const tree = await s.register("tree", "Tree");
    const room = await s.world.person.room("Trees");
    await s.say(room, "Before Tree joins.");
    await s.add(room, tree);
    await s.as(tree, { type: "run.started", space_id: room, run_id: s.runId(), goal: "Count." });
    await s.world.person.event({
      type: "membership.removed",
      space_id: room,
      participant_id: tree,
    });
  });

  sameOnBoth("a room is archived with a run going, and unarchived", async (s) => {
    const tree = await s.register("tree", "Tree");
    const room = await s.world.person.room("Trees");
    await s.add(room, tree);
    await s.as(tree, { type: "run.started", space_id: room, run_id: s.runId(), goal: "Count." });
    await s.world.person.event({ type: "space.updated", space_id: room, state: "closed" });
    await s.world.person.event({ type: "space.updated", space_id: room, state: "open" });
    await s.say(room, "@Tree back?");
  });

  sameOnBoth("an agent is moved from one room to another with a run going", async (s) => {
    const tree = await s.register("tree", "Tree");
    const from = await s.world.person.room("From");
    const to = await s.world.person.room("To");
    await s.add(from, tree);
    await s.as(tree, { type: "run.started", space_id: from, run_id: s.runId(), goal: "Count." });
    await s.world.person.move(tree, to);
    await s.say(to, "@Tree here now?");
  });

  sameOnBoth("an agent is archived in its harness, and restored", async (s) => {
    const tree = await s.register("tree", "Tree");
    const room = await s.world.person.room("Trees");
    await s.add(room, tree);
    await s.as(tree, { type: "run.started", space_id: room, run_id: s.runId(), goal: "Count." });
    await s.register("tree", "Tree", { state: "archived" });
    await s.register("tree", "Tree", { state: "active" });
  });

  sameOnBoth(
    "a room is asked of the harness, which claims it and is spoken to again",
    async (s) => {
      const { address } = s.world;
      const asked = await s.world.person.ask("Plan a trip to Big Sur.");
      await s.wire.heard((event) => event["type"] === "message.new" && event["space_id"] === asked);
      await s.wire.http("POST", `/v1/harnesses/${address.harnessId}/spaces`, {
        key: "trip",
        space_id: asked,
        title: "Big Sur",
      });
      await s.say(asked, "And the drive back?");
    },
  );

  sameOnBoth("a free agent's words are held, and said in the next room it joins", async (s) => {
    const tree = await s.register("tree", "Tree");
    const first = await s.world.person.room("First");
    await s.add(first, tree);
    await s.world.person.event({
      type: "membership.removed",
      space_id: first,
      participant_id: tree,
    });
    await s.as(tree, { type: "message.post", text: "Found a sale." });
    const next = await s.world.person.room("Next");
    await s.add(next, tree);
  });

  sameOnBoth("a person asks for a copy of an agent, and the copy joins", async (s) => {
    const tree = await s.register("tree", "Tree");
    const from = await s.world.person.room("From");
    const to = await s.world.person.room("To");
    await s.add(from, tree);
    await s.world.person.fork(tree, to);
    await s.wire.heard((event) => event["type"] === "agent.fork");
    await s.register("tree-copy", "Tree", { forked_from: tree, space_id: to });
  });

  sameOnBoth("a person asks for a new agent in a room, and it joins", async (s) => {
    const art = await s.world.person.room("ASCII Art");
    const askId = await s.world.person.askAgent(art, "Reviewer");
    await s.wire.heard((event) => event["type"] === "agent.asked");
    await s.register("reviewer", "Reviewer", { made_for: askId, space_id: art });
    await s.say(art, "@Reviewer check A–M.");
  });

  sameOnBoth("one of two agents leaves a room, and the other is still spoken to", async (s) => {
    const alpha = await s.register("alpha", "Alpha");
    const beta = await s.register("beta", "Beta");
    const room = await s.world.person.room("Both");
    await s.add(room, alpha);
    await s.add(room, beta);
    await s.world.person.event({
      type: "membership.removed",
      space_id: room,
      participant_id: alpha,
    });
    await s.say(room, "@Beta still there?");
  });

  sameOnBoth("a room is deleted with a run going", async (s) => {
    const tree = await s.register("tree", "Tree");
    const room = await s.world.person.room("Trees");
    await s.add(room, tree);
    await s.as(tree, { type: "run.started", space_id: room, run_id: s.runId(), goal: "Count." });
    await s.world.person.erase(room);
    await s.as(tree, { type: "message.post", space_id: room, text: "Late answer." });
  });

  sameOnBoth("a lead's room is archived while a lane it opened is going", async (s) => {
    const { address, person } = s.world;
    const lead = await s.defaultAgent();
    const tree = await s.register("tree", "Tree");
    const room = await person.room("Trees");
    await s.add(room, tree);
    const run = s.runId();
    await s.as(lead, { type: "run.started", space_id: address.direct, run_id: run, goal: "Lead." });
    const ids = createIdGenerator();
    await s.as(lead, {
      type: "task",
      space_id: address.direct,
      run_id: run,
      task_id: ids.next("lane"),
      to: tree,
      on_behalf_of: address.ownerId,
      goal: "Count the trees.",
    });
    await person.event({ type: "space.updated", space_id: address.direct, state: "closed" });
  });

  sameOnBoth("an agent with a lane's run going is moved to another room", async (s) => {
    const { address, person } = s.world;
    const lead = await s.defaultAgent();
    const tree = await s.register("tree", "Tree");
    const room = await person.room("Trees");
    const other = await person.room("Elsewhere");
    await s.add(room, tree);
    const run = s.runId();
    await s.as(lead, { type: "run.started", space_id: address.direct, run_id: run, goal: "Lead." });
    const ids = createIdGenerator();
    await s.as(lead, {
      type: "task",
      space_id: address.direct,
      run_id: run,
      task_id: ids.next("lane"),
      to: tree,
      on_behalf_of: address.ownerId,
      goal: "Count the trees.",
    });
    await person.move(tree, other);
  });

  sameOnBoth("a harness names its Main room, and the room is kept", async (s) => {
    const { address, person } = s.world;
    const was = await s.defaultAgent();
    const lead = await s.register("lead", "Lead", { lead: true });
    const attached = await s.wire.http("POST", `/v1/agents/${lead}/attach`, {
      space_id: address.direct,
      replacing: was,
    });
    s.note("attach", attached.status);
    const named = await s.as(lead, { type: "space.updated", space_id: address.direct, home: true });
    s.note("named home", named.ok);
    // A person does not archive it, does not take the Main agent out, and adds no other agent.
    const tree = await s.register("tree", "Tree");
    s.note(
      "archive",
      await person.event({ type: "space.updated", space_id: address.direct, state: "closed" }),
    );
    s.note("add", await s.add(address.direct, tree));
    s.note(
      "remove",
      await person.event({
        type: "membership.removed",
        space_id: address.direct,
        participant_id: lead,
      }),
    );
    const archived = await s.wire.http("POST", `/v1/harnesses/${address.harnessId}/agents`, {
      key: "lead",
      name: "Lead",
      lead: true,
      state: "archived",
    });
    s.note("archive the Main agent", archived.status);
    await s.say(address.direct, "Still here?");
  });

  sameOnBoth("a harness archives a room it opened by key, and its list says who did", async (s) => {
    const { address } = s.world;
    const opened = await s.wire.http("POST", `/v1/harnesses/${address.harnessId}/spaces`, {
      key: "project",
      title: "Project",
    });
    const room = String(opened.json["space_id"]);
    await s.wire.heard((event) => event["type"] === "agent.attached" && event["space_id"] === room);
    const listed = await s.wire.http("GET", `/v1/harnesses/${address.harnessId}/agents`);
    const agents = listed.json["agents"] as { agent_id: string; key: string }[];
    const own = agents.find((agent) => agent.key === "project")?.agent_id ?? "";
    const closed = await s.as(own, { type: "space.updated", space_id: room, state: "closed" });
    s.note("closed", closed.ok);
    const spaces = await s.wire.http("GET", `/v1/harnesses/${address.harnessId}/spaces`);
    s.note("spaces", spaces.json);
  });

  sameOnBoth("an archived room takes no agent, and says so", async (s) => {
    const tree = await s.register("tree", "Tree");
    const room = await s.world.person.room("Shut");
    await s.world.person.event({ type: "space.updated", space_id: room, state: "closed" });
    await s.add(room, tree);
    const open = await s.world.person.room("Open");
    await s.add(open, tree);
  });
});
