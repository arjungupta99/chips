/**
 * The setup card at the top of the rail's Spaces (ADR 0170): six steps, each read from what this
 * device already knows (core's `setupSteps`), with the thing to do beside each one left. It folds
 * away when all six are done, and Hide puts it away on this device.
 */

import type { SetupStep, SetupStepId } from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { useEffect, useState } from "react";

/** What a step left to do does when it is pressed: nothing, for one there is nothing to press for. */
export type SetupActions = Partial<Record<SetupStepId, () => void>>;

const ACTION_WORDS: Partial<Record<SetupStepId, string>> = {
  hello: "Add one",
  phone: "Pair",
  notify: "Turn on",
  away: "Set up",
};

export function SetupCard(props: {
  readonly steps: readonly SetupStep[];
  readonly actions: SetupActions;
  readonly onHide: () => void;
}) {
  const done = props.steps.filter((step) => step.done).length;
  const all = done === props.steps.length;
  return (
    <section
      className="setup-card"
      data-testid="setup-card"
      data-done={done}
      aria-label="Setting up"
    >
      <div className="setup-head">
        <b>{all ? "You're set up" : "Finish setting up"}</b>
        <small data-testid="setup-count">
          {done} of {props.steps.length}
        </small>
        <button
          type="button"
          className="setup-hide"
          aria-label="Hide"
          data-testid="setup-hide"
          onClick={props.onHide}
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      <div className="setup-bar" aria-hidden="true">
        {props.steps.map((step, index) => (
          <i key={step.id} className={index < done ? "on" : ""} />
        ))}
      </div>
      <ul>
        {props.steps.map((step) => {
          const act = step.done ? undefined : props.actions[step.id];
          return (
            <li
              key={step.id}
              className={step.done ? "" : "todo"}
              data-testid={`setup-${step.id}`}
              data-done={step.done}
            >
              <span className="setup-tick" aria-hidden="true">
                {step.done ? "✓" : ""}
              </span>
              <span className="setup-words">
                {step.title}
                {step.detail !== undefined && <small> {step.detail}</small>}
              </span>
              {act !== undefined && ACTION_WORDS[step.id] !== undefined && (
                <button type="button" className="setup-act" onClick={act}>
                  {ACTION_WORDS[step.id]}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How long "You're set up" stands before the card folds away, and how long the fold takes. */
export const SET_UP_STANDS_MS = 1800;
export const SET_UP_FOLDS_MS = 520;

type RailPhase = "unread" | "left" | "standing" | "folding" | "gone";

/** The rail's next phase, when what is read or what is done changes. */
function railPhase(now: RailPhase, theirs: boolean, all: boolean): RailPhase {
  if (now === "unread") {
    if (!theirs) return "unread";
    return all ? "gone" : "left";
  }
  if (!all) return "left";
  return now === "left" ? "standing" : now;
}

/**
 * The card while it has something to say: drawn while steps are left, and, once the last is done
 * while it is on screen, "You're set up" for a moment before it folds away. A device that was set up
 * before it ever drew the card never draws it: what is left is first decided once the card is
 * `theirs`, when the directory that says whose it is (and which lines are an agent's hello) is in.
 */
export function SetupRail(props: {
  /** Core's `showsSetupCard`, read as if no step were done: whether the card is this person's here. */
  readonly theirs: boolean;
  readonly steps: readonly SetupStep[];
  readonly actions: SetupActions;
  readonly onHide: () => void;
}) {
  const all = props.steps.every((step) => step.done);
  const [phase, setPhase] = useState<RailPhase>("unread");
  useEffect(() => {
    setPhase((now) => railPhase(now, props.theirs, all));
  }, [props.theirs, all]);
  useEffect(() => {
    if (phase === "standing") {
      const timer = setTimeout(() => setPhase("folding"), SET_UP_STANDS_MS);
      return () => clearTimeout(timer);
    }
    if (phase === "folding") {
      const timer = setTimeout(() => setPhase("gone"), SET_UP_FOLDS_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase]);
  if (!props.theirs || phase === "unread" || phase === "gone") return null;
  return (
    <div className={phase === "folding" ? "setup-fold gone" : "setup-fold"}>
      <SetupCard steps={props.steps} actions={props.actions} onHide={props.onHide} />
    </div>
  );
}
