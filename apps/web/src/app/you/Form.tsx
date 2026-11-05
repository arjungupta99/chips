/**
 * A short setting of You's (ADR 0265): what the phone opens in a sheet, the Mac and the web open as
 * a page, beside the list where You is wide enough for both and in its place where it is not, as
 * People and Relay open (the addendum of 3 November 2026, Arjun: "please have them open in the
 * side panel"). Its bar is a page's: its name, and the way back where there is one. A form that
 * saves only when told (Attachment limits, Messages between agents) has Cancel and Save at its foot,
 * and Enter in a field is Save; one that saves as it is changed has neither.
 *
 * It stands where its host says (`useFormHost`): You's pane for a row of the list, or a page's own
 * place for what that page opens, with ‹ back to it. Drawn alone, with no host (a test), it stands
 * where it is. Opened, the keyboard goes into it; closed by its own hand, back to its row.
 */

import { Button, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { pathUnder } from "./motion.ts";
import { useFormHost } from "./pane.tsx";

/** What a form's insides may do to it: a choice that is the whole form closes it once made. */
export interface FormLeave {
  /** Close the page, and go back to the row that opened it. */
  readonly close: () => void;
}

export function FormPage(props: {
  readonly title: string;
  /** The row or button that opened it, which has the keyboard again once it closes. */
  readonly from: HTMLElement | null;
  readonly testId: string;
  /** Save, for a form that saves only when told: false keeps the page up (a refusal). */
  readonly onSave?: (() => boolean) | undefined;
  /** The page has closed, and its owner forgets it. */
  readonly onGone: () => void;
  /** What has the keyboard when it opens: the first field or choice in it, else its name. */
  readonly focus?: string | undefined;
  readonly children: (leave: FormLeave) => ReactNode;
}) {
  const host = useFormHost();
  const title = useId();
  const page = useRef<HTMLElement>(null);
  const self = useRef(false);
  const onGone = useRef(props.onGone);
  onGone.current = props.onGone;
  const close = () => {
    self.current = true;
    onGone.current();
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it opens and as it goes
  useEffect(() => {
    const enter = () => page.current?.querySelector<HTMLElement>(props.focus ?? "h2")?.focus();
    if (host === undefined) enter();
    host?.opened(props.testId, props.from, { enter, close: () => onGone.current() });
    return () => host?.gone(props.testId, self.current);
  }, []);
  const { onSave } = props;
  const drawn = (
    <section
      ref={page}
      className="you-pane"
      aria-labelledby={title}
      data-view={pathUnder(host?.path ?? "", props.testId)}
      data-testid={props.testId}
    >
      <div className="you-pane-bar">
        {host?.back !== undefined && (
          <button type="button" className="you-pane-back" onClick={close}>
            ‹ {host.back}
          </button>
        )}
        <h2 id={title} tabIndex={-1}>
          {props.title}
        </h2>
      </div>
      <Frame
        onSubmit={
          onSave === undefined
            ? undefined
            : () => {
                if (onSave()) close();
              }
        }
      >
        <div className="you-pane-body">
          <div className="you-page you-form-body">{props.children({ close })}</div>
        </div>
        {onSave !== undefined && (
          <div className="you-pane-foot">
            <Button onClick={close} data-testid={`${props.testId}-cancel`}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" data-testid={`${props.testId}-save`}>
              Save
            </Button>
          </div>
        )}
      </Frame>
    </section>
  );
  if (host === undefined) return drawn;
  return host.slot === null ? null : createPortal(drawn, host.slot);
}

/**
 * The page under its bar: a `<form>` where Save submits it, and Enter in a field is Save;
 * otherwise a plain box, since a form that saves as it changes may hold a name field with a form
 * of its own.
 */
function Frame(props: {
  readonly onSubmit: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const { onSubmit } = props;
  if (onSubmit === undefined) return <div className="you-form-card">{props.children}</div>;
  return (
    <form
      className="you-form-card"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {props.children}
    </form>
  );
}

/**
 * One answer of a few, as the phone's sheets list them: each a row with what it means under it, a
 * tick on the one chosen. A radio group, so the arrow keys move through it.
 */
export function ChoiceList<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly words: string; readonly sub?: string }[];
  readonly onChange: (value: T) => void;
  readonly testId?: string | undefined;
}) {
  const name = useId();
  return (
    <div
      className="you-choices"
      role="radiogroup"
      aria-label={props.label}
      data-testid={props.testId}
    >
      {props.options.map((option) => (
        <label key={option.value} className="you-choice">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === props.value}
            onChange={() => props.onChange(option.value)}
          />
          <span className="you-choice-lab">
            <span>{option.words}</span>
            {option.sub !== undefined && <small>{option.sub}</small>}
          </span>
          <span className="you-choice-tick" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
        </label>
      ))}
    </div>
  );
}
