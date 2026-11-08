/**
 * The band under a room's head while an agent works there without asking (ADR 0281): `Jiro is
 * working without asking`, until when for a yes given for an hour, and Stop. It stays as long as
 * the yes holds, so it is never forgotten; an hour's goes once its hour is up.
 *
 * Stop ends it at once (`approval.held_stopped`): the band says `Stopped. Jiro asks again from its
 * next step.` for a moment and folds away, and the agent's next ask comes to a person as usual.
 * The words are core's, as the phone's are.
 */

import {
  type Directory,
  lettingWork,
  nameOf,
  type Space,
  STOPPED_MS,
  stoppedWords,
  workingWords,
} from "@chipschat/core";
import { type ReactNode, useEffect, useState } from "react";

export function LetWorkBand(props: {
  readonly space: Space;
  readonly directory: Directory;
  readonly now: number;
  /** Stop the agent working without asking here; absent, the band offers no Stop. */
  readonly onStop?: ((asker: string) => void) | undefined;
}) {
  const { space, directory, onStop } = props;
  const [stopped, setStopped] = useState<{ readonly asker: string; readonly name: string }>();
  useEffect(() => {
    if (stopped === undefined) return;
    const timer = setTimeout(() => setStopped(undefined), STOPPED_MS);
    return () => clearTimeout(timer);
  }, [stopped]);
  if (space.state !== "open") return null;
  const holding = lettingWork(space, props.now).filter((held) => held.asker !== stopped?.asker);
  if (holding.length === 0 && stopped === undefined) return null;
  return (
    <div className="letwork-bands" data-testid="let-work-bands">
      {holding.map((held) => {
        const name = nameOf(directory, held.asker);
        return (
          <Band key={held.asker} words={workingWords(name, held)}>
            {onStop !== undefined && (
              <button
                type="button"
                className="letwork-stop"
                aria-label={`Stop ${name} working without asking`}
                onClick={() => {
                  onStop(held.asker);
                  setStopped({ asker: held.asker, name });
                }}
                data-testid="let-work-stop"
              >
                Stop
              </button>
            )}
          </Band>
        );
      })}
      {/* The same band, by the same key, its words crossing over to say it stopped. */}
      {stopped !== undefined && (
        <Band key={stopped.asker} words={stoppedWords(stopped.name)} stopped />
      )}
    </div>
  );
}

function Band(props: {
  readonly words: string;
  readonly stopped?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className="letwork"
      role="status"
      data-stopped={props.stopped === true ? "true" : undefined}
      data-testid="let-work-band"
    >
      <div className="letwork-in">
        <span className="letwork-dot" aria-hidden="true" />
        <span className="letwork-words" key={props.words}>
          {props.words}
        </span>
        {props.children}
      </div>
    </div>
  );
}
