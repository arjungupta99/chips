/**
 * The trail: faces joined by arrows, first to last — who handled something on its way to where
 * it is. The task card draws the lane that led to it (blueprint, Lead and lanes), and a room of
 * several harnesses draws where a person's message went (ADR 0081): the sender's face, an arrow,
 * and the face or faces it was for. A hop that is several participants at once — a message for
 * everyone — is their faces overlapped, one hop.
 */

import { Avatar, type AvatarProps, faceGround } from "../avatar/avatar.js";
import "./trail.css";

export interface TrailHop {
  readonly name: string;
  readonly kind: "person" | "harness" | "agent";
  readonly color?: string;
  /**
   * The face it wears in place of initials: an agent's own (ADR 0089), or the one chosen for the
   * room this hop is.
   */
  readonly icon?: AvatarProps["icon"];
  /** An agent that can't answer now (ADR 0083): its face wears the amber mark. */
  readonly cantAnswer?: boolean;
}

/** One hop on a trail: one participant, or several at once, drawn overlapped. */
export type TrailStop = TrailHop | readonly TrailHop[];

export interface TrailProps {
  /** Who handled it, first to last: `Arjun → Scout → Ledger`, or `Arjun → [Scout, Ledger]`. */
  readonly hops: readonly TrailStop[];
  /** The trail's accessible name. Absent, `Trail: Arjun → Scout → Ledger`. */
  readonly label?: string;
  /** Faces at twenty pixels rather than twenty-four, for a trail inside a line of text. */
  readonly small?: boolean;
  /**
   * An arrow before the first hop too: a trail that starts from what it sits beside, as the route
   * over another person's message starts from their bubble, whose face is already there.
   */
  readonly onward?: boolean;
  readonly className?: string;
}

export interface FaceGroupProps {
  /** The participants, drawn overlapped in this order; one is simply their face. */
  readonly faces: readonly TrailHop[];
  readonly small?: boolean;
  /** The faces are Everyone in the room, which is the mark from two (`marked`). */
  readonly everyone?: boolean;
  /**
   * A mark says how many beside it, except as a choice: there the words say who, and the number
   * pushed the mark off the line the other choices' faces stand on (Arjun, 6 November 2026).
   */
  readonly counted?: boolean;
  readonly className?: string;
}

/** The participants a hop is, as a list: one, or the several a group hop holds. */
function hopFaces(stop: TrailStop): readonly TrailHop[] {
  return "name" in stop ? [stop as TrailHop] : (stop as readonly TrailHop[]);
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The trail in words, arrows between the hops: `Arjun → Scout and Ledger`. */
export function trailLabel(trail: readonly TrailStop[]): string {
  return trail.map((stop) => listed(hopFaces(stop).map((hop) => hop.name))).join(" → ");
}

/**
 * A group of more than this many is one mark and how many (ADR 0113). One face each ran past the
 * phone's field at fourteen agents; the phone's `Faces` draws the same
 * (`apps/mobile/src/spaces/LaneChain.tsx`).
 */
const FACES_UP_TO = 3;
/**
 * Everyone is the mark from two (Arjun, 6 November 2026: "I want to show the tile icon even for
 * 2+"): two or three faces overlapped read as a few of them rather than the room.
 */
const EVERYONE_UP_TO = 1;

/** Whether `count` faces are drawn as one mark: Everyone from two, any other group from four. */
export function marked(count: number, everyone = false): boolean {
  return count > (everyone ? EVERYONE_UP_TO : FACES_UP_TO);
}

/**
 * Faces overlapped, as one hop: a trail's group, and wherever else a place is several
 * participants at once — the composer's capsule, a fold of harnesses talking. A span, so it may
 * sit inside a button. From four, or from two where they are Everyone, one mark: the first four's
 * colours in a square, and how many beside it (`counted`). Seen, not read out: what holds it says
 * who.
 */
export function FaceGroup({
  faces,
  small = false,
  everyone = false,
  counted = true,
  className,
}: FaceGroupProps) {
  if (marked(faces.length, everyone)) {
    return (
      <span
        className={className === undefined ? "ui-faces" : `ui-faces ${className}`}
        data-size={small ? "small" : undefined}
        data-testid="faces-mark"
        aria-hidden="true"
      >
        <span className="ui-faces__mark">
          {faces.slice(0, 4).map((hop, index) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: a colour's place in the mark is its identity; a group never reorders
              key={index}
              style={{ background: faceGround(hop.name, hop.icon, hop.color) }}
            />
          ))}
        </span>
        {counted && (
          <span className="ui-faces__count" data-testid="faces-count">
            {faces.length}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className={className === undefined ? "ui-faces" : `ui-faces ${className}`}
      data-size={small ? "small" : undefined}
      data-many={faces.length > 1 ? "true" : undefined}
    >
      {faces.map((hop, index) => (
        <Avatar
          // biome-ignore lint/suspicious/noArrayIndexKey: a face's place in the group is its identity; a group never reorders
          key={index}
          name={hop.name}
          kind={hop.kind}
          size="xs"
          {...(hop.color === undefined ? {} : { color: hop.color })}
          {...(hop.icon === undefined ? {} : { icon: hop.icon })}
          cantAnswer={hop.cantAnswer === true}
        />
      ))}
    </span>
  );
}

export function Trail({ hops, label, small = false, onward = false, className }: TrailProps) {
  return (
    <ol
      className={className === undefined ? "ui-trail" : `ui-trail ${className}`}
      aria-label={label ?? `Trail: ${trailLabel(hops)}`}
      data-size={small ? "small" : undefined}
    >
      {hops.map((stop, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a hop's place in the trail is its identity; a trail never reorders
        <li className="ui-trail__hop" key={index}>
          {(index > 0 || onward) && (
            <span className="ui-trail__arrow" aria-hidden="true">
              →
            </span>
          )}
          <FaceGroup faces={hopFaces(stop)} small={small} />
        </li>
      ))}
    </ol>
  );
}
