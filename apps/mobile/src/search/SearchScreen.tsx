/**
 * The Search tab (ADR 0132): one field that finds spaces, agents and messages, each opening where
 * you'd expect — a space its room, an agent its page, a message its room at that message.
 *
 * - **The field stands where the tab's name would**, on the same glass, with the chips under it
 *   once something is typed (`ScopeChips`). The tab's name is the bar's and VoiceOver's.
 * - **Spaces and agents are found on the phone**, by name, from an index of every name folded
 *   once (core's `searchIndex`): a key is a prefix test on folded words, and a change to the
 *   workspace folds again only the rooms it touched. It is kept only while the tab is in front or
 *   something is typed, since the tab stays drawn under whatever is pushed over it.
 * - **Messages are the server's**, asked for after a pause (`useMessageSearch`).
 * - **The keyboard comes up** when the tab is chosen from another with nothing typed, and when the
 *   tab is pressed while it is in front; not on coming back from a room opened from it, where the
 *   results wait as they were. Dragging the results puts it away.
 * - **A search is remembered** on this phone (`recent.ts`) when its Search key is pressed or one of
 *   its results is opened.
 * - **Behind the recent searches**, with nothing typed, the faces of your spaces drift up slowly
 *   under the field (`Backdrop`, ADR 0136).
 * - **Nothing found is swapped in a frame** (ADR 0189): the rows a change brings arrive down the
 *   page on a wave, the rows it keeps glide to their new places and the rows it drops fade where
 *   they stand (`ResultsMotion`); which rows arrived is core's `searchArrivals`.
 * - **On an iPad the results are a list beside what they find** (ADR 0256): a result opens in the
 *   pane beside them, its room at the line it was found at, rather than taking the tab away
 *   (`Found`); the drifting faces are that pane's before anything is opened.
 */

import {
  findAgents,
  findSpaces,
  hitWords,
  type SearchHit,
  type SearchIndex,
  type SearchItem,
  type SearchScope,
  type Snapshot,
  type Store,
  searchArrivals,
  searchIndex,
  searchItems,
  searchTerms,
} from "@chipschat/core";
import { useFocusEffect, useIsFocused, useNavigation, useRouter } from "expo-router";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, type TextInput, View } from "react-native";
import { PlusRoom } from "../newSpace/plusRoom";
import { useDeferredSnapshot } from "../store/provider";
import { useLayout } from "../ui/layout";
import { useOpened } from "../ui/opened";
import { Screen, UnderNameList, useColumn } from "../ui/Screen";
import { Search } from "../ui/Search";
import { Split } from "../ui/Split";
import { usePalette } from "../ui/theme";
import { SPACE } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { Backdrop, backdropFaces } from "./Backdrop";
import { Found, SEARCH_OPEN } from "./Found";
import { hitAt, hitHref } from "./items";
import { ResultRow, type RowContext } from "./Results";
import { Arriving, MovingList } from "./ResultsMotion";
import { useRecentSearches } from "./recent";
import { CHIPS_HEIGHT, ScopeChips } from "./ScopeChips";
import { onSummon } from "./summon";
import { useMessageSearch } from "./useMessageSearch";

export function SearchScreen({
  store,
  selfId,
}: {
  readonly store: Store;
  readonly selfId: string;
}) {
  const snapshot = useDeferredSnapshot(store);
  const palette = usePalette();
  const router = useRouter();
  const column = useColumn();
  const field = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const online = snapshot.connection === "open";
  const messages = useMessageSearch(store, online);
  const recent = useRecentSearches();
  const terms = useMemo(() => searchTerms(text), [text]);
  const typed = terms.length > 0;
  const index = useLiveIndex(snapshot, selfId, typed);
  const spaces = useMemo(
    () => (index === undefined ? [] : findSpaces(index, terms)),
    [index, terms],
  );
  const agents = useMemo(
    () => (index === undefined ? [] : findAgents(index, terms)),
    [index, terms],
  );
  useSummoned(field, text === "");
  const { model, directory, spaceIcons } = snapshot;
  const faces = useMemo(
    () => backdropFaces({ model, directory, spaceIcons }, selfId),
    [model, directory, spaceIcons, selfId],
  );

  const { type: ask } = messages;
  const type = useCallback(
    (value: string) => {
      setText(value);
      ask(value);
      // Nothing typed is the recent searches, under no chip; the next search starts at All.
      if (searchTerms(value).length === 0) setScope("all");
    },
    [ask],
  );
  const items = useMemo(
    () =>
      searchItems({
        text,
        typed,
        scope,
        spaces,
        agents,
        messages: messages.results,
        online,
        model: snapshot.model,
        recent: recent.list,
      }),
    [text, typed, scope, spaces, agents, messages.results, online, snapshot.model, recent.list],
  );
  const arrivals = useArrivals(items);
  const { wide } = useLayout();
  const [opened, go] = useOpened("search", SEARCH_OPEN);
  const open = (href: string) => {
    recent.remember(text);
    router.push(href);
  };
  // Beside the results on an iPad, what a result finds opens there.
  const beside = (next: typeof opened) => {
    recent.remember(text);
    go(next);
  };
  const context: RowContext = {
    snapshot,
    selfId,
    now: Date.now(),
    onOpenSpace: (id) => (wide ? beside({ space: id }) : open(`/spaces/${id}`)),
    onOpenAgent: (id) => (wide ? beside({ agent: id }) : open(`/agents/${id}`)),
    onOpenHit: (hit: SearchHit) =>
      wide
        ? beside({ space: hit.spaceId, at: hitAt(hit), words: hitWords(hit, text) })
        : open(hitHref(hit, text)),
    onRecent: (words) => {
      type(words);
      recent.remember(words);
      field.current?.blur();
    },
    onForget: recent.forget,
    onClear: recent.clear,
    onSeeAll: setScope,
    onRetry: messages.retry,
    onWake: store.wake,
    open: wide ? opened : undefined,
  };
  // The next page, when the list nears its end with messages in it.
  const more = scope === "all" || scope === "messages" ? messages.more : undefined;

  const results = (
    <Screen
      title="Search"
      glass
      testID="search-screen"
      head={
        <View style={styles.head}>
          <View style={styles.field}>
            <Search
              label="Search"
              value={text}
              onChange={type}
              onSubmit={recent.remember}
              onCancel={() => field.current?.blur()}
              placeholder="Spaces, agents, messages"
              inputRef={field}
              testID="search"
            />
          </View>
        </View>
      }
      under={
        typed
          ? { node: <Chips scope={scope} onChange={setScope} />, height: CHIPS_ROOM }
          : undefined
      }
    >
      <UnderNameList<SearchItem>
        List={MovingList}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <Arriving order={arrivals.get(item.key)} ground={typed ? palette.bg : undefined}>
            <ResultRow item={item} context={context} />
          </Arriving>
        )}
        extraData={context}
        // Beside the results on an iPad, the faces drift in the pane instead (`Found`).
        ListHeaderComponent={wide ? null : <Backdrop faces={faces} shown={!typed} />}
        ListFooterComponent={<PlusRoom />}
        // The backdrop hangs from the list's first child, which scrolls above the window while
        // it is still drawn behind the rows below it: it must not be clipped away with it. Typed,
        // the backdrop is gone and the results clip as lists do.
        removeClippedSubviews={typed || wide ? undefined : false}
        onEndReached={more}
        onEndReachedThreshold={0.5}
        // The tab bar is glass over the list, so the inset that keeps the last row clear of it is
        // the window's to give, as on Spaces.
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, column]}
        testID="search-results"
      />
    </Screen>
  );
  if (!wide) return results;
  return (
    <Split
      tab="search"
      list={results}
      detail={
        <Found
          store={store}
          snapshot={snapshot}
          selfId={selfId}
          opened={opened}
          go={go}
          faces={faces}
          typed={typed}
        />
      }
    />
  );
}

/**
 * The index of every name, kept while the tab is in front or something is typed, each new one
 * handed the last so a change to the workspace folds only the rooms it touched (§3.7 of the plan).
 * Behind a room, with nothing typed, the workspace changes without the index following it; it
 * catches up the moment the tab is back.
 */
function useLiveIndex(snapshot: Snapshot, selfId: string, typed: boolean): SearchIndex | undefined {
  const focused = useIsFocused();
  const live = focused || typed;
  const last = useRef<SearchIndex | undefined>(undefined);
  const { model, directory } = snapshot;
  const index = useMemo(
    () => (live ? searchIndex(model, directory, selfId, last.current) : last.current),
    [live, model, directory, selfId],
  );
  useEffect(() => {
    last.current = index;
  }, [index]);
  return index;
}

/**
 * The rows the last change to the list brought, each with its place in the wave (core's
 * `searchArrivals`): against the list as it was last drawn, so a row is new once, the render it
 * first appears in. The rows a list draws only as they near the window keep the place they were
 * given until the list changes again.
 */
function useArrivals(items: readonly SearchItem[]): ReadonlyMap<string, number> {
  const drawn = useRef<readonly SearchItem[] | undefined>(undefined);
  const arrivals = useMemo(() => searchArrivals(drawn.current, items), [items]);
  useEffect(() => {
    drawn.current = items;
  }, [items]);
  return arrivals;
}

/** The navigator's press on this tab, which the screen's own navigation does not type. */
interface TabPresses {
  readonly addListener: (type: "tabPress", listener: () => void) => () => void;
  readonly isFocused: () => boolean;
}

/**
 * When the keyboard comes up by itself: the tab chosen from another with nothing typed, or the
 * tab pressed while it is in front. A press on a tab in front still reaches the navigator
 * (react-native-screens tells it a repeated selection), which is what tells the two apart from a
 * room popped off the stack over it, which is no press at all. Leaving the tab puts it away.
 */
const NATIVE = Platform.OS !== "web";

/** The room the chips take under the field: their row, and the gap under it before the results. */
const CHIPS_ROOM = CHIPS_HEIGHT + SPACE.sm;

/** How long the chips take to arrive, and how far they settle as they do. */
const CHIPS_MS = 200;
const CHIPS_DROP = 6;

/**
 * The chips, arriving with the first letter typed: they fade in and settle a few points into
 * place, on the native side, while the screen has already made room for them (`Screen`'s
 * `under`). With Reduce Motion they only fade.
 */
function Chips({
  scope,
  onChange,
}: {
  readonly scope: SearchScope;
  readonly onChange: (scope: SearchScope) => void;
}) {
  const less = useReduceMotion();
  const arrived = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const arriving = Animated.timing(arrived, {
      toValue: 1,
      duration: CHIPS_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    });
    arriving.start();
    return () => arriving.stop();
  }, [arrived]);
  const drop = arrived.interpolate({ inputRange: [0, 1], outputRange: [-CHIPS_DROP, 0] });
  return (
    <Animated.View style={{ opacity: arrived, transform: less ? [] : [{ translateY: drop }] }}>
      <ScopeChips scope={scope} onChange={onChange} />
    </Animated.View>
  );
}

function useSummoned(field: RefObject<TextInput | null>, empty: boolean) {
  const navigation = useNavigation() as unknown as TabPresses;
  // The first time the tab is shown, it was chosen.
  const chosen = useRef(true);
  const blank = useRef(empty);
  blank.current = empty;
  // Asked for by Search Everything: the field takes the keys whatever it holds.
  const asked = useRef(false);
  useEffect(
    () =>
      navigation.addListener("tabPress", () => {
        if (navigation.isFocused()) field.current?.focus();
        else chosen.current = true;
      }),
    [navigation, field],
  );
  useEffect(
    () =>
      onSummon(() => {
        if (navigation.isFocused()) field.current?.focus();
        else asked.current = true;
      }),
    [navigation, field],
  );
  useFocusEffect(
    useCallback(() => {
      const summoned = asked.current || (chosen.current && blank.current);
      asked.current = false;
      chosen.current = false;
      // A frame on: the navigator says the tab is in front before UIKit has put its view in the
      // window, and a field that is not in one cannot take the keyboard.
      const frame = summoned ? requestAnimationFrame(() => field.current?.focus()) : undefined;
      return () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        field.current?.blur();
      };
    }, [field]),
  );
}

const styles = StyleSheet.create({
  head: { gap: SPACE.sm, paddingTop: SPACE.sm, paddingBottom: SPACE.sm },
  field: { paddingHorizontal: SPACE.lg },
  list: { paddingBottom: SPACE.xxl },
});
