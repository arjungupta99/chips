/**
 * Allowed always, as the phone holds it while a change is on its way (ADR 0195): the harness page's
 * list and You's sheet both read this.
 *
 * A switch, a swipe and Undo each send the scope's rules whole (`store.setRules`), and the server
 * echoes them back as `policy.updated`. Until it has, the change is kept here and drawn over the
 * model (core's `withChanges`, `changesStill`), so a switch stays where the thumb put it and a removed row stays gone; once
 * the model says the same, or after a few seconds in which it never did (the server refused), the
 * model is what is drawn again. Each change starts from what is drawn, pending included, so a second
 * switch thrown before the first came back carries both.
 *
 * Removing a row is the Delete for me motion (ADR 0167): the row's eraser crosses it and its dust
 * goes up (`going`), the list closes over it once the wipe has crossed, and Undo stands for five
 * seconds (`removed`), putting the rule back where it was.
 */

import {
  type AlwaysRule,
  changeScope,
  changesStill,
  RULES_CHANGE_MS,
  type Rule,
  type RulesChange,
  rulesOf,
  type Snapshot,
  type Store,
  switchedRule,
  type WorkspaceModel,
  withChanges,
  withoutRule,
  withRuleBack,
} from "@chipschat/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutAnimation } from "react-native";
import * as feel from "../ui/haptics";

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
  /** The rule whose row is turning to dust, by its key. */
  readonly going: string | undefined;
  /** The rule Undo would put back, while its pill stands. */
  readonly removed: Removed | undefined;
  readonly setOn: (rule: AlwaysRule, on: boolean) => void;
  /** Start a row's dust; the rule goes once its wipe has crossed (`wiped`). */
  readonly remove: (rule: AlwaysRule) => void;
  readonly wiped: (rule: AlwaysRule) => void;
  readonly undo: () => void;
  /** The Undo pill has gone, by Undo or by its count running out. */
  readonly settled: () => void;
}

export function useAlways(store: Store, snapshot: Snapshot): Always {
  const [pending, setPending] = useState<ReadonlyMap<string, RulesChange>>(() => new Map());
  const [going, setGoing] = useState<string | undefined>(undefined);
  const [removed, setRemoved] = useState<Removed | undefined>(undefined);
  // An eraser asks for its rule's removal with what it was drawn with, half a second later: what
  // is current then is read from here, not from the render that drew it.
  const live = useRef({ pending, model: snapshot.model, removed });
  live.current = { pending, model: snapshot.model, removed };

  useEffect(() => {
    const next = changesStill(pending, snapshot.model, Date.now());
    if (next !== pending) setPending(next);
    if (pending.size === 0) return;
    const sweep = setTimeout(
      () => setPending((now) => changesStill(now, live.current.model, Date.now())),
      RULES_CHANGE_MS,
    );
    return () => clearTimeout(sweep);
  }, [pending, snapshot.model]);

  const model = useMemo(() => withChanges(snapshot.model, pending), [pending, snapshot.model]);

  const current = useCallback((harnessId: string, spaceId: string | undefined) => {
    const { pending: now, model: folded } = live.current;
    return now.get(changeScope(harnessId, spaceId))?.rules ?? rulesOf(folded, harnessId, spaceId);
  }, []);

  const send = useCallback(
    (harnessId: string, spaceId: string | undefined, rules: readonly Rule[]) => {
      const change: RulesChange = { harnessId, spaceId, rules, at: Date.now() };
      setPending((now) => new Map(now).set(changeScope(harnessId, spaceId), change));
      store.setRules({ harnessId, spaceId, rules });
    },
    [store],
  );

  const setOn = useCallback(
    (rule: AlwaysRule, on: boolean) => {
      feel.tick();
      send(
        rule.harnessId,
        rule.spaceId,
        switchedRule(current(rule.harnessId, rule.spaceId), rule.index, on),
      );
    },
    [current, send],
  );

  const remove = useCallback((rule: AlwaysRule) => setGoing(rule.key), []);

  const wiped = useCallback(
    (rule: AlwaysRule) => {
      const rules = current(rule.harnessId, rule.spaceId);
      const gone = rules[rule.index];
      setGoing(undefined);
      if (gone === undefined) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    feel.success();
    const rules = current(was.harnessId, was.spaceId);
    send(was.harnessId, was.spaceId, withRuleBack(rules, was.index, was.rule));
  }, [current, send]);

  const settled = useCallback(() => setRemoved(undefined), []);

  return { model, going, removed, setOn, remove, wiped, undo, settled };
}
