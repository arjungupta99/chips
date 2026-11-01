/**
 * Allowed always, as the desktop holds it while a change is on its way (ADR 0195): the harness
 * card's list and You's card both read this. The phone's (`apps/mobile/src/harnesses/useAlways.ts`)
 * in the desktop's terms.
 *
 * A switch, an × and Undo each send the scope's rules whole (`setRules`), and the server echoes them
 * back as `policy.updated`. Until it has, the change is kept here and drawn over the model (core's
 * `withChanges`, `changesStill`), so a switch stays where it was put and a removed row stays gone;
 * once the model says the same, or after a few seconds in which it never did (the server refused),
 * the model is what is drawn again. Each change starts from what is drawn, pending included.
 *
 * Removing a row is Delete for me's motion (ADR 0167): the row breaks into dust (`going`), closes,
 * and only then is the rule sent away (`wiped`); Undo stands for five seconds (`removed`), putting
 * the rule back where it was.
 */

import {
  type AlwaysRule,
  changeScope,
  changesStill,
  RULES_CHANGE_MS,
  type Rule,
  type RulesChange,
  rulesOf,
  type SetRulesInput,
  switchedRule,
  type WorkspaceModel,
  withChanges,
  withoutRule,
  withRuleBack,
} from "@chipschat/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** A rule just removed, for Undo to put back where it was. */
export interface Removed {
  readonly harnessId: string;
  readonly spaceId?: string | undefined;
  readonly index: number;
  readonly rule: Rule;
  readonly key: string;
  readonly at: number;
}

export interface Always {
  /** The model with every change on its way drawn in. */
  readonly model: WorkspaceModel;
  /** The rule whose row is breaking into dust, by its key. */
  readonly going: string | undefined;
  /** The rule Undo would put back, while its pill stands. */
  readonly removed: Removed | undefined;
  readonly setOn: (rule: AlwaysRule, on: boolean) => void;
  /** Start a row's dust; the rule goes once the row has closed (`wiped`). */
  readonly remove: (rule: AlwaysRule) => void;
  readonly wiped: (rule: AlwaysRule) => void;
  readonly undo: () => void;
  /** The Undo pill has gone, by Undo or by its count running out. */
  readonly settled: () => void;
}

export function useAlways(
  folded: WorkspaceModel,
  setRules: ((input: SetRulesInput) => void) | undefined,
): Always {
  const [pending, setPending] = useState<ReadonlyMap<string, RulesChange>>(() => new Map());
  const [going, setGoing] = useState<string | undefined>(undefined);
  const [removed, setRemoved] = useState<Removed | undefined>(undefined);
  // A row asks for its rule's removal once its dust has crossed it: what is current then is read
  // from here, not from the render that drew it.
  const live = useRef({ pending, model: folded, removed });
  live.current = { pending, model: folded, removed };

  useEffect(() => {
    const next = changesStill(pending, folded, Date.now());
    if (next !== pending) setPending(next);
    if (pending.size === 0) return;
    const sweep = setTimeout(
      () => setPending((now) => changesStill(now, live.current.model, Date.now())),
      RULES_CHANGE_MS,
    );
    return () => clearTimeout(sweep);
  }, [pending, folded]);

  const model = useMemo(() => withChanges(folded, pending), [pending, folded]);

  const current = useCallback((harnessId: string, spaceId: string | undefined) => {
    const { pending: now, model: those } = live.current;
    return now.get(changeScope(harnessId, spaceId))?.rules ?? rulesOf(those, harnessId, spaceId);
  }, []);

  const send = useCallback(
    (harnessId: string, spaceId: string | undefined, rules: readonly Rule[]) => {
      if (setRules === undefined) return;
      const change: RulesChange = { harnessId, spaceId, rules, at: Date.now() };
      setPending((now) => new Map(now).set(changeScope(harnessId, spaceId), change));
      setRules({ harnessId, ...(spaceId === undefined ? {} : { spaceId }), rules });
    },
    [setRules],
  );

  const setOn = useCallback(
    (rule: AlwaysRule, on: boolean) =>
      send(
        rule.harnessId,
        rule.spaceId,
        switchedRule(current(rule.harnessId, rule.spaceId), rule.index, on),
      ),
    [current, send],
  );

  const remove = useCallback((rule: AlwaysRule) => setGoing(rule.key), []);

  const wiped = useCallback(
    (rule: AlwaysRule) => {
      const rules = current(rule.harnessId, rule.spaceId);
      const gone = rules[rule.index];
      setGoing(undefined);
      if (gone === undefined) return;
      send(rule.harnessId, rule.spaceId, withoutRule(rules, rule.index));
      setRemoved({
        harnessId: rule.harnessId,
        spaceId: rule.spaceId,
        index: rule.index,
        rule: gone,
        key: rule.key,
        at: Date.now(),
      });
    },
    [current, send],
  );

  const undo = useCallback(() => {
    const was = live.current.removed;
    if (was === undefined) return;
    setRemoved(undefined);
    const rules = current(was.harnessId, was.spaceId);
    send(was.harnessId, was.spaceId, withRuleBack(rules, was.index, was.rule));
  }, [current, send]);

  const settled = useCallback(() => setRemoved(undefined), []);

  return { model, going, removed, setOn, remove, wiped, undo, settled };
}
