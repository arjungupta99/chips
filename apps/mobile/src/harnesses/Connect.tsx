/**
 * Connect a harness on the phone (ADR 0190; Arjun, 17 October 2026: "We need a refined, delightful
 * and polished experience. And is this add an agent or add a Harness?"). It was a link handed to
 * the share sheet as a paragraph, and then nothing. Now it is a sheet of three pages, from the
 * shelf's last tile, the foot of View all and You's row alike:
 *
 * - **The gallery.** The docs' cards (ADR 0171), then the two ways the app carries, in the
 *   desktop's words. A card for a harness that is here already says so.
 * - **The connect page.** The link is made as the page opens, allowed already with what the card
 *   asks for. The one line to run where the harness runs, Copy first and Send… beside it; then the
 *   link followed in three steps, the minutes counting down while it waits; where it stops, why,
 *   and Make a new link when that is the fix; and What it may do, folded. A card for a harness
 *   here already asks first: a new agent of it, or another of it.
 * - **The arrival.** When the harness says hello the sheet turns to it on its own: its face lands,
 *   the light runs round it, its Main agent's face comes in at its corner. Say hello opens its room.
 *
 * Put away before the hello, the link is still followed: the shelf's last tile waits, the ring
 * round its + emptying over the link's minutes (`waiting`), and a tap opens the sheet where it was.
 * The link is this phone's, kept while the app runs.
 *
 * New agent on a harness's page (ADR 0190, point 4) is here too, so the gallery's card for a
 * harness here can hand over to it, and so one sheet is ever up at a time.
 *
 * Beside a list on an iPad the same pages stand in the pane, not a sheet (ADR 0284's addendum;
 * Arjun, 7 November 2026: "this 'connect a harness' can also make use of right section instead of
 * popup. Please fix this in ipad as well"): the split says how its list opens Connect
 * (`ConnectBeside`), and its pane holds the pages while it is open (`ConnectPane`), the link they
 * made still followed here when the pane gives them up. The gallery stays in the pane, and the card
 * picked in it stands in a third column beside it (`useConnectThird`; Arjun, the same evening:
 * "Tapping detail item under connect a harness can open in third tab"), its × back to the gallery.
 *
 * Which words, which steps and what the arrival says are core's (`connect.ts`), the desktop's too.
 */

import {
  arrivalWords,
  CANCEL_LINK,
  CONNECT_WAY_ORDER,
  CONNECT_WAYS,
  type ConnectChoice,
  type ConnectStep,
  capabilityWords,
  choiceKey,
  connectedNames,
  connectHead,
  connectingName,
  connectNote,
  connectSteps,
  copyOf,
  HANDOFF_NOTE,
  harnessNamed,
  hereAlreadyWords,
  type JoinRequest,
  joinCardOf,
  kindWords,
  linkLeft,
  linkShare,
  linkStandIn,
  linkStarts,
  linkWaiting,
  makingSteps,
  mayAskFromPage,
  NO_AGENT_YET,
  nameOf,
  OFFERED,
  RUN_IN_TERMINAL,
  runsInTerminal,
  type Snapshot,
  START_PAGE,
  type Store,
  stallWords,
  startAnswers,
} from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { faceProps } from "../agents/face";
import { NotInDemo, useInDemo } from "../demo/NotInDemo";
import { useChips, useSnapshot } from "../store/provider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { success, tap } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { PageBack } from "../ui/PageBack";
import { Pane } from "../ui/Pane";
import { useColumn } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { CLOSE_ROOM, Sheet, SheetPages, SheetScroll } from "../ui/Sheet";
import { shareText } from "../ui/share";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { NewAgentSheet } from "./NewAgent";

/** This phone's link while it is waited on: what the shelf's last tile and You's row say. */
export interface Waiting {
  /** The minutes and seconds left, "14:12". */
  readonly left: string;
  /** How much of the link's time is left, one to nought: the tile's ring. */
  readonly share: number;
  /** The harness has taken its key and is starting: no minutes to count any more. */
  readonly taken: boolean;
}

export interface Connecting {
  /** Opens the sheet: where it was while this phone's link waits, else on the gallery. */
  readonly open: () => void;
  readonly waiting: Waiting | undefined;
  /** New agent on a harness's page (ADR 0190, point 4). */
  readonly newAgent: (harnessId: string) => void;
  /** Beside a list, Connect is what its pane shows: the tile and the row wear the chosen ground. */
  readonly chosen?: boolean | undefined;
}

const NONE: Connecting = { open: () => undefined, waiting: undefined, newAgent: () => undefined };
const ConnectContext = createContext<Connecting>(NONE);

/** How a list beside its pane opens Connect there, and whether the pane shows it now. */
export interface ConnectHere {
  readonly open: () => void;
  readonly chosen: boolean;
}

const ConnectHereContext = createContext<ConnectHere | undefined>(undefined);

/** Put round a split whose pane holds Connect (ADR 0284's addendum): its list opens it there. */
export const ConnectBeside = ConnectHereContext.Provider;

export function useConnect(): Connecting {
  const connecting = useContext(ConnectContext);
  const here = useContext(ConnectHereContext);
  return useMemo(
    () =>
      here === undefined ? connecting : { ...connecting, open: here.open, chosen: here.chosen },
    [connecting, here],
  );
}

/** A pane holding the pages: while it does, the sheet is not drawn, and the pane's close is its own. */
interface Held {
  readonly hold: (close: () => void) => () => void;
  /** The gallery, which the pane shows. */
  readonly gallery: ReactNode;
  /** The card picked in it, in a third column beside it while the pane holds them. */
  readonly beside: ReactNode;
}

const HeldContext = createContext<Held | undefined>(undefined);

/**
 * Connect a harness in a pane beside a list (ADR 0284's addendum): the sheet's pages under the
 * pane's bar, on the grouped ground they stood on in the sheet. As every pane a row opens, it has
 * no × (ADR 0276): another row puts it away, and Say hello or New agent close it as they closed the
 * sheet (`onClose`). A link it made is still followed, and the shelf's tile counts it down.
 */
export function ConnectPane({ onClose }: { readonly onClose: () => void }) {
  const held = useContext(HeldContext);
  const close = useRef(onClose);
  close.current = onClose;
  const hold = held?.hold;
  useEffect(() => hold?.(() => close.current()), [hold]);
  // Settings' margins, as every page beside the list has them (ADR 0276's addendum).
  const column = useColumn();
  if (held === undefined) return null;
  return (
    <Pane title="Connect a harness" grouped>
      <InPane.Provider value>
        <View style={[column, styles.inPane]} testID="connect-pane">
          {held.gallery}
        </View>
      </InPane.Provider>
    </Pane>
  );
}

/**
 * The card picked in the pane's gallery, for the split's third column (ADR 0284's addendum, point
 * 4): nothing until one is picked, or while no pane holds the pages.
 */
export function useConnectThird(): ReactNode {
  return useContext(HeldContext)?.beside ?? undefined;
}

/** A card's page in the third column: its name on the pane's bar, its × back to the gallery. */
function ConnectThird({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const column = useColumn();
  return (
    <Pane title={title} onClose={onClose} grouped>
      <InPane.Provider value>
        <View style={[column, styles.inPane]} testID="connect-third">
          {children}
        </View>
      </InPane.Provider>
    </Pane>
  );
}

/** Drawn in a pane, whose bar names it: the gallery and a card's page say no title of their own. */
const InPane = createContext(false);

/** Mounted once, inside the window's insets: the sheets, and what the tile and the row read. */
export function ConnectProvider({ children }: { readonly children: ReactNode }) {
  const { paired } = useChips();
  if (paired === undefined) return <>{children}</>;
  // Afresh for each workspace: a switch hands the front over without a frame unpaired (ADR 0197).
  return (
    <Paired
      key={paired.device.deviceId}
      store={paired.store}
      selfId={paired.device.participantId}
      serverUrl={paired.device.serverUrl}
    >
      {children}
    </Paired>
  );
}

type Page =
  | { readonly kind: "gallery" }
  | { readonly kind: "connect"; readonly choice: ConnectChoice }
  | { readonly kind: "arrived"; readonly requestId: string };

const keyOf = (page: Page): string =>
  page.kind === "connect" ? `connect-${choiceKey(page.choice)}` : page.kind;

/**
 * Which card the pane's gallery marks: the one whose page, or whose hello, stands beside it. The
 * sheet's gallery marks none.
 */
function chosenOf(page: Page, made: Made | undefined, inPane: boolean): string | undefined {
  if (!inPane) return undefined;
  if (page.kind === "connect") return choiceKey(page.choice);
  return page.kind === "arrived" ? made?.key : undefined;
}

/** A card's page names it on the third column's bar; the hello says its own words. */
const titleOf = (page: Page): string =>
  page.kind === "connect" ? connectHead(page.choice, false).title : "";

/** A link made here: the request, the link, and the card it was made for. */
interface Made {
  readonly requestId: string;
  readonly link: string;
  readonly key: string;
  readonly choice: ConnectChoice;
}

/** A clock that ticks each second while something counts down, and not otherwise. */
function useSeconds(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function Paired({
  store,
  selfId,
  serverUrl,
  children,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** Where the server is: a link made here starts with it, so its stand-in does too. */
  readonly serverUrl: string | undefined;
  readonly children: ReactNode;
}) {
  const snapshot = useSnapshot(store);
  const demo = useInDemo();
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [up, setUp] = useState(false);
  const [page, setPage] = useState<Page>({ kind: "gallery" });
  const [made, setMade] = useState<Made | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [cards, setCards] = useState<readonly Connector[] | undefined>(undefined);
  const [asking, setAsking] = useState<string | undefined>(undefined);
  // What to do once the sheet has gone: open a room, or the new agent's sheet. One sheet at a time.
  const after = useRef<(() => void) | undefined>(undefined);
  const making = useRef(false);

  const request = made === undefined ? undefined : snapshot.joins?.get(made.requestId);
  const counting = made !== undefined && request !== undefined && request.state !== "redeemed";
  const nowMs = useSeconds(made !== undefined && (up || counting));
  const card =
    request === undefined
      ? undefined
      : joinCardOf(request, snapshot.model, snapshot.directory, nowMs);
  const waiting: Waiting | undefined =
    request !== undefined && linkWaiting(card)
      ? {
          left: linkLeft(request, nowMs),
          share: linkShare(request, nowMs),
          taken: request.state === "redeemed",
        }
      : undefined;
  const waits = waiting !== undefined;

  // The pages, put up: where they were while this phone's link waits, else on the gallery.
  const begin = () => {
    setFailed(undefined);
    setPage(
      waits && made !== undefined ? { kind: "connect", choice: made.choice } : { kind: "gallery" },
    );
    setShown(true);
    setUp(true);
    // The docs' cards, read each time: the docs change, and a server that cannot say keeps the two.
    store.connectors().then(
      (found) => setCards(found),
      () => setCards((was) => was ?? []),
    );
  };
  const beginNow = useRef(begin);
  beginNow.current = begin;

  const open = useCallback(() => {
    if (shown) return;
    tap();
    beginNow.current();
  }, [shown]);

  // A pane beside a list holds the pages instead of the sheet (ADR 0284's addendum): its close is
  // the pages' way out, and letting go of them is the sheet gone.
  const pane = useRef<(() => void) | undefined>(undefined);
  const [inPane, setInPane] = useState(false);
  const gone = useCallback(() => {
    setShown(false);
    setPage({ kind: "gallery" });
    const next = after.current;
    after.current = undefined;
    next?.();
  }, []);
  const hold = useCallback(
    (closePane: () => void) => {
      pane.current = closePane;
      setInPane(true);
      beginNow.current();
      return () => {
        pane.current = undefined;
        setInPane(false);
        setUp(false);
        gone();
      };
    },
    [gone],
  );
  const close = useCallback(() => {
    if (pane.current === undefined) setUp(false);
    else pane.current();
  }, []);

  const makeLink = useCallback(
    async (choice: ConnectChoice) => {
      if (making.current) return;
      making.current = true;
      setFailed(undefined);
      try {
        const answer = await store.makeJoinLink(
          linkStarts(typeof choice === "string" ? undefined : choice),
        );
        setMade({
          requestId: answer.request.requestId,
          link: answer.link,
          key: choiceKey(choice),
          choice,
        });
      } catch (error) {
        setFailed(error instanceof Error ? error.message : "Chips would not make a link.");
      } finally {
        making.current = false;
      }
    },
    [store],
  );

  // The hello, while the connect page is up: the sheet turns to the arrival on its own.
  const hello = card !== undefined && card.done >= 5;
  useEffect(() => {
    if (!up || !hello || made === undefined || page.kind !== "connect") return;
    if (choiceKey(page.choice) !== made.key) return;
    success();
    setPage({ kind: "arrived", requestId: made.requestId });
  }, [up, hello, made, page]);

  const newAgent = useCallback(
    (harnessId: string) => {
      if (shown) {
        after.current = () => setAsking(harnessId);
        close();
        return;
      }
      setAsking(harnessId);
    },
    [shown, close],
  );

  // Cancel link (Arjun, 18 October 2026: "do we have a way to cancel connect your own harness?"):
  // the link is withdrawn, so its harness can no longer use it, and the page is the gallery again.
  const cancelLink = useCallback(async () => {
    if (made === undefined) return;
    await store.denyJoin(made.requestId);
    setMade(undefined);
    setPage({ kind: "gallery" });
  }, [made, store]);

  const goTo = useCallback(
    (roomId: string) => {
      after.current = () => router.push({ pathname: "/spaces/[id]", params: { id: roomId } });
      setMade(undefined);
      close();
    },
    [router, close],
  );

  const value = useMemo(() => ({ open, waiting, newAgent }), [open, waiting, newAgent]);

  const connectPage = (choice: ConnectChoice) => {
    // The demo's workspace lives on this phone: a link made in it leads nowhere (ADR 0213).
    if (demo) return <NotHere choice={choice} onBack={() => setPage({ kind: "gallery" })} />;
    const mine = made !== undefined && made.key === choiceKey(choice) ? made : undefined;
    return (
      <ConnectPage
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        serverUrl={serverUrl}
        choice={choice}
        shown={page.kind === "connect" && choiceKey(page.choice) === choiceKey(choice)}
        made={mine}
        request={mine === undefined ? undefined : snapshot.joins?.get(mine.requestId)}
        nowMs={nowMs}
        failed={failed}
        onMakeLink={() => void makeLink(choice)}
        onCancel={cancelLink}
        onBack={() => setPage({ kind: "gallery" })}
        onNewAgent={newAgent}
      />
    );
  };

  const arrivalPage = (requestId: string) => {
    const arrived = snapshot.joins?.get(requestId);
    if (arrived === undefined) return null;
    return (
      <Arrival
        snapshot={snapshot}
        request={arrived}
        onHello={goTo}
        onDone={() => {
          setMade(undefined);
          close();
        }}
      />
    );
  };

  // Beside a list the gallery stays in the pane and marks the card standing beside it.
  const chosen = chosenOf(page, made, inPane);
  const gallery = (
    <Gallery
      cards={cards}
      here={connectedNames(snapshot.directory)}
      chosen={chosen}
      onPick={(choice) => setPage({ kind: "connect", choice })}
    />
  );

  const render = (now: Page) => {
    switch (now.kind) {
      case "gallery":
        return gallery;
      case "connect":
        return connectPage(now.choice);
      case "arrived":
        return arrivalPage(now.requestId);
    }
  };

  const pages = <SheetPages page={page} keyOf={keyOf} render={render} />;
  const beside =
    inPane && page.kind !== "gallery" ? (
      <ConnectThird
        key={keyOf(page)}
        title={titleOf(page)}
        onClose={() => setPage({ kind: "gallery" })}
      >
        {render(page)}
      </ConnectThird>
    ) : undefined;

  return (
    <ConnectContext.Provider value={value}>
      <HeldContext.Provider value={{ hold, gallery, beside }}>{children}</HeldContext.Provider>
      {shown && !inPane ? (
        <Sheet
          open={up}
          onClose={close}
          onGone={gone}
          sizing="bounded"
          cap={0.9}
          testID="connect-sheet"
        >
          {pages}
        </Sheet>
      ) : null}
      <NewAgentSheet
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        harnessId={asking}
        onClose={() => setAsking(undefined)}
        onMade={(roomId) => router.push({ pathname: "/spaces/[id]", params: { id: roomId } })}
      />
    </ConnectContext.Provider>
  );
}

// ---- The gallery ----------------------------------------------------------------------------

function Gallery({
  cards,
  here,
  chosen,
  onPick,
}: {
  /** The docs' cards; nothing until they are read, when the two ways stand alone a moment. */
  readonly cards: readonly Connector[] | undefined;
  readonly here: ReadonlySet<string>;
  /** The card whose page stands beside the pane, by `choiceKey`: its row is chosen. */
  readonly chosen?: string | undefined;
  readonly onPick: (choice: ConnectChoice) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const inPane = useContext(InPane);
  return (
    <View style={styles.page} testID="connect-gallery">
      {inPane ? null : (
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
          Connect a harness
        </Text>
      )}
      <Text style={[styles.lede, { color: palette.ink2 }]}>
        Pick what runs your agents. You run one line on that computer, and it shows up here.
      </Text>
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.galleryList}>
        {cards === undefined || cards.length === 0 ? null : (
          <View style={[styles.group, { backgroundColor: on.fill }]}>
            {cards.map((card, at) => {
              const connected = here.has(card.name.toLowerCase());
              return (
                <GalleryRow
                  key={card.id}
                  first={at === 0}
                  name={card.name}
                  line={connected ? "Connected here. Tap for another, or a new agent." : card.line}
                  tag={connected ? "Connected" : kindWords(card).words}
                  on={connected}
                  chosen={chosen === choiceKey(card)}
                  face={<Avatar name={card.name} kind="harness" size="md" />}
                  onPress={() => onPick(card)}
                  testID={`connect-card-${card.id}`}
                />
              );
            })}
            {/* Somebody with none of them (ADR 0290): the steps run on a computer, so the site. */}
            {startAnswers(cards).length === 0 ? null : (
              <GalleryRow
                first={false}
                name={NO_AGENT_YET.name}
                line={NO_AGENT_YET.onSite}
                on={false}
                chosen={false}
                face={
                  <Avatar
                    name={NO_AGENT_YET.name}
                    kind="harness"
                    icon={NO_AGENT_YET.face}
                    size="md"
                  />
                }
                go="globe"
                onPress={() => void Linking.openURL(START_PAGE.url).catch(() => undefined)}
                testID="connect-none"
              />
            )}
          </View>
        )}
        {/* "Or" only after the gallery: a server told nowhere, and the demo, have none. */}
        <Text style={[styles.heading, { color: palette.ink3 }]}>
          {cards === undefined || cards.length === 0 ? "Build your own" : "Or build your own"}
        </Text>
        <View style={[styles.group, { backgroundColor: on.fill }]}>
          {CONNECT_WAY_ORDER.map((way, at) => (
            <GalleryRow
              key={way}
              first={at === 0}
              name={CONNECT_WAYS[way].name}
              line={CONNECT_WAYS[way].sub}
              tag={CONNECT_WAYS[way].kind}
              on={false}
              chosen={chosen === choiceKey(way)}
              face={
                <Avatar
                  name={CONNECT_WAYS[way].name}
                  kind="harness"
                  icon={CONNECT_WAYS[way].face}
                  size="md"
                />
              }
              onPress={() => onPick(way)}
              testID={`connect-way-${way}`}
            />
          ))}
        </View>
      </SheetScroll>
    </View>
  );
}

function GalleryRow({
  first,
  name,
  line,
  tag,
  on,
  chosen,
  face,
  go = "next",
  onPress,
  testID,
}: {
  readonly first: boolean;
  readonly name: string;
  readonly line: string;
  /** What it is; none for the row for somebody with no agent yet. */
  readonly tag?: string;
  /** The tag in green: the harness is here already. */
  readonly on: boolean;
  /** Its page stands beside the pane: the row wears the chosen ground, as a list's open row does. */
  readonly chosen: boolean;
  readonly face: ReactNode;
  /** The mark at its end: the next page, or the globe for a row that opens the site. */
  readonly go?: "next" | "globe";
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole={go === "globe" ? "link" : "button"}
      accessibilityLabel={tag === undefined ? name : `${name}, ${tag}`}
      accessibilityHint={line}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.galleryRow,
        pressed || chosen ? { backgroundColor: palette.surface3 } : null,
      ]}
    >
      {first ? null : <View style={[styles.rule, { backgroundColor: palette.line }]} />}
      {face}
      <View style={styles.galleryWords}>
        <View style={styles.nameLine}>
          <Text style={[styles.galleryName, { color: palette.ink }]} numberOfLines={1}>
            {name}
          </Text>
          {tag === undefined ? null : (
            <Text
              style={[
                styles.tag,
                on
                  ? { color: palette.greenInk, backgroundColor: palette.greenSoft }
                  : { color: palette.ink3, backgroundColor: palette.surface3 },
              ]}
            >
              {tag}
            </Text>
          )}
        </View>
        <Text style={[styles.galleryLine, { color: palette.ink3 }]} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Icon name={go} size={16} color={palette.ink4} />
    </Pressable>
  );
}

// ---- The connect page -----------------------------------------------------------------------

function ConnectPage({
  store,
  snapshot,
  selfId,
  serverUrl,
  choice,
  shown,
  made,
  request,
  nowMs,
  failed,
  onMakeLink,
  onCancel,
  onBack,
  onNewAgent,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly serverUrl: string | undefined;
  readonly choice: ConnectChoice;
  /**
   * The page shown, rather than one fading out as the next comes in (`SheetPages` draws both). Only
   * the page shown makes a link: one going away after Cancel link would make another at once.
   */
  readonly shown: boolean;
  /** The link made here for this card, when there is one. */
  readonly made: Made | undefined;
  readonly request: JoinRequest | undefined;
  readonly nowMs: number;
  readonly failed: string | undefined;
  readonly onMakeLink: () => void;
  readonly onCancel: () => Promise<void>;
  readonly onBack: () => void;
  readonly onNewAgent: (harnessId: string) => void;
}) {
  const { directory, model } = snapshot;
  const listed = typeof choice === "string" ? undefined : choice;
  // A card for a harness here already asks first: another of it, or a new agent of it.
  const here = listed === undefined ? undefined : harnessNamed(directory, listed.name);
  const [another, setAnother] = useState(false);
  const asks = here !== undefined && !another && made === undefined;
  // A card with a sentence opens on it: saying a sentence is less than running a line.
  const [saying, setSaying] = useState(listed?.sentence !== undefined);
  // The link is made as the page opens, as the desktop's is; a stalled one stays to say why.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once a page has what it needs.
  useEffect(() => {
    if (shown && !asks && made === undefined) onMakeLink();
  }, [shown, asks, made === undefined]);
  const head = connectHead(choice, saying);
  // In the third column the pane's bar names it, and its × is the way back (ADR 0284's addendum).
  const inPane = useContext(InPane);
  return (
    <View style={styles.page} testID="connect-page">
      {inPane ? null : <PageBack title={head.title} onBack={onBack} testID="connect-back" />}
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.connectList}>
        <Who choice={choice} saying={saying} here={asks} />
        {asks && here !== undefined ? (
          <HereAlready
            name={nameOf(directory, here)}
            mayAsk={mayAskFromPage(model, directory, selfId, here)}
            onNewAgent={() => onNewAgent(here)}
            onAnother={() => setAnother(true)}
          />
        ) : (
          <Linked
            store={store}
            snapshot={snapshot}
            serverUrl={serverUrl}
            choice={choice}
            made={made}
            request={request}
            nowMs={nowMs}
            failed={failed}
            saying={saying}
            onSaying={setSaying}
            onRenew={onMakeLink}
            onCancel={onCancel}
          />
        )}
      </SheetScroll>
    </View>
  );
}

/**
 * The page once a link is being made: how it connects, the line, and the link followed. It has its
 * shape from its first frame: until the link and its request are back, a stand-in holds the line's
 * place and the steps stand with the first under way, so the page does not grow in two jumps a few
 * frames apart, which the sheet's glide chased (down, then back up) on every card.
 */
function Linked({
  store,
  snapshot,
  serverUrl,
  choice,
  made,
  request,
  nowMs,
  failed,
  saying,
  onSaying,
  onRenew,
  onCancel,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly serverUrl: string | undefined;
  readonly choice: ConnectChoice;
  readonly made: Made | undefined;
  readonly request: JoinRequest | undefined;
  readonly nowMs: number;
  readonly failed: string | undefined;
  readonly saying: boolean;
  readonly onSaying: (saying: boolean) => void;
  readonly onRenew: () => void;
  readonly onCancel: () => Promise<void>;
}) {
  const listed = typeof choice === "string" ? undefined : choice;
  const coming = made === undefined ? failed === undefined : request === undefined;
  return (
    <>
      {listed?.sentence !== undefined && listed.command !== undefined ? (
        <HowItConnects name={listed.name} saying={saying} onSaying={onSaying} />
      ) : null}
      <Line
        text={made === undefined ? undefined : copyOf(choice, made.link, saying)}
        standIn={copyOf(choice, linkStandIn(serverUrl), saying)}
        failed={made === undefined ? failed : undefined}
        prose={saying && listed?.sentence !== undefined}
        run={runsInTerminal(choice, saying)}
        note={`${HANDOFF_NOTE} ${connectNote(choice, made?.link)}`}
      />
      {coming ? (
        <>
          <Steps steps={makingSteps(connectingName(undefined, choice))} />
          <MayDo store={store} request={undefined} starts={linkStarts(listed)} />
          <CancelLink onCancel={onCancel} disabled={made === undefined} />
        </>
      ) : made === undefined || request === undefined ? null : (
        <Progress
          store={store}
          snapshot={snapshot}
          request={request}
          name={connectingName(request, choice)}
          nowMs={nowMs}
          onRenew={onRenew}
          onCancel={onCancel}
        />
      )}
    </>
  );
}

/**
 * The card's face, where to run its line, and the card's own line under it. On a card for a harness
 * here already, which asks first and has no line to run, its name.
 */
/** In the demo, a card's page: who it is, and that it is not in the demo, where its link would be. */
function NotHere({
  choice,
  onBack,
}: {
  readonly choice: ConnectChoice;
  readonly onBack: () => void;
}) {
  const inPane = useContext(InPane);
  return (
    <View style={styles.page} testID="connect-page">
      {inPane ? null : (
        <PageBack title={connectHead(choice, false).title} onBack={onBack} testID="connect-back" />
      )}
      <Who choice={choice} saying={false} here={false} />
      <NotInDemo />
    </View>
  );
}

function Who({
  choice,
  saying,
  here,
}: {
  readonly choice: ConnectChoice;
  readonly saying: boolean;
  readonly here: boolean;
}) {
  const palette = usePalette();
  const head = connectHead(choice, saying);
  return (
    <View style={styles.who}>
      <Avatar name={head.name} kind="harness" icon={head.face} size="row" decorative />
      <View style={styles.whoWords}>
        <Text style={[styles.whoSays, { color: palette.ink }]}>{here ? head.name : head.sub}</Text>
        {typeof choice === "string" ? null : (
          <Text style={[styles.whoLine, { color: palette.ink3 }]}>{choice.line}</Text>
        )}
      </View>
    </View>
  );
}

/** A card with a sentence and a line: say it to the harness, or run it yourself. */
function HowItConnects({
  name,
  saying,
  onSaying,
}: {
  readonly name: string;
  readonly saying: boolean;
  readonly onSaying: (saying: boolean) => void;
}) {
  return (
    <View style={styles.segment}>
      <Segmented
        label="How it connects"
        options={[
          { value: "ask", label: `Ask ${name}` },
          { value: "run", label: "Run a line" },
        ]}
        chosen={saying ? "ask" : "run"}
        onChoose={(value) => onSaying(value === "ask")}
        testID="connect-how"
      />
    </View>
  );
}

/** The link followed: its steps, where it stopped and the fix, and what it may do until used. */
function Progress({
  store,
  snapshot,
  request,
  name,
  nowMs,
  onRenew,
  onCancel,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly request: JoinRequest;
  readonly name: string;
  readonly nowMs: number;
  readonly onRenew: () => void;
  readonly onCancel: () => Promise<void>;
}) {
  const card = joinCardOf(request, snapshot.model, snapshot.directory, nowMs);
  const stall = card.stall;
  return (
    <>
      <Steps steps={connectSteps(request, card, name, nowMs)} />
      {stall === undefined ? (
        <>
          <MayDo store={store} request={request} starts={request.capabilities} />
          {request.state === "allowed" ? <CancelLink onCancel={onCancel} /> : null}
        </>
      ) : (
        <Stall
          says={stallWords(stall, name)}
          renews={stall.kind === "expired" || stall.kind === "denied" || stall.kind === "revoked"}
          onRenew={onRenew}
        />
      )}
    </>
  );
}

/**
 * Cancel link, while the link waits to be used: withdrawn, its harness can no longer use it. Put
 * away, the sheet leaves it waiting; this is the way to say it is not wanted.
 */
function CancelLink({
  onCancel,
  disabled = false,
}: {
  readonly onCancel: () => Promise<void>;
  /** Nothing to cancel yet: the link is still being made. It stands, so the page keeps its height. */
  readonly disabled?: boolean;
}) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancel = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onCancel();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <View testID="connect-cancel">
      <Button
        label={CANCEL_LINK.label}
        variant="plain"
        busy={busy}
        disabled={disabled}
        onPress={() => void cancel()}
        style={styles.cancel}
      />
      {failed ? (
        <Text style={[styles.copied, { color: palette.redInk }]}>{CANCEL_LINK.failed}</Text>
      ) : null}
    </View>
  );
}

/** A card for a harness here already: a new agent of it, or connect another. */
function HereAlready({
  name,
  mayAsk,
  onNewAgent,
  onAnother,
}: {
  readonly name: string;
  readonly mayAsk: boolean;
  readonly onNewAgent: () => void;
  readonly onAnother: () => void;
}) {
  const palette = usePalette();
  const words = hereAlreadyWords(name, mayAsk);
  return (
    <View testID="connect-here-already">
      <View style={[styles.note, { backgroundColor: palette.greenSoft }]}>
        <Icon name="check" size={18} color={palette.greenInk} />
        <Text style={[styles.noteWords, { color: palette.ink }]}>{words.note}</Text>
      </View>
      {mayAsk ? (
        <Button
          label={words.newAgent}
          icon="plus"
          variant="gold"
          onPress={onNewAgent}
          style={styles.wide}
        />
      ) : null}
      <Button
        label={words.another}
        variant={mayAsk ? "default" : "gold"}
        onPress={onAnother}
        style={styles.wide}
      />
    </View>
  );
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * The line to run, or the sentence to say, with Copy first and Send… beside it, and the note under
 * them. A line to run says Run in Terminal over it, in its box (ADR 0257). The note stays as it is
 * when Copy is pressed, which says Copied itself, so the page keeps its height.
 */
function Line({
  text,
  standIn,
  failed,
  prose,
  run,
  note,
}: {
  /** Nothing while the link is being made. */
  readonly text: string | undefined;
  /** The line as it will be, unseen under "Making a link…", so the box is already its height. */
  readonly standIn: string;
  readonly failed: string | undefined;
  /** A sentence, set as words rather than code. */
  readonly prose: boolean;
  /** A line the person runs in a terminal. */
  readonly run: boolean;
  /** How it reaches the computer, how long the link lasts, and what else it needs. */
  readonly note: string;
}) {
  const palette = usePalette();
  const on = useGround();
  const [copied, setCopied] = useState(false);
  // A new line has not been copied.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the line changes.
  useEffect(() => setCopied(false), [text]);
  const copy = async () => {
    if (text === undefined) return;
    await Clipboard.setStringAsync(text);
    success();
    setCopied(true);
  };
  return (
    <>
      <View
        style={[styles.box, { backgroundColor: on.fill, borderColor: palette.line }]}
        testID="connect-line"
      >
        {run ? <RunHead /> : null}
        {text === undefined ? (
          <Making standIn={standIn} failed={failed} prose={prose} />
        ) : (
          <Text
            selectable
            style={[prose ? styles.prose : styles.code, { color: palette.ink }]}
            testID="connect-line-words"
          >
            {text}
          </Text>
        )}
      </View>
      <View style={styles.buttons}>
        <Button
          label={copied ? "Copied" : "Copy"}
          icon={copied ? "check" : "copy"}
          variant="gold"
          grow
          disabled={text === undefined}
          onPress={() => void copy()}
        />
        <Button
          label="Send…"
          icon="share"
          grow
          disabled={text === undefined}
          onPress={() => {
            if (text !== undefined) void shareText(text).catch(() => undefined);
          }}
        />
      </View>
      <Text style={[styles.under, { color: palette.ink3 }]} testID="connect-note">
        {note}
      </Text>
    </>
  );
}

/** Over a line to run, in its box: what to do with it (ADR 0257). */
function RunHead() {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={[styles.runHead, { borderBottomColor: palette.line }]} testID="connect-line-run">
      <View
        style={[styles.runMark, { backgroundColor: on.pressed }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.runMarkWords, { color: palette.ink2 }]}>{">_"}</Text>
      </View>
      <Text style={[styles.runWords, { color: palette.ink2 }]}>{RUN_IN_TERMINAL}</Text>
    </View>
  );
}

/**
 * The box while the link is being made: "Making a link…" over the line as it will be, unseen, so
 * the box is the real line's height already; or why no link was made.
 */
function Making({
  standIn,
  failed,
  prose,
}: {
  readonly standIn: string;
  readonly failed: string | undefined;
  readonly prose: boolean;
}) {
  const palette = usePalette();
  if (failed !== undefined) {
    return (
      <View style={styles.making}>
        <Text style={[styles.makingWords, { color: palette.ink3 }]}>{failed}</Text>
      </View>
    );
  }
  return (
    <View>
      <Text
        style={[prose ? styles.prose : styles.code, styles.unseen]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="connect-line-stand-in"
      >
        {standIn}
      </Text>
      <View style={[styles.making, styles.over]}>
        <ActivityIndicator size="small" color={palette.ink3} />
        <Text style={[styles.makingWords, { color: palette.ink3 }]}>Making a link…</Text>
      </View>
    </View>
  );
}

/** The link followed in three steps (`connectSteps`). */
function Steps({ steps }: { readonly steps: readonly ConnectStep[] }) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={[styles.group, { backgroundColor: on.fill }]} testID="connect-steps">
      {steps.map((step, at) => (
        <View
          key={step.key}
          style={styles.step}
          testID={`connect-step-${step.key}`}
          accessibilityLabel={`${step.label}, ${step.detail}`}
          accessibilityState={{ checked: step.state === "done", busy: step.state === "now" }}
        >
          {at === 0 ? null : <View style={[styles.rule, { backgroundColor: palette.line }]} />}
          <Dot state={step.state} />
          <View style={styles.stepWords}>
            <Text style={[styles.stepLabel, { color: palette.ink }]}>{step.label}</Text>
            <Text style={[styles.stepDetail, { color: palette.ink3 }]}>{step.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** A step's mark: a tick that springs in once done, a spinner while under way, a ring to come. */
function Dot({ state }: { readonly state: ConnectStep["state"] }) {
  const palette = usePalette();
  const less = useReduceMotion();
  const done = state === "done";
  const grow = useRef(new Animated.Value(done ? 1 : 0)).current;
  useEffect(() => {
    if (!done) {
      grow.setValue(0);
      return;
    }
    if (less) {
      grow.setValue(1);
      return;
    }
    Animated.spring(grow, {
      toValue: 1,
      stiffness: 420,
      damping: 18,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [done, less, grow]);
  if (state === "now") {
    return (
      <View style={[styles.dot, { borderColor: palette.line2 }]}>
        <ActivityIndicator size="small" color={palette.blue} />
      </View>
    );
  }
  if (!done) return <View style={[styles.dot, { borderColor: palette.line2 }]} />;
  return (
    <Animated.View
      style={[
        styles.dot,
        styles.tick,
        {
          backgroundColor: palette.green,
          borderColor: palette.green,
          transform: [{ scale: grow }],
        },
      ]}
    >
      <Icon name="check" size={13} color="#ffffff" />
    </Animated.View>
  );
}

/** Where the link stopped, in its own words, and the one thing to do. */
function Stall({
  says,
  renews,
  onRenew,
}: {
  readonly says: { readonly says: string; readonly doing: string };
  readonly renews: boolean;
  readonly onRenew: () => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={[styles.note, styles.stall, { backgroundColor: palette.amberSoft }]}
      testID="connect-stall"
    >
      <Text style={[styles.noteWords, { color: palette.ink }]}>{says.says}</Text>
      {renews ? (
        <Button label={says.doing} variant="gold" onPress={onRenew} style={styles.renew} />
      ) : (
        <Text style={[styles.noteWords, { color: palette.ink2 }]}>{says.doing}.</Text>
      )}
    </View>
  );
}

/**
 * What it may do: folded under a row, its switches change the link's grant until it is used. Before
 * the link is back it says what the link is being made with, its switches still.
 */
function MayDo({
  store,
  request,
  starts,
}: {
  readonly store: Store;
  readonly request: JoinRequest | undefined;
  /** What it may do as things stand: the request's grant, or what its link is being made with. */
  readonly starts: readonly string[];
}) {
  const palette = usePalette();
  const ground = useGround();
  const less = useReduceMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const can = request?.state === "allowed";
  const on = starts;
  // One chevron, turning over as the fold opens and back as it shuts.
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = open ? 1 : 0;
    if (less) {
      turn.setValue(to);
      return;
    }
    Animated.timing(turn, {
      toValue: to,
      duration: FOLD_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, less, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const flip = async (name: string, value: boolean) => {
    if (request === undefined) return;
    setBusy(true);
    try {
      await store.allowJoin(
        request.requestId,
        value ? [...on, name] : on.filter((each) => each !== name),
      );
    } catch {
      // The switch stays where the server left it.
    } finally {
      setBusy(false);
    }
  };
  const said = OFFERED.filter((name) => on.includes(name)).map(
    (name) => capabilityWords(name).label,
  );
  return (
    <View style={[styles.group, styles.may, { backgroundColor: ground.fill }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.mayHead}
        testID="connect-may"
      >
        <Text style={[styles.mayWords, { color: palette.ink }]}>What it may do</Text>
        <Text style={[styles.maySays, { color: palette.ink3 }]} numberOfLines={1}>
          {open ? "" : said.length === 0 ? "Nothing yet" : said.join(", ")}
        </Text>
        <Animated.View style={{ transform: [{ rotate }] }} testID="connect-may-chevron">
          <Icon name="down" size={16} color={palette.ink4} />
        </Animated.View>
      </Pressable>
      {open
        ? OFFERED.map((name) => {
            const words = capabilityWords(name);
            return (
              <View key={name} style={styles.switchRow} testID={`connect-cap-${name}`}>
                <View style={[styles.rule, { backgroundColor: palette.line }]} />
                <View style={styles.stepWords}>
                  <Text style={[styles.stepLabel, { color: palette.ink }]}>{words.label}</Text>
                  {words.detail === undefined ? null : (
                    <Text style={[styles.stepDetail, { color: palette.ink3 }]}>{words.detail}</Text>
                  )}
                </View>
                <Switch
                  value={on.includes(name)}
                  disabled={!can || busy}
                  accessibilityLabel={words.label}
                  onValueChange={(value) => void flip(name, value)}
                />
              </View>
            );
          })
        : null}
    </View>
  );
}

// ---- The arrival ----------------------------------------------------------------------------

/** How long the face wears its working pins once it has landed. */
const SWEEP_MS = 1600;
/**
 * When the words and the Main agent's face come in: as the face first reaches its place, on its
 * spring's first swing. Not when that spring is still, which with its give is near a second on.
 */
export const LANDED_MS = 220;
/** How long the fold's chevron takes to turn over. */
const FOLD_MS = 200;

function Arrival({
  snapshot,
  request,
  onHello,
  onDone,
}: {
  readonly snapshot: Snapshot;
  readonly request: JoinRequest;
  readonly onHello: (roomId: string) => void;
  readonly onDone: () => void;
}) {
  const palette = usePalette();
  const less = useReduceMotion();
  const { directory } = snapshot;
  const words = arrivalWords(request, directory);
  const name = words.harnessId === undefined ? words.title : nameOf(directory, words.harnessId);
  const land = useRef(new Animated.Value(less ? 1 : 0)).current;
  const agent = useRef(new Animated.Value(less ? 1 : 0)).current;
  const say = useRef(new Animated.Value(less ? 1 : 0)).current;
  const [sweeping, setSweeping] = useState(!less);
  useEffect(() => {
    if (less) return;
    Animated.parallel([
      Animated.spring(land, {
        toValue: 1,
        stiffness: 260,
        damping: 16,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(LANDED_MS),
        Animated.parallel([
          Animated.spring(agent, {
            toValue: 1,
            stiffness: 380,
            damping: 15,
            mass: 1,
            useNativeDriver: true,
          }),
          Animated.timing(say, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
    const stop = setTimeout(() => setSweeping(false), SWEEP_MS);
    return () => clearTimeout(stop);
  }, [less, land, agent, say]);
  const rise = say.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <View style={[styles.page, styles.arrive]} testID="connect-arrival">
      <View style={styles.faces}>
        <Animated.View
          style={{
            opacity: land.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateY: land.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) },
              { scale: land.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ],
          }}
        >
          <Avatar name={name} kind="harness" size="profile" busy={sweeping} decorative />
        </Animated.View>
        {words.mainAgentId === undefined ? null : (
          <Animated.View
            style={[
              styles.agentFace,
              { backgroundColor: palette.surface, transform: [{ scale: agent }] },
            ]}
          >
            <Avatar
              name={nameOf(directory, words.mainAgentId)}
              {...faceProps(directory, words.mainAgentId)}
              size="row"
              decorative
            />
          </Animated.View>
        )}
      </View>
      <Animated.View
        style={{ opacity: say, transform: [{ translateY: rise }] }}
        testID="connect-arrival-words"
      >
        <Text accessibilityRole="header" style={[styles.arriveTitle, { color: palette.ink }]}>
          {words.title}
        </Text>
        <Text style={[styles.arriveLine, { color: palette.ink2 }]}>{words.line}</Text>
      </Animated.View>
      <View style={styles.arriveButtons}>
        {words.roomId === undefined ? null : (
          <Button
            label="Say hello"
            variant="gold"
            onPress={() => {
              if (words.roomId !== undefined) onHello(words.roomId);
            }}
            style={styles.wide}
          />
        )}
        <Button label="Done" onPress={onDone} style={styles.wide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A page is a column the sheet bounds, and its list is what gives: it scrolls in what is left.
  page: { flexShrink: 1, minHeight: 0 },
  // In a pane, the pages fill what is under its bar, and their lists scroll in it, with the sheet's
  // own margins either side (`Sheet`'s panel), or the words stood at the pane's very edge.
  inPane: { flex: 1, minHeight: 0, paddingTop: SPACE.sm, paddingHorizontal: SPACE.lg },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  title: {
    fontSize: TEXT.xl + 2,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: SPACE.xs,
    // Short of the sheet's X, at the right of this line (ADR 0169).
    marginRight: CLOSE_ROOM,
  },
  lede: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, marginTop: SPACE.xs },
  galleryList: { paddingTop: SPACE.lg, paddingBottom: SPACE.lg },
  group: { borderRadius: RADIUS.xxl, overflow: "hidden" },
  rule: { position: "absolute", top: 0, left: 60, right: 0, height: StyleSheet.hairlineWidth },
  galleryRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
  },
  galleryWords: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  galleryName: { fontSize: TEXT.md + 1, fontWeight: "600", flexShrink: 1 },
  tag: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  galleryLine: { fontSize: TEXT.sm },
  heading: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: SPACE.xl,
    marginBottom: SPACE.sm,
    marginHorizontal: SPACE.md,
  },
  connectList: { paddingBottom: SPACE.lg },
  who: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginTop: SPACE.sm },
  whoWords: { flex: 1, gap: 2 },
  whoSays: { fontSize: TEXT.md + 1, fontWeight: "600", lineHeight: (TEXT.md + 1) * 1.3 },
  whoLine: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.35 },
  segment: { marginTop: SPACE.lg },
  box: {
    marginTop: SPACE.lg,
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: SPACE.md,
    minHeight: 64,
    justifyContent: "center",
  },
  code: { fontFamily: MONO, fontSize: 13, lineHeight: 19 },
  runHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingBottom: SPACE.sm,
    marginBottom: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  runMark: {
    width: 22,
    height: 18,
    borderRadius: RADIUS.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  runMarkWords: { fontFamily: MONO, fontSize: 10, fontWeight: "700" },
  runWords: { fontSize: TEXT.sm, fontWeight: "600" },
  prose: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  making: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  // "Making a link…" over the unseen stand-in, at the middle of the box's height.
  over: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  unseen: { opacity: 0 },
  makingWords: { fontSize: TEXT.md },
  buttons: { flexDirection: "row", gap: SPACE.sm + 2, marginTop: SPACE.md },
  copied: { fontSize: TEXT.sm, textAlign: "center", marginTop: SPACE.sm, marginBottom: SPACE.lg },
  // The note under Copy and Send…, a few lines long: set as a paragraph, not centred.
  under: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    marginTop: SPACE.sm,
    marginBottom: SPACE.lg,
    marginHorizontal: SPACE.xs,
  },
  step: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: SPACE.sm,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { borderWidth: 0 },
  stepWords: { flex: 1, minWidth: 0, gap: 1 },
  stepLabel: { fontSize: TEXT.md, fontWeight: "600" },
  stepDetail: { fontSize: TEXT.sm },
  note: {
    flexDirection: "row",
    gap: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.xl,
    marginTop: SPACE.lg,
    alignItems: "flex-start",
  },
  noteWords: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  stall: { flexDirection: "column", alignItems: "stretch", marginTop: SPACE.md },
  renew: { alignSelf: "flex-start", marginTop: SPACE.xs },
  wide: { marginTop: SPACE.md },
  may: { marginTop: SPACE.md },
  cancel: { alignSelf: "center", marginTop: SPACE.sm },
  mayHead: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md + 2,
  },
  mayWords: { fontSize: TEXT.md, fontWeight: "600" },
  maySays: { flex: 1, textAlign: "right", fontSize: TEXT.sm },
  switchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: SPACE.sm,
  },
  arrive: { alignItems: "stretch", paddingTop: SPACE.xxl },
  faces: { alignSelf: "center", width: 88, height: 88, marginTop: SPACE.lg },
  agentFace: { position: "absolute", right: -22, bottom: -14, borderRadius: 32, padding: 3 },
  arriveTitle: {
    fontSize: TEXT.xl + 6,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
    marginTop: SPACE.xxl + SPACE.sm,
  },
  arriveLine: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    textAlign: "center",
    marginTop: SPACE.sm,
    marginHorizontal: SPACE.lg,
  },
  arriveButtons: { marginTop: SPACE.xl, marginBottom: SPACE.lg },
});
