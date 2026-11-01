/**
 * When it asks you (ADR 0195, Arjun's pick of the mock "When it asks you, simpler", version 2): the
 * harness card's section for every harness, the phone's (`apps/mobile/src/harnesses/Asking.tsx`)
 * in the desktop's terms, with the same words from core.
 *
 * - **The ask travels**: the harness's face, a dotted path, the face of whoever its asks go to; an
 *   ask leaves the harness, lands with them in amber, a ring pulses and a green tick pops, and the
 *   answered ask goes back green. CSS keyframes; with Reduce Motion the ask rests halfway.
 * - **The opening**: "Kit decides when to ask. You decide the answer." and where its asks go.
 * - **Three promises** nobody sets, each on a flat tile whose mark moves.
 * - **Allowed always** with a switch and an × on each (`AlwaysList`), and its count.
 * - **Asks so far** (ADR 0255): the dots, one per ask the reader can see, a key that counts them and
 *   the line under it; a click anywhere on them, or on See all, grows every ask out of them
 *   (`AsksDialog`).
 */

import {
  ASKS_SO_FAR,
  type AskDot,
  type AskingPromise,
  type AskKey,
  alwaysCount,
  alwaysFoot,
  alwaysRules,
  askHistory,
  askingOpening,
  askingPromises,
  asksGoTo,
  type Directory,
  harnessAskKey,
  mayTurnDial,
  nameOf,
  REMOVED_WORDS,
  SEE_ALL,
  type SetRulesInput,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import { type CSSProperties, useRef, useState } from "react";
import { AlwaysList } from "./AlwaysList.tsx";
import { AsksDialog } from "./AsksDialog.tsx";
import { UndoPill } from "./room/UndoPill.tsx";
import { useAlways } from "./useAlways.ts";

/** What Undo does, on hover and to a screen reader. */
export const UNDO_TITLE = "Puts the rule back, so it goes ahead without asking again";

export function Asking(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** Send a scope's rules changed; absent, the list is read only. */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  /** Opens an ask's space, from the ask opened whole (ADR 0255). */
  readonly onOpenSpace: (spaceId: string) => void;
}) {
  const { directory, harnessId, selfId } = props;
  const always = useAlways(props.model, props.onSetRules);
  const name = nameOf(directory, harnessId);
  const to = asksGoTo(directory, harnessId, selfId);
  const opening = askingOpening(name, to);
  const may = props.onSetRules !== undefined && mayTurnDial(props.model, selfId);
  const rules = alwaysRules(always.model, directory, harnessId, selfId);
  const history = askHistory(props.model, directory, harnessId, selfId);
  const owner = directory[harnessId]?.ownerId;
  const removed = always.removed;
  return (
    <section className="asking" aria-label="When it asks you" data-testid="asking">
      <h3>When it asks you</h3>
      <Hero
        harness={name}
        person={to.kind === "you" ? "You" : to.kind === "owner" ? to.name : "A person"}
        personName={owner === undefined ? "?" : nameOf(directory, owner)}
        face={owner === undefined ? undefined : directory[owner]?.face}
      />
      <p className="asking-headline" data-testid="asking-headline">
        {opening.headline}
      </p>
      <p className="asking-sub" data-testid="asking-sub">
        {opening.sub}
      </p>
      <Promises promises={askingPromises(name, to)} />
      <div className="asking-part-h">
        <h4>Allowed always</h4>
        <Count rules={rules} />
      </div>
      <AlwaysList rules={rules} always={always} may={may} testId="asking-always" />
      {rules.length > 0 && (
        <p className="asking-note" data-testid="asking-always-foot">
          {alwaysFoot(name, may, "cross")}
        </p>
      )}
      {history !== undefined && (
        <AsksSoFar
          {...props}
          dots={history.dots}
          askKey={harnessAskKey(props.model, directory, harnessId)}
          line={history.line}
        />
      )}
      <UndoPill
        undoing={removed === undefined ? undefined : { lineId: removed.key, at: removed.at }}
        onUndo={always.undo}
        onGone={always.settled}
        words={REMOVED_WORDS}
        title={UNDO_TITLE}
        page
      />
    </section>
  );
}

/**
 * The harness's face, the path, and the face of whoever its asks go to, with the ask between. On
 * You's Allowed always card the left end is the workspace's harnesses, up to three faces overlapped.
 */
export function Hero(props: {
  readonly harness: string;
  /** More harnesses behind the first, drawn smaller and overlapped. */
  readonly also?: readonly string[] | undefined;
  /** Under the left end, when it is not the one harness's name. */
  readonly label?: string | undefined;
  readonly person: string;
  readonly personName: string;
  readonly face: Parameters<typeof Avatar>[0]["icon"];
}) {
  return (
    <div className="asking-hero" aria-hidden="true" data-testid="asking-hero">
      <span className="asking-end" data-wide={props.also?.length ? "true" : undefined}>
        {props.also?.length ? (
          <span className="asking-stack">
            {[props.harness, ...props.also].map((name) => (
              <Avatar key={name} name={name} kind="harness" size="sm" />
            ))}
          </span>
        ) : (
          <Avatar name={props.harness} kind="harness" size="lg" />
        )}
        <small>{props.label ?? props.harness}</small>
      </span>
      <span className="asking-path">
        <span className="asking-ask">
          <i />
          <i />
        </span>
      </span>
      <span className="asking-end">
        <span className="asking-person">
          <span className="asking-ring" />
          <Avatar
            name={props.personName}
            kind="person"
            size="lg"
            {...(props.face === undefined ? {} : { icon: props.face })}
          />
          <span className="asking-yes">
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        </span>
        <small>{props.person}</small>
      </span>
    </div>
  );
}

/**
 * Asks so far (ADR 0255): the heading and See all, the dots, the key that counts them and the line
 * under it, one button that grows every ask out of itself.
 */
function AsksSoFar(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly onOpenSpace: (spaceId: string) => void;
  readonly dots: readonly AskDot[];
  readonly askKey: readonly AskKey[];
  readonly line: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const counted = props.askKey.map((each) => each.words).join(", ");
  return (
    <div className="asking-history-part">
      <button
        type="button"
        ref={button}
        className="asking-history"
        data-testid="asking-history"
        aria-haspopup="dialog"
        aria-label={`${ASKS_SO_FAR}: ${counted}. ${props.line}. ${SEE_ALL}`}
        onClick={() => setOpen(true)}
      >
        <span className="asking-history-h">
          <strong>{ASKS_SO_FAR}</strong>
          <span className="asking-see">
            {SEE_ALL}
            <Icon name="next" size={12} />
          </span>
        </span>
        <Dots dots={props.dots} />
        <span className="asking-key" data-testid="asking-key">
          {props.askKey.map((each) => (
            <span key={each.dot}>
              <i className="asking-key-dot" data-dot={each.dot} />
              {each.words}
            </span>
          ))}
        </span>
        <span className="asking-note">{props.line}</span>
      </button>
      {open && (
        <AsksDialog
          model={props.model}
          directory={props.directory}
          harnessId={props.harnessId}
          selfId={props.selfId}
          from={button.current}
          onOpenSpace={props.onOpenSpace}
          onClosed={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** `2 on` in green while every rule is on, `1 of 2 on` in grey while one is off. */
function Count(props: { readonly rules: readonly { readonly on: boolean }[] }) {
  const words = alwaysCount(props.rules);
  if (words === undefined) return null;
  const all = props.rules.every((rule) => rule.on);
  return (
    <span className="asking-count" data-all={all ? "true" : undefined} data-testid="asking-count">
      {words}
    </span>
  );
}

/** The three promises, each on a flat tile in its own colour, its mark moving. */
function Promises(props: { readonly promises: readonly AskingPromise[] }) {
  return (
    <ul className="asking-promises">
      {props.promises.map((promise) => (
        <li key={promise.id} data-promise={promise.id} data-testid={`asking-promise-${promise.id}`}>
          <span className="asking-tile">
            <PromiseMark id={promise.id} />
          </span>
          <span className="asking-promise-words">
            <strong>{promise.title}</strong>
            <small>{promise.line}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A hand that waves now and then; a window whose tick draws itself; a clock whose hand turns. */
export function PromiseMark(props: { readonly id: AskingPromise["id"] }) {
  if (props.id === "big") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="mark-wave">
        <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-1V5a1.5 1.5 0 0 1 3 0v5m0 0V6a1.5 1.5 0 0 1 3 0v6m0-3.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.2L4.5 14.6a1.6 1.6 0 0 1 2.4-2.1L7 12.6" />
      </svg>
    );
  }
  if (props.id === "window") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
        <path d="M3 9h18" />
        <path className="mark-tick" d="m8.5 14.2 2.3 2.3 4.7-4.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12l3.2 1.9" />
      <path className="mark-hand" d="M12 12V6.8" />
    </svg>
  );
}

/** One dot per ask, popping in one after another as the section is first drawn. */
export function Dots(props: { readonly dots: readonly AskDot[] }) {
  return (
    <span className="asking-dots" aria-hidden="true">
      {props.dots.map((dot, at) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a dot's place is the ask's order.
          key={at}
          className="asking-dot"
          data-dot={dot}
          data-testid={`asking-dot-${dot}`}
          style={{ "--at": at } as CSSProperties}
        />
      ))}
    </span>
  );
}
