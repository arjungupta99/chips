/**
 * The composer: where a person talks to a harness. Enter sends, Shift+Enter makes a line, the
 * box grows with the message, and the chips beside it — Steer, for now — are the slash
 * commands with a face. The commands themselves are M1.2's. Beside the clip, a microphone
 * starts a voice note where the page can record one; what records it is the app's.
 */

import type { KeyboardEvent, ReactNode, Ref } from "react";
import { AttachmentChip, type AttachmentKind } from "../attachment/attachment.js";
import { Button } from "../button/button.js";
import { Icon, type IconName } from "../icon/icon.js";
import "./composer.css";

export interface ComposerChip {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly active?: boolean;
  readonly onClick?: () => void;
}

export interface ComposerAttachment {
  readonly id: string;
  readonly name: string;
  readonly meta?: string;
  readonly kind?: AttachmentKind;
  readonly onRemove?: () => void;
}

export interface ComposerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: (value: string) => void;
  /** `Message Scout, or type / to steer, pause, or hand off…` */
  readonly placeholder?: string;
  /** The box's accessible name: `Message Scout`. */
  readonly label?: string;
  readonly disabled?: boolean;
  readonly onAttach?: () => void;
  /** Record a voice note. Without it there is no microphone. */
  readonly onRecord?: () => void;
  /** A voice note is being recorded, so the microphone is already in use. */
  readonly recording?: boolean;
  readonly chips?: readonly ComposerChip[];
  readonly attachments?: readonly ComposerAttachment[];
  /** Let an empty line go: the message is its attachments. */
  readonly canSendEmpty?: boolean;
  readonly maxRows?: number;
  readonly className?: string;
  /**
   * What leads the field, inside its box, before the words: who a message goes to, in a room of
   * several harnesses (the app's, ADR 0081). With it, or with `above`, the box is the field's
   * rather than the text box's own.
   */
  readonly lead?: ReactNode;
  /**
   * What the field opens upward into, inside the same box, over the words: a list to pick from, or
   * the message a reply answers (ADR 0219).
   */
  readonly above?: ReactNode;
  /** Escape in the words: what lets go of a reply (ADR 0219). */
  readonly onEscape?: (() => void) | undefined;
  /** The text box itself, for the app to put the caret in: a reply started takes it there. */
  readonly inputRef?: Ref<HTMLTextAreaElement>;
}

/** How many lines the box needs, one per line break, up to the cap. */
export function rowsFor(value: string, maxRows: number): number {
  return Math.min(maxRows, Math.max(1, value.split("\n").length));
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder = "Message…",
  label = "Message",
  disabled = false,
  onAttach,
  onRecord,
  recording = false,
  chips = [],
  attachments = [],
  canSendEmpty = false,
  maxRows = 8,
  className,
  lead,
  above,
  onEscape,
  inputRef,
}: ComposerProps) {
  const ready = !disabled && (value.trim() !== "" || canSendEmpty);

  const send = () => {
    if (ready) onSend(value);
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && onEscape !== undefined && !event.nativeEvent.isComposing) {
      onEscape();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div
      className={className === undefined ? "ui-composer" : `ui-composer ${className}`}
      data-disabled={disabled ? "true" : undefined}
    >
      {attachments.length > 0 && (
        <ul className="ui-composer__attachments" aria-label="Attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <AttachmentChip
                name={attachment.name}
                {...(attachment.meta === undefined ? {} : { meta: attachment.meta })}
                {...(attachment.kind === undefined ? {} : { kind: attachment.kind })}
                {...(attachment.onRemove === undefined ? {} : { onRemove: attachment.onRemove })}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="ui-composer__row">
        {onAttach !== undefined && (
          <Button
            icon="clip"
            iconOnly
            aria-label="Attach a photo or file"
            onClick={onAttach}
            disabled={disabled}
            className="ui-composer__attach"
          />
        )}
        {onRecord !== undefined && (
          <Button
            icon="mic"
            iconOnly
            aria-label="Record a voice note"
            aria-pressed={recording}
            onClick={onRecord}
            disabled={disabled || recording}
            className="ui-composer__attach"
          />
        )}
        <Field lead={lead} above={above}>
          <textarea
            ref={inputRef}
            className="ui-composer__input"
            aria-label={label}
            placeholder={placeholder}
            value={value}
            rows={rowsFor(value, maxRows)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={keyDown}
          />
        </Field>
        {chips.map((chip) => (
          <button
            type="button"
            key={chip.id}
            className="ui-composer__chip"
            data-active={chip.active === true ? "true" : undefined}
            onClick={chip.onClick}
            disabled={disabled}
          >
            {chip.icon !== undefined && <Icon name={chip.icon} size={12} />}
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          className="ui-composer__send"
          aria-label="Send"
          // By the name the film's render presses it by (ADR 0217, `taps` in a beats file).
          data-testid="composer-send"
          onClick={send}
          disabled={!ready}
        >
          <Icon name="up" />
        </button>
      </div>
    </div>
  );
}

/**
 * The text box, alone as it always was; or, with something to lead it or to open into, one box
 * holding that and the words, which grows upward as `above` comes.
 *
 * Alone, it stands in the same two wrappers, which then draw nothing (`data-bare`): a text box that
 * moved into them when a lead came, as a room's first agent joined, was a new text box to React,
 * and took the reader's focus and what they were typing with the old one (1 November 2026).
 */
function Field({
  lead,
  above,
  children,
}: {
  readonly lead: ReactNode;
  readonly above: ReactNode;
  readonly children: ReactNode;
}) {
  const bare = lead === undefined && above === undefined;
  return (
    <div
      className="ui-composer__field"
      data-bare={bare ? "true" : undefined}
      data-open={above ? "true" : undefined}
    >
      {above}
      <div className="ui-composer__line">
        {lead}
        {children}
      </div>
    </div>
  );
}
