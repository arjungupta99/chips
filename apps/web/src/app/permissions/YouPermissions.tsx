/**
 * You → Permissions (ADR 0299, simplified by ADR 0300): every harness at once, beside You's list.
 * The agents let work without asking just now, each with Stop, while any are; then each harness,
 * its line saying what its own settings let through, marked where Chips's rules are on. A row opens
 * the harness's own Permissions, where both are set.
 */

import {
  CHIPS_RULES_TITLE,
  type Directory,
  HARNESSES_HEADING,
  type StopLetWorkInput,
  type WorkspaceModel,
  workspaceHarnesses,
  YOU_HARNESSES_FOOT,
  youPermissions,
} from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import { type PermissionsService, useOwnRulesOf } from "./service.ts";
import { Working } from "./Working.tsx";

export function YouPermissions(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly service: PermissionsService;
  readonly onStopLetWork?: ((input: StopLetWorkInput) => void) | undefined;
  /** Opens a harness's own Permissions, on the Agents page. */
  readonly onOpenHarness?: ((harnessId: string) => void) | undefined;
}) {
  const { directory, selfId, service } = props;
  const owns = useOwnRulesOf(
    service,
    directory,
    workspaceHarnesses(directory).map((harness) => harness.id),
  );
  const you = youPermissions(
    { model: props.model, directory, keepsHarnessRules: service.keepsHarnessRules },
    selfId,
    owns,
  );
  return (
    <div className="asking perms you-perms" data-testid="you-permissions">
      <Working model={props.model} directory={directory} onStop={props.onStopLetWork} />
      <div className="asking-part-h you-perms-first">
        <h4>{HARNESSES_HEADING}</h4>
      </div>
      <ul className="you-perms-harnesses" data-testid="perms-harnesses">
        {you.harnesses.map((row) => (
          <li key={row.harnessId} data-testid={`perms-harness-${row.harnessId}`}>
            <div className="you-perms-row">
              <button
                type="button"
                className="you-perms-open"
                disabled={props.onOpenHarness === undefined}
                onClick={() => props.onOpenHarness?.(row.harnessId)}
              >
                <Avatar name={row.name} kind="harness" size="sm" />
                <span className="perms-row-words">
                  <b>{row.name}</b>
                  <small
                    data-gold={row.gold ? "true" : undefined}
                    data-warn={row.warn && !row.gold ? "true" : undefined}
                  >
                    {row.line}
                    {row.chipsOn && (
                      <span className="perms-tag" data-testid={`perms-chips-on-${row.harnessId}`}>
                        {CHIPS_RULES_TITLE}
                      </span>
                    )}
                  </small>
                </span>
                <Icon name="next" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="asking-note">{YOU_HARNESSES_FOOT}</p>
    </div>
  );
}
