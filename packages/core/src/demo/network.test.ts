/**
 * The demo never reaches the network (ADR 0213's consequences): the whole film, a message sent
 * once it is over, the invite card fetched as a room fetches it, and each short film with an
 * agent's page read after it, with `fetch`, `WebSocket` and the real transport's every way out
 * made to throw.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAttachmentWithType } from "../attachments.js";
import { watch } from "../testing/demo.js";
import { demoDevice } from "./device.js";
import { FILMS, filmLength, filmOf } from "./script.js";
import { AGENTS, BIRTHDAY, CARD, GARDEN } from "./workspace.js";

const reached = vi.hoisted(() => [] as string[]);

vi.mock("../transport.js", async (original) => {
  const real = await original<typeof import("../transport.js")>();
  const out =
    (way: string) =>
    (..._: unknown[]): never => {
      reached.push(way);
      throw new Error(`the demo reached the network through ${way}`);
    };
  return {
    ...real,
    connect: out("connect"),
    getJson: out("getJson"),
    postJson: out("postJson"),
    putJson: out("putJson"),
    patchJson: out("patchJson"),
    deleteJson: out("deleteJson"),
  };
});

describe("the demo", () => {
  const fetch = vi.fn(() => {
    throw new Error("the demo reached fetch");
  });
  const socket = vi.fn(() => {
    throw new Error("the demo opened a WebSocket");
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("WebSocket", socket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays the whole film, answers after it, and draws its picture, with nothing leaving", async () => {
    const h = await watch();
    h.player.play();
    await h.clock.advance(filmLength(filmOf()));
    expect(h.player.getState().ended).toBe(true);
    h.store.send({ spaceId: GARDEN, text: "And the contact page?" });
    await h.clock.advance(2000);
    const card = await fetchAttachmentWithType(await demoDevice(), CARD.attachment_id, "thumb");
    expect(card.mimeType).toBe("image/png");
    h.close();
    expect(fetch).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(reached).toEqual([]);
  });

  it("plays each short film whole, and reads an agent's page after it, with nothing leaving", async () => {
    for (const film of FILMS.filter((each) => each.after !== undefined)) {
      const h = await watch({ film: film.key });
      h.player.play();
      await h.clock.advance(filmLength(film));
      expect(h.player.getState(), film.key).toMatchObject({ ended: true });
      const milo = AGENTS.milo.id;
      await h.store.readAgentModel(milo);
      await h.store.agentContext(milo);
      await h.store.readAgentContextWindow(milo);
      await h.store.agentStays(milo);
      await h.store.roomSpend(BIRTHDAY);
      h.close();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(reached).toEqual([]);
  });
});
