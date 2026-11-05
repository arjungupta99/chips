/**
 * The shell against a fake store: what a person sees, and what their clicks send. One behaviour
 * per test, driven by the golden scenario's fixtures so the screens are tested against real
 * event shapes. The real store, socket and cache are `packages/core`'s and Playwright's.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildModel,
  type ChangeRoleInput,
  type ClientEvent,
  type CreateInviteInput,
  type Device,
  type Directory,
  type FeedbackInput,
  type HarnessToken,
  HTML_POLICY,
  type JoinRequest,
  type LineInput,
  type MemberInput,
  type Participant,
  quietWords,
  type RoomFileOf,
  type RouteApprovalInput,
  type SearchInput,
  type SearchPage,
  type ServerFacts,
  type Snapshot,
  type Store,
  THINKING_GRACE_MS,
  type UpdateSpaceInput,
  withHidden,
} from "@chipschat/core";
import type { HeldRun, SpaceIcon } from "@chipschat/protocol";
import {
  type AttachmentCaps,
  type Connector,
  DEFAULT_NOTIFICATION_SETTINGS,
  type ExchangeLimits,
  type NotificationSettings,
} from "@chipschat/protocol";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { type FakeFiles, fakeFiles as sharedFakeFiles } from "../testing/files.ts";
import { installMicrophone } from "../testing/microphone.ts";
import { chooseInWorkspaces, menuRows, openWorkspaces } from "../testing/workspaces.ts";
import { forgetFirstRunFlags } from "./firstRun.ts";
import { passkeysWorkHere, Shell } from "./Shell.tsx";
import { seedField } from "./SpaceView.tsx";

// Not `new URL(…, import.meta.url)`: under jsdom the module URL is `http://localhost/…`.
const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;

const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX000000000000000009";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
const SPACE = "spc_01K4ZQPX000000000000000002";
const RUN = "run_01K4ZQPX000000000000000005";
/** What an HTML page is drawn under, first in its document (ADR 0059's addendum). */
const HTML_META = `<meta http-equiv="Content-Security-Policy" content="${HTML_POLICY}">`;
/** A thread the log holds (M5.4): kept off the list, and opened by nothing but a search hit. */
const THREAD = "spc_01K4ZQPX00000000000000000T";
const APPROVAL = "apr_01K4ZQPX000000000000000006";

const DEVICE: Device = {
  deviceId: "dev_01K4ZQPX000000000000000008",
  participantId: ARJUN,
  workspaceId: "ws_01K4ZQPX000000000000000001",
  displayName: "Arjun",
  // Never used to sign here: nothing in the shell signs.
  privateKey: {} as CryptoKey,
};

const LEDGER = "hrn_01K4ZQPX00000000000000000B";
const HOME = "spc_01K4ZQPX00000000000000000C";
const LEDGER_RUN = "run_01K4ZQPX00000000000000000D";
const HERMES = "hrn_01K4ZQPX00000000000000000E";
/** The id the fake store gives a space a person opens. */
const NEW_SPACE = "spc_01K4ZQPX00000000000000000F";

const DIRECTORY: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [SCOUT]: {
    id: SCOUT,
    kind: "harness",
    displayName: "Scout",
    ownerId: ARJUN,
    capabilities: ["autonomy"],
  },
  [LEDGER]: { id: LEDGER, kind: "harness", displayName: "Ledger", ownerId: ARJUN },
};

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const person = (id: string) => ({ kind: "person", id });
const harness = (id: string) => ({ kind: "harness", id });

/** Arjun as the workspace's owner, who alone opens spaces with an admin (ADR 0196). */
function ownerJoined(seq = 0): ClientEvent {
  return fixture("person.joined", seq, {
    participant_id: ARJUN,
    display_name: "Arjun",
    role: "owner",
    invite_id: undefined,
    invited_by: undefined,
    actor: person(ARJUN),
  });
}

/** The demo space: opened by Arjun, with Scout and Dana in it. */
function opened(): ClientEvent[] {
  return [
    fixture("space.created", 1, { actor: person(ARJUN), title: "PO-4471", kind: "group" }),
    fixture("membership.added", 2, {
      actor: person(ARJUN),
      participant_id: SCOUT,
      participant_kind: "harness",
    }),
    fixture("membership.added", 3, {
      actor: person(ARJUN),
      participant_id: DANA,
      participant_kind: "person",
    }),
  ];
}

/** PO-4471 up to the point where Scout is waiting on a person. */
function asking(): ClientEvent[] {
  return [...opened(), fixture("run.started", 4), fixture("approval.request", 5)];
}

interface Extra {
  readonly connection?: Snapshot["connection"];
  readonly model?: Snapshot["model"];
  readonly busy?: Snapshot["busy"];
  readonly receipts?: Snapshot["receipts"];
  readonly spaceIcons?: Snapshot["spaceIcons"];
  readonly hiddenSpaces?: Snapshot["hiddenSpaces"];
  readonly pinnedSpaces?: Snapshot["pinnedSpaces"];
  readonly directory?: Directory;
  readonly notices?: Snapshot["notices"];
  readonly joins?: Snapshot["joins"];
  readonly awaiting?: number;
  readonly unsentNotes?: Snapshot["unsentNotes"];
}

function snapshotOf(events: ClientEvent[], extra: Extra = {}): Snapshot {
  return {
    connection: extra.connection ?? "open",
    model: extra.model ?? buildModel(events),
    directory: extra.directory ?? DIRECTORY,
    // The server has said who is who: the Agents page lists them (`agentsLook`, ADR 0166).
    directoryFrom: "server",
    readState: {},
    busy: extra.busy ?? new Set(),
    receipts: extra.receipts ?? new Map(),
    spaceIcons: extra.spaceIcons ?? new Map(),
    ...(extra.hiddenSpaces === undefined ? {} : { hiddenSpaces: extra.hiddenSpaces }),
    ...(extra.pinnedSpaces === undefined ? {} : { pinnedSpaces: extra.pinnedSpaces }),
    ...(extra.notices === undefined ? {} : { notices: extra.notices }),
    ...(extra.joins === undefined ? {} : { joins: extra.joins }),
    ...(extra.awaiting === undefined ? {} : { awaiting: extra.awaiting }),
    ...(extra.unsentNotes === undefined ? {} : { unsentNotes: extra.unsentNotes }),
  };
}

interface FakeStore extends Store {
  readonly sent: Parameters<Store["send"]>[0][];
  readonly discarded: string[];
  readonly resolved: Parameters<Store["resolveApproval"]>[0][];
  readonly answered: Parameters<Store["answerQuestion"]>[0][];
  readonly dialed: Parameters<Store["setAutonomy"]>[0][];
  readonly ruled: Parameters<Store["setRules"]>[0][];
  readonly read: [string, number][];
  readonly readMany: (readonly string[])[];
  /** Spaces this device has left. */
  readonly left: string[];
  /** Harnesses added by name. */
  readonly added: string[];
  /** Agents moved into a room (ADR 0087). */
  readonly moved: { agentId: string; spaceId: string }[];
  readonly agentsRenamed: { agentId: string; name: string }[];
  readonly agentsArchived: { agentId: string; archived: boolean }[];
  /** Agents whose changes were locked or let go (ADR 0199), and what the next one answers. */
  readonly agentLocks: { agentId: string; locked: boolean }[];
  agentLockRefusal: string | undefined;
  /** The agents paused or let go on, room by room (ADR 0097). */
  readonly exchanges: { spaceId: string; state: "paused" | "going" }[];
  readonly leads: { spaceId: string; agentId: string | null }[];
  readonly ceilings: { spaceId: string; usd: number | null }[];
  /** Rooms whose changes were locked or let go (ADR 0156), and what the next one answers. */
  readonly locks: { spaceId: string; locked: boolean }[];
  lockRefusal: string | undefined;
  readonly agentsDeleted: { agentId: string; deleteRoom: boolean }[];
  readonly forked: { agentId: string; spaceId: string }[];
  /** The new agents asked for (ADR 0108), and the @ the field is handed next, once. */
  readonly askedFor: { harnessId: string; spaceId: string; name: string | undefined }[];
  arrival: string | undefined;
  /** The tokens each harness holds, by harness id, and what the screen did to them. */
  readonly heldTokens: Map<string, HarnessToken[]>;
  readonly revoked: [string, string][];
  /** Every run command, in order: `pause`, `resume`, `stop` or `steer`, with its input. */
  readonly runCommands: { verb: string; input: unknown }[];
  /** Which visit each space is pinned to (ADR 0040), and every pin asked for in order. */
  readonly sessionPins: Map<string, string>;
  readonly sessionPinned: { spaceId: string; sessionRef: string | undefined }[];
  /** Group spaces (M3.3): the titles opened, the members added and removed, the changes. */
  readonly createdSpaces: string[];
  /** Rooms asked of a harness from the + (Phase 4), by the harness asked, and their names (ADR 0149). */
  readonly askedOf: string[];
  readonly askedTitles: string[];
  /** The order the calls that make a room came in: `createSpace`, `addMember`, `send`. */
  readonly calls: string[];
  readonly membersAdded: MemberInput[];
  readonly membersRemoved: { spaceId: string; participantId: string }[];
  readonly spaceUpdates: UpdateSpaceInput[];
  /** Spaces erased from the server (ADR 0067), and what the next erase answers. */
  readonly erased: string[];
  eraseRefusal: string | undefined;
  /** Thumbs and notes on lines (M3.4). */
  readonly feedback: FeedbackInput[];
  /** Roles changed, invites made and withdrawn, passkeys and devices withdrawn (ADR 0034). */
  readonly roleChanges: ChangeRoleInput[];
  /** Caps on what may be attached, as set from You (ADR 0047). */
  readonly capsSet: AttachmentCaps[];
  readonly limitsSet: ExchangeLimits[];
  /** Harnesses handed on: harness id and new owner (M5.2). */
  readonly transfers: [string, string][];
  /** Harnesses removed (ADR 0078), and what the next removal answers when the server refuses. */
  readonly removals: string[];
  removeRefusal: string | undefined;
  /** People removed from the workspace (ADR 0160). */
  readonly peopleRemoved: string[];
  /** How many times the reader deleted their own account (ADR 0243). */
  accountsDeleted: number;
  readonly restarts: string[];
  readonly declared: [string, readonly string[]][];
  readonly invitesMade: CreateInviteInput[];
  /** Space links somebody already in the workspace was let in by (ADR 0168). */
  readonly invitesEntered: string[];
  readonly invitesRevoked: string[];
  /** Join links made, with what they grant; requests allowed and refused (ADR 0122). */
  readonly linksMade: (readonly string[])[];
  readonly joinsAllowed: [string, readonly string[], (string | undefined)?, string?][];
  readonly joinsDenied: string[];
  /** Names this person asked to go by (ADR 0082). */
  readonly renamed: string[];
  /** Names the workspace was given from here (ADR 0194). */
  readonly workspaceNames: string[];
  readonly passkeysRevoked: string[];
  /** What `GET /v1/server` says (ADR 0170), and the gallery's cards (ADR 0171). */
  server: ServerFacts;
  connectorCards: Connector[];
  readonly devicesRevoked: string[];
  /** Approvals handed on (M5.5). */
  readonly routed: RouteApprovalInput[];
  /** The person's notification settings (M5.6), and each save of them. */
  notifySettings: NotificationSettings;
  readonly notifySaved: NotificationSettings[];
  /** How many times the faces were read, and each one set or put back. */
  iconsLoaded: number;
  readonly iconsSet: { spaceId: string; icon: SpaceIcon | undefined }[];
  /** Rooms hidden from the list and put back (ADR 0205), in order. */
  readonly hiddenSet: { spaceId: string; hidden: boolean }[];
  /** Rooms pinned to the top and let go (ADR 0240), in order. */
  readonly pinnedSet: { spaceId: string; pinned: boolean }[];
  /** Lines edited, taken back, pinned and unpinned; searches asked (M5.4). */
  readonly edits: LineInput[];
  readonly deletions: LineInput[];
  /** Deleted for the reader alone, and put back by Undo (ADR 0167). */
  readonly hidings: (LineInput & { readonly shown: boolean })[];
  readonly pins: LineInput[];
  readonly unpins: LineInput[];
  readonly searches: SearchInput[];
  /** What a search answers, as a test sets it. */
  found: SearchPage;
  /** Where the server says it is, beside a pairing code. `undefined` is a server without one. */
  pairingServerUrl: string | undefined;
  /** The room's files the server lists (ADR 0100), each name's versions, and every read of them. */
  files: RoomFileOf[];
  readonly versions: Map<string, RoomFileOf[]>;
  readonly filesRead: string[];
  /** Hand the shell a new snapshot, the way a frame's flush does. */
  readonly update: (snapshot: Snapshot) => void;
}

/** A join request as the store holds one (ADR 0122), for the fake's answers. */
function joinOf(over: Partial<JoinRequest>): JoinRequest {
  return {
    requestId: "jrq_01K4ZQPX0000000000000000J1",
    kind: "harness",
    state: "waiting",
    startedBy: "requester",
    wants: [],
    capabilities: [],
    url: "http://127.0.0.1:4431",
    createdAt: "2026-10-05T21:00:00.000Z",
    expiresAt: "2026-10-05T21:10:00.000Z",
    ...over,
  };
}

function fakeStore(initial: Snapshot): FakeStore {
  let snapshot = initial;
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const store: FakeStore = {
    pairingServerUrl: "http://192.168.1.20:4431",
    files: [],
    versions: new Map(),
    filesRead: [],
    sent: [],
    discarded: [],
    resolved: [],
    answered: [],
    dialed: [],
    ruled: [],
    read: [],
    readMany: [],
    left: [],
    added: [],
    moved: [],
    agentsRenamed: [],
    agentsArchived: [],
    agentLocks: [],
    agentLockRefusal: undefined,
    exchanges: [],
    leads: [],
    ceilings: [],
    locks: [],
    lockRefusal: undefined,
    agentsDeleted: [],
    forked: [],
    askedFor: [],
    arrival: undefined,
    heldTokens: new Map(),
    revoked: [],
    runCommands: [],
    sessionPins: new Map(),
    sessionPinned: [],
    createdSpaces: [],
    askedOf: [],
    askedTitles: [],
    calls: [],
    membersAdded: [],
    membersRemoved: [],
    spaceUpdates: [],
    erased: [],
    eraseRefusal: undefined,
    feedback: [],
    roleChanges: [],
    capsSet: [],
    limitsSet: [],
    transfers: [],
    removals: [],
    removeRefusal: undefined,
    peopleRemoved: [],
    accountsDeleted: 0,
    restarts: [],
    declared: [],
    invitesMade: [],
    invitesEntered: [],
    linksMade: [],
    joinsAllowed: [],
    joinsDenied: [],
    invitesRevoked: [],
    renamed: [],
    workspaceNames: [],
    passkeysRevoked: [],
    server: {
      machine: "Arjun's Mac mini",
      version: "0.2.0",
      publicUrl: "http://192.168.1.20:4431",
      relay: { url: undefined, status: "off" },
    },
    connectorCards: [],
    devicesRevoked: [],
    routed: [],
    notifySettings: DEFAULT_NOTIFICATION_SETTINGS,
    notifySaved: [],
    iconsLoaded: 0,
    iconsSet: [],
    hiddenSet: [],
    pinnedSet: [],
    edits: [],
    deletions: [],
    hidings: [],
    pins: [],
    unpins: [],
    searches: [],
    found: { hits: [], nextCursor: null },
    routeApproval(input) {
      store.routed.push(input);
    },
    notificationSettings() {
      return store.notifySettings;
    },
    async loadNotificationSettings() {
      return store.notifySettings;
    },
    async saveNotificationSettings(settings) {
      store.notifySettings = settings;
      store.notifySaved.push(settings);
    },
    async loadSpaceIcons() {
      store.iconsLoaded += 1;
    },
    async setSpaceIcon(spaceId, icon) {
      store.iconsSet.push({ spaceId, icon });
    },
    async loadHiddenSpaces() {},
    async setSpaceHidden(spaceId, hidden) {
      store.hiddenSet.push({ spaceId, hidden });
      // As the store does, at once: the rail moves the room before the server answers.
      const now = new Set(snapshot.hiddenSpaces);
      if (hidden) now.add(spaceId);
      else now.delete(spaceId);
      store.update({ ...snapshot, hiddenSpaces: now });
    },
    async loadPinnedSpaces() {},
    async setSpacePinned(spaceId, pinned) {
      store.pinnedSet.push({ spaceId, pinned });
      // As the store does, at once and newest first: the rail moves the room before the answer.
      const was = (snapshot.pinnedSpaces ?? []).filter((id) => id !== spaceId);
      store.update({ ...snapshot, pinnedSpaces: pinned ? [spaceId, ...was] : was });
    },
    async claimNotifications(keys) {
      return [...keys];
    },
    sessionPin(spaceId) {
      return store.sessionPins.get(spaceId);
    },
    async loadSessionPins() {},
    async pinSession(spaceId, sessionRef) {
      store.sessionPinned.push({ spaceId, sessionRef });
      if (sessionRef === undefined) store.sessionPins.delete(spaceId);
      else store.sessionPins.set(spaceId, sessionRef);
    },
    sendFeedback(input) {
      store.feedback.push(input);
    },
    editMessage(input) {
      store.edits.push(input);
    },
    deleteMessage(input) {
      store.deletions.push(input);
    },
    hideMessage(input) {
      store.hidings.push({ ...input, shown: false });
    },
    showMessage(input) {
      store.hidings.push({ ...input, shown: true });
    },
    pinMessage(input) {
      store.pins.push(input);
    },
    unpinMessage(input) {
      store.unpins.push(input);
    },
    // The store still opens one; no screen asks it to (ADR 0035's addendum).
    openThread: () => THREAD,
    async search(input) {
      store.searches.push(input);
      return store.found;
    },
    setAttachmentCaps(caps) {
      store.capsSet.push(caps);
    },
    setExchangeLimits(limits) {
      store.limitsSet.push(limits);
    },
    async serverLimits() {
      return { maxAttachmentBytes: 104_857_600, maxMessageBytes: 65_536 };
    },
    changeRole(input) {
      store.roleChanges.push(input);
    },
    async transferHarness(harnessId, ownerId) {
      store.transfers.push([harnessId, ownerId]);
    },
    async removeHarness(harnessId) {
      if (store.removeRefusal !== undefined) throw new Error(store.removeRefusal);
      store.removals.push(harnessId);
    },
    async removePerson(participantId) {
      if (store.removeRefusal !== undefined) throw new Error(store.removeRefusal);
      store.peopleRemoved.push(participantId);
    },
    async deleteAccount() {
      if (store.removeRefusal !== undefined) throw new Error(store.removeRefusal);
      store.accountsDeleted += 1;
    },
    async restartHarness(harnessId) {
      store.restarts.push(harnessId);
    },
    async declareCapabilities(harnessId, capabilities) {
      store.declared.push([harnessId, capabilities]);
    },
    async agentContext() {
      throw new Error("no context files in this fake");
    },
    async harnessContext() {
      throw new Error("no context files in this fake");
    },
    async editContext() {
      throw new Error("no context files in this fake");
    },
    async contextEdit() {
      throw new Error("no context files in this fake");
    },
    async readAgentModel() {
      throw new Error("no models in this fake");
    },
    async changeAgentModel() {
      throw new Error("no models in this fake");
    },
    async readAgentHeartbeat() {
      throw new Error("no heartbeats in this fake");
    },
    async changeAgentHeartbeat() {
      throw new Error("no heartbeats in this fake");
    },
    async readHarnessJobs() {
      throw new Error("no jobs in this fake");
    },
    async readJobRuns() {
      throw new Error("no jobs in this fake");
    },
    async changeHarnessJob() {
      throw new Error("no jobs in this fake");
    },
    async readAgentContextWindow() {
      throw new Error("no context windows in this fake");
    },
    async changeAgentContextWindow() {
      throw new Error("no context windows in this fake");
    },
    async compactAgent() {
      throw new Error("no context windows in this fake");
    },
    async invites() {
      return [
        {
          inviteId: "inv_01K4ZQPX0000000000000000D1",
          role: "member",
          singleUse: true,
          uses: 0,
          createdBy: ARJUN,
          createdAt: "2026-09-06T09:00:00.000Z",
          // A week ahead of whenever the test runs: an expired link is not listed (JR-2).
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          revokedAt: undefined,
          spaceId: undefined,
        },
      ];
    },
    async createInvite(input) {
      store.invitesMade.push(input);
      return {
        inviteId: "inv_01K4ZQPX0000000000000000D2",
        role: input.role,
        singleUse: input.singleUse ?? true,
        url: "http://127.0.0.1:5173/#invite=chips_inv_test",
        expiresAt: "2026-09-13T09:00:00.000Z",
        spaceId: input.spaceId,
      };
    },
    async revokeInvite(inviteId) {
      store.invitesRevoked.push(inviteId);
    },
    async enterByInvite(token) {
      store.invitesEntered.push(token);
      return { spaceId: "spc_bakery", already: false };
    },
    async joinRequests() {
      return [...(snapshot.joins?.values() ?? [])].filter((each) => each.state === "waiting");
    },
    async joinRequest(requestId) {
      const found = snapshot.joins?.get(requestId);
      if (found === undefined) throw new Error("No such request.");
      return found;
    },
    async makeJoinLink(capabilities) {
      store.linksMade.push(capabilities);
      const request = joinOf({
        requestId: `jrq_01K4ZQPX0000000000000000L${store.linksMade.length}`,
        state: "allowed",
        startedBy: "person",
        capabilities,
      });
      store.update({ ...snapshot, joins: new Map(snapshot.joins).set(request.requestId, request) });
      return {
        request,
        link: `http://127.0.0.1:4431/j/chips_j_testlink${store.linksMade.length}_0123456789abcdef`,
      };
    },
    async allowJoin(requestId, capabilities, code, as) {
      store.joinsAllowed.push(
        as !== undefined
          ? [requestId, capabilities, code, as]
          : code === undefined
            ? [requestId, capabilities]
            : [requestId, capabilities, code],
      );
      return joinOf({ requestId, state: "allowed", capabilities });
    },
    async denyJoin(requestId) {
      store.joinsDenied.push(requestId);
      return joinOf({ requestId, state: "denied" });
    },
    async renameWorkspace(name) {
      store.workspaceNames.push(name);
    },
    async rename(displayName) {
      store.renamed.push(displayName);
      if (displayName.trim().toLowerCase() === "scout") {
        throw new Error("An agent here goes by Scout already.");
      }
    },
    async passkeys() {
      return [
        {
          passkeyId: "pky_01K4ZQPX0000000000000000E1",
          name: "MacBook",
          algorithm: -7,
          createdAt: "2026-09-06T09:00:00.000Z",
          lastUsedAt: undefined,
          revokedAt: undefined,
        },
      ];
    },
    async revokePasskey(passkeyId) {
      store.passkeysRevoked.push(passkeyId);
    },
    async serverFacts() {
      return store.server;
    },
    // The Connection card on You (ADR 0211): a move off the relay, and a timed read.
    async goDirect() {
      return false;
    },
    async roundTrip() {
      return 38;
    },
    async setOnlyDirect() {},
    // Direct asks (ADR 0211, Phase 3): none waiting, and nothing asked.
    async askToGoDirect() {
      throw new Error("not asked here");
    },
    async readMyDirectAsk() {
      return undefined;
    },
    async readDirectAsks() {
      return [];
    },
    async readDirectAsk() {
      throw new Error("no such ask");
    },
    async shareDirect() {
      throw new Error("no such ask");
    },
    async forgetKeptShareLink() {},
    // The relay switch (ADR 0211, Phase 4): a server with no relay, so You draws no card.
    async readRelay() {
      return {
        configured: false,
        on: true,
        setBy: undefined,
        setAt: undefined,
        devices: [],
        keptLink: undefined,
      };
    },
    async setRelay() {
      throw new Error("no relay here");
    },
    async askRelayedToGoDirect() {
      return 0;
    },
    async connectors() {
      return store.connectorCards;
    },
    async devices() {
      // Paired an hour ago, by the clock the test runs at: a device unseen for thirty days is
      // folded under "N not seen in a month" (core's `sortDevices`), and the date the phone once
      // had, 6 September, folded it there on 6 October and took it out of the list.
      const anHourAgo = new Date(Date.now() - 3_600_000).toISOString();
      return [
        {
          deviceId: DEVICE.deviceId,
          name: "This browser",
          pairedAt: anHourAgo,
          lastSeenAt: undefined,
          revokedAt: undefined,
          current: true,
        },
        {
          deviceId: "dev_01K4ZQPX0000000000000000E2",
          name: "Arjun's phone",
          pairedAt: anHourAgo,
          lastSeenAt: undefined,
          revokedAt: undefined,
          current: false,
        },
      ];
    },
    async revokeDevice(deviceId) {
      store.devicesRevoked.push(deviceId);
    },
    async personDevices() {
      return [];
    },
    async issuePairingCode() {
      return {
        code: "QRS-789",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        serverUrl: store.pairingServerUrl,
        relay: "wss://relay.example",
        serverKey: "k".repeat(43),
      };
    },
    createSpace(input) {
      store.calls.push("createSpace");
      if (!("askedOf" in input)) store.createdSpaces.push(input.title);
      else {
        store.askedOf.push(input.askedOf);
        if (input.title !== undefined) store.askedTitles.push(input.title);
      }
      return NEW_SPACE;
    },
    addMember(input) {
      store.calls.push("addMember");
      store.membersAdded.push(input);
    },
    removeMember(input) {
      store.membersRemoved.push(input);
    },
    updateSpace(input) {
      store.spaceUpdates.push(input);
    },
    async eraseSpace(spaceId) {
      if (store.eraseRefusal !== undefined) throw new Error(store.eraseRefusal);
      store.erased.push(spaceId);
    },
    async moveAgent(agentId, spaceId) {
      store.moved.push({ agentId, spaceId });
    },
    async refreshDirectory() {},
    async forkAgent(agentId, spaceId) {
      store.forked.push({ agentId, spaceId });
    },
    async askAgent(harnessId, spaceId, name) {
      store.askedFor.push({ harnessId, spaceId, name });
    },
    takeArrival() {
      const handle = store.arrival;
      store.arrival = undefined;
      return handle;
    },
    // As the real store does it: the room, then the ask for a copy in it.
    async forkIntoNewRoom(agentId, title) {
      const spaceId = store.createSpace({ title });
      await store.forkAgent(agentId, spaceId);
      return spaceId;
    },
    // As the real store does it: the room by the agent's name, then the ask in it (ADR 0190).
    async askIntoNewRoom(harnessId, name) {
      const spaceId = store.createSpace({ title: name });
      await store.askAgent(harnessId, spaceId, name);
      return spaceId;
    },
    dismissNotice() {},
    async setAgentFace() {},
    async setMyFace() {},
    async renameAgent(agentId, name) {
      if (name === "Hello") throw new Error("An agent here goes by Hello already.");
      store.agentsRenamed.push({ agentId, name });
    },
    async setExchange(spaceId, state) {
      store.exchanges.push({ spaceId, state });
    },
    async setLead(spaceId, agentId) {
      store.leads.push({ spaceId, agentId });
    },
    async setSpendCeiling(spaceId, usd) {
      store.ceilings.push({ spaceId, usd });
    },
    async setLock(spaceId, locked) {
      if (store.lockRefusal !== undefined) throw new Error(store.lockRefusal);
      store.locks.push({ spaceId, locked });
    },
    async roomSpend() {
      return { ceiling_usd: 3, spent_usd: 1.23, since_seq: 40, uncounted_runs: 0 };
    },
    async setAgentArchived(agentId, archived) {
      store.agentsArchived.push({ agentId, archived });
    },
    async setAgentLock(agentId, locked) {
      if (store.agentLockRefusal !== undefined) throw new Error(store.agentLockRefusal);
      store.agentLocks.push({ agentId, locked });
    },
    async deleteAgent(agentId, options) {
      store.agentsDeleted.push({ agentId, deleteRoom: options?.deleteRoom === true });
    },
    async agentStays() {
      return [];
    },
    async roomFiles(spaceId) {
      store.filesRead.push(spaceId);
      return store.files;
    },
    async fileVersions(_spaceId, name) {
      return store.versions.get(name) ?? [];
    },
    async projectFiles() {
      return { at: null, files: [] };
    },
    async projectFile() {
      return { bytes: new Uint8Array(), type: "text/plain" };
    },
    async projectHistory(_spaceId, path) {
      return { path, versions: [] };
    },
    async projectChange() {
      throw new Error("no such change");
    },
    async undoChange() {
      throw new Error("no such change");
    },
    async projectPage(_spaceId, path) {
      return `<h1>${path}</h1>`;
    },
    async projectPageUrl(_spaceId, path) {
      return `/v1/pages/ticket-for-${path}`;
    },
    async projectArchive() {
      return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    },
    async openFolderOnMac() {
      return { macs: 0 };
    },
    async openPageOnMac() {
      return { macs: 0 };
    },
    onFolderAsk() {
      return () => undefined;
    },
    async runOnMac() {
      return { macs: 0 };
    },
    async projectRun() {
      return { macs: 0 };
    },
    async sayRun() {},
    onRunState() {
      return () => undefined;
    },
    async projectToken(spaceId) {
      return {
        token: `chips_pt_dev_mac.${spaceId}.sig`,
        expires_at: "2099-01-01T00:00:00.000Z",
        path: `/v1/spaces/${spaceId}/project.git`,
      };
    },
    answerQuestion(input) {
      store.answered.push(input);
    },
    setRules(input) {
      store.ruled.push(input);
    },
    setAutonomy(input) {
      store.dialed.push(input);
    },
    pauseRun(input) {
      store.runCommands.push({ verb: "pause", input });
    },
    resumeRun(input) {
      store.runCommands.push({ verb: "resume", input });
    },
    stopRun(input) {
      store.runCommands.push({ verb: "stop", input });
    },
    steerRun(input) {
      store.runCommands.push({ verb: "steer", input });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    send(input) {
      store.calls.push("send");
      store.sent.push(input);
    },
    discard(key) {
      store.discarded.push(key);
    },
    resolveApproval(input) {
      store.resolved.push(input);
    },
    markRead(spaceId, seq) {
      store.read.push([spaceId, seq]);
    },
    markSpacesRead(spaceIds) {
      store.readMany.push(spaceIds);
    },
    leaveSpace(input) {
      store.left.push(input.spaceId);
    },
    async addHarness({ name }) {
      store.added.push(name);
      return {
        harnessId: "hrn_01K4ZQPX000000000000000099",
        displayName: name,
        token: "chips_at_test-token-shown-once",
        spaceId: "spc_01K4ZQPX000000000000000098",
      };
    },
    async harnessTokens(harnessId) {
      return store.heldTokens.get(harnessId) ?? [];
    },
    async issueHarnessToken(harnessId, name) {
      const token: HarnessToken = {
        id: `tok_${store.heldTokens.get(harnessId)?.length ?? 0}`,
        name,
        createdAt: "2026-09-04T10:00:00.000Z",
        lastUsedAt: undefined,
        revokedAt: undefined,
      };
      store.heldTokens.set(harnessId, [...(store.heldTokens.get(harnessId) ?? []), token]);
      return {
        tokenId: token.id,
        name,
        token: "chips_at_rotated-token",
        createdAt: token.createdAt,
      };
    },
    async revokeHarnessToken(harnessId, tokenId) {
      store.revoked.push([harnessId, tokenId]);
      store.heldTokens.set(
        harnessId,
        (store.heldTokens.get(harnessId) ?? []).map((each) =>
          each.id === tokenId ? { ...each, revokedAt: "2026-09-04T10:05:00.000Z" } : each,
        ),
      );
    },
    /** The browser wires up `online`/`offline` itself; nothing in these tests comes back. */
    wake() {},
    close() {
      listeners.clear();
    },
    update(next) {
      snapshot = next;
      act(() => {
        for (const listener of listeners) listener(next);
      });
    },
  };
  return store;
}

/** The room's sheet (ADR 0151), opened from who is here in the header. */
function openSheet(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: /^\d+ members?$/ }));
  return screen.getByTestId("room-sheet");
}

/** The left rail, where a room's row is, apart from the room's own name in its header. */
function sidebar(): HTMLElement {
  return screen.getByRole("complementary", { name: "Workspace" });
}

/** A harness's line on its tile on the Agents page's shelf (ADR 0185), with Agents open. */
function shelfLine(harnessId: string): HTMLElement {
  return screen
    .getByTestId(`harness-tile-${harnessId}`)
    .querySelector(".shelf-line") as HTMLElement;
}

function renderShell(events: ClientEvent[], extra: Extra = {}, files = fakeFiles()): FakeStore {
  const store = fakeStore(snapshotOf(events, extra));
  render(<Shell store={store} device={DEVICE} files={files} />);
  return store;
}

/**
 * Ask a line in the room what may be done to it (M5.4): the `⋯` beside the name, which opens
 * the same menu as a right-click and is the way to it from a keyboard. `nth` counts down the
 * room, so 0 is the first line that offers anything at all.
 */
function openMenu(nth: number): HTMLElement {
  const messages = screen.getByTestId("messages");
  fireEvent.click(within(messages).getAllByTestId("line-more")[nth] as Element);
  return screen.getByTestId("line-menu");
}

/**
 * Opens the menu of the line that closed a run, where What the run did is (ADR 0050, rule 3; ADR
 * 0268 for the desktop): the room draws no receipt under it otherwise.
 */
function openSummaryMenu(): HTMLElement {
  const summary = screen
    .getByTestId("messages")
    .querySelector('.bub[data-summary="true"]')
    ?.closest(".msg") as HTMLElement;
  fireEvent.click(within(summary).getByTestId("line-more"));
  return screen.getByTestId("line-menu");
}

/** Opens What the run did from the summary's menu: the receipt, standing under the bubble. */
function openRunDid(): HTMLElement {
  fireEvent.click(within(openSummaryMenu()).getByRole("menuitem", { name: "What the run did" }));
  return screen.getByTestId("run-did");
}

/** What a menu offers, by each item's name. */
function labelsOf(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.getAttribute("aria-label") ?? item.textContent ?? "");
}

/** Put it away again, so the next one opened is the only one on screen. */
function closeMenu(): void {
  fireEvent.keyDown(screen.getByTestId("line-menu"), { key: "Escape" });
}

/** The shared fake, with the one grant the shell's own tests expect: a video's play. */
function fakeFiles(page?: (id: string) => string): FakeFiles {
  return sharedFakeFiles({
    ...(page === undefined ? {} : { page }),
    grants: (id, variant) =>
      variant === "play" && id.endsWith("35")
        ? {
            url: `/v1/attachments/${id}?variant=play&sig=s`,
            expiresAt: Date.now() + 600_000,
            variant: "play",
            playable: "done",
          }
        : undefined,
  });
}

const PHOTO = {
  attachment_id: "att_01K4ZQPX000000000000000031",
  filename: "holiday.png",
  mime_type: "image/png",
  byte_size: 20_971_520,
  sha256: "a".repeat(64),
  width: 2600,
  height: 2600,
};
const PDF = {
  attachment_id: "att_01K4ZQPX000000000000000008",
  filename: "PO-4471.pdf",
  mime_type: "application/pdf",
  byte_size: 184_302,
  sha256: "b".repeat(64),
};
/** A video the server measured, sideways as a phone records one held upright. */
const CLIP = {
  attachment_id: "att_01K4ZQPX000000000000000033",
  filename: "IMG_4410.MOV",
  mime_type: "video/quicktime",
  byte_size: 38_000_000,
  sha256: "d".repeat(64),
  width: 1080,
  height: 1920,
  duration_ms: 42_500,
};
/** A voice note the server heard: how long it runs, and what was said (ADR 0054). */
const VOICE = {
  attachment_id: "att_01K4ZQPX000000000000000035",
  filename: "voice-note-0913-1142.m4a",
  mime_type: "audio/mp4",
  byte_size: 96_512,
  sha256: "e".repeat(64),
  duration_ms: 8400,
  transcript: "Send Priya the receipt from the hardware store.",
};
const HTML = {
  attachment_id: "att_01K4ZQPX000000000000000032",
  filename: "report.html",
  mime_type: "text/html",
  byte_size: 44,
  sha256: "c".repeat(64),
};
/** The walking tour J sent into Mission Murals (ADR 0123). */
const MARKDOWN = {
  attachment_id: "att_01K4ZQPX000000000000000033",
  filename: "mission-murals-walking-tour.md",
  mime_type: "text/markdown",
  byte_size: 23_317,
  sha256: "d".repeat(64),
};

/** Whether the tab is being looked at. jsdom says visible; a test can say otherwise. */
let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});

afterEach(() => {
  visibility = "visible";
});

describe("the space", () => {
  it("puts my message on the right and names the others inside their bubbles", () => {
    renderShell([
      ...opened(),
      fixture("message.post", 4, { actor: person(ARJUN), text: "Get PO #4471 confirmed." }),
      fixture("message.post", 5, { actor: person(DANA), text: "I can help with Northwind." }),
      fixture("message.post", 6, { actor: harness(SCOUT), text: "On it." }),
    ]);

    const rows = [...screen.getByTestId("messages").querySelectorAll(".msg")] as HTMLElement[];
    expect(rows).toHaveLength(3);
    // Three in the room, so the names are worth saying — in the bubble, never over it.
    expect(rows[0]?.getAttribute("data-mine")).toBe("true");
    expect(within(rows[0] as HTMLElement).queryByText("You")).toBeNull();
    expect(rows[0]?.querySelector(".bub-who")).toBeNull();
    expect(rows[1]?.getAttribute("data-mine")).toBeNull();
    expect(rows[1]?.querySelector(".bub .bub-who")?.textContent).toBe("Dana");
    expect(rows[2]?.querySelector(".bub .bub-who")?.textContent).toBe("Scout");
    // And the time is in the bubble too, after the words.
    expect(rows[2]?.querySelector(".bub .bub-stamp")?.textContent).toMatch(/\d/);
  });

  it("leaves the names off a room of two, where the side already says whose line it is", () => {
    renderShell([
      fixture("space.created", 1, { actor: person(ARJUN), title: "PO-4471", kind: "group" }),
      fixture("membership.added", 2, {
        actor: person(ARJUN),
        participant_id: SCOUT,
        participant_kind: "harness",
      }),
      fixture("message.post", 3, { actor: person(ARJUN), text: "Get PO #4471 confirmed." }),
      fixture("message.post", 4, { actor: harness(SCOUT), text: "On it." }),
    ]);

    const rows = [...screen.getByTestId("messages").querySelectorAll(".msg")] as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId("messages").querySelector(".bub-who")).toBeNull();
    expect(screen.queryByText("Scout", { selector: ".bub-who" })).toBeNull();
    // Nor any faces, as on the phone (ADR 0050 rule 5, ADR 0268): the side says whose it is.
    expect(within(rows[1] as HTMLElement).queryByRole("img", { name: "Scout" })).toBeNull();
  });

  it("closes up one author's turn, its name in the first bubble and its face and time by the last", () => {
    const at = (second: number) => `2026-09-02T14:22:${String(second).padStart(2, "0")}.000Z`;
    renderShell([
      ...opened(),
      fixture("message.post", 4, { actor: person(DANA), text: "One.", ts: at(1) }),
      fixture("message.post", 5, { actor: person(DANA), text: "Two.", ts: at(2) }),
      fixture("message.post", 6, { actor: person(DANA), text: "Three.", ts: at(3) }),
      fixture("message.post", 7, { actor: harness(SCOUT), text: "On it.", ts: at(4) }),
    ]);
    const messages = screen.getByTestId("messages");
    const rows = [...messages.querySelectorAll(".msg")] as HTMLElement[];
    expect(rows.map((row) => row.getAttribute("data-place"))).toEqual([
      "first",
      "middle",
      "last",
      null,
    ]);
    expect(rows.map((row) => row.querySelector(".bub-who")?.textContent ?? null)).toEqual([
      "Dana",
      null,
      null,
      "Scout",
    ]);
    expect(rows.map((row) => row.querySelector(".bub-stamp") !== null)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(rows.map((row) => row.querySelector(".msg > .ui-avatar") !== null)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    // And the day and the hour stand over the first line, once.
    expect(within(messages).getAllByTestId("day-line")).toHaveLength(1);
  });

  it("sends what is typed on Enter, into the open space", () => {
    const store = renderShell(opened());
    const box = screen.getByLabelText("Message Scout");
    fireEvent.change(box, { target: { value: "Ship it" } });
    fireEvent.keyDown(box, { key: "Enter" });
    // Scout and Dana are two others, so the field aims, and at the room's one agent.
    expect(store.sent).toEqual([
      { spaceId: SPACE, text: "Ship it", to: [SCOUT], addressedTo: [SCOUT] },
    ]);
  });

  it("holds words put in its field from outside, not sent, once (ADR 0237's Write it with)", () => {
    seedField(SPACE, "Read https://chipschat.ai/feedback.md and help me write a feedback prompt.");
    const store = renderShell(opened());
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message Scout").value).toBe(
      "Read https://chipschat.ai/feedback.md and help me write a feedback prompt.",
    );
    expect(store.sent).toEqual([]);
    cleanup();
    renderShell(opened());
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message Scout").value).toBe("");
  });

  it("says in the room what the server said of an add it turned away", () => {
    // Agents review, finding 13: a refused add was silent, so the click looked as if it did nothing.
    renderShell(opened(), {
      notices: new Map([[SPACE, "That agent is in another space: move it, or pick another."]]),
    });
    expect(screen.getByTestId("notice").textContent).toBe(
      "That agent is in another space: move it, or pick another.",
    );
  });

  it("shows a message the server refused as not sent, with the reason", () => {
    const events = opened();
    const model = buildModel(events);
    const refused = {
      ...model,
      spaces: model.spaces.map((space) => ({
        ...space,
        lines: [
          ...space.lines,
          {
            id: "pending:msg-1",
            seq: Number.MAX_SAFE_INTEGER,
            kind: "text" as const,
            authorId: ARJUN,
            authorKind: "person" as const,
            text: "Into the void",
            ts: "2026-09-03T12:00:00.000Z",
            pending: true,
            failed: "you are not a member of this space",
          },
        ],
      })),
    };
    renderShell(events, { model: refused });
    const row = screen.getByTestId("messages").querySelector(".msg") as HTMLElement;
    expect(row.getAttribute("data-failed")).toBe("true");
    expect(within(row).getByTestId("failed").textContent).toContain("not a member");
    expect(within(row).queryByTestId("pending")).toBeNull();
  });

  it("says a held message is waiting when nothing can leave, and sending when it can", () => {
    const events = opened();
    const model = buildModel(events);
    const held = {
      ...model,
      spaces: model.spaces.map((space) => ({
        ...space,
        lines: [
          ...space.lines,
          {
            id: "pending:msg-2",
            seq: Number.MAX_SAFE_INTEGER,
            kind: "text" as const,
            authorId: ARJUN,
            authorKind: "person" as const,
            text: "Anyone there?",
            ts: "2026-09-03T12:00:00.000Z",
            pending: true,
          },
        ],
      })),
    };

    // Nothing can leave the browser: say that, so nobody sends it a second time.
    renderShell(events, { model: held, connection: "closed" });
    expect(screen.getByTestId("waiting").textContent).toContain("waiting for the server");
    expect(screen.queryByTestId("pending")).toBeNull();
    cleanup();

    // On an open socket it really is in flight, and reads as it always did.
    renderShell(events, { model: held, connection: "open" });
    expect(screen.getByTestId("pending").textContent).toContain("sending…");
    expect(screen.queryByTestId("waiting")).toBeNull();
  });

  it("offers to take back a held message, and only while it is still held", () => {
    const events = opened();
    const model = buildModel(events);
    const held = {
      ...model,
      spaces: model.spaces.map((space) => ({
        ...space,
        lines: [
          ...space.lines,
          {
            id: "pending:msg-3",
            seq: Number.MAX_SAFE_INTEGER,
            kind: "text" as const,
            authorId: ARJUN,
            authorKind: "person" as const,
            text: "Never mind",
            ts: "2026-09-03T12:00:00.000Z",
            key: "msg-3",
            pending: true,
          },
        ],
      })),
    };

    const store = renderShell(events, { model: held, connection: "closed" });
    fireEvent.click(screen.getByTestId("discard"));
    expect(store.discarded).toEqual(["msg-3"]);
    cleanup();

    // In flight is not held: there is nothing honest to offer, so nothing is offered.
    renderShell(events, { model: held, connection: "open" });
    expect(screen.queryByTestId("discard")).toBeNull();
  });

  it("says so while the socket is down, and not once it is open", () => {
    const store = renderShell(opened(), { connection: "closed" });
    expect(screen.getByTestId("connection").textContent).toBe("Reconnecting…");
    store.update(snapshotOf(opened()));
    expect(screen.queryByTestId("connection")).toBeNull();
  });

  it("opens the room a link let this person into once it arrives (ADR 0168)", () => {
    const store = fakeStore(snapshotOf(opened()));
    const onLanded = vi.fn();
    render(
      <Shell
        store={store}
        device={DEVICE}
        files={fakeFiles()}
        landIn="spc_bakery"
        onLanded={onLanded}
      />,
    );
    expect(onLanded).toHaveBeenCalled();
    expect(screen.getByTestId("room-title").textContent).toContain("PO-4471");
    store.update(
      snapshotOf([
        ...opened(),
        fixture("space.created", 4, {
          actor: person(ARJUN),
          space_id: "spc_bakery",
          title: "Bakery",
        }),
      ]),
    );
    expect(screen.getByTestId("room-title").textContent).toContain("Bakery");
  });

  it("says the server may be asleep when the relay says it is not there", () => {
    // Reconnecting is what the client is doing. It is not what the person should do: the relay
    // answered, so the network is fine and the machine Chips runs on is not (M4.2).
    renderShell(opened(), { connection: "asleep" });
    expect(screen.getByTestId("connection").textContent).toBe(
      "Your server is not reachable — it may be asleep",
    );
  });

  it("marks the space read to everything that reached it, only while the tab is visible", () => {
    // Scout says its answer and then completes with the same words. The completion draws no
    // line — it closes on the last said — but the card it leaves in Needs you carries it, and
    // reading the room has read that too.
    const said = "Confirmed PO #4471 with Northwind.";
    const events = [
      ...opened(),
      fixture("run.started", 4),
      fixture("message.post", 5, { actor: harness(SCOUT), run_id: RUN, text: said }),
      fixture("run.completed", 6, { summary: said }),
    ];
    const store = renderShell(events);
    expect(store.read).toEqual([[SPACE, 6]]);

    // A line arriving in a hidden tab is not read by anyone.
    visibility = "hidden";
    const later = [...events, fixture("message.post", 7, { actor: person(DANA), text: "again" })];
    store.update(snapshotOf(later));
    expect(store.read).toEqual([[SPACE, 6]]);

    // Coming back to the tab reads it.
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(store.read.at(-1)).toEqual([SPACE, 7]);
  });
});

describe("the approval card", () => {
  it("sends Approve and Deny to the store, for the approval's own run", () => {
    const store = renderShell(asking());
    const card = screen.getByRole("article", { name: /Approval/ });

    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    expect(store.resolved).toEqual([
      {
        spaceId: SPACE,
        runId: RUN,
        approvalId: APPROVAL,
        decision: "approved",
        scope: "once",
      },
    ]);

    // Deny asks why first; the reason goes with the decision, and the harness gets to read it.
    fireEvent.click(within(card).getByRole("button", { name: "Deny" }));
    const form = screen.getByTestId("deny-form");
    fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "Not today." } });
    fireEvent.submit(form);
    expect(store.resolved.at(-1)).toMatchObject({
      approvalId: APPROVAL,
      decision: "denied",
      reason: "Not today.",
    });
  });

  it("is busy while a decision is on its way, so it cannot be sent twice", () => {
    const store = renderShell(asking(), { busy: new Set([APPROVAL]) });
    const card = screen.getByRole("article", { name: /Approval/ });
    const approve = within(card).getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(store.resolved).toEqual([]);
  });

  it("lets a person edit the input before approving, and sends what they wrote", () => {
    const store = renderShell(asking());
    const card = screen.getByRole("article", { name: /Approval/ });
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    expect(store.resolved).toEqual([]);
    const form = screen.getByTestId("edit-form");
    const box = within(form).getByLabelText("Edited input") as HTMLTextAreaElement;
    expect(box.value).toContain("confirming PO #4471");
    fireEvent.change(box, { target: { value: "Hi Dana — 120 units, 4 pallets, 19 September." } });
    fireEvent.submit(form);
    expect(store.resolved.at(-1)).toMatchObject({
      decision: "edited",
      scope: "once",
      updatedInput: {
        to: "dana@northwind.com",
        body: "Hi Dana — 120 units, 4 pallets, 19 September.",
      },
    });
  });

  it("draws a Markdown preview as the room draws a message, fence and all (OpenClaw finding 7)", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4),
      fixture("approval.request", 5, {
        preview: {
          format: "markdown",
          body: "```sh\ndate\n```\nin `/home/node/.openclaw/workspace`",
        },
      }),
    ]);
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(card.querySelector(".md-code")?.textContent).toBe("date");
    expect(card.querySelector(".md-inline-code")?.textContent).toBe(
      "/home/node/.openclaw/workspace",
    );
    expect(card.textContent).not.toContain("`");
  });

  it("draws a diff in mono under its title, as the harness sent it", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4),
      fixture("approval.request", 5, {
        preview: { format: "diff", title: "tracker.csv", body: "-  120 units\n+  240 units" },
      }),
    ]);
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(within(card).getByText("tracker.csv")).toBeTruthy();
    expect(within(card).getByText(/240 units/).tagName).toBe("PRE");
    expect(card.querySelector(".md")).toBeNull();
  });

  it("sends the scope a person chose: once, this session, or always", () => {
    // A smaller ask: an outside email matters, and is answered once (ADR 0195).
    const store = renderShell([
      ...opened(),
      fixture("run.started", 4),
      fixture("approval.request", 5, {
        action: { kind: "tracker.write", input: { row: 4471 } },
        risk: [],
      }),
    ]);
    const card = screen.getByRole("article", { name: /Approval/ });
    fireEvent.click(within(card).getByLabelText("Always"));
    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    expect(store.resolved.at(-1)).toMatchObject({ decision: "approved", scope: "always" });
  });

  it("offers no scope for an ask that matters, and says it waits for you (ADR 0195)", () => {
    const store = renderShell(asking());
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(within(card).queryByLabelText("Always")).toBeNull();
    expect(screen.getByTestId("waits-for-you").textContent).toContain("Waits for you");
    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    expect(store.resolved.at(-1)).toMatchObject({ decision: "approved", scope: "once" });
  });

  it("counts down to the expiry, and says what policy did when nobody answered", () => {
    renderShell(asking());
    const card = screen.getByRole("article", { name: /Approval/ });
    // The fixture asks at 14:22 on 2 September 2026 with an hour to answer; today is later.
    expect(card.textContent).toContain("expired");

    const store = renderShell([
      ...asking(),
      fixture("approval.resolved", 6, {
        decision: "expired",
        resolved_by: "system",
        scope: "once",
      }),
    ]);
    store.update(
      snapshotOf([
        ...asking(),
        fixture("approval.resolved", 6, { decision: "expired", resolved_by: "system" }),
      ]),
    );
    const decided = screen.getAllByRole("article", { name: /Approval/ }).at(-1) as HTMLElement;
    expect(decided.textContent).toContain("nobody answered, so policy denied it");
  });

  it("says when a decision was made on another device, and when policy made it", () => {
    renderShell([
      ...asking(),
      fixture("approval.resolved", 6, {
        decision: "approved",
        resolved_by: ARJUN,
        resolved_elsewhere: true,
      }),
    ]);
    expect(screen.getByRole("article", { name: /Approval/ }).textContent).toContain(
      "Approved by Arjun on another device",
    );

    renderShell([
      ...asking(),
      fixture("approval.resolved", 6, {
        decision: "approved",
        resolved_by: "system",
        reason: "L3 · Autonomous, report back: runs end to end and reports back",
      }),
    ]);
    const cards = screen.getAllByRole("article", { name: /Approval/ });
    expect(cards.at(-1)?.textContent).toContain("Approved by policy");
  });

  it("says another device only of a person: not of policy, nor of a harness settling its own", () => {
    // Every decision this device did not send arrives as made elsewhere; only a person's was
    // made on a device (the OpenClaw test: "Approved by OpenClaw on another device").
    for (const by of [SCOUT, "system"]) {
      renderShell([
        ...asking(),
        fixture("approval.resolved", 6, {
          decision: "approved",
          resolved_by: by,
          resolved_elsewhere: true,
        }),
      ]);
      const card = screen.getAllByRole("article", { name: /Approval/ }).at(-1);
      expect(card?.textContent).toContain(by === "system" ? "Approved by policy" : "Approved by");
      expect(card?.textContent).not.toContain("another device");
    }
  });

  it("shows the decision once it is made", () => {
    const store = renderShell(asking());
    store.update(
      snapshotOf([
        ...asking(),
        fixture("approval.resolved", 6, { decision: "approved", resolved_by: ARJUN }),
        fixture("approval.executed", 7),
      ]),
    );
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(card.textContent).toContain("Approved by Arjun");
    expect(card.textContent).toContain("sent");
    expect(within(card).queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("feedback on a harness's line (M3.4)", () => {
  /** The `message.post` fixture's line: Scout's, by the id of the event that carried it. */
  const SAID = "evt_01K4ZQPX000000000000000067";
  const MESSAGE = "msg_01K4ZQPX000000000000000067";
  const from = (id: string, name: string) => ({
    participant_id: id,
    kind: "person",
    display_name: name,
    role: "owner",
  });
  /** Scout said something, and Arjun answered. */
  const room = () => [
    ...opened(),
    fixture("message.post", 4),
    fixture("message.post", 5, {
      id: "evt_01K4ZQPX000000000000000068",
      actor: person(ARJUN),
      text: "Thanks.",
    }),
  ];

  it("sends Not right? from a small form, with no thumbs to press (ADR 0200)", () => {
    const store = renderShell(room());
    // Scout's line is the first: feedback is the harness's to read, so its line is the one
    // that offers Not right?.
    const scouts = openMenu(0);
    expect(within(scouts).queryByRole("menuitem", { name: "Thumbs down" })).toBeNull();
    fireEvent.click(within(scouts).getByRole("menuitem", { name: "Not right?" }));
    const form = screen.getByTestId("correction-form");
    fireEvent.click(within(form).getByRole("button", { name: "Wrong facts" }));
    fireEvent.change(within(form).getByLabelText("Anything else"), {
      target: { value: "The 19th, not the 12th." },
    });
    fireEvent.submit(form);
    expect(store.feedback.at(-1)).toEqual({
      spaceId: SPACE,
      lineId: SAID,
      kind: "correction",
      text: "Wrong facts. The 19th, not the 12th.",
    });
    expect(screen.queryByTestId("correction-form")).toBeNull();
  });

  it("offers Not right? on the harness's words, and not on a person's", () => {
    renderShell(room());
    const scouts = openMenu(0);
    expect(within(scouts).getByRole("menuitem", { name: "Not right?" })).toBeTruthy();
    closeMenu();

    // Arjun's own line takes none: nothing reads a note about a person.
    const mine = openMenu(1);
    expect(within(mine).queryByRole("menuitem", { name: "Not right?" })).toBeNull();
  });

  it("holds the menu while feedback is on its way", () => {
    renderShell(room(), { busy: new Set([SAID]) });
    const note = within(openMenu(0)).getByRole("menuitem", { name: "Not right?" });
    expect((note as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows who reacted, and what they said was wrong, under the line", () => {
    renderShell([
      ...room(),
      fixture("feedback", 6, {
        kind: "reaction",
        reaction: "👎",
        text: undefined,
        message_id: MESSAGE,
        from: from(ARJUN, "Arjun"),
      }),
      fixture("feedback", 7, {
        message_id: MESSAGE,
        actor: person(DANA),
        from: from(DANA, "Dana"),
      }),
    ]);
    expect(screen.getByTestId("reaction").textContent).toBe("👎 Arjun");
    const note = screen.getByTestId("correction").textContent ?? "";
    expect(note).toContain("Dana");
    expect(note).toContain("The delivery date is the 19th, not the 12th.");
  });

  it("says under the line that its Not right? was turned away, with the words and why (PM-4)", () => {
    renderShell(room(), {
      unsentNotes: new Map([
        [SAID, { text: "Wrong facts. The 19th.", reason: "that message was taken back" }],
      ]),
    });
    const note = screen.getByTestId("unsent-note");
    expect(note.textContent).toContain("Wrong facts. The 19th.");
    expect(within(note).getByRole("status").textContent).toBe(
      "Not sent: that message was taken back.",
    );
    expect(screen.queryByTestId("correction")).toBeNull();
  });

  it("takes /wrong as a note on the harness's last message, and says when there is none", () => {
    const store = renderShell(room());
    const box = screen.getByLabelText("Message Scout");
    fireEvent.change(box, { target: { value: "/wrong The 19th, not the 12th." } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(store.feedback).toEqual([
      { spaceId: SPACE, lineId: SAID, kind: "correction", text: "The 19th, not the 12th." },
    ]);
    expect(screen.queryByTestId("notice")).toBeNull();

    const quiet = renderShell(opened());
    const boxes = screen.getAllByLabelText("Message Scout");
    const second = boxes[boxes.length - 1] as HTMLElement;
    fireEvent.change(second, { target: { value: "/wrong nothing yet" } });
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByTestId("notice").textContent).toContain("No harness has said anything");
    expect(quiet.feedback).toEqual([]);
  });
});

describe("the sidebar", () => {
  it("names Agents in the nav, and has no For you (withdrawn 22 September 2026) and no harnesses", () => {
    renderShell(asking());
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).queryByRole("button", { name: /For you/ })).toBeNull();
    expect(within(nav).queryByRole("button", { name: /Harnesses/ })).toBeNull();
    // The harnesses are on Agents, as on the phone and the iPad (ADR 0261's addendum): the rail
    // listed them under the rooms until 3 November 2026.
    expect(within(sidebar()).queryByText("Harnesses")).toBeNull();
    fireEvent.click(within(nav).getByRole("button", { name: /^Agents/ }));
    expect(screen.getByTestId(`harness-tile-${SCOUT}`)).toBeTruthy();
  });

  it("puts the + beside the workspace's name, over the tabs, as the iPad does (ADR 0264)", () => {
    // The owner may open a space; somebody who may not has no + (ADR 0196).
    renderShell([ownerJoined(), ...opened()]);
    const plus = within(sidebar()).getByRole("button", { name: "Create new space" });
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(plus.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(screen.getByTestId("recent-heading").parentElement as HTMLElement).queryByRole(
        "button",
        { name: "Create new space" },
      ),
    ).toBeNull();
  });

  it("says nothing on the shelf for a harness finished or never run (ADR 0050 rule 1)", () => {
    // OpenClaw, stopped after a run, still said Done with a green dot; before its first run the
    // list said nobody was here at all.
    renderShell([...opened(), fixture("run.started", 4), fixture("run.completed", 5)]);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    const line = shelfLine(SCOUT);
    expect(line.textContent).not.toContain("Done");
    expect(line.getAttribute("data-tone")).toBeNull();
    expect(screen.getByTestId(`harness-tile-${LEDGER}`)).toBeTruthy();
  });

  it("says a room's last words on its row as plain words, not Markdown", () => {
    renderShell([
      ...opened(),
      fixture("message.post", 4, {
        actor: harness(SCOUT),
        run_id: undefined,
        text: "```text\nSun Sep 27 01:52:32 PDT 2026\n```",
      }),
    ]);
    const row = within(sidebar()).getByRole("button", { name: /PO-4471/ });
    // The words, after the shared tag Dana's being here puts before them (ADR 0234).
    expect(row.querySelector(".cv-s > span:last-child")?.textContent).toBe(
      "Sun Sep 27 01:52:32 PDT 2026",
    );
  });

  it("says a queued turn as work, with the gear and the light round the face (ADR 0090)", () => {
    // Jacobian edits one message as a queued turn goes, in the markup it sends to Telegram and
    // Slack as well. Read out as it arrives, the row said `💭 Working… ▸ browser · https://…`.
    renderShell([
      ...opened(),
      fixture("message.post", 4, {
        actor: harness(SCOUT),
        run_id: undefined,
        text: "💭 Reading the news…\n▸ local-dev__web_search · Starship Flight 14 results",
      }),
    ]);
    const row = within(sidebar()).getByRole("button", { name: /PO-4471/ });
    expect(row.querySelector(".cv-s > span:last-child")?.textContent).toBe(
      "Reading the news · web search · Starship Flight 14 results",
    );
    expect(row.querySelector(".cv-gear")).toBeTruthy();
    expect(
      within(row)
        .getByRole("img", { name: /PO-4471/ })
        .getAttribute("data-busy"),
    ).toBe("true");
  });

  it("leaves a quiet room its own face and no gear", () => {
    renderShell(opened());
    const row = within(sidebar()).getByRole("button", { name: /PO-4471/ });
    expect(row.querySelector(".cv-gear")).toBeNull();
    expect(
      within(row)
        .getByRole("img", { name: /PO-4471/ })
        .getAttribute("data-busy"),
    ).toBeNull();
  });

  it("puts the name a space goes by on its row: the title's initials, not its harness's face", () => {
    // PO-4471 has a title, and the title is what tells it from Scout's other spaces; Scout's
    // own face belongs on the one row that is called Scout.
    renderShell(opened());
    const row = within(sidebar()).getByRole("button", { name: /PO-4471/ });
    expect(within(row).getByRole("img", { name: "PO-4471" })).toBeTruthy();
    expect(within(row).queryByRole("img", { name: /Scout/ })).toBeNull();
  });
});

describe("the run panel", () => {
  it("draws the plan as a timeline, with the ask as the step underway and no pill (ADR 0151)", () => {
    renderShell(asking());
    const panel = screen.getByRole("complementary", { name: "Run" });
    // No pill says so (ADR 0151): the step underway is the ask.
    expect(within(panel).getByText("needs your approval")).toBeTruthy();
    expect(panel.querySelectorAll(".ui-pill")).toHaveLength(0);
    expect(panel.querySelectorAll(".ui-timeline__item")).toHaveLength(4);
    expect(panel.querySelectorAll('.ui-timeline__item[data-status="now"]')).toHaveLength(1);
  });

  it("is not there when no run is", () => {
    renderShell(opened());
    expect(screen.queryByRole("complementary", { name: "Run" })).toBeNull();
  });

  it("has no timeline for a run that is nothing but tool calls (ADR 0046)", () => {
    // What Jacobian sends: no plan, a stretch of calls, a summary. The receipt under the
    // summary keeps the calls; a Timeline section that was one row saying so is gone.
    renderShell([
      ...opened(),
      fixture("run.started", 4, { plan: undefined }),
      fixture("step.log", 5, { step_id: "s1", status: "started", title: "memory_recall" }),
      fixture("step.log", 6, { step_id: "s1", status: "done", title: undefined }),
      fixture("step.log", 7, { step_id: "s2", status: "started", title: "web_search" }),
      fixture("step.log", 8, { step_id: "s2", status: "done", title: undefined }),
    ]);
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(within(panel).queryByText("Timeline")).toBeNull();
    expect(panel.querySelectorAll(".ui-timeline__item")).toHaveLength(0);
  });

  const running = () => [...opened(), fixture("run.started", 4), fixture("run.status", 5)];
  const target = { spaceId: SPACE, runId: RUN };

  it("pauses a running run, and resumes a paused one", () => {
    const store = renderShell(running());
    const panel = screen.getByRole("complementary", { name: "Run" });
    fireEvent.click(within(panel).getByRole("button", { name: "Pause" }));
    expect(store.runCommands).toEqual([{ verb: "pause", input: target }]);

    store.update(snapshotOf([...running(), fixture("run.pause", 6)]));
    // Resume in Pause's place says it is paused (ADR 0151): no pill says it again.
    expect(within(panel).queryByRole("button", { name: "Pause" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Resume" }));
    expect(store.runCommands.at(-1)).toEqual({ verb: "resume", input: target });
  });

  it("cannot pause a run that is waiting on you", () => {
    renderShell(asking());
    const panel = screen.getByRole("complementary", { name: "Run" });
    const pause = within(panel).getByRole("button", { name: "Pause" }) as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
  });

  it("stops a run only after asking, and offers a way back", () => {
    const store = renderShell(running());
    const panel = screen.getByRole("complementary", { name: "Run" });
    fireEvent.click(within(panel).getByRole("button", { name: "Stop" }));
    expect(within(panel).getByTestId("stop-confirm")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Keep going" }));
    expect(store.runCommands).toEqual([]);

    fireEvent.click(within(panel).getByRole("button", { name: "Stop" }));
    fireEvent.click(
      within(within(panel).getByTestId("stop-confirm")).getByRole("button", { name: "Stop" }),
    );
    expect(store.runCommands).toEqual([{ verb: "stop", input: target }]);
  });

  it("holds its controls while a command is on its way", () => {
    renderShell(running(), { busy: new Set([RUN]) });
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(
      (within(panel).getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(panel).getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("goes when the run ends, and the room has the width (ADR 0268)", () => {
    renderShell([...running(), fixture("run.cancel", 6)]);
    // What the run did is asked of the line that closed it, as on the phone.
    expect(screen.queryByRole("complementary", { name: "Run" })).toBeNull();
    expect(document.querySelector(".shell")?.getAttribute("data-panel")).toBe("false");
  });

  it("comes once its run has been going the thinking beat, as the bubble does (ADR 0268 addendum)", () => {
    vi.useFakeTimers();
    try {
      const now = new Date().toISOString();
      renderShell([...opened(), fixture("run.started", 4, { ts: now }), fixture("run.status", 5)]);
      expect(screen.queryByRole("complementary", { name: "Run" })).toBeNull();
      act(() => vi.advanceTimersByTime(THINKING_GRACE_MS));
      expect(screen.getByRole("complementary", { name: "Run" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the cost and the tokens, and the context with its model", () => {
    renderShell([...running(), fixture("usage", 6), fixture("context.usage", 7)]);
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(within(panel).getByTestId("cost").textContent).toBe("≈$1.47 · 85.5k tokens");
    expect(within(panel).getByText(/82k of 200k tokens · opus-5/)).toBeTruthy();
  });

  it("says how many of the tokens in came from the prompt cache", () => {
    renderShell([...running(), fixture("usage", 6, { cache_read_tokens: 80_000 })]);
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(within(panel).getByTestId("cost").textContent).toBe(
      "≈$1.47 · 85.5k tokens (80k cached)",
    );
  });

  it("folds a run with no plan into stretches and the moments that mattered", () => {
    // Each event a second after the last, as they would be: the rail is in time order.
    const at = (seq: number) => `2026-09-05T16:00:${String(seq).padStart(2, "0")}.000Z`;
    const step = (seq: number, id: string, status: string, title?: string) =>
      fixture("step.log", seq, { step_id: id, status, title, ts: at(seq) });
    renderShell([
      ...opened(),
      fixture("run.started", 4, { plan: undefined, ts: at(4) }),
      step(5, "a", "started", "Bash · pnpm check"),
      step(6, "a", "done"),
      step(7, "b", "started", "Bash · git status"),
      step(8, "b", "done"),
      step(9, "c", "started", "Read · README.md"),
      step(10, "c", "done"),
      fixture("approval.request", 11, { step_id: undefined, ts: at(11) }),
      fixture("approval.resolved", 12, { resolved_by: "usr_1", ts: at(12) }),
      step(13, "d", "started", "Bash · pnpm e2e"),
    ]);
    const panel = screen.getByRole("complementary", { name: "Run" });
    const rows = [...panel.querySelectorAll(".ui-timeline__item")].map((row) => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("3 tool calls");
    expect(rows[0]).toContain("mostly Bash");
    expect(rows[1]).toContain("Needed you · email.send");
    expect(rows[1]).toContain("approved by");
    expect(rows[2]).toContain("Bash · pnpm e2e");
    expect(panel.querySelectorAll('.ui-timeline__item[data-status="now"]')).toHaveLength(1);
  });

  it("marks a compaction on the timeline as a tick", () => {
    renderShell([...running(), fixture("context.usage", 6, { compacted: true })]);
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(panel.querySelectorAll('.ui-timeline__item[data-kind="tick"]')).toHaveLength(1);
  });
});

describe("the composer's commands", () => {
  const running = () => [...opened(), fixture("run.started", 4)];
  const target = { spaceId: SPACE, runId: RUN };

  function type(text: string) {
    const box = screen.getByRole("textbox", { name: /^Message / });
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: "Enter" });
  }

  it("steers with /steer, /followup and /interrupt", () => {
    const store = renderShell(running());
    type("/steer Mention the pallet count.");
    type("/followup Update the tracker after.");
    expect(store.runCommands).toEqual([
      { verb: "steer", input: { ...target, mode: "steer", text: "Mention the pallet count." } },
      { verb: "steer", input: { ...target, mode: "followup", text: "Update the tracker after." } },
    ]);
    expect(store.sent).toEqual([]);
  });

  it("steers what is typed while the Steer chip is on", () => {
    const store = renderShell(running());
    fireEvent.click(screen.getByRole("button", { name: "Steer" }));
    type("Ask Dana about pallets.");
    expect(store.runCommands).toEqual([
      { verb: "steer", input: { ...target, mode: "steer", text: "Ask Dana about pallets." } },
    ]);
  });

  it("pauses, resumes and stops from the keyboard", () => {
    const store = renderShell(running());
    type("/pause");
    store.update(snapshotOf([...running(), fixture("run.pause", 5)]));
    type("/resume");
    type("/stop the vendor called");
    expect(store.runCommands.map((c) => c.verb)).toEqual(["pause", "resume", "stop"]);
    expect(store.runCommands[2]?.input).toEqual({ ...target, reason: "the vendor called" });
  });

  it("says when a command has no run to act on, or is not a command at all", () => {
    const store = renderShell(opened());
    type("/steer nowhere");
    expect(screen.getByTestId("notice").textContent).toContain("no run going");
    type("/dance");
    expect(screen.getByTestId("notice").textContent).toContain("/dance is not a command");
    expect(store.runCommands).toEqual([]);
    type("just a message");
    expect(screen.queryByTestId("notice")).toBeNull();
    expect(store.sent).toEqual([
      { spaceId: SPACE, text: "just a message", to: [SCOUT], addressedTo: [SCOUT] },
    ]);
  });
});

describe("what a message shows about the run", () => {
  it("tags a mid-run message with what Chips did with it, and a steer with how it was meant", () => {
    renderShell(
      [
        ...opened(),
        fixture("run.started", 4),
        fixture("message.post", 5, {
          actor: person(ARJUN),
          text: "Any news?",
          idempotency_key: "k-msg",
        }),
        fixture("run.steer", 6, { idempotency_key: "k-steer" }),
      ],
      {
        receipts: new Map([
          ["k-msg", "queued"],
          ["k-steer", "steered"],
        ]),
      },
    );
    const rows = screen.getByTestId("messages").querySelectorAll(".msg");
    expect(within(rows[0] as HTMLElement).getByTestId("receipt").textContent).toBe("queued");
    expect(within(rows[1] as HTMLElement).getByTestId("mode").textContent).toBe("Steer");
    expect(within(rows[1] as HTMLElement).getByTestId("receipt").textContent).toBe("steered");
  });

  it("keeps the receipt out of the room and opens it from the summary's menu, with the steps, the time and the cost", () => {
    renderShell([
      ...asking(),
      fixture("approval.resolved", 6, { decision: "approved", resolved_by: ARJUN }),
      fixture("step.log", 7, {
        step_id: "email-dana",
        status: "done",
        title: undefined,
        duration_ms: 610,
      }),
      fixture("usage", 8),
      fixture("run.completed", 9),
    ]);
    expect(screen.queryByTestId("receipt-card")).toBeNull();
    // The receipt's one line under the menu's item, and the receipt itself once asked for.
    const item = within(openSummaryMenu()).getByRole("menuitem", { name: "What the run did" });
    expect(item.textContent).toContain("1 step · 13s · ≈$1.47");
    fireEvent.click(item);
    const card = screen.getByTestId("run-did");
    // One step was logged as done; the three still planned are not in the receipt.
    expect(card.textContent).toContain("1 step · 13s · ≈$1.47");
    expect(card.textContent).toContain("Email Dana to confirm");
    // And it is put away again.
    fireEvent.click(within(card).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("run-did")).toBeNull();
  });

  it("says what a run that only answered took and cost, with nothing to open", () => {
    // Jacobian answering from what it knew: no calls, a cost (India trip, 20 October 2026).
    renderShell([...opened(), fixture("run.started", 4), fixture("run.completed", 5)]);
    const card = openRunDid();
    expect(card.querySelector("details")).toBeNull();
    expect(card.querySelector(".ui-receipt")?.textContent).toBe("13s · ≈$1.47");
  });

  it("draws no receipt for a run with no steps and no cost", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4),
      fixture("run.completed", 5, { cost: undefined }),
    ]);
    expect(screen.queryByTestId("receipt-card")).toBeNull();
    expect(labelsOf(openSummaryMenu())).not.toContain("What the run did");
  });

  it("says Thinking and what the harness last said, before it has called anything", () => {
    renderShell([...opened(), fixture("run.started", 4), fixture("run.status", 5)]);
    const doing = screen.getByTestId("doing");
    // What kind of work on the top line, the harness's words under it, without their ellipsis
    // (ADR 0147); two lines, the strip's row opening with the first call.
    expect(doing.getAttribute("aria-label")).toBe("Scout · Thinking · Reading PO #4471");
    expect(doing.querySelector(".doing-label .swap-now")?.textContent).toBe("Thinking");
    expect(doing.querySelector(".doing-detail .swap-now")?.textContent).toBe("Reading PO #4471");
    expect(doing.querySelector(".lit-dots")).toBeTruthy();
    expect(doing.querySelector(".doing-strip")).toBeNull();
  });

  it("says what the work is in the bubble alone: no pill in the header or the panel (ADR 0151)", () => {
    // Jacobian's run.status is a line of reasoning two hundred characters long, or the reply's
    // own first words; carried in the header's pill, it folded the room's name to nothing.
    const thought =
      "I noticed that the screenshots aren't waiting for the image to render properly before the scrolling settles, which makes the animation look off.";
    renderShell([
      ...opened(),
      fixture("run.started", 4),
      fixture("run.status", 5, { phase: "thinking", verb_phrase: thought }),
    ]);
    expect(document.querySelector(".conv-h .ui-pill")).toBeNull();
    expect(document.querySelector(".rp-h .ui-pill")).toBeNull();
    // The header wears the room's own face, its row's in the list, lit while it works (ADR 0268).
    const face = document.querySelector(".conv-h .ui-avatar") as HTMLElement;
    expect(face.getAttribute("aria-label")).toBe("PO-4471");
    expect(face.getAttribute("data-busy")).toBe("true");
    expect(screen.getByTestId("doing").getAttribute("aria-label")).toBe(
      `Scout · Thinking · ${thought}`,
    );
    // The shelf on Agents says the bubble's top line, as the bubble holds it.
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    expect(shelfLine(SCOUT).textContent).toBe("Thinking");
  });

  it("says what the harness is doing while it does it, and stops when the answer lands", () => {
    // Jacobian answers one question with ten tool calls. They belong on screen while they
    // happen and in the receipt afterwards — never as ten cards under the answer for good.
    const at = (second: number) => `2026-09-02T14:22:0${second}.004Z`;
    const calls = [
      fixture("run.status", 5, { ts: at(1) }),
      fixture("step.log", 6, {
        step_id: "recall",
        title: "memory_recall · the trip",
        tool: "jacobian.memory_recall",
        summary: undefined,
        ts: at(3),
      }),
      fixture("step.log", 7, {
        step_id: "search",
        status: "started",
        title: "web_search · Tamar hours",
        tool: "jacobian.web_search",
        summary: undefined,
        ts: at(4),
      }),
    ];
    renderShell([...opened(), fixture("run.started", 4), ...calls]);
    const doing = screen.getByTestId("doing");
    // What kind of work, read off the tool; what it was given beside its glyph; how long the turn
    // has taken; and the calls so far as a strip (ADR 0147).
    expect(doing.getAttribute("aria-label")).toBe("Scout · Searching the web · “Tamar hours”");
    expect(doing.querySelector(".doing-label .swap-now")?.textContent).toBe("Searching the web");
    const detail = doing.querySelector(".doing-detail .swap-now") as HTMLElement;
    expect(detail.textContent).toBe("“Tamar hours”");
    expect(detail.querySelector(".ui-icon")).toBeTruthy();
    expect(doing.querySelector(".doing-clock")?.textContent).toMatch(/^\d+:\d{2}$/);
    expect(doing.querySelector(".doing-strip")).toBeTruthy();

    cleanup();
    renderShell([...opened(), fixture("run.started", 4), ...calls, fixture("run.completed", 8)]);
    expect(screen.queryByTestId("doing")).toBeNull();
    // Where they went: into the answer's receipt, which waits in its menu until somebody asks.
    expect(screen.queryByTestId("receipt-card")).toBeNull();
    expect(openRunDid().textContent).toContain("web_search · Tamar hours");
  });

  it("holds a harness's reply until its run closes, so it lands as the bubble goes (ADR 0147)", () => {
    vi.useFakeTimers();
    try {
      const going = [...opened(), fixture("run.started", 4), fixture("run.status", 5)];
      const reply = fixture("message.post", 6, {
        text: "Confirmed PO #4471 with Northwind and updated the tracker.",
      });
      const store = renderShell(going);
      const messages = screen.getByTestId("messages");
      const drawn = () => messages.querySelector(`[data-line="${reply["id"]}"]`);
      // The reply comes while the run is still going: held, the bubble standing.
      act(() => store.update(snapshotOf([...going, reply])));
      expect(drawn()).toBeNull();
      expect(screen.getByTestId("doing")).toBeTruthy();
      // The run closes on it 0.4 s later: the reply, its receipt and the bubble's going, at once.
      act(() => vi.advanceTimersByTime(400));
      act(() =>
        store.update(
          snapshotOf([...going, reply, fixture("run.completed", 7, { summary: reply["text"] })]),
        ),
      );
      expect(drawn()).toBeTruthy();
      expect(screen.queryByTestId("doing")).toBeNull();
      expect(labelsOf(openSummaryMenu())).toContain("What the run did");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stands still while the room is out of touch, and goes as the reply it missed lands", () => {
    vi.useFakeTimers();
    try {
      const going = [...opened(), fixture("run.started", 4), fixture("run.status", 5)];
      const store = renderShell(going, { connection: "closed" });
      const bubble = () => screen.getByTestId("doing").querySelector(".doing-bub");
      const clock = () => screen.getByTestId("doing").querySelector(".doing-clock")?.textContent;
      // What was known when the server was last heard from: dots unlit, the clock stopped.
      expect(bubble()?.getAttribute("data-resting")).toBe("true");
      const stood = clock();
      act(() => vi.advanceTimersByTime(3000));
      expect(clock()).toBe(stood);
      // Back in touch, the catch-up brings the reply and the close together: one change.
      const reply = fixture("message.post", 6, { text: "Confirmed PO #4471 with Northwind." });
      act(() =>
        store.update(
          snapshotOf([...going, reply, fixture("run.completed", 7, { summary: reply["text"] })]),
        ),
      );
      expect(
        screen.getByTestId("messages").querySelector(`[data-line="${reply["id"]}"]`),
      ).toBeTruthy();
      expect(screen.queryByTestId("doing")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lights its dots again a beat after the room is back, for a turn still going", () => {
    vi.useFakeTimers();
    try {
      const going = [...opened(), fixture("run.started", 4), fixture("run.status", 5)];
      const store = renderShell(going, { connection: "connecting" });
      const resting = () =>
        screen.getByTestId("doing").querySelector(".doing-bub")?.getAttribute("data-resting");
      expect(resting()).toBe("true");
      // Open again: the catch-up is a round trip behind, and may yet end the turn.
      act(() => store.update(snapshotOf(going)));
      expect(resting()).toBe("true");
      act(() => vi.advanceTimersByTime(800));
      expect(resting()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("draws a word said mid-run once the wait is up, the bubble working on under it", () => {
    vi.useFakeTimers();
    try {
      const going = [...opened(), fixture("run.started", 4), fixture("run.status", 5)];
      const word = fixture("message.post", 6, { text: "Checking the captured layouts now." });
      const store = renderShell(going);
      const messages = screen.getByTestId("messages");
      act(() => store.update(snapshotOf([...going, word])));
      expect(messages.querySelector(`[data-line="${word["id"]}"]`)).toBeNull();
      act(() => vi.advanceTimersByTime(1500));
      expect(messages.querySelector(`[data-line="${word["id"]}"]`)).toBeTruthy();
      expect(screen.getByTestId("doing")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("draws what was said mid-run before the room was opened, without a wait", () => {
    const word = fixture("message.post", 6, { text: "Checking the captured layouts now." });
    renderShell([...opened(), fixture("run.started", 4), fixture("run.status", 5), word]);
    const messages = screen.getByTestId("messages");
    expect(messages.querySelector(`[data-line="${word["id"]}"]`)).toBeTruthy();
  });

  it("leaves what a failed run said, with its receipt", () => {
    renderShell([...asking(), fixture("run.failed", 6)]);
    const status = screen.getByTestId("run-status");
    expect(status.textContent).toContain(fixture("run.failed", 6)["error"] as string);
    expect(within(status).getByTestId("receipt-card")).toBeTruthy();
  });
});

describe("a question from the harness", () => {
  const askedQuestion = () => [...opened(), fixture("run.started", 4), fixture("question.ask", 5)];

  it("shows the options with the default marked, and sends the choice for the ask", () => {
    const store = renderShell(askedQuestion());
    const card = screen.getByRole("article", { name: /Question from Scout/ });
    expect(card.textContent).toContain("Which should I confirm?");
    // Which it takes if nobody answers, in the phone's words (ADR 0268).
    expect(card.textContent).toMatch(/It will take “.+” if nobody answers\./);
    fireEvent.click(within(card).getByLabelText(/26 September/));
    fireEvent.click(within(card).getByRole("button", { name: "Send the answer" }));
    expect(store.answered).toEqual([
      {
        spaceId: SPACE,
        runId: RUN,
        askId: "qst_01K4ZQPX000000000000000009",
        answers: [{ questionId: "delivery-window", values: ["26"], freeText: undefined }],
      },
    ]);
  });

  it("shows the answer once it is in, and who gave it", () => {
    renderShell([...askedQuestion(), fixture("question.answered", 6)]);
    const card = screen.getByRole("article", { name: /Question from Scout/ });
    expect(card.textContent).toContain("Answered by Arjun");
    expect(card.textContent).toContain("19 September");
    expect(within(card).queryByRole("button", { name: "Send the answer" })).toBeNull();
  });
});

describe("two harnesses at work in one room (the OpenClaw test, finding 22)", () => {
  /** Ledger starting a run of its own in PO-4471, after Scout's. */
  const ledgerBegins = (seq: number) =>
    fixture("run.started", seq, { run_id: LEDGER_RUN, actor: harness(LEDGER), plan: undefined });
  const doing = () =>
    screen.queryAllByTestId("doing").map((strip) => strip.getAttribute("aria-label"));

  it("says what each is doing, and keeps the one still working when the other answers", () => {
    // Jacobian began, OpenClaw began 1.7 s later and answered four seconds after that, and the
    // room's one strip went with it while Jacobian worked on for 28 seconds.
    const working = [
      ...opened(),
      fixture("run.started", 4),
      fixture("run.status", 5),
      ledgerBegins(6),
    ];
    const store = renderShell(working);
    expect(doing()).toEqual([
      "Scout · Thinking · Reading PO #4471",
      "Ledger · Thinking · Reading the message",
    ]);

    store.update(
      snapshotOf([
        ...working,
        fixture("run.completed", 7, { run_id: LEDGER_RUN, actor: harness(LEDGER) }),
      ]),
    );
    expect(doing()).toEqual(["Scout · Thinking · Reading PO #4471"]);
  });

  it("keeps an ask one is waiting on when the other starts a run, named for whose it is", () => {
    // Only the room's newest run's cards were drawn, so Scout's approval went from the desktop
    // the moment Ledger began; the phone kept it.
    const store = renderShell([...asking(), ledgerBegins(6)]);
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(card.textContent).toContain("Scout asks");
    expect(card.textContent).toContain("Send this email to dana@northwind.com?");
    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    expect(store.resolved).toEqual([
      { spaceId: SPACE, runId: RUN, approvalId: APPROVAL, decision: "approved", scope: "once" },
    ]);
    // Scout is waiting on somebody, which is the card's to say; Ledger is at work.
    expect(doing()).toEqual(["Ledger · Thinking · Reading the message"]);
  });
});

/**
 * The workspace's log, opened from You's row (ADR 0261) beside the list (ADR 0265), as an owner or
 * an admin opens it.
 */
async function openLog(): Promise<void> {
  fireEvent.click(screen.getByTestId("you"));
  fireEvent.click(await screen.findByTestId("workspace-log"));
  await screen.findByRole("region", { name: "Workspace log" });
}

describe("the workspace's log", () => {
  it("lists who decided what and when, newest first, with a way to the space", async () => {
    renderShell([
      ...asking(),
      fixture("approval.resolved", 6, {
        decision: "approved",
        resolved_by: ARJUN,
        scope: "always",
      }),
      fixture("run.pause", 7, { by: DANA }),
      ownerJoined(8),
    ]);
    await openLog();
    const rows = screen.getByTestId("audit").querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("joined as owner");
    expect(rows[1]?.textContent).toContain("Dana");
    expect(rows[1]?.textContent).toContain("paused the run");
    expect(rows[2]?.textContent).toContain("Arjun");
    expect(rows[2]?.textContent).toContain("approved email.send, always");
    fireEvent.click(within(rows[2] as HTMLElement).getByRole("button", { name: "PO-4471" }));
    expect(screen.getByRole("article", { name: /Approval/ })).toBeTruthy();
  });

  it("says when there is nothing yet", async () => {
    const { model } = snapshotOf([...opened(), ownerJoined(4)]);
    renderShell([], { model: { ...model, audit: [] } });
    await openLog();
    expect(screen.getByTestId("audit-empty")).toBeTruthy();
  });

  it("is not in the sidebar, and opens beside You's list (Arjun, 3 November 2026)", async () => {
    renderShell([...opened(), ownerJoined(4)]);
    expect(within(sidebar()).queryByRole("button", { name: /Audit/ })).toBeNull();
    await openLog();
    // You stays lit over it: it is one of You's pages, and the list is still there beside it.
    expect(screen.getByTestId("you").getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("main", { name: "You" })).toBeTruthy();
    expect(screen.getByTestId("workspace-log").getAttribute("aria-current")).toBe("page");
  });

  it("is an owner's or an admin's: a member's You has no card for it", async () => {
    renderShell([
      ...opened(),
      fixture("person.joined", 4, { participant_id: ARJUN, display_name: "Arjun", role: "member" }),
    ]);
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    expect(screen.queryByTestId("workspace-log")).toBeNull();
  });
});

describe("the empty Agents page (ADR 0261)", () => {
  /** Nobody but Arjun, the owner, and Dana: no harness has ever connected. */
  const people: Directory = {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  };
  const card = (id: string, name: string, needs?: string): Connector => ({
    id,
    name,
    line: `${name}, through its bridge`,
    ...(needs === undefined ? {} : { needs }),
    kind: "one-line",
    command: `chips connect ${id} '{link}'`,
    capabilities: ["agents"],
    published: true,
  });
  const empty = (role: "owner" | "member" = "owner") => {
    const store = fakeStore(
      snapshotOf(
        [fixture("person.joined", 1, { participant_id: ARJUN, display_name: "Arjun", role })],
        { directory: people },
      ),
    );
    store.connectorCards = [
      card("claude-code", "Claude Code", "Claude Code installed and signed in"),
      card("opencode", "OpenCode"),
    ];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    return store;
  };

  it("is the harnesses to pick from, and says no harness is here only by being so", async () => {
    empty();
    const gallery = await screen.findByTestId("page-gallery");
    expect(
      within(gallery).getByRole("heading", { name: "Connect a harness to bring in your agents" }),
    ).toBeTruthy();
    const claude = within(gallery).getByRole("button", { name: "Connect Claude Code" });
    expect(claude.textContent).toContain("You need Claude Code installed and signed in");
    expect(within(gallery).getByRole("button", { name: "Connect OpenCode" })).toBeTruthy();
    expect(within(gallery).getByTestId("page-way-own")).toBeTruthy();
    expect(within(gallery).getByTestId("page-way-http")).toBeTruthy();
    // Said once, by the page: not under its name, nor in the sidebar, nor as "Agents · 0".
    expect(screen.queryByText(/No harnesses yet/)).toBeNull();
    expect(screen.queryByText("Agents · 0")).toBeNull();
    expect(within(sidebar()).queryByText("Harnesses")).toBeNull();
    // The cards are the way in: no second Connect a harness in the header.
    expect(screen.queryByRole("button", { name: "Connect a harness" })).toBeNull();
  });

  it("opens the dialog at the card picked, with its link, and closes it from there", async () => {
    const store = empty();
    fireEvent.click(await screen.findByRole("button", { name: "Connect Claude Code" }));
    await screen.findByTestId("join-command");
    expect(store.linksMade).toHaveLength(1);
    expect(screen.queryByTestId("join-gallery")).toBeNull();
  });

  it("leaves Connect's dialog as it was while the first harness comes and the list takes the gallery's place", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    try {
      const store = empty();
      fireEvent.click(await screen.findByRole("button", { name: "Connect Claude Code" }));
      const dialog = await screen.findByTestId("add-harness-dialog");
      await screen.findByTestId("join-command");
      // Another harness connects, from elsewhere, while the link waits.
      act(() => {
        const now = store.getSnapshot();
        store.update({
          ...now,
          directory: { ...now.directory, [SCOUT]: DIRECTORY[SCOUT] as Participant },
        });
      });
      expect(await screen.findByTestId("harness-shelf")).toBeTruthy();
      expect(screen.queryByTestId("page-gallery")).toBeNull();
      // The same dialog, at the same step, and no second link made.
      expect(screen.getByTestId("add-harness-dialog")).toBe(dialog);
      expect(screen.getByTestId("join-command")).toBeTruthy();
      expect(store.linksMade).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is a member's shelf with its Connect tile, and the words a member is told", async () => {
    empty("member");
    expect(screen.queryByTestId("page-gallery")).toBeNull();
    const shelf = await screen.findByTestId("harness-shelf");
    expect(within(shelf).getByRole("button", { name: "Connect a harness" })).toBeTruthy();
    expect(within(shelf).queryByTestId("view-all-harnesses")).toBeNull();
    expect(
      screen.getByText("No agents yet. A harness's agents come when it connects."),
    ).toBeTruthy();
  });

  it("ends the shelf with Connect a harness once there are harnesses, and the header has none", () => {
    renderShell(opened());
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    const shelf = screen.getByTestId("harness-shelf");
    const tiles = within(shelf).getAllByRole("button");
    expect(tiles).toHaveLength(4);
    // Each named by what it shows (ADR 0275): a harness's name then its line, and Connect's words.
    expect(tiles.slice(0, 2).map((tile) => tile.dataset["testid"]?.split("-")[1])).toEqual([
      "tile",
      "tile",
    ]);
    expect(tiles[2]).toBe(within(shelf).getByRole("button", { name: "Connect a harness" }));
    expect(tiles[3]).toBe(within(shelf).getByRole("button", { name: "View all harnesses" }));
    expect(screen.getAllByRole("button", { name: "Connect a harness" })).toHaveLength(1);
  });
});

describe("the autonomy dial", () => {
  const withPolicy = (role: "owner" | "member" = "owner") => [
    ...opened(),
    fixture("policy.updated", 4, {
      space_id: undefined,
      policy: { autonomy: 1, rules: [] },
      workspace_max_autonomy: 2,
      budget_usd: 25,
    }),
    fixture("run.started", 5),
    fixture("usage", 6),
    // Who is reading, and their standing: the dial is an owner's or an admin's (SEC-1).
    fixture("person.joined", 7, { participant_id: ARJUN, display_name: "Arjun", role }),
  ];

  it("shows the level in force and the budget, and turns as a policy event for this room", () => {
    const store = renderShell(withPolicy());
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(within(panel).getByTestId("budget").textContent).toBe("≈$1.47 of ≈$25.00 budget");
    const dial = within(panel).getByRole("group", { name: /Autonomy for Scout here/ });
    expect((within(dial).getByLabelText("L1 · Ask first") as HTMLInputElement).checked).toBe(true);
    // Above the cap: shown, and cannot be chosen.
    expect(
      (within(dial).getByLabelText("L3 · Autonomous, report back") as HTMLInputElement).disabled,
    ).toBe(true);
    fireEvent.click(within(dial).getByLabelText("L2 · Ask when it matters"));
    expect(store.dialed).toEqual([{ harnessId: SCOUT, spaceId: SPACE, level: 2, rules: [] }]);
  });

  it("is not drawn at all for a harness that has not said it takes one (ADR 0046)", () => {
    // Jacobian's manifest declares nothing: its permissions are its own, and a dial that changed
    // nothing it could see was a lie with a label. The budget is money, and stays.
    const silent: Directory = {
      ...DIRECTORY,
      [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: ARJUN },
    };
    renderShell(withPolicy(), { directory: silent });
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(within(panel).queryByRole("group", { name: /Autonomy/ })).toBeNull();
    expect(within(panel).queryByText("Autonomy")).toBeNull();
    expect(within(panel).getByTestId("budget").textContent).toBe("≈$1.47 of ≈$25.00 budget");
  });

  it("goes with the panel once the run has ended (ADR 0268)", () => {
    renderShell([...withPolicy(), fixture("run.completed", 8)]);
    expect(screen.queryByRole("group", { name: /Autonomy/ })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Run" })).toBeNull();
  });

  it("is read-only for a member, and for a reader whose standing is not yet known (SEC-1)", () => {
    // The server refuses a member's `policy.updated`; the dial says so by not turning.
    const store = renderShell(withPolicy("member"));
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(within(panel).queryByRole("group", { name: /Autonomy/ })).toBeNull();
    expect(within(panel).getByRole("img", { name: /L1/ })).toBeTruthy();
    expect(store.dialed).toEqual([]);
    cleanup();
    // Nobody has joined in the fold yet: not an owner until the fold says so.
    renderShell(withPolicy().slice(0, -1));
    const early = screen.getByRole("complementary", { name: "Run" });
    expect(within(early).queryByRole("group", { name: /Autonomy/ })).toBeNull();
    expect(within(early).getByRole("img", { name: /L1/ })).toBeTruthy();
  });
});

describe("attachments (M1.5)", () => {
  it("shows a message's photos in a grid, from the thumbnails", async () => {
    renderShell([...opened(), fixture("message.post", 20, { attachments: [PHOTO] })]);
    const image = await screen.findByRole("img", { name: "holiday.png" });
    expect(image.getAttribute("src")).toBe("blob:thumb-att_01K4ZQPX000000000000000031");
    expect(screen.getByTestId("photo-grid").getAttribute("data-count")).toBe("1");
  });

  it("puts a measured video in the album as its poster and length, which opens the viewer (§4.3, decision 7)", async () => {
    const { duration_ms: _measured, ...unmeasured } = CLIP;
    renderShell([
      ...opened(),
      fixture("message.post", 20, {
        attachments: [
          PHOTO,
          CLIP,
          { ...unmeasured, attachment_id: "att_01K4ZQPX000000000000000034" },
        ],
      }),
    ]);
    // The photo and the measured clip are one album of two, in the order the message listed them.
    const grid = screen.getByTestId("photo-grid");
    expect(grid.getAttribute("data-count")).toBe("2");
    expect(
      within(grid)
        .getAllByRole("button")
        .map((tile) => tile.getAttribute("aria-label")),
    ).toEqual(["Open holiday.png", "Play IMG_4410.MOV"]);
    const tile = within(grid).getByTestId("video-tile");
    await waitFor(() =>
      expect(tile.querySelector("img")?.getAttribute("src")).toBe(
        "blob:thumb-att_01K4ZQPX000000000000000033",
      ),
    );
    expect(within(tile).getByText("0:43")).toBeDefined();
    // One the server never measured is a card under the album, with no poster to ask for, and it
    // keeps its Download; the album's clip is downloaded from the viewer, as its photos are.
    const other = screen.getByTestId("video-card");
    expect(other.querySelector("img")).toBeNull();
    expect(within(other).getByRole("button", { name: "Download IMG_4410.MOV" })).toBeDefined();
    expect(within(grid).queryByRole("button", { name: /^Download/ })).toBeNull();

    // The player is the viewer's stage, not the room (§4.3, 16 September 2026).
    expect(screen.queryByTestId("video-player")).toBeNull();
    fireEvent.click(tile);
    expect(await screen.findByTestId("viewer-video")).toBeDefined();
    expect(screen.getByTestId("viewer-count").textContent).toBe("2 of 2");
  });

  it("a video the server never measured opens the viewer on it alone (deckOfOne)", async () => {
    const { duration_ms: _gone, width: _w, height: _h, ...unmeasured } = CLIP;
    renderShell([
      ...opened(),
      fixture("message.post", 20, {
        attachments: [{ ...unmeasured, attachment_id: "att_01K4ZQPX000000000000000034" }],
      }),
    ]);
    const card = await screen.findByTestId("video-card");
    fireEvent.click(within(card).getByRole("button", { name: "Play IMG_4410.MOV" }));
    expect(await screen.findByTestId("viewer-video")).toBeDefined();
    // A deck of one says no place, and offers nowhere to page to.
    expect(screen.getByTestId("viewer-count").textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Newer" })).toBeNull();
  });

  it("plays a video on the stage from its grant where there is one (ADR 0058)", async () => {
    renderShell([
      ...opened(),
      fixture("message.post", 20, {
        attachments: [{ ...CLIP, attachment_id: "att_01K4ZQPX000000000000000035" }],
      }),
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Play IMG_4410.MOV" }));
    const player = await screen.findByTestId("viewer-player");
    expect(player.getAttribute("src")).toBe(
      "/v1/attachments/att_01K4ZQPX000000000000000035?variant=play&sig=s",
    );
  });

  it("shows a voice note's words, and plays the sound in place when asked (ADR 0054)", async () => {
    renderShell([...opened(), fixture("message.post", 20, { attachments: [VOICE] })]);
    const card = await screen.findByTestId("voice-card");
    expect(within(card).getByText("Voice note")).toBeDefined();
    expect(within(card).getByText("0:08")).toBeDefined();
    expect(within(card).getByTestId("voice-transcript").textContent).toBe(
      "Send Priya the receipt from the hardware store.",
    );
    expect(within(card).queryByTestId("voice-player")).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "Play Voice note" }));
    const player = await within(card).findByTestId("voice-player");
    expect(player.getAttribute("src")).toBe("blob:file-att_01K4ZQPX000000000000000035");
    // The words stay under the player.
    expect(within(card).getByTestId("voice-transcript")).toBeDefined();
    fireEvent.error(player);
    expect(within(card).getByRole("alert").textContent).toBe(
      "This browser cannot play this voice note. Download it to hear it.",
    );
  });

  it("shows a file as a card and a PDF with its first page; an .html file opens in a frame, never on the page (ADR 0100)", async () => {
    renderShell(
      [...opened(), fixture("message.post", 20, { attachments: [PDF, HTML] })],
      {},
      fakeFiles(() => "<p>Q3</p>"),
    );
    expect(screen.getAllByTestId("file-card")).toHaveLength(2);
    const preview = await screen.findByTestId("pdf-preview");
    expect(preview.getAttribute("data")).toMatch(/^blob:file-att_.*#page=1/);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelectorAll("object")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Open report.html" }));
    const frame = await screen.findByTestId("page-view");
    // Loaded from the page door (ADR 0201), where its own policy comes as a header and its
    // script runs; never given the document, which would take the app's policy with it.
    expect(frame.getAttribute("src")).toBe(`/v1/pages/ticket-for-${HTML.attachment_id}`);
    expect(frame.getAttribute("srcdoc")).toBeNull();
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(screen.getByRole("button", { name: "Download" })).toBeDefined();
  });

  it("draws an .html file's words, still, where the page door is out of reach (ADR 0201)", async () => {
    // Through a tunnel, or from a server from before the door: the page is given its document,
    // under the phone's policy for an HTML page (ADR 0059's addendum), and the app's own.
    renderShell(
      [...opened(), fixture("message.post", 20, { attachments: [HTML] })],
      {},
      sharedFakeFiles({ page: () => "<p>Q3</p>", pageUrl: () => undefined }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open report.html" }));
    const frame = await screen.findByTestId("page-view");
    expect(frame.getAttribute("src")).toBeNull();
    expect(frame.getAttribute("srcdoc")).toBe(`${HTML_META}<p>Q3</p>`);
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("opens a PDF in the page view, drawn by the browser's own viewer, with Download (ADR 0125)", async () => {
    renderShell(
      [...opened(), fixture("message.post", 20, { attachments: [PDF] })],
      {},
      fakeFiles(),
    );
    // Its card still draws the first page, and is a button that opens it rather than a download.
    expect(await screen.findByTestId("pdf-preview")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Open PO-4471.pdf" }));
    const view = await screen.findByTestId("page-view-pdf");
    expect(view.getAttribute("type")).toBe("application/pdf");
    expect(view.getAttribute("data")).toMatch(/^blob:file-att_/);
    expect(screen.getByTestId("page-view-dialog").textContent).toContain("PO-4471.pdf");
    expect(screen.getByRole("button", { name: "Download" })).toBeDefined();
    // Not a frame of words: a PDF is never read as a page.
    expect(screen.queryByTestId("page-view")).toBeNull();
  });

  it("opens a .md file as a page made from it, in a frame that runs nothing (ADR 0123)", async () => {
    renderShell(
      [...opened(), fixture("message.post", 20, { attachments: [MARKDOWN] })],
      {},
      fakeFiles(() => "# Mission murals\n\n- [NoeHill](https://noehill.com)\n\n<script>x</script>"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open mission-murals-walking-tour.md" }));
    const frame = await screen.findByTestId("page-view");
    const html = frame.getAttribute("srcdoc") ?? "";
    expect(html).toContain("<h1>Mission murals</h1>");
    expect(html).toContain(
      '<a href="https://noehill.com" target="_blank" rel="noopener noreferrer">NoeHill</a>',
    );
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("font: 15px/1.5");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(screen.getByRole("button", { name: "Download" })).toBeDefined();
  });

  it("uploads a chosen file as it is staged, and the send carries what the server made of it", async () => {
    const files = fakeFiles();
    const store = renderShell(opened(), {}, files);
    const picker = screen.getByTestId("file-picker");
    const file = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
    fireEvent.change(picker, { target: { files: [file] } });

    const chips = screen.getByRole("list", { name: "Attachments" });
    expect(within(chips).getByText("notes.txt")).toBeDefined();
    await within(chips).findByText("3 B");
    expect(files.uploaded).toEqual([file]);

    // A message of files alone may go.
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(store.sent).toEqual([
      {
        spaceId: "spc_01K4ZQPX000000000000000002",
        text: "",
        attachments: [{ id: "att_1", filename: "notes.txt", mimeType: "text/plain", byteSize: 3 }],
        to: [SCOUT],
        addressedTo: [SCOUT],
      },
    ]);
    expect(screen.queryByRole("list", { name: "Attachments" })).toBeNull();
  });

  it("says how far a long upload has got while it goes (ADR 0052)", async () => {
    let progress: ((sent: number, total: number) => void) | undefined;
    let finish: (() => void) | undefined;
    const files: ReturnType<typeof fakeFiles> = {
      ...fakeFiles(),
      upload: (file, _keep, onProgress) => {
        progress = onProgress;
        return new Promise((resolve) => {
          finish = () =>
            resolve({ id: "att_1", filename: file.name, mimeType: file.type, byteSize: file.size });
        });
      },
    };
    renderShell(opened(), {}, files);
    const file = new File([new Uint8Array(10)], "clip.mov", { type: "video/quicktime" });
    fireEvent.change(screen.getByTestId("file-picker"), { target: { files: [file] } });

    const chips = screen.getByRole("list", { name: "Attachments" });
    expect(within(chips).getByText("uploading…")).toBeDefined();
    act(() => progress?.(4, 10));
    expect(within(chips).getByText("uploading… 40%")).toBeDefined();
    await act(async () => finish?.());
    await within(chips).findByText("10 B");
  });

  it("refuses a file over its kind's cap at the chip, before a byte of it is uploaded (ADR 0047)", async () => {
    const files = fakeFiles();
    renderShell(
      [
        ...opened(),
        fixture("attachment.limits_set", 20, {
          image_bytes: 1_048_576,
          video_bytes: null,
          file_bytes: null,
        }),
      ],
      {},
      files,
    );
    const big = new File([new Uint8Array(2 * 1024 * 1024)], "big.png", { type: "image/png" });
    const small = new File([new Uint8Array(4)], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("file-picker"), { target: { files: [big, small] } });
    const chips = screen.getByRole("list", { name: "Attachments" });
    expect(within(chips).getByText("big.png")).toBeDefined();
    expect(
      within(chips).getByText("failed · Photos here are capped at 1 MB, and this one is 2 MB."),
    ).toBeDefined();
    await within(chips).findByText("4 B");
    expect(files.uploaded).toEqual([small]);
  });

  it("offers to keep a photo's or a video's location, and a taken-out file goes nowhere", async () => {
    const files = fakeFiles();
    renderShell(opened(), {}, files);
    const photo = new File([new Uint8Array(4)], "IMG_2210.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("file-picker"), { target: { files: [photo] } });
    const keep = (await screen.findByLabelText("Keep location")) as HTMLInputElement;
    expect(keep.checked).toBe(false);
    await within(screen.getByRole("list", { name: "Attachments" })).findByText("4 B");
    fireEvent.click(keep);
    // Turning it on uploads the photo again, this time keeping what the phone wrote.
    await vi.waitFor(() => expect(files.uploaded).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_2210.jpg" }));
    expect(screen.queryByRole("list", { name: "Attachments" })).toBeNull();
    expect(screen.queryByLabelText("Keep location")).toBeNull();

    // A video says where it was taken too, and the server strips that as it does a photo's.
    const video = new File([new Uint8Array(8)], "IMG_4410.MOV", { type: "video/quicktime" });
    fireEvent.change(screen.getByTestId("file-picker"), { target: { files: [video] } });
    expect(await screen.findByLabelText("Keep location")).toBeDefined();
  });

  it("records a voice note from the composer, says it is being written down, and sends the words (ADR 0055)", async () => {
    // Without a recorder there is no microphone to offer.
    renderShell(opened());
    expect(screen.queryByRole("button", { name: "Record a voice note" })).toBeNull();
    cleanup();

    const microphone = installMicrophone();
    try {
      let heard: (() => void) | undefined;
      const uploaded: File[] = [];
      const files: ReturnType<typeof fakeFiles> = {
        ...fakeFiles(),
        upload: (file) => {
          uploaded.push(file);
          return new Promise((resolve) => {
            heard = () =>
              resolve({
                id: "att_1",
                filename: file.name,
                mimeType: file.type,
                byteSize: file.size,
                durationMs: 4200,
                transcript: "Book the train.",
              });
          });
        },
      };
      const store = renderShell(opened(), {}, files);
      fireEvent.click(screen.getByRole("button", { name: "Record a voice note" }));
      fireEvent.click(await screen.findByRole("button", { name: "Stop and add" }));
      expect(screen.getByRole("button", { name: "Record a voice note" })).toHaveProperty(
        "disabled",
        true,
      );

      const chips = await screen.findByRole("list", { name: "Attachments" });
      expect(within(chips).getByText(/^voice-note-\d{4}-\d{4}\.webm$/)).toBeDefined();
      expect(within(chips).getByText("uploading and transcribing…")).toBeDefined();
      expect(screen.queryByTestId("voice-recorder")).toBeNull();
      expect(microphone.latest?.track.stopped).toBe(true);
      expect(uploaded[0]?.type).toBe("audio/webm");
      expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);

      await act(async () => heard?.());
      await within(chips).findByText("0:04");
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(store.sent[0]?.attachments?.[0]).toMatchObject({
        mimeType: "audio/webm",
        durationMs: 4200,
        transcript: "Book the train.",
      });
    } finally {
      microphone.remove();
    }
  });

  it("says in the room, and in the audit, when the harness read a file", async () => {
    renderShell([...opened(), ownerJoined(4), fixture("attachment.fetched", 20)]);
    expect(screen.getByTestId("fetch-line").textContent).toMatch(/read PO-4471\.pdf$/);
    await openLog();
    expect(within(screen.getByTestId("audit")).getByText(/read PO-4471\.pdf/)).toBeDefined();
  });
});

describe("leaving a space", () => {
  it("sends the leaving, and says what it did and did not do", async () => {
    const store = renderShell(asking());
    fireEvent.change(screen.getByRole("textbox", { name: /Message/ }), {
      target: { value: "/leave" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(store.left).toEqual([SPACE]);
  });

  it("opens another space rather than leaving the middle pane empty", () => {
    const store = renderShell([
      ...opened(),
      fixture("space.created", 4, { actor: person(ARJUN), space_id: "spc_other", title: "Keep" }),
    ]);
    fireEvent.change(screen.getByRole("textbox", { name: /Message/ }), {
      target: { value: "/leave" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    store.update({
      ...store.getSnapshot(),
      model: buildModel(
        [
          ...opened(),
          fixture("space.created", 4, {
            actor: person(ARJUN),
            space_id: "spc_other",
            title: "Keep",
          }),
          fixture("membership.removed", 5, { participant_id: ARJUN }),
        ],
        { selfId: ARJUN },
      ),
    });
    expect(screen.getByRole("main", { name: "Space: Keep" })).toBeTruthy();
  });

  it("does not need a run going, unlike the run commands", () => {
    const store = renderShell(opened());
    fireEvent.change(screen.getByRole("textbox", { name: /Message/ }), {
      target: { value: "/leave" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(store.left).toEqual([SPACE]);
    expect(screen.queryByTestId("notice")).toBeNull();
  });
});

describe("a prompt typed at the harness (M2.3)", () => {
  it("is my message, on my side, marked with where I said it", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4, {
        actor: harness(SCOUT),
        goal: "Chase the Northwind quotes.",
        goal_from: "harness",
      }),
    ]);
    const list = screen.getByTestId("messages");
    const line = within(list).getByText("Chase the Northwind quotes.").closest(".msg");
    // Scout sent the event; Arjun typed the words, and Arjun is reading.
    expect(line?.getAttribute("data-mine")).toBe("true");
    expect(within(list).getByTestId("via").textContent).toBe("at Scout");
  });

  it("is shown under the harness's name when Chips does not know whose it is", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4, {
        actor: harness("hrn_unowned"),
        goal: "Chase the Northwind quotes.",
        goal_from: "harness",
      }),
    ]);
    const list = screen.getByTestId("messages");
    expect(
      within(list)
        .getByText("Chase the Northwind quotes.")
        .closest(".msg")
        ?.getAttribute("data-mine"),
    ).toBeNull();
  });

  it("is not drawn twice when it came from Chips", () => {
    renderShell([
      ...opened(),
      fixture("message.post", 4, { actor: person(ARJUN), text: "Chase the Northwind quotes." }),
      fixture("run.started", 5, {
        actor: harness(SCOUT),
        goal: "Chase the Northwind quotes.",
        goal_from: "chips",
      }),
    ]);
    expect(
      within(screen.getByTestId("messages")).getAllByText("Chase the Northwind quotes."),
    ).toHaveLength(1);
    // Nor again beside the room: the run panel and the header have it from the room already
    // (Arjun, 2 October 2026 — the panel's title was the whole message, in bold).
    const room = screen.getByRole("main", { name: "Space: PO-4471" });
    expect(within(room).getAllByText(/Chase the Northwind quotes/)).toHaveLength(1);
    expect(room.querySelector(".conv-h")?.textContent).not.toContain("Northwind quotes");
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(panel.querySelector(".rp-title")).toBeNull();
    expect(panel.textContent).not.toContain("Northwind quotes");
  });

  it("is said on the run panel when nobody typed it, since nothing else says it", () => {
    renderShell([...opened(), fixture("run.started", 4, { goal: "Reconcile the ledger." })]);
    // The header says who does the work, as the phone's bar does (ADR 0151), not the goal.
    const room = screen.getByRole("main", { name: "Space: PO-4471" });
    expect(room.querySelector(".conv-h-sub")?.textContent).toBe("Scout");
    const panel = screen.getByRole("complementary", { name: "Run" });
    expect(panel.querySelector(".rp-title")?.textContent).toBe("Reconcile the ledger.");
  });
});

describe("sessions on screen (M2.3, ADR 0024)", () => {
  it("shows the visits to a space, live first, and says where the live one is", () => {
    renderShell([
      ...opened(),
      fixture("session.started", 4, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        where: "mbp · ~/Work/Chips",
      }),
      fixture("session.ended", 5, { actor: harness(SCOUT), session_ref: "scout:aaa" }),
      fixture("session.started", 6, {
        actor: harness(SCOUT),
        session_ref: "scout:bbb",
        where: "mini · ~/Work/Chips",
      }),
    ]);
    const strip = screen.getByTestId("sessions");
    expect(within(strip).getByText("mini · ~/Work/Chips")).toBeTruthy();
    expect(within(strip).getByText("mbp · ~/Work/Chips")).toBeTruthy();
    // The live one is first, whichever started first.
    expect(strip.textContent?.indexOf("mini")).toBeLessThan(strip.textContent?.indexOf("mbp") ?? 0);
  });

  it("says above the composer that a message goes to the session that is open", () => {
    renderShell([
      ...opened(),
      fixture("session.started", 4, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        where: "mbp · ~/Work/Chips",
      }),
    ]);
    const route = screen.getByTestId("route");
    expect(route.getAttribute("data-how")).toBe("live");
    expect(route.textContent).toContain("A session is open here in mbp · ~/Work/Chips");
  });

  it("offers no picker with one visit, and one with two (ADR 0040)", () => {
    renderShell([
      ...opened(),
      fixture("session.started", 4, { actor: harness(SCOUT), session_ref: "scout:aaa" }),
    ]);
    expect(screen.queryByTestId("session-picker")).toBeNull();
    cleanup();

    renderShell([
      ...opened(),
      fixture("session.started", 4, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        where: "mbp · one",
      }),
      fixture("session.started", 5, {
        actor: harness(SCOUT),
        session_ref: "scout:bbb",
        where: "mbp · two",
      }),
    ]);
    expect(screen.getByTestId("session-picker")).toBeTruthy();
  });

  it("pins the visit a person picks, and a message then names it", () => {
    const store = renderShell([
      ...opened(),
      fixture("session.started", 4, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        where: "mbp · one",
      }),
      fixture("session.started", 5, {
        actor: harness(SCOUT),
        session_ref: "scout:bbb",
        where: "mbp · two",
      }),
    ]);

    fireEvent.click(screen.getByLabelText("Which session a message goes to"));
    // The older visit: auto would have taken the one heard from last. Asked for inside the
    // picker, because the strip above names the same visits — the two lists this deliberately
    // leaves standing (ADR 0040, decision 7).
    const picker = screen.getByTestId("session-picker");
    fireEvent.click(within(picker).getByRole("menuitem", { name: /mbp · one/ }));
    expect(store.sessionPinned).toEqual([{ spaceId: SPACE, sessionRef: "scout:aaa" }]);

    const box = screen.getByLabelText("Message Scout");
    fireEvent.change(box, { target: { value: "is it green?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(store.sent.at(-1)?.sessionRef).toBe("scout:aaa");
  });

  it("calls a visit what its harness calls it, in the strip and the picker (ADR 0040)", () => {
    renderShell([
      ...opened(),
      fixture("session.started", 4, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        where: "mbp · ~/Work/Chips",
      }),
      fixture("session.renamed", 5, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        title: "Sync spec flakes",
      }),
      fixture("session.started", 6, {
        actor: harness(SCOUT),
        session_ref: "scout:bbb",
        where: "mbp · ~/Work/Chips",
      }),
    ]);
    const strip = screen.getByTestId("sessions");
    expect(within(strip).getByText("Sync spec flakes")).toBeTruthy();
    // The one its harness has not named yet falls back to where it is running.
    expect(within(strip).getByText("mbp · ~/Work/Chips")).toBeTruthy();

    const picker = screen.getByTestId("session-picker");
    fireEvent.click(within(picker).getByLabelText("Which session a message goes to"));
    expect(within(picker).getByRole("menuitem", { name: /Sync spec flakes/ })).toBeTruthy();
  });

  it("labels a person's own message with the visit it named", () => {
    renderShell([
      ...opened(),
      fixture("session.started", 4, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
      }),
      fixture("session.renamed", 5, {
        actor: harness(SCOUT),
        session_ref: "scout:aaa",
        title: "Sync spec flakes",
      }),
      fixture("session.started", 6, {
        actor: harness(SCOUT),
        session_ref: "scout:bbb",
      }),
      // The message the person pinned: until ADR 0040 nothing said which terminal was asked.
      fixture("message.post", 7, { text: "is it green?", session_ref: "scout:aaa" }),
    ]);
    expect(screen.getByTestId("session-tag").textContent).toBe("Sync spec flakes");
  });

  it("says a closed session will be started again where it left off", () => {
    renderShell([
      ...opened(),
      fixture("session.started", 4, { actor: harness(SCOUT), session_ref: "scout:aaa" }),
      fixture("session.ended", 5, { actor: harness(SCOUT), session_ref: "scout:aaa" }),
    ]);
    const route = screen.getByTestId("route");
    expect(route.getAttribute("data-how")).toBe("resume");
    expect(route.textContent).toContain("starts the last one again");
  });

  it("warns in the direct space, which has no session and never will", () => {
    renderShell([
      // The worktree space, where Scout actually works.
      fixture("space.created", 1, { actor: person(ARJUN), space_id: "spc_work", title: "Chips" }),
      fixture("session.started", 2, { actor: harness(SCOUT), space_id: "spc_work" }),
      // The direct space `chips connect` opens between Arjun and Scout.
      fixture("space.created", 3, {
        actor: person(ARJUN),
        space_id: "spc_direct",
        kind: "direct",
        title: "You, Scout",
      }),
      fixture("membership.added", 4, {
        actor: person(ARJUN),
        space_id: "spc_direct",
        participant_id: SCOUT,
        participant_kind: "harness",
      }),
    ]);
    fireEvent.click(within(sidebar()).getByRole("button", { name: /You, Scout/ }));
    const route = screen.getByTestId("route");
    expect(route.getAttribute("data-how")).toBe("nowhere");
    expect(route.textContent).toContain("Scout has no session here");
  });

  it("says nothing about routes in a room where nobody works by sessions", () => {
    renderShell([...opened(), fixture("run.started", 4, { session_ref: undefined })]);
    expect(screen.queryByTestId("route")).toBeNull();
    expect(screen.queryByTestId("sessions")).toBeNull();
  });

  it("offers one run per visit, and shows the one picked", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4, {
        run_id: "run_a",
        session_ref: "scout:aaa",
        goal: "The first thing",
      }),
      fixture("run.started", 5, {
        run_id: "run_b",
        session_ref: "scout:bbb",
        goal: "The second thing",
      }),
    ]);
    const picker = screen.getByTestId("run-sessions");
    const buttons = within(picker).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // The most recent run is on screen until another visit is picked.
    const panel = screen.getByLabelText("Run");
    expect(within(panel).getByText("The second thing")).toBeTruthy();
    fireEvent.click(buttons[0] as HTMLElement);
    expect(within(panel).getByText("The first thing")).toBeTruthy();
  });

  it("tags a line with the visit it came from, once there is more than one", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4, { run_id: "run_a", session_ref: "scout:aaa" }),
      fixture("run.started", 5, { run_id: "run_b", session_ref: "scout:bbbbbbbbbb" }),
      fixture("run.completed", 6, { run_id: "run_b", summary: "Done with the second." }),
    ]);
    expect(screen.getByTestId("session-tag").textContent).toBe("bbbbbbb");
  });
});

describe("a harness that has never connected (the OpenClaw test, finding 18)", () => {
  /** The directory, with these harnesses as the server names one no token of has been used for. */
  const never = (...ids: string[]): Directory => ({
    ...DIRECTORY,
    [HERMES]: { id: HERMES, kind: "harness", displayName: "Hermes", lastSeenAt: null },
    ...Object.fromEntries(
      ids.map((id): [string, Participant] => [
        id,
        { ...(DIRECTORY[id] as Participant), lastSeenAt: null },
      ]),
    ),
  });

  it("says so under a message sent to it, and puts no notice by the composer (ADR 0083)", async () => {
    renderShell(
      [
        ...opened(),
        fixture("message.post", 4, {
          id: "evt_01K4ZQPX000000000000000004",
          actor: person(ARJUN),
          text: "Scout, the PO?",
          addressed_to: [SCOUT],
        }),
      ],
      { directory: never(SCOUT) },
    );
    const wait = await screen.findByTestId(`wait-${SCOUT}`);
    expect(wait.textContent).toContain("Scout can't answer yet");
    expect(wait.textContent).toContain("Never connected");
    expect(screen.queryByTestId("unheard")).toBeNull();
  });
});

describe("when an agent can't answer (ADR 0083)", () => {
  const asked = (seq: number, extra: Record<string, unknown> = {}) =>
    fixture("message.post", seq, {
      id: `evt_01K4ZQPX0000000000000000${String(seq).padStart(2, "0")}`,
      actor: person(ARJUN),
      text: "The first ten digits of pi?",
      addressed_to: [SCOUT],
      ...extra,
    });
  /** The directory, with Scout's state as the server says it. */
  const scoutIs = (state: Participant["state"]): Directory => ({
    ...DIRECTORY,
    [SCOUT]: { ...(DIRECTORY[SCOUT] as Participant), state },
  });
  const trouble = {
    connected: true,
    since: "2026-09-02T14:00:00.000Z",
    trouble: { reason: "Can't reach its gateway", since: "2026-09-02T14:10:00.000Z" },
  };

  it("says at once under your message that an agent in trouble can't answer, and why, and counts it in the header", async () => {
    renderShell([...opened(), asked(4)], { directory: scoutIs(trouble) });
    const wait = await screen.findByTestId(`wait-${SCOUT}`);
    expect(wait.textContent).toContain("Scout can't answer yet");
    expect(wait.textContent).toContain("Can't reach its gateway · since");
    expect(screen.getByTestId("cant-answer").textContent).toBe("1 can't answer");
    expect(screen.getAllByTestId("cant-answer-mark").length).toBeGreaterThan(0);
  });

  it("says an agent that seems fine hasn't picked a message up once it has waited, and nothing once it has", async () => {
    const fine = scoutIs({ connected: true, since: "2026-09-02T14:00:00.000Z" });
    const store = renderShell([...opened(), asked(4)], { directory: fine });
    const wait = await screen.findByTestId(`wait-${SCOUT}`);
    expect(wait.textContent).toMatch(/Scout hasn't picked this up · \d+ d/);
    expect(screen.queryByTestId("cant-answer")).toBeNull();

    // Anything from Scout after it, and the line goes.
    store.update(
      snapshotOf(
        [
          ...opened(),
          asked(4),
          fixture("message.post", 5, { actor: harness(SCOUT), text: "3.141592653" }),
        ],
        { directory: fine },
      ),
    );
    await waitFor(() => expect(screen.queryByTestId(`wait-${SCOUT}`)).toBeNull());
  });

  it("says why on the Agents tab, on the harness's card", async () => {
    renderShell(opened(), {
      directory: scoutIs({ connected: false, since: "2026-09-02T14:12:00.000Z" }),
    });
    openHarnesses();
    expect((await screen.findByTestId("harness-trouble")).textContent).toMatch(/^Offline · since /);
    expect(screen.queryByTestId("harness-connected")).toBeNull();
  });

  it("says on its card that it is connected, and since when, while it can answer (ADR 0254)", async () => {
    renderShell(opened(), {
      directory: scoutIs({ connected: true, since: "2026-09-02T14:12:00.000Z" }),
    });
    openHarnesses();
    expect((await screen.findByTestId("harness-connected")).textContent).toMatch(
      /^Connected · since /,
    );
  });

  it("says it on the shelf, in a word, not what its last run was doing (17 October 2026)", () => {
    // Its run started before it went: the sidebar's row said Thinking beside a harness that was
    // offline. The shelf took over from that row on 3 November 2026 (ADR 0261's addendum).
    const running = [...opened(), fixture("run.started", 4)];
    const shown = renderShell(running, {
      directory: scoutIs({ connected: false, since: "2026-09-02T14:12:00.000Z" }),
    });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    expect(shelfLine(SCOUT).textContent).toBe("Offline");
    expect(shelfLine(SCOUT).getAttribute("data-tone")).toBe("amber");

    shown.update(snapshotOf(running, { directory: scoutIs(trouble) }));
    expect(shelfLine(SCOUT).textContent).toBe("Can't answer");

    shown.update(
      snapshotOf(running, {
        directory: scoutIs({ connected: true, since: "2026-09-02T14:12:00.000Z" }),
      }),
    );
    expect(shelfLine(SCOUT).textContent).toBe("Thinking");
    expect(shelfLine(SCOUT).getAttribute("data-tone")).not.toBe("amber");
  });
});

/**
 * The Agents tab, every harness's card under its shelf's View all (ADR 0185), and one harness's
 * page, opened from its card (ADR 0254).
 */
function openHarnesses(name = "Scout") {
  fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
  fireEvent.click(screen.getByRole("button", { name: "View all harnesses" }));
  fireEvent.click(
    within(screen.getByTestId("harnesses-list")).getByRole("button", { name: shows(name) }),
  );
}

/**
 * A harness's tile or card, by the name it shows first: each is named by its words, the name and
 * then its line (ADR 0275), so voice control finds it by what it says.
 */
function shows(name: string): RegExp {
  return new RegExp(`^${name}\\b`);
}

/** A row of a harness's Connection group (ADR 0273), and the page it opens over the harness's. */
function openDeskPart(row: string, title: string, name = "Scout"): HTMLElement {
  fireEvent.click(within(screen.getByRole("region", { name })).getByTestId(row));
  return screen.getByRole("main", { name: `${name}: ${title}` });
}

describe("the harnesses on the Agents tab (M1.6, ADR 0087)", () => {
  it("rolls a harness up across its spaces: live sessions, spaces, and what waits (M2.3)", () => {
    renderShell([
      ...asking(),
      fixture("session.started", 6, { actor: harness(SCOUT), session_ref: "scout:aaa" }),
      fixture("session.started", 7, {
        actor: harness(SCOUT),
        space_id: "spc_other",
        session_ref: "scout:bbb",
      }),
      fixture("session.ended", 8, {
        actor: harness(SCOUT),
        space_id: "spc_other",
        session_ref: "scout:bbb",
      }),
    ]);
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });
    // Two visits open — "aaa" and the one the scenario's own run belongs to — in two spaces,
    // with the approval it is waiting on.
    expect(within(card).getByTestId("harness-rollup").textContent).toBe(
      "2 live sessions · 2 spaces · 1 waiting on you",
    );
  });

  it("lists each harness with its level, and a checklist on its page lit by what it has sent", () => {
    renderShell([...asking(), fixture("policy.updated", 40)]);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "View all harnesses" }));
    const list = screen.getByTestId("harnesses-list");
    expect(within(list).getByRole("button", { name: shows("Scout") }).textContent).toMatch(
      /L[0-3] · /,
    );
    fireEvent.click(within(list).getByRole("button", { name: shows("Scout") }));
    // Its Connection group says how much has lit, and the row opens the checklist (ADR 0273).
    const card = screen.getByRole("region", { name: "Scout" });
    expect(within(card).getByTestId("harness-sends-row").textContent).toMatch(/2 of 9/);
    expect(within(card).queryByTestId("check-message.post")).toBeNull();
    const sends = openDeskPart("harness-sends-row", "What it sends");
    const lit = within(sends)
      .getAllByRole("listitem")
      .filter((row) => row.getAttribute("data-lit") === "true")
      .map((row) => row.querySelector("b")?.textContent);
    expect(lit).toEqual(["Runs", "Approvals"]);
    expect(within(sends).getByTestId("check-message.post").getAttribute("data-lit")).toBe("false");
    fireEvent.click(within(sends).getByRole("button", { name: "‹ Scout" }));
    expect(screen.getByRole("region", { name: "Scout" })).toBeTruthy();
  });

  it("folds Add harness away on Escape, the × or a click outside, at either step (ADR 0084)", async () => {
    renderShell(opened());
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    for (const leave of ["escape", "close", "outside"] as const) {
      fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
      const dialog = screen.getByTestId("add-harness-dialog");
      if (leave === "escape") fireEvent(dialog, new Event("cancel", { cancelable: true }));
      if (leave === "close") fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      if (leave === "outside") {
        fireEvent.pointerDown(dialog);
        fireEvent.click(dialog);
      }
      expect(dialog.dataset["leaving"]).toBe("true");
      fireEvent.animationEnd(dialog);
      expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
    }

    // With the token up, the same.
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Relay bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and get a token" }));
    await screen.findByTestId("harness-token");
    const dialog = screen.getByTestId("add-harness-dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.animationEnd(dialog);
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
  });

  it("points the curl lines at the server the desktop app paired with, not at its own page", async () => {
    // The desktop app's page is `tauri://localhost`, which no harness can reach.
    const store = fakeStore(snapshotOf(opened()));
    render(
      <Shell
        store={store}
        device={{ ...DEVICE, serverUrl: "http://mac-mini.local:4431" }}
        files={fakeFiles()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Relay bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and get a token" }));
    await screen.findByTestId("harness-token");
    const curl = screen.getByTestId("curl-lines").textContent ?? "";
    expect(curl).toContain("export CHIPS_URL=http://mac-mini.local:4431 ");
    expect(curl).not.toContain(location.origin);
  });

  it("adds a custom harness, shows the token once with the curl lines, and lights the row live", async () => {
    const store = renderShell(opened());
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Relay bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and get a token" }));

    const token = await screen.findByTestId("harness-token");
    expect(token.textContent).toBe("chips_at_test-token-shown-once");
    expect(store.added).toEqual(["Relay bot"]);
    const curl = screen.getByTestId("curl-lines").textContent ?? "";
    // A browser's page is the server's, or a dev server's that proxies `/v1`.
    expect(curl).toContain(`export CHIPS_URL=${location.origin} `);
    expect(curl).toContain("spc_01K4ZQPX000000000000000098");
    expect(curl).toContain("/v1/harnesses/hrn_01K4ZQPX000000000000000099/events");
    expect(curl.split("\n")).toHaveLength(3);
    const card = screen.getByTestId("new-harness");
    expect(within(card).getByTestId("check-message.post").getAttribute("data-lit")).toBe("false");

    // The harness says hello with its token: the Messages row lights.
    store.update(
      snapshotOf([
        ...opened(),
        fixture("message.post", 30, {
          actor: { kind: "harness", id: "hrn_01K4ZQPX000000000000000099" },
          space_id: "spc_01K4ZQPX000000000000000098",
          text: "Hello from my harness",
        }),
      ]),
    );
    expect(within(card).getByTestId("check-message.post").getAttribute("data-lit")).toBe("true");
  });

  it("shows what a harness holds without ever showing a token, and revokes one (ADR 0023)", async () => {
    const store = renderShell([...asking(), fixture("policy.updated", 40)]);
    store.heldTokens.set(SCOUT, [
      {
        id: "tok_1",
        name: "custom",
        createdAt: "2026-09-04T09:00:00.000Z",
        lastUsedAt: "2026-09-04T09:30:00.000Z",
        revokedAt: undefined,
      },
    ]);
    openHarnesses();
    const page = openDeskPart("harness-tokens-row", "Tokens");

    const row = await within(page).findByTestId("token-row");
    expect(row.textContent).toContain("custom");
    expect(row.textContent).not.toContain("chips_at_");

    fireEvent.click(within(row).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(store.revoked).toEqual([[SCOUT, "tok_1"]]));
    await waitFor(() =>
      expect(within(page).getByTestId("token-row").getAttribute("data-revoked")).toBe("true"),
    );
    expect(within(page).getByTestId("token-row").textContent).toContain("revoked");
  });

  it("issues another token for a rotation, and shows it once", async () => {
    const store = renderShell([...asking(), fixture("policy.updated", 40)]);
    openHarnesses();
    const page = openDeskPart("harness-tokens-row", "Tokens");
    fireEvent.click(await within(page).findByTestId("issue-token"));

    const shown = await within(page).findByTestId("issued-token");
    expect(shown.textContent).toContain("chips_at_rotated-token");
    expect(store.heldTokens.get(SCOUT)?.map((each) => each.name)).toEqual(["rotated"]);
  });

  /** The directory once the server has removed Scout: named still, for what it said. */
  const WITHOUT_SCOUT: Directory = {
    ...DIRECTORY,
    [SCOUT]: {
      id: SCOUT,
      kind: "harness",
      displayName: "Scout",
      ownerId: ARJUN,
      removedAt: "2026-09-27T10:00:00.000Z",
    },
  };

  it("removes a harness from its page, asked first, and the page goes with it (ADR 0078)", async () => {
    const store = renderShell(asking());
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });

    // Asked first, in the phone's words; Cancel is nothing.
    fireEvent.click(within(card).getByTestId("remove-harness"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Remove Scout?");
    expect(dialog.textContent).toContain("What Scout said stays");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(store.removals).toEqual([]);

    fireEvent.click(within(card).getByTestId("remove-harness"));
    fireEvent.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-go"));
    await waitFor(() => expect(store.removals).toEqual([SCOUT]));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());

    // The directory, read again, marks it: its page steps back to every harness's card, where
    // Ledger's stays and Scout's is gone.
    act(() => store.update(snapshotOf(asking(), { directory: WITHOUT_SCOUT })));
    expect(screen.queryByRole("region", { name: "Scout" })).toBeNull();
    const list = screen.getByTestId("harnesses-list");
    expect(within(list).getByRole("button", { name: shows("Ledger") })).toBeTruthy();
    expect(within(list).queryByRole("button", { name: shows("Scout") })).toBeNull();
  });

  /** Scout taking restarts (ADR 0094), in the state given. */
  const restartable = (state: Record<string, unknown>): Directory => ({
    ...DIRECTORY,
    [SCOUT]: {
      id: SCOUT,
      kind: "harness",
      displayName: "Scout",
      ownerId: ARJUN,
      lastSeenAt: "2026-10-02T15:00:00.000Z",
      capabilities: ["autonomy", "restarts"],
      state: { connected: true, since: "2026-10-02T15:06:00.000Z", ...state },
    } as Directory[string],
  });

  it("restarts a harness from its page, asked first, and says when it was back (ADR 0094)", async () => {
    const store = renderShell(asking(), {
      directory: restartable({
        trouble: { reason: "Can't reach its gateway", since: "2026-10-02T15:06:00.000Z" },
      }),
    });
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });
    const go = within(card).getByTestId("restart-harness");
    expect(go.textContent).toBe("Restart harness…");
    // Gold while it can't answer.
    expect(go.getAttribute("data-loud")).toBe("true");

    fireEvent.click(go);
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Restart Scout?");
    expect(dialog.textContent).toContain("stops whatever it's doing");
    fireEvent.click(within(dialog).getByTestId("confirm-go"));
    await waitFor(() => expect(store.restarts).toEqual([SCOUT]));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());

    act(() =>
      store.update(
        snapshotOf(asking(), {
          directory: restartable({
            restarting: { since: "2026-10-02T15:31:00.000Z", by: ARJUN },
          }),
        }),
      ),
    );
    const card2 = screen.getByRole("region", { name: "Scout" });
    expect(within(card2).getByTestId("harness-trouble").textContent).toMatch(
      /^Restarting · asked by you/,
    );
    // A quiet row with nothing to press while the restart stands, as the phone's.
    const going = within(card2).getByTestId("restart-harness");
    expect(going.textContent).toBe("Restarting…");
    expect(going.closest("button")).toBeNull();

    act(() => store.update(snapshotOf(asking(), { directory: restartable({}) })));
    const card3 = screen.getByRole("region", { name: "Scout" });
    expect(within(card3).getByTestId("harness-back").textContent).toMatch(/^Back · /);
    expect(within(card3).getByTestId("restart-harness").getAttribute("data-loud")).toBeNull();
  });

  it("lists what a harness may do, a switch each, and sends the whole list on a flip (ADR 0046)", async () => {
    const store = renderShell(asking(), { directory: restartable({}) });
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });
    expect(within(card).getByTestId("harness-may-row").textContent).toMatch(/2 of 12/);
    const list = within(openDeskPart("harness-may-row", "What it may do")).getByTestId("may-do");
    // Every capability Chips draws something for, on for what it declared.
    expect(within(list).getAllByRole("switch")).toHaveLength(12);
    expect(within(list).getByRole("switch", { name: "Be restarted from Chips" })).toHaveProperty(
      "checked",
      true,
    );
    fireEvent.click(within(list).getByRole("switch", { name: "Change models from Chips" }));
    await waitFor(() =>
      expect(store.declared).toEqual([[SCOUT, ["autonomy", "restarts", "models"]]]),
    );
  });

  it("says there's nobody to ask while nothing of it is connected, and offers nothing for one that doesn't take restarts", () => {
    renderShell(asking(), {
      directory: restartable({ connected: false, since: "2026-10-02T15:06:00.000Z" }),
    });
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });
    // The head says it can't be reached; the row says why there's nobody to ask (ADR 0254).
    expect(within(card).getByTestId("harness-trouble").textContent).toMatch(/^Offline/);
    expect(within(card).getByTestId("restart-unreachable").textContent).toContain(
      "there's nobody to ask to restart",
    );
    expect(within(card).queryByTestId("restart-harness")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "‹ Harnesses" }));
    fireEvent.click(
      within(screen.getByTestId("harnesses-list")).getByRole("button", { name: shows("Ledger") }),
    );
    const ledger = screen.getByRole("region", { name: "Ledger" });
    expect(within(ledger).queryByTestId("restart-harness")).toBeNull();
    expect(within(ledger).queryByTestId("restart-unreachable")).toBeNull();
  });

  it("says why when the server will not remove it, and keeps the card", async () => {
    const store = renderShell(asking());
    store.removeRefusal = "A harness is removed by its owner, or by an owner or admin.";
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });
    fireEvent.click(within(card).getByTestId("remove-harness"));
    fireEvent.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-go"));
    expect((await screen.findByTestId("confirm-failed")).textContent).toBe(
      "A harness is removed by its owner, or by an owner or admin.",
    );
    expect(store.removals).toEqual([]);
    expect(screen.getByRole("region", { name: "Scout" })).toBeTruthy();
  });

  it("offers Remove harness… only to who may: not a member who does not own it", () => {
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    render(<Shell store={fakeStore(snapshotOf(asking()))} device={asDana} files={fakeFiles()} />);
    openHarnesses();
    const card = screen.getByRole("region", { name: "Scout" });
    expect(within(card).queryByTestId("remove-harness")).toBeNull();
  });

  it("pauses its latest run from its page, and greys Pause out while nothing of it is going (ADR 0254)", () => {
    const store = renderShell(asking());
    openHarnesses();
    const pause = within(screen.getByRole("region", { name: "Scout" })).getByTestId(
      "harness-pause",
    ) as HTMLButtonElement;
    expect(pause.disabled).toBe(false);
    fireEvent.click(pause);
    expect(store.runCommands.at(-1)?.verb).toBe("pause");
    // Ledger has run nothing: the button keeps its place, and does nothing.
    fireEvent.click(screen.getByRole("button", { name: "‹ Harnesses" }));
    fireEvent.click(
      within(screen.getByTestId("harnesses-list")).getByRole("button", { name: shows("Ledger") }),
    );
    const idle = within(screen.getByRole("region", { name: "Ledger" })).getByTestId(
      "harness-pause",
    ) as HTMLButtonElement;
    expect(idle.disabled).toBe(true);
  });

  it("lists its first five agents, and all of them on a page of their own with a field (ADR 0254)", () => {
    const names = ["Ada", "Bo", "Cy", "Di", "Ed", "Flo", "Gus"];
    const many: Directory = {
      ...DIRECTORY,
      ...Object.fromEntries(
        names.map((name) => [
          `agt_${name}`,
          { id: `agt_${name}`, kind: "agent", displayName: name, harnessId: SCOUT },
        ]),
      ),
    };
    renderShell(asking(), { directory: many });
    openHarnesses();
    const its = within(screen.getByRole("region", { name: "Scout" })).getByTestId("its-agents");
    expect(within(its).getByRole("heading").textContent).toBe("Agents · 7");
    expect(its.querySelectorAll(".agent-row")).toHaveLength(5);
    const all = within(its).getByTestId("its-agents-all");
    expect(all.textContent).toBe("See all 7 agents›");
    fireEvent.click(all);
    const page = screen.getByTestId("all-agents");
    expect(page.querySelectorAll(".agent-row")).toHaveLength(7);
    const field = within(page).getByTestId("all-agents-search");
    fireEvent.change(field, { target: { value: "gu" } });
    expect([...page.querySelectorAll(".agent-name")].map((each) => each.textContent)).toEqual([
      "Gus",
    ]);
    fireEvent.change(field, { target: { value: "zz" } });
    expect(within(page).getByTestId("all-agents-none").textContent).toBe(
      "No agent's name or space has “zz” in it.",
    );
    fireEvent.click(screen.getByRole("button", { name: "‹ Scout" }));
    expect(screen.getByRole("region", { name: "Scout" })).toBeTruthy();
  });

  it("opens an agent from its page, and goes back to the page (ADR 0254)", async () => {
    const one: Directory = {
      ...DIRECTORY,
      agt_Ada: { id: "agt_Ada", kind: "agent", displayName: "Ada", harnessId: SCOUT },
    };
    renderShell(asking(), { directory: one });
    openHarnesses();
    fireEvent.click(screen.getByTestId("agent-agt_Ada"));
    expect(await screen.findByTestId("agent-card")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "‹ Scout" }));
    expect(screen.getByRole("region", { name: "Scout" })).toBeTruthy();
  });

  it("opens its recent runs from History, a run opening its space (ADR 0254)", async () => {
    renderShell(asking());
    openHarnesses();
    const row = within(screen.getByRole("region", { name: "Scout" })).getByTestId(
      "harness-runs-row",
    );
    expect(row.textContent).toMatch(/^Recent runs(None|\d+) this week/);
    fireEvent.click(row);
    const runs = screen.getByTestId("recent-runs");
    const run = within(runs).getAllByRole("button")[0] as HTMLElement;
    expect(run.textContent).toContain("PO-4471");
    expect(run.textContent).toContain("Waiting");
    fireEvent.click(run);
    expect(await screen.findByTestId("messages")).toBeTruthy();
  });

  it("says who decides its asks at When it asks you's right, and opens it whole (ADR 0254)", () => {
    renderShell(asking());
    openHarnesses();
    const row = within(screen.getByRole("region", { name: "Scout" })).getByTestId(
      "harness-asks-row",
    );
    expect(row.textContent).toBe("When it asks youYou decide›");
    fireEvent.click(row);
    expect(screen.getByRole("main", { name: "Scout: When it asks you" })).toBeTruthy();
    expect(screen.getByTestId("asking-headline").textContent).toContain(
      "Scout decides when to ask",
    );
  });
});

describe("lanes (M3.2)", () => {
  const ORIGIN_QUOTE = "Get PO #4471 confirmed with Northwind.";
  const GOAL = "Are the Northwind quotes in line with last quarter?";

  /** Arjun's direct space with Ledger — where a lane routed to Ledger comes home. */
  function ledgerHome(): ClientEvent[] {
    return [
      fixture("space.created", 1, {
        actor: person(ARJUN),
        space_id: HOME,
        title: "Ledger",
        kind: "direct",
      }),
      fixture("membership.added", 2, {
        actor: person(ARJUN),
        space_id: HOME,
        participant_id: LEDGER,
        participant_kind: "harness",
      }),
    ];
  }

  it("draws the route card in the lead's chat, and unfolds the reply once the lane completes", () => {
    renderShell([...opened(), fixture("task", 4), fixture("lane.updated", 5)]);
    const card = screen.getByTestId("route-card");
    expect(card.textContent).toContain("Ledger");
    expect(card.textContent).toContain(GOAL);
    // The lead reads the specialist's result through lane.updated, not by being in its space.
    expect(within(card).getByTestId("lane-reply").textContent).toContain("4 percent under");
    expect(card.textContent).toContain("$0.03");
  });

  it("unfolds the files the reply came back with, so an answer of photos is on the card", () => {
    renderShell([
      ...opened(),
      fixture("task", 4),
      fixture("lane.updated", 5, {
        attachments: [
          {
            attachment_id: "att_01K4ZQPX00000000000000000E",
            filename: "menu.jpg",
            mime_type: "image/jpeg",
            byte_size: 4096,
          },
        ],
      }),
    ]);
    const files = within(screen.getByTestId("route-card")).getByTestId("lane-files");
    // One photograph, in the grid a message's own photographs go in.
    expect(within(files).getByTestId("photo-grid").dataset["count"]).toBe("1");
  });

  it("draws the task card in the specialist's home, with the trail and the person's words", () => {
    renderShell([...ledgerHome(), fixture("run.requested", 3)]);
    const card = screen.getByTestId("task-card");
    // The specialist ends the trail on its own card, though the lane's trail does not name it.
    expect(card.textContent).toContain("Arjun → Scout → Ledger");
    expect(card.textContent).toContain(GOAL);
    expect(card.textContent).toContain(ORIGIN_QUOTE);
    expect(card.textContent).toContain("Use the finance warehouse, not the CRM");
  });

  it("says who a specialist is working for on its card", () => {
    renderShell([...ledgerHome(), fixture("run.requested", 3)]);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "View all harnesses" }));
    expect(screen.getByTestId(`harness-summary-${LEDGER}`).textContent).toContain(
      "Working for Scout",
    );
  });

  it("offers to cancel a lane that is still going, and stops the specialist's run at home", () => {
    // The specialist's side first, so the lane's run and home are known; the lead's last, so
    // PO-4471 is the room the shell opens on.
    const store = renderShell([...opened(), fixture("run.requested", 4), fixture("task", 5)]);
    const card = screen.getByTestId("route-card");
    fireEvent.click(within(card).getByRole("button", { name: "Cancel the lane to Ledger" }));
    expect(store.runCommands).toEqual([
      {
        verb: "stop",
        input: { spaceId: HOME, runId: LEDGER_RUN, reason: "Cancelled from the route card." },
      },
    ]);
  });

  it("offers no cancel once the lane has ended", () => {
    renderShell([...opened(), fixture("task", 4), fixture("lane.updated", 5)]);
    const card = screen.getByTestId("route-card");
    expect(within(card).queryByRole("button", { name: /Cancel the lane/ })).toBeNull();
  });

  it("draws one card for a lane at home in the room it is linked into, called by its label", () => {
    // A subagent works in the worktree its lead is in (M3.5): the task is Scout's, routed to
    // itself, at home in PO-4471 and linked into it. One room, one card, and it says Explore.
    renderShell([
      ...opened(),
      fixture("task", 4, { to: SCOUT, home: SPACE, label: "Explore" }),
      fixture("run.requested", 5, {
        space_id: SPACE,
        specialist_id: SCOUT,
        label: "Explore",
        link_to: [SPACE],
      }),
    ]);
    expect(screen.getByTestId("route-card").textContent).toContain("Routed to Explore");
    expect(screen.queryByTestId("task-card")).toBeNull();
  });

  it("names the lane's label on the task card too, when the lane has a room of its own", () => {
    // Jacobian handing a Space down: Shopping's room is the home, J's room the lead's.
    renderShell([
      ...ledgerHome(),
      fixture("run.requested", 3, { specialist_id: SCOUT, label: "Shopping" }),
    ]);
    expect(screen.getByTestId("task-card").textContent).toContain("Arjun → Scout → Shopping");
  });

  it("names the lead by the room of its own it handed down from, on the card", () => {
    // Jacobian's Chess Game handing down to its Engineer (13 September 2026): a room the harness
    // opened for a part of itself, and the lane at home in it. The harness is both ends, so its
    // name told the reader nothing, and the card said the work came from the harness at large.
    renderShell([
      fixture("space.created", 1, { actor: harness(SCOUT), title: "Chess Game", kind: "direct" }),
      fixture("membership.added", 2, {
        actor: harness(SCOUT),
        participant_id: ARJUN,
        participant_kind: "person",
      }),
      fixture("task", 3, { to: SCOUT, home: SPACE, label: "Engineer" }),
      fixture("run.requested", 4, {
        space_id: SPACE,
        specialist_id: SCOUT,
        label: "Engineer",
        link_to: [SPACE],
      }),
      fixture("approval.request", 5, { run_id: LEDGER_RUN }),
    ]);
    const card = screen.getByTestId("route-card");
    expect(within(card).getByRole("img", { name: "Chess Game" })).toBeTruthy();
    expect(within(card).queryByRole("img", { name: "Scout" })).toBeNull();
    expect(card.textContent).toContain("Routed to Engineer");
  });

  it("draws both ends of a lane in the faces chosen for their rooms (22 September 2026)", () => {
    // J → the game of life read as initials on the cards while the sidebar wore the wafer and
    // the rocket. Chess Game is the lead's room here and the lane's home: both ends are rooms.
    renderShell(
      [
        fixture("space.created", 1, { actor: harness(SCOUT), title: "Chess Game", kind: "direct" }),
        fixture("membership.added", 2, {
          actor: harness(SCOUT),
          participant_id: ARJUN,
          participant_kind: "person",
        }),
        fixture("task", 3, { to: SCOUT, home: SPACE, label: "Engineer" }),
        fixture("run.requested", 4, {
          space_id: SPACE,
          specialist_id: SCOUT,
          label: "Engineer",
          link_to: [SPACE],
        }),
      ],
      { spaceIcons: new Map([[SPACE, { icon: "rocket", ground: 0 }]]) },
    );
    const card = screen.getByTestId("route-card");
    const lead = within(card).getByRole("img", { name: "Chess Game" });
    expect(lead.getAttribute("style")).toContain("--avatar-color: var(--avatar-1)");
    expect(lead.querySelector(".ui-face path")).not.toBeNull();
    const home = within(card).getByRole("img", { name: /^Engineer/ });
    expect(home.querySelector(".ui-face path")).not.toBeNull();
  });

  it("keeps a harness's own face in a room it is only working in", () => {
    // Scout routing from PO-4471 is not PO-4471, whatever face PO-4471 wears in the sidebar.
    renderShell([...opened(), fixture("task", 4), fixture("lane.updated", 5)], {
      spaceIcons: new Map([[SPACE, { icon: "tent", ground: 4 }]]),
    });
    const card = screen.getByTestId("route-card");
    const lead = within(card).getByRole("img", { name: "Scout" });
    expect(lead.querySelector(".ui-face path")).toBeNull();
  });

  it("rolls the lane's cost up into the lead's run panel", () => {
    renderShell([
      ...opened(),
      fixture("run.started", 4),
      fixture("task", 5),
      fixture("run.requested", 6),
      fixture("lane.updated", 7),
    ]);
    // The lead's own run had no cost of its own; the lane it opened cost three cents.
    expect(screen.getByTestId("lane-cost").textContent).toContain("$0.03 in lanes");
  });
});

describe("a group space (M3.3)", () => {
  /** The directory with somebody not yet in the room: Hermes, a harness. */
  const WIDER: Directory = {
    ...DIRECTORY,
    [HERMES]: { id: HERMES, kind: "harness", displayName: "Hermes", ownerId: ARJUN },
  };

  /** PO-4471 with Ledger in it too: two harnesses, two people. */
  function group(): ClientEvent[] {
    return [
      ...opened(),
      fixture("membership.added", 4, {
        actor: person(ARJUN),
        participant_id: LEDGER,
        participant_kind: "harness",
      }),
    ];
  }

  it("lists who is here from the header, and adds, removes, renames and archives from the sheet (ADR 0151)", () => {
    const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    const rows = within(sheet).getAllByTestId("member");
    expect(rows.map((row) => row.textContent)).toEqual(
      ["ScoutMember", "LedgerMember", "YouOwner", "DanaMember"].map((text) =>
        expect.stringContaining(text),
      ),
    );
    // Arjun opened the room, so he may remove the others; not himself, which is /leave.
    expect(within(sheet).queryByRole("button", { name: "Remove You" })).toBeNull();

    // Add, a page of its own: Hermes has no agents yet, so it joins as itself and ticks.
    fireEvent.click(within(sheet).getByTestId("room-sheet-add"));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Hermes" }));
    expect(store.membersAdded).toEqual([
      { spaceId: SPACE, participantId: HERMES, kind: "harness" },
    ]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Back" }));

    fireEvent.click(within(sheet).getByRole("button", { name: "Remove Ledger" }));
    expect(store.membersRemoved).toEqual([{ spaceId: SPACE, participantId: LEDGER }]);

    // The name, renamed where it stands (ADR 0112).
    fireEvent.click(within(sheet).getByTestId("room-sheet-title"));
    const field = within(sheet).getByLabelText("The space's name");
    fireEvent.change(field, { target: { value: "Northwind quotes" } });
    fireEvent.keyDown(field, { key: "Enter" });
    // Archive asks first, in the phone's words, and archives when told to.
    fireEvent.click(within(sheet).getByTestId("archive-space"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Archive PO-4471?");
    expect(store.spaceUpdates).toEqual([{ spaceId: SPACE, title: "Northwind quotes" }]);
    fireEvent.click(within(dialog).getByTestId("confirm-go"));
    expect(store.spaceUpdates).toEqual([
      { spaceId: SPACE, title: "Northwind quotes" },
      { spaceId: SPACE, state: "closed" },
    ]);
  });

  it("lets an owner invite someone new straight into the room, and no admin (ADR 0168)", async () => {
    const owned = [
      ...group(),
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
    ];
    const store = fakeStore(snapshotOf(owned, { directory: WIDER }));
    const { unmount } = render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-add"));
    // Arjun is the workspace's only person: People says so, and the link is under it.
    expect(within(sheet).getByText("Nobody else is in your workspace yet")).toBeTruthy();
    const row = within(sheet).getByTestId("room-sheet-invite");
    expect(row.textContent).toContain("Invite someone new");
    expect(row.textContent).toContain("A link that brings them straight into PO-4471");
    fireEvent.click(row);
    expect(within(sheet).getByRole("heading", { name: "Invite to PO-4471" })).toBeTruthy();
    // A space's link starts on Guest: what they'll see is who is in the room, as faces and by
    // name, Scout among them though it joined as its harness (ADR 0209).
    const sees = within(sheet).getByTestId("invite-sees");
    expect(within(sees).getByTestId("invite-role-means").textContent).toBe(
      "A guest in PO-4471 sees only who's there: Arjun, Ledger and Scout. Nothing else in This server.",
    );
    const agents = within(sees).getByTestId("sees-agents");
    expect(agents.querySelectorAll(".faces-shown-one.is-on")).toHaveLength(2);
    // Can be used says what it means; every link lasts 30 minutes, with nothing to choose (ADR 0232).
    expect(within(sheet).getByTestId("invite-uses-means").textContent).toBe(
      "The first person to join by it uses it up. Unused, it stops working after 30 minutes.",
    );
    expect(within(sheet).queryByRole("radiogroup", { name: "Invite lasts" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("radio", { name: "By several" }));
    expect(within(sheet).getByTestId("invite-uses-means").textContent).toBe(
      "Everyone you send it to can join by it, until it stops working after 30 minutes or you withdraw it.",
    );
    fireEvent.click(within(sheet).getByRole("radio", { name: "Once" }));
    // A member's words change in place.
    fireEvent.click(within(sheet).getByRole("radio", { name: "Member" }));
    expect(within(sees).getByTestId("invite-role-means").textContent).toBe(
      "A member starts in PO-4471. They see everybody here, and only the agents in their spaces: Ledger and Scout.",
    );
    fireEvent.click(within(sheet).getByTestId("make-invite"));
    const issued = await within(sheet).findByTestId("issued-invite");
    expect(issued.textContent).toContain("Member in PO-4471");
    expect(store.invitesMade).toEqual([{ role: "member", singleUse: true, spaceId: SPACE }]);
    // The link shows its QR and the card it opens to, as You's does; Withdraw takes it back.
    expect(await within(issued).findByTestId("invite-qr")).toBeTruthy();
    expect(within(issued).getByTestId("join-preview").textContent).toContain("Join PO-4471");
    fireEvent.click(within(issued).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(within(sheet).queryByTestId("issued-invite")).toBeNull());
    expect(store.invitesRevoked).toEqual(["inv_01K4ZQPX0000000000000000D2"]);
    unmount();

    // Only an owner invites: Dana, an admin in the room, adds people but makes no link.
    const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const admin = snapshotOf(
      [
        ...group(),
        fixture("person.joined", 5, { participant_id: DANA, display_name: "Dana", role: "admin" }),
      ],
      { directory: WIDER },
    );
    render(<Shell store={fakeStore(admin)} device={dana} files={fakeFiles()} />);
    const hers = openSheet();
    fireEvent.click(within(hers).getByTestId("room-sheet-add"));
    expect(within(hers).queryByTestId("room-sheet-invite")).toBeNull();
  });

  it("offers Remove to a workspace admin in the room, and to no other member (ADR 0111)", () => {
    const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const as = (role: string) =>
      snapshotOf(
        [
          ...group(),
          fixture("person.joined", 5, { participant_id: DANA, display_name: "Dana", role }),
        ],
        { directory: WIDER },
      );
    const admin = fakeStore(as("admin"));
    const { unmount } = render(<Shell store={admin} device={dana} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove Scout" }));
    expect(admin.membersRemoved).toEqual([{ spaceId: SPACE, participantId: SCOUT }]);
    expect(within(sheet).queryByRole("button", { name: "Remove You" })).toBeNull();
    unmount();

    render(<Shell store={fakeStore(as("member"))} device={dana} files={fakeFiles()} />);
    const plain = openSheet();
    expect(within(plain).queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("says a reply's change under it, opens it with its diff, and has a Project tile (ADR 0222)", async () => {
    const commit = "a".repeat(40);
    const events = [
      ...group(),
      fixture("run.started", 5, { actor: harness(SCOUT), run_id: RUN }),
      fixture("project.changed", 6, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: commit,
        message: "Two, not one",
        files: [{ path: "src/game.js", added: 1, removed: 1 }],
        file_count: 2,
      }),
      fixture("message.post", 7, {
        id: "evt_reply",
        actor: harness(SCOUT),
        run_id: RUN,
        text: "Made it two.",
        change: commit,
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory: WIDER }));
    (store as { projectChange: FakeStore["projectChange"] }).projectChange = async () => ({
      commit,
      parent: null,
      by: { name: "Scout", id: SCOUT },
      at: "2026-09-07T10:00:00.000Z",
      message: "Two, not one",
      files: [
        {
          path: "src/game.js",
          added: 1,
          removed: 1,
          patch: "@@ -1 +1 @@\n-a = 1\n+a = 2",
          cut: false,
        },
      ],
    });
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("receipt-change"));
    const sheet = screen.getByTestId("room-sheet");
    expect(await within(sheet).findByTestId("project-diff-src/game.js")).toBeTruthy();
    expect(within(sheet).getByText("+a = 2")).toBeTruthy();
    expect(within(sheet).getByTestId("project-undo").textContent).toBe("Undo");
    fireEvent.click(within(sheet).getByTestId("room-sheet-change-back"));
    expect(within(sheet).getByTestId("project-tab-files")).toBeTruthy();
    fireEvent.click(within(sheet).getByTestId("room-sheet-project-back"));
    expect(within(sheet).getByTestId("room-sheet-project").textContent).toContain("2 files");
  });

  it("opens an HTML file of the project as a page from the door, built on the server (ADR 0223)", async () => {
    const events = [
      ...group(),
      fixture("project.changed", 5, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: "a".repeat(40),
        message: "The game",
        files: [{ path: "index.html", added: 3, removed: 0 }],
        file_count: 1,
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory: WIDER }));
    const writable = store as { -readonly [key in keyof FakeStore]: FakeStore[key] };
    writable.projectFiles = async () => ({
      at: "a".repeat(40),
      files: [{ path: "index.html", bytes: 40, type: "text/html" }],
    });
    writable.projectFile = async () => ({
      bytes: new TextEncoder().encode("<h1>Game</h1>"),
      type: "text/html",
    });
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-project"));
    fireEvent.click(await within(sheet).findByTestId("project-file-index.html"));
    // Open page comes before the page's words, which a long page would push it under.
    const words = await within(sheet).findByTestId("project-file-words");
    const open = within(sheet).getByTestId("project-open-page");
    expect(open.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(open);
    const frame = await screen.findByTestId("project-page-view");
    expect(frame.getAttribute("src")).toBe("/v1/pages/ticket-for-index.html");
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    // Unseen under the planets until its frame has loaded, so its white canvas never shows; then
    // it arrives and they fade.
    const arrival = frame.closest(".universe-arrival");
    expect(arrival?.hasAttribute("data-ready")).toBe(false);
    expect(screen.getByTestId("universe-reading")).toBeTruthy();
    fireEvent.load(frame);
    expect(arrival?.hasAttribute("data-ready")).toBe(true);

    // The store moving on, as a presence or a run's state does every few seconds, leaves the page
    // as it is: not asked for again, the same frame, where the reader had scrolled it (Arjun, 24
    // October 2026: "it keeps reloading and going to top").
    const asked = vi.spyOn(store, "projectPageUrl");
    act(() => store.update(snapshotOf(events, { directory: WIDER })));
    act(() => store.update(snapshotOf(events, { directory: WIDER })));
    await new Promise((settle) => setTimeout(settle, 0));
    expect(asked).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-page-view")).toBe(frame);
    // In a browser there is nothing to open it in but this: no Open in browser.
    expect(screen.queryByTestId("project-document-browser")).toBeNull();
  });

  it("keeps Project to files and changes, with no Your folder or zip, and .chips left out (ADR 0227)", async () => {
    const events = [
      ...group(),
      fixture("project.changed", 5, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: "a".repeat(40),
        message: "The game",
        files: [{ path: "index.html", added: 3, removed: 0 }],
        file_count: 1,
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory: WIDER }));
    const writable = store as { -readonly [key in keyof FakeStore]: FakeStore[key] };
    writable.projectFiles = async () => ({
      at: "a".repeat(40),
      files: [
        { path: ".chips/index.html", bytes: 300, type: "text/html" },
        { path: "index.html", bytes: 40, type: "text/html" },
      ],
    });
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-project"));
    expect(await within(sheet).findByTestId("project-file-index.html")).toBeTruthy();
    expect(within(sheet).queryByTestId("project-file-.chips/index.html")).toBeNull();
    for (const gone of ["project-on-mac", "project-zip", "your-folder", "run-bar"]) {
      expect(within(sheet).queryByTestId(gone)).toBeNull();
    }
  });

  it("opens Universe from the header's rings: Open folder in Mac, Open page here, and the page's links in Chips (ADR 0227)", async () => {
    const events = [
      ...group(),
      // Run and Open on the Mac are an owner's (ADR 0231).
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      fixture("project.changed", 6, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: "a".repeat(40),
        message: "The reports",
        files: [{ path: ".chips/index.html", added: 3, removed: 0 }],
        file_count: 1,
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory: WIDER }));
    const writable = store as { -readonly [key in keyof FakeStore]: FakeStore[key] };
    writable.projectFiles = async () => ({
      at: "a".repeat(40),
      files: [
        { path: ".chips/index.html", bytes: 300, type: "text/html" },
        { path: "reports/overview.html", bytes: 900, type: "text/html" },
      ],
    });
    writable.projectPage = async (_spaceId, path) => `<h1>${path}</h1>`;
    writable.projectPageUrl = async () => undefined;
    const onMac = vi.fn(async () => ({ macs: 1 }));
    writable.openFolderOnMac = onMac;
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("room-universe-button"));
    const sheet = screen.getByTestId("room-sheet");
    expect(within(sheet).getByRole("heading", { name: "Universe" })).toBeTruthy();
    fireEvent.click(await within(sheet).findByTestId("project-on-mac"));
    expect((await within(sheet).findByTestId("project-on-mac-said")).textContent).toBe(
      "Sent to your Mac. Finder opens the folder there.",
    );
    expect(onMac).toHaveBeenCalledWith(SPACE);
    expect(within(sheet).getByText("Opens the space's page here, in Chips.")).toBeTruthy();
    fireEvent.click(within(sheet).getByTestId("universe-open-page"));
    const frame = (await screen.findByTestId("project-page-view")) as HTMLIFrameElement;
    expect(frame.srcdoc).toContain(".chips/index.html");
    // A link on the page to another file of the project turns the dialog to it.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { chipsFile: "reports/overview.html" },
          source: frame.contentWindow,
        }),
      );
    });
    await vi.waitFor(() =>
      expect((screen.getByTestId("project-page-view") as HTMLIFrameElement).srcdoc).toContain(
        "reports/overview.html",
      ),
    );
    // Said by anything but the page's own frame, it is not heard.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: { chipsFile: ".chips/index.html" } }),
      );
    });
    expect((screen.getByTestId("project-page-view") as HTMLIFrameElement).srcdoc).toContain(
      "reports/overview.html",
    );
  });

  it("asks no Mac from a browser for somebody who isn't an owner: no Open folder in Mac (ADR 0231)", async () => {
    const events = [
      ...group(),
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "member" }),
      fixture("project.changed", 6, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: "a".repeat(40),
        message: "The reports",
        files: [{ path: ".chips/index.html", added: 3, removed: 0 }],
        file_count: 1,
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory: WIDER }));
    const writable = store as { -readonly [key in keyof FakeStore]: FakeStore[key] };
    writable.projectFiles = async () => ({
      at: "a".repeat(40),
      files: [{ path: ".chips/index.html", bytes: 300, type: "text/html" }],
    });
    const onMac = vi.fn(async () => ({ macs: 1 }));
    writable.openFolderOnMac = onMac;
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("room-universe-button"));
    const sheet = screen.getByTestId("room-sheet");
    expect(await within(sheet).findByTestId("universe-documents")).toBeTruthy();
    expect(within(sheet).queryByTestId("project-on-mac")).toBeNull();
    expect(onMac).not.toHaveBeenCalled();
  });

  // 3 November 2026: "when file becomes available / updated in universe, the button should
  // animate to get attention", and "it should keep pulsing until person taps it".
  it("calls while the project has an agent's change, until Universe is opened (ADR 0227's addendum)", async () => {
    const events = [
      ...group(),
      fixture("project.changed", 5, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: "e".repeat(40),
        message: "The report",
        files: [{ path: "report.html", added: 40, removed: 0 }],
        file_count: 1,
      }),
    ];
    // The test DOM has no SMIL: stand in for the planets' once-round start.
    const begun = vi.fn();
    Object.defineProperty(SVGElement.prototype, "beginElement", {
      value: begun,
      configurable: true,
    });
    render(
      <Shell
        store={fakeStore(snapshotOf(events, { directory: WIDER }))}
        device={DEVICE}
        files={fakeFiles()}
      />,
    );
    const button = screen.getByTestId("room-universe-button");
    expect(button.getAttribute("aria-label")).toBe("Universe, updated");
    expect(button.querySelector(".universe-calling")).toBeTruthy();
    // Each of the four planets is sent once round its ring.
    expect(begun).toHaveBeenCalledTimes(4);
    Reflect.deleteProperty(SVGElement.prototype, "beginElement");
    fireEvent.click(button);
    expect(screen.getByTestId("room-universe-button").getAttribute("aria-label")).toBe("Universe");
    expect(
      screen.getByTestId("room-universe-button").querySelector(".universe-calling"),
    ).toBeNull();
  });

  it("runs the program on the person's Mac from a browser, from Universe, and shows what the Mac says (ADRs 0226, 0227)", async () => {
    const events = [
      ...group(),
      // Run and Open on the Mac are an owner's (ADR 0231).
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      fixture("project.changed", 6, {
        actor: harness(SCOUT),
        by: SCOUT,
        after: "a".repeat(40),
        message: "Runnable",
        files: [{ path: "chips.json", added: 1, removed: 0 }],
        file_count: 1,
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory: WIDER }));
    const writable = store as { -readonly [key in keyof FakeStore]: FakeStore[key] };
    writable.projectFiles = async () => ({
      at: "a".repeat(40),
      files: [{ path: "chips.json", bytes: 60, type: "application/json" }],
    });
    writable.projectFile = async (_spaceId, path) => {
      if (path !== "chips.json") throw new Error("not found");
      const said = '{"run": "python3 -m http.server 8000", "opens": "http://localhost:8000"}';
      return { bytes: new TextEncoder().encode(said), type: "application/json" };
    };
    const asked = vi.fn(async () => ({ macs: 1 }));
    writable.runOnMac = asked;
    let tell: ((spaceId: string, run: HeldRun) => void) | undefined;
    writable.onRunState = (listen) => {
      tell = listen;
      return () => undefined;
    };
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    // Universe's rings at the header's right (ADR 0227): Open folder in Mac, then Programs.
    fireEvent.click(screen.getByTestId("room-universe-button"));
    const sheet = screen.getByTestId("room-sheet");
    expect((await within(sheet).findByTestId("run-bar-words")).textContent).toBe(
      "Runs python3 -m http.server 8000 on your Mac, then opens localhost:8000.",
    );
    const [onMac, run] = ["project-on-mac", "run-bar"].map((id) => within(sheet).getByTestId(id));
    expect(onMac?.compareDocumentPosition(run as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(sheet).getByTestId("run-bar-run").textContent).toContain("Run program");
    // A program's own page is no document: no Open page.
    expect(within(sheet).queryByTestId("universe-open-page")).toBeNull();
    fireEvent.click(within(sheet).getByTestId("run-bar-run"));
    await vi.waitFor(() =>
      expect(asked).toHaveBeenCalledWith(SPACE, {
        op: "run",
        command: "python3 -m http.server 8000\nopen http://localhost:8000",
      }),
    );
    act(() =>
      tell?.(SPACE, {
        state: "running",
        command: "python3 -m http.server 8000\nopen http://localhost:8000",
        since: new Date().toISOString(),
        opened: "http://localhost:8000",
        mac: "Mac mini",
        said_at: new Date().toISOString(),
      }),
    );
    expect(within(sheet).getByTestId("run-bar-state").textContent).toMatch(/^Running on your Mac/);
    fireEvent.click(within(sheet).getByTestId("run-bar-stop"));
    await vi.waitFor(() => expect(asked).toHaveBeenLastCalledWith(SPACE, { op: "stop" }));
  });

  it("asks before taking a person out, and before leaving (people review, Phase 1)", () => {
    const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove Dana" }));
    const taking = screen.getByTestId("confirm-dialog");
    expect(within(taking).getByRole("heading").textContent).toBe("Take Dana out of PO-4471?");
    expect(store.membersRemoved).toEqual([]);
    fireEvent.click(within(taking).getByTestId("confirm-go"));
    expect(store.membersRemoved).toEqual([{ spaceId: SPACE, participantId: DANA }]);
    // The sheet stays, for the next thing.
    expect(screen.getByTestId("room-sheet")).toBeTruthy();

    fireEvent.click(within(sheet).getByTestId("leave-space"));
    const leaving = screen.getByTestId("confirm-dialog");
    expect(within(leaving).getByRole("heading").textContent).toBe("Leave PO-4471?");
    fireEvent.click(within(leaving).getByTestId("confirm-go"));
    expect(store.left).toEqual([SPACE]);
  });

  it("names a workspace admin as such in the room, and offers a guest no Add", () => {
    const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const as = (role: string) =>
      snapshotOf(
        [
          ...group(),
          fixture("person.joined", 5, { participant_id: DANA, display_name: "Dana", role }),
        ],
        { directory: WIDER },
      );
    const { unmount } = render(
      <Shell store={fakeStore(as("admin"))} device={DEVICE} files={fakeFiles()} />,
    );
    const rows = within(openSheet()).getAllByTestId("member");
    expect(rows.at(-1)?.textContent).toContain("DanaAdmin");
    unmount();

    render(<Shell store={fakeStore(as("guest"))} device={dana} files={fakeFiles()} />);
    const theirs = openSheet();
    expect(within(theirs).queryByTestId("room-sheet-add")).toBeNull();
    // Arjun is still here to add her back, so she may leave.
    expect(within(theirs).getByTestId("leave-space")).toBeTruthy();
  });

  it("offers the workspace's owner no Leave: the room's agents are his (ADR 0204's addendum)", () => {
    const store = fakeStore(snapshotOf([ownerJoined(), ...group()], { directory: WIDER }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    expect(within(sheet).getByRole("button", { name: "Remove Dana" })).toBeTruthy();
    expect(within(sheet).queryByTestId("leave-space")).toBeNull();
  });

  it("names whose an agent is to a guest, on the sheet, the rail and the Agents page, and to a member on the sheet (ADR 0196, ADR 0234)", () => {
    const TREE = "agt_01K4ZQPX0000000000000TREE";
    const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const tree = { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE };
    const as = (role: string, directory: Directory) =>
      snapshotOf(
        [
          ...opened(),
          fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
          // Dana, let in by Arjun's link.
          fixture("person.joined", 5, { role }),
        ],
        { directory },
      );
    // A guest is told of who is in their room, and the harness behind its agent.
    const theirs = {
      [ARJUN]: DIRECTORY[ARJUN],
      [DANA]: DIRECTORY[DANA],
      [SCOUT]: DIRECTORY[SCOUT],
      [TREE]: tree,
    } as Directory;
    const { unmount } = render(
      <Shell store={fakeStore(as("guest", theirs))} device={dana} files={fakeFiles()} />,
    );
    const row = within(openSheet()).getByTestId(`room-sheet-member-${TREE}`);
    expect(row.textContent).toContain("Arjun's agent");
    expect(row.textContent).not.toContain("Scout");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(within(sidebar()).getByTestId("side-guest-note").textContent).toBe(
      "You're Arjun's guest in PO-4471, so it's your one space here.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    expect(screen.getByText("Arjun's agent · in PO-4471")).toBeTruthy();
    expect(screen.getByTestId("agents-guest-foot").textContent).toBe(
      "Tree is Arjun's agent and answers in PO-4471.",
    );
    unmount();

    render(
      <Shell
        store={fakeStore(as("member", { ...DIRECTORY, [TREE]: tree } as Directory))}
        device={dana}
        files={fakeFiles()}
      />,
    );
    // Whose it is, then its harness, for a member; and the room is shared, Arjun being in it.
    const sheet = openSheet();
    expect(within(sheet).getByTestId(`room-sheet-member-${TREE}`).textContent).toContain(
      "Arjun's agent · Scout",
    );
    expect(within(sheet).getByTestId("shared-tag").textContent).toBe("shared");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("side-guest-note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    expect(screen.getByText("Scout · in PO-4471")).toBeTruthy();
    expect(screen.queryByTestId("agents-guest-foot")).toBeNull();
  });

  it("opens an agent's page from its row once the sheet has gone, beside its Remove, and nothing from a person's (ADR 0111 addendum)", async () => {
    const TREE = "agt_01K4ZQPX0000000000000TREE";
    const agents: Directory = {
      ...WIDER,
      [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
    };
    const room = [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
    ];
    const store = fakeStore(snapshotOf(room, { directory: agents }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    // One button per agent, none for a person; Remove stands beside it, not inside it.
    expect(within(sheet).getAllByRole("button", { name: /^Open .*'s page$/ })).toHaveLength(1);
    const open = within(sheet).getByRole("button", { name: "Open Tree's page" });
    expect(within(open).queryByRole("button")).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Remove Tree" })).toBeTruthy();
    fireEvent.click(open);
    expect(await screen.findByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
    expect(screen.queryByTestId("room-sheet")).toBeNull();
    expect(screen.getByTestId("agent-sub").textContent).toBe("Scout");
    expect(store.membersRemoved).toEqual([]);
  });

  it("sets what the room allows a job on its page, an amount or Other's, with Save, shows a member only the amount and a guest none (ADR 0117, ADR 0196)", async () => {
    const TREE = "agt_01K4ZQPX0000000000000TREE";
    const agents: Directory = {
      ...WIDER,
      [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
    };
    const room = [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
    ];
    const store = fakeStore(snapshotOf(room, { directory: agents }));
    const { unmount } = render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    const row = within(sheet).getByTestId("room-sheet-spend");
    expect(within(row).getByText("$3.00")).toBeTruthy();
    expect(await within(row).findByText("This job so far: $1.23")).toBeTruthy();
    fireEvent.click(row);
    const save = () => within(sheet).getByRole("button", { name: "Save" });
    expect((within(sheet).getByTestId("spend-default") as HTMLInputElement).checked).toBe(true);
    expect(save()).toHaveProperty("disabled", true);
    fireEvent.click(within(sheet).getByTestId("spend-10"));
    fireEvent.click(save());
    await waitFor(() => expect(store.ceilings).toEqual([{ spaceId: SPACE, usd: 10 }]));
    // Saved, the sheet is back on its first page.
    fireEvent.click(await within(sheet).findByTestId("room-sheet-spend"));
    fireEvent.click(within(sheet).getByTestId("spend-other"));
    fireEvent.change(within(sheet).getByTestId("spend-amount"), { target: { value: "7.3" } });
    expect(save()).toHaveProperty("disabled", true);
    fireEvent.change(within(sheet).getByTestId("spend-amount"), { target: { value: "7.50" } });
    fireEvent.click(save());
    await waitFor(() =>
      expect(store.ceilings).toEqual([
        { spaceId: SPACE, usd: 10 },
        { spaceId: SPACE, usd: 7.5 },
      ]),
    );
    unmount();

    // A member sees the amount and who sets it, and the row opens nothing: only the workspace's
    // owner sets it (ADR 0196).
    const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const member = snapshotOf([...room, fixture("person.joined", 6)], { directory: agents });
    const { unmount: away } = render(
      <Shell store={fakeStore(member)} device={dana} files={fakeFiles()} />,
    );
    const seen = within(openSheet()).getByTestId("room-sheet-spend");
    expect(within(seen).getByText("$3.00")).toBeTruthy();
    expect(await within(seen).findByText("Arjun sets it · this job so far: $1.23")).toBeTruthy();
    expect(seen.tagName).toBe("DIV");
    away();

    // A guest has no row at all.
    const guest = snapshotOf(
      [
        ...room,
        fixture("person.joined", 6, { role: "guest" }),
        fixture("membership.added", 7, {
          actor: person(ARJUN),
          participant_id: DANA,
          participant_kind: "person",
          role: "guest",
        }),
      ],
      { directory: agents },
    );
    render(<Shell store={fakeStore(guest)} device={dana} files={fakeFiles()} />);
    expect(within(openSheet()).queryByTestId("room-sheet-spend")).toBeNull();
  });

  it("offers the room's name to rename to anybody in it but a guest (ADR 0112)", () => {
    const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const as = (role: string) =>
      snapshotOf([
        ...opened().slice(0, 2),
        fixture("membership.added", 3, {
          actor: person(ARJUN),
          participant_id: DANA,
          participant_kind: "person",
          role,
        }),
      ]);
    const { unmount } = render(
      <Shell store={fakeStore(as("member"))} device={dana} files={fakeFiles()} />,
    );
    expect(within(openSheet()).getByTestId("room-sheet-title")).toBeTruthy();
    unmount();

    render(<Shell store={fakeStore(as("guest"))} device={dana} files={fakeFiles()} />);
    const sheet = openSheet();
    expect(within(sheet).queryByTestId("room-sheet-title")).toBeNull();
    expect(within(sheet).getByRole("heading", { name: "PO-4471" })).toBeTruthy();
  });

  it("marks who leads the room, and chooses the lead or nobody on its page (ADR 0104)", async () => {
    const TREE = "agt_01K4ZQPX0000000000000TREE";
    const ELM = "agt_01K4ZQPX00000000000000ELM";
    const agents: Directory = {
      ...WIDER,
      [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
      [ELM]: { id: ELM, kind: "agent", harnessId: LEDGER, displayName: "Elm", room: SPACE },
    };
    const led = [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
      fixture("membership.added", 5, {
        actor: person(ARJUN),
        participant_id: ELM,
        participant_kind: "agent",
      }),
      fixture("space.lead_set", 6, { actor: person(ARJUN), agent_id: TREE }),
    ];
    const store = fakeStore(snapshotOf(led, { directory: agents }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    const rows = within(sheet).getAllByTestId("member");
    const tree = rows.find((row) => row.getAttribute("data-participant") === TREE);
    expect(tree && within(tree).getByTestId("member-lead").textContent).toBe("Lead");
    expect(within(within(sheet).getByTestId("room-sheet-lead")).getByText("Tree")).toBeTruthy();
    fireEvent.click(within(sheet).getByTestId("room-sheet-lead"));
    expect((within(sheet).getByRole("radio", { name: "Tree" }) as HTMLInputElement).checked).toBe(
      true,
    );
    // Choosing says so in the room and puts the sheet away, as on the phone.
    fireEvent.click(within(sheet).getByRole("radio", { name: "Elm" }));
    await waitFor(() => expect(screen.queryByTestId("room-sheet")).toBeNull());
    fireEvent.click(within(openSheet()).getByTestId("room-sheet-lead"));
    fireEvent.click(
      within(screen.getByTestId("room-sheet")).getByRole("radio", { name: "No lead" }),
    );
    await waitFor(() =>
      expect(store.leads).toEqual([
        { spaceId: SPACE, agentId: ELM },
        { spaceId: SPACE, agentId: null },
      ]),
    );
  });

  it("puts the sheet away with Escape, a click outside it or Done, and keeps it for Escape in its name (ADR 0151)", async () => {
    const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const gone = () => waitFor(() => expect(screen.queryByTestId("room-sheet")).toBeNull());

    // It holds the keyboard itself as it opens, so nothing in it is lit until Tab: WebKit rings a
    // button focused by script, and Done wore a ring the sheet's edge cut.
    let sheet = openSheet();
    expect(document.activeElement).toBe(sheet.querySelector(".sheet-card"));

    // Escape in the name field puts the old name back, and the sheet stays.
    fireEvent.click(within(sheet).getByTestId("room-sheet-title"));
    const field = within(sheet).getByLabelText("The space's name");
    fireEvent.change(field, { target: { value: "half typed" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(within(sheet).queryByLabelText("The space's name")).toBeNull();
    expect(store.spaceUpdates).toEqual([]);

    // Escape anywhere else: the dialog's cancel.
    fireEvent(sheet, new Event("cancel", { cancelable: true }));
    await gone();

    // A click on the dim around it.
    sheet = openSheet();
    fireEvent.pointerDown(sheet);
    fireEvent.click(sheet);
    await gone();

    // Its X, from the header's name this time: the sheet has no Done, as the phone's (ADR 0268).
    fireEvent.click(screen.getByTestId("room-title"));
    fireEvent.click(within(screen.getByTestId("room-sheet")).getByTestId("room-sheet-close"));
    await gone();
  });

  it("offers no harness that was removed to add, and still names one that is here (ADR 0078)", () => {
    const hermesGone: Directory = {
      ...WIDER,
      [HERMES]: {
        id: HERMES,
        kind: "harness",
        displayName: "Hermes",
        ownerId: ARJUN,
        removedAt: "2026-09-27T10:00:00.000Z",
      },
    };
    const both = [
      ...group(),
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      fixture("person.joined", 6, { participant_id: DANA, display_name: "Dana", role: "member" }),
    ];
    const store = fakeStore(snapshotOf(both, { directory: hermesGone }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-add"));
    // Everyone else is in the room already, and Hermes is gone: there is nobody to add.
    expect(within(sheet).queryByRole("checkbox")).toBeNull();
    expect(within(sheet).getByText("Everyone in your workspace is here")).toBeTruthy();
  });

  it("deletes a room from its sheet once the dialog is answered, and not before", async () => {
    const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(within(openSheet()).getByTestId("delete-space"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Delete PO-4471?");
    expect(dialog.textContent).toContain("can't be undone");

    // Cancel is nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(store.erased).toEqual([]);

    // A server that will not says why, and the dialog stays.
    store.eraseRefusal = "No route matches that.";
    fireEvent.click(within(screen.getByTestId("room-sheet")).getByTestId("delete-space"));
    fireEvent.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-go"));
    expect((await screen.findByTestId("confirm-failed")).textContent).toContain(
      "this server is older than the app",
    );

    store.eraseRefusal = undefined;
    fireEvent.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-go"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(store.erased).toEqual([SPACE]);
  });

  describe("Lock changes (ADR 0156)", () => {
    const lockSwitch = (sheet: HTMLElement) =>
      within(sheet).getByRole("switch", { name: "Lock changes" }) as HTMLInputElement;
    const locked = (seq: number, on: boolean) =>
      fixture("space.lock_set", seq, {
        id: `evt_01K4ZQPX00000000000000LCK${seq}`,
        actor: person(ARJUN),
        locked: on,
      });

    it("locks the room's changes from a switch under its settings, held on until the room hears it", async () => {
      const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
      render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
      const sheet = openSheet();
      const row = within(sheet).getByTestId("room-sheet-lock");
      expect(row.textContent).toContain("OffLock changes");
      expect(row.getAttribute("title")).toBe("Stops the space being renamed, archived or deleted");
      // The last of the room's tiles (ADR 0202), and off for every room, its padlock open.
      const padlock = () => row.querySelector("[data-icon]")?.getAttribute("data-icon");
      expect(row.nextElementSibling).toBeNull();
      expect(lockSwitch(sheet).checked).toBe(false);
      expect(padlock()).toBe("unlock");

      // On at once, its padlock shut, and held on while the server's word is on its way.
      fireEvent.click(lockSwitch(sheet));
      expect(lockSwitch(sheet).checked).toBe(true);
      expect(padlock()).toBe("lock");
      expect(row.textContent).toContain("OnLock changes");
      await waitFor(() => expect(store.locks).toEqual([{ spaceId: SPACE, locked: true }]));
      expect(lockSwitch(sheet).checked).toBe(true);

      // Heard, the room says who locked it, and the switch stands on the room's own word.
      store.update(snapshotOf([...group(), locked(5, true)], { directory: WIDER }));
      expect(lockSwitch(sheet).checked).toBe(true);
      expect(
        within(screen.getByTestId("messages")).getByText(/locked changes to the space/).textContent,
      ).toContain("Arjun");

      // And off again the same way.
      fireEvent.click(lockSwitch(sheet));
      expect(lockSwitch(sheet).checked).toBe(false);
      await waitFor(() =>
        expect(store.locks).toEqual([
          { spaceId: SPACE, locked: true },
          { spaceId: SPACE, locked: false },
        ]),
      );
    });

    it("offers the switch to anybody in the room but a guest", () => {
      const dana = { ...DEVICE, participantId: DANA, displayName: "Dana" };
      const as = (role: string) =>
        snapshotOf([
          ...opened().slice(0, 2),
          fixture("membership.added", 3, {
            actor: person(ARJUN),
            participant_id: DANA,
            participant_kind: "person",
            role,
          }),
        ]);
      const { unmount } = render(
        <Shell store={fakeStore(as("member"))} device={dana} files={fakeFiles()} />,
      );
      expect(within(openSheet()).getByTestId("room-sheet-lock")).toBeTruthy();
      unmount();

      render(<Shell store={fakeStore(as("guest"))} device={dana} files={fakeFiles()} />);
      const sheet = openSheet();
      expect(within(sheet).queryByTestId("room-sheet-lock")).toBeNull();
      expect(within(sheet).queryByRole("switch")).toBeNull();
    });

    it("puts the switch back when the server turns it away, and says why under the page", async () => {
      const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
      store.lockRefusal = "Only somebody in this space may lock its changes.";
      render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
      const sheet = openSheet();
      fireEvent.click(lockSwitch(sheet));
      expect(lockSwitch(sheet).checked).toBe(true);
      expect((await within(sheet).findByTestId("room-sheet-failed")).textContent).toBe(
        "Only somebody in this space may lock its changes.",
      );
      await waitFor(() => expect(lockSwitch(sheet).checked).toBe(false));
      expect(store.locks).toEqual([]);
    });

    it("offers no rename, Archive or Delete space… while the room is locked, and all three once it is let go", () => {
      const store = fakeStore(snapshotOf([...group(), locked(5, true)], { directory: WIDER }));
      render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
      const sheet = openSheet();
      expect(lockSwitch(sheet).checked).toBe(true);
      expect(within(sheet).queryByTestId("room-sheet-title")).toBeNull();
      expect(within(sheet).getByRole("heading", { name: "PO-4471" })).toBeTruthy();
      expect(within(sheet).queryByTestId("archive-space")).toBeNull();
      expect(within(sheet).queryByTestId("delete-space")).toBeNull();
      expect(within(sheet).getByTestId("room-sheet-close")).toBeTruthy();
      // Who is in it is not locked.
      expect(within(sheet).getByTestId("room-sheet-add")).toBeTruthy();
      expect(within(sheet).getByRole("button", { name: "Remove Ledger" })).toBeTruthy();

      store.update(
        snapshotOf([...group(), locked(5, true), locked(6, false)], { directory: WIDER }),
      );
      expect(lockSwitch(sheet).checked).toBe(false);
      expect(within(sheet).getByTestId("room-sheet-title")).toBeTruthy();
      expect(within(sheet).getByTestId("archive-space")).toBeTruthy();
      expect(within(sheet).getByTestId("delete-space")).toBeTruthy();
      expect(
        within(screen.getByTestId("messages")).getByText(/unlocked changes to the space/),
      ).toBeTruthy();
    });

    it("still offers Unarchive for a locked room that was archived, and nothing else", () => {
      const closing = fixture("space.updated", 5, { actor: person(ARJUN), state: "closed" });
      delete (closing as Record<string, unknown>)["title"];
      const store = fakeStore(
        snapshotOf([...group(), closing, locked(6, true)], { directory: WIDER }),
      );
      render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
      const sheet = openSheet();
      expect(within(sheet).queryByTestId("room-sheet-title")).toBeNull();
      expect(within(sheet).queryByTestId("delete-space")).toBeNull();
      fireEvent.click(within(sheet).getByTestId("unarchive-space"));
      expect(store.spaceUpdates).toEqual([{ spaceId: SPACE, state: "open" }]);
    });
  });

  it("folds what the harnesses said to each other into one row, open on a click", () => {
    renderShell([
      ...group(),
      fixture("run.started", 5),
      fixture("message.post", 6, {
        actor: harness(SCOUT),
        text: "@Ledger which warehouse?",
        mentions: [LEDGER],
      }),
      fixture("message.post", 7, {
        actor: harness(LEDGER),
        text: "@Scout the finance one",
        mentions: [SCOUT],
      }),
      fixture("message.post", 8, { actor: harness(SCOUT), text: "Confirmed with Northwind." }),
    ]);
    const messages = within(screen.getByTestId("messages"));
    const fold = screen.getByTestId("chatter");
    // Lines from before Chips said who a message is for fold by what they name.
    expect(
      within(fold).getByRole("button", { name: "Scout and Ledger · 2 messages" }),
    ).toBeTruthy();
    expect(fold.textContent).toContain("2 messages");
    expect(messages.queryByText(/which warehouse/)).toBeNull();
    expect(messages.getByText("Confirmed with Northwind.")).toBeTruthy();

    fireEvent.click(within(fold).getByRole("button", { expanded: false }));
    expect(messages.getByText(/which warehouse/)).toBeTruthy();
    expect(messages.getByText(/the finance one/)).toBeTruthy();
  });

  describe("who a message is for (ADR 0081)", () => {
    /** A message said in the room, with an id of its own so each line draws as itself. */
    const said = (seq: number, by: string, text: string, extra: Record<string, unknown> = {}) =>
      fixture("message.post", seq, {
        id: `evt_01K4ZQPX0000000000000000${String(seq).padStart(2, "0")}`,
        actor: by.startsWith("hrn_") ? harness(by) : person(by),
        text,
        ...extra,
      });

    const capsule = () => screen.getByRole("button", { name: /^To / });
    // Named for where the capsule aims, which changes as a test goes.
    const field = () => screen.getByRole("textbox", { name: /^Message / });

    function type(text: string) {
      fireEvent.change(field(), { target: { value: text } });
    }

    function send(text: string) {
      type(text);
      fireEvent.keyDown(field(), { key: "Enter" });
    }

    /** The faces a control draws, by the name each says. */
    const faces = (element: HTMLElement) =>
      [...element.querySelectorAll(".ui-avatar")].map((face) => face.getAttribute("aria-label"));

    it("puts the capsule over the field only in a room of two or more others (ADR 0204)", () => {
      // Arjun and Scout alone: there is nobody else a message could be for.
      const pair = opened().slice(0, 2);
      renderShell([...pair, said(5, ARJUN, "hi", { addressed_to: [SCOUT] })]);
      expect(screen.queryByTestId("aim")).toBeNull();
      // With one other nothing can have gone anywhere else, so nothing draws where it went.
      expect(screen.queryByTestId("message-route")).toBeNull();
      cleanup();

      // Scout and Dana are two: a person counts as an agent does.
      renderShell(opened());
      expect(capsule().getAttribute("aria-label")).toBe("To Scout");
      cleanup();

      renderShell(group());
      expect(capsule().getAttribute("aria-haspopup")).toBe("listbox");
      expect(capsule().getAttribute("aria-expanded")).toBe("false");
      cleanup();

      // A harness that was removed is no longer somewhere a message can go.
      const gone: Directory = {
        ...DIRECTORY,
        [LEDGER]: { ...(DIRECTORY[LEDGER] as Participant), removedAt: "2026-09-27T10:00:00Z" },
      };
      renderShell(pair, { directory: gone });
      expect(screen.queryByTestId("aim")).toBeNull();
    });

    it("says nothing while the Steer chip is on: a steer goes to the run", () => {
      const store = renderShell([...group(), fixture("run.started", 5)]);
      expect(capsule()).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Steer" }));
      expect(screen.queryByTestId("aim")).toBeNull();
      send("Ask Dana about pallets.");
      expect(store.sent).toEqual([]);
      expect(store.runCommands.map((each) => each.verb)).toEqual(["steer"]);
    });

    it("says Everyone before your first message, then where your last one went", () => {
      const store = renderShell(group());
      expect(capsule().getAttribute("aria-label")).toBe("To Everyone");
      // Everyone is everyone here, Dana too, though only the agents answer.
      expect(faces(capsule())).toEqual(["Scout", "Ledger", "Dana"]);

      store.update(
        snapshotOf([...group(), said(5, ARJUN, "@Ledger the quotes?", { addressed_to: [LEDGER] })]),
      );
      expect(capsule().getAttribute("aria-label")).toBe("To Ledger");
      expect(faces(capsule())).toEqual(["Ledger"]);
      // Dana's last word is hers: Arjun's capsule follows Arjun.
      store.update(
        snapshotOf([
          ...group(),
          said(5, ARJUN, "@Ledger the quotes?", { addressed_to: [LEDGER] }),
          said(6, DANA, "@Scout and you?", { addressed_to: [SCOUT] }),
        ]),
      );
      expect(capsule().getAttribute("aria-label")).toBe("To Ledger");
    });

    it("leads the field with the faces, says who in it, and opens the field into the list", () => {
      // Somebody has said something: a room nobody has asks what it is for (ADR 0148).
      renderShell([
        ...group(),
        fixture("message.post", 5, { actor: person(ARJUN), text: "Get PO #4471 confirmed." }),
      ]);
      const box = field();
      expect(box.getAttribute("placeholder")).toBe("Message Everyone");
      // One box: the faces and the words share it (Arjun's A), and the list comes into it too.
      const shared = box.closest(".ui-composer__field") as HTMLElement;
      expect(within(shared).getByRole("button", { name: "To Everyone" })).toBeTruthy();
      fireEvent.click(capsule());
      expect(
        within(shared).getByRole("listbox", { name: "Where the next message goes" }),
      ).toBeTruthy();
      // A press anywhere else closes it, picking nothing.
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(capsule().getAttribute("aria-label")).toBe("To Everyone");
    });

    describe("a press, a slide and a release (ADR 0229)", () => {
      // jsdom lays nothing out, so where the pointer is let go is the element a test says.
      const letGoOver = (element: Element) => {
        Object.defineProperty(document, "elementFromPoint", {
          configurable: true,
          value: () => element,
        });
      };
      afterEach(() => {
        Reflect.deleteProperty(document, "elementFromPoint");
      });

      it("opens on the press and picks the row let go on, alone", () => {
        renderShell(group());
        fireEvent.pointerDown(capsule(), { button: 0, isPrimary: true, clientX: 40, clientY: 600 });
        const menu = screen.getByRole("listbox", { name: "Where the next message goes" });
        const ledger = within(menu).getByRole("option", { name: /^Ledger,/ });
        letGoOver(ledger);
        fireEvent.pointerUp(ledger, { clientX: 70, clientY: 430 });
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(capsule().getAttribute("aria-label")).toBe("To Ledger");
      });

      it("leaves the list open after a press let go where it began", () => {
        renderShell(group());
        fireEvent.pointerDown(capsule(), { button: 0, isPrimary: true, clientX: 40, clientY: 600 });
        fireEvent.pointerUp(capsule(), { clientX: 41, clientY: 600 });
        fireEvent.click(capsule());
        expect(screen.getByRole("listbox", { name: "Where the next message goes" })).toBeTruthy();
        // The next click on the faces closes it, as it always did.
        fireEvent.click(capsule());
        expect(screen.queryByRole("listbox")).toBeNull();
      });

      it("closes the list unchanged after a slide let go off it", () => {
        renderShell(group());
        fireEvent.pointerDown(capsule(), { button: 0, isPrimary: true, clientX: 40, clientY: 600 });
        letGoOver(document.body);
        fireEvent.pointerUp(document.body, { clientX: 500, clientY: 300 });
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(capsule().getAttribute("aria-label")).toBe("To Everyone");
      });
    });

    it("marks the room's lead in the menu, as Members does (ADR 0104)", () => {
      renderShell([
        ...group(),
        fixture("space.lead_set", 5, { actor: person(ARJUN), agent_id: LEDGER }),
      ]);
      fireEvent.click(capsule());
      const menu = screen.getByRole("listbox", { name: "Where the next message goes" });
      const ledger = within(menu).getByRole("option", { name: "Ledger, lead, @Ledger" });
      expect(within(ledger).getByTestId("aim-lead").textContent).toBe("Lead");
      expect(within(menu).getAllByTestId("aim-lead")).toHaveLength(1);
    });

    it("says whose an agent is in the menu, where it is somebody else's (ADR 0234)", () => {
      const ledger = { ...DIRECTORY[LEDGER], ownerId: DANA } as Directory[string];
      renderShell(group(), { directory: { ...DIRECTORY, [LEDGER]: ledger } as Directory });
      fireEvent.click(capsule());
      const menu = screen.getByRole("listbox", { name: "Where the next message goes" });
      const option = within(menu).getByRole("option", { name: "Ledger, @Ledger, Dana's agent" });
      expect(option.querySelector(".aim-owner")?.textContent).toBe("Dana's agent");
      // The reader's own says nothing of whose.
      expect(within(menu).getByRole("option", { name: "Scout, @Scout" })).toBeTruthy();
    });

    describe("a room of many (ADR 0113)", () => {
      const MOSS = "hrn_01K4ZQPX0000000000000MOSS";
      const FERN = "hrn_01K4ZQPX0000000000000FERN";
      const REED = "hrn_01K4ZQPX0000000000000REED";
      const many: Directory = {
        ...WIDER,
        [MOSS]: { id: MOSS, kind: "harness", displayName: "Moss", ownerId: ARJUN },
        [FERN]: { id: FERN, kind: "harness", displayName: "Fern", ownerId: ARJUN },
        [REED]: { id: REED, kind: "harness", displayName: "Reed", ownerId: ARJUN },
      };
      /** Scout and Ledger, then whichever of Moss, Fern and Reed are given, added in turn. */
      const crowd = (more: readonly string[] = [MOSS, FERN, REED]) => [
        ...group(),
        ...more.map((id, at) =>
          fixture("membership.added", 5 + at, {
            actor: person(ARJUN),
            participant_id: id,
            participant_kind: "harness",
          }),
        ),
      ];

      it("draws six as one mark and a number, and three as their faces", () => {
        // Five agents and Dana: a person is counted apart from the agents (ADR 0204).
        renderShell(crowd(), { directory: many });
        expect(capsule().getAttribute("aria-label")).toBe("To Everyone, 1 person, 5 agents");
        expect(within(capsule()).getByTestId("faces-count").textContent).toBe("6");
        expect(capsule().querySelectorAll(".ui-faces__mark i")).toHaveLength(4);
        expect(faces(capsule())).toEqual([]);
        cleanup();
        renderShell(crowd([]), { directory: many });
        expect(capsule().getAttribute("aria-label")).toBe("To Everyone");
        expect(within(capsule()).queryByTestId("faces-mark")).toBeNull();
        expect(faces(capsule())).toEqual(["Scout", "Ledger", "Dana"]);
      });

      it("lists the lead first, scrolls the rest, and holds Everyone at the foot", () => {
        renderShell(
          [...crowd(), fixture("space.lead_set", 9, { actor: person(ARJUN), agent_id: FERN })],
          { directory: many },
        );
        fireEvent.click(capsule());
        const rows = screen.getByTestId("aim-rows");
        expect(
          within(rows)
            .getAllByRole("option")
            .map((option) => option.getAttribute("aria-label")),
        ).toEqual([
          "Fern, lead, @Fern",
          "Scout, @Scout",
          "Ledger, @Ledger",
          "Moss, @Moss",
          "Reed, @Reed",
          // People under the agents (ADR 0204).
          "Dana, @Dana",
        ]);
        const everyone = screen.getByRole("option", { name: /^Everyone/ });
        expect(rows.contains(everyone)).toBe(false);
        expect(within(everyone).getByTestId("faces-count").textContent).toBe("6");
        // The arrows walk from the rows down into Everyone, held apart from them.
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "End" });
        expect(document.activeElement).toBe(everyone);
      });

      it("keeps Everyone picked as everyone when an agent joins before the send", () => {
        const before = [...crowd([MOSS]), said(9, ARJUN, "@Scout hi", { addressed_to: [SCOUT] })];
        const store = renderShell(before, { directory: many });
        expect(capsule().getAttribute("aria-label")).toBe("To Scout");
        fireEvent.click(capsule());
        fireEvent.click(screen.getByRole("option", { name: /^Everyone/ }));
        expect(capsule().getAttribute("aria-label")).toBe("To Everyone, 1 person, 3 agents");
        store.update(
          snapshotOf(
            [
              ...before,
              fixture("membership.added", 10, {
                actor: person(ARJUN),
                participant_id: FERN,
                participant_kind: "harness",
              }),
            ],
            { directory: many },
          ),
        );
        expect(capsule().getAttribute("aria-label")).toBe("To Everyone, 1 person, 4 agents");
      });

      it("adds an agent by its circle or Space, and picks one alone by its name or Enter (ADR 0114)", () => {
        const store = renderShell(crowd(), { directory: many });
        fireEvent.click(capsule());
        const menu = screen.getByRole("listbox", { name: "Where the next message goes" });
        expect(menu.getAttribute("aria-multiselectable")).toBe("true");
        // Under Everyone, the first circle starts afresh, and the list stays open.
        fireEvent.click(screen.getByTestId("aim-add-Scout"));
        expect(screen.getByRole("listbox")).toBeTruthy();
        expect(capsule().getAttribute("aria-label")).toBe("To Scout");
        fireEvent.click(screen.getByTestId("aim-add-Ledger"));
        // Space on an agent adds it too.
        fireEvent.pointerEnter(screen.getByRole("option", { name: "Moss, @Moss" }));
        fireEvent.keyDown(screen.getByRole("listbox"), { key: " " });
        expect(capsule().getAttribute("aria-label")).toBe("To Scout, Ledger and Moss");
        fireEvent.click(screen.getByTestId("aim-add-Fern"));
        expect(capsule().getAttribute("aria-label")).toBe("To 4 agents");
        expect(screen.getByRole("textbox", { name: "Message 4 agents" })).toBeTruthy();
        expect(
          within(screen.getByRole("listbox"))
            .getAllByRole("option")
            .map((option) => option.getAttribute("aria-selected")),
        ).toEqual(["true", "true", "true", "true", "false", "false", "false"]);
        expect(screen.getByTestId("aim-add-Fern").getAttribute("data-on")).toBe("true");
        // A second click on the circle takes one out.
        fireEvent.click(screen.getByTestId("aim-add-Fern"));
        expect(capsule().getAttribute("aria-label")).toBe("To Scout, Ledger and Moss");
        // A click on the faces closes it, and the send goes to the three.
        fireEvent.click(capsule());
        expect(screen.queryByRole("listbox")).toBeNull();
        send("you three");
        expect(store.sent).toEqual([
          {
            spaceId: SPACE,
            text: "you three",
            to: [SCOUT, LEDGER, MOSS],
            addressedTo: [SCOUT, LEDGER, MOSS],
          },
        ]);
        // A click on an agent's name picks it alone, and closes.
        fireEvent.click(capsule());
        fireEvent.click(screen.getByRole("option", { name: "Reed, @Reed" }));
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(capsule().getAttribute("aria-label")).toBe("To Reed");
        // So does Enter.
        fireEvent.click(capsule());
        fireEvent.pointerEnter(screen.getByRole("option", { name: "Fern, @Fern" }));
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(capsule().getAttribute("aria-label")).toBe("To Fern");
        // Everyone is one click, and closes it.
        fireEvent.click(capsule());
        fireEvent.click(screen.getByRole("option", { name: /^Everyone/ }));
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(capsule().getAttribute("aria-label")).toBe("To Everyone, 1 person, 5 agents");
      });

      it("keeps a room's pick for coming back to, in the window's storage", () => {
        renderShell(crowd(), { directory: many });
        fireEvent.click(capsule());
        fireEvent.click(screen.getByTestId("aim-add-Scout"));
        fireEvent.click(screen.getByTestId("aim-add-Moss"));
        fireEvent.click(capsule());
        expect(JSON.parse(localStorage.getItem("chips.picks") ?? "{}")).toEqual({
          [SPACE]: [SCOUT, MOSS],
        });
        // The app closed and opened again.
        cleanup();
        const store = renderShell(crowd(), { directory: many });
        expect(capsule().getAttribute("aria-label")).toBe("To Scout and Moss");
        // A send goes to them and lets the pick go: where it went is the room's default now.
        send("you two");
        expect(store.sent).toEqual([
          { spaceId: SPACE, text: "you two", to: [SCOUT, MOSS], addressedTo: [SCOUT, MOSS] },
        ]);
        expect(JSON.parse(localStorage.getItem("chips.picks") ?? "{}")).toEqual({});
      });

      it("lists who a message went to from its route", () => {
        renderShell(
          [
            ...crowd(),
            fixture("space.lead_set", 9, { actor: person(ARJUN), agent_id: LEDGER }),
            // The list quotes its words, not their marks.
            said(10, ARJUN, "**Hello** all", {
              addressed_to: [SCOUT, LEDGER, MOSS, FERN, REED],
              addressed_to_all: true,
            }),
          ],
          { directory: many },
        );
        const route = screen.getByRole("button", { name: "Went to Everyone, 5 agents" });
        expect(route.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(route);
        const list = screen.getByRole("dialog", { name: "To Everyone" });
        expect(within(list).getByText(/^5 agents · “Hello all” at /)).toBeTruthy();
        expect(within(list).getAllByRole("listitem")).toHaveLength(5);
        expect(
          within(within(list).getByTestId(`route-list-${LEDGER}`)).getByText("Lead"),
        ).toBeTruthy();
        fireEvent.keyDown(list, { key: "Escape" });
        expect(screen.queryByRole("dialog", { name: "To Everyone" })).toBeNull();
        expect(document.activeElement).toBe(route);
      });
    });

    it("names the field after where the capsule aims, not whichever harness has a run", () => {
      const store = renderShell([...group(), fixture("run.started", 5)]);
      expect(screen.getByRole("textbox", { name: "Message Everyone" })).toBeTruthy();
      store.update(
        snapshotOf([
          ...group(),
          fixture("run.started", 5),
          said(6, ARJUN, "@Ledger the quotes?", { addressed_to: [LEDGER] }),
        ]),
      );
      expect(screen.getByRole("textbox", { name: "Message Ledger" })).toBeTruthy();
    });

    it("says Everyone after a message for everyone, a harness added since included", () => {
      const TREE = "hrn_01K4ZQPX00000000000000TREE";
      const directory: Directory = {
        ...DIRECTORY,
        [TREE]: { id: TREE, kind: "harness", displayName: "Tree" } as Participant,
      };
      renderShell(
        [
          ...group(),
          said(5, ARJUN, "hi both", { addressed_to: [SCOUT, LEDGER], addressed_to_all: true }),
          fixture("membership.added", 6, { participant_id: TREE, participant_kind: "harness" }),
        ],
        { directory },
      );
      // Scout, Ledger, Tree and Dana: four draw as the mark.
      expect(capsule().getAttribute("aria-label")).toBe("To Everyone, 1 person, 3 agents");
    });

    it("sends the menu's pick as `to`, for that draft only, and every harness as all", () => {
      const store = renderShell(group());
      fireEvent.click(capsule());
      const menu = screen.getByRole("listbox", { name: "Where the next message goes" });
      const options = within(menu).getAllByRole("option");
      expect(
        options.map((option) => option.querySelector(".aim-option-words")?.textContent),
      ).toEqual(["Scout@Scout", "Ledger@Ledger", "Dana@Dana", "EveryoneBoth agents answer"]);
      // A check on the one it says now.
      expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual([
        "false",
        "false",
        "false",
        "true",
      ]);
      expect(faces(options[3] as HTMLElement)).toEqual(["Scout", "Ledger", "Dana"]);

      // A click on an agent adds it, and the list stays (ADR 0114); Escape puts it away.
      fireEvent.click(within(options[1] as HTMLElement).getByTestId("aim-add-Ledger"));
      expect(screen.getByRole("listbox")).toBeTruthy();
      expect(capsule().getAttribute("aria-label")).toBe("To Ledger");
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(capsule());

      send("the Northwind quotes");
      expect(store.sent).toEqual([
        { spaceId: SPACE, text: "the Northwind quotes", to: [LEDGER], addressedTo: [LEDGER] },
      ]);
      // The pick was that draft's. This store draws nothing pending, so the room's rule says
      // where the next one goes, and before a first message that is everyone.
      expect(capsule().getAttribute("aria-label")).toBe("To Everyone");
      send("hi both");
      expect(store.sent[1]).toEqual({
        spaceId: SPACE,
        text: "hi both",
        to: "all",
        addressedTo: [SCOUT, LEDGER],
      });
    });

    it("walks the menu with the arrow keys, and puts it away on Escape or a click elsewhere", () => {
      renderShell(group());
      fireEvent.keyDown(capsule(), { key: "ArrowUp" });
      const menu = screen.getByRole("listbox");
      expect(capsule().getAttribute("aria-expanded")).toBe("true");
      expect(capsule().getAttribute("aria-controls")).toBe(menu.id);
      // It opens on what the capsule says now, and the keys wrap around it.
      expect(document.activeElement?.textContent).toContain("Everyone");
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(document.activeElement?.textContent).toContain("Scout");
      fireEvent.keyDown(menu, { key: "ArrowUp" });
      fireEvent.keyDown(menu, { key: "ArrowUp" });
      // Dana, under the agents, just over Everyone (ADR 0204).
      expect(document.activeElement?.textContent).toContain("Dana");
      fireEvent.keyDown(menu, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(capsule());
      expect(capsule().getAttribute("aria-label")).toBe("To Everyone");

      fireEvent.click(capsule());
      expect(screen.getByRole("listbox")).toBeTruthy();
      fireEvent.pointerDown(screen.getByTestId("messages"));
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("lets an @ decide over the menu, says so, and sends it as itself", () => {
      const store = renderShell(group());
      fireEvent.click(capsule());
      fireEvent.click(screen.getByTestId("aim-add-Scout"));
      expect(capsule().getAttribute("aria-label")).toBe("To Scout");

      type("@Ledger which warehouse?");
      expect(capsule().getAttribute("aria-label")).toBe("To Ledger, by @");
      // In the field, the @ takes the chevron's place (Arjun's A).
      expect(within(capsule()).getByText("@")).toBeTruthy();
      // An @ that names only people is for them, and no agent (ADR 0204).
      type("@Dana have a look");
      expect(capsule().getAttribute("aria-label")).toBe("To Dana, by @");
      expect(faces(capsule())).toEqual(["Dana"]);
      // And the capsule goes back to the pick when the @ goes.
      type("have a look");
      expect(capsule().getAttribute("aria-label")).toBe("To Scout");

      send("@Ledger which warehouse?");
      expect(store.sent).toEqual([
        { spaceId: SPACE, text: "@Ledger which warehouse?", addressedTo: [LEDGER] },
      ]);
    });

    it("draws where a message went over it only where that changed", () => {
      renderShell([
        ...group(),
        said(5, ARJUN, "From before"),
        said(6, ARJUN, "@Ledger the quotes?", { addressed_to: [LEDGER] }),
        said(7, ARJUN, "and the PO?", { addressed_to: [LEDGER] }),
        said(8, DANA, "hello both", { addressed_to: [SCOUT, LEDGER] }),
        said(9, ARJUN, "your turn", { addressed_to: [SCOUT] }),
      ]);
      const routes = screen.getAllByTestId("message-route");
      expect(
        routes.map((route) => within(route).getByRole("button").getAttribute("aria-label")),
        // Both agents are not everyone, with Dana here (ADR 0204).
      ).toEqual(["Went to Ledger", "Went to Scout and Ledger", "Went to Scout"]);
      const messages = within(screen.getByTestId("messages"));
      const rowOf = (text: string) =>
        messages.getByText(text, { exact: false }).closest(".msg") as HTMLElement;
      expect(within(rowOf("the quotes?")).getByTestId("message-route")).toBe(routes[0]);
      // Where the last one went, and from before Chips said: nothing over either.
      expect(within(rowOf("and the PO?")).queryByTestId("message-route")).toBeNull();
      expect(within(rowOf("From before")).queryByTestId("message-route")).toBeNull();
      // On the bubble's side: yours on the right, from your face; Dana's after her face, so it
      // starts at the arrow rather than draw her face twice; several overlapped.
      expect(routes[0]?.closest(".msg")?.getAttribute("data-mine")).toBe("true");
      expect(faces(routes[0] as HTMLElement)).toEqual(["Arjun", "Ledger"]);
      expect(routes[1]?.closest(".msg")?.getAttribute("data-mine")).toBeNull();
      expect(faces(routes[1] as HTMLElement)).toEqual(["Scout", "Ledger"]);
      expect(routes[1]?.querySelectorAll(".ui-trail__arrow")).toHaveLength(1);
      expect(routes[1]?.querySelector('.ui-faces[data-many="true"]')).not.toBeNull();
    });

    it("folds what harnesses addressed to each other: their faces, the count, the latest line", () => {
      renderShell([
        ...group(),
        said(5, ARJUN, "sort out the warehouse", { addressed_to: [SCOUT, LEDGER] }),
        said(6, SCOUT, "which warehouse?", { addressed_to: [LEDGER] }),
        said(7, LEDGER, "the **finance** one", { addressed_to: [SCOUT] }),
        said(8, SCOUT, "Confirmed with Northwind.", { addressed_to: [] }),
      ]);
      const fold = screen.getByTestId("chatter");
      const header = within(fold).getByRole("button", {
        name: "Scout and Ledger · 2 messages",
        expanded: false,
      });
      expect(faces(header)).toEqual(["Scout", "Ledger"]);
      expect(header.textContent).toContain("⇄");
      expect(within(fold).getByTestId("chatter-latest").textContent).toBe("Ledger the finance one");
      // What Scout told the people is not theirs to each other.
      const messages = within(screen.getByTestId("messages"));
      expect(messages.getByText("Confirmed with Northwind.").closest(".chatter")).toBeNull();

      fireEvent.click(header);
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(within(fold).queryByTestId("chatter-latest")).toBeNull();
      expect(within(fold).getByText("which warehouse?")).toBeTruthy();
    });

    it("draws the referee's line under the fold once the talk is worth it, with two taps at the warning (ADR 0097)", () => {
      const store = renderShell([
        ...group(),
        said(5, ARJUN, "sort it out", { addressed_to: [SCOUT, LEDGER] }),
        said(6, SCOUT, "which of the two warehouses is it", { addressed_to: [LEDGER] }),
        said(7, LEDGER, "the finance one in the north", { addressed_to: [SCOUT] }),
        said(8, SCOUT, "and the shipment for it lands when", { addressed_to: [LEDGER] }),
        said(9, LEDGER, "on Tuesday at the north dock", { addressed_to: [SCOUT] }),
      ]);
      // Two rounds of the two of them: nothing yet.
      expect(screen.queryAllByTestId("guard")).toEqual([]);
      cleanup();
      const talk = [
        ...group(),
        said(5, ARJUN, "sort it out", { addressed_to: [SCOUT, LEDGER] }),
        said(6, SCOUT, "which of the two warehouses is it", { addressed_to: [LEDGER] }),
        said(7, LEDGER, "the finance one in the north", { addressed_to: [SCOUT] }),
        said(8, SCOUT, "and the shipment for it lands when", { addressed_to: [LEDGER] }),
        said(9, LEDGER, "on Tuesday at the north dock", { addressed_to: [SCOUT] }),
        said(10, SCOUT, "who signs for it at the dock", { addressed_to: [LEDGER] }),
      ];
      // Three rounds, each its own words: back and forth, not round (ADR 0097's addendum of 17
      // October 2026). Still nothing.
      renderShell([
        ...talk,
        said(11, LEDGER, "the night manager signs for it", { addressed_to: [SCOUT] }),
      ]);
      expect(screen.queryAllByTestId("guard")).toEqual([]);
      cleanup();
      // Ledger saying again what it said: going round.
      const third = renderShell([
        ...talk,
        said(11, LEDGER, "on Tuesday at the north dock", { addressed_to: [SCOUT] }),
      ]);
      const guard = screen.getAllByTestId("guard");
      expect(guard).toHaveLength(1);
      expect(guard[0]?.getAttribute("data-stage")).toBe("warning");
      expect(guard[0]?.textContent).toContain(
        "Scout and Ledger have sent each other 6 messages since you last acted, and the last one repeated an earlier one.",
      );
      // In the margin under the fold, as the room's other system lines are; not in a bubble.
      expect(guard[0]?.closest(".chatter-fold")).toBeNull();
      expect(guard[0]?.closest('[data-testid="chatter"]')).toBe(screen.getByTestId("chatter"));
      fireEvent.click(within(guard[0] as HTMLElement).getByRole("button", { name: "Pause them" }));
      expect(third.exchanges).toEqual([{ spaceId: SPACE, state: "paused" }]);
      expect(store.exchanges).toEqual([]);
      expect(screen.queryByTestId("paused-banner")).toBeNull();
    });

    it("says Chips paused the agents under the fold, above the field and on the room's row, and carries on from the banner", () => {
      const store = renderShell([
        ...group(),
        said(5, ARJUN, "sort it out", { addressed_to: [SCOUT, LEDGER] }),
        said(6, SCOUT, "one more question about the dock", { addressed_to: [LEDGER] }),
        said(7, SCOUT, "five", { addressed_to: [], held: true }),
      ]);
      const guard = screen.getByTestId("guard");
      expect(guard.getAttribute("data-stage")).toBe("held");
      expect(guard.textContent).toBe(
        "Chips paused the agents. Scout and Ledger have sent each other 2 messages since you last acted.",
      );
      expect(within(guard).queryByRole("button")).toBeNull();
      const banner = screen.getByTestId("paused-banner");
      expect(banner.textContent).toContain(
        "Chips paused the agents. Scout and Ledger sent each other 2 messages since you last acted.",
      );
      expect(screen.getByTestId("paused").textContent).toBe("Paused");
      fireEvent.click(within(banner).getByRole("button", { name: "Let them carry on" }));
      expect(store.exchanges).toEqual([{ spaceId: SPACE, state: "going" }]);
    });

    it("says the job's spend in the margin at 80%, and at the room's ceiling the banner says it (ADR 0118)", () => {
      const system = { kind: "system", id: "system" };
      const store = renderShell([
        ...group(),
        said(5, ARJUN, "read the trials", { addressed_to: [SCOUT] }),
        fixture("budget.warning", 6, {
          actor: system,
          budget: { limit_usd: 3, spent_usd: 2.41 },
          threshold: 80,
          action: "warn",
          scope: "job",
          since_seq: 5,
        }),
        fixture("exchange.set", 7, {
          actor: system,
          state: "paused",
          why: "spend",
          spend: { ceiling_usd: 3, spent_usd: 3.02, since_seq: 5, uncounted_runs: 0 },
        }),
      ]);
      expect(
        screen.getByText("This job has spent $2.41 of the $3.00 this space allows."),
      ).toBeTruthy();
      const banner = screen.getByTestId("paused-banner");
      expect(banner.textContent).toContain(
        "This job has spent $3.02 of the $3.00 this space allows. The agents start nothing new until somebody lets them carry on.",
      );
      expect(screen.getByTestId("paused").textContent).toBe("Paused");
      fireEvent.click(within(banner).getByRole("button", { name: "Let them carry on" }));
      expect(store.exchanges).toEqual([{ spaceId: SPACE, state: "going" }]);
    });
  });

  it("says who an approval is waiting on, and offers the buttons to nobody else", () => {
    const events = [
      ...group(),
      fixture("run.started", 5),
      fixture("approval.request", 6, { approvers: [DANA] }),
    ];
    // Folded as the store folds it: for Arjun, whose queue this is.
    renderShell(events, { model: buildModel(events, { selfId: ARJUN }) });
    const card = screen.getByRole("article", { name: /Approval/ });
    expect(within(card).getByTestId("waiting-on").textContent).toBe("Waiting on Dana");
    expect(within(card).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("opens a room of people from the sidebar's +, and shows it the moment it comes back", () => {
    // No harness here takes new spaces, so the + makes a room of people, named by the words.
    const store = renderShell([ownerJoined(), ...opened()]);
    fireEvent.click(screen.getByRole("button", { name: "Create new space" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    const field = screen.getByRole("textbox", { name: "Name the space" });
    fireEvent.change(field, { target: { value: "Northwind" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store.createdSpaces).toEqual(["Northwind"]);
    expect(store.askedOf).toEqual([]);

    store.update(
      snapshotOf([
        ...opened(),
        fixture("space.created", 4, {
          actor: person(ARJUN),
          space_id: NEW_SPACE,
          title: "Northwind",
          kind: "group",
        }),
      ]),
    );
    expect(screen.getByRole("main", { name: "Space: Northwind" })).toBeTruthy();
  });

  describe("a new space from the +", () => {
    /** Scout takes new spaces, as the demo's harness declares; Ledger does not. */
    const TAKING: Directory = {
      ...DIRECTORY,
      [SCOUT]: { ...(DIRECTORY[SCOUT] as Participant), capabilities: ["autonomy", "new_spaces"] },
    };
    const BRIEF = "Plan the kitchen remodel: two quotes and a budget";

    /** What comes back from the server for the room asked of Scout: the room, Scout, the words. */
    function askedRoom(): ClientEvent[] {
      const created = fixture("space.created", 4, {
        id: "evt_01K4ZQPX0000000000000000N1",
        actor: person(ARJUN),
        space_id: NEW_SPACE,
        kind: "direct",
        asked_of: SCOUT,
      });
      delete (created as Record<string, unknown>)["title"];
      return [
        ...opened(),
        created,
        fixture("membership.added", 5, {
          id: "evt_01K4ZQPX0000000000000000N2",
          actor: person(ARJUN),
          space_id: NEW_SPACE,
          participant_id: SCOUT,
          participant_kind: "harness",
        }),
        fixture("message.post", 6, {
          id: "evt_01K4ZQPX0000000000000000N3",
          actor: person(ARJUN),
          space_id: NEW_SPACE,
          run_id: undefined,
          text: BRIEF,
        }),
      ];
    }

    /** A room asked of Scout from the + by its name, nothing said in it yet (ADR 0149). */
    function namedRoom(): ClientEvent[] {
      return [
        ...opened(),
        fixture("space.created", 4, {
          id: "evt_01K4ZQPX0000000000000000N1",
          actor: person(ARJUN),
          space_id: NEW_SPACE,
          kind: "direct",
          asked_of: SCOUT,
          title: "Kitchen remodel",
        }),
        fixture("membership.added", 5, {
          id: "evt_01K4ZQPX0000000000000000N2",
          actor: person(ARJUN),
          space_id: NEW_SPACE,
          participant_id: SCOUT,
          participant_kind: "harness",
        }),
      ];
    }

    it("makes an empty room with Empty picked, which opens with Add in front (ADR 0148)", async () => {
      const store = renderShell([ownerJoined(), ...opened()], { directory: TAKING });
      fireEvent.click(screen.getByRole("button", { name: "Create new space" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Empty space" }));
      const field = screen.getByRole("textbox", { name: "Name the space" });
      fireEvent.change(field, { target: { value: "Northwind" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(store.createdSpaces).toEqual(["Northwind"]);
      expect(store.calls).toEqual(["createSpace"]);
      fireEvent.animationEnd(screen.getByTestId("new-space-window"));

      // Back from the server, it opens with nobody in it but you, and its sheet up.
      store.update(
        snapshotOf(
          [
            ...opened(),
            fixture("space.created", 4, {
              id: "evt_01K4ZQPX0000000000000000E1",
              actor: person(ARJUN),
              space_id: NEW_SPACE,
              kind: "group",
              title: "Northwind",
            }),
          ],
          { directory: TAKING },
        ),
      );
      const room = screen.getByRole("main", { name: "Space: Northwind" });
      expect(within(room).getByText("Nobody's here yet")).toBeTruthy();
      // Its sheet comes up on Add, the first thing to pick taking the keyboard.
      const sheet = screen.getByTestId("room-sheet");
      expect(within(sheet).getByRole("heading", { name: "Add to Northwind" })).toBeTruthy();
      expect(sheet.contains(document.activeElement)).toBe(true);

      // Once: put away, then another room and this one again, it opens as any room does.
      fireEvent.click(within(sheet).getByTestId("room-sheet-close"));
      await waitFor(() => expect(screen.queryByTestId("room-sheet")).toBeNull());
      fireEvent.click(within(sidebar()).getByRole("button", { name: /PO-4471/ }));
      fireEvent.click(within(sidebar()).getByRole("button", { name: /Northwind/ }));
      expect(screen.getByRole("main", { name: "Space: Northwind" })).toBeTruthy();
      expect(screen.queryByTestId("room-sheet")).toBeNull();
    });

    it("asks the harness for a room by its name, says nothing, and opens it waiting (ADR 0149)", () => {
      const store = renderShell([ownerJoined(), ...opened()], { directory: TAKING });
      fireEvent.click(screen.getByRole("button", { name: "Create new space" }));
      const field = screen.getByRole("textbox", { name: "Name the space" });
      fireEvent.change(field, { target: { value: "Kitchen remodel" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(store.askedOf).toEqual([SCOUT]);
      expect(store.askedTitles).toEqual(["Kitchen remodel"]);
      expect(store.calls).toEqual(["createSpace", "addMember"]);
      // With a first name held for its agent there (ADR 0150).
      expect(store.membersAdded).toEqual([
        {
          spaceId: NEW_SPACE,
          participantId: SCOUT,
          kind: "harness",
          agentName: expect.stringMatching(/^[A-Z][a-z]{2,5}$/),
        },
      ]);
      expect(store.sent).toEqual([]);
      expect(store.createdSpaces).toEqual([]);
      fireEvent.animationEnd(screen.getByTestId("new-space-window"));
      expect(screen.queryByTestId("new-space-window")).toBeNull();

      // Back from the server, it opens as a room clicked in the rail does, by its name, Scout
      // waiting in it for your first message, on which it makes its agent.
      store.update(snapshotOf(namedRoom(), { directory: TAKING }));
      const room = screen.getByRole("main", { name: "Space: Kitchen remodel" });
      const waiting = within(room).getByTestId("waiting");
      expect(within(waiting).getByRole("heading", { level: 2 }).textContent).toBe(
        "What would you like to do?",
      );
      expect(waiting.textContent).toContain("Scout is here and waits for your first message.");
      expect(within(room).queryByTestId("empty")).toBeNull();
    });

    it("calls the harness waiting in it by the first name held for its agent, its own under it (ADR 0150)", () => {
      const store = renderShell([ownerJoined(), ...opened()], { directory: TAKING });
      fireEvent.click(screen.getByRole("button", { name: "Create new space" }));
      const field = screen.getByRole("textbox", { name: "Name the space" });
      fireEvent.change(field, { target: { value: "Kitchen remodel" } });
      fireEvent.keyDown(field, { key: "Enter" });
      fireEvent.animationEnd(screen.getByTestId("new-space-window"));
      const [added] = namedRoom().slice(-1);
      store.update(
        snapshotOf([...namedRoom().slice(0, -1), { ...added, agent_name: "Milo" } as ClientEvent], {
          directory: TAKING,
        }),
      );
      const room = screen.getByRole("main", { name: "Space: Kitchen remodel" });
      const waiting = within(room).getByTestId("waiting");
      expect(waiting.textContent).toContain("Milo is here and waits for your first message.");
      expect(within(waiting).getByTestId(`waiting-${SCOUT}`).textContent).toBe("MMiloScout");
    });

    it("makes a group of the harnesses picked, asked of the first, all waiting for your first message", () => {
      const both: Directory = {
        ...TAKING,
        [LEDGER]: { ...(DIRECTORY[LEDGER] as Participant), capabilities: ["new_spaces"] },
      };
      const store = renderShell([ownerJoined(), ...opened()], { directory: both });
      fireEvent.click(screen.getByRole("button", { name: "Create new space" }));
      // Ledger is first by name: the first click chooses Scout, the next puts Ledger in beside it.
      fireEvent.click(screen.getByRole("checkbox", { name: "Scout" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Ledger" }));
      const field = screen.getByRole("textbox", { name: "Name the space" });
      fireEvent.change(field, { target: { value: "Offsite" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(store.askedOf).toEqual([SCOUT]);
      expect(store.askedTitles).toEqual(["Offsite"]);
      expect(store.calls).toEqual(["createSpace", "addMember", "addMember"]);
      expect(store.membersAdded.map((each) => each.participantId)).toEqual([SCOUT, LEDGER]);
      expect(store.sent).toEqual([]);

      // The next time, it opens on Scout, who was asked.
      fireEvent.animationEnd(screen.getByTestId("new-space-window"));
      fireEvent.click(screen.getByRole("button", { name: "Create new space" }));
      const checked = (name: string) =>
        (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked;
      expect(checked("Scout")).toBe(true);
      expect(checked("Ledger")).toBe(false);
    });

    it("goes by the name the harness gives it, or its first words when it gives none", () => {
      const store = renderShell(askedRoom(), { directory: TAKING });
      fireEvent.click(within(screen.getByTestId("space-list")).getByText("New space"));
      const claimed = fixture("space.claimed", 7, { space_id: NEW_SPACE });
      store.update(snapshotOf([...askedRoom(), claimed], { directory: TAKING }));
      expect(screen.getByRole("main", { name: "Space: Kitchen remodel" })).toBeTruthy();
      expect(within(screen.getByTestId("space-list")).getByText("Kitchen remodel")).toBeTruthy();

      delete (claimed as Record<string, unknown>)["title"];
      store.update(snapshotOf([...askedRoom(), claimed], { directory: TAKING }));
      expect(screen.getByRole("main", { name: `Space: ${BRIEF}` })).toBeTruthy();
    });

    it("offers to delete the room before the harness has claimed it", async () => {
      const store = renderShell(askedRoom(), { directory: TAKING });
      fireEvent.click(within(screen.getByTestId("space-list")).getByText("New space"));
      fireEvent.click(within(openSheet()).getByTestId("delete-space"));
      const dialog = screen.getByTestId("confirm-dialog");
      expect(within(dialog).getByRole("heading").textContent).toBe("Delete New space?");
      fireEvent.click(within(dialog).getByTestId("confirm-go"));
      await waitFor(() => expect(store.erased).toEqual([NEW_SPACE]));
    });

    it("calls a search hit in the room what the room is called", async () => {
      const store = renderShell(askedRoom(), { directory: TAKING });
      store.found = {
        hits: [
          {
            kind: "message",
            spaceId: NEW_SPACE,
            at: "2026-09-24T09:00:00.000Z",
            snippet: "Plan the \u{E000}kitchen\u{E001} remodel",
            lineId: "evt_01K4ZQPX0000000000000000N3",
            authorId: ARJUN,
          },
        ],
        nextCursor: null,
      };
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
        target: { value: "kitchen" },
      });
      const hit = await screen.findByTestId("search-hit");
      expect(hit.textContent).toContain("in New space");
    });

    it("keeps unsent words for the next time, and opens empty after a send", () => {
      renderShell([ownerJoined(), ...opened()], { directory: TAKING });
      const plus = screen.getByRole("button", { name: "Create new space" });
      fireEvent.click(plus);
      fireEvent.change(screen.getByRole("textbox", { name: "Name the space" }), {
        target: { value: "Half a thought" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      fireEvent.animationEnd(screen.getByTestId("new-space-window"));
      fireEvent.click(plus);
      const field = screen.getByRole("textbox", { name: "Name the space" });
      expect((field as HTMLTextAreaElement).value).toBe("Half a thought");
      fireEvent.keyDown(field, { key: "Enter" });
      fireEvent.animationEnd(screen.getByTestId("new-space-window"));
      fireEvent.click(plus);
      const next = screen.getByRole("textbox", { name: "Name the space" });
      expect((next as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("keeps the closed spaces behind one row that says how many, until it is pressed", () => {
    // Scout put a room away — what Jacobian does with an archived Space — and it is the newer.
    renderShell([
      ...opened(),
      fixture("space.created", 4, {
        actor: harness(SCOUT),
        space_id: "spc_away",
        title: "Yosemite 2026",
      }),
      fixture("space.updated", 5, {
        actor: harness(SCOUT),
        space_id: "spc_away",
        title: undefined,
        state: "closed",
      }),
    ]);
    // The room on screen is the open one, not the closed one that happens to be more recent.
    expect(screen.getByRole("main", { name: "Space: PO-4471" })).toBeTruthy();
    const row = screen.getByRole("button", { name: "Archived \u00b7 1" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("archived-list")).toBeNull();
    expect(screen.queryByText("Yosemite 2026")).toBeNull();

    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByTestId("archived-list")).getByText("Yosemite 2026")).toBeTruthy();

    // Opened from there it stays in sight, and the person's word still puts them away.
    fireEvent.click(within(screen.getByTestId("archived-list")).getByText("Yosemite 2026"));
    expect(screen.getByRole("main", { name: "Space: Yosemite 2026" })).toBeTruthy();
    fireEvent.click(row);
    expect(screen.queryByTestId("archived-list")).toBeNull();
  });

  it("hides a room from its sheet, and the rail keeps it under Hidden (ADR 0205)", async () => {
    const store = renderShell(opened());
    expect(screen.queryByTestId("hidden-toggle")).toBeNull();
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("hide-space"));
    await waitFor(() => expect(store.hiddenSet).toEqual([{ spaceId: SPACE, hidden: true }]));
    // Open while it is the room on screen, as Archived is, and the row wears the shut eye.
    const toggle = within(sidebar()).getByRole("button", { name: "Hidden \u00b7 1" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const row = within(screen.getByTestId("hidden-list")).getByText("PO-4471").closest("button");
    expect(row?.getAttribute("data-hidden")).toBe("true");
    expect(within(row as HTMLElement).getByRole("img", { name: "Hidden" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("hidden-list")).toBeNull();
  });

  it("offers Unhide on a hidden room's sheet, which stays up", async () => {
    const store = renderShell(opened(), { hiddenSpaces: new Set([SPACE]) });
    const sheet = openSheet();
    expect(within(sheet).queryByTestId("hide-space")).toBeNull();
    fireEvent.click(within(sheet).getByTestId("unhide-space"));
    await waitFor(() => expect(store.hiddenSet).toEqual([{ spaceId: SPACE, hidden: false }]));
    expect(screen.getByTestId("room-sheet")).toBeTruthy();
    expect(screen.queryByTestId("hidden-toggle")).toBeNull();
  });

  it("pins a room from its sheet to the top of the rail, with a pin before its time (ADR 0240)", async () => {
    const store = renderShell([
      ...opened(),
      fixture("space.created", 4, {
        actor: harness(SCOUT),
        space_id: "spc_newer",
        title: "Yosemite 2026",
      }),
    ]);
    const titles = () =>
      within(screen.getByTestId("space-list"))
        .getAllByRole("button")
        .map((row) => row.querySelector("b")?.textContent);
    // The newer room stands first until the older one is pinned.
    expect(titles()).toEqual(["Yosemite 2026", "PO-4471"]);
    fireEvent.click(within(screen.getByTestId("space-list")).getByText("PO-4471"));
    const sheet = openSheet();
    expect(within(sheet).queryByTestId("unpin-space")).toBeNull();
    fireEvent.click(within(sheet).getByTestId("pin-space"));
    await waitFor(() => expect(store.pinnedSet).toEqual([{ spaceId: SPACE, pinned: true }]));
    await waitFor(() => expect(titles()).toEqual(["PO-4471", "Yosemite 2026"]));
    const row = within(screen.getByTestId("space-list")).getByText("PO-4471").closest("button");
    expect(within(row as HTMLElement).getByRole("img", { name: "Pinned" })).toBeTruthy();
    // Pinned, the sheet stays, and offers Unpin.
    expect(within(screen.getByTestId("room-sheet")).getByTestId("unpin-space")).toBeTruthy();
  });

  it("offers Unpin on a pinned room's sheet, and no Pin on a hidden one", async () => {
    const store = renderShell(opened(), { pinnedSpaces: [SPACE] });
    fireEvent.click(within(openSheet()).getByTestId("unpin-space"));
    await waitFor(() => expect(store.pinnedSet).toEqual([{ spaceId: SPACE, pinned: false }]));
  });

  it("offers no Pin on a hidden room's sheet, which keeps its pin for later", () => {
    renderShell(opened(), { pinnedSpaces: [SPACE], hiddenSpaces: new Set([SPACE]) });
    const sheet = openSheet();
    expect(within(sheet).queryByTestId("pin-space")).toBeNull();
    expect(within(sheet).queryByTestId("unpin-space")).toBeNull();
  });

  it("lists an archived space under Archived, says so in the room, and unarchives it", () => {
    const closing = fixture("space.updated", 4, { actor: person(ARJUN), state: "closed" });
    delete (closing as Record<string, unknown>)["title"];
    const store = renderShell([...opened(), closing]);
    expect(within(screen.getByTestId("archived-list")).getByText("PO-4471")).toBeTruthy();
    expect(screen.getByTestId("archived")).toBeTruthy();
    expect(
      within(screen.getByTestId("messages")).getByText(/archived this space/).textContent,
    ).toContain("Arjun");

    fireEvent.click(screen.getByRole("button", { name: /^\d+ members?$/ }));
    fireEvent.click(screen.getByTestId("unarchive-space"));
    expect(store.spaceUpdates).toEqual([{ spaceId: SPACE, state: "open" }]);
  });

  it("takes the room's commands from the composer, by name", () => {
    const store = fakeStore(snapshotOf(group(), { directory: WIDER }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const type = (line: string) => {
      fireEvent.change(screen.getByRole("textbox", { name: /Message/ }), {
        target: { value: line },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    };
    type("/add @Hermes");
    type("/remove ledger");
    type("/title Northwind quotes");
    expect(store.membersAdded).toEqual([
      { spaceId: SPACE, participantId: HERMES, kind: "harness" },
    ]);
    expect(store.membersRemoved).toEqual([{ spaceId: SPACE, participantId: LEDGER }]);
    expect(store.spaceUpdates).toEqual([{ spaceId: SPACE, title: "Northwind quotes" }]);

    type("/add @nobody");
    expect(screen.getByTestId("notice").textContent).toContain("Nobody called nobody");
    type("/add Scout");
    expect(screen.getByTestId("notice").textContent).toContain("Scout is already in this space");
    type("/reopen");
    expect(screen.getByTestId("notice").textContent).toContain("This space is not archived");
  });
});

describe("the room's files (ADR 0100)", () => {
  /** One of the room's files at one of its versions, as the store hands them over. */
  function version(
    name: string,
    n: number,
    mimeType: string,
    by: string,
    extra: Partial<RoomFileOf["attachment"]> = {},
  ): RoomFileOf {
    return {
      name,
      version: n,
      attachment: {
        id: `att_01K4ZQPX0000000000000${name.length}${n}0`,
        filename: name,
        mimeType,
        byteSize: 100 * n,
        ...extra,
      },
      by,
      byName: DIRECTORY[by]?.displayName ?? by,
      at: `2026-10-02T18:${String(10 + n).padStart(2, "0")}:00.000Z`,
    };
  }

  /** The room's sheet, turned to Media & files from the card on its first page (ADR 0202). */
  function openFiles(store: FakeStore): HTMLElement {
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-media"));
    return sheet;
  }

  it("lists them under Media & files newest first, without a voice note or a picked photo", async () => {
    const store = fakeStore(snapshotOf(opened()));
    store.files = [
      version("gallery.html", 2, "text/html", SCOUT),
      version("voice-note-1002-2336.m4a", 1, "audio/mp4", ARJUN),
      version("image.png", 4, "image/png", SCOUT),
      version("notes.md", 1, "text/markdown", ARJUN),
    ];
    const panel = openFiles(store);
    const files = await within(panel).findByTestId("room-files");
    const rows = within(files).getAllByTestId("room-file");
    expect(rows.map((row) => row.getAttribute("data-name"))).toEqual(["gallery.html", "notes.md"]);
    expect(rows[0]?.textContent).toContain("by Scout");
    expect(rows[1]?.textContent).toContain("by you");
    expect(within(files).getAllByRole("button", { name: /^Versions of/ })).toHaveLength(1);
    expect(store.filesRead).toEqual([SPACE]);
  });

  it("says None yet on the card, and that there is nothing on its page, in a room with no files", async () => {
    const store = fakeStore(snapshotOf(opened()));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    const card = within(sheet).getByTestId("room-sheet-media");
    expect(await within(card).findByText("None yet")).toBeTruthy();
    expect(within(card).queryByTestId("room-sheet-media-strip")).toBeNull();
    expect(store.filesRead).toEqual([SPACE]);
    fireEvent.click(card);
    expect(within(sheet).getByText("Nothing has been sent here yet.")).toBeTruthy();
    expect(within(sheet).getByText("No files yet.")).toBeTruthy();
    expect(within(sheet).queryByTestId("room-files")).toBeNull();
  });

  it("says on the card how many files there are, with a square for them", async () => {
    const store = fakeStore(snapshotOf(opened()));
    store.files = [
      version("gallery.html", 2, "text/html", SCOUT),
      version("notes.md", 1, "text/markdown", ARJUN),
    ];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const card = within(openSheet()).getByTestId("room-sheet-media");
    expect(await within(card).findByText("2 files")).toBeTruthy();
    expect(card.getAttribute("aria-label")).toBe("Media and files, 2 files");
    expect(within(card).getByTestId("room-sheet-media-strip").textContent).toBe("2");
  });

  it("unfolds a file's versions newest first, the current marked, and opens an older page in a frame", async () => {
    const store = fakeStore(snapshotOf(opened()));
    const v2 = version("gallery.html", 2, "text/html", SCOUT);
    const v1 = version("gallery.html", 1, "text/html", ARJUN);
    store.files = [v2];
    store.versions.set("gallery.html", [v2, v1]);
    const panel = openFiles(store);
    const toggle = await within(panel).findByRole("button", { name: "Versions of gallery.html" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-expanded")).toBe("true"));
    const older = within(panel).getAllByTestId("room-file-version");
    expect(older.map((each) => each.getAttribute("aria-label"))).toEqual([
      "Open gallery.html, version 2",
      "Open gallery.html, version 1",
    ]);
    expect(older[0]?.textContent).toContain("Current");
    expect(older[1]?.textContent).not.toContain("Current");

    fireEvent.click(older[1] as HTMLElement);
    const frame = await screen.findByTestId("page-view");
    // Loaded from the page door for the version it was opened for (ADR 0201).
    expect(frame.getAttribute("src")).toBe(`/v1/pages/ticket-for-${v1.attachment.id}`);
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    const pageView = screen.getByTestId("page-view-dialog");
    expect(pageView.textContent).toContain("v1 · by you");
    // The page's own Close, not the sheet's X behind it.
    fireEvent.click(within(pageView).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("page-view")).toBeNull();
  });

  it("opens a photo in the viewer on a deck of its versions, on the one clicked", async () => {
    const store = fakeStore(snapshotOf(opened()));
    const shape = { width: 1200, height: 800 };
    const v2 = version("preview.png", 2, "image/png", SCOUT, shape);
    store.files = [v2];
    store.versions.set("preview.png", [v2, version("preview.png", 1, "image/png", SCOUT, shape)]);
    const panel = openFiles(store);
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Open preview.png, version 2" }),
    );
    expect((await screen.findByTestId("viewer-count")).textContent).toBe("2 of 2");
  });

  it("reads them again when a line carrying a file lands, and not for any other line", async () => {
    const events = opened();
    const store = fakeStore(snapshotOf(events));
    openFiles(store);
    await waitFor(() => expect(store.filesRead).toHaveLength(1));
    store.update(snapshotOf([...events, fixture("message.post", 20)]));
    store.update(
      snapshotOf([
        ...events,
        fixture("message.post", 20),
        fixture("message.post", 21, { attachments: [PDF] }),
      ]),
    );
    await waitFor(() => expect(store.filesRead).toHaveLength(2));
  });
});

describe("the room sheet's first page in tiles (ADR 0202's addendum)", () => {
  /** Ten photos, each in a message of its own, the last the newest. */
  function photos(): ClientEvent[] {
    return Array.from({ length: 10 }, (_, at) =>
      fixture("message.post", 20 + at, {
        attachments: [
          {
            ...PHOTO,
            attachment_id: `att_01K4ZQPX00000000000000010${at}`,
            filename: `dune-${at}.png`,
          },
        ],
      }),
    );
  }

  it("puts the room's face beside its name, Add on In this room's heading, and Leave last in who is here", () => {
    const store = fakeStore(
      snapshotOf(
        [
          ...opened(),
          fixture("membership.added", 4, {
            actor: person(ARJUN),
            participant_id: LEDGER,
            participant_kind: "harness",
          }),
        ],
        { directory: DIRECTORY },
      ),
    );
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    const face = within(sheet).getByTestId("room-sheet-icon");
    expect(face.querySelector('.ui-avatar[data-size="lg"]')).toBeTruthy();
    expect(face.nextElementSibling?.textContent).toContain("PO-4471");
    // How many are here, as listed, and Add at its right; the full-width Add is gone.
    const heading = within(sheet).getByRole("heading", { name: "In this space" });
    expect(heading.parentElement?.textContent).toBe("In this space4Add");
    expect(within(sheet).getByRole("button", { name: "Add agents or people" })).toBeTruthy();
    // Leave is the members' last row, in the list that scrolls; the foot keeps Archive and Done.
    const members = within(sheet).getByTestId("room-sheet-members");
    const leave = within(members).getByTestId("leave-space");
    expect(leave.textContent).toBe("Leave PO-4471");
    expect(leave.closest("li")?.nextElementSibling).toBeNull();
    const foot = within(sheet).getByTestId("archive-space").parentElement as HTMLElement;
    expect(within(foot).queryByTestId("leave-space")).toBeNull();
    expect(within(foot).getByTestId("archive-space")).toBeTruthy();
  });

  it("shows the newest five and the files' square on Media & files, and its page the newest eight, See all the rest", async () => {
    const store = fakeStore(snapshotOf([...opened(), ...photos()]));
    store.files = [
      {
        name: "notes.md",
        version: 1,
        attachment: {
          id: "att_01K4ZQPX0000000000000NOTES",
          filename: "notes.md",
          mimeType: "text/markdown",
          byteSize: 100,
        },
        by: ARJUN,
        byName: "Arjun",
        at: "2026-10-02T18:11:00.000Z",
      },
    ];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    const card = within(sheet).getByTestId("room-sheet-media");
    expect(await within(card).findByText("10 · 1 file")).toBeTruthy();
    const strip = within(card).getByTestId("room-sheet-media-strip");
    expect(strip.children).toHaveLength(6);
    expect(strip.lastElementChild?.textContent).toBe("1");

    fireEvent.click(card);
    const grid = within(sheet).getByTestId("room-media");
    // The newest first, eight of them, the eighth saying how many more and opening them.
    expect(
      within(grid)
        .getAllByRole("button")
        .map((cell) => cell.getAttribute("aria-label")),
    ).toEqual([
      ...[9, 8, 7, 6, 5, 4, 3].map((at) => `Open dune-${at}.png`),
      "See all media, 2 more",
    ]);
    expect(within(sheet).getByTestId("room-media-more").textContent).toBe("+2");
    fireEvent.click(within(sheet).getByTestId("room-media-all"));
    expect(within(grid).getAllByRole("button")).toHaveLength(10);
    expect(within(sheet).queryByTestId("room-media-all")).toBeNull();
    // The files under it, as Files listed them.
    expect(await within(sheet).findByTestId("room-files")).toBeTruthy();

    // A photo opens the viewer on the room's every one, on the one clicked, newest first as the
    // page lists them (Arjun, 19 October 2026: oldest first, the viewer ran against the page).
    fireEvent.click(within(grid).getByRole("button", { name: "Open dune-9.png" }));
    expect((await screen.findByTestId("viewer-count")).textContent).toBe("1 of 10");
  });

  it("draws Lead, Spend per job and Lock changes as tiles, the spend's bar in its stage", async () => {
    const TREE = "agt_01K4ZQPX0000000000000TREE";
    const agents: Directory = {
      ...DIRECTORY,
      [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
    };
    const room = [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
      fixture("person.joined", 5, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
    ];
    render(
      <Shell
        store={fakeStore(snapshotOf(room, { directory: agents }))}
        device={DEVICE}
        files={fakeFiles()}
      />,
    );
    const sheet = openSheet();
    const lead = within(sheet).getByTestId("room-sheet-lead");
    expect(
      [...(lead.parentElement?.children ?? [])].map((tile) => tile.getAttribute("data-testid")),
    ).toEqual(["room-sheet-lead", "room-sheet-spend", "room-sheet-lock"]);
    expect(lead.getAttribute("aria-label")).toBe("Lead, Nobody");
    const spend = within(sheet).getByTestId("room-sheet-spend");
    const bar = await within(spend).findByTestId("room-sheet-spend-bar");
    expect(spend.textContent).toContain("$1.23 of $3.00");
    expect(spend.getAttribute("aria-label")).toBe("Spend per job, $3.00, This job so far: $1.23");
    expect(bar.dataset["stage"]).toBe("within");
    expect(bar.style.width).toBe("41%");
  });
});

describe("You (ADR 0034)", () => {
  /** The demo people with roles folded in: Arjun the owner, Dana a member. */
  function withPeople(): ClientEvent[] {
    return [
      fixture("person.joined", 1, {
        participant_id: ARJUN,
        display_name: "Arjun",
        role: "owner",
        invite_id: undefined,
        invited_by: undefined,
        actor: person(ARJUN),
      }),
      fixture("person.joined", 2),
      ...opened().map((event, index) => ({ ...event, seq: index + 3 })),
    ];
  }

  async function openYou(store: FakeStore) {
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
  }

  /** A row of You's opened: its page beside the list, or its form over it (ADR 0265). */
  async function openRow(row: string, inside: string): Promise<HTMLElement> {
    fireEvent.click(await screen.findByTestId(row));
    return screen.findByTestId(inside);
  }

  it("says who you are and your role, and lists your devices (ADR 0085)", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    expect(screen.getByTestId("my-role").textContent).toBe("Owner · This workspace");
    expect(screen.getByTestId("sign-out").textContent).toBe("Sign out of this browser");
    const devices = await screen.findAllByTestId("device-row");
    expect(devices).toHaveLength(2);
    expect(devices[0]?.getAttribute("data-current")).toBe("true");
    expect(devices[0]?.textContent).toContain("This one");
    // The current device is not signed out from here; another is.
    expect(
      within(devices[0] as HTMLElement).queryByRole("button", { name: /^Sign out/ }),
    ).toBeNull();
    fireEvent.click(within(devices[1] as HTMLElement).getByRole("button", { name: /^Sign out/ }));
    await waitFor(() => expect(store.devicesRevoked).toEqual(["dev_01K4ZQPX0000000000000000E2"]));
  });

  it("changes the name you go by where it is shown, and says why when the server will not (ADR 0082)", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    const field = screen.getByRole("textbox", { name: "Your name" }) as HTMLInputElement;
    expect(field.value).toBe("Arjun");

    fireEvent.change(field, { target: { value: "Scout" } });
    fireEvent.submit(field);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "An agent here goes by Scout already.",
    );
    expect(field.value).toBe("Scout");
    // Leaving the field does not send the refused name again.
    fireEvent.blur(field);

    fireEvent.change(field, { target: { value: "Arjun G" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.blur(field);
    await waitFor(() => expect(store.renamed).toEqual(["Scout", "Arjun G"]));

    // Escape puts back what the directory says, and sends nothing.
    fireEvent.change(field, { target: { value: "Someone else" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(field.value).toBe("Arjun");
    expect(store.renamed).toEqual(["Scout", "Arjun G"]);
  });

  it("names the workspace again from its heading, an owner's, and calls it by the hello's word (ADR 0194)", async () => {
    const store = fakeStore({ ...snapshotOf(withPeople()), workspaceName: "Demo" });
    await openYou(store);
    expect(screen.getByRole("heading", { name: "Demo" })).toBeTruthy();
    const form = await openRow("you-workspace", "workspace-form");
    const field = within(form).getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
    expect(field.value).toBe("Demo");
    fireEvent.change(field, { target: { value: "Primal" } });
    fireEvent.submit(field);
    await waitFor(() => expect(store.workspaceNames).toEqual(["Primal"]));
  });

  it("says what may be attached, and an owner caps it in megabytes (ADR 0047)", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    await waitFor(() => expect(screen.getByTestId("caps-row").textContent).toContain("100 MB"));
    let section = await openRow("caps-row", "attachment-caps");
    await waitFor(() =>
      expect(within(section).getByTestId("caps-words").textContent).toBe(
        "Photos up to the server's 100 MB, videos up to the server's 100 MB, and files up to the server's 100 MB. Blank is the server's own limit.",
      ),
    );
    fireEvent.change(within(section).getByLabelText("Photos"), { target: { value: "25" } });
    fireEvent.change(within(section).getByLabelText("Files"), { target: { value: "50" } });
    fireEvent.click(within(section).getByTestId("attachment-caps-save"));
    expect(store.capsSet).toEqual([{ image: 26_214_400, video: null, file: 52_428_800 }]);

    // A cap above what the server takes is refused here, with the server's own sentence.
    section = await openRow("caps-row", "attachment-caps");
    fireEvent.change(within(section).getByLabelText("Videos"), { target: { value: "200" } });
    fireEvent.click(within(section).getByTestId("attachment-caps-save"));
    expect(within(section).getByRole("alert").textContent).toBe(
      "A cap of 200 MB on videos is more than this server takes (100 MB).",
    );
    expect(store.capsSet).toHaveLength(1);

    // And so is something that is not a number of megabytes at all.
    fireEvent.change(within(section).getByLabelText("Videos"), { target: { value: "-3" } });
    fireEvent.click(within(section).getByTestId("attachment-caps-save"));
    expect(within(section).getByRole("alert").textContent).toBe(
      "A cap on videos is a number of megabytes, or blank for the server's limit.",
    );
    expect(store.capsSet).toHaveLength(1);
  });

  it("shows a member no attachment limits: they are the workspace's, set by its admins (ADR 0085)", async () => {
    const store = fakeStore(
      snapshotOf([
        ...withPeople(),
        fixture("attachment.limits_set", 30, {
          image_bytes: 26_214_400,
          video_bytes: null,
          file_bytes: null,
        }),
      ]),
    );
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    render(<Shell store={store} device={asDana} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    expect(screen.queryByTestId("caps-row")).toBeNull();
    expect(screen.queryByRole("heading", { name: "This workspace" })).toBeNull();
  });

  it("issues a code for another device, with the QR a phone reads (M4.1)", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    await openRow("issue-code", "pair-form");
    await waitFor(() => expect(screen.getByTestId("pairing-code").textContent).toBe("QRS-789"));
    const link = screen.getByTestId("pairing-link").textContent ?? "";
    // Addressed where the server says it is, not where this page was served from: the phone
    // reading the QR cannot reach jsdom's origin, and would not want to.
    expect(link).toContain(
      "http://192.168.1.20:4431/#pair=QRS-789&v=1&relay=wss%3A%2F%2Frelay.example&key=",
    );
    expect(screen.getByTestId("issued-code").textContent).toContain("through relay.example");
    await waitFor(() => expect(screen.getByRole("img", { name: /A QR code/ })).toBeDefined());
  });

  it("falls back to this page's own address when the server does not say where it is", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    store.pairingServerUrl = undefined;
    await openYou(store);
    await openRow("issue-code", "pair-form");
    await waitFor(() => expect(screen.getByTestId("pairing-code").textContent).toBe("QRS-789"));
    const link = screen.getByTestId("pairing-link").textContent ?? "";
    expect(link).toContain(`${location.origin}/#pair=QRS-789`);
  });

  it("lets an owner change a role, asking first, but not demote the last owner, and make an invite", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    await openRow("people-row", "people");
    const rows = await screen.findAllByTestId("person-row");
    expect(rows.map((row) => row.getAttribute("data-role"))).toEqual(["owner", "member"]);
    // Arjun is the only owner: his page offers no other role.
    fireEvent.click(rows[0] as HTMLElement);
    expect(within(screen.getByTestId("person-details")).queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "‹ People" }));
    fireEvent.click(screen.getAllByTestId("person-row")[1] as HTMLElement);
    const danasRole = within(screen.getByTestId("person-details")).getByRole("combobox", {
      name: "Dana's role",
    });
    fireEvent.change(danasRole, { target: { value: "admin" } });
    // It asks first, saying what an admin may do, and nothing changes until it is answered.
    const asking = await screen.findByRole("dialog");
    expect(within(asking).getByRole("heading").textContent).toBe("Make Dana an admin?");
    expect(store.roleChanges).toEqual([]);
    fireEvent.click(within(asking).getByRole("button", { name: "Make admin" }));
    await waitFor(() =>
      expect(store.roleChanges).toEqual([{ participantId: DANA, role: "admin" }]),
    );

    await openRow("invite-someone", "invites");
    fireEvent.change(screen.getByRole("combobox", { name: "Invite role" }), {
      target: { value: "guest" },
    });
    expect(screen.getByTestId("invite-role-means").textContent).toBe(
      "A guest in no space sees nobody until somebody adds them to one.",
    );
    expect(screen.queryByRole("combobox", { name: "Invite lasts" })).toBeNull();
    expect(screen.getByTestId("invite-uses-means").textContent).toBe(
      "The first person to join by it uses it up. Unused, it stops working after 30 minutes.",
    );
    fireEvent.click(screen.getByTestId("make-invite"));
    await waitFor(() =>
      expect(screen.getByTestId("invite-url").textContent).toContain("#invite=chips_inv_test"),
    );
    expect(store.invitesMade).toEqual([{ role: "guest", singleUse: true }]);
    // The open invite the store lists can be withdrawn.
    const invite = await screen.findByTestId("invite-row");
    fireEvent.click(within(invite).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(store.invitesRevoked).toEqual(["inv_01K4ZQPX0000000000000000D1"]));
  });

  it("draws no passkeys where one cannot work: jsdom has no WebAuthn (ADR 0085)", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    await screen.findAllByTestId("device-row");
    expect(screen.queryByTestId("passkeys")).toBeNull();
  });

  it("knows where a passkey can work: a browser, on a secure name, not an IP", () => {
    const at = (hostname: string, over: Record<string, unknown> = {}) =>
      ({
        PublicKeyCredential: class {},
        navigator: { credentials: {} },
        isSecureContext: true,
        location: { hostname },
        ...over,
      }) as unknown as typeof globalThis;
    expect(passkeysWorkHere(at("localhost"))).toBe(true);
    expect(passkeysWorkHere(at("chips.example.com"))).toBe(true);
    expect(passkeysWorkHere(at("127.0.0.1"))).toBe(false);
    expect(passkeysWorkHere(at("192.168.1.20"))).toBe(false);
    expect(passkeysWorkHere(at("[::1]"))).toBe(false);
    expect(passkeysWorkHere(at("chips.local", { isSecureContext: false }))).toBe(false);
    expect(passkeysWorkHere(at("localhost", { PublicKeyCredential: undefined }))).toBe(false);
    expect(passkeysWorkHere(at("localhost", { __TAURI_INTERNALS__: {} }))).toBe(false);
  });

  it("names the server and the build under This browser", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    await openYou(store);
    expect(screen.getByTestId("about-server").textContent).toBe(`Server ${location.host}`);
    expect(screen.getByTestId("build").textContent).toMatch(/^Version \S+ · \S+$/);
  });

  it("keeps a failure on screen through the next refresh, until a change goes through", async () => {
    const store: FakeStore = {
      ...fakeStore(snapshotOf(withPeople())),
      revokeDevice: async () => {
        throw new Error("The server is away.");
      },
    };
    await openYou(store);
    const devices = await screen.findAllByTestId("device-row");
    fireEvent.click(within(devices[1] as HTMLElement).getByRole("button", { name: /^Sign out/ }));
    const alert = await within(screen.getByTestId("devices")).findByRole("alert");
    expect(alert.textContent).toBe("The server is away.");
    // A new snapshot re-renders the shell; the reason is still there.
    act(() => store.update(snapshotOf(withPeople())));
    expect(within(screen.getByTestId("devices")).getByRole("alert").textContent).toBe(
      "The server is away.",
    );
  });

  it("lets an owner hand a harness to another person from its Owner page (M5.2, ADR 0273)", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    openHarnesses();
    const card = await screen.findByRole("region", { name: "Scout" });
    expect(within(card).getByTestId("harness-owner-row").textContent).toMatch(/You/);
    const page = openDeskPart("harness-owner-row", "Owner");
    expect(within(page).getByTestId(`owner-${ARJUN}`).getAttribute("aria-current")).toBe("true");
    // Choosing who owns it already asks nothing.
    fireEvent.click(within(page).getByTestId(`owner-${ARJUN}`));
    fireEvent.click(within(page).getByTestId(`owner-${DANA}`));
    await waitFor(() => expect(store.transfers).toEqual([[SCOUT, DANA]]));
  });

  it("tells a member who owns a harness, and offers no Owner page and no switches (ADR 0273)", async () => {
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    // A member sees a harness by its agent in their room (ADR 0034's addendum).
    const directory: Directory = {
      ...DIRECTORY,
      agt_Ada: { id: "agt_Ada", kind: "agent", displayName: "Ada", harnessId: SCOUT },
    };
    const events = [
      ...withPeople(),
      fixture("membership.added", 6, {
        actor: person(ARJUN),
        participant_id: "agt_Ada",
        participant_kind: "agent",
      }),
    ];
    const store = fakeStore(snapshotOf(events, { directory }));
    render(<Shell store={store} device={asDana} files={fakeFiles()} />);
    openHarnesses();
    const card = await screen.findByRole("region", { name: "Scout" });
    const owner = within(card).getByTestId("harness-owner-row");
    expect(owner.textContent).toMatch(/Arjun/);
    expect(owner.closest("button")).toBeNull();
    expect(within(card).queryByTestId("harness-may-row")).toBeNull();
    expect(within(card).getByTestId("harness-sends-row")).toBeTruthy();
  });

  it("shows a member neither the people nor the invites", async () => {
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const store = fakeStore(snapshotOf(withPeople()));
    render(<Shell store={store} device={asDana} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    expect(screen.getByTestId("my-role").textContent).toMatch(/^Member/);
    expect(screen.queryByTestId("people-row")).toBeNull();
    expect(screen.queryByTestId("invite-someone")).toBeNull();
    expect(screen.queryByTestId("connect-harness")).toBeNull();
  });

  it("shows an admin the people, and no invites: only an owner invites (ADR 0034's addendum)", async () => {
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const events = withPeople().map((event) =>
      event.type === "person.joined" && event["participant_id"] === DANA
        ? { ...event, role: "admin" }
        : event,
    );
    const store = fakeStore(snapshotOf(events));
    render(<Shell store={store} device={asDana} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    expect(screen.getByTestId("my-role").textContent).toBe("Admin · This workspace");
    expect(screen.getByTestId("people-row")).toBeTruthy();
    expect(screen.queryByTestId("invite-someone")).toBeNull();
  });

  it("signs out: the device is withdrawn at the server and the app is told to forget it", async () => {
    const store = fakeStore(snapshotOf(withPeople()));
    const signedOut = vi.fn();
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} onSignOut={signedOut} />);
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    fireEvent.click(screen.getByTestId("sign-out"));
    await waitFor(() => expect(signedOut).toHaveBeenCalled());
    expect(store.devicesRevoked).toEqual([DEVICE.deviceId]);
  });
});

describe("several workspaces (M5.3)", () => {
  it("names the one in front, and lists them all under it with what waits and who is muted", async () => {
    const store = fakeStore(snapshotOf(opened()));
    const { unmount } = render(
      <Shell
        store={store}
        device={DEVICE}
        files={fakeFiles()}
        workspaces={[{ deviceId: DEVICE.deviceId, label: "Home", current: true, muted: false }]}
        onSwitch={() => undefined}
      />,
    );
    expect(screen.getByTestId("workspace-name").textContent).toBe("Home");
    // One workspace has a menu too, as the phone's name does: it is where the film is (ADR 0264).
    expect(menuRows(await openWorkspaces())).toEqual(["Home"]);
    unmount();

    const switched = vi.fn();
    render(
      <Shell
        store={store}
        device={DEVICE}
        files={fakeFiles()}
        workspaces={[
          { deviceId: DEVICE.deviceId, label: "Home", current: true, muted: false },
          { deviceId: "dev_2", label: "Northwind", current: false, muted: false, needsYou: 2 },
          { deviceId: "dev_3", label: "Quiet", current: false, muted: true },
        ]}
        onSwitch={switched}
      />,
    );
    const menu = await openWorkspaces();
    expect(menuRows(menu)).toEqual(["Home", "Northwind", "Quiet"]);
    expect(within(menu).getByRole("menuitemradio", { checked: true }).textContent).toContain(
      "Home",
    );
    expect(within(menu).getByTestId("workspace-dev_2").textContent).toContain("2 waiting");
    expect(within(menu).getByTestId("workspace-dev_3").textContent).toContain(
      "Notifications off here",
    );
    fireEvent.click(within(menu).getByTestId("workspace-dev_2"));
    expect(switched).toHaveBeenCalledWith("dev_2");
    expect(screen.queryByRole("menu", { name: "Workspaces" })).toBeNull();
  });

  it("offers to pair another server where the shell can, and mutes a workspace from You", async () => {
    const store = fakeStore(snapshotOf(opened()));
    const pairAnother = vi.fn();
    const muted = vi.fn();
    render(
      <Shell
        store={store}
        device={DEVICE}
        files={fakeFiles()}
        workspaces={[{ deviceId: DEVICE.deviceId, label: "Home", current: true, muted: false }]}
        onSwitch={() => undefined}
        onPairAnother={pairAnother}
        onMute={muted}
      />,
    );
    await chooseInWorkspaces("Join another workspace");
    expect(pairAnother).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    const toggle = within(screen.getByTestId("mute")).getByRole("switch");
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    expect(muted).toHaveBeenCalledWith(DEVICE.deviceId, true);
  });

  it("offers Watch Chips work in the switcher of a workspace set up with no demo, and no Remove (ADR 0213)", async () => {
    const store = fakeStore(snapshotOf(opened()));
    const watch = vi.fn();
    render(
      <Shell
        store={store}
        device={DEVICE}
        files={fakeFiles()}
        workspaces={[{ deviceId: DEVICE.deviceId, label: "Home", current: true, muted: false }]}
        onSwitch={() => undefined}
        onPairAnother={() => undefined}
        onWatchDemo={watch}
        onRemoveDemo={() => undefined}
      />,
    );
    const menu = await openWorkspaces();
    expect(menuRows(menu)).toEqual(["Home", "Watch Chips work", "Join another workspace"]);
    fireEvent.click(within(menu).getByTestId("workspace-watch-demo"));
    expect(watch).toHaveBeenCalledTimes(1);
  });

  it("renames the one in front from its menu, for its owner, and says why a name is refused", async () => {
    const store = fakeStore(snapshotOf([ownerJoined(), ...opened()]));
    const renamed = vi.fn(async (name: string) => {
      if (name === "Taken") throw new Error("That name is in use.");
    });
    Object.assign(store, { renameWorkspace: renamed });
    render(
      <Shell
        store={store}
        device={DEVICE}
        files={fakeFiles()}
        workspaces={[{ deviceId: DEVICE.deviceId, label: "Home", current: true, muted: false }]}
        onSwitch={() => undefined}
      />,
    );
    fireEvent.click(within(await openWorkspaces()).getByTestId("workspace-rename"));
    const field = screen.getByTestId("workspace-name-field") as HTMLInputElement;
    expect(field.value).toBe("Home");
    fireEvent.change(field, { target: { value: "Taken" } });
    fireEvent.submit(field);
    expect((await screen.findByRole("alert")).textContent).toBe("That name is in use.");
    fireEvent.change(field, { target: { value: "Northwind" } });
    fireEvent.submit(field);
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Workspaces" })).toBeNull());
    expect(renamed).toHaveBeenLastCalledWith("Northwind");
  });
});

describe("messaging depth (M5.4)", () => {
  /** Scout's line and Arjun's, by the ids of the events that carried them. */
  const SAID = "evt_01K4ZQPX000000000000000067";
  const MINE = "evt_01K4ZQPX000000000000000068";
  const MINE_MESSAGE = "msg_01K4ZQPX000000000000000068";
  const room = () => [
    ...opened(),
    fixture("message.post", 4),
    fixture("message.post", 5, { id: MINE, actor: person(ARJUN), text: "Thanks." }),
  ];
  const threadOpened = (seq: number) =>
    fixture("space.created", seq, {
      id: `evt_01K4ZQPX0000000000000000T${seq}`,
      actor: person(ARJUN),
      space_id: THREAD,
      kind: "thread",
      title: undefined,
      parent_space_id: SPACE,
      root_message_id: "msg_01K4ZQPX000000000000000067",
    });
  const reply = (seq: number, text: string) =>
    fixture("message.post", seq, {
      id: `evt_01K4ZQPX0000000000000000R${seq}`,
      actor: person(DANA),
      space_id: THREAD,
      text,
    });

  it("says beneath a line which agents' turns heard it while they worked (ADR 0106)", () => {
    renderShell([
      ...room(),
      fixture("message.heard", 6, {
        actor: { kind: "harness", id: LEDGER },
        message_id: MINE_MESSAGE,
      }),
    ]);
    expect(within(screen.getByTestId("messages")).getByTestId("heard").textContent).toBe(
      "Ledger heard this while working",
    );
  });

  it("tags a heartbeat's check-in, and no other line (ADR 0143)", () => {
    renderShell([
      ...room(),
      fixture("message.post", 6, {
        id: "evt_01K4ZQPX00000000000000HB06",
        actor: harness(SCOUT),
        text: "The deploy is still red.",
        heartbeat: true,
      }),
    ]);
    const tags = within(screen.getByTestId("messages")).getAllByTestId("heartbeat-tag");
    expect(tags).toHaveLength(1);
    expect(tags[0]?.getAttribute("title")).toBe("Heartbeat check-in");
    expect(tags[0]?.textContent).toBe("Heartbeat");
  });

  it("edits my own line in place, and sends the change", () => {
    const store = renderShell(room());
    const messages = screen.getByTestId("messages");
    // Only my line offers Edit: the words are the author's alone.
    expect(within(openMenu(0)).queryByRole("menuitem", { name: "Edit" })).toBeNull();
    closeMenu();
    fireEvent.click(within(openMenu(1)).getByRole("menuitem", { name: "Edit" }));
    const form = screen.getByTestId("edit-form");
    fireEvent.change(within(form).getByLabelText("Edit message"), {
      target: { value: "Thanks a lot." },
    });
    fireEvent.submit(form);
    expect(store.edits).toEqual([{ spaceId: SPACE, lineId: MINE, text: "Thanks a lot." }]);
    expect(screen.queryByTestId("edit-form")).toBeNull();

    // Once the edit streams back, the line says so.
    store.update(
      snapshotOf([
        ...room(),
        fixture("message.edited", 6, { message_id: MINE_MESSAGE, text: "Thanks a lot." }),
      ]),
    );
    expect(within(messages).getByTestId("edited")).toBeTruthy();
    expect(within(messages).getByText("Thanks a lot.")).toBeTruthy();
  });

  it("takes a line back for everyone only after asking, and draws a tombstone once it is gone", () => {
    const store = renderShell(room());
    const messages = screen.getByTestId("messages");
    // Arjun owns the room: anyone's line is his to take back, so both offer it.
    expect(within(openMenu(1)).getByRole("menuitem", { name: "Delete for everyone" })).toBeTruthy();
    closeMenu();
    fireEvent.click(within(openMenu(0)).getByRole("menuitem", { name: "Delete for everyone" }));
    expect(store.deletions).toEqual([]);
    expect(screen.getByTestId("line-menu-asking").textContent).toContain("Delete for everyone?");
    fireEvent.click(
      within(screen.getByTestId("line-menu")).getByRole("menuitem", {
        name: "Delete for everyone",
      }),
    );
    expect(store.deletions).toEqual([{ spaceId: SPACE, lineId: SAID }]);

    store.update(snapshotOf([...room(), fixture("message.deleted", 6)]));
    expect(within(messages).getByTestId("tombstone")?.textContent).toContain("Message taken back");
    // A line taken back offers one thing more, deleting it for oneself (ADR 0167).
    expect(within(messages).getAllByTestId("line-more")).toHaveLength(2);
    expect(labelsOf(openMenu(0))).toEqual(["Delete for me"]);
  });

  it("deletes a line for the reader alone at once, and offers Undo for a few seconds (ADR 0167)", () => {
    const store = renderShell(room());
    const messages = screen.getByTestId("messages");
    fireEvent.click(within(openMenu(0)).getByRole("menuitem", { name: "Delete for me" }));
    expect(store.hidings).toEqual([{ spaceId: SPACE, lineId: SAID, shown: false }]);
    expect(store.deletions).toEqual([]);
    const pill = screen.getByTestId("undo-pill");
    expect(pill.textContent).toContain("Deleted for you");

    // The store's snapshot leaves the line out once the reader's own event says so.
    const hidden = [...room(), fixture("message.hidden", 6)];
    store.update(snapshotOf(hidden, { model: withHidden(buildModel(hidden, { selfId: ARJUN })) }));
    const line = () => messages.querySelector(`[data-line="${SAID}"]`);
    expect(line()).toBeNull();

    fireEvent.click(within(pill).getByRole("button", { name: "Undo" }));
    expect(store.hidings).toEqual([
      { spaceId: SPACE, lineId: SAID, shown: false },
      { spaceId: SPACE, lineId: SAID, shown: true },
    ]);
    const shown = [...hidden, fixture("message.shown", 7)];
    store.update(snapshotOf(shown, { model: withHidden(buildModel(shown, { selfId: ARJUN })) }));
    // Back, opening its place to form again from its dust rather than arriving as a new line.
    expect(line()?.getAttribute("data-breaking")).toBe("back");
    expect(line()?.textContent).toContain("Drafting the confirmation to Dana now.");
  });

  it("pins a line to the top of the room, and jumps to it from the strip", () => {
    const store = renderShell(room());
    const messages = screen.getByTestId("messages");
    expect(screen.queryByTestId("pins")).toBeNull();
    fireEvent.click(within(openMenu(0)).getByRole("menuitem", { name: "Pin" }));
    expect(store.pins).toEqual([{ spaceId: SPACE, lineId: SAID }]);

    store.update(snapshotOf([...room(), fixture("message.pinned", 6)]));
    const strip = screen.getByTestId("pins");
    expect(strip?.textContent).toContain("The PO is for");
    fireEvent.click(within(strip).getByRole("button"));
    expect(messages.querySelector(`[data-line="${SAID}"]`)?.getAttribute("data-focused")).toBe(
      "true",
    );
    // Pinned, the same place in the menu offers to take it down again.
    fireEvent.click(within(openMenu(0)).getByRole("menuitem", { name: "Unpin" }));
    expect(store.unpins).toEqual([{ spaceId: SPACE, lineId: SAID }]);
  });

  it("shows a pinned line by its words, not its marks", () => {
    renderShell([
      ...opened(),
      fixture("message.post", 4, { text: "**The PO is for** the 19th." }),
      fixture("message.pinned", 5),
    ]);
    const pin = within(screen.getByTestId("pins")).getByRole("button");
    expect(pin.textContent).toBe("The PO is for the 19th.");
  });

  it("keeps a thread the log holds off the space list, and a search hit in it opens its room", () => {
    const store = renderShell([...room(), threadOpened(6), reply(7, "In the thread.")]);
    expect(within(screen.getByTestId("space-list")).getAllByRole("button")).toHaveLength(1);
    // Nothing offers to open it (ADR 0035's addendum): no menu item, nothing under the line.
    expect(within(openMenu(0)).queryByRole("menuitem", { name: /thread/i })).toBeNull();
    closeMenu();
    expect(screen.queryByTestId("line-replies")).toBeNull();

    // A search hit in the thread opens the room it grew in, and nothing beside it.
    store.found = {
      hits: [
        {
          kind: "message",
          spaceId: THREAD,
          at: "2026-09-02T14:25:00.000Z",
          snippet: "In the \u{E000}thread\u{E001}.",
          lineId: "evt_01K4ZQPX0000000000000000R7",
          authorId: DANA,
        },
      ],
      nextCursor: null,
    };
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
      target: { value: "thread" },
    });
    return waitFor(() => {
      expect(store.searches).toEqual([{ text: "thread", limit: 20 }]);
      const hit = screen.getByTestId("search-hit");
      expect(hit?.textContent).toContain("Dana");
      expect(hit?.textContent).toContain("in PO-4471 · thread");
      expect(hit.querySelector("mark")?.textContent).toContain("thread");
      fireEvent.click(hit);
      expect(screen.getByTestId("messages")).toBeTruthy();
      expect(screen.queryByTestId("thread")).toBeNull();
    });
  });

  it("lands on the line a search hit names, and says when the words were a voice note's", async () => {
    const store = renderShell(room());
    store.found = {
      hits: [
        {
          kind: "message",
          spaceId: SPACE,
          at: "2026-09-02T14:25:00.000Z",
          snippet: "\u{E000}Thanks\u{E001}.",
          lineId: MINE,
          authorId: ARJUN,
        },
        {
          kind: "receipt",
          spaceId: SPACE,
          at: "2026-09-02T14:24:00.000Z",
          snippet: "Read PO #4471",
          runId: RUN,
          stepId: "read-po",
        },
        {
          kind: "message",
          spaceId: SPACE,
          at: "2026-09-02T14:23:00.000Z",
          snippet: "\u{E000}Thanks\u{E001} for the receipt.",
          snippetFrom: "transcript",
          lineId: "evt_01K4ZQPX0000000000000VOICE",
          authorId: ARJUN,
        },
      ],
      nextCursor: null,
    };
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
      target: { value: "thanks" },
    });
    const hits = await screen.findAllByTestId("search-hit");
    expect(hits).toHaveLength(3);
    // A step of a run says so; a hit in what a voice note said is said, not written.
    expect(hits[1]?.textContent).toContain("step in");
    expect(hits[0]?.textContent).not.toContain("voice note");
    expect(hits[2]?.textContent).toContain("voice note");
    fireEvent.click(hits[0] as Element);
    const messages = screen.getByTestId("messages");
    expect(messages.querySelector(`[data-line="${MINE}"]`)?.getAttribute("data-focused")).toBe(
      "true",
    );
  });

  it("marks the words searched for in the line a hit lands on, for a moment (ADR 0133)", async () => {
    vi.useFakeTimers();
    try {
      const store = renderShell(room());
      store.found = {
        hits: [
          {
            kind: "message",
            spaceId: SPACE,
            at: "2026-09-02T14:25:00.000Z",
            snippet: "\u{E000}Thanks\u{E001}.",
            lineId: MINE,
            authorId: ARJUN,
          },
        ],
        nextCursor: null,
      };
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
        target: { value: "thanks" },
      });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.click(screen.getByTestId("search-hit"));
      const line = screen.getByTestId("messages").querySelector(`[data-line="${MINE}"]`);
      expect(line?.getAttribute("data-focused")).toBe("true");
      expect(
        [...(line?.querySelectorAll(".bub mark") ?? [])].map((each) => each.textContent),
      ).toEqual(["Thanks"]);
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(line?.querySelectorAll("mark")).toHaveLength(0);
      expect(line?.textContent).toContain("Thanks.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when nothing was found", async () => {
    renderShell(room());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
      target: { value: "nothing" },
    });
    expect((await screen.findByTestId("search-empty")).textContent).toContain(
      "Nothing for “nothing”",
    );
  });
});

describe("approval routing (M5.5)", () => {
  it("hands an ask to a teammate from the card, with a word why", () => {
    const store = renderShell(asking());
    const card = screen.getByTestId("decide");
    fireEvent.click(within(card).getByRole("button", { name: "Hand to…" }));
    const form = screen.getByTestId("route-form");
    fireEvent.change(within(form).getByLabelText("Hand to"), { target: { value: DANA } });
    fireEvent.change(within(form).getByLabelText("Why hand it on"), {
      target: { value: "Dana knows the account." },
    });
    fireEvent.submit(form);
    expect(store.routed).toEqual([
      {
        spaceId: SPACE,
        runId: RUN,
        approvalId: APPROVAL,
        to: [DANA],
        reason: "Dana knows the account.",
      },
    ]);
    expect(screen.queryByTestId("route-form")).toBeNull();
  });

  it("says who it was handed to, offers Hand to… only to whoever may answer or runs the workspace, and names the lead policy let answer", () => {
    // Handed to Dana: Arjun, the workspace's owner, may still hand it on; the card says so.
    const store = renderShell([
      ...asking(),
      fixture("person.joined", 6, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      fixture("approval.routed", 7),
    ]);
    const card = screen.getByTestId("decide");
    expect(within(card).getByTestId("routed").textContent).toContain("Handed to Dana by Arjun");
    expect(within(card).getByTestId("routed").textContent).toContain("Dana knows the Northwind");
    expect(within(card).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(card).getByRole("button", { name: "Hand to…" })).toBeTruthy();

    // A member who was not named may not hand it on either.
    store.update(
      snapshotOf([
        ...asking(),
        fixture("person.joined", 6, {
          participant_id: ARJUN,
          display_name: "Arjun",
          role: "member",
        }),
        fixture("approval.routed", 7),
      ]),
    );
    expect(
      within(screen.getByTestId("decide")).queryByRole("button", { name: "Hand to…" }),
    ).toBeNull();

    // Policy handed it to the lead: the card says so.
    store.update(
      snapshotOf([
        ...opened(),
        fixture("run.started", 4),
        fixture("approval.request", 5, { approvers: [SCOUT] }),
      ]),
    );
    expect(screen.getByTestId("lead-notice").textContent).toContain("Policy let Scout, the lead");
  });
});

describe("notifications per person (M5.6)", () => {
  it("shows the tiers, quiet hours and a word per harness, and saves each change whole", async () => {
    const store = fakeStore(snapshotOf([...opened(), fixture("run.started", 4)]));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByTestId("you"));
    const section = await screen.findByTestId("notifications");
    /**
     * A row's form, on a page beside the list with the row lit, and an answer picked in it. The
     * next row's form takes its place (ADR 0265's addendum).
     */
    const pick = async (row: string, form: string, answer: RegExp) => {
      fireEvent.click(within(section).getByTestId(row));
      const opened = await screen.findByTestId(form);
      expect(within(section).getByTestId(row).getAttribute("aria-current")).toBe("page");
      fireEvent.click(within(opened).getByRole("radio", { name: answer }));
    };
    await pick("decisions-row", "decide-form", /^Off/);
    await waitFor(() => expect(store.notifySaved).toHaveLength(1));
    expect(store.notifySaved[0]).toMatchObject({ decide: "off", review: "hourly", fyi: "daily" });
    await pick("review-row", "review-form", /^Off/);
    expect(screen.queryByTestId("decide-form")).toBeNull();
    expect(within(section).getByTestId("decisions-row").getAttribute("aria-current")).toBeNull();
    await pick("fyi-row", "fyi-form", /^Off/);
    await waitFor(() => expect(store.notifySaved).toHaveLength(3));
    expect(store.notifySaved[2]).toMatchObject({ decide: "off", review: "off", fyi: "off" });

    fireEvent.click(within(section).getByTestId("quiet-row"));
    const quiet = await screen.findByTestId("quiet-form");
    fireEvent.click(within(quiet).getByRole("switch", { name: "Quiet hours" }));
    await waitFor(() => expect(store.notifySaved).toHaveLength(4));
    const night = { from: "22:00", to: "07:00", breakthrough: "decide" } as const;
    expect(store.notifySaved[3]?.quiet).toEqual(night);
    expect(within(section).getByTestId("quiet-row").textContent).toContain(quietWords(night));
    fireEvent.change(within(quiet).getByLabelText("Quiet to"), { target: { value: "08:30" } });
    await waitFor(() => expect(store.notifySaved.at(-1)?.quiet?.to).toBe("08:30"));
    // A time field emptied is not a time: nothing is saved for it.
    fireEvent.change(within(quiet).getByLabelText("Quiet from"), { target: { value: "" } });
    expect(store.notifySaved.at(-1)?.quiet?.from).toBe("22:00");
    // Nothing through: the line says so, rather than promising the decisions still come.
    fireEvent.click(within(quiet).getByRole("switch", { name: "Let decisions through" }));
    await waitFor(() => expect(store.notifySaved.at(-1)?.quiet?.breakthrough).toBe("none"));
    await waitFor(() =>
      expect(within(section).getByTestId("quiet-row").textContent).toContain(
        "Nothing gets through, not even decisions",
      ),
    );
    // Quiet hours off again: the window goes.
    fireEvent.click(within(quiet).getByRole("switch", { name: "Quiet hours" }));
    await waitFor(() => expect(store.notifySaved.at(-1)?.quiet).toBeUndefined());
    expect(within(quiet).queryByLabelText("Quiet to")).toBeNull();

    // Scout is in the workspace: a word for it.
    fireEvent.click(within(section).getByTestId("agents-row"));
    const agents = await screen.findByTestId("agents-form");
    expect(screen.queryByTestId("quiet-form")).toBeNull();
    fireEvent.change(within(agents).getByLabelText("Hear from Scout"), {
      target: { value: "decide" },
    });
    await waitFor(() => expect(store.notifySaved.at(-1)?.harnesses).toEqual({ [SCOUT]: "decide" }));
    expect(within(section).getByTestId("agents-row").textContent).toBe(
      "Agents Scout decisions only",
    );
  });

  it("turns banners on by asking the browser, and the switch is on once it has given leave", async () => {
    const original = (globalThis as { Notification?: unknown }).Notification;
    const asked: string[] = [];
    (globalThis as { Notification?: unknown }).Notification = {
      permission: "default",
      requestPermission: async () => {
        asked.push("asked");
        return "granted";
      },
    };
    try {
      const store = fakeStore(snapshotOf(opened()));
      render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
      fireEvent.click(screen.getByTestId("you"));
      const row = await screen.findByTestId("mute");
      expect(row.textContent).toContain("hasn't been asked yet");
      const toggle = within(row).getByRole("switch") as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      fireEvent.click(toggle);
      // Given, the switch is on and the line goes.
      await waitFor(() => expect(toggle.checked).toBe(true));
      expect(row.textContent).not.toContain("asked");
      expect(asked).toEqual(["asked"]);
    } finally {
      (globalThis as { Notification?: unknown }).Notification = original;
    }
  });
});

describe("the Agents page (ADR 0087, Phase 5)", () => {
  const TREE = "agt_01K4ZQPX0000000000000TREE";
  const ELM = "agt_01K4ZQPX00000000000000ELM";
  const OAK = "agt_01K4ZQPX00000000000000OAK";
  const agents: Directory = {
    ...DIRECTORY,
    [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
    [ELM]: { id: ELM, kind: "agent", harnessId: SCOUT, displayName: "Elm", room: null, held: 1 },
    [OAK]: {
      id: OAK,
      kind: "agent",
      harnessId: SCOUT,
      displayName: "Oak",
      archived: true,
      room: null,
      releasedFrom: "spc_01K4ZQPX0000000000000GONE",
    },
  };
  /** PO-4471 with Tree in Scout's place, and what it was asked and answered there. */
  function treeIn(): ClientEvent[] {
    return [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
      fixture("message.post", 5, {
        actor: person(ARJUN),
        run_id: undefined,
        text: "Is PO-4471 confirmed?",
      }),
      fixture("message.post", 6, { actor: { kind: "agent", id: TREE, harness_id: SCOUT } }),
    ];
  }

  it("lists the agents, a free one with what waits, and folds the archived ones", () => {
    renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    expect(
      within(screen.getByTestId(`agent-${TREE}`)).getByText(/Scout · in PO-4471/),
    ).toBeTruthy();
    const elm = within(screen.getByTestId(`agent-${ELM}`));
    expect(elm.getByText(/Free · Scout/)).toBeTruthy();
    expect(elm.getByText("1 waiting")).toBeTruthy();
    expect(screen.queryByTestId(`agent-${OAK}`)).toBeNull();
    fireEvent.click(screen.getByTestId("archived-agents"));
    fireEvent.click(screen.getByTestId("archived-elsewhere"));
    expect(
      within(screen.getByTestId(`agent-${OAK}`)).getByText("Scout · was in a space you're not in"),
    ).toBeTruthy();
    // The harnesses stand on their shelf over the agents (ADR 0185).
    expect(
      within(screen.getByTestId("harness-shelf")).getByRole("button", { name: shows("Scout") }),
    ).toBeTruthy();
  });

  it("keeps the archived folds open across a page opened from them, as the list was left", () => {
    renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId("archived-agents"));
    fireEvent.click(screen.getByTestId("archived-elsewhere"));
    fireEvent.click(screen.getByTestId(`agent-${OAK}`));
    fireEvent.click(screen.getByText("‹ Agents"));
    expect(screen.getByTestId("archived-agents").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId(`agent-${OAK}`)).toBeTruthy();
  });

  describe("in motion (3 November 2026)", () => {
    /** The Agents page's own turns, inside the section's (ADR 0274). */
    const AGENTS_TURNS = ".turns:not([data-turns]) > .turn";
    /** A screen to ask, with no Reduce Motion: what moves, moves. */
    const moving = () =>
      vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));

    it("turns to an agent's page over the list, which stands under it with nothing in it to find", async () => {
      moving();
      try {
        renderShell(treeIn(), { directory: agents });
        fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
        fireEvent.click(screen.getByTestId(`agent-${TREE}`));
        const [going, coming] = document.querySelectorAll(AGENTS_TURNS);
        expect(going?.getAttribute("data-turn")).toBe("going");
        expect(going?.hasAttribute("inert")).toBe(true);
        expect(going?.getAttribute("aria-hidden")).toBe("true");
        expect(going?.querySelector("[data-testid]")).toBeNull();
        expect(coming?.getAttribute("data-turn")).toBe("on");
        // Only the page coming is read out, and found.
        expect(screen.getAllByRole("main").map((main) => main.getAttribute("aria-label"))).toEqual([
          "Tree",
        ]);
        expect(screen.getAllByTestId("agent-card")).toHaveLength(1);
        // Once it has come, the list is gone; going back, the list comes from the left.
        fireEvent.animationEnd(coming as Element);
        expect(document.querySelectorAll(AGENTS_TURNS)).toHaveLength(1);
        fireEvent.click(screen.getByText("‹ Agents"));
        expect(
          document.querySelector(`${AGENTS_TURNS}:last-child`)?.getAttribute("data-turn"),
        ).toBe("back");
        // Unseen, as in a tab in the background, the page going still goes.
        await waitFor(() => expect(document.querySelectorAll(AGENTS_TURNS)).toHaveLength(1));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("grows a new agent into its place on the list; those there from the start simply are", () => {
      moving();
      try {
        const store = renderShell(treeIn(), { directory: agents });
        fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
        const ASH = "agt_01K4ZQPX00000000000000ASH";
        expect(screen.getByTestId(`agent-${TREE}`).closest("li")?.hasAttribute("data-arrive")).toBe(
          false,
        );
        act(() =>
          store.update(
            snapshotOf(treeIn(), {
              directory: {
                ...agents,
                [ASH]: { id: ASH, kind: "agent", harnessId: SCOUT, displayName: "Ash", room: null },
              },
            }),
          ),
        );
        expect(screen.getByTestId(`agent-${ASH}`).closest("li")?.getAttribute("data-arrive")).toBe(
          "true",
        );
        expect(screen.getByTestId(`agent-${TREE}`).closest("li")?.hasAttribute("data-arrive")).toBe(
          false,
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("draws an agent in its own outline, wearing the face chosen for it, wherever it is drawn (ADR 0089)", () => {
    const faced: Directory = {
      ...agents,
      [TREE]: { ...agents[TREE], face: { icon: "tree", ground: 7 } } as Directory[string],
    };
    renderShell(treeIn(), { directory: faced });
    // Beside what it said in the room: the bitten body, the mark in place of its initials.
    const said = screen
      .getAllByRole("img", { name: "Tree" })
      .filter((face) => face.getAttribute("data-kind") === "agent");
    expect(said.length).toBeGreaterThan(0);
    for (const face of said) {
      expect(face.getAttribute("style")).toContain("--avatar-color: var(--avatar-8)");
      expect(face.textContent).toBe("");
    }
    // On the Agents page: Tree wears its face, and Elm, with none chosen, its initial.
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    const tree = within(screen.getByTestId(`agent-${TREE}`)).getByRole("img");
    expect(tree.getAttribute("data-kind")).toBe("agent");
    expect(tree.querySelector(".ui-face g path")).not.toBeNull();
    const elm = within(screen.getByTestId(`agent-${ELM}`)).getByRole("img");
    expect(elm.getAttribute("data-kind")).toBe("agent");
    expect(elm.textContent).toBe("E");
    // A harness keeps its squircle, on its tile.
    expect(
      within(screen.getByTestId("harness-shelf"))
        .getAllByRole("img", { hidden: true })[0]
        ?.getAttribute("data-kind"),
    ).toBe("harness");
  });

  it("opens an agent's card in the middle column, its history from a row, and goes back (ADR 0270)", async () => {
    const store = renderShell(treeIn(), { directory: agents });
    Object.assign(store, {
      agentStays: async () => [
        {
          readable: true,
          spaceId: SPACE,
          fromSeq: 1,
          toSeq: null,
          from: "2026-09-02T14:00:00.000Z",
          to: null,
          lines: 2,
        },
        {
          readable: false,
          from: "2026-08-20T10:00:00.000Z",
          to: "2026-08-21T10:00:00.000Z",
          lines: 2,
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${TREE}`));
    expect(screen.getByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
    expect(screen.getByTestId("agent-sub").textContent).toBe("Scout");
    // How many spaces its history holds, once the server has said; the row opens it.
    const row = screen.getByTestId("agent-history");
    await waitFor(() => expect(row.textContent).toBe("Message history2 spaces›"));
    fireEvent.click(row);
    expect(screen.getByRole("heading", { name: "Message history", level: 1 })).toBeTruthy();
    const history = within(screen.getByRole("region", { name: "Message history" }));
    expect(await history.findByText("Is PO-4471 confirmed?")).toBeTruthy();
    expect(history.getByText(/120 units/)).toBeTruthy();
    expect(screen.getByTestId("divider-now").textContent).toContain("PO-4471");
    expect(screen.getByTestId("away-count").textContent).toBe(
      "2 messages in a space you're not in",
    );
    fireEvent.click(screen.getByRole("button", { name: "‹ Tree" }));
    expect(screen.getByTestId("agent-card")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "‹ Agents" }));
    expect(screen.getByTestId(`agent-${TREE}`)).toBeTruthy();
  });

  it("changes an agent's face on a page over its card, from its face or its Icon row (ADR 0272)", () => {
    const store = renderShell(treeIn(), { directory: agents });
    const asked: [string, unknown][] = [];
    Object.assign(store, {
      setAgentFace: async (agentId: string, face: unknown) => {
        asked.push([agentId, face]);
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${TREE}`));
    // Its Icon row says what it wears; it and the face open the same page.
    expect(within(screen.getByTestId("agent-icon")).getByText("Default")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tree's icon" }));
    expect(screen.getByRole("heading", { name: "Icon", level: 1 })).toBeTruthy();
    const picker = screen.getByRole("main", { name: "Tree: Icon" });
    fireEvent.click(within(picker).getByTestId("ground-3"));
    expect(asked.map(([agentId]) => agentId)).toEqual([TREE]);
    fireEvent.click(screen.getByRole("button", { name: "‹ Tree" }));
    expect(screen.getByTestId("agent-card")).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-icon"));
    expect(screen.getByRole("main", { name: "Tree: Icon" })).toBeTruthy();
  });

  it("says under a free agent's facts what its waiting words are, and where they go", () => {
    // Arjun, 19 October 2026: "What is the '1 waiting' label indicate".
    renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${ELM}`));
    expect(screen.getByTestId("agent-waiting").textContent).toBe("Waiting1 message");
    expect(screen.getByTestId("agent-waiting-note").textContent).toBe(
      "Elm said this while it wasn't in a space. It's posted in the space it joins next.",
    );
    // Said there, the card's foot doesn't say it again.
    expect(screen.getByTestId("agent-card").querySelector(".agent-note")).toBeNull();
  });

  it("opens an agent's page from a search result, and its list from the rail (ADR 0132)", () => {
    renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
      target: { value: "tre" },
    });
    fireEvent.click(screen.getByTestId(`result-agent-${TREE}`));
    expect(screen.getByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
    // Away and back by the rail, the page is its list again: the result's agent is not kept.
    fireEvent.click(screen.getByRole("button", { name: /^Spaces/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    expect(screen.getByTestId(`agent-${TREE}`)).toBeTruthy();
  });

  it("opens an agent's page from the room's line saying its context compacted (ADR 0146)", () => {
    renderShell(
      [...treeIn(), fixture("context.compacted", 7, { actor: { kind: "agent", id: TREE } })],
      { directory: agents },
    );
    const line = screen.getByTestId("compacted-line");
    expect(line.textContent).toBe("Tree compacted its context · 214k → 21k tokens");
    fireEvent.click(line);
    expect(screen.getByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
  });

  it("renames an agent in the field its name is, and says why a name is refused (ADR 0091)", async () => {
    const store = renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${TREE}`));
    const field = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(field.value).toBe("Tree");

    fireEvent.change(field, { target: { value: "Hello" } });
    fireEvent.submit(field);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "An agent here goes by Hello already.",
    );
    expect(field.getAttribute("aria-invalid")).toBe("true");

    // Escape puts the name back, and leaving sends nothing.
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(field.value).toBe("Tree");

    fireEvent.change(field, { target: { value: "  Birch  " } });
    fireEvent.blur(field);
    await waitFor(() => expect(store.agentsRenamed).toEqual([{ agentId: TREE, name: "Birch" }]));
  });

  it("archives an agent from its page, asking first, and unarchives one without asking (ADR 0095)", async () => {
    const store = renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${TREE}`));
    fireEvent.click(screen.getByTestId("archive-agent"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Archive Tree?");
    fireEvent.click(within(dialog).getByTestId("confirm-go"));
    await waitFor(() => expect(store.agentsArchived).toEqual([{ agentId: TREE, archived: true }]));

    fireEvent.click(screen.getByText("‹ Agents"));
    fireEvent.click(screen.getByTestId("archived-agents"));
    fireEvent.click(screen.getByTestId("archived-elsewhere"));
    fireEvent.click(screen.getByTestId(`agent-${OAK}`));
    fireEvent.click(screen.getByTestId("unarchive-agent"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    await waitFor(() =>
      expect(store.agentsArchived).toContainEqual({ agentId: OAK, archived: false }),
    );
  });

  it("deletes an agent from its page, asking first, and steps back to the list (ADR 0095)", async () => {
    const store = renderShell(treeIn(), { directory: agents });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${ELM}`));
    fireEvent.click(screen.getByTestId("delete-agent"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Delete Elm?");
    // Elm is in no room, so there is no room to take with it.
    expect(within(dialog).queryByTestId("confirm-too")).toBeNull();
    fireEvent.click(within(dialog).getByTestId("confirm-go"));
    await waitFor(() => expect(store.agentsDeleted).toEqual([{ agentId: ELM, deleteRoom: false }]));
    await waitFor(() => expect(screen.getByTestId("archived-agents")).toBeTruthy());
  });

  describe("Lock changes (ADR 0199)", () => {
    const MAIN = "agt_01K4ZQPX0000000000000MAIN";
    /** The page's agents, these ones with their changes locked. */
    const lockedOf = (...ids: string[]): Directory => {
      const next: Record<string, Directory[string]> = { ...agents };
      for (const id of ids) next[id] = { ...agents[id], locked: true } as Directory[string];
      return next;
    };
    const lockSwitch = () => {
      const flip = within(screen.getByTestId("agent-lock")).getByRole("switch", {
        name: "Lock changes",
      }) as HTMLInputElement;
      expect(flip.getAttribute("data-testid")).toBe("agent-lock-switch");
      return flip;
    };
    const note = () => screen.getByTestId("agent-card").querySelector(".agent-note")?.textContent;
    const openAgent = (agentId: string) => {
      fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
      fireEvent.click(screen.getByTestId(`agent-${agentId}`));
    };

    it("locks an agent's changes from a switch over its buttons, and then offers no rename, Archive or Delete…", async () => {
      const store = renderShell(treeIn(), { directory: agents });
      openAgent(TREE);
      const row = screen.getByTestId("agent-lock");
      expect(row.textContent).toContain("Lock changes");
      expect(row.textContent).toContain("Rename, archive, delete");
      // Off for every agent, its padlock open, over the buttons it guards.
      const padlock = () => row.querySelector("[data-icon]")?.getAttribute("data-icon");
      expect(lockSwitch().checked).toBe(false);
      expect(padlock()).toBe("unlock");
      expect(
        row.compareDocumentPosition(screen.getByTestId("archive-agent")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      // On at once, its padlock shut, and held on while the server's word is on its way.
      fireEvent.click(lockSwitch());
      expect(lockSwitch().checked).toBe(true);
      expect(padlock()).toBe("lock");
      await waitFor(() => expect(store.agentLocks).toEqual([{ agentId: TREE, locked: true }]));

      // Heard: the name stands without its field, a small padlock beside it, and the foot has no
      // Archive or Delete…, and says why.
      store.update(snapshotOf(treeIn(), { directory: lockedOf(TREE) }));
      expect(lockSwitch().checked).toBe(true);
      expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
      expect(screen.getByRole("img", { name: "Changes locked" })).toBeTruthy();
      expect(screen.queryByTestId("archive-agent")).toBeNull();
      expect(screen.queryByTestId("delete-agent")).toBeNull();
      expect(note()).toBe("Changes are locked. Unlock them to rename, archive or delete it.");

      // And let go the same way: all three are back.
      fireEvent.click(lockSwitch());
      expect(lockSwitch().checked).toBe(false);
      await waitFor(() =>
        expect(store.agentLocks).toEqual([
          { agentId: TREE, locked: true },
          { agentId: TREE, locked: false },
        ]),
      );
      store.update(snapshotOf(treeIn(), { directory: agents }));
      expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
      expect(screen.queryByRole("img", { name: "Changes locked" })).toBeNull();
      expect(screen.getByTestId("archive-agent")).toBeTruthy();
      expect(screen.getByTestId("delete-agent")).toBeTruthy();
    });

    it("puts the switch back when the server turns it away, and says why as an archive's refusal is said", async () => {
      const store = renderShell(treeIn(), { directory: agents });
      store.agentLockRefusal = "Only Scout's owner, or an owner or admin, may lock its changes.";
      openAgent(TREE);
      fireEvent.click(lockSwitch());
      expect(lockSwitch().checked).toBe(true);
      const card = within(screen.getByTestId("agent-card"));
      expect((await card.findByRole("alert")).textContent).toBe(
        "Only Scout's owner, or an owner or admin, may lock its changes.",
      );
      await waitFor(() => expect(lockSwitch().checked).toBe(false));
      expect(store.agentLocks).toEqual([]);
    });

    it("still offers Unarchive for an archived agent that is locked, and nothing else", async () => {
      const store = renderShell(treeIn(), { directory: lockedOf(OAK) });
      fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
      fireEvent.click(screen.getByTestId("archived-agents"));
      fireEvent.click(screen.getByTestId("archived-elsewhere"));
      fireEvent.click(screen.getByTestId(`agent-${OAK}`));
      expect(lockSwitch().checked).toBe(true);
      expect(screen.queryByTestId("archive-agent")).toBeNull();
      expect(screen.queryByTestId("delete-agent")).toBeNull();
      fireEvent.click(screen.getByTestId("unarchive-agent"));
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
      await waitFor(() =>
        expect(store.agentsArchived).toEqual([{ agentId: OAK, archived: false }]),
      );
    });

    it("offers the switch to the harness's owner, never on a Main agent", () => {
      const withMain: Directory = {
        ...agents,
        [MAIN]: { id: MAIN, kind: "agent", harnessId: SCOUT, displayName: "Scout", lead: true },
      };
      renderShell(treeIn(), { directory: withMain });
      openAgent(TREE);
      expect(screen.getByTestId("agent-lock")).toBeTruthy();
      fireEvent.click(screen.getByText("‹ Agents"));
      fireEvent.click(screen.getByTestId(`agent-${MAIN}`));
      expect(screen.getByRole("heading", { name: "Scout", level: 1 })).toBeTruthy();
      expect(screen.queryByTestId("agent-lock")).toBeNull();
      expect(screen.queryByRole("switch", { name: "Lock changes" })).toBeNull();
    });

    it.each(["member", "guest"])(
      "offers a %s who doesn't run the harness no switch, and no field for a locked agent's name",
      (role) => {
        const dana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
        const events = [
          ...treeIn(),
          fixture("person.joined", 7, { participant_id: DANA, display_name: "Dana", role }),
        ];
        render(
          <Shell
            store={fakeStore(snapshotOf(events, { directory: lockedOf(TREE) }))}
            device={dana}
            files={fakeFiles()}
          />,
        );
        openAgent(TREE);
        expect(screen.getByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
        expect(screen.queryByTestId("agent-lock")).toBeNull();
        expect(screen.queryByRole("switch", { name: "Lock changes" })).toBeNull();
        expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
        expect(screen.getByRole("img", { name: "Changes locked" })).toBeTruthy();
        expect(note()).toBe(
          "Its changes are locked. Scout's owner, or an owner or admin here, can unlock them.",
        );
      },
    );
  });
});

describe("A new agent in a room (ADR 0108)", () => {
  const TREE = "agt_01K4ZQPX0000000000000TREE";
  const REVIEWER = "agt_01K4ZQPX0000000000REVIEWER";
  /** Scout makes new agents for a room; Reviewer is one, in PO-4471 once it joins. */
  const making: Directory = {
    ...DIRECTORY,
    [SCOUT]: {
      id: SCOUT,
      kind: "harness",
      displayName: "Scout",
      ownerId: ARJUN,
      capabilities: ["agents", "new_agents"],
    },
    [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
    [REVIEWER]: {
      id: REVIEWER,
      kind: "agent",
      harnessId: SCOUT,
      displayName: "Reviewer",
      room: SPACE,
    },
  };
  function treeIn(): ClientEvent[] {
    return [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
    ];
  }
  /** Arjun asks Scout for Reviewer in PO-4471, `ago` milliseconds ago. */
  const asked = (ago: number) =>
    fixture("agent.asked", 5, {
      actor: person(ARJUN),
      space_id: SPACE,
      harness_id: SCOUT,
      name: "Reviewer",
      by: ARJUN,
      ts: new Date(Date.now() - ago).toISOString(),
    });
  const joined = () =>
    fixture("membership.added", 6, {
      actor: harness(SCOUT),
      space_id: SPACE,
      participant_id: REVIEWER,
      participant_kind: "agent",
      made_for: asked(2000).id,
    });

  it("asks a harness from Add's New agent page, under the name typed, and ticks the ask on Add", async () => {
    const store = renderShell(treeIn(), { directory: making });
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-add"));
    expect(within(sheet).getByTestId("room-sheet-new").textContent).toContain(
      "Scout makes it for this space",
    );
    fireEvent.click(within(sheet).getByTestId("room-sheet-new"));
    expect(within(sheet).getByRole("heading", { name: "New agent" })).toBeTruthy();
    // One harness to make it: picked already, its face there to say who.
    expect((within(sheet).getByRole("radio", { name: "Scout" }) as HTMLInputElement).checked).toBe(
      true,
    );
    // No agent here answers to Scout: the harness's own name is free.
    expect(within(sheet).getByTestId("new-agent-hint").textContent).toBe("Left empty, it's Scout.");
    fireEvent.change(within(sheet).getByTestId("new-agent-name"), {
      target: { value: "Reviewer" },
    });
    expect(within(sheet).getByTestId("new-agent-hint").textContent).toBe(
      "Reviewer is taken here, so it will be Reviewer 2.",
    );
    fireEvent.click(within(sheet).getByTestId("new-agent-add"));
    await waitFor(() =>
      expect(store.askedFor).toEqual([{ harnessId: SCOUT, spaceId: SPACE, name: "Reviewer" }]),
    );
    // Back on Add, the ask ticked under New agent (ADR 0148).
    expect((await within(sheet).findByTestId("room-sheet-asked-0")).textContent).toContain(
      "Asked of Scout",
    );
  });

  it("draws the ask in the room, and holds the agent's @ in the field once it joins", () => {
    const store = renderShell([...treeIn(), asked(2000)], { directory: making });
    const waiting = screen.getByTestId("new-agent-waiting");
    expect(waiting.textContent).toContain("Asking Scout for Reviewer…");
    expect(waiting.textContent).toContain("You asked for a new agent");
    store.arrival = "@Reviewer";
    store.update(snapshotOf([...treeIn(), asked(2000), joined()], { directory: making }));
    expect(screen.getByTestId("new-agent-joined").textContent).toContain("Reviewer joined");
    expect((screen.getByRole("textbox", { name: /Message/ }) as HTMLTextAreaElement).value).toBe(
      "@Reviewer ",
    );
  });

  it("says Scout didn't make Reviewer after a minute, and asks again", async () => {
    const store = renderShell([...treeIn(), asked(61_000)], { directory: making });
    const line = screen.getByTestId("new-agent-not_made");
    expect(line.textContent).toContain("Scout didn't make Reviewer");
    fireEvent.click(within(line).getByTestId("new-agent-again"));
    await waitFor(() =>
      expect(store.askedFor).toEqual([{ harnessId: SCOUT, spaceId: SPACE, name: "Reviewer" }]),
    );
  });
});

describe("Fork (ADR 0087, Phase 6)", () => {
  const TREE = "agt_01K4ZQPX0000000000000TREE";
  const ELM = "agt_01K4ZQPX00000000000000ELM";
  const COPY = "agt_01K4ZQPX0000000000000COPY";
  const OTHER = "spc_01K4ZQPX00000000000000OTHR";
  /** Scout makes copies of its agents; Elm is in another room, and Tree's copy is in it too. */
  const forking: Directory = {
    ...DIRECTORY,
    [SCOUT]: {
      id: SCOUT,
      kind: "harness",
      displayName: "Scout",
      ownerId: ARJUN,
      capabilities: ["agents", "forks"],
    },
    [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
    [ELM]: { id: ELM, kind: "agent", harnessId: SCOUT, displayName: "Elm", room: OTHER },
    [COPY]: {
      id: COPY,
      kind: "agent",
      harnessId: SCOUT,
      displayName: "Tree · fork",
      room: OTHER,
      forkedFrom: TREE,
    },
  };
  function treeIn(): ClientEvent[] {
    return [
      ...opened(),
      fixture("membership.replaced", 4, { actor: person(ARJUN), from: SCOUT, to: TREE }),
    ];
  }
  /** Arjun asks Scout for a copy of Elm in PO-4471, `ago` milliseconds ago. */
  const ask = (ago: number) =>
    fixture("agent.fork", 5, {
      actor: person(ARJUN),
      space_id: SPACE,
      agent_id: ELM,
      by: ARJUN,
      ts: new Date(Date.now() - ago).toISOString(),
    });

  it("forks an agent from its page into a new room named for its copy", async () => {
    const store = renderShell([ownerJoined(), ...treeIn()], { directory: forking });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${TREE}`));
    fireEvent.click(screen.getByTestId("agent-fork"));
    const picker = screen.getByTestId("room-picker");
    expect(within(picker).getByRole("heading", { level: 2 }).textContent).toBe(
      "Fork Tree into a space",
    );
    expect(within(picker).getByTestId("picker-new").textContent).toBe(
      "A new space with the copyNamed Tree · fork 2",
    );
    fireEvent.click(within(picker).getByTestId("picker-new"));
    await waitFor(() => expect(store.forked).toEqual([{ agentId: TREE, spaceId: NEW_SPACE }]));
    // Tree has a copy already, so the room is named as the next copy will be.
    expect(store.createdSpaces).toContain("Tree · fork 2");
  });

  it("offers Fork here on the page that asks before a move", async () => {
    const store = renderShell(treeIn(), { directory: forking });
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-add"));
    fireEvent.click(within(sheet).getByTestId("room-sheet-other-rooms"));
    fireEvent.click(within(sheet).getByTestId(`room-sheet-agent-${ELM}`));
    expect(within(sheet).getByRole("heading", { name: "Move Elm here?" })).toBeTruthy();
    expect(sheet.textContent).toContain("A copy joins PO-4471");
    fireEvent.click(within(sheet).getByTestId("room-sheet-fork"));
    await waitFor(() => expect(store.forked).toEqual([{ agentId: ELM, spaceId: SPACE }]));
    expect(store.moved).toEqual([]);
  });

  it("draws the ask in the room: waiting, then the copy joining", () => {
    renderShell([...treeIn(), ask(2000)], { directory: forking });
    const waiting = screen.getByTestId("fork-waiting");
    expect(waiting.textContent).toContain("Forking Elm…");
    expect(waiting.textContent).toContain("You asked Scout for a copy");
    cleanup();
    const joined = fixture("membership.added", 6, {
      actor: harness(SCOUT),
      space_id: SPACE,
      participant_id: COPY,
      participant_kind: "agent",
      fork_of: ask(2000).id,
    });
    renderShell([...treeIn(), ask(2000), joined], { directory: forking });
    expect(screen.getByTestId("fork-joined").textContent).toContain("Tree · fork joined");
  });

  it("says Scout didn't make the copy after a minute, and asks again", async () => {
    const store = renderShell([...treeIn(), ask(61_000)], { directory: forking });
    const line = screen.getByTestId("fork-not_made");
    expect(line.textContent).toContain("Scout didn't make the copy");
    fireEvent.click(within(line).getByTestId("fork-again"));
    await waitFor(() => expect(store.forked).toEqual([{ agentId: ELM, spaceId: SPACE }]));
  });

  it("starts a copy's card and history with the agent it was forked from, which opens its page", async () => {
    renderShell(treeIn(), { directory: forking });
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId(`agent-${COPY}`));
    expect(screen.getByTestId("agent-forked-from").textContent).toBe("Forked fromTree›");
    // Its history begins with it too.
    fireEvent.click(screen.getByTestId("agent-history"));
    const head = await screen.findByTestId("forked-from");
    expect(head.textContent).toContain("Forked from Tree");
    fireEvent.click(head);
    expect(screen.getByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
  });
});

describe("join requests (ADR 0122)", () => {
  /** PO-4471 with Arjun as the workspace's owner, who may let things in. */
  const owned = (): ClientEvent[] => [
    ...opened(),
    fixture("person.joined", 4, { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
  ];

  it("marks the docs' card of a harness that is here, and folds a listed card's switches (setup audit, 17 October 2026)", async () => {
    const card = (id: string, name: string): Connector => ({
      id,
      name,
      line: `${name}, through its bridge`,
      kind: "one-line",
      command: `cd ~/Work/chips-${id} && CHIPS_JOIN_LINK='{link}' npm start`,
      capabilities: ["agents", "new_agents"],
      published: false,
    });
    const store = fakeStore(snapshotOf(owned()));
    store.connectorCards = [card("scout", "Scout"), card("hermes", "Hermes")];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    // Scout is a harness here already: its card says so, and stays a way in for a second one.
    const scout = await screen.findByTestId("join-card-scout");
    expect(scout.textContent).toContain("Connected");
    expect(scout.textContent).toContain("Connected here. Click for another, or a new agent.");
    expect(screen.getByTestId("join-card-hermes").textContent).not.toContain("Connected");
    // The phone's words over the gallery, and the two ways under their own heading.
    const gallery = screen.getByTestId("join-gallery");
    expect(gallery.textContent).toContain(
      "Pick what runs your agents. You run one line on that computer, and it shows up here.",
    );
    expect(within(gallery).getByRole("heading", { name: "Or build your own" })).toBeTruthy();

    // A listed card opens on its line; what it may do waits behind a row, as the welcome's does.
    fireEvent.click(screen.getByTestId("join-card-hermes"));
    await screen.findByTestId("join-command");
    expect(screen.getByRole("button", { name: /What it may do/ })).toBeTruthy();
    expect(screen.queryByTestId("join-cap-new_agents")).toBeNull();
  });

  it("keeps a link while the dialog is put away: the tile counts it down and opens on it (ADR 0271)", async () => {
    const store = fakeStore(snapshotOf(owned()));
    // A link made now, with its fifteen minutes still to run.
    const make = store.makeJoinLink.bind(store);
    Object.assign(store, {
      makeJoinLink: async (capabilities: readonly string[]) => {
        const made = await make(capabilities);
        const expiresAt = new Date(Date.now() + 900_000).toISOString();
        const request = { ...made.request, expiresAt };
        const joins = new Map(store.getSnapshot().joins).set(request.requestId, request);
        store.update({ ...store.getSnapshot(), joins });
        return { ...made, request };
      },
    });
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByTestId("harness-connect"));
    fireEvent.click(await screen.findByTestId("join-way-own"));
    const link = (await screen.findByTestId("join-connect")).dataset["link"];
    expect(store.linksMade).toHaveLength(1);

    // Put away, the dialog leaves the link working, and the tile says it waits.
    const dialog = screen.getByTestId("add-harness-dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.animationEnd(dialog);
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
    const tile = screen.getByTestId("harness-connect");
    // Named by what it shows, then what for (ADR 0275), as voice control needs.
    expect(tile).toBe(
      screen.getByRole("button", { name: /^Waiting 1[45]:\d\d left, to connect a harness$/ }),
    );

    // The tile opens on the same card and link, and makes no other.
    fireEvent.click(tile);
    expect((await screen.findByTestId("join-connect")).dataset["link"]).toBe(link);
    expect(store.linksMade).toHaveLength(1);
  });

  /** The docs' card for Scout, a harness here already. */
  const scoutCard: Connector = {
    id: "scout",
    name: "Scout",
    line: "Scout, through its bridge",
    kind: "one-line",
    command: "CHIPS_JOIN_LINK='{link}' npm start",
    capabilities: ["agents"],
    published: false,
  };

  it("asks first on a card marked Connected: no link until another is asked for (new-person sweep, 20)", async () => {
    const store = fakeStore(snapshotOf(owned()));
    store.connectorCards = [scoutCard];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.click(await screen.findByTestId("join-card-scout"));

    // A second link would make a second Scout, so the card says so and makes none yet.
    const here = await screen.findByTestId("join-here-already");
    expect(here.textContent).toContain("Scout is connected here already.");
    expect(here.textContent).toContain("Another Scout is for another computer.");
    expect(here.textContent).toContain("If this one has stopped, its page says why.");
    expect(store.linksMade).toEqual([]);

    // Back is the gallery; Connect another Scout is the card's link, made then.
    fireEvent.click(within(here).getByTestId("join-here-back"));
    fireEvent.click(await screen.findByTestId("join-card-scout"));
    fireEvent.click(
      within(await screen.findByTestId("join-here-already")).getByRole("button", {
        name: "Connect another Scout",
      }),
    );
    await screen.findByTestId("join-command");
    expect(store.linksMade).toHaveLength(1);
  });

  it("offers a new agent of a harness here already, on its page with the dialog up (ADR 0190)", async () => {
    const store = fakeStore(
      snapshotOf(owned(), {
        directory: {
          ...DIRECTORY,
          [SCOUT]: { ...(DIRECTORY[SCOUT] as Participant), capabilities: ["agents", "new_agents"] },
        },
      }),
    );
    store.connectorCards = [scoutCard];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.click(await screen.findByTestId("join-card-scout"));
    const here = await screen.findByTestId("join-here-already");
    expect(here.textContent).toContain("A new agent of it starts in a space of its own.");
    fireEvent.click(within(here).getByRole("button", { name: "New Scout agent" }));
    expect(await screen.findByRole("main", { name: "Scout" })).toBeTruthy();
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
    const asking = await screen.findByTestId("new-agent-dialog");
    expect(within(asking).getByRole("heading", { name: "New Scout agent" })).toBeTruthy();
    expect(store.linksMade).toEqual([]);
  });

  it("opens Scout's page from its Connected card, with the dialog put away", async () => {
    const store = fakeStore(snapshotOf(owned()));
    store.connectorCards = [scoutCard];
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.click(await screen.findByTestId("join-card-scout"));
    fireEvent.click(await screen.findByTestId("join-here-page"));
    expect(await screen.findByRole("main", { name: "Scout" })).toBeTruthy();
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
    expect(store.linksMade).toEqual([]);
    // Back from its page is the Agents page, without the dialog coming up again.
    fireEvent.click(screen.getByRole("button", { name: /^‹/ }));
    expect(await screen.findByRole("button", { name: "Connect a harness" })).toBeTruthy();
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
  });

  it("connects a harness from You: the Agents page opens with the gallery up, and only then", async () => {
    renderShell(owned());
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    fireEvent.click(screen.getByTestId("connect-harness"));

    const gallery = await screen.findByTestId("join-gallery");
    expect(within(gallery).getByRole("heading", { name: "Connect a harness" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect a harness" })).toBeTruthy();
    const dialog = screen.getByTestId("add-harness-dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.animationEnd(dialog);
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();

    // The Agents page reached any other way opens without it.
    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    fireEvent.click(within(sidebar()).getByRole("button", { name: /^Agents/ }));
    expect(screen.getByRole("button", { name: "Connect a harness" })).toBeTruthy();
    expect(screen.queryByTestId("add-harness-dialog")).toBeNull();
  });

  it("gives an owner the gallery: a way makes a link at once, with the dial on and the rest off", async () => {
    const store = renderShell(owned());
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    const gallery = screen.getByTestId("join-gallery");
    expect(within(gallery).getByText("Your own harness")).toBeTruthy();
    expect(within(gallery).getByText("Anything with HTTP")).toBeTruthy();
    // The app names no harness: two cards, and only these two.
    expect(within(gallery).getAllByRole("button", { name: /harness|HTTP/ })).toHaveLength(2);

    fireEvent.click(screen.getByTestId("join-way-own"));
    const sdk = await screen.findByTestId("join-sdk");
    expect(store.linksMade).toEqual([["autonomy"]]);
    expect(sdk.textContent).toContain(
      'join({ link: "http://127.0.0.1:4431/j/chips_j_testlink1_0123456789abcdef"',
    );
    // The phone's three steps (ADR 0271): the link is ready, then the harness connects.
    expect(screen.getByTestId("join-steps-link").dataset["state"]).toBe("done");
    expect(screen.getByTestId("join-steps-connects").textContent).toContain(
      "Your harness connects",
    );

    // A switch turned on before the link is used is allowed onto it.
    fireEvent.click(within(screen.getByTestId("join-cap-new_spaces")).getByRole("switch"));
    await waitFor(() =>
      expect(store.joinsAllowed).toEqual([
        ["jrq_01K4ZQPX0000000000000000L1", ["autonomy", "new_spaces"]],
      ]),
    );
  });

  it("turns to the arrival on the hello, and Say hello opens its room (ADR 0190)", async () => {
    const store = renderShell(owned());
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.click(screen.getByTestId("join-way-own"));
    await screen.findByTestId("join-sdk");
    // Scout takes its key on Arjun's MacBook Pro and says hello in its room.
    const made = [...(store.getSnapshot().joins?.values() ?? [])][0] as JoinRequest;
    const hello = fixture("message.post", 5, { run_id: undefined, text: "Hello, Arjun." });
    act(() =>
      store.update({
        ...snapshotOf([...owned(), hello]),
        joins: new Map([
          [
            made.requestId,
            {
              ...made,
              state: "redeemed",
              name: "Scout",
              machine: "Arjun's MacBook Pro",
              spaceId: SPACE,
              harnessId: SCOUT,
            },
          ],
        ]),
      }),
    );
    const arrived = await screen.findByTestId("join-arrived");
    expect(within(arrived).getByRole("heading", { name: "Scout is here" })).toBeTruthy();
    expect(arrived.textContent).toContain("Connected from Arjun's MacBook Pro.");
    fireEvent.click(within(arrived).getByTestId("join-arrived-hello"));
    await waitFor(() => expect(screen.queryByTestId("add-harness-dialog")).toBeNull());
    expect(screen.getByTestId("messages").textContent).toContain("Hello, Arjun.");
  });

  it("makes a new agent from a harness's card, in a space named after it (ADR 0190)", async () => {
    const makes: Directory = {
      ...DIRECTORY,
      [SCOUT]: { ...(DIRECTORY[SCOUT] as Participant), capabilities: ["agents", "new_agents"] },
    };
    const store = renderShell(owned(), { directory: makes });
    openHarnesses();
    const card = await screen.findByRole("region", { name: "Scout" });
    fireEvent.click(within(card).getByTestId("harness-new-agent"));
    const dialog = await screen.findByTestId("new-agent-dialog");
    const name = within(dialog).getByTestId("new-agent-name") as HTMLInputElement;
    expect(name.placeholder).toMatch(/^[A-Z][a-z]{2,5}$/);
    fireEvent.change(name, { target: { value: "Reviewer" } });
    expect(within(dialog).getByTestId("new-agent-hint").textContent).toBe(
      "It starts in a space of its own, called Reviewer.",
    );
    fireEvent.click(within(dialog).getByTestId("new-agent-create"));
    await waitFor(() => expect(screen.queryByTestId("new-agent-dialog")).toBeNull());
    expect(store.createdSpaces.at(-1)).toBe("Reviewer");
    expect(store.askedFor.at(-1)).toEqual({
      harnessId: SCOUT,
      spaceId: NEW_SPACE,
      name: "Reviewer",
    });
  });

  it("keeps today's token and lines under Anything with HTTP, then Advanced", async () => {
    const store = renderShell(owned());
    fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect a harness" }));
    fireEvent.click(screen.getByTestId("join-way-http"));
    expect((await screen.findByTestId("join-curl")).textContent).toContain(
      'http://127.0.0.1:4431/v1/join/redeem" -H "Content-Type: application/json" -d \'{"secret":"chips_j_testlink1_0123456789abcdef","name":"My agent"}\'',
    );
    fireEvent.click(screen.getByTestId("join-advanced"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Relay bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and get a token" }));
    expect((await screen.findByTestId("harness-token")).textContent).toBe(
      "chips_at_test-token-shown-once",
    );
    expect(store.added).toEqual(["Relay bot"]);
  });

  it("asks an owner about a request that waits, and allows only what is left on", async () => {
    const asking = joinOf({
      name: "Tide",
      code: "KQ7-M4P",
      software: "tide 0.4.1",
      machine: "vps-fra-1",
      fromAddr: "100.88.4.12",
      wants: ["autonomy", "new_spaces", "restarts"],
    });
    const store = renderShell(owned(), { joins: new Map([[asking.requestId, asking]]) });
    const dialog = await screen.findByTestId("join-request-dialog");
    expect(within(dialog).getByText("Tide wants to join")).toBeTruthy();
    expect(within(dialog).getByTestId("join-code").textContent).toBe("KQ7-M4P");
    expect(within(dialog).getByText("tide 0.4.1 · vps-fra-1 · 100.88.4.12")).toBeTruthy();
    fireEvent.click(within(within(dialog).getByTestId("join-cap-restarts")).getByRole("switch"));
    fireEvent.click(within(dialog).getByTestId("join-allow"));
    await waitFor(() =>
      expect(store.joinsAllowed).toEqual([[asking.requestId, ["autonomy", "new_spaces"]]]),
    );
  });

  it("shows an invite's six digits to compare, and allows with nothing typed (ADR 0232)", async () => {
    const asking = joinOf({
      kind: "invite",
      name: "Priya",
      machine: "Priya's iPhone",
      code: "742913",
      role: "guest",
    });
    const store = renderShell(owned(), { joins: new Map([[asking.requestId, asking]]) });
    const dialog = await screen.findByTestId("join-request-dialog");
    expect(within(dialog).getByRole("heading").textContent).toMatch(/^Priya is asking to join /);
    expect(within(dialog).getByTestId("join-line").textContent).toBe(
      "As a guest · from your invite",
    );
    expect(within(dialog).getByTestId("join-code").textContent).toBe("742 913");
    expect(within(dialog).queryByTestId("join-code-field")).toBeNull();
    fireEvent.click(within(dialog).getByTestId("join-allow"));
    await waitFor(() => expect(store.joinsAllowed).toEqual([[asking.requestId, []]]));
  });

  it("asks for a device's code to be typed, and allows with it (SEC-6)", async () => {
    const asking = joinOf({ kind: "device", name: "Arjun's iPad", fromAddr: "192.168.1.41" });
    const store = renderShell(owned(), { joins: new Map([[asking.requestId, asking]]) });
    const dialog = await screen.findByTestId("join-request-dialog");
    expect(within(dialog).getByText("Arjun's iPad wants to pair")).toBeTruthy();
    // The code is the device's to show, so the dialog shows none, and Allow waits for it.
    expect(within(dialog).queryByTestId("join-code")).toBeNull();
    const allow = within(dialog).getByTestId("join-allow") as HTMLButtonElement;
    expect(allow.disabled).toBe(true);
    fireEvent.change(within(dialog).getByTestId("join-code-field"), {
      target: { value: "kq7 m4p" },
    });
    expect(allow.disabled).toBe(false);
    fireEvent.click(allow);
    await waitFor(() => expect(store.joinsAllowed).toEqual([[asking.requestId, [], "KQ7-M4P"]]));
  });

  it("lets an owner pair a phone that asks as Dana, whose own phone was wiped (ADR 0206)", async () => {
    const asking = joinOf({ kind: "device", name: "iPhone 16", fromAddr: "192.168.1.52" });
    const withDana = [
      ...owned(),
      fixture("person.joined", 5, { participant_id: DANA, display_name: "Dana", role: "member" }),
    ];
    const store = renderShell(withDana, { joins: new Map([[asking.requestId, asking]]) });
    const dialog = await screen.findByTestId("join-request-dialog");
    const words = within(dialog).getByTestId("join-paired-words");
    expect(words.textContent).toBe("It is paired as you, as if you had scanned your code with it.");
    const choices = within(dialog).getByTestId("join-pair-as");
    expect(within(choices).getByRole("radio", { name: "Arjun (you)" })).toHaveProperty(
      "checked",
      true,
    );
    fireEvent.click(within(choices).getByRole("radio", { name: "Dana" }));
    expect(words.textContent).toBe(
      "It is paired as Dana, with their spaces and everything they said: for Dana's new phone.",
    );
    fireEvent.change(within(dialog).getByTestId("join-code-field"), {
      target: { value: "KQ7-M4P" },
    });
    fireEvent.click(within(dialog).getByTestId("join-allow"));
    await waitFor(() =>
      expect(store.joinsAllowed).toEqual([[asking.requestId, [], "KQ7-M4P", DANA]]),
    );
  });

  it("refuses with Don't allow, and asks nobody who may not decide", async () => {
    const asking = joinOf({ name: "Tide", code: "KQ7-M4P" });
    const store = renderShell(owned(), { joins: new Map([[asking.requestId, asking]]) });
    fireEvent.click(
      within(await screen.findByTestId("join-request-dialog")).getByTestId("join-deny"),
    );
    await waitFor(() => expect(store.joinsDenied).toEqual([asking.requestId]));
    cleanup();

    // Without a role here, nothing asks.
    renderShell(opened(), { joins: new Map([[asking.requestId, asking]]) });
    expect(screen.queryByTestId("join-request-dialog")).toBeNull();
  });
});

describe("a workspace with no room to open (ADR 0131)", () => {
  it("says there are none only once the server has, and makes one from the button", () => {
    renderShell([ownerJoined()], { awaiting: 0 });
    const pane = screen.getByTestId("no-rooms-none");
    expect(within(pane).getByText("No spaces yet")).toBeTruthy();
    fireEvent.click(within(pane).getByRole("button", { name: "Create a space" }));
    expect(screen.getByTestId("new-space-window")).toBeTruthy();
    cleanup();

    // Somebody who may not open one is told where theirs come from (ADR 0196).
    renderShell([{ ...ownerJoined(1), role: "member" } as ClientEvent], { awaiting: 0 });
    const none = screen.getByTestId("no-rooms-none");
    expect(none.textContent).toContain("When somebody adds you to a space, it appears here.");
    expect(within(none).queryByRole("button", { name: "Create a space" })).toBeNull();
  });

  it("says the server is being reached rather than that there are no rooms", () => {
    renderShell([], { connection: "connecting" });
    expect(screen.getByTestId("no-rooms-connecting")).toBeTruthy();
    expect(screen.queryByText("No spaces yet")).toBeNull();
  });

  it("is patient with a launch's blip, then says the server can't be reached, pane and rail alike", () => {
    vi.useFakeTimers();
    try {
      // His iPhone through the relay (14 October 2026): a socket closing and opening again in a
      // second or two at launch is the server being reached, not "Can't reach your server".
      const store = renderShell([], { connection: "closed" });
      expect(screen.getByTestId("no-rooms-connecting")).toBeTruthy();
      expect(screen.getByTestId("side-empty").textContent).toBe("Reaching your server\u2026");
      // The socket tries again and closes again: the wait goes on from the first trouble.
      act(() => vi.advanceTimersByTime(2500));
      act(() => store.update(snapshotOf([], { connection: "connecting" })));
      act(() => store.update(snapshotOf([], { connection: "closed" })));
      expect(screen.getByTestId("no-rooms-connecting")).toBeTruthy();
      act(() => vi.advanceTimersByTime(1500));
      expect(screen.getByTestId("no-rooms-closed")).toBeTruthy();
      expect(screen.getByTestId("side-empty").textContent).toBe("Can't reach your server.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds places in the rail for the rooms the hello listed, and says nothing in the pane", () => {
    renderShell([], { awaiting: 2 });
    expect(screen.getAllByTestId("side-placeholder")).toHaveLength(2);
    expect(screen.getByTestId("no-rooms-quiet")).toBeTruthy();
  });

  it("welcomes somebody let in by an invite: who, as what, and what comes next (JR-4)", () => {
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const joined = [
      fixture("person.joined", 1, {
        participant_id: ARJUN,
        display_name: "Arjun",
        role: "owner",
        invite_id: undefined,
        invited_by: undefined,
        actor: person(ARJUN),
      }),
      fixture("person.joined", 2),
    ];
    render(
      <Shell
        store={fakeStore(snapshotOf(joined, { awaiting: 0 }))}
        device={asDana}
        files={fakeFiles()}
      />,
    );
    const pane = screen.getByTestId("no-rooms-welcome");
    expect(pane.textContent).toContain("Arjun invited you as a member.");
    expect(pane.textContent).toContain("When somebody adds you to a space, it appears here.");
    // A member is added to spaces: an owner or an admin opens them (ADR 0196).
    expect(within(pane).queryByRole("button", { name: "Create a space" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create new space" })).toBeNull();
    cleanup();

    const asAdmin = [joined[0] as ClientEvent, fixture("person.joined", 2, { role: "admin" })];
    render(
      <Shell
        store={fakeStore(snapshotOf(asAdmin, { awaiting: 0 }))}
        device={asDana}
        files={fakeFiles()}
      />,
    );
    const admin = screen.getByTestId("no-rooms-welcome");
    expect(within(admin).getByRole("button", { name: "Create a space" })).toBeTruthy();
    cleanup();

    // A guest opens no space: nothing offers one.
    const asGuest = [joined[0] as ClientEvent, fixture("person.joined", 2, { role: "guest" })];
    render(
      <Shell
        store={fakeStore(snapshotOf(asGuest, { awaiting: 0 }))}
        device={asDana}
        files={fakeFiles()}
      />,
    );
    const guest = screen.getByTestId("no-rooms-welcome");
    expect(guest.textContent).toContain("Arjun invited you as a guest.");
    expect(within(guest).queryByRole("button", { name: "Create a space" })).toBeNull();
  });

  it("says who took the reader out of the room they had open, and goes on at OK (JR-6)", () => {
    const asDana: Device = { ...DEVICE, participantId: DANA, displayName: "Dana" };
    const before = [
      fixture("person.joined", 1, {
        participant_id: ARJUN,
        display_name: "Arjun",
        role: "owner",
        invite_id: undefined,
        invited_by: undefined,
        actor: person(ARJUN),
      }),
      fixture("person.joined", 2),
      ...opened().map((event, i) => ({ ...event, seq: 3 + i })),
    ];
    const at = (events: ClientEvent[]) =>
      snapshotOf(events, { model: buildModel(events, { selfId: DANA }), awaiting: 0 });
    const store = fakeStore(at(before));
    render(<Shell store={store} device={asDana} files={fakeFiles()} />);
    expect(screen.getByRole("main", { name: "Space: PO-4471" })).toBeTruthy();

    const out = fixture("membership.removed", 6, { participant_id: DANA, removed_by: ARJUN });
    act(() => store.update(at([...before, out])));
    const notice = screen.getByTestId("removed-from-room");
    expect(notice.textContent).toContain("You're no longer in PO-4471");
    expect(notice.textContent).toContain("Arjun removed you from PO-4471.");
    // It stays until it is read: nothing else is picked out from under it.
    expect(screen.queryByRole("main", { name: /^Space: / })).toBeNull();

    fireEvent.click(within(notice).getByRole("button", { name: "OK" }));
    expect(screen.queryByTestId("removed-from-room")).toBeNull();
    expect(screen.getByTestId("no-rooms-welcome")).toBeTruthy();
  });

  it("draws who came and went as the room's own words, with no name put before them (JR-5)", () => {
    const events = [
      fixture("person.joined", 1, {
        participant_id: ARJUN,
        display_name: "Arjun",
        role: "owner",
        invite_id: undefined,
        invited_by: undefined,
        actor: person(ARJUN),
      }),
      fixture("person.joined", 2),
      ...opened().map((event, i) => ({ ...event, seq: 3 + i })),
      fixture("membership.removed", 6, { participant_id: DANA, removed_by: ARJUN }),
    ];
    renderShell(events, { model: buildModel(events, { selfId: ARJUN }) });
    const lines = screen.getAllByTestId("people-line").map((line) => line.textContent);
    expect(lines).toEqual(["You added Dana", "You removed Dana"]);
  });

  it("keeps picking a room for a workspace that has rooms", () => {
    renderShell(opened(), { awaiting: 0 });
    expect(screen.queryByTestId("no-rooms-none")).toBeNull();
    expect(screen.queryAllByTestId("side-placeholder")).toHaveLength(0);
  });
});

describe("the first run (ADR 0170)", () => {
  const OWNER: Directory = {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun", role: "owner" },
  };
  const CLAW: Connector = {
    id: "openclaw",
    name: "OpenClaw",
    line: "An OpenClaw gateway",
    kind: "one-line",
    command: "CHIPS_JOIN_LINK='{link}' npx chips-openclaw",
    sentence: "Connect yourself to my Chips: run CHIPS_JOIN_LINK='{link}' npx chips-openclaw.",
    capabilities: ["agents", "new_spaces"],
    published: false,
  };
  const forget = forgetFirstRunFlags;

  it("walks the owner of a workspace no agent has joined: name, the docs' gallery, the sentence, the room, the phone", async () => {
    forget();
    onTestFinished(forget);
    const store = fakeStore(snapshotOf([], { directory: OWNER, awaiting: 0 }));
    store.connectorCards = [CLAW];
    // This browser alone: no phone yet, so the phone card is owed.
    const listed = store.devices;
    (store as { devices: Store["devices"] }).devices = async () =>
      (await listed()).filter((each) => each.current);
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);

    const welcome = await screen.findByTestId("first-run");
    await waitFor(() =>
      expect(welcome.textContent).toContain("Chips is running on Arjun's Mac mini"),
    );
    const field = screen.getByTestId("first-run-name-field") as HTMLInputElement;
    expect(field.value).toBe("Arjun");
    fireEvent.change(field, { target: { value: "Arjun G" } });
    fireEvent.click(screen.getByTestId("first-run-continue"));
    await waitFor(() => expect(store.renamed).toEqual(["Arjun G"]));

    // The docs' cards come first, then the two the app carries.
    const cards = (await screen.findAllByRole("button")).filter((each) =>
      each.classList.contains("join-card"),
    );
    expect(cards.map((each) => each.dataset["testid"])).toEqual([
      "join-card-openclaw",
      "join-way-own",
      "join-way-http",
    ]);
    fireEvent.click(screen.getByTestId("join-card-openclaw"));

    // It opens on the sentence, with the link in it, and the switches folded away.
    const sentence = await screen.findByTestId("join-sentence");
    expect(sentence.textContent).toMatch(
      /^Connect yourself to my Chips: run CHIPS_JOIN_LINK='http:\/\/127\.0\.0\.1:4431\/j\/chips_j_testlink1_/,
    );
    expect(screen.getByTestId("join-ask-tab").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId("join-cap-new_spaces")).toBeNull();
    // The link grants what the card says its connector needs, in the order the switches show.
    expect(store.linksMade).toEqual([["new_spaces", "agents"]]);
    fireEvent.click(screen.getByTestId("join-line-tab"));
    expect(screen.getByTestId("join-command").textContent).toContain("npx chips-openclaw");
    const open = screen.getByTestId("join-open-room") as HTMLButtonElement;
    expect(open.disabled).toBe(true);

    // Redeemed, with its room: the room opens, and the phone card is the third of three.
    const made = [...(store.getSnapshot().joins?.values() ?? [])][0] as JoinRequest;
    act(() =>
      store.update({
        ...store.getSnapshot(),
        joins: new Map([
          [
            made.requestId,
            { ...made, state: "redeemed", name: "OpenClaw", spaceId: HOME, harnessId: SCOUT },
          ],
        ]),
      }),
    );
    expect(open.textContent).toBe("Open OpenClaw's space");
    fireEvent.click(open);
    await waitFor(() => expect(screen.queryByTestId("first-run")).toBeNull());
    const phone = await screen.findByTestId("phone-offer");
    expect(phone.textContent).toContain("3 of 3");
    expect(phone.textContent).toContain("Get Chips on your phone");
    const qr = await within(phone).findByRole("img");
    expect(qr.dataset["link"]).toMatch(/^chips:\/\/pair\?pair=QRS-789&v=1&lan=/);
    expect(qr.dataset["link"]).toContain("relay=wss%3A%2F%2Frelay.example");
    fireEvent.click(within(phone).getByTestId("phone-offer-later"));
    await waitFor(() => expect(screen.queryByTestId("phone-offer")).toBeNull());

    // Through it once, this device doesn't welcome again.
    cleanup();
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    await screen.findByTestId("setup-card");
    expect(screen.queryByTestId("first-run")).toBeNull();
  });

  it("skips to the setup card, which says what is left and is hidden on this device", async () => {
    forget();
    onTestFinished(forget);
    const store = fakeStore(snapshotOf([], { directory: OWNER, awaiting: 0 }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(await screen.findByTestId("first-run-continue"));
    fireEvent.click(await screen.findByTestId("first-run-skip"));
    await waitFor(() => expect(screen.queryByTestId("first-run")).toBeNull());

    const card = await screen.findByTestId("setup-card");
    // Running, this browser, and the phone the fake lists; no agent, no banners, no relay.
    expect(within(card).getByTestId("setup-count").textContent).toBe("3 of 6");
    expect(within(card).getByTestId("setup-running").textContent).toContain("on Arjun's Mac mini");
    expect(within(card).getByTestId("setup-hello").dataset["done"]).toBe("false");
    // Add one opens the welcome again, at the gallery.
    fireEvent.click(within(within(card).getByTestId("setup-hello")).getByRole("button"));
    expect(await screen.findByTestId("join-gallery")).toBeTruthy();
    fireEvent.click(screen.getByTestId("first-run-skip"));

    fireEvent.click(await screen.findByTestId("setup-hide"));
    await waitFor(() => expect(screen.queryByTestId("setup-card")).toBeNull());
    cleanup();
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    await act(async () => undefined);
    expect(screen.queryByTestId("setup-card")).toBeNull();
  });

  it("welcomes nobody who isn't the owner, and no owner whose workspace has agents", async () => {
    forget();
    onTestFinished(forget);
    renderShell(opened(), {
      directory: {
        ...DIRECTORY,
        [ARJUN]: { ...OWNER[ARJUN], displayName: "Arjun" } as Participant,
      },
    });
    await act(async () => undefined);
    expect(screen.queryByTestId("first-run")).toBeNull();
    cleanup();
    const asDana: Device = { ...DEVICE, participantId: DANA };
    render(
      <Shell
        store={fakeStore(
          snapshotOf([], {
            directory: { ...OWNER, [DANA]: DIRECTORY[DANA] as Participant },
            awaiting: 0,
          }),
        )}
        device={asDana}
        files={fakeFiles()}
      />,
    );
    await act(async () => undefined);
    expect(screen.queryByTestId("first-run")).toBeNull();
    expect(screen.queryByTestId("setup-card")).toBeNull();
  });
});

describe("Select on the rail and the Agents page (ADR 0181, ADR 0182)", () => {
  const PLANS = "spc_01K4ZQPX0000000000000SELB";
  const TAXES = "spc_01K4ZQPX0000000000000SELC";
  const OLD = "spc_01K4ZQPX0000000000000SELD";
  const NOTES = "spc_01K4ZQPX0000000000000SELE";
  const id = (seq: number) => `evt_01K4ZQPX0000000000000SEL${String(seq).padStart(2, "0")}`;
  /** PO-4471, Plans, Notes, Taxes with its changes locked, and Old, archived. */
  function rooms(): ClientEvent[] {
    const made = (seq: number, spaceId: string, title: string) =>
      fixture("space.created", seq, {
        id: id(seq),
        space_id: spaceId,
        actor: person(ARJUN),
        title,
        kind: "group",
      });
    const archived = fixture("space.updated", 8, {
      id: id(8),
      space_id: OLD,
      actor: person(ARJUN),
      state: "closed",
    });
    delete (archived as Record<string, unknown>)["title"];
    return [
      ...opened(),
      made(4, PLANS, "Plans"),
      made(5, TAXES, "Taxes"),
      made(6, OLD, "Old"),
      made(9, NOTES, "Notes"),
      fixture("space.lock_set", 7, {
        id: id(7),
        space_id: TAXES,
        actor: person(ARJUN),
        locked: true,
      }),
      archived,
    ];
  }
  const row = (name: string) => within(sidebar()).getByRole("button", { name: new RegExp(name) });
  const checkbox = (name: string) =>
    within(sidebar()).getByRole("checkbox", { name: new RegExp(name) });

  it("picks rooms on the rail, says how many, and archives them once asked", async () => {
    const store = renderShell(rooms());
    fireEvent.click(screen.getByTestId("select-spaces"));
    expect(screen.getByTestId("recent-heading").textContent).toBe("Select spaces");
    // The rows are checkboxes now: a click picks, and opens nothing.
    fireEvent.click(checkbox("Plans"));
    fireEvent.click(checkbox("PO-4471"));
    expect(checkbox("Plans").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("recent-heading").textContent).toBe("2 selected");
    expect(screen.getByTestId("pick-archive").textContent).toBe("Archive 2");
    expect(screen.getByTestId("pick-delete").textContent).toBe("Delete 2");

    fireEvent.click(screen.getByTestId("pick-archive"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Archive 2 spaces?");
    fireEvent.click(within(dialog).getByTestId("confirm-go"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(store.spaceUpdates).toHaveLength(2);
    expect(store.spaceUpdates).toEqual(
      expect.arrayContaining([
        { spaceId: SPACE, state: "closed" },
        { spaceId: PLANS, state: "closed" },
      ]),
    );
    // Done: the rail stops picking.
    expect(screen.getByTestId("recent-heading").textContent).toBe("Recent");
    expect(within(sidebar()).queryByRole("checkbox")).toBeNull();
  });

  it("says why a locked room can't be picked, and Select all takes the rest shown", () => {
    renderShell(rooms());
    fireEvent.click(screen.getByTestId("select-spaces"));
    expect(screen.getByTestId("pick-hint").textContent).toContain("Locked spaces can't be picked");
    const taxes = row("Taxes");
    expect(taxes.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(taxes);
    expect(screen.getByTestId("pick-note").textContent).toBe(
      "Taxes is locked. Unlock it in its details to archive or delete it.",
    );
    fireEvent.click(screen.getByTestId("pick-hint-all"));
    // The archived room is folded away, so all is the open ones that may be picked.
    expect(screen.getByTestId("recent-heading").textContent).toBe("3 selected");
    expect(screen.getByTestId("pick-hint-all").textContent).toBe("Deselect all");
  });

  it("unarchives at once where every room picked is archived, and Escape ends picking", () => {
    const store = renderShell(rooms());
    fireEvent.click(screen.getByTestId("archived-toggle"));
    fireEvent.click(screen.getByTestId("select-spaces"));
    fireEvent.click(checkbox("Old"));
    const unarchive = screen.getByTestId("pick-unarchive");
    expect(unarchive.textContent).toBe("Unarchive 1");
    fireEvent.click(unarchive);
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(store.spaceUpdates).toEqual([{ spaceId: OLD, state: "open" }]);

    fireEvent.click(screen.getByTestId("select-spaces"));
    fireEvent.click(checkbox("Plans"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(within(sidebar()).queryByRole("checkbox")).toBeNull();
  });

  it("reads every room from Read all, locked and archived ones too, or only the rooms picked", () => {
    const said = (seq: number, spaceId: string) =>
      fixture("message.post", seq, {
        id: id(seq),
        space_id: spaceId,
        actor: person(DANA),
        text: "Anyone?",
      });
    const store = renderShell([...rooms(), said(10, PLANS), said(11, TAXES), said(12, OLD)]);
    fireEvent.click(screen.getByTestId("select-spaces"));
    const read = () => screen.getByTestId("pick-read");
    expect(read().textContent).toBe("Read all");
    fireEvent.click(read());
    // PO-4471's joins are unread too.
    expect(store.readMany.map((ids) => [...ids].sort())).toEqual([
      [SPACE, OLD, PLANS, TAXES].sort(),
    ]);
    // Done: the rail stops picking.
    expect(within(sidebar()).queryByRole("checkbox")).toBeNull();

    fireEvent.click(screen.getByTestId("select-spaces"));
    fireEvent.click(checkbox("Notes"));
    // Nothing unread in it: Read waits, greyed.
    expect(read().textContent).toBe("Read");
    expect(read().hasAttribute("disabled")).toBe(true);
    fireEvent.click(checkbox("Plans"));
    expect(read().textContent).toBe("Read 1");
    fireEvent.click(read());
    expect(store.readMany.at(-1)).toEqual([PLANS]);
  });

  it("picks every room between with a shift-click", () => {
    renderShell(rooms());
    fireEvent.click(screen.getByTestId("select-spaces"));
    const picks = within(screen.getByTestId("space-list")).getAllByRole("checkbox");
    expect(picks).toHaveLength(3);
    fireEvent.click(picks[0] as HTMLElement);
    fireEvent.click(picks[2] as HTMLElement, { shiftKey: true });
    // The one between was not clicked, and is picked too; the locked room between is not.
    expect(screen.getByTestId("recent-heading").textContent).toBe("3 selected");
  });

  it("deletes room by room, and keeps in the dialog the one the server refused, with why", async () => {
    const store = renderShell(rooms());
    Object.assign(store, {
      eraseSpace: async (spaceId: string) => {
        if (spaceId === PLANS) throw new Error("Only its owner may delete it.");
        store.erased.push(spaceId);
      },
    });
    fireEvent.click(screen.getByTestId("select-spaces"));
    fireEvent.click(checkbox("Plans"));
    fireEvent.click(checkbox("PO-4471"));
    fireEvent.click(screen.getByTestId("pick-delete"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Delete 2 spaces?");
    fireEvent.click(within(dialog).getByTestId("confirm-go"));
    expect((await screen.findByTestId("confirm-failed")).textContent).toBe(
      "1 deleted. Plans was not deleted: Only its owner may delete it.",
    );
    expect(store.erased).toEqual([SPACE]);
    // What is left to ask about is the one refused.
    expect(within(dialog).getByRole("heading").textContent).toBe("Delete Plans?");
  });

  describe("on the Agents page", () => {
    const TREE = "agt_01K4ZQPX0000000000000TREE";
    const ELM = "agt_01K4ZQPX00000000000000ELM";
    const OAK = "agt_01K4ZQPX00000000000000OAK";
    const MAIN = "agt_01K4ZQPX0000000000000MAIN";
    const agents: Directory = {
      ...DIRECTORY,
      [MAIN]: { id: MAIN, kind: "agent", harnessId: SCOUT, displayName: "Scout", lead: true },
      [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: null },
      [ELM]: { id: ELM, kind: "agent", harnessId: SCOUT, displayName: "Elm", room: null },
      [OAK]: {
        id: OAK,
        kind: "agent",
        harnessId: SCOUT,
        displayName: "Oak",
        archived: true,
        room: null,
      },
    };
    const page = () => {
      const store = renderShell(opened(), { directory: agents });
      fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
      fireEvent.click(screen.getByTestId("select-agents"));
      return store;
    };
    /** The page's own bar, not the rail's, which stands shut at the rail's foot. */
    const onPage = () => within(screen.getByRole("main", { name: "Agents" }));

    it("picks agents, never the Main agent, and archives them once asked", async () => {
      const store = page();
      expect(screen.getByTestId("agents-title").textContent).toBe("Select agents");
      fireEvent.click(screen.getByTestId(`agent-${MAIN}`));
      expect(onPage().getByTestId("pick-note").textContent).toBe(
        "Scout is its harness's Main agent: it can't be archived or deleted.",
      );
      fireEvent.click(screen.getByTestId(`agent-${TREE}`));
      fireEvent.click(screen.getByTestId(`agent-${ELM}`));
      expect(screen.getByTestId("agents-title").textContent).toBe("2 selected");
      fireEvent.click(onPage().getByTestId("pick-archive"));
      const dialog = screen.getByTestId("confirm-dialog");
      expect(within(dialog).getByRole("heading").textContent).toBe("Archive 2 agents?");
      fireEvent.click(within(dialog).getByTestId("confirm-go"));
      await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
      // In the page's order, which is the order the server is asked in.
      expect(store.agentsArchived).toEqual([
        { agentId: ELM, archived: true },
        { agentId: TREE, archived: true },
      ]);
      expect(screen.getByTestId("agents-title").textContent).toBe("Agents");
    });

    it("never picks an agent whose changes are locked, and says why when it is clicked (ADR 0199)", () => {
      renderShell(opened(), {
        directory: { ...agents, [ELM]: { ...agents[ELM], locked: true } as Directory[string] },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Agents/ }));
      fireEvent.click(screen.getByTestId("select-agents"));
      // It steps back, as a locked room on the rail does: no circle, and not a checkbox.
      const elm = screen.getByTestId(`agent-${ELM}`);
      expect(elm.getAttribute("data-mark")).toBe("none");
      expect(elm.getAttribute("role")).toBeNull();
      fireEvent.click(elm);
      expect(onPage().getByTestId("pick-note").textContent).toBe(
        "Elm is locked. Unlock it on its card to archive or delete it.",
      );
      expect(screen.getByTestId("agents-title").textContent).toBe("Select agents");
      // It is not somebody else's agent, so the line under the heading doesn't say so.
      expect(onPage().getByTestId("pick-hint").textContent).not.toContain("Others'");
      // Select all picks the rest.
      fireEvent.click(onPage().getByTestId("pick-hint-all"));
      expect(screen.getByTestId("agents-title").textContent).toBe("1 selected");
    });

    it("picks archived agents in their fold, unarchives them at once, and deletes a mix", async () => {
      const store = page();
      fireEvent.click(screen.getByTestId("archived-agents"));
      fireEvent.click(screen.getByTestId("archived-elsewhere"));
      fireEvent.click(screen.getByTestId(`agent-${OAK}`));
      fireEvent.click(onPage().getByTestId("pick-unarchive"));
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
      await waitFor(() =>
        expect(store.agentsArchived).toEqual([{ agentId: OAK, archived: false }]),
      );

      fireEvent.click(screen.getByTestId("select-agents"));
      fireEvent.click(screen.getByTestId(`agent-${OAK}`));
      fireEvent.click(screen.getByTestId(`agent-${TREE}`));
      // With one not archived among them, the first act is Archive, for that one.
      expect(onPage().getByTestId("pick-archive").textContent).toBe("Archive 1");
      fireEvent.click(onPage().getByTestId("pick-delete"));
      const dialog = screen.getByTestId("confirm-dialog");
      expect(within(dialog).getByRole("heading").textContent).toBe("Delete 2 agents?");
      fireEvent.click(within(dialog).getByTestId("confirm-go"));
      await waitFor(() =>
        expect(store.agentsDeleted).toEqual([
          { agentId: TREE, deleteRoom: false },
          { agentId: OAK, deleteRoom: false },
        ]),
      );
    });
  });
});

describe("a reply in the room (ADR 0219)", () => {
  const ASKED = "evt_01K4ZQPX000000000000000067";
  const REPLY = "evt_01K4ZQPX000000000000000068";
  const room = () => [
    ...opened(),
    fixture("message.post", 4),
    fixture("message.post", 5, {
      id: REPLY,
      actor: person(ARJUN),
      run_id: undefined,
      text: "Make it 8 people",
      reply_to: "msg_01K4ZQPX000000000000000067",
    }),
  ];
  const row = (id: string) =>
    screen.getByTestId("messages").querySelector(`[data-line="${id}"]`) as HTMLElement;

  it("quotes the message a reply answers inside its bubble, and says under that one it has a reply", () => {
    renderShell(room());
    const card = within(row(REPLY)).getByTestId(`reply-card-${ASKED}`);
    expect(card.closest(".bub")).not.toBeNull();
    expect(card.textContent).toContain("Scout · 2 Sep");
    expect(card.textContent).toContain("The PO is for 120 units");
    expect(card.tagName).toBe("BUTTON");
    expect(within(row(ASKED)).getByTestId(`replies-${REPLY}`).textContent).toBe("1 reply");
  });

  it("goes to the message on a click, lights it, and the pill goes back to the reply", () => {
    renderShell(room());
    fireEvent.click(within(row(REPLY)).getByTestId(`reply-card-${ASKED}`));
    expect(row(ASKED).dataset["focused"]).toBe("true");
    const pill = screen.getByTestId("back-pill");
    expect(pill.textContent).toBe("Back to your reply");
    fireEvent.click(pill);
    expect(row(REPLY).dataset["focused"]).toBe("true");
    expect(screen.getByTestId("back-pill").dataset["leaving"]).toBe("true");
  });

  it("says the reply is someone else's when it is", () => {
    renderShell([
      ...opened(),
      fixture("message.post", 4, { actor: person(ARJUN), run_id: undefined, text: "Hold it" }),
      fixture("message.post", 5, {
        id: REPLY,
        text: "Held for 8",
        reply_to: "msg_01K4ZQPX000000000000000067",
      }),
    ]);
    fireEvent.click(within(row(REPLY)).getByTestId(`reply-card-${ASKED}`));
    expect(screen.getByTestId("back-pill").textContent).toBe("Back to the reply");
  });

  it("lights a message already in view where it is, with no pill back", () => {
    // Every row, and the window, a hundred pixels from the top: all of it in view.
    const box = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 100 }));
    try {
      renderShell(room());
      fireEvent.click(within(row(REPLY)).getByTestId(`reply-card-${ASKED}`));
      expect(row(ASKED).dataset["focused"]).toBe("true");
      expect(screen.queryByTestId("back-pill")).toBeNull();
    } finally {
      box.mockRestore();
    }
  });

  it("lets the pill go on a send", () => {
    renderShell(room());
    fireEvent.click(within(row(REPLY)).getByTestId(`reply-card-${ASKED}`));
    const box = screen.getByRole("textbox", { name: /^Message / });
    fireEvent.change(box, { target: { value: "And a window table" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByTestId("back-pill").dataset["leaving"]).toBe("true");
  });

  it("goes to the newest reply from the mark", () => {
    renderShell(room());
    fireEvent.click(within(row(ASKED)).getByTestId(`replies-${REPLY}`));
    expect(row(REPLY).dataset["focused"]).toBe("true");
    expect(screen.queryByTestId("back-pill")).toBeNull();
  });

  it("says a message taken back, and goes nowhere from it", () => {
    renderShell([
      ...room(),
      fixture("message.deleted", 6, { message_id: "msg_01K4ZQPX000000000000000067" }),
    ]);
    const card = within(row(REPLY)).getByTestId(`reply-card-${ASKED}`);
    expect(card.textContent).toContain("Deleted message");
    expect(card.tagName).toBe("SPAN");
  });
});

describe("starting a reply (ADR 0219, phase 4)", () => {
  const ASKED = "evt_01K4ZQPX000000000000000067";
  const DANAS = "evt_01K4ZQPX000000000000000068";
  // Scout's message from 2 September, then Dana's: Scout and Dana are two others, so the field aims.
  const room = () => [
    ...opened(),
    fixture("message.post", 4),
    fixture("message.post", 5, {
      id: DANAS,
      actor: person(DANA),
      run_id: undefined,
      text: "Can I bring two more?",
    }),
  ];
  const row = (id: string) =>
    screen.getByTestId("messages").querySelector(`[data-line="${id}"]`) as HTMLElement;
  const field = () => screen.getByRole("textbox", { name: /^Message / });
  const capsule = () => screen.getByRole("button", { name: /^To / });
  const strip = () => screen.queryByTestId("reply-strip");
  const replyFrom = (id: string) => fireEvent.click(within(row(id)).getByTestId("line-reply"));
  function send(text: string) {
    fireEvent.change(field(), { target: { value: text } });
    fireEvent.keyDown(field(), { key: "Enter" });
  }

  it("offers Reply first in a line's menu, and beside its ⋯", () => {
    renderShell(room());
    fireEvent.click(within(row(ASKED)).getByTestId("line-more"));
    expect(labelsOf(screen.getByTestId("line-menu"))[0]).toBe("Reply");
    closeMenu();
    expect(within(row(ASKED)).getByRole("button", { name: "Reply" })).toBeTruthy();
  });

  it("holds the message in the field: whose, the day it was said, and its words", () => {
    renderShell(room());
    fireEvent.click(within(row(ASKED)).getByTestId("line-more"));
    fireEvent.click(
      within(screen.getByTestId("line-menu")).getByRole("menuitem", { name: "Reply" }),
    );
    const held = strip() as HTMLElement;
    expect(held.textContent).toContain("Replying to Scout · 2 Sep");
    expect(held.textContent).toContain("The PO is for 120 units");
    expect(document.activeElement).toBe(field());
    // Another replaces it.
    replyFrom(DANAS);
    expect(strip()?.textContent).toContain("Replying to Dana · 2 Sep");
  });

  it("lets the reply go on its ×, and on Escape in the words", () => {
    renderShell(room());
    replyFrom(ASKED);
    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(strip()).toBeNull();
    replyFrom(ASKED);
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(strip()).toBeNull();
  });

  it("sends a reply to an agent's message for that agent, with no to, and lets it go", () => {
    const store = renderShell(room());
    replyFrom(ASKED);
    expect(capsule().getAttribute("aria-label")).toBe("To Scout, by reply");
    send("Make it 8 people");
    expect(store.sent.at(-1)).toEqual({
      spaceId: SPACE,
      text: "Make it 8 people",
      addressedTo: [SCOUT],
      replyTo: ASKED,
    });
    expect(strip()).toBeNull();
  });

  it("goes where the capsule was told when it was told after the reply", () => {
    const store = renderShell(room());
    replyFrom(ASKED);
    fireEvent.click(capsule());
    fireEvent.click(screen.getByRole("option", { name: /^Dana/ }));
    expect(capsule().getAttribute("aria-label")).toMatch(/^To Dana/);
    expect(capsule().getAttribute("aria-label")).not.toContain("by reply");
    send("Over to you");
    expect(store.sent.at(-1)).toMatchObject({ to: [DANA], replyTo: ASKED });
  });

  it("changes nothing about who a reply to a person's message is for", () => {
    const store = renderShell(room());
    replyFrom(DANAS);
    expect(capsule().getAttribute("aria-label")).not.toContain("by reply");
    send("Yes, bring them");
    expect(store.sent.at(-1)).toMatchObject({ replyTo: DANAS });
    expect(store.sent.at(-1)).toHaveProperty("to");
  });

  it("offers no reply to a message taken back", () => {
    renderShell([
      ...room(),
      fixture("message.deleted", 6, { message_id: "msg_01K4ZQPX000000000000000067" }),
    ]);
    expect(within(row(ASKED)).queryByTestId("line-reply")).toBeNull();
  });
});

describe("Search beside its results on a wide window (ADR 0269)", () => {
  const MINE = "evt_01K4ZQPX000000000000000068";
  const room = () => [
    ...opened(),
    fixture("message.post", 4),
    fixture("message.post", 5, { id: MINE, actor: person(ARJUN), text: "Thanks." }),
  ];
  /** A window over the width Search splits at, as the media query answers it. */
  const wide = () =>
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  it("opens a hit's room beside the results, at its line, and Open in Spaces takes it there", async () => {
    wide();
    try {
      const store = renderShell(room());
      store.found = {
        hits: [
          {
            kind: "message",
            spaceId: SPACE,
            at: "2026-09-02T14:25:00.000Z",
            snippet: "\u{E000}Thanks\u{E001}.",
            lineId: MINE,
            authorId: ARJUN,
          },
        ],
        nextCursor: null,
      };
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      const pane = screen.getByTestId("search-pane");
      expect(within(pane).queryByTestId("messages")).toBeNull();
      fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
        target: { value: "thanks" },
      });
      expect(within(pane).getByTestId("search-nothing-open").textContent).toContain(
        "Choose a result on the left.",
      );
      fireEvent.click(await screen.findByTestId("search-hit"));
      // The room beside the results, at the line, with the search still there to go on with.
      const messages = within(screen.getByTestId("search-pane")).getByTestId("messages");
      expect(messages.querySelector(`[data-line="${MINE}"]`)?.getAttribute("data-focused")).toBe(
        "true",
      );
      expect(screen.getByTestId("search-hit").getAttribute("aria-current")).toBe("true");
      expect(screen.getByLabelText("Search spaces, agents and messages")).toBeTruthy();
      fireEvent.click(screen.getByTestId("open-in-spaces"));
      expect(screen.queryByTestId("search-split")).toBeNull();
      expect(screen.getByTestId("messages")).toBeTruthy();
      expect(screen.queryByTestId("open-in-spaces")).toBeNull();
      // Back on Search, what was open beside the results still is.
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      expect(within(screen.getByTestId("search-pane")).getByTestId("messages")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens an agent's card beside the results, and its history in the card's place (ADR 0270)", async () => {
    wide();
    try {
      const TREE = "agt_01K4ZQPX0000000000000TREE";
      const store = renderShell(room(), {
        directory: {
          ...DIRECTORY,
          [TREE]: { id: TREE, kind: "agent", harnessId: SCOUT, displayName: "Tree", room: SPACE },
        },
      });
      Object.assign(store, {
        agentStays: async () => [
          {
            readable: true,
            spaceId: SPACE,
            fromSeq: 1,
            toSeq: null,
            from: "2026-09-02T14:00:00.000Z",
            to: null,
            lines: 2,
          },
        ],
      });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      fireEvent.change(screen.getByLabelText("Search spaces, agents and messages"), {
        target: { value: "tree" },
      });
      fireEvent.click(await screen.findByTestId(`result-agent-${TREE}`));
      const pane = within(screen.getByTestId("search-pane"));
      expect(pane.getByRole("heading", { name: "Tree", level: 1 })).toBeTruthy();
      const row = pane.getByTestId("agent-history");
      await waitFor(() => expect(row.textContent).toBe("Message history1 space›"));
      fireEvent.click(row);
      expect(pane.getByRole("heading", { name: "Message history", level: 1 })).toBeTruthy();
      fireEvent.click(pane.getByRole("button", { name: "‹ Tree" }));
      expect(pane.getByTestId("agent-card")).toBeTruthy();
      // Its face's page too, in the card's place (ADR 0272).
      fireEvent.click(pane.getByRole("button", { name: "Tree's icon" }));
      expect(pane.getByRole("main", { name: "Tree: Icon" })).toBeTruthy();
      fireEvent.click(pane.getByRole("button", { name: "‹ Tree" }));
      expect(pane.getByTestId("agent-card")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Change icon on a room's row in the rail (ADR 0264's addendum)", () => {
  const row = () => document.querySelector<HTMLElement>(`[data-space="${SPACE}"]`) as HTMLElement;

  it("opens the room with its sheet on the Icon page, where a pick saves at once", () => {
    const store = fakeStore(snapshotOf(opened()));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.contextMenu(row(), { clientX: 40, clientY: 200 });
    const menu = screen.getByTestId("row-menu");
    expect(within(menu).getAllByRole("menuitem")[0]?.textContent).toBe("Change icon");
    fireEvent.click(within(menu).getByTestId("row-act-icon"));

    const sheet = screen.getByTestId("room-sheet");
    expect(within(sheet).getByTestId("room-sheet-icon-page")).toBeTruthy();
    expect(within(sheet).getByRole("heading", { name: "Icon" })).toBeTruthy();
    // The picker's head is the room's row: its name, and who is here under it.
    expect(sheet.querySelector(".face-head")?.textContent).toContain("PO-4471");
    fireEvent.click(within(sheet).getByTestId("mark-rocket"));
    expect(store.iconsSet.map((each) => [each.spaceId, each.icon?.icon])).toEqual([
      [SPACE, "rocket"],
    ]);

    // Back is the sheet's first page, whose face, pressed, opens the Icon page again.
    fireEvent.click(within(sheet).getByTestId("room-sheet-icon-back"));
    expect(within(sheet).queryByTestId("room-sheet-icon-page")).toBeNull();
    const face = within(sheet).getByTestId("room-sheet-icon");
    expect(face.getAttribute("aria-label")).toBe("Change icon");
    fireEvent.click(face);
    expect(within(sheet).getByTestId("room-sheet-icon-page")).toBeTruthy();
  });

  it("says on the Icon page why a pick did not stick", async () => {
    const store = fakeStore(snapshotOf(opened()));
    Object.assign(store, {
      setSpaceIcon: () => Promise.reject(new Error("This isn't in the demo.")),
    });
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByTestId("room-sheet-icon"));
    fireEvent.click(within(sheet).getByTestId("mark-rocket"));
    const failed = await within(sheet).findByTestId("icon-failed");
    expect(failed.textContent).toContain("This isn't in the demo.");
  });
});

describe("sections change places in a fade-through (ADR 0274)", () => {
  /** A screen to ask, with no Reduce Motion: what moves, moves. */
  const moving = () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
  };
  /** The section's turns: the one going, if any, and the one coming. */
  const sections = () => [...document.querySelectorAll(".shell > .turns > .turn")];

  it("fades through to another section, which takes clicks at once, and not to the one on screen", () => {
    moving();
    renderShell(opened());
    const agents = () => within(sidebar()).getByRole("button", { name: "Agents" });
    fireEvent.click(agents());
    const [going, coming] = sections();
    // The room going stays as it was drawn, under the Agents page, with nothing in it to find.
    expect(going?.getAttribute("data-turn")).toBe("going");
    expect(going?.getAttribute("data-way")).toBe("through");
    expect(going?.hasAttribute("inert")).toBe(true);
    expect(going?.getAttribute("aria-hidden")).toBe("true");
    expect(going?.querySelector("[data-testid]")).toBeNull();
    expect(going?.textContent).toContain("PO-4471");
    expect(coming?.getAttribute("data-turn")).toBe("through");
    expect(agents().dataset["active"]).toBe("true");
    // Once it has come the room is gone; the section on screen again turns nothing.
    fireEvent.animationEnd(coming as Element);
    expect(sections()).toHaveLength(1);
    fireEvent.click(agents());
    expect(sections()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("you"));
    expect(sections().map((turn) => turn.getAttribute("data-turn"))).toEqual(["going", "through"]);
    expect(screen.getByRole("main", { name: "You" })).toBeTruthy();
  });

  it("carries You's relay card with it, from the setup card's Away from home", async () => {
    forgetFirstRunFlags();
    onTestFinished(forgetFirstRunFlags);
    const owner: Directory = {
      [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun", role: "owner" },
    };
    const store = fakeStore(snapshotOf([], { directory: owner, awaiting: 0 }));
    render(<Shell store={store} device={DEVICE} files={fakeFiles()} />);
    fireEvent.click(await screen.findByTestId("first-run-continue"));
    fireEvent.click(await screen.findByTestId("first-run-skip"));
    const card = await screen.findByTestId("setup-card");
    moving();
    fireEvent.click(within(within(card).getByTestId("setup-away")).getByRole("button"));
    // You, opened at its relay page: the ask made it through the change of section whole.
    await waitFor(() => expect(document.querySelector('[aria-label="Relay"]')).not.toBeNull());
    expect(screen.getByTestId("you").dataset["active"]).toBe("true");
  });
});
