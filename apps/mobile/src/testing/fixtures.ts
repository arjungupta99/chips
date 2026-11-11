/**
 * Enough of a snapshot and a store for a screen test. Not a fold — the fold has its own tests
 * in core, and building one here would test that instead of the screen.
 *
 * `store` records what it was asked to do, so a test asserts on the call the screen made rather
 * than on a spy hung off a prop: the screens take a real `Store` and the point is what reaches
 * it.
 */

import type { Approval, NeedsYouItem, Snapshot, Store } from "@chipschat/core";

export interface Recorded {
  readonly name: string;
  readonly args: unknown;
}

export function fakeStore(snapshot: Snapshot): Store & {
  readonly calls: Recorded[];
  readonly tellRun: (spaceId: string, run: unknown) => void;
} {
  const calls: Recorded[] = [];
  const runListeners = new Set<(spaceId: string, run: unknown) => void>();
  const record =
    (name: string) =>
    (args: unknown): void => {
      calls.push({ name, args });
    };
  return {
    calls,
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    resolveApproval: record("resolveApproval"),
    routeApproval: record("routeApproval"),
    stopLetWork: record("stopLetWork"),
    letAgentWork: record("letAgentWork"),
    closeBanner: async (input: unknown) => {
      calls.push({ name: "closeBanner", args: input });
    },
    reopenBanner: async (input: unknown) => {
      calls.push({ name: "reopenBanner", args: input });
    },
    setAgentBanner: async (agentId: string, shown: boolean) => {
      calls.push({ name: "setAgentBanner", args: { agentId, shown } });
    },
    setHarnessBanner: (harnessId: string, shown: boolean) => {
      calls.push({ name: "setHarnessBanner", args: { harnessId, shown } });
      return { harnessId, shown: undefined, apart: {} };
    },
    undoHarnessBanner: async (before: unknown) => {
      calls.push({ name: "undoHarnessBanner", args: before });
    },
    answerQuestion: record("answerQuestion"),
    setAutonomy: record("setAutonomy"),
    setRules: record("setRules"),
    send: record("send"),
    sendFeedback: record("sendFeedback"),
    deleteMessage: record("deleteMessage"),
    hideMessage: record("hideMessage"),
    showMessage: record("showMessage"),
    editMessage: record("editMessage"),
    pinMessage: record("pinMessage"),
    unpinMessage: record("unpinMessage"),
    leaveSpace: record("leaveSpace"),
    updateSpace: record("updateSpace"),
    addMember: record("addMember"),
    removeMember: record("removeMember"),
    steerRun: record("steerRun"),
    setAttachmentCaps: record("setAttachmentCaps"),
    setExchangeLimits: record("setExchangeLimits"),
    serverLimits: async () => ({ maxAttachmentBytes: 104_857_600, maxMessageBytes: 65_536 }),
    serverFacts: async () => ({
      machine: "Mac mini",
      version: "1.0.0",
      publicUrl: "http://192.168.1.4:4431",
      relay: { url: undefined, status: "off" },
      pushes: "ready",
    }),
    pauseRun: record("pauseRun"),
    resumeRun: record("resumeRun"),
    stopRun: record("stopRun"),
    createSpace: (input: unknown) => {
      calls.push({ name: "createSpace", args: input });
      return "sp_new";
    },
    openThread: (input: { spaceId: string; lineId: string }) => {
      calls.push({ name: "openThread", args: input });
      return "sp_thread";
    },
    search: async (input: unknown) => {
      calls.push({ name: "search", args: input });
      return { hits: [], nextCursor: null };
    },
    loadSpaceIcons: async () => {
      calls.push({ name: "loadSpaceIcons", args: undefined });
    },
    setSpaceIcon: async (spaceId: string, icon: unknown) => {
      calls.push({ name: "setSpaceIcon", args: { spaceId, icon } });
    },
    loadHiddenSpaces: async () => {
      calls.push({ name: "loadHiddenSpaces", args: undefined });
    },
    setSpaceHidden: async (spaceId: string, hidden: boolean) => {
      calls.push({ name: "setSpaceHidden", args: { spaceId, hidden } });
    },
    loadPinnedSpaces: async () => {
      calls.push({ name: "loadPinnedSpaces", args: undefined });
    },
    setSpacePinned: async (spaceId: string, pinned: boolean) => {
      calls.push({ name: "setSpacePinned", args: { spaceId, pinned } });
    },
    // The one call that does not take a single object; recorded as one, so a test reads the
    // same way whichever method it is asserting on.
    markRead: (spaceId: string, seq: number) =>
      calls.push({ name: "markRead", args: { spaceId, seq } }),
    markSpacesRead: (spaceIds: readonly string[]) =>
      calls.push({ name: "markSpacesRead", args: spaceIds }),
    moveAgent: async (agentId: string, spaceId: string) => {
      calls.push({ name: "moveAgent", args: { agentId, spaceId } });
    },
    forkAgent: async (agentId: string, spaceId: string) => {
      calls.push({ name: "forkAgent", args: { agentId, spaceId } });
    },
    askAgent: async (harnessId: string, spaceId: string, name?: string) => {
      calls.push({ name: "askAgent", args: { harnessId, spaceId, name } });
    },
    takeArrival: (spaceId: string) => {
      calls.push({ name: "takeArrival", args: { spaceId } });
      return undefined;
    },
    forkIntoNewRoom: async (agentId: string, title: string) => {
      calls.push({ name: "forkIntoNewRoom", args: { agentId, title } });
      return "sp_new";
    },
    askIntoNewRoom: async (harnessId: string, name: string) => {
      calls.push({ name: "askIntoNewRoom", args: { harnessId, name } });
      return "sp_asked";
    },
    dismissNotice: (spaceId: string) => {
      calls.push({ name: "dismissNotice", args: spaceId });
    },
    setAgentFace: async (agentId: string, face: unknown) => {
      calls.push({ name: "setAgentFace", args: { agentId, face } });
    },
    setMyFace: async (face: unknown) => {
      calls.push({ name: "setMyFace", args: { face } });
    },
    renameAgent: async (agentId: string, name: string) => {
      calls.push({ name: "renameAgent", args: { agentId, name } });
    },
    setAgentArchived: async (agentId: string, archived: boolean) => {
      calls.push({ name: "setAgentArchived", args: { agentId, archived } });
    },
    setAgentLock: async (agentId: string, locked: boolean) => {
      calls.push({ name: "setAgentLock", args: { agentId, locked } });
    },
    setExchange: async (spaceId: string, state: string) => {
      calls.push({ name: "setExchange", args: { spaceId, state } });
    },
    setLead: async (spaceId: string, agentId: string | null) => {
      calls.push({ name: "setLead", args: { spaceId, agentId } });
    },
    setSpendCeiling: async (spaceId: string, usd: number | null, options?: unknown) => {
      calls.push({
        name: "setSpendCeiling",
        args: { spaceId, usd, ...(options === undefined ? {} : { options }) },
      });
    },
    setLock: async (spaceId: string, locked: boolean) => {
      calls.push({ name: "setLock", args: { spaceId, locked } });
    },
    notificationSettings: () => ({ decide: "now", review: "hourly", fyi: "daily", harnesses: {} }),
    loadNotificationSettings: async () => ({
      decide: "now",
      review: "hourly",
      fyi: "daily",
      harnesses: {},
    }),
    saveNotificationSettings: async (settings: unknown) => {
      calls.push({ name: "saveNotificationSettings", args: settings });
    },
    roomSpend: async (spaceId: string) => {
      calls.push({ name: "roomSpend", args: spaceId });
      return { ceiling_usd: 3, spent_usd: 1.23, since_seq: 40, uncounted_runs: 0 };
    },
    roomJobs: async (spaceId: string, before?: number) => {
      calls.push({ name: "roomJobs", args: { spaceId, before } });
      return { space_id: spaceId, jobs: [] };
    },
    deleteAgent: async (agentId: string, options: unknown) => {
      calls.push({ name: "deleteAgent", args: { agentId, options } });
    },
    eraseSpace: async (spaceId: string, options: unknown) => {
      calls.push({ name: "eraseSpace", args: { spaceId, options } });
    },
    refreshDirectory: async () => undefined,
    wake: () => {
      calls.push({ name: "wake", args: undefined });
    },
    agentStays: async (agentId: string) => {
      calls.push({ name: "agentStays", args: agentId });
      return [];
    },
    roomFiles: async (spaceId: string) => {
      calls.push({ name: "roomFiles", args: spaceId });
      return [];
    },
    fileVersions: async (spaceId: string, name: string) => {
      calls.push({ name: "fileVersions", args: { spaceId, name } });
      return [];
    },
    // The gallery's cards (ADR 0171): none, unless a test hands some.
    connectors: async () => [],
    // Join requests (ADR 0122): what was asked of the store, and an answer of the right shape.
    makeJoinLink: async (capabilities: readonly string[]) => {
      calls.push({ name: "makeJoinLink", args: capabilities });
      return {
        request: { requestId: "jrq_link", state: "allowed", capabilities },
        link: "http://192.168.1.20:4431/j/chips_j_testlink_0123456789abcdef",
      };
    },
    allowJoin: async (
      requestId: string,
      capabilities: readonly string[],
      code?: string,
      as?: string,
    ) => {
      calls.push({
        name: "allowJoin",
        args: {
          requestId,
          capabilities,
          ...(code === undefined ? {} : { code }),
          ...(as === undefined ? {} : { as }),
        },
      });
      return { requestId, state: "allowed", capabilities };
    },
    denyJoin: async (requestId: string) => {
      calls.push({ name: "denyJoin", args: requestId });
      return { requestId, state: "denied" };
    },
    joinRequest: async (requestId: string) => {
      calls.push({ name: "joinRequest", args: requestId });
      return { requestId };
    },
    // People (people review, Phase 1): no open links, and what was asked of the store.
    invites: async () => [],
    // Somebody's devices on their page (ADR 0209): none here.
    personDevices: async (personId: string) => {
      calls.push({ name: "personDevices", args: personId });
      return [];
    },
    revokeInvite: async (inviteId: string) => {
      calls.push({ name: "revokeInvite", args: inviteId });
    },
    // A link made, into a space or not (ADR 0168), and somebody let into one by its link.
    createInvite: async (input: { role: string; spaceId?: string }) => {
      calls.push({ name: "createInvite", args: input });
      return {
        inviteId: "inv_made",
        role: input.role,
        singleUse: true,
        url: "https://chips.test/#invite=chips_inv_made",
        expiresAt: "2099-10-21T00:00:00.000Z",
        spaceId: input.spaceId,
      };
    },
    enterByInvite: async (token: string) => {
      calls.push({ name: "enterByInvite", args: token });
      return { spaceId: "sp_1", already: false };
    },
    changeRole: record("changeRole"),
    removePerson: async (participantId: string) => {
      calls.push({ name: "removePerson", args: participantId });
    },
    deleteAccount: record("deleteAccount"),
    // The room's project (ADR 0222): two files, and a change to one of them.
    projectFiles: async () => ({
      at: "c".repeat(40),
      files: [
        { path: "index.html", bytes: 120, type: "text/html" },
        { path: "src/game.js", bytes: 2048, type: "text/javascript" },
      ],
    }),
    projectFile: async (_spaceId: string, path: string) => {
      // No run file: nothing says how it runs (ADRs 0226, 0227).
      if (path === "chips.json" || path === ".chips/run.json") {
        throw new Error("That file isn't in the project.");
      }
      return path.endsWith(".html")
        ? { bytes: new TextEncoder().encode("<h1>The game</h1>"), type: "text/html" }
        : { bytes: new TextEncoder().encode("export const a = 2;\n"), type: "text/javascript" };
    },
    projectHistory: async (_spaceId: string, path: string) => ({ path, versions: [] }),
    projectChange: async (_spaceId: string, commit: string) => ({
      commit,
      parent: null,
      by: { name: "Hello", id: "agt_hello" },
      at: "2026-10-23T10:00:00.000Z",
      message: "Two, not one",
      files: [
        {
          path: "src/game.js",
          added: 1,
          removed: 1,
          patch: "@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;",
          cut: false,
        },
      ],
    }),
    projectPage: async (_spaceId: string, path: string) => `<h1>${path}</h1>`,
    projectArchive: async (spaceId: string) => {
      calls.push({ name: "projectArchive", args: { spaceId } });
      return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    },
    openFolderOnMac: async (spaceId: string) => {
      calls.push({ name: "openFolderOnMac", args: { spaceId } });
      return { macs: spaceId === "sp_nomac" ? 0 : 1 };
    },
    openPageOnMac: async (spaceId: string) => {
      calls.push({ name: "openPageOnMac", args: { spaceId } });
      return { macs: spaceId === "sp_nomac" ? 0 : 1 };
    },
    // Run (ADR 0226): the press goes to the person's Mac, and `tellRun` is that Mac's word back.
    runOnMac: async (spaceId: string, ask: unknown) => {
      calls.push({ name: "runOnMac", args: { spaceId, ask } });
      return { macs: spaceId === "sp_nomac" ? 0 : 1 };
    },
    projectRun: async () => ({ macs: 1 }),
    sayRun: async () => undefined,
    onRunState: (listen: (spaceId: string, run: unknown) => void) => {
      runListeners.add(listen);
      return () => void runListeners.delete(listen);
    },
    tellRun: (spaceId: string, run: unknown) => {
      for (const listen of runListeners) listen(spaceId, run);
    },
    undoChange: async (spaceId: string, commit: string) => {
      calls.push({ name: "undoChange", args: { spaceId, commit } });
      return { after: "u".repeat(40) };
    },
  } as unknown as Store & {
    readonly calls: Recorded[];
    readonly tellRun: (spaceId: string, run: unknown) => void;
  };
}

export function approval(over: Partial<Approval> = {}): Approval {
  return {
    approvalId: "apr_1",
    runId: "run_1",
    actionKind: "email.send",
    askedAt: "2026-09-07T10:00:00.000Z",
    risk: ["external_communication"],
    sources: [],
    editable: true,
    fallback: "deny",
    approvers: [],
    ...over,
  };
}

export function needsItem(over: Partial<NeedsYouItem> = {}): NeedsYouItem {
  return {
    kind: "approval",
    tier: "decide",
    id: "apr_1",
    spaceId: "sp_1",
    runId: "run_1",
    harnessId: "har_scout",
    title: "Send an email to dana@northwind.com",
    seq: 12,
    ...over,
  };
}

export function snapshot(
  over: {
    readonly needsYou?: readonly NeedsYouItem[];
    readonly approvals?: readonly Approval[];
    readonly questions?: readonly unknown[];
    readonly busy?: ReadonlySet<string>;
    readonly connection?: Snapshot["connection"];
    readonly members?: readonly string[];
  } = {},
): Snapshot {
  return {
    connection: over.connection ?? "open",
    link: "direct",
    busy: over.busy ?? new Set<string>(),
    receipts: new Map(),
    readState: {},
    spaceIcons: new Map(),
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
      per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
      har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
    },
    model: {
      needsYou: over.needsYou ?? [needsItem()],
      lanes: [],
      spaces: [
        {
          id: "sp_1",
          kind: "room",
          members: over.members ?? ["per_arjun", "per_dana", "har_scout"],
          roles: {},
          runs: [{ approvals: over.approvals ?? [approval()], questions: over.questions ?? [] }],
        },
      ],
      people: {
        per_arjun: {
          participantId: "per_arjun",
          displayName: "Arjun",
          role: "owner",
          joinedAt: "2026-09-01T00:00:00.000Z",
        },
        per_dana: {
          participantId: "per_dana",
          displayName: "Dana Ruiz",
          role: "member",
          joinedAt: "2026-09-02T00:00:00.000Z",
        },
      },
    },
  } as unknown as Snapshot;
}
