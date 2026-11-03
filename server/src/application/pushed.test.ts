/** A batch of pushes is said as it went (ADR 0244): reached, not reached, and why. */

import { createLogger } from "@chipschat/platform";
import { describe, expect, it, vi } from "vitest";
import { sayPushed } from "./pushed.js";

function said() {
  const silent = createLogger({ level: "silent" });
  const info = vi.fn();
  const warn = vi.fn();
  return { logger: { ...silent, info, warn } as unknown as typeof silent, info, warn };
}

describe("sayPushed", () => {
  it("says only that it was pushed when every phone was reached", () => {
    const log = said();
    sayPushed(log.logger, [{ ok: true }, { ok: true }], "a join request", { join_request_id: "j" });
    expect(log.info).toHaveBeenCalledWith(
      { event: "push.sent", join_request_id: "j", phones: 2 },
      "a join request was pushed",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("says why the first one missed, the service's error before its words", () => {
    const log = said();
    sayPushed(
      log.logger,
      [
        { ok: false, error: "MessageRateExceeded", message: "too many" },
        { ok: false, message: "unreachable" },
      ],
      "a message",
      {},
    );
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      { event: "push.not_sent", phones: 2, why: "MessageRateExceeded" },
      "a message could not be pushed",
    );
  });

  it("says unknown when the push service gave no reason", () => {
    const log = said();
    sayPushed(log.logger, [{ ok: false }], "a decision", {});
    expect(log.warn.mock.calls[0]?.[0]).toMatchObject({ why: "unknown" });
  });
});
