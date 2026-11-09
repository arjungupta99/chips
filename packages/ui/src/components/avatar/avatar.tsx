/**
 * Circles are people, squircles are harnesses, and the ring is state (blueprint, Look). A channel
 * is a hash in a quiet square. The colour comes from the name, so the same participant wears
 * the same hue on every screen, unless the caller knows better.
 *
 * An agent is the Chips mark (ADR 0089), its bitten body wearing the face a person chose for it or
 * its initials, and its pins from 32 pixels up, resting dim (ADR 0103), or round its body at any
 * size where asked (`pinsOut`, the face beside a line). Its state is in its outline rather than a
 * ring round it: a light runs round its pins while it works, or where it has none a green dot sits
 * in the bite; and an amber dot there says it can't answer.
 */

import { lettersScale } from "@chipschat/protocol";
import { type CSSProperties, useState } from "react";
import { initials } from "../../format.js";
import { type HarnessStatus, ringTone, statusLabel } from "../../vocabulary/status.js";
import "./avatar.css";
import { SpaceMark } from "../face/face.js";
import { LIBRARY_MARKS, type MarkName } from "../face/library.js";
import {
  BODY_WITH_PINS,
  PIN_REST,
  PIN_STEP_MS,
  PINS,
  PINS_FROM,
  pinsOf,
  WORKING_PIN_STEP_MS,
  WORKING_PINS,
  workingPinsOf,
} from "../face/outline.js";

export type AvatarKind = "person" | "harness" | "agent" | "channel";

/**
 * The shape a kind is drawn as. An agent (ADR 0087) has an outline of its own (ADR 0089) and its
 * own face: its own name's initials and hue, not its harness's, so Chess Game and J are two faces
 * of one Jacobian. A kind this build has never heard of is not a person either, and is drawn as a
 * harness.
 */
export function avatarKind(kind: string | undefined): AvatarKind {
  if (kind === undefined || kind === "person" || kind === "channel") return kind ?? "person";
  return kind === "agent" ? "agent" : "harness";
}

/** The side of each size, in pixels, as `avatar.css` sets them. */
const SIDES: Readonly<Record<AvatarSize, number>> = { xs: 24, sm: 32, md: 48, lg: 58 };

/** The pins as fractions of the body's side, since a face's size is the stylesheet's. */
const PIN_BOXES = pinsOf(100);

/** A working room's pins (ADR 0285), the same way: round a circle, or three to a side. */
const WORKING_ROUND = workingPinsOf(100, true);
const WORKING_SQUARE = workingPinsOf(100, false);

/**
 * Where an agent wears its pins they stand inside its box, so it is the size any other face is in
 * the same place: the body stands back from the edges by as far as they stand out, and its
 * initials shrink with it.
 */
const WITH_PINS: CSSProperties = {
  inset: `${((1 - BODY_WITH_PINS) / 2) * 100}%`,
  fontSize: `${BODY_WITH_PINS}em`,
};

/** `md` is a list row's face beside the iPad's columns (ADR 0284). */
export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  readonly name: string;
  /** A person, a harness or a channel; any other kind is drawn as a harness. */
  readonly kind?: AvatarKind | (string & {});
  /** 24, 32, 48 or 58 pixels. */
  readonly size?: AvatarSize;
  /** A CSS colour for the background. Absent, one of the eight avatar hues, chosen by name. */
  readonly color?: string;
  /**
   * For a harness: draws the ring, and says the state in the accessible name. For an agent: a
   * light runs round its pins while it works, and the name says the state.
   */
  readonly status?: HarnessStatus;
  /**
   * The room this face stands for has work going in it (core's `spaceWorking`, ADR 0285): the
   * face draws in and wears an agent's pins, lit in turn, in place of the still ring. They come
   * out when this turns true and go back in when it turns false. An agent says its own work in
   * its own pins (ADR 0089) and is left alone.
   */
  readonly busy?: boolean;
  /** Replaces the name as the accessible name, for example `Scout, the lead`. */
  readonly label?: string;
  readonly className?: string;
  /**
   * A mark the person picked for this space in place of its initials, with the index of the
   * ground it sits on (`--avatar-1` to `--avatar-8`, then the nineteen beyond them). The shape does
   * not change: the face goes on saying what the thing is while wearing what you chose. For an
   * agent it is the agent's own face, the same for everybody (ADR 0089); for a person, their own
   * (ADR 0139). `letters`, when there, are drawn in place of a mark.
   */
  readonly icon?:
    | { readonly icon: string; readonly ground: number; readonly letters?: string | undefined }
    | undefined;
  /**
   * An agent that can't answer now, offline or in trouble it reported (ADR 0083): a small amber
   * mark on its corner, wherever its face is drawn.
   */
  readonly cantAnswer?: boolean | undefined;
  /**
   * An agent wears its pins round its body rather than inside its box, at any size, a little less
   * dim: the face beside a line in a room (ADR 0103). It keeps clear of its neighbours by as far as
   * the pins stand out. Nothing to any other kind.
   */
  readonly pinsOut?: boolean | undefined;
}

/** How many hues `tokens.css` declares as `--avatar-N`. */
export const AVATAR_HUES = 8;

/**
 * The grounds a chosen mark may sit on: the eight above, then the nineteen `--icon-ground-N`
 * (fifteen of them since 26 September 2026). The wire carries the index, not a colour, so a
 * palette that moves takes everybody's face with it.
 */
export const ICON_GROUNDS = 27;

/** The colour of the ground at an index, as a CSS colour: a face's, or a context file's tile. */
export function groundVar(index: number): string {
  const at = Math.min(Math.max(index, 0), ICON_GROUNDS - 1);
  return at < AVATAR_HUES
    ? `var(--avatar-${at + 1})`
    : `var(--icon-ground-${at - AVATAR_HUES + 1})`;
}

/**
 * The mark and the ground a chosen face draws with, or nothing where there is no choice.
 *
 * The ground holds even when the mark does not. A mark this build has never heard of — picked
 * on a newer one — brings the initials back rather than drawing nothing, and a face that is a
 * colour and no mark at all (an empty name, which is what the picker writes when a colour is
 * chosen on its own) is the same case. Losing the ground with the mark would have put those
 * rooms back on the hue their name hashes to, which is not what anybody chose.
 */
function chosenFace(
  icon: AvatarProps["icon"],
): { name: MarkName | undefined; ground: string; letters: string | undefined } | undefined {
  if (icon === undefined) return undefined;
  // Letters chosen in place of a mark (ADR 0139) are drawn where the initials would be.
  const letters = icon.letters === undefined || icon.letters === "" ? undefined : icon.letters;
  return {
    name: letters === undefined && icon.icon in LIBRARY_MARKS ? (icon.icon as MarkName) : undefined,
    ground: groundVar(icon.ground),
    letters,
  };
}

/**
 * What a face says where it has no mark: the letters chosen for it, sized to stand inside it as
 * its initials do (`lettersScale`), else its initials.
 */
function Letters(props: { readonly letters: string | undefined; readonly fallback: string }) {
  const { letters } = props;
  if (letters === undefined) {
    return (
      <span className="ui-avatar-letters" aria-hidden="true">
        {props.fallback}
      </span>
    );
  }
  const scale = lettersScale(letters);
  return (
    <span
      className="ui-avatar-letters"
      data-chosen="true"
      aria-hidden="true"
      style={scale === 1 ? undefined : { fontSize: `${scale}em` }}
    >
      {letters}
    </span>
  );
}

/**
 * What a face's edge says: whether it wears the pins of a room at work (ADR 0285), and the still
 * ring where it does not. One or the other, never both: the pins are the state, and an outline
 * with them would be the same thing said twice. An agent always wears its own pins (ADR 0089), so
 * this says nothing of one.
 */
function edgeOf(
  kind: AvatarKind,
  status: HarnessStatus | undefined,
  busy: boolean,
): { readonly lit: boolean; readonly ring: ReturnType<typeof ringTone> } {
  const lit = busy && kind !== "agent";
  return { lit, ring: kind === "harness" && !lit ? ringTone(status) : undefined };
}

/**
 * The colour a face stands on, as CSS: what the caller said, else the ground of the face chosen
 * for it, else its name's own hue. What a group of four or more is drawn in, as one mark
 * (`FaceGroup`, ADR 0113).
 */
export function faceGround(
  name: string,
  icon: AvatarProps["icon"],
  color?: string | undefined,
): string {
  return color ?? chosenFace(icon)?.ground ?? `var(--avatar-${avatarHue(name)})`;
}

/** A stable pick among the hues: the same name, the same hue, on every screen. */
export function avatarHue(name: string): number {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1_000_003;
  return (hash % AVATAR_HUES) + 1;
}

export function Avatar({
  name,
  kind: asked,
  size = "sm",
  color,
  status,
  busy = false,
  label,
  className,
  icon,
  cantAnswer = false,
  pinsOut = false,
}: AvatarProps) {
  const kind = avatarKind(asked);
  const { lit, ring } = edgeOf(kind, status, busy);
  const accessibleName = spokenName(name, kind, status, label, cantAnswer);
  const face = chosenFace(icon);
  const worn = useWorn(lit && SIDES[size] >= PINS_FROM);
  const style = {
    "--avatar-color": faceGround(name, icon, color),
    ...(worn === undefined ? null : { "--avatar-drawn": WORKING_PINS.drawn }),
  } as CSSProperties;
  if (kind === "agent") {
    return (
      <AgentFace
        name={name}
        size={size}
        mark={face?.name}
        letters={face?.letters}
        working={status === "working" || status === "thinking"}
        cantAnswer={cantAnswer}
        pinsOut={pinsOut}
        accessibleName={accessibleName}
        className={className}
        style={style}
      />
    );
  }

  return (
    <span
      className={className === undefined ? "ui-avatar" : `ui-avatar ${className}`}
      role="img"
      aria-label={accessibleName}
      data-kind={kind}
      data-size={size}
      data-ring={ring}
      data-busy={lit ? "true" : undefined}
      data-worn={worn}
      style={style}
    >
      {worn === undefined ? null : <WorkingPins round={kind === "person"} />}
      {face === undefined ? null : (
        // A chosen face is paper on a lit ground (22 September 2026), filling the face's shape.
        <span className="ui-avatar-face">
          <SpaceMark name={face.name} small={size !== "lg"} />
        </span>
      )}
      {face?.name === undefined ? (
        <Letters letters={face?.letters} fallback={kind === "channel" ? "#" : initials(name)} />
      ) : null}
      {cantAnswer ? (
        <span className="ui-avatar-mark" data-testid="cant-answer-mark" aria-hidden="true" />
      ) : null}
    </span>
  );
}

/**
 * Whether a room's face has pins to show, and since when. They stay once it has worn them, so that
 * they can go back in; a face that has never worked carries none. `at-start` is a face drawn
 * already working, whose pins are simply out; `since` is one that started while it was on the
 * screen, whose pins come out.
 */
function useWorn(working: boolean): "at-start" | "since" | undefined {
  const [worn, setWorn] = useState<"at-start" | "since" | undefined>(
    working ? "at-start" : undefined,
  );
  if (working && worn === undefined) setWorn("since");
  return worn;
}

/**
 * A working room's pins, behind its face, each placed by its centre and turned to point outward,
 * so that one move along its own length takes it under the face from any side (`avatar.css`).
 */
function WorkingPins({ round }: { readonly round: boolean }) {
  const rest = { "--pin-rest": PIN_REST.inside } as CSSProperties;
  return (
    <span className="ui-avatar-pins" data-testid="working-pins" aria-hidden="true" style={rest}>
      {(round ? WORKING_ROUND : WORKING_SQUARE).map((pin, at) => (
        <i
          key={pin.key}
          style={
            {
              left: `${pin.cx - pin.w / 2}%`,
              top: `${pin.cy - pin.h / 2}%`,
              width: `${pin.w}%`,
              height: `${pin.h}%`,
              "--pin-turn": `${pin.turn}deg`,
              "--pin-at": at,
              "--pin-down": `${Math.round(Math.min(100, Math.max(0, pin.cy)))}%`,
              animationDelay: `${at * WORKING_PIN_STEP_MS}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/**
 * An agent's pins, behind its body, each placed as a fraction of the body's side: inside the box,
 * the body stands back to leave them room; round the body (`out`), they stand past its edges.
 */
function AgentPins({ out }: { readonly out: boolean }) {
  const rest = { "--pin-rest": out ? PIN_REST.outside : PIN_REST.inside } as CSSProperties;
  return (
    <span className="ui-avatar-pins" data-testid="agent-pins" aria-hidden="true" style={rest}>
      {PIN_BOXES.map((pin, at) => (
        <i
          key={pin.key}
          style={
            {
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              width: `${pin.w}%`,
              height: `${pin.h}%`,
              // Each pin takes the ground's light where it stands, and its turn in the round.
              "--pin-down": `${Math.round(Math.min(100, Math.max(0, pin.y + pin.h / 2)))}%`,
              animationDelay: `${at * PIN_STEP_MS}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/**
 * Worn round the body, the pins stand out past the box, which keeps that far from what is beside
 * it: a row that contains its paint would otherwise cut them off.
 */
function clearOfPins(style: CSSProperties, size: AvatarSize, out: boolean): CSSProperties {
  return out ? { ...style, margin: `${Math.ceil(SIDES[size] * PINS.over)}px` } : style;
}

/**
 * An agent's face: the bitten body with its mark or its initials, its pins behind it where there
 * is room for them or round it where asked, and its state's dot in the bite.
 */
function AgentFace(props: {
  readonly name: string;
  readonly size: AvatarSize;
  readonly mark: MarkName | undefined;
  /** Letters chosen for it in place of a mark (ADR 0139), or its initials. */
  readonly letters: string | undefined;
  readonly working: boolean;
  readonly cantAnswer: boolean;
  readonly pinsOut: boolean;
  readonly accessibleName: string;
  readonly className: string | undefined;
  readonly style: CSSProperties;
}) {
  const { size, mark, working, cantAnswer, pinsOut } = props;
  const pins = pinsOut || SIDES[size] >= PINS_FROM;
  return (
    <span
      className={props.className === undefined ? "ui-avatar" : `ui-avatar ${props.className}`}
      role="img"
      aria-label={props.accessibleName}
      data-kind="agent"
      data-size={size}
      data-pins={pinsOut ? "out" : undefined}
      data-working={working || undefined}
      style={clearOfPins(props.style, size, pinsOut)}
    >
      <span className="ui-avatar-body" style={pins && !pinsOut ? WITH_PINS : undefined}>
        {pins ? <AgentPins out={pinsOut} /> : null}
        <span className="ui-avatar-face">
          <SpaceMark name={mark} small={size !== "lg"} outline="bite" />
        </span>
        {mark === undefined ? (
          <Letters letters={props.letters} fallback={initials(props.name)} />
        ) : null}
        {cantAnswer ? (
          <span className="ui-avatar-mark" data-testid="cant-answer-mark" aria-hidden="true" />
        ) : working && !pins ? (
          <span className="ui-avatar-working" data-testid="working-dot" aria-hidden="true" />
        ) : null}
      </span>
    </span>
  );
}

/** What a screen reader says of a face: the label, else the name and the state it is in. */
function spokenName(
  name: string,
  kind: AvatarKind,
  status: HarnessStatus | undefined,
  label: string | undefined,
  cantAnswer: boolean,
): string {
  if (label !== undefined) return label;
  if ((kind === "harness" || kind === "agent") && status !== undefined)
    return `${name}, ${statusLabel(status).toLowerCase()}`;
  return cantAnswer ? `${name}, can't answer` : name;
}
