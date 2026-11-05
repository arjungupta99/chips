/**
 * A face's letters, typed (ADR 0139): one or two of them, or an emoji or two, in place of a mark.
 * The phone's field (`apps/mobile/src/spaces/LettersField.tsx`) on the Mac and the web: the tile at
 * its start is the face the letters will make, on the colour the picker is on, "Aa" in the quiet
 * tone until something is typed.
 *
 * A face is saved when the typing stops for a moment, or at once on Enter, on leaving the field,
 * or on leaving the page; one save for a word, not one for each letter, since every save of an
 * agent's or a person's face is a line in the log. The field never holds more than a face can
 * (`faceLetters`): a third letter or a space does not go in.
 */

import { FACE_PICKER_WORDS } from "@chipschat/core";
import { faceLetters, lettersScale } from "@chipschat/protocol";
import { groundVar, Icon } from "@chipschat/ui";
import {
  type CSSProperties,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/** How long the typing has to stop for before the letters are saved. */
export const SETTLE_MS = 600;

/** What the picker asks of the field: to drop what is typed, for a mark chosen in its place. */
export interface LettersHandle {
  readonly discard: () => void;
}

export function LettersField(props: {
  /** The letters the face wears now, if it wears letters. */
  readonly letters: string | undefined;
  /** The colour the picker is on, which the tile stands on. */
  readonly ground: number;
  /** Each change, before it is saved, so the head can wear it; `undefined` once it is. */
  readonly onTyping: (letters: string | undefined) => void;
  /** The letters to save; empty is none, the face back to its colour. */
  readonly onLetters: (letters: string) => void;
  readonly ref?: Ref<LettersHandle> | undefined;
}) {
  const { onTyping, onLetters } = props;
  const [typed, setTyped] = useState(props.letters ?? "");
  // A save waiting for the typing to stop, and the letters it will save.
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(typed);
  // What the page leaving saves: the newest handlers, not the first render's.
  const saveRef = useRef<() => void>(() => undefined);

  // What the face wears, said again: a save landing, a refusal taking it back, a mark or the
  // default taking its place. Not while a save is waiting, which is the field's own.
  useEffect(() => {
    if (waiting.current === undefined) {
      setTyped(props.letters ?? "");
      latest.current = props.letters ?? "";
    }
  }, [props.letters]);

  const save = () => {
    if (waiting.current === undefined) return;
    clearTimeout(waiting.current);
    waiting.current = undefined;
    onTyping(undefined);
    onLetters(latest.current);
  };
  saveRef.current = save;
  // Leaving the page saves what was typed, as closing the phone's sheet does.
  useEffect(() => () => saveRef.current(), []);

  useImperativeHandle(props.ref, () => ({
    discard: () => {
      clearTimeout(waiting.current);
      waiting.current = undefined;
      latest.current = "";
      setTyped("");
      onTyping(undefined);
    },
  }));

  const change = (text: string) => {
    const next = faceLetters(text);
    setTyped(next);
    latest.current = next;
    onTyping(next);
    clearTimeout(waiting.current);
    waiting.current = setTimeout(save, SETTLE_MS);
  };

  const shown = typed !== "";
  const tile: CSSProperties | undefined = shown
    ? { background: groundVar(props.ground), fontSize: `${13 * lettersScale(typed)}px` }
    : undefined;
  return (
    <div className="face-letters">
      <span className="face-letters-tile" data-shown={shown} style={tile} aria-hidden="true">
        {shown ? typed : "Aa"}
      </span>
      <input
        aria-label={FACE_PICKER_WORDS.lettersField}
        title={FACE_PICKER_WORDS.lettersHint}
        data-testid="face-letters"
        value={typed}
        onChange={(event) => change(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
        placeholder={FACE_PICKER_WORDS.lettersPlaceholder}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {shown && (
        <button
          type="button"
          className="face-letters-clear"
          aria-label={FACE_PICKER_WORDS.clearLetters}
          data-testid="face-letters-clear"
          onClick={() => change("")}
        >
          <Icon name="x" size={10} />
        </button>
      )}
    </div>
  );
}
