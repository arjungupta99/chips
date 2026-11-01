/**
 * The sub-schemas events are built from. Each one exists because more than one event needs
 * it, and each carries a description, because those descriptions become the documentation
 * reference (technical-plan decision 13).
 */

import { z } from "zod";
import { ID_PREFIXES, type IdKind } from "./ids/index.js";

const ULID = "[0-7][0-9A-HJKMNP-TV-Z]{25}";

/** A schema for one kind of prefixed ULID, for example `run_01K4...` (decision 11). */
export function id<K extends IdKind>(kind: K) {
  return z
    .string()
    .regex(new RegExp(`^${ID_PREFIXES[kind]}_${ULID}$`), `expected a ${kind} id`)
    .describe(`A ${kind} identifier: \`${ID_PREFIXES[kind]}_\` followed by a ULID.`);
}

/**
 * Who takes part in rooms without being a person: an agent (ADR 0087), or a harness written
 * before agents, which is a member of rooms until the upgrade gives it one.
 */
export const agentId = z
  .string()
  .regex(
    new RegExp(`^(?:${ID_PREFIXES.agent}|${ID_PREFIXES.harness})_${ULID}$`),
    "expected an agent id",
  )
  .describe(
    "An agent identifier (`agt_`, ADR 0087), or a harness's (`hrn_`) for one written before agents.",
  );

/**
 * Somebody in a room a message can be for (ADR 0204): an agent (`agentId`), or a person (`usr_`).
 */
export const memberId = z
  .string()
  .regex(
    new RegExp(`^(?:${ID_PREFIXES.agent}|${ID_PREFIXES.harness}|${ID_PREFIXES.person})_${ULID}$`),
    "expected an agent or a person id",
  )
  .describe(
    "An agent identifier (`agt_`, or a harness's `hrn_` for one written before agents), or a person's (`usr_`).",
  );

/** The kinds of participant: a person, an agent in rooms, and the harness behind agents. */
export const PARTICIPANT_KINDS = ["person", "harness", "agent"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export const isoTimestamp = z.iso
  .datetime({ offset: true })
  .describe("An ISO 8601 timestamp, for example `2026-09-02T14:22:31.004Z`.");

/** Who caused an event. Every envelope says so; the audit log is a read of this field. */
export const actor = z
  .object({
    kind: z
      .enum(["person", "harness", "agent", "system"])
      .describe("Whether a person, a harness, one of a harness's agents or Chips itself acted."),
    id: z.string().min(1).describe("The participant id, or `system` for Chips."),
    harness_id: id("harness")
      .optional()
      .describe(
        "For an agent: the harness it speaks through, whose budget and runs are the agent's (ADR 0087). Filled in by Chips.",
      ),
  })
  .describe("The participant an event is attributed to.");
export type Actor = z.infer<typeof actor>;

/** A person, harness or agent as another party sees them, with the role Chips assigns. */
export const participantRef = z
  .object({
    participant_id: z.string().min(1).describe("The stable id of the sender."),
    kind: z
      .enum(PARTICIPANT_KINDS)
      .describe(
        "Whether the sender is a person or an agent (ADR 0087); `harness` for a harness written before agents, and for any agent as a harness that has not declared `agents` is told it.",
      ),
    display_name: z.string().min(1).max(120).describe("The name to show."),
    role: z
      .enum(["owner", "member", "guest"])
      .describe(
        "The sender's standing in this space. Multi-user is Chips' job, not the harness's.",
      ),
    workspace_role: z
      .enum(["owner", "admin", "member", "guest"])
      .optional()
      .describe(
        "A person's standing in the workspace (SEC-15): what a model should weigh the words by, since a guest's read as the owner's otherwise. `promptFor` says it after the name. Absent for an agent or a harness, and from a Chips before it said.",
      ),
  })
  .describe("A sender, as the receiving side sees them.");
export type ParticipantRef = z.infer<typeof participantRef>;

/** The longest transcript an attachment carries: far more than five minutes of anyone talking. */
export const MAX_TRANSCRIPT_LENGTH = 50_000;

/**
 * An attachment. Anything you can send a person you can send a harness, so this shape carries
 * files, images, video and voice notes alike (decision 10).
 */
export const attachment = z
  .object({
    attachment_id: id("attachment"),
    filename: z.string().min(1).max(255).describe("The name to show. Never trusted for its type."),
    mime_type: z
      .string()
      .min(1)
      .max(255)
      .describe("Sniffed from the bytes on upload, not taken from the client."),
    byte_size: z.int().nonnegative().describe("Size in bytes."),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .describe("Lowercase hex digest. The store is content-addressed."),
    width: z.int().positive().optional().describe("Pixels, for images and video."),
    height: z.int().positive().optional().describe("Pixels, for images and video."),
    duration_ms: z.int().nonnegative().optional().describe("Milliseconds, for audio and video."),
    transcript: z
      .string()
      .min(1)
      .max(MAX_TRANSCRIPT_LENGTH)
      .optional()
      .describe(
        "What was said, for a voice note the server transcribed when it arrived (ADR 0054). Machine-heard: the person's words as best the server could make them out.",
      ),
    replaces: id("attachment")
      .optional()
      .describe(
        "The version of the room's file of this name that this one was made from (ADR 0099), from the post's `replaces`. Filled in by Chips; a value the sender writes is replaced.",
      ),
  })
  .describe("A file carried by a message.");
export type Attachment = z.infer<typeof attachment>;

/** An attachment as it reaches a harness: with a URL it can actually fetch. */
export const signedAttachment = attachment
  .extend({
    url: z
      .url()
      .describe(
        "A signed URL, bound to the requesting token: fetch it with that token as the bearer, since the URL alone is refused.",
      ),
    url_expires_at: isoTimestamp.describe("Ten minutes from issue, by default (decision 10)."),
  })
  .describe("An attachment with a short-lived, token-bound URL.");
export type SignedAttachment = z.infer<typeof signedAttachment>;

/** Where a claim came from. External sources are what make an action risky. */
export const source = z
  .object({
    kind: z.enum(["external", "internal"]).describe("Whether the source is outside the workspace."),
    label: z
      .string()
      .min(1)
      .max(200)
      .describe("What to show in the receipt, for example `vendor website`."),
    url: z.url().optional().describe("Where to look, when there is somewhere to look."),
  })
  .describe("A source a harness used, shown in the receipt and on approval cards.");
export type Source = z.infer<typeof source>;

/**
 * Risk classes. These are the flags the policy engine matches on (decision 8), so the list is
 * closed: a new class is a protocol change, not a free-text string a harness invents.
 */
export const riskClass = z
  .enum([
    "external",
    "external_communication",
    "irreversible",
    "destructive",
    "financial",
    "credential",
    "privacy",
    "legal",
  ])
  .describe("A risk class the policy engine can match a rule against.");
export type RiskClass = z.infer<typeof riskClass>;

/**
 * What kind of call a step is (ADR 0162), so a tool whose name Chips has never read still draws
 * as what it does. Closed for the same reason as the risk classes: each is a glyph and a few
 * words in the apps, and a kind nobody draws would be a dot again.
 */
export const stepKind = z
  .enum(["search", "web", "shell", "image", "memory", "edit", "file", "mail", "handoff", "other"])
  .describe(
    "What kind of call the step is: `search` looks something up, `web` reads a page, `shell` runs a command, `image` looks at a picture, `memory` reads or writes what the agent keeps, `edit` changes a file, `file` reads, lists or sends one, `mail` reads or drafts email, `handoff` hands the work to another agent, `other` none of these.",
  );
export type StepKind = z.infer<typeof stepKind>;

/** The action a harness wants to take. `kind` is what policy rules glob against. */
export const action = z
  .object({
    kind: z
      .string()
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
      .max(120)
      .describe(
        "A dotted verb, for example `email.send` or `payment.transfer`. Policy rules glob on it.",
      ),
    input: z.unknown().optional().describe("The arguments, shaped by the tool being called."),
    external: z.boolean().optional().describe("True when the action leaves the workspace."),
    irreversible: z.boolean().optional().describe("True when the action cannot be undone."),
    money_usd: z.number().nonnegative().optional().describe("Amount at stake, in US dollars."),
  })
  .describe("An action a harness proposes to take.");
export type Action = z.infer<typeof action>;

/** What a person is shown before they decide. A diff for a change, prose for a message. */
export const preview = z
  .object({
    format: z
      .enum(["markdown", "plain", "diff", "json", "table"])
      .describe("How to render the body."),
    body: z.string().max(200_000).describe("The rendered preview."),
    title: z.string().max(200).optional().describe("A heading for the card."),
  })
  .describe("What the approver sees before deciding.");
export type Preview = z.infer<typeof preview>;

/**
 * Who may answer an approval. `owner`, `role:<name>` and `lead` are resolved by Chips, so a
 * harness never needs to know who is on shift; once resolved the list holds ids — a person's,
 * or the lead harness's (M5.5).
 */
export const approverRef = z
  .string()
  .regex(
    /^(owner|any|lead|role:[a-z][a-z0-9_]*|usr_[0-9A-HJKMNP-TV-Z]{26}|hrn_[0-9A-HJKMNP-TV-Z]{26})$/,
  )
  .describe(
    "`owner`, `any`, `lead`, `role:<name>`, or a specific person id; a lead harness's id once resolved.",
  );

/** Autonomy levels L0 to L3 (blueprint: trust is a dial, not a switch). */
export const autonomyLevel = z
  .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
  .describe(
    "0 observe, 1 ask first, 2 ask when it matters, 3 autonomous and report back. Presets that expand to rules.",
  );
export type AutonomyLevel = z.infer<typeof autonomyLevel>;

/** One policy rule. Rules read like sentences: `email.send to an external domain -> ask the owner`. */
export const policyRule = z
  .object({
    match: z
      .string()
      .min(1)
      .max(120)
      .describe("A glob over action kinds, for example `payment.*`."),
    when: z
      .object({
        external: z.boolean().optional(),
        irreversible: z.boolean().optional(),
        money_usd_over: z.number().nonnegative().optional(),
        risk: z.array(riskClass).max(8).optional(),
        starts_with: z
          .array(z.string().min(1).max(400))
          .min(1)
          .max(8)
          .optional()
          .describe(
            "For an action that carries a command (ADR 0239): the words a part of it starts with. A command goes ahead on such rules only when every part starts with one that allows it.",
          ),
      })
      .optional()
      .describe("Extra conditions on the action's flags, and for a command, how its parts start."),
    decision: z.enum(["allow", "ask", "deny"]).describe("What to do when the rule matches."),
    approvers: z
      .array(approverRef)
      .max(16)
      .optional()
      .describe("Who may answer, when the decision is `ask`."),
    reason: z
      .string()
      .max(400)
      .optional()
      .describe("Shown to the harness, and recorded in the audit log."),
    off: z
      .boolean()
      .optional()
      .describe(
        "Turned off by a person (ADR 0195): kept in the list to turn back on, and skipped by the policy engine until then.",
      ),
    made_by: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who made it by answering an ask with Always (ADR 0195). Filled in by Chips."),
    made_at: isoTimestamp
      .optional()
      .describe(
        "When a person's answer made it (ADR 0195): Always, or This session. Filled in by Chips. A rule a person's answer made never allows an action that matters.",
      ),
  })
  .describe("A rule the policy engine evaluates.");
export type PolicyRule = z.infer<typeof policyRule>;

export const policy = z
  .object({
    autonomy: autonomyLevel,
    rules: z
      .array(policyRule)
      .max(200)
      .describe("Evaluated in order; the workspace cap always wins."),
  })
  .describe("A harness's autonomy level and the rules that fill in the details.");
export type Policy = z.infer<typeof policy>;

/** Money is always an estimate and always labelled as one (blueprint: cost rolls up the trail). */
export const cost = z
  .object({
    usd: z.number().nonnegative().describe("An estimate, in US dollars."),
    estimated: z.literal(true).describe("Always true. Cost is never presented as exact."),
  })
  .describe("An estimated cost.");
export type Cost = z.infer<typeof cost>;

export const budget = z
  .object({
    limit_usd: z.number().nonnegative().describe("The ceiling for this harness."),
    spent_usd: z.number().nonnegative().describe("Spent so far, estimated."),
  })
  .describe("A harness's budget. Warns at 80 percent, pauses the run at 100.");
export type Budget = z.infer<typeof budget>;

/** How work travelled to get here, so a lane can be traced back to the message that caused it. */
export const trailEntry = z
  .object({
    participant_id: z.string().min(1).describe("Who handled this hop."),
    run_id: id("run").optional().describe("The run this hop belongs to."),
    goal: z.string().max(2000).optional().describe("What was asked at this hop."),
  })
  .describe("One hop in the chain that led to this work.");
export type TrailEntry = z.infer<typeof trailEntry>;

/**
 * A pointer to one visit a harness made to a space: `scout:<session_id>`, and whatever
 * the harness calls it elsewhere. A space outlives its sessions (ADR 0024), so this is what
 * tells one visit's runs from another's, and what lets a person open the harness's own
 * transcript of it.
 */
export const sessionRef = z
  .string()
  .min(1)
  .max(500)
  .describe("The harness's own name for one visit, prefixed by the kind of harness.");

/**
 * A person's standing in the workspace, as distinct from their standing in a room (ADR 0034).
 * An owner does everything; an admin everything but touch an owner or make one; a member the
 * ordinary things; a guest is in one space only and changes nothing about the workspace.
 */
export const workspaceRole = z
  .enum(["owner", "admin", "member", "guest"])
  .describe("Owner, admin, member or guest of the workspace: what a person may do here.");
export type WorkspaceRole = z.infer<typeof workspaceRole>;
