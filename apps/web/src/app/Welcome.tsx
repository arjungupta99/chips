/**
 * The first screen, in a browser and in the Mac app (ADR 0213, point 9; ADR 0217's addendum of 26
 * October): the film, playing, with the ways in at its end.
 *
 * At the top, in the middle, the Chips mark and its name, its pins lit once round as the page
 * opens. Under them, Watch Chips work and its length, then the film in a frame as tall as the
 * window allows, playing at once with no sound, its chapter bar along its top. A click on its right
 * goes on a part, on its left back (`FilmFace`), and → and ← do the same; a press held keeps it
 * waiting. At the foot, Paste an invite link and a gold Skip. When the film ends, or is skipped,
 * That's Chips takes its place: Set up my own Chips, which opens the page's ways in under it as
 * they have always been; I have an invite, which opens the field to paste into; the other films
 * under More walkthroughs, which play in the same frame; Look around and Watch again. A computer
 * has no camera to point at a code, so Paste stands where the phone has Scan a QR code.
 */

import { type FilmVideo, filmOf, lengthWords } from "@chipschat/core";
import { ChipMark } from "@chipschat/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { EndCard } from "./demo/pictures.tsx";
import { useStill } from "./demo/useStill.ts";
import { FilmBar, FilmFace, moreThan, Skip, useFilm } from "./film/FilmPlayer.tsx";
import { VIDEOS, videoNamed } from "./film/videos.ts";

/** Which of the ways on is open under the film: none yet, the invite field, or the ways in. */
export type Way = "welcome" | "invite" | "own";

/** As long as the mark's pins take to light once round (`ui-mark-pin`). */
const LIGHT_MS = 1500;

export function WelcomeTop(props: {
  readonly way: Way;
  readonly onWay: (way: Way) => void;
  /** Look around: the demo made and put in front. */
  readonly onLookAround: () => void;
  /** What was pasted into the invite field: the page decides what it is, and says so if not one. */
  readonly onPasted: (text: string) => ReactNode;
}) {
  const titleId = useId();
  const [key, setKey] = useState(VIDEOS[0]?.key);
  // Sent here on one of its ways, from the demo or a film's end card: That's Chips, that way open.
  const [opensEnded, setOpensEnded] = useState(props.way !== "welcome");
  const video = videoNamed(key);
  return (
    <section className="welcome" data-testid="welcome" aria-labelledby={titleId}>
      <Brand id={titleId} />
      {video !== undefined && (
        <WelcomeFilm
          key={video.key}
          video={video}
          opensEnded={opensEnded}
          way={props.way}
          onWay={props.onWay}
          onFilm={(next) => {
            // The ways in are That's Chips'; another film folds them away.
            if (props.way === "own") props.onWay("welcome");
            setOpensEnded(false);
            setKey(next);
          }}
          onLookAround={props.onLookAround}
          onPasted={props.onPasted}
        />
      )}
    </section>
  );
}

/** The Chips mark and its name, at the top in the middle: the pins lit once round, then still. */
function Brand({ id }: { readonly id: string }) {
  const still = useStill();
  const [lit, setLit] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLit(false), LIGHT_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="welcome-brand">
      <ChipMark size={40} state={lit && !still ? "working" : undefined} />
      <h1 id={id}>Chips</h1>
    </div>
  );
}

/**
 * A film in the first screen's frame, and its foot; at its end, That's Chips in its place. The
 * frame stays, hidden, under the end card, so Watch again plays from where it is.
 */
function WelcomeFilm(props: {
  readonly video: FilmVideo;
  readonly opensEnded: boolean;
  readonly way: Way;
  readonly onWay: (way: Way) => void;
  readonly onFilm: (film: string) => void;
  readonly onLookAround: () => void;
  readonly onPasted: (text: string) => ReactNode;
}) {
  const { video, way } = props;
  const film = useFilm(video, { ended: props.opensEnded });
  const toggle = (to: Way) => props.onWay(way === to ? "welcome" : to);
  const invite = way === "invite" ? <InviteField onPasted={props.onPasted} /> : null;
  return (
    <>
      {!film.ended && (
        <h2 className="welcome-watch">
          {video.title} <small>{lengthWords(video.seconds)}</small>
        </h2>
      )}
      <div
        className="welcome-film"
        data-theme="dark"
        data-testid="welcome-film"
        hidden={film.ended}
      >
        <FilmFace film={film} />
        <FilmBar film={film} />
      </div>
      {film.ended ? (
        <EndCard
          place="page"
          words={filmOf(video.key).end}
          more={moreThan(video)}
          open={way === "welcome" ? undefined : way}
          invite={invite}
          onSetUp={() => toggle("own")}
          onInvite={() => toggle("invite")}
          onFilm={props.onFilm}
          onLookAround={props.onLookAround}
          onWatchAgain={() => {
            // The ways in are That's Chips'; the invite field stays with the film's foot.
            if (way === "own") props.onWay("welcome");
            film.goTo(0);
          }}
        />
      ) : (
        <>
          <div className="welcome-foot">
            <button
              type="button"
              className="welcome-paste"
              aria-expanded={way === "invite"}
              onClick={() => toggle("invite")}
            >
              Paste an invite link
            </button>
            <Skip onSkip={film.end} />
          </div>
          {invite}
        </>
      )}
    </>
  );
}

/** The paste field, with the cursor in it, and what the page made of what was pasted. */
function InviteField(props: { readonly onPasted: (text: string) => ReactNode }) {
  const [text, setText] = useState("");
  const [said, setSaid] = useState<ReactNode>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  return (
    <div className="welcome-invite">
      <input
        ref={field}
        type="url"
        aria-label="Invite link"
        placeholder="The link from the message they sent"
        autoComplete="off"
        spellCheck={false}
        value={text}
        data-testid="welcome-invite"
        onChange={(event) => {
          setText(event.target.value);
          setSaid(event.target.value.trim() === "" ? null : props.onPasted(event.target.value));
        }}
      />
      {said === null || said === undefined ? null : (
        <p className="welcome-invite-said" role="status">
          {said}
        </p>
      )}
    </div>
  );
}
