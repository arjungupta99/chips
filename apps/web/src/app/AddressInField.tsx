/**
 * Where the next message goes, in a room where the writer has two or more others, people or agents
 * (ADR 0081, ADR 0204), in the field itself:
 * Arjun's A, 28 September 2026 (`docs/proposals/address-in-the-bar-mocks.html`). An arrow, the face
 * or faces and a chevron lead the field, the field says who ("Message Everyone"), and a click on
 * the faces opens the field upward into the list, each agent, each other person, and then Everyone,
 * with a check on the one it says now. The phone's is the same (`apps/mobile/src/spaces/AddressInField.tsx`). It
 * was a capsule over the field with a menu over that, which looked like three things, not one.
 *
 * What it says is core's `aimOf`: an @ in the draft decides, and says so ("by @"); else a reply to
 * an agent's message, which says so with the reply's arrow (ADR 0219); else the menu's pick, for
 * this draft; else where the person's last message here went, or Everyone before their first. It
 * is the promise of where a message goes, made before it is sent, and a send keeps it: the aim
 * travels with the message as `to`, or as the reply itself.
 *
 * A room of many (ADR 0113): four or more are one mark and a number (`FaceGroup`), and Everyone
 * is from two (6 November 2026); the list stands at most half the window with the lead at its top
 * and Everyone held at its foot, the rest scrolling between, and Everyone picked stays everyone
 * when an agent joins before the send.
 *
 * Several, picked from the list (ADR 0114): a click on an agent's name, or Enter, picks it alone
 * and closes the list; a click on the circle at its right, or Space, adds it to who the message
 * goes to, or takes it out, and the list stays open (core's `addedTo`). Everyone is one click, and
 * closes the list; Escape, Tab, the faces or a click elsewhere close it too. The list is a
 * listbox of several, each agent selected while it is one of them.
 *
 * One, in one movement (ADR 0229), as the phone's column of faces does it: the list opens as the
 * button goes down on the faces, the row under the pointer lights as it slides up the list, and
 * letting go on a row picks it alone and closes the list. Letting go anywhere else after moving
 * leaves who it goes to as it was, and closes the list. A press let go where it began is a click,
 * and leaves the list open.
 */

import {
  type Aim,
  type AimPick,
  addedTo,
  aimOf,
  aimsAtEveryone,
  aimWordsOf,
  belongsTo,
  cantAnswer,
  countedWords,
  type Directory,
  faceKind,
  faceOf,
  harnessUnder,
  nameOf,
  roomHandles,
  roomLeadOf,
  type Space,
} from "@chipschat/core";
import { FaceGroup, Icon, marked, type TrailHop } from "@chipschat/ui";
import {
  type KeyboardEvent,
  type PointerEvent as PressEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/** How far a press moves before letting go is a slide's, not a click's (ADR 0229). */
const SLIDE_PX = 6;

/**
 * Where each room's pick is kept: this browser's storage, which the Mac app's window has too, so
 * a pick is still there when the person comes back to the room (ADR 0114, Arjun: "the selections
 * should be sticky"). The phone keeps its own (`apps/mobile/src/spaces/picks.ts`).
 */
const PICKS = "chips.picks";

function isPick(value: unknown): value is AimPick {
  return value === "all" || (Array.isArray(value) && value.every((id) => typeof id === "string"));
}

/** What was kept, by room; nonsense, or no storage, is nothing. */
function readPicks(): Readonly<Record<string, AimPick>> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(PICKS) ?? "{}");
    if (typeof value !== "object" || value === null) return {};
    return Object.fromEntries(Object.entries(value).filter(([, pick]) => isPick(pick)));
  } catch {
    return {};
  }
}

function writePicks(picks: Readonly<Record<string, AimPick>>): void {
  try {
    globalThis.localStorage?.setItem(PICKS, JSON.stringify(picks));
  } catch {
    // A window that keeps nothing still picks; it only forgets.
  }
}

/** The capsule's state for the room that is open: what a draft aims at, and the menu's pick. */
export interface Aiming {
  /** Where these words go, as the capsule says it; nothing in a room of one harness or none. */
  readonly aimFor: (text: string) => Aim | undefined;
  /** The person chose from the menu, for the draft they are writing; nothing is no pick. */
  readonly pick: (pick: AimPick | undefined) => void;
  /** What the menu was told for this room, kept: where adding starts from (`addedTo`). */
  readonly picked: AimPick | undefined;
  /** The draft went: the next one starts where it went, not where it was picked. */
  readonly sent: () => void;
}

/**
 * The menu's pick, held for each room it was made in and kept for coming back to (`PICKS`): the
 * space view stays mounted from room to room, and a pick in one is nothing to another. A send lets
 * the room's pick go: where the message went is then its default. While the Steer chip is on
 * there is no aim: a steer goes to the run, wherever the capsule would have said. `replying` is the
 * line the draft replies to while the reply decides (ADR 0219).
 */
export function useAiming(
  space: Space,
  directory: Directory,
  selfId: string,
  steering: boolean,
  replying?: string,
): Aiming {
  const [picks, setPicks] = useState(readPicks);
  const keep = (next: AimPick | undefined) =>
    setPicks((now) => {
      const { [space.id]: _was, ...others } = now;
      const kept = next === undefined ? others : { ...others, [space.id]: next };
      writePicks(kept);
      return kept;
    });
  return {
    aimFor: (text) =>
      steering ? undefined : aimOf(text, picks[space.id], space, directory, selfId, replying),
    pick: keep,
    picked: picks[space.id],
    sent: () => keep(undefined),
  };
}

export interface AddressProps {
  /** Where a message typed now goes, and why; nothing where there are no faces to draw. */
  readonly aim: Aim | undefined;
  /** The room's harnesses, in the order they joined: the menu's rows, before Everyone. */
  readonly harnesses: readonly string[];
  /** The room's other people, after the agents (ADR 0204): never the writer. */
  readonly people: readonly string[];
  readonly space: Space;
  readonly directory: Directory;
  /** Who is writing: an agent somebody else owns says whose it is (ADR 0234). */
  readonly selfId: string;
  /** The person chose from the menu: these harnesses, or everyone, or no pick, for this draft. */
  readonly onPick: (pick: AimPick | undefined) => void;
  /** What the menu was told for this room, which adding starts from. */
  readonly picked: AimPick | undefined;
}

/** One row of the menu. */
interface Choice {
  readonly key: string;
  readonly ids: readonly string[];
  /** What picking it keeps: the harness, or `all` (ADR 0113). */
  readonly pick: AimPick;
  readonly words: string;
  /** Said under Everyone: that each of them will answer. */
  readonly under?: string | undefined;
  /** Under an agent: the @ that reaches it (ADR 0091). */
  readonly handle?: string | undefined;
  /** It leads the room (ADR 0104), and wears "Lead" beside its name, as in Members. */
  readonly lead?: boolean | undefined;
  /** Its harness, where its name does not say it: "Milo" is Jacobian's (ADR 0150). */
  readonly harness?: string | undefined;
  /** Whose agent it is, where that is somebody else: "Dana's agent" (ADR 0234). */
  readonly owner?: string | undefined;
}

/** The faces for some participants, as a trail's hop draws them. */
export function facesOf(ids: readonly string[], directory: Directory): TrailHop[] {
  return ids.map((id) => ({
    name: nameOf(directory, id),
    kind: faceKind(directory, id),
    // An agent wears its own face (ADR 0089).
    ...(faceOf(directory, id) === undefined ? {} : { icon: faceOf(directory, id) }),
    // An agent that can't answer now wears the amber mark (ADR 0083).
    ...(cantAnswer(directory, id) === undefined ? {} : { cantAnswer: true }),
  }));
}

/** Whether two lists hold the same ids, in any order. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * Each harness, the lead first (ADR 0113), with the @ that reaches it and the lead marked (ADR
 * 0104), then each other person with theirs (ADR 0204), then all of them: the phone's menu and the
 * desktop's are the same list.
 */
function choicesOf(props: AddressProps): Choice[] {
  const { harnesses, people, directory, space, selfId } = props;
  const handles = roomHandles(space, directory);
  const leads = space.home === true ? undefined : roomLeadOf(space);
  const first = leads !== undefined && harnesses.includes(leads) ? [leads] : [];
  return [
    ...[...first, ...harnesses.filter((id) => id !== leads)].map((id) => ({
      key: id,
      ids: [id],
      pick: [id],
      words: nameOf(directory, id),
      handle: handles[id],
      lead: id === leads,
      owner: ownerWords(directory, id, selfId),
      harness: harnessUnder(directory, id),
    })),
    ...people.map((id) => ({
      key: id,
      ids: [id],
      pick: [id],
      words: nameOf(directory, id),
      handle: handles[id],
    })),
    {
      key: "everyone",
      ids: [...harnesses, ...people],
      pick: "all" as const,
      words: "Everyone",
      under: answerWords(harnesses, people.length > 0, directory),
    },
  ];
}

/** Whose an agent is, before its harness, where it is somebody else's (ADR 0234). */
function ownerWords(directory: Directory, id: string, selfId: string): string | undefined {
  const owner = belongsTo(directory, id, selfId);
  return owner === undefined ? undefined : `${owner}'s agent`;
}

/**
 * Who answers a message to Everyone, under its row, as the phone says it: "Both answer" for two
 * agents and "All answer" for more, "Both agents answer" and "All agents answer" where people are
 * listed too, the agent by name where there is one, and "Everyone here reads it" where there is
 * none (ADR 0204).
 */
function answerWords(agents: readonly string[], people: boolean, directory: Directory): string {
  const [only] = agents;
  if (only === undefined) return "Everyone here reads it";
  if (agents.length === 1) return `${nameOf(directory, only)} answers`;
  const who = people ? " agents" : "";
  return agents.length === 2 ? `Both${who} answer` : `All${who} answer`;
}

/** What the faces' name adds of what decided them: an @, or a reply (ADR 0219). */
const BY_WORDS: Readonly<Record<Aim["by"], string>> = {
  at: ", by @",
  reply: ", by reply",
  pick: "",
  default: "",
};

/**
 * After the faces: an @ where an @ decided, the reply's arrow where a reply did (ADR 0219), else
 * the chevron that says the faces open a list.
 */
function AimBy({ by }: { readonly by: Aim["by"] }) {
  if (by === "at")
    return (
      <span className="aim-by" aria-hidden="true">
        @
      </span>
    );
  if (by === "reply") return <Icon name="reply" size={13} className="aim-by-reply" />;
  return <Icon name="down" size={12} className="aim-chevron" />;
}

/** What leads the field, and what the field opens into: the composer's `lead` and `above`. */
export interface AddressInField {
  readonly lead: ReactNode;
  readonly above: ReactNode;
}

/**
 * The faces at the front of the field, and the list it opens into, for the composer to place. A
 * room with one harness has nowhere else for a message to go, and neither (ADR 0081).
 */
export function useAddressInField(props: AddressProps): AddressInField {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  // The press opened the list, so the click it ends in is not a second toggle (ADR 0229).
  const opened = useRef(false);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus({ preventScroll: true });
  };
  useOutside(button, list, open, () => close(false));

  const { aim, space, directory } = props;
  if (aim === undefined) return { lead: undefined, above: undefined };
  const choices = choicesOf(props);
  const current = choices.findIndex((choice) => sameSet(choice.ids, aim.ids));
  // Under Everyone no agent is selected: the first one added starts afresh (`addedTo`).
  // Everyone as Everyone, rather than a list that holds them all: the rows say which.
  const whole = aimsAtEveryone(aim, props.picked);
  const included = (choice: Choice) =>
    choice.pick === "all" ? whole : !whole && choice.ids.every((id) => aim.ids.includes(id));
  const words = aimWordsOf(aim, space, directory);
  const everyone = words === "Everyone";
  // How many, where the mark stands for Everyone (ADR 0113); "4 agents" says so already.
  const many =
    everyone && marked(aim.ids.length, true) ? `, ${countedWords(aim.ids, directory)}` : "";
  // Pressed, the list opens at once; let go on a row after sliding, and that row is picked alone.
  const press = (event: PressEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const from = { x: event.clientX, y: event.clientY };
    opened.current = !open;
    if (!open) setOpen(true);
    const up = (lifted: PointerEvent) => {
      window.removeEventListener("pointerup", up);
      const moved = Math.hypot(lifted.clientX - from.x, lifted.clientY - from.y) > SLIDE_PX;
      const target = lifted.target instanceof Node ? lifted.target : null;
      // Let go where it began, or back on the faces: a click, which the button's own handler has.
      if (!moved || button.current?.contains(target)) return;
      opened.current = false;
      const choice = choices[rowAt(list.current, lifted.clientX, lifted.clientY)];
      if (choice !== undefined) props.onPick(choice.pick);
      close(choice !== undefined);
    };
    window.addEventListener("pointerup", up);
  };

  const lead = (
    <button
      ref={button}
      type="button"
      className="aim-button"
      data-testid="aim"
      // "To", not "Send to": the composer's own button is Send, and a name that holds it is two
      // buttons to anything that finds one by its name's words.
      aria-label={`To ${words}${many}${BY_WORDS[aim.by]}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      onPointerDown={press}
      onClick={() => {
        if (opened.current) {
          opened.current = false;
          return;
        }
        setOpen((was) => !was);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        setOpen(true);
      }}
    >
      {/* Keyed by what it says, so a change fades the new faces in where the old ones were. */}
      <span className="aim-says" key={`${aim.by}:${aim.ids.join(",")}`}>
        <span className="aim-arrow" aria-hidden="true">
          →
        </span>
        {aim.ids.length > 0 && (
          <FaceGroup faces={facesOf(aim.ids, directory)} small everyone={everyone} />
        )}
      </span>
      <AimBy by={aim.by} />
    </button>
  );
  const above = open ? (
    <Menu
      id={listId}
      list={list}
      choices={choices}
      current={current}
      directory={directory}
      onChoose={(choice) => {
        props.onPick(choice.pick);
        close(true);
      }}
      included={included}
      onAdd={(choice) => {
        const [id] = choice.ids;
        if (id !== undefined) props.onPick(addedTo(aim, props.picked, id, space, directory));
      }}
      onClose={close}
    />
  ) : undefined;
  return { lead, above };
}

/**
 * The list the field opens into: a listbox whose options are buttons, so a click and Enter are
 * the same thing, and the arrow keys walk them the way `LineMenu` walks its items. It opens on
 * the one the faces say now.
 */
function Menu(props: {
  readonly id: string;
  readonly list: RefObject<HTMLDivElement | null>;
  readonly choices: readonly Choice[];
  readonly current: number;
  readonly directory: Directory;
  readonly onChoose: (choice: Choice) => void;
  readonly onClose: (refocus: boolean) => void;
  /** Whether a row is one of who the message goes to. */
  readonly included: (choice: Choice) => boolean;
  /** An agent, clicked or keyed: added or taken out, and the list stays open. */
  readonly onAdd: (choice: Choice) => void;
}) {
  const { choices, current, list } = props;
  const [active, setActive] = useState(Math.max(current, 0));
  const [above, setAbove] = useState(false);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLButtonElement>('[data-active="true"]')
      ?.focus({ preventScroll: true });
  }, [list]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const choice = choices[active];
    const pressed = pressOf(event.key, choice);
    if (pressed !== undefined && choice !== undefined) {
      // The option's own click is held back (`onKeyUp`, and Enter here), so it happens once.
      event.preventDefault();
      if (pressed === "add") props.onAdd(choice);
      else props.onChoose(choice);
      return;
    }
    const next = stepOf(event.key, active, choices.length);
    if (next === "close") {
      event.preventDefault();
      props.onClose(true);
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
  };
  const option = (choice: Choice, index: number) => (
    <button
      key={choice.key}
      type="button"
      role="option"
      className="aim-option"
      aria-selected={props.included(choice)}
      aria-label={labelOf(choice)}
      tabIndex={index === active ? 0 : -1}
      data-active={index === active ? "true" : undefined}
      onClick={(event) => {
        // A click on the circle adds or takes out; anywhere else picks it alone, and closes.
        const circle = (event.target as Element).closest(".aim-add") !== null;
        if (circle && choice.pick !== "all") props.onAdd(choice);
        else props.onChoose(choice);
      }}
      onPointerEnter={() => setActive(index)}
    >
      {/* The faces say again what the words say: seen, not read out. */}
      <span className="aim-option-faces" aria-hidden="true">
        <FaceGroup
          faces={facesOf(choice.ids, props.directory)}
          small
          everyone={choice.pick === "all"}
          counted={false}
        />
      </span>
      <span className="aim-option-words">
        <span className="aim-option-name">
          {choice.words}
          {choice.lead === true && (
            <span className="aim-lead" data-testid="aim-lead">
              Lead
            </span>
          )}
        </span>
        {choice.under !== undefined && <small>{choice.under}</small>}
        {choice.handle !== undefined && (
          <small className="aim-handle">
            {choice.handle}
            {choice.owner !== undefined && (
              <span className="aim-harness">
                {" · "}
                <span className="aim-owner">{choice.owner}</span>
              </span>
            )}
            {choice.harness !== undefined && (
              <span className="aim-harness">{` · ${choice.harness}`}</span>
            )}
          </small>
        )}
      </span>
      <Picked choice={choice} on={props.included(choice)} />
    </button>
  );
  const last = choices.length - 1;
  return (
    <div
      ref={list}
      id={props.id}
      className="aim-menu"
      role="listbox"
      aria-multiselectable="true"
      aria-label="Where the next message goes"
      data-testid="aim-menu"
      onKeyDown={onKeyDown}
      // A button clicks on Space's release: here Space has added already, on its press.
      onKeyUp={(event) => {
        if (event.key === " ") event.preventDefault();
      }}
    >
      {/* The harnesses scroll, fading at the top while there are more above; Everyone stays. */}
      <div
        className="aim-rows"
        data-above={above ? "true" : undefined}
        data-testid="aim-rows"
        onScroll={(event) => setAbove(event.currentTarget.scrollTop > 1)}
      >
        {choices.slice(0, last).map(option)}
      </div>
      <div className="aim-everyone">
        {choices.slice(last).map((choice) => option(choice, last))}
      </div>
    </div>
  );
}

/**
 * Everyone's check, or an agent's circle, filled while it is one of who the message goes to
 * (ADR 0114). Seen, not read out: the option's own selected state says it.
 */
function Picked({ choice, on }: { readonly choice: Choice; readonly on: boolean }) {
  if (choice.pick === "all") {
    return on ? <Icon name="check" size={14} className="aim-check" /> : null;
  }
  return (
    <span
      className="aim-add"
      data-on={on ? "true" : undefined}
      aria-hidden="true"
      data-testid={`aim-add-${choice.words}`}
    >
      {on && <Icon name="check" size={12} />}
    </span>
  );
}

/**
 * "Scout, @Scout": the @ is said apart from the name, as the phone says it, and "lead" between
 * them for the room's lead, whose agent it is where it is somebody else's, and its harness after
 * where the name does not say it ("Theo, @Theo, Dana's agent, Hermes"). Everyone is named by its
 * words alone.
 */
function labelOf(choice: Choice): string | undefined {
  if (choice.handle === undefined && choice.lead !== true) return undefined;
  return [
    choice.words,
    choice.lead === true ? "lead" : undefined,
    choice.handle,
    choice.owner,
    choice.harness,
  ]
    .filter((part) => part !== undefined)
    .join(", ");
}

/**
 * What a key does to the list's active row (ADR 0114): Space is the circle's, an agent added or
 * taken out with the list left open; Enter is the name's, picked alone and the list closed.
 * Everyone is picked by either.
 */
function pressOf(key: string, choice: Choice | undefined): "add" | "choose" | undefined {
  if (choice === undefined || (key !== " " && key !== "Enter")) return undefined;
  return key === " " && choice.pick !== "all" ? "add" : "choose";
}

/**
 * Where a key moves the menu's highlight: up and down wrap, Home and End go to the ends, and
 * Escape and Tab close it. Anything else is not the menu's.
 */
function stepOf(key: string, active: number, count: number): number | "close" | undefined {
  switch (key) {
    case "ArrowDown":
      return (active + 1) % count;
    case "ArrowUp":
      return (active - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "Escape":
    case "Tab":
      return "close";
    default:
      return undefined;
  }
}

/** Which of the list's rows is at a point on the page, in their order; -1 for none (ADR 0229). */
function rowAt(list: HTMLElement | null, x: number, y: number): number {
  const row = document.elementFromPoint(x, y)?.closest('[role="option"]');
  if (list === null || row === null || row === undefined) return -1;
  return [...list.querySelectorAll('[role="option"]')].indexOf(row);
}

/** A press anywhere but the faces and the list closes the list, as any menu does. */
export function useOutside(
  button: RefObject<HTMLElement | null>,
  list: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) close.current();
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [button, list, open]);
}
