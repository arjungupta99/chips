/**
 * Direct asks as the client holds them (ADR 0211, Phase 3): read off the wire, the next one an
 * owner is shown, and a guest's own as their guide reads it.
 */

import { describe, expect, it } from "vitest";
import {
  askRefusedWords,
  askSeen,
  type DirectAsk,
  directAskOf,
  nextDirectAsk,
} from "./directAsks.js";
import type { Directory } from "./events.js";
import { ServerRefused } from "./transport.js";

const view = {
  ask_id: "dra_1",
  participant_id: "per_dana",
  state: "asked" as const,
  trip_ms: 432,
  link: null,
  shared_by: null,
  asked_at: "2026-10-20T16:12:00.000Z",
  shared_at: null,
  direct_at: null,
};

describe("direct asks on the client", () => {
  it("reads an ask off the wire, nothing for what the server says is null", () => {
    expect(directAskOf(view)).toEqual({
      askId: "dra_1",
      participantId: "per_dana",
      state: "asked",
      tripMs: 432,
      link: undefined,
      sharedBy: undefined,
      askedAt: "2026-10-20T16:12:00.000Z",
      sharedAt: undefined,
    });
  });

  it("shows an owner the oldest ask still waiting that this device has not shown", () => {
    const at = (id: string, askedAt: string, state: DirectAsk["state"] = "asked") =>
      [id, { ...directAskOf(view), askId: id, askedAt, state }] as const;
    const asks = new Map([
      at("dra_b", "2026-10-20T16:14:00.000Z"),
      at("dra_a", "2026-10-20T16:13:00.000Z"),
      at("dra_old", "2026-10-20T16:00:00.000Z", "shared"),
    ]);
    expect(nextDirectAsk(asks, new Set())?.askId).toBe("dra_a");
    expect(nextDirectAsk(asks, new Set(["dra_a"]))?.askId).toBe("dra_b");
    expect(nextDirectAsk(asks, new Set(["dra_a", "dra_b"]))).toBeUndefined();
    expect(nextDirectAsk(undefined, new Set())).toBeUndefined();
  });

  it("names who shared a guest's ask, for their guide", () => {
    const directory = { per_natalie: { displayName: "Natalie" } } as unknown as Directory;
    const shared = directAskOf({
      ...view,
      state: "shared",
      shared_by: "per_natalie",
      link: "https://login.tailscale.com/admin/invite/x",
    });
    expect(askSeen(shared, directory)).toEqual({
      state: "shared",
      askedAt: view.asked_at,
      link: "https://login.tailscale.com/admin/invite/x",
      sharer: "Natalie",
    });
    expect(askSeen(undefined, directory)).toBeUndefined();
    // An owner who has not named themselves is not "You" to somebody else (JR-17).
    const unnamed = { per_natalie: { displayName: "You" } } as unknown as Directory;
    expect(askSeen(shared, unnamed)?.sharer).toBeUndefined();
  });

  it("says a server too old for asks needs updating, and the server's own words otherwise", () => {
    const old = new ServerRefused("No route matches that.", 404, {});
    expect(askRefusedWords(old)).toBe(
      "Your server can't take asks yet. Chips on it needs updating first.",
    );
    expect(askRefusedWords(new ServerRefused("Only a person asks.", 403, {}))).toBe(
      "Only a person asks.",
    );
  });
});
