/**
 * What a room's row in the rail offers, on a right-click: the phone's long press and its swipes,
 * as a menu. Change icon first, as the phone's long press is, which opens the room with its sheet
 * on the Icon page (ADR 0264's addendum); then Pin or Unpin and Hide or Unhide, the reader's own
 * (ADRs 0240, 0205), then Archive or Unarchive and
 * Delete (ADRs 0066, 0067), or Locked in their place (ADR 0156); core's `spaceRowActs` decides
 * which, and `SPACE_ROW_ACT_WORDS` says them, so the phone and the Mac offer the same things in the
 * same words. Archive and Delete ask first, in the room sheet's dialog and words; the rest ask
 * nothing, as a swipe's do, and a refusal is said under Recent.
 *
 * Until 3 November 2026 a row on the web did one thing, open its room: pinning or hiding a room
 * meant opening it and its details first. The menu is a message's (`LineMenu.tsx`) in its look and
 * its keys: a right-click, or the keyboard's menu key on a row, opens it; ↑ and ↓ walk it, and
 * Escape, a click elsewhere or a scroll of the rail puts it away and gives the row back the focus.
 */

import {
  archiveAsking,
  type Directory,
  eraseAsking,
  notTakenWords,
  type RoomRunItem,
  roomRunItems,
  SPACE_ROW_ACT_WORDS,
  type Space,
  type SpaceRowAct,
  whyNotPicked,
} from "@chipschat/core";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { moving } from "./roomMoves.ts";
import { carryOutRunAct, type RunActs } from "./runActs.ts";

/** What a row's acts are carried out through: the store's, handed down by the shell. */
export interface RowActs {
  readonly pin: (spaceId: string, pinned: boolean) => Promise<void>;
  readonly hide: (spaceId: string, hidden: boolean) => Promise<void>;
  readonly archive: (spaceId: string, archived: boolean) => Promise<void> | void;
  readonly erase: (spaceId: string, options: { readonly deleteAgent: boolean }) => Promise<void>;
  /** The room, its sheet on the Icon page: no Change icon without it. */
  readonly icon?: ((spaceId: string) => void) | undefined;
  /**
   * Pause, Resume and Stop for each agent at work in the room, first in its menu (ADR 0293):
   * "Pause Luis", "Stop Luis". Absent, the menu offers none.
   */
  readonly run?: RunActs | undefined;
}

/** What the menu offers: Change icon, and core's acts. */
type MenuAct = "icon" | SpaceRowAct;

/** As the phone's long press says it. */
const CHANGE_ICON = "Change icon";

/** The menu asked for on a row: where, and the row, which has the focus back when it goes. */
export interface RowMenuAsk {
  readonly space: Space;
  readonly title: string;
  readonly acts: readonly SpaceRowAct[];
  readonly x: number;
  readonly y: number;
  readonly from: HTMLElement | null;
}

/** An act that asks first, and the room it is about, named as the row names it. */
interface Confirming {
  readonly kind: "archive" | "delete";
  readonly space: Space;
  readonly title: string;
  /** The row it was asked from, which has the focus back when the dialog goes, if it is still there. */
  readonly from: HTMLElement | null;
}

/** A refusal, said under Recent for a moment; new for each, so the same one twice says it again. */
interface RowNote {
  readonly key: number;
  readonly words: string;
}

/**
 * The menu, the dialog an act asks in, and the note a refusal leaves: the rail draws `menu` and
 * `dialog` where it likes, and `note` under Recent. `open` is a row's `onContextMenu`.
 */
export function useRowMenu({
  acts,
  directory,
  selfId,
  onOpenRoom,
}: {
  readonly acts: RowActs | undefined;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  /** Locked: the room, where its details say why and let the lock go. */
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  const [asked, setAsked] = useState<RowMenuAsk | undefined>(undefined);
  // Put away and on its way out (`useLeaving`); and how many have been asked, so each is its own.
  const [leaving, setLeaving] = useState(false);
  const [asks, setAsks] = useState(0);
  const [confirming, setConfirming] = useState<Confirming | undefined>(undefined);
  const [note, setNote] = useState<RowNote | undefined>(undefined);
  useEffect(() => {
    if (note === undefined) return;
    const gone = setTimeout(() => setNote(undefined), NOTE_MS);
    return () => clearTimeout(gone);
  }, [note]);

  const close = () => {
    const from = asked?.from;
    if (moving()) setLeaving(true);
    else setAsked(undefined);
    from?.focus({ preventScroll: true });
  };
  const run = (act: MenuAct, space: Space, title: string, from: HTMLElement | null) => {
    if (acts === undefined) return;
    if (act === "icon") {
      acts.icon?.(space.id);
      return;
    }
    if (isOwn(act)) {
      ownAct(acts, act, space.id).catch((error: unknown) =>
        setNote({ key: Date.now(), words: notTakenWords(act, error) }),
      );
      return;
    }
    if (act === "unarchive") {
      void acts.archive(space.id, false);
      return;
    }
    if (act === "locked") {
      onOpenRoom(space.id);
      return;
    }
    setConfirming({ kind: act, space, title, from });
  };
  const answered = () => {
    const from = confirming?.from;
    setConfirming(undefined);
    if (from?.isConnected === true) from.focus({ preventScroll: true });
  };

  const menu =
    asked === undefined ? null : (
      <RowMenu
        key={asks}
        ask={asked}
        runs={acts?.run === undefined ? [] : roomRunItems(asked.space, directory)}
        onRun={(item) => {
          close();
          if (acts?.run !== undefined)
            carryOutRunAct(acts.run, item.act, asked.space.id, item.runId);
        }}
        changesIcon={acts?.icon !== undefined}
        leaving={leaving}
        onGone={() => {
          setAsked(undefined);
          setLeaving(false);
        }}
        onClose={close}
        onAct={(act) => {
          close();
          run(act, asked.space, asked.title, asked.from);
        }}
      />
    );
  const dialog =
    confirming === undefined || acts === undefined || selfId === undefined ? null : (
      <ConfirmDialog
        asking={
          confirming.kind === "archive"
            ? archiveAsking(confirming.space, confirming.title, directory)
            : eraseAsking(confirming.space, confirming.title, directory, selfId)
        }
        danger={confirming.kind === "delete"}
        onCancel={answered}
        onConfirm={async ({ too }) => {
          if (confirming.kind === "archive") await acts.archive(confirming.space.id, true);
          else await acts.erase(confirming.space.id, { deleteAgent: too });
          answered();
        }}
      />
    );
  return {
    menu,
    dialog,
    note,
    open: (ask: RowMenuAsk) => {
      setLeaving(false);
      setAsks((now) => now + 1);
      setAsked(ask);
    },
  };
}

/** The reader's own acts, which ask nothing: a pin or a hide, or their undoing. */
type OwnAct = "pin" | "unpin" | "hide" | "unhide";

function isOwn(act: SpaceRowAct): act is OwnAct {
  return act === "pin" || act === "unpin" || act === "hide" || act === "unhide";
}

function ownAct(acts: RowActs, act: OwnAct, spaceId: string): Promise<void> {
  if (act === "pin" || act === "unpin") return acts.pin(spaceId, act === "pin");
  return acts.hide(spaceId, act === "hide");
}

/** How long a refusal stays under Recent before it goes by itself. */
const NOTE_MS = 2800;

/**
 * Where a right-click asks for the menu: at the pointer, or under the row for the keyboard's menu
 * key, which has no pointer and reports the window's corner.
 */
export function menuPoint(event: React.MouseEvent<HTMLElement>): { x: number; y: number } {
  if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY };
  const box = event.currentTarget.getBoundingClientRect();
  return { x: box.left + 12, y: box.bottom + 4 };
}

function RowMenu({
  ask,
  runs,
  onRun,
  changesIcon,
  leaving,
  onGone,
  onClose,
  onAct,
}: {
  readonly ask: RowMenuAsk;
  /** Each agent at work in the room: its Pause or Resume, and its Stop, above the rest. */
  readonly runs: readonly RoomRunItem[];
  readonly onRun: (item: RoomRunItem) => void;
  readonly changesIcon: boolean;
  readonly leaving: boolean;
  readonly onGone: () => void;
  readonly onClose: () => void;
  readonly onAct: (act: MenuAct) => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const at = useClamped(menu, ask);
  useDismiss(menu, onClose);
  const gone = useLeaving(leaving, onGone);
  const offered: readonly MenuAct[] = changesIcon ? ["icon", ...ask.acts] : ask.acts;
  return createPortal(
    <div
      ref={menu}
      className="line-menu row-menu"
      role="menu"
      aria-label={`What to do with ${ask.title}`}
      data-testid="row-menu"
      data-leaving={leaving ? "true" : undefined}
      style={{ left: `${at.x}px`, top: `${at.y}px` }}
      onAnimationEnd={gone}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        walk(event);
      }}
    >
      {runs.map((item, index) => (
        <button
          key={`${item.runId}-${item.act}`}
          type="button"
          role="menuitem"
          className="line-menu-item"
          data-testid={`row-run-${item.act}`}
          data-danger={item.danger === true ? "true" : undefined}
          ref={index === 0 ? focusFirst : undefined}
          onClick={() => onRun(item)}
        >
          <span className="line-menu-label">{item.label}</span>
        </button>
      ))}
      {runs.length > 0 && offered.length > 0 && <hr className="line-menu-rule" />}
      {offered.map((act, index) => {
        // Locked says why, under it, in the words a row that can't be picked says it in.
        const hint = act === "locked" ? whyNotPicked(ask.space, ask.title) : undefined;
        return (
          <button
            key={act}
            type="button"
            role="menuitem"
            className="line-menu-item"
            data-testid={`row-act-${act}`}
            data-danger={act === "delete" ? "true" : undefined}
            ref={index === 0 && runs.length === 0 ? focusFirst : undefined}
            aria-describedby={hint === undefined ? undefined : `${id}-${act}`}
            onClick={() => onAct(act)}
          >
            <span className="line-menu-label">
              {act === "icon" ? CHANGE_ICON : SPACE_ROW_ACT_WORDS[act]}
            </span>
            {hint !== undefined && (
              <span className="line-menu-hint" id={`${id}-${act}`}>
                {hint}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Longer than a menu takes to fade out (`.line-menu[data-leaving]`, `--motion-fast`). */
const LEAVE_MS = 240;

/**
 * A menu put away fades and lifts out as it came in (`.line-menu[data-leaving]`) before it goes:
 * `onGone` once its fade has ended, or a moment after, should a tab in the background never draw
 * it. Its owner puts it away at once with Reduce Motion, when there is nothing to watch.
 */
export function useLeaving(
  leaving: boolean,
  onGone: () => void,
): (event: React.AnimationEvent<HTMLElement>) => void {
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => gone.current(), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return (event) => {
    if (leaving && event.target === event.currentTarget) gone.current();
  };
}

/** The first item takes the focus, so a menu opened from the keyboard is usable from it. */
export function focusFirst(element: HTMLButtonElement | null): void {
  element?.focus({ preventScroll: true });
}

/** Up and down walk the items. */
export function walk(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const here = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  buttons[(here + step + buttons.length) % buttons.length]?.focus();
}

/** Measured once drawn, and pulled back inside the window where it would hang off an edge. */
export function useClamped(
  menu: React.RefObject<HTMLDivElement | null>,
  at: { readonly x: number; readonly y: number },
) {
  const [where, setWhere] = useState({ x: at.x, y: at.y });
  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (box === undefined) return;
    const margin = 8;
    setWhere({
      x: Math.max(margin, Math.min(at.x, window.innerWidth - box.width - margin)),
      y: Math.max(margin, Math.min(at.y, window.innerHeight - box.height - margin)),
    });
  }, [menu, at.x, at.y]);
  return where;
}

/**
 * A press elsewhere, the rail scrolled by a wheel, or the window resized: not this row. A press on
 * `opener`, the button the menu hangs from, is the button's own to answer.
 */
export function useDismiss(
  menu: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
  opener?: React.RefObject<HTMLElement | null>,
): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const outside = (event: Event) => {
      const at = event.target as Node;
      if (menu.current?.contains(at) || opener?.current?.contains(at)) return;
      close.current();
    };
    const resized = () => close.current();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    window.addEventListener("resize", resized);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("wheel", outside, { capture: true });
      window.removeEventListener("resize", resized);
    };
  }, [menu, opener]);
}
