/**
 * Not in the demo (ADR 0213, point 7): in the demo's workspace, what needs a server of your own —
 * connecting a harness, inviting somebody, pairing a device — says so in a short line in place of
 * the control, with **Set up my own Chips** beside it, which leaves the demo for the pairing page's
 * ways in. The demo's workspace provides the way there (`SetUpOwn`); any other has none, and the
 * control is drawn as always.
 */

import { Button } from "@chipschat/ui";
import { createContext, useContext } from "react";

/** Set up my own Chips, while the workspace in front is the demo; none for any other. */
export const SetUpOwn = createContext<(() => void) | undefined>(undefined);

/** The way to set up your own, when this is the demo and what it would do is not in it. */
export function useNotInDemo(): (() => void) | undefined {
  return useContext(SetUpOwn);
}

/** The line, where a control would be. */
export const NOT_IN_DEMO = "Not in the demo";

/** Set up my own Chips, beside the line. */
export function SetUpOwnButton({ onSetUp }: { readonly onSetUp: () => void }) {
  return (
    <Button size="sm" onClick={onSetUp} data-testid="not-in-demo-set-up">
      Set up my own Chips
    </Button>
  );
}

/** The line and the button, in place of a control. */
export function NotInDemo({ onSetUp }: { readonly onSetUp: () => void }) {
  return (
    <span className="not-in-demo" data-testid="not-in-demo">
      <span className="not-in-demo-words">{NOT_IN_DEMO}</span>
      <SetUpOwnButton onSetUp={onSetUp} />
    </span>
  );
}
