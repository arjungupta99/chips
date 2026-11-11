/**
 * `join()` against a real chipsd (ADR 0122): by a link a person made, by a code a person allows,
 * the refusals a harness can read, and the key kept so the next run asks nothing.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { joinLink } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect } from "./connect.js";
import { filledIn, findServer, helloOnce, JoinError, join, keptJoin } from "./join.js";
import { type KeyStore, openKeyStore } from "./keep.js";
import { startTestServer, type TestServer } from "./testing/gateway.js";

let server: TestServer;
let home: string;

beforeEach(async () => {
  server = await startTestServer();
  home = mkdtempSync(joinPath(tmpdir(), "chips-join-"));
});
afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

/** A link Arjun makes in Chips, with what it may do. */
async function link(capabilities: readonly string[] = ["autonomy"]): Promise<string> {
  const made = await server.gateway.deps.joinRequests.makeLink({
    principal: server.person,
    capabilities,
    url: server.url,
  });
  if (!made.ok) throw new Error(made.error.message);
  return joinLink(made.value.request.url, made.value.secret);
}

/** A key store that is a map, and says what was kept. */
function memory(): KeyStore & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return {
    kind: "file",
    kept,
    get: (account) => kept.get(account),
    set: (account, secret) => {
      kept.set(account, secret);
    },
    remove: (account) => {
      kept.delete(account);
    },
  };
}

describe("join() with a link", () => {
  it("is allowed already: it collects the key, connects, and keeps it for the next run", async () => {
    const keep = memory();
    const me = await join({
      link: await link(["autonomy", "new_spaces"]),
      name: "Tide",
      keep,
      env: {},
    });
    expect(me).toMatchObject({ url: server.url, capabilities: ["autonomy", "new_spaces"] });
    expect(me.token).toMatch(/^chips_at_/);
    expect(me.spaceId).toMatch(/^spc_/);

    const chips = await connect({ ...me, client: { name: "tide", version: "0.0.0" } });
    try {
      expect(chips.harnessId).toBe(me.harnessId);
      expect(chips.hello.harnesses[0]?.display_name).toBe("Tide");
    } finally {
      chips.close();
    }

    // The next run asks nothing: the network is not touched.
    const again = await join({
      url: server.url,
      name: "Tide",
      keep,
      env: {},
      fetch: () => Promise.reject(new Error("asked again")),
    });
    expect(again).toEqual(me);
  });

  it("still hands back the key when nowhere will keep it, and says it needs a new link next time (audit Part 2, item 9)", async () => {
    const refusing: KeyStore = {
      kind: "file",
      get: () => undefined,
      set: () => {
        throw new Error(
          "EACCES: permission denied, open '/home/sam/.config/chips/harness-keys.json'",
        );
      },
      remove: () => undefined,
    };
    const said: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((line: string) => said.push(line) > 0) as typeof process.stderr.write;
    try {
      const me = await join({ link: await link(), name: "Tide", keep: refusing, env: {} });
      expect(me.token).toMatch(/^chips_at_/);
    } finally {
      process.stderr.write = write;
    }
    expect(said).toEqual([
      "Its key couldn't be kept here (EACCES: permission denied, open '/home/sam/.config/chips/harness-keys.json'). It works while this runs. Once it stops, it needs a new link from Chips.\n",
    ]);
  });

  it("takes up a new link over the key it kept, and keeps the new one", async () => {
    // The harness was removed, or Chips started afresh: the person makes a new link.
    const keep = memory();
    const first = await join({ link: await link(), name: "Tide", keep, env: {} });
    const second = await join({ link: await link(), name: "Tide", keep, env: {} });
    expect(second.harnessId).not.toBe(first.harnessId);
    const after = await join({
      url: server.url,
      name: "Tide",
      keep,
      env: {},
      fetch: () => Promise.reject(new Error("asked again")),
    });
    expect(after).toEqual(second);
  });

  it("run again with the link it was handed its key by, asks nothing", async () => {
    const keep = memory();
    const once = await link();
    const me = await join({ link: once, name: "Tide", keep, env: {} });
    const again = await join({
      link: once,
      name: "Tide",
      keep,
      env: {},
      fetch: () => Promise.reject(new Error("asked again")),
    });
    expect(again).toEqual(me);
  });

  it("gives the kept key back for a used link it holds no record of", async () => {
    // A key kept before links were noted beside it: the link is spent, and the key still stands.
    const keep = memory();
    const once = await link();
    const me = await join({ link: once, name: "Tide", keep, env: {} });
    const [account] = [...keep.kept.keys()];
    keep.kept.set(account ?? "", JSON.stringify(me));
    expect(await join({ link: once, name: "Tide", keep, env: {} })).toEqual(me);
  });

  it("is refused the second time, with the rule that says why", async () => {
    const once = await link();
    await join({ link: once, name: "Tide", keep: false, env: {} });
    const twice = join({ link: once, name: "Tide again", keep: false, env: {} });
    await expect(twice).rejects.toBeInstanceOf(JoinError);
    await expect(twice).rejects.toMatchObject({ refusal: "spent" });
  });
});

describe("join() where Chips can't be reached", () => {
  it("says so in one line, naming the address, rather than throwing what fetch threw", async () => {
    const unreachable = join({
      link: "http://127.0.0.1:9/j/chips_j_0123456789abcdefghijkl",
      name: "Tide",
      keep: false,
      env: {},
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(unreachable).rejects.toBeInstanceOf(JoinError);
    await expect(unreachable).rejects.toMatchObject({
      refusal: "unreachable",
      message: expect.stringMatching(
        /^Can't reach Chips at http:\/\/127\.0\.0\.1:9 from this computer\./,
      ),
    });
  });
});

describe("join() with a code", () => {
  it("shows the code, waits for a person, and is handed what they allowed", async () => {
    const shown: string[] = [];
    const me = await join({
      url: server.url,
      name: "Ledger",
      software: "ledger 2.1",
      wants: ["autonomy", "restarts"],
      keep: false,
      env: {},
      onCode: (code) => {
        shown.push(code);
        // Arjun compares the code and allows it, with restarts turned off.
        void (async () => {
          const waiting = await server.gateway.deps.joinRequests.list(server.person, ["waiting"]);
          const asking = waiting.ok ? waiting.value.find((each) => each.code === code) : undefined;
          if (asking === undefined) throw new Error("nothing waits");
          await server.gateway.deps.joinRequests.allow({
            principal: server.person,
            id: asking.id,
            capabilities: ["autonomy"],
          });
        })();
      },
    });
    expect(shown[0]).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(me.capabilities).toEqual(["autonomy"]);
  });
});

describe("finding the server", () => {
  it("takes the link, then the url, then CHIPS_URL, then what chips up wrote", () => {
    writeFileSync(joinPath(home, "server.json"), JSON.stringify({ url: "http://127.0.0.1:4450" }));
    const env = { CHIPS_CONFIG_HOME: home };
    expect(findServer({}, env).url).toBe("http://127.0.0.1:4450");
    expect(findServer({}, { ...env, CHIPS_URL: "http://10.0.0.2:4431/" }).url).toBe(
      "http://10.0.0.2:4431",
    );
    expect(findServer({ url: "http://a:1" }, { ...env, CHIPS_URL: "http://b:2" }).url).toBe(
      "http://a:1",
    );
    expect(findServer({ link: "http://c:3/j/chips_j_0123456789abcdefghijkl" }, env)).toEqual({
      url: "http://c:3",
      secret: "chips_j_0123456789abcdefghijkl",
    });
    expect(() => findServer({}, {})).toThrow(/Where is Chips/);
    expect(() => findServer({ link: "http://c:3/pair/x" }, {})).toThrow(JoinError);
  });
});

describe("the key a harness would join with, with no link", () => {
  it("is the one kept for its name at the server it would find, or says which server had none", () => {
    const keep = memory();
    const env = { CHIPS_CONFIG_HOME: home, CHIPS_URL: "https://chips.example.ts.net/" };
    keep.set(
      "harness:Hermes@https://chips.example.ts.net",
      JSON.stringify({
        url: "https://chips.example.ts.net",
        harnessId: "hrn_1",
        token: "chips_h_1",
        hello: "said",
      }),
    );
    expect(keptJoin("Hermes", { keep, env })).toEqual({
      url: "https://chips.example.ts.net",
      joined: {
        url: "https://chips.example.ts.net",
        harnessId: "hrn_1",
        token: "chips_h_1",
        capabilities: [],
      },
    });
    expect(keptJoin("OpenCode", { keep, env })).toEqual({ url: "https://chips.example.ts.net" });
    expect(keptJoin("Hermes", { keep, env: { CHIPS_CONFIG_HOME: home } })).toEqual({});
  });
});

/** One of this machine's own addresses that is not its loopback one, as its Wi-Fi's would be. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((each) => each !== undefined && each.family === "IPv4" && !each.internal)?.address;

describe("a server on this very machine (the onboarding audit, Part 2, item 2)", () => {
  it.skipIf(lanAddress === undefined)(
    "is joined, handed back and kept at its own address, not the network's, which changes",
    async () => {
      writeFileSync(joinPath(home, "server.json"), JSON.stringify({ url: server.url }));
      const port = new URL(server.url).port;
      const made = await server.gateway.deps.joinRequests.makeLink({
        principal: server.person,
        capabilities: ["autonomy"],
        url: `http://${lanAddress}:${port}`,
      });
      if (!made.ok) throw new Error(made.error.message);
      const keep = memory();
      const env = { CHIPS_CONFIG_HOME: home };
      const me = await join({
        link: joinLink(made.value.request.url, made.value.secret),
        name: "Tide",
        keep,
        env,
      });
      expect(me.url).toBe(server.url);
      expect([...keep.kept.keys()]).toEqual([`harness:Tide@${server.url}`]);
      // And `chips connect <id>` with no link finds it where chips up says the server is.
      expect(keptJoin("Tide", { keep, env }).joined?.token).toBe(me.token);
    },
  );

  it.skipIf(lanAddress === undefined)(
    "points a key kept at the machine's network address at its own address, and keeps it so",
    async () => {
      writeFileSync(
        joinPath(home, "server.json"),
        JSON.stringify({ url: "http://127.0.0.1:4450" }),
      );
      const old = `http://${lanAddress}:4450`;
      const keep = memory();
      keep.set(
        `harness:Hermes@${old}`,
        JSON.stringify({ url: old, harnessId: "hrn_1", token: "chips_h_1", hello: "said" }),
      );
      const env = { CHIPS_CONFIG_HOME: home };
      // `chips connect <id>` with no link: found under the old address, handed back at the new.
      expect(keptJoin("Hermes", { keep, env })).toMatchObject({
        url: "http://127.0.0.1:4450",
        joined: { url: "http://127.0.0.1:4450", harnessId: "hrn_1" },
      });
      // A kept bridge whose service still says the old address: the record now names the new one.
      expect(JSON.parse(keep.kept.get(`harness:Hermes@${old}`) ?? "{}")).toMatchObject({
        url: "http://127.0.0.1:4450",
        hello: "said",
      });
      const again = await join({
        name: "Hermes",
        keep,
        env: { ...env, CHIPS_URL: old },
        fetch: () => Promise.reject(new Error("asked again")),
      });
      expect(again.url).toBe("http://127.0.0.1:4450");
    },
  );

  it("leaves a server on another machine as it is", () => {
    writeFileSync(joinPath(home, "server.json"), JSON.stringify({ url: "http://127.0.0.1:4450" }));
    const env = { CHIPS_CONFIG_HOME: home };
    expect(
      findServer({ link: "http://192.0.2.7:4450/j/chips_j_0123456789abcdefghijkl" }, env),
    ).toEqual({
      url: "http://192.0.2.7:4450",
      secret: "chips_j_0123456789abcdefghijkl",
    });
  });
});

describe("where the key is kept, without a keychain", () => {
  it("is a file only its user can read, which goes when the last key does", () => {
    const store = openKeyStore({ CHIPS_NO_KEYCHAIN: "true", CHIPS_CONFIG_HOME: home });
    expect(store.kind).toBe("file");
    store.set("harness:Tide@http://x", "{}");
    const path = joinPath(home, "harness-keys.json");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ "harness:Tide@http://x": "{}" });
    store.remove("harness:Tide@http://x");
    expect(() => statSync(path)).toThrow();
  });
});

describe("a harness's first words in the room it joined", () => {
  it("are said once, then not again after a restart, and again for a new link's room", async () => {
    const keep = memory();
    const said: string[] = [];
    const say = async (spaceId: string) => {
      said.push(spaceId);
    };
    const me = await join({ link: await link(), name: "Tide", keep, env: {} });
    expect(await helloOnce(me, { name: "Tide", keep, env: {}, say })).toBe(true);
    // A restart: the same key, and nothing said.
    const again = await join({ url: server.url, name: "Tide", keep, env: {} });
    expect(again).toEqual(me);
    expect(await helloOnce(again, { name: "Tide", keep, env: {}, say })).toBe(false);
    // A new link, a new key and room: said again, there.
    const anew = await join({ link: await link(), name: "Tide", keep, env: {} });
    expect(await helloOnce(anew, { name: "Tide", keep, env: {}, say })).toBe(true);
    expect(said).toEqual([me.spaceId, anew.spaceId]);
  });

  it("are not said for a key kept from before they were due", async () => {
    // A harness that joined before first words were noted: its key, as join() used to keep it.
    const keep = memory();
    const me = await join({ link: await link(), name: "Tide", keep, env: {} });
    const [account] = [...keep.kept.keys()];
    keep.kept.set(account ?? "", JSON.stringify(me));
    const said: string[] = [];
    const say = async (spaceId: string) => {
      said.push(spaceId);
    };
    expect(await helloOnce(me, { name: "Tide", keep, env: {}, say })).toBe(false);
    expect(said).toEqual([]);
  });

  it("are tried again on the next start when saying them failed", async () => {
    const keep = memory();
    const me = await join({ link: await link(), name: "Tide", keep, env: {} });
    const failing = helloOnce(me, {
      name: "Tide",
      keep,
      env: {},
      say: () => Promise.reject(new Error("not connected")),
    });
    await expect(failing).rejects.toThrow("not connected");
    expect(await helloOnce(me, { name: "Tide", keep, env: {}, say: async () => undefined })).toBe(
      true,
    );
  });
});

describe("a value filled in", () => {
  it("is anything but nothing and the placeholders a command is copied with", () => {
    expect(filledIn("sk-live-abc")).toBe(true);
    for (const left of [undefined, "", "  ", "…", "...", "<your key>"])
      expect(filledIn(left)).toBe(false);
  });
});
