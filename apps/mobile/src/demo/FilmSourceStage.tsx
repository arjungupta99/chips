/**
 * The render mode's stage (ADR 0217): none. In the phone's web export built for `pnpm film`, a
 * chapter of a film plays full size through the demo's store: the app opened where the chapter
 * opens, by its own routes, and from there moved only by what the render does on its controls
 * (ADR 0217's addendum). The lock screen picture is drawn over it when the film says, and the page
 * marks where the film stands and an act nobody did. It starts what the page's address names once
 * the phone is ready; for Look around, the film played whole and the demo kept, on Spaces.
 *
 * Only `app/_layout.tsx` mounts it, and only in the render mode. A person watches the film's video
 * (`app/film.tsx`).
 */

import { type DemoPlayer, type DemoState, isDemo, type Store } from "@chipschat/core";
import { usePathname, useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChips } from "../store/provider";
import { Fades } from "./FilmMotion";
import { placeOf, routeOf, usePlayerState } from "./film";
import { filmSourceStart, markFilm } from "./filmSource";
import { useHome } from "./home";
import { LockPicture } from "./LockPicture";

export function FilmSourceStage({ children }: { readonly children: ReactNode }) {
  const { paired, demo, ready } = useChips();
  const filming = demo.film !== undefined && isDemo(paired?.device);
  const home = useHome();
  const started = useRef(false);
  useEffect(() => {
    const start = filmSourceStart();
    if (!ready || started.current || start === undefined) return;
    started.current = true;
    void demo.watch(start.film, start.from).then(() => {
      if (!start.look) return;
      demo.lookAround();
      // The demo is in front, so home is Spaces.
      home(true);
    });
  }, [ready, demo, home]);
  return (
    <Filmed player={filming ? paired?.player : undefined} store={paired?.store}>
      {children}
    </Filmed>
  );
}

/**
 * The app as a film plays it: opened where each chapter opens, the lock screen picture over it,
 * and the page's marks. The app and nothing more while there is no film.
 */
export function Filmed({
  player,
  store,
  children,
}: {
  readonly player: DemoPlayer | undefined;
  /** The demo's store, which the lock screen's own Approve answers through. */
  readonly store: Pick<Store, "resolveApproval"> | undefined;
  readonly children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const heard = usePlayerState(player);
  const state = player === undefined ? undefined : heard;
  useEffect(() => markFilm(state), [state]);
  useOpening(state);
  // The film plays once it is up: the demo's store has read what it holds by now.
  useEffect(() => {
    player?.play();
  }, [player]);
  const lock = state?.lockScreen;
  return (
    <View style={styles.fill}>
      {children}
      {lock === undefined ? null : (
        <Fades reduced={false} style={StyleSheet.absoluteFill}>
          <LockPicture
            lock={lock}
            top={insets.top}
            onApprove={() =>
              store?.resolveApproval({
                spaceId: lock.spaceId,
                runId: lock.runId,
                approvalId: lock.approvalId,
                decision: "approved",
                scope: "once",
              })
            }
          />
        </Fades>
      )}
    </View>
  );
}

/**
 * Each chapter opened where it opens, once, as it starts: a tab with nothing pushed over it, or a
 * room or an agent's page pushed over the tabs. Already there, nothing is done; and nothing once
 * the film has played, where the demo is the person's.
 */
function useOpening(state: DemoState | undefined): void {
  const router = useRouter();
  const pathname = usePathname();
  const here = useRef(pathname);
  here.current = pathname;
  const place = state === undefined || state.ended ? undefined : placeOf(state);
  const chapter = state === undefined ? undefined : `${state.film}:${state.chapter}`;
  const route = place === undefined ? undefined : routeOf(place);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a chapter is opened as it starts.
  useEffect(() => {
    if (place === undefined || route === undefined || here.current === route) return;
    if (router.canDismiss()) router.dismissAll();
    if (place.kind === "spaces" || place.kind === "agents") router.navigate(route);
    else router.push(route);
  }, [chapter, route]);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
