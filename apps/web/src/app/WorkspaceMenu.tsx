/**
 * The workspace's name at the top of the rail, and what it opens: the phone's Workspaces sheet
 * (`apps/mobile/src/workspaces/Switcher.tsx`, ADR 0197), as a menu hanging under the name. Each
 * workspace this browser or Mac is paired with, with the person's role there and a tick on the one
 * in front or how many things wait in another; Rename for the owner of the one in front (ADR 0194);
 * Watch Chips work, the film over the app (ADR 0217); Remove for the demo (ADR 0213); and Join
 * another workspace, where the Mac app can pair with another server, or Set up my own Chips from
 * the demo.
 *
 * It was the browser's own drop-down until 3 November 2026, drawn only with something to choose:
 * with one workspace in a browser the name had nothing behind it, so the film could not be watched
 * again and the workspace not renamed from where its name stands.
 *
 * Its keys are a menu's (`RowMenu.tsx`): ↑ and ↓, Escape, a click elsewhere, and the name has the
 * focus back when it goes. Rename turns the menu into the name in a field, as the phone's sheet
 * turns its page: Enter or Save keeps it, Escape or Back leaves it as it was, and a name the server
 * refuses stays in the field with why under it.
 */

import { ROLE_WORDS, type WorkspaceRole } from "@chipschat/core";
import { ChipMark, Icon } from "@chipschat/ui";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { focusFirst, useClamped, useDismiss, useLeaving, walk } from "./RowMenu.tsx";
import { moving } from "./roomMoves.ts";

/** One paired workspace as the menu lists it (M5.3). */
export interface WorkspaceTab {
  readonly deviceId: string;
  readonly label: string;
  readonly current: boolean;
  readonly muted: boolean;
  readonly needsYou?: number | undefined;
  /** The made-up workspace of the demo (ADR 0213), which Remove takes out. */
  readonly demo?: boolean | undefined;
  /** The person's role there, as its store last heard it. */
  readonly role?: WorkspaceRole | undefined;
}

export interface WorkspaceMenuProps {
  readonly workspaces: readonly WorkspaceTab[];
  readonly onSwitch?: ((deviceId: string) => void) | undefined;
  /** Pair with another server: the Mac app's, and the demo's way to set up your own. */
  readonly onPairAnother?: (() => void) | undefined;
  /** Take the demo out (ADR 0213). */
  readonly onRemoveDemo?: (() => void) | undefined;
  /** Play the demo's films again (ADR 0213, ADR 0217). */
  readonly onWatchDemo?: (() => void) | undefined;
  /** Name the one in front again: its owner's (ADR 0194). Rejects with why, which is said. */
  readonly onRename?: ((name: string) => Promise<void>) | undefined;
  /** In the Mac app: what the demo's Remove says it goes from. */
  readonly desktop?: boolean | undefined;
}

/** What a row says of its workspace under its name: the role there, or that it is quiet here. */
function standing(tab: WorkspaceTab): string | undefined {
  if (tab.muted) return "Notifications off here";
  return tab.role === undefined ? undefined : ROLE_WORDS[tab.role];
}

export function WorkspaceMenu(props: WorkspaceMenuProps) {
  const current = props.workspaces.find((each) => each.current);
  const label = current?.label ?? "Chips";
  const [open, setOpen] = useState(false);
  // Put away and fading out as it came in (`useLeaving`).
  const [leaving, setLeaving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    if (moving()) setLeaving(true);
    else setOpen(false);
    button.current?.focus({ preventScroll: true });
  };
  return (
    <span className="side-switch">
      <button
        ref={button}
        type="button"
        className="side-ws"
        aria-haspopup="menu"
        aria-expanded={open && !leaving}
        aria-label={`${label}, Workspaces`}
        data-testid="workspace-switcher"
        onClick={() => {
          if (open && !leaving) close();
          else {
            setLeaving(false);
            setOpen(true);
          }
        }}
      >
        <b data-testid="workspace-name">{label}</b>
        <Icon name="down" size={13} className="side-ws-turn" />
      </button>
      {open ? (
        <Menu
          {...props}
          opener={button}
          leaving={leaving}
          onGone={() => {
            setOpen(false);
            setLeaving(false);
          }}
          onClose={close}
        />
      ) : null}
    </span>
  );
}

function Menu(
  props: WorkspaceMenuProps & {
    readonly opener: React.RefObject<HTMLButtonElement | null>;
    readonly leaving: boolean;
    readonly onGone: () => void;
    readonly onClose: () => void;
  },
) {
  const { onClose } = props;
  const gone = useLeaving(props.leaving, props.onGone);
  const menu = useRef<HTMLDivElement>(null);
  const box = props.opener.current?.getBoundingClientRect();
  const at = useClamped(menu, { x: box?.left ?? 8, y: (box?.bottom ?? 40) + 6 });
  useDismiss(menu, onClose, props.opener);
  const [naming, setNaming] = useState(false);
  // Back from Rename: the list turns back in, as the name turned in over it.
  const [back, setBack] = useState(false);
  const current = props.workspaces.find((each) => each.current);
  const then = (act: (() => void) | undefined) => () => {
    onClose();
    act?.();
  };
  return createPortal(
    <div
      ref={menu}
      className="line-menu ws-menu"
      role="menu"
      aria-label="Workspaces"
      data-testid="workspace-menu"
      data-leaving={props.leaving ? "true" : undefined}
      style={{ left: `${at.x}px`, top: `${at.y}px` }}
      onAnimationEnd={gone}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !naming) onClose();
        if (!naming) walk(event);
      }}
    >
      {naming && current !== undefined && props.onRename !== undefined ? (
        <NamePage
          name={current.label}
          onSave={props.onRename}
          onBack={() => {
            setNaming(false);
            setBack(true);
          }}
          onDone={onClose}
        />
      ) : (
        <div className="ws-menu-list" data-back={back ? "true" : undefined}>
          <div className="ws-menu-h" aria-hidden="true">
            Workspaces
          </div>
          {props.workspaces.map((tab, index) => (
            <WorkspaceRow
              key={tab.deviceId}
              tab={tab}
              first={index === 0}
              onChoose={then(
                tab.current || props.onSwitch === undefined
                  ? undefined
                  : () => props.onSwitch?.(tab.deviceId),
              )}
            />
          ))}
          <hr className="ws-menu-line" />
          <Acts
            {...props}
            current={current}
            renames={props.onRename !== undefined}
            onNaming={() => setNaming(true)}
            then={then}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

/** What can be done from the menu, under the workspaces: the phone's sheet's rows, in its order. */
function Acts(
  props: WorkspaceMenuProps & {
    readonly current: WorkspaceTab | undefined;
    readonly renames: boolean;
    readonly onNaming: () => void;
    readonly then: (act: (() => void) | undefined) => () => void;
  },
) {
  const { then } = props;
  const demo = props.workspaces.find((each) => each.demo === true);
  return (
    <>
      {props.renames && props.current !== undefined && props.current.demo !== true && (
        <Item
          id="rename"
          label={`Rename ${props.current.label}`}
          hint="Everyone in it sees the new name"
          onClick={props.onNaming}
        />
      )}
      {props.onWatchDemo !== undefined && (
        <Item
          id="watch-demo"
          label="Watch Chips work"
          hint="A one-minute film in a made-up workspace"
          onClick={then(props.onWatchDemo)}
        />
      )}
      {demo !== undefined && props.onRemoveDemo !== undefined && (
        <Item
          id="remove-demo"
          label={`Remove ${demo.label}`}
          hint={`Its made-up spaces go from this ${props.desktop === true ? "Mac" : "browser"}`}
          danger
          onClick={then(props.onRemoveDemo)}
        />
      )}
      {props.onPairAnother !== undefined && (
        <Item
          id="pair-another"
          label={props.current?.demo === true ? "Set up my own Chips" : "Join another workspace"}
          hint={
            props.current?.demo === true
              ? "Pair with the server on your own computer"
              : "Pair with its code, or paste the invite link someone sent you"
          }
          onClick={then(props.onPairAnother)}
        />
      )}
    </>
  );
}

/** A workspace: its mark, its name and the role there, and a tick on the one in front. */
function WorkspaceRow(props: {
  readonly tab: WorkspaceTab;
  readonly first: boolean;
  readonly onChoose: () => void;
}) {
  const { tab } = props;
  const words = standing(tab);
  const waiting = tab.needsYou ?? 0;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={tab.current}
      className="line-menu-item ws-menu-row"
      data-testid={`workspace-${tab.deviceId}`}
      ref={props.first ? focusFirst : undefined}
      onClick={props.onChoose}
    >
      <span className="ws-menu-mark" aria-hidden="true">
        <ChipMark size={14} />
      </span>
      <span className="ws-menu-words">
        <span className="line-menu-label">{tab.label}</span>
        {words !== undefined && <span className="line-menu-hint">{words}</span>}
      </span>
      {tab.current ? (
        <Icon name="check" size={14} className="ws-menu-tick" />
      ) : waiting > 0 ? (
        <b className="sn-count">
          {waiting}
          <span className="ui-visually-hidden"> waiting</span>
        </b>
      ) : null}
    </button>
  );
}

function Item(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly danger?: boolean;
  readonly onClick: () => void;
}) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="menuitem"
      className="line-menu-item"
      data-testid={`workspace-${props.id}`}
      data-danger={props.danger === true ? "true" : undefined}
      aria-describedby={hintId}
      onClick={props.onClick}
    >
      <span className="line-menu-label">{props.label}</span>
      <span className="line-menu-hint" id={hintId}>
        {props.hint}
      </span>
    </button>
  );
}

/**
 * The workspace's name in a field, from Rename: the phone's name page (ADR 0194). Unchanged, Save
 * only goes back; refused, the name stays with why under it.
 */
function NamePage(props: {
  readonly name: string;
  readonly onSave: (name: string) => Promise<void>;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const [draft, setDraft] = useState(props.name);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const typed = draft.trim();
  const save = async () => {
    if (typed === "" || busy) return;
    if (typed === props.name) {
      props.onDone();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await props.onSave(typed);
      props.onDone();
    } catch (failure) {
      setError(whyNotRenamed(failure));
      setBusy(false);
    }
  };
  return (
    <form
      className="ws-name"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        props.onBack();
      }}
    >
      <label className="ws-menu-h" htmlFor={fieldId}>
        Workspace name
      </label>
      <input
        id={fieldId}
        ref={focusField}
        value={draft}
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        data-testid="workspace-name-field"
        onChange={(event) => setDraft(event.target.value)}
      />
      {error === undefined ? null : (
        <p className="ws-name-error" role="alert">
          {error}
        </p>
      )}
      <span className="ws-name-acts">
        <button type="button" className="ws-name-back" onClick={props.onBack}>
          Back
        </button>
        <button type="submit" className="ws-name-save" disabled={typed === "" || busy}>
          Save
        </button>
      </span>
    </form>
  );
}

/** The field takes the focus as the page opens, with the name in it to change. */
function focusField(field: HTMLInputElement | null): void {
  field?.focus({ preventScroll: true });
  field?.select();
}

/** Why a new name did not hold, in words worth reading: the phone's. */
function whyNotRenamed(failure: unknown): string {
  const said = failure instanceof Error ? failure.message : "";
  if (/404|no route matches/i.test(said)) {
    return "Not saved: this server is older than the app, and can't rename a workspace yet.";
  }
  return said === "" ? "Not saved: the server would not take it." : said;
}
