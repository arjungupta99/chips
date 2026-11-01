import { manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { Principal } from "../ports/identity.js";
import {
  createPageTickets,
  MAX_UNSPENT_PAGE_TICKETS,
  PAGE_TICKET_TTL_SECONDS,
} from "./page-tickets.js";

const person = (participantId: string): Principal => ({
  kind: "person",
  participantId,
  workspaceId: "wsp_1",
  displayName: participantId,
  via: "device_key",
  deviceId: `dev_${participantId}`,
});

const built = (who: string) => ({
  principal: person(who),
  built: { spaceId: "spc_1", path: "index.html", html: "<p>A page</p>" },
});

describe("page tickets (ADR 0201, SEC-53)", () => {
  it("holds one person to so many unspent, and frees a place as one is spent or runs out", () => {
    const clock = manualClock(1_000_000);
    const tickets = createPageTickets({ clock });
    const minted = Array.from({ length: MAX_UNSPENT_PAGE_TICKETS }, () =>
      tickets.issue(built("usr_arjun")),
    );
    expect(minted.every((each) => each !== undefined)).toBe(true);
    expect(tickets.issue(built("usr_arjun"))).toBeUndefined();
    // Somebody else holds their own.
    expect(tickets.issue(built("usr_dana"))).toBeDefined();
    // One spent: one more.
    expect(tickets.redeem(minted[0]?.ticket ?? "")).toBeDefined();
    expect(tickets.issue(built("usr_arjun"))).toBeDefined();
    expect(tickets.issue(built("usr_arjun"))).toBeUndefined();
    // All run out: a whole allowance again.
    clock.advance(PAGE_TICKET_TTL_SECONDS * 1000 + 1);
    expect(tickets.issue(built("usr_arjun"))).toBeDefined();
  });
});
