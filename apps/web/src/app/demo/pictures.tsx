/**
 * What the film draws over the app itself (ADR 0213): the lock screen, which is a picture with the
 * agent's question on it, drawn by the render mode; and the end card, over the video's last frame
 * (ADR 0217). Neither is a screen of the app: the demo never posts a notification, and the end
 * card is the film's own last word.
 */

import type { DemoLockScreen, FilmEnd } from "@chipschat/core";
import { ChipMark, Icon } from "@chipschat/ui";
import { type ReactNode, useId } from "react";

/** The day and the time on the lock screen: this one's, as a phone would show it. */
function lockTime(now: Date): { readonly day: string; readonly time: string } {
  const day = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { day, time: time.replace(/\s?[AP]M$/i, "") };
}

/**
 * A phone's lock screen, drawn: the time, and the question as a notification would put it, with
 * the picture's own Approve, which answers through the store as the room's card does. Once it is
 * answered, it says so.
 */
export function LockPicture(props: {
  readonly lock: DemoLockScreen;
  readonly onApprove: () => void;
  readonly now?: Date | undefined;
}) {
  const { lock } = props;
  const { day, time } = lockTime(props.now ?? new Date());
  return (
    <section className="demo-lock" data-testid="demo-lock" aria-label="Lock screen">
      <div className="demo-lock-clock" aria-hidden="true">
        <span>{day}</span>
        <b>{time}</b>
      </div>
      <article
        className="demo-lock-note"
        aria-label={`${lock.who} asks in ${lock.room}`}
        data-answered={lock.answered ? "true" : undefined}
      >
        <header>
          <ChipMark size={20} />
          <b>Chips</b>
          <time>now</time>
        </header>
        <b className="demo-lock-who">
          {lock.who} · {lock.room}
        </b>
        <p>{lock.question}</p>
        {lock.answered ? (
          <p className="demo-lock-done" data-testid="demo-lock-done">
            <Icon name="check" size={14} /> Approved
          </p>
        ) : (
          <button
            type="button"
            className="demo-lock-approve"
            data-testid="demo-lock-approve"
            onClick={props.onApprove}
          >
            Approve
          </button>
        )}
      </article>
    </section>
  );
}

/** A film offered after another, under More walkthroughs: its length as a player shows it. */
export interface OfferedFilm {
  readonly key: string;
  readonly title: string;
  /** `1:14`, from core's `lengthWords`. */
  readonly length: string;
}

/**
 * The end card: the film's last words, and the ways on (ADR 0213, point 7; ADR 0217's addendum of
 * 26 October), with the films that follow this one under More walkthroughs. Over the film's end in
 * the full-screen player, with the mark; on the first screen, in the film's place, where the mark
 * at the top stands for its own, and where Set up my own Chips and I have an invite open what they
 * open under themselves.
 */
export function EndCard(props: {
  /** What it says: the film's (`FilmEnd`), "That's Chips". */
  readonly words: FilmEnd;
  /** The other films, offered under More walkthroughs; none, and the heading goes too. */
  readonly more: readonly OfferedFilm[];
  readonly onSetUp: () => void;
  readonly onInvite: () => void;
  readonly onFilm: (film: string) => void;
  readonly onLookAround: () => void;
  readonly onWatchAgain: () => void;
  /** Over the film's end, or in its place on the first screen. */
  readonly place?: "over" | "page";
  /** On the first screen, which of the two ways in is open: the ways in, or the invite field. */
  readonly open?: "own" | "invite" | undefined;
  /** What opens under I have an invite, on the first screen: the field to paste into. */
  readonly invite?: ReactNode;
}) {
  const { words, place = "over" } = props;
  const titleId = useId();
  const expanded = (way: "own" | "invite") => (place === "page" ? props.open === way : undefined);
  return (
    <section
      className="demo-end"
      data-place={place}
      data-testid="demo-end"
      aria-labelledby={titleId}
    >
      <div className="demo-end-in">
        {place === "over" && <ChipMark size={46} />}
        <h2 id={titleId}>{words.line}</h2>
        <p>{words.sentence}</p>
        <button
          type="button"
          className="demo-gold"
          aria-expanded={expanded("own")}
          data-testid="demo-set-up"
          onClick={props.onSetUp}
        >
          Set up my own Chips
        </button>
        <button
          type="button"
          className="demo-raised"
          aria-expanded={expanded("invite")}
          data-testid="demo-invite"
          onClick={props.onInvite}
        >
          I have an invite
        </button>
        {props.invite}
        {props.more.length > 0 && (
          <div className="demo-end-more">
            <h3>More walkthroughs</h3>
            <ul>
              {props.more.map((film) => (
                <li key={film.key}>
                  <button
                    type="button"
                    aria-label={`${film.title}, ${film.length}`}
                    data-testid={`demo-film-${film.key}`}
                    onClick={() => props.onFilm(film.key)}
                  >
                    <span className="demo-end-play" aria-hidden="true">
                      <Icon name="play" size={14} />
                    </span>
                    <span>{film.title}</span>
                    <small>{film.length}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="demo-end-links">
          <button type="button" className="demo-link" onClick={props.onLookAround}>
            Look around
          </button>
          <button
            type="button"
            className="demo-link demo-link-quiet"
            data-testid="demo-again"
            onClick={props.onWatchAgain}
          >
            <Icon name="again" size={14} />
            Watch again
          </button>
        </div>
      </div>
    </section>
  );
}
