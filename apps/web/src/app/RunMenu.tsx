/**
 * The thinking bubble's menu (ADR 0293): who is working and for how long at its head, then Pause
 * or Resume, and Stop. A right-click on the bubble, the keyboard's menu key on it, or a press held
 * on a touch screen opens it at the pointer. It is the message menu in its look and its keys
 * (`LineMenu.tsx`, `RowMenu.tsx`): ↑ and ↓ walk it, Escape or a press elsewhere puts it away and
 * gives the bubble back the focus, and it fades and lifts out as it came in.
 *
 * It replaced the Run panel, the third column a working room grew on the Mac and the web
 * (ADR 0151, ADR 0284), which Arjun did not want: "please remove the right section for desktop
 * and web… Instead I want a pause and stop in the right click / long press menu".
 */

import { type Doing, RUN_ASKED_BEAT_MS, type RunAct, type RunMenuItem } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { focusFirst, menuPoint, useClamped, useDismiss, useLeaving, walk } from "./RowMenu.tsx";
import { moving } from "./roomMoves.ts";

/** A press held this long on a touch screen opens the menu, as the phone's long press does. */
export const HOLD_MS = 450;
/** A finger that moves this far before then is scrolling, not holding. */
const HOLD_SLOP = 8;

type At = { readonly x: number; readonly y: number };

/**
 * The menu asked for on something, and how: `open` at a point, from a right-click (`onContextMenu`),
 * the keyboard's menu key (`onKeyDown`), or a press held on a touch screen (the pointer handlers),
 * which sinks the thing held a little while it waits (`pressing`). `key` is new for each asking, so
 * each menu is its own; `close` puts it away (fading, unless Reduce Motion), and `gone` once it has.
 */
export function useRunMenu(on: boolean) {
  const [at, setAt] = useState<At | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const [key, setKey] = useState(0);
  const [pressing, setPressing] = useState(false);
  const from = useRef<HTMLElement | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | undefined>(
    undefined,
  );
  // A touch's own context menu, which some browsers raise for a long press too, is not a second ask.
  const touched = useRef(false);
  useEffect(() => () => clearTimeout(hold.current?.timer), []);

  const open = (point: At, element: HTMLElement) => {
    from.current = element;
    setLeaving(false);
    setKey((now) => now + 1);
    setAt(point);
  };
  const release = () => {
    clearTimeout(hold.current?.timer);
    hold.current = undefined;
    setPressing(false);
  };
  const close = () => {
    if (moving()) setLeaving(true);
    else setAt(undefined);
    from.current?.focus({ preventScroll: true });
  };
  const handlers = on
    ? {
        onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
          event.preventDefault();
          if (touched.current) return;
          open(menuPoint(event), event.currentTarget);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          open({ x: box.left + 12, y: box.bottom + 4 }, event.currentTarget);
        },
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
          touched.current = event.pointerType !== "mouse";
          if (!touched.current || event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button") !== null) return;
          const element = event.currentTarget;
          const { clientX: x, clientY: y } = event;
          setPressing(true);
          hold.current = {
            x,
            y,
            timer: setTimeout(() => {
              release();
              open({ x, y }, element);
            }, HOLD_MS),
          };
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
          const held = hold.current;
          if (held === undefined) return;
          if (Math.hypot(event.clientX - held.x, event.clientY - held.y) > HOLD_SLOP) release();
        },
        onPointerUp: release,
        onPointerCancel: release,
        onPointerLeave: release,
      }
    : {};
  return {
    at,
    leaving,
    key,
    pressing,
    handlers,
    close,
    gone: () => {
      setAt(undefined);
      setLeaving(false);
    },
  };
}

/**
 * The act a person asked of a bubble's run, until it lands: a Pause lands when the run says it is
 * paused, a Resume when it no longer does, and a Stop takes the bubble away. `late` once the beat
 * has gone by with no answer, when the bubble says "Pausing" or "Stopping". One the server turned
 * away is let go once the store's mark on the run has gone and nothing changed.
 */
export function useRunAsked(doing: Doing, busy: boolean) {
  const [act, setAct] = useState<RunAct | undefined>(undefined);
  const [late, setLate] = useState(false);
  const sawBusy = useRef(false);
  const paused = doing.paused === true;
  useEffect(() => {
    setLate(false);
    if (act === undefined) return;
    const beat = setTimeout(() => setLate(true), RUN_ASKED_BEAT_MS);
    return () => clearTimeout(beat);
  }, [act]);
  useEffect(() => {
    if ((act === "pause" && paused) || (act === "resume" && !paused)) setAct(undefined);
  }, [act, paused]);
  useEffect(() => {
    if (act === undefined) {
      sawBusy.current = false;
      return;
    }
    if (busy) {
      sawBusy.current = true;
      return;
    }
    if (!sawBusy.current) return;
    sawBusy.current = false;
    // The answer may come a frame after the mark goes: give it a moment before letting go.
    const refused = setTimeout(() => setAct(undefined), 600);
    return () => clearTimeout(refused);
  }, [busy, act]);
  return { act, late: late && act !== undefined, ask: setAct };
}

export function RunMenu({
  at,
  head,
  items,
  label,
  waiting,
  leaving,
  onGone,
  onClose,
  onAct,
}: {
  readonly at: { readonly x: number; readonly y: number };
  readonly head: string;
  readonly items: readonly RunMenuItem[];
  /** What a screen reader calls the menu: `What to do with Luis's work`. */
  readonly label: string;
  /** A Pause, a Resume or a Stop is on its way: none is offered twice. */
  readonly waiting: boolean;
  readonly leaving: boolean;
  readonly onGone: () => void;
  readonly onClose: () => void;
  readonly onAct: (act: RunAct) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const where = useClamped(menu, at);
  useDismiss(menu, onClose);
  const gone = useLeaving(leaving, onGone);
  return createPortal(
    <div
      ref={menu}
      className="line-menu run-menu"
      role="menu"
      aria-label={label}
      data-testid="run-menu"
      data-leaving={leaving ? "true" : undefined}
      style={{ left: `${where.x}px`, top: `${where.y}px` }}
      onAnimationEnd={gone}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        walk(event);
      }}
    >
      <div className="line-menu-head" data-testid="run-menu-head">
        {head}
      </div>
      {items.map((item, index) => (
        <button
          key={item.act}
          type="button"
          role="menuitem"
          className="line-menu-item"
          data-testid={`run-act-${item.act}`}
          data-danger={item.danger === true ? "true" : undefined}
          disabled={waiting}
          ref={index === 0 ? focusFirst : undefined}
          onClick={() => onAct(item.act)}
        >
          <span className="line-menu-label">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
