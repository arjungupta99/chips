/**
 * One space, opened. A route of its own, so `chips://space/<id>` lands somewhere real and the
 * back gesture does what a back gesture should.
 *
 * On a wide screen the room lives beside the list instead, so this route sends a link, a push
 * or a card there rather than covering the rail with a screen of its own.
 *
 * The bar over it is the platform's and, since 21 September 2026, is *transparent*: the room
 * runs the full height of the glass and passes under it, with a band of blur behind the bar so
 * the words in it stay readable (`ui/Glass.tsx`). Three things follow from that. The room has to
 * be told how tall the bar is, so it can hold that much clear at its top and draw the band the
 * right height — and the bar's height is the platform's business, not arithmetic this file
 * should be doing, so it is measured by the one view the bar lets us put in it
 * (`headerBackground`). The name gets a capsule of its own, because a name floating bare over a
 * moving conversation is the one piece of the bar that has nothing behind it — the chevron and
 * the connection's mark are given glass capsules by iOS itself. And where there is no glass to
 * be had, the bar goes back to being opaque and the room back to standing under it, which is
 * the same fallback the composer keeps (`useGlassy`).
 */

import { ownsWorkspace, type Store, serverHost } from "@chipschat/core";
import { Redirect, Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { RoomName, UniverseButton, useRoom } from "../../src/spaces/RoomHead";
import { RoomSheet } from "../../src/spaces/RoomSheet";
import { SpaceView } from "../../src/spaces/SpaceView";
import { UniverseSheet } from "../../src/spaces/Universe";
import { useChips } from "../../src/store/provider";
import { ConnectionMark, useMarking } from "../../src/ui/Connection";
import { useGlassy } from "../../src/ui/Glass";
import { useLayout } from "../../src/ui/layout";
import { MarkBeside } from "../../src/ui/MarkBeside";
import { Screen } from "../../src/ui/Screen";

export default function SpaceScreen() {
  const { paired } = useChips();
  // `words`: what a search looked for, when it opened this room at a message (ADR 0133). `add`:
  // a room made empty from the +, which opens on its Add once the window has gone (ADR 0148).
  // `sheet`: a locked room's Locked on Spaces, which opens on the sheet's first page, where the
  // lock is (ADR 0156).
  const { id, at, words, add, sheet } = useLocalSearchParams<{
    id: string;
    at?: string;
    words?: string;
    add?: string;
    sheet?: string;
  }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  // On a wide screen the room opens beside the list, with all it was asked for (ADR 0177).
  if (wide) {
    const params = {
      space: id,
      ...(at === undefined ? {} : { at }),
      ...(words === undefined ? {} : { words }),
      ...(add === undefined ? {} : { add }),
      ...(sheet === undefined ? {} : { sheet }),
    };
    return <Redirect href={{ pathname: "/(tabs)", params }} />;
  }
  return (
    <Open
      store={paired.store}
      selfId={paired.device.participantId}
      spaceId={id}
      at={at}
      words={words}
      add={add === "1"}
      sheet={sheet === "1"}
    />
  );
}

function Open({
  store,
  selfId,
  spaceId,
  at,
  words,
  add,
  sheet,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly spaceId: string;
  readonly at: string | undefined;
  readonly words: string | undefined;
  readonly add: boolean;
  readonly sheet: boolean;
}) {
  const router = useRouter();
  const { paired } = useChips();
  // Whether it has finished sliding in, for a sheet asked for as it opens.
  const landed = useArrival("transitionEnd", sheet);
  // The room's name, who is in it, and its sheet: the same beside an iPad's list (`RoomHead.tsx`).
  // The room reads names as the room has them: a harness waiting here goes by the first name held
  // for its agent (ADR 0150).
  const room = useRoom({ store, spaceId, selfId, add, sheet, landed });
  const { snapshot, space, name, title, held, drawn } = room;
  // Whether the bar is given a right-hand slot at all: iOS draws a glass capsule for one
  // whether or not what goes in it draws anything (`useMarking`).
  const beside = space?.project !== undefined;
  const { marking, room: markRoom, markedBy } = useMarking(snapshot.connection, beside);
  // Whether the bar floats over the room or stands above it, and how tall it is when it floats.
  // Nought until the bar has laid itself out, which is one frame with the room's first line
  // under the bar and then right ever after; a guess here would be wrong on a phone whose text
  // is larger than mine, which is the whole reason it is measured.
  const glassy = useGlassy();
  const [headHeight, setHeadHeight] = useState(0);
  // Whether the room's list has laid out, when UIKit's edge settings are handed to it again.
  const [listed, setListed] = useState(false);
  // Universe, from the bar's right (ADR 0227).
  const [universe, setUniverse] = useState(false);
  const inView = useArrival("transitionStart");
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          // A room asked of a harness is "New space" until the harness names it, and the name
          // arrives with a sweep of gold across the capsule (`newSpace/Naming.tsx`).
          headerTitle: () => <RoomName room={room} glassy={glassy} />,
          // Transparent, with nothing but a measuring tape in the background slot: the blur
          // behind the bar is the room's to draw, because it has to reach past the bar's own
          // bounds and into the conversation, and a view inside the bar cannot.
          ...(glassy
            ? {
                headerTransparent: true,
                headerShadowVisible: false,
                // And UIKit's own edge effects off, all four of them. iOS 26 gives a scroll view
                // under a transparent bar a `UIScrollEdgeEffect` of its own, automatically; this
                // room's list is inverted, so what it did with it was wash the whole of the
                // conversation a flat pale grey — seen on the simulator, 22 September 2026, and
                // not guessable from the JavaScript. The blur at this room's edges is drawn by
                // the room (`ui/Glass.tsx`), to a length Arjun picked, so the platform's is not
                // wanted even where it works.
                //
                // The screen hands them to the scroll view at the end of its first children when it
                // joins the stack, and when the option changes, and at no other time
                // (react-native-screens: `willMoveToParentViewController`, `finalizeUpdates`). A room
                // pushed the moment it is asked for, from the +, can be drawn first without itself
                // and then rebuilt, its list coming after both; and that list kept iOS's effect, the
                // conversation washing pale once it reached the top (the simulator, 11 October
                // 2026: five new rooms in nine; the view tree showed the effect on the list). So the
                // option changes once more when the list has laid out, by its sides, which a list
                // that only scrolls up and down never shows.
                scrollEdgeEffects: listed ? NO_EDGE_EFFECTS : UNTIL_LISTED,
                // The root stack paints every bar with the page's colour (`app/_layout.tsx`),
                // and a painted bar is an opaque one whatever `headerTransparent` says.
                headerStyle: { backgroundColor: "transparent" },
                headerBackground: () => (
                  <View
                    style={StyleSheet.absoluteFill}
                    onLayout={(event) => setHeadHeight(event.nativeEvent.layout.height)}
                  />
                ),
              }
            : {}),
          // The connection's mark, where a navigation bar keeps its right-hand button. It used
          // to be a line of words between the bar and the room's first message, and it took the
          // room with it every time the socket blinked (`ui/Connection.tsx`).
          //
          // Nothing at all rather than an empty mark when there is nothing to say: the bar
          // draws a glass capsule for whatever this slot renders, and an empty capsule standing
          // over the room is the line's ugliness at a new address. A slot that renders null is
          // never given a capsule (expo-router's `useHeaderConfigProps`), which is why the
          // decision is made here and not inside the mark.
          //
          // Universe beside it, for a room with a project: what the space made, to read here and
          // to open or run on the Mac (ADR 0227). Universe keeps the corner and the mark comes and
          // goes on its left: the bar grows leftward, so a mark after it moved the rings over
          // every time the phone woke and reconnected (Arjun, 24 October 2026).
          headerRight: () =>
            !marking && !beside ? null : (
              <View style={styles.trailing}>
                <MarkBeside
                  open={markRoom}
                  mark={
                    marking ? (
                      <ConnectionMark
                        state={snapshot.connection}
                        link={snapshot.link}
                        lostAt={snapshot.lostAt}
                        server={serverHost(paired?.device.serverUrl)}
                        owner={ownsWorkspace(snapshot.directory, selfId)}
                        onRetry={store.wake}
                        {...markedBy}
                      />
                    ) : null
                  }
                >
                  {beside ? <UniverseButton onPress={() => setUniverse(true)} /> : null}
                </MarkBeside>
              </View>
            ),
          // The keyboard goes down as the screen goes: the chevron and the back gesture both
          // resign it as the transition starts, so it slides away with the room rather than
          // standing over the list for the length of the slide and then vanishing (the
          // simulator, 11 September 2026). Off by default, oddly.
          keyboardHandlingEnabled: true,
          // A room made from the + came in with no transition of its own, under the window that
          // made it (`app/_layout.tsx`), and a stack screen leaves the way it came in: it went
          // back to the list in a single frame. Once the window has gone it has the stack's own
          // slide again, out and under the thumb for the back gesture (24 September 2026).
          ...(held ? {} : { animation: "default" as const }),
        }}
      />
      <SpaceView
        store={store}
        snapshot={snapshot}
        spaceId={spaceId}
        selfId={selfId}
        onOpenSpace={(id) => router.push(`/spaces/${id}`)}
        onOpenAgent={(id) => router.push(`/agents/${id}`)}
        at={at}
        words={words}
        onDetails={(item) => router.push(`/needs/${item.id}`)}
        onTakenSeen={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        headHeight={glassy ? headHeight : 0}
        inView={inView}
        onOpenRoom={room.sheet.show}
        onListed={() => {
          setListed(true);
          // A frame on, so what was laid out has been drawn.
          requestAnimationFrame(drawn);
        }}
      />
      {space === undefined ? null : (
        <RoomSheet
          store={store}
          snapshot={snapshot}
          space={space}
          title={name}
          selfId={selfId}
          open={room.sheet.open}
          opensOn={room.sheet.opensOn}
          onClose={room.sheet.close}
          files={paired?.files}
          workspace={paired?.device.workspaceName ?? "the workspace"}
          // A file's viewer's *Go to message*: the room lands on the line, as a link does, with
          // nothing a search marked in another line carried to it.
          onGoTo={(lineId) => router.setParams({ at: `line:${lineId}`, words: undefined })}
          // An agent's row opens its card, the Agents tab's, over the room (ADR 0111's addendum).
          onOpenAgent={(agentId) => router.push(`/agents/${agentId}`)}
          // The Media row: the space's own Media, Media on this phone's page for one space (ADR 0165).
          onOpenMedia={() => router.push(`/media?space=${encodeURIComponent(space.id)}`)}
          // Left from the sheet's Leave: back to Spaces, where the room is no longer listed.
          onLeft={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      )}
      <UniverseSheet
        store={store}
        space={space}
        selfId={selfId}
        title={name}
        open={universe}
        onClose={() => setUniverse(false)}
      />
    </Screen>
  );
}

/** What the stack says of a screen as it comes and goes. */
interface Transitions {
  readonly addListener: (
    type: "transitionStart" | "transitionEnd",
    listener: (event: { readonly data: { readonly closing: boolean } }) => void,
  ) => () => void;
}

/**
 * A room that does not slide in, opened as the app starts, is taken to be in view after this, and
 * to have landed.
 */
const NO_SLIDE_MS = 600;

/** UIKit's edge effects on the room's list, all four of them off. */
const NO_EDGE_EFFECTS = {
  top: "hidden",
  bottom: "hidden",
  left: "hidden",
  right: "hidden",
} as const;

/** The same until the list has laid out, but for the sides, whose change then hands it all four. */
const UNTIL_LISTED = { ...NO_EDGE_EFFECTS, left: "automatic", right: "automatic" } as const;

/**
 * Whether the room has begun to come into view: its slide in has started. By then the bar has drawn
 * the room's name and its way back, which reach JavaScript ahead of the slide's start, and what a
 * room opened far up draws to its line waits for that (`SpaceView`'s `inView`, ADR 0133).
 *
 * Asked at `transitionEnd`, whether it has finished sliding in: a sheet asked for as the room opens
 * comes up over a room that is still, rather than a modal presented while the stack is still
 * pushing (ADR 0156). Only listened for where it is `wanted`.
 */
function useArrival(edge: "transitionStart" | "transitionEnd", wanted = true): boolean {
  const navigation = useNavigation() as unknown as Transitions;
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const off = navigation.addListener(edge, (event) => {
      if (!event.data.closing) setArrived(true);
    });
    const timer = setTimeout(() => setArrived(true), NO_SLIDE_MS);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [navigation, edge, wanted]);
  return arrived;
}

const styles = StyleSheet.create({
  // Universe and the connection's mark, side by side in the bar's one capsule (`MarkBeside`).
  // The bar's glass gives its slot about five points either side; five more here, and twenty
  // between the two marks, so each sits in the middle of its own half of the glass, as grouped bar
  // buttons do: not pressed to its ends (his iPhone, 24 October 2026), and not crowded together
  // either ("Need more space between the chips loading icon and the universe icon").
  trailing: { flexDirection: "row", alignItems: "center", paddingHorizontal: 5 },
});
