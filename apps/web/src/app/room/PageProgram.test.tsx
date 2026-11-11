/**
 * The program's banner over a page of the room's project, on the Mac and the web (ADR 0227's
 * addendum of 9 November 2026, Arjun's B): Run and Stop over the page, and a link handed over by
 * the page's frame asked about in the banner itself. In a browser, Run and open runs it on the
 * person's Mac and offers Open once it runs; on the Mac, it waits for the page to answer and opens
 * it. localhost in a browser elsewhere is not the Mac; somebody else reads whose Mac it runs on.
 */

import type { LinkSeen, Universe } from "@chipschat/core";
import type { HeldRun, ProjectRun } from "@chipschat/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderState, Folders } from "../folders.ts";
import { answersWithin } from "./answers.ts";
import { ProjectDocument, type ProjectDocuments } from "./ProjectDocument.tsx";

vi.mock("./answers.ts", () => ({ answersWithin: vi.fn(async () => true) }));

const LABS = "https://mac-mini.example.ts.net:8443/overview.html";
const RUN = "python3 app/server.py";
const START = ".chips/index.html";

const universe = (program = true) =>
  ({
    documents: { start: START },
    ...(program ? { program: { run: RUN } } : {}),
  }) as unknown as Universe;

/** A browser's project: the press goes to the person's Mac, whose word comes back. */
function away(over: Partial<ProjectDocuments> = {}) {
  const listeners: ((run: HeldRun) => void)[] = [];
  const ask = vi.fn(async () => ({ macs: 1 }));
  const openLink = vi.fn();
  const project: ProjectDocuments = {
    file: async () => ({ bytes: new Uint8Array(), type: "text/plain" }),
    page: async () => `<a href="${LABS}" data-chips-address="">Labs</a>`,
    pageUrl: async () => undefined,
    universe: async () => universe(),
    onTheMac: async () => true,
    ownerName: () => "Arjun",
    openLink,
    runs: {
      room: "sp_1",
      ask,
      read: async () => ({ macs: 1 }) as never,
      heard: (listen) => {
        listeners.push(listen);
        return () => undefined;
      },
    },
    ...over,
  };
  const tell = (run: Partial<HeldRun>) =>
    act(() => {
      for (const listen of listeners) {
        listen({
          mac: "Mac mini",
          said_at: new Date().toISOString(),
          command: RUN,
          ...run,
        } as HeldRun);
      }
    });
  return { project, ask, openLink, tell };
}

/** The Mac app's project: Run runs it here, from the room's folder. */
function onTheMac() {
  let state: FolderState = {};
  const listeners: (() => void)[] = [];
  const set = (next: FolderState) => {
    state = next;
    for (const listen of listeners) listen();
  };
  const run = vi.fn(async (_room: unknown, op: string) => {
    set({ run: op === "run" ? { state: "starting", command: RUN } : { state: "stopped" } });
  });
  const folders = {
    available: async () => true,
    runsHere: async () => true,
    state: () => state,
    subscribe: (listen: () => void) => {
      listeners.push(listen);
      return () => undefined;
    },
    run,
  } as unknown as Folders;
  const openLink = vi.fn();
  const project: ProjectDocuments = {
    file: async () => ({ bytes: new Uint8Array(), type: "text/plain" }),
    page: async () => `<a href="${LABS}" data-chips-address="">Labs</a>`,
    pageUrl: async () => undefined,
    universe: async () => universe(),
    folders,
    onTheMac: folders.runsHere,
    room: () => ({ id: "sp_1", title: "Health" }),
    openLink,
  };
  const tell = (next: ProjectRun) => act(() => set({ run: next }));
  return { project, run, openLink, tell };
}

async function openPage(project: ProjectDocuments) {
  render(
    <ProjectDocument
      path={START}
      project={project}
      files={undefined}
      onFile={() => undefined}
      onClose={() => undefined}
    />,
  );
  const frame = (await screen.findByTestId("project-page-view")) as HTMLIFrameElement;
  const told = vi.spyOn(frame.contentWindow as Window, "postMessage");
  fireEvent.load(frame);
  return { frame, told };
}

/** A link on the page handed over by the page's own frame, with the name the page gave it. */
function handOver(frame: HTMLIFrameElement, url: string, words?: string) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { chipsAddress: url, chipsWords: words ?? null },
        source: frame.contentWindow,
      }),
    );
  });
}

const title = () => screen.getByTestId("page-banner-title").textContent;
const words = () => screen.queryByTestId("page-banner-words")?.textContent;

beforeEach(() => {
  vi.mocked(answersWithin).mockClear();
  vi.mocked(answersWithin).mockResolvedValue(true);
});
afterEach(() => cleanup());

describe("the banner over a page, in a browser", () => {
  it("says it isn't running, with Run, and has the frame hand every address over", async () => {
    const { project } = away();
    const { told } = await openPage(project);
    expect(await screen.findByText("Program isn’t running")).toBeTruthy();
    expect(words()).toBe("Some links here open only while it runs on your Mac.");
    expect(screen.getByTestId("page-banner-run")).toBeTruthy();
    await vi.waitFor(() => expect(told).toHaveBeenCalledWith({ chipsAsks: "every" }, "*"));
  });

  it("asks about a link handed over, and Open anyway opens it", async () => {
    const { project, openLink } = away();
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, LABS);
    expect(title()).toBe("This link needs the program running");
    expect(screen.getByTestId("page-banner-address").textContent).toBe(
      "mac-mini.example.ts.net:8443/overview.html",
    );
    expect(openLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("page-banner-ask-anyway"));
    expect(openLink).toHaveBeenCalledWith(LABS);
    expect(title()).toBe("Program isn’t running");
  });

  it("runs it on the Mac for Run and open, and offers Open once it runs", async () => {
    const { project, ask, openLink, tell } = away();
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, LABS);
    await act(async () => fireEvent.click(screen.getByTestId("page-banner-ask-go")));
    expect(ask).toHaveBeenCalledWith({ op: "run", command: RUN });
    expect(title()).toBe("Starting on your Mac");
    expect(screen.queryByTestId("page-banner-ask-anyway")).toBeNull();
    tell({ state: "starting" });
    tell({ state: "running", since: new Date().toISOString() });
    expect(title()).toBe("Running on your Mac");
    expect(words()).toBe("Open the page once it’s up.");
    // A browser can't ask the address, and opens a window only on a press.
    expect(answersWithin).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("page-banner-ask-go"));
    expect(openLink).toHaveBeenCalledWith(LABS);
  });

  it("says when no Mac heard Run and open", async () => {
    const { project, ask } = away();
    ask.mockResolvedValue({ macs: 0 });
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, LABS);
    await act(async () => fireEvent.click(screen.getByTestId("page-banner-ask-go")));
    expect(title()).toBe("Your Mac didn’t hear it");
    expect(words()).toBe(
      "Chips for Mac isn't open, so nothing ran. Open Chips on your Mac and press again.",
    );
  });

  it("hands only localhost over while it runs, and says it opens only on the Mac", async () => {
    const { project, openLink, tell } = away();
    const { frame, told } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", since: new Date().toISOString() });
    await vi.waitFor(() => expect(told).toHaveBeenLastCalledWith({ chipsAsks: "own" }, "*"));
    handOver(frame, "http://localhost:4173/home.html");
    expect(words()).toBe("localhost opens only on your Mac.");
    expect(openLink).not.toHaveBeenCalled();
  });

  it("hears an address from the page's own frame and nothing else", async () => {
    const { project } = away();
    await openPage(project);
    await screen.findByText("Program isn’t running");
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { chipsAddress: LABS } }));
    });
    expect(title()).toBe("Program isn’t running");
  });
});

describe("the banner over a page, on the Mac", () => {
  it("runs it here, waits for the page to answer, and opens it in the Mac's browser", async () => {
    const { project, run, openLink, tell } = onTheMac();
    const { frame, told } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, LABS);
    await act(async () => fireEvent.click(screen.getByTestId("page-banner-ask-go")));
    expect(run).toHaveBeenCalledWith({ id: "sp_1", title: "Health" }, "run", { command: RUN });
    expect(title()).toBe("Starting on your Mac");
    tell({ state: "running", command: RUN, since: new Date().toISOString() });
    await vi.waitFor(() => expect(openLink).toHaveBeenCalledWith(LABS));
    expect(answersWithin).toHaveBeenCalledWith(LABS, 20_000, expect.anything());
    expect(title()).toBe("Running on your Mac");
    // Running on the Mac, every address is still handed over: the Mac looks at one only some
    // devices reach before it opens it (10 November 2026), and opens the rest at once.
    await vi.waitFor(() => expect(told).toHaveBeenLastCalledWith({ chipsAsks: "every" }, "*"));
  });

  it("says when the page doesn't answer, and opens it anyway on a press", async () => {
    vi.mocked(answersWithin).mockResolvedValue(false);
    const { project, openLink, tell } = onTheMac();
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, LABS);
    await act(async () => fireEvent.click(screen.getByTestId("page-banner-ask-go")));
    tell({ state: "running", command: RUN, since: new Date().toISOString() });
    expect(await screen.findByText("The page isn’t answering yet")).toBeTruthy();
    expect(openLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("page-banner-ask-go"));
    expect(openLink).toHaveBeenCalledWith(LABS);
  });

  it("takes localhost here as an address that needs the program", async () => {
    const { project } = onTheMac();
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, "http://localhost:4173/home.html");
    expect(title()).toBe("This link needs the program running");
  });
});

describe("the banner for anybody else, and where there is no program", () => {
  it("tells somebody who isn't the owner whose Mac it runs on, and hands nothing over", async () => {
    const { project } = away({ onTheMac: async () => false });
    const { told } = await openPage(project);
    expect(await screen.findByText("Runs on Arjun’s Mac")).toBeTruthy();
    expect(screen.queryByTestId("page-banner-run")).toBeNull();
    expect(told).not.toHaveBeenCalled();
  });

  it("draws no banner over a page whose space has no program", async () => {
    const { project } = away({ universe: async () => universe(false) });
    await openPage(project);
    await act(async () => undefined);
    expect(screen.queryByTestId("page-banner")).toBeNull();
  });
});

describe("a link through Tailscale, on the Mac (10 November 2026)", () => {
  const off: LinkSeen = { found: false, tailscale: false, otherVpn: false, installed: true };

  /** The Mac app's project, which looks at a link before it opens it. */
  function looking(seen: LinkSeen, tunnels?: Pick<LinkSeen, "tailscale">) {
    const mac = onTheMac();
    const look = vi.fn(
      async (_url: string, ask: boolean): Promise<LinkSeen> => ({
        ...seen,
        answered: ask ? seen.answered : undefined,
      }),
    );
    const openTailscale = vi.fn();
    const project: ProjectDocuments = {
      ...mac.project,
      look,
      openTailscale,
      tunnels: tunnels === undefined ? undefined : async () => tunnels,
    };
    return { ...mac, project, look, openTailscale };
  }

  it("names the link and says Tailscale is off on this Mac, then opens it once it's on", async () => {
    const { project, look, openTailscale, openLink, tell } = looking(off);
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", command: RUN, since: new Date().toISOString() });
    handOver(frame, LABS, "Labs");
    await vi.waitFor(() => expect(title()).toBe("Labs needs Tailscale"));
    expect(words()).toBe("Tailscale is off on this Mac. Turn it on, and Chips opens Labs.");
    expect(openLink).not.toHaveBeenCalled();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId("page-banner-ask-go"));
      expect(openTailscale).toHaveBeenCalledWith(false);
      expect(title()).toBe("Waiting for Tailscale");
      look.mockResolvedValue({ found: true, tailscale: true, otherVpn: false, installed: true });
      await act(async () => vi.advanceTimersByTime(1600));
      expect(answersWithin).toHaveBeenCalledWith(LABS, 10_000, expect.anything());
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(openLink).toHaveBeenCalledWith(LABS));
  });

  it("opens a link through Tailscale at once when the Mac is on the tailnet and it answers", async () => {
    const { project, openLink, tell } = looking({ ...off, found: true, answered: true });
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", command: RUN, since: new Date().toISOString() });
    handOver(frame, LABS, "Labs");
    await vi.waitFor(() => expect(openLink).toHaveBeenCalledWith(LABS));
    expect(screen.queryByTestId("page-banner-address")).toBeNull();
  });

  it("offers Get Tailscale where it isn't installed", async () => {
    const { project, openTailscale, tell } = looking({ ...off, installed: false });
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", command: RUN, since: new Date().toISOString() });
    handOver(frame, LABS, "Labs");
    await vi.waitFor(() => expect(title()).toBe("Labs needs Tailscale"));
    expect(screen.getByTestId("page-banner-ask-go").textContent).toBe("Get Tailscale");
    fireEvent.click(screen.getByTestId("page-banner-ask-go"));
    expect(openTailscale).toHaveBeenCalledWith(true);
  });

  it("says something is in Tailscale's way when it's on and the name isn't found", async () => {
    const { project, tell } = looking({ ...off, tailscale: true });
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", command: RUN, since: new Date().toISOString() });
    handOver(frame, LABS);
    await vi.waitFor(() => expect(title()).toBe("This Mac can’t find mac-mini"));
  });

  it("says Tailscale comes first while the program isn't running", async () => {
    const { project, look } = looking(off);
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    handOver(frame, LABS, "Labs");
    await vi.waitFor(() =>
      expect(words()).toBe(
        "Tailscale is off on this Mac, and the program isn’t running. Turn Tailscale on first.",
      ),
    );
    expect(look).toHaveBeenCalledWith(LABS, false, expect.anything());
  });

  it("says on the banner, before a click, that the page's links need Tailscale", async () => {
    const { project } = looking(off, { tailscale: false });
    await openPage({ ...project, page: async () => `<a href="${LABS}">Labs</a>` });
    await vi.waitFor(() =>
      expect(words()).toBe("Links here need it running, and Tailscale, which is off on this Mac."),
    );
  });

  it("tells somebody who isn't the owner it's on the owner's tailnet", async () => {
    const { project } = looking(off);
    const { frame, told } = await openPage({
      ...project,
      onTheMac: async () => false,
      ownerName: () => "Arjun",
    });
    expect(await screen.findByText("Runs on Arjun’s Mac")).toBeTruthy();
    await vi.waitFor(() => expect(told).toHaveBeenCalledWith({ chipsAsks: "every" }, "*"));
    handOver(frame, LABS, "Labs");
    await vi.waitFor(() => expect(title()).toBe("Labs is on Arjun’s tailnet"));
    expect(screen.queryByTestId("page-banner-ask-go")).toBeNull();
  });
});

describe("a link through Tailscale, in a browser", () => {
  it("says, after the link opened, what it needed", async () => {
    const { project, tell } = away();
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", since: new Date().toISOString() });
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { chipsOpened: LABS, chipsWords: "Labs" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(words()).toBe(
      "Labs goes through Tailscale. If it didn’t open, turn Tailscale on on this computer.",
    );
  });

  it("says nothing after a link on the web opened", async () => {
    const { project, tell } = away();
    const { frame } = await openPage(project);
    await screen.findByText("Program isn’t running");
    tell({ state: "running", since: new Date().toISOString() });
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { chipsOpened: "https://chipschat.ai/", chipsWords: "Site" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(words()).not.toContain("Site");
  });
});
