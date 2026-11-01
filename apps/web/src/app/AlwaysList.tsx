/**
 * Allowed always, as rows (ADR 0195): what a person's Always let a harness go ahead with, on the
 * harness card and on You's card. The phone's (`apps/mobile/src/harnesses/AlwaysList.tsx`) with an
 * × where the phone swipes.
 *
 * Each row is a key mark, what it allows in plain words (`actionWords`) with the harness's own kind
 * small under it, or the kind alone where Chips can't read it, and where it holds, who made it and
 * when; a command's rule is named by its start in code, `node --check …` (ADR 0239). At its right a
 * switch and an ×. Off keeps the rule in the list, dimmed, and the harness asks
 * again ("Off · Kit asks again"). The × asks nothing: the row breaks into dust as a message deleted
 * for you does (ADR 0167, `room/Dust.tsx`), closes, and Undo stands for five seconds. Only an owner
 * or admin changes these (`mayTurnDial`, SEC-1): for anybody else the switches are drawn and still,
 * and there is no ×.
 */

import { ALWAYS_EMPTY, type AlwaysRule } from "@chipschat/core";
import { useMemo, useRef } from "react";
import { DustProvider, useCrumble } from "./room/Dust.tsx";
import type { Always } from "./useAlways.ts";
import { Switch } from "./you/controls.tsx";

/** A key, the mark a standing yes wears. */
export function KeyMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="always-key">
      <circle cx="8" cy="14" r="3.5" />
      <path d="M10.5 11.5 19 3m-3.5 3.5 2.5 2.5m-5-1 2 2" />
    </svg>
  );
}

export function AlwaysList(props: {
  readonly rules: readonly AlwaysRule[];
  readonly always: Always;
  /** An owner or an admin: the switches turn and the × is there. */
  readonly may: boolean;
  readonly testId: string;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Around the empty list too, so the last row's dust is still in the air once the list is empty.
  return (
    <DustProvider list={list} onHidden={() => undefined}>
      {props.rules.length === 0 ? (
        <p className="always-empty" data-testid={`${props.testId}-empty`}>
          <span className="always-mark always-mark-empty">
            <KeyMark />
          </span>
          {ALWAYS_EMPTY}
        </p>
      ) : (
        <ul className="always-list" ref={list} data-testid={props.testId}>
          {props.rules.map((rule) => (
            <RuleRow key={rule.key} rule={rule} always={props.always} may={props.may} />
          ))}
        </ul>
      )}
    </DustProvider>
  );
}

function RuleRow(props: {
  readonly rule: AlwaysRule;
  readonly always: Always;
  readonly may: boolean;
}) {
  const { rule, always } = props;
  const row = useRef<HTMLLIElement>(null);
  const going = always.going === rule.key;
  // One object for each breaking, which is what the crumble starts on.
  const breaking = useMemo(
    () => (going ? { after: "me" as const, backwards: false } : undefined),
    [going],
  );
  useCrumble(row, breaking, {
    onWiped: () => always.wiped(rule),
    onDone: () => undefined,
  });
  return (
    <li
      ref={row}
      className="always-row"
      data-off={rule.on ? undefined : "true"}
      data-testid={`always-row-${rule.key}`}
    >
      <div className="always-row-body" data-crumbles="true">
        <span className="always-mark">
          <KeyMark />
        </span>
        <span className="always-words">
          {rule.start !== undefined ? (
            <code>{rule.start}</code>
          ) : rule.words === undefined ? (
            <code>{rule.kind}</code>
          ) : (
            <b>{rule.words}</b>
          )}
          <small>{rule.line}</small>
          {(rule.start !== undefined || rule.words !== undefined) && (
            <code className="always-kind">{rule.kind}</code>
          )}
        </span>
        <Switch
          label={`Allow ${rule.start ?? rule.kind} always`}
          checked={rule.on}
          disabled={!props.may || going}
          onChange={(on) => always.setOn(rule, on)}
        />
        {props.may && (
          <button
            type="button"
            className="always-remove"
            aria-label={`Remove ${rule.start ?? rule.kind}`}
            title="Remove: it asks again, and nothing is allowed always for it"
            disabled={going}
            onClick={() => always.remove(rule)}
            data-testid={`always-remove-${rule.key}`}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}
