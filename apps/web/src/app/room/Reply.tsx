/**
 * A reply in the room (ADR 0219), on the web and the Mac: the card quoting the message it answers,
 * inside its bubble above its words; the mark under a message that has replies; the pill that
 * takes the room back down to the reply; and the strip in the field while one is being written.
 * The phone's (`apps/mobile/src/spaces/ReplyCard.tsx`, `BackPill.tsx`), from the same reader
 * (`replyCard`).
 *
 * The card is a bar in the author's colour, their name and the day when it was not today, and two
 * lines of the words as they read now, with a small photo when the message holds one. A click goes
 * to the message, which the list lands on and lights (`MessageList`'s `land`), with a sweep of gold
 * across it. A message deleted, deleted for you or not in this room's history is said, and the card
 * goes nowhere.
 */

import {
  type Attachment,
  backToReplyWords,
  type ReplyCard as Card,
  type Directory,
  faceOf,
  repliesWords,
} from "@chipschat/core";
import { faceGround, Icon } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import type { FileService } from "../files.ts";

export function ReplyCard({
  card,
  mine,
  directory,
  files,
  onGo,
}: {
  readonly card: Card;
  /** On your own bubble, whose bar is white over its colours (`styles.css`). */
  readonly mine: boolean;
  readonly directory: Directory;
  readonly files?: FileService | undefined;
  /** Goes to the quoted line. */
  readonly onGo?: ((lineId: string) => void) | undefined;
}) {
  const goes = card.state === "shown" && onGo !== undefined;
  const bar =
    mine || card.authorId === undefined
      ? undefined
      : faceGround(card.name, faceOf(directory, card.authorId));
  const photo = card.holds?.kind === "photo" ? card.holds.attachment : undefined;
  const label = `Replying to ${card.name || "a message"}${card.day && `, ${card.day}`}: ${card.words}`;
  const inside = (
    <>
      <span className="reply-bar" style={bar === undefined ? undefined : { background: bar }} />
      <span className="reply-body">
        {card.name !== "" && (
          <span className="reply-name">
            {card.name}
            {card.day !== "" && <span className="reply-day"> · {card.day}</span>}
          </span>
        )}
        <span className="reply-words" data-gone={card.state === "shown" ? undefined : "true"}>
          {card.words}
        </span>
      </span>
      {photo !== undefined && files !== undefined && <Photo attachment={photo} files={files} />}
    </>
  );
  return goes ? (
    <button
      type="button"
      className="reply-card"
      aria-label={label}
      title="Go to the message"
      data-testid={`reply-card-${card.lineId}`}
      onClick={() => onGo(card.lineId)}
    >
      {inside}
    </button>
  ) : (
    <span
      className="reply-card"
      aria-label={label}
      role="note"
      data-testid={`reply-card-${card.lineId}`}
    >
      {inside}
    </span>
  );
}

/** The quoted photo, small, at the card's end. A picture that will not come leaves its ground. */
function Photo({
  attachment,
  files,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
}) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    files.thumb(attachment.id).then(
      (got) => {
        if (live) setUrl(got);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, attachment.id]);
  return (
    <span className="reply-photo">
      {url !== undefined && <img src={url} alt="" data-testid={`reply-photo-${attachment.id}`} />}
    </span>
  );
}

/** "↳ 1 reply" under a message that has replies; it goes to the newest. */
export function RepliesMark({
  replies,
  onGo,
}: {
  readonly replies: readonly string[];
  readonly onGo?: ((lineId: string) => void) | undefined;
}) {
  const newest = replies.at(-1);
  if (newest === undefined) return null;
  return (
    <button
      type="button"
      className="replies-mark"
      title="Go to the newest reply"
      data-testid={`replies-${newest}`}
      onClick={() => onGo?.(newest)}
    >
      <Icon name="route" size={13} />
      {repliesWords(replies.length)}
    </button>
  );
}

/** How long it takes to go, after which it is gone from the page. */
const LEAVE_MS = 180;

/** The reply the pill goes back to, and whether it is the reader's own. */
export interface BackTo {
  readonly id: string;
  readonly mine: boolean;
}

/**
 * "Back to your reply": over the room's foot, just above the field, after a card took the room up
 * to the message it quotes — "the reply" when it is someone else's. It goes once clicked, on a
 * send, or once the reply is in view again (`useBackToReply`).
 */
export function BackPill({
  back,
  onBack,
}: {
  readonly back: BackTo | undefined;
  readonly onBack: () => void;
}) {
  // Drawn while it leaves, saying what it said.
  const [shown, setShown] = useState(back !== undefined);
  const kept = useRef(back);
  if (back !== undefined) kept.current = back;
  useEffect(() => {
    if (back !== undefined) {
      setShown(true);
      return;
    }
    const gone = setTimeout(() => setShown(false), LEAVE_MS);
    return () => clearTimeout(gone);
  }, [back]);
  if (!shown) return null;
  return (
    <div className="undo-dock">
      <button
        type="button"
        className="back-pill"
        data-leaving={back === undefined ? "true" : undefined}
        data-testid="back-pill"
        onClick={onBack}
        disabled={back === undefined}
      >
        <Icon name="up" size={14} className="back-arrow" />
        {backToReplyWords(kept.current?.mine ?? true)}
      </button>
    </div>
  );
}

/**
 * The message being replied to, inside the field's box over the words (ADR 0219, point 2): a bar in
 * its author's colour, "Replying to Jacobian" with the day when it was earlier, and its first line.
 * Its × lets go of the reply, as Escape in the words does.
 */
export function ReplyStrip({
  card,
  directory,
  selfId,
  onLetGo,
}: {
  readonly card: Card;
  readonly directory: Directory;
  /** Whose your own message is: "Replying to yourself", as the phone says. */
  readonly selfId: string;
  readonly onLetGo: () => void;
}) {
  const bar =
    card.authorId === undefined
      ? undefined
      : faceGround(card.name, faceOf(directory, card.authorId));
  const who = card.authorId === selfId ? "yourself" : card.name || "a message";
  return (
    <div className="reply-strip" data-testid="reply-strip">
      <span className="reply-bar" style={bar === undefined ? undefined : { background: bar }} />
      <span className="reply-strip-body">
        <span className="reply-strip-who">
          Replying to <b>{who}</b>
          {card.day !== "" && ` · ${card.day}`}
        </span>
        <span className="reply-strip-words" data-gone={card.state === "shown" ? undefined : "true"}>
          {card.words}
        </span>
      </span>
      <button
        type="button"
        className="reply-strip-x"
        aria-label="Cancel reply"
        title="Cancel reply (Esc)"
        data-testid="reply-strip-x"
        onClick={onLetGo}
      >
        <Icon name="x" size={11} />
      </button>
    </div>
  );
}
