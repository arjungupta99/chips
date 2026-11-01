import { riskClass } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { RISK, riskLabel } from "./risk.js";

describe("the risk classes", () => {
  it("has a word for every class the protocol knows, and no other", () => {
    expect(Object.keys(RISK).sort()).toEqual([...riskClass.options].sort());
  });

  it("reads like a person wrote it", () => {
    expect(riskLabel("irreversible")).toBe("Not reversible");
    expect(riskLabel("external_communication")).toBe("External message");
    expect(RISK.financial.hot).toBe(true);
    expect(RISK.legal.hot).toBe(false);
  });
});
