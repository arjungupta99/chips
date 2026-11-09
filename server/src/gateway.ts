/**
 * Wiring. The one place that knows which adapter implements which port.
 *
 * Everything above this file depends on interfaces; this is where SQLite, `ws`, the system
 * clock and a real id generator are chosen. Swapping any of them — Postgres in Phase 6, a
 * fan-out over Redis, a worker-process job queue — is a change here and nowhere else
 * (ADR 0016).
 */

import { randomBytes } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHIPS_RELAY,
  type ChipsConfig,
  type ChipsInstruments,
  createInstruments,
  createLogger,
  type Logger,
  leadingClock,
  machineName,
  processEnvironment,
  pushUrlOf,
  reachableUrl,
  systemClock,
} from "@chipschat/platform";
import { createIdGenerator, type IdGenerator } from "@chipschat/protocol";
import { serve } from "@hono/node-server";
import type { Kysely } from "kysely";
import {
  createAddHarness,
  createArchiveAgent,
  createAskAgent,
  createAskCompaction,
  createAskContextEdit,
  createAskHeartbeatChange,
  createAskJobChange,
  createAskModelChange,
  createAskWindowChange,
  createDeclareCapabilities,
  createDeleteAccount,
  createDeleteAgent,
  createDirectAsks,
  createEraseSpace,
  createForkAgent,
  createHandOverHeld,
  createHarnessTokens,
  createHoldAtCeiling,
  createInvites,
  createJoinRequests,
  createJoinWorkspace,
  createLaneRouter,
  createLeadTurns,
  createMoveAgent,
  createNotifyExchange,
  createNotifyJoin,
  createNotifyMessage,
  createNotifyPush,
  createOneRoom,
  createOpenSpace,
  createPageTickets,
  createPairDevice,
  createPairingCodes,
  createPasskeys,
  createPlayables,
  createPostJobRuns,
  createProjectDoor,
  createPushReceipts,
  createPutAgentContextWindow,
  createPutAgentHeartbeat,
  createPutAgentModel,
  createPutContext,
  createPutHarnessJobs,
  createReadAgentContextWindow,
  createReadAgentHeartbeat,
  createReadAgentModel,
  createReadContext,
  createReadContextEdit,
  createReadHarnessJobs,
  createReadJobRuns,
  createRelaySwitch,
  createRemoveHarness,
  createRemovePerson,
  createRenameAgent,
  createRenamePerson,
  createRenameWorkspace,
  createRestartHarness,
  createSetAgentFace,
  createSetAgentLock,
  createSetExchange,
  createSetLead,
  createSetLock,
  createSetPersonFace,
  createSetSpendCeiling,
  createSocketTickets,
  createSubmitEvent,
  createSweep,
  createTransferHarness,
  createUpgradeAgents,
  createUpgradeNames,
  createUpgradeOneRoom,
  createUploads,
  createWaitForApproval,
  droppedInTheLog,
  type MacApp,
  type PlayableMade,
  reacting,
  readableCode,
  type Sessions,
  type Sounds,
  type StoredEvent,
  type Videos,
} from "./application/index.js";
import type { ProjectStore } from "./application/ports/projects.js";
import { harnessGrant } from "./infrastructure/attachments/signing.js";
import { createAuthenticator } from "./infrastructure/auth/authenticator.js";
import {
  digestsMatch,
  hashHarnessToken,
  joinCheck,
  keyCode,
  mintHarnessToken,
  mintInviteToken,
  mintJoinSecret,
} from "./infrastructure/auth/credentials.js";
import { createLastUsed } from "./infrastructure/auth/last-used.js";
import {
  newOperatorToken,
  operatorTokenPath,
  removeOperatorToken,
  writeOperatorToken,
} from "./infrastructure/auth/operator.js";
import { verifyAssertion, verifyRegistration } from "./infrastructure/auth/webauthn.js";
import { createLocalBlobStore } from "./infrastructure/blobs/local-blob-store.js";
import { createLocalUploadPieces } from "./infrastructure/blobs/local-upload-pieces.js";
import { connectorGallery } from "./infrastructure/connectors/gallery.js";
import { sqlitePathFrom } from "./infrastructure/db/connection.js";
import type { Database } from "./infrastructure/db/schema.js";
import { bootstrapDemoWorkspace, type DemoWorkspace } from "./infrastructure/demo/bootstrap.js";
import {
  createFfmpegVideos,
  findMediaTools,
  type MediaTools,
} from "./infrastructure/media/ffmpeg-videos.js";
import { createSharpImages } from "./infrastructure/media/sharp-images.js";
import { createWhisperSounds, findWhisper } from "./infrastructure/media/whisper-sounds.js";
import { findGit } from "./infrastructure/projects/git.js";
import { createPageBuilder } from "./infrastructure/projects/page-builder.js";
import { createProjectRepositories } from "./infrastructure/projects/repositories.js";
import { createExpoPushSender } from "./infrastructure/push/expo.js";
import { createRelayIdentity } from "./infrastructure/relay/identity.js";
import { createAgentContextWindowRegistry } from "./infrastructure/store/agent-context-window-registry.js";
import { agentGate } from "./infrastructure/store/agent-gate.js";
import { createAgentHeartbeatRegistry } from "./infrastructure/store/agent-heartbeat-registry.js";
import { createAgentModelRegistry } from "./infrastructure/store/agent-model-registry.js";
import { createBannerRegistry } from "./infrastructure/store/banner-registry.js";
import { createContextRegistry } from "./infrastructure/store/context-registry.js";
import { createDeviceRegistry } from "./infrastructure/store/device-registry.js";
import { createDirectAskRegistry } from "./infrastructure/store/direct-asks.js";
import { guestGate } from "./infrastructure/store/guest-gate.js";
import { createHarnessJobRegistry } from "./infrastructure/store/harness-job-registry.js";
import { createHarnessRegistry } from "./infrastructure/store/harness-registry.js";
import { createHiddenSpaceRegistry } from "./infrastructure/store/hidden-space-registry.js";
import { createInProcessFanOut } from "./infrastructure/store/in-process-fanout.js";
import { createInProcessPresence } from "./infrastructure/store/in-process-presence.js";
import { createInviteRegistry } from "./infrastructure/store/invite-registry.js";
import { createJoinRegistry } from "./infrastructure/store/join-registry.js";
import { membershipGate } from "./infrastructure/store/membership-gate.js";
import { createNotificationRegistry } from "./infrastructure/store/notification-registry.js";
import { createPasskeyRegistry } from "./infrastructure/store/passkey-registry.js";
import { createPeopleRegistry } from "./infrastructure/store/people-registry.js";
import { createPinnedSpaceRegistry } from "./infrastructure/store/pinned-space-registry.js";
import { createPushRegistry } from "./infrastructure/store/push-registry.js";
import { createReadMarkRegistry } from "./infrastructure/store/read-mark-registry.js";
import { createReadModels } from "./infrastructure/store/read-models.js";
import { createRelaySwitchRegistry } from "./infrastructure/store/relay-switch.js";
import { fileGate } from "./infrastructure/store/room-files.js";
import { createSearchIndex } from "./infrastructure/store/search-index.js";
import { createServerKeys } from "./infrastructure/store/server-keys.js";
import { createSessionPinRegistry } from "./infrastructure/store/session-pin-registry.js";
import { createSpaceIconRegistry } from "./infrastructure/store/space-icon-registry.js";
import { createSqliteEventStore } from "./infrastructure/store/sqlite-event-store.js";
import { createUploadsRegistry } from "./infrastructure/store/uploads-registry.js";
import { createWorkspaceRegistry } from "./infrastructure/store/workspace-registry.js";
import { createApp } from "./interfaces/http/app.js";
import type { GatewayDeps } from "./interfaces/http/context.js";
import { createRelayLink, type RelayLink } from "./interfaces/relay/link.js";
import { attachTunnelDoor, type TunnelDoor } from "./interfaces/tunnel/door.js";
import { attachWebSocketGateway, type WebSocketGateway } from "./interfaces/ws/server.js";

export interface BuildGatewayOptions {
  readonly config: ChipsConfig;
  readonly db: Kysely<Database>;
  readonly logger?: Logger;
  readonly ids?: IdGenerator;
  readonly instruments?: ChipsInstruments;
  readonly version?: string;
  /**
   * What measures and copies video (ADR 0053). Absent, ffmpeg is looked for; `null`, there is none,
   * which is what a test that is not about video wants, whatever is installed on its machine.
   */
  readonly videos?: Videos | null;
  /** What hears sound (ADR 0054), the same way: absent, looked for; `null`, none. */
  readonly sounds?: Sounds | null;
  /** What this machine is called (ADR 0170). Absent, the system is asked, once, when first wanted. */
  readonly machine?: string;
  /**
   * How long devices have to hear the relay is going before it goes (ADR 0211, Phase 4):
   * `TELL_MS` unless said. The tests' is nothing.
   */
  readonly relayTellMs?: number;
  /** Chips for Mac on this machine (ADR 0227's second addendum); absent, there is none to open. */
  readonly macApp?: MacApp | undefined;
}

export interface Gateway {
  readonly deps: GatewayDeps;
  /**
   * Make sure the demo workspace exists and write its credentials beside the database. Only
   * called in dev mode; see `infrastructure/demo/bootstrap.ts` for why.
   */
  readonly bootstrapDemo: (serverUrl: string) => Promise<DemoWorkspace>;
  readonly app: ReturnType<typeof createApp>;
  /**
   * Start listening — with the tunnel door open on the port (ADR 0191) and, with a relay
   * configured, dialling out to it. Returns the port, which is useful when the config asked for
   * zero, the door, and the link when there is one.
   */
  readonly listen: () => Promise<{
    port: number;
    server: HttpServer;
    ws: WebSocketGateway;
    door: TunnelDoor;
    relay: RelayLink | undefined;
  }>;
  readonly close: () => Promise<void>;
}

/**
 * The web app this repository builds, found from here: `chips serve` from a checkout serves the
 * page its QR points at without being told where it is. A release says where its own is.
 */
function repositoryWebDir(): string {
  return fileURLToPath(new URL("../../apps/web/dist/", import.meta.url));
}

/** Attachments live beside the database; an in-memory database keeps them in a temporary place. */
function blobDirectory(databaseUrl: string): string {
  const path = sqlitePathFrom(databaseUrl);
  return path === ":memory:"
    ? join(tmpdir(), "chips-attachments")
    : join(dirname(path), "attachments");
}

/**
 * The pieces of uploads that have not finished (ADR 0052), beside the attachments. Unlike a blob,
 * a piece is not named by what it holds, so an in-memory database's are this process's alone.
 */
function piecesDirectory(databaseUrl: string): string {
  const path = sqlitePathFrom(databaseUrl);
  return path === ":memory:"
    ? join(tmpdir(), `chips-upload-pieces-${process.pid}`)
    : join(dirname(path), "upload-pieces");
}

/**
 * The rooms' projects (ADR 0220), beside the attachments: kept with the database, so a backup keeps
 * them with it. An in-memory database's are this process's alone.
 */
function projectsDirectory(databaseUrl: string): string {
  const path = sqlitePathFrom(databaseUrl);
  return path === ":memory:"
    ? join(tmpdir(), `chips-projects-${process.pid}`)
    : join(dirname(path), "projects");
}

/**
 * The rooms' projects, when this machine has a git new enough. Without one they are off: the log
 * says why, once, as the server starts, and the door says it to whoever asks.
 */
function projectsFor(
  config: ChipsConfig,
  logger: Logger,
): { projects: ProjectStore | undefined; unavailable: string | undefined } {
  const found = findGit({ path: processEnvironment()["PATH"] });
  if (!found.ok) {
    logger.warn(`rooms' projects are off: ${found.why}`);
    return {
      projects: undefined,
      unavailable: `Projects are off on this server: ${found.why}.`,
    };
  }
  logger.info({ git: found.git.path, version: found.git.version }, "git found for rooms' projects");
  return {
    projects: createProjectRepositories({
      git: found.git,
      root: projectsDirectory(config.data.databaseUrl),
      node: process.execPath,
      onGitError: (spaceId, said) =>
        logger.warn({ spaceId, git: said }, "git said something went wrong"),
    }),
    unavailable: undefined,
  };
}

/**
 * What measures and copies video: the one a test gave, none where a test said none, else ffmpeg
 * where it can be found — and the log says which, once, as the server starts.
 */
function videosFor(
  options: BuildGatewayOptions,
  tools: MediaTools | undefined,
  logger: Logger,
): Videos | undefined {
  if (options.videos !== undefined) return options.videos ?? undefined;
  if (tools === undefined) {
    logger.warn(
      "ffmpeg and ffprobe were not found: videos are kept as they came, with no poster and with their metadata, location included",
    );
    return undefined;
  }
  logger.info({ ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe }, "video tools found");
  return createFfmpegVideos(tools, {
    maxOutputBytes: options.config.limits.maxAttachmentBytes,
    path: processEnvironment()["PATH"],
  });
}

/**
 * What hears sound, found the same way (ADR 0054): ffmpeg to measure and decode it, and whisper
 * with a model to write down what was said. The log says what was found, and every voice note
 * heard says what came of it.
 */
function soundsFor(
  options: BuildGatewayOptions,
  tools: MediaTools | undefined,
  logger: Logger,
): Sounds | undefined {
  if (options.sounds !== undefined) return options.sounds ?? undefined;
  if (tools === undefined) return undefined;
  const path = processEnvironment()["PATH"];
  const whisper = findWhisper({
    whisperPath: options.config.media.whisperPath,
    modelPath: options.config.media.whisperModel,
    modelsDirectory: join(options.config.data.dir, "models"),
    path,
  });
  if (whisper === undefined) {
    logger.warn("whisper or its model was not found: voice notes are kept with no transcript");
  } else {
    logger.info({ whisper: whisper.cli, model: whisper.model }, "whisper found");
  }
  return heardInTheLog(createWhisperSounds(tools, { whisper, path }), logger);
}

/** Sounds that say in the log how long each took to hear, and why one has no transcript. */
function heardInTheLog(sounds: Sounds, logger: Logger): Sounds {
  return {
    async hear(bytes) {
      const started = Date.now();
      const heard = await sounds.hear(bytes);
      const facts = { durationMs: heard?.durationMs, ms: Date.now() - started };
      if (heard?.transcript !== undefined) logger.info(facts, "voice note transcribed");
      else logger.info({ ...facts, note: heard?.note ?? "not sound" }, "sound kept untranscribed");
      return heard;
    },
  };
}

/** The relay behind the owner's switch: the one the server was given, else Chips's (ADR 0245). */
function relayUrlOf(config: ChipsConfig): string {
  return config.relay.url ?? CHIPS_RELAY;
}

function logMade(logger: Logger, made: PlayableMade): void {
  if (made.state === "done") {
    logger.info({ attachmentId: made.id, bytes: made.bytes, ms: made.ms }, "video made playable");
  } else {
    logger.warn({ attachmentId: made.id, note: made.note }, "video could not be made playable");
  }
}

export function buildGateway(options: BuildGatewayOptions): Gateway {
  const { config, db } = options;
  const logger =
    options.logger ??
    createLogger({ level: config.log.level, pretty: config.log.pretty, name: "chipsd" });
  const ids = options.ids ?? createIdGenerator();
  const instruments = options.instruments ?? createInstruments();
  const version = options.version ?? "0.0.0";

  const fanOut = createInProcessFanOut();
  // Whether each harness can answer (ADR 0083): the hub counts its sockets, its door its trouble.
  const presence = createInProcessPresence({ now: () => systemClock.nowMs() });
  // One room per agent (ADR 0087): every append has its consequences, whichever door made it.
  // What reacts is made once the lane router it cascades cancels through exists.
  let react: (event: StoredEvent) => Promise<void> = async () => undefined;
  // Fan-out happens after the transaction commits, so a subscriber never sees an event that a
  // rollback would have taken away.
  const onAppended = (event: StoredEvent) => fanOut.publish(event);
  // And where an agent may be is asked inside every append's transaction (agents review, findings
  // 5 to 8), so no door can put one in two rooms, whichever it is and however many ask at once.
  // So is a file made from a version of the room's file (ADR 0099): of two posted at once from the
  // same version, the second reads the first and is refused. And a person's removal of somebody
  // who is already out (19 October 2026: three of Natalie, sent at once). And an unarchive that
  // would put a guest in a second open room, which Chips's own reopening never asked (SEC-48).
  const gate: Parameters<typeof createSqliteEventStore>[0]["gate"] = async (trx, event) =>
    (await agentGate(trx, event)) ??
    (await fileGate(trx, event)) ??
    (await membershipGate(trx, event)) ??
    (await guestGate(trx, event));
  const store = reacting(createSqliteEventStore({ db, instruments, onAppended, gate }), (event) =>
    react(event),
  );
  // The two upgrades write history as it was, an agent in every room its harness had been in, and
  // then settle it: they append past the gate, and have their consequences like anything else.
  const settling = reacting(createSqliteEventStore({ db, instruments, onAppended }), (event) =>
    react(event),
  );
  const readModels = createReadModels(db);
  // A credential's use is stamped off the hot path, once a minute at most; `chips doctor` reads
  // it to tell a harness that has never connected from one that has.
  const authenticator = createAuthenticator({
    db,
    onUsed: createLastUsed({
      db,
      now: () => systemClock.nowMs(),
      onError: (error) => logger.warn({ err: error }, "could not stamp a credential's last use"),
    }),
  });

  // Attachments (decision 10): bytes beside the database, once by digest; a secret for the
  // URLs harnesses get, made here when the configuration has none, so they hold for one process.
  const uploadsRegistry = createUploadsRegistry(db);
  const blobs = createLocalBlobStore(blobDirectory(config.data.databaseUrl));
  // Rooms' projects (ADR 0220): a git repository per room beside the database.
  const { projects, unavailable } = projectsFor(config, logger);
  // Erasing a room (ADR 0067) takes its files with it, where nothing else still refers to them.
  // What stops a room's work is made further down, with the lane router its cancels cascade to.
  let stopWork: (workspaceId: string, spaceId: string, by: string) => Promise<void> = async () =>
    undefined;
  const eraseSpace = createEraseSpace({
    store,
    readModels,
    blobs,
    projects,
    clock: systemClock,
    ids,
    onStrayFile: (digest, error) =>
      logger.warn({ digest, err: error }, "an erased room's file could not be removed"),
    onStrayProject: (spaceId, error) =>
      logger.warn({ spaceId, err: error }, "an erased room's project could not be removed"),
    stopWork: (workspaceId, spaceId, by) => stopWork(workspaceId, spaceId, by),
  });
  // Video (ADR 0053) and sound (ADR 0054): ffmpeg and whisper in processes of their own, when
  // they can be found. A test that gives both looks for neither.
  const tools =
    options.videos !== undefined && options.sounds !== undefined
      ? undefined
      : findMediaTools({
          ffmpegPath: config.media.ffmpegPath,
          ffprobePath: config.media.ffprobePath,
          path: processEnvironment()["PATH"],
        });
  const videos = videosFor(options, tools, logger);
  const sounds = soundsFor(options, tools, logger);
  const playables =
    videos === undefined
      ? undefined
      : createPlayables({
          registry: uploadsRegistry,
          blobs,
          videos,
          clock: systemClock,
          onMade: (made) => logMade(logger, made),
        });
  const drainPlayables = () => {
    void playables
      ?.drain()
      .catch((error: unknown) => logger.error({ err: error }, "playable copies failed"));
  };
  const uploads = createUploads({
    registry: uploadsRegistry,
    blobs,
    pieces: createLocalUploadPieces(piecesDirectory(config.data.databaseUrl)),
    images: createSharpImages(),
    clock: systemClock,
    ids,
    limits: {
      maxBytes: config.limits.maxAttachmentBytes,
      slotTtlSeconds: config.attachments.slotTtlSeconds,
      thumbnailEdge: config.attachments.thumbnailEdge,
      viewEdge: config.attachments.viewEdge,
    },
    caps: (workspaceId) => readModels.attachmentCaps(workspaceId),
    videos,
    onPlayableQueued: drainPlayables,
    onMetadataKept: (attachmentId, note) =>
      logger.warn({ attachmentId, note }, "video kept with its metadata, location included"),
    sounds,
  });
  const grants = {
    secret: config.attachments.secret ?? randomBytes(32).toString("hex"),
    ttlSeconds: config.limits.signedUrlTtlSeconds,
  };
  const projectDoor = createProjectDoor({
    projects,
    unavailable,
    store,
    readModels,
    clock: systemClock,
    ids,
    limits: config.limits,
    onUnrecorded: (spaceId, error) =>
      logger.error(
        { spaceId, err: error },
        "a push to a room's project was taken but not recorded",
      ),
  });

  // Declared here because the sessions port reads it: before `listen` there are no sockets,
  // and `closeToken` truthfully answers nought.
  let running:
    | {
        server: HttpServer;
        ws: WebSocketGateway;
        door: TunnelDoor;
        sweeper: ReturnType<typeof setInterval>;
        relay: RelayLink | undefined;
        /** A new link to the relay, for the owner's switch turning it on (ADR 0211, Phase 4). */
        dial: () => RelayLink;
      }
    | undefined;
  /**
   * The owner's switch (ADR 0211, Phase 4), read again at `listen`: until turned, on for a relay
   * the server was set up with and off for Chips's own (ADR 0245).
   */
  let relayOn = config.relay.url !== undefined;
  const sessions: Sessions = {
    closeToken: (tokenId) => running?.ws.closeToken(tokenId) ?? 0,
    closeDevice: (deviceId) => running?.ws.closeDevice(deviceId) ?? 0,
    closePerson: (workspaceId, participantId) =>
      running?.ws.closePerson(workspaceId, participantId) ?? 0,
    restart: (workspaceId, harnessId, ask) => running?.ws.restart(workspaceId, harnessId, ask) ?? 0,
    join: (workspaceId, request, to) => running?.ws.join(workspaceId, request, to) ?? 0,
    askMacs: (workspaceId, participantId, frame) =>
      running?.ws.askMacs(workspaceId, participantId, frame) ?? 0,
    macs: (workspaceId, participantId) => running?.ws.macs(workspaceId, participantId) ?? 0,
    whenMac: (workspaceId, participantId, withinMs) =>
      running?.ws.whenMac(workspaceId, participantId, withinMs) ?? Promise.resolve(0),
    runState: (workspaceId, participantId, frame) =>
      running?.ws.runState(workspaceId, participantId, frame) ?? 0,
    reads: (workspaceId, participantId, frame) =>
      running?.ws.reads(workspaceId, participantId, frame) ?? 0,
    banners: (workspaceId, participantId, frame) =>
      running?.ws.banners(workspaceId, participantId, frame) ?? 0,
    contextEdit: (workspaceId, harnessId, frame) =>
      running?.ws.contextEdit(workspaceId, harnessId, frame) ?? 0,
    hearingContext: (workspaceId, harnessId) =>
      running?.ws.hearingContext(workspaceId, harnessId) ?? 0,
    modelChange: (workspaceId, harnessId, frame) =>
      running?.ws.modelChange(workspaceId, harnessId, frame) ?? 0,
    hearingModels: (workspaceId, harnessId) =>
      running?.ws.hearingModels(workspaceId, harnessId) ?? 0,
    heartbeatChange: (workspaceId, harnessId, frame) =>
      running?.ws.heartbeatChange(workspaceId, harnessId, frame) ?? 0,
    hearingHeartbeats: (workspaceId, harnessId) =>
      running?.ws.hearingHeartbeats(workspaceId, harnessId) ?? 0,
    windowCompact: (workspaceId, harnessId, frame) =>
      running?.ws.windowCompact(workspaceId, harnessId, frame) ?? 0,
    windowChange: (workspaceId, harnessId, frame) =>
      running?.ws.windowChange(workspaceId, harnessId, frame) ?? 0,
    hearingWindows: (workspaceId, harnessId) =>
      running?.ws.hearingWindows(workspaceId, harnessId) ?? 0,
    jobChange: (workspaceId, harnessId, frame) =>
      running?.ws.jobChange(workspaceId, harnessId, frame) ?? 0,
    hearingJobs: (workspaceId, harnessId) => running?.ws.hearingJobs(workspaceId, harnessId) ?? 0,
  };

  const registry = createHarnessRegistry(db);
  const addHarness = createAddHarness({
    registry,
    store,
    readModels,
    clock: systemClock,
    ids,
    mint: mintHarnessToken,
  });
  const openSpace = createOpenSpace({ store, readModels, clock: systemClock, ids });
  const upgradeAgents = createUpgradeAgents({
    store: settling,
    readModels,
    clock: systemClock,
    ids,
  });
  const upgradeOneRoom = createUpgradeOneRoom({
    store: settling,
    readModels,
    clock: systemClock,
    ids,
  });
  const upgradeNames = createUpgradeNames({ store, readModels, clock: systemClock, ids });
  const harnessTokens = createHarnessTokens({
    registry,
    readModels,
    sessions,
    clock: systemClock,
    ids,
    mint: mintHarnessToken,
  });

  const people = createPeopleRegistry(db);
  const joinWorkspace = createJoinWorkspace({ people, store, readModels, clock: systemClock, ids });
  const renamePerson = createRenamePerson({ people, store, readModels, clock: systemClock, ids });
  const renameWorkspace = createRenameWorkspace({
    workspaces: createWorkspaceRegistry(db),
    store,
    readModels,
    clock: systemClock,
    ids,
  });

  const transferHarness = createTransferHarness({
    registry,
    store,
    readModels,
    clock: systemClock,
    ids,
  });

  const contextRegistry = createContextRegistry(db);
  const modelRegistry = createAgentModelRegistry(db);
  const heartbeatRegistry = createAgentHeartbeatRegistry(db);
  const windowRegistry = createAgentContextWindowRegistry(db);
  const jobRegistry = createHarnessJobRegistry(db);
  const removeHarness = createRemoveHarness({
    registry,
    sessions,
    store,
    readModels,
    clock: systemClock,
    ids,
    context: contextRegistry,
    models: modelRegistry,
    heartbeats: heartbeatRegistry,
    windows: windowRegistry,
    jobs: jobRegistry,
  });

  const restartHarness = createRestartHarness({
    readModels,
    sessions,
    presence,
    clock: systemClock,
  });

  const declareCapabilities = createDeclareCapabilities({ registry, readModels });

  const contextDeps = {
    readModels,
    context: contextRegistry,
    sessions,
    ids,
    clock: systemClock,
  };
  const contextFiles = {
    put: createPutContext(contextDeps),
    read: createReadContext(contextDeps),
    askEdit: createAskContextEdit(contextDeps),
    readEdit: createReadContextEdit(contextDeps),
  };
  const modelDeps = { readModels, models: modelRegistry, sessions, ids, clock: systemClock };
  const agentModels = {
    put: createPutAgentModel(modelDeps),
    read: createReadAgentModel(modelDeps),
    ask: createAskModelChange(modelDeps),
  };
  const heartbeatDeps = {
    readModels,
    heartbeats: heartbeatRegistry,
    sessions,
    ids,
    clock: systemClock,
  };
  const agentHeartbeats = {
    put: createPutAgentHeartbeat(heartbeatDeps),
    read: createReadAgentHeartbeat(heartbeatDeps),
    ask: createAskHeartbeatChange(heartbeatDeps),
  };
  const jobDeps = { readModels, jobs: jobRegistry, sessions, ids, clock: systemClock };
  const harnessJobs = {
    put: createPutHarnessJobs(jobDeps),
    postRuns: createPostJobRuns(jobDeps),
    read: createReadHarnessJobs(jobDeps),
    runs: createReadJobRuns(jobDeps),
    ask: createAskJobChange(jobDeps),
  };
  const windowDeps = {
    readModels,
    windows: windowRegistry,
    sessions,
    store,
    ids,
    clock: systemClock,
  };
  const agentContextWindows = {
    put: createPutAgentContextWindow(windowDeps),
    read: createReadAgentContextWindow(windowDeps),
    ask: createAskWindowChange(windowDeps),
    compact: createAskCompaction(windowDeps),
  };

  const laneRouter = createLaneRouter({ store, clock: systemClock, ids, readModels, registry });
  const oneRoom = createOneRoom({
    store,
    readModels,
    clock: systemClock,
    ids,
    cascade: (event) => laneRouter.after(event),
  });
  // A person acting in a room hands over what the referee held there (ADR 0097), whichever door
  // the act came through.
  const handOver = createHandOverHeld({ store, readModels, clock: systemClock, ids });
  // A run's cost reported in a room weighs the room's job against its ceiling (ADR 0118): a
  // warning at 80%, and at the ceiling the agents held until a person acts.
  const holdAtCeiling = createHoldAtCeiling({ store, readModels, clock: systemClock, ids });
  react = async (event) => {
    await oneRoom.after(event);
    await handOver.after(event);
    await holdAtCeiling.after(event);
    // A person's standing changed (SEC-26): their sockets were opened with the old one, and
    // presence and the directory read it off the socket, so they are closed. The apps open the
    // next on their own, and it opens with the new.
    if (event.type === "role.changed") {
      running?.ws.closeRoleChanged(event.workspace_id, String(event.payload["participant_id"]));
    }
  };
  stopWork = (workspaceId, spaceId, by) =>
    oneRoom.stopWork(workspaceId, spaceId, { reason: "deleted", by });
  const moveAgent = createMoveAgent({ store, readModels, clock: systemClock, ids, oneRoom });
  /**
   * Finish what a restart cut, in every workspace (agents review, finding 7): an agent still in
   * an archived room is released, and a run whose agent has left its room is ended. Each is one
   * line in the log; an agent in several rooms is a warning, since nothing here may choose.
   */
  const settleAgents = async (): Promise<void> => {
    for (const workspaceId of await readModels.workspaces()) {
      const settled = await oneRoom.settle(workspaceId);
      for (const each of settled.released) {
        logger.info({ workspaceId, ...each }, "settled: an agent released from an archived room");
      }
      for (const each of settled.ended) {
        logger.info({ workspaceId, ...each }, "settled: a run ended, its agent had left the room");
      }
      for (const each of settled.inSeveral) {
        logger.warn({ workspaceId, ...each }, "an agent is in more than one room");
      }
    }
  };
  const forkAgent = createForkAgent({ store, readModels, clock: systemClock, ids });
  const askAgent = createAskAgent({ store, readModels, clock: systemClock, ids });
  const setAgentFace = createSetAgentFace({ store, readModels, clock: systemClock, ids });
  const setPersonFace = createSetPersonFace({ store, readModels, clock: systemClock, ids });
  const renameAgent = createRenameAgent({ store, readModels, clock: systemClock, ids });
  const archiveAgent = createArchiveAgent({ store, readModels, clock: systemClock, ids });
  const setExchange = createSetExchange({ store, readModels, clock: systemClock, ids });
  const setLead = createSetLead({ store, readModels, clock: systemClock, ids });
  const setSpendCeiling = createSetSpendCeiling({ store, readModels, clock: systemClock, ids });
  const setLock = createSetLock({ store, readModels, clock: systemClock, ids });
  const setAgentLock = createSetAgentLock({ store, readModels, clock: systemClock, ids });
  const leadTurns = createLeadTurns({ store, readModels, clock: systemClock, ids });
  const deleteAgent = createDeleteAgent({
    store,
    readModels,
    clock: systemClock,
    ids,
    oneRoom,
    eraseSpace,
    context: contextRegistry,
    models: modelRegistry,
    heartbeats: heartbeatRegistry,
    windows: windowRegistry,
  });
  const notifications = createNotificationRegistry(db);
  const spaceIcons = createSpaceIconRegistry(db);
  const hiddenSpaces = createHiddenSpaceRegistry(db);
  const pinnedSpaces = createPinnedSpaceRegistry(db);
  const banners = createBannerRegistry(db);
  const readMarks = createReadMarkRegistry(db);
  const pushTokens = createPushRegistry(db);
  // One sender for every push, so that what it learns about whether it can send at all holds for
  // all of them (ADR 0244). Without Expo's access token, it sends through Chips's push relay
  // (ADR 0246).
  // Every push goes through what notes its ticket, so its receipt is asked for and a deleted
  // app's token forgotten (the stranger review, 4 November 2026).
  const pushReceipts = createPushReceipts({
    sender: createExpoPushSender({
      url: pushUrlOf(config.push),
      accessToken: config.push.accessToken,
      logger,
    }),
    push: pushTokens,
    clock: systemClock,
    logger,
  });
  const pushSender = pushReceipts.sender;
  // A decision reaches the phones of whoever may answer it, carrying two ids and no words
  // (M4.3, ADR 0045). The same claim ledger the browser's banners use keeps it to one device.
  const notifyPush = createNotifyPush({
    readModels,
    notifications,
    push: pushTokens,
    sender: pushSender,
    clock: systemClock,
    logger,
  });
  // And the people of a room whose agents are talking among themselves, or held (ADR 0097).
  const notifyExchange = createNotifyExchange({
    readModels,
    notifications,
    push: pushTokens,
    sender: pushSender,
    clock: systemClock,
    logger,
  });
  // And a message, to those it @s and those who hear everything in its room, the words sealed
  // to their phone (ADRs 0158, 0198).
  const notifyMessage = createNotifyMessage({
    readModels,
    notifications,
    hidden: hiddenSpaces,
    push: pushTokens,
    sender: pushSender,
    clock: systemClock,
    logger,
  });
  const submitEvent = createSubmitEvent({
    store,
    clock: systemClock,
    ids,
    readModels,
    uploads: uploadsRegistry,
    routeLane: laneRouter.after,
    notify: async (event, resolution) => {
      await notifyPush.after(event, resolution);
      await notifyExchange.after(event);
      await notifyMessage.after(event);
    },
    leaving: oneRoom.leaving,
    archived: (workspaceId, spaceId) => pinnedSpaces.forgetSpace(workspaceId, spaceId),
    maxAttachmentBytes: config.limits.maxAttachmentBytes,
    dropped: droppedInTheLog(logger),
    ...(projects === undefined
      ? {}
      : {
          changeBy: async (spaceId: string, commit: string, agentId: string) =>
            (await projects.authorOf(spaceId, commit)) === `${agentId}@agents.chips.invalid`,
        }),
    changeLeftOff: ({ principal, spaceId, change }) =>
      logger.warn(
        { sender: principal.participantId, space: spaceId, change },
        "a post's change was left off: it is no commit of its agent's on the room's project",
      ),
  });
  const waitForApproval = createWaitForApproval({ readModels, fanOut });
  const sessionPins = createSessionPinRegistry(db);
  const searchIndex = createSearchIndex(db);
  const sweep = createSweep({
    store,
    readModels,
    clock: systemClock,
    ids,
    notifications,
    searchIndex,
    push: pushTokens,
    receipts: pushReceipts,
    uploads,
    // Built below, with the pairing it needs; the sweep only runs once the server listens.
    joins: { expire: () => joinRequests.expire() },
  });
  const codes = createPairingCodes(systemClock);
  // The machine that runs the server can always issue a code (ADR 0048): a secret for this run,
  // left beside the database while the server listens, for the CLI on this machine to find.
  const operatorToken = newOperatorToken();
  const socketTickets = createSocketTickets({ clock: systemClock });
  const pageTickets = createPageTickets({ clock: systemClock });
  const devices = createDeviceRegistry(db);
  const inviteRegistry = createInviteRegistry(db);
  const passkeyRegistry = createPasskeyRegistry(db);
  /**
   * Where a link's request tells the device Chips is (ADR 0232). Read when a link is used, after
   * `listen` has bound its port.
   */
  const linkUrl = () => reachableUrl({ ...config.server, port: boundPort });
  const pairDevice = createPairDevice({
    registry: devices,
    codes,
    readModels,
    clock: systemClock,
    newDeviceId: () => ids.next("device"),
    // A code that asks waits for whoever made it (ADR 0232), as a join request.
    wait: (ask) => joinRequests.waitForLink({ kind: "pairing", ...ask, url: linkUrl() }),
    // A reconnected phone's old device, signed out as the door's DELETE does it (ADR 0236).
    withdraw: async (workspaceId, deviceId) => {
      await devices.revokeDevice({ workspaceId, deviceId, at: systemClock.nowIso() });
      await pushTokens.remove(deviceId);
      const closed = sessions.closeDevice(deviceId);
      logger.info({ deviceId, closed }, "device replaced by a reconnected one");
    },
  });
  // Passkeys (ADR 0034): the origins a passkey may be used from are the configured ones and the
  // server's own public address; loopback is always allowed by the verifier itself.
  const passkeys = createPasskeys({
    registry: passkeyRegistry,
    devices,
    webauthn: { verifyRegistration, verifyAssertion },
    readModels,
    clock: systemClock,
    ids,
    randomChallenge: () => randomBytes(32).toString("base64url"),
    origins: () => {
      const configured = config.auth.passkeyOrigins;
      const own = config.server.publicUrl;
      if (own === undefined) return configured;
      try {
        return [...configured, new URL(own).origin];
      } catch {
        return configured;
      }
    },
  });
  // The tunnel key (M4.1, ADR 0039): made once and kept. Since ADR 0191 every server has one from
  // its first start (`listen` makes it), relay or not: the tunnel door on the network answers to it.
  const relayIdentity = createRelayIdentity({ keys: createServerKeys(db), clock: systemClock });

  const invites = createInvites({
    registry: inviteRegistry,
    devices,
    join: joinWorkspace,
    readModels,
    store,
    clock: systemClock,
    ids,
    mint: mintInviteToken,
    hash: hashHarnessToken,
    // A link that asks waits for its maker (ADR 0232), as a join request.
    wait: (ask) => joinRequests.waitForLink({ kind: "invite", ...ask, url: linkUrl() }),
  });

  const removalDeps = {
    people,
    devices,
    passkeys: passkeyRegistry,
    invites: inviteRegistry,
    push: pushTokens,
    codes,
    sessions,
    transferHarness,
    submitEvent,
    store,
    readModels,
    clock: systemClock,
    ids,
  };
  const removePerson = createRemovePerson(removalDeps);
  const deleteAccount = createDeleteAccount({ ...removalDeps, setPersonFace });

  // Join requests (ADR 0122): a harness or a device asks, a person allows. Their own clock, which
  // a dev-mode test may move on (`POST /v1/dev/join-clock`); the system's time otherwise.
  const joinClock = leadingClock(systemClock);
  const notifyJoin = createNotifyJoin({
    readModels,
    notifications,
    push: pushTokens,
    sender: pushSender,
    clock: systemClock,
    logger,
  });
  // Direct asks (ADR 0211, Phase 3): a guest asks the owners to share the server in Tailscale.
  const directAskRegistry = createDirectAskRegistry(db);
  const directAsks = createDirectAsks({
    registry: directAskRegistry,
    readModels,
    notifications,
    push: pushTokens,
    sender: pushSender,
    clock: systemClock,
    ids,
    logger,
  });
  // The owner's relay switch (ADR 0211, Phase 4): the link stops and starts at run time. With no
  // relay set up, the switch is Chips's own relay's, off until an owner turns it on (ADR 0245).
  const relayUrl = relayUrlOf(config);
  const relaySwitchRegistry = createRelaySwitchRegistry(db, config.relay.url !== undefined);
  /**
   * With the relay on, dial out: a phone away from the network reaches this server through the
   * tunnel, served by the same app and the same hub (M4.1, ADR 0038). On for a relay the server
   * was set up with, unless an owner turned it off (ADR 0211, Phase 4), which holds across a
   * restart; off for Chips's own until an owner turns it on.
   */
  async function startRelay(link: Omit<Parameters<typeof createRelayLink>[0], "url" | "keyPair">) {
    const dial = () =>
      createRelayLink({ url: relayUrl, keyPair: () => relayIdentity.keyPair(), ...link });
    const current = await relaySwitchRegistry.current();
    relayOn = current.on;
    if (!relayOn && current.setAt !== null) {
      logger.info({}, "the relay is off, as an owner left it");
    }
    return { dial, relay: relayOn ? dial() : undefined };
  }
  const relaySwitch = createRelaySwitch({
    registry: relaySwitchRegistry,
    directAsks: directAskRegistry,
    store,
    link: {
      configured: true,
      url: relayUrl,
      async apply(on) {
        relayOn = on;
        if (running === undefined) return;
        if (!on) {
          await running.relay?.close();
          running.relay = undefined;
        } else if (running.relay === undefined) {
          running.relay = running.dial();
        }
      },
      status: () => running?.relay?.status() ?? "off",
      trouble: () => running?.relay?.trouble(),
    },
    liveWays: (workspaceId) => running?.ws.waysIn(workspaceId) ?? new Map(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, options.relayTellMs ?? ms)),
    notifications,
    push: pushTokens,
    sender: pushSender,
    clock: systemClock,
    ids,
    logger,
  });
  const joinRequests = createJoinRequests({
    registry: createJoinRegistry(db),
    addHarness,
    declareCapabilities,
    pairDevice,
    pairingCodes: codes,
    store,
    readModels,
    clock: joinClock,
    ids,
    mint: mintJoinSecret,
    hash: hashHarnessToken,
    matches: digestsMatch,
    code: () => readableCode(),
    keyCode,
    check: joinCheck,
    // An invite's request, collected: what redeeming the invite did, done now (ADR 0232).
    collectInvite: async (request) => {
      const { inviteId, publicKey } = request;
      if (inviteId === null || publicKey === null) {
        return { ok: false, error: { kind: "unknown_invite", message: "No invite." } };
      }
      const collected = await invites.collect({
        workspaceId: request.workspaceId,
        inviteId,
        askedAt: request.createdAt,
        answer: {
          displayName: request.name ?? "",
          publicKey,
          deviceName: request.machine ?? "A device",
        },
      });
      if (!collected.ok) return collected;
      const joined = collected.value;
      return {
        ok: true,
        value: {
          device_id: joined.deviceId,
          participant_id: joined.participantId,
          workspace_id: joined.workspaceId,
          display_name: joined.displayName,
          workspace_name: joined.workspaceName,
          role: joined.role,
          ...(joined.spaceId === null ? {} : { space_id: joined.spaceId }),
        },
      };
    },
    tell: (workspaceId, request, to) => {
      sessions.join(workspaceId, request, to);
      if (request.state === "waiting") void notifyJoin.waiting(workspaceId, request.request_id, to);
    },
    // A device allowed in is handed the tunnel key with its credential (ADR 0191): what it pins.
    serverKey: () => relayIdentity.publicKey(),
  });

  // What `listen` actually bound. `port: 0` asks the OS for one, and an address built from the
  // configured zero opens nothing on any device.
  let boundPort = config.server.port;
  // What this machine is called, asked of the system the first time somebody wants it.
  let named: string | undefined;

  const deps: GatewayDeps = {
    config,
    logger,
    clock: systemClock,
    ids,
    store,
    fanOut,
    readModels,
    authenticator,
    submitEvent,
    waitForApproval,
    sweep,
    leadTurns,
    uploads,
    uploadsRegistry,
    blobs,
    playables,
    grants,
    addHarness,
    openSpace,
    upgradeAgents,
    upgradeOneRoom,
    upgradeNames,
    oneRoom,
    moveAgent,
    forkAgent,
    askAgent,
    setAgentFace,
    renameAgent,
    archiveAgent,
    deleteAgent,
    setExchange,
    setLead,
    setSpendCeiling,
    setLock,
    setAgentLock,
    harnessTokens,
    transferHarness,
    removeHarness,
    removePerson,
    deleteAccount,
    restartHarness,
    contextFiles,
    agentModels,
    agentHeartbeats,
    harnessJobs,
    agentContextWindows,
    declareCapabilities,
    eraseSpace,
    projectDoor,
    pageBuilder: createPageBuilder(),
    people,
    renamePerson,
    renameWorkspace,
    setPersonFace,
    joinWorkspace,
    invites,
    joinRequests,
    directAsks,
    relaySwitch,
    ...(config.devMode ? { joinClock } : {}),
    passkeys,
    devices,
    notifications,
    spaceIcons,
    hiddenSpaces,
    pinnedSpaces,
    banners,
    readMarks,
    push: pushTokens,
    pushStanding: pushSender.standing,
    sessionPins,
    sessions,
    macApp: options.macApp,
    presence,
    pairDevice,
    pairingCodes: codes,
    operatorToken,
    socketTickets,
    pageTickets,
    instruments,
    version,
    webDir: config.server.webDir ?? repositoryWebDir(),
    relay: {
      // None while an owner has it off (ADR 0211, Phase 4): health names none, and new invite and
      // pairing links carry none, so they open only where the server's own address does.
      get url() {
        return relayOn ? relayUrl : undefined;
      },
      publicKey: () => relayIdentity.publicKey(),
      status: () => running?.relay?.status() ?? "off",
      trouble: () => running?.relay?.trouble(),
    },
    reachableUrl: () => reachableUrl({ ...config.server, port: boundPort }),
    machine: () => {
      named ??= options.machine ?? machineName();
      return named;
    },
    connectors: connectorGallery({ source: config.server.connectors, clock: systemClock, logger }),
  };

  const app = createApp(deps);

  return {
    deps,
    app,

    async bootstrapDemo(serverUrl: string) {
      return bootstrapDemoWorkspace({
        db,
        store,
        codes,
        join: joinWorkspace,
        newId: (kind) => ids.next(kind),
        now: () => systemClock.nowIso(),
        databaseUrl: config.data.databaseUrl,
        serverUrl,
      });
    },

    async listen() {
      // Before anything is served: what the last process was stopped in the middle of.
      await settleAgents();
      // `serve` returns the http.Server it created, which is what the WebSocket gateway
      // attaches its upgrade handler to: one port serves people, harnesses and health.
      const server = await new Promise<HttpServer>((resolve) => {
        const created = serve(
          { fetch: app.fetch, port: config.server.port, hostname: config.server.host },
          () => resolve(created as unknown as HttpServer),
        );
      });

      const listening = server.address();
      if (typeof listening === "object" && listening !== null) boundPort = listening.port;
      const base =
        config.server.publicUrl ??
        `http://${config.server.host}:${typeof listening === "object" && listening !== null ? listening.port : config.server.port}`;

      const ws = attachWebSocketGateway({
        server,
        logger,
        authenticator,
        socketTickets,
        store,
        fanOut,
        readModels,
        submitEvent,
        ids,
        presence,
        serverVersion: version,
        // The URL a harness gets for an attachment: a grant for its own token, for ten minutes, at
        // the address its socket arrived at when it is on this machine, and the public one else.
        attachmentUrl: (attachmentId, tokenId, arrivedAt) =>
          harnessGrant(arrivedAt ?? base, grants, systemClock.nowMs(), { attachmentId, tokenId }),
        // A person's time in the room note is their newest phone's (ADR 0157).
        zonesOf: (workspaceId, people) => pushTokens.zonesOf(workspaceId, people),
        // A project that has had a push is one its room shows Universe for (ADR 0227).
        hasProject:
          projects === undefined
            ? undefined
            : async (spaceId) => (await projects.head(spaceId)) !== null,
        heartbeatSeconds: config.realtime.heartbeatSeconds,
        idleTimeoutSeconds: config.realtime.idleTimeoutSeconds,
        maxUnackedFrames: config.realtime.maxUnackedFrames,
        maxPayload: config.limits.maxBodyBytes,
        // A guest whose server was shared with them, arriving other than through the relay, is
        // direct (ADR 0211, Phase 3): every socket, through the door and the relay too.
        opened: (principal, via) => {
          void directAsks.arrived(principal, via);
          void relaySwitch.noteWay(principal, via);
        },
      });

      // What a tunnelled body may hold (SEC-11), through the door and through the relay alike:
      // an upload's up to the attachment limit, a socket's message what a frame may; a
      // stranger's its fixed budget.
      const tunnelLimits = {
        maxBodyBytes: config.limits.maxAttachmentBytes,
        maxSocketMessageBytes: config.limits.maxBodyBytes,
      };
      // The tunnel key exists from the first start (ADR 0191, decision 1), relay or not: the
      // door below answers to it, and the QR, the invite link and health already carry it.
      await relayIdentity.keyPair();
      // The tunnel door on this network (ADR 0191, decision 2): a phone at home opens, on this
      // port, the same tunnel to the same key it opens through the relay when it is away, and
      // the same app and the same hub answer inside it.
      const door = attachTunnelDoor({
        server,
        keyPair: () => relayIdentity.keyPair(),
        app,
        hub: ws.hub,
        logger,
        limits: tunnelLimits,
      });

      // Every approval has an expiry and every question a timeout; this is what notices.
      const sweeper = setInterval(() => {
        void sweep().catch((error: unknown) => logger.error({ err: error }, "sweep failed"));
        // A room gone still on words for nobody: its lead is handed them (ADR 0104).
        void leadTurns()
          .then((handed) => {
            if (handed.length > 0) logger.info({ handed }, "handed to a room's lead");
          })
          .catch((error: unknown) => logger.error({ err: error }, "lead turns failed"));
        drainPlayables();
      }, config.realtime.sweepSeconds * 1000);
      sweeper.unref?.();
      // A video left pending by the last run is taken up now (ADR 0053).
      drainPlayables();

      const { dial, relay } = await startRelay({ app, hub: ws.hub, logger, limits: tunnelLimits });

      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : config.server.port;
      running = { server, ws, door, sweeper, relay, dial };
      leaveOperatorToken(config, operatorToken, logger);
      logger.info({ port, host: config.server.host }, "chipsd listening");
      return { port, server, ws, door, relay };
    },

    async close() {
      if (running === undefined) return;
      clearInterval(running.sweeper);
      await running.relay?.close();
      // Drain the sockets before the listener, so a client is told rather than cut off: the
      // tunnels at the door first, since the sessions inside them are the hub's.
      await running.door.close();
      await running.ws.close();
      presence.close();
      await new Promise<void>((resolve) => running?.server.close(() => resolve()));
      running = undefined;
      removeOperatorToken(operatorTokenPath(config), operatorToken);
    },
  };
}

/**
 * The operator's token beside the database while the server listens (ADR 0048). A server that
 * cannot write it — a read-only data directory, say — still serves; it just cannot be asked for
 * a code from its own machine, and the log says so.
 */
function leaveOperatorToken(
  config: ChipsConfig,
  token: string,
  logger: GatewayDeps["logger"],
): void {
  const path = operatorTokenPath(config);
  try {
    writeOperatorToken(path, token);
  } catch (error) {
    logger.warn({ err: error, path }, "operator token not written");
  }
}
