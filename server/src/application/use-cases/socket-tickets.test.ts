import { manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { Principal } from "../ports/identity.js";
import { createSocketTickets, SOCKET_TICKET_TTL_SECONDS } from "./socket-tickets.js";

const ARJUN: Principal = {
  kind: "person",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  via: "device_key",
  deviceId: "dev_1",
};

function harness() {
  const clock = manualClock(1_000_000);
  let n = 0;
  const tickets = createSocketTickets({
    clock,
    randomToken: () => {
      n += 1;
      return `ticket-${n}`;
    },
  });
  return { clock, tickets };
}

describe("socket tickets", () => {
  it("redeems once to the principal it was minted for", () => {
    const { tickets } = harness();
    const { ticket } = tickets.issue(ARJUN);
    expect(tickets.redeem(ticket)?.participantId).toBe("usr_1");
  });

  it("is single use: a second redemption gets nothing", () => {
    const { tickets } = harness();
    const { ticket } = tickets.issue(ARJUN);
    tickets.redeem(ticket);
    expect(tickets.redeem(ticket)).toBeUndefined();
  });

  it("expires, so a captured ticket is worthless after its short life", () => {
    const { clock, tickets } = harness();
    const { ticket } = tickets.issue(ARJUN);
    clock.advance(SOCKET_TICKET_TTL_SECONDS * 1000 + 1);
    expect(tickets.redeem(ticket)).toBeUndefined();
  });

  it("knows nothing of a ticket it never minted", () => {
    const { tickets } = harness();
    expect(tickets.redeem("never-issued")).toBeUndefined();
  });
});
