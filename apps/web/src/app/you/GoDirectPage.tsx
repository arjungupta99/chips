/**
 * Go direct on the Mac (ADR 0211, Phase 2): the phone's guide (`GoDirectSheet`), as a page in the
 * Connection page's place, with the way back to it (ADR 0265's addendum of 3 November 2026). Three
 * steps; the last waits on the server's own address, asking the store to go direct every three
 * seconds while it is open, and when the socket has moved over every step goes green and the page
 * goes back to Connection by itself.
 *
 * Phase 3: somebody who is not an owner is guided through an ask (`guest`): Ask an owner, Get
 * Tailscale and open the invite the owner sends, turn Tailscale on. The ask is read again every
 * three seconds while it waits.
 */

import {
  type AskSeen,
  askRefusedWords,
  GUEST_GUIDE_LEAD,
  GUIDE_LEAD,
  type GuestStep,
  guestGuideSteps,
  guideSteps,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { FormPage } from "./Form.tsx";

/** How often the guide asks the store to go direct while it waits. */
export const GUIDE_CHECK_MS = 3000;
/** How long it stays, every step green, once the computer has gone direct. */
export const GUIDE_DONE_MS = 1500;

const TAILSCALE = "https://tailscale.com/download/mac";

/** A guest's side of the guide: their ask as it stands, how to make one, and how to read it. */
export interface GuestAsk {
  readonly ask: AskSeen | undefined;
  readonly onAsk: () => Promise<unknown>;
  readonly readMine: () => Promise<unknown>;
}

export function GoDirectPage(props: {
  readonly from: HTMLElement | null;
  readonly machine: string;
  readonly tailnet: string;
  /** The socket has left the relay. */
  readonly direct: boolean;
  readonly goDirect: () => Promise<boolean>;
  readonly onGone: () => void;
  /** For somebody who is not an owner: the guide asks an owner first (Phase 3). */
  readonly guest?: GuestAsk | undefined;
}) {
  const { direct, goDirect, guest, onGone } = props;
  const waiting = guest?.ask?.state === "asked";
  // Before a guest's ask is shared there is nothing for the server's address to answer to.
  const reachable = guest === undefined || (guest.ask !== undefined && !waiting);
  useEffect(() => {
    if (direct || !reachable) return;
    void goDirect();
    const every = setInterval(() => void goDirect(), GUIDE_CHECK_MS);
    return () => clearInterval(every);
  }, [direct, reachable, goDirect]);
  const readMine = guest?.readMine;
  useEffect(() => {
    if (!waiting || readMine === undefined) return;
    const every = setInterval(() => void readMine().catch(() => undefined), GUIDE_CHECK_MS);
    return () => clearInterval(every);
  }, [waiting, readMine]);
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => {
    if (!direct) return;
    const done = setTimeout(() => gone.current(), GUIDE_DONE_MS);
    return () => clearTimeout(done);
  }, [direct]);
  const steps: readonly GuestStep[] =
    guest === undefined
      ? guideSteps(props.machine, props.tailnet, "computer", direct).map((step, index, all) => ({
          ...step,
          state: direct ? "done" : index === all.length - 1 ? "waiting" : "said",
        }))
      : guestGuideSteps(props.machine, guest.ask, "computer", direct);
  return (
    <FormPage title="Go direct" from={props.from} testId="go-direct-page" onGone={onGone}>
      {() => (
        <>
          <p className="go-direct-lead">{guest === undefined ? GUIDE_LEAD : GUEST_GUIDE_LEAD}</p>
          <ol className="go-direct-steps">
            {steps.map((step, index) => (
              <li
                key={step.title}
                data-state={step.state}
                data-testid={`go-direct-step-${index + 1}`}
              >
                <span className="go-direct-n" aria-hidden="true">
                  {step.state === "done" ? <Icon name="check" size={13} /> : index + 1}
                </span>
                <span className="go-direct-words">
                  <b>{step.title}</b>
                  <small>{step.words}</small>
                  {!direct && <StepAction index={index} guest={guest} />}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </FormPage>
  );
}

/**
 * What a step offers: Get Tailscale on an owner's first; for a guest, Ask an owner on the first
 * until they have, and on the second Get Tailscale, and Open the invite once it is shared.
 */
function StepAction(props: { readonly index: number; readonly guest: GuestAsk | undefined }) {
  const { index, guest } = props;
  const get = (
    <a href={TAILSCALE} target="_blank" rel="noreferrer">
      Get Tailscale
    </a>
  );
  if (guest === undefined) return index === 0 ? get : null;
  if (index === 0) return guest.ask === undefined ? <AskButton onAsk={guest.onAsk} /> : null;
  if (index !== 1) return null;
  const link = guest.ask?.link;
  return link === undefined ? (
    get
  ) : (
    <span className="go-direct-links">
      <a href={link} target="_blank" rel="noreferrer" data-testid="go-direct-invite">
        Open the invite
      </a>
      {get}
    </span>
  );
}

function AskButton({ onAsk }: { readonly onAsk: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const ask = () => {
    setBusy(true);
    setFailed(undefined);
    onAsk()
      .catch((error: unknown) => setFailed(askRefusedWords(error)))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <button
        type="button"
        className="go-direct-ask"
        disabled={busy}
        onClick={ask}
        data-testid="go-direct-ask"
      >
        Ask an owner
      </button>
      {failed !== undefined && (
        <small className="go-direct-failed" role="alert">
          {failed}
        </small>
      )}
    </>
  );
}
