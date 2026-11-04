/**
 * A device whose clock is out is told so (the stranger review, 4 November 2026): `clock_skew`,
 * which the apps set their clock by, where it used to hear what an unknown device hears and say
 * it had been removed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

/** A read of the devices, signed by Arjun's phone with its clock `minutes` behind. */
function behind(minutes: number) {
  const signed = ws.arjun.sign("GET", "/v1/devices", "");
  const at = Number(signed["x-chips-timestamp"]) - minutes * 60 * 1000;
  return ws.gateway.app.fetch(
    new Request("http://chips.local/v1/devices", {
      headers: { ...signed, "x-chips-timestamp": String(at) },
    }),
  );
}

describe("a device's clock", () => {
  it("more than five minutes out is refused as clock_skew, not as an unknown device", async () => {
    const refused = await behind(10);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({
      error: { code: "unauthorized", refusal: "clock_skew" },
    });
  });

  it("a minute out is no reason to refuse it", async () => {
    // The timestamp moved under the signature, so the signature no longer holds: refused, but
    // as a credential that isn't good, never as a clock.
    const refused = await behind(1);
    expect(refused.status).toBe(401);
    expect(((await refused.json()) as { error: { refusal?: string } }).error.refusal).toBe(
      undefined,
    );
  });
});
