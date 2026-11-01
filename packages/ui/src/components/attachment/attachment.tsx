/**
 * A file, as a chip: the name, what it is, and how big. In a composer it can be taken back
 * out; in a message it can be opened. The icon says what kind of thing it is, the words say
 * which one.
 */

import { Icon, type IconName } from "../icon/icon.js";
import "./attachment.css";

export type AttachmentKind = "file" | "image" | "video" | "audio";

const ICON_FOR: Readonly<Record<AttachmentKind, IconName>> = {
  file: "doc",
  image: "camera",
  video: "camera",
  audio: "mic",
};

export interface AttachmentChipProps {
  readonly name: string;
  /** `212 KB · 2 pages`, already formatted. */
  readonly meta?: string;
  readonly kind?: AttachmentKind;
  /** Where the file opens. Makes the chip a link. */
  readonly href?: string;
  /** Lets a person take the file back out of a composer. */
  readonly onRemove?: () => void;
  readonly className?: string;
}

export function AttachmentChip({
  name,
  meta,
  kind = "file",
  href,
  onRemove,
  className,
}: AttachmentChipProps) {
  const classes = className === undefined ? "ui-attachment" : `ui-attachment ${className}`;
  const body = (
    <>
      <Icon name={ICON_FOR[kind]} />
      <span className="ui-attachment__name">{name}</span>
      {meta !== undefined && <small className="ui-attachment__meta">{meta}</small>}
    </>
  );

  return (
    <span className={classes} data-kind={kind}>
      {href === undefined ? (
        <span className="ui-attachment__body">{body}</span>
      ) : (
        <a className="ui-attachment__body" href={href}>
          {body}
        </a>
      )}
      {onRemove !== undefined && (
        <button
          type="button"
          className="ui-attachment__remove"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}
