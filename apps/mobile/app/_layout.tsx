/**
 * The root: the device and its store, and a stack the router fills. Everything below this is
 * either the tabs (which need a paired device) or the pairing screen (which is how one is got).
 */

import { type Device, isDemo, type Store } from "@chipschat/core";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { JoinAsks } from "../src/agents/JoinSheet";
import { FilmSourceStage } from "../src/demo/FilmSourceStage";
import { FILM_SOURCE } from "../src/demo/filmSource";
import { ConnectProvider } from "../src/harnesses/Connect";
import { NewSpaceProvider } from "../src/newSpace/NewSpace";
import { loadRemembered } from "../src/newSpace/remembered";
import { PairElsewhereSheet } from "../src/pairing/PairElsewhereSheet";
import { usePairingLink } from "../src/pairing/usePairingLink";
import { WaitingForAllow } from "../src/pairing/WaitingForAllow";
import { AskForPush } from "../src/push/AskForPush";
import {
  usePushArrivals,
  usePushBadge,
  usePushRefresh,
  usePushResponses,
  usePushSetup,
} from "../src/push/usePush";
import { loadPicks } from "../src/spaces/picks";
import { beginReadingHeld, ChipsProvider, useChips } from "../src/store/provider";
import { loadAppearance } from "../src/ui/appearance";
import { UNDER_A_BAR } from "../src/ui/bars";
import { loadFaceTheme } from "../src/ui/faceTheme";
import { usePalette, useScheme } from "../src/ui/theme";
import { useAwake } from "../src/ui/useAwake";
import { useDeepLinks } from "../src/ui/useDeepLinks";
import { WindowInsets } from "../src/ui/windowInsets";
import { BehindBanner } from "../src/workspaces/BehindBanner";
import { DirectAsks } from "../src/you/DirectAskSheet";

/** How long the launch picture takes to dissolve into the app: a beat, not a curtain. */
const FADE_MS = 220;
/**
 * The longest the picture stays up once the root is laid out, whatever the device's storage is
 * doing: a phone whose storage never answers gets the app, blank as it is, not a picture for ever.
 */
const PICTURE_AT_MOST_MS = 4000;

/**
 * The launch picture stays up until the app has something to draw. Left to itself the phone takes
 * it away the moment the root view is mounted, which is a beat before the appearance has been read
 * — and since nothing is drawn until then, the launch went picture, blank paper, app (Arjun, 20
 * September 2026). Held here instead, it goes picture, app, with the picture dissolving into it.
 * The app is there once the device's store has read what it kept (`Curtain`): taken away at the
 * root's layout, it dissolved into "No spaces yet" and the rooms dropped in after (6 October 2026).
 *
 * Asked for in global scope, as the module asks: inside a component it runs after the mount it is
 * meant to precede. Both calls are no-ops on the web, where the page has no launch picture.
 */
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: FADE_MS, fade: true });

export default function RootLayout() {
  // Nothing is drawn until the appearance the person chose has been read and applied: a light
  // frame before a dark app is the kind of flash people remember, and the read is a row. Who
  // took new spaces last time is read alongside, so the + by the bar is there from the first
  // frame rather than moving the bar aside when the directory comes in.
  const [dressed, setDressed] = useState(false);
  useEffect(() => {
    // What the phone holds is read alongside, for the provider drawn once this is done.
    beginReadingHeld();
    void Promise.all([loadAppearance(), loadFaceTheme(), loadRemembered(), loadPicks()]).finally(
      () => setDressed(true),
    );
  }, []);
  // Laid out: the picture goes when the store is ready (`Curtain`), and at the latest this long
  // after. It fires again on a rotation; hiding what is already hidden costs nothing.
  const drawn = useCallback(() => {
    setTimeout(() => void SplashScreen.hideAsync(), PICTURE_AT_MOST_MS);
  }, []);
  if (!dressed) return null;

  // Over everything the stack pushes: the new space's window lifts off a room.
  const app = (
    <NewSpaceProvider>
      {/* Read here, where the view never leaves the window: a tab off screen is told 0. */}
      <WindowInsets>
        {/* Connect a harness and New agent (ADR 0190): sheets any screen opens. */}
        <ConnectProvider>
          <Pushed />
        </ConnectProvider>
        {/* Something new in a workspace behind this one (ADR 0197): after the stack, so it is
            drawn over the screens, and inside the insets, which place it under the island. */}
        <BehindBanner />
      </WindowInsets>
    </NewSpaceProvider>
  );

  // The root view gesture-handler needs above everything that uses a gesture — the swipe on a
  // decision card, for one. Without it the gestures are simply never recognised, silently.
  //
  // The keyboard provider is the other root (WP2): it watches the keyboard's frame on the UI
  // thread and hands it to whatever avoids it below, which is how the composer rides the keys up
  // rather than being told twice — once by a show event, once by a hide — and jumping between
  // (Arjun, 11 September 2026: the box jumps up and down instead of sliding). It is up here
  // because it has to be above every screen that takes typing, not only the room.
  return (
    <GestureHandlerRootView style={styles.root} onLayout={drawn}>
      <KeyboardProvider>
        <ChipsProvider>
          <Curtain />
          <Status />
          <Links />
          {/* Only in the build `pnpm film` renders the films from (ADR 0217). */}
          {FILM_SOURCE ? <FilmSourceStage>{app}</FilmSourceStage> : app}
          {/* A link that asks, waiting for its sender's Allow, over everything (ADR 0232). */}
          <WaitingForAllow />
        </ChipsProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The launch picture goes once the app has something of its own to draw: the device is read, and
 * a paired one's store has read what this phone last saw, so the picture dissolves into the rooms
 * themselves (`ready`, `src/store/provider.tsx`).
 */
function Curtain() {
  const { ready } = useChips();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  return null;
}

/** The status bar's ink, the opposite of the page: light words on a dark app. */
function Status() {
  return <StatusBar style={useScheme() === "dark" ? "light" : "dark"} />;
}

/**
 * The stack, and how a screen pushed onto it wears its navigation bar. The tabs turn the bar
 * off and draw their own name; a screen pushed over them stands under the bar, with its own
 * title in it, so a space's name is said once rather than twice. Which screens do is said here,
 * before any of them is laid out (`ui/bars.ts`), and each fills in its own title.
 *
 * The back button shows the chevron and no words. A back title is the name of the screen
 * behind, and the screen behind a space is the tab group, whose name is the folder it lives in
 * — so the phone offers to take you back to "(tabs)".
 */
const JOIN_OVER = {
  presentation: "transparentModal",
  animation: "fade",
  contentStyle: { backgroundColor: "transparent" },
} as const;

function Pushed() {
  const palette = usePalette();
  const scheme = useScheme();
  // Native-stack sets UIKit's navigation-bar appearance from this theme's `dark` flag.
  // Painting the header alone leaves its glass buttons in the router's default light mode.
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={({ route }) => ({
          headerShown: UNDER_A_BAR.has(route.name),
          ...(UNDER_A_BAR.has(route.name) ? { title: "" } : {}),
          headerBackButtonDisplayMode: "minimal",
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerTitleStyle: { color: palette.ink },
          contentStyle: { backgroundColor: palette.bg },
          // A room made from the + comes in under the window that made it, which is its
          // transition (`src/newSpace`); one of its own would slide in behind the glass.
          ...(viaNewSpace(route.params) ? { animation: "none" as const } : {}),
          // An invite opened on a phone already in a workspace is a sheet over whatever was on the
          // screen, so its route lets that show through; a phone in none draws its own card
          // (`app/join.tsx`, ADR 0164).
          ...(route.name === "join" ? JOIN_OVER : {}),
        })}
      />
    </ThemeProvider>
  );
}

/**
 * Inside the provider, because a link may only be followed once there is a device to follow it
 * with — or, for a pairing link, once it is known there is none — and because the store to wake
 * is the paired one.
 */
function Links() {
  const { paired } = useChips();
  useDeepLinks(paired !== undefined);
  // The one link that does not wait for a device, because it is how one is got. A link naming
  // another server than the one held comes back as an ask, shown as a sheet (SEC-8).
  const elsewhere = usePairingLink();
  useAwake(paired?.store);
  // The buttons and the foreground behaviour are registered whether or not this phone is paired:
  // a push that arrives before the category exists shows no buttons at all.
  usePushSetup();
  return (
    <>
      {elsewhere === undefined ? null : <PairElsewhereSheet ask={elsewhere} />}
      {paired === undefined ? null : (
        <Pushes key={paired.device.deviceId} store={paired.store} device={paired.device} />
      )}
    </>
  );
}

/**
 * The push half, mounted only once there is a store. A decision from the lock screen is written
 * down before it is sent and is owed until the log shows it landed, so this has to be alive
 * wherever the app is — not only in the room the ask is in. So does the sheet for something that
 * asks to join, which a push for one opens.
 */
function Pushes({ store, device }: { readonly store: Store; readonly device: Device }) {
  const { devices, others } = useChips();
  // The workspaces behind the one in front (ADR 0197): a push from one is answered through its
  // own store, or brings it forward.
  const workspaces = useMemo(
    () => ({
      deviceId: device.deviceId,
      storeOf: (deviceId: string) => others.stores.get(deviceId),
      holds: (deviceId: string) => devices.some((each) => each.deviceId === deviceId),
    }),
    [device.deviceId, others, devices],
  );
  // The demo's made-up workspace (ADR 0213) has no server to push from: nothing of it is
  // registered, counted on the badge, or asked about.
  const pushed = useMemo(() => devices.filter((each) => !isDemo(each)), [devices]);
  const demo = isDemo(device);
  usePushResponses(store, workspaces);
  usePushArrivals(store, device.deviceId);
  usePushBadge(store, others.decides, demo);
  // Where the phone is today, and what it seals words to (ADRs 0157, 0158), told once a launch,
  // to every workspace it holds.
  usePushRefresh(pushed);
  // In the demo, nobody asks to join and nothing asks to turn notifications on (ADR 0213).
  if (demo) return null;
  // Something asking to join (ADR 0122) is asked about wherever the app is, as a push opens it,
  // and so is a guest asking to go direct (ADR 0211); and notifications are asked for the first time an agent asks something (ADR 0170).
  return (
    <>
      <JoinAsks store={store} selfId={device.participantId} />
      <DirectAsks store={store} device={device} />
      <AskForPush store={store} device={device} />
    </>
  );
}

/** Whether a route was pushed by the new space's window (`src/newSpace/NewSpace.tsx`). */
function viaNewSpace(params: object | undefined): boolean {
  return (params as { via?: unknown } | undefined)?.via === "new";
}

const styles = StyleSheet.create({ root: { flex: 1 } });
