/**
 * Connect a harness in the words the phone and the desktop share (ADR 0190): what to copy, which
 * harnesses are here, the phone's three steps, the minutes a link has left, and the arrival.
 */

import type { Connector } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  alreadyThere,
  arrivalWords,
  connectedHereLine,
  connectedNames,
  connectHead,
  connectingName,
  connectNote,
  connectSteps,
  connectTileWords,
  copyOf,
  fetchesBridge,
  GALLERY_LEDE,
  type HereLine,
  harnessNamed,
  hereAlreadyWords,
  hereButton,
  hereLine,
  hereNote,
  hereSentence,
  hereSteps,
  installLine,
  kindWords,
  linkLeft,
  linkShare,
  linkStandIn,
  linkWaiting,
  makingSteps,
  ownWayHeading,
  RUN_IN_TERMINAL,
  runsInTerminal,
  STEPS_LABEL,
  sayOf,
  stillWorks,
  waitingLink,
} from "./connect.js";
import type { Directory } from "./events.js";
import { type JoinRequest, joinCardState } from "./join.js";

const NOW = Date.parse("2026-10-17T21:00:00.000Z");

const OPENCLAW: Connector = {
  id: "openclaw",
  name: "OpenClaw",
  line: "An OpenClaw gateway, on a server or this Mac",
  kind: "one-line",
  command: "npm run connect -- '{link}'",
};

const request = (over: Partial<JoinRequest> = {}): JoinRequest => ({
  requestId: "jrq_1",
  kind: "harness",
  state: "allowed",
  startedBy: "person",
  wants: [],
  capabilities: ["autonomy"],
  url: "http://192.168.1.20:4431",
  createdAt: "2026-10-17T20:59:52.000Z",
  expiresAt: "2026-10-17T21:14:52.000Z",
  ...over,
});

const directory: Directory = {
  hrn_hermes: { id: "hrn_hermes", kind: "harness", displayName: "Hermes" },
  hrn_gone: {
    id: "hrn_gone",
    kind: "harness",
    displayName: "Scout",
    removedAt: "2026-10-01T00:00:00.000Z",
  },
  hrn_claw: { id: "hrn_claw", kind: "harness", displayName: "OpenClaw" },
  agt_claw: {
    id: "agt_claw",
    kind: "agent",
    harnessId: "hrn_claw",
    displayName: "OpenClaw",
    lead: true,
  },
  hrn_kit: { id: "hrn_kit", kind: "harness", displayName: "Kit" },
  agt_kit: { id: "agt_kit", kind: "agent", harnessId: "hrn_kit", displayName: "Wren", lead: true },
  per_me: { id: "per_me", kind: "person", displayName: "Arjun" },
};

const cardOf = (req: JoinRequest, connected = false, hello = false) =>
  joinCardState({
    request: req,
    state: connected
      ? { connected: true, since: "2026-10-17T21:00:10.000Z", run: undefined }
      : undefined,
    hello,
    nowMs: NOW,
  } as Parameters<typeof joinCardState>[0]);

describe("what the connect page copies", () => {
  it("is a card's line with the link in it, the code for your own, or the curl line", () => {
    const link = "http://192.168.1.20:4431/j/chips_j_8Qx2vRtL0aYc7MnB4kPz";
    expect(copyOf(OPENCLAW, link, false)).toBe(`npm run connect -- '${link}'`);
    expect(copyOf("own", link, false)).toContain(`join({ link: "${link}"`);
    expect(copyOf("http", link, false)).toContain("/v1/join/redeem");
  });

  it("heads the page with the card's name, and where what it shows goes", () => {
    expect(connectHead(OPENCLAW, false)).toMatchObject({
      title: "Connect OpenClaw",
      sub: "This goes on the computer where OpenClaw runs.",
    });
    const asks = { ...OPENCLAW, sentence: "Connect yourself to my Chips: {link}" };
    expect(connectHead(asks, true).sub).toBe(
      "Paste this into your chat with OpenClaw, wherever you talk to it.",
    );
    // Asking with no sentence to say shows the line, and says where it goes.
    expect(connectHead(OPENCLAW, true).sub).toBe("This goes on the computer where OpenClaw runs.");
    const { command: _, ...linkOnly } = OPENCLAW;
    expect(connectHead(linkOnly, false).sub).toBe(
      "Give OpenClaw this link, on the computer where it runs.",
    );
    expect(connectHead("own", false)).toMatchObject({
      title: "Connect your own harness",
      sub: "Add this to your harness's code, where it starts.",
    });
    expect(connectHead("http", false).sub).toBe(
      "It answers with a key. Give that key to your harness.",
    );
  });

  it("says Run in Terminal over a line to run, and only there (ADR 0257)", () => {
    expect(RUN_IN_TERMINAL).toBe("Run in Terminal");
    expect(runsInTerminal(OPENCLAW, false)).toBe(true);
    expect(runsInTerminal(HERMES, false)).toBe(true);
    expect(runsInTerminal("http", false)).toBe(true);
    // Code for a harness's source, a sentence to say, and a link to hand over are not run.
    expect(runsInTerminal("own", false)).toBe(false);
    const asks = { ...OPENCLAW, sentence: "Connect yourself to my Chips: {link}" };
    expect(runsInTerminal(asks, true)).toBe(false);
    expect(runsInTerminal(asks, false)).toBe(true);
    const { command: _, ...linkOnly } = OPENCLAW;
    expect(runsInTerminal(linkOnly, false)).toBe(false);
  });

  it("notes how long the link lasts, and a bridge npm doesn't have yet (ADR 0218)", () => {
    expect(connectNote(OPENCLAW)).toBe("The link in it works once, for 15 minutes.");
    const unpublished = {
      ...OPENCLAW,
      command: "chips connect openclaw '{link}'",
      package: "@chipschat/openclaw@1",
      published: false,
    };
    expect(connectNote(unpublished)).toBe(
      "The link in it works once, for 15 minutes. Not published yet: `chips connect` fetches OpenClaw's bridge from npm, where it isn't yet.",
    );
    expect(connectNote({ ...OPENCLAW, published: false })).toBe(
      "The link in it works once, for 15 minutes. Not published yet: that computer needs its own copy of OpenClaw's connector.",
    );
    expect(connectNote("own")).toMatch(/keeps it\.$/);
    expect(connectNote("http")).toMatch(
      /^It answers with your harness's id, its key and its space/,
    );
  });

  it("says where the link works from, and what that computer needs (the new-person sweep)", () => {
    const claude = {
      ...OPENCLAW,
      name: "Claude Code",
      needs: "Claude Code installed and signed in",
    };
    expect(connectNote(claude, "http://127.0.0.1:4431/j/chips_j_0123456789abcdefghijkl")).toBe(
      "The link in it works once, for 15 minutes. It works only on the computer Chips runs on, so run it there. That computer needs Claude Code installed and signed in.",
    );
    expect(connectNote(claude, "http://192.168.1.20:4431/j/chips_j_0123456789abcdefghijkl")).toBe(
      "The link in it works once, for 15 minutes. That computer has to reach Chips at http://192.168.1.20:4431: on the same network, on its tailnet, or at an address it can reach. That computer needs Claude Code installed and signed in.",
    );
  });

  it("draws a card by its name, as its harness arrives, and a way by its mark (ADR 0190)", () => {
    // No face of its own: the head and the gallery draw the name's, which the harness that comes
    // in by the link wears on the arrival, the shelf and every list.
    expect(connectHead(OPENCLAW, false).face).toBeUndefined();
    expect(connectHead("own", false).face).toEqual({ icon: "wafer", ground: 26 });
    expect(connectHead("http", false).face).toEqual({ icon: "plug", ground: 19 });
  });

  it("tags a card by what it asks of you", () => {
    expect(kindWords(OPENCLAW).words).toBe("Run a line");
  });
});

describe("which harnesses are here", () => {
  it("names each harness here, and not one that was removed", () => {
    expect([...connectedNames(directory)].sort()).toEqual(["hermes", "kit", "openclaw"]);
  });

  it("finds a harness by a card's name, whatever its case", () => {
    expect(harnessNamed(directory, "hermes")).toBe("hrn_hermes");
    expect(harnessNamed(directory, "Scout")).toBeUndefined();
    expect(harnessNamed(directory, "OpenCode")).toBeUndefined();
  });

  it("says a card for one here makes a second, and where the one here is put right", () => {
    expect(hereAlreadyWords("Hermes", true)).toEqual({
      note: "Hermes is connected here already. A new agent of it starts in a space of its own. Another Hermes is for another computer. If this one has stopped, its page says why.",
      newAgent: "New Hermes agent",
      another: "Connect another Hermes",
    });
    expect(hereAlreadyWords("Hermes", false).note).toBe(
      "Hermes is connected here already. Another Hermes is for another computer. If this one has stopped, its page says why.",
    );
  });
});

describe("a link's minutes", () => {
  it("counts down as a clock reads, and stops at nought", () => {
    expect(linkLeft(request(), NOW)).toBe("14:52");
    expect(linkLeft(request(), NOW + 14 * 60_000 + 51_500)).toBe("0:01");
    expect(linkLeft(request(), NOW + 3_600_000)).toBe("0:00");
  });

  it("says how much of its time is left, for the tile's ring", () => {
    expect(linkShare(request(), NOW)).toBeCloseTo(892 / 900);
    expect(linkShare(request(), NOW + 3_600_000)).toBe(0);
  });
});

describe("the phone's three steps", () => {
  it("waits for the harness with the minutes left", () => {
    const req = request();
    const steps = connectSteps(req, cardOf(req), "OpenClaw", NOW);
    expect(steps.map((each) => each.state)).toEqual(["done", "now", "later"]);
    expect(steps[1]).toMatchObject({ label: "OpenClaw connects", detail: "Waiting… 14:52 left" });
  });

  it("says where it took its key, then that it connected, then that it is here", () => {
    const taken = request({
      state: "redeemed",
      name: "OpenClaw",
      machine: "Arjun's MacBook Pro",
      harnessId: "hrn_claw",
      spaceId: "spc_claw",
      decidedAt: "2026-10-17T21:00:00.000Z",
    });
    expect(connectSteps(taken, cardOf(taken), "OpenClaw", NOW)[1]?.detail).toBe(
      "Took its key on Arjun's MacBook Pro",
    );
    const connected = connectSteps(taken, cardOf(taken, true), "OpenClaw", NOW);
    expect(connected.map((each) => each.state)).toEqual(["done", "done", "now"]);
    expect(connected[1]?.detail).toBe("From Arjun's MacBook Pro");
    const here = connectSteps(taken, cardOf(taken, true, true), "OpenClaw", NOW);
    expect(here.map((each) => each.state)).toEqual(["done", "done", "done"]);
    expect(here[2]?.detail).toBe("OpenClaw is here");
  });

  it("stands as three before the link is back, the first under way, so the page has its height", () => {
    const making = makingSteps("OpenClaw");
    expect(making.map((each) => each.key)).toEqual(["link", "connects", "hello"]);
    expect(making.map((each) => each.state)).toEqual(["now", "later", "later"]);
    expect(making[0]).toMatchObject({
      label: "Making a link",
      detail: "Works once, for 15 minutes",
    });
    expect(making[1]).toMatchObject({
      label: "OpenClaw connects",
      detail: "When it uses the link",
    });
    expect(making[2]).toMatchObject({ label: "Says hello", detail: "Its Main agent joins Chips" });
  });

  it("holds the line's place with a link of the shape the server makes", () => {
    const real = "http://100.64.0.7:4431/j/chips_j_Qm7Rb2Xc9Lp4Vt6Nh1Kd8Ws3Jg5Fy0Za";
    expect(linkStandIn("http://100.64.0.7:4431")).toHaveLength(real.length);
    expect(linkStandIn("http://100.64.0.7:4431/")).toHaveLength(real.length);
    expect(linkStandIn(undefined)).toMatch(/^http:\/\/127\.0\.0\.1:4431\/j\/chips_j_x{32}$/);
    expect(copyOf(OPENCLAW, linkStandIn("http://100.64.0.7:4431"), false)).toHaveLength(
      copyOf(OPENCLAW, real, false).length,
    );
  });

  it("holds where it stopped, with nothing under way, once the link is out of time", () => {
    const out = request({ expiresAt: "2026-10-17T20:59:59.000Z" });
    const card = cardOf(out);
    expect(card.stall?.kind).toBe("expired");
    expect(connectSteps(out, card, "OpenClaw", NOW).map((each) => each.state)).toEqual([
      "done",
      "later",
      "later",
    ]);
    expect(linkWaiting(card)).toBe(false);
  });

  it("is waited on until the hello, and not after", () => {
    const taken = request({ state: "redeemed", harnessId: "hrn_claw", spaceId: "spc_claw" });
    expect(linkWaiting(cardOf(request()))).toBe(true);
    expect(linkWaiting(cardOf(taken, true))).toBe(true);
    expect(linkWaiting(cardOf(taken, true, true))).toBe(false);
    expect(linkWaiting(undefined)).toBe(false);
  });

  it("goes by the card's name until the harness names itself", () => {
    expect(connectingName(request(), OPENCLAW)).toBe("OpenClaw");
    expect(connectingName(request({ name: "Claw at home" }), OPENCLAW)).toBe("Claw at home");
    expect(connectingName(undefined, "own")).toBe("Your harness");
  });
});

describe("the arrival", () => {
  it("says who is here, from where, and that its Main agent waits in its room", () => {
    const words = arrivalWords(
      request({
        state: "redeemed",
        machine: "Arjun's MacBook Pro",
        harnessId: "hrn_claw",
        spaceId: "spc_claw",
      }),
      directory,
    );
    expect(words).toEqual({
      title: "OpenClaw is here",
      line: "Connected from Arjun's MacBook Pro. Its Main agent is waiting in its space.",
      harnessId: "hrn_claw",
      mainAgentId: "agt_claw",
      roomId: "spc_claw",
    });
  });

  it("names a Main agent that goes by a name of its own", () => {
    const words = arrivalWords(
      request({ state: "redeemed", harnessId: "hrn_kit", spaceId: "spc_kit" }),
      directory,
    );
    expect(words.line).toBe("Connected. Its Main agent, Wren, is waiting in its space.");
  });
});

const HERMES: Connector = {
  id: "hermes",
  name: "Hermes",
  line: "Hermes Agent's API server, through chips-hermes",
  needs: "Hermes running with its API server on",
  kind: "one-line",
  command: "chips connect hermes '{link}'",
  package: "@chipschat/hermes@1",
  published: false,
};

describe("a bridge's card (ADR 0218, phase 5)", () => {
  const link = "http://192.168.1.20:4431/j/chips_j_q7Rk2mWx9TbN4pLs8VfY3cHd6JzA1eUo";

  it("is one whose line is chips connect, with a package to fetch", () => {
    expect(fetchesBridge(HERMES)).toBe(true);
    expect(fetchesBridge(OPENCLAW)).toBe(false);
    expect(fetchesBridge({ ...HERMES, package: undefined })).toBe(false);
    expect(fetchesBridge("own")).toBe(false);
  });

  it("goes to another computer as the installer's line, which installs Chips there first", () => {
    // The link in the environment, never among the words `ps` lists (SEC-50).
    const line = `curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='${link}' sh -s -- connect hermes`;
    expect(installLine(HERMES, link)).toBe(line);
    expect(sayOf(HERMES, link, false)).toEqual({
      kind: "command",
      text: line,
      testId: "join-command",
    });
    // The phone copies the same line.
    expect(copyOf(HERMES, link, false)).toBe(line);
    expect(connectHead(HERMES, false).sub).toBe(
      "This goes on the computer where Hermes runs, and installs Chips there if it needs to.",
    );
    expect(alreadyThere(HERMES, link)).toEqual({
      before: "If Chips is already on that computer, ",
      code: `CHIPS_JOIN_LINK='${link}' chips connect hermes`,
      after: " does the same thing.",
    });
    // A quote in a link stays inside it.
    expect(installLine(HERMES, "http://x/j/a'b")).toContain(
      `CHIPS_JOIN_LINK='http://x/j/a'\\''b' sh`,
    );
  });

  it("says on this Mac what Connect does, and what it needs first", () => {
    expect(hereSentence("Hermes")).toBe(
      "Hermes runs on this Mac, so Chips can connect it for you. It gets the Hermes bridge and keeps it running after you log in.",
    );
    expect(hereButton("Hermes", "ready")).toBe("Connect Hermes");
    expect(hereButton("Hermes", "running")).toBe("Connecting…");
    expect(hereButton("Hermes", "stopped")).toBe("Try again");
    expect(hereNote({ ...HERMES, published: true })).toBe(
      "You need Hermes running with its API server on.",
    );
    expect(hereNote(HERMES)).toBe(
      "You need Hermes running with its API server on. Not published yet: Chips fetches Hermes's bridge from npm, where it isn't yet.",
    );
    expect(hereNote({ ...HERMES, needs: undefined, published: true })).toBe(
      "You need Hermes on this Mac.",
    );
  });

  it("says how long the link it runs with still works", () => {
    expect(stillWorks(request(), NOW)).toBe("The link still works for another 15 minutes.");
    expect(stillWorks(request({ expiresAt: "2026-10-17T21:00:40.000Z" }), NOW)).toBe(
      "The link still works for another minute.",
    );
  });
});

describe("Connect on this Mac's four steps", () => {
  const lines = (...each: Record<string, unknown>[]) => each as unknown as HereLine[];
  const states = (run: ReturnType<typeof hereSteps>) => run.steps.map((step) => step.state);
  const details = (run: ReturnType<typeof hereSteps>) => run.steps.map((step) => step.detail);

  it("reads only lines that are steps", () => {
    expect(hereLine('{"step":"checking"}')).toEqual({ step: "checking" });
    expect(hereLine("Downloading @chipschat/hermes 1.0.0…")).toBeUndefined();
    expect(hereLine('{"no":"step"}')).toBeUndefined();
  });

  it("all wait, greyed, before Connect is pressed: the dialog is its height from the start", () => {
    const run = hereSteps("Hermes", [], false);
    expect(run.steps.map((step) => step.label)).toEqual([
      "Getting the Hermes bridge",
      "Checking Hermes",
      "Joining Chips",
      "Keeping it running",
    ]);
    expect(states(run)).toEqual(["later", "later", "later", "later"]);
    expect(details(run)).toEqual([
      "From npm",
      "That Hermes answers, on this Mac",
      "With a link that works once",
      "So it is back after a restart",
    ]);
    expect(run.stop).toBeUndefined();
  });

  it("follows the download in kilobytes, then the bridge's own words for its check", () => {
    expect(states(hereSteps("Hermes", [], true))).toEqual(["now", "later", "later", "later"]);
    const downloading = hereSteps(
      "Hermes",
      lines(
        { step: "downloading", package: "@chipschat/hermes", version: "1.0.3", reused: false },
        {
          step: "downloading",
          package: "@chipschat/hermes",
          version: "1.0.3",
          received: 640_000,
          total: 1_100_000,
        },
      ),
      true,
    );
    expect(downloading.steps[0]).toMatchObject({
      state: "now",
      detail: "Downloading, 640 KB of 1,100 KB",
    });
    const checking = hereSteps(
      "Hermes",
      lines(
        { step: "downloading", package: "@chipschat/hermes", version: "1.0.3", received: 9 },
        { step: "checking" },
        { step: "checking", detail: "Looking for its API server" },
      ),
      true,
    );
    expect(states(checking)).toEqual(["done", "now", "later", "later"]);
    expect(details(checking).slice(0, 2)).toEqual([
      "@chipschat/hermes 1.0.3",
      "Looking for its API server",
    ]);
    const joining = hereSteps(
      "Hermes",
      lines(
        { step: "downloading", package: "@chipschat/hermes", version: "1.0.3", reused: true },
        { step: "checking" },
        { step: "checked", detail: "Its API server answers on port 8642" },
        { step: "joining" },
      ),
      true,
    );
    expect(states(joining)).toEqual(["done", "done", "now", "later"]);
    expect(details(joining).slice(1, 3)).toEqual([
      "Its API server answers on port 8642",
      "Trading the link for a key",
    ]);
  });

  it("is all done once it is connected", () => {
    const run = hereSteps(
      "Hermes",
      lines(
        { step: "downloading", package: "@chipschat/hermes", version: "1.0.3", reused: true },
        { step: "checking" },
        { step: "joining" },
        { step: "keeping", label: "chat.chips.hermes" },
        { step: "connected" },
      ),
      false,
    );
    expect(states(run)).toEqual(["done", "done", "done", "done"]);
    expect(details(run).slice(2)).toEqual([
      "Hermes has a key of its own",
      "It starts again when you log in",
    ]);
    expect(run.connected).toBe(true);
  });

  it("stops where the bridge stopped, in its words, with what to do and a line to copy", () => {
    const run = hereSteps(
      "Hermes",
      lines(
        { step: "downloading", package: "@chipschat/hermes", version: "1.0.3", reused: true },
        { step: "checking" },
        {
          step: "failed",
          code: 1,
          sentence: "Hermes isn't answering … The link is still good: run the same command again.",
          detail: "Nothing answers on port 8642",
          says: "Hermes's API server is off.",
          doing: "Add this line to ~/.hermes/.env, then start Hermes with hermes gateway.",
          copy: "API_SERVER_ENABLED=true",
        },
      ),
      false,
    );
    expect(states(run)).toEqual(["done", "stopped", "later", "later"]);
    expect(run.steps[1]?.detail).toBe("Nothing answers on port 8642");
    // A setting goes in a file, so its box doesn't say Run in Terminal (ADR 0257).
    expect(run.stop).toEqual({
      says: "Hermes's API server is off.",
      doing: "Add this line to ~/.hermes/.env, then start Hermes with hermes gateway.",
      copy: "API_SERVER_ENABLED=true",
      run: false,
    });
  });

  it("runs a bridge's line to copy in a terminal when it is a command (ADR 0257)", () => {
    const stop = (copy?: string) =>
      hereSteps(
        "Claude Code",
        lines({ step: "checking" }, { step: "failed", says: "It stopped.", copy }),
        false,
      ).stop;
    expect(stop("npm install -g @agentclientprotocol/claude-agent-acp")?.run).toBe(true);
    expect(stop("openclaw gateway")?.run).toBe(true);
    expect(stop("FOO=bar openclaw gateway")?.run).toBe(true);
    expect(stop("API_SERVER_ENABLED=true")?.run).toBe(false);
    expect(stop()?.run).toBe(false);
  });

  it("labels each place's steps with what they are (ADR 0257)", () => {
    expect(STEPS_LABEL).toEqual({ here: "What Connect does", another: "What happens" });
  });

  it("says a bridge's plain sentence, without its words for a terminal, when it gave no others", () => {
    const run = hereSteps(
      "Hermes",
      lines({
        step: "failed",
        code: 1,
        sentence: "https://registry.npmjs.org has no package @chipschat/hermes.",
      }),
      false,
    );
    expect(states(run)).toEqual(["stopped", "later", "later", "later"]);
    expect(run.stop?.says).toBe("https://registry.npmjs.org has no package @chipschat/hermes.");
    const plain = hereSteps(
      "Hermes",
      lines(
        { step: "checking" },
        {
          step: "failed",
          sentence:
            "Hermes isn't answering at http://127.0.0.1:8642: start its API server. The link is still good: run the same command again once that's done.",
        },
      ),
      false,
    );
    expect(plain.stop?.says).toBe(
      "Hermes isn't answering at http://127.0.0.1:8642: start its API server.",
    );
    expect(plain.steps[1]?.detail).toBe("It stopped here");
  });
});

describe("the gallery's words, as the phone's (ADR 0190)", () => {
  it("says what to pick, and over the two ways says Or only after the docs' cards", () => {
    expect(GALLERY_LEDE).toBe(
      "Pick what runs your agents. You run one line on that computer, and it shows up here.",
    );
    expect(ownWayHeading(2)).toBe("Or build your own");
    expect(ownWayHeading(0)).toBe("Build your own");
  });

  it("says a card for a harness here already offers another, or a new agent", () => {
    expect(connectedHereLine("Tap")).toBe("Connected here. Tap for another, or a new agent.");
    expect(connectedHereLine("Click")).toBe("Connected here. Click for another, or a new agent.");
  });
});

describe("the shelf's last tile while a link waits, as the phone's (ADR 0271)", () => {
  const made = {
    requestId: "jrq_1",
    kind: "harness",
    state: "allowed",
    startedBy: "person",
    wants: [],
    capabilities: [],
    url: "http://127.0.0.1:4431",
    createdAt: "2026-11-03T16:00:00.000Z",
    expiresAt: "2026-11-03T16:15:00.000Z",
  } as const satisfies JoinRequest;
  const at = Date.parse("2026-11-03T16:00:48.000Z");

  it("counts a waiting link down, says Connecting once its key is taken, and nothing after", () => {
    const waiting = waitingLink(made, { done: 1 } as never, at);
    expect(waiting).toEqual({ left: "14:12", share: 852 / 900, taken: false });
    expect(connectTileWords(waiting)).toEqual({
      name: "Waiting",
      line: "14:12",
      label: "Connect a harness, waiting, 14:12 left",
    });
    const taken = waitingLink({ ...made, state: "redeemed" }, { done: 3 } as never, at);
    expect(connectTileWords(taken).name).toBe("Connecting");
    expect(waitingLink(made, { done: 5 } as never, at)).toBeUndefined();
    expect(waitingLink(made, { done: 1, stall: { kind: "expired" } } as never, at)).toBeUndefined();
    expect(connectTileWords(undefined)).toEqual({
      name: "Connect",
      line: "a harness",
      label: "Connect a harness",
    });
  });
});
