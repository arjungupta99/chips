/**
 * The run timeline in the run panel: the plan as a rail of dots, green where done, amber
 * where a person is needed, hollow where not yet. A compaction leaves a tick on the rail,
 * because behaviour changes after one (blueprint, Context ring).
 */

import "./timeline.css";

export type TimelineStatus = "planned" | "done" | "now" | "failed";

export interface TimelineItem {
  readonly id: string;
  readonly title: string;
  readonly status?: TimelineStatus;
  /** A line under the title, for example `needs your approval`. */
  readonly note?: string;
  /** `tick` marks a moment on the rail rather than a step: a compaction. */
  readonly kind?: "step" | "tick";
}

export interface TimelineProps {
  readonly items: readonly TimelineItem[];
  readonly label?: string;
  readonly className?: string;
}

export function Timeline({ items, label = "Timeline", className }: TimelineProps) {
  return (
    <ol
      className={className === undefined ? "ui-timeline" : `ui-timeline ${className}`}
      aria-label={label}
    >
      {items.map((item) => {
        const status = item.status ?? "planned";
        return (
          <li
            className="ui-timeline__item"
            key={item.id}
            data-status={status}
            data-kind={item.kind ?? "step"}
            aria-current={status === "now" ? "step" : undefined}
          >
            {item.title}
            {item.note !== undefined && <span className="ui-timeline__note">{item.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}
