/**
 * Show banners, on a harness's page (ADR 0286): one switch for the gold banner of all its agents,
 * and any made later. Flipping it brings agents that had been set apart back in line, so Undo stands
 * for five seconds and puts them back as they were. It only changes what this person sees.
 */

import {
  type Directory,
  HARNESS_BANNERS_FOOT,
  HARNESS_BANNERS_ROW,
  type HarnessBannersBefore,
  harnessBannerRow,
  harnessBannersWords,
  NO_BANNERS,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { useState } from "react";
import type { BannerService } from "../agent/bannerService.ts";
import { UndoPill } from "../room/UndoPill.tsx";
import { Switch } from "../you/controls.tsx";

const UNDO_TITLE = "Puts the banners back as they were for each agent";

export function useHarnessBanners(
  service: BannerService | undefined,
  directory: Directory,
  harnessId: string,
) {
  const [undoing, setUndoing] = useState<{
    readonly before: HarnessBannersBefore;
    readonly words: string;
    readonly at: number;
  }>();
  if (service === undefined || service.keepsBanners === false) {
    return { row: null, foot: null, overlay: null };
  }
  const row = harnessBannerRow(service.banners ?? NO_BANNERS, directory, harnessId);
  return {
    row: (
      <li className="ctx-row hp-row" data-testid="harness-banners-row">
        <span className="ctx-tile hp-mark perm-mark" aria-hidden="true">
          <Icon name="banner" size={17} />
        </span>
        <span className="ctx-row-words">
          <span className="ctx-row-title">{HARNESS_BANNERS_ROW}</span>
          <span className="ctx-row-line">{row.sub}</span>
        </span>
        <Switch
          label={`${HARNESS_BANNERS_ROW} for all of its agents`}
          checked={row.shown}
          onChange={(on) => {
            const before = service.setHarnessBanner(harnessId, on);
            setUndoing({
              before,
              words: harnessBannersWords(directory, harnessId, on),
              at: Date.now(),
            });
          }}
          testId="harness-banners-switch"
        />
      </li>
    ),
    foot: (
      <p className="ctx-foot" data-testid="harness-banners-foot">
        {HARNESS_BANNERS_FOOT}
      </p>
    ),
    overlay: (
      <UndoPill
        undoing={undoing === undefined ? undefined : { lineId: "banners", at: undoing.at }}
        onUndo={() => {
          if (undoing !== undefined)
            service.undoHarnessBanner(undoing.before).catch(() => undefined);
          setUndoing(undefined);
        }}
        onGone={() => setUndoing(undefined)}
        words={undoing?.words ?? ""}
        title={UNDO_TITLE}
        page
      />
    ),
  };
}
