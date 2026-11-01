/**
 * A guest asks to go direct (ADR 0211, Phase 3), on the web and the Mac: the phone's sheet
 * (`apps/mobile/src/you/DirectAskSheet.tsx`) as a dialog. Who asks and how slow the relay is for
 * them, how to share the server in Tailscale, a field for Tailscale's invite link, what sharing
 * gives them, and Send.
 *
 * It opens for the oldest ask waiting that this device has not shown (core's `nextDirectAsk`), to
 * an owner alone, as the join request dialog does: from the read the store makes at each hello,
 * and again whenever the window comes back to the front. A link kept for the next guest fills the field;
 * once the field holds Tailscale's link, "Give this same link to the next guest" is offered,
 * ticked (Arjun's pick).
 */

import {
  askTitle,
  askTripWords,
  type DirectAsk,
  type Directory,
  KEEP_LINK_FOOT,
  KEEP_LINK_LABEL,
  myRole,
  nameOf,
  nextDirectAsk,
  type Snapshot,
  type Store,
  sharedWords,
  shareHowWords,
  sharerOf,
  shareWarning,
  TAILSCALE_MACHINES,
} from "@chipschat/core";
import { shareLinkOf } from "@chipschat/protocol";
import { Avatar, Icon } from "@chipschat/ui";
import { useEffect, useId, useState } from "react";
import { GrowingDialog } from "../GrowingDialog.tsx";
import { Switch } from "./controls.tsx";

/** Mounted once: the dialog for the next ask an owner may answer. */
export function DirectAsks(props: {
  readonly store: Store;
  readonly asks: Snapshot["directAsks"];
  readonly kept: string | undefined;
  readonly model: Snapshot["model"];
  readonly directory: Directory;
  readonly selfId: string;
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | undefined>(undefined);
  const owner = myRole(props.model, props.selfId) === "owner";
  const next = owner ? nextDirectAsk(props.asks, shown) : undefined;
  // Back in front: an ask that came while the window was away. There is no push here.
  const { store } = props;
  useEffect(() => {
    if (!owner) return;
    const seen = () => {
      if (document.visibilityState === "visible")
        void store.readDirectAsks().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [owner, store]);
  useEffect(() => {
    if (open !== undefined || next === undefined) return;
    setOpen(next.askId);
    setShown((before) => new Set(before).add(next.askId));
  }, [open, next]);
  const ask = open === undefined ? undefined : props.asks?.get(open);
  if (ask === undefined) return null;
  return (
    <DirectAskDialog
      key={ask.askId}
      ask={ask}
      directory={props.directory}
      selfId={props.selfId}
      kept={props.kept}
      store={props.store}
      onClosed={() => setOpen(undefined)}
    />
  );
}

export function DirectAskDialog(props: {
  readonly ask: DirectAsk;
  readonly directory: Directory;
  readonly selfId: string;
  readonly kept: string | undefined;
  readonly store: Store;
  readonly onClosed: () => void;
}) {
  const { ask, store } = props;
  const titleId = useId();
  const machine = useMachine(store);
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState(props.kept ?? "");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const name = nameOf(props.directory, ask.participantId);
  const link = shareLinkOf(typed);
  const send = () => {
    if (link === undefined) return;
    setBusy(true);
    setError(undefined);
    store
      .shareDirect(ask.askId, link, keep)
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure)),
      )
      .finally(() => setBusy(false));
  };
  const answered = ask.state !== "asked";
  const words = sharedWords(name, sharerOf(ask, props.directory), ask.sharedBy === props.selfId);
  return (
    <GrowingDialog
      from={null}
      labelledBy={titleId}
      className="harness-dialog"
      testId="direct-ask-dialog"
      focus="[data-testid=direct-ask-link]"
      leaving={leaving}
      onLeave={() => {
        if (!busy) setLeaving(true);
      }}
      onGone={props.onClosed}
    >
      <div className="harness-dialog-card join-ask">
        <div className="join-ask-head">
          <Avatar name={name} kind="person" size="lg" />
          <h2 id={titleId}>{askTitle(name)}</h2>
          <small>{askTripWords(ask.tripMs)}</small>
          <button
            type="button"
            className="new-space-close"
            aria-label="Close"
            data-testid="direct-ask-close"
            disabled={busy}
            onClick={() => setLeaving(true)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        {answered ? (
          <div className="direct-ask-done" role="status" data-testid="direct-ask-answered">
            <b>{words.title}</b>
            <p className="join-note center">{words.line}</p>
          </div>
        ) : (
          <>
            <p className="join-note">
              {shareHowWords(machine)}{" "}
              <a href={TAILSCALE_MACHINES} target="_blank" rel="noreferrer">
                Open Tailscale
              </a>
            </p>
            <input
              className="direct-ask-link"
              data-testid="direct-ask-link"
              aria-label="Tailscale's invite link"
              type="url"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="https://login.tailscale.com/…"
              spellCheck={false}
              autoCapitalize="none"
              disabled={busy}
            />
            {link !== undefined && (
              <div className="direct-ask-keep">
                <span>
                  <b>{KEEP_LINK_LABEL}</b>
                  <small>{KEEP_LINK_FOOT}</small>
                </span>
                <Switch
                  label={KEEP_LINK_LABEL}
                  checked={keep}
                  disabled={busy}
                  onChange={setKeep}
                  testId="direct-ask-keep"
                />
              </div>
            )}
            <p className="join-note" data-testid="direct-ask-warning">
              {shareWarning(machine)}
            </p>
            {error !== undefined && (
              <p className="harness-add-error" role="alert">
                {error}
              </p>
            )}
            <div className="join-decide">
              <button
                type="button"
                className="join-allow"
                data-testid="direct-ask-send"
                disabled={busy || link === undefined}
                onClick={send}
              >
                Send to {name}
              </button>
            </div>
          </>
        )}
      </div>
    </GrowingDialog>
  );
}

/** The server's machine, as it names itself, else "your server" until it says. */
function useMachine(store: Store): string {
  const [machine, setMachine] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    store.serverFacts().then(
      (facts) => {
        if (live && facts.machine !== "") setMachine(facts.machine);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store]);
  return machine ?? "your server";
}
