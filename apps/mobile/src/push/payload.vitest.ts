/** Reading a push: three ids, two buttons, and a refusal for anything else. */

import { describe, expect, it } from "vitest";
import {
  APPROVE,
  approvesFromLockScreen,
  askFrom,
  buttons,
  DENY,
  deviceFrom,
  directFrom,
  joinFrom,
  readOnArrival,
  responseTo,
  TAPPED,
} from "./payload.js";

const DATA = {
  approval_id: "apr_01K4ZQPX000000000000000001",
  space_id: "spc_01K4ZQPX000000000000000002",
  run_id: "run_01K4ZQPX000000000000000003",
};
const AT = "2026-09-08T12:00:00.000Z";
const route = (id: string) => `/needs/${id}`;

describe("the ask a push is about", () => {
  it("is the three ids it carries", () => {
    expect(askFrom(DATA)).toEqual({
      approvalId: DATA.approval_id,
      spaceId: DATA.space_id,
      runId: DATA.run_id,
    });
  });

  it("is nothing when an id is missing, or is not the kind it should be", () => {
    expect(askFrom({ ...DATA, run_id: undefined })).toBeUndefined();
    expect(askFrom({ ...DATA, approval_id: "spc_01K4ZQPX000000000000000001" })).toBeUndefined();
    expect(askFrom({ ...DATA, space_id: 7 })).toBeUndefined();
  });

  it("is nothing at all for a payload that is not a bag of ids", () => {
    for (const not of [undefined, null, "", 3, []]) expect(askFrom(not)).toBeUndefined();
  });
});

describe("what a response amounts to", () => {
  it("is a decision when a button was pressed", () => {
    expect(responseTo(APPROVE, DATA, AT, route, "ios")).toEqual({
      kind: "decision",
      decision: {
        approvalId: DATA.approval_id,
        spaceId: DATA.space_id,
        runId: DATA.run_id,
        decision: "approved",
        at: AT,
      },
    });
    expect(responseTo(DENY, DATA, AT, route, "ios")).toMatchObject({
      kind: "decision",
      decision: { decision: "denied" },
    });
  });

  it("is the ask's own screen when the notification itself was tapped", () => {
    expect(responseTo(TAPPED, DATA, AT, route, "ios")).toEqual({
      kind: "open",
      route: `/needs/${DATA.approval_id}`,
    });
  });

  it("opens the room for a push about a room and no ask (ADR 0158)", () => {
    const mention = { space_id: "spc_01K4ZQPX000000000000000001", message_id: "msg_01" };
    expect(responseTo(TAPPED, mention, AT, route, "ios")).toEqual({
      kind: "open",
      route: "/spaces/spc_01K4ZQPX000000000000000001",
    });
    expect(responseTo(TAPPED, { space_id: "nope" }, AT, route, "ios")).toEqual({ kind: "nothing" });
  });

  it("is nothing for a push this app did not send", () => {
    expect(responseTo(APPROVE, { hello: "there" }, AT, route, "ios")).toEqual({ kind: "nothing" });
    expect(responseTo(DENY, { hello: "there" }, AT, route, "android")).toEqual({ kind: "nothing" });
  });

  it("is the ask's own screen when Approve was pressed where the lock screen cannot ask first", () => {
    const opened = { kind: "open", route: `/needs/${DATA.approval_id}` };
    expect(responseTo(APPROVE, DATA, AT, route, "android")).toEqual(opened);
    expect(responseTo(APPROVE, DATA, AT, route, undefined)).toEqual(opened);
  });

  it("is still a decision when Deny was pressed, on any phone", () => {
    for (const phone of ["ios", "android", undefined] as const) {
      expect(responseTo(DENY, DATA, AT, route, phone)).toMatchObject({
        kind: "decision",
        decision: { decision: "denied" },
      });
    }
  });
});

describe("the buttons a decision push carries", () => {
  const byId = (phone: "ios" | "android") =>
    Object.fromEntries(buttons(phone).map((button) => [button.identifier, button]));

  it("decide from the lock screen only on iOS, where Approve asks for the unlock first", () => {
    expect(approvesFromLockScreen("ios")).toBe(true);
    expect(approvesFromLockScreen("android")).toBe(false);
    expect(approvesFromLockScreen(undefined)).toBe(false);
  });

  it("on iOS: Approve asks for Face ID and neither brings the app forward", () => {
    const ios = byId("ios");
    expect(ios[APPROVE]).toEqual({
      identifier: APPROVE,
      buttonTitle: "Approve",
      options: { isAuthenticationRequired: true, opensAppToForeground: false },
    });
    expect(ios[DENY]?.options.opensAppToForeground).toBe(false);
  });

  it("on Android: Approve opens the app, behind the unlock, and says it asks for more", () => {
    const android = byId("android");
    expect(android[APPROVE]).toEqual({
      identifier: APPROVE,
      buttonTitle: "Approve…",
      options: { opensAppToForeground: true },
    });
    expect(android[DENY]?.options.opensAppToForeground).toBe(false);
  });

  it("are the same two, in the same order, on both", () => {
    for (const phone of ["ios", "android"] as const) {
      expect(buttons(phone).map((button) => button.identifier)).toEqual([APPROVE, DENY]);
    }
  });
});

describe("a join request's push (ADR 0122)", () => {
  it("is read by its id alone, whatever is pressed, and nothing else passes for one", () => {
    const data = { join_request_id: "jrq_01K4ZQPX0000000000000000J1" };
    expect(joinFrom(data)).toBe("jrq_01K4ZQPX0000000000000000J1");
    expect(joinFrom({ join_request_id: "apr_1" })).toBeUndefined();
    for (const action of [TAPPED, APPROVE, DENY]) {
      expect(
        responseTo(action, data, "2026-10-05T21:00:00.000Z", (id) => `/needs/${id}`, "ios"),
      ).toEqual({
        kind: "join",
        requestId: "jrq_01K4ZQPX0000000000000000J1",
      });
    }
  });
});

describe("a direct ask's pushes (ADR 0211)", () => {
  const at = "2026-10-20T16:00:00.000Z";
  const route = (id: string) => `/needs/${id}`;
  it("reads an ask by its id for an owner, and opens Connection for the guest it was shared with", () => {
    expect(directFrom({ direct_ask_id: "dra_1" })).toBe("dra_1");
    expect(directFrom({ direct_ask_id: "jrq_1" })).toBeUndefined();
    expect(responseTo(TAPPED, { direct_ask_id: "dra_1" }, at, route, "ios")).toEqual({
      kind: "direct",
      askId: "dra_1",
    });
    expect(responseTo(TAPPED, { direct_shared: "dra_1" }, at, route, "ios")).toEqual({
      kind: "open",
      route: "/connection",
    });
    // Arriving while the app is open, with no banner: the ask is read for the owner's sheet, the
    // guest's own for their guide.
    expect(readOnArrival({ direct_ask_id: "dra_1" })).toEqual({ kind: "direct", askId: "dra_1" });
    expect(readOnArrival({ direct_shared: "dra_1" })).toEqual({ kind: "mine" });
    expect(readOnArrival({ space_id: "spc_1" })).toBeUndefined();
    // An owner's ask to go direct before the relay goes off opens Connection, where Go direct is.
    expect(responseTo(TAPPED, { relay_ask: "connection" }, at, route, "ios")).toEqual({
      kind: "open",
      route: "/connection",
    });
    expect(responseTo(TAPPED, { relay_ask: "elsewhere" }, at, route, "ios")).toEqual({
      kind: "nothing",
    });
    // Its arrival, for the owner who shared, is a word on the lock screen and nothing more.
    expect(responseTo(TAPPED, { direct_done: "dra_1" }, at, route, "ios")).toEqual({
      kind: "nothing",
    });
  });
});

describe("the workspace a push came from (ADR 0197)", () => {
  it("is the device the server names, or nothing from a server older than that", () => {
    expect(deviceFrom({ device_id: "dev_01K4", space_id: "spc_1" })).toBe("dev_01K4");
    expect(deviceFrom({ space_id: "spc_1" })).toBeUndefined();
    expect(deviceFrom({ device_id: "" })).toBeUndefined();
    expect(deviceFrom(undefined)).toBeUndefined();
  });
});
