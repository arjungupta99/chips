/**
 * The Kysely schema. One definition, two dialects (ADR 0003): SQLite in solo mode from Phase 0,
 * Postgres from Phase 6 with the same migrations.
 *
 * Every table carries `workspace_id` (technical-plan 6.2: tenancy from the first table), and
 * every repository method takes a workspace scope.
 *
 * The tables fall into two groups.
 *
 * **The log and its projections.** `events` is the truth; `spaces`, `memberships`,
 * `messages`, `runs`, `steps`, `approvals`, `questions`, `attachments`, `lanes`, `read_state`,
 * `harness_policy`, `workspace_policy`, `session_rules`, `workspace_members` and `pins` are read
 * models rebuilt from it. `rebuild(workspace)` drops all fifteen and replays. The two FTS5
 * tables beside `messages` and `steps` follow them by trigger (M5.4) and are not in the schema.
 *
 * **The registry.** `workspaces`, `participants`, `devices`, `harness_tokens`, `invites` and
 * `passkeys` are identity and credentials. They are not projections: an Ed25519 public key, a
 * hashed harness token, an invite's digest and a passkey's public key are not things a replay
 * should be able to reconstruct, and nothing in the audit log needs them to be. See ADR 0018,
 * ADR 0019 for the line through `participants` and `workspaces` — identity stays here, and what
 * a harness may do is a projection of `policy.updated` — and ADR 0034 for the same line through
 * people: who somebody is stays here, and their role is a projection of `person.joined`.
 */

import type { Generated } from "kysely";

/** SQLite has no boolean; a flag is 0 or 1 in both dialects. */
type Flag = 0 | 1;

export interface WorkspacesTable {
  id: string;
  name: string;
  /**
   * The workspace's price table for estimating cost from tokens, as JSON, or null for the
   * default (`domain/pricing.ts`). A registry column: what a token costs here is a setting
   * somebody made, not a view of what happened.
   */
  price_table: string | null;
  created_at: string;
}

/**
 * Identity only ([ADR 0019](../../../../docs/decisions/0019-policy-is-a-projection.md)): what an
 * harness may do — its autonomy, its rules, its budget and what it has spent — is `harness_policy`,
 * a projection of `policy.updated` and `usage`, and nothing writes it directly.
 */
export interface ParticipantsTable {
  id: string;
  workspace_id: string;
  kind: "person" | "harness" | "agent";
  display_name: string;
  /** The person accountable for a harness. Null for a person, and for an agent: its harness's. */
  owner_id: string | null;
  /** The lead, for a child minted to serve one lane. */
  parent_id: string | null;
  ephemeral: Flag;
  capabilities: string | null;
  created_at: string;
  /**
   * When a person removed the harness from the workspace (0029, ADR 0078); null while it is here.
   * The row stays, so what it said keeps its name.
   */
  removed_at: Generated<string | null>;
  /**
   * For an agent (0032, ADR 0087): the harness it belongs to. An agent's row is the log's,
   * written by `agent.registered`; its owner and removal are its harness's.
   */
  harness_id: Generated<string | null>;
  /** For an agent: the harness's own name for it, unique among that harness's agents. */
  agent_key: Generated<string | null>;
  /** For an agent: 1 when it is its harness's Main agent. */
  lead: Generated<Flag>;
  /** For an agent: the agent it is a copy of. */
  forked_from: Generated<string | null>;
  /** For an agent: `active`, or `archived` when its thing was put away in its harness. */
  agent_state: Generated<"active" | "archived" | null>;
  /**
   * For an agent (0034, ADR 0089): the face a person chose for it, `{icon, ground}` as JSON, one
   * for everybody. Null while it wears its initials.
   */
  face: Generated<string | null>;
  /**
   * For an agent (0035, ADR 0091): the person who last named it, or null while its name is its
   * harness's or Chips's. While set, the harness does not rename it.
   */
  name_by: Generated<string | null>;
  /**
   * For a free agent (0033, ADR 0087): the room an archive took it out of, so an unarchive brings
   * it back. Cleared when it is attached anywhere.
   */
  released_from: Generated<string | null>;
  /** For an agent: the room it was last taken out of, whatever took it. */
  last_space_id: Generated<string | null>;
  /**
   * For an agent (0048, ADR 0199): 1 while a person has locked its changes, so that no person
   * renames, archives or deletes it.
   */
  locked: Generated<Flag>;
}

/** What an agent said while in no room (0033): a projection of `message.held`. */
export interface HeldMessagesTable {
  event_id: string;
  workspace_id: string;
  agent_id: string;
  seq: number;
  said_at: string;
  text: string;
  /** JSON, as the harness's upload described them. */
  attachments: string | null;
}

/** Who took whose place in a room (0032): a projection of `membership.replaced`. */
export interface ReplacementsTable {
  workspace_id: string;
  space_id: string;
  from_id: string;
  to_id: string;
  seq: number;
}

export interface DevicesTable {
  id: string;
  workspace_id: string;
  participant_id: string;
  /** Ed25519, base64. Devices are paired by QR; there is no password anywhere (ADR 0006). */
  public_key: string;
  name: string;
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  /** The way its newest socket came: `socket`, `lan` or `relay` (ADR 0211, Phase 4). */
  last_via: string | null;
  last_via_at: string | null;
  /** When a socket of it last came other than through the relay. */
  direct_at: string | null;
}

export interface HarnessTokensTable {
  id: string;
  workspace_id: string;
  harness_id: string;
  /** SHA-256 of the token. The token itself is shown once and never stored. */
  token_hash: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/**
 * The append-only log. `seq` is monotonic per workspace and assigned inside the same
 * transaction that applies the projections, so a reader that has seen `seq` has seen every
 * read-model change up to it.
 */
export interface EventsTable {
  workspace_id: string;
  seq: number;
  id: string;
  type: string;
  ts: string;
  space_id: string | null;
  run_id: string | null;
  actor_kind: string;
  actor_id: string;
  idempotency_key: string | null;
  /** The whole validated event, as JSON. The audit log is a read of this column. */
  payload: string;
  appended_at: string;
}

export interface SpacesTable {
  id: string;
  workspace_id: string;
  kind: "direct" | "group" | "channel" | "thread";
  title: string | null;
  /** What the adapter that opened it calls the thing this space is. Unique per workspace. */
  external_key: string | null;
  /** Open, or closed: off the list with its history kept, and reopenable (0008). */
  state: "open" | "closed";
  closed_at: string | null;
  /** Who sent `space.created`: the one harness that may retitle or close it later (0008). */
  opened_by: string | null;
  /** Whether a person or a harness last set the title, so a harness's does not overwrite a person's. */
  title_by: "person" | "harness" | null;
  /** Whether a person or a harness last archived or unarchived it (0026, ADR 0066). */
  state_by: "person" | "harness" | null;
  /**
   * The harness a person opened this room for, to claim with a key of its own (0027). Stays
   * after the claim, which sets `external_key` and `opened_by`; waiting is the key being null.
   */
  asked_of: string | null;
  /**
   * 1 for the harness's home, the room its lead speaks in: nobody archives or erases it (0028,
   * ADR 0069). Set by the harness that opened it, with `space.updated`.
   */
  home: Generated<number>;
  /** The other harnesses a person asked from the + (0033, ADR 0087), as a JSON array. */
  also_asked_of: Generated<string | null>;
  /** The agent that leads the room (0036, ADR 0104), or null; read as none once it has left. */
  lead_id: Generated<string | null>;
  /** What the room allows a job, in US dollars (0037, ADR 0117), or null for the default. */
  spend_ceiling_usd: Generated<number | null>;
  /**
   * 1 while a person there has locked the room's changes (0045, ADR 0156): no person renames,
   * archives or deletes it. Set by `space.lock_set`.
   */
  locked: Generated<number>;
  /** For a thread (M5.4): the space it grew in, whose members are its members. */
  parent_space_id: string | null;
  /** For a thread: the message in the parent it grew from. */
  root_message_id: string | null;
  created_at: string;
  last_activity_at: string | null;
  last_event_seq: number | null;
}

export interface SessionsTable {
  workspace_id: string;
  /** `<harness>:<session id>`: the harness's own name for one visit. */
  session_ref: string;
  space_id: string;
  harness_id: string;
  state: "live" | "closed";
  started_reason: string | null;
  ended_reason: string | null;
  /** Where it is running, for a person to read. */
  where: string | null;
  /** What the harness calls this visit (ADR 0040); null where it names none. */
  title: string | null;
  transcript_ref: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_seq: number | null;
}

export interface MembershipsTable {
  workspace_id: string;
  space_id: string;
  participant_id: string;
  role: "owner" | "member" | "guest";
  joined_at: string;
  /** The first name held for a harness's agent-to-be in a room asked of it from the + (ADR 0150). */
  agent_name: Generated<string | null>;
  /** Whose naming it is: the person who added the harness. */
  agent_name_by: Generated<string | null>;
}

export interface MessagesTable {
  id: string;
  workspace_id: string;
  space_id: string | null;
  run_id: string | null;
  seq: number | null;
  /** One of the eleven message types in the blueprint. */
  type: string;
  author_kind: string;
  author_id: string;
  text: string | null;
  reply_to: string | null;
  attachments: string | null;
  approval_id: string | null;
  ask_id: string | null;
  created_at: string;
  /** When its author last changed its words (M5.4). */
  edited_at: string | null;
  /** When it was taken back: the text is gone from the row, the log keeps it (M5.4). */
  deleted_at: string | null;
  /**
   * The harnesses a text message is for, as a JSON array (ADR 0081); null on a message from
   * before Chips said so, which was for every harness in its space.
   */
  addressed_to: string | null;
  /**
   * 1 when the message was for every harness in its space, whoever was there (ADR 0081): its
   * author's next message that names nobody goes to every harness there is then. Null otherwise.
   */
  addressed_to_all: number | null;
  /** 1 when the guard held a harness's message: shown, and for nobody (ADR 0081). */
  held: number | null;
}

/** A message pinned to the top of its space (M5.4): a projection of `message.pinned`. */
export interface PinsTable {
  workspace_id: string;
  space_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
}

export interface RunsTable {
  id: string;
  workspace_id: string;
  space_id: string | null;
  /** The harness whose budget it is. */
  harness_id: string;
  /** The agent it is by (0032, ADR 0087); null for a run from before agents. */
  agent_id: Generated<string | null>;
  goal: string;
  /** queued, running, waiting, done, failed, cancelled. */
  state: string;
  status_phase: string | null;
  status_verb: string | null;
  plan: string | null;
  session_ref: string | null;
  summary: string | null;
  error: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  context_used: number | null;
  context_limit: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface StepsTable {
  workspace_id: string;
  run_id: string;
  step_id: string;
  /** Position in the plan, when the step came from one. */
  ordinal: number | null;
  title: string | null;
  /** planned, started, done, failed. */
  status: string;
  tool: string | null;
  summary: string | null;
  sources: string | null;
  duration_ms: number | null;
  error: string | null;
  updated_at: string;
}

export interface ApprovalsTable {
  id: string;
  workspace_id: string;
  space_id: string | null;
  run_id: string | null;
  step_id: string | null;
  action: string;
  preview: string | null;
  risk: string;
  sources: string | null;
  requested_at: string;
  expires_at: string | null;
  fallback: string;
  approvers: string | null;
  editable: Flag;
  /** pending or resolved. An expiry resolves it too, with decision `expired`. */
  state: string;
  decision: string | null;
  scope: string | null;
  reason: string | null;
  updated_input: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  executed_outcome: string | null;
  executed_detail: string | null;
}

export interface QuestionsTable {
  id: string;
  workspace_id: string;
  space_id: string | null;
  run_id: string | null;
  questions: string;
  asked_at: string;
  timeout_at: string | null;
  on_no_answer: string;
  state: string;
  answers: string | null;
  answered_by: string | null;
  answered_at: string | null;
  timed_out: Flag;
}

export interface AttachmentsTable {
  id: string;
  workspace_id: string;
  /** The space of the message that carried it, which is who may fetch it. */
  space_id: string | null;
  /** The event of the message that carried it. */
  message_id: string | null;
  filename: string;
  mime_type: string;
  byte_size: number;
  /** The store is content-addressed by this digest (ADR 0010). */
  sha256: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
}

/** One lane: a run a lead routed to a specialist, seen from both chats (M3.1). */
export interface LanesTable {
  id: string;
  workspace_id: string;
  lead_id: string;
  specialist_id: string;
  on_behalf_of: string;
  origin_message_id: string | null;
  goal: string;
  /** queued, running, waiting, completed, failed, cancelled — the lane's state (0007). */
  state: string;
  /** pending, direct, queued_to_lead, delivered, failed — travels with the lane (0007). */
  delivery: string;
  summary: string | null;
  depth: number;
  /** The specialist's run, whose messages and approvals are the lane's (0007). */
  run_id: string | null;
  /** The lead's run this task was a hop of, for the cancel cascade (0007). */
  lead_run_id: string | null;
  /** The specialist's space, where the lane lives as a thread (0007). */
  home_space_id: string | null;
  /** The lead spaces it is linked into, as JSON: where the route card shows (0007). */
  linked_space_ids: string | null;
  /** The chain that led here, as JSON (0007). */
  trail: string | null;
  /** The cost rolled up onto the lane (0007). */
  cost_usd: number | null;
  created_at: string;
  updated_at: string;
}

/** Reserved. Read receipts arrive with the client work in Phase 1. */
export interface ReadStateTable {
  workspace_id: string;
  space_id: string;
  participant_id: string;
  last_read_seq: number;
  updated_at: string;
}

/**
 * A harness's policy, per space: the row for `*` is the harness's everywhere, and a row for
 * a space is the dial as set in that room. Built from `policy.updated`; `spent_usd` is
 * what `usage` has added up. Rebuilt by `rebuild`.
 */
export interface HarnessPolicyTable {
  workspace_id: string;
  harness_id: string;
  /** A space id, or `*` for the harness's policy everywhere. */
  space_id: string;
  autonomy: number;
  /** The rules, as JSON: `PolicyRule[]` from the protocol. */
  rules: string;
  budget_usd: number | null;
  spent_usd: number;
  updated_at: string;
  updated_seq: number;
}

/** The workspace cap, as the last `policy.updated` reported it. Rebuilt by `rebuild`. */
export interface WorkspacePolicyTable {
  workspace_id: string;
  max_autonomy: number;
  /** Reserved: workspace-wide rules arrive with the admin console. Always `[]` for now. */
  rules: string;
  updated_at: string;
  updated_seq: number;
}

/**
 * A decision made for "this session": the rest of its run decides the same kind of action, with
 * the same flags, the same way. Built from `approval.resolved` and the approval's own action.
 */
export interface SessionRulesTable {
  workspace_id: string;
  run_id: string;
  approval_id: string;
  /** The action's kind, exactly. */
  match: string;
  external: Flag;
  irreversible: Flag;
  decision: "allow" | "deny";
  decided_at: string;
  /**
   * For a command, the starts its parts were remembered by, as JSON (ADR 0239); `null` for an ask
   * with no command, which answers its kind whole.
   */
  starts_with: string | null;
}

/**
 * Uploads: what has been sent to the store, by whom, and what the bytes turned out to be. A
 * registry row (ADR 0018), not a projection: the bytes are not in the log, and the row is what
 * says where they are. A row begins as a slot and becomes stored when the bytes arrive; the
 * `attachments` projection is the same file as a message carried it.
 */
export interface UploadsTable {
  id: string;
  workspace_id: string;
  uploaded_by: string;
  filename: string;
  /** `slot` until the bytes arrive, then `stored`. */
  state: string;
  /** Sniffed from the bytes on arrival; null while a slot. */
  mime_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  thumbnail_sha256: string | null;
  thumbnail_mime_type: string | null;
  /** 1 when the uploader asked to keep the photo's metadata, location included. */
  keep_metadata: Flag;
  created_at: string;
  /** A slot not filled by then is gone. Each piece moves it on (ADR 0052). */
  expires_at: string;
  stored_at: string | null;
  /** The size the slot said it would be, which is how a pieced upload knows its last piece. */
  declared_bytes: number | null;
  /** A measured video's playable copy (ADR 0053): `pending`, `done`, `skipped` or `failed`. */
  playable_state: string | null;
  /** `remux` or `transcode`, for a pending copy. */
  playable_how: string | null;
  playable_sha256: string | null;
  playable_mime_type: string | null;
  /** Why a copy failed, in ffmpeg's words. */
  playable_note: string | null;
  /** What was said in a voice note, as whisper heard it when it arrived (ADR 0054). */
  transcript: string | null;
  /**
   * A photo's copy for a viewer, or a video's poster at that size: WebP, no longer than 2,048
   * pixels on its longer side (ADR 0058). Made at upload, or at the first ask for an older photo.
   */
  view_sha256: string | null;
  view_mime_type: string | null;
}

/**
 * What may be attached here (ADR 0047): the most a photo, a video or a file may be, in bytes,
 * or null where the server's own ceiling applies. A projection of `attachment.limits_set`; the
 * last one in the log is the row.
 */
export interface WorkspaceLimitsTable {
  workspace_id: string;
  image_bytes: number | null;
  video_bytes: number | null;
  file_bytes: number | null;
  set_by: string;
  updated_seq: number;
}

/**
 * A person's standing in the workspace (ADR 0034): owner, admin, member or guest. A projection
 * of `person.joined` and `role.changed`; the room standings are `memberships`.
 */
export interface WorkspaceMembersTable {
  workspace_id: string;
  participant_id: string;
  role: "owner" | "admin" | "member" | "guest";
  /** As the joining event said it; the participant row is the name's truth. */
  display_name: string;
  invited_by: string | null;
  invite_id: string | null;
  joined_at: string;
  updated_seq: number;
}

/**
 * An invite: a capability, stored as a digest, with a role attached (ADR 0034). A registry row
 * like a pairing code would be if it survived a restart, which is why it has an expiry.
 */
export interface InvitesTable {
  id: string;
  workspace_id: string;
  /** SHA-256 of the token. The token is in the link, shown once, and never stored. */
  token_hash: string;
  role: "owner" | "admin" | "member" | "guest";
  single_use: Flag;
  /** How many people have joined by it. A single-use invite is spent at one. */
  uses: number;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  /**
   * The space the link brings whoever opens it into, as its maker would add them (ADR 0168), or
   * `null` for a link to the workspace alone. Migration 0047.
   */
  space_id: Generated<string | null>;
  /**
   * Whether redeeming it waits for its maker's Allow (ADR 0232): it went out as the relay's page.
   * Migration 0053, which marks invites made before it as asking.
   */
  asks: Generated<Flag>;
}

/**
 * A passkey: a WebAuthn credential's public key, which is how a person pairs a new device
 * without a code from an old one (ADR 0034). A registry row beside the device keys.
 */
export interface PasskeysTable {
  id: string;
  workspace_id: string;
  participant_id: string;
  /** The credential id the authenticator chose, base64url. Unique across every workspace. */
  credential_id: string;
  /** The public key as a JWK, as JSON: what `node:crypto` verifies with. */
  public_key: string;
  /** The COSE algorithm: -7 ES256, -8 EdDSA, -257 RS256. */
  algorithm: number;
  /** The authenticator's counter at last use; one that goes backwards is a cloned key. */
  sign_count: number;
  /** How the authenticator is reached, as JSON, for the browser's hint. */
  transports: string | null;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface MigrationsTable {
  name: string;
  applied_at: Generated<string>;
}

/**
 * The face a person chose for a space (21 September 2026), theirs alone: a registry, not a
 * projection. A mark's name from the library, and the index of the ground it sits on.
 */
export interface SpaceIconsTable {
  workspace_id: string;
  participant_id: string;
  space_id: string;
  icon: string;
  ground: number;
  /** One or two letters, or an emoji or two, in place of the mark (0040, ADR 0139). */
  letters: Generated<string | null>;
  updated_at: string;
}

/**
 * A room a person hid from their own list (ADR 0205), theirs alone: a registry, not a projection,
 * as their faces for rooms are. A row is the room hidden.
 */
export interface HiddenSpacesTable {
  workspace_id: string;
  participant_id: string;
  space_id: string;
  hidden_at: string;
}

/**
 * A room a person pinned to the top of their own list (ADR 0240), theirs alone: a registry, not a
 * projection, as the rooms they hid are. A row is the room pinned; when it was pinned orders it.
 */
export interface PinnedSpacesTable {
  workspace_id: string;
  participant_id: string;
  space_id: string;
  pinned_at: string;
}

/** A person's notification settings (M5.6), theirs alone: a registry, not a projection. */
export interface NotificationSettingsTable {
  workspace_id: string;
  participant_id: string;
  /** The settings as JSON, validated against the protocol's schema on the way in. */
  settings: string;
  updated_at: string;
}

/**
 * Which visit a person's messages in a space go to (ADR 0040), theirs alone: a registry, not a
 * projection. No row is the ordinary case — the harness chooses, as it always did.
 */
export interface SessionPinsTable {
  workspace_id: string;
  participant_id: string;
  space_id: string;
  session_ref: string;
  pinned_at: string;
}

/** The claim ledger (M5.6): which device of a person raised the banner for a key. */
export interface NotificationClaimsTable {
  workspace_id: string;
  participant_id: string;
  key: string;
  device_id: string;
  claimed_at: string;
}

/**
 * The server's own keys (M4.1, ADR 0039): the X25519 static key a phone authenticates the
 * server by through the relay. A registry, and the one table that holds a private key.
 */
export interface ServerKeysTable {
  kind: string;
  /** Raw, base64url. What the pairing payload carries. */
  public_key: string;
  /** PKCS#8, base64. */
  private_key: string;
  created_at: string;
}

/**
 * Where a push may reach a phone (M4.3, ADR 0045). A registry: the token is a credential the
 * device was issued, not anything the event log knows. Keyed by device, because that is what a
 * token belongs to; `time_zone` is the phone's own, and quiet hours are computed in it.
 */
export interface PushTokensTable {
  device_id: string;
  workspace_id: string;
  participant_id: string;
  token: string;
  platform: string;
  time_zone: string;
  updated_at: string;
  /** The phone's sealing key, base64 of 32 bytes (ADR 0158). Null when it sent none. */
  seal_key: string | null;
}

/**
 * A join request (ADR 0122): something asking to join, and what a person made of it. A registry
 * row, as an invite is: the secret is a digest, and the log holds only what was decided.
 */
export interface JoinRequestsTable {
  id: string;
  workspace_id: string;
  kind: "harness" | "device" | "invite" | "pairing";
  /** SHA-256 of the secret the requester holds, or the link carries. Never the secret. */
  secret_hash: string;
  /** The code to compare, for a request the requester started; null for a link. */
  code: string | null;
  name: string | null;
  software: string | null;
  machine: string | null;
  from_addr: string | null;
  /** What a harness asked to do, as a JSON array of capability names. */
  wants: string;
  /** A device's public key, SPKI DER base64; null for a harness. */
  public_key: string | null;
  state: "waiting" | "allowed" | "denied" | "expired" | "redeemed";
  /** What a person allowed, as a JSON array of capability names. */
  allowed_caps: string;
  started_by: "requester" | "person";
  /** Where the requester is told Chips is. */
  url: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  expires_at: string;
  harness_id: string | null;
  space_id: string | null;
  device_id: string | null;
  /** Whom a device is paired as, when an owner chose somebody else (ADR 0206); null for them. */
  pair_as: string | null;
  /** The one person who decides a link's request (ADR 0232); null for every other request. */
  asked_of: string | null;
  /** The invite an `invite` request spends when it is collected (ADR 0232). */
  invite_id: string | null;
  /** The role that invite gives (ADR 0232). */
  role: "owner" | "admin" | "member" | "guest" | null;
  /** The device a pairing code was made to replace, signed out once this one pairs (ADR 0236). */
  replaces: string | null;
  /** A Wi-Fi device's commitment to its nonce, base64url (ADR 0278); null otherwise. */
  check_commit: string | null;
  /** The nonce this server answered that device with (ADR 0278); null otherwise. */
  check_nonce: string | null;
}

/** A harness's copy of an agent's context files, or of its own set (ADR 0134). */
export interface ContextSetsTable {
  workspace_id: string;
  owner_kind: "agent" | "harness";
  owner_id: string;
  harness_id: string;
  /** JSON: the files as the harness sent them, in its order. */
  files: string;
  /** JSON: the files it named and Chips does not show. */
  not_shown: string;
  new_agents_note: string | null;
  /** An agent's: when it reads its files, in its harness's words (ADR 0238, migration 0055). */
  read_note: string | null;
  read_at: string;
}

/** A person's edit of a context file, on its way to the harness (ADR 0134). */
export interface ContextEditsTable {
  id: string;
  workspace_id: string;
  owner_kind: "agent" | "harness";
  owner_id: string;
  harness_id: string;
  name: string;
  base_hash: string | null;
  /** Emptied once the harness answers. */
  text: string;
  asked_by: string;
  asked_at: string;
  state: "waiting" | "saved" | "changed" | "failed";
  message: string | null;
  answered_at: string | null;
}

/** A harness's copy of an agent's model and effort, and the last change asked of it (ADR 0140). */
export interface AgentModelsTable {
  workspace_id: string;
  agent_id: string;
  harness_id: string;
  /** JSON: the copy as the harness sent it, without what it answered. */
  said: string;
  read_at: string;
  /** JSON: the last change a person asked, and what became of it; `null` before any. */
  change: string | null;
}

/** One of a harness's own jobs, as its copy last said it, and the last change asked of it (ADR 0252). */
export interface HarnessJobsTable {
  workspace_id: string;
  harness_id: string;
  job_id: string;
  /** Where it stands in the copy, for the order the page lists them in. */
  position: number;
  /** JSON: the job as the harness sent it. */
  said: string;
  /** When the harness last sent its copy. */
  read_at: string;
  /** JSON: the last change a person asked, and what became of it; `null` before any. */
  change: string | null;
}

/** One run of a harness's own job, as the harness last posted it (ADR 0252). */
export interface HarnessJobRunsTable {
  workspace_id: string;
  harness_id: string;
  job_id: string;
  run_id: string;
  started_at: string;
  /** What it cost, for a week's sum: `null` when the harness didn't know. */
  cost_usd: number | null;
  /** JSON: the run as the harness posted it. */
  said: string;
}

/** A harness's copy of an agent's heartbeat, and the last change asked of it (ADR 0143). */
export interface AgentHeartbeatsTable {
  workspace_id: string;
  agent_id: string;
  harness_id: string;
  /** JSON: the copy as the harness sent it, without what it answered. */
  said: string;
  read_at: string;
  /** JSON: the last change a person asked, and what became of it; `null` before any. */
  change: string | null;
}

/**
 * A harness's copy of an agent's context window, and the last limit and Compact now asked of it
 * (ADR 0146).
 */
export interface AgentContextWindowsTable {
  workspace_id: string;
  agent_id: string;
  harness_id: string;
  /** JSON: the copy as the harness sent it, without what it answered. */
  said: string;
  read_at: string;
  /** JSON: the last limit a person asked, and what became of it; `null` before any. */
  change: string | null;
  /** JSON: the last Compact now a person asked, and what became of it; `null` before any. */
  compaction: string | null;
}

/**
 * A guest's ask to go direct (ADR 0211, Phase 3): asked, then shared by an owner with Tailscale's
 * link, then direct once the guest's socket arrives other than through the relay. A registry: the
 * link opens the owner's machine to whoever holds it, so it is never in the log.
 */
export interface DirectAsksTable {
  id: string;
  workspace_id: string;
  participant_id: string;
  /** The device the guest asked from. */
  device_id: string | null;
  state: "asked" | "shared" | "direct";
  /** The guest's round trip through the relay when they asked, for the owner to read. */
  trip_ms: number | null;
  link: string | null;
  shared_by: string | null;
  created_at: string;
  shared_at: string | null;
  direct_at: string | null;
}

/** The share link an owner chose to give the next guest who asks: one per workspace. */
export interface DirectLinksTable {
  workspace_id: string;
  link: string;
  kept_by: string;
  kept_at: string;
}

/** The owner's relay switch (ADR 0211, Phase 4): one row, `relay`, once an owner first turns it. */
export interface RelaySwitchTable {
  id: string;
  /** 1 when this server dials its relay, 0 when an owner turned it off. */
  on: number;
  set_by: string;
  workspace_id: string;
  set_at: string;
}

export interface Database {
  workspaces: WorkspacesTable;
  participants: ParticipantsTable;
  devices: DevicesTable;
  harness_tokens: HarnessTokensTable;
  events: EventsTable;
  spaces: SpacesTable;
  sessions: SessionsTable;
  memberships: MembershipsTable;
  messages: MessagesTable;
  runs: RunsTable;
  replacements: ReplacementsTable;
  held_messages: HeldMessagesTable;
  steps: StepsTable;
  approvals: ApprovalsTable;
  questions: QuestionsTable;
  attachments: AttachmentsTable;
  lanes: LanesTable;
  read_state: ReadStateTable;
  harness_policy: HarnessPolicyTable;
  workspace_policy: WorkspacePolicyTable;
  session_rules: SessionRulesTable;
  uploads: UploadsTable;
  workspace_members: WorkspaceMembersTable;
  pins: PinsTable;
  invites: InvitesTable;
  notification_settings: NotificationSettingsTable;
  session_pins: SessionPinsTable;
  notification_claims: NotificationClaimsTable;
  passkeys: PasskeysTable;
  server_keys: ServerKeysTable;
  push_tokens: PushTokensTable;
  workspace_limits: WorkspaceLimitsTable;
  space_icons: SpaceIconsTable;
  hidden_spaces: HiddenSpacesTable;
  pinned_spaces: PinnedSpacesTable;
  join_requests: JoinRequestsTable;
  direct_asks: DirectAsksTable;
  direct_links: DirectLinksTable;
  relay_switch: RelaySwitchTable;
  context_sets: ContextSetsTable;
  context_edits: ContextEditsTable;
  agent_models: AgentModelsTable;
  agent_heartbeats: AgentHeartbeatsTable;
  harness_jobs: HarnessJobsTable;
  harness_job_runs: HarnessJobRunsTable;
  agent_context_windows: AgentContextWindowsTable;
  _chips_migrations: MigrationsTable;
}
