/**
 * An invite at the relay's page, opened by the system (ADR 0207), goes to `/join` with the invite
 * as params, the route `chips://join` reaches; every other link goes on as it came.
 */

import { inviteFromLink, inviteRelayUrl } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { joinParams, joinPathFor } from "./inviteLink";

const KEY = "k".repeat(43);
const LAN = "https://adas-mac-mini.tail2f9c1e.ts.net";

describe("an invite link the system opens the app with", () => {
  it("goes to /join with what the relay's page carries", () => {
    const link = inviteRelayUrl("wss://relay.chipschat.ai", "chips_inv_1", { lan: LAN, key: KEY });
    const path = joinPathFor(link) ?? "";
    expect(path).toMatch(/^\/join\?/);
    const params = Object.fromEntries(new URLSearchParams(path.slice("/join?".length)));
    expect(params).toEqual({
      invite: "chips_inv_1",
      lan: LAN,
      key: KEY,
      relay: "wss://relay.chipschat.ai",
    });
    expect(params).toEqual(joinParams(inviteFromLink(link) ?? { token: "" }));
  });

  it("leaves every other link as it came", () => {
    expect(joinPathFor("chips://join?invite=chips_inv_1&lan=https%3A%2F%2Fa")).toBeUndefined();
    expect(joinPathFor("chips://space/spc_1")).toBeUndefined();
    expect(joinPathFor("https://relay.chipschat.ai/try/#invite=chips_inv_1")).toBeUndefined();
    expect(joinPathFor("https://relay.chipschat.ai/join")).toBeUndefined();
    expect(
      joinPathFor("https://relay.chipschat.ai/joined#invite=chips_inv_1&lan=x"),
    ).toBeUndefined();
    expect(joinPathFor("http://relay.chipschat.ai/join#invite=chips_inv_1&lan=x")).toBeUndefined();
  });
});
