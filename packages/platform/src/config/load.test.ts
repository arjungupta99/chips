import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../result/index.js";
import { ConfigError, ENVIRONMENT_BINDINGS, loadConfig } from "./load.js";
import { CHIPS_PUSH_RELAY, defaultConfig, EXPO_PUSH, pushUrlOf } from "./schema.js";

/** Narrow a result to its value, failing the test loudly if it is an error. */
function value(result: ReturnType<typeof loadConfig>) {
  if (!isOk(result)) throw result.error;
  return result.value;
}

describe("defaults", () => {
  it("carries the numbers the plan fixes", () => {
    const config = defaultConfig();
    expect(config.mode).toBe("solo");
    expect(config.devMode).toBe(false);
    expect(config.server.port).toBe(4431);
    expect(config.realtime.heartbeatSeconds).toBe(20);
    expect(config.realtime.idleTimeoutSeconds).toBe(60);
    expect(config.realtime.maxUnackedFrames).toBe(1000);
    expect(config.limits.signedUrlTtlSeconds).toBe(600);
  });

  it("loads with no file and no environment", () => {
    expect(value(loadConfig({ environment: {} }))).toEqual(defaultConfig());
  });

  it("pushes through Chips's push relay without Expo's token, and to Expo with it (ADR 0246)", () => {
    expect(pushUrlOf(defaultConfig().push)).toBe(CHIPS_PUSH_RELAY);
    expect(pushUrlOf({ accessToken: "token" })).toBe(EXPO_PUSH);
    // Pointed anywhere, it goes there, token or none.
    expect(pushUrlOf({ url: "https://push.example/send" })).toBe("https://push.example/send");
    expect(pushUrlOf({ url: EXPO_PUSH })).toBe(EXPO_PUSH);
  });
});

describe("precedence", () => {
  it("lets a file override a default", () => {
    const config = value(loadConfig({ file: { server: { port: 8080 } }, environment: {} }));
    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe("127.0.0.1");
  });

  it("lets the environment override a file", () => {
    const config = value(
      loadConfig({ file: { server: { port: 8080 } }, environment: { CHIPS_PORT: "9090" } }),
    );
    expect(config.server.port).toBe(9090);
  });

  it("merges sibling settings instead of replacing the branch", () => {
    const config = value(
      loadConfig({
        file: { realtime: { heartbeatSeconds: 5 } },
        environment: { CHIPS_MAX_UNACKED_FRAMES: "250" },
      }),
    );
    expect(config.realtime.heartbeatSeconds).toBe(5);
    expect(config.realtime.maxUnackedFrames).toBe(250);
    expect(config.realtime.idleTimeoutSeconds).toBe(60);
  });

  it("ignores an empty environment variable rather than treating it as a value", () => {
    const config = value(loadConfig({ environment: { CHIPS_HOST: "" } }));
    expect(config.server.host).toBe("127.0.0.1");
  });

  it("ignores a file that is not an object", () => {
    for (const file of ["nonsense", 42, null, [1, 2]]) {
      expect(value(loadConfig({ file, environment: {} }))).toEqual(defaultConfig());
    }
  });
});

/** A valid value for every bound variable, used to prove each binding reaches its setting. */
const SAMPLE_ENVIRONMENT: Readonly<Record<string, string>> = {
  CHIPS_MODE: "team",
  CHIPS_DEV_MODE: "true",
  CHIPS_HOST: "0.0.0.0",
  CHIPS_PORT: "1234",
  CHIPS_PUBLIC_URL: "https://chips.example",
  CHIPS_WEB_DIR: "/opt/chips/web",
  CHIPS_DATA_DIR: "/var/chips",
  CHIPS_DATABASE_URL: "sqlite:/var/chips/chips.db",
  CHIPS_LOG_LEVEL: "debug",
  CHIPS_LOG_PRETTY: "true",
  CHIPS_HEARTBEAT_SECONDS: "10",
  CHIPS_IDLE_TIMEOUT_SECONDS: "30",
  CHIPS_MAX_UNACKED_FRAMES: "10",
  CHIPS_SWEEP_SECONDS: "7",
  CHIPS_ATTACHMENT_SECRET: "sixteen-character-secret",
  CHIPS_FFMPEG: "/opt/ffmpeg/bin/ffmpeg",
  CHIPS_FFPROBE: "/opt/ffmpeg/bin/ffprobe",
  CHIPS_WHISPER: "/opt/whisper/bin/whisper-cli",
  CHIPS_WHISPER_MODEL: "/opt/whisper/ggml-small.bin",
  CHIPS_PASSKEY_ORIGINS: "https://chips.example, https://app.chips.example",
  CHIPS_RELAY_URL: "wss://relay.chips.example",
  CHIPS_RELAY_HOST: "0.0.0.0",
  CHIPS_RELAY_PORT: "4441",
  CHIPS_RELAY_MAX_SESSIONS_PER_SERVER: "5",
  CHIPS_RELAY_ALLOW_KEYS: `${"A".repeat(43)}, ${"b".repeat(43)}`,
  CHIPS_RELAY_COUNTS_FILE: "/var/lib/chips-relay/counts.jsonl",
  CHIPS_PUSH_URL: "https://push.chips.example/send",
  CHIPS_CONNECTORS: "https://docs.chips.example/connectors.json",
  CHIPS_PUSH_ACCESS_TOKEN: "expo-access-token",
  CHIPS_MAX_MESSAGE_BYTES: "1024",
  CHIPS_MAX_ATTACHMENT_BYTES: "2048",
  CHIPS_MAX_PROJECT_BYTES: "8192",
  CHIPS_MAX_BODY_BYTES: "4096",
  CHIPS_MAX_PENDING_APPROVALS_PER_HARNESS: "3",
  CHIPS_SIGNED_URL_TTL_SECONDS: "60",
};

describe("environment bindings", () => {
  it("names each variable once", () => {
    const names = ENVIRONMENT_BINDINGS.map(([variable]) => variable);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a sample for every binding and no orphan samples", () => {
    expect(Object.keys(SAMPLE_ENVIRONMENT).sort()).toEqual(
      ENVIRONMENT_BINDINGS.map(([name]) => name).sort(),
    );
  });

  it.each(ENVIRONMENT_BINDINGS)("%s reaches the setting it names", (variable, path) => {
    const sample = SAMPLE_ENVIRONMENT[variable];
    expect(sample, `no sample value for ${variable}`).toBeDefined();

    const config = value(loadConfig({ environment: { [variable]: sample as string } }));
    const before = at(defaultConfig(), path);
    const after = at(config, path);

    expect(after, `${variable} did not reach ${path.join(".")}`).not.toEqual(before);
    expect(after).not.toBeUndefined();
  });

  it("reads every bound variable at once", () => {
    const config = value(loadConfig({ environment: SAMPLE_ENVIRONMENT }));
    expect(config).toEqual({
      mode: "team",
      devMode: true,
      server: {
        host: "0.0.0.0",
        port: 1234,
        publicUrl: "https://chips.example",
        webDir: "/opt/chips/web",
        connectors: "https://docs.chips.example/connectors.json",
      },
      data: { dir: "/var/chips", databaseUrl: "sqlite:/var/chips/chips.db" },
      log: { level: "debug", pretty: true },
      realtime: {
        heartbeatSeconds: 10,
        idleTimeoutSeconds: 30,
        maxUnackedFrames: 10,
        sweepSeconds: 7,
      },
      attachments: {
        secret: "sixteen-character-secret",
        slotTtlSeconds: 900,
        thumbnailEdge: 512,
        viewEdge: 2048,
      },
      media: {
        ffmpegPath: "/opt/ffmpeg/bin/ffmpeg",
        ffprobePath: "/opt/ffmpeg/bin/ffprobe",
        whisperPath: "/opt/whisper/bin/whisper-cli",
        whisperModel: "/opt/whisper/ggml-small.bin",
      },
      auth: { passkeyOrigins: ["https://chips.example", "https://app.chips.example"] },
      relay: {
        url: "wss://relay.chips.example",
        host: "0.0.0.0",
        port: 4441,
        maxSessionsPerServer: 5,
        allowKeys: ["A".repeat(43), "b".repeat(43)],
        countsFile: "/var/lib/chips-relay/counts.jsonl",
      },
      push: {
        url: "https://push.chips.example/send",
        accessToken: "expo-access-token",
      },
      limits: {
        maxMessageBytes: 1024,
        maxAttachmentBytes: 2048,
        maxProjectBytes: 8192,
        maxBodyBytes: 4096,
        maxPendingApprovalsPerHarness: 3,
        signedUrlTtlSeconds: 60,
      },
    });
  });
});

describe("booleans from the environment", () => {
  // `Boolean("false")` is `true`. The typed configuration exists so that this class of mistake
  // cannot reach a running server; CHIPS_DEV_MODE=false writing a demo token to disk was it.
  it.each(["false", "0", "no", "off", "FALSE", "Off"])("reads %s as false", (spelling) => {
    const config = value(
      loadConfig({ environment: { CHIPS_DEV_MODE: spelling, CHIPS_LOG_PRETTY: spelling } }),
    );
    expect(config.devMode).toBe(false);
    expect(config.log.pretty).toBe(false);
  });

  it.each(["true", "1", "yes", "on", "TRUE", "On"])("reads %s as true", (spelling) => {
    const config = value(
      loadConfig({ environment: { CHIPS_DEV_MODE: spelling, CHIPS_LOG_PRETTY: spelling } }),
    );
    expect(config.devMode).toBe(true);
    expect(config.log.pretty).toBe(true);
  });

  it("takes a real boolean from a file", () => {
    const config = value(loadConfig({ file: { devMode: true, log: { pretty: false } } }));
    expect(config.devMode).toBe(true);
    expect(config.log.pretty).toBe(false);
  });

  it("refuses a spelling it cannot read, naming the variable", () => {
    const result = loadConfig({ environment: { CHIPS_DEV_MODE: "maybe" } });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.issues[0]?.path).toBe("devMode");
      expect(result.error.issues[0]?.source).toBe("CHIPS_DEV_MODE");
    }
  });
});

describe("failure", () => {
  it("returns an error rather than throwing", () => {
    const result = loadConfig({ environment: { CHIPS_PORT: "70000" } });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.issues[0]?.path).toBe("server.port");
      expect(result.error.issues[0]?.source).toBe("CHIPS_PORT");
    }
  });

  it("reports every problem at once", () => {
    const result = loadConfig({
      environment: { CHIPS_PORT: "0", CHIPS_LOG_LEVEL: "chatty", CHIPS_MODE: "hybrid" },
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.issues.map((i) => i.path).sort()).toEqual([
        "log.level",
        "mode",
        "server.port",
      ]);
      expect(result.error.message).toContain("server.port");
    }
  });

  it("leaves the source unset when a file, not the environment, is at fault", () => {
    const result = loadConfig({ file: { server: { port: -1 } }, environment: {} });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.issues[0]?.source).toBeUndefined();
  });

  it("takes a relay elsewhere over wss:// only, and ws:// to this machine (SEC-27)", () => {
    for (const url of ["ws://localhost:4440", "ws://[::1]:4440", "wss://relay.example"]) {
      expect(value(loadConfig({ environment: { CHIPS_RELAY_URL: url } })).relay.url, url).toBe(url);
    }
    const plain = loadConfig({ environment: { CHIPS_RELAY_URL: "ws://relay.example:4440" } });
    expect(plain.ok).toBe(false);
    if (!plain.ok) {
      expect(plain.error.issues[0]?.source).toBe("CHIPS_RELAY_URL");
      expect(plain.error.issues[0]?.message).toContain("wss://");
    }
  });

  it("takes a relay address only as a WebSocket address", () => {
    expect(
      value(loadConfig({ environment: { CHIPS_RELAY_URL: "ws://127.0.0.1:4440" } })).relay.url,
    ).toBe("ws://127.0.0.1:4440");
    const result = loadConfig({ environment: { CHIPS_RELAY_URL: "https://relay.example" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]?.source).toBe("CHIPS_RELAY_URL");
    expect(defaultConfig().relay).toEqual({
      host: "127.0.0.1",
      port: 4440,
      maxSessionsPerServer: 32,
    });
  });

  it("takes a relay's list only as servers' keys, and no list as any server", () => {
    expect(defaultConfig().relay.allowKeys).toBeUndefined();
    const key = "x".repeat(43);
    expect(
      value(loadConfig({ environment: { CHIPS_RELAY_ALLOW_KEYS: ` ${key} ,` } })).relay.allowKeys,
    ).toEqual([key]);
    for (const wrong of ["not-a-key", `${key}, short`, ","]) {
      const result = loadConfig({ environment: { CHIPS_RELAY_ALLOW_KEYS: wrong } });
      expect(result.ok, wrong).toBe(false);
      if (!result.ok) expect(result.error.issues[0]?.source).toBe("CHIPS_RELAY_ALLOW_KEYS");
    }
  });

  it("rejects a public URL that is not a URL", () => {
    expect(isErr(loadConfig({ environment: { CHIPS_PUBLIC_URL: "not a url" } }))).toBe(true);
  });
});

describe("loading, as a property", () => {
  it("accepts any port in range and rejects any port outside it", () => {
    fc.assert(
      fc.property(fc.integer({ min: -5000, max: 100_000 }), (port) => {
        const result = loadConfig({ environment: { CHIPS_PORT: String(port) } });
        expect(isOk(result)).toBe(port >= 1 && port <= 65_535);
      }),
    );
  });

  it("is unchanged by variables it does not bind", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1 }).filter((k) => !k.startsWith("CHIPS_")),
          fc.string(),
        ),
        (environment) => {
          expect(value(loadConfig({ environment }))).toEqual(defaultConfig());
        },
      ),
    );
  });
});

/** Read a nested setting by path, for comparing a config against the defaults. */
function at(config: unknown, path: readonly string[]): unknown {
  let node: unknown = config;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}
