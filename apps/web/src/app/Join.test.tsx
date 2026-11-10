/**
 * The gallery's tags (ADR 0171) say what bringing a harness in asks of you, in the connect card's
 * own words, so a newcomer knows before picking: ask it, run a line, or write code. And a link made
 * on a card's page can be cancelled while it waits (ADR 0190, 18 October 2026). A bridge's card
 * (ADR 0218, phase 5) runs its line on this Mac from Chips for Mac, and elsewhere is the
 * installer's line.
 */

import { type Directory, type JoinRequest, kindWords, type WorkspaceModel } from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ConnectHere, OnThisMac } from "./ConnectBridge.tsx";
import { ConnectPage, type JoinService } from "./Join.tsx";

const card = (kind: Connector["kind"], sentence?: string): Connector => ({
  id: "x",
  name: "X",
  line: "Somewhere",
  kind,
  command: "npx chips-x",
  ...(sentence === undefined ? {} : { sentence }),
});

describe("a gallery card's tag", () => {
  it("says what it asks of you", () => {
    expect(kindWords(card("one-line", "Connect yourself to my Chips.")).words).toBe("Ask it");
    expect(kindWords(card("one-line")).words).toBe("Run a line");
    expect(kindWords(card("sdk")).words).toBe("Write code");
  });
});

const waiting = (over: Partial<JoinRequest> = {}): JoinRequest => ({
  requestId: "jrq_1",
  kind: "harness",
  state: "allowed",
  startedBy: "person",
  wants: [],
  capabilities: ["autonomy"],
  url: "http://127.0.0.1:4431",
  createdAt: new Date(Date.now()).toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  ...over,
});

/** A card's page on the desktop, over a server that holds `request` for the link it makes. */
function page(request: JoinRequest, onCancelled: () => void) {
  const denied: string[] = [];
  const join: JoinService = {
    makeLink: async () => ({ request, link: "http://127.0.0.1:4431/j/chips_j_x" }),
    allow: async () => request,
    deny: async (id) => {
      denied.push(id);
      return { ...request, state: "denied" };
    },
  };
  render(
    <ConnectPage
      titleId="connect-title"
      way={card("one-line")}
      model={{ spaces: [] } as unknown as WorkspaceModel}
      directory={{}}
      selfId="usr_me"
      joins={new Map([[request.requestId, request]])}
      join={join}
      onOpen={() => {}}
      onCancelled={onCancelled}
    />,
  );
  return denied;
}

describe("Cancel link on a card's page", () => {
  it("withdraws the link while it waits, and goes back to the gallery", async () => {
    const cancelled = vi.fn();
    const denied = page(waiting(), cancelled);
    fireEvent.click(await screen.findByTestId("join-cancel"));
    await waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
    expect(denied).toEqual(["jrq_1"]);
  });

  it("is not offered once the harness has taken the link", async () => {
    page(waiting({ state: "redeemed", harnessId: "hrn_x", spaceId: "spc_x" }), () => {});
    expect((await screen.findByTestId("join-steps-connects")).dataset["state"]).toBe("now");
    expect(screen.queryByTestId("join-cancel")).toBeNull();
  });
});

const LINK = "http://127.0.0.1:4431/j/chips_j_x";

const HERMES: Connector = {
  id: "hermes",
  name: "Hermes",
  line: "Hermes Agent's API server, through chips-hermes",
  needs: "Hermes running with its API server on",
  kind: "one-line",
  command: "chips connect hermes '{link}'",
  package: "@chipschat/hermes@1",
};

/**
 * A bridge's card's page, in a browser (`null`) or in a shell that runs its line here: in the
 * dialog, or in the welcome, which has no way out of its own.
 */
function bridgePage(
  request: JoinRequest,
  connectHere: ConnectHere | null,
  within: { welcome?: boolean; onOpen?: (roomId: string) => void; directory?: Directory } = {},
) {
  const join: JoinService = {
    makeLink: async () => ({ request, link: LINK }),
    allow: async () => request,
    deny: async () => ({ ...request, state: "denied" }),
  };
  render(
    <ConnectPage
      titleId="connect-title"
      way={HERMES}
      model={{ spaces: [] } as unknown as WorkspaceModel}
      directory={within.directory ?? {}}
      selfId="usr_me"
      joins={new Map([[request.requestId, request]])}
      join={join}
      onOpen={within.onOpen ?? (() => {})}
      {...(within.welcome === true ? {} : { onClose: () => {} })}
      connectHere={connectHere}
    />,
  );
}

/** A shell that runs a card's line by saying `lines`, then ending with `code`; what it was given. */
function shellSaying(lines: readonly object[], code: number) {
  const runs: { id: string; name: string; link: string }[] = [];
  const connectHere: ConnectHere = async ({ id, name }, link, onLine) => {
    runs.push({ id, name, link });
    for (const line of lines) onLine(JSON.stringify(line));
    return { done: Promise.resolve(code), cancel: async () => {} };
  };
  return { connectHere, runs };
}

const NOT_ANSWERING = [
  { step: "downloading", package: "@chipschat/hermes", version: "1.0.3", reused: false },
  {
    step: "downloading",
    package: "@chipschat/hermes",
    version: "1.0.3",
    received: 1_100_000,
    total: 1_100_000,
  },
  { step: "checking" },
  { step: "checking", detail: "Looking for its API server" },
  {
    step: "failed",
    detail: "Nothing answers on port 8642",
    says: "Hermes's API server is off.",
    doing: "Add this line to ~/.hermes/.env, then start Hermes with hermes gateway.",
    copy: "API_SERVER_ENABLED=true",
    sentence: "Hermes isn't answering … The link is still good: run the same command again.",
    code: 1,
  },
];

describe("a bridge's card in a browser", () => {
  it("is the installer's line for the computer where it runs, with the link followed in three steps", async () => {
    bridgePage(waiting(), null);
    expect((await screen.findByTestId("join-command")).textContent).toBe(
      `curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='${LINK}' sh -s -- connect hermes`,
    );
    expect(screen.getByText(`CHIPS_JOIN_LINK='${LINK}' chips connect hermes`).tagName).toBe("CODE");
    // A line to run says so on its box (ADR 0257).
    expect(screen.getByTestId("join-command-run").textContent).toBe(">_Run in TerminalCopy");
    expect(screen.getByRole("list", { name: "What happens" })).toBe(
      screen.getByTestId("join-another-steps"),
    );
    expect(screen.getByTestId("join-another-steps-connects").textContent).toMatch(/left$/);
    // Nothing of this Mac where nothing can run the line here.
    expect(screen.queryByTestId("join-where-here")).toBeNull();
    expect(screen.queryByTestId("join-here-go")).toBeNull();
    expect(screen.getByText("Hermes Agent's API server, through chips-hermes")).toBeTruthy();
  });
});

describe("a bridge's card on Chips for Mac", () => {
  it("opens on this Mac with its four steps waiting, greyed, before Connect is pressed", async () => {
    bridgePage(waiting(), shellSaying([], 0).connectHere);
    const tab = await screen.findByTestId("join-where-here");
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByText(/^Hermes runs on this Mac, so Chips can connect it for you\./),
    ).toBeTruthy();
    const steps = screen.getByTestId("join-here-steps").querySelectorAll("li");
    expect([...steps].map((each) => each.dataset["state"])).toEqual([
      "later",
      "later",
      "later",
      "later",
    ]);
    // Under a label that says what they are, so they read as what will happen (ADR 0257).
    expect(screen.getByRole("list", { name: "What Connect does" })).toBe(
      screen.getByTestId("join-here-steps"),
    );
    expect(screen.getByText("What Connect does")).toBeTruthy();
    expect(screen.getByTestId("join-here-go").textContent).toBe("Connect Hermes");
    expect(screen.getByTestId("join-here-note").textContent).toBe(
      "You need Hermes running with its API server on.",
    );
    expect(screen.queryByTestId("join-open-room")).toBeNull();
  });

  it("in the welcome, which has no arrival, opens its room once there is one", async () => {
    const opened: string[] = [];
    bridgePage(
      waiting({ state: "redeemed", harnessId: "hrn_x", spaceId: "spc_x" }),
      shellSaying([], 0).connectHere,
      { welcome: true, onOpen: (roomId) => opened.push(roomId) },
    );
    fireEvent.click(await screen.findByTestId("join-open-room"));
    expect(opened).toEqual(["spc_x"]);
  });

  it("runs the card's line here with the link, stops where the bridge stops, and tries again", async () => {
    const shell = shellSaying(NOT_ANSWERING, 1);
    bridgePage(waiting(), shell.connectHere);
    const go = await screen.findByTestId("join-here-go");
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(go);
    await waitFor(() => expect(go.textContent).toBe("Try again"));
    expect(shell.runs).toEqual([{ id: "hermes", name: "Hermes", link: LINK }]);
    const steps = [...screen.getByTestId("join-here-steps").querySelectorAll("li")];
    expect(steps.map((each) => each.dataset["state"])).toEqual([
      "done",
      "stopped",
      "later",
      "later",
    ]);
    expect(steps[0]?.textContent).toContain("@chipschat/hermes 1.0.3");
    expect(steps[1]?.textContent).toContain("Nothing answers on port 8642");
    const stop = screen.getByTestId("join-here-stop");
    expect(stop.textContent).toContain("Hermes's API server is off.");
    expect(stop.textContent).toContain("Add this line to ~/.hermes/.env");
    expect(screen.getByTestId("join-here-copy").textContent).toBe("API_SERVER_ENABLED=true");
    // A setting goes in a file: its box doesn't say Run in Terminal (ADR 0257).
    expect(screen.queryByTestId("join-here-copy-run")).toBeNull();
    expect(screen.getByTestId("join-here-note").textContent).toBe(
      "The link still works for another 15 minutes.",
    );
    fireEvent.click(go);
    await waitFor(() => expect(shell.runs).toHaveLength(2));
    // The same link: a bridge stops before it uses it.
    expect(shell.runs[1]).toEqual({ id: "hermes", name: "Hermes", link: LINK });
  });

  it("says Run in Terminal over a command the bridge gives to copy (ADR 0257)", async () => {
    const shell = shellSaying(
      [
        { step: "downloading", package: "@chipschat/acp", version: "1.0.10", reused: true },
        { step: "checking" },
        {
          step: "failed",
          code: 1,
          detail: "claude-agent-acp isn't on this Mac",
          says: "Claude Code's ACP adapter isn't installed.",
          doing: "Install it with npm, then try again.",
          copy: "npm install -g @agentclientprotocol/claude-agent-acp",
        },
      ],
      1,
    );
    bridgePage(waiting(), shell.connectHere);
    const go = await screen.findByTestId("join-here-go");
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(go);
    await waitFor(() => expect(go.textContent).toBe("Try again"));
    expect(screen.getByTestId("join-here-copy").textContent).toBe(
      "npm install -g @agentclientprotocol/claude-agent-acp",
    );
    expect(screen.getByTestId("join-here-copy-run").textContent).toBe(">_Run in TerminalCopy");
  });

  it("gives each switch a short sentence on hover, which the switch is described by (ADR 0257)", async () => {
    bridgePage(waiting(), shellSaying([], 0).connectHere);
    const row = await screen.findByTestId("join-cap-follows_rooms");
    const tip = row.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toBe("When you archive or delete a space, it does too.");
    const sw = row.querySelector('[role="switch"]');
    expect(sw?.getAttribute("aria-describedby")).toBe(tip?.id);
    expect(screen.getAllByRole("tooltip", { hidden: true })).toHaveLength(12);
  });

  /**
   * The kept bridge has joined: Hermes's link was taken and its socket is open since `agoMs`, but
   * it has said nothing in its room.
   */
  const joinedQuiet = (agoMs: number) => {
    const since = new Date(Date.now() - agoMs).toISOString();
    const request = waiting({
      state: "redeemed",
      name: "Hermes",
      harnessId: "hrn_hermes",
      spaceId: "spc_hermes",
      decidedAt: new Date(Date.now() - agoMs - 60_000).toISOString(),
    });
    const directory = {
      hrn_hermes: {
        id: "hrn_hermes",
        kind: "harness",
        displayName: "Hermes",
        state: { connected: true, since },
      },
    } as unknown as Directory;
    const shell = shellSaying([{ step: "checking" }, { step: "connected" }], 0);
    bridgePage(request, shell.connectHere, { directory });
  };

  it("waits for the hello once the bridge has joined, spinning while it is new", async () => {
    joinedQuiet(10_000);
    const go = await screen.findByTestId("join-here-go");
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(go);
    await waitFor(() => expect(go.textContent).toBe("Connecting…"));
    expect((go as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("join-here-stall")).toBeNull();
  });

  it("in the welcome, gives Connect's place to Open its space once the hello is in (the onboarding audit, item 7)", async () => {
    const request = waiting({ state: "redeemed", name: "Hermes", spaceId: "spc_hermes" });
    const shell = shellSaying([{ step: "checking" }, { step: "connected" }], 0);
    const props = {
      card: HERMES,
      connect: shell.connectHere,
      link: LINK,
      request,
      spent: false,
      nowMs: Date.now(),
      onNewLink: async () => LINK,
    };
    const { rerender } = render(<OnThisMac {...props} />);
    const go = await screen.findByTestId("join-here-go");
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(go);
    await waitFor(() => expect(go.textContent).toBe("Connecting…"));
    rerender(<OnThisMac {...props} arrived />);
    await waitFor(() => expect(screen.queryByTestId("join-here-go")).toBeNull());
  });

  it("says the card's stall where the joined bridge never says hello, rather than spinning on", async () => {
    joinedQuiet(3 * 60_000);
    const go = await screen.findByTestId("join-here-go");
    await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(go);
    const stall = await screen.findByTestId("join-here-stall");
    expect(stall.textContent).toBe(
      "Hermes connected but hasn't said anything yet.Check on its computer that it's running and signed in. A harness of your own speaks when it first sends a message.",
    );
    // The words On another computer gives, in place of a Connect that would make a second Hermes.
    expect(screen.queryByTestId("join-here-go")).toBeNull();
    const steps = [...screen.getByTestId("join-here-steps").querySelectorAll("li")];
    expect(steps.map((each) => each.dataset["state"])).toEqual(["done", "done", "done", "done"]);
  });

  it("shows the installer's line on another computer, and keeps a run here going", async () => {
    bridgePage(waiting(), shellSaying([], 0).connectHere);
    fireEvent.click(await screen.findByTestId("join-where-another"));
    expect((await screen.findByTestId("join-command")).textContent).toMatch(
      /^curl -fsSL https:\/\/chipschat\.ai\/install \| CHIPS_JOIN_LINK='.+' sh -s -- connect hermes$/,
    );
    expect(screen.getByTestId("join-where-another").getAttribute("aria-selected")).toBe("true");
    // On this Mac is kept, hidden, so a run under way goes on.
    expect(screen.getByTestId("join-here-go").closest("[hidden]")).not.toBeNull();
  });
});
