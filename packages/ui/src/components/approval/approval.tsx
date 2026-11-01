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
export type ApprovalScope = "once" | "session" | "always";

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
  /** What happens on expiry. Denying is the default, and the safe one. */
  readonly fallback?: "deny" | "allow";
  readonly editable?: boolean;
  /** How far a yes reaches. `always` becomes a policy rule. */
  readonly scope?: ApprovalScope;
  readonly onScopeChange?: (scope: ApprovalScope) => void;
  /**
   * Under the choices, for a yes beyond this once: what it remembers and where it reaches (ADR
   * 0239). Drawn only while the card is open and this person's to answer.
   */
  readonly standing?: ReactNode;
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

const SCOPES: ReadonlyArray<readonly [ApprovalScope, string]> = [
  ["once", "Once"],
  ["session", "This session"],
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

function Expiry({
  remainingMs,
  fallback,
}: {
  readonly remainingMs: number;
  readonly fallback: "deny" | "allow";
}) {
  if (remainingMs <= 0) {
    return (
      <span className="ui-approval__expiry" data-expired="true">
        expired
      </span>
    );
  }
  return (
    <span className="ui-approval__expiry">
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
  onScopeChange,
}: {
  readonly name: string;
  readonly scope: ApprovalScope;
  readonly onScopeChange: (scope: ApprovalScope) => void;
}) {
  return (
    <fieldset className="ui-approval__scope">
      <legend className="ui-visually-hidden">How far a yes reaches</legend>
      {SCOPES.map(([value, label]) => (
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
  return (
    <div className="ui-approval__buttons">
      <Button variant="danger" onClick={props.onDeny} disabled={busy}>
        Deny
      </Button>
      <Button onClick={props.onEdit} disabled={busy || !editable || preview === undefined}>
        Edit
      </Button>
      {/* By the name the film's render presses it by (ADR 0217, `taps` in a beats file). */}
      <Button
        variant="primary"
        onClick={props.onApprove}
        disabled={busy}
        data-testid="approval-approve"
      >
        Approve
      </Button>
    </div>
  );
}

/**
 * An open card's foot: how long a yes lasts, the risks, then the scope and the buttons, or who it
 * is waiting on when it is not this person's to answer.
 */
function Foot(props: ApprovalCardProps & { readonly scopeName: string }) {
  const { lasts, risk, waitingOn, onScopeChange, scope = "once" } = props;
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
          {onScopeChange !== undefined && (
            <ScopePicker name={props.scopeName} scope={scope} onScopeChange={onScopeChange} />
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
          <Expiry remainingMs={remainingMs} fallback={fallback} />
        )}
        <Avatar
          name={harnessName}
          kind="harness"
          size="xs"
          {...(harnessColor === undefined ? {} : { color: harnessColor })}
        />
      </header>

      {effect !== undefined && <p className="ui-approval__effect">{effect}</p>}
      {preview !== undefined && <PreviewBlock preview={preview} renderMarkdown={renderMarkdown} />}
      {sources !== undefined && sources.length > 0 && <Sources sources={sources} />}

      {resolution !== undefined ? (
        <Decision resolution={resolution} />
      ) : (
        <Foot {...props} scopeName={`${id}-scope`} />
      )}
      {resolution === undefined &&
        props.waitingOn === undefined &&
        props.standing !== undefined && (
          <div className="ui-approval__standing">{props.standing}</div>
        )}
    </Card>
  );
}
