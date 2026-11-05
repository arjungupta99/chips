/**
 * A new space from the + (`docs/proposals/new-space.md`, Phase 3): who may be asked, the window's
 * state, the draft it keeps, and the send.
 *
 * A person names a room and picks who is in it: one or more harnesses that take new spaces (the
 * OpenClaw test, finding 27), or Empty, nobody (ADR 0148). The window opens on whoever was asked
 * last, and the first tap on a face chooses; the taps after it add and take away (`newSpacePicks` in
 * core, ADR 0084). The room is made on the send and not on the tap: `space.created` by its name,
 * asked of the first picked, and each picked added. One harness makes a direct room and several a
 * group. Nothing is said in it (ADR 0149): each harness makes its agent on the person's first
 * message there, which goes to all of them (ADR 0081), and until then the room asks what they would
 * like to do. The harness's claim keeps the person's name. It is made the moment the window has
 * covered the list, a quarter of a second after the send, so the list is never seen taking the new
 * room in behind the glass.
 *
 * The window is drawn over everything, the room's screen included (`Window.tsx`), because on a
 * send the room is pushed under it with no transition of its own: the window fills the screen and
 * dissolves into the room once the room says it has drawn itself (`useDrawnUnderWindow`), so it
 * goes into the room and not into a page still being built. An Empty room opens on its Add once
 * the window has gone.
 *
 * With several picked, the first leads; a tap on its name in the line under the faces hands the
 * lead to the next one picked (`newSpaceNextLead`, ADR 0149's addendum).
 */

import {
  EMPTY_ROOM,
  heldNamesFor,
  newSpaceEmpty,
  newSpaceHarnesses,
  newSpaceNextLead,
  newSpacePicked,
  newSpacePickIds,
  newSpacePicks,
  type Participant,
  type Store,
} from "@chipschat/core";
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
  useSyncExternalStore,
} from "react";
import { useChips } from "../store/provider";
import type { SheetFrom } from "../ui/beside";
import { lift, tap } from "../ui/haptics";
import type { Rect } from "./geometry";
import { lastAsked, remember, rememberAsked, remembered } from "./remembered";
import { type Stage, Window } from "./Window";

interface NewSpace {
  /** Who may be asked, by name. None, and the room it makes is empty. */
  readonly harnesses: readonly Participant[];
  /**
   * Open the window out of the + at `from`, in the window's own points; given the + itself, the
   * window follows it when the window turns.
   */
  readonly open: (from: Rect, plus?: SheetFrom) => void;
}

const NONE: NewSpace = { harnesses: [], open: () => undefined };
const NewSpaceContext = createContext<NewSpace>(NONE);

/** The room a send made, while the window that made it is still over it, and how it says it has drawn. */
interface Under {
  readonly spaceId: string | undefined;
  readonly drawn: (spaceId: string) => void;
}
const NOBODY_UNDER: Under = { spaceId: undefined, drawn: () => undefined };
const UnderContext = createContext<Under>(NOBODY_UNDER);

/**
 * How long the window over a new room waits for it to say it has drawn before it goes into it
 * anyway: a room that never says so is never hidden for good. The simulator's took six tenths of a
 * second from being opened to being drawn (11 October 2026).
 */
const DRAWN_WAIT_MS = 1500;

export function useNewSpace(): NewSpace {
  return useContext(NewSpaceContext);
}

/** Whether this room is still under the window that made it: its Add waits for it to go. */
export function useUnderWindow(spaceId: string | undefined): boolean {
  const under = useContext(UnderContext);
  return under.spaceId !== undefined && under.spaceId === spaceId;
}

/**
 * What a room calls once it has drawn itself (`app/spaces/[id].tsx`: its list laid out, and a frame
 * on), so the window over it dissolves into the room and not into a blank page that the room then
 * appears on all at once (the simulator, 11 October 2026). Nothing, for any other room.
 */
export function useDrawnUnderWindow(spaceId: string | undefined): () => void {
  const { drawn } = useContext(UnderContext);
  return useCallback(() => {
    if (spaceId !== undefined) drawn(spaceId);
  }, [drawn, spaceId]);
}

/**
 * Who may be asked: the directory's word once it has been read, and until then what it said last
 * time (`remembered.ts`), so a launch draws the + at once. The directory is empty until it has
 * been read and never after, since it holds at least the person reading it.
 */
function useHarnesses(store: Store, workspaceId: string): readonly Participant[] {
  // The directory alone, which is the same object until it is read again: the whole snapshot drew
  // this provider at every word the store heard.
  const directory = useSyncExternalStore(store.subscribe, () => store.getSnapshot().directory);
  const read = Object.keys(directory).length > 0;
  const harnesses = useMemo(
    () => (read ? newSpaceHarnesses(directory) : remembered(workspaceId)),
    [read, directory, workspaceId],
  );
  useEffect(() => {
    if (read) remember(workspaceId, harnesses);
  }, [read, harnesses, workspaceId]);
  return harnesses;
}

export function NewSpaceProvider({ children }: { readonly children: ReactNode }) {
  const { paired } = useChips();
  if (paired === undefined) return <>{children}</>;
  // Afresh for each workspace: a switch hands the front over without a frame unpaired (ADR 0197).
  return (
    <Paired
      key={paired.device.deviceId}
      store={paired.store}
      workspaceId={paired.device.workspaceId}
      selfId={paired.device.participantId}
    >
      {children}
    </Paired>
  );
}

function Paired({
  store,
  workspaceId,
  selfId,
  children,
}: {
  readonly store: Store;
  readonly workspaceId: string;
  /** The person making rooms, whose name the agents' first names keep a letter apart from. */
  readonly selfId: string;
  readonly children: ReactNode;
}) {
  const harnesses = useHarnesses(store, workspaceId);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [plus, setPlus] = useState<SheetFrom | undefined>(undefined);
  // What was typed and not sent: kept when the window folds away, and there the next time.
  const [draft, setDraft] = useState("");
  // Nothing tapped yet: the window's own pick, whoever was asked last.
  const [chosen, setChosen] = useState<readonly string[] | undefined>(undefined);
  // Read each render: a send writes it, and the render that clears the window reads it back.
  const last = lastAsked(workspaceId);
  const picked = useMemo(() => newSpacePicked(harnesses, chosen, last), [harnesses, chosen, last]);
  // Nobody asked: the room is made empty, by its name (ADR 0148).
  const empty = newSpaceEmpty(harnesses, chosen, last);
  // The first tap chooses; the taps after it add and take away (ADR 0084). Empty is never beside
  // a face.
  const choose = useCallback(
    (harnessId: string) =>
      setChosen(newSpacePicks(newSpacePickIds(picked, empty), chosen !== undefined, harnessId)),
    [picked, empty, chosen],
  );
  // The lead's name tapped: the next one picked leads, and the faces stay as they are.
  const handOn = useCallback(
    () => setChosen(newSpaceNextLead(picked.map((each) => each.id))),
    [picked],
  );
  const [under, setUnder] = useState<string | undefined>(undefined);
  // The room under the window has drawn itself, or has been waited for long enough.
  const [drawn, setDrawn] = useState(false);
  const waited = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  // Sent and not yet made, until the window has covered the list: its name, and who is in it, the
  // first asked; nobody for an empty room.
  const asking = useRef<
    { readonly title: string; readonly harnessIds: readonly string[] } | undefined
  >(undefined);
  const sent = useRef<string | undefined>(undefined);

  const open = useCallback((from: Rect, at?: SheetFrom) => {
    if (busy.current) return;
    busy.current = true;
    tap();
    setPlus(at);
    setStage({ kind: "open", from });
  }, []);

  const close = useCallback(() => {
    setStage((now) => (now.kind === "open" ? { kind: "closing", from: now.from } : now));
  }, []);

  const send = useCallback(
    (typed: string) => {
      const text = typed.trim();
      if (text === "" || (picked.length === 0 && !empty) || stage.kind !== "open") return;
      lift();
      // A name is one line, as a rename's is.
      asking.current = {
        title: text.replace(/\s+/g, " "),
        harnessIds: empty ? [] : picked.map((each) => each.id),
      };
      setStage({ kind: "sending", from: stage.from });
    },
    [picked, empty, stage],
  );

  // The room is made once the window has covered the screen, and opened under it with no
  // transition of its own: the window is the transition, and the list it leaves is never seen
  // to go, or to take the new room in.
  const covered = useCallback(() => {
    const ask = asking.current;
    if (ask === undefined) return;
    asking.current = undefined;
    const first = ask.harnessIds[0];
    rememberAsked(workspaceId, first ?? EMPTY_ROOM);
    const spaceId = makeRoom(store, selfId, ask);
    sent.current = spaceId;
    setDrawn(false);
    setUnder(spaceId);
    clearTimeout(waited.current);
    waited.current = setTimeout(() => setDrawn(true), DRAWN_WAIT_MS);
    router.push({
      pathname: "/spaces/[id]",
      params: { id: spaceId, via: "new", ...(first === undefined ? { add: "1" } : {}) },
    });
  }, [router, store, workspaceId, selfId]);

  // The room says it has drawn: the window can go into it.
  const roomDrawn = useCallback((spaceId: string) => {
    if (spaceId === sent.current) setDrawn(true);
  }, []);
  const underValue = useMemo(() => ({ spaceId: under, drawn: roomDrawn }), [under, roomDrawn]);
  useEffect(() => () => clearTimeout(waited.current), []);

  // The window has dissolved into the room: it lifts off.
  const revealed = useCallback(() => {
    setStage((now) => (now.kind === "sending" ? { ...now, kind: "lifting" } : now));
  }, []);

  const done = useCallback(() => {
    busy.current = false;
    // Sent, the words and the pick are the room's now; folded away unsent, they are the next
    // window's, as they were left.
    if (sent.current !== undefined) {
      setDraft("");
      setChosen(undefined);
    }
    sent.current = undefined;
    clearTimeout(waited.current);
    setDrawn(false);
    setUnder(undefined);
    setStage({ kind: "closed" });
  }, []);

  const value = useMemo(() => ({ harnesses, open }), [harnesses, open]);

  return (
    <NewSpaceContext.Provider value={value}>
      <UnderContext.Provider value={underValue}>{children}</UnderContext.Provider>
      {stage.kind === "closed" ? null : (
        <Window
          stage={stage}
          plus={plus}
          harnesses={harnesses}
          picked={picked}
          empty={empty}
          onChoose={choose}
          onLead={handOn}
          draft={draft}
          onDraft={setDraft}
          onClose={close}
          onSend={send}
          onCovered={covered}
          drawn={drawn}
          onRevealed={revealed}
          onDone={done}
        />
      )}
    </NewSpaceContext.Provider>
  );
}

/**
 * The room the + asked for, by its name: a room of the person alone, which opens on its Add (ADR
 * 0148); or one asked of each face picked, each in it to make an agent of its own on the person's
 * first message there (ADR 0087, ADR 0149). Nothing is said in it.
 */
function makeRoom(
  store: Store,
  selfId: string,
  ask: { readonly title: string; readonly harnessIds: readonly string[] },
): string {
  const [first, ...others] = ask.harnessIds;
  if (first === undefined) return store.createSpace({ title: ask.title });
  // A first name for each one's agent, held by the room from the start (ADR 0150), so it is
  // drawn with them and they keep them.
  const { directory, model } = store.getSnapshot();
  const self = directory[selfId]?.displayName;
  const names = heldNamesFor(
    ask.harnessIds,
    directory,
    model.spaces,
    self === undefined ? [] : [self],
  );
  const spaceId = store.createSpace({
    kind: others.length === 0 ? "direct" : "group",
    askedOf: first,
    ...(others.length === 0 ? {} : { alsoAskedOf: others }),
    title: ask.title,
  });
  for (const harnessId of ask.harnessIds) {
    store.addMember({
      spaceId,
      participantId: harnessId,
      kind: "harness",
      agentName: names[harnessId],
    });
  }
  return spaceId;
}
