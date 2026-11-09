/**
 * What the band, an agent's Permissions and a harness's page need of the store for the banner and
 * for letting an agent work (ADR 0286): what the person chose, whether the server keeps it, and the
 * store's own ways of changing it.
 */

import type { Banners, Snapshot, Store } from "@chipschat/core";

export interface BannerService {
  readonly banners: Banners | undefined;
  readonly keepsBanners: boolean | undefined;
  readonly keepsHeldStart: boolean | undefined;
  readonly letAgentWork: Store["letAgentWork"];
  readonly stopLetWork: Store["stopLetWork"];
  readonly closeBanner: Store["closeBanner"];
  readonly reopenBanner: Store["reopenBanner"];
  readonly setAgentBanner: Store["setAgentBanner"];
  readonly setHarnessBanner: Store["setHarnessBanner"];
  readonly undoHarnessBanner: Store["undoHarnessBanner"];
}

export function bannerServiceOf(store: Store, snapshot: Snapshot): BannerService {
  return {
    banners: snapshot.banners,
    keepsBanners: snapshot.keepsBanners,
    keepsHeldStart: snapshot.keepsHeldStart,
    letAgentWork: (input) => store.letAgentWork(input),
    stopLetWork: (input) => store.stopLetWork(input),
    closeBanner: (input) => store.closeBanner(input),
    reopenBanner: (input) => store.reopenBanner(input),
    setAgentBanner: (agentId, shown) => store.setAgentBanner(agentId, shown),
    setHarnessBanner: (harnessId, shown) => store.setHarnessBanner(harnessId, shown),
    undoHarnessBanner: (before) => store.undoHarnessBanner(before),
  };
}
