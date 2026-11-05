/**
 * Relay on the web and the Mac (ADR 0211, Phase 4): the owner's card lists every device by the
 * way it goes now, asks before the relay goes off with who would lose the server, asks those
 * people to go direct first when told to, turns off when told now and back on in one click, and
 * is not drawn where the server has no relay.
 */

import type { Directory, RelayDevice, RelayFacts } from "@chipschat/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELAY_EVERY_MS, RelayPage } from "./Relay.tsx";
import type { RelayService } from "./services.ts";

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const device = (over: Partial<RelayDevice> & Pick<RelayDevice, "deviceId">): RelayDevice => ({
  participantId: "per_arjun",
  name: "A device",
  now: undefined,
  lastVia: undefined,
  lastViaAt: undefined,
  directAt: undefined,
  ...over,
});

const FACTS: RelayFacts = {
  configured: true,
  on: true,
  setBy: undefined,
  setAt: undefined,
  devices: [
    device({ deviceId: "dev_mac", name: "Chips for Mac", now: "socket", lastVia: "socket" }),
    device({
      deviceId: "dev_natalie",
      participantId: "per_natalie",
      name: "iPhone 16",
      now: "relay",
      lastVia: "relay",
      lastViaAt: ago(HOUR),
    }),
    device({
      deviceId: "dev_ipad",
      name: "iPad",
      lastVia: "relay",
      lastViaAt: ago(2 * HOUR),
      directAt: ago(3 * 24 * HOUR),
    }),
  ],
  keptLink: "https://login.tailscale.com/admin/invite/abc123",
};

const DIRECTORY = {
  per_natalie: { id: "per_natalie", kind: "person", displayName: "Natalie" },
} as unknown as Directory;

function serviceWith(first: RelayFacts) {
  let facts = first;
  const asked: string[] = [];
  const service: RelayService = {
    read: async () => {
      asked.push("read");
      return facts;
    },
    set: async (on) => {
      asked.push(`set ${on}`);
      facts = { ...facts, on };
      return facts;
    },
    ask: async () => {
      asked.push("ask");
      return 1;
    },
    forget: async () => {
      asked.push("forget");
      facts = { ...facts, keptLink: undefined };
    },
    relayHost: "relay.chipschat.ai",
    serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
    machine: async () => "Arjun's Mac mini",
    here: { deviceId: "dev_mac", word: "This computer" },
  };
  return { service, asked };
}

const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("Relay on You", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lists every device by the way it goes now, and says what the relay does", async () => {
    const { service, asked } = serviceWith(FACTS);
    render(<RelayPage service={service} directory={DIRECTORY} selfId="per_arjun" />);
    await wait(0);
    expect((screen.getByTestId("relay-switch") as HTMLInputElement).checked).toBe(true);
    expect(text("relay-row")).toMatch(
      "relay.chipschat.ai carries sealed traffic for devices that can't reach Arjun's Mac mini directly. With it off, Chips is reachable only over Tailscale. Each day the relay writes down how many servers and connections it carried. What Chips counts ›",
    );
    // Chips's own relay links the page that says what it counts (ADR 0208).
    expect(screen.getByRole("link", { name: "What Chips counts ›" }).getAttribute("href")).toBe(
      "https://chipschat.ai/operate/what-chips-counts/",
    );
    expect(text("relay-relayed")).toMatch("iPhone 16 · Natalienever direct");
    // This computer is itself in the list.
    expect(text("relay-direct")).toMatch("This computerdirect");
    expect(text("relay-away")).toMatch("iPadrelay, 2 h ago");
    await wait(RELAY_EVERY_MS);
    expect(asked.filter((each) => each === "read")).toHaveLength(2);
  });

  it("comes into view lit gold when Away from home sent the person, and again when sent again", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const { service } = serviceWith(FACTS);
    const card = (reveal: number) => (
      <RelayPage service={{ ...service, reveal }} directory={DIRECTORY} selfId="per_arjun" />
    );
    const { rerender } = render(card(0));
    await wait(0);
    // Opened any other way: neither moved to nor lit.
    expect(screen.getByTestId("relay-card").className).toBe("you-card");
    expect(scrolled).not.toHaveBeenCalled();
    rerender(card(1));
    await wait(0);
    const first = screen.getByTestId("relay-card");
    expect(first.className).toBe("you-card is-lit");
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toBe(first);
    // Asked again while You is open: the card is drawn anew, so its light plays again.
    rerender(card(2));
    await wait(0);
    expect(screen.getByTestId("relay-card")).not.toBe(first);
    expect(screen.getByTestId("relay-card").className).toBe("you-card is-lit");
    expect(scrolled).toHaveBeenCalledTimes(2);
    scrolled.mockRestore();
  });

  it("says why the server isn't connected while the relay is on, and nothing once it is", async () => {
    const { service } = serviceWith({ ...FACTS, status: "connecting", why: "unreachable" });
    const { unmount } = render(
      <RelayPage service={service} directory={DIRECTORY} selfId="per_arjun" />,
    );
    await wait(0);
    expect(text("relay-not-connected")).toBe(
      "On, but not connected: the server can't reach the relay.",
    );
    unmount();
    render(
      <RelayPage
        service={serviceWith({ ...FACTS, status: "connected" }).service}
        directory={DIRECTORY}
        selfId="per_arjun"
      />,
    );
    await wait(0);
    expect(screen.queryByTestId("relay-not-connected")).toBeNull();
  });

  it("names Chips's relay from the server when this device was never told one (ADR 0245)", async () => {
    const { service } = serviceWith({
      ...FACTS,
      on: false,
      url: "wss://relay.chipschat.ai",
      devices: [],
    });
    render(
      <RelayPage
        service={{ ...service, relayHost: "The relay" }}
        directory={DIRECTORY}
        selfId="per_arjun"
      />,
    );
    await wait(0);
    expect((screen.getByTestId("relay-switch") as HTMLInputElement).checked).toBe(false);
    expect(text("relay-row")).toMatch(/^Use the relayrelay\.chipschat\.ai carries sealed traffic/);
  });

  it("asks before it turns off, and asks those who would lose the server to go direct first", async () => {
    const { service, asked } = serviceWith(FACTS);
    render(<RelayPage service={service} directory={DIRECTORY} selfId="per_arjun" />);
    await wait(0);
    fireEvent.click(screen.getByTestId("relay-switch"));
    expect(text("relay-off-lead")).toBe(
      "2 devices last reached Chips through the relay. They would lose their connection until they go direct.",
    );
    expect(text("relay-off-page")).toMatch(/iPhone 16 · Natalienever direct/);
    expect(text("relay-off-page")).toMatch(/iPaddirect 3 d ago/);
    expect(text("relay-off-page")).toMatch(
      "New invite and pairing links will open only on your tailnet.",
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("relay-ask"));
    });
    expect(asked).toContain("ask");
    expect(asked).not.toContain("set false");
    expect(text("relay-said")).toBe("Asked 1 person to go direct");
    expect((screen.getByTestId("relay-switch") as HTMLInputElement).checked).toBe(true);
  });

  it("turns off when told now, and back on in one click", async () => {
    const { service, asked } = serviceWith(FACTS);
    render(<RelayPage service={service} directory={DIRECTORY} selfId="per_arjun" />);
    await wait(0);
    fireEvent.click(screen.getByTestId("relay-switch"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("relay-turn-off"));
    });
    expect(asked).toContain("set false");
    expect((screen.getByTestId("relay-switch") as HTMLInputElement).checked).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByTestId("relay-switch"));
    });
    expect(asked).toContain("set true");
    expect((screen.getByTestId("relay-switch") as HTMLInputElement).checked).toBe(true);
  });

  it("forgets the share link kept for the next guest", async () => {
    const { service, asked } = serviceWith(FACTS);
    render(<RelayPage service={service} directory={DIRECTORY} selfId="per_arjun" />);
    await wait(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Forget" }));
    });
    expect(asked).toContain("forget");
    expect(screen.queryByTestId("relay-kept")).toBeNull();
  });

  it("is not drawn where the server has no relay, and stops asking", async () => {
    const { service, asked } = serviceWith({ ...FACTS, configured: false, devices: [] });
    render(<RelayPage service={service} directory={DIRECTORY} selfId="per_arjun" />);
    await wait(RELAY_EVERY_MS * 2);
    expect(screen.queryByTestId("relay")).toBeNull();
    expect(asked).toEqual(["read"]);
  });
});
