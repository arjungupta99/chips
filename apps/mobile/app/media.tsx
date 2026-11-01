/**
 * Media on this phone (ADR 0159): what this phone keeps, by space, from the row on You. With
 * `?space=<id>`, a space's own Media (ADR 0165): every photo and video of that space, from the Media
 * row of its details.
 */

import { Stack, useLocalSearchParams } from "expo-router";
import { thisDevice } from "../src/device/word";
import { useChips } from "../src/store/provider";
import { Screen } from "../src/ui/Screen";
import { MediaPage } from "../src/you/MediaPage";

export default function MediaScreen() {
  const { paired } = useChips();
  const { space } = useLocalSearchParams<{ space?: string }>();
  if (paired === undefined) return null;
  return (
    <Screen>
      <Stack.Screen
        options={{ title: space === undefined ? `Media on ${thisDevice()}` : "Media" }}
      />
      <MediaPage
        store={paired.store}
        files={paired.files}
        selfId={paired.device.participantId}
        spaceId={space}
      />
    </Screen>
  );
}
