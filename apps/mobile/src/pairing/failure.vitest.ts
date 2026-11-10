import { PairingError } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { pairingFailure } from "./failure";

describe("what a failed pairing says", () => {
  it("passes the server's sentence through", () => {
    expect(pairingFailure(new PairingError("That pairing code is not valid."))).toBe(
      "That pairing code is not valid.",
    );
  });

  it("names the phone's own failure rather than blaming the code", () => {
    expect(pairingFailure(new TypeError("Network request failed"))).toBe(
      "That did not work: Network request failed. Try a fresh code.",
    );
    expect(pairingFailure("crypto.subtle is undefined.")).toBe(
      "That did not work: crypto.subtle is undefined. Try a fresh code.",
    );
  });

  it("still says something for an error with nothing in it", () => {
    expect(pairingFailure(new Error(""))).toBe(
      "That did not work: no reason given. Try a fresh code.",
    );
    expect(pairingFailure(undefined)).toBe("That did not work: no reason given. Try a fresh code.");
  });

  it("says to be on the computer's Wi-Fi, then where Local Network is allowed, when a home address didn't answer", () => {
    const local =
      "This phone has to be on the same Wi-Fi as that computer, unless Chips there uses the relay. On the same Wi-Fi? If you said no to Local Network, allow it in Settings → Privacy & Security → Local Network → Chips, then try a fresh code.";
    const failed = new TypeError("Network request failed");
    for (const lan of [
      "http://192.168.1.20:4431",
      "http://10.0.0.5:4431",
      "http://172.20.1.2:4431",
      "http://my-mac.local:4431",
    ]) {
      expect(pairingFailure(failed, { lan })).toBe(
        `That did not work: Network request failed. ${local}`,
      );
    }
  });

  it("leaves Local Network out for a relay, a public address, or the server's own sentence", () => {
    const failed = new TypeError("Network request failed");
    const plain = "That did not work: Network request failed. Try a fresh code.";
    expect(
      pairingFailure(failed, {
        lan: "http://192.168.1.20:4431",
        relayUrl: "https://relay.example",
      }),
    ).toBe(plain);
    expect(pairingFailure(failed, { lan: "https://chips.example.com" })).toBe(plain);
    expect(pairingFailure(failed, { lan: "http://172.40.1.2:4431" })).toBe(plain);
    expect(
      pairingFailure(new PairingError("That pairing code is not valid."), {
        lan: "http://192.168.1.20:4431",
      }),
    ).toBe("That pairing code is not valid.");
  });
});
