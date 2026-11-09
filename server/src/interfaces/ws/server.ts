/**
 * `/v1/ws`, on `ws`.
 *
 * This file is the adapter: it authenticates the upgrade, wraps the socket in the small
 * `Socket` interface `Session` expects, and hands it to the hub, which keeps every session
 * whatever it came in on — this port, or the relay's tunnel (M4.1). Every rule about what a
 * frame means lives in `session.ts`, where it can be tested without a port.
 *
 * One endpoint serves people and harnesses (decision 5). A harness presents its bearer token in
 * a header, or opens with a ticket as a person does. A person cannot present a credential: a
 * browser sets no headers on a WebSocket handshake, and a device signature in the URL would be
 * a durable credential in a place URLs get logged (phase-0-review finding 5). So a person's
 * client makes one ordinary signed request for a single-use socket ticket and opens
 * `/v1/ws?ticket=…`; the ticket is spent on the upgrade and worth nothing afterwards. A harness
 * token in the URL (`?token=`) is the same durable credential in the same place (SEC-22): the
 * SDK stopped sending it, and this release still takes it, with a warning, for a bridge in the
 * wild built on an older SDK. The next release refuses it.
 */

import type { Server as HttpServer, IncomingMessage } from "node:http";
import { type WebSocket, WebSocketServer } from "ws";
import type { Principal } from "../../application/index.js";
import { upgradeArrivedAt } from "../http/arrived-at.js";
import { createSessionHub, type SessionHub, type SessionHubOptions } from "./hub.js";

export interface WebSocketGatewayOptions extends SessionHubOptions {
  readonly server: HttpServer;
  readonly path?: string;
  /**
   * The most one frame may carry (SEC-11): `limits.maxBodyBytes`, the same as a request body.
   * `ws` would otherwise take 100 MiB a frame from anyone with a ticket or a token.
   */
  readonly maxPayload: number;
}

export interface WebSocketGateway {
  /** Every session, this port's and the relay's alike. */
  readonly hub: SessionHub;
  readonly sessionCount: () => number;
  readonly closeToken: (tokenId: string) => number;
  readonly closeDevice: (deviceId: string) => number;
  readonly closePerson: SessionHub["closePerson"];
  readonly closeRoleChanged: SessionHub["closeRoleChanged"];
  readonly restart: SessionHub["restart"];
  readonly join: SessionHub["join"];
  readonly askMacs: SessionHub["askMacs"];
  readonly macs: SessionHub["macs"];
  readonly whenMac: SessionHub["whenMac"];
  readonly runState: SessionHub["runState"];
  readonly reads: SessionHub["reads"];
  readonly banners: SessionHub["banners"];
  readonly waysIn: SessionHub["waysIn"];
  readonly contextEdit: SessionHub["contextEdit"];
  readonly hearingContext: SessionHub["hearingContext"];
  readonly modelChange: SessionHub["modelChange"];
  readonly hearingModels: SessionHub["hearingModels"];
  readonly heartbeatChange: SessionHub["heartbeatChange"];
  readonly hearingHeartbeats: SessionHub["hearingHeartbeats"];
  readonly windowCompact: SessionHub["windowCompact"];
  readonly windowChange: SessionHub["windowChange"];
  readonly hearingWindows: SessionHub["hearingWindows"];
  readonly jobChange: SessionHub["jobChange"];
  readonly hearingJobs: SessionHub["hearingJobs"];
  readonly close: () => Promise<void>;
}

export function attachWebSocketGateway(options: WebSocketGatewayOptions): WebSocketGateway {
  const path = options.path ?? "/v1/ws";
  const hub = createSessionHub(options);
  const wss = new WebSocketServer({ noServer: true, maxPayload: options.maxPayload });

  options.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== path) return;

    void authenticateUpgrade(request, url)
      .then((principal) => {
        if (principal === undefined) {
          // 401 before the upgrade: a WebSocket client cannot read a body, but it can read this.
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) =>
          open(ws, principal, upgradeArrivedAt(request)),
        );
      })
      .catch((error: unknown) => {
        options.logger.error({ err: error }, "websocket upgrade failed");
        socket.destroy();
      });
  });

  async function authenticateUpgrade(
    request: IncomingMessage,
    url: URL,
  ): Promise<Principal | undefined> {
    // A person's client redeems a single-use ticket it got from a signed request. Nothing
    // durable is in the URL, so a logged handshake is worthless (phase-0-review finding 5).
    const ticket = url.searchParams.get("ticket");
    if (ticket !== null) return hub.redeemTicket(ticket);

    // A harness presents its bearer token in a header. One in the query is taken for one more
    // release (SEC-22), and said to be going: a durable credential in a URL is one in every
    // proxy log the URL crosses, and a ticket from `POST /v1/socket-tickets` costs one request.
    const queryToken = url.searchParams.get("token");
    if (request.headers.authorization === undefined && queryToken !== null) {
      options.logger.warn(
        { path: url.pathname },
        "a harness token in the socket URL (?token=) is deprecated and the next release refuses it: send it as an Authorization header, or open the socket with a ticket from POST /v1/socket-tickets",
      );
    }
    const authorization =
      request.headers.authorization ?? (queryToken === null ? undefined : `Bearer ${queryToken}`);
    if (authorization === undefined) return undefined;
    return hub.authenticateToken(authorization);
  }

  function open(ws: WebSocket, principal: Principal, arrivedAt: string | undefined): void {
    const session = hub.open(
      {
        send: (data) => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        },
        close: (code, reason) => ws.close(code, reason),
      },
      principal,
      "socket",
      arrivedAt,
    );
    ws.on("message", (data) => session.receive(data.toString()));
    ws.on("close", () => session.disconnected());
    ws.on("error", (error) => {
      options.logger.warn({ err: error }, "socket error");
      session.disconnected();
    });
  }

  return {
    hub,
    sessionCount: () => hub.sessionCount(),
    closeDevice: (deviceId) => hub.closeDevice(deviceId),
    closePerson: (workspaceId, participantId) => hub.closePerson(workspaceId, participantId),
    closeRoleChanged: (workspaceId, participantId) =>
      hub.closeRoleChanged(workspaceId, participantId),
    closeToken: (tokenId) => hub.closeToken(tokenId),
    restart: (workspaceId, harnessId, ask) => hub.restart(workspaceId, harnessId, ask),
    join: (workspaceId, request, to) => hub.join(workspaceId, request, to),
    askMacs: (workspaceId, participantId, frame) => hub.askMacs(workspaceId, participantId, frame),
    macs: (workspaceId, participantId) => hub.macs(workspaceId, participantId),
    whenMac: (workspaceId, participantId, withinMs) =>
      hub.whenMac(workspaceId, participantId, withinMs),
    runState: (workspaceId, participantId, frame) =>
      hub.runState(workspaceId, participantId, frame),
    reads: (workspaceId, participantId, frame) => hub.reads(workspaceId, participantId, frame),
    banners: (workspaceId, participantId, frame) => hub.banners(workspaceId, participantId, frame),
    waysIn: (workspaceId) => hub.waysIn(workspaceId),
    contextEdit: (workspaceId, harnessId, frame) => hub.contextEdit(workspaceId, harnessId, frame),
    hearingContext: (workspaceId, harnessId) => hub.hearingContext(workspaceId, harnessId),
    modelChange: (workspaceId, harnessId, frame) => hub.modelChange(workspaceId, harnessId, frame),
    hearingModels: (workspaceId, harnessId) => hub.hearingModels(workspaceId, harnessId),
    heartbeatChange: (workspaceId, harnessId, frame) =>
      hub.heartbeatChange(workspaceId, harnessId, frame),
    hearingHeartbeats: (workspaceId, harnessId) => hub.hearingHeartbeats(workspaceId, harnessId),
    windowCompact: (workspaceId, harnessId, frame) =>
      hub.windowCompact(workspaceId, harnessId, frame),
    windowChange: (workspaceId, harnessId, frame) =>
      hub.windowChange(workspaceId, harnessId, frame),
    hearingWindows: (workspaceId, harnessId) => hub.hearingWindows(workspaceId, harnessId),
    jobChange: (workspaceId, harnessId, frame) => hub.jobChange(workspaceId, harnessId, frame),
    hearingJobs: (workspaceId, harnessId) => hub.hearingJobs(workspaceId, harnessId),
    close: async () => {
      hub.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
