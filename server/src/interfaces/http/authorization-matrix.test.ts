/**
 * The authorization matrix (technical-plan, Phase 5 acceptance): every HTTP route against every
 * kind of caller — a workspace owner, an admin, a member, a guest, a harness, and nobody. What
 * is asserted is standing, not success: a caller who may is answered with anything but 401 or
 * 403 (a made-up id earns a 404, a bare body a 422), and a caller who may not is told 403, or
 * 401 with no credential at all.
 *
 * The list of routes here is checked against the app's own, so a route cannot be added without
 * a row — the Gate 5 focus asks for exactly that.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../testing/workspace.js";

type Caller = "owner" | "admin" | "member" | "guest" | "harness" | "nobody";
type Expect = "allowed" | "forbidden" | "open";

interface Row {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The route as registered, with `:params`. */
  readonly route: string;
  /** The path to call, with ids filled in; the route when it has no params. */
  readonly path?: string;
  readonly body?: unknown;
  /** A harness's own id in the path, so "own" and "another's" can be told apart. */
  readonly expect: Readonly<Record<Caller, Expect>>;
}

const everyone = (expectation: Expect): Readonly<Record<Caller, Expect>> => ({
  owner: expectation,
  admin: expectation,
  member: expectation,
  guest: expectation,
  harness: expectation,
  nobody: expectation,
});
const authenticated: Readonly<Record<Caller, Expect>> = {
  ...everyone("allowed"),
  nobody: "forbidden",
};
const people: Readonly<Record<Caller, Expect>> = { ...authenticated, harness: "forbidden" };
const runsTheWorkspace: Readonly<Record<Caller, Expect>> = {
  ...people,
  member: "forbidden",
  guest: "forbidden",
};
/** Inviting is an owner's alone (ADR 0034's addendum of 14 October 2026). */
const ownersOnly: Readonly<Record<Caller, Expect>> = { ...runsTheWorkspace, admin: "forbidden" };
const harnessOnly: Readonly<Record<Caller, Expect>> = {
  ...everyone("forbidden"),
  harness: "allowed",
};

let ws: TestWorkspace;
let admin: TestPerson;
let guest: TestPerson;
/** A harness of Arjun's for the removal's row, so removing it takes nothing from Scout's rows. */
let doomed: string;
/** A person for the removal's row (ADR 0160), so removing them takes nobody from other rows. */
let leaver: TestPerson;

beforeAll(async () => {
  ws = await createTestWorkspace();
  admin = await ws.addPerson("Priya", "admin");
  guest = await ws.addPerson("Vendor", "guest");
  leaver = await ws.addPerson("Leaver", "member");
  const body = JSON.stringify({ name: "Doomed" });
  const added = await ws.gateway.app.fetch(
    new Request("http://chips.local/v1/harnesses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...ws.arjun.sign("POST", "/v1/harnesses", body),
      },
      body,
    }),
  );
  doomed = String(((await added.json()) as { harness_id: string }).harness_id);
});
afterAll(async () => {
  await ws.close();
});

const ROWS: readonly Row[] = [
  { method: "GET", route: "/v1/health", expect: everyone("open") },
  {
    method: "POST",
    route: "/v1/pair",
    body: { code: "AAA-000", public_key: "x" },
    expect: everyone("open"),
  },
  // The server's own machine, with the token the server left beside its database (ADR 0048):
  // a door like `/v1/pair`, whose credential is in the request rather than on a device.
  { method: "POST", route: "/v1/operator/pairing-code", expect: everyone("open") },
  {
    method: "POST",
    route: "/v1/invites/peek",
    body: { token: "chips_inv_x" },
    expect: everyone("open"),
  },
  {
    method: "POST",
    route: "/v1/invites/redeem",
    body: { token: "chips_inv_x", display_name: "x", public_key: "x" },
    expect: everyone("open"),
  },
  // A join request (ADR 0122): how something asks for a credential, then collects it with a
  // secret only it holds. The link opened in a browser says what it is for and reads nothing.
  { method: "POST", route: "/v1/join", body: { name: "Matrix" }, expect: everyone("open") },
  {
    method: "POST",
    route: "/v1/join/:id/redeem",
    path: "/v1/join/jrq_01K4ZQPX00000000000000000Z/redeem",
    body: { secret: "chips_j_x" },
    expect: everyone("open"),
  },
  {
    method: "POST",
    route: "/v1/join/redeem",
    body: { secret: "chips_j_x", name: "x" },
    expect: everyone("open"),
  },
  { method: "GET", route: "/j/:secret", path: "/j/chips_j_x", expect: everyone("open") },
  { method: "POST", route: "/v1/passkeys/assertion-options", expect: everyone("open") },
  {
    method: "POST",
    route: "/v1/passkeys/assert",
    body: { challenge: "x", credential: { id: "x", response: {} }, public_key: "x" },
    expect: everyone("open"),
  },
  // A run's events are a harness's; a person's device sends a person's events over the socket.
  {
    method: "POST",
    route: "/v1/runs/:runId/events",
    path: "/v1/runs/run_01K4ZQPX00000000000000000Z/events",
    body: { type: "checkpoint", label: "x", idempotency_key: "m1" },
    expect: harnessOnly,
  },
  {
    method: "POST",
    route: "/v1/harnesses/:harnessId/events",
    path: "/v1/harnesses/SCOUT/events",
    body: { type: "message.post", text: "hi", idempotency_key: "m2" },
    expect: harnessOnly,
  },
  { method: "GET", route: "/v1/events", path: "/v1/events?since=0", expect: authenticated },
  { method: "GET", route: "/v1/participants", expect: authenticated },
  { method: "GET", route: "/v1/search", path: "/v1/search?q=hello", expect: authenticated },
  {
    method: "GET",
    route: "/v1/approvals/:approvalId/wait",
    path: "/v1/approvals/apr_01K4ZQPX00000000000000000Z/wait?timeout=0",
    expect: authenticated,
  },
  {
    method: "GET",
    route: "/v1/approvals/:approvalId",
    path: "/v1/approvals/apr_01K4ZQPX00000000000000000Z",
    expect: authenticated,
  },
  { method: "POST", route: "/v1/socket-tickets", expect: authenticated },
  { method: "POST", route: "/v1/uploads", body: { filename: "a.txt" }, expect: authenticated },
  {
    method: "PUT",
    route: "/v1/uploads/:id",
    path: "/v1/uploads/att_01K4ZQPX00000000000000000Z",
    body: "bytes",
    expect: authenticated,
  },
  {
    method: "GET",
    route: "/v1/uploads/:id",
    path: "/v1/uploads/att_01K4ZQPX00000000000000000Z",
    expect: authenticated,
  },
  {
    method: "GET",
    route: "/v1/attachments/:id",
    path: "/v1/attachments/att_01K4ZQPX00000000000000000Z",
    expect: authenticated,
  },
  // A URL a device hands its player (ADR 0058): a person's, from a signed device. A harness has
  // its own grant in message.new, and a grant never issues another.
  {
    method: "POST",
    route: "/v1/attachments/:id/grant",
    path: "/v1/attachments/att_01K4ZQPX00000000000000000Z/grant",
    body: { variant: "play" },
    expect: people,
  },
  // The page door (ADR 0201): a person's device asks for a ticket, and the frame spends it with
  // no other credential, so the GET is open and a wrong ticket is 401 for everyone.
  {
    method: "POST",
    route: "/v1/attachments/:id/page",
    path: "/v1/attachments/att_01K4ZQPX00000000000000000Z/page",
    expect: people,
  },
  {
    method: "GET",
    route: "/v1/pages/:ticket",
    path: "/v1/pages/not-a-ticket",
    expect: everyone("open"),
  },
  // A name is its person's to change, and nobody else's (ADR 0082): Dana's, here.
  {
    method: "POST",
    route: "/v1/people/:id/name",
    path: "/v1/people/DANA/name",
    body: { display_name: "Dana K" },
    expect: { ...everyone("forbidden"), member: "allowed" },
  },
  // The workspace's name is an owner's to change (ADR 0194), as inviting is.
  {
    method: "POST",
    route: "/v1/workspace/name",
    body: { name: "Solo" },
    expect: ownersOnly,
  },
  // So is a face (ADR 0139): Dana's, chosen and taken back by Dana alone.
  {
    method: "PUT",
    route: "/v1/people/:id/face",
    path: "/v1/people/DANA/face",
    body: { icon: "", ground: 3, letters: "DK" },
    expect: { ...everyone("forbidden"), member: "allowed" },
  },
  {
    method: "DELETE",
    route: "/v1/people/:id/face",
    path: "/v1/people/DANA/face",
    expect: { ...everyone("forbidden"), member: "allowed" },
  },
  // A person is removed from the workspace by an owner or an admin (ADR 0160). The owner removes
  // Leaver first; the admin's is the second removal, which answers as the first did.
  {
    method: "DELETE",
    route: "/v1/people/:id",
    path: "/v1/people/LEAVER",
    expect: runsTheWorkspace,
  },
  // A harness is added by a person who is not a guest; its door is its own; its tokens and its
  // handing-on are its owner's, or a workspace owner's or admin's (Scout is the owner's here).
  {
    method: "POST",
    route: "/v1/harnesses",
    body: { name: "New" },
    expect: { ...people, guest: "forbidden" },
  },
  {
    method: "POST",
    route: "/v1/harnesses/:id/spaces",
    path: "/v1/harnesses/SCOUT/spaces",
    body: { key: "/tree" },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/harnesses/:id/spaces",
    path: "/v1/harnesses/SCOUT/spaces",
    expect: harnessOnly,
  },
  // A harness's agents (ADR 0087): registered and listed by the harness itself.
  {
    method: "POST",
    route: "/v1/harnesses/:id/agents",
    path: "/v1/harnesses/SCOUT/agents",
    body: { key: "tree", name: "Tree" },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/harnesses/:id/agents",
    path: "/v1/harnesses/SCOUT/agents",
    expect: harnessOnly,
  },
  // A registration that archives, and one of its agents put in another's place (Phase 3).
  {
    method: "POST",
    route: "/v1/harnesses/:id/agents",
    path: "/v1/harnesses/SCOUT/agents",
    body: { key: "shelf", name: "Shelf", state: "archived" },
    expect: harnessOnly,
  },
  {
    method: "POST",
    route: "/v1/agents/:id/attach",
    path: "/v1/agents/agt_nobody/attach",
    body: { space_id: "spc_nowhere", replacing: "SCOUT" },
    expect: harnessOnly,
  },
  // A person moves an agent into a room they are in (ADR 0087, Phase 4); a guest moves none.
  {
    method: "POST",
    route: "/v1/agents/:id/move",
    path: "/v1/agents/agt_nobody/move",
    body: { space_id: "spc_nowhere" },
    expect: { ...people, guest: "forbidden" },
  },
  // Asking an agent's harness for a copy of it in a room (Phase 6): a person's, as a move is, and
  // never a guest's.
  {
    method: "POST",
    route: "/v1/agents/:id/fork",
    path: "/v1/agents/agt_nobody/fork",
    body: { space_id: "spc_nowhere" },
    expect: { ...people, guest: "forbidden" },
  },
  // A new agent in a room (ADR 0108): a person's to ask for, as a fork is, never a guest's.
  {
    method: "POST",
    route: "/v1/spaces/:id/agents",
    path: "/v1/spaces/spc_nowhere/agents",
    body: { harness_id: "hrn_nobody" },
    expect: { ...people, guest: "forbidden" },
  },
  // An agent's face (ADR 0089): a person's to choose and to take back, never a guest's.
  {
    method: "PUT",
    route: "/v1/agents/:id/face",
    path: "/v1/agents/agt_nobody/face",
    body: { icon: "rocket", ground: 3 },
    expect: { ...people, guest: "forbidden" },
  },
  {
    method: "DELETE",
    route: "/v1/agents/:id/face",
    path: "/v1/agents/agt_nobody/face",
    expect: { ...people, guest: "forbidden" },
  },
  // An agent's name (ADR 0091): a person's to give, never a guest's or a harness's.
  {
    method: "PUT",
    route: "/v1/agents/:id/name",
    path: "/v1/agents/agt_nobody/name",
    body: { name: "Pixel" },
    expect: { ...people, guest: "forbidden" },
  },
  // An agent's context files (ADR 0134): its harness sends them; its harness's owner, or an owner
  // or admin, reads and edits them. A made-up agent is a 404 for any person; Scout's own are read
  // by the people who run it, and Scout doesn't share any, which they are told in words.
  {
    method: "PUT",
    route: "/v1/agents/:id/context",
    path: "/v1/agents/agt_nobody/context",
    body: { files: [] },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/agents/:id/context",
    path: "/v1/agents/agt_nobody/context",
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/agents/:id/context/edits",
    path: "/v1/agents/agt_nobody/context/edits",
    body: { name: "PERSONA.md", text: "words", base_hash: "h" },
    expect: people,
  },
  {
    method: "PUT",
    route: "/v1/harnesses/:id/context",
    path: "/v1/harnesses/SCOUT/context",
    body: { shared: [] },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/harnesses/:id/context",
    path: "/v1/harnesses/SCOUT/context",
    expect: runsTheWorkspace,
  },
  {
    method: "POST",
    route: "/v1/harnesses/:id/context/edits",
    path: "/v1/harnesses/SCOUT/context/edits",
    body: { name: "PERSONA.md", text: "words", base_hash: "h" },
    expect: runsTheWorkspace,
  },
  {
    method: "GET",
    route: "/v1/context/edits/:id",
    path: "/v1/context/edits/edt_01K4ZQPX00000000000000000Z",
    expect: people,
  },
  // An agent's model and effort (ADR 0140): its harness sends the copy; its harness's owner, or an
  // owner or admin, reads it and changes it. A made-up agent is a 404 for any person.
  {
    method: "PUT",
    route: "/v1/agents/:id/model",
    path: "/v1/agents/agt_nobody/model",
    body: {
      model: "heron-2",
      own: false,
      choices: [{ id: "heron-2", label: "Heron 2", efforts: [] }],
      editable: true,
    },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/agents/:id/model",
    path: "/v1/agents/agt_nobody/model",
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/agents/:id/model/changes",
    path: "/v1/agents/agt_nobody/model/changes",
    body: { model: null, effort: null },
    expect: people,
  },
  // An agent's heartbeat (ADR 0143): as its model. A made-up agent is a 404 for any person.
  {
    method: "PUT",
    route: "/v1/agents/:id/heartbeat",
    path: "/v1/agents/agt_nobody/heartbeat",
    body: { on: false, every: 30, choices: [30, 60], editable: true },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/agents/:id/heartbeat",
    path: "/v1/agents/agt_nobody/heartbeat",
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/agents/:id/heartbeat/changes",
    path: "/v1/agents/agt_nobody/heartbeat/changes",
    body: { on: true },
    expect: people,
  },
  // A harness's own jobs (ADR 0252): its copy and runs are the harness's to send; its owner, or an
  // owner or admin of the workspace, reads and switches them.
  {
    method: "PUT",
    route: "/v1/harnesses/:id/jobs",
    path: "/v1/harnesses/SCOUT/jobs",
    body: { jobs: [] },
    expect: harnessOnly,
  },
  {
    method: "POST",
    route: "/v1/harnesses/:id/jobs/runs",
    path: "/v1/harnesses/SCOUT/jobs/runs",
    body: {
      runs: [
        {
          job_id: "dreaming",
          run_id: "r1",
          started_at: "2026-10-31T10:00:00.000Z",
          ended_at: "2026-10-31T10:00:06.000Z",
          outcome: "done",
        },
      ],
    },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/harnesses/:id/jobs",
    path: "/v1/harnesses/SCOUT/jobs",
    expect: runsTheWorkspace,
  },
  {
    method: "GET",
    route: "/v1/harnesses/:id/jobs/:job/runs",
    path: "/v1/harnesses/SCOUT/jobs/dreaming/runs",
    expect: runsTheWorkspace,
  },
  {
    method: "POST",
    route: "/v1/harnesses/:id/jobs/:job/changes",
    path: "/v1/harnesses/SCOUT/jobs/dreaming/changes",
    body: { on: false },
    expect: runsTheWorkspace,
  },
  // An agent's context window (ADR 0146): as its heartbeat.
  {
    method: "PUT",
    route: "/v1/agents/:id/context-window",
    path: "/v1/agents/agt_nobody/context-window",
    body: {
      used: 1000,
      window: 272_000,
      as_of: "2026-10-09T18:20:00.000Z",
      compacts: true,
      editable: true,
    },
    expect: harnessOnly,
  },
  {
    method: "GET",
    route: "/v1/agents/:id/context-window",
    path: "/v1/agents/agt_nobody/context-window",
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/agents/:id/context-window/changes",
    path: "/v1/agents/agt_nobody/context-window/changes",
    body: { at: 70 },
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/agents/:id/context-window/compactions",
    path: "/v1/agents/agt_nobody/context-window/compactions",
    expect: people,
  },
  // An agent archived, unarchived or deleted (ADR 0095): its harness's owner's, or an owner's or
  // admin's; a member is told so in words for an agent that is there, and nobody else gets in.
  {
    method: "PUT",
    route: "/v1/agents/:id/state",
    path: "/v1/agents/agt_nobody/state",
    body: { state: "archived" },
    expect: { ...people, guest: "forbidden" },
  },
  {
    method: "DELETE",
    route: "/v1/agents/:id",
    path: "/v1/agents/agt_nobody",
    expect: { ...people, guest: "forbidden" },
  },
  // Locking an agent's changes, or letting them go (ADR 0199): the same people as its archive.
  {
    method: "POST",
    route: "/v1/agents/:id/lock",
    path: "/v1/agents/agt_nobody/lock",
    body: { locked: true },
    expect: { ...people, guest: "forbidden" },
  },
  // Pausing the agents in a room, or letting them carry on (ADR 0097): a person's in the room who
  // is not a guest; a member is told so in words for a room they are in.
  {
    method: "POST",
    route: "/v1/spaces/:id/exchange",
    path: "/v1/spaces/spc_nobody/exchange",
    body: { state: "paused" },
    expect: { ...people, guest: "forbidden" },
  },
  // Choosing who leads a room, or that nobody does (ADR 0104): a person's in the room who is not
  // a guest; a member is told so in words for a room they are in.
  {
    method: "POST",
    route: "/v1/spaces/:id/lead",
    path: "/v1/spaces/spc_nobody/lead",
    body: { agent_id: null },
    expect: { ...people, guest: "forbidden" },
  },
  // What a room allows a job (ADR 0117): the workspace's owner's to set (ADR 0196), never a guest's
  // or a harness's; and what its job has spent, for anybody in the room. Nobody is in a room of
  // this id, so past the door each hears `not_found`: an admin or a member in the room hears 403,
  // which `spend.test.ts` pins.
  {
    method: "POST",
    route: "/v1/spaces/:id/spend-ceiling",
    path: "/v1/spaces/spc_nobody/spend-ceiling",
    body: { usd: null },
    expect: { ...people, guest: "forbidden" },
  },
  {
    method: "GET",
    route: "/v1/spaces/:id/spend",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/spend",
    expect: authenticated,
  },
  // Locking a room's changes, or letting them go (ADR 0156): a person's in the room who is not a
  // guest, never a harness's. Nobody is in a room of this id, so past the door each hears
  // `not_found`.
  {
    method: "POST",
    route: "/v1/spaces/:id/lock",
    path: "/v1/spaces/spc_nobody/lock",
    body: { locked: true },
    expect: { ...people, guest: "forbidden" },
  },
  // The rooms an agent has been in, for its message history (Phase 5): a person's to read, a
  // guest's too for the rooms they are in.
  {
    method: "GET",
    route: "/v1/agents/:id/stays",
    path: "/v1/agents/agt_nobody/stays",
    expect: people,
  },
  // What is wrong on a harness's own side is its to say, and nobody else's (ADR 0083).
  {
    method: "PUT",
    route: "/v1/harnesses/:id/status",
    path: "/v1/harnesses/SCOUT/status",
    body: { state: "ok" },
    expect: harnessOnly,
  },
  // Restarting a harness (ADR 0094) is the same people's as removing it. Scout doesn't take
  // restarts, so the people who may are told so in words, and the rest are refused first.
  {
    method: "POST",
    route: "/v1/harnesses/:id/restart",
    path: "/v1/harnesses/SCOUT/restart",
    expect: runsTheWorkspace,
  },
  {
    method: "PATCH",
    route: "/v1/harnesses/:id",
    path: "/v1/harnesses/SCOUT",
    body: { capabilities: ["drive.read", "email.send"] },
    expect: runsTheWorkspace,
  },
  {
    method: "POST",
    route: "/v1/harnesses/:id/owner",
    path: "/v1/harnesses/SCOUT/owner",
    body: { owner_id: "DANA" },
    expect: runsTheWorkspace,
  },
  // Removing a harness (ADR 0078) is the same people's as its tokens. The owner removes Doomed
  // first; the admin's is the second removal, which answers as the first did.
  {
    method: "DELETE",
    route: "/v1/harnesses/:id",
    path: "/v1/harnesses/DOOMED",
    expect: runsTheWorkspace,
  },
  {
    method: "GET",
    route: "/v1/harnesses/:id/tokens",
    path: "/v1/harnesses/SCOUT/tokens",
    expect: runsTheWorkspace,
  },
  {
    method: "POST",
    route: "/v1/harnesses/:id/tokens",
    path: "/v1/harnesses/SCOUT/tokens",
    body: { name: "x" },
    expect: runsTheWorkspace,
  },
  {
    method: "DELETE",
    route: "/v1/harnesses/:id/tokens/:tokenId",
    path: "/v1/harnesses/SCOUT/tokens/tok_01K4ZQPX00000000000000000Z",
    expect: runsTheWorkspace,
  },
  { method: "POST", route: "/v1/pairing-codes", expect: people },
  { method: "POST", route: "/v1/invites", body: { role: "member" }, expect: ownersOnly },
  { method: "GET", route: "/v1/invites", expect: ownersOnly },
  // Somebody already here, let into a space by its link (ADR 0168): a person, any role.
  {
    method: "POST",
    route: "/v1/invites/enter",
    body: { token: "chips_inv_x" },
    expect: people,
  },
  {
    method: "DELETE",
    route: "/v1/invites/:id",
    path: "/v1/invites/inv_01K4ZQPX00000000000000000Z",
    expect: ownersOnly,
  },
  // Who decides a join request: an owner or an admin (ADR 0122), and for a link's request the one
  // person who handed the link out, whatever their role (ADR 0232), so every person may list.
  { method: "POST", route: "/v1/join/links", body: { capabilities: [] }, expect: runsTheWorkspace },
  { method: "GET", route: "/v1/join", expect: people },
  {
    method: "GET",
    route: "/v1/join/:id",
    path: "/v1/join/jrq_01K4ZQPX00000000000000000Z",
    expect: runsTheWorkspace,
  },
  {
    method: "POST",
    route: "/v1/join/:id/allow",
    path: "/v1/join/jrq_01K4ZQPX00000000000000000Z/allow",
    body: { capabilities: [] },
    expect: runsTheWorkspace,
  },
  {
    method: "DELETE",
    route: "/v1/join/:id",
    path: "/v1/join/jrq_01K4ZQPX00000000000000000Z",
    expect: runsTheWorkspace,
  },
  // A guest asks the owners to share the server in Tailscale; only an owner answers, since it
  // is their machine (ADR 0211, Phase 3). An owner asks nobody: their own tailnet is theirs.
  { method: "POST", route: "/v1/direct-asks", body: {}, expect: { ...people, owner: "forbidden" } },
  { method: "GET", route: "/v1/direct-asks/mine", expect: people },
  { method: "GET", route: "/v1/direct-asks", expect: ownersOnly },
  {
    method: "GET",
    route: "/v1/direct-asks/:id",
    path: "/v1/direct-asks/dra_01K4ZQPX00000000000000000Z",
    expect: ownersOnly,
  },
  {
    method: "POST",
    route: "/v1/direct-asks/:id/share",
    path: "/v1/direct-asks/dra_01K4ZQPX00000000000000000Z/share",
    body: { link: "https://login.tailscale.com/admin/invite/x", keep: false },
    expect: ownersOnly,
  },
  { method: "DELETE", route: "/v1/direct-asks/kept-link", expect: ownersOnly },
  // The relay is the server's, and its traffic the owner's to route (ADR 0211, Phase 4).
  { method: "GET", route: "/v1/relay", expect: ownersOnly },
  { method: "PUT", route: "/v1/relay", body: { on: true }, expect: ownersOnly },
  { method: "POST", route: "/v1/relay/ask", expect: ownersOnly },
  { method: "POST", route: "/v1/passkeys/options", expect: people },
  {
    method: "POST",
    route: "/v1/passkeys",
    body: { challenge: "x", credential: { id: "x", response: {} } },
    expect: people,
  },
  { method: "GET", route: "/v1/passkeys", expect: people },
  {
    method: "DELETE",
    route: "/v1/passkeys/:id",
    path: "/v1/passkeys/pky_01K4ZQPX00000000000000000Z",
    expect: people,
  },
  { method: "GET", route: "/v1/devices", expect: people },
  // Somebody's devices, for a person's page (ADR 0209): theirs, or an owner's or admin's to read.
  {
    method: "GET",
    route: "/v1/people/:id/devices",
    path: "/v1/people/DANA/devices",
    expect: { ...runsTheWorkspace, member: "allowed" },
  },
  // The server as its people see it (ADR 0170), and the gallery from the docs (ADR 0171).
  { method: "GET", route: "/v1/server", expect: people },
  { method: "GET", route: "/v1/connectors", expect: people },
  { method: "GET", route: "/v1/me/notifications", expect: people },
  {
    method: "PUT",
    route: "/v1/me/notifications",
    body: { decide: "now", review: "hourly", fyi: "daily", harnesses: {} },
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/me/notifications/claims",
    body: { keys: ["approval:apr_01K4ZQPX000000000000000006"] },
    expect: people,
  },
  // Where a push may reach a phone (M4.3): the device's own, and no route touches another's.
  {
    method: "PUT",
    route: "/v1/me/push-token",
    body: { token: "ExponentPushToken[matrix]", platform: "ios", time_zone: "Europe/London" },
    expect: people,
  },
  { method: "DELETE", route: "/v1/me/push-token", expect: people },
  // What the server takes at most (ADR 0047): anyone who can upload may ask.
  { method: "GET", route: "/v1/limits", expect: authenticated },
  // Which visit a person's messages go to (ADR 0040): theirs, like their settings, and no
  // route reads or writes another person's.
  { method: "GET", route: "/v1/me/pins", expect: people },
  {
    method: "PUT",
    route: "/v1/me/pins/:spaceId",
    path: "/v1/me/pins/spc_01K4ZQPX000000000000000001",
    body: { session_ref: "scout:one" },
    expect: people,
  },
  {
    method: "DELETE",
    route: "/v1/me/pins/:spaceId",
    path: "/v1/me/pins/spc_01K4ZQPX000000000000000001",
    expect: people,
  },
  {
    method: "DELETE",
    route: "/v1/devices/:id",
    path: "/v1/devices/dev_01K4ZQPX00000000000000000Z",
    expect: people,
  },
  // The face a person chose for a space: their own, like their pins and their notifications.
  { method: "GET", route: "/v1/me/space-icons", expect: people },
  {
    method: "PUT",
    route: "/v1/me/space-icons/:spaceId",
    path: "/v1/me/space-icons/spc_01K4ZQPX000000000000000001",
    body: { icon: "tent", ground: 7 },
    expect: people,
  },
  {
    method: "DELETE",
    route: "/v1/me/space-icons/:spaceId",
    path: "/v1/me/space-icons/spc_01K4ZQPX000000000000000001",
    expect: people,
  },
  // A room a person hid from their own list (ADR 0205): theirs, as their faces for rooms are.
  { method: "GET", route: "/v1/me/hidden-spaces", expect: people },
  {
    method: "PUT",
    route: "/v1/me/hidden-spaces/:spaceId",
    path: "/v1/me/hidden-spaces/spc_01K4ZQPX000000000000000001",
    expect: people,
  },
  {
    method: "DELETE",
    route: "/v1/me/hidden-spaces/:spaceId",
    path: "/v1/me/hidden-spaces/spc_01K4ZQPX000000000000000001",
    expect: people,
  },
  // A room a person pinned to the top of their own list (ADR 0240): theirs, as the rooms they
  // hid are.
  { method: "GET", route: "/v1/me/pinned-spaces", expect: people },
  {
    method: "PUT",
    route: "/v1/me/pinned-spaces/:spaceId",
    path: "/v1/me/pinned-spaces/spc_01K4ZQPX000000000000000001",
    expect: people,
  },
  {
    method: "DELETE",
    route: "/v1/me/pinned-spaces/:spaceId",
    path: "/v1/me/pinned-spaces/spc_01K4ZQPX000000000000000001",
    expect: people,
  },
  // A room's lines (ADR 0088): a harness's read of a room it is in; a person reads the room. Scout
  // is in no room of this id, so past the door it hears `not_found`.
  {
    method: "GET",
    route: "/v1/spaces/:id/context",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/context",
    expect: harnessOnly,
  },
  // A room's files at their current version (ADR 0099): anybody's in the room, a guest's and a
  // harness's too. Nobody is in a room of this id, so past the door each hears `not_found`.
  {
    method: "GET",
    route: "/v1/spaces/:id/files",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/files",
    expect: authenticated,
  },
  // One name's versions (ADR 0100): the same route asked for one name, behind the same door.
  {
    method: "GET",
    route: "/v1/spaces/:id/files",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/files?name=gallery.html",
    expect: authenticated,
  },
  // A room's project over git (ADR 0220) takes its own credential: a harness's token with the
  // agent it is for, or a person's project token. None of the matrix's callers brings either, so
  // each is turned away: a signed device is told to ask for a token, and nobody is asked for one.
  {
    method: "GET",
    route: "/v1/spaces/:id/project.git/*",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project.git/info/refs?service=git-upload-pack",
    expect: everyone("forbidden"),
  },
  {
    method: "POST",
    route: "/v1/spaces/:id/project.git/*",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project.git/git-upload-pack",
    body: "",
    expect: everyone("forbidden"),
  },
  // A person's project token: their device's, for a room they're in. This room is nobody's, so
  // past the door each person hears `not_found`.
  {
    method: "POST",
    route: "/v1/spaces/:id/project/token",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/token",
    expect: people,
  },
  // Open folder on Mac (ADR 0225): the same people as a token, from their own device.
  {
    method: "POST",
    route: "/v1/spaces/:id/project/folder/open",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/folder/open",
    expect: people,
  },
  // Run (ADR 0226): the same people, from their own device: the ask, the Mac's word, the read.
  ...(["POST", "PUT", "GET"] as const).map((method) => ({
    method,
    route: "/v1/spaces/:id/project/run",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/run",
    expect: people,
  })),
  // What a person reads of a room's project (ADR 0222): anybody's in the room, a guest's too, and
  // never a harness's, which reads it with git. This room is nobody's, so past the door each person
  // hears `not_found`.
  {
    method: "GET",
    route: "/v1/spaces/:id/project/files",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/files",
    expect: people,
  },
  {
    method: "GET",
    route: "/v1/spaces/:id/project/file",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/file?path=index.html",
    expect: people,
  },
  {
    method: "GET",
    route: "/v1/spaces/:id/project/history",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/history?path=index.html",
    expect: people,
  },
  {
    method: "GET",
    route: "/v1/spaces/:id/project/changes/:commit",
    path: `/v1/spaces/spc_01K4ZQPX000000000000000001/project/changes/${"a".repeat(40)}`,
    expect: people,
  },
  // The project as a zip (ADR 0224), for the phone's share sheet and a browser's download.
  {
    method: "GET",
    route: "/v1/spaces/:id/project/archive",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/archive",
    expect: people,
  },
  // A page of the project built into one document (ADR 0223), as the document or behind a ticket.
  {
    method: "GET",
    route: "/v1/spaces/:id/project/page",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/page?path=index.html",
    expect: people,
  },
  {
    method: "POST",
    route: "/v1/spaces/:id/project/page",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/page",
    body: JSON.stringify({ path: "index.html" }),
    expect: people,
  },
  // Undo: a person's in the room, never a guest's.
  {
    method: "POST",
    route: "/v1/spaces/:id/project/undo",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001/project/undo",
    body: JSON.stringify({ commit: "a".repeat(40) }),
    expect: { ...people, guest: "forbidden" },
  },
  // Erasing a room (ADR 0067): a person's, never a guest's or a harness's. Which people — the
  // room's owner, or an owner or admin of the workspace — needs the room, and this one is not
  // there, so everyone else past the door hears `not_found`.
  {
    method: "DELETE",
    route: "/v1/spaces/:id",
    path: "/v1/spaces/spc_01K4ZQPX000000000000000001",
    expect: { ...people, guest: "forbidden" },
  },
  // Deleting your own account (ADR 0243): anybody's of themselves, refused to the only owner, and
  // never a harness's. LAST, because it deletes the admin's, Dana's and the guest's accounts.
  {
    method: "DELETE",
    route: "/v1/people/me",
    expect: { ...people, owner: "forbidden" },
  },
];

/** The page and the API's catch-all are not authorization; dev routes are off outside dev mode. */
const NOT_A_ROW = new Set(["GET /*"]);

function callerHeaders(
  caller: Caller,
  method: string,
  path: string,
  raw: string,
): Record<string, string> {
  switch (caller) {
    case "owner":
      return ws.arjun.sign(method, path, raw);
    case "admin":
      return admin.sign(method, path, raw);
    case "member":
      return ws.dana.sign(method, path, raw);
    case "guest":
      return guest.sign(method, path, raw);
    case "harness":
      return ws.scout.headers;
    default:
      return {};
  }
}

async function call(row: Row, caller: Caller): Promise<number> {
  const path = (row.path ?? row.route)
    .replace("SCOUT", ws.scout.participantId)
    .replace("DANA", ws.dana.participantId)
    .replace("DOOMED", doomed)
    .replace("LEAVER", leaver.participantId);
  const raw =
    row.body === undefined
      ? ""
      : typeof row.body === "string"
        ? row.body
        : JSON.stringify(row.body);
  const target = path;
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method: row.method,
      headers: {
        ...(typeof row.body === "string" ? {} : { "content-type": "application/json" }),
        ...callerHeaders(caller, row.method, target, raw),
      },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return response.status;
}

describe("the authorization matrix", () => {
  it("has a row for every route the app registers, and no route it does not", () => {
    const registered = new Set(
      ws.gateway.app.routes
        .filter(
          (route) => route.method !== "ALL" && !NOT_A_ROW.has(`${route.method} ${route.path}`),
        )
        .map((route) => `${route.method} ${route.path}`),
    );
    const rows = new Set(ROWS.map((row) => `${row.method} ${row.route}`));
    expect([...registered].filter((each) => !rows.has(each)).sort()).toEqual([]);
    expect([...rows].filter((each) => !registered.has(each)).sort()).toEqual([]);
  });

  const cases = ROWS.flatMap((row) =>
    (["owner", "admin", "member", "guest", "harness", "nobody"] as const).map(
      (caller) => [`${row.method} ${row.route}`, caller, row] as const,
    ),
  );

  it.each(cases)("%s as %s", async (_name, caller, row) => {
    const status = await call(row, caller);
    const expectation = row.expect[caller];
    if (expectation === "open") {
      expect(status, `open door answered ${status}`).not.toBe(403);
      expect(status).not.toBe(404);
    } else if (expectation === "allowed") {
      expect([401, 403], `${caller} was turned away with ${status}`).not.toContain(status);
    } else if (caller === "nobody") {
      expect(status).toBe(401);
    } else {
      expect(status, `${caller} got ${status}, not 403`).toBe(403);
    }
  });
});
