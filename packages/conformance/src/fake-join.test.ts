/**
 * The fake Chips answers a connector's `join()` (ADR 0122) as the real one does: a link taken up
 * once, a code allowed by the owner with only what it asked for, and a refusal it can read.
 */

import { connect, JoinError, join } from "@chipschat/harness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeChips, startFakeChips } from "./fake-chips.js";

let chips: FakeChips;

beforeEach(async () => {
  chips = await startFakeChips();
});
afterEach(async () => {
  await chips.close();
});

describe("join() against the fake Chips", () => {
  it("takes up a link once, and connects with what it is handed", async () => {
    const link = chips.makeJoinLink(["autonomy", "new_spaces"]);
    const me = await join({ link, name: "Tide", keep: false, env: {} });
    expect(me).toMatchObject({
      url: chips.address.url,
      harnessId: chips.address.harnessId,
      spaceId: chips.address.spaceId,
      capabilities: ["autonomy", "new_spaces"],
    });
    const socket = await connect({ ...me, client: { name: "tide", version: "0.0.0" } });
    socket.close();
    await expect(join({ link, name: "Tide", keep: false, env: {} })).rejects.toMatchObject({
      refusal: "spent",
    });
  });

  it("asks with a code, which the owner allows with only what it asked for", async () => {
    const me = await join({
      url: chips.address.url,
      name: "Ledger",
      wants: ["autonomy", "restarts"],
      keep: false,
      env: {},
      onCode: () => {
        chips.allowJoin(["autonomy", "new_spaces"]);
      },
    });
    expect(me.capabilities).toEqual(["autonomy"]);
    expect(chips.joinRequests().map((each) => each.state)).toEqual(["redeemed"]);
  });

  it("is refused when the owner says no", async () => {
    const refused = join({
      url: chips.address.url,
      name: "Pest",
      keep: false,
      env: {},
      onCode: () => {
        chips.denyJoin();
      },
    });
    await expect(refused).rejects.toBeInstanceOf(JoinError);
    await expect(refused).rejects.toMatchObject({ refusal: "denied" });
  });
});
