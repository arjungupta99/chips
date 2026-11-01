/**
 * The socket as a harness meets it, and the log read back over HTTP: `hello` is answered with
 * the token's one harness whatever the client names, an event goes whole inside an `event` frame
 * with its key inside it, and a person's message caught up from `GET /v1/events` is rebuilt into
 * the `message.new` the socket gave for it.
 *
 * Used by: /reference/frames/, /connect/websocket/ and /connect/custom/
 */

import { strict as assert } from "node:assert";
import { newId } from "@chipschat/protocol";
import { startSampleChipsd } from "./lib/chipsd.js";

type Frame = Record<string, unknown>;
type Event = Record<string, unknown>;

const chipsd = await startSampleChipsd();
// A single-use ticket opens the socket; the token itself never goes in a URL.
const ticketed = await fetch(`${chipsd.url}/v1/socket-tickets`, {
  method: "POST",
  headers: { authorization: `Bearer ${chipsd.token}` },
});
const { ticket } = (await ticketed.json()) as { ticket: string };
const socket = new WebSocket(`${chipsd.url.replace(/^http/, "ws")}/v1/ws?ticket=${ticket}`);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

// Every frame the server sends, taken in the order the sample asks for them.
const heard: Frame[] = [];
let wake = (): void => {};
socket.addEventListener("message", (message) => {
  heard.push(JSON.parse(String(message.data)) as Frame);
  wake();
});
async function next(match: (frame: Frame) => boolean, what: string): Promise<Frame> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const found = heard.findIndex(match);
    if (found >= 0) return heard.splice(found, 1)[0] as Frame;
    if (Date.now() > deadline) throw new Error(`no ${what} within five seconds`);
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, 100);
    });
  }
}
const send = (frame: Frame): void => socket.send(JSON.stringify(frame));
const eventOf = (type: string) => (frame: Frame) =>
  frame["frame"] === "event" && (frame["event"] as Event)["type"] === type;

// ------------------------------------------------------------------ the handshake
// A list of harnesses in the client's hello is not read: the answer names the token's.
send({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "scout", version: "0.1.0" },
  harnesses: [{ harness_id: newId("harness") }],
});
const hello = (await next(eventOf("hello"), "hello"))["event"] as Event;
const harnesses = hello["harnesses"] as Event[];
assert.equal(harnesses.length, 1);
assert.equal(harnesses[0]?.["harness_id"], chipsd.harnessId, "the token's harness, not the list");
assert.equal(harnesses[0]?.["owner_id"], chipsd.personId);
console.log(`hello names ${String(harnesses[0]?.["display_name"])}, the token's one harness`);

send({ frame: "subscribe", workspace_id: chipsd.workspaceId });

// ------------------------------------------------------------------ writing
// The key beside `event` rather than in it is not read, so the event has none.
send({
  frame: "event",
  idempotency_key: "scout-msg-6",
  event: { type: "message.post", space_id: chipsd.spaceId, text: "On it." },
});
const refused = await next((frame) => frame["frame"] === "error", "error");
assert.equal(refused["code"], "invalid_frame");
console.log(`a key beside the event: ${String(refused["code"])}`);

send({
  frame: "event",
  event: {
    type: "message.post",
    space_id: chipsd.spaceId,
    text: "On it.",
    idempotency_key: "scout-msg-7",
  },
});
const ack = await next((frame) => frame["frame"] === "ack", "ack");
assert.equal(ack["idempotency_key"], "scout-msg-7");
assert.equal(typeof ack["seq"], "number");
console.log(`the key inside it: ack at seq ${String(ack["seq"])}`);

// ------------------------------------------------------------------ hearing, then catching up
await chipsd.asPerson({
  type: "message.post",
  space_id: chipsd.spaceId,
  idempotency_key: "arjun-msg-1",
  text: "Here's the signed PO. Get it confirmed with Northwind.",
});
const live = (await next(eventOf("message.new"), "message.new"))["event"] as Event;
const from = live["from"] as Event;

const page = (await (
  await fetch(`${chipsd.url}/v1/events?since=0`, {
    headers: { authorization: `Bearer ${chipsd.token}` },
  })
).json()) as { events: Event[]; next_cursor: number | null };
assert.equal(page.next_cursor, null, "one page reaches the end of the log");
const logged = page.events.find(
  (event) =>
    event["type"] === "message.post" && (event["actor"] as Event)["id"] === chipsd.personId,
);
assert.ok(logged, "the log holds the person's message.post");
assert.equal(
  page.events.some((event) => event["type"] === "message.new"),
  false,
  "and no message.new",
);

// The rebuild, as the guide's table has it.
const actor = logged["actor"] as Event;
const { participants } = (await (
  await fetch(`${chipsd.url}/v1/participants`, {
    headers: { authorization: `Bearer ${chipsd.token}` },
  })
).json()) as { participants: Event[] };
const rebuilt = {
  message_id: String(logged["id"]).replace(/^evt_/, "msg_"),
  from: {
    participant_id: actor["id"],
    kind: actor["kind"],
    display_name: participants.find((each) => each["id"] === actor["id"])?.["display_name"],
  },
  text: logged["text"],
};
assert.equal(rebuilt.message_id, live["message_id"]);
assert.deepEqual(rebuilt.from, {
  participant_id: from["participant_id"],
  kind: from["kind"],
  display_name: from["display_name"],
});
assert.equal(rebuilt.text, live["text"]);
console.log(`caught up: ${rebuilt.message_id} from ${String(rebuilt.from.display_name)}, as heard`);

socket.close();
await chipsd.close();
