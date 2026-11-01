/**
 * Delete your account (ADR 0243), the last of the person's own cards: the desktop's form of the
 * phone's sheet, in the same words (`deleteAccountSheet` in core). A modal dialog says what goes
 * and what stays, and Delete wakes once the workspace's name is typed (Arjun's B). Once the server
 * has done it, the store says the connection is removed by the person's own hand, and the app
 * says they left in place of everything (`Removed`), as a removal is said.
 *
 * The only owner is told how the workspace itself is deleted instead: it is theirs, on the computer
 * it runs on, and nothing here takes it away.
 */

import {
  type DeleteAccountSheet,
  type Directory,
  deleteAccountSheet,
  deleteAccountTyped,
  type WorkspaceModel,
} from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { Card, Row } from "./controls.tsx";
import type { PeopleService } from "./services.ts";

type Asked = Extract<DeleteAccountSheet, { kind: "delete" }>;

export function DeleteAccount(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  readonly people: PeopleService;
  readonly onDelete: () => Promise<void>;
}) {
  const [asked, setAsked] = useState<DeleteAccountSheet | undefined>(undefined);
  const words = (devices?: number) =>
    deleteAccountSheet({
      model: props.model,
      directory: props.directory,
      selfId: props.selfId,
      workspace: props.workspace,
      devices,
    });
  const open = () => {
    const first = words();
    setAsked(first);
    if (first.kind === "only_owner") return;
    // The count of devices is the server's, read once the dialog is up.
    void props.people
      .devices()
      .then((held) => {
        const counted = words(held.filter((each) => each.revokedAt === undefined).length);
        setAsked((now) => (now === undefined ? now : counted));
      })
      .catch(() => undefined);
  };
  return (
    <Card label="Your account" testId="your-account" title="Your account">
      <Row label="Delete your account" sub={`You leave ${props.workspace} on every device`}>
        <Button variant="danger" onClick={open} data-testid="delete-account">
          Delete…
        </Button>
      </Row>
      {asked?.kind === "only_owner" && (
        <ConfirmDialog
          asking={{ title: asked.title, body: asked.body, confirm: "OK" }}
          danger={false}
          cancel={null}
          onCancel={() => setAsked(undefined)}
          onConfirm={() => setAsked(undefined)}
        />
      )}
      {asked?.kind === "delete" && (
        <DeleteAccountDialog
          words={asked}
          onCancel={() => setAsked(undefined)}
          onDelete={props.onDelete}
        />
      )}
    </Card>
  );
}

export function DeleteAccountDialog(props: {
  readonly words: Asked;
  readonly onCancel: () => void;
  /** Resolves once the server has done it; a rejection's message is shown and the dialog stays. */
  readonly onDelete: () => Promise<void>;
}) {
  const { words } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const ready = deleteAccountTyped(typed, words.typed);

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  const remove = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setFailed(undefined);
    try {
      await props.onDelete();
    } catch (error) {
      const said = error instanceof Error ? error.message : "";
      setFailed(said === "" ? "The server would not do it." : said);
      setBusy(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby={titleId}
      data-testid="delete-account-dialog"
      onCancel={(event) => {
        // Escape: Keep it, unless the server is being asked.
        event.preventDefault();
        if (!busy) props.onCancel();
      }}
    >
      <h2 id={titleId}>{words.title}</h2>
      <p>{words.lead}</p>
      <div className="delete-lists">
        <Listed heading="Goes" lines={words.goes} testId="delete-goes" />
        <Listed heading="Stays" lines={words.stays} testId="delete-stays" stays />
      </div>
      {failed !== undefined && (
        <p className="confirm-failed" role="alert" data-testid="confirm-failed">
          {failed}
        </p>
      )}
      <input
        className="confirm-field"
        aria-label={words.placeholder}
        placeholder={words.placeholder}
        value={typed}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        disabled={busy}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void remove();
        }}
        data-testid="delete-account-typed"
      />
      <div className="confirm-actions">
        <Button onClick={props.onCancel} disabled={busy}>
          Keep it
        </Button>
        <Button
          variant="danger"
          onClick={() => void remove()}
          disabled={busy || !ready}
          data-testid="delete-account-confirm"
        >
          {words.confirm}
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}

/** Goes, or Stays: its heading, then a line for each, with a dot in its colour. */
function Listed(props: {
  readonly heading: string;
  readonly lines: readonly string[];
  readonly testId: string;
  readonly stays?: boolean;
}) {
  return (
    <section
      className={props.stays === true ? "delete-list stays" : "delete-list"}
      data-testid={props.testId}
    >
      <h3>{props.heading}</h3>
      <ul>
        {props.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
