/**
 * The agents let work without asking just now (ADR 0281), on You → Permissions (ADR 0299), each
 * with the room it works in, until when, and Stop: a yes that holds on is listed beside the rules,
 * since it is one too, and this is where it is found again away from its room. It stood on Allowed
 * always before Permissions took that page's place.
 */

import {
  type Directory,
  type StopLetWorkInput,
  WORKING_HEADING,
  type WorkspaceModel,
  workingWithoutAsking,
} from "@chipschat/core";
import { useNow } from "../useNow.ts";

/** The agents let work without asking now (ADR 0281), each with where, until when, and Stop. */
export function Working(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly onStop: ((input: StopLetWorkInput) => void) | undefined;
}) {
  const now = useNow();
  const rows = workingWithoutAsking(props.model, props.directory, now);
  if (rows.length === 0) return null;
  return (
    <div className="you-always-harness you-working" data-testid="allowed-always-working">
      <h4>{WORKING_HEADING}</h4>
      <ul>
        {rows.map((row) => (
          <li key={`${row.spaceId} ${row.held.asker}`}>
            <span className="you-working-words">
              <b>{row.name}</b>
              <small>{row.line}</small>
            </span>
            {props.onStop !== undefined && (
              <button
                type="button"
                className="you-working-stop"
                aria-label={`Stop ${row.name} working without asking`}
                onClick={() => props.onStop?.({ spaceId: row.spaceId, asker: row.held.asker })}
              >
                Stop
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
