/**
 * What somebody removed from the workspace sees (ADR 0160): in every tab they had open, within a
 * moment, and the next time they open one. Which workspace, that what they said stays, and the one
 * way back. OK forgets this browser's key for it and goes on: to the next workspace paired here,
 * or to pairing. Never "pair again", which could not let them in.
 *
 * Having deleted their own account here (ADR 0243), they are told they left. Elsewhere the server
 * says the same of both, so the words are true of both.
 */

import { Button, ChipMark } from "@chipschat/ui";

export function Removed(props: {
  readonly workspace: string;
  /** This device deleted the person's account: their own leaving. */
  readonly left?: boolean | undefined;
  readonly onSeen: () => void;
}) {
  return (
    <div className="pair" data-testid="removed" aria-live="polite">
      <ChipMark size={40} state="failed" />
      <h2>
        {props.left === true
          ? `You've left ${props.workspace}`
          : `You're no longer in ${props.workspace}`}
      </h2>
      <p>
        {props.left === true
          ? "Your account there is deleted. What you said there stays where it was said."
          : "Your account there was removed, or you deleted it. What you said there stays where it was said. To come back, ask for a new invite."}
      </p>
      <div className="pair-actions">
        <Button variant="primary" onClick={props.onSeen} autoFocus>
          OK
        </Button>
      </div>
    </div>
  );
}
