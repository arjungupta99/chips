import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agentPermissions, permissionsRow } from "./agentPermissions.js";
import type { Banners } from "./banners.js";
import type { ClientEvent, Directory } from "./events.js";
import { buildModel } from "./model.js";

const FIXTURES = new URL("../../protocol/fixtures/", import.meta.url);
const AGENT = "agt_01K4ZQPX000000000000000005";
const HARNESS = "hrn_01K4ZQPX000000000000000004";
const ME = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX00000000000000000D";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  const raw = readFileSync(new URL(`${type}.json`, FIXTURES), "utf8");
  return { ...JSON.parse(raw), seq, ...overrides };
}

const created = fixture("space.created", 1);
const SPACE = created.space_id as string;
const directory: Directory = {
  [HARNESS]: { id: HARNESS, kind: "harness", displayName: "Claude Code", ownerId: ME },
  [AGENT]: { id: AGENT, kind: "agent", displayName: "Jiro", harnessId: HARNESS, room: SPACE },
  [ME]: { id: ME, kind: "person", displayName: "Arjun", role: "owner" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana", role: "member" },
};
const started = fixture("approval.held_started", 2, {
  space_id: SPACE,
  asker: AGENT,
  started_by: ME,
});
const asking = buildModel([created]);
const working = buildModel([created, started]);
const since = started.ts as string;
const NOW = Date.parse(since) + 60_000;
const page = (
  model = asking,
  banners?: Banners,
  self: string | undefined = ME,
  more: Record<string, unknown> = {},
) => agentPermissions({ model, directory, banners, ...more }, AGENT, self, NOW);

describe("an agent's Permissions page (ADR 0286)", () => {
  it("says what happens while it asks, and offers Let it work", () => {
    const view = page();
    expect(view.headline).toBe("Jiro decides when to ask. You decide the answer.");
    expect(view.held).toBeUndefined();
    expect(view.space?.id).toBe(SPACE);
    expect(view.to).toBe("You");
    expect(view.mayLetWork).toBe(true);
    expect(view.mayStop).toBe(false);
    expect(view.confirmButton).toBe("Let Jiro work");
    expect(view.confirmWords).toContain("until you stop it");
  });

  it("says who is working without asking, and offers Stop", () => {
    const view = page(working);
    expect(view.headline).toMatch(/^Jiro is working without asking in /);
    expect(view.sub).toContain("Until you stop it");
    expect(view.mayStop).toBe(true);
    expect(view.mayLetWork).toBe(false);
  });

  it("has nothing to say about a space it isn't in", () => {
    const free: Directory = {
      ...directory,
      [AGENT]: { ...(directory[AGENT] as Directory[string]), room: null },
    };
    const view = agentPermissions({ model: asking, directory: free }, AGENT, ME, NOW);
    expect(view.space).toBeUndefined();
    expect(view.headline).toBe("Jiro isn't in a space right now.");
    expect(view.mayLetWork).toBe(false);
  });

  it("offers Let it work only to its person or an owner, and never on an older server", () => {
    expect(page(asking, undefined, DANA).mayLetWork).toBe(false);
    expect(page(asking, undefined, ME, { keepsHeldStart: false }).mayLetWork).toBe(false);
    expect(agentPermissions({ model: asking, directory }, AGENT, undefined, NOW).mayLetWork).toBe(
      false,
    );
  });

  it("says when the banner is closed and when it comes back", () => {
    const closed = { choices: {}, closed: [{ spaceId: SPACE, asker: AGENT, since }] };
    expect(page(working, closed).banner.closed?.line).toBe("Until Jiro is given a new yes");
    expect(page(working).banner.closed).toBeUndefined();
    // Off altogether says nothing about closed for now.
    const off = { choices: { [AGENT]: false }, closed: closed.closed };
    expect(page(working, off).banner.closed).toBeUndefined();
    expect(page(working, off).banner.sub).toBe("Off for Jiro only");
  });

  it("stops offering the banner's switch to a server that keeps no choices", () => {
    expect(page(working).banner.mayChoose).toBe(true);
    expect(page(working, undefined, ME, { keepsBanners: false }).banner.mayChoose).toBe(false);
  });
});

describe("the row on the agent's page", () => {
  const input = (model = asking, banners?: Banners) => ({ model, directory, banners });

  it("says it asks, or not", () => {
    expect(permissionsRow(input(), AGENT, NOW)).toEqual({
      value: "Asks you",
      working: false,
      sub: undefined,
    });
    expect(permissionsRow(input(working), AGENT, NOW)).toEqual({
      value: "Not asking",
      working: true,
      sub: undefined,
    });
  });

  it("gives the hour's end instead when a yes has one", () => {
    const hour = fixture("approval.request", 2, { space_id: SPACE, approval_id: "apr_1" });
    const yes = fixture("approval.resolved", 3, {
      space_id: SPACE,
      approval_id: "apr_1",
      for_minutes: 60,
    });
    const model = buildModel([created, hour, yes]);
    const asker = model.spaces[0]?.letWork?.[0]?.asker as string;
    const here: Directory = {
      ...directory,
      [asker]: { id: asker, kind: "agent", displayName: "Kit", harnessId: HARNESS, room: SPACE },
    };
    expect(
      permissionsRow({ model, directory: here }, asker, Date.parse(yes.ts as string)).value,
    ).toMatch(/^Until \d+:\d\d [AP]M$/);
  });

  it("says when the banner is off, or closed", () => {
    const off = { choices: { [AGENT]: false }, closed: [] };
    expect(permissionsRow(input(working, off), AGENT, NOW).sub).toBe("Banner off");
    const closed = { choices: {}, closed: [{ spaceId: SPACE, asker: AGENT, since }] };
    expect(permissionsRow(input(working, closed), AGENT, NOW).sub).toBe("Banner closed for now");
  });
});
