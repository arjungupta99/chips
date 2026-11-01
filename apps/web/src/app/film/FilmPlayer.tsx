/**
 * The film's player on the web and in the Mac app (ADR 0217; its addendum of 26 October): the
 * video `pnpm film` rendered, at the window's height and centred, dark in both appearances, as a
 * video player is. Around it, Chips' own chrome, as on the phone: the green chapter bar along the
 * film's top, a segment a part, filled from the video's time, where a click goes to that part;
 * Pause and Leave at the window's top right, and Skip at its bottom right. A click on the film's
 * right goes on a part, on its left back to the part's start, or to the part before when this one
 * has only just begun; a press held keeps it waiting, and → and ← do what the clicks do. When the
 * video ends, or is skipped, the app's own end card stands over it, in the app's own appearance.
 *
 * The first screen plays the film in a frame of its own (`Welcome.tsx`) with the same pieces:
 * `useFilm`, `FilmFace`, `FilmBar` and `Skip`.
 *
 * It is a modal dialog: nothing behind it takes the focus, and Escape leaves. The film is fetched
 * whole and played from memory, as a room's videos are. The server that serves the page answers
 * no byte ranges, and WebKit plays a video only from a server that does, or from memory.
 */

import {
  BACK_SIDE,
  backPartAt,
  chapterAt,
  chaptersOf,
  type FilmBeat,
  type FilmVideo,
  fillOf,
  filmOf,
  lengthWords,
  nextPartAt,
  spokenOf,
} from "@chipschat/core";
import { Icon, type IconName } from "@chipschat/ui";
import {
  type MouseEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EndCard, type OfferedFilm } from "../demo/pictures.tsx";
import { useStill } from "../demo/useStill.ts";
import { SOURCES, VIDEOS } from "./videos.ts";

/** What the player does with a click on its chrome; Watch again is its own. */
export interface FilmWays {
  readonly onLeave: () => void;
  readonly onSetUp: () => void;
  readonly onInvite: () => void;
  readonly onFilm: (film: string) => void;
  readonly onLookAround: () => void;
}

/** A press held this long on the film keeps it waiting, as on the phone. */
const HOLD_MS = 280;

/**
 * A film as a page plays it: its video, fetched whole, where it stands as its element says, and
 * the ways to move it.
 */
export interface Film {
  readonly video: FilmVideo;
  readonly element: RefObject<HTMLVideoElement | null>;
  /** The film's bytes in memory, once fetched; `failed` when they could not be. */
  readonly address: string | "failed" | undefined;
  readonly time: number;
  readonly playing: boolean;
  readonly ended: boolean;
  /** The video sent to `time` and played from there: a segment, a click, or Watch again. */
  readonly goTo: (time: number) => void;
  /** Paused, or played again; not once it has ended. */
  readonly toggle: () => void;
  /** The next part, and from the last, the end. */
  readonly next: () => void;
  /** This part from its start, or the part before when this one has only just begun. */
  readonly back: () => void;
  /** Kept waiting while a press is held, and played on as it lifts. */
  readonly hold: (held: boolean) => void;
  /** Skip: the end at once, as the video's own end is. */
  readonly end: () => void;
  /** What the element tells, handed to it. */
  readonly heard: {
    readonly onTimeUpdate: () => void;
    readonly onPlay: () => void;
    readonly onPause: () => void;
    readonly onEnded: () => void;
  };
}

/** A film to play, fetched as it is asked for; `ended` opens it on its end card. */
export function useFilm(video: FilmVideo, opens?: { readonly ended?: boolean }): Film {
  const element = useRef<HTMLVideoElement>(null);
  const address = useFilmBytes(SOURCES[video.key]);
  const [time, setTime] = useState(opens?.ended === true ? video.seconds : 0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(opens?.ended === true);
  const holding = useRef(false);
  const now = () => element.current?.currentTime ?? time;
  const goTo = (to: number) => {
    const shown = element.current;
    if (shown === null) return;
    shown.currentTime = to;
    setTime(to);
    setEnded(false);
    void shown.play().catch(() => undefined);
  };
  const end = () => {
    element.current?.pause();
    setTime(video.seconds);
    setPlaying(false);
    setEnded(true);
  };
  return {
    video,
    element,
    address,
    time,
    playing,
    ended,
    goTo,
    toggle: () => {
      const shown = element.current;
      if (shown === null || ended) return;
      if (playing) shown.pause();
      else void shown.play().catch(() => undefined);
    },
    next: () => {
      const to = nextPartAt(video, now());
      if (to === undefined) end();
      else goTo(to);
    },
    back: () => goTo(backPartAt(video, now())),
    hold: (held) => {
      const shown = element.current;
      if (shown === null || ended || holding.current === held) return;
      holding.current = held;
      if (held) shown.pause();
      else void shown.play().catch(() => undefined);
    },
    end,
    heard: {
      onTimeUpdate: () => setTime(element.current?.currentTime ?? 0),
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: end,
    },
  };
}

/** The film's bytes as an address in memory, once fetched; `failed` when they could not be. */
function useFilmBytes(source: string | undefined): string | "failed" | undefined {
  const [address, setAddress] = useState<string | "failed" | undefined>(undefined);
  useEffect(() => {
    if (source === undefined) {
      setAddress("failed");
      return;
    }
    let made: string | undefined;
    let gone = false;
    void fetch(source)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(answer.status)))
      .then((bytes) => {
        if (gone) return;
        made = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        setAddress(made);
      })
      .catch(() => {
        if (!gone) setAddress("failed");
      });
    return () => {
      gone = true;
      if (made !== undefined) URL.revokeObjectURL(made);
    };
  }, [source]);
  return address;
}

export function FilmPlayer({
  video,
  ways,
}: {
  readonly video: FilmVideo;
  readonly ways: FilmWays;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const film = useFilm(video);
  useEffect(() => {
    const shown = dialog.current;
    if (shown === null) return;
    if (!shown.open) shown.showModal();
    // The film holds the focus, not its first part, which WebKit rings: Tab goes on to the bar.
    shown.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="film-player"
      data-testid="film-player"
      tabIndex={-1}
      aria-label={video.title}
      onCancel={(event) => {
        event.preventDefault();
        ways.onLeave();
      }}
    >
      <div className="film-frame" data-theme="dark">
        <FilmFace film={film} />
        <FilmBar film={film} />
      </div>
      {film.ended ? (
        <EndCard
          words={filmOf(video.key).end}
          more={moreThan(video)}
          onSetUp={ways.onSetUp}
          onInvite={ways.onInvite}
          onFilm={ways.onFilm}
          onLookAround={ways.onLookAround}
          onWatchAgain={() => film.goTo(0)}
        />
      ) : (
        <div className="film-foot" data-theme="dark">
          <Skip onSkip={film.end} />
        </div>
      )}
      <Chrome film={film} onLeave={ways.onLeave} />
    </dialog>
  );
}

/** The films to offer after this one: every other there is a video of, with its length. */
export function moreThan(video: FilmVideo): readonly OfferedFilm[] {
  return VIDEOS.filter((each) => each.key !== video.key).map((each) => ({
    key: each.key,
    title: each.title,
    length: lengthWords(each.seconds),
  }));
}

/** The side of the film a click went to, and which way, numbered so each click lights it again. */
interface Flashed {
  readonly side: "left" | "right";
  readonly icon: IconName;
  readonly at: number;
}

/** Whether a key was pressed where it types: a field's arrows are the field's. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Which way a key moves the film: → on, ← back; none with a modifier, or in a field. */
function keyMove(event: KeyboardEvent): "next" | "back" | undefined {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return undefined;
  if (typing(event.target)) return undefined;
  return event.key === "ArrowRight" ? "next" : event.key === "ArrowLeft" ? "back" : undefined;
}

/**
 * The film's picture and what a click does on it: its video, and over it the clicks, the press
 * held, the flash and the paused mark. → and ← do what the clicks do, from anywhere on the page
 * but a field.
 */
export function FilmFace({ film }: { readonly film: Film }) {
  const still = useStill();
  const [flashed, setFlashed] = useState<Flashed | undefined>(undefined);
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; held: boolean }>({ held: false });
  const { video } = film;
  const chapters = chaptersOf(video);
  const at = chapterAt(video, film.time);
  const beat = chapters[at];
  const flash = (side: Flashed["side"], icon: IconName) =>
    setFlashed((was) => ({ side, icon, at: (was?.at ?? 0) + 1 }));
  const back = () => {
    const part = chapters[Math.min(at, chapters.length - 1)];
    const before = backPartAt(video, film.element.current?.currentTime ?? film.time);
    flash("left", before < (part?.start ?? 0) ? "previous" : "again");
    film.back();
  };
  const next = () => {
    flash("right", "next");
    film.next();
  };
  const moves = useRef({ back, next, ended: film.ended });
  moves.current = { back, next, ended: film.ended };
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      const move = keyMove(event);
      if (move === undefined || moves.current.ended) return;
      moves.current[move]();
      event.preventDefault();
    };
    window.addEventListener("keydown", pressed);
    return () => window.removeEventListener("keydown", pressed);
  }, []);
  const lift = () => {
    clearTimeout(press.current.timer);
    if (press.current.held) film.hold(false);
  };
  const clicked = (event: MouseEvent<HTMLElement>) => {
    // The click a held press ends with is the hold's, not a move.
    if (press.current.held) {
      press.current.held = false;
      return;
    }
    if (film.ended) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0 && event.clientX - box.left < box.width * BACK_SIDE) back();
    else next();
  };
  return (
    <>
      {film.address === "failed" ? (
        <p className="film-failed" role="alert">
          The film did not load.
        </p>
      ) : (
        <video
          ref={film.element}
          className="film-video"
          src={film.address}
          muted
          playsInline
          autoPlay={!film.ended}
          aria-label={spokenOf(beat)}
          data-testid="film-video"
          {...film.heard}
        />
      )}
      {/* For a mouse: the keyboard has → and ←, and the bar's parts and Pause are buttons. */}
      <div
        className="film-taps"
        aria-hidden="true"
        data-testid="film-taps"
        onClick={clicked}
        onPointerDown={() => {
          press.current.held = false;
          press.current.timer = setTimeout(() => {
            press.current.held = true;
            film.hold(true);
          }, HOLD_MS);
        }}
        onPointerUp={lift}
        onPointerCancel={lift}
        onPointerLeave={lift}
      />
      {flashed === undefined || still ? null : (
        <span
          key={flashed.at}
          className="film-flash"
          data-side={flashed.side}
          data-testid={`film-flash-${flashed.side}-${flashed.icon}`}
        >
          <span>
            <Icon name={flashed.icon} size={22} />
          </span>
        </span>
      )}
      {!film.playing && !film.ended && film.time > 0 && (
        <span className="film-paused" data-testid="film-paused">
          <Icon name="play" size={26} />
        </span>
      )}
    </>
  );
}

/** Skip, gold: the end card at once. */
export function Skip({ onSkip }: { readonly onSkip: () => void }) {
  return (
    <button type="button" className="film-skip" data-testid="film-skip" onClick={onSkip}>
      <span>Skip</span>
      <Icon name="next" size={14} />
    </button>
  );
}

/** Pause, and Leave, at the window's top right: the keyboard's way to pause, too. */
function Chrome({ film, onLeave }: { readonly film: Film; readonly onLeave: () => void }) {
  return (
    <div className="demo-chrome film-chrome" data-theme="dark">
      {!film.ended && (
        <button
          type="button"
          className="demo-round"
          aria-label={film.playing ? "Pause" : "Play"}
          data-testid="film-pause"
          onClick={film.toggle}
        >
          <Icon name={film.playing ? "pause" : "play"} size={14} />
        </button>
      )}
      <button
        type="button"
        className="demo-round"
        aria-label="Leave the film"
        data-testid="film-leave"
        onClick={onLeave}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** The chapter bar along the film's top: done, filling, or to come, as the video's time says. */
export function FilmBar({ film }: { readonly film: Film }) {
  const still = useStill();
  const chapters = chaptersOf(film.video);
  const at = film.ended ? chapters.length : chapterAt(film.video, film.time);
  const jumped = useJump(at, still);
  return (
    <nav className="demo-bar film-bar" aria-label="Chapters" data-testid="film-bar">
      {chapters.map((beat, index) => (
        <Segment
          key={beat.key}
          beat={beat}
          index={index}
          standing={index < at ? "done" : index === at ? "now" : "later"}
          jumped={jumped === index}
          film={film}
        />
      ))}
    </nav>
  );
}

/** One beat's segment: solid when done, filling while it plays, empty after. */
function Segment({
  beat,
  index,
  standing,
  jumped,
  film,
}: {
  readonly beat: FilmBeat;
  readonly index: number;
  readonly standing: "done" | "now" | "later";
  readonly jumped: boolean;
  readonly film: Film;
}) {
  return (
    <button
      type="button"
      className="demo-seg"
      aria-label={`Play part ${index + 1}, ${beat.eyebrow ?? beat.line}`}
      aria-current={standing === "now" ? "step" : undefined}
      data-testid="film-seg"
      data-state={standing}
      data-jump={jumped ? "true" : undefined}
      onClick={() => film.goTo(beat.start)}
    >
      <i>
        {standing === "now" ? (
          <Fill
            fill={fillOf(beat, film.time)}
            length={(beat.end - beat.start) * 1000}
            playing={film.playing}
            speed={1}
          />
        ) : (
          <b style={{ transform: `scaleX(${standing === "done" ? 1 : 0})` }} />
        )}
      </i>
    </button>
  );
}

/** As long as the jump's keyframes run: the class comes off once it has played. */
const JUMP_MS = 560;

/** The chapter that has just finished, for as long as its jump plays. */
function useJump(chapter: number, still: boolean): number | undefined {
  const [jumped, setJumped] = useState<number | undefined>(undefined);
  const last = useRef(chapter);
  useEffect(() => {
    const was = last.current;
    last.current = chapter;
    if (still || chapter !== was + 1) return;
    setJumped(was);
    const timer = setTimeout(() => setJumped(undefined), JUMP_MS);
    return () => clearTimeout(timer);
  }, [chapter, still]);
  return jumped;
}

/**
 * The playing segment's green: where the video stands, then on to the end over what is left of the
 * beat at the film's speed. A transform, so the fill costs no layout.
 */
function Fill(props: {
  readonly fill: number;
  readonly length: number;
  readonly playing: boolean;
  readonly speed: number;
}) {
  const { fill, length, playing, speed } = props;
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    element.style.transition = "none";
    element.style.transform = `scaleX(${fill})`;
    if (!playing || fill >= 1 || length <= 0 || !(speed > 0)) return;
    // Where it stands, drawn before it runs on from there.
    void element.getBoundingClientRect();
    const left = Math.round(((1 - fill) * length) / speed);
    element.style.transition = `transform ${left}ms linear`;
    element.style.transform = "scaleX(1)";
  }, [fill, length, playing, speed]);
  return <b ref={ref} data-testid="demo-fill" data-fill={fill.toFixed(3)} />;
}
