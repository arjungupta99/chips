/**
 * ADR 0081's acceptance (last in the suite by name: the room it leaves is the newest, and the
 * specs that open on the demo room would open on this one instead): in a room with two harnesses, Chips says who each message is for, and
 * only they take a turn. Arjun opens a room with Scout and Pilot in it; "@Pilot …" reaches Pilot
 * as `message.new` and Scout as `message.overheard`; the capsule over the field then says Pilot,
 * and a pick of Scout from its menu sends the next message to Scout alone, with the route drawn
 * over it and none over the one after, which went where it did. Then Scout and Pilot address each
 * other (ADR 0097): at the sixth, Pilot giving its second answer again, the two of them are going
 * round, so the room warns under the fold and the agents' turns carry Chips's note; nothing is held until the forty-ninth, which is held
 * loudly — the sender's ack, a banner, the room's row — until Arjun lets them carry on, which
 * hands it to Pilot. Both harnesses are driven by the test; nothing is seeded.
 *
 * And ADR 0088's: each question comes with what was said in the room since the harness last spoke
 * there — since the turn that spoke began (ADR 0105) — and a harness that reconnects and replays
 * is handed the same lines.
 */

import { type RoomContext, renderContext } from "@chipschat/harness";
import { expect, type Page, test } from "@playwright/test";
import {
  addMember,
  closeSheet,
  demo,
  type Frame,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerAgent,
  registerSpecialist,
  SERVER,
  sheetBack,
} from "./support.ts";

/** Arjun says something in the open room. */
async function say(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: /Message/ }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText(text);
}

/** What Chips called one of a harness's agents, which may be numbered (ADR 0091). */
async function agentName(
  harness: { readonly id: string; readonly token: string },
  agentId: string,
): Promise<string> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    headers: { authorization: `Bearer ${harness.token}` },
  });
  const { agents } = (await response.json()) as { agents: { agent_id: string; name: string }[] };
  const found = agents.find((agent) => agent.agent_id === agentId);
  if (found === undefined) throw new Error(`no agent ${agentId}`);
  return found.name;
}

/** The next time a harness hears these words, as whichever of the two kinds it heard them. */
function heard(harness: Harness, text: string): Promise<Frame> {
  return harness
    .waitFor(
      (frame) => ((frame["event"] as Frame | undefined)?.["text"] as string | undefined) === text,
      `"${text}"`,
    )
    .then((frame) => frame["event"] as Frame);
}

test("a message reaches the harness it is for, the capsule picks, and the referee warns, holds and hands over", async ({
  page,
}) => {
  const pilot = await registerSpecialist("Pilot");
  await pair(page);
  const scout = await Harness.connect(newRunId());
  const pilotHarness = await Harness.connect(newRunId(), {
    token: pilot.token,
    space: pilot.space,
  });

  // An agent is in one room at a time (ADR 0087): Scout's second agent, free, so its first stays
  // in the demo room; and Pilot's, moved from the direct room it came with.
  const scoutHere = await registerAgent(demo().harness, "northwind", "Scout");
  // Called Scout, or numbered past the Scouts other specs made (ADR 0091): "Scout 3".
  const scoutName = await agentName(demo().harness, scoutHere);

  // A room with nobody asked into it, and Scout and Pilot added from its sheet, which comes up on
  // Add (ADR 0148) offering what is free as it opens.
  await page.getByRole("button", { name: "Create new space" }).click();
  // Nobody asked: Empty (ADR 0148).
  await pickEmpty(page);
  const name = page.getByRole("textbox", { name: "Name the space" });
  await name.fill("Northwind");
  await name.press("Enter");
  await expect(page.getByTestId("new-space-window")).toHaveCount(0);
  await expect(page.getByRole("main", { name: "Space: Northwind" })).toBeVisible();
  await expect(page.getByTestId("room-sheet-add-page")).toBeVisible();
  await addMember(page, { id: scoutHere });
  await addMember(page, { moving: "Pilot" });
  await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(3);
  await closeSheet(page);
  const joined = await pilotHarness.event("membership.added");
  const room = String(joined["space_id"]);
  pilotHarness.space = room;
  scout.space = room;

  // Before Arjun's first message here, the capsule says every harness.
  await expect(
    page.getByRole("button", { name: "To Everyone, 2 agents", exact: true }),
  ).toBeVisible();

  // "@Pilot …" is Pilot's: Pilot takes it, and Scout overhears it.
  await say(page, "@Pilot are the quotes in line?");
  const toPilot = await heard(pilotHarness, "@Pilot are the quotes in line?");
  expect(toPilot).toMatchObject({ type: "message.new", addressed_to: [pilot.id] });
  const overheard = await heard(scout, "@Pilot are the quotes in line?");
  // Each harness is in the room as its agent (ADR 0087). One that has not declared `agents` is
  // told its own agent as itself — Pilot hears `addressed_to: [pilot.id]` above — and another's
  // agent under that agent's own id, so Scout overhears it for Pilot's agent, not for Scout.
  expect(overheard).toMatchObject({ type: "message.overheard" });
  const [forPilot] = overheard["addressed_to"] as string[];
  expect(forPilot).toMatch(/^agt_/);
  expect(forPilot).not.toBe(demo().harness.id);

  // The next goes where that one went, and the capsule says so; a pick from its menu sends it to
  // Scout instead, and only Scout takes it.
  // Exact: the route over the message, "Went to Pilot", is a button too (ADR 0113).
  const capsule = page.getByRole("button", { name: "To Pilot", exact: true });
  await expect(capsule).toBeVisible();
  await capsule.click();
  // An agent's circle adds it or takes it out, and the list stays open (ADR 0114): Scout in,
  // Pilot out, and Escape puts the list away.
  const menu = page.getByRole("listbox", { name: "Where the next message goes" });
  await expect(
    menu.getByRole("option", {
      name: `${scoutName}, @${scoutName.replace(/\s+/g, "")}`,
      exact: true,
    }),
  ).toBeVisible();
  await menu.getByTestId(`aim-add-${scoutName}`).click();
  await menu.getByTestId("aim-add-Pilot").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `To ${scoutName}`, exact: true })).toBeVisible();
  await say(page, "Your turn, Scout: the price list?");
  const yourTurn = await heard(scout, "Your turn, Scout: the price list?");
  expect(yourTurn).toMatchObject({
    type: "message.new",
    addressed_to: [demo().harness.id],
  });
  // With it, what Scout has not said a word since: Pilot coming in, and the question it overheard,
  // its author's standing in the workspace after their name (SEC-15).
  expect(renderContext(yourTurn["context"] as RoomContext)).toBe(
    `Said in this space since you last spoke:\n(Pilot joined the space)\n${demo().person.displayName} (owner): @Pilot are the quotes in line?`,
  );
  expect(await heard(pilotHarness, "Your turn, Scout: the price list?")).toMatchObject({
    type: "message.overheard",
  });

  // The route marks where the address moved, and only there (A2).
  const row = (text: string) =>
    page.getByTestId("messages").locator("[data-line]", { hasText: text });
  await expect(row("@Pilot are the quotes in line?").getByTestId("message-route")).toHaveCount(1);
  await expect(row("Your turn, Scout").getByTestId("message-route")).toHaveCount(1);
  await say(page, "And by Friday?");
  expect(await heard(scout, "And by Friday?")).toMatchObject({ type: "message.new" });
  await expect(row("And by Friday?").getByTestId("message-route")).toHaveCount(0);

  // Scout and Pilot talk to each other, each in a run of its own: every event a harness sends
  // here names its run. Where Pilot's began is where its catch-up starts later (ADR 0105).
  let pilotBegan = 0;
  for (const who of [scout, pilotHarness]) {
    const started = await who.send("run.started", { goal: "Check the quotes." });
    expect(started).toMatchObject({ frame: "ack" });
    if (who === pilotHarness) pilotBegan = Number(started["seq"]);
  }
  const answer = (n: number) => `answer ${n}: aisle ${n} holds batch ${n * 7}, bay ${n * 3}.`;
  const talk = (n: number) =>
    n % 2 === 1
      ? ([scout, `@Pilot question ${n}: which shelf holds batch ${n * 7}?`] as const)
      : n === 6
        ? ([pilotHarness, `@Scout again: ${answer(2)}`] as const)
        : ([pilotHarness, `@Scout ${answer(n)}`] as const);
  for (let n = 1; n <= 6; n += 1) {
    const [who, text] = talk(n);
    expect(await who.send("message.post", { text })).toMatchObject({ frame: "ack" });
  }
  // Five questions and answers, each its own, are no circle: going back and forth is not going
  // round (ADR 0097's addendum of 17 October 2026). The sixth, Pilot's second answer again, is:
  // nothing is held; the room warns under the fold, and Scout's turn carries Chips's note.
  const sixth = await heard(scout, talk(6)[1]);
  expect(sixth).toMatchObject({ type: "message.new", exchange: { count: 6, stage: "warning" } });
  expect(String((sixth["exchange"] as Frame)["note"])).toContain("This looks like a circle");
  const fold = page.getByTestId("chatter");
  await expect(fold).toHaveCount(1);
  await expect(fold.getByTestId("guard")).toContainText(
    `${scoutName} and Pilot have sent each other 6 messages since you last acted, and the last one repeated an earlier one.`,
  );
  await expect(fold.getByRole("button", { name: "Pause them" })).toBeVisible();
  await expect(page.getByTestId("paused-banner")).toHaveCount(0);

  // They go on to the ceiling, and the next is held: in the room, for nobody, and its sender's
  // ack says so.
  for (let n = 7; n <= 48; n += 1) {
    const [who, text] = talk(n);
    expect(await who.send("message.post", { text })).toMatchObject({ frame: "ack" });
  }
  expect(await heard(pilotHarness, talk(47)[1])).toMatchObject({ type: "message.new" });
  const past = "@Pilot and the invoice address?";
  expect(await scout.send("message.post", { text: past })).toMatchObject({
    frame: "ack",
    held: true,
    exchange: { count: 49, allowance: 48 },
  });
  expect(await heard(pilotHarness, past)).toMatchObject({
    type: "message.overheard",
    addressed_to: [],
    held: true,
  });
  // Blocked is loud: the line under the fold, the banner over the field, and the room's row.
  await expect(fold.getByTestId("guard")).toContainText("Chips paused the agents.");
  const banner = page.getByTestId("paused-banner");
  await expect(banner).toContainText(
    `Chips paused the agents. ${scoutName} and Pilot sent each other 49 messages since you last acted.`,
  );
  await expect(page.locator(`[data-space="${room}"]`).getByTestId("paused")).toBeVisible();

  // Arjun lets them carry on: the held message is Pilot's now, once, and the banner goes.
  await banner.getByRole("button", { name: "Let them carry on" }).click();
  const handed = await pilotHarness.waitFor(
    (frame) => (frame["event"] as Frame | undefined)?.["handed"] === true,
    "the held message, handed over",
  );
  expect(handed["event"]).toMatchObject({ type: "message.new", text: past, handed: true });
  await expect(banner).toHaveCount(0);

  // Arjun speaks, and they may go on. Pilot is handed what was said since the turn of its last
  // words began (ADR 0105): every answer was said on its one run, so that is all of Scout's
  // questions, less its own words, all inside the 40 lines of its budget (ADR 0249): questions 1
  // to 47, and the question it was held from, marked.
  await say(page, "@Pilot go ahead.");
  const goAhead = await heard(pilotHarness, "@Pilot go ahead.");
  const context = goAhead["context"] as RoomContext;
  expect(context).toMatchObject({ since_seq: pilotBegan, truncated: false });
  const asked: string[] = [];
  for (let n = 1; n <= 47; n += 2) asked.push(`${scoutName}: ${talk(n)[1]}`);
  expect(renderContext(context)).toBe(
    [
      "Said in this space since you last spoke:",
      ...asked,
      `${scoutName}: ${past} (held by Chips until a person acts)`,
    ].join("\n"),
  );
  // A restart forgets nothing: Pilot back on a new socket, replaying, is handed the same lines.
  const again = await Harness.connect(newRunId(), { token: pilot.token, space: room, since: 0 });
  expect((await heard(again, "@Pilot go ahead."))["context"]).toEqual(goAhead["context"]);
  again.close();
  expect(await scout.send("message.post", { text: "@Pilot the Leeds one." })).toMatchObject({
    frame: "ack",
  });
  expect(await heard(pilotHarness, "@Pilot the Leeds one.")).toMatchObject({
    type: "message.new",
  });

  scout.close();
  pilotHarness.close();
});
