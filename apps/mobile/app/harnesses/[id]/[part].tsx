/**
 * One of the pages a harness's page opens (ADR 0254): every agent, its context files, When it asks
 * you, or its recent runs. On a wide screen it opens beside the Agents list instead, through the
 * tab's own params; a name that is none of them goes back to the harness's page.
 */

import type { Store } from "@chipschat/core";
import { myRole } from "@chipschat/core";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusCount } from "../../../src/context/useFocusCount";
import { type HarnessPart, isHarnessPart, PART_TITLE } from "../../../src/harnesses/parts";
import { Part } from "../../../src/harnesses/parts/Part";
import { useChips, useSnapshot } from "../../../src/store/provider";
import { useLayout } from "../../../src/ui/layout";
import { Empty, Screen } from "../../../src/ui/Screen";

export default function PartScreen() {
  const { paired } = useChips();
  const { id, part, file } = useLocalSearchParams<{ id: string; part: string; file?: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (!isHarnessPart(part)) {
    return <Redirect href={{ pathname: "/harnesses/[id]", params: { id } }} />;
  }
  if (wide)
    return <Redirect href={{ pathname: "/(tabs)/agents", params: { harness: id, part } }} />;
  return (
    <One
      store={paired.store}
      selfId={paired.device.participantId}
      harnessId={id}
      part={part}
      file={file}
    />
  );
}

function One({
  store,
  selfId,
  harnessId,
  part,
  file,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly harnessId: string;
  readonly part: HarnessPart;
  /** The shared file an agent's page sent the reader here for (ADR 0135). */
  readonly file: string | undefined;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  const focus = useFocusCount();
  // A guest runs no harness, as on the harness's own page (ADR 0196).
  if (myRole(snapshot.model, selfId) === "guest")
    return (
      <Screen>
        <Stack.Screen options={{ title: PART_TITLE[part] }} />
        <Empty>Not here: a harness's page is for the people who run the workspace.</Empty>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ title: PART_TITLE[part] }} />
      <Part
        part={part}
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        selfId={selfId}
        focus={focus}
        flashFile={file}
        onOpenPart={(next) =>
          router.push({ pathname: "/harnesses/[id]/[part]", params: { id: harnessId, part: next } })
        }
      />
    </Screen>
  );
}
