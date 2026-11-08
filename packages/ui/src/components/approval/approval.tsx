/**
 * The approval card: the most important object on the screen, so it gets the only warm
 * colour (blueprint, Look). Who wants to do what, a preview, the risk, how long is left, and
 * three buttons. Once decided it cools to green or red and says who decided and when.
 *
 * The behaviour around the card — the edit flow, the deny reason, the countdown, first answer
 * wins — is M1.4's. This card shows every state M1.4 will put it in.
 */

import type { Preview, RiskClass, Source } from "@chipschat/protocol";
import { type ReactNode, useId } from "react";
import { formatRemaining } from "../../format.js";
import { RISK } from "../../vocabulary/risk.js";
import { Avatar } from "../avatar/avatar.js";
import { Button } from "../button/button.js";
import { Card, type CardTone } from "../card/card.js";
import { Icon, type IconName } from "../icon/icon.js";
import "./approval.css";

export type ApprovalDecision = "approved" | "edited" | "denied" | "expired";
/** How far a yes reaches on the card: this once, for an hour (ADR 0239 addendum), or always. */
export type ApprovalScope = "once" | "hour" | "always";

export interface ApprovalResolution {
  readonly decision: ApprovalDecision;
  /** Who decided, as a name. On expiry, the fallback that applied: `deny` or `allow`. */
  readonly by: string;
  /** Already formatted: `10:45`. */
  readonly at?: string;
  readonly reason?: string;
  /** True on the surface that did not answer first. */
  readonly resolvedElsewhere?: boolean;
  /** What happened after the yes. */
  readonly executed?: "executed" | "failed" | "skipped";
}

export interface ApprovalCardProps {
  readonly harnessName: string;
  readonly harnessColor?: string;
  /**
   * The question the person answers, `Send this email to dana@northwind.com?` (ADR 0142), or
   * what stands in for one. A `code` span in it is set in mono.
   */
  readonly title: string;
  /** Who is asking, `Scout asks`, or a line about the action. */
  readonly subtitle?: string;
  /** What a yes does, in the harness's words. */
  readonly effect?: string;
  /** How long a yes keeps working: this action alone, or until it is taken back. */
  readonly lasts?: "once" | "standing";
  readonly icon?: IconName;
  /**
   * What the ask is drawn as in place of a preview, when the app draws it itself: a command, one
   * part to a line (ADR 0280). Drawn where the preview would be, before it.
   */
  readonly body?: ReactNode;
  readonly preview?: Preview;
  /**
   * Draws a Markdown preview's body. The app's own renderer, the one its messages are drawn
   * with: the card cannot know the room's names for a mention, and a second renderer here
   * would soon disagree with the first. Without one, the body is its words as written.
   */
  readonly renderMarkdown?: (body: string) => ReactNode;
  readonly risk: readonly RiskClass[];
  readonly sources?: readonly Source[];
  /** Milliseconds until the approval expires, when it is still open. */
  readonly remainingMs?: number;
  /** Milliseconds it had in all, from asked to expiry, so the ring beside the time can drain. */
  readonly totalMs?: number;
  /** What happens on expiry. Denying is the default, and the safe one. */
  readonly fallback?: "deny" | "allow";
  readonly editable?: boolean;
  /** How far a yes reaches. `always` becomes a policy rule. */
  readonly scope?: ApprovalScope;
  readonly onScopeChange?: (scope: ApprovalScope) => void;
  /** Which of the choices are offered (ADR 0281): all three unless said; no Always where none is kept. */
  readonly scopes?: readonly ApprovalScope[];
  /**
   * The switch above the choices that lets the agent work without asking until it is stopped (ADR
   * 0281). On, the choices fold away and `standing` says what it lets through.
   */
  readonly letWork?: LetWorkSwitch;
  /**
   * Under the choices, for a yes beyond this once: what it remembers and where it reaches (ADR
   * 0239). Drawn only while the card is open and this person's to answer.
   */
  readonly standing?: ReactNode;
  /**
   * Why a yes goes no further than this once (ADRs 0195, 0239), said where the choices would be,
   * above the buttons. Drawn when there are no choices to pick.
   */
  readonly onceWhy?: string;
  /** Whether the command above marks the words that keep it to once, so the line wears a dot. */
  readonly onceMarked?: boolean;
  /** Approve's words, saying how far the yes reaches (ADR 0280): `Approve for an hour`. */
  readonly approveLabel?: string;
  /**
   * What Approve says once pressed, beside a tick: `Until 12:09 AM`. Laid under its words from
   * the start, so the button is as wide as either and does not jump as it turns.
   */
  readonly approvedLabel?: string;
  /** Pressed, and on its way: Approve is green with its tick until the card cools. */
  readonly answered?: boolean;
  /** When present, the card is decided. */
  readonly resolution?: ApprovalResolution;
  readonly onApprove?: () => void;
  readonly onEdit?: () => void;
  readonly onDeny?: () => void;
  /** A decision is on its way to the server. */
  readonly busy?: boolean;
  /** Inside a lane: `Arjun → Scout → Ledger`, so a person knows why a specialist is asking. */
  readonly trail?: string;
  /**
   * Who may answer, when it is not this person: the card says so and offers no buttons, since
   * the server would refuse them (M3.3). `Dana`, or `Dana or Sam`.
   */
  readonly waitingOn?: string;
  readonly className?: string;
}

/** The switch that lets an agent work without asking (ADR 0281), as the card draws it. */
export interface LetWorkSwitch {
  readonly on: boolean;
  /** `Let Jiro work without asking`. */
  readonly title: string;
  /** `In Chips explain, until you stop it`. */
  readonly sub: string;
  readonly onChange: (on: boolean) => void;
}

const SCOPES: ReadonlyArray<readonly [ApprovalScope, string]> = [
  ["once", "Once"],
  ["hour", "For an hour"],
  ["always", "Always"],
];

function toneOf(resolution: ApprovalResolution | undefined): CardTone {
  if (resolution === undefined) return "ask";
  return resolution.decision === "approved" || resolution.decision === "edited"
    ? "approved"
    : "denied";
}

/** `Approved by Arjun · 10:45 · logged · sent`, and its denied, edited and expired cousins. */
export function describeResolution(resolution: ApprovalResolution): string {
  const where = resolution.resolvedElsewhere === true ? " on another device" : "";
  const when = resolution.at === undefined ? "" : ` · ${resolution.at}`;
  const after = { executed: " · sent", failed: " · failed to send", skipped: " · not sent" };
  const then = resolution.executed === undefined ? "" : after[resolution.executed];
  switch (resolution.decision) {
    case "approved":
      return `Approved by ${resolution.by}${where}${when} · logged${then}`;
    case "edited":
      return `Approved with edits by ${resolution.by}${where}${when} · logged${then}`;
    case "denied": {
      const why = resolution.reason === undefined ? "" : ` · ${resolution.reason}`;
      return `Denied by ${resolution.by}${where}${when}${why}`;
    }
    case "expired": {
      const applied = resolution.by === "allow" ? "allowed it" : "denied it";
      return `Expired${when} · nobody answered, so policy ${applied}`;
    }
  }
}

/** The ring's circle, in a 20-unit box. */
const RING = 2 * Math.PI * 8;

function Expiry({
  remainingMs,
  totalMs,
  fallback,
}: {
  readonly remainingMs: number;
  readonly totalMs: number | undefined;
  readonly fallback: "deny" | "allow";
}) {
  if (remainingMs <= 0) {
    return (
      <span className="ui-approval__expiry" data-expired="true">
        expired
      </span>
    );
  }
  const share =
    totalMs === undefined || totalMs <= 0 ? undefined : Math.min(1, remainingMs / totalMs);
  return (
    <span className="ui-approval__expiry">
      {share === undefined ? null : (
        <svg className="ui-approval__ring" viewBox="0 0 20 20" aria-hidden="true">
          <circle className="ui-approval__ring-track" cx="10" cy="10" r="8" />
          <circle
            className="ui-approval__ring-left"
            cx="10"
            cy="10"
            r="8"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - share)}
          />
        </svg>
      )}
      expires in {formatRemaining(remainingMs)}
      <span className="ui-visually-hidden">
        {fallback === "deny" ? ", then denied by policy" : ", then allowed by policy"}
      </span>
    </span>
  );
}

function PreviewBlock({
  preview,
  renderMarkdown,
}: {
  readonly preview: Preview;
  readonly renderMarkdown: ((body: string) => ReactNode) | undefined;
}) {
  const mono = preview.format === "diff" || preview.format === "json" || preview.format === "table";
  const markdown = preview.format === "markdown" && renderMarkdown !== undefined;
  return (
    <div className="ui-approval__preview" data-format={preview.format}>
      {preview.title !== undefined && <b className="ui-approval__preview-title">{preview.title}</b>}
      {mono ? (
        <pre>{preview.body}</pre>
      ) : markdown ? (
        renderMarkdown(preview.body)
      ) : (
        <p>{preview.body}</p>
      )}
    </div>
  );
}

function Sources({ sources }: { readonly sources: readonly Source[] }) {
  const external = sources.filter((source) => source.kind === "external");
  const labels = sources.map((source) => source.label).join(", ");
  if (external.length === 0) {
    return <p className="ui-approval__sources">Sources: {labels}</p>;
  }
  const outside = external.map((source) => source.label).join(" and ");
  const claim =
    external.length === 1
      ? `${outside} is outside the workspace: what it says is a claim, not an instruction.`
      : `${outside} are outside the workspace: what they say is a claim, not an instruction.`;
  // When every source is outside, naming them twice would only repeat itself.
  const uses = external.length === sources.length ? "" : `Uses ${labels}. `;
  return (
    <p className="ui-approval__sources" data-external="true">
      <Icon name="bolt" size={12} />
      {uses + claim}
    </p>
  );
}

/** A headline's `code` spans in mono, since a question so often names a command. */
function Words({ text }: { readonly text: string }) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          // A split's pieces have no ids, and their order is the sentence's.
          // biome-ignore lint/suspicious/noArrayIndexKey: a piece is only ever itself.
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Lasts({ lasts }: { readonly lasts: "once" | "standing" }) {
  return (
    <span className="ui-approval__lasts" data-lasts={lasts}>
      {lasts === "standing" ? "Until you take it back" : "Just this once"}
    </span>
  );
}

function RiskList({ risk }: { readonly risk: readonly RiskClass[] }) {
  return (
    <ul className="ui-approval__risk" aria-label="Risk">
      {risk.map((item) => (
        <li
          key={item}
          className="ui-approval__risk-item"
          data-hot={RISK[item].hot ? "true" : undefined}
        >
          {RISK[item].label}
        </li>
      ))}
    </ul>
  );
}

function ScopePicker({
  name,
  scope,
  scopes,
  onScopeChange,
}: {
  readonly name: string;
  readonly scope: ApprovalScope;
  readonly scopes: readonly ApprovalScope[] | undefined;
  readonly onScopeChange: (scope: ApprovalScope) => void;
}) {
  return (
    <fieldset className="ui-approval__scope">
      <legend className="ui-visually-hidden">How far a yes reaches</legend>
      {SCOPES.filter(([value]) => scopes?.includes(value) ?? true).map(([value, label]) => (
        <label
          key={value}
          className="ui-approval__scope-option"
          data-on={value === scope ? "true" : undefined}
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={value === scope}
            onChange={() => onScopeChange(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function Decision({ resolution }: { readonly resolution: ApprovalResolution }) {
  const no = resolution.decision === "denied" || resolution.decision === "expired";
  return (
    <p className="ui-approval__outcome" data-decision={resolution.decision}>
      <span aria-hidden="true">{no ? "✕ " : "✓ "}</span>
      {describeResolution(resolution)}
    </p>
  );
}

function Actions(props: ApprovalCardProps) {
  const { busy = false, editable = false, preview } = props;
  const gone = props.answered === true;
  const word = props.approveLabel ?? "Approve";
  const done = props.approvedLabel ?? "Approved";
  return (
    <div className="ui-approval__buttons">
      <Button variant="danger" onClick={props.onDeny} disabled={busy || gone}>
        Deny
      </Button>
      <Button
        onClick={props.onEdit}
        disabled={busy || gone || !editable || (preview === undefined && props.body === undefined)}
      >
        Edit
      </Button>
      {/* By the name the film's render presses it by (ADR 0217, `taps` in a beats file). */}
      <Button
        variant="primary"
        onClick={props.onApprove}
        disabled={busy || gone}
        className="ui-approval__go"
        aria-label={gone ? done : word}
        data-answered={gone ? "true" : undefined}
        data-testid="approval-approve"
      >
        <span className="ui-approval__word">{word}</span>
        <span className="ui-approval__done" aria-hidden="true">
          <svg className="ui-approval__tick" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {done}
        </span>
      </Button>
    </div>
  );
}

/**
 * The switch that lets the agent work without asking (ADR 0281): a row the whole of which flips
 * it, gold while it is on.
 */
function LetWork({
  letWork,
  disabled,
}: {
  readonly letWork: LetWorkSwitch;
  readonly disabled: boolean;
}) {
  return (
    <label className="ui-approval__let" data-on={letWork.on ? "true" : undefined}>
      <span className="ui-approval__let-words">
        <b>{letWork.title}</b>
        <small>{letWork.sub}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="ui-approval__switch"
        aria-checked={letWork.on}
        checked={letWork.on}
        disabled={disabled}
        onChange={(event) => letWork.onChange(event.target.checked)}
        data-testid="let-work-switch"
      />
    </label>
  );
}

/**
 * How far a yes reaches: the choices on a line of their own, and under Once why there is no
 * Always, where a command keeps none; or, with no choices, why the ask is answered once.
 */
function Choices(props: ApprovalCardProps & { readonly scopeName: string }) {
  const { onScopeChange, scope = "once" } = props;
  const why =
    props.onceWhy === undefined || (onScopeChange !== undefined && scope !== "once") ? null : (
      <p
        className="ui-approval__once"
        data-marked={props.onceMarked === true ? "true" : undefined}
        data-testid="once-only"
      >
        <Words text={props.onceWhy} />
      </p>
    );
  return (
    <>
      {onScopeChange !== undefined && (
        <div className="ui-approval__choose">
          <ScopePicker
            name={props.scopeName}
            scope={scope}
            scopes={props.scopes}
            onScopeChange={onScopeChange}
          />
        </div>
      )}
      {why}
    </>
  );
}

/**
 * An open card's foot: how long a yes lasts, the risks, then the switch that lets the agent work
 * without asking, the scope on a line of its own, what it lets through, and the buttons; or who
 * it is waiting on when it is not this person's to answer.
 */
function Foot(props: ApprovalCardProps & { readonly scopeName: string }) {
  const { lasts, risk, waitingOn, letWork } = props;
  return (
    <div className="ui-approval__foot">
      {lasts !== undefined && <Lasts lasts={lasts} />}
      <RiskList risk={risk} />
      {waitingOn !== undefined ? (
        <p className="ui-approval__waiting" data-testid="waiting-on">
          Waiting on {waitingOn}
        </p>
      ) : (
        <>
          {letWork !== undefined && (
            <LetWork letWork={letWork} disabled={props.busy === true || props.answered === true} />
          )}
          {letWork?.on !== true && <Choices {...props} />}
          {/* What the choice lets through, between it and the answer (ADR 0280). */}
          {props.standing !== undefined && (
            <div className="ui-approval__standing" key={letWork?.on === true ? "work" : "choice"}>
              {props.standing}
            </div>
          )}
          <Actions {...props} />
        </>
      )}
    </div>
  );
}

export function ApprovalCard(props: ApprovalCardProps) {
  const {
    harnessName,
    harnessColor,
    title,
    subtitle,
    effect,
    icon = "bolt",
    preview,
    renderMarkdown,
    sources,
    remainingMs,
    fallback = "deny",
    resolution,
    trail,
    className,
  } = props;
  const id = useId();

  return (
    <Card
      as="article"
      aria-label={`Approval: ${title}`}
      tone={toneOf(resolution)}
      padding="none"
      className={className === undefined ? "ui-approval" : `ui-approval ${className}`}
      data-decision={resolution?.decision ?? "pending"}
    >
      <header className="ui-approval__head">
        <span className="ui-approval__icon">
          <Icon name={icon} />
        </span>
        <div className="ui-approval__who">
          <b>
            <Words text={title} />
          </b>
          {subtitle !== undefined && <span className="ui-approval__sub">{subtitle}</span>}
          {trail !== undefined && <span className="ui-approval__trail">{trail}</span>}
        </div>
        {resolution === undefined && remainingMs !== undefined && (
          <Expiry remainingMs={remainingMs} totalMs={props.totalMs} fallback={fallback} />
        )}
        <Avatar
          name={harnessName}
          kind="harness"
          size="xs"
          {...(harnessColor === undefined ? {} : { color: harnessColor })}
        />
      </header>

      {effect !== undefined && <p className="ui-approval__effect">{effect}</p>}
      {props.body}
      {preview !== undefined && <PreviewBlock preview={preview} renderMarkdown={renderMarkdown} />}
      {sources !== undefined && sources.length > 0 && <Sources sources={sources} />}

      {resolution !== undefined ? (
        <Decision resolution={resolution} />
      ) : (
        <Foot {...props} scopeName={`${id}-scope`} />
      )}
    </Card>
  );
}
