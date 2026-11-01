/**
 * One harness's profile. A route of its own, so a tap from the Agents tab and a link both land
 * here — and, on a wide screen, beside the list instead, through the tab's own param.
 */

import type { Store } from "@chipschat/core";
import { myRole, nameOf } from "@chipschat/core";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useFocusCount } from "../../../src/context/useFocusCount";
import { Profile } from "../../../src/harnesses/Profile";
import { useChips, useSnapshot } from "../../../src/store/provider";
import { useLayout } from "../../../src/ui/layout";
import { Empty, Screen } from "../../../src/ui/Screen";

export default function HarnessScreen() {
  const { paired } = useChips();
  const { id, file } = useLocalSearchParams<{ id: string; file?: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  // A shared file is on the Context files page since ADR 0254, so a link to one goes there.
  if (file !== undefined) {
    return (
      <Redirect
        href={{ pathname: "/harnesses/[id]/[part]", params: { id, part: "context", file } }}
      />
    );
  }
  if (wide) return <Redirect href={{ pathname: "/(tabs)/agents", params: { harness: id } }} />;
  return <One store={paired.store} selfId={paired.device.participantId} harnessId={id} />;
}

function One({
  store,
  selfId,
  harnessId,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly harnessId: string;
}) {
  const snapshot = useSnapshot(store);
  const focus = useFocusCount();
  // A guest runs no harness and changes none: no Agents shelf leads here, and a link that does
  // finds nothing to turn (ADR 0196).
  if (myRole(snapshot.model, selfId) === "guest")
    return (
      <Screen>
        <Stack.Screen options={{ title: nameOf(snapshot.directory, harnessId) }} />
        <Empty>Not here: a harness's page is for the people who run the workspace.</Empty>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ title: nameOf(snapshot.directory, harnessId) }} />
      <Profile
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        selfId={selfId}
        focus={focus}
      />
    </Screen>
  );
}
