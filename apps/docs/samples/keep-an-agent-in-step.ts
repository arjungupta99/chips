/**
 * What the SDK does beyond events: a person's model change made by the harness and answered
 * (`settings`), a turn worded from what Chips hands over (`promptFor`), a file sent and fetched
 * back (`upload`, `download`), and what survives a restart (`store`). The server runs in this
 * process, so CI runs this on every push.
 *
 * Used by: /connect/sdk/
 */

import { strict as assert } from "node:assert";
import { connect, memoryStore, promptFor } from "@chipschat/harness";
import type { MessageNew } from "@chipschat/protocol";
import { startSampleChipsd } from "./lib/chipsd.js";

const chipsd = await startSampleChipsd({ capabilities: ["agents", "models"] });
const store = memoryStore();

// ---------------------------------------------------------------- settings
// The harness's own record of its agents' models: in a real harness, its config.
const models = new Map<string, string>([["Ada", "heron-2"]]);
const copyOf = (name: string) => ({
  model: models.get(name) ?? "heron-2",
  own: true,
  choices: [
    { id: "heron-2", label: "Heron 2", efforts: [] },
    { id: "wren-1", label: "Wren 1", efforts: [] },
  ],
  editable: true,
});

const chips = await connect({
  url: chipsd.url,
  token: chipsd.token,
  store,
  settings: {
    // A person picked another model on Ada's page: make it so, and say what it is now.
    models: async (change) => {
      models.set("Ada", change.model ?? "heron-2");
      return copyOf("Ada");
    },
  },
});
const ada = await chips.agents.register({ key: "ada", name: "Ada" });
await chips.settings.model(ada.agentId, copyOf("Ada")); // when it connects, and on any change

// The person's side: Ada's page → Model → Wren 1.
const ask = await chipsd.gateway.deps.agentModels.ask({
  principal: {
    kind: "person",
    participantId: chipsd.personId,
    workspaceId: chipsd.workspaceId,
    displayName: "Arjun",
    role: "owner",
    via: "device_key",
  },
  agentId: ada.agentId,
  ask: { model: "wren-1", effort: null },
});
assert.ok(ask.ok, "the change goes down the harness's socket");
for (let tries = 0; models.get("Ada") !== "wren-1" && tries < 100; tries++) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(models.get("Ada"), "wren-1", "the handler made the change");
console.log(`Ada now runs on ${models.get("Ada")}`);

// ---------------------------------------------------------------- a turn's words
const words = promptFor({
  type: "message.new",
  message_id: "msg_sample",
  from: { participant_id: chipsd.personId, kind: "person", display_name: "Arjun", role: "owner" },
  text: "@Ada summarise the notes",
  for: [ada.agentId],
  room: { members: [], notes: { [ada.agentId]: "In this space: Arjun, and you, Ada (@Ada)." } },
} as unknown as MessageNew);
assert.equal(
  words,
  "In this space: Arjun, and you, Ada (@Ada).\n\nArjun: @Ada summarise the notes",
);

// ---------------------------------------------------------------- files
const notes = new TextEncoder().encode("1. Ship on Friday.\n");
const stored = await chips.upload({ bytes: notes, filename: "notes.md" });
await chips.post({ spaceId: chipsd.spaceId, text: "The notes.", uploadIds: [stored.attachmentId] });
console.log(`uploaded ${stored.filename}, ${stored.byteSize} bytes, ${stored.mimeType}`);

// ---------------------------------------------------------------- what survives a restart
const run = await chips.runs.start({ spaceId: chipsd.spaceId, goal: "Summarise the notes" });
chips.close(); // a crash, as far as the run knows
assert.deepEqual(
  store.state()?.runs.map((each) => each.runId),
  [run.id],
  "the run left open is kept",
);
const again = await connect({ url: chipsd.url, token: chipsd.token, store });
for (let tries = 0; (store.state()?.runs.length ?? 0) > 0 && tries < 100; tries++) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(store.state()?.runs.length, 0, "and ended when the harness came back");
console.log(`run ${run.id} ended after the restart`);

again.close();
await chipsd.close();
