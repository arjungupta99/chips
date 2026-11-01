/**
 * One context file (ADR 0135): an agent's (`?agent=`) or its harness's own (`?harness=`), by its
 * name, to edit or to read; `own=1` gives an agent its own of a shared one. Pushed from an agent's
 * card or a harness's page, and back to it when saved, which flashes the row.
 */

import type { Store } from "@chipschat/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ContextFile } from "../src/context/ContextFile";
import { land } from "../src/context/memory";
import { type ContextOwner, ownerFrom, ownerKey } from "../src/context/owner";
import { thisDevice } from "../src/device/word";
import { useChips, useSnapshot } from "../src/store/provider";
import { Empty, Screen } from "../src/ui/Screen";

export default function ContextScreen() {
  const { paired } = useChips();
  const params = useLocalSearchParams<{
    agent?: string;
    harness?: string;
    name?: string;
    own?: string;
  }>();
  const owner = ownerFrom(params);
  if (paired === undefined) return null;
  if (owner === undefined || params.name === undefined) {
    return <Empty>{`There is no such file on ${thisDevice()}.`}</Empty>;
  }
  return <One store={paired.store} owner={owner} name={params.name} own={params.own === "1"} />;
}

function One({
  store,
  owner,
  name,
  own,
}: {
  readonly store: Store;
  readonly owner: ContextOwner;
  readonly name: string;
  readonly own: boolean;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  return (
    <Screen>
      <ContextFile
        store={store}
        snapshot={snapshot}
        owner={owner}
        name={name}
        own={own}
        onDone={() => {
          land(ownerKey(owner), name);
          router.back();
        }}
      />
    </Screen>
  );
}
