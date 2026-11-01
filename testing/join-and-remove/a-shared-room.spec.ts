/**
 * Two people and an agent in a room, in the browser (ADR 0204; SH-1): Foodie as Natalie met it on
 * 19 October 2026, and as Arjun took her out of it from a phone whose link had stalled. She joins
 * by an invite, at a desk or at a phone's width; the agent is the test's harness.
 *
 * - Her field says who a message is for once she has two others: the agent, the owner under it,
 *   Everyone at the foot. Picked, the owner's message goes to no agent; the agent's goes to it, and
 *   its answer is on both screens.
 * - The owner takes her out while his link has stalled: she leaves his sheet at once, nothing is
 *   sent twice, and once the link is back the room says it once.
 */

import type { Page } from "../../apps/web/e2e/playwright.ts";
import {
  demo,
  type Frame,
  Harness,
  newRunId,
  registerAgent,
  SERVER,
} from "../../apps/web/e2e/support.ts";
import {
  addMember,
  aName,
  asOwner,
  closeSheet,
  expect,
  invite,
  join,
  newRoom,
  OWNER,
  personId,
  roomLines,
  roomSheet,
  takeOut,
  test,
} from "./support.ts";

/** What Chips called an agent of the demo harness: numbered past others of its name (ADR 0091). */
async function agentName(agentId: string): Promise<string> {
  const harness = demo().harness;
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    headers: { authorization: `Bearer ${harness.token}` },
  });
  const { agents } = (await response.json()) as { agents: { agent_id: string; name: string }[] };
  const found = agents.find((agent) => agent.agent_id === agentId);
  if (found === undefined) throw new Error(`no agent ${agentId}`);
  return found.name;
}

/** The next event a harness has with these words. */
function heard(harness: Harness, text: string): Promise<Frame> {
  return harness
    .waitFor(
      (frame) => ((frame["event"] as Frame | undefined)?.["text"] as string | undefined) === text,
      `"${text}" at the harness`,
    )
    .then((frame) => frame["event"] as Frame);
}

/**
 * A page's link to the server, which the test can stall and let go: every frame either way is
 * held while stalled and sent in order once let go, as a link that has opened but not yet said
 * hello holds what is sent on it (SH-1). The web app speaks inside one tunnel (ADR 0191); a plain
 * socket is held the same.
 */
async function stallable(page: Page): Promise<{ stall: () => void; release: () => void }> {
  let stalled = false;
  const held: (() => void)[] = [];
  await page.routeWebSocket(/\/v1\/(tunnel|ws)/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (stalled) held.push(() => server.send(message));
      else server.send(message);
    });
    server.onMessage((message) => {
      if (stalled) held.push(() => socket.send(message));
      else socket.send(message);
    });
  });
  return {
    stall() {
      stalled = true;
    },
    release() {
      stalled = false;
      for (const send of held.splice(0)) send();
    },
  };
}

test("Foodie: her field lists the agent, the owner and Everyone; for the owner no agent takes a turn, and for the agent it answers on both screens", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const harness = await Harness.connect(newRunId());
  const title = `Foodie ${test.info().project.name} ${Date.now() % 10_000}`;
  const agent = await registerAgent(
    demo().harness,
    `foodie-ui-${Date.now()}`,
    "Restaurant Tracking",
  );
  const agentCalled = await agentName(agent);
  const natalie = await join(browser, await invite(owner), aName("Natalie"));
  try {
    const id = await personId(owner, natalie.name);
    await newRoom(owner, title);
    await addMember(owner, { id: agent });
    await addMember(owner, { id });
    await closeSheet(owner);
    const seated = await harness.waitFor(
      (frame) =>
        ["membership.added", "agent.attached"].includes(
          String((frame["event"] as Frame | undefined)?.["type"]),
        ) &&
        // By its own id, or its harness's to a harness that has not declared agents, as this one.
        [agent, demo().harness.id].includes(
          String((frame["event"] as Frame | undefined)?.["participant_id"]),
        ),
      "the agent put in Foodie",
    );
    harness.space = String((seated["event"] as Frame)["space_id"]);

    const her = natalie.page;
    await expect(her.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
    // Two others, so the field says who: the room's one agent first.
    const capsule = her.getByRole("button", { name: `To ${agentCalled}`, exact: true });
    await expect(capsule).toBeVisible();
    await capsule.click();
    const list = her.getByRole("listbox", { name: "Where the next message goes" });
    const options = list.getByRole("option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveAccessibleName(new RegExp(`^${agentCalled}`));
    await expect(options.nth(1)).toHaveAccessibleName(new RegExp(`^${OWNER},`));
    await expect(options.nth(2)).toHaveAccessibleName(/^Everyone/);

    // For the owner: overheard, and no agent takes a turn.
    await options.nth(1).click();
    await expect(her.getByRole("button", { name: `To ${OWNER}`, exact: true })).toBeVisible();
    const forHim = `How's it going? ${Date.now()}`;
    await her.getByRole("textbox", { name: `Message ${OWNER}` }).fill(forHim);
    await her.getByRole("textbox", { name: `Message ${OWNER}` }).press("Enter");
    expect(await heard(harness, forHim)).toMatchObject({
      type: "message.overheard",
      addressed_to: [],
    });
    const line = (on: Page, text: string) =>
      on.getByTestId("messages").locator("[data-line]", { hasText: text });
    await expect(line(her, forHim).getByRole("button", { name: `Went to ${OWNER}` })).toBeVisible();
    await expect(roomLines(owner)).toContainText(forHim);

    // For the agent: it is hers to answer, and the answer is on both screens.
    await her.getByRole("button", { name: `To ${OWNER}`, exact: true }).click();
    await list.getByRole("option", { name: new RegExp(`^${agentCalled}`) }).click();
    const coffee = `Coffee this afternoon? ${Date.now()}`;
    await her.getByRole("textbox", { name: /^Message/ }).fill(coffee);
    await her.getByRole("textbox", { name: /^Message/ }).press("Enter");
    const asked = await heard(harness, coffee);
    expect(asked).toMatchObject({ type: "message.new" });
    expect(asked["from"]).toMatchObject({ participant_id: id, role: "member" });
    // Its turn on her words, as a harness takes one: a run in the room, then the answer.
    const turn = await harness.send("run.started", { goal: coffee });
    expect(turn, JSON.stringify(turn)).toMatchObject({ frame: "ack" });
    const answer = `Three o'clock at the corner place, ${natalie.name.split(" ")[0]}.`;
    const replied = await harness.send("message.post", { text: answer });
    expect(replied, JSON.stringify(replied)).toMatchObject({ frame: "ack" });
    await expect(roomLines(her)).toContainText(answer);
    await expect(roomLines(owner)).toContainText(answer);
  } finally {
    harness.close();
    await natalie.context.close();
  }
});

test("taken out while the owner's link has stalled: she leaves his sheet at once, and the room says it once when the link is back (SH-1)", async ({
  page,
  browser,
}) => {
  const link = await stallable(page);
  const owner = await asOwner(page);
  const title = `Foodie SH-1 ${test.info().project.name} ${Date.now() % 10_000}`;
  const natalie = await join(browser, await invite(owner), aName("Natalie"));
  try {
    const id = await personId(owner, natalie.name);
    await newRoom(owner, title);
    await addMember(owner, { id });
    await closeSheet(owner);
    await expect(natalie.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();

    // The link stalls: what the owner sends now waits, and nothing comes back.
    link.stall();
    await takeOut(owner, natalie.name);
    const sheet = await roomSheet(owner);
    // Out of his sheet at once, with nothing heard from the server (SH-1): no second try is asked.
    await expect(sheet.getByTestId("member").filter({ hasText: natalie.name })).toHaveCount(0, {
      timeout: 1500,
    });
    await expect(sheet.getByRole("button", { name: `Remove ${natalie.name}` })).toHaveCount(0);
    await expect(natalie.page.getByTestId("removed-from-room")).toHaveCount(0);
    await closeSheet(owner);

    // The link comes back: the removal goes once, the room says so once, and she is told.
    link.release();
    await expect(roomLines(owner)).toContainText(`You removed ${natalie.name}`, {
      timeout: 15_000,
    });
    await expect(natalie.page.getByTestId("removed-from-room")).toContainText(
      `${OWNER} removed you from ${title}`,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(1000);
    await expect(
      roomLines(owner).getByText(`You removed ${natalie.name}`, { exact: false }),
    ).toHaveCount(1);
    // And she stays out of his sheet.
    const after = await roomSheet(owner);
    await expect(after.getByTestId("member").filter({ hasText: natalie.name })).toHaveCount(0);
  } finally {
    await natalie.context.close();
  }
});
