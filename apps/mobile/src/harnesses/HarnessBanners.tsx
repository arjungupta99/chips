/**
 * Show banners, on a harness's page (ADR 0286): one switch for the gold banner of all its agents,
 * and any made later. Flipping it brings agents that had been set apart back in line, so Undo stands
 * for five seconds and puts them back as they were. It only changes what this person sees.
 *
 * An older server keeps no choices, so the switch isn't offered there.
 */

import {
  HARNESS_BANNERS_FOOT,
  HARNESS_BANNERS_ROW,
  type HarnessBannersBefore,
  harnessBannerRow,
  harnessBannersWords,
  NO_BANNERS,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BANNER_MARK } from "../agents/Permissions";
import { UndoPill } from "../spaces/UndoPill";
import { GroupFoot, GroupRow, RowMark } from "../ui/Group";
import * as feel from "../ui/haptics";
import { SPACE } from "../ui/tokens";

const UNDO_HINT = "Puts the banners back as they were for each agent";

export interface HarnessBanners {
  readonly row: ReactNode;
  readonly foot: ReactNode;
  readonly overlay: ReactNode;
}

export function useHarnessBanners(
  store: Store,
  snapshot: Snapshot,
  harnessId: string,
): HarnessBanners {
  const insets = useSafeAreaInsets();
  const [undoing, setUndoing] = useState<{
    readonly before: HarnessBannersBefore;
    readonly words: string;
    readonly at: number;
  }>();
  if (snapshot.keepsBanners === false) return { row: null, foot: null, overlay: null };
  const { directory } = snapshot;
  const row = harnessBannerRow(snapshot.banners ?? NO_BANNERS, directory, harnessId);
  return {
    row: (
      <GroupRow
        label={HARNESS_BANNERS_ROW}
        sub={row.sub}
        mark={<RowMark icon="banner" tint={BANNER_MARK} ink="#ffffff" />}
        accessibilityLabel={`${HARNESS_BANNERS_ROW}. ${row.sub}`}
        trailing={
          <Switch
            value={row.shown}
            onValueChange={(on) => {
              feel.tap();
              const before = store.setHarnessBanner(harnessId, on);
              setUndoing({
                before,
                words: harnessBannersWords(directory, harnessId, on),
                at: Date.now(),
              });
            }}
            accessibilityLabel={`${HARNESS_BANNERS_ROW} for all of its agents`}
            testID="harness-banners-switch"
          />
        }
        testID="harness-banners-row"
      />
    ),
    foot: <GroupFoot testID="harness-banners-foot">{HARNESS_BANNERS_FOOT}</GroupFoot>,
    overlay: (
      <UndoPill
        undoing={undoing === undefined ? undefined : { lineId: "banners", at: undoing.at }}
        bottom={insets.bottom + SPACE.lg}
        words={undoing?.words ?? ""}
        hint={UNDO_HINT}
        onUndo={() => {
          feel.tap();
          if (undoing !== undefined) {
            store.undoHarnessBanner(undoing.before).catch(() => feel.warning());
          }
          setUndoing(undefined);
        }}
        onGone={() => setUndoing(undefined)}
      />
    ),
  };
}
