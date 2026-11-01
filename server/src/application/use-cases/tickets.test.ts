import { manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import { createTickets } from "./tickets.js";

function harness<T>(ttlSeconds = 30) {
  const clock = manualClock(1_000_000);
  let n = 0;
  const tickets = createTickets<T>({
    clock,
    ttlSeconds,
    randomToken: () => {
      n += 1;
      return `ticket-${n}`;
    },
  });
  return { clock, tickets };
}

describe("single-use tickets (ADR 0201)", () => {
  it("redeems once to what it was minted for, and says when it runs out", () => {
    const { clock, tickets } = harness<{ who: string }>();
    const minted = tickets.issue({ who: "usr_1" });
    expect(minted.expiresAt).toBe(clock.nowMs() + 30_000);
    expect(tickets.redeem(minted.ticket)).toEqual({ who: "usr_1" });
    expect(tickets.redeem(minted.ticket)).toBeUndefined();
  });

  it("expires at its own store's life, so a captured ticket is worthless after it", () => {
    const { clock, tickets } = harness<string>(10);
    const { ticket } = tickets.issue("held");
    clock.advance(10_000 + 1);
    expect(tickets.redeem(ticket)).toBeUndefined();
  });

  it("knows nothing of a ticket it never minted, or another store's", () => {
    const { tickets } = harness<string>();
    const other = harness<string>();
    const { ticket } = other.tickets.issue("theirs");
    expect(tickets.redeem("never-issued")).toBeUndefined();
    expect(tickets.redeem(ticket)).toBeUndefined();
    expect(other.tickets.redeem(ticket)).toBe("theirs");
  });

  it("counts the tickets still good among those asked about", () => {
    const { clock, tickets } = harness<{ who: string }>(10);
    const first = tickets.issue({ who: "usr_1" });
    tickets.issue({ who: "usr_1" });
    tickets.issue({ who: "usr_2" });
    expect(tickets.count((held) => held.who === "usr_1")).toBe(2);
    tickets.redeem(first.ticket);
    expect(tickets.count((held) => held.who === "usr_1")).toBe(1);
    clock.advance(10_000 + 1);
    expect(tickets.count(() => true)).toBe(0);
  });

  it("mints a base64url ticket of 256 bits when nothing is injected", () => {
    const tickets = createTickets<number>({ clock: manualClock(0), ttlSeconds: 30 });
    const { ticket } = tickets.issue(1);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tickets.issue(2).ticket).not.toBe(ticket);
  });
});
