/**
 * A room's project over git's smart HTTP (ADR 0220):
 *
 *   GET  /v1/spaces/:id/project.git/info/refs?service=…   what the project has, for a fetch or a push
 *   POST /v1/spaces/:id/project.git/git-upload-pack       a fetch or a clone
 *   POST /v1/spaces/:id/project.git/git-receive-pack      a push
 *   POST /v1/spaces/:id/project/token                     a person's token for git, from a signed device
 *   POST /v1/spaces/:id/project/folder/open               the person's own Mac asked to open its folder, or its page
 *   POST /v1/spaces/:id/project/run                       the person's own Mac asked to run or stop it
 *                                                          (either opens the owner's Chips for Mac
 *                                                          here first when it isn't, ADR 0227)
 *   PUT  /v1/spaces/:id/project/run                       that Mac's word on how the run stands
 *   GET  /v1/spaces/:id/project/run                       how it stands, for the person's other devices
 *
 * git cannot sign Chips's requests, so the git routes take their credential themselves, past the
 * credential middleware, as the page door does: a harness's token as a bearer, with the agent it
 * is for in `chips-actor`; or a person's project token, as a bearer or as the password git's
 * credential helper sends. A request with neither is asked for one, as git expects, and every
 * refusal is plain words, which git shows as `remote:` lines. Their bodies are git's packs, which
 * are never read here: they go to git as they arrive, and git's answer comes back as it is written.
 */

import {
  committerId,
  formatLimit,
  type HeldRun,
  PROJECT_ACTOR_HEADER,
  PROJECT_TOKEN_PREFIX,
  PROJECT_TOKEN_TTL_SECONDS,
  type ProjectChangeAnswer,
  type ProjectFilesAnswer,
  type ProjectFolderOpenAnswer,
  type ProjectHistoryAnswer,
  type ProjectRunAnswer,
  type ProjectToken,
  type ProjectUndoAnswer,
  projectFileType,
  projectPath,
  projectRequest,
  projectRun,
} from "@chipschat/protocol";
import type { Context, Hono } from "hono";
import { PAGE_TICKET_TTL_SECONDS, type Principal } from "../../../application/index.js";
import { isPushRequest, type ProjectRefusal } from "../../../application/use-cases/project-door.js";
import { mintProjectToken, readProjectToken } from "../../../infrastructure/projects/token.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { issuePageTicket } from "./pages.js";

/** Whether a request is for a room's project over git, which checks its own credential. */
export function isProjectRoute(path: string): boolean {
  return projectRequest(path) !== undefined;
}

/** The three requests git's smart HTTP makes, and nothing else git could be asked. */
function isSmart(method: string, rest: string): boolean {
  if (method === "GET") return rest === "/info/refs";
  return method === "POST" && (rest === "/git-upload-pack" || rest === "/git-receive-pack");
}

/** Plain words for git, which prints them after `remote:`. */
function words(status: 401 | 403 | 404 | 503, message: string): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(status === 401 ? { "www-authenticate": 'Basic realm="Chips", charset="UTF-8"' } : {}),
    },
  });
}

const STATUS_OF: Readonly<Record<ProjectRefusal["kind"], 403 | 404 | 503>> = {
  forbidden: 403,
  not_found: 404,
  unavailable: 503,
};

/** The token a request carries: a bearer, or the password of git's basic credential. */
export function tokenOf(authorization: string | undefined): string | undefined {
  if (authorization === undefined) return undefined;
  const bearer = /^Bearer (\S+)$/i.exec(authorization.trim());
  if (bearer !== null) return bearer[1];
  const basic = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(authorization.trim());
  if (basic === null) return undefined;
  const pair = Buffer.from(basic[1] ?? "", "base64").toString("utf8");
  const colon = pair.indexOf(":");
  return colon < 0 ? undefined : pair.slice(colon + 1) || undefined;
}

/** Who the credential is: a harness by its token, or a person by their device's project token. */
async function principalOf(
  deps: GatewayDeps,
  c: Context<GatewayEnv>,
  spaceId: string,
  token: string,
): Promise<Principal | undefined> {
  if (token.startsWith(PROJECT_TOKEN_PREFIX)) {
    const read = readProjectToken({
      token,
      spaceId,
      secret: deps.grants.secret,
      nowSeconds: Math.floor(deps.clock.nowMs() / 1000),
    });
    if (!read.ok) {
      c.get("logger").warn({ reason: read.reason }, "project token refused");
      return undefined;
    }
    const device = await deps.authenticator.grantedDevice(read.deviceId);
    return device.ok ? device.principal : undefined;
  }
  const result = await deps.authenticator.authenticate({
    authorization: `Bearer ${token}`,
    method: c.req.method,
    target: new URL(c.req.url).pathname,
    body: "",
  });
  if (!result.ok) {
    c.get("logger").warn({ reason: result.reason }, "authentication refused");
    return undefined;
  }
  // A person signs Chips's requests; at git's door they come with a project token instead.
  return result.principal.kind === "harness" ? result.principal : undefined;
}

/** Who a git request is from, or the words it is turned away with. */
async function credentialOf(
  deps: GatewayDeps,
  c: Context<GatewayEnv>,
  spaceId: string,
): Promise<Principal | Response> {
  const token = tokenOf(c.req.header("authorization"));
  if (token === undefined && c.req.header("x-chips-device") !== undefined) {
    // A device that signs Chips's requests, at a door git can't sign for.
    return words(
      403,
      `git can't sign requests: ask for a project token at POST /v1/spaces/${spaceId}/project/token.`,
    );
  }
  if (token === undefined) return words(401, "Chips needs a token for this project.");
  const principal = await principalOf(deps, c, spaceId, token);
  return principal ?? words(401, "That token is not good for this project.");
}

/** git's three requests, which check their own credential, so they come before the middleware does. */
export function registerProjectGitRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.on(["GET", "POST"], "/v1/spaces/:id/project.git/*", async (c) => {
    const asked = projectRequest(c.req.path);
    if (asked === undefined) return words(404, "You are in no space with that id.");
    if (!isSmart(c.req.method, asked.rest)) {
      return words(404, "A space's project answers git's smart HTTP, and nothing else.");
    }
    const principal = await credentialOf(deps, c, asked.spaceId);
    if (principal instanceof Response) return principal;

    const url = new URL(c.req.url);
    const admitted = await deps.projectDoor.admit({
      principal,
      spaceId: asked.spaceId,
      actorId: c.req.header(PROJECT_ACTOR_HEADER),
      // A guest reads the project and pushes nothing (SEC-40): turned away at git's first ask.
      writes: isPushRequest(c.req.method, asked.rest, url.search.slice(1)) ? "push" : undefined,
    });
    if (!admitted.ok) return words(STATUS_OF[admitted.error.kind], admitted.error.message);

    const served = await deps.projectDoor.serve(admitted.value, {
      method: c.req.method,
      rest: asked.rest,
      query: url.search.slice(1),
      contentType: c.req.header("content-type"),
      contentLength: c.req.header("content-length"),
      contentEncoding: c.req.header("content-encoding"),
      gitProtocol: c.req.header("git-protocol"),
      body: c.req.raw.body,
    });
    void served.done.then((code) => {
      if (code !== 0) {
        c.get("logger").warn(
          { spaceId: admitted.value.spaceId, code },
          "git ended a project request with an error",
        );
      }
    });
    return new Response(served.body, { status: served.status, headers: served.headers });
  });
}

/** A person's token for git, from a request their device signed. */
export function registerProjectTokenRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/spaces/:id/project/token", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "person" || principal.deviceId === undefined) {
      throw new HttpError(
        "forbidden",
        "A project token is a person's, for git on their device: a harness uses its own token.",
      );
    }
    const spaceId = c.req.param("id");
    const admitted = await deps.projectDoor.admit({ principal, spaceId });
    if (!admitted.ok) {
      if (admitted.error.kind === "unavailable")
        throw new HttpError("internal", admitted.error.message);
      throw new HttpError(admitted.error.kind, admitted.error.message);
    }
    const expiresAt = Math.floor(deps.clock.nowMs() / 1000) + PROJECT_TOKEN_TTL_SECONDS;
    const answer: ProjectToken = {
      token: mintProjectToken({
        spaceId: admitted.value.spaceId,
        deviceId: principal.deviceId,
        expiresAt,
        secret: deps.grants.secret,
      }),
      expires_at: new Date(expiresAt * 1000).toISOString(),
      path: projectPath(admitted.value.spaceId),
    };
    return c.json(answer, 201);
  });

  // Open folder on Mac (ADR 0225): from the phone or a browser, the person's own Chips for Mac is
  // asked to open the room's folder in Finder, or, with `{"what": "page"}`, the room's page in its
  // own window (ADR 0227). An owner's alone (ADR 0231), and only their sockets hear it; the answer
  // says how many Macs did.
  app.post("/v1/spaces/:id/project/folder/open", async (c) => {
    const { principal, spaceId, from } = await ownerAt(c, deps, "opens their folder");
    const { what } = (await c.req.json().catch(() => ({}))) as { what?: unknown };
    if (what !== undefined && what !== "folder" && what !== "page") {
      throw new HttpError("invalid_event", 'Say "folder" or "page" as `what`, or leave it out.');
    }
    const opened = await openMacApp(deps, principal, spaceId);
    const macs = deps.sessions.askMacs(principal.workspaceId, principal.participantId, {
      frame: "folder.open",
      space_id: spaceId,
      ...(what === "page" ? { what } : {}),
      asked_from: from,
      asked_at: new Date(deps.clock.nowMs()).toISOString(),
    });
    const answer: ProjectFolderOpenAnswer = { macs, ...(opened ? { opened_app: true } : {}) };
    return c.json(answer);
  });

  // Run (ADR 0226): the person's Mac runs the room's project as its run file says, or stops it,
  // asked from any device of theirs. Each Mac says how its run stands, and the server keeps the
  // last word for the person's other devices, here and only while it runs: a run is the person's
  // own, never the room's, and never written down.
  const runs = new Map<string, HeldRun>();
  const runKey = (principal: { workspaceId: string; participantId: string }, spaceId: string) =>
    `${principal.workspaceId}/${principal.participantId}/${spaceId}`;

  app.post("/v1/spaces/:id/project/run", async (c) => {
    const { principal, spaceId, from } = await ownerAt(c, deps, "runs the project");
    const { op, command } = (await c.req.json().catch(() => ({}))) as {
      op?: unknown;
      command?: unknown;
    };
    if (op !== "run" && op !== "stop") {
      throw new HttpError("invalid_event", 'Say "run" or "stop" as `op`.');
    }
    if (op === "run" && (typeof command !== "string" || command === "" || command.length > 1100)) {
      throw new HttpError("invalid_event", "Say what the person saw would run, as `command`.");
    }
    // Stop asks nothing of a Mac that isn't open: whatever it ran went with it.
    const opened = op === "run" && (await openMacApp(deps, principal, spaceId));
    const macs = deps.sessions.askMacs(principal.workspaceId, principal.participantId, {
      frame: "folder.run",
      space_id: spaceId,
      op,
      ...(op === "run" ? { command: command as string } : {}),
      asked_from: from,
      asked_at: new Date(deps.clock.nowMs()).toISOString(),
    });
    const answer: ProjectFolderOpenAnswer = { macs, ...(opened ? { opened_app: true } : {}) };
    return c.json(answer);
  });

  app.put("/v1/spaces/:id/project/run", async (c) => {
    const { principal, spaceId, from } = await personAt(c, deps, "says how its run stands");
    const said = projectRun.safeParse(
      ((await c.req.json().catch(() => ({}))) as { run?: unknown }).run,
    );
    if (!said.success) throw new HttpError("invalid_event", "That isn't how a run stands.");
    const run: HeldRun = {
      ...said.data,
      mac: from,
      said_at: new Date(deps.clock.nowMs()).toISOString(),
    };
    runs.set(runKey(principal, spaceId), run);
    deps.sessions.runState(principal.workspaceId, principal.participantId, {
      frame: "folder.run_state",
      space_id: spaceId,
      run,
    });
    return c.body(null, 204);
  });

  app.get("/v1/spaces/:id/project/run", async (c) => {
    const { principal, spaceId } = await personAt(c, deps, "reads how its run stands");
    const run = runs.get(runKey(principal, spaceId));
    const answer: ProjectRunAnswer = {
      ...(run === undefined ? {} : { run }),
      macs: deps.sessions.macs(principal.workspaceId, principal.participantId),
    };
    return c.json(answer);
  });
}

/**
 * How long an ask waits for the Chips for Mac the server opened to say `folders` (ADR 0227's second
 * addendum): the app starting cold, its page loading and connecting, with room for a busy Mac.
 */
export const MAC_APP_WAIT_MS = 25_000;

/**
 * Before an ask goes to the person's Macs: when none of theirs is open and this server has Chips
 * for Mac on its own machine, the owner's ask opens it at the room and waits for it to connect.
 * Only the owner's: the server's machine is theirs, and so is the app on it. Anyone else's Mac is
 * elsewhere, and opening this one would do nothing for them. Whether it was opened.
 */
async function openMacApp(
  deps: GatewayDeps,
  principal: Principal,
  spaceId: string,
): Promise<boolean> {
  if (deps.macApp === undefined || principal.role !== "owner") return false;
  if (deps.sessions.macs(principal.workspaceId, principal.participantId) > 0) return false;
  if (!(await deps.macApp.open(spaceId))) return false;
  await deps.sessions.whenMac(principal.workspaceId, principal.participantId, MAC_APP_WAIT_MS);
  return true;
}

/**
 * A person on a device of theirs, let into the room's project as for a token: who, the room, and
 * the device's name, which their Mac shows ("Opened from your iPhone").
 */
async function personAt(c: Context<GatewayEnv>, deps: GatewayDeps, does: string) {
  const principal = c.get("principal");
  if (principal.kind !== "person" || principal.deviceId === undefined) {
    throw new HttpError("forbidden", `Only a person's own device ${does} on their Mac.`);
  }
  const admitted = await deps.projectDoor.admit({ principal, spaceId: c.req.param("id") ?? "" });
  if (!admitted.ok) {
    if (admitted.error.kind === "unavailable")
      throw new HttpError("internal", admitted.error.message);
    throw new HttpError(admitted.error.kind, admitted.error.message);
  }
  const device = await deps.devices.device(principal.workspaceId, principal.deviceId);
  return { principal, spaceId: admitted.value.spaceId, from: device?.name || "another device" };
}

/**
 * An ask for the Mac to open or run a room's project: an owner's alone (ADR 0231), as only an
 * owner's ask opens Chips for Mac. The Mac also acts only for the server it runs itself.
 */
async function ownerAt(c: Context<GatewayEnv>, deps: GatewayDeps, does: string) {
  const at = await personAt(c, deps, does);
  if (at.principal.role !== "owner") {
    throw new HttpError(
      "forbidden",
      "Only the workspace's owner runs or opens a space's project on the Mac.",
    );
  }
  return at;
}

/**
 * What a person reads of a room's project, and their Undo (ADR 0222), signed by their device:
 *
 *   GET  /v1/spaces/:id/project/files?at=          the files at `main`, or at a change
 *   GET  /v1/spaces/:id/project/file?path=&at=     one file's bytes
 *   GET  /v1/spaces/:id/project/archive?at=        the files as one zip (ADR 0224)
 *   GET  /v1/spaces/:id/project/history?path=      one file's changes, newest first
 *   GET  /v1/spaces/:id/project/changes/:commit    one change, with its diff
 *   POST /v1/spaces/:id/project/undo {commit}      that change taken back, as a new commit of theirs
 *   GET  /v1/spaces/:id/project/page?path=&at=     a page built into one document (ADR 0223)
 *   POST /v1/spaces/:id/project/page {path, at?}   the same, behind a page door ticket (ADR 0201)
 */
export function registerProjectReadRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  async function opened(c: Context<GatewayEnv>) {
    const result = await deps.projectDoor.open(c.get("principal"), c.req.param("id") ?? "");
    if (!result.ok) {
      if (result.error.kind === "unavailable")
        throw new HttpError("internal", result.error.message);
      throw new HttpError(result.error.kind, result.error.message);
    }
    return result;
  }
  const whose = (name: string, email: string) => {
    const id = committerId(email);
    return { name, ...(id === undefined ? {} : { id }) };
  };

  app.get("/v1/spaces/:id/project/files", async (c) => {
    const { spaceId, projects } = await opened(c);
    const at = commitIn(c.req.query("at"));
    if (at === "") throw new HttpError("not_found", "No such change in the space's project.");
    const head = at ?? (await projects.head(spaceId));
    const files = head === null ? [] : await projects.files(spaceId, head);
    if (files === undefined)
      throw new HttpError("not_found", "No such change in the space's project.");
    const answer: ProjectFilesAnswer = {
      at: head,
      files: files.map((file) => ({ ...file, type: projectFileType(file.path) })),
    };
    return c.json(answer);
  });

  app.get("/v1/spaces/:id/project/file", async (c) => {
    const { spaceId, projects } = await opened(c);
    const path = c.req.query("path") ?? "";
    const at = commitIn(c.req.query("at"));
    if (path === "" || at === "")
      throw new HttpError("not_found", "No such file in the space's project.");
    const read = await projects.read(spaceId, path, at, deps.config.limits.maxAttachmentBytes);
    if (read === undefined)
      throw new HttpError("not_found", "No such file in the space's project.");
    if ("tooBig" in read) {
      throw new HttpError(
        "payload_too_large",
        `${path} is ${formatLimit(read.tooBig)}, more than a file may be.`,
      );
    }
    const name = path.split("/").pop() ?? path;
    return c.body(new Uint8Array(read.bytes), 200, {
      "content-type": projectFileType(path),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    });
  });

  app.get("/v1/spaces/:id/project/archive", async (c) => {
    const { spaceId, projects } = await opened(c);
    const at = commitIn(c.req.query("at"));
    if (at === "") throw new HttpError("not_found", "No such change in the space's project.");
    const max = deps.config.limits.maxAttachmentBytes;
    const zipped = await projects.archive(spaceId, at, max);
    if (zipped === undefined) {
      throw new HttpError("not_found", "The space's project has no files yet.");
    }
    if ("tooBig" in zipped) {
      throw new HttpError(
        "payload_too_large",
        `The project's files come to ${formatLimit(zipped.tooBig)}, more than a zip from here may be (${formatLimit(max)}).`,
      );
    }
    return c.body(new Uint8Array(zipped.bytes), 200, {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="project.zip"',
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    });
  });

  app.get("/v1/spaces/:id/project/history", async (c) => {
    const { spaceId, projects } = await opened(c);
    const path = c.req.query("path") ?? "";
    if (path === "") throw new HttpError("not_found", "No such file in the space's project.");
    const versions = await projects.history(spaceId, path);
    const answer: ProjectHistoryAnswer = {
      path,
      versions: versions.map((version) => ({
        commit: version.commit,
        by: whose(version.name, version.email),
        at: version.at,
        message: version.message,
      })),
    };
    return c.json(answer);
  });

  app.get("/v1/spaces/:id/project/changes/:commit", async (c) => {
    const { spaceId, projects } = await opened(c);
    const commit = commitIn(c.req.param("commit"));
    const change =
      commit === undefined || commit === "" ? undefined : await projects.change(spaceId, commit);
    if (change === undefined)
      throw new HttpError("not_found", "That change isn't in the space's project.");
    const answer: ProjectChangeAnswer = {
      commit: change.commit,
      parent: change.parent,
      by: whose(change.name, change.email),
      at: change.at,
      message: change.message,
      files: change.files,
      ...(change.moreFiles > 0 ? { more_files: change.moreFiles } : {}),
    };
    return c.json(answer);
  });

  /** A page of the project built into one document, or why it can't be, in words. */
  async function builtPage(c: Context<GatewayEnv>, path: string, at: string | undefined) {
    const { spaceId, projects } = await opened(c);
    if (path === "" || at === "")
      throw new HttpError("not_found", "No such page in the space's project.");
    if (projectFileType(path) !== "text/html")
      throw new HttpError("invalid_event", "Only an HTML file opens as a page here.");
    const max = deps.config.limits.maxAttachmentBytes;
    const built = await deps.pageBuilder.build({
      path,
      read: async (file) => {
        const read = await projects.read(spaceId, file, at, max);
        return read === undefined || "tooBig" in read ? undefined : new Uint8Array(read.bytes);
      },
      maxBytes: max,
    });
    if (!built.ok) throw new HttpError(PAGE_CODES[built.kind], built.why);
    c.get("logger").info({ spaceId, path }, "project page built");
    return { spaceId, path, html: built.html };
  }

  // The document itself, for the phone's view, which writes it under the page's policy, and for a
  // device whose frames can't follow a ticket through its tunnel.
  app.get("/v1/spaces/:id/project/page", async (c) => {
    const page = await builtPage(c, c.req.query("path") ?? "", commitIn(c.req.query("at")));
    return c.body(page.html, 200, {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    });
  });

  // A ticket for a frame on the web, which loads the page from the door with its policy as a header.
  // A person's device asks, as for an attachment's page (SEC-53): the ticket holds the built page.
  app.post("/v1/spaces/:id/project/page", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "person" || principal.deviceId === undefined) {
      throw new HttpError(
        "forbidden",
        "A page opens on a person's device; a harness reads its space's project with git.",
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown; at?: unknown };
    const path = typeof body.path === "string" ? body.path : "";
    const at = typeof body.at === "string" ? commitIn(body.at) : undefined;
    const page = await builtPage(c, path, at);
    const ticket = issuePageTicket(deps, { principal, built: page });
    return c.json({ url: `/v1/pages/${ticket}`, expires_in: PAGE_TICKET_TTL_SECONDS }, 201);
  });

  app.post("/v1/spaces/:id/project/undo", async (c) => {
    const commit = commitAsked(await c.req.json().catch(() => ({})));
    if (commit === undefined)
      throw new HttpError("invalid_event", "Say which change to undo, by its commit.");
    const undone = await deps.projectDoor.undo(c.get("principal"), c.req.param("id") ?? "", commit);
    if (!undone.ok) throw new HttpError(UNDO_CODES[undone.kind], undone.message);
    const answer: ProjectUndoAnswer = { after: undone.after };
    return c.json(answer, 201);
  });
}

/** The commit an Undo names, when it names one. */
function commitAsked(body: unknown): string | undefined {
  const asked = (body as { commit?: unknown } | null)?.commit;
  const commit = typeof asked === "string" ? commitIn(asked) : undefined;
  return commit === "" ? undefined : commit;
}

/** How a page that can't be built is answered. */
const PAGE_CODES = {
  not_found: "not_found",
  too_big: "payload_too_large",
  invalid: "invalid_event",
  unavailable: "internal",
} as const;

/** How an Undo the door refused is answered. */
const UNDO_CODES = {
  unavailable: "internal",
  conflict: "stale_file",
  not_found: "not_found",
  forbidden: "forbidden",
} as const;

/** A commit, as git names one in full. */
const COMMIT = /^[0-9a-f]{40}$/;

/** A commit a request names: none, the commit, or "" for one git would not name so. */
function commitIn(said: string | undefined): string | undefined {
  return said === undefined || said === "" ? undefined : COMMIT.test(said) ? said : "";
}
