/**
 * The task card: in the specialist's chat, where a lane begins, with the trail that led to it
 * and the words that caused it (blueprint, Lead and lanes). This is the specialist's view of
 * the same lane the route card shows the lead. Visual in Phase 1.
 */

import { AttachmentChip, type AttachmentKind } from "../attachment/attachment.js";
import { Trail, type TrailHop, trailLabel } from "../trail/trail.js";
import "./task.css";

export interface TaskAttachment {
  readonly id: string;
  readonly name: string;
  readonly meta?: string;
  readonly kind?: AttachmentKind;
  readonly href?: string;
}

export interface TaskCardProps {
  /** Who handled the work on its way here, first to last: `Arjun → Scout → Ledger`. */
  readonly trail: readonly TrailHop[];
  readonly title: string;
  /** The person's original words. */
  readonly quote?: string;
  readonly constraints?: readonly string[];
  /** Already formatted. */
  readonly deadline?: string;
  readonly attachments?: readonly TaskAttachment[];
  /** `Open in Scout's chat`. */
  readonly openHref?: string;
  readonly openLabel?: string;
  readonly className?: string;
}

export function TaskCard({
  trail,
  title,
  quote,
  constraints,
  deadline,
  attachments,
  openHref,
  openLabel,
  className,
}: TaskCardProps) {
  return (
    <article
      className={className === undefined ? "ui-task" : `ui-task ${className}`}
      aria-label={`Task: ${title}`}
    >
      <Trail hops={trail} />
      <span className="ui-task__trail-label" aria-hidden="true">
        {trailLabel(trail)}
      </span>
      <b className="ui-task__title">{title}</b>
      {quote !== undefined && <blockquote className="ui-task__quote">“{quote}”</blockquote>}
      {constraints !== undefined && constraints.length > 0 && (
        <ul className="ui-task__constraints">
          {constraints.map((constraint) => (
            <li key={constraint}>{constraint}</li>
          ))}
        </ul>
      )}
      {deadline !== undefined && <span className="ui-task__deadline">Needed by {deadline}</span>}
      {attachments !== undefined && attachments.length > 0 && (
        <ul className="ui-task__attachments" aria-label="Attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <AttachmentChip
                name={attachment.name}
                {...(attachment.meta === undefined ? {} : { meta: attachment.meta })}
                {...(attachment.kind === undefined ? {} : { kind: attachment.kind })}
                {...(attachment.href === undefined ? {} : { href: attachment.href })}
              />
            </li>
          ))}
        </ul>
      )}
      {openHref !== undefined && (
        <a className="ui-task__open" href={openHref}>
          {openLabel ?? "Open in the lead's chat"}
        </a>
      )}
    </article>
  );
}
