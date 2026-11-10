/**
 * The phone card (ADR 0170) where no phone could use its QR: a server that answers this computer
 * alone, with no relay, says so and draws no code, and offers an owner the relay (ADR 0247).
 */

import type { RelayState, ServerFacts, Store } from "@chipschat/core";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { letYourWifiIn, ONLY_THIS_COMPUTER, PhoneOffer } from "./FirstRun.tsx";
import { useServerFacts } from "./firstRun.ts";
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

  it("offers an owner the relay there, asks, then turns it on (the onboarding audit, item 35)", async () => {
    const setRelay = vi.fn(async () => ({}));
    const owned = { devices: async () => [], setRelay } as unknown as Store;
    render(
      <PhoneOffer
        store={owned}
        issue={code("http://127.0.0.1:4450")}
        serverUrl="http://127.0.0.1:4450"
        owner
        machine="Arjun's Mac mini"
        onClose={() => {}}
      />,
    );
    const turnOn = await screen.findByTestId("phone-offer-turn-on-relay");
    expect(turnOn.textContent).toBe("Turn on the relay");
    expect(screen.getByText("Or run chips up --reach lan to let your Wi-Fi in.")).toBeTruthy();
    fireEvent.click(turnOn);
    expect(setRelay).not.toHaveBeenCalled();
    expect(screen.getByTestId("phone-offer-relay-ask").textContent).toContain(
      "devices that can't reach Arjun's Mac mini directly, so your phone reaches Chips from anywhere",
    );
    fireEvent.click(screen.getByTestId("phone-offer-relay-cancel"));
    expect(screen.queryByTestId("phone-offer-relay-ask")).toBeNull();

    fireEvent.click(screen.getByTestId("phone-offer-turn-on-relay"));
    await act(async () => fireEvent.click(screen.getByTestId("phone-offer-relay-yes")));
    expect(setRelay).toHaveBeenCalledWith(true);
  });

  it("says why when the relay couldn't be turned on, and can try again", async () => {
    const setRelay = vi.fn(async () => {
      throw new Error("The relay turned the server away.");
    });
    const owned = { devices: async () => [], setRelay } as unknown as Store;
    render(
      <PhoneOffer
        store={owned}
        issue={code("http://127.0.0.1:4450")}
        serverUrl="http://127.0.0.1:4450"
        owner
        onClose={() => {}}
      />,
    );
    fireEvent.click(await screen.findByTestId("phone-offer-turn-on-relay"));
    await act(async () => fireEvent.click(screen.getByTestId("phone-offer-relay-yes")));
    expect(screen.getByRole("alert").textContent).toBe("The relay turned the server away.");
    expect((screen.getByTestId("phone-offer-relay-yes") as HTMLButtonElement).disabled).toBe(false);
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
    expect(qr.dataset["link"]).toMatch(/^https:\/\/chipschat\.ai\/p#pair=QRS-789/);
  });
});

describe("the setup card's read of the server", () => {
  it("reads again once an owner turns the relay, when the server has done it (ADR 0245)", async () => {
    vi.useFakeTimers();
    try {
      let relay: ServerFacts["relay"] = { url: "wss://relay.example", status: "connected" };
      const reads: number[] = [];
      const store = {
        serverFacts: async (): Promise<ServerFacts> => {
          reads.push(Date.now());
          return { machine: "Arjun's Mac mini", version: "1.0.0", publicUrl: "", relay };
        },
      } as unknown as Store;
      const { result, rerender } = renderHook(
        ({ turned }: { turned: RelayState | undefined }) => useServerFacts(store, turned),
        { initialProps: { turned: undefined as RelayState | undefined } },
      );
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(reads).toHaveLength(1);
      // Switched off: the server lets the relay go two seconds later, so it is read after three.
      relay = { url: undefined, status: "off" };
      rerender({ turned: { on: false, by: "per_a", at: new Date().toISOString() } });
      await act(() => vi.advanceTimersByTimeAsync(2900));
      expect(reads).toHaveLength(1);
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(reads).toHaveLength(2);
      expect(result.current?.relay.status).toBe("off");
    } finally {
      vi.useRealTimers();
    }
  });
});
