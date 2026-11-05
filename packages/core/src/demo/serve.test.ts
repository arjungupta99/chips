/**
 * The demo's server, which is no server (ADR 0213): the reads it answers from the made-up
 * workspace, everything else turned away as not in the demo, the invite card through its link, and
 * a later film that starts where the first ends.
 */

import { parseSpaceIcon } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { fetchAttachmentWithType, inAlbum, kindOf } from "../attachments.js";
import { cacheKey } from "../cache.js";
import type { ClientEvent } from "../events.js";
import { type RelayView, relayFactsOf, relayLists } from "../relaySwitch.js";
import { SNIPPET_CLOSE, SNIPPET_OPEN } from "../store.js";
import { fakeClock, watch } from "../testing/demo.js";
import type { TransportOptions } from "../transport.js";
import { DEMO_DEVICE_ID, DEMO_PERSON_ID, demoDevice } from "./device.js";
import { INVITE_CARD, inviteCardBytes } from "./picture.js";
import { APPROVALS, type DemoFilm, filmOf, RUNS } from "./script.js";
import { NOT_IN_DEMO, serveDemo } from "./serve.js";
import { AGENTS, BIRTHDAY, CARD, GARDEN, roomFaces } from "./workspace.js";

const WHOLE = filmOf().chapters.length;

async function hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The width and height a PNG's header says. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** A socket of the demo's, held by hand: what it delivers and how it answers. */
function wire(since = 0) {
  const heard = {
    events: [] as ClientEvent[],
    acks: [] as { key: string; duplicate: boolean }[],
    errors: [] as string[],
    states: [] as string[],
  };
  const options: TransportOptions = {
    device: {} as TransportOptions["device"],
    since,
    onEvent: (event) => heard.events.push(event),
    onState: (state) => heard.states.push(state),
    onAck: (ack) => heard.acks.push({ key: ack.idempotencyKey, duplicate: ack.duplicate }),
    onError: (error) => heard.errors.push(`${error.code}: ${error.message}`),
  };
  return { options, heard };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the invite card", () => {
  it("is the PNG its entry describes, which a room draws as a picture", async () => {
    const bytes = inviteCardBytes();
    expect(bytes.byteLength).toBe(INVITE_CARD.byteSize);
    expect(await hex(bytes)).toBe(INVITE_CARD.sha256);
    expect(pngSize(bytes)).toEqual({ width: INVITE_CARD.width, height: INVITE_CARD.height });
    expect(kindOf(INVITE_CARD.mimeType)).toBe("image");
    expect(inAlbum({ id: CARD.attachment_id, ...INVITE_CARD })).toBe(true);
    bytes[0] = 0;
    expect(inviteCardBytes()[0]).toBe(0x89);
  });

  it("comes through the demo's link, signed for as any file is, in every variant", async () => {
    const { link } = serveDemo();
    const device = await demoDevice();
    const { useLink } = await import("../link.js");
    useLink(DEMO_DEVICE_ID, link);
    for (const variant of ["file", "thumb", "view"] as const) {
      const fetched = await fetchAttachmentWithType(device, CARD.attachment_id, variant);
      expect(fetched.mimeType).toBe("image/png");
      expect(await hex(fetched.bytes)).toBe(INVITE_CARD.sha256);
    }
    await expect(
      fetchAttachmentWithType(device, "att_01KDEM00000000000000000099", "file"),
    ).rejects.toThrow("This isn't in the demo.");
    expect(() => link.socket("/v1/ws")).toThrow("isn't in the demo");
    link.close();
  });
});

describe("the demo's reads", () => {
  it("answers the directory, the rooms' faces and what a store reads as it starts", async () => {
    const { storeOptions } = serveDemo();
    const device = await demoDevice();
    const { participants } = await storeOptions.get<{ participants: { kind: string }[] }>(
      device,
      "/v1/participants",
    );
    expect(participants.map((row) => row.kind).sort()).toEqual([
      ...Array(5).fill("agent"),
      ...Array(3).fill("harness"),
      "person",
      "person",
    ]);
    for (const face of Object.values(roomFaces())) expect(parseSpaceIcon(face).ok).toBe(true);
    for (const path of [
      "/v1/me/hidden-spaces",
      "/v1/me/pins",
      "/v1/me/notifications",
      "/v1/join?state=waiting",
      "/v1/direct-asks",
      "/v1/direct-asks/mine",
      `/v1/agents/${AGENTS.milo.id}/stays`,
    ]) {
      await expect(storeOptions.get(device, path), path).resolves.toBeDefined();
    }
    const history = await storeOptions.get<{ events: ClientEvent[] }>(
      device,
      `/v1/events?since=0&space_id=${GARDEN}&limit=500`,
    );
    expect(history.events.map((event) => event.type)).toContain("space.created");
  });

  it("lists one device, the one showing it, by the name it would pair with", async () => {
    // A clock of its own, so the two reads are of one moment.
    const { storeOptions } = serveDemo({ deviceName: "iPhone 17 Pro", clock: fakeClock() });
    const device = await demoDevice();
    type Listed = { devices: { device_id: string; name: string; current: boolean }[] };
    const mine = await storeOptions.get<Listed>(device, "/v1/devices");
    expect(mine.devices).toMatchObject([
      { device_id: DEMO_DEVICE_ID, name: "iPhone 17 Pro", current: true, revoked_at: null },
    ]);
    const yours = await storeOptions.get<Listed>(device, `/v1/people/${DEMO_PERSON_ID}/devices`);
    expect(yours).toEqual(mine);
    const rosas = await storeOptions.get<Listed>(device, "/v1/people/per_somebody_else/devices");
    expect(rosas.devices).toEqual([]);
    await expect(storeOptions.remove(device, `/v1/devices/${DEMO_DEVICE_ID}`)).rejects.toThrow();
  });

  it("has the relay switch as a server starts it, off, with the one device on its network", async () => {
    const { storeOptions } = serveDemo({ deviceName: "iPhone Duo" });
    const device = await demoDevice();
    const facts = relayFactsOf(await storeOptions.get<RelayView>(device, "/v1/relay"));
    expect(facts).toMatchObject({
      configured: true,
      on: false,
      status: "off",
      keptLink: undefined,
    });
    expect(relayLists(facts.devices)).toMatchObject({
      relayed: [],
      direct: [{ deviceId: DEMO_DEVICE_ID, participantId: DEMO_PERSON_ID, name: "iPhone Duo" }],
      away: [],
    });
    await expect(storeOptions.put(device, "/v1/relay", { on: true })).rejects.toThrow();
  });

  it("turns away every other read and every write, as not in the demo, at once", async () => {
    const { storeOptions } = serveDemo();
    const device = await demoDevice();
    const refused = { code: NOT_IN_DEMO, refusal: NOT_IN_DEMO, message: "This isn't in the demo." };
    await expect(storeOptions.get(device, "/v1/invites")).rejects.toMatchObject(refused);
    await expect(storeOptions.post(device, "/v1/invites", {})).rejects.toMatchObject(refused);
    await expect(storeOptions.put(device, "/v1/me/pins/x", {})).rejects.toMatchObject(refused);
    await expect(storeOptions.patch(device, "/v1/harnesses/x", {})).rejects.toMatchObject(refused);
    await expect(storeOptions.remove(device, "/v1/devices/x")).rejects.toMatchObject(refused);
    expect(await storeOptions.deviceStorage.entries()).toEqual([]);
    await storeOptions.deviceStorage.put("x", 1);
    await storeOptions.deviceStorage.remove("x");
    expect(await storeOptions.deviceStorage.entries()).toEqual([]);
  });

  it("searches the demo's own messages, newest first, the match marked", async () => {
    const { storeOptions } = serveDemo({ from: WHOLE });
    const device = await demoDevice();
    const read = (query: string) =>
      storeOptions.get<{ hits: { snippet: string; space_id: string }[] }>(
        device,
        `/v1/search?${query}`,
      );
    const { hits } = await read("q=osteria&limit=2");
    expect(hits).toHaveLength(2);
    expect(hits[0]?.snippet).toContain(`${SNIPPET_OPEN}Osteria${SNIPPET_CLOSE}`);
    expect((await read(`q=Osteria&space_id=${GARDEN}`)).hits).toEqual([]);
    expect((await read("q=+")).hits).toEqual([]);
    // As the server finds them (ADR 0263): the start of a word, never the inside of one.
    const mi = await read("q=mi&limit=20");
    expect(
      mi.hits.map((hit) => hit.snippet).filter((said) => said.includes("fa\u{E000}mi")),
    ).toEqual([]);
    expect((await read("q=card+sent")).hits[0]?.snippet).toContain(
      `${SNIPPET_OPEN}card${SNIPPET_CLOSE} ${SNIPPET_OPEN}sent${SNIPPET_CLOSE}`,
    );
  });

  it("lists a room's files, and what its job has spent since a person last acted", async () => {
    const { storeOptions } = serveDemo({ from: WHOLE });
    const device = await demoDevice();
    const { files } = await storeOptions.get<{ files: { name: string }[] }>(
      device,
      `/v1/spaces/${BIRTHDAY}/files`,
    );
    expect(files.map((file) => file.name)).toEqual([CARD.filename]);
    const named = `/v1/spaces/${BIRTHDAY}/files?name=nothing.txt`;
    expect((await storeOptions.get<{ files: unknown[] }>(device, named)).files).toEqual([]);
    // The job began at the second Approve; Milo's run reported its cost after it.
    const spend = await storeOptions.get(device, `/v1/spaces/${BIRTHDAY}/spend`);
    expect(spend).toMatchObject({ ceiling_usd: 3, spent_usd: 0.42, uncounted_runs: 0 });
    const garden = await storeOptions.get(device, `/v1/spaces/${GARDEN}/spend`);
    expect(garden).toMatchObject({ spent_usd: 0.11, uncounted_runs: 0 });
  });
});

describe("the demo's socket", () => {
  it("opens, says hello with every room, and sends what the workspace holds after `since`", async () => {
    const { storeOptions } = serveDemo();
    const all = wire();
    storeOptions.connect(all.options);
    await settle();
    expect(all.heard.states).toEqual(["open"]);
    const [hello, ...events] = all.heard.events;
    expect(hello).toMatchObject({ type: "hello", workspace: { name: "Chips demo" } });
    expect((hello as unknown as { spaces: string[] }).spaces).toHaveLength(4);
    const later = wire(events.length - 2);
    storeOptions.connect(later.options);
    await settle();
    expect(later.heard.events).toHaveLength(3);
  });

  it("logs what You sends once, acks a resend as a duplicate, and refuses what it does not do", async () => {
    const { storeOptions } = serveDemo({ from: 8 });
    const socket = wire();
    const transport = storeOptions.connect(socket.options);
    await settle();
    const message = {
      type: "message.post",
      space_id: BIRTHDAY,
      text: "Thanks!",
      idempotency_key: "k-1",
    };
    transport.send(message);
    transport.send(message);
    // The deposit was answered in chapter 8: a second answer is not taken.
    transport.send({
      type: "approval.resolved",
      space_id: BIRTHDAY,
      run_id: RUNS.dinner,
      approval_id: APPROVALS.deposit,
      decision: "denied",
      idempotency_key: "k-2",
    });
    transport.send({ type: "feedback", space_id: BIRTHDAY, idempotency_key: "k-3" });
    transport.send({ type: "message.post", space_id: "spc_x", text: "hi", idempotency_key: "k-4" });
    await settle();
    expect(socket.heard.acks).toEqual([
      { key: "k-1", duplicate: false },
      { key: "k-1", duplicate: true },
    ]);
    expect(socket.heard.errors).toEqual(Array(3).fill("not_in_demo: this isn't in the demo"));
    const logged = socket.heard.events.filter((event) => event["text"] === "Thanks!");
    expect(logged).toHaveLength(1);
    // As the server writes it: by You, and for Theo, where You's last message here went (chapter 7).
    expect(logged[0]).toMatchObject({
      actor: { kind: "person", id: DEMO_PERSON_ID },
      addressed_to: [AGENTS.theo.id],
      idempotency_key: "k-1",
    });
    transport.withdraw("k-9");
    transport.wake();
    transport.onlyDirect(true);
    expect(await transport.goDirect()).toBe(false);
    transport.close();
    transport.send({ ...message, idempotency_key: "k-5" });
    await settle();
    expect(socket.heard.acks).toHaveLength(2);
  });
});

describe("the demo's cache", () => {
  it("is in memory, starts with each room read, and keeps what the store gives it", async () => {
    const { storeOptions } = serveDemo();
    const cache = storeOptions.openCache(cacheKey({ workspaceId: "ws" }));
    expect(Object.keys(await cache.loadReadState())).toHaveLength(4);
    const event = { seq: 3, space_id: GARDEN } as unknown as ClientEvent;
    await cache.saveEvents([event, { seq: 4 } as unknown as ClientEvent]);
    await cache.forgetSpaces([GARDEN]);
    expect(await cache.loadEvents()).toEqual([{ seq: 4 }]);
    await cache.saveCursor(4);
    expect(await cache.loadCursor()).toBe(4);
    await cache.saveReadState({ [GARDEN]: 4 });
    expect(await cache.loadReadState()).toEqual({ [GARDEN]: 4 });
    await cache.saveOutbox([]);
    expect(await cache.loadOutbox()).toEqual([]);
    await cache.saveParticipants([1]);
    expect(await cache.loadParticipants()).toEqual([1]);
    await cache.saveSpaceIcons({ a: 1 });
    expect(await cache.loadSpaceIcons()).toEqual({ a: 1 });
    await cache.saveHiddenSpaces(["a"]);
    expect(await cache.loadHiddenSpaces()).toEqual(["a"]);
  });
});

describe("a film after the first", () => {
  const LATER: DemoFilm = {
    key: "later",
    title: "A later film",
    end: { line: "That's later", sentence: "Milo says one more thing." },
    after: "watch",
    chapters: [
      {
        key: "more",
        screen: "room",
        spaceId: BIRTHDAY,
        beats: [
          {
            wait: 500,
            play: [
              { type: "message.post", by: "milo", space: BIRTHDAY, payload: { text: "One more." } },
            ],
          },
        ],
        hold: 1000,
      },
    ],
  };

  it("opens on everything the first film played, then plays its own", async () => {
    const h = await watch({ film: LATER, clock: fakeClock() });
    const birthday = () => h.snapshot().model.spaces.find((space) => space.id === BIRTHDAY);
    const asks = birthday()?.runs.flatMap((run) => run.approvals) ?? [];
    expect(asks.map((ask) => ask.resolved?.decision)).toEqual(["approved", "approved"]);
    expect(h.player.getState()).toMatchObject({ film: "later", chapter: 0, ended: false });
    h.player.play();
    await h.clock.advance(1500);
    expect(birthday()?.lines.at(-1)?.text).toBe("One more.");
    expect(h.player.getState().ended).toBe(true);
    h.close();
  });

  it("is named by its key, and a key nobody has is said so", () => {
    expect(filmOf("watch").title).toBe("Watch Chips work");
    expect(() => filmOf("nope")).toThrow("no film called nope");
  });
});
