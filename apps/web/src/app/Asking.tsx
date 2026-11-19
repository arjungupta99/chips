/**
 * What a harness's Permissions (ADR 0299) and an agent's share, from When it asks you (ADR 0195,
 * Arjun's pick of the mock "When it asks you, simpler", version 2), which they took the place of:
 *
 * - **The ask travels** (`Hero`): the harness's face, a dotted path, the face of whoever its asks go
 *   to; an ask leaves the harness, lands with them in amber, a ring pulses and a green tick pops,
 *   and the answered ask goes back green. CSS keyframes; with Reduce Motion the ask rests halfway.
 *   On a harness's Permissions its two gates stand on the path.
 * - **Asks so far** (ADR 0255): the dots, one per ask the reader can see, a key that counts them and
 *   the line under it; a click anywhere on them, or on See all, grows every ask out of them
 *   (`AsksDialog`).
 * - **The count** of rules on, `2 on`, `1 of 2 on`.
 */

import {
  ASKS_SO_FAR,
  type AskDot,
  type AskKey,
  alwaysCount,
  type Directory,
  SEE_ALL,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { AsksDialog } from "./AsksDialog.tsx";

/** What Undo does, on hover and to a screen reader. */
export const UNDO_TITLE = "Puts the rule back, so it goes ahead without asking again";

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
  /** The face at the left end, when it is an agent's rather than the harness's (ADR 0286). */
  readonly own?: ReactNode;
  /** It is working without asking: no ask flies, the path runs gold, and the person steps back. */
  readonly working?: boolean | undefined;
  /**
   * The two gates on the path (ADR 0299): its own settings, then Chips, each with what it says
   * under its name: `23 run`, `2 rules`.
   */
  readonly gates?:
    | {
        readonly own: string;
        readonly ownLabel: string;
        /** Absent while its Chips's rules are off (ADR 0300): one gate. */
        readonly chips?: string | undefined;
        readonly chipsLabel: string;
      }
    | undefined;
}) {
  return (
    <div
      className="asking-hero"
      aria-hidden="true"
      data-testid="asking-hero"
      data-working={props.working === true ? "true" : undefined}
    >
      <span className="asking-end" data-wide={props.also?.length ? "true" : undefined}>
        {props.own !== undefined ? (
          props.own
        ) : props.also?.length ? (
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
      <span className="asking-path" data-gates={props.gates === undefined ? undefined : "true"}>
        <span className="asking-ask">
          <i />
          <i />
        </span>
        {props.gates !== undefined && (
          <span className="asking-gates">
            <span className="asking-gate" data-gate="own">
              <b>{props.gates.ownLabel}</b>
              <small>{props.gates.own}</small>
            </span>
            {props.gates.chips !== undefined && (
              <span className="asking-gate" data-gate="chips">
                <b>{props.gates.chipsLabel}</b>
                <small>{props.gates.chips}</small>
              </span>
            )}
          </span>
        )}
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
export function AsksSoFar(props: {
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
export function Count(props: { readonly rules: readonly { readonly on: boolean }[] }) {
  const words = alwaysCount(props.rules);
  if (words === undefined) return null;
  const all = props.rules.every((rule) => rule.on);
  return (
    <span className="asking-count" data-all={all ? "true" : undefined} data-testid="asking-count">
      {words}
    </span>
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
