/**
 * The pieces You is built from on the desktop (ADR 0085): a card with a title, a row with a
 * label and a line under it, and the three controls a row holds — a switch, a choice from a
 * short list, and a segmented control. Flat, every one of them: no gradient, no highlight, no
 * shadow; a control here says what it is by its shape and its colour, and the motion is the
 * thumb sliding.
 */

import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";

/** A card: a titled section of the screen, with what it holds under the title. */
export function Card(props: {
  readonly label: string;
  readonly testId: string;
  readonly title: ReactNode;
  /** Beside the title, on the right: a count, a note, or the card's one button. */
  readonly aside?: ReactNode;
  /** A card under the workspace's heading is a level below the ones above it. */
  readonly level?: 2 | 3;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  const Heading = props.level === 3 ? "h3" : "h2";
  return (
    <section
      className={props.className === undefined ? "you-card" : `you-card ${props.className}`}
      aria-label={props.label}
      data-testid={props.testId}
    >
      <div className="you-card-h">
        <Heading>{props.title}</Heading>
        {props.aside}
      </div>
      {props.children}
    </section>
  );
}

/** One line of a card: what it is, a line under it saying what it means, and its control. */
export function Row(props: {
  readonly label: ReactNode;
  readonly sub?: ReactNode;
  readonly testId?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className={props.className === undefined ? "you-row" : `you-row ${props.className}`}
      data-testid={props.testId}
    >
      <span className="you-row-lab">
        <span>{props.label}</span>
        {props.sub !== undefined && <small>{props.sub}</small>}
      </span>
      {props.children}
    </div>
  );
}

/** A switch: a checkbox that says it is one, so a screen reader says on and off. */
export function Switch(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly testId?: string | undefined;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="you-switch"
      aria-label={props.label}
      aria-checked={props.checked}
      checked={props.checked}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.checked)}
      data-testid={props.testId}
    />
  );
}

/** A choice from a short list, as the platform's own menu, with a flat face on it. */
export function Choice<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}) {
  return (
    <span className="you-select">
      <select
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        {props.options.map(([value, words]) => (
          <option key={value} value={value}>
            {words}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Two to four answers side by side, one of them chosen: the platform's own radio group, so the
 * arrow keys and a screen reader work as they do anywhere, drawn as the phone's segmented
 * control, whose thumb slides to the answer chosen.
 */
export function Segmented<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
  /** The choices that can't be picked now: greyed, and passed over. */
  readonly disabled?: readonly T[];
}) {
  const name = useId();
  const at = props.options.findIndex(([value]) => value === props.value);
  return (
    <div
      className="you-seg"
      role="radiogroup"
      aria-label={props.label}
      style={{ "--at": Math.max(at, 0), "--n": props.options.length } as CSSProperties}
    >
      {props.options.map(([value, words]) => (
        <label key={value}>
          <input
            type="radio"
            name={name}
            value={value}
            checked={value === props.value}
            disabled={props.disabled?.includes(value)}
            onChange={() => props.onChange(value)}
          />
          <span>{words}</span>
        </label>
      ))}
    </div>
  );
}

/** A card's one error line, read out when it appears. */
export function Problem(props: { readonly error: string | undefined }) {
  if (props.error === undefined) return null;
  return (
    <p className="you-error" role="alert">
      {props.error}
    </p>
  );
}

/** The reason something failed, in words. */
export function reasonOf(failure: unknown, otherwise = "The server did not take it."): string {
  if (failure instanceof Error && failure.message !== "") return failure.message;
  return typeof failure === "string" && failure !== "" ? failure : otherwise;
}

/**
 * A name edited where it is shown: the heading is the field. Enter or leaving it saves, Escape
 * puts back what was there. The server's word replaces the draft, so a rename on another device
 * shows here; a name the server refuses stays in the field with its reason under it, and is not
 * sent again until it is changed. What you go by is one (ADR 0082), the workspace's another
 * (ADR 0194).
 */
export function NameField(props: {
  /** What the field is, for a screen reader: "Your name". */
  readonly label: string;
  readonly name: string;
  readonly rename: (name: string) => Promise<void>;
  readonly className: string;
  readonly testId: string;
  readonly autoComplete?: string;
}) {
  const [draft, setDraft] = useState(props.name);
  const [error, setError] = useState<string | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  /** A name on its way, or the one the server just refused: neither is sent twice. */
  const sent = useRef<string | undefined>(undefined);
  /** Escape was pressed: leaving the field puts the name back rather than saving it. */
  const reverting = useRef(false);
  useEffect(() => setDraft(props.name), [props.name]);

  const save = () => {
    const next = draft.trim();
    if (next === "") {
      setDraft(props.name);
      return;
    }
    if (next === props.name || next === sent.current) return;
    sent.current = next;
    setError(undefined);
    props.rename(next).catch((failure: unknown) => setError(reasonOf(failure)));
  };

  return (
    <form
      className={props.className}
      data-testid={props.testId}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <input
        ref={field}
        type="text"
        aria-label={props.label}
        maxLength={120}
        autoComplete={props.autoComplete ?? "off"}
        spellCheck={false}
        value={draft}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
          sent.current = undefined;
        }}
        onBlur={() => {
          if (reverting.current) reverting.current = false;
          else save();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          reverting.current = true;
          setDraft(props.name);
          setError(undefined);
          field.current?.blur();
        }}
      />
      {error !== undefined && (
        <p className="you-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
