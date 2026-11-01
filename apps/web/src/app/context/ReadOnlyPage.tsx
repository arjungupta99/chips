/**
 * A file its harness keeps read only, to read (ADR 0135, the phone's page on the desktop): its
 * tile, what it is and why it can't be changed here, a **Read only** tag, the text on the page's
 * quieter surface; and, for a file several agents share, how many use it.
 */

import type { ContextRow } from "@chipschat/core";
import { markdownSpans } from "./markdown.tsx";
import { RoleTile, Tag } from "./rows.tsx";

export function ReadOnlyPage({
  row,
  harnessName,
  usedBy,
}: {
  readonly row: ContextRow;
  readonly harnessName: string;
  /** For a shared file: how many agents use it, when the harness says. */
  readonly usedBy?: number | undefined;
}) {
  const what = row.line === "" ? row.name : row.line;
  return (
    <div className="ctx-page-column" data-testid="context-read-only">
      <div className="ctx-meta">
        <RoleTile role={row.role} side={26} />
        <span className="ctx-meta-name">
          {what}
          <span className="ctx-meta-whose">{` · ${row.whyReadOnly ?? "read only"}`}</span>
        </span>
        <Tag tag="read_only" harnessName={harnessName} />
      </div>
      <div className="ctx-card ctx-card-quiet ctx-text">{markdownSpans(row.text ?? "")}</div>
      {usedBy !== undefined && usedBy > 0 && (
        <section aria-label="Used by" className="ctx">
          <h2 className="agents-h">Used by</h2>
          <ul className="ctx-group">
            <li className="ctx-row ctx-row-still" data-testid="context-used-by">
              <span className="ctx-row-words">
                <span className="ctx-row-title">{`${usedBy} ${usedBy === 1 ? "agent" : "agents"}`}</span>
                <span className="ctx-row-line">{`Every ${harnessName} agent without a ${row.title} of its own`}</span>
              </span>
            </li>
          </ul>
          <p className="ctx-foot">{`${harnessName} gives each of them this at the start of every turn.`}</p>
        </section>
      )}
    </div>
  );
}
