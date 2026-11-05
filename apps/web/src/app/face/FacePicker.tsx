/**
 * Where a face is chosen on the Mac and the web (ADR 0272): the phone's picker
 * (`apps/mobile/src/spaces/FacePicker.tsx`, ADR 0174) as a page, not a sheet. Arjun chose the page
 * on 3 November 2026 ("I want us to minimise popups in ipad, mac and web where possible"), so it
 * stands where a page stands: on You beside the list, or in the list's place where You is narrow.
 * It holds no frame of its own, so a space's page or an agent's can hold it the same way.
 *
 * It is the phone's, part for part and in its order. The head is the thing being changed, its face
 * at the size a row wears it and its name, so you see the line in the list you are choosing for.
 * Then every colour at once, nine hues across and three depths down; a field for a letter or two,
 * or an emoji, in place of a mark; the families' names, which jump to a family rather than filter;
 * and the whole library, a heading per family, with *Use the default* past the last mark.
 *
 * There is no Save. A colour saves the moment it is clicked, on its own (*the teal room* is a
 * perfectly good answer), and a mark saves on the colour the picker is on; the face behind the
 * page is already wearing it. Letters save when the typing stops, or on Enter, or on leaving.
 *
 * On a computer, a mark says its name when the pointer rests on it, and the keyboard reaches the
 * colours, the letters, the families and the marks with Tab, and moves inside the colours and the
 * marks with the arrows (`roving.ts`); Enter or Space picks.
 *
 * Marks not chosen are drawn in ink on a quiet cell, so the fold is there before anything is
 * picked; the chosen one is drawn on the colour it will land on, lit, exactly as the face wears it,
 * and an agent's in the agent's own outline (ADR 0089).
 */

import { FACE_GROUND_ROWS, FACE_PICKER_WORDS, groundName } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import {
  Avatar,
  type AvatarKind,
  avatarHue,
  groundVar,
  Icon,
  LIBRARY_FAMILIES,
  type MarkName,
  SpaceMark,
} from "@chipschat/ui";
import { type CSSProperties, memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { LettersField, type LettersHandle } from "./LettersField.tsx";
import { onRovingKey } from "./roving.ts";
import "./face.css";

/** The colours across a row, as `FACE_GROUND_ROWS` lays them out. */
const HUES_ACROSS = 9;

export function FacePicker(props: {
  /** What is being changed: its name and the line under it, so the head is the real row. */
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly kind: AvatarKind;
  readonly chosen: SpaceIcon | undefined;
  /** `undefined` puts the face back to the default. */
  readonly onChoose: (face: SpaceIcon | undefined) => void;
  /** Why the last pick did not stick, when it did not. */
  readonly failed?: string | undefined;
  readonly testId?: string | undefined;
}) {
  const { chosen, onChoose } = props;
  // The colour a mark will land on, and the swatch the tick sits on. It starts on the colour the
  // face already wears (the chosen one's, or the one its name hashes to), and is held rather than
  // derived because a click has to move the tick before the store's snapshot comes back; it is
  // put again from what saved, so a refusal takes the tick back with the face.
  const wearing = chosen?.ground ?? avatarHue(props.title) - 1;
  const [ground, setGround] = useState(wearing);
  useEffect(() => setGround(wearing), [wearing]);
  // Letters typed and not yet saved, which the head wears while they are.
  const [typing, setTyping] = useState<string | undefined>(undefined);
  const letters = useRef<LettersHandle>(null);
  // The face last asked for, worn until the store's face is another: the store hands a pick to
  // the screen a frame or more after it takes it, and in between the head would wear the face from
  // before (the phone's flicker of 9 October 2026).
  const [asked, setAsked] = useState<{ face: SpaceIcon | undefined; over: string } | undefined>();
  const said = faceKey(chosen);
  // Once the store answers, what it says is worn: the pick, or the face from before after a
  // refusal. A refusal can come before the store has shown the pick at all (the demo refuses at
  // once), so the reason arriving lets go of the pick too, and puts the tick back.
  const [answered, setAnswered] = useState(said);
  const [refused, setRefused] = useState(props.failed);
  if (answered !== said || refused !== props.failed) {
    setAnswered(said);
    setRefused(props.failed);
    setAsked(undefined);
    if (props.failed !== undefined) setGround(wearing);
  }
  const shown = asked !== undefined && asked.over === said ? asked.face : chosen;
  const worn = previewOf(shown, typing, ground);
  const pick = (face: SpaceIcon | undefined) => {
    setAsked({ face, over: said });
    onChoose(face);
  };
  // A mark, or the default, takes the place of letters typed and not yet saved.
  const choose = (face: SpaceIcon | undefined) => {
    letters.current?.discard();
    pick(face);
  };
  // One function for the life of the page, so a mark is drawn again only when it changes.
  const marking = useRef<(name: MarkName) => void>(() => undefined);
  marking.current = (name) => choose({ icon: name, ground });
  const onMark = useCallback((name: MarkName) => marking.current(name), []);

  const families = useId();
  const [family, setFamily] = useState(LIBRARY_FAMILIES[0]?.name ?? "");
  const jump = (name: string) => {
    setFamily(name);
    document
      .getElementById(familyId(families, name))
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div className="face-picker" data-testid={props.testId ?? "face-picker"}>
      {/* The head is the thing being changed, not a title: you came here by clicking it. */}
      <div className="face-head">
        <Avatar name={props.title} kind={props.kind} size="lg" icon={worn} />
        <span className="face-head-t">
          <b>{props.title}</b>
          {props.subtitle !== undefined && <small>{props.subtitle}</small>}
        </span>
      </div>

      {props.failed !== undefined && (
        <p className="face-failed" role="alert" data-testid="icon-failed">
          <Icon name="info" size={16} />
          <span>{props.failed}</span>
        </p>
      )}

      <div
        className="face-hues"
        role="radiogroup"
        aria-label={FACE_PICKER_WORDS.colours}
        onKeyDown={(event) => onRovingKey(event, HUES_ACROSS)}
      >
        {FACE_GROUND_ROWS.flat().map((index) => (
          // biome-ignore lint/a11y/useSemanticElements: a native radio checks, and so saves, on every arrow.
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={index === ground}
            aria-label={groundName(index)}
            title={groundName(index)}
            data-roving
            data-testid={`ground-${index}`}
            tabIndex={index === ground ? 0 : -1}
            className="face-hue"
            style={{ background: groundVar(index) }}
            onClick={() => {
              setGround(index);
              pick(onGround(worn, index));
            }}
          >
            {index === ground && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>

      <LettersField
        ref={letters}
        letters={shown?.letters}
        ground={ground}
        onTyping={setTyping}
        onLetters={(typed) => {
          if (typed === (shown?.letters ?? "")) return;
          // Emptied, the face is its colour again: the initials on the ground.
          pick(typed === "" ? { icon: "", ground } : { icon: "", ground, letters: typed });
        }}
      />

      <div className="face-families">
        {LIBRARY_FAMILIES.map((each) => (
          <button
            key={each.name}
            type="button"
            className="face-family"
            aria-pressed={each.name === family}
            onClick={() => jump(each.name)}
          >
            {each.name}
          </button>
        ))}
      </div>

      <Marks
        families={families}
        agent={props.kind === "agent"}
        title={props.title}
        worn={worn?.letters === undefined ? worn?.icon : undefined}
        ground={ground}
        onMark={onMark}
      />

      <button
        type="button"
        className="face-default"
        disabled={shown === undefined}
        onClick={() => choose(undefined)}
        data-testid="face-default"
      >
        {FACE_PICKER_WORDS.useDefault}
      </button>
    </div>
  );
}

/** A family heading's id, for the families' names to jump to. */
function familyId(families: string, name: string): string {
  return `${families}-${name}`;
}

/**
 * The library, a heading per family, as one grid for the arrow keys. Every mark is drawn at once:
 * the phone draws a family a frame because its paper marks held its sheet back, which a browser's
 * SVG does not.
 */
function Marks(props: {
  readonly families: string;
  readonly agent: boolean;
  readonly title: string;
  /** The mark the face wears, if it wears one. */
  readonly worn: string | undefined;
  readonly ground: number;
  readonly onMark: (name: MarkName) => void;
}) {
  const across = useAcross();
  const anyChosen = LIBRARY_FAMILIES.some((each) =>
    (each.marks as readonly string[]).includes(props.worn ?? ""),
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between its buttons; it is no stop itself.
    <div
      className="face-marks"
      ref={across.ref}
      onKeyDown={(event) => onRovingKey(event, across.count)}
      data-testid="icon-grid"
    >
      {LIBRARY_FAMILIES.map((each, first) => {
        const wears =
          props.worn !== undefined && (each.marks as readonly string[]).includes(props.worn);
        return (
          <Family
            key={each.name}
            id={familyId(props.families, each.name)}
            name={each.name}
            marks={each.marks}
            worn={wears ? props.worn : undefined}
            ground={wears ? props.ground : 0}
            agent={props.agent}
            title={props.title}
            first={first === 0 && !anyChosen}
            onMark={props.onMark}
          />
        );
      })}
    </div>
  );
}

/** How many marks stand across the grid, read from its laid-out columns. */
function useAcross(): {
  ref: (element: HTMLElement | null) => (() => void) | undefined;
  count: number;
} {
  const [count, setCount] = useState(8);
  const ref = useCallback((element: HTMLElement | null) => {
    if (element === null || typeof ResizeObserver !== "function") return undefined;
    const measure = () => {
      const row = element.querySelector(".face-family-marks");
      if (row === null) return;
      const columns = getComputedStyle(row).gridTemplateColumns.split(" ").length;
      if (columns > 0) setCount(columns);
    };
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);
  return { ref, count };
}

/** One family: its heading and its marks. Drawn again only when one of its marks changes. */
const Family = memo(function Family(props: {
  readonly id: string;
  readonly name: string;
  readonly marks: readonly MarkName[];
  readonly worn: string | undefined;
  readonly ground: number;
  readonly agent: boolean;
  readonly title: string;
  /** Its first mark is the grid's Tab stop: nothing in the library is chosen. */
  readonly first: boolean;
  readonly onMark: (name: MarkName) => void;
}) {
  return (
    <section className="face-family-group" aria-labelledby={props.id}>
      <h3 id={props.id} className="face-family-h">
        {props.name}
      </h3>
      <div className="face-family-marks">
        {props.marks.map((mark, at) => {
          const chosen = mark === props.worn;
          return (
            <button
              key={mark}
              type="button"
              className="face-cell"
              aria-label={mark}
              aria-pressed={chosen}
              title={mark}
              data-roving
              data-testid={`mark-${mark}`}
              tabIndex={chosen || (props.first && at === 0) ? 0 : -1}
              onClick={() => props.onMark(mark)}
            >
              {chosen ? (
                <Lit mark={mark} ground={props.ground} agent={props.agent} title={props.title} />
              ) : (
                <SpaceMark name={mark} cell />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
});

/** The chosen mark, lit on the colour it will land on: a room's square, or an agent's outline. */
function Lit(props: {
  readonly mark: MarkName;
  readonly ground: number;
  readonly agent: boolean;
  readonly title: string;
}) {
  if (props.agent) {
    return (
      <Avatar
        name={props.title}
        kind="agent"
        size="lg"
        icon={{ icon: props.mark, ground: props.ground }}
        label=""
      />
    );
  }
  return (
    <span
      className="face-lit"
      style={{ "--avatar-color": groundVar(props.ground) } as CSSProperties}
    >
      <SpaceMark name={props.mark} />
    </span>
  );
}

/** A face as one string, to tell whether the store's has changed since a pick. */
function faceKey(face: SpaceIcon | undefined): string {
  return face === undefined ? "" : `${face.icon}|${face.ground}|${face.letters ?? ""}`;
}

/**
 * The face the head wears: what is chosen, or the letters being typed over it before they are
 * saved, on the colour the picker is on. Typed empty, a face of letters is its colour again.
 */
function previewOf(
  chosen: SpaceIcon | undefined,
  typing: string | undefined,
  ground: number,
): SpaceIcon | undefined {
  if (typing === undefined) return chosen;
  if (typing !== "") return { icon: "", ground, letters: typing };
  return chosen?.letters === undefined ? chosen : { icon: "", ground };
}

/** A face on another colour: its mark or its letters kept, or the colour alone. */
function onGround(face: SpaceIcon | undefined, ground: number): SpaceIcon {
  return face?.letters === undefined
    ? { icon: face?.icon ?? "", ground }
    : { icon: "", ground, letters: face.letters };
}
