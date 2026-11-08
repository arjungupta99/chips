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
 * A command is drawn one part to a line as Chips reads it (ADR 0280, `CommandPlate`), in place of
 * the command said again as JSON. A yes beyond once on it remembers how each part starts (ADR
 * 0239): under Always those words light up in the command, and an owner or admin picks every space
 * (the default) or this one. A command Chips can't read, or one that uses `rm` and the like, is
 * answered once, and a line says why where the choices would be, naming the file a write goes to.
 * A pass of light goes down the command the first time this window draws the ask, while it is
 * open; a room opened again, or a card already answered, draws it still. Arjun, 7 November 2026, on
 * the Mac, of answered cards lit each time he went back to their room: "not sure why this shimmer
 * keeps".
 *
 * For an hour (ADR 0239, addendum of 6 November 2026) is a yes given once that holds on: for the
 * hour, everything the agent asks in this space goes ahead without a card but what matters (ADR
 * 0281), and a strip draws the hour from now to its end. A command that keeps no Always still
 * takes it. Over the choices, a switch lets the agent work without asking until somebody stops it:
 * on, the choices fold away and Approve says "Approve and let it work". Approve says how far it
 * reaches, and turns to a tick as it is pressed.
 */

import type {
  Approval as ApprovalModel,
  AskStanding,
  Directory,
  HandChoice,
  Lasting,
  Plate,
  Reach,
  WorkspaceRole,
} from "@chipschat/core";
import {
  administers,
  answeredWords,
  approveWords,
  askHeadline,
  askLastings,
  askMatters,
  askStanding,
  commandPlate,
  hourEnds,
  isAgent,
  letWorkWords,
  mayAnswer,
  nameOf,
  offersLetWork,
  ownToolsWords,
  plateHeadline,
  plateTakesPreview,
  reachWords,
  untilStoppedWords,
  WHILE_MINUTES,
  waitsWords,
  whileWords,
} from "@chipschat/core";
import type { Preview, RiskClass } from "@chipschat/protocol";
import {
  ApprovalCard,
  type ApprovalResolution,
  type ApprovalScope,
  Button,
  type LetWorkSwitch,
} from "@chipschat/ui";
import { useEffect, useMemo, useState } from "react";
import { CommandPlate } from "./CommandPlate.tsx";
import { Markdown } from "./Markdown.tsx";
import { clockTime } from "./time.ts";

/** How long Approve shows its tick before the card cools, if the answer has not come back. */
const TICK_MS = 4000;

export interface DecisionInput {
  readonly decision: "approved" | "edited" | "denied";
  /** How far it reaches, as it is sent. */
  readonly scope: "once" | "session" | "always";
  /** An Always kept for every space (ADR 0239). */
  readonly everywhere?: boolean | undefined;
  /** A yes that holds on in the space for this long (ADR 0239 addendum): For an hour. */
  readonly forMinutes?: number | undefined;
  /** A yes that holds on in the space until somebody stops it (ADR 0281): Let it work. */
  readonly untilStopped?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly updatedInput?: unknown;
}

/** A decision as the card's forms make it, before the choice on the card says how far it reaches. */
type Decided = Omit<DecisionInput, "scope" | "everywhere" | "forMinutes" | "untilStopped">;

/**
 * The decision as it is sent: Always as a scope; For an hour and Let it work as a yes given once
 * that holds on, for the hour or until stopped.
 */
function sent(decided: Decided, lasting: Lasting, everywhere: boolean): DecisionInput {
  const yes = decided.decision !== "denied";
  return {
    ...decided,
    scope: lasting === "always" ? "always" : "once",
    ...(lasting === "hour" && yes ? { forMinutes: WHILE_MINUTES } : {}),
    ...(lasting === "work" && yes ? { untilStopped: true } : {}),
    ...(everywhere ? { everywhere } : {}),
  };
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
  /**
   * Whoever it may be handed to (`handChoices`): the people in the space, then the workspace's
   * people who are not (ADR 0042), then the standings that reach somebody else. Empty or absent,
   * the card offers no Hand to….
   */
  readonly handTo?: readonly HandChoice[] | undefined;
  /** The person's standing in the workspace: an owner or admin may hand on anyone's. */
  readonly workspaceRole?: WorkspaceRole | undefined;
  /** False when the server wouldn't keep For an hour or Let it work (ADR 0281): neither is offered. */
  readonly keepsHeldYes?: boolean | undefined;
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
 * place, what a yes does, how long a yes lasts, and the preview. A command's plate takes the
 * preview's place when the preview only says the command again, and the headline loses the
 * command it quotes (ADR 0280); a command is once by its nature, so only a standing lasts is said.
 */
function asked(approval: ApprovalModel, plate: Plate | undefined) {
  const preview =
    approval.preview !== undefined && (plate === undefined || !plateTakesPreview(approval));
  const lasts =
    approval.lasts !== undefined && (plate === undefined || approval.lasts === "standing");
  return {
    title: plate === undefined ? askHeadline(approval) : plateHeadline(approval),
    ...(approval.effect === undefined ? {} : { effect: approval.effect }),
    ...(lasts ? { lasts: approval.lasts } : {}),
    ...(preview ? { preview: previewOf(approval) } : {}),
  };
}

/** The time an ask has, and has left: the countdown and the ring beside it. */
function clockOf(approval: ApprovalModel, now: number) {
  if (approval.expiresAt === undefined) return {};
  const end = new Date(approval.expiresAt).getTime();
  return { remainingMs: end - now, totalMs: end - new Date(approval.askedAt).getTime() };
}

/** Approve pressed: green with its tick until the card cools, or for a moment if it does not. */
function useAnswered() {
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    if (!answered) return;
    const timer = setTimeout(() => setAnswered(false), TICK_MS);
    return () => clearTimeout(timer);
  }, [answered]);
  return [answered, setAnswered] as const;
}

/**
 * The asks whose card this window has drawn, by id. A room's cards are drawn anew each time the
 * room is opened, so what has been seen is kept here rather than in the card, as a picture's shape
 * is (`Markdown.tsx`).
 */
const seen = new Set<string>();

/**
 * Whether a pass of light goes down the ask's command: when its card is drawn for the first time,
 * as it was when this card was drawn, and only while it is open, since an answered ask puts
 * nothing to anybody.
 */
function useSweep(approval: ApprovalModel): boolean {
  const id = approval.approvalId;
  const [first] = useState(() => !seen.has(id));
  useEffect(() => {
    seen.add(id);
  }, [id]);
  return first && approval.resolved === undefined;
}

export function Decide(props: DecideProps) {
  const { approval, busy } = props;
  const [scope, setScope] = useState<ApprovalScope>("once");
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState(approval.preview ?? "");
  const [reason, setReason] = useState("");
  const [answered, setAnswered] = useAnswered();
  const plate = useMemo(() => commandPlate(approval), [approval]);
  const resolution = resolutionOf(approval, props.directory);
  const sweep = useSweep(approval);
  // Somebody else's to answer: the card says whose, and the server would refuse this person.
  const waitingOn = mayAnswer(approval, props.selfId)
    ? undefined
    : approval.approvers.map((id) => nameOf(props.directory, id)).join(" or ");

  const { everywhere, choices, offer, lasting } = useStanding(props, plate, scope, setScope);
  const decide = (input: Decided) => {
    setMode("idle");
    if (input.decision === "approved") setAnswered(true);
    props.onDecide(approval, sent(input, lasting, everywhere));
  };
  const reach: Reach = everywhere ? "everywhere" : "space";

  return (
    <div className="decide" data-testid="decide" data-approval={approval.approvalId}>
      <ApprovalCard
        harnessName={props.harnessName}
        subtitle={`${props.harnessName} asks`}
        {...asked(approval, plate)}
        {...(plate === undefined
          ? {}
          : {
              body: (
                <CommandPlate
                  plate={plate}
                  lit={scope === "always" && offer.kind === "starts"}
                  sweep={sweep}
                />
              ),
            })}
        renderMarkdown={(body) => <Markdown text={body} directory={props.directory} />}
        risk={approval.risk as RiskClass[]}
        sources={approval.sources as { kind: "external" | "internal"; label: string }[]}
        editable={approval.editable}
        fallback={approval.fallback}
        {...clockOf(approval, props.now)}
        {...(resolution === undefined ? {} : { resolution })}
        {...(waitingOn === undefined ? {} : { waitingOn })}
        scope={scope}
        {...choices}
        approveLabel={approveWords(lasting)}
        approvedLabel={answeredWords(lasting, props.now, reach, props.spaceName ?? "this space")}
        answered={answered}
        busy={busy}
        onApprove={() => decide({ decision: "approved" })}
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
            decide({ decision: "denied", ...(why === "" ? {} : { reason: why }) });
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
 * A yes beyond once (ADRs 0195, 0239, 0281): none for an ask that matters, whose card has no scope
 * to pick and says why in its place; Once and For an hour for a command that keeps no Always, with
 * why under Once; whether an Always is kept for every space, which an owner or admin picks and is
 * picked for them; the switch that lets the agent work without asking; and what the card shows
 * under its choices: For an hour's line, Always's, or the switch's.
 */
function useStanding(
  props: DecideProps,
  plate: Plate | undefined,
  scope: ApprovalScope,
  onScopeChange: (scope: ApprovalScope) => void,
) {
  const offer = askStanding(props.approval);
  const [where, setWhere] = useState<"everywhere" | "space">("everywhere");
  const [working, setWorking] = useState(false);
  const mayEverywhere = administers(props.workspaceRole);
  const everywhere = scope === "always" && mayEverywhere && where === "everywhere";
  const mine = mayAnswer(props.approval, props.selfId);
  const keeps = props.keepsHeldYes !== false;
  const letWork = mine && offersLetWork(offer, keeps) ? working : undefined;
  const lasting = lastingOf(scope, letWork, keeps);
  const scopes = askLastings(offer, keeps).filter((each): each is ApprovalScope => each !== "work");
  const standing = underTheChoices(props, offer, lasting, {
    reach: everywhere ? "everywhere" : "space",
    where: mayEverywhere ? where : undefined,
    onWhere: setWhere,
  });
  const choices = {
    ...whyOnce(offer, plate),
    ...(scopes.length === 0 ? {} : { onScopeChange, scopes }),
    ...(standing === undefined ? {} : { standing }),
    ...(letWork === undefined ? {} : { letWork: letWorkSwitch(props, letWork, setWorking) }),
  };
  return { everywhere, offer, lasting, choices: mine ? choices : {} };
}

/** How far the yes reaches now: the switch over the choice, and no hour where it wouldn't be kept. */
function lastingOf(scope: ApprovalScope, letWork: boolean | undefined, keeps: boolean): Lasting {
  if (letWork === true) return "work";
  return keeps || scope !== "hour" ? scope : "once";
}

/** Why there is no Always, red-dotted when the plate marks the words: a write, or `rm` and the like. */
function whyOnce(offer: AskStanding, plate: Plate | undefined) {
  if (offer.kind !== "once") return {};
  const marked = plate?.parts.some((part) =>
    part.bits.some((bit) => bit.kind === "writes" || bit.kind === "never"),
  );
  return { onceWhy: offer.why, ...(marked === true ? { onceMarked: true } : {}) };
}

/** The switch over the choices (ADR 0281), in the card's words. */
function letWorkSwitch(
  props: DecideProps,
  on: boolean,
  onChange: (on: boolean) => void,
): LetWorkSwitch {
  return { on, onChange, ...letWorkWords(props.harnessName, props.spaceName ?? "this space") };
}

/**
 * What the card shows under the choice picked: For an hour's strip, Always's, what the switch lets
 * through, or nothing for Once.
 */
function underTheChoices(
  props: DecideProps,
  offer: AskStanding,
  lasting: Lasting,
  always: {
    readonly reach: Reach;
    readonly where: "everywhere" | "space" | undefined;
    readonly onWhere: (where: "everywhere" | "space") => void;
  },
) {
  if (lasting === "once") return undefined;
  if (lasting === "work") {
    return (
      <p className="decide-reach" data-testid="until-stopped">
        {untilStoppedWords(props.harnessName)}
      </p>
    );
  }
  if (lasting === "hour") {
    const ends = hourEnds(props.now);
    return (
      <div className="decide-standing" data-testid="for-an-hour">
        <div className="decide-strip" data-testid="hour-strip">
          <div className="decide-strip-bar">
            <i />
          </div>
          <div className="decide-strip-ends">
            <span>{ends.from}</span>
            <b>{ends.until}</b>
          </div>
        </div>
        <p className="decide-reach" data-testid="for-a-while">
          {whileWords(props.harnessName)}
        </p>
      </div>
    );
  }
  return <Standing standing={offer} spaceName={props.spaceName ?? "this space"} {...always} />;
}

/**
 * Under Always (ADR 0239): for an owner or admin, every space or this one; and a line saying what
 * goes ahead without a card, where, and that anything else still comes to a person. A command's
 * starts are lit in the command itself (ADR 0280), so no list of them is drawn here.
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
  const ownTools = ownToolsWords(approval, directory, props.harnessId);
  // Why it takes no yes beyond once is said on the card, where the choices would be.
  return (
    <>
      {askMatters(approval) && open && (
        <p className="decide-note decide-waits" data-testid="waits-for-you">
          <span>{waitsWords(mayAnswer(approval, props.selfId))}</span>
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
  const choices = props.handTo ?? [];
  if (onRoute === undefined || choices.length === 0) return null;
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
      choices={choices}
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
 * workspace (ADR 0042), and the standings that reach somebody else (`handChoices`).
 */
function HandOn(props: {
  readonly choices: readonly HandChoice[];
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onRoute: (to: readonly string[], reason?: string) => void;
}) {
  const [to, setTo] = useState(props.choices[0]?.value ?? "");
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
          {props.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.elsewhere === true ? `${choice.label} · not in this space` : choice.label}
            </option>
          ))}
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
