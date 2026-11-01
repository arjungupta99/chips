import { describe, expect, it } from "vitest";
import { loadConfig } from "./load.js";
import { databaseUrlIn, platformDataDir, platformLogDir } from "./places.js";

const value = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error("expected a config");
  return result.value;
};

describe("where an installed Chips keeps things", () => {
  it("is Application Support and Logs on a Mac", () => {
    const mac = { platform: "darwin", home: "/Users/ada", environment: {} };
    expect(platformDataDir(mac)).toBe("/Users/ada/Library/Application Support/Chips");
    expect(platformLogDir(mac)).toBe("/Users/ada/Library/Logs/Chips");
  });

  it("is the XDG places on Linux, or their defaults", () => {
    const bare = { platform: "linux", home: "/home/ada", environment: {} };
    expect(platformDataDir(bare)).toBe("/home/ada/.local/share/chips");
    expect(platformLogDir(bare)).toBe("/home/ada/.local/state/chips");
    const xdg = {
      ...bare,
      environment: { XDG_DATA_HOME: "/data", XDG_STATE_HOME: "/state" },
    };
    expect(platformDataDir(xdg)).toBe("/data/chips");
    expect(platformLogDir(xdg)).toBe("/state/chips");
  });

  it("ignores an XDG variable that is set but empty", () => {
    const empty = { platform: "linux", home: "/home/ada", environment: { XDG_DATA_HOME: "" } };
    expect(platformDataDir(empty)).toBe("/home/ada/.local/share/chips");
  });
});

describe("a data directory without a database", () => {
  it("holds the database", () => {
    const config = value(loadConfig({ environment: { CHIPS_DATA_DIR: "/var/chips" } }));
    expect(config.data.databaseUrl).toBe(databaseUrlIn("/var/chips"));
    expect(config.data.databaseUrl).toBe("sqlite:/var/chips/chips.db");
  });

  it("from a file as well as the environment", () => {
    const config = value(loadConfig({ file: { data: { dir: "/srv/chips" } }, environment: {} }));
    expect(config.data.databaseUrl).toBe("sqlite:/srv/chips/chips.db");
  });

  it("leaves a database that was named where it was named", () => {
    const config = value(
      loadConfig({
        environment: { CHIPS_DATA_DIR: "/var/chips", CHIPS_DATABASE_URL: "sqlite:/elsewhere.db" },
      }),
    );
    expect(config.data.databaseUrl).toBe("sqlite:/elsewhere.db");
  });

  it("lets the environment's database win over a file's directory", () => {
    const config = value(
      loadConfig({
        file: { data: { dir: "/srv/chips" } },
        environment: { CHIPS_DATABASE_URL: "sqlite:/env.db" },
      }),
    );
    expect(config.data.databaseUrl).toBe("sqlite:/env.db");
  });

  it("changes nothing when neither is set", () => {
    const config = value(loadConfig({ environment: {} }));
    expect(config.data.dir).toBe("./.chips");
    expect(config.data.databaseUrl).toBe("sqlite:./.chips/chips.db");
  });
});
