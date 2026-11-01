import { describe, expect, it } from "vitest";
import { createLogger, fileDestination, withContext } from "./logger.js";

/** Collects the JSON lines a logger writes, so a test can read them back. */
function collector() {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    stream: {
      write(chunk: string) {
        lines.push(JSON.parse(chunk) as Record<string, unknown>);
      },
    },
  };
}

describe("createLogger", () => {
  it("writes one JSON object per line", () => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info("hello");
    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]).toMatchObject({ level: "info", msg: "hello" });
  });

  it("stamps the level as a name, not a number", () => {
    const sink = collector();
    createLogger({ level: "warn", destination: sink.stream }).warn("careful");
    expect(sink.lines[0]?.["level"]).toBe("warn");
  });

  it("timestamps in ISO 8601", () => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info("hello");
    expect(String(sink.lines[0]?.["time"])).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  it("names the component when asked", () => {
    const sink = collector();
    createLogger({ name: "chipsd", destination: sink.stream }).info("up");
    expect(sink.lines[0]?.["name"]).toBe("chipsd");
  });

  it("adds base fields to every line", () => {
    const sink = collector();
    const logger = createLogger({ base: { version: "0.0.0" }, destination: sink.stream });
    logger.info("one");
    logger.info("two");
    expect(sink.lines.map((l) => l["version"])).toEqual(["0.0.0", "0.0.0"]);
  });

  it("honours the level it was given", () => {
    const sink = collector();
    const logger = createLogger({ level: "error", destination: sink.stream });
    logger.info("quiet");
    logger.error("loud");
    expect(sink.lines.map((l) => l["msg"])).toEqual(["loud"]);
  });

  it("builds a pretty logger without a destination", () => {
    expect(() => createLogger({ pretty: true, level: "silent" })).not.toThrow();
  });
});

describe("redaction", () => {
  it.each([
    ["token", { token: "sk-secret" }],
    ["harness_token", { harness_token: "sk-secret" }],
    ["authorization", { authorization: "Bearer sk-secret" }],
    ["password", { password: "hunter2" }],
    ["secret", { secret: "sk-secret" }],
    ["signature", { signature: "sk-secret" }],
    ["sig", { sig: "sk-secret" }],
  ])("hides a top-level %s", (field, payload) => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info(payload, "request");
    expect(sink.lines[0]?.[field]).toBe("[redacted]");
    expect(JSON.stringify(sink.lines[0])).not.toContain("sk-secret");
  });

  it("hides a nested token", () => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info({ harness: { token: "sk-secret" } }, "connect");
    expect(JSON.stringify(sink.lines[0])).not.toContain("sk-secret");
  });

  it("hides a secret at any depth, in a list, and under a longer name (SEC-23)", () => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info(
      {
        request: {
          join: {
            device: {
              ticket: "sk-secret",
              pairing_code: "ABC-DEF",
              invite: "sk-secret",
              api_key: "sk-secret",
              public_key: "sk-secret",
              private_key: "sk-secret",
              keep: "shown",
            },
          },
        },
        devices: [
          { harness_token: "sk-secret", name: "iPad" },
          { "x-chips-signature": "sk-secret", "X-Chips-Operator-Token": "sk-secret" },
        ],
        relay_secret: "sk-secret",
        cookie: "sk-secret",
      },
      "deep",
    );
    const line = JSON.stringify(sink.lines[0]);
    expect(line).not.toContain("sk-secret");
    expect(line).not.toContain("ABC-DEF");
    expect(sink.lines[0]).toMatchObject({
      request: { join: { device: { ticket: "[redacted]", keep: "shown" } } },
      devices: [
        { harness_token: "[redacted]", name: "iPad" },
        { "x-chips-signature": "[redacted]", "X-Chips-Operator-Token": "[redacted]" },
      ],
    });
  });

  it("leaves the caller's object as it was, and a refusal's code in the line", () => {
    const sink = collector();
    const payload = { nested: { token: "sk-secret" }, code: "rate_limited", at: new Date(0) };
    createLogger({ destination: sink.stream }).info(payload, "refused");
    expect(payload.nested.token).toBe("sk-secret");
    expect(sink.lines[0]).toMatchObject({ code: "rate_limited", at: "1970-01-01T00:00:00.000Z" });
    expect(JSON.stringify(sink.lines[0])).not.toContain("sk-secret");
  });

  it("hides a secret a child logger was made with", () => {
    const sink = collector();
    createLogger({ destination: sink.stream })
      .child({ token: "sk-secret", runId: "run_1" })
      .info("step");
    expect(JSON.stringify(sink.lines[0])).not.toContain("sk-secret");
    expect(sink.lines[0]?.["runId"]).toBe("run_1");
  });

  it("hides an authorization header", () => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info(
      { req: { headers: { authorization: "Bearer sk-secret", "user-agent": "curl" } } },
      "request",
    );
    const line = JSON.stringify(sink.lines[0]);
    expect(line).not.toContain("sk-secret");
    expect(line).toContain("curl");
  });
});

describe("a signature in a URL", () => {
  const GRANT =
    "/v1/attachments/att_1?variant=play&dev=dev_1&exp=1800000600&sig=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("is dropped from a field, a message and an error, wherever the URL is", () => {
    const sink = collector();
    const logger = createLogger({ destination: sink.stream });
    logger.info({ url: `https://chips.example${GRANT}` }, "fetched");
    logger.warn(`could not fetch ${GRANT}`);
    logger.error({ err: new Error(`refused ${GRANT}&tok=tok_1`) }, "request failed");
    logger.info({ request: { target: GRANT } }, "tunnelled");
    expect(sink.lines).toHaveLength(4);
    for (const line of sink.lines) {
      const written = JSON.stringify(line);
      expect(written).not.toContain("0123456789abcdef");
      expect(written).toContain("sig=[redacted]");
      expect(written).toContain("dev=dev_1");
    }
  });

  it("drops a token, a ticket, an invite and a pairing code from a URL, and a join link's secret from its path (SEC-23)", () => {
    const sink = collector();
    const logger = createLogger({ destination: sink.stream });
    logger.info({ url: "ws://chips.local/v1/ws?token=chips_at_sksecret" }, "socket");
    logger.warn("could not open /v1/ws?ticket=tk_sksecret&x=1");
    logger.info({ link: "https://chips.example/#invite=inv_sksecret&relay=wss://r" }, "invite");
    logger.info({ link: "chips://pair?pair=ABC-DEF&v=1&code=ABC-DEF" }, "pair");
    logger.warn({ target: "/j/sksecretsksecretsksecret12?x=1" }, "tunnel rate limited");
    expect(sink.lines).toHaveLength(5);
    for (const line of sink.lines) {
      const written = JSON.stringify(line);
      expect(written).not.toContain("sksecret");
      expect(written).not.toContain("ABC-DEF");
    }
    expect(sink.lines[2]?.["link"]).toBe("https://chips.example/#invite=[redacted]&relay=wss://r");
    expect(sink.lines[4]?.["target"]).toBe("/j/…?x=1");
  });

  it("leaves words that only look like it alone", () => {
    const sink = collector();
    createLogger({ destination: sink.stream }).info(
      {
        note: "a signature is sig= in a query",
        said: "a token in the URL (?token=) is deprecated",
      },
      "ok",
    );
    expect(sink.lines[0]?.["note"]).toBe("a signature is sig= in a query");
    expect(sink.lines[0]?.["said"]).toBe("a token in the URL (?token=) is deprecated");
  });
});

describe("withContext", () => {
  it("stamps the ids a runbook follows", () => {
    const sink = collector();
    const logger = withContext(createLogger({ destination: sink.stream }), {
      requestId: "req_1",
      runId: "run_2",
      laneId: "lane_3",
      workspaceId: "ws_4",
    });
    logger.info("step");
    expect(sink.lines[0]).toMatchObject({
      requestId: "req_1",
      runId: "run_2",
      laneId: "lane_3",
      workspaceId: "ws_4",
    });
  });

  it("leaves out ids that were not supplied", () => {
    const sink = collector();
    withContext(createLogger({ destination: sink.stream }), { runId: "run_2" }).info("step");
    expect(sink.lines[0]).not.toHaveProperty("laneId");
  });

  it("drops empty ids rather than logging blanks", () => {
    const sink = collector();
    withContext(createLogger({ destination: sink.stream }), { runId: "", laneId: "lane_3" }).info(
      "step",
    );
    expect(sink.lines[0]).not.toHaveProperty("runId");
    expect(sink.lines[0]).toHaveProperty("laneId", "lane_3");
  });
});

describe("a log file", () => {
  it("is appended to, its directory made first", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(mkdtempSync(join(tmpdir(), "chips-log-")), "deep", "chips.log");
    const destination = fileDestination(path) as ReturnType<typeof fileDestination> & {
      once: (event: "ready", listener: () => void) => void;
      flushSync: () => void;
    };
    await new Promise<void>((resolve) => destination.once("ready", resolve));
    createLogger({ name: "chips", destination }).info({ token: "chips_at_secret" }, "first");
    destination.flushSync();
    const line = JSON.parse(readFileSync(path, "utf8").trim()) as Record<string, unknown>;
    expect(line["msg"]).toBe("first");
    expect(line["token"]).toBe("[redacted]");
  });

  it("is the owner's alone (SEC-35)", async () => {
    const { mkdtempSync, statSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(mkdtempSync(join(tmpdir(), "chips-log-")), "chips.log");
    const destination = fileDestination(path) as ReturnType<typeof fileDestination> & {
      once: (event: "ready", listener: () => void) => void;
    };
    await new Promise<void>((resolve) => destination.once("ready", resolve));
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
