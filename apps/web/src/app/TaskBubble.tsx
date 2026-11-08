/**
 * A queued turn's work, drawn as work rather than as the text it arrives as.
 *
 * A turn a person starts in a room draws its work as that room's run. A turn that runs LATER,
 * out of a harness's own queue, has no run to draw on, so Jacobian sends one message and edits it
 * as it goes; core's `readTaskBubble` reads that message, and this draws what it read. The phone
 * does the same thing in `apps/mobile/src/spaces/TaskBubble.tsx`, and the two are meant to be the
 * same bubble on two screens.
 *
 * Three dots lit in the colour of its face work where the thought-bubble emoji was (ADR 0126; the
 * gold mark until 6 October 2026), each call is drawn by its kind (`CallPill`), and the calls hang
 * as a wire with a dot each, the one in hand lit in the face's colour, three deep — a turn is a
 * sequence, and three lines each beginning with a triangle drew it as three unrelated things. The
 * words are keyed on what they say, so a message edited mid-turn rises into place and a light
 * crosses the bubble on that beat rather than on a timer. Only an edit does: a room drawn anew, as
 * on coming back to it, draws its bubbles still, as the phone's `useSheen` always has. Arjun, 7
 * November 2026, on the Mac: switching to a room, "I see three message bubbles showing shimmer
 * every time when I switch to it".
 *
 * It ends as a receipt — `Worked 25s · 2 steps` — and the receipt is the quiet register: the
 * calls fold away into their own count, the words step down to a caption, and the dots go: three
 * standing still read as words left unsaid. What is over should recede; it stays in the room for
 * as long as the room does.
 */

import { type TaskBubble as Task, verbWords } from "@chipschat/core";
import { type CSSProperties, useRef } from "react";
import { CallPill, LitDots } from "./Doing.tsx";

/** As many calls as the wire hangs, which is as many as the harness sends. */
const CALLS = 3;

export function TaskBubble({
  task,
  colour,
}: {
  readonly task: Task;
  /** The colour of the face it is said under (`faceGround`): its dots and its call in hand. */
  readonly colour: string;
}) {
  const working = task.worked === undefined;
  const steps = task.steps.slice(-CALLS);
  // What the message says, so an edit that changes nothing moves nothing.
  const said = [task.headline, task.thought, task.worked, task.stuck, ...task.steps].join("\n");
  // What it said when it was drawn: it rises and lights only once it has said something since.
  const first = useRef(said);
  const edited = said !== first.current;
  return (
    <div
      className="task"
      data-working={working ? "true" : undefined}
      style={{ "--face": colour } as CSSProperties}
    >
      {task.headline !== undefined && <p className="task-headline">{task.headline}</p>}
      <div className="task-row">
        {working && <LitDots colour={colour} />}
        <div className="task-words" key={said} data-edited={edited ? "true" : undefined}>
          {working ? (
            <p className="task-thought">{verbWords(task.thought)}</p>
          ) : (
            <p className="task-worked">{task.worked}</p>
          )}
          {steps.length > 0 && (
            <ol className="task-steps">
              {steps.map((step, index) => (
                // A harness calls the same tool twice in a turn, so the step is not its own
                // identity; where it stands in the turn is.
                // biome-ignore lint/suspicious/noArrayIndexKey: as above.
                <li className="task-step" key={`${index}-${step}`}>
                  <span className="task-dot" />
                  <CallPill step={step} />
                </li>
              ))}
            </ol>
          )}
          {task.stuck !== undefined && <p className="task-stuck">{task.stuck}</p>}
        </div>
      </div>
      {edited && <span className="task-sheen" key={`sheen:${said}`} aria-hidden="true" />}
    </div>
  );
}
