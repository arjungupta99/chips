/**
 * One of the pages a harness's page opens (ADR 0254), the same pushed on a phone as in the Agents
 * tab's pane on a wide screen: every agent, its context files, its Permissions (ADR 0299), its
 * runs, or what Permissions opens: every ask so far (ADR 0255) and New rule.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { HarnessContext } from "../../context/HarnessContext";
import { harnessFileHref } from "../../context/owner";
import { useColumn } from "../../ui/Screen";
import { SPACE } from "../../ui/tokens";
import type { HarnessPart } from "../parts";
import { HarnessSettings, useChipsRules } from "../permissions/HarnessPermissions";
import { NewRule } from "../permissions/NewRule";
import { AllAgents } from "./AllAgents";
import { AskList } from "./AskList";
import { RecentRuns } from "./RecentRuns";
import { WhenItAsks } from "./WhenItAsks";

export function Part({
  part,
  store,
  snapshot,
  harnessId,
  selfId,
  focus,
  flashFile,
  onOpenPart,
  onBack,
}: {
  readonly part: HarnessPart;
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string;
  /** How many times the page has come to the front: its copies are read again each time. */
  readonly focus: number;
  /** A shared file an agent's page sent the reader here for, flashed once (ADR 0135). */
  readonly flashFile?: string | undefined;
  /** Opens another of its pages: Permissions's dots open every ask, Add a rule opens New rule. */
  readonly onOpenPart: (part: HarnessPart) => void;
  /** Back to the page under this one: New rule, once saved. */
  readonly onBack?: (() => void) | undefined;
}) {
  switch (part) {
    case "agents":
      return <AllAgents snapshot={snapshot} harnessId={harnessId} selfId={selfId} />;
    case "context":
      return (
        <ContextFiles
          store={store}
          snapshot={snapshot}
          harnessId={harnessId}
          selfId={selfId}
          focus={focus}
          flashFile={flashFile}
        />
      );
    case "asks":
      return (
        <WhenItAsks
          store={store}
          snapshot={snapshot}
          harnessId={harnessId}
          selfId={selfId}
          onOpenAsks={() => onOpenPart("asked")}
          onOpenPart={onOpenPart}
        />
      );
    case "settings":
      return (
        <SettingsPage store={store} snapshot={snapshot} harnessId={harnessId} selfId={selfId} />
      );
    case "chips":
      return (
        <ChipsPage
          store={store}
          snapshot={snapshot}
          harnessId={harnessId}
          selfId={selfId}
          onNewRule={() => onOpenPart("rule")}
        />
      );
    case "rule":
      return (
        <RulePage
          store={store}
          snapshot={snapshot}
          harnessId={harnessId}
          onDone={onBack ?? (() => undefined)}
        />
      );
    case "runs":
      return <RecentRuns snapshot={snapshot} harnessId={harnessId} selfId={selfId} />;
    case "asked":
      return <AskList snapshot={snapshot} harnessId={harnessId} selfId={selfId} />;
  }
}

/** Its own settings (ADR 0300), a page of their own. */
function SettingsPage({
  store,
  snapshot,
  harnessId,
  selfId,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string;
}) {
  const column = useColumn();
  return (
    <ScrollView contentContainerStyle={[styles.body, column]} testID="settings-part">
      <HarnessSettings store={store} snapshot={snapshot} harnessId={harnessId} selfId={selfId} />
    </ScrollView>
  );
}

/** Chips's rules for it (ADR 0300), with the Undo pill and dust beside the scroll. */
function ChipsPage({
  store,
  snapshot,
  harnessId,
  selfId,
  onNewRule,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string;
  readonly onNewRule: () => void;
}) {
  const column = useColumn();
  const chips = useChipsRules({ store, snapshot, harnessId, selfId, onNewRule });
  return (
    <>
      <ScrollView contentContainerStyle={[styles.body, column]} testID="chips-part">
        {chips.page}
      </ScrollView>
      {chips.overlays}
    </>
  );
}

/** New rule (ADR 0299) over Chips's rules, back to them once saved. */
function RulePage({
  store,
  snapshot,
  harnessId,
  onDone,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly onDone: () => void;
}) {
  const column = useColumn();
  return (
    <ScrollView
      contentContainerStyle={[styles.body, column]}
      keyboardShouldPersistTaps="handled"
      testID="rule-part"
    >
      <NewRule store={store} snapshot={snapshot} harnessId={harnessId} onDone={onDone} />
    </ScrollView>
  );
}

/** Its context files (ADR 0135): what its agents share, and what a new agent starts with. */
function ContextFiles({
  store,
  snapshot,
  harnessId,
  selfId,
  focus,
  flashFile,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string;
  readonly focus: number;
  readonly flashFile: string | undefined;
}) {
  const router = useRouter();
  const column = useColumn();
  return (
    <ScrollView contentContainerStyle={column} testID="context-files">
      <HarnessContext
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        selfId={selfId}
        focus={focus}
        flashFile={flashFile}
        onOpenFile={(name) => router.push(harnessFileHref(harnessId, name))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
});
