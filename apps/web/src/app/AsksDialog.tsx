/**
 * Every ask of a harness so far (ADR 0255), the phone's Asks page (`apps/mobile/src/harnesses/
 * parts/AskList.tsx`) in the desktop's terms: a dialog that grows out of the dots on When it asks
 * you, the asks newest first under their days, All, Yes and No at the top when they are not all one
 * or the other. A row opens the ask whole in the same dialog: the question and its preview, the
 * answer and when it came, and Open in its space. With no harness it is every ask in the workspace,
 * from the dots on You's Allowed always.
 */

import {
  ASKS_NONE,
  ASKS_TITLE,
  type AskEnd,
  type AskFilter,
  type AskRow,
  askAnswer,
  askedAtWords,
  askerName,
  askFilters,
  askRows,
  askRowWords,
  askVerdict,
  byDay,
  type Directory,
  type FoundAsk,
  faceKind,
  findAsk,
  nameOf,
  roomName,
  rowsUnder,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { useEffect, useId, useRef, useState } from "react";
import { GrowingDialog } from "./GrowingDialog.tsx";
import { Markdown } from "./Markdown.tsx";
import { Segmented } from "./you/controls.tsx";

export function AsksDialog(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  /** Whose asks; none, every harness's. */
  readonly harnessId: string | undefined;
  readonly selfId: string | undefined;
  /** The dots it grows out of. */
  readonly from: HTMLElement | null;
  /** Opens an ask's space; the dialog folds away first. */
  readonly onOpenSpace: (spaceId: string) => void;
  readonly onClosed: () => void;
}) {
  const titleId = useId();
  const [leaving, setLeaving] = useState(false);
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const [going, setGoing] = useState<string | undefined>(undefined);
  const [now] = useState(() => Date.now());
  const found = opened === undefined ? undefined : findAsk(props.model, opened);
  return (
    <GrowingDialog
      from={props.from}
      labelledBy={titleId}
      className="harness-dialog asks-dialog"
      testId="asks-dialog"
      focus=".asks-row, .asks-none"
      leaving={leaving}
      onLeave={() => setLeaving(true)}
      onGone={() => {
        props.onClosed();
        if (going !== undefined) props.onOpenSpace(going);
      }}
    >
      <div className="harness-dialog-card">
        {found === undefined ? (
          <List
            {...props}
            titleId={titleId}
            now={now}
            onOpen={setOpened}
            onClose={() => setLeaving(true)}
          />
        ) : (
          <Whole
            found={found}
            model={props.model}
            directory={props.directory}
            selfId={props.selfId}
            titleId={titleId}
            now={now}
            onBack={() => setOpened(undefined)}
            onClose={() => setLeaving(true)}
            onOpenSpace={() => {
              setGoing(found.spaceId);
              setLeaving(true);
            }}
          />
        )}
      </div>
    </GrowingDialog>
  );
}

function List(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string | undefined;
  readonly selfId: string | undefined;
  readonly titleId: string;
  readonly now: number;
  readonly onOpen: (approvalId: string) => void;
  readonly onClose: () => void;
}) {
  const [filter, setFilter] = useState<AskFilter>("all");
  const rows = askRows(props.model, props.directory, props.harnessId, props.selfId, props.now);
  const filters = askFilters(rows);
  const shown = filters.some((each) => each.id === filter) ? rowsUnder(rows, filter) : rows;
  const name = props.harnessId === undefined ? undefined : nameOf(props.directory, props.harnessId);
  return (
    <>
      <div className="new-space-head">
        {name === undefined ? null : <Avatar name={name} kind="harness" size="sm" />}
        <h2 id={props.titleId}>
          {name === undefined ? ASKS_TITLE : `${name}'s ${ASKS_TITLE.toLowerCase()}`}
        </h2>
        <Close onClose={props.onClose} />
      </div>
      {filters.length === 0 ? null : (
        <div className="asks-filter" data-testid="asks-filter">
          <Segmented
            label="Which asks"
            value={filter}
            options={filters.map((each) => [each.id, each.label] as const)}
            onChange={setFilter}
          />
        </div>
      )}
      <div className="asks-days">
        {shown.length === 0 ? (
          <p className="asks-none" tabIndex={-1}>
            {ASKS_NONE}
          </p>
        ) : (
          byDay(shown).map((day) => (
            <section key={day.day} className="asks-day" aria-label={day.day}>
              <h3>{day.day}</h3>
              <ul>
                {day.rows.map((row) => (
                  <li key={row.approvalId}>
                    <Row row={row} onOpen={props.onOpen} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}

function Row(props: { readonly row: AskRow; readonly onOpen: (approvalId: string) => void }) {
  const { row } = props;
  return (
    <button
      type="button"
      className="asks-row"
      data-testid={`ask-row-${row.approvalId}`}
      onClick={() => props.onOpen(row.approvalId)}
    >
      <Mark end={row.end} />
      <span className="asks-row-words">
        <CodeWords words={row.words} className="asks-row-q" />
        <span className="asks-row-sub">
          <b data-end={row.end}>{row.answer}</b> · {row.where}
        </span>
      </span>
      <span className="asks-row-time">{row.time}</span>
    </button>
  );
}

/** The ask whole: who asked where and when, what it asked, and the answer and when it came. */
function Whole(props: {
  readonly found: FoundAsk;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly titleId: string;
  readonly now: number;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onOpenSpace: () => void;
}) {
  const { found, directory } = props;
  const { approval, run } = found;
  const asker = askerName(run, directory);
  const space = roomName(props.model, found.spaceId, directory);
  const verdict = askVerdict(found, directory, props.selfId, props.now);
  const answer = verdict ?? askAnswer(approval, directory, props.selfId, run.harnessId);
  const preview = approval.preview;
  // The keyboard comes with it: Back, so Enter goes back to the list it came from.
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus(), []);
  return (
    <div className="asks-whole" data-testid="asks-whole">
      <div className="new-space-head">
        <button type="button" className="asks-back" onClick={props.onBack} ref={back}>
          <Icon name="previous" size={14} />
          {ASKS_TITLE}
        </button>
        <h2 id={props.titleId}>Ask</h2>
        <Close onClose={props.onClose} />
      </div>
      <div className="asks-who">
        <Avatar name={asker} kind={faceKind(directory, run.harnessId)} size="sm" />
        <span>
          <strong>{`${asker} in ${space}`}</strong>
          <small>{askedAtWords(approval.askedAt, props.now)}</small>
        </span>
      </div>
      <CodeWords words={askRowWords(approval)} className="asks-whole-q" />
      {approval.effect === undefined ? null : (
        <p className="asks-whole-effect">{approval.effect}</p>
      )}
      {preview === undefined || preview === "" ? null : approval.previewFormat === "markdown" ? (
        <div className="asks-whole-preview">
          <Markdown text={preview} directory={directory} />
        </div>
      ) : (
        <pre className="asks-whole-code">{preview}</pre>
      )}
      <div className="asks-verdict" data-end={answer.end} data-testid="asks-verdict">
        <Mark end={answer.end} />
        <span>
          <strong>{answer.words}</strong>
          {verdict === undefined ? null : <small>{verdict.line}</small>}
        </span>
      </div>
      <div className="harness-add-actions">
        <Button variant="primary" onClick={props.onOpenSpace} data-testid="asks-open">
          {`Open in ${space}`}
        </Button>
      </div>
    </div>
  );
}

/** The dot an ask was, grown to carry a tick, a cross or a clock. */
function Mark(props: { readonly end: AskEnd }) {
  const { end } = props;
  return (
    <span className="asks-mark" data-end={end} aria-hidden="true">
      {end === "no" ? (
        <Icon name="x" size={14} />
      ) : end === "lapsed" ? (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      ) : end === "open" ? null : (
        <Icon name="check" size={14} />
      )}
    </span>
  );
}

/** Words with their `code` spans in mono, as the card's headline draws a command. */
function CodeWords(props: { readonly words: string; readonly className: string }) {
  return (
    <span className={props.className}>
      {props.words.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          // A split's pieces have no ids, and their order is the sentence's.
          // biome-ignore lint/suspicious/noArrayIndexKey: a piece is only ever itself.
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </span>
  );
}

function Close(props: { readonly onClose: () => void }) {
  return (
    <button
      type="button"
      className="new-space-close"
      aria-label="Close"
      data-testid="asks-close"
      onClick={props.onClose}
    >
      <Icon name="x" size={14} />
    </button>
  );
}
