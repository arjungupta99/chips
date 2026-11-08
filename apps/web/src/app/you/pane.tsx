/**
 * The page a row of You's opens (ADR 0265): beside the list where You is wide enough for both, as
 * Settings stands a page beside its own on the iPad (ADR 0256's addendum, 3), and in the list's place
 * where it is not, with the way back to You at its top. People, a person from People, Invite
 * someone, Relay, Connection and the workspace's log open here, and your face's picker from the
 * face itself (ADR 0272).
 *
 * The shorter settings open here too, as pages (ADR 0265's addendum of 3 November 2026): a form
 * says where it stands through `FormHost`, which You holds for its list and a page holds for what
 * it opens itself (Go direct from Connection, Turn off from Relay), with the way back to that page.
 * One form at a time: one opening closes the one open, and a page opening from the list does too.
 */

import { Icon } from "@chipschat/ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** What a row of You's opens beside the list. */
export type YouPage = "face" | "people" | "invite" | "relay" | "connection" | "log";

/** Where a form's page stands, and what it tells the place as it opens and goes. */
export interface FormHost {
  /** The element the page is drawn into. */
  readonly slot: HTMLElement | null;
  /** The path of the view it stands over, which a form's own continues (`motion.ts`). */
  readonly path: string;
  /** Where ‹ goes back to: none beside the list, "You" in its place, a page's name over it. */
  readonly back: string | undefined;
  /** The row whose form is open, which wears the chosen ground beside the list. */
  readonly lit: HTMLElement | null;
  /**
   * A form has opened from `from`: `enter` gives it the keyboard once it is drawn, and `close`
   * folds it away when something else opens here.
   */
  readonly opened: (
    id: string,
    from: HTMLElement | null,
    parts: { readonly enter: () => void; readonly close: () => void },
  ) => void;
  /** It has gone; by its own hand (‹, Cancel, Save), the keyboard goes back to its row. */
  readonly gone: (id: string, self: boolean) => void;
}

export const FormHostContext = createContext<FormHost | undefined>(undefined);

/** The host a form's page finds: the nearest page's, else You's list's; none, drawn alone. */
export function useFormHost(): FormHost | undefined {
  return useContext(FormHostContext);
}

interface Open {
  readonly id: string;
  readonly from: HTMLElement | null;
  readonly enter: () => void;
}

/**
 * A place forms stand: the form open, if any, and the host to hand down. `onOpened` is told when
 * one opens, so a page that stood there steps aside; `close` folds the one open.
 */
export function useForms(back: string | undefined, path: string, onOpened?: () => void) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<Open | undefined>(undefined);
  // What the host's calls read, since a form keeps the host it found as it opened.
  const now = useRef<Open | undefined>(undefined);
  const closer = useRef<(() => void) | undefined>(undefined);
  const told = useRef(onOpened);
  told.current = onOpened;
  const returnTo = useRef<HTMLElement | null>(null);
  const opened = useCallback<FormHost["opened"]>((id, from, { enter, close }) => {
    const before = closer.current;
    if (now.current !== undefined && now.current.id !== id) before?.();
    now.current = { id, from, enter };
    closer.current = close;
    returnTo.current = null;
    setOpen(now.current);
    told.current?.();
  }, []);
  const gone = useCallback((id: string, self: boolean) => {
    if (now.current?.id !== id) return;
    if (self) returnTo.current = now.current.from;
    now.current = undefined;
    closer.current = undefined;
    setOpen(undefined);
  }, []);
  // Into the form once it is drawn, where the list's place was hidden until now; and back to the
  // row once whatever hid it while the form was up has drawn it again.
  useEffect(() => {
    if (open !== undefined) {
      open.enter();
      return;
    }
    const row = returnTo.current;
    returnTo.current = null;
    if (row?.isConnected === true) row.focus();
  }, [open]);
  const host = useMemo<FormHost>(
    () => ({ slot, back, path, lit: open?.from ?? null, opened, gone }),
    [slot, back, path, open, opened, gone],
  );
  const close = useCallback(() => closer.current?.(), []);
  return { host, setSlot, open: open !== undefined, close };
}

/** A page: its name in the bar over it, with the way back where there is one. */
export function Pane(props: {
  readonly title: string;
  /** Where it stands: "people", and "people/per_…" for a person from it (`motion.ts`). */
  readonly path: string;
  /** Where ‹ goes back to: "You" in the list's place, "People" from a person. */
  readonly back?: string | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  const { onBack } = props;
  // What the page opens itself stands in its place, with the way back to it.
  const forms = useForms(props.title, props.path);
  return (
    <>
      <section
        className="you-pane"
        aria-label={props.title}
        hidden={forms.open}
        data-view={props.path}
        data-testid={props.testId}
      >
        <div className="you-pane-bar">
          {onBack !== undefined && (
            <button type="button" className="you-pane-back" onClick={onBack}>
              ‹ {props.back}
            </button>
          )}
          <h2>{props.title}</h2>
        </div>
        <FormHostContext.Provider value={forms.host}>
          <div className="you-pane-body">{props.children}</div>
        </FormHostContext.Provider>
      </section>
      <div ref={forms.setSlot} className="you-pane-slot" />
    </>
  );
}

/** Beside the list with no row chosen yet: what the pane is for, as the iPad says it. */
export function PaneEmpty() {
  return (
    <div className="you-pane-empty" data-view="~" data-testid="you-pane-empty">
      <span className="you-pane-empty-mark" aria-hidden="true">
        <Icon name="user" size={22} />
      </span>
      <b>Nothing open</b>
      <span>Choose a row on the left.</span>
    </div>
  );
}
