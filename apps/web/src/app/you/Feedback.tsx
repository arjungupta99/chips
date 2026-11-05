/**
 * Send feedback (ADR 0237), the phone's row and sheet (`apps/mobile/src/you/Feedback.tsx`) as a
 * row of You's list and a page beside it (ADR 0265 and its addendum of 3 November 2026). Chips
 * takes feedback prompts, not pull requests, and a prompt is an issue on the repository's form. The
 * page offers the Main agent, which finds a line asking for its help in its Main space's field, not
 * sent, and GitHub, which opens the form with this build filled in. Chips sends nothing either way.
 * With no Main agent there is nothing to choose, so the row opens GitHub itself.
 *
 * GitHub opens from the click itself: a browser lets a page open a tab only while a person's click
 * is being handled, and so does the Mac's window, which hands the link to the browser.
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
import { Icon } from "@chipschat/ui";
import { useState } from "react";
import { FormPage } from "./Form.tsx";
import { Group, ListRow, RowMark } from "./list.tsx";
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

/**
 * Send feedback (ADR 0237), a row of its own under This computer, as on the phone: it opens the
 * choice of writing it with the feedback agent or on GitHub, or GitHub at once where there is no
 * agent to write it with.
 */
export function FeedbackRow(props: {
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
    <Group label="Feedback" testId="feedback">
      <ListRow
        label={FEEDBACK_ROW}
        sub={FEEDBACK_ROW_SUB}
        mark={<RowMark icon="chat" tint="var(--gold)" ink="#231a00" />}
        onOpen={(row) => (agent === undefined ? github() : setFrom(row))}
        testId="feedback-row"
      />
      {from !== undefined && agent !== undefined && (
        <FeedbackPage
          from={from}
          agent={agent}
          directory={props.directory}
          onWriteWith={() => service.writeWith(agent)}
          onGitHub={github}
          onGone={() => setFrom(undefined)}
        />
      )}
    </Group>
  );
}

function FeedbackPage(props: {
  readonly from: HTMLElement | null;
  readonly agent: FeedbackAgent;
  readonly directory: Directory;
  readonly onWriteWith: () => void;
  readonly onGitHub: () => void;
  readonly onGone: () => void;
}) {
  return (
    <FormPage
      title={FEEDBACK_TITLE}
      from={props.from}
      testId="feedback-page"
      focus=".feedback-pick"
      onGone={props.onGone}
    >
      {({ close }) => (
        <>
          <div className="feedback-picks">
            <button
              type="button"
              className="feedback-pick"
              onClick={() => {
                close();
                props.onWriteWith();
              }}
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
                close();
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
        </>
      )}
    </FormPage>
  );
}
