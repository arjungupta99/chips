import { groundVar, Icon, type IconName } from "@chipschat/ui";
import type { ReactNode } from "react";
import { Swap } from "./Swap.tsx";

/**
 * A row in one of a page's groups, as the phone's `GroupRow`: a mark, its label, a value at its
 * right and a chevron when it opens something; quiet, accent or red by its tone. A harness's page
 * (ADR 0266) and an agent's card (ADR 0270) are made of them, in the `.ctx-group` cards an agent's
 * Model and Context groups stand in.
 */
export function GroupRow(props: {
  readonly label: string;
  readonly value?: string | undefined;
  readonly sub?: string | undefined;
  readonly mark?: { readonly icon: IconName; readonly ground: number } | undefined;
  /** A face for its mark, drawn as it is, in place of an icon on a ground: an agent's Icon row. */
  readonly face?: ReactNode;
  readonly tone?: "accent" | "danger" | "off" | undefined;
  /** What a press does, told what was pressed, for a dialog that grows out of it. */
  readonly onClick?: ((from: HTMLElement) => void) | undefined;
  readonly testId?: string | undefined;
  /** Gold, for Restart while the harness can't answer. */
  readonly loud?: boolean | undefined;
  readonly lines?: 1 | 2 | undefined;
  /** The value's own test id, for a value that arrives after the row. */
  readonly valueTestId?: string | undefined;
}) {
  const inner = (
    <>
      {props.mark !== undefined && (
        <span
          className="ctx-tile hp-mark"
          style={{ background: groundVar(props.mark.ground) }}
          aria-hidden="true"
        >
          <Icon name={props.mark.icon} size={17} />
        </span>
      )}
      {props.face}
      <span className="ctx-row-words">
        <span className="ctx-row-title" data-lines={props.lines === 2 ? "2" : undefined}>
          {props.label}
        </span>
        {props.sub !== undefined && <span className="ctx-row-line">{props.sub}</span>}
      </span>
      {props.value !== undefined && (
        <span className="hp-value" data-testid={props.valueTestId}>
          {/* A value that changes crossfades where it stands ("3 of 9 · heard now"). */}
          <Swap id={props.value} className="hp-value-words">
            {props.value}
          </Swap>
        </span>
      )}
      {props.onClick !== undefined && props.tone === undefined && (
        <span className="ctx-row-chev" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  if (props.onClick === undefined) {
    return (
      <li className="ctx-row hp-row" data-tone={props.tone} data-testid={props.testId}>
        {inner}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className="ctx-row hp-row"
        data-tone={props.tone}
        data-loud={props.loud === true ? "true" : undefined}
        onClick={(event) => props.onClick?.(event.currentTarget)}
        data-testid={props.testId}
      >
        {inner}
      </button>
    </li>
  );
}
