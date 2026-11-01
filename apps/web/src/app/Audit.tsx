/**
 * The audit view: who decided what, and when — a read of the event log, never a separate
 * record (ADR 0004). Newest first. Every human decision and every one of Chips' own is here.
 */

import type { AuditEntry, Directory, WorkspaceModel } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import { clockTime } from "./time.ts";

export interface AuditProps {
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

export function Audit({ model, directory, onOpen }: AuditProps) {
  const who = (id: string) => (id === "system" ? "Chips" : nameOf(directory, id));
  const title = (spaceId: string | undefined) =>
    model.spaces.find((c) => c.id === spaceId)?.title ?? "a space";

  return (
    <main className="audit" aria-label="Audit">
      <h1>Audit</h1>
      <p className="audit-note">
        Every decision, as the log holds it. Nothing here can be edited, only added to.
      </p>
      {model.audit.length === 0 ? (
        <p className="audit-empty" data-testid="audit-empty">
          No decisions yet.
        </p>
      ) : (
        <table className="audit-table" data-testid="audit">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {model.audit.map((entry) => (
              <tr key={entry.seq} data-kind={entry.kind}>
                <td className="audit-when">{clockTime(entry.ts)}</td>
                <td>{who(entry.who)}</td>
                <td>
                  <span className="audit-kind">{KIND_LABEL[entry.kind]}</span> {entry.what}
                  {entry.reason !== undefined && (
                    <span className="audit-reason"> · {entry.reason}</span>
                  )}
                </td>
                <td>
                  {entry.spaceId !== undefined && (
                    <button
                      type="button"
                      className="audit-open"
                      onClick={() => onOpen(entry.spaceId as string)}
                    >
                      {title(entry.spaceId)}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
