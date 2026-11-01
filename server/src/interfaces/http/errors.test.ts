/**
 * What the log says about a request that threw (findings AM-2 and T-13). A refusal is the server
 * doing its job, so it is one line at `info` naming the rule, with no stack; only a fault is an
 * `error`, with the whole error. A person refused for asking while a harness is away must not
 * look, in 4431's log, like a crash.
 */

import { createLogger } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import { AppendRefused } from "../../application/ports/index.js";
import { createTestWorkspace } from "../../testing/workspace.js";
import { HttpError, logThrown } from "./errors.js";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    level: "debug",
    destination: { write: (line: string) => void lines.push(JSON.parse(line)) },
  });
  return { lines, logger };
}

describe("a request that threw, in the log", () => {
  it("is a refusal at info, naming the rule, with no stack", () => {
    const { lines, logger } = capture();
    logThrown(
      logger,
      new HttpError(
        "invalid_event",
        "Lathe is away, so Chips can't change it now.",
        undefined,
        undefined,
        "harness_away",
      ),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      msg: "request refused",
      status: 422,
      code: "invalid_event",
      refusal: "harness_away",
      answer: "Lathe is away, so Chips can't change it now.",
    });
    expect(JSON.stringify(lines[0])).not.toContain("stack");
  });

  it("is a refusal when the store refuses a write, as the envelope words it", () => {
    const { lines, logger } = capture();
    logThrown(logger, new AppendRefused({ kind: "agent_elsewhere", message: "it is in Kiln" }));
    expect(lines[0]).toMatchObject({
      level: "info",
      msg: "request refused",
      status: 403,
      code: "forbidden",
      answer: "It is in Kiln.",
    });
  });

  it("is a failure at error, with its stack, when nothing recognises it", () => {
    const { lines, logger } = capture();
    logThrown(logger, new TypeError("cannot read properties of undefined"));
    expect(lines[0]).toMatchObject({ level: "error", msg: "request failed" });
    expect(JSON.stringify(lines[0])).toContain("cannot read properties of undefined");
    expect(JSON.stringify(lines[0])).toContain("stack");
  });

  it("is a failure when a route says it is one of ours", () => {
    const { lines, logger } = capture();
    logThrown(logger, new HttpError("internal", "Something went wrong on our side."));
    expect(lines[0]).toMatchObject({ level: "error", msg: "request failed" });
  });

  it("is written so by the server: a refused request logs no error", async () => {
    const { lines, logger } = capture();
    const ws = await createTestWorkspace({ logger });
    try {
      const response = await ws.gateway.app.fetch(new Request("http://chips.local/v1/agents"));
      expect(response.status).toBe(401);
      expect(lines.filter((line) => line["level"] === "error")).toEqual([]);
      expect(lines).toContainEqual(
        expect.objectContaining({ level: "warn", msg: "authentication refused" }),
      );
      expect(lines).toContainEqual(
        expect.objectContaining({ level: "info", msg: "request refused", status: 401 }),
      );
    } finally {
      await ws.close();
    }
  });
});
