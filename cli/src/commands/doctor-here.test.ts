import { describe, expect, it } from "vitest";
import { hereChecks, mediaChecks, runtimeCheck, serverHereChecks } from "./doctor-here.js";

const release = { version: "0.2.0", root: "/opt/chips" };

/** Answers by address: Chips's health, saying what `relay` says, a page, or nothing. */
function machine(
  answering: Record<string, "chips" | "page" | "unbuilt">,
  relay: { url: string | null; status: string } = { url: null, status: "off" },
  pushes?: string,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const what = answering[url.origin];
    if (what === undefined) throw new Error("connect ECONNREFUSED");
    if (url.pathname === "/v1/health") return Response.json({ name: "chipsd", relay, pushes });
    return new Response(
      what === "unbuilt" ? "<h1>Chips is running.</h1> The web app is not built" : "<div id=root>",
    );
  }) as typeof fetch;
}

const here = {
  port: 4431,
  local: "http://127.0.0.1:4431",
  release,
  node: "v22.22.2",
  networks: async () => ({ tailnet: "100.64.0.7", lan: "10.0.0.96" }),
  serverExpectedHere: true,
  upHasRun: true,
};

describe("which chips this is", () => {
  it("names the release and its own Node", () => {
    expect(runtimeCheck(here)).toEqual({
      check: "chips",
      health: "ok",
      detail: "chips 0.2.0, on its own Node v22.22.2.",
    });
  });

  it("refuses a checkout on a Node older than 22", () => {
    const old = runtimeCheck({ release: undefined, node: "v20.11.0" });
    expect(old.health).toBe("bad");
    expect(old.fix).toContain("Node 22");
  });
});

describe("the server on this machine", () => {
  it("says whether it can push to phones, as its health says here (ADR 0244)", async () => {
    const page = { "http://127.0.0.1:4431": "page" as const };
    const relay = { url: null, status: "off" };
    // Pointed at Expo with no token: the push relay would send them, with CHIPS_PUSH_URL unset.
    const off = await serverHereChecks(here, machine(page, relay, "no_access_token"));
    expect(off.find((each) => each.check === "push")).toMatchObject({
      health: "warn",
      detail:
        "Sends no pushes to phones: CHIPS_PUSH_URL points at Expo, which takes the Chips app's pushes only with an access token.",
      // Unset in a shell, `chips up` would carry it on from the service: empty takes it out.
      fix: expect.stringContaining(
        "To push through the Chips push relay, run `CHIPS_PUSH_URL= chips up` to take CHIPS_PUSH_URL out.",
      ),
    });
    const refused = await serverHereChecks(here, machine(page, relay, "refused"));
    expect(refused.find((each) => each.check === "push")?.fix).toContain(
      "run `CHIPS_PUSH_ACCESS_TOKEN= chips up` to take the token out, or `chips up` with one Expo takes",
    );
    const ready = await serverHereChecks(here, machine(page, relay, "ready"));
    expect(ready.find((each) => each.check === "push")?.health).toBe("ok");
    // An older server says nothing of it, and nothing is said.
    const older = await serverHereChecks(here, machine(page, relay));
    expect(older.find((each) => each.check === "push")).toBeUndefined();
  });

  it("answers, has its page, and is reachable over Tailscale and the Wi-Fi", async () => {
    const found = await serverHereChecks(
      here,
      machine({
        "http://127.0.0.1:4431": "page",
        "http://100.64.0.7:4431": "page",
        "http://10.0.0.96:4431": "page",
      }),
    );
    expect(found.map((each) => [each.check, each.health])).toEqual([
      ["server here", "ok"],
      ["web app", "ok"],
      ["reach", "ok"],
    ]);
    expect(found[2]?.detail).toBe(
      "Reachable over Tailscale (100.64.0.7) and this Wi-Fi (10.0.0.96).",
    );
  });

  it("says when the page is not built, and when only this machine can reach it", async () => {
    const found = await serverHereChecks(here, machine({ "http://127.0.0.1:4431": "unbuilt" }));
    expect(found.find((each) => each.check === "web app")?.health).toBe("bad");
    const reach = found.find((each) => each.check === "reach");
    expect(reach?.health).toBe("warn");
    expect(reach?.fix).toBe(
      "Turn on the relay in You → Relay, or run `chips up --reach relay` (https://chipschat.ai/operate/relay/), or run `chips up --reach tailnet`.",
    );
  });

  it("counts the relay it is connected to as a phone's way in from anywhere", async () => {
    const relay = { url: "wss://relay.chipschat.ai", status: "connected" };
    const alone = await serverHereChecks(here, machine({ "http://127.0.0.1:4431": "page" }, relay));
    expect(alone.find((each) => each.check === "reach")).toEqual({
      check: "reach",
      health: "ok",
      detail:
        "Reachable from anywhere through the relay at relay.chipschat.ai. Directly, only from this machine.",
    });
    const home = await serverHereChecks(
      here,
      machine({ "http://127.0.0.1:4431": "page", "http://10.0.0.96:4431": "page" }, relay),
    );
    expect(home.find((each) => each.check === "reach")?.detail).toBe(
      "Reachable over this Wi-Fi (10.0.0.96), and from anywhere through the relay at relay.chipschat.ai.",
    );
  });

  it("warns of a relay the server is set to use and is not connected to, however else it is reached", async () => {
    const found = await serverHereChecks(
      here,
      machine(
        { "http://127.0.0.1:4431": "page", "http://10.0.0.96:4431": "page" },
        { url: "wss://relay.chipschat.ai", status: "connecting" },
      ),
    );
    const reach = found.find((each) => each.check === "reach");
    expect(reach?.health).toBe("warn");
    expect(reach?.detail).toBe(
      "Reachable over this Wi-Fi (10.0.0.96), and not through the relay at relay.chipschat.ai: the server is not connected to it.",
    );
    expect(reach?.fix).toContain("server's log");
    // A ninth server from one internet address is turned away as busy (the sweep's finding 12).
    expect(reach?.fix).toContain("`busy`");
  });

  it("says to run chips up when nothing answers and one should", async () => {
    const found = await serverHereChecks(here, machine({}));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: "server here", health: "bad" });
    expect(found[0]?.fix).toContain("chips up");
  });

  it("finds a server bound to its tailnet address alone, on the port its service says", async () => {
    const tailnetOnly = { ...here, port: 4800, local: "http://100.64.0.7:4800" };
    const found = await serverHereChecks(
      tailnetOnly,
      machine({ "http://100.64.0.7:4800": "page" }),
    );
    expect(found[0]).toEqual({
      check: "server here",
      health: "ok",
      detail: "Answers at http://100.64.0.7:4800.",
    });
  });

  it("warns of a server here still on the release before this one, and says chips up", async () => {
    const before = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/health") return Response.json({ name: "chipsd", version: "0.1.9" });
      return new Response("<div id=root>");
    }) as typeof fetch;
    const [server] = await serverHereChecks({ ...here, upHasRun: false }, before);
    expect(server).toMatchObject({
      check: "server here",
      health: "warn",
      detail: "Answers at http://127.0.0.1:4431, on 0.1.9, while this chips is 0.2.0.",
    });
    expect(server?.fix).toContain("chips up");
  });

  it("says nothing about a server here when this machine's device is paired elsewhere", async () => {
    expect(await serverHereChecks({ ...here, serverExpectedHere: false }, machine({}))).toEqual([]);
  });
});

describe("what the server here can do with video and voice notes", () => {
  const models = "/Users/ada/Library/Application Support/Chips/models";
  const ffmpeg = { ffmpeg: "/opt/homebrew/bin/ffmpeg", ffprobe: "/opt/homebrew/bin/ffprobe" };
  const whisper = { cli: "/opt/homebrew/bin/whisper-cli", model: `${models}/ggml-base.bin` };

  it("names what it found", () => {
    expect(mediaChecks({ video: ffmpeg, voice: whisper, models })).toEqual([
      { check: "video", health: "ok", detail: "ffmpeg at /opt/homebrew/bin/ffmpeg." },
      {
        check: "voice notes",
        health: "ok",
        detail: "whisper at /opt/homebrew/bin/whisper-cli, with ggml-base.bin.",
      },
    ]);
  });

  it("warns what a person gets without each, and how to add it", () => {
    const [video, voice] = mediaChecks({ video: undefined, voice: undefined, models });
    expect(video).toMatchObject({ check: "video", health: "warn" });
    expect(video?.detail).toContain("location included");
    expect(video?.fix).toContain("brew install ffmpeg");
    expect(voice).toMatchObject({ check: "voice notes", health: "warn" });
    expect(voice?.detail).toContain("no words");
    expect(voice?.fix).toContain(`put a model in ${models}`);
  });

  it("says whisper alone hears nothing: it needs ffmpeg too", () => {
    const [, voice] = mediaChecks({ video: undefined, voice: whisper, models });
    expect(voice?.detail).toBe(
      "whisper needs ffmpeg too: a voice note is kept with its length and no words.",
    );
  });

  it("is asked only where a server runs here", async () => {
    const media = () => ({ video: undefined, voice: undefined, models });
    const answering = machine({ "http://127.0.0.1:4431": "page" });
    const checks = async (expected: boolean) =>
      (await hereChecks({ ...here, serverExpectedHere: expected, media }, answering)).map(
        (finding) => finding.check,
      );
    expect(await checks(true)).toContain("voice notes");
    expect(await checks(false)).not.toContain("video");
  });
});
