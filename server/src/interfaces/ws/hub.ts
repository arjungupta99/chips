/**
 * The sessions, whatever they came in on.
 *
 * `server.ts` opens a session for a socket that arrived at `/v1/ws`; the relay link (M4.1)
 * opens one for a socket that arrived inside a tunnel. Both are the same `Session` over the
 * same small `Socket` interface, and this is where they are kept: counted, ticked by the
 * heartbeat, and found again when a token or a device is withdrawn (ADR 0023, ADR 0034). A
 * harness's sockets are counted into presence as they open and close, and a change in any
 * harness's state is said to every person's socket that asked for it (ADR 0083). The
 * two ways a person's socket is authenticated — a single-use ticket, a harness's bearer token
 * — are here too, so the tunnel authenticates an upgrade exactly as the port does.
 */

import type { Logger } from "@chipschat/platform";
import { withContext } from "@chipschat/platform";
import type {
  Authenticator,
  EventStore,
  FanOut,
  IdGenerator,
  Presence,
  Principal,
  ReadModels,
  Sessions,
  SocketTickets,
  SubmitEvent,
} from "../../application/index.js";
import type { SocketWay } from "../../application/ports/relay-switch.js";
import { administers, type WorkspaceRole } from "../../domain/index.js";
import {
  CLOSE_PERSON_REMOVED,
  CLOSE_ROLE_CHANGED,
  CLOSE_TOKEN_REVOKED,
  Session,
  type SessionOptions,
  type Socket,
} from "./session.js";

export interface SessionHubOptions {
  readonly logger: Logger;
  readonly authenticator: Authenticator;
  readonly socketTickets: SocketTickets;
  readonly store: EventStore;
  readonly fanOut: FanOut;
  readonly readModels: ReadModels;
  readonly submitEvent: SubmitEvent;
  readonly ids: IdGenerator;
  /** Whether each harness can answer (ADR 0083): its sockets are counted here. */
  readonly presence: Presence;
  readonly serverVersion: string;
  /**
   * The URL a harness gets for an attachment in `message.new`: a signed grant for its token, at
   * the address its socket arrived at when that was this machine's own (`arrivedAt`).
   */
  readonly attachmentUrl?:
    | ((
        attachmentId: string,
        tokenId: string,
        arrivedAt: string | undefined,
      ) => ReturnType<NonNullable<SessionOptions["attachmentUrl"]>>)
    | undefined;
  /** Each person's zone, for the room note's clock (ADR 0157). */
  readonly zonesOf?: SessionOptions["zonesOf"] | undefined;
  /** Whether a space's project has had a change, for where the room note says it opens (ADR 0227). */
  readonly hasProject?: SessionOptions["hasProject"] | undefined;
  readonly heartbeatSeconds: number;
  readonly idleTimeoutSeconds: number;
  readonly maxUnackedFrames: number;
  readonly now?: (() => number) | undefined;
  /** Told of every session opened, and which way its socket came (ADR 0211, Phase 3). */
  readonly opened?: ((principal: Principal, via: SocketWay) => void) | undefined;
}

/** A session as the transport that opened it drives it. */
export interface OpenSession {
  /** One inbound frame. Frames are handled in order, and a failure never escapes. */
  readonly receive: (raw: string) => void;
  /** The socket is gone. */
  readonly disconnected: () => void;
}

export interface SessionHub {
  /**
   * A session for an authenticated principal over a socket; `via` names the transport for the
   * log. `arrivedAt` is the address the socket reached the server at, when it came straight from
   * this machine: the links a harness there is handed name it.
   */
  readonly open: (
    socket: Socket,
    principal: Principal,
    via: SocketWay,
    arrivedAt?: string,
  ) => OpenSession;
  /** Spend a single-use ticket (ADR 0006): the principal it was minted for, once. */
  readonly redeemTicket: (ticket: string) => Principal | undefined;
  /** A harness's bearer token, as on an upgrade. */
  readonly authenticateToken: (authorization: string) => Promise<Principal | undefined>;
  readonly sessionCount: () => number;
  /**
   * End every socket opened with a token, because the token has been withdrawn (ADR 0023).
   * 4001 is the application's own close code; the client hears it and does not resume, because
   * resuming needs a credential it no longer has.
   */
  readonly closeToken: (tokenId: string) => number;
  /** End every socket a person's device holds, because the device was withdrawn (ADR 0034). */
  readonly closeDevice: (deviceId: string) => number;
  /**
   * End every socket a person holds, because they were removed from the workspace (ADR 0160):
   * 4003, which tells their screen so, where 4001 would only say the credential went.
   */
  readonly closePerson: Sessions["closePerson"];
  /**
   * End every socket a person holds, because their role changed (SEC-26): a socket's principal
   * was read when it opened, and presence and the directory read the role off it, so the old
   * standing would hold until the person happened to reconnect. 4005, which the apps answer by
   * opening the next socket.
   */
  readonly closeRoleChanged: (workspaceId: string, participantId: string) => number;
  /** Ask a harness to restart, on every socket of it that hears `restart` (ADR 0094). */
  readonly restart: Sessions["restart"];
  /** A join request, to every owner's and admin's socket that hears `join` (ADR 0122). */
  readonly join: Sessions["join"];
  /** A person's ask for a room's folder, to every socket of theirs that hears `folders` (ADR 0225). */
  readonly askMacs: Sessions["askMacs"];
  /** How many of a person's sockets hear `folders`: their open Macs (ADR 0226). */
  readonly macs: Sessions["macs"];
  /** How many, once one opens: a Chips for Mac the server opened, saying `folders` (ADR 0227). */
  readonly whenMac: Sessions["whenMac"];
  /** A Mac's word on a person's run, to every socket of theirs that hears `folder_runs` (ADR 0226). */
  readonly runState: Sessions["runState"];
  /** How far a person read, to every socket of theirs that hears `reads` (ADR 0262). */
  readonly reads: Sessions["reads"];
  /** What a person wants of the banner, to every socket of theirs that hears it (ADR 0286). */
  readonly banners: Sessions["banners"];
  /**
   * The way each device of a workspace has a socket now, by device (ADR 0211, Phase 4): the
   * relay, the tunnel door, or the port. A device with two takes the one opened last.
   */
  readonly waysIn: (workspaceId: string) => ReadonlyMap<string, SocketWay>;
  /** A person's edit of a context file, to every socket of its harness that hears `context` (ADR 0134). */
  readonly contextEdit: Sessions["contextEdit"];
  readonly hearingContext: Sessions["hearingContext"];
  /** A person's change of an agent's model, to every socket of its harness that hears `models` (ADR 0140). */
  readonly modelChange: Sessions["modelChange"];
  readonly hearingModels: Sessions["hearingModels"];
  /** A person's change of an agent's heartbeat, to every socket of its harness that hears `heartbeats` (ADR 0143). */
  readonly heartbeatChange: Sessions["heartbeatChange"];
  readonly hearingHeartbeats: Sessions["hearingHeartbeats"];
  /** A person's Compact now and new limit, to every socket of its harness that hears `context_windows` (ADR 0146). */
  readonly windowCompact: Sessions["windowCompact"];
  readonly windowChange: Sessions["windowChange"];
  readonly hearingWindows: Sessions["hearingWindows"];
  /** A person's switch of a harness's own job, to every socket of it that hears `jobs` (ADR 0252). */
  readonly jobChange: Sessions["jobChange"];
  readonly hearingJobs: Sessions["hearingJobs"];
  readonly close: () => void;
}

/**
 * Whether a person's socket hears a join request: a link's, the one person it is asked of (ADR
 * 0232); every other, an owner or admin.
 */
function decidesJoin(
  principal: { readonly participantId: string; readonly role?: WorkspaceRole | undefined },
  to: string | undefined,
): boolean {
  return to === undefined ? administers(principal.role) : principal.participantId === to;
}

export function createSessionHub(options: SessionHubOptions): SessionHub {
  const now = options.now ?? Date.now;
  const sessions = new Set<Session>();
  /** The token each harness session presented, so a withdrawal can find the sockets it holds. */
  const tokenOf = new WeakMap<Session, string>();
  /** The device each person's session came from, for the same reason. */
  const deviceOf = new WeakMap<Session, string>();
  /** Who each session is, so a harness's change of state reaches the people it is for. */
  const principalOf = new WeakMap<Session, Principal>();
  /** Which way each session's socket came (ADR 0211, Phase 4). */
  const wayOf = new WeakMap<Session, SocketWay>();
  /**
   * People waiting for a Mac of theirs to say `folders` (ADR 0227's second addendum): an ask from
   * the phone held while the Chips for Mac the server opened starts and connects.
   */
  const awaitingMacs = new Set<{
    readonly workspaceId: string;
    readonly participantId: string;
    readonly done: (macs: number) => void;
  }>();

  // A guest is told of harnesses by the directory, which shows them only those they share a room
  // with; a frame would tell them of every one.
  const unwatch = options.presence.watch((workspaceId, harnessId, state) => {
    for (const session of sessions) {
      const principal = principalOf.get(session);
      if (principal?.kind !== "person" || principal.workspaceId !== workspaceId) continue;
      if (principal.role === "guest") continue;
      session.offer("presence", { frame: "presence", participant_id: harnessId, state });
    }
  });

  // Decision 5: heartbeats every twenty seconds, and a silent socket closed at sixty. A beat that
  // comes late says how long the server itself stood still, which no socket is blamed for.
  let lastBeat = now();
  const heartbeat = setInterval(() => {
    const beat = now();
    const stalled = Math.max(0, beat - lastBeat - options.heartbeatSeconds * 1000);
    lastBeat = beat;
    for (const session of sessions) session.tick(options.idleTimeoutSeconds * 1000, stalled);
  }, options.heartbeatSeconds * 1000);
  heartbeat.unref?.();

  const closeWhere = (
    matches: (session: Session) => boolean,
    reason: string,
    code = CLOSE_TOKEN_REVOKED,
  ): number => {
    let closed = 0;
    for (const session of sessions) {
      if (!matches(session)) continue;
      session.close(code, reason);
      closed += 1;
    }
    return closed;
  };

  /** Whether a session is this person's. */
  const isPerson = (workspaceId: string, participantId: string) => (session: Session) => {
    const principal = principalOf.get(session);
    return (
      principal?.kind === "person" &&
      principal.workspaceId === workspaceId &&
      principal.participantId === participantId
    );
  };

  /** How many of a person's sockets hear `folders`: their open Macs. */
  const macsOf = (workspaceId: string, participantId: string): number => {
    let open = 0;
    for (const session of sessions) {
      if (isPerson(workspaceId, participantId)(session) && session.hears("folders")) open += 1;
    }
    return open;
  };

  /** After a person's socket has said what it hears: anyone waiting for their Mac is answered. */
  const macHeard = (principal: Principal, session: Session): void => {
    if (awaitingMacs.size === 0 || principal.kind !== "person" || !session.hears("folders")) return;
    for (const waiting of awaitingMacs) {
      if (
        waiting.workspaceId === principal.workspaceId &&
        waiting.participantId === principal.participantId
      ) {
        waiting.done(macsOf(waiting.workspaceId, waiting.participantId));
      }
    }
  };

  /**
   * What a session may look up, when the server gave it: attachment URLs, at the address its socket
   * arrived at when that was this machine's, and people's zones.
   */
  const lookupsAt = (
    arrivedAt: string | undefined,
  ): Pick<SessionOptions, "attachmentUrl" | "zonesOf" | "hasProject" | "stateOf"> => {
    const signs = options.attachmentUrl;
    return {
      // Which of a room's agents can't answer, for the room note (ADR 0291).
      stateOf: (workspaceId, harnessId) => options.presence.stateOf(workspaceId, harnessId),
      ...(signs === undefined
        ? {}
        : { attachmentUrl: (attachmentId, tokenId) => signs(attachmentId, tokenId, arrivedAt) }),
      ...(options.zonesOf === undefined ? {} : { zonesOf: options.zonesOf }),
      ...(options.hasProject === undefined ? {} : { hasProject: options.hasProject }),
    };
  };

  /** A harness's sockets that named `extension` in their `hello`: the ones a frame of it reaches. */
  const hearing = (workspaceId: string, harnessId: string, extension: string): Session[] =>
    [...sessions].filter((session) => {
      const principal = principalOf.get(session);
      return (
        principal?.kind === "harness" &&
        principal.workspaceId === workspaceId &&
        principal.participantId === harnessId &&
        session.hears(extension)
      );
    });
  const offer = (
    workspaceId: string,
    harnessId: string,
    extension: string,
    frame: Parameters<Session["offer"]>[1],
  ): number => {
    const reached = hearing(workspaceId, harnessId, extension);
    for (const session of reached) session.offer(extension, frame);
    return reached.length;
  };

  return {
    open(socket, principal, via, arrivedAt) {
      // The device by its id, on every line its socket logs: which phone is back, without a
      // registry that writes last seen once a minute (`pnpm phone`'s wait, tools/phone/opened.mjs).
      const logger = withContext(options.logger, {
        workspaceId: principal.workspaceId,
        ...(principal.kind === "harness" ? { harnessId: principal.participantId } : {}),
        ...(principal.deviceId === undefined ? {} : { deviceId: principal.deviceId }),
      });
      const session = new Session({
        socket,
        principal,
        store: options.store,
        fanOut: options.fanOut,
        readModels: options.readModels,
        submitEvent: options.submitEvent,
        ids: options.ids,
        serverVersion: options.serverVersion,
        ...lookupsAt(arrivedAt),
        maxUnackedFrames: options.maxUnackedFrames,
        now,
        onLog: (level, message, fields) => logger[level](fields ?? {}, message),
      });
      sessions.add(session);
      principalOf.set(session, principal);
      if (principal.kind === "harness") {
        options.presence.opened(principal.workspaceId, principal.participantId);
      }
      if (principal.tokenId !== undefined) tokenOf.set(session, principal.tokenId);
      if (principal.deviceId !== undefined) deviceOf.set(session, principal.deviceId);
      wayOf.set(session, via);
      logger.info({ sessions: sessions.size, via }, "socket open");
      options.opened?.(principal, via);

      // In order: a `ping` sent after `subscribe` is answered only once the subscription is
      // live, which is what lets a client know its handlers will hear what comes next.
      let chain: Promise<void> = Promise.resolve();
      let gone = false;
      return {
        receive(raw) {
          chain = chain
            .then(() => session.receive(raw))
            .then(() => macHeard(principal, session))
            .catch((error: unknown) => {
              logger.error({ err: error }, "frame handling failed");
            });
        },
        disconnected() {
          if (gone) return;
          gone = true;
          session.onDisconnected();
          sessions.delete(session);
          if (principal.kind === "harness") {
            options.presence.closed(principal.workspaceId, principal.participantId);
          }
          logger.info({ sessions: sessions.size, via }, "socket closed");
        },
      };
    },
    redeemTicket(ticket) {
      const principal = options.socketTickets.redeem(ticket);
      if (principal === undefined) options.logger.warn({}, "websocket ticket not valid");
      return principal;
    },
    async authenticateToken(authorization) {
      const result = await options.authenticator.authenticate({
        authorization,
        method: "GET",
        target: "/v1/ws",
        body: "",
      });
      if (!result.ok) {
        options.logger.warn({ reason: result.reason }, "websocket authentication refused");
        return undefined;
      }
      return result.principal;
    },
    sessionCount: () => sessions.size,
    waysIn: (workspaceId) => {
      const ways = new Map<string, SocketWay>();
      for (const session of sessions) {
        const device = deviceOf.get(session);
        const way = wayOf.get(session);
        if (device === undefined || way === undefined) continue;
        if (principalOf.get(session)?.workspaceId === workspaceId) ways.set(device, way);
      }
      return ways;
    },
    closeDevice: (deviceId) => {
      const closed = closeWhere((session) => deviceOf.get(session) === deviceId, "device_revoked");
      if (closed > 0) options.logger.info({ deviceId, closed }, "sockets closed: device revoked");
      return closed;
    },
    closePerson: (workspaceId, participantId) => {
      const closed = closeWhere(
        isPerson(workspaceId, participantId),
        "person_removed",
        CLOSE_PERSON_REMOVED,
      );
      if (closed > 0)
        options.logger.info({ participantId, closed }, "sockets closed: person removed");
      return closed;
    },
    closeRoleChanged: (workspaceId, participantId) => {
      const closed = closeWhere(
        isPerson(workspaceId, participantId),
        "role_changed",
        CLOSE_ROLE_CHANGED,
      );
      if (closed > 0)
        options.logger.info({ participantId, closed }, "sockets closed: role changed");
      return closed;
    },
    closeToken: (tokenId) => {
      const closed = closeWhere((session) => tokenOf.get(session) === tokenId, "token_revoked");
      if (closed > 0) options.logger.info({ tokenId, closed }, "sockets closed: token revoked");
      return closed;
    },
    restart: (workspaceId, harnessId, ask) => {
      let sent = 0;
      for (const session of sessions) {
        const principal = principalOf.get(session);
        if (principal?.kind !== "harness" || principal.workspaceId !== workspaceId) continue;
        if (principal.participantId !== harnessId || !session.hears("restart")) continue;
        session.offer("restart", { frame: "restart", asked_by: ask.by, asked_at: ask.at });
        sent += 1;
      }
      options.logger.info({ harnessId, by: ask.by, sockets: sent }, "restart sent to the harness");
      return sent;
    },
    hearingContext: (workspaceId, harnessId) => hearing(workspaceId, harnessId, "context").length,
    contextEdit: (workspaceId, harnessId, frame) => {
      const sent = offer(workspaceId, harnessId, "context", frame);
      options.logger.info(
        { harnessId, edit: frame.edit_id, sockets: sent },
        "context edit sent to the harness",
      );
      return sent;
    },
    hearingModels: (workspaceId, harnessId) => hearing(workspaceId, harnessId, "models").length,
    modelChange: (workspaceId, harnessId, frame) => {
      const sent = offer(workspaceId, harnessId, "models", frame);
      options.logger.info(
        { harnessId, agent: frame.agent_id, change: frame.change_id, sockets: sent },
        "model change sent to the harness",
      );
      return sent;
    },
    hearingHeartbeats: (workspaceId, harnessId) =>
      hearing(workspaceId, harnessId, "heartbeats").length,
    heartbeatChange: (workspaceId, harnessId, frame) => {
      const sent = offer(workspaceId, harnessId, "heartbeats", frame);
      options.logger.info(
        { harnessId, agent: frame.agent_id, change: frame.change_id, sockets: sent },
        "heartbeat change sent to the harness",
      );
      return sent;
    },
    hearingWindows: (workspaceId, harnessId) =>
      hearing(workspaceId, harnessId, "context_windows").length,
    windowCompact: (workspaceId, harnessId, frame) => {
      const sent = offer(workspaceId, harnessId, "context_windows", frame);
      options.logger.info(
        { harnessId, agent: frame.agent_id, change: frame.change_id, sockets: sent },
        "compact now sent to the harness",
      );
      return sent;
    },
    windowChange: (workspaceId, harnessId, frame) => {
      const sent = offer(workspaceId, harnessId, "context_windows", frame);
      options.logger.info(
        { harnessId, agent: frame.agent_id, change: frame.change_id, sockets: sent },
        "context window limit sent to the harness",
      );
      return sent;
    },
    hearingJobs: (workspaceId, harnessId) => hearing(workspaceId, harnessId, "jobs").length,
    jobChange: (workspaceId, harnessId, frame) => {
      const sent = offer(workspaceId, harnessId, "jobs", frame);
      options.logger.info(
        { harnessId, job: frame.job_id, change: frame.change_id, sockets: sent },
        "job change sent to the harness",
      );
      return sent;
    },
    join: (workspaceId, request, to) => {
      let sent = 0;
      for (const session of sessions) {
        const principal = principalOf.get(session);
        if (principal?.kind !== "person" || principal.workspaceId !== workspaceId) continue;
        if (!decidesJoin(principal, to) || !session.hears("join")) continue;
        session.offer("join", { frame: "join", request });
        sent += 1;
      }
      return sent;
    },
    askMacs: (workspaceId, participantId, frame) => {
      let sent = 0;
      for (const session of sessions) {
        if (!isPerson(workspaceId, participantId)(session) || !session.hears("folders")) continue;
        session.offer("folders", frame);
        sent += 1;
      }
      options.logger.info(
        { participantId, spaceId: frame.space_id, frame: frame.frame, sockets: sent },
        "folder ask sent to the person's Macs",
      );
      return sent;
    },
    macs: macsOf,
    whenMac: (workspaceId, participantId, withinMs) => {
      const open = macsOf(workspaceId, participantId);
      if (open > 0) return Promise.resolve(open);
      return new Promise<number>((resolve) => {
        const waiting = {
          workspaceId,
          participantId,
          done: (macs: number) => {
            clearTimeout(given);
            awaitingMacs.delete(waiting);
            resolve(macs);
          },
        };
        const given = setTimeout(() => waiting.done(0), withinMs);
        given.unref?.();
        awaitingMacs.add(waiting);
      });
    },
    runState: (workspaceId, participantId, frame) => {
      let sent = 0;
      for (const session of sessions) {
        if (!isPerson(workspaceId, participantId)(session) || !session.hears("folder_runs"))
          continue;
        session.offer("folder_runs", frame);
        sent += 1;
      }
      return sent;
    },
    reads: (workspaceId, participantId, frame) => {
      let sent = 0;
      for (const session of sessions) {
        if (!isPerson(workspaceId, participantId)(session) || !session.hears("reads")) continue;
        session.offer("reads", frame);
        sent += 1;
      }
      return sent;
    },
    banners: (workspaceId, participantId, frame) => {
      let sent = 0;
      for (const session of sessions) {
        if (!isPerson(workspaceId, participantId)(session) || !session.hears("banners")) continue;
        session.offer("banners", frame);
        sent += 1;
      }
      return sent;
    },
    close: () => {
      clearInterval(heartbeat);
      unwatch();
      for (const session of sessions) session.close(1001, "server shutting down");
      sessions.clear();
      for (const waiting of awaitingMacs) waiting.done(0);
    },
  };
}
