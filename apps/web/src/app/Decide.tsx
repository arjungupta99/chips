/**
 * The approval card, with the decision behind it: Approve with a scope, Edit the input first,
 * or Deny with a reason (technical-plan M1.4). The card itself is the design system's; what
 * this adds is the small form under it that an edit or a denial opens, and the words a decided
 * card says — who, when, whether it was decided on another device, what policy did on expiry.
 *
 * An ask that matters (ADR 0195) says "Waits for you" while it is open and offers no scope: it is
 * answered once, and a line says why. One the harness settled itself, as its own window answered
 * it, says so under the card: "Answered by Kit in its own tools."
 *
 * A yes beyond once on a command remembers how each part of it starts (ADR 0239): the card shows
 * the starts under Remembers, and under Always an owner or admin picks every space (the default)
 * or this one. A command Chips can't read, or one that uses `rm` and the like, is answered once,
 * and a line says why.
 */

import type {
  Approval as ApprovalModel,
  AskStanding,
  Directory,
  PersonModel,
  Reach,
  WorkspaceRole,
} from "@chipschat/core";
import {
  administers,
  askHeadline,
  askMatters,
  askStanding,
  isAgent,
  mayAnswer,
  nameOf,
  ONCE_ONLY_WORDS,
  ownToolsWords,
  reachWords,
  waitsWords,
} from "@chipschat/core";
import type { Preview, RiskClass } from "@chipschat/protocol";
import { ApprovalCard, type ApprovalResolution, type ApprovalScope, Button } from "@chipschat/ui";
import { useState } from "react";
import { Markdown } from "./Markdown.tsx";
import { clockTime } from "./time.ts";

export interface DecisionInput {
  readonly decision: "approved" | "edited" | "denied";
  readonly scope: ApprovalScope;
  /** An Always kept for every space (ADR 0239). */
  readonly everywhere?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly updatedInput?: unknown;
}

export interface DecideProps {
  readonly approval: ApprovalModel;
  readonly harnessName: string;
  readonly directory: Directory;
  /** The person looking: the buttons are theirs only when policy named them (M3.3). */
  readonly selfId: string;
  readonly busy: boolean;
  /** The clock, for the countdown. */
  readonly now: number;
  readonly onDecide: (approval: ApprovalModel, input: DecisionInput) => void;
  /**
   * Hand the ask to somebody else (M5.5): a teammate in the room, a role, or the lane's lead.
   * Offered to whoever may answer it or runs the workspace; absent, the card offers nothing.
   */
  readonly onRoute?:
    | ((approval: ApprovalModel, to: readonly string[], reason?: string) => void)
    | undefined;
  /** The room's members, for the people it may be handed to. */
  readonly members?: readonly string[] | undefined;
  /**
   * Everyone in the workspace (ADR 0034), so an ask may be handed to somebody who is not in
   * this room: being named is standing enough since ADR 0042. Guests are left out — a guest is
   * in one room and answers there.
   */
  readonly people?: Readonly<Record<string, PersonModel>> | undefined;
  /** The person's standing in the workspace: an owner or admin may hand on anyone's. */
  readonly workspaceRole?: WorkspaceRole | undefined;
  /** The harness that asked, so its own settlement is told from a lead's (ADR 0195). */
  readonly harnessId?: string | undefined;
  /** The space's name, for an Always kept to it: "go ahead without a card in Bakery". */
  readonly spaceName?: string | undefined;
}

type Mode = "idle" | "editing" | "denying";

/** What a decided card says, from what the log holds. */
export function resolutionOf(
  approval: ApprovalModel,
  directory: Directory,
): ApprovalResolution | undefined {
  const resolved = approval.resolved;
  if (resolved === undefined) return undefined;
  const decision = resolved.decision as ApprovalResolution["decision"];
  // On expiry the card names the fallback that applied; otherwise who decided — policy, when
  // Chips did.
  const by =
    decision === "expired"
      ? approval.fallback
      : resolved.by === "system"
        ? "policy"
        : nameOf(directory, resolved.by);
  // Every decision this device did not send arrives as made elsewhere, but only a person's was
  // made on a device: policy and a harness settling its own ask (ADR 0079) are named, and that
  // says where.
  const onAnotherDevice = resolved.elsewhere && directory[resolved.by]?.kind === "person";
  return {
    decision,
    by,
    at: clockTime(resolved.at),
    ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
    ...(onAnotherDevice ? { resolvedElsewhere: true } : {}),
    ...(approval.executed === undefined
      ? {}
      : { executed: approval.executed as "executed" | "failed" | "skipped" }),
  };
}

/**
 * The preview as the harness sent it, so the card draws it by its format: Markdown as the room
 * draws a message, and a diff, JSON or a table in mono. A body with no format is its words. Its
 * title goes with it only when the question has taken the card's headline from it (ADR 0142);
 * otherwise the title is the headline already.
 */
function previewOf(approval: ApprovalModel): Preview {
  const titled = approval.question !== undefined && approval.previewTitle !== undefined;
  return {
    format: approval.previewFormat ?? "plain",
    body: approval.preview ?? "",
    ...(titled ? { title: approval.previewTitle } : {}),
  };
}

/**
 * What the harness said about its ask, for the card (ADR 0142): the question or what heads in its
 * place, what a yes does, how long a yes lasts, and the preview.
 */
function asked(approval: ApprovalModel) {
  return {
    title: askHeadline(approval),
    ...(approval.effect === undefined ? {} : { effect: approval.effect }),
    ...(approval.lasts === undefined ? {} : { lasts: approval.lasts }),
    ...(approval.preview === undefined ? {} : { preview: previewOf(approval) }),
  };
}

export function Decide(props: DecideProps) {
  const { approval, busy } = props;
  const [scope, setScope] = useState<ApprovalScope>("once");
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState(approval.preview ?? "");
  const [reason, setReason] = useState("");
  const resolution = resolutionOf(approval, props.directory);
  // Somebody else's to answer: the card says whose, and the server would refuse this person.
  const waitingOn = mayAnswer(approval, props.selfId)
    ? undefined
    : approval.approvers.map((id) => nameOf(props.directory, id)).join(" or ");
  const remaining =
    approval.expiresAt === undefined
      ? undefined
      : new Date(approval.expiresAt).getTime() - props.now;

  const { once, everywhere, standing } = useStanding(props, scope);
  const decide = (input: DecisionInput) => {
    setMode("idle");
    props.onDecide(approval, everywhere ? { ...input, everywhere } : input);
  };

  return (
    <div className="decide" data-testid="decide" data-approval={approval.approvalId}>
      <ApprovalCard
        harnessName={props.harnessName}
        subtitle={`${props.harnessName} asks`}
        {...asked(approval)}
        renderMarkdown={(body) => <Markdown text={body} directory={props.directory} />}
        risk={approval.risk as RiskClass[]}
        sources={approval.sources as { kind: "external" | "internal"; label: string }[]}
        editable={approval.editable}
        fallback={approval.fallback}
        {...(remaining === undefined ? {} : { remainingMs: remaining })}
        {...(resolution === undefined ? {} : { resolution })}
        {...(waitingOn === undefined ? {} : { waitingOn })}
        scope={scope}
        {...(once ? {} : { onScopeChange: setScope })}
        {...(standing === undefined ? {} : { standing })}
        busy={busy}
        onApprove={() => decide({ decision: "approved", scope })}
        onEdit={() => setMode(mode === "editing" ? "idle" : "editing")}
        onDeny={() => setMode(mode === "denying" ? "idle" : "denying")}
      />
      <Notices
        approval={approval}
        directory={props.directory}
        selfId={props.selfId}
        harnessId={props.harnessId}
      />
      {resolution === undefined && <HandOnControl {...props} />}
      {resolution === undefined && mode === "editing" && (
        <form
          className="decide-form"
          data-testid="edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            decide({
              decision: "edited",
              scope,
              updatedInput: { ...(approval.input as object | undefined), body: draft },
            });
          }}
        >
          <label>
            <span>What should go instead</span>
            <textarea
              aria-label="Edited input"
              rows={4}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="decide-buttons">
            <Button onClick={() => setMode("idle")} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || draft.trim() === ""}>
              Approve with edits
            </Button>
          </div>
        </form>
      )}
      {resolution === undefined && mode === "denying" && (
        <form
          className="decide-form"
          data-testid="deny-form"
          onSubmit={(event) => {
            event.preventDefault();
            const why = reason.trim();
            decide({ decision: "denied", scope, ...(why === "" ? {} : { reason: why }) });
          }}
        >
          <label>
            <span>Why not? The harness gets to read this.</span>
            <input
              aria-label="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="decide-buttons">
            <Button onClick={() => setMode("idle")} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              Deny
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * A yes beyond once (ADRs 0195, 0239): none for an ask that matters or a command that can't be
 * remembered, whose card has no scope to pick and whose door refuses one; whether an Always is
 * kept for every space, which an owner or admin picks and is picked for them; and what the card
 * shows under its choices.
 */
function useStanding(props: DecideProps, scope: ApprovalScope) {
  const offer = askStanding(props.approval);
  const once = offer.kind === "once";
  const [where, setWhere] = useState<"everywhere" | "space">("everywhere");
  const mayEverywhere = administers(props.workspaceRole);
  const everywhere = scope === "always" && mayEverywhere && where === "everywhere";
  const reach: Reach = scope === "session" ? "session" : everywhere ? "everywhere" : "space";
  const standing =
    once || scope === "once" ? undefined : (
      <Standing
        standing={offer}
        reach={reach}
        spaceName={props.spaceName ?? "this space"}
        where={scope === "always" && mayEverywhere ? where : undefined}
        onWhere={setWhere}
      />
    );
  return { once, everywhere, standing };
}

/**
 * Under the choices, for a yes beyond once (ADR 0239): a command's starts under Remembers, in
 * code; under Always, for an owner or admin, every space or this one; and a line saying what goes
 * ahead without a card, where, and that anything else still comes to a person.
 */
function Standing(props: {
  readonly standing: AskStanding;
  readonly reach: Reach;
  readonly spaceName: string;
  /** Where an Always is kept, when this person may pick; absent, it is this space. */
  readonly where: "everywhere" | "space" | undefined;
  readonly onWhere: (where: "everywhere" | "space") => void;
}) {
  const { standing, where } = props;
  const commands = standing.kind === "starts";
  return (
    <div className="decide-standing" data-testid="standing">
      {commands && (
        <p className="decide-remembers" data-testid="remembers">
          <span>Remembers</span>
          {standing.starts.map((start) => (
            <code key={start}>{start}</code>
          ))}
        </p>
      )}
      {where !== undefined && (
        <fieldset className="ui-approval__scope decide-where">
          <legend className="ui-visually-hidden">Where this Always holds</legend>
          {(
            [
              ["everywhere", "In every space"],
              ["space", "In this space"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="ui-approval__scope-option"
              data-on={value === where ? "true" : undefined}
            >
              <input
                type="radio"
                name="decide-where"
                value={value}
                checked={value === where}
                onChange={() => props.onWhere(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <p className="decide-reach" data-testid="reach">
        {reachWords(props.reach, props.spaceName, commands)}
      </p>
    </div>
  );
}

/**
 * What the card says beyond the ask (M5.5): that it was handed on, by whom and why; and that
 * policy let the lane's lead answer it, when the names include a harness.
 */
function Notices(props: {
  readonly approval: ApprovalModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly harnessId: string | undefined;
}) {
  const { approval, directory } = props;
  // The lane's lead: an agent (ADR 0087), or a harness before agents.
  const lead = approval.approvers.find((id) => isAgent(directory, id));
  const open = approval.resolved === undefined;
  // Why a command takes no yes beyond once (ADR 0239).
  const standing = askStanding(approval);
  const once = standing.kind === "once" ? standing.why : undefined;
  const ownTools = ownToolsWords(approval, directory, props.harnessId);
  return (
    <>
      {askMatters(approval) && open && (
        <p className="decide-note decide-waits" data-testid="waits-for-you">
          <span>{waitsWords(mayAnswer(approval, props.selfId))}</span>
          {mayAnswer(approval, props.selfId) && (
            <span data-testid="once-only">{ONCE_ONLY_WORDS}</span>
          )}
        </p>
      )}
      {!askMatters(approval) && open && once !== undefined && mayAnswer(approval, props.selfId) && (
        <p className="decide-note" data-testid="once-only">
          {once}
        </p>
      )}
      {ownTools !== undefined && (
        <p className="decide-note" data-testid="own-tools">
          {ownTools}
        </p>
      )}
      {approval.routedBy !== undefined && (
        <p className="decide-note" data-testid="routed">
          Handed to {approval.approvers.map((id) => nameOf(directory, id)).join(", ") || "anyone"}{" "}
          by {nameOf(directory, approval.routedBy)}
          {approval.routedReason === undefined ? "" : ` · ${approval.routedReason}`}
        </p>
      )}
      {lead !== undefined && approval.resolved === undefined && (
        <p className="decide-note" data-testid="lead-notice">
          Policy let {nameOf(directory, lead)}, the lead, answer this.
        </p>
      )}
    </>
  );
}

/**
 * Hand to…, for whoever may answer the ask or runs the workspace (rule 14), and the form it
 * opens. Absent an `onRoute`, the card offers nothing.
 */
function HandOnControl(props: DecideProps) {
  const [routing, setRouting] = useState(false);
  const { approval, onRoute } = props;
  if (onRoute === undefined) return null;
  if (!mayAnswer(approval, props.selfId) && !administers(props.workspaceRole)) return null;
  if (!routing) {
    return (
      <div className="decide-route">
        <Button size="sm" disabled={props.busy} onClick={() => setRouting(true)}>
          Hand to…
        </Button>
      </div>
    );
  }
  return (
    <HandOn
      approval={approval}
      directory={props.directory}
      selfId={props.selfId}
      members={props.members ?? []}
      people={props.people ?? {}}
      busy={props.busy}
      onCancel={() => setRouting(false)}
      onRoute={(to, reason) => {
        setRouting(false);
        onRoute(approval, to, reason);
      }}
    />
  );
}

/**
 * The refs a person may hand an ask to: a teammate in the room, somebody elsewhere in the
 * workspace (ADR 0042), a role, anyone, the lead.
 */
function HandOn(props: {
  readonly approval: ApprovalModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly members: readonly string[];
  readonly people: Readonly<Record<string, PersonModel>>;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onRoute: (to: readonly string[], reason?: string) => void;
}) {
  const people = props.members.filter(
    (id) => id !== props.selfId && props.directory[id]?.kind === "person",
  );
  // Whoever is in the workspace but not in this room: a guest is in one room and stays there.
  const elsewhere = Object.values(props.people)
    .filter(
      (person) =>
        person.role !== "guest" &&
        person.participantId !== props.selfId &&
        !people.includes(person.participantId),
    )
    .map((person) => person.participantId);
  const [to, setTo] = useState(people[0] ?? elsewhere[0] ?? "role:admin");
  const [reason, setReason] = useState("");
  return (
    <form
      className="decide-form"
      data-testid="route-form"
      onSubmit={(event) => {
        event.preventDefault();
        const why = reason.trim();
        props.onRoute([to], why === "" ? undefined : why);
      }}
    >
      <label>
        <span>Hand this to</span>
        <select aria-label="Hand to" value={to} onChange={(event) => setTo(event.target.value)}>
          {people.map((id) => (
            <option key={id} value={id}>
              {nameOf(props.directory, id)}
            </option>
          ))}
          {elsewhere.map((id) => (
            <option key={id} value={id}>
              {props.people[id]?.displayName ?? nameOf(props.directory, id)} · not in this space
            </option>
          ))}
          <option value="role:admin">The admins</option>
          <option value="role:owner">The owners</option>
          <option value="any">Anyone in the space</option>
          <option value="lead">The lane's lead</option>
        </select>
      </label>
      <label>
        <span>Why, in a line (optional)</span>
        <input
          aria-label="Why hand it on"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={props.busy}
        />
      </label>
      <div className="decide-buttons">
        <Button onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={props.busy}>
          Hand on
        </Button>
      </div>
    </form>
  );
}
