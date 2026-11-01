/**
 * Lock changes, as one row: an agent's on its page (ADR 0199), as the phone's `ui/LockRow` is, and
 * how it flips, which the room sheet's Lock changes tile shares (ADR 0202). While it holds nobody
 * renames, archives or deletes what it is on; what may flip it is the caller's to say.
 */

import { Icon } from "@chipschat/ui";
import { useEffect, useState } from "react";
import { Row, Tile } from "./room/parts.tsx";
import { Switch } from "./you/controls.tsx";

/** How long a lock just flipped stands on its switch before its own word is shown again. */
const HELD_MS = 3000;

/**
 * Whether the switch shows on: flipped, it stands as it was put until `locked` changes, which is
 * the server taking it, or for a moment; one the server turned away goes back at once, and the
 * caller says why.
 */
export function useLockFlip(
  locked: boolean,
  onLock: (locked: boolean) => Promise<boolean>,
): { readonly on: boolean; readonly flip: (next: boolean) => void } {
  const [held, setHeld] = useState<{ readonly on: boolean; readonly over: boolean } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (held === undefined) return;
    const gone = setTimeout(() => setHeld(undefined), HELD_MS);
    return () => clearTimeout(gone);
  }, [held]);
  const on = held !== undefined && held.over === locked ? held.on : locked;
  const flip = (next: boolean) => {
    setHeld({ on: next, over: locked });
    void onLock(next).then((taken) => {
      if (!taken) setHeld(undefined);
    });
  };
  return { on, flip };
}

/** A padlock, open until the switch closes it, and the switch. */
export function LockRow(props: {
  /** Whether its changes are locked, by the server's word. */
  readonly locked: boolean;
  /** Something asked of the server and not yet answered. */
  readonly busy: boolean;
  /** Lock its changes or let them go: whether the server took it. */
  readonly onLock: (locked: boolean) => Promise<boolean>;
  readonly testId: string;
  /** The switch's own, where a test flips it by id rather than by its name. */
  readonly switchTestId?: string | undefined;
}) {
  const { on, flip } = useLockFlip(props.locked, props.onLock);
  return (
    <Row
      face={
        <Tile>
          <Padlock on={on} />
        </Tile>
      }
      name="Lock changes"
      under="Rename, archive, delete"
      testId={props.testId}
      trailing={
        <Switch
          label="Lock changes"
          checked={on}
          disabled={props.busy}
          onChange={flip}
          testId={props.switchTestId}
        />
      }
    />
  );
}

/**
 * The padlock on Lock changes (ADR 0156): the design system's `lock` once the changes are locked,
 * and until then open, its shackle lifted up and to the side as the mock drew it and the phone
 * draws it. The design system has no open one, so it is drawn here in `Icon`'s box and stroke.
 */
export function Padlock({ on }: { readonly on: boolean }) {
  if (on) return <Icon name="lock" size={16} />;
  return (
    <svg
      className="ui-icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon="unlock"
    >
      <path d="M5.5 11h13v9.5h-13z" />
      <path d="M11.5 11V5.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
