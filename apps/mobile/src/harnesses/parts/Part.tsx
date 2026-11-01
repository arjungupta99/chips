/**
 * One of the pages a harness's page opens (ADR 0254), the same pushed on a phone as in the Agents
 * tab's pane on a wide screen: every agent, its context files, When it asks you, its runs, or every
 * ask so far (ADR 0255), which When it asks you opens.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { HarnessContext } from "../../context/HarnessContext";
import { harnessFileHref } from "../../context/owner";
import { useColumn } from "../../ui/Screen";
import type { HarnessPart } from "../parts";
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
  /** Opens another of its pages: When it asks you's dots open every ask. */
  readonly onOpenPart: (part: HarnessPart) => void;
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
        />
      );
    case "runs":
      return <RecentRuns snapshot={snapshot} harnessId={harnessId} selfId={selfId} />;
    case "asked":
      return <AskList snapshot={snapshot} harnessId={harnessId} selfId={selfId} />;
  }
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
