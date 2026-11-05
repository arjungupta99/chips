/**
 * What the HTTP layer carries: the dependencies a route may reach, and the per-request values
 * Hono puts on the context.
 *
 * These live here rather than in `app.ts` so that routes and the app can both depend on them
 * without depending on each other. `dependency-cruiser` found the cycle the moment the second
 * route file was written, which is the point of having it.
 */

import type { ChipsConfig, ChipsInstruments, LeadingClock, Logger } from "@chipschat/platform";
import type {
  AddHarness,
  ArchiveAgent,
  AskAgent,
  AskCompaction,
  AskContextEdit,
  AskHeartbeatChange,
  AskJobChange,
  AskModelChange,
  AskWindowChange,
  Authenticator,
  BlobStore,
  Clock,
  DeclareCapabilities,
  DeleteAccount,
  DeleteAgent,
  DeviceRegistry,
  DirectAsks,
  EraseSpace,
  EventStore,
  FanOut,
  ForkAgent,
  HarnessTokens,
  IdGenerator,
  Invites,
  JoinRequests,
  JoinWorkspace,
  LeadTurns,
  MacApp,
  MoveAgent,
  NotificationRegistry,
  OneRoom,
  OpenSpace,
  PageTickets,
  PairDevice,
  PairingCodes,
  Passkeys,
  PeopleRegistry,
  Playables,
  PostJobRuns,
  Presence,
  Principal,
  ProjectDoor,
  PushRegistry,
  PushStanding,
  PutAgentContextWindow,
  PutAgentHeartbeat,
  PutAgentModel,
  PutContext,
  PutHarnessJobs,
  ReadAgentContextWindow,
  ReadAgentHeartbeat,
  ReadAgentModel,
  ReadContext,
  ReadContextEdit,
  ReadHarnessJobs,
  ReadJobRuns,
  ReadModels,
  RelaySwitchUseCase,
  RemoveHarness,
  RemovePerson,
  RenameAgent,
  RenamePerson,
  RenameWorkspace,
  RestartHarness,
  SessionPinRegistry,
  Sessions,
  SetAgentFace,
  SetAgentLock,
  SetExchange,
  SetLead,
  SetLock,
  SetPersonFace,
  SetSpendCeiling,
  SocketTickets,
  SubmitEvent,
  Sweep,
  TransferHarness,
  UpgradeAgents,
  UpgradeNames,
  UpgradeOneRoom,
  Uploads,
  UploadsRegistry,
  WaitForApproval,
} from "../../application/index.js";
import type { HiddenSpaceRegistry } from "../../application/ports/hidden-spaces.js";
import type { PinnedSpaceRegistry } from "../../application/ports/pinned-spaces.js";
import type { PageBuilder } from "../../application/ports/projects.js";
import type { ReadMarkRegistry } from "../../application/ports/read-marks.js";
import type { RelayStatus, RelayTrouble } from "../../application/ports/relay-switch.js";
import type { SpaceIconRegistry } from "../../application/ports/space-icons.js";
import type { ConnectorGallery } from "../../infrastructure/connectors/gallery.js";

export type { RelayStatus, RelayTrouble } from "../../application/ports/relay-switch.js";

/** The relay as the routes see it (M4.1, ADR 0038): where, the key, and whether it is up. */
export interface RelayFacts {
  /** `CHIPS_RELAY_URL`, when set. */
  readonly url: string | undefined;
  /** The server's tunnel key, base64url, made on first use and kept (ADR 0039). */
  readonly publicKey: () => Promise<string>;
  readonly status: () => RelayStatus;
  /** Why it isn't connected while it is on: what the relay link's last try heard. */
  readonly trouble: () => RelayTrouble | undefined;
}

export interface GatewayDeps {
  readonly config: ChipsConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly store: EventStore;
  readonly fanOut: FanOut;
  readonly readModels: ReadModels;
  readonly authenticator: Authenticator;
  readonly submitEvent: SubmitEvent;
  readonly waitForApproval: WaitForApproval;
  /** Resolves what nobody answered in time. The gateway runs it on a timer; a test calls it. */
  readonly sweep: Sweep;
  /** Hands a room's lead what was nobody's turn once the room goes still (ADR 0104); on the same timer. */
  readonly leadTurns: LeadTurns;
  /** Add harness, Custom: a person names a harness and gets its token once (M1.6). */
  readonly addHarness: AddHarness;
  /** The space a harness works in, found or opened by the key its adapter names it with (M2.3). */
  readonly openSpace: OpenSpace;
  /** The upgrade to agents (ADR 0087, point 9): its plan, and doing it. `chipsd upgrade agents`. */
  readonly upgradeAgents: UpgradeAgents;
  /** Settle what Phase 2 left in more rooms than one (ADR 0087, Phase 4). */
  readonly upgradeOneRoom: UpgradeOneRoom;
  /** Number the agents that share a name, once (ADR 0091): `chipsd upgrade names`. */
  readonly upgradeNames: UpgradeNames;
  /**
   * What follows an agent's moves (ADR 0087): the reactions, the one step that stops its work as
   * it leaves a room, and the settle run at each start (agents review, findings 7, 10 and 12).
   */
  readonly oneRoom: OneRoom;
  /** Move an agent into a room (ADR 0087, Phase 4). */
  readonly moveAgent: MoveAgent;
  /** Ask an agent's harness for a copy of it in a room (ADR 0087, Fork). */
  readonly forkAgent: ForkAgent;
  /** Ask a harness for a new agent in a room (ADR 0108). */
  readonly askAgent: AskAgent;
  /** Give an agent a face, or its initials back (ADR 0089). */
  readonly setAgentFace: SetAgentFace;
  /** Rename an agent, for everybody, against its harness's name for it (ADR 0091). */
  readonly renameAgent: RenameAgent;
  /** `PUT /v1/agents/:id/state`: a person archives an agent or brings it back (ADR 0095). */
  readonly archiveAgent: ArchiveAgent;
  /** `DELETE /v1/agents/:id`: a person deletes an agent, and its room when asked (ADR 0095). */
  readonly deleteAgent: DeleteAgent;
  /**
   * `POST /v1/agents/:id/lock`: a person locks an agent's changes, so nobody renames, archives or
   * deletes it, or lets them go (ADR 0199).
   */
  readonly setAgentLock: SetAgentLock;
  /** `POST /v1/spaces/:id/exchange`: a person pauses the agents in a room, or lets them go on (ADR 0097). */
  readonly setExchange: SetExchange;
  /** `POST /v1/spaces/:id/lead`: a person chooses who leads a room, or that nobody does (ADR 0104). */
  readonly setLead: SetLead;
  /**
   * `POST /v1/spaces/:id/spend-ceiling`: a person sets what a room allows a job, or sets it back to
   * the default (ADR 0117).
   */
  readonly setSpendCeiling: SetSpendCeiling;
  /**
   * `POST /v1/spaces/:id/lock`: a person locks a room's changes, so nobody renames, archives or
   * deletes it, or lets them go (ADR 0156).
   */
  readonly setLock: SetLock;
  /** A harness's tokens: what it has, another one, and withdrawing one (ADR 0023). */
  readonly harnessTokens: HarnessTokens;
  /** Hand a harness to another person (M5.2). */
  readonly transferHarness: TransferHarness;
  /** `DELETE /v1/harnesses/:id`: take a harness out of the workspace (ADR 0078). */
  readonly removeHarness: RemoveHarness;
  /** `DELETE /v1/people/:id`: take a person out of the workspace (ADR 0160). */
  readonly removePerson: RemovePerson;
  readonly deleteAccount: DeleteAccount;
  /**
   * An agent's context files (ADR 0134): a harness's copies, read and edited by its owner, and the
   * edits on their way down its socket.
   */
  readonly contextFiles: {
    readonly put: PutContext;
    readonly read: ReadContext;
    readonly askEdit: AskContextEdit;
    readonly readEdit: ReadContextEdit;
  };
  /**
   * An agent's model and effort (ADR 0140): its harness's copy, read and changed by the people who
   * run the harness, and the changes on their way down its socket.
   */
  readonly agentModels: {
    readonly put: PutAgentModel;
    readonly read: ReadAgentModel;
    readonly ask: AskModelChange;
  };
  /**
   * An agent's heartbeat (ADR 0143): its harness's copy, read and switched or timed by the people
   * who run the harness, and the changes on their way down its socket.
   */
  readonly agentHeartbeats: {
    readonly put: PutAgentHeartbeat;
    readonly read: ReadAgentHeartbeat;
    readonly ask: AskHeartbeatChange;
  };
  /**
   * A harness's own jobs (ADR 0252): its copy and its runs, read and switched by the people who
   * run the harness, and the changes on their way down its socket.
   */
  readonly harnessJobs: {
    readonly put: PutHarnessJobs;
    readonly postRuns: PostJobRuns;
    readonly read: ReadHarnessJobs;
    readonly runs: ReadJobRuns;
    readonly ask: AskJobChange;
  };
  /**
   * An agent's context window (ADR 0146): its harness's copy, read by the people who run the
   * harness, and their Compact now and new limit on their way down its socket.
   */
  readonly agentContextWindows: {
    readonly put: PutAgentContextWindow;
    readonly read: ReadAgentContextWindow;
    readonly ask: AskWindowChange;
    readonly compact: AskCompaction;
  };
  /** `POST /v1/harnesses/:id/restart`: ask a harness to restart, down its own connection (ADR 0094). */
  readonly restartHarness: RestartHarness;
  /** `PATCH /v1/harnesses/:id`: what a harness takes, said again (ADR 0046). */
  readonly declareCapabilities: DeclareCapabilities;
  /** `DELETE /v1/spaces/:id` (ADR 0067). */
  readonly eraseSpace: EraseSpace;
  /** A room's project over git (ADR 0220): who may fetch and push, and what a push did. */
  readonly projectDoor: ProjectDoor;
  /** A page of a room's project built into one document, for it to run where a page runs (ADR 0223). */
  readonly pageBuilder: PageBuilder;
  /** Who the people are: the registry half of a person (ADR 0034). */
  readonly people: PeopleRegistry;
  /** `POST /v1/people/:id/name`: a person changes what they go by (ADR 0082). */
  readonly renamePerson: RenamePerson;
  /** `POST /v1/workspace/name`: an owner names the workspace again (ADR 0194). */
  readonly renameWorkspace: RenameWorkspace;
  /** `PUT`/`DELETE /v1/people/:id/face`: a person chooses the face they wear (ADR 0139). */
  readonly setPersonFace: SetPersonFace;
  /** The one way a person enters a workspace: the registry row and `person.joined` (ADR 0034). */
  readonly joinWorkspace: JoinWorkspace;
  /** Invites: made by an owner or admin, redeemed by whoever holds the link (ADR 0034). */
  readonly invites: Invites;
  /** Join requests: a harness or a device asks, an owner or admin allows (ADR 0122). */
  readonly joinRequests: JoinRequests;
  /** Direct asks: a guest asks the owners to share the server in Tailscale (ADR 0211, Phase 3). */
  readonly directAsks: DirectAsks;
  /** The owner's relay switch (ADR 0211, Phase 4). */
  readonly relaySwitch: RelaySwitchUseCase;
  /**
   * The join requests' clock, in dev mode only, for a test to move on (`POST /v1/dev/join-clock`):
   * a code that lasts ten minutes expires in a call.
   */
  readonly joinClock?: LeadingClock | undefined;
  /** Passkeys: how a person comes back on a new device (ADR 0034). */
  readonly passkeys: Passkeys;
  /** A person's devices, to list and withdraw (ADR 0034). */
  readonly devices: DeviceRegistry;
  /** A person's notification settings and the claim ledger (M5.6). */
  readonly notifications: NotificationRegistry;
  readonly spaceIcons: SpaceIconRegistry;
  /** The rooms a person hid from their own list (ADR 0205). */
  readonly hiddenSpaces: HiddenSpaceRegistry;
  /** The rooms a person pinned to the top of their own list (ADR 0240). */
  readonly pinnedSpaces: PinnedSpaceRegistry;
  /** How far each person has read each room, followed between their devices (ADR 0262). */
  readonly readMarks: ReadMarkRegistry;
  /** Where a push may reach a phone (M4.3, ADR 0045). */
  readonly push: PushRegistry;
  /**
   * Whether a push can go at all, or whether the last ones got through, which the phone's switch
   * says when they can't or didn't (ADR 0244).
   */
  readonly pushStanding: () => PushStanding;
  /** Which visit a person's messages in a space go to (ADR 0040). */
  readonly sessionPins: SessionPinRegistry;
  /** The live sockets, so a withdrawn credential stops now. */
  readonly sessions: Sessions;
  /**
   * Chips for Mac on this machine, opened for the owner's ask when no Mac of theirs is (ADR 0227's
   * second addendum). Absent where the server is not on a Mac, in dev mode, and in tests.
   */
  readonly macApp?: MacApp | undefined;
  /** Upload slots and what their bytes turned out to be (decision 10). */
  readonly uploads: Uploads;
  readonly uploadsRegistry: UploadsRegistry;
  readonly blobs: BlobStore;
  /**
   * Makes videos' playable copies, one at a time (ADR 0053). Absent where ffmpeg is not found.
   * The gateway drains it when a video is kept, at start and on the sweep's timer; a test calls it.
   */
  readonly playables?: Playables | undefined;
  /** What signs the URLs a harness gets for an attachment, and for how long they hold. */
  readonly grants: { readonly secret: string; readonly ttlSeconds: number };
  /** Mints single-use tickets for opening a socket (ADR 0006, phase-0-review finding 5). */
  readonly socketTickets: SocketTickets;
  /** Mints single-use tickets for loading an HTML page into a frame (ADR 0201). */
  readonly pageTickets: PageTickets;
  /** Whether each harness can answer (ADR 0083), for the participants read and a harness's door. */
  readonly presence: Presence;
  /** Present only when this server is accepting pairings. */
  readonly pairDevice?: PairDevice;
  /** How a pairing code is issued. `chipsd serve` uses it in dev mode; so do tests. */
  readonly pairingCodes?: PairingCodes;
  /**
   * What the machine running this server proves itself with (ADR 0048): a secret made at start
   * and left owner-only beside the database, so whoever can read the workspace can also issue a
   * pairing code for it. Absent, `POST /v1/operator/pairing-code` is not there.
   */
  readonly operatorToken?: string;
  readonly instruments?: ChipsInstruments;
  /** The version reported by `/v1/health` and in the `hello` frame. */
  readonly version?: string;
  /** Where the built web app is, to serve at `/`. Absent, `/` says the app is not built. */
  readonly webDir?: string | undefined;
  /** The relay, its key and its state (M4.1). */
  readonly relay: RelayFacts;
  /**
   * Where another device reaches this server, for a QR (ADR 0028). A fact about the machine
   * rather than about the request: the origin a browser asks from is that browser's, and the
   * phone reading the QR is somewhere else entirely. A function because the port is not known
   * until it is bound — `port: 0` asks the OS for one.
   */
  readonly reachableUrl: () => string;
  /** What the machine this server runs on is called, as its owner named it (ADR 0170). */
  readonly machine: () => string;
  /** The gallery's cards, from the docs (ADR 0171). */
  readonly connectors: ConnectorGallery;
}

/** A tunnel's end, as the app is told of each request through it. */
export interface TunnelBinding {
  /** The phone's address: the relay's word, or the door's socket's own peer. */
  readonly from: string;
  /**
   * The Noise handshake hash of the tunnel, hex, which both ends hold and nothing else does: what
   * a request signed inside it binds to (ADR 0191, decision 6). Set by `answerTunnel` once the
   * handshake is done, so every request's env carries the hash of the tunnel it arrived on.
   */
  readonly handshakeHash?: string | undefined;
}

/** What every route can reach. Hono carries it on the context rather than in a module global. */
export interface GatewayEnv {
  /**
   * What the transport hands `app.fetch`: the Node server passes its sockets; the relay link
   * (M4.1) passes where the relay saw the phone, so the limiter has an address to count; and the
   * tunnel door on the network (ADR 0191) passes its socket's own peer, which is counted, and
   * judged by the join rules, as a request on the port is, since it came in the same way. Either
   * tunnel passes its handshake hash too, which a device signature made inside it names (ADR
   * 0191, decision 6), so the authenticator can hold the signature to the tunnel it arrived on.
   */
  Bindings: {
    relay?: TunnelBinding | undefined;
    lan?: TunnelBinding | undefined;
  };
  Variables: {
    requestId: string;
    logger: Logger;
    principal: Principal;
    /** The raw body, kept because a device signature covers it byte for byte. */
    rawBody: string;
    /** An upload's bytes, in place of the body as text. */
    rawBytes: Uint8Array | undefined;
  };
}
