/**
 * Delete your account (ADR 0243): a red row under Sign out at the foot of You, as the phone has it
 * (ADR 0265), opening a page beside the list in the phone's sheet's words (`deleteAccountSheet` in
 * core): what goes and what stays, and the button that deletes it (the addendum of 3 November
 * 2026). The button asks once more in a modal dialog, the one step left a dialog, and Delete
 * there wakes once the workspace's name is typed (Arjun's B). Once the server has done it, the
 * store says the connection is removed by the person's own hand, and the app says they left in
 * place of everything (`Removed`), as a removal is said.
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
import { FormPage } from "./Form.tsx";
import { ListRow } from "./list.tsx";
import type { PeopleService } from "./services.ts";

type Asked = Extract<DeleteAccountSheet, { kind: "delete" }>;

export function DeleteAccountRow(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  readonly people: PeopleService;
  readonly onDelete: () => Promise<void>;
}) {
  const [asked, setAsked] = useState<
    { readonly words: DeleteAccountSheet; readonly from: HTMLElement } | undefined
  >(undefined);
  const words = (devices?: number) =>
    deleteAccountSheet({
      model: props.model,
      directory: props.directory,
      selfId: props.selfId,
      workspace: props.workspace,
      devices,
    });
  const open = (from: HTMLElement) => {
    const first = words();
    setAsked({ words: first, from });
    if (first.kind === "only_owner") return;
    // The count of devices is the server's, read once the page is up.
    void props.people
      .devices()
      .then((held) => {
        const counted = words(held.filter((each) => each.revokedAt === undefined).length);
        setAsked((now) => (now === undefined ? now : { ...now, words: counted }));
      })
      .catch(() => undefined);
  };
  return (
    <>
      <ListRow
        label="Delete your account"
        tone="danger"
        onOpen={open}
        bare
        ariaLabel={`Delete your account: you leave ${props.workspace} on every device`}
        testId="delete-account"
      />
      {asked !== undefined && (
        <FormPage
          title="Delete your account"
          from={asked.from}
          testId="delete-account-page"
          onGone={() => setAsked(undefined)}
        >
          {() =>
            asked.words.kind === "only_owner" ? (
              <div className="delete-page" data-testid="delete-only-owner">
                <h3>{asked.words.title}</h3>
                <p>{asked.words.body}</p>
              </div>
            ) : (
              <DeleteAccountPage words={asked.words} onDelete={props.onDelete} />
            )
          }
        </FormPage>
      )}
    </>
  );
}

/** What goes and what stays, and the button that asks the last time. */
function DeleteAccountPage(props: {
  readonly words: Asked;
  readonly onDelete: () => Promise<void>;
}) {
  const { words } = props;
  const [asking, setAsking] = useState(false);
  return (
    <div className="delete-page">
      <p>{words.lead}</p>
      <div className="delete-lists">
        <Listed heading="Goes" lines={words.goes} testId="delete-goes" />
        <Listed heading="Stays" lines={words.stays} testId="delete-stays" stays />
      </div>
      <div className="you-form-actions">
        <Button variant="danger" onClick={() => setAsking(true)} data-testid="delete-account-ask">
          {words.confirm}
        </Button>
      </div>
      {asking && (
        <DeleteAccountDialog
          words={words}
          onCancel={() => setAsking(false)}
          onDelete={props.onDelete}
        />
      )}
    </div>
  );
}

/** The last step, as a dialog: the workspace's name typed, then Delete; Keep it goes back. */
function DeleteAccountDialog(props: {
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
      <h2 id={titleId}>{words.title}?</h2>
      <p>{words.lead}</p>
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
