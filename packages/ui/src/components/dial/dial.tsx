/**
 * The autonomy dial: four segments, L0 to L3, and a sentence saying what the level means.
 * As a control it is a group of radios styled as a segmented switch, so arrow keys move it
 * and a screen reader hears the level's name. Read-only, it is the four bars the run panel
 * shows. Levels above the workspace cap are shown but cannot be chosen.
 */

import type { AutonomyLevel } from "@chipschat/protocol";
import { useId } from "react";
import { AUTONOMY_LEVELS, autonomyInfo, autonomyLabel } from "../../vocabulary/autonomy.js";
import "./dial.css";

export interface AutonomyDialProps {
  readonly value: AutonomyLevel;
  /** Absent, the dial is read-only. */
  readonly onChange?: (level: AutonomyLevel) => void;
  /** The workspace cap. It always wins: levels above it are disabled. */
  readonly max?: AutonomyLevel;
  readonly readOnly?: boolean;
  /** The radio group's name, when a form needs one. */
  readonly name?: string;
  readonly label?: string;
  readonly className?: string;
}

function Bars({ value }: { readonly value: AutonomyLevel }) {
  return (
    <span className="ui-dial__bars" aria-hidden="true">
      {AUTONOMY_LEVELS.map((info) => (
        <i key={info.level} data-on={info.level <= value ? "true" : undefined} />
      ))}
    </span>
  );
}

export function AutonomyDial({
  value,
  onChange,
  max = 3,
  readOnly = false,
  name,
  label = "Autonomy",
  className,
}: AutonomyDialProps) {
  const id = useId();
  const classes = className === undefined ? "ui-dial" : `ui-dial ${className}`;

  if (readOnly || onChange === undefined) {
    return (
      <div className={classes} data-readonly="true" role="img" aria-label={autonomyLabel(value)}>
        <Bars value={value} />
        <span className="ui-dial__label">{autonomyLabel(value)}</span>
      </div>
    );
  }

  return (
    <fieldset className={classes} data-readonly="false">
      <legend className="ui-visually-hidden">{label}</legend>
      <div className="ui-dial__segments">
        {AUTONOMY_LEVELS.map((info) => {
          const capped = info.level > max;
          return (
            <label
              className="ui-dial__segment"
              key={info.level}
              data-on={info.level === value ? "true" : undefined}
              data-capped={capped ? "true" : undefined}
              title={capped ? "Above the workspace cap" : undefined}
            >
              <input
                type="radio"
                name={name ?? id}
                value={info.level}
                checked={info.level === value}
                disabled={capped}
                onChange={() => onChange(info.level)}
                aria-label={autonomyLabel(info.level)}
                aria-describedby={`${id}-summary`}
              />
              L{info.level}
            </label>
          );
        })}
      </div>
      <div className="ui-dial__row">
        <Bars value={value} />
        <span className="ui-dial__label">{autonomyLabel(value)}</span>
      </div>
      <p className="ui-dial__summary" id={`${id}-summary`}>
        {autonomyInfo(value).summary}
      </p>
    </fieldset>
  );
}
