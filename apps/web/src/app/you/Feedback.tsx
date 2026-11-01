/**
 * Send feedback (ADR 0237), the phone's row and sheet (`apps/mobile/src/you/Feedback.tsx`) as a
 * card at the foot of You and a dialog. Chips takes feedback prompts, not pull requests, and a
 * prompt is an issue on the repository's form. The dialog offers the Main agent, which finds a
 * line asking for its help in its Main space's field, not sent, and GitHub, which opens the form
 * with this build filled in. Chips sends nothing either way. With no Main agent there is nothing to
 * choose, so the button opens GitHub itself.
 *
 * GitHub opens from the click itself, not once the dialog has folded: a browser lets a page open
 * a tab only while a person's click is being handled, and so does the Mac's window, which hands
 * the link to the browser.
 */

import {
  type Directory,
  FEEDBACK_ON_GITHUB,
  FEEDBACK_ROW,
  FEEDBACK_ROW_SUB,
  FEEDBACK_SENDS_NOTHING,
  FEEDBACK_SHOWN,
  FEEDBACK_TITLE,
  type FeedbackAgent,
  feedbackLink,
  feedbackWithWords,
} from "@chipschat/core";
import { Button, Icon } from "@chipschat/ui";
import { useRef, useState } from "react";
import { GrowingDialog } from "../GrowingDialog.tsx";
import { Card } from "./controls.tsx";
import { Face } from "./PeopleParts.tsx";

/** Whether the shell offers the card: the switch, or a build made with `CHIPS_FEEDBACK=1`. */
export const FEEDBACK_ON = FEEDBACK_SHOWN || __CHIPS_FEEDBACK__;

/** What the card does, which the shell supplies. Absent, You draws no card (the switch is off). */
export interface FeedbackService {
  /** Open a link outside Chips: a new tab, or on the Mac the browser. */
  readonly openLink: (url: string) => void;
  /** Open the Main space with the line in its field, not sent. */
  readonly writeWith: (agent: FeedbackAgent) => void;
}

export function FeedbackCard(props: {
  readonly agent: FeedbackAgent | undefined;
  readonly directory: Directory;
  /** The version box's words: "Chips 0.0.0 · b888e96 · Mac". */
  readonly version: string;
  readonly service: FeedbackService;
}) {
  const { agent, service } = props;
  const [from, setFrom] = useState<HTMLElement | null | undefined>(undefined);
  const github = () => service.openLink(feedbackLink(props.version));
  return (
    <Card
      label="Feedback"
      testId="feedback"
      title="Feedback"
      aside={
        <Button
          onClick={(event) => (agent === undefined ? github() : setFrom(event.currentTarget))}
          data-testid="feedback-row"
        >
          {FEEDBACK_ROW}
        </Button>
      }
    >
      <p className="you-card-note">{FEEDBACK_ROW_SUB}</p>
      {from !== undefined && agent !== undefined && (
        <FeedbackDialog
          from={from}
          agent={agent}
          directory={props.directory}
          onWriteWith={() => service.writeWith(agent)}
          onGitHub={github}
          onGone={() => setFrom(undefined)}
        />
      )}
    </Card>
  );
}

function FeedbackDialog(props: {
  readonly from: HTMLElement | null;
  readonly agent: FeedbackAgent;
  readonly directory: Directory;
  readonly onWriteWith: () => void;
  readonly onGitHub: () => void;
  readonly onGone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  // The room opens once the dialog has folded, so it isn't drawn under a dialog still going.
  const then = useRef<(() => void) | undefined>(undefined);
  const leave = (next?: () => void) => {
    then.current = next;
    setLeaving(true);
  };
  return (
    <GrowingDialog
      from={props.from}
      labelledBy="feedback-title"
      className="feedback-dialog"
      testId="feedback-dialog"
      focus=".feedback-pick"
      leaving={leaving}
      onLeave={() => leave()}
      onGone={() => {
        props.onGone();
        then.current?.();
      }}
    >
      <div className="feedback-card">
        <div className="model-head">
          <h2 id="feedback-title">{FEEDBACK_TITLE}</h2>
          <button
            type="button"
            className="new-space-close"
            aria-label="Close"
            onClick={() => leave()}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="feedback-picks">
          <button
            type="button"
            className="feedback-pick"
            onClick={() => leave(props.onWriteWith)}
            data-testid="feedback-agent"
          >
            <span aria-hidden="true">
              <Face directory={props.directory} id={props.agent.id} size="sm" />
            </span>
            {feedbackWithWords(props.agent.name)}
          </button>
          <button
            type="button"
            className="feedback-pick"
            onClick={() => {
              props.onGitHub();
              leave();
            }}
            data-testid="feedback-github"
          >
            <span className="feedback-pick-mark" aria-hidden="true">
              <Icon name="globe" size={14} />
            </span>
            {FEEDBACK_ON_GITHUB}
          </button>
        </div>
        <p className="feedback-note">{FEEDBACK_SENDS_NOTHING}</p>
      </div>
    </GrowingDialog>
  );
}
