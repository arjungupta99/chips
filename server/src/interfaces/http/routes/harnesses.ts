/**
 * The harnesses an account holds, and the credentials that speak for them.
 *
 * `POST /v1/harnesses` — Add harness, Custom. A person names a harness; the answer carries the token,
 * once, and the direct space the harness may speak in. Any person in the workspace may add
 * one, and becomes its owner (ADR 0023).
 *
 * `GET /v1/harnesses/:id/tokens` lists what a harness has, without ever returning a token — Chips
 * keeps only digests (ADR 0006). `POST /v1/harnesses/:id/tokens` issues another and shows it once.
 * `DELETE /v1/harnesses/:id/tokens/:tokenId` withdraws one and closes the sockets it holds. All
 * three are the owner's, and nobody else's; rotation is an issue and then a revoke, in that
 * order, so the harness is never without a credential in between.
 *
 * `POST /v1/harnesses/:id/owner` hands a harness to another person (M5.2): the owner's to do,
 * or a workspace owner's or admin's, recorded as `harness.transferred`.
 *
 * `DELETE /v1/harnesses/:id` takes a harness out of the workspace (ADR 0078), for the same
 * people: its tokens are withdrawn and it is marked removed, recorded as `harness.removed`. Its
 * history stays, under its name. Removing it again answers as the first time did.
 *
 * `POST /v1/harnesses/:id/spaces` is the harness's own door, and the only one it has: it names
 * a thing it works in — a worktree, a Space of its own — and gets the space for it, the same
 * space every time it asks (M2.3, ADR 0024). With a `space_id` it claims instead: a room a person
 * opened and asked it for is given the harness's key. `GET` on the same path is the read side of
 * it: every space the harness opened by key, and whether each is open or closed, so an adapter
 * that has put something away can find that room and close it without asking for one and so
 * making it; and, as `asked`, the rooms people asked it for that it has not claimed yet.
 *
 * `PATCH /v1/harnesses/:id` says again what a harness takes (ADR 0046): its `capabilities`, whole,
 * which until now were said once, at registration. Its owner's, or a workspace owner's or
 * admin's, like its tokens.
 *
 * `POST /v1/harnesses/:id/agents` registers one of a harness's agents by its own key for it (ADR
 * 0087), renames it, and says it was archived or came back (`state`); `GET` lists them with their
 * rooms. `POST /v1/agents/:id/attach` puts one of them in a room in the place of another of the
 * harness's own there, or of the harness itself. All three are the harness's own.
 *
 * A copy of one of its agents, made because a person asked for one in a room (ADR 0087, Fork),
 * is registered with `forked_from` and that room's `space_id`: it joins the room while the ask
 * stands, and is free otherwise, and the answer says which and why. A new agent a person asked
 * for in a room (ADR 0108) is registered with `made_for`, the ask's id, and that room's
 * `space_id`, and joins it the same way.
 *
 * `POST /v1/agents/:id/move` is a person moving an agent into a room they are in,
 * `POST /v1/agents/:id/fork` a person asking its harness for a copy of it there, and
 * `POST /v1/spaces/:id/agents` a person asking a harness for a new agent there (ADR 0108); and
 * `GET /v1/agents/:id/stays` is a person reading the rooms an agent has been in, for its message
 * history (ADR 0087): the rooms they are in by id, and the others as dates and a count.
 *
 * `PUT /v1/harnesses/:id/status` is the harness saying what is wrong on its own side — the part of
 * it Chips cannot see — or that nothing is (ADR 0083). The harness's own, and nobody else's. It is
 * live state, kept in memory beside whether its sockets are open, and every person hears it.
 *
 * `POST /v1/harnesses/:id/restart` is a person asking a harness to restart (ADR 0094): the same
 * people as removing it. Chips sends the `restart` frame down the harness's own connection and the
 * harness runs its own restart; the answer carries the state, restarting, which every person hears
 * end at the harness's next word.
 */

import type { Hono } from "hono";
import {
  type AttachRefusal,
  attachAgent,
  MAX_AGENT_KEY,
  MAX_AGENT_NAME,
  mayBeKey,
  registerAgent,
} from "../../../application/agents.js";
import { answerAsk, answerFork, type ForkAnswer } from "../../../application/index.js";
import { seesEveryAgent } from "../../../domain/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function readBody(raw: string): {
  name: string;
  capabilities: string[] | undefined;
  openDirectSpace: boolean;
} {
  let body: { name?: unknown; capabilities?: unknown; open_direct_space?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.name !== "string") throw new HttpError("invalid_event", "Send a `name`.");
  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.filter((each): each is string => typeof each === "string")
    : undefined;
  // A harness whose spaces are worktrees does not want a direct one sitting empty (ADR 0024).
  return { name: body.name, capabilities, openDirectSpace: body.open_direct_space !== false };
}

/** The longest reason a harness may give for its trouble: one line (ADR 0083). */
const MAX_REASON = 200;

/** `{state: "ok"}` is nothing wrong; `{state: "trouble", reason}` is the reason, as one line. */
function readStatusBody(raw: string): string | undefined {
  let body: { state?: unknown; reason?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (body.state === "ok") return undefined;
  if (body.state !== "trouble") {
    throw new HttpError("invalid_event", "Send `state`: `ok`, or `trouble` with a `reason`.");
  }
  const reason = typeof body.reason === "string" ? body.reason.replace(/\s+/g, " ").trim() : "";
  if (reason === "" || reason.length > MAX_REASON) {
    throw new HttpError(
      "invalid_event",
      `Say what is wrong in \`reason\`, in one line of up to ${MAX_REASON} characters.`,
    );
  }
  return reason;
}

/** Every failure of the token use cases, as an HTTP answer. */
function refuse(error: { kind: string; message: string }): never {
  if (error.kind === "not_the_owner") throw new HttpError("forbidden", error.message);
  if (error.kind === "unknown_token") throw new HttpError("not_found", error.message);
  throw new HttpError("invalid_event", error.message);
}

function readSpaceBody(raw: string): {
  key: string;
  title: string | undefined;
  shared: boolean;
  spaceId: string | undefined;
} {
  let body: { key?: unknown; title?: unknown; shared?: unknown; space_id?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.key !== "string") {
    throw new HttpError("invalid_event", "Send a `key`: what this space is, in your own terms.");
  }
  return {
    key: body.key,
    title: typeof body.title === "string" ? body.title : undefined,
    // A worktree, which another harness may work in too (ADR 0033).
    shared: body.shared === true,
    // A room a person asked this harness for, to claim under the key.
    spaceId: typeof body.space_id === "string" ? body.space_id : undefined,
  };
}

function opensOwnSpace(principal: { kind: string; participantId: string }, id: string): boolean {
  return principal.kind === "harness" && principal.participantId === id;
}

/** What the log says a space call did, when it did something. */
function spaceLine(opened: {
  created: boolean;
  joined: boolean;
  claimed: boolean;
}): string | undefined {
  if (opened.created) return "space opened";
  if (opened.claimed) return "space claimed";
  return opened.joined ? "space joined" : undefined;
}

/** The door's refusal as the HTTP error envelope. */
function spaceRefusal(error: { kind: string; message: string }): HttpError {
  if (error.kind === "not_a_harness" || error.kind === "not_asked") {
    return new HttpError("forbidden", error.message);
  }
  if (error.kind === "unknown_space") return new HttpError("not_found", error.message);
  return new HttpError("invalid_event", error.message);
}

/** What a harness says it takes, again: a list of names, whole. */
function readCapabilities(raw: string): string[] {
  let body: { capabilities?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (!Array.isArray(body.capabilities)) {
    throw new HttpError(
      "invalid_event",
      "Send `capabilities`: everything the harness takes, as a list of names.",
    );
  }
  return body.capabilities.filter((each): each is string => typeof each === "string");
}

function readTokenName(raw: string): string | undefined {
  if (raw === "") return undefined;
  let body: { name?: unknown };
  try {
    body = JSON.parse(raw) as { name?: unknown };
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  return typeof body.name === "string" ? body.name : undefined;
}

/**
 * An agent to register: the harness's key for it, its name, whether it leads, and whether the
 * thing it is was archived in the harness or is in use (ADR 0087). The harness's own id names its
 * default agent (ADR 0183); no other harness's id is a key.
 */
function readAgentBody(
  raw: string,
  harnessId: string,
): {
  key: string;
  name: string;
  lead: boolean;
  state: "active" | "archived" | undefined;
  /** For a fork's copy: the agent it copies, and the room it was asked for. */
  forkedFrom: string | undefined;
  /** For a new agent a person asked for (ADR 0108): the ask, and its room. */
  madeFor: string | undefined;
  spaceId: string | undefined;
} {
  let body: {
    key?: unknown;
    name?: unknown;
    lead?: unknown;
    state?: unknown;
    forked_from?: unknown;
    made_for?: unknown;
    space_id?: unknown;
  };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!mayBeKey(key) && key !== harnessId) {
    throw new HttpError(
      "invalid_event",
      `Send the \`key\` you know the agent by, up to ${MAX_AGENT_KEY} characters, and not another harness's id: your own names your default agent.`,
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "" || name.length > MAX_AGENT_NAME) {
    throw new HttpError("invalid_event", `Send a \`name\`, up to ${MAX_AGENT_NAME} characters.`);
  }
  if (body.state !== undefined && body.state !== "active" && body.state !== "archived") {
    throw new HttpError(
      "invalid_event",
      "Send `state` as `active` or `archived`, or leave it out.",
    );
  }
  return { key, name, lead: body.lead === true, state: body.state, ...readCopyOf(body) };
}

/**
 * What an agent asked for in a room says of itself: a fork's copy, the agent it copies; a new
 * agent (ADR 0108), the ask it answers; and either, the room it was asked for.
 */
function readCopyOf(body: { forked_from?: unknown; made_for?: unknown; space_id?: unknown }): {
  forkedFrom: string | undefined;
  madeFor: string | undefined;
  spaceId: string | undefined;
} {
  const forkedFrom = typeof body.forked_from === "string" ? body.forked_from : undefined;
  const madeFor = typeof body.made_for === "string" ? body.made_for : undefined;
  const spaceId = typeof body.space_id === "string" ? body.space_id : undefined;
  if (forkedFrom !== undefined && madeFor !== undefined) {
    throw new HttpError(
      "invalid_event",
      "An agent is a fork's copy (`forked_from`) or a new one asked for (`made_for`), not both.",
    );
  }
  if (spaceId !== undefined && forkedFrom === undefined && madeFor === undefined) {
    throw new HttpError(
      "invalid_event",
      "`space_id` is the space a fork's copy or a new agent was asked for: send `forked_from` or `made_for` with it.",
    );
  }
  if (madeFor !== undefined && spaceId === undefined) {
    throw new HttpError(
      "invalid_event",
      "`made_for` is the ask a new agent answers: send the space's `space_id` with it.",
    );
  }
  return { forkedFrom, madeFor, spaceId };
}

/** Where to put an agent: a room, and whose place it takes there. */
function readAttachBody(raw: string): { spaceId: string; replacing: string } {
  let body: { space_id?: unknown; replacing?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.space_id !== "string" || typeof body.replacing !== "string") {
    throw new HttpError(
      "invalid_event",
      "Send the space's `space_id`, and in `replacing` whose place the agent takes there: this harness's id, or one of its agents'.",
    );
  }
  return { spaceId: body.space_id, replacing: body.replacing };
}

/** The room an agent is moved into: `{space_id}`. */
function readMoveBody(raw: string): string {
  let body: { space_id?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.space_id !== "string") {
    throw new HttpError(
      "invalid_event",
      "Send the `space_id` of the space to move the agent into.",
    );
  }
  return body.space_id;
}

/** A new agent asked for (ADR 0108): `{harness_id, name?, key?}`. */
function readAskBody(raw: string): {
  harnessId: string;
  name: string | undefined;
  key: string | undefined;
} {
  let body: { harness_id?: unknown; name?: unknown; key?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.harness_id !== "string") {
    throw new HttpError("invalid_event", "Send the `harness_id` of the harness to ask.");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length > MAX_AGENT_NAME) {
    throw new HttpError("invalid_event", `A \`name\` is up to ${MAX_AGENT_NAME} characters.`);
  }
  const key = typeof body.key === "string" && body.key.length <= 120 ? body.key : undefined;
  return { harnessId: body.harness_id, name: name === "" ? undefined : name, key };
}

/** The room a copy is asked for: `{space_id}`. */
function readForkBody(raw: string): string {
  let body: { space_id?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.space_id !== "string") {
    throw new HttpError("invalid_event", "Send the `space_id` of the space the copy is for.");
  }
  return body.space_id;
}

/**
 * Whether a harness may register this agent: one Main agent at most, which is never archived,
 * and a copy only of one of its own agents.
 */
async function mayRegister(
  deps: GatewayDeps,
  workspaceId: string,
  harnessId: string,
  wanted: {
    readonly key: string;
    readonly lead: boolean;
    readonly state: "active" | "archived" | undefined;
    readonly forkedFrom: string | undefined;
  },
): Promise<void> {
  await mayLead(deps, workspaceId, harnessId, wanted);
  if (wanted.forkedFrom === undefined) return;
  const original = await deps.readModels.participant(workspaceId, wanted.forkedFrom);
  if (original?.kind !== "agent" || original.harness_id !== harnessId) {
    throw new HttpError("invalid_event", "A copy is of one of this harness's own agents.");
  }
}

/**
 * The Main agent's own rules (ADR 0087, rule 7; agents review, finding 8): a harness has one at
 * most, and it is always there, as its Main room is. Archived, it would leave that room, and
 * nothing brings it back to a room that was never closed. Its default agent may take Main from
 * another, which is then not Main (ADR 0183); no other agent may.
 */
async function mayLead(
  deps: GatewayDeps,
  workspaceId: string,
  harnessId: string,
  wanted: {
    readonly key: string;
    readonly lead: boolean;
    readonly state: "active" | "archived" | undefined;
  },
): Promise<void> {
  const agents = await deps.readModels.agentsOf(workspaceId, harnessId);
  const known = agents.find((agent) => agent.key === wanted.key);
  if ((wanted.lead || known?.lead === true) && wanted.state === "archived") {
    throw new HttpError("invalid_event", "The Main agent is always there: it is not archived.");
  }
  if (!wanted.lead || wanted.key === harnessId) return;
  const lead = agents.find((agent) => agent.lead && agent.key !== wanted.key);
  if (lead !== undefined) {
    throw new HttpError(
      "invalid_event",
      `This harness has a Main agent already: ${lead.name}. A harness has one at most.`,
    );
  }
}

/**
 * An agent asked for in a room goes there while the room still waits for it: a fork's copy, or a
 * new agent (ADR 0108).
 */
async function placeCopy(
  deps: GatewayDeps,
  logger: GatewayEnv["Variables"]["logger"],
  copy: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly agentId: string;
    readonly forkedFrom: string | undefined;
    readonly madeFor: string | undefined;
    readonly spaceId: string | undefined;
  },
): Promise<ForkAnswer | undefined> {
  const { forkedFrom, madeFor, spaceId } = copy;
  if (madeFor !== undefined && spaceId !== undefined) {
    const made = await answerAsk(deps, { ...copy, madeFor, spaceId });
    if (made.attached) {
      logger.info(
        { harnessId: copy.harnessId, agentId: copy.agentId, spaceId, madeFor },
        "new agent joined its space",
      );
    }
    return made;
  }
  if (forkedFrom === undefined || spaceId === undefined) return undefined;
  const fork = await answerFork(deps, { ...copy, forkedFrom, spaceId });
  if (fork.attached) {
    logger.info(
      { harnessId: copy.harnessId, agentId: copy.agentId, spaceId },
      "fork's copy joined its space",
    );
  }
  return fork;
}

/** What the answer says of a fork's copy: whether it joined its room, and why not. */
function forkWords(fork: ForkAnswer | undefined): { attached?: boolean; why?: string } {
  if (fork === undefined) return {};
  if (fork.attached || fork.why === undefined) return { attached: fork.attached };
  return { attached: false, why: fork.why };
}

/** A fork refused, or a move: the HTTP error for the use case's kind of refusal. */
function refusalCode(kind: string): "forbidden" | "invalid_event" | "not_found" {
  if (kind === "not_allowed") return "forbidden";
  return kind === "invalid" ? "invalid_event" : "not_found";
}

/** A new agent's ask refused: the HTTP error for the use case's kind of refusal. */
function askRefusalCode(kind: string): "forbidden" | "invalid_event" | "not_found" {
  return kind === "unknown_harness" ? "not_found" : refusalCode(kind);
}

/** An attach refused, as the HTTP error envelope. */
function attachRefusal(error: AttachRefusal): HttpError {
  if (error.kind === "not_its_own") return new HttpError("forbidden", error.message);
  if (error.kind === "unknown_agent" || error.kind === "unknown_space") {
    return new HttpError("not_found", error.message);
  }
  return new HttpError("invalid_event", error.message);
}

/** Why a harness is being removed, when somebody says: for the audit. */
function readReason(raw: string): string | undefined {
  if (raw === "") return undefined;
  let body: { reason?: unknown };
  try {
    body = JSON.parse(raw) as { reason?: unknown };
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  return typeof body.reason === "string" ? body.reason : undefined;
}

function readOwnerBody(raw: string): { ownerId: string; reason: string | undefined } {
  let body: { owner_id?: unknown; reason?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.owner_id !== "string") {
    throw new HttpError("invalid_event", "Send the `owner_id` of the person to hand it to.");
  }
  return {
    ownerId: body.owner_id,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  };
}

export function registerHarnessRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/harnesses", async (c) => {
    const { name, capabilities, openDirectSpace } = readBody(c.get("rawBody"));
    const result = await deps.addHarness({
      principal: c.get("principal"),
      displayName: name,
      capabilities,
      openDirectSpace,
    });
    if (!result.ok) {
      throw new HttpError(
        result.error.kind === "invalid" ? "invalid_event" : "forbidden",
        result.error.message,
      );
    }
    c.get("logger").info({ harnessId: result.value.harnessId }, "harness added");
    return c.json(
      {
        harness_id: result.value.harnessId,
        display_name: result.value.displayName,
        token: result.value.token,
        ...(result.value.spaceId === undefined ? {} : { space_id: result.value.spaceId }),
      },
      201,
    );
  });

  app.post("/v1/harnesses/:id/spaces", async (c) => {
    const principal = c.get("principal");
    // A harness opens its own spaces and nobody else's, which is the same rule its events obey.
    if (!opensOwnSpace(principal, c.req.param("id"))) {
      throw new HttpError("forbidden", "A harness may only open its own spaces.");
    }
    const result = await deps.openSpace({ principal, ...readSpaceBody(c.get("rawBody")) });
    if (!result.ok) throw spaceRefusal(result.error);
    const opened = result.value;
    const happened = spaceLine(opened);
    if (happened !== undefined) {
      c.get("logger").info(
        { harnessId: principal.participantId, spaceId: opened.spaceId },
        happened,
      );
    }
    return c.json(
      {
        space_id: opened.spaceId,
        created: opened.created,
        retitled: opened.retitled,
        joined: opened.joined,
        claimed: opened.claimed,
      },
      opened.created ? 201 : 200,
    );
  });

  app.get("/v1/harnesses/:id/spaces", async (c) => {
    const principal = c.get("principal");
    // Its own, like the door: the keys are the harness's names for its own work.
    if (!opensOwnSpace(principal, c.req.param("id"))) {
      throw new HttpError("forbidden", "A harness may only list its own spaces.");
    }
    const { workspaceId, participantId } = principal;
    const spaces = await deps.readModels.spacesOpenedBy(workspaceId, participantId);
    // Beside them rather than among them: a room waiting to be claimed has no key yet, and an
    // adapter that reads every key in `spaces` as one of its own should not meet one without.
    const asked = await deps.readModels.spacesAskedOf(workspaceId, participantId);
    return c.json({ spaces, asked });
  });

  // A harness's agents (ADR 0087): registered by the harness's own key, and listed with their
  // rooms. Its own, like its rooms: the keys are its names for its own things.
  app.post("/v1/harnesses/:id/agents", async (c) => {
    const principal = c.get("principal");
    if (!opensOwnSpace(principal, c.req.param("id"))) {
      throw new HttpError("forbidden", "A harness registers its own agents.");
    }
    const { workspaceId, participantId } = principal;
    const wanted = readAgentBody(c.get("rawBody"), participantId);
    await mayRegister(deps, workspaceId, participantId, wanted);
    const found = await registerAgent(deps, {
      workspaceId,
      harnessId: participantId,
      key: wanted.key,
      name: wanted.name,
      lead: wanted.lead,
      state: wanted.state,
      forkedFrom: wanted.forkedFrom,
      actor: { kind: "harness", id: participantId },
    });
    if (found.created) {
      c.get("logger").info(
        { harnessId: participantId, agentId: found.agent.agent_id, forkedFrom: wanted.forkedFrom },
        "agent registered",
      );
    }
    const fork = await placeCopy(deps, c.get("logger"), {
      workspaceId,
      harnessId: participantId,
      agentId: found.agent.agent_id,
      ...wanted,
    });
    return c.json(
      {
        ...found.agent,
        ...(fork?.attached === true ? { room: wanted.spaceId } : {}),
        created: found.created,
        renamed: found.renamed,
        ...forkWords(fork),
      },
      found.created ? 201 : 200,
    );
  });

  app.get("/v1/harnesses/:id/agents", async (c) => {
    const principal = c.get("principal");
    if (!opensOwnSpace(principal, c.req.param("id"))) {
      throw new HttpError("forbidden", "A harness lists its own agents.");
    }
    const agents = await deps.readModels.agentsOf(principal.workspaceId, principal.participantId);
    return c.json({ agents });
  });

  app.post("/v1/agents/:id/attach", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "harness") {
      throw new HttpError("forbidden", "A harness attaches its own agents.");
    }
    const { workspaceId, participantId } = principal;
    const agentId = c.req.param("id");
    const { spaceId, replacing } = readAttachBody(c.get("rawBody"));
    const result = await attachAgent(deps, {
      workspaceId,
      harnessId: participantId,
      agentId,
      spaceId,
      replacing,
    });
    if (!result.ok) throw attachRefusal(result.error);
    if (result.attached) {
      c.get("logger").info(
        { harnessId: participantId, agentId, spaceId, replacing },
        "agent attached",
      );
    }
    return c.json({ agent_id: agentId, space_id: spaceId, replacing, attached: result.attached });
  });

  // A person moves an agent into a room they are in (ADR 0087): out of the room it is in, whose
  // runs by it stop, and which says where it went.
  app.post("/v1/agents/:id/move", async (c) => {
    const agentId = c.req.param("id");
    const spaceId = readMoveBody(c.get("rawBody"));
    const result = await deps.moveAgent({ principal: c.get("principal"), agentId, spaceId });
    if (!result.ok) throw new HttpError(refusalCode(result.error.kind), result.error.message);
    if (result.moved) {
      c.get("logger").info({ agentId, spaceId, from: result.from }, "agent moved");
    }
    return c.json({ agent_id: agentId, space_id: spaceId, from: result.from, moved: result.moved });
  });

  // A person asks an agent's harness for a copy of it in a room they are in (ADR 0087, Fork). The
  // room shows the ask until the copy joins, which the harness's registration of it does.
  app.post("/v1/agents/:id/fork", async (c) => {
    const agentId = c.req.param("id");
    const spaceId = readForkBody(c.get("rawBody"));
    const result = await deps.forkAgent({ principal: c.get("principal"), agentId, spaceId });
    if (!result.ok) throw new HttpError(refusalCode(result.error.kind), result.error.message);
    if (result.asked)
      c.get("logger").info({ agentId, spaceId, forkId: result.forkId }, "fork asked");
    return c.json(
      {
        agent_id: agentId,
        space_id: spaceId,
        fork_id: result.forkId,
        ts: result.ts,
        asked: result.asked,
      },
      result.asked ? 202 : 200,
    );
  });

  // A person asks a harness for a new agent in a room they are in (ADR 0108). The room shows the
  // ask until the agent joins, which the harness's registration of it with `made_for` does.
  app.post("/v1/spaces/:id/agents", async (c) => {
    const spaceId = c.req.param("id");
    const { harnessId, name, key } = readAskBody(c.get("rawBody"));
    const result = await deps.askAgent({
      principal: c.get("principal"),
      harnessId,
      spaceId,
      name,
      key,
    });
    if (!result.ok) throw new HttpError(askRefusalCode(result.error.kind), result.error.message);
    if (result.asked) {
      c.get("logger").info({ harnessId, spaceId, askId: result.askId }, "new agent asked");
    }
    return c.json(
      {
        harness_id: harnessId,
        space_id: spaceId,
        ask_id: result.askId,
        ts: result.ts,
        name: result.name,
        asked: result.asked,
      },
      result.asked ? 202 : 200,
    );
  });

  // An agent's message history (ADR 0087, rule 3.11): the rooms it has been in, oldest first. A
  // client draws a room it reads from what it already holds; a room the reader is not in is its
  // dates and a count, with no name. A member or guest is told only of the rooms they are in,
  // unless the agent is of a harness they own (ADR 0034's addendum).
  app.get("/v1/agents/:id/stays", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "person") {
      throw new HttpError("forbidden", "A person reads an agent's spaces; a harness has its own.");
    }
    const { workspaceId, participantId } = principal;
    const agentId = c.req.param("id");
    const agent = await deps.readModels.participant(workspaceId, agentId);
    if (agent === undefined || agent.kind !== "agent") {
      throw new HttpError("not_found", "There is no agent with that id here.");
    }
    const mine = new Set(await deps.readModels.spacesForMember(workspaceId, participantId));
    // Its stays elsewhere, as dates and a count, are for whoever is told every agent, and for the
    // owner of its harness (ADR 0034's addendum); anybody else reads only the rooms they are in.
    const everywhere = seesEveryAgent(principal.role) || agent.owner_id === participantId;
    const stays = (await deps.readModels.agentStays(workspaceId, agentId)).flatMap((stay) => {
      const when = { from: stay.from_at, to: stay.to_at, lines: stay.lines };
      if (mine.has(stay.space_id)) {
        return [
          {
            readable: true,
            space_id: stay.space_id,
            from_seq: stay.from_seq,
            to_seq: stay.to_seq,
            ...when,
          },
        ];
      }
      return everywhere ? [{ readable: false, ...when }] : [];
    });
    // A guest or member cannot name an agent they share no room with (ADR 0034 and its addendum).
    if (!everywhere && stays.length === 0 && !(agent.room != null && mine.has(agent.room))) {
      throw new HttpError("not_found", "There is no agent with that id here.");
    }
    return c.json({ agent_id: agentId, stays });
  });

  app.put("/v1/harnesses/:id/status", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "harness" || principal.participantId !== c.req.param("id")) {
      throw new HttpError("forbidden", "A harness may only say how it is itself.");
    }
    const trouble = readStatusBody(c.get("rawBody"));
    const state = deps.presence.report(principal.workspaceId, principal.participantId, trouble);
    c.get("logger").info(
      { harnessId: principal.participantId, trouble: trouble ?? null },
      trouble === undefined ? "harness says it is fine" : "harness says it is in trouble",
    );
    return c.json({ state });
  });

  app.post("/v1/harnesses/:id/restart", async (c) => {
    const harnessId = c.req.param("id");
    const principal = c.get("principal");
    const result = await deps.restartHarness({ principal, harnessId });
    if (!result.ok) throw new HttpError(refusalCode(result.error.kind), result.error.message);
    if (result.asked) {
      c.get("logger").info(
        { harnessId, by: principal.participantId, sockets: result.sockets },
        "harness restart asked",
      );
    }
    return c.json(
      { harness_id: harnessId, asked: result.asked, sockets: result.sockets, state: result.state },
      result.asked ? 202 : 200,
    );
  });

  app.patch("/v1/harnesses/:id", async (c) => {
    const harnessId = c.req.param("id");
    const result = await deps.declareCapabilities({
      principal: c.get("principal"),
      harnessId,
      capabilities: readCapabilities(c.get("rawBody")),
    });
    if (!result.ok) {
      if (result.error.kind === "not_the_owner") {
        throw new HttpError("forbidden", result.error.message);
      }
      if (result.error.kind === "unknown_harness") {
        throw new HttpError("not_found", result.error.message);
      }
      throw new HttpError("invalid_event", result.error.message);
    }
    c.get("logger").info(
      { harnessId, capabilities: result.value.capabilities },
      "harness capabilities declared",
    );
    return c.json({
      harness_id: harnessId,
      capabilities: result.value.capabilities,
      previous: result.value.previous,
    });
  });

  /**
   * `POST /v1/harnesses/:id/owner` — hand a harness to another person (M5.2). The owner's, or a
   * workspace owner's or admin's, like its tokens; the new owner is a person here who is not a
   * guest. A registry write, recorded as `harness.transferred` for the audit and the screens.
   */
  app.post("/v1/harnesses/:id/owner", async (c) => {
    const harnessId = c.req.param("id");
    const { ownerId, reason } = readOwnerBody(c.get("rawBody"));
    const result = await deps.transferHarness({
      principal: c.get("principal"),
      harnessId,
      ownerId,
      reason,
    });
    if (!result.ok) {
      if (result.error.kind === "not_the_owner")
        throw new HttpError("forbidden", result.error.message);
      if (result.error.kind === "unknown_harness" || result.error.kind === "unknown_person") {
        throw new HttpError("not_found", result.error.message);
      }
      throw new HttpError("invalid_event", result.error.message);
    }
    c.get("logger").info({ harnessId, ownerId }, "harness transferred");
    return c.json({ harness_id: harnessId, owner_id: ownerId, event_id: result.value.eventId });
  });

  /**
   * `DELETE /v1/harnesses/:id` — take a harness out of the workspace (ADR 0078). A person's: the
   * harness's owner, or a workspace owner or admin, like its tokens. The answer says how many
   * tokens were withdrawn and when it was removed; a harness removed already is said to be, and
   * nothing is recorded twice.
   */
  app.delete("/v1/harnesses/:id", async (c) => {
    const harnessId = c.req.param("id");
    const result = await deps.removeHarness({
      principal: c.get("principal"),
      harnessId,
      reason: readReason(c.get("rawBody")),
    });
    if (!result.ok) {
      if (result.error.kind === "not_the_owner") {
        throw new HttpError("forbidden", result.error.message);
      }
      throw new HttpError("not_found", result.error.message);
    }
    const removed = result.value;
    c.get("logger").info(
      {
        harnessId,
        tokensRevoked: removed.tokensRevoked,
        socketsClosed: removed.socketsClosed,
        homes: removed.homes.length,
        already: removed.alreadyRemoved,
      },
      "harness removed",
    );
    return c.json({
      harness_id: harnessId,
      removed_at: removed.removedAt,
      already_removed: removed.alreadyRemoved,
      tokens_revoked: removed.tokensRevoked,
      sockets_closed: removed.socketsClosed,
      homes: removed.homes,
      ...(removed.eventId === undefined ? {} : { event_id: removed.eventId }),
    });
  });

  app.get("/v1/harnesses/:id/tokens", async (c) => {
    const result = await deps.harnessTokens.list({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
    });
    if (!result.ok) refuse(result.error);
    return c.json({
      tokens: result.value.map((token) => ({
        id: token.id,
        name: token.name,
        created_at: token.createdAt,
        last_used_at: token.lastUsedAt,
        revoked_at: token.revokedAt,
      })),
    });
  });

  app.post("/v1/harnesses/:id/tokens", async (c) => {
    const harnessId = c.req.param("id");
    const result = await deps.harnessTokens.issue({
      principal: c.get("principal"),
      harnessId,
      name: readTokenName(c.get("rawBody")),
    });
    if (!result.ok) refuse(result.error);
    c.get("logger").info({ harnessId, tokenId: result.value.tokenId }, "harness token issued");
    return c.json(
      {
        token_id: result.value.tokenId,
        name: result.value.name,
        token: result.value.token,
        created_at: result.value.createdAt,
      },
      201,
    );
  });

  app.delete("/v1/harnesses/:id/tokens/:tokenId", async (c) => {
    const harnessId = c.req.param("id");
    const result = await deps.harnessTokens.revoke({
      principal: c.get("principal"),
      harnessId,
      tokenId: c.req.param("tokenId"),
    });
    if (!result.ok) refuse(result.error);
    c.get("logger").info(
      { harnessId, tokenId: result.value.tokenId, socketsClosed: result.value.socketsClosed },
      "harness token revoked",
    );
    return c.json({
      token_id: result.value.tokenId,
      revoked_at: result.value.revokedAt,
      sockets_closed: result.value.socketsClosed,
    });
  });
}
