/**
 * The player's clock (ADR 0213): it plays the agents' side, and what You does is the person's to
 * do, on the app's own controls (ADR 0217's addendum); an act nobody did by its beat is marked
 * missed. With a clock that runs in no time, and the test's person acting a moment before.
 */

import { describe, expect, it } from "vitest";
import type { ClientEvent } from "../events.js";
import { type Watching, watch } from "../testing/demo.js";
import { DEMO_PERSON_ID } from "./device.js";
import { APPROVALS, filmOf, RUNS } from "./script.js";
import { AGENTS, BIRTHDAY, GARDEN } from "./workspace.js";

const ASK = "Find somewhere for Mum's 60th on Saturday. 12 of us, and she loves Italian.";
/** Where chapter 2's ask is sent. */
const SENT = 3300;
const ASK_CHAPTER = 1;
/** Chapter 7: You slides up the faces to Theo, and sends him words that only he answers. */
const PICK_CHAPTER = 6;
const TO_THEO = "Can you keep this design for the thank-you notes?";
const APPROVE_CHAPTER = 7;
/** In chapter 8: the ask on the room, a Deny from its card, and Milo's reply to the answer. */
const DENIED = 3300;
const REPLIED = 5400;
const LOCK_CHAPTER = 8;

/** What You sent of a kind, as the demo's socket gave it back to the store. */
function sentByYou(h: Watching, type: string): readonly ClientEvent[] {
  return h.delivered.filter(
    (event) =>
      event.type === type &&
      event.actor.id === DEMO_PERSON_ID &&
      (type !== "message.post" || event["text"] === ASK),
  );
}

describe("what You does", () => {
  it("is never done by the player: one nobody did by its beat is marked missed", async () => {
    const h = await watch({ from: ASK_CHAPTER, skip: () => true });
    h.player.play();
    await h.clock.advance(SENT - 1);
    expect(h.player.getState().missed).toBeUndefined();
    await h.clock.advance(1);
    expect(h.player.getState().missed).toBe("send");
    await h.clock.advance(5000);
    expect(sentByYou(h, "message.post")).toHaveLength(0);
    h.close();
  });

  it("is not missed when the app's own Send did it first, as the render taps it", async () => {
    const h = await watch({ from: ASK_CHAPTER });
    h.player.play();
    await h.clock.advance(SENT + 5000);
    expect(sentByYou(h, "message.post")).toHaveLength(1);
    expect(h.player.getState().missed).toBeUndefined();
    expect(h.player.getState().chapter).toBe(ASK_CHAPTER + 1);
    h.close();
  });

  it("takes a Deny from the card as the answer, which the film goes on from", async () => {
    const h = await watch({ from: APPROVE_CHAPTER, skip: (act) => act.kind === "approve" });
    h.player.play();
    await h.clock.advance(DENIED);
    h.store.resolveApproval({
      spaceId: BIRTHDAY,
      runId: RUNS.dinner,
      approvalId: APPROVALS.deposit,
      decision: "denied",
    });
    await h.clock.advance(REPLIED - DENIED);
    const said = h.snapshot().model.spaces.find((space) => space.id === BIRTHDAY)?.lines ?? [];
    expect(said.at(-1)?.text).toBe(
      "Okay, I won't book it. Want Theo's card sent to the family anyway?",
    );
    expect(h.delivered.filter((event) => event.type === "approval.executed")).toHaveLength(0);
    expect(sentByYou(h, "approval.resolved")).toHaveLength(1);
    expect(h.player.getState().missed).toBeUndefined();
    h.close();
  });
});

describe("the pick (ADR 0229)", () => {
  /** The pick chapter with You's words sent by hand, to `to`; answers what the player missed. */
  async function sentTo(to: readonly string[] | undefined): Promise<string | undefined> {
    const h = await watch({ from: PICK_CHAPTER, skip: (act) => act.kind === "send" });
    h.player.play();
    await h.clock.advance(5000);
    h.store.send({ spaceId: BIRTHDAY, text: TO_THEO, ...(to === undefined ? {} : { to }) });
    await h.clock.advance(1500);
    const missed = h.player.getState().missed;
    h.close();
    return missed;
  }

  it("takes You's words as done only when they went to Theo alone", async () => {
    expect(await sentTo([AGENTS.theo.id])).toBeUndefined();
    expect(await sentTo(undefined)).toBe("send");
    expect(await sentTo([AGENTS.milo.id])).toBe("send");
  });
});

describe("the player", () => {
  it("draws the lock screen as a picture, answered once the ask is", async () => {
    const h = await watch({ from: LOCK_CHAPTER });
    h.player.play();
    expect(h.player.getState().screen).toBe("lock");
    await h.clock.advance(700);
    expect(h.player.getState().lockScreen).toEqual({
      who: "Milo",
      room: "Birthday dinner",
      question: "Send Theo's invite card to the 11 people in Family?",
      spaceId: BIRTHDAY,
      runId: RUNS.dinner,
      approvalId: APPROVALS.invites,
      answered: false,
    });
    await h.clock.advance(2600);
    expect(h.player.getState().lockScreen?.answered).toBe(true);
    await h.clock.advance(1200);
    // The picture goes, and the room it was drawn over is there.
    expect(h.player.getState()).toMatchObject({ screen: "lock", spaceId: BIRTHDAY });
    expect(h.player.getState().lockScreen).toBeUndefined();
    h.close();
  });

  it("tells a listener the state now, and at each change, until it is closed", async () => {
    const h = await watch();
    const heard: number[] = [];
    const stop = h.player.subscribe((state) => heard.push(state.chapter));
    expect(heard).toEqual([0]);
    h.player.play();
    h.player.play();
    await h.clock.advance(400);
    expect(heard.length).toBeGreaterThan(2);
    stop();
    h.close();
    h.player.play();
    expect(h.player.getState().playing).toBe(false);
  });

  it("starts ended at the film's end, where a message gets the one canned answer", async () => {
    const h = await watch({ from: filmOf().chapters.length });
    expect(h.player.getState()).toMatchObject({ ended: true });
    h.player.play();
    expect(h.player.getState().playing).toBe(false);
    h.store.send({ spaceId: GARDEN, text: "Can you add a contact page?" });
    await h.clock.advance(1500);
    const garden = h.snapshot().model.spaces.find((space) => space.id === GARDEN);
    expect(garden?.lines.at(-1)).toMatchObject({
      authorId: AGENTS.felix.id,
      text: expect.stringContaining("This workspace is made up"),
    });
    h.close();
  });

  it("answers nothing sent while the film plays", async () => {
    const h = await watch();
    h.player.play();
    h.store.send({ spaceId: GARDEN, text: "Looks good" });
    await h.clock.advance(3000);
    const garden = h.snapshot().model.spaces.find((space) => space.id === GARDEN);
    expect(garden?.lines.at(-1)).toMatchObject({ authorId: DEMO_PERSON_ID, text: "Looks good" });
    h.close();
  });
});
