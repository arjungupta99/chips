/**
 * The workspace's log: who decided what, and when — a read of the event log, never a separate
 * record (ADR 0004). Newest first. Every human decision and every one of Chips' own is here. It
 * opens from You's Workspace log row, an owner's or an admin's, as a page beside the list (ADR
 * 0261, ADR 0265); until 3 November 2026 it was Audit in the sidebar, for everybody, and then a
 * page of its own with a way back to You.
 *
 * A page beside the list is a column, not a window's width, so each decision is a row rather than
 * a table's line: what was decided, and under it when, who, and where, the space a button that
 * opens it.
 */

import type { AuditEntry, Directory, WorkspaceModel } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import { clockTime, shortDayWords } from "./time.ts";

export interface LogProps {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly onOpen: (spaceId: string) => void;
}

const KIND_LABEL: Readonly<Record<AuditEntry["kind"], string>> = {
  attachment: "File",
  approval: "Approval",
  question: "Question",
  policy: "Policy",
  run: "Run",
  feedback: "Feedback",
  people: "People",
  message: "Message",
};

/**
 * When a decision was made: the clock time today, and the day with it before then, since the log
 * runs back to the workspace's first day and "09:14" alone could be any of them.
 */
export function loggedWhen(ts: string, now: number = Date.now()): string {
  if (new Date(ts).toDateString() === new Date(now).toDateString()) return clockTime(ts);
  return `${shortDayWords(ts)} · ${clockTime(ts)}`;
}

export function Log({ model, directory, onOpen }: LogProps) {
  const who = (id: string) => (id === "system" ? "Chips" : nameOf(directory, id));
  const title = (spaceId: string | undefined) =>
    model.spaces.find((c) => c.id === spaceId)?.title ?? "a space";

  return (
    <div className="you-page audit">
      {model.audit.length === 0 ? (
        <div className="you-gcard">
          <div className="you-lrow is-unmarked" data-testid="audit-empty">
            <span className="you-lrow-lab">
              <span>No decisions yet.</span>
            </span>
          </div>
        </div>
      ) : (
        <ol className="you-gcard audit-list" data-testid="audit">
          {model.audit.map((entry) => (
            <li key={entry.seq} className="audit-entry" data-kind={entry.kind}>
              <span className="audit-kind">{KIND_LABEL[entry.kind]}</span>
              <span className="you-lrow-lab">
                <span>
                  {entry.what}
                  {entry.reason !== undefined && (
                    <span className="audit-reason"> · {entry.reason}</span>
                  )}
                </span>
                <small>
                  <span className="audit-when">{loggedWhen(entry.ts)}</span> · {who(entry.who)}
                  {entry.spaceId !== undefined && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="audit-open"
                        onClick={() => onOpen(entry.spaceId as string)}
                      >
                        {title(entry.spaceId)}
                      </button>
                    </>
                  )}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="you-gfoot audit-note">
        Every decision, as the log holds it. Nothing here can be edited, only added to.
      </p>
    </div>
  );
}
