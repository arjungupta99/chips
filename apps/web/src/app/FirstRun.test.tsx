/**
 * The phone card (ADR 0170) where no phone could use its QR: a server that answers this computer
 * alone, with no relay, says so and draws no code, and offers an owner the relay (ADR 0247).
 */

import type { Store } from "@chipschat/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { letYourWifiIn, ONLY_THIS_COMPUTER, PhoneOffer } from "./FirstRun.tsx";
import { OpenRelay } from "./you/openRelay.ts";

const store = { devices: async () => [] } as unknown as Store;
const code = (serverUrl: string, relay?: string) => async () => ({
  code: "QRS-789",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  serverUrl,
  relay,
});

describe("the phone card", () => {
  it("says a server on this computer alone can't be reached, and draws no QR", async () => {
    render(
      <PhoneOffer
        store={store}
        issue={code("http://127.0.0.1:4450")}
        serverUrl="http://127.0.0.1:4450"
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText(ONLY_THIS_COMPUTER)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    // No QR, so nothing to scan; the Wi-Fi way stands alone where no relay is offered.
    expect(screen.queryByText(/Scan it/)).toBeNull();
    expect(screen.getByText(letYourWifiIn(false))).toBeTruthy();
    expect(screen.queryByTestId("phone-offer-turn-on-relay")).toBeNull();
  });

  it("offers an owner the relay there, with the Wi-Fi as the other way", async () => {
    const openRelay = vi.fn();
    render(
      <OpenRelay.Provider value={openRelay}>
        <PhoneOffer
          store={store}
          issue={code("http://127.0.0.1:4450")}
          serverUrl="http://127.0.0.1:4450"
          owner
          onClose={() => {}}
        />
      </OpenRelay.Provider>,
    );
    const turnOn = await screen.findByTestId("phone-offer-turn-on-relay");
    expect(turnOn.textContent).toBe("Turn on the relay");
    expect(screen.getByText("Or run chips up --reach lan to let your Wi-Fi in.")).toBeTruthy();
    fireEvent.click(turnOn);
    expect(openRelay).toHaveBeenCalledTimes(1);
  });

  it("makes a code again once the relay is on, which reaches this computer from anywhere", async () => {
    let relay: string | undefined;
    const issue = vi.fn(() => code("http://127.0.0.1:4450", relay)());
    const shown = (on: string | undefined) => (
      <OpenRelay.Provider value={() => {}}>
        <PhoneOffer
          store={store}
          issue={issue}
          serverUrl="http://127.0.0.1:4450"
          relay={on}
          owner
          onClose={() => {}}
        />
      </OpenRelay.Provider>
    );
    const { rerender } = render(shown(undefined));
    await screen.findByText(ONLY_THIS_COMPUTER);
    relay = "wss://relay.example";
    rerender(shown(relay));
    const qr = await screen.findByRole("img");
    expect(qr.dataset["link"]).toContain("relay=wss%3A%2F%2Frelay.example");
    expect(issue).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(ONLY_THIS_COMPUTER)).toBeNull();
    expect(screen.queryByTestId("phone-offer-turn-on-relay")).toBeNull();
    expect(screen.getByText(/reaches this computer from anywhere/)).toBeTruthy();
  });

  it("draws the QR for a server on this computer that has a relay", async () => {
    render(
      <PhoneOffer
        store={store}
        issue={code("http://127.0.0.1:4450", "wss://relay.example")}
        serverUrl="http://127.0.0.1:4450"
        onClose={() => {}}
      />,
    );
    const qr = await screen.findByRole("img");
    expect(qr.dataset["link"]).toMatch(/^chips:\/\/pair\?pair=QRS-789/);
  });
});
