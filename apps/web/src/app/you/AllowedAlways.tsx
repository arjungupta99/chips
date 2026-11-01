/**
 * Allowed always, for the whole workspace (ADR 0195): a card under the workspace's heading, the
 * phone's sheet (`apps/mobile/src/you/AlwaysSheet.tsx`) laid out for a wide screen. Each harness
 * that is allowed something always, by name, with what a person's Always let it go ahead with,
 * switched and removed as on the harness's own card (`AlwaysList`); the harnesses allowed nothing
 * are one line under them.
 *
 * With nothing allowed anywhere it says so once (Arjun's A of 26 October 2026, after a box under
 * every harness that each said "Nothing allowed always."): the ask flying from the harnesses to the
 * reader, how a rule comes to be here, why the asks that matter never do, and the dots of every
 * ask so far.
 *
 * A shortcut to the harness cards' lists, not a setting of its own: two people running one
 * workspace see one truth, and asking is the harness's, not the person's.
 */

import {
  alwaysAsking,
  alwaysByHarness,
  alwaysNone,
  alwaysSheetWhy,
  alwaysSummary,
  type Directory,
  mayTurnDial,
  REMOVED_WORDS,
  type SetRulesInput,
  type WorkspaceModel,
  workspaceAskHistory,
} from "@chipschat/core";
import { AlwaysList } from "../AlwaysList.tsx";
import { Dots, Hero, PromiseMark, UNDO_TITLE } from "../Asking.tsx";
import { UndoPill } from "../room/UndoPill.tsx";
import { useAlways } from "../useAlways.ts";
import { Card } from "./controls.tsx";

export function AllowedAlwaysCard(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onSetRules: (input: SetRulesInput) => void;
}) {
  const always = useAlways(props.model, props.onSetRules);
  const harnesses = alwaysByHarness(always.model, props.directory, props.selfId);
  const allowing = harnesses.filter((harness) => harness.rules.length > 0);
  const asking = alwaysAsking(harnesses);
  const may = mayTurnDial(props.model, props.selfId);
  const removed = always.removed;
  return (
    <Card
      label="Allowed always"
      testId="allowed-always"
      title="Allowed always"
      level={3}
      aside={
        <small data-testid="allowed-always-count">
          {alwaysSummary(always.model, props.directory)}
        </small>
      }
    >
      {allowing.length === 0 ? (
        <Nothing
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          names={harnesses.map((harness) => harness.name)}
        />
      ) : (
        <>
          <p className="you-card-note">{alwaysSheetWhy("cross")}</p>
          {allowing.map((harness) => (
            <div key={harness.harnessId} className="you-always-harness">
              <h4>{harness.name}</h4>
              <AlwaysList
                rules={harness.rules}
                always={always}
                may={may}
                testId={`allowed-always-${harness.harnessId}`}
              />
            </div>
          ))}
        </>
      )}
      {asking !== undefined && (
        <p className="you-card-note" data-testid="allowed-always-asking">
          {asking}
        </p>
      )}
      <UndoPill
        undoing={removed === undefined ? undefined : { lineId: removed.key, at: removed.at }}
        onUndo={always.undo}
        onGone={always.settled}
        words={REMOVED_WORDS}
        title={UNDO_TITLE}
        page
      />
    </Card>
  );
}

/** Nothing allowed anywhere, said once, with every ask so far under it. */
function Nothing(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly names: readonly string[];
}) {
  const none = alwaysNone(props.directory, props.selfId);
  const history = workspaceAskHistory(props.model, props.directory, props.selfId);
  const me = props.directory[props.selfId];
  return (
    <div className="you-always-none" data-testid="allowed-always-none">
      {props.names.length > 0 && (
        <Hero
          harness={props.names[0] ?? ""}
          also={props.names.slice(1, 3)}
          label={props.names.length === 1 ? undefined : `${props.names.length} harnesses`}
          person={none.yours ? "You" : "A person"}
          personName={me?.displayName ?? "?"}
          face={me?.face}
        />
      )}
      <p className="you-always-headline">{none.headline}</p>
      <p className="you-always-line">{none.line}</p>
      <p className="you-always-matters" data-promise="big">
        <span className="asking-tile">
          <PromiseMark id="big" />
        </span>
        <small>{none.matters}</small>
      </p>
      {history !== undefined && (
        <div className="you-always-history" data-testid="allowed-always-history">
          <Dots dots={history.dots} />
          <small>{history.line}</small>
        </div>
      )}
    </div>
  );
}
