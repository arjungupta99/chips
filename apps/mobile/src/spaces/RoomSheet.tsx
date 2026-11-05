/**
 * Who is in a room, and adding somebody to it (ADR 0087, Phase 4, the room sheet Arjun picked as
 * option A, 30 September 2026). It opens from the title capsule, in `ConfirmSheet`'s shape, with
 * pages inside it:
 *
 * - **The first page** (ADR 0202, Arjun's B, 18 October 2026: "more cooler and organized"): the
 *   room's face beside its name at the head, then who is here, then one Media & files card and the
 *   room's settings as tiles, two to a row (`RoomTiles.tsx`). The head stays put and everything
 *   under it is one scroll (ADR 0202's addendum of 23 October 2026), so the member list is laid out
 *   whole and never gives its height to the tiles: three rows show before anything is scrolled.
 * - **Who is here.** The room's agents, each with its harness under its name, the ones an archive
 *   took out that are in another room now (with Move back), then the people, and Leave last. Over
 *   the card, *In this room* and how many, with Add at its right (Add agents or people; Add a person
 *   in a Main room; none for a guest). The title is the room's name, which anybody in it but a guest
 *   renames where it stands (ADR 0112, Arjun's B): a tap makes it a field, and the keyboard's done
 *   saves.
 * - **Icon.** The room's face, as you have it, beside its name, with a palette at its corner (ADR
 *   0202; a row of its own under the title before, ADR 0174): a tap turns to a page that is the
 *   picker a long press on its Spaces row opens (`RoomIcon.tsx`). Anybody in the room has it, a
 *   guest too: the face is a person's own setting.
 * - **Add.** A card of two rows, New agent and In other rooms, each opening a page of its own,
 *   then the agents that are free, and the people of the workspace who are not here. A Main room
 *   adds people only. It stays up while several are put in (ADR 0148): a row ticks where it
 *   stands, and a tick taken off takes it out again where that may be done; an agent moved here or
 *   asked for turns back to it, the ask ticked under New agent; the sheet's X puts it away. A room
 *   made empty from the + opens on it.
 * - **In other rooms.** The agents that are in another room, which move (Arjun, 4 October 2026:
 *   "I need this to be accessible through a menu option, like we have for new agent"). Listed on
 *   Add itself, they were most of the page, and the free agents and people sat under them.
 * - **Move.** An agent is in one room at a time: picking one that is busy elsewhere asks first,
 *   and says what the move does to the room it leaves. Where its harness makes copies, the same
 *   page offers Fork here (ADR 0087, Fork): a copy joins this room, and it stays where it is.
 * - **Media & files.** One card on the first page (ADR 0202, Arjun: "We have media and files
 *   separate possibly could be combined"), with the newest things the room's lines carry and a
 *   tile for its files, turning to a page of both (`RoomMedia.tsx`): the newest eight photos,
 *   videos, voice notes and documents (ADR 0165), then the room's files at their current version
 *   (ADR 0100, `RoomFiles.tsx`). Its *See all* closes the sheet and, once it has gone, opens the
 *   space's own Media, Media on this phone's page for one space: everything shown, opened in the
 *   viewer or Quick Look, and let go of off this phone only.
 * - **New agent.** A blank agent made for this room (ADR 0108, Arjun's B): one row on Add when a
 *   harness here makes them, then a page with the harnesses' faces, as the + window shows them,
 *   and the name it is to be called, which may be left empty for its harness's next free name.
 *   The room shows the ask until it joins.
 * - **Lead.** Who leads the room (ADR 0104): the agent that hands out the work, and that Chips
 *   hands what was nobody's turn once the room goes still. One tile on the first page says who;
 *   its page lists the room's agents, and No lead, with a tick on the one that leads. The lead's
 *   row among the members wears "Lead".
 * - **Lock changes.** The last tile on the first page, for anybody in the room but a guest: a
 *   padlock standing open and a switch, off for every room until somebody turns it on
 *   (ADR 0156, Arjun: "I want inverted 'lock changes' default off"). While it is on, nobody
 *   renames, archives or deletes the room: the padlock closes, the title loses its pen, and the
 *   room's Spaces row slides on Locked in place of Archive and Delete, which opens the room with
 *   this sheet up. Who is here, the lead, Spend per job and the files are not locked. A flip shows
 *   at once and holds until the room says the server has it, as a name saved holds in the title;
 *   one turned away goes back, and the sheet says why. The tile flips as `ui/LockRow` does, the row
 *   an agent's card has (ADR 0199), and shuts its padlock in gold while it is on.
 * - **An agent's card.** Each agent's row on the first page closes the sheet and, once it has gone,
 *   opens the agent's own card over the room, the one the Agents tab opens (Arjun, 10 October
 *   2026, ADR 0111's addendum): the page of the sheet it once opened showed a little of it, and
 *   the card is where everything done to an agent is. The same row slides left on a red Remove,
 *   as a Spaces row slides on Archive and Delete (`SwipeRow`, ADR 0111), for whoever may take it
 *   out (`mayRemoveMember`), without asking first: the agent goes free with its memory, and Add
 *   puts it back.
 * - **Take out, and Leave.** A person's row slides on the same Remove, and the sheet turns to a page
 *   that asks first, with the person on it (Arjun, 14 October 2026: "A" — they are told the moment
 *   it happens, so an undo would flash a notice at them). Leave, the last row of who is here, asks the same
 *   way for anybody with somebody else in the room to add them back; left, the room screen goes
 *   back to Spaces. A guest has no Add: the door would refuse them (rule 7).
 * - **Hide** (ADR 0205). A tile on the last row, beside Lock changes, half the width (it was the
 *   member list's row above Leave until 23 October 2026): *Hide*, *Off your list*, takes the room
 *   off the reader's list into Hidden and keeps it quiet on their phone. It asks nothing; the sheet
 *   goes and the room screen goes back to Spaces, as Leave's does. A hidden room's sheet says
 *   *Unhide* there, which stays, and its Notifications tile says *Off while hidden*.
 *
 * What is offered, and to whom, is core's (`addableAgents`, `roomAgents`, `mayMove`), so the phone
 * and the desktop offer the same agents in the same words.
 *
 * A page fades into the next where it stands, with the sheet's top gliding to the new page's
 * height (`SheetPages`). Each page is a
 * column that shrinks to what the sheet leaves it, its list scrolling inside: a long Add list
 * once ran on under the bottom edge, past where a finger could scroll it (ADR 0110).
 */

import {
  type Addable,
  type Asking,
  addableAgents,
  addableKept,
  addWords,
  type Directory,
  guestElsewhere,
  harnessOf,
  hideAct,
  inviteSomeoneNew,
  isShared,
  leadOf,
  leaveAsking,
  mayAddToRoom,
  mayChooseLead,
  mayForkInto,
  mayInviteToSpace,
  mayLeave,
  mayLock,
  mayMove,
  mayRemoveMember,
  mayRename,
  maySeeSpend,
  maySetSpend,
  nameOf,
  newAgentHarnesses,
  newAgentHint,
  newAgentName,
  newestFilesOf,
  nobodyToAddWords,
  type RoomFileOf,
  roomAgents,
  roomByline,
  roomLeadOf,
  roomName,
  type Snapshot,
  type Space,
  type Store,
  spaceFace,
  spendCeilingOf,
  spentWords,
  standingInRoom,
  takeOutAsking,
  whoIsHere,
  whyFaceNotSaved,
  workspaceOwnerName,
} from "@chipschat/core";
import type { JobSpend, SpaceIcon, SpaceNotifications } from "@chipschat/protocol";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { faceProps } from "../agents/face";
import { Pick } from "../newSpace/Pick";
import { InviteForm } from "../people/InviteForm";
import { Avatar, avatarCorner, avatarSide } from "../ui/Avatar";
import { Button } from "../ui/Button";
import type { SheetFrom } from "../ui/beside";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { PageBack } from "../ui/PageBack";
import { SharedTag } from "../ui/SharedTag";
import { CLOSE_ROOM, Sheet, SheetDock, SheetPages, SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useScrollGlide } from "../ui/useScrollGlide";
import { useNotificationSettings } from "../you/Notifications";
import type { FacePickerHandle } from "./FacePicker";
import { faceWords } from "./faceWords";
import type { FileService } from "./files";
import { LeadMark } from "./LeadMark";
import { AgentPage } from "./RoomAgent";
import { useRoomFiles } from "./RoomFiles";
import { IconPage } from "./RoomIcon";
import { MediaFilesPage } from "./RoomMedia";
import { ChangePage, ProjectFilePage, ProjectPage, projectActions } from "./RoomProject";
import { SpendPage, useRoomSpend } from "./RoomSpend";
import {
  HideTile,
  LeadTile,
  LockTile,
  MediaCard,
  NotifyTile,
  ProjectTile,
  RowMark,
  Section,
  SpendTile,
  Tiles,
} from "./RoomTiles";
import { RowAvatar } from "./RowAvatar";
import { LEVEL_WORDS, LEVELS, levelOf, withLevel } from "./roomNotify";
import { SwipeRow } from "./SwipeRow";

type Page =
  | { readonly kind: "who" }
  | { readonly kind: "icon" }
  | { readonly kind: "add" }
  | { readonly kind: "elsewhere" }
  | { readonly kind: "media" }
  | { readonly kind: "lead" }
  | { readonly kind: "spend" }
  | { readonly kind: "notify" }
  | { readonly kind: "new" }
  | { readonly kind: "invite" }
  | { readonly kind: "move"; readonly agentId: string }
  | { readonly kind: "agent"; readonly agentId: string }
  | { readonly kind: "history"; readonly agentId: string }
  | { readonly kind: "takeout"; readonly participantId: string }
  | { readonly kind: "leave" }
  | { readonly kind: "project" }
  | { readonly kind: "change"; readonly commit: string }
  | { readonly kind: "file"; readonly path: string };

/** What a page is called, for `SheetPages`: Move is per agent, and taking out per person. */
const keyOf = (page: Page) =>
  "agentId" in page
    ? `${page.kind}:${page.agentId}`
    : "participantId" in page
      ? `${page.kind}:${page.participantId}`
      : "commit" in page
        ? `${page.kind}:${page.commit}`
        : "path" in page
          ? `${page.kind}:${page.path}`
          : page.kind;

/** An agent's card or its history, which the details push inside their column (ADR 0276). */
const isAgentPage = (page: Page): page is Extract<Page, { readonly kind: "agent" | "history" }> =>
  page.kind === "agent" || page.kind === "history";

/** The page the sheet stands on when it is opened: its first, Add, Spend per job, or Project. */
export type RoomPage = "who" | "add" | "spend" | "project";

export function RoomSheet({
  store,
  snapshot,
  space,
  title,
  selfId,
  open,
  onClose,
  files,
  onGoTo,
  onOpenAgent,
  onOpenSpace,
  onOpenMedia,
  onLeft,
  opensOn = "who",
  workspace = "the workspace",
  from,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly title: string;
  readonly selfId: string;
  readonly open: boolean;
  /**
   * The page it comes up on: its first, or Add, for a room waiting for agents (ADR 0148), or Spend
   * per job. Asked for another while it is up, it turns to it, as a tap on its tile would.
   */
  readonly opensOn?: RoomPage | undefined;
  readonly onClose: () => void;
  /**
   * An agent's row: its card, which opens once the sheet has gone. In a column beside the room, its
   * card is a page of theirs instead (`RoomAgent.tsx`, ADR 0276).
   */
  readonly onOpenAgent: (agentId: string) => void;
  /** Another space, named by an agent's card or history inside the column. */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  /** See all on Media & files: the space's own Media, which opens once the sheet has gone (ADR 0165). */
  readonly onOpenMedia?: (() => void) | undefined;
  /**
   * Left the room from its sheet, or hid it (ADR 0205): once the sheet has gone, the screen goes
   * back to Spaces.
   */
  readonly onLeft?: (() => void) | undefined;
  /** What the room's files are opened with (ADR 0100); without it, a file opens nothing. */
  readonly files?: FileService | undefined;
  /** *Go to message* from a file's viewer: the sheet has closed, and the room lands on the line. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
  /** The workspace as a sentence names it, for a link made into this room (ADR 0168). */
  readonly workspace?: string | undefined;
  /** The room's name in its bar: on an iPad without the column for them, it opens beside it. */
  readonly from?: SheetFrom | undefined;
}) {
  const [page, setPage] = useState<Page>({ kind: opensOn });
  // A column beside the room, where an agent's card is one of its pages.
  const docked = useContext(SheetDock) !== undefined;
  // What Add has put in the room since the sheet came up, which it keeps where it was, ticked; and
  // the new agents asked for from it, with the names they are to have (ADR 0148).
  const [kept, setKept] = useState<readonly string[]>([]);
  const [asked, setAsked] = useState<readonly Asked[]>([]);
  // Coming up, it starts on the page it was told to, with nothing kept from the last time: set in
  // the render that sees it open, so no frame shows another page first.
  const [shown, setShown] = useState(open);
  const [on, setOn] = useState(opensOn);
  if (shown !== open) {
    setShown(open);
    setOn(opensOn);
    if (open) {
      setPage({ kind: opensOn });
      setKept([]);
      setAsked([]);
    }
  } else if (on !== opensOn) {
    setOn(opensOn);
    if (open) setPage({ kind: opensOn });
  }
  const filesRead = useRoomFiles(store, space, open);
  const spend = useRoomSpend(store, space, open);
  // What this room sends this phone (ADR 0198): saved at once, and taken back if refused.
  const notifications = useNotificationSettings(store);
  const level = levelOf(notifications.settings, space.id);
  const notifying = (next: SpaceNotifications) => {
    notifications.save(withLevel(notifications.settings, space.id, next));
    go({ kind: "who" });
  };
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Why the room's face did not stick (ADR 0174): the picker says it in its own banner, as its sheet does.
  const [iconFailed, setIconFailed] = useState<string | undefined>(undefined);
  // The Icon page's picker, which saves letters typed and not yet saved when the sheet closes.
  const picker = useRef<FacePickerHandle>(null);
  // The agent whose card opens once the sheet has gone: one pushed while the modal is still up
  // would come in under it, and the modal's own going would land on the card.
  const opening = useRef<string | undefined>(undefined);
  // Left from Leave: the room screen goes back once the sheet has gone.
  const left = useRef(false);
  // See all on Media & files: the space's own Media opens once the sheet has gone, as an agent's card does.
  const media = useRef(false);
  useEffect(() => {
    if (!open) return;
    // Opened again before it had gone: the card waiting for that is not wanted now.
    opening.current = undefined;
    left.current = false;
    media.current = false;
    setFailed(undefined);
    // Where each agent is now: the list offers them by it.
    void store.refreshDirectory();
  }, [open, store]);
  const go = (next: Page) => {
    setFailed(undefined);
    setIconFailed(undefined);
    setPage(next);
  };
  const act = async (work: () => Promise<void> | void) => {
    setBusy(true);
    setFailed(undefined);
    try {
      await work();
      onClose();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };
  // Put in from Add, which stays up and turns to `then` (ADR 0148), or says why the server would not.
  const stay = async (work: () => Promise<void> | void, then: () => void) => {
    setBusy(true);
    setFailed(undefined);
    try {
      await work();
      then();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };
  const moving = (agentId: string) => act(() => store.moveAgent(agentId, space.id));
  const leading = (agentId: string | null) => act(() => store.setLead(space.id, agentId));
  // Out at once, and the sheet stays: its first page shows the room without them, and the room
  // behind says who took them out (ADR 0111; a person too, JR-5, JR-7). A refusal is the room's
  // notice, as an add's is.
  const removing = (participantId: string) => {
    setFailed(undefined);
    store.removeMember({ spaceId: space.id, participantId });
  };
  // A person asks first, on a page of the sheet, and then is out: the sheet turns back.
  const takingOut = (participantId: string) => {
    removing(participantId);
    go({ kind: "who" });
  };
  const leaving = () => {
    store.leaveSpace({ spaceId: space.id });
    left.current = true;
    onClose();
  };
  // Hidden (ADR 0205): off the reader's list, and the room goes back to Spaces once the sheet has,
  // as Leave's does, where the list shows where it went. A refusal puts it back on the list, which
  // says it. Unhidden, the sheet stays, and its row and tile turn back.
  const hidden = snapshot.hiddenSpaces?.has(space.id) === true;
  const hiding = () => {
    if (hidden) {
      store.setSpaceHidden(space.id, false).catch((error: unknown) => {
        setFailed(error instanceof Error ? `Not unhidden: ${error.message}` : "Not unhidden.");
      });
      return;
    }
    void store.setSpaceHidden(space.id, true).catch(() => undefined);
    left.current = true;
    onClose();
  };
  // What the room allows a job (ADR 0117): saved, the first page shows it, and the room says who.
  const spending = async (usd: number | null) => {
    setBusy(true);
    setFailed(undefined);
    try {
      await store.setSpendCeiling(space.id, usd);
      go({ kind: "who" });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };
  // The room's face as you have it (ADR 0174): saved at once; the store takes a refusal back.
  const facing = (face: SpaceIcon | undefined) => {
    setIconFailed(undefined);
    void store.setSpaceIcon(space.id, face).catch((error: unknown) => {
      setIconFailed(whyFaceNotSaved(error));
    });
  };
  // The Icon page: the picker, under a way back that saves letters typed and not yet saved.
  const iconPage = () => (
    <IconPage
      title={title}
      hint={whoIsHere(space, snapshot.directory)}
      kind={spaceFace(space, snapshot.directory).kind}
      chosen={snapshot.spaceIcons.get(space.id)}
      failed={iconFailed}
      onChoose={facing}
      onBack={() => {
        picker.current?.flush();
        go({ kind: "who" });
      }}
      picker={picker}
    />
  );
  // The name the title is given where it stands (ADR 0112). A refusal is the room's notice.
  const renaming = (next: string) => store.updateSpace({ spaceId: space.id, title: next });
  // The room's changes locked or let go (ADR 0156): whether the server took it. One it turned away
  // says why under the page, as Spend per job's does, and the switch goes back.
  const locking = async (locked: boolean) => {
    setFailed(undefined);
    try {
      await store.setLock(space.id, locked);
      return true;
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
      return false;
    }
  };
  // Taking a person out and leaving ask first, on a page of their own.
  const asks = (shown: Extract<Page, { readonly kind: "takeout" | "leave" }>) => {
    const out = shown.kind === "takeout" ? shown.participantId : undefined;
    return (
      <Asks
        snapshot={snapshot}
        who={out ?? selfId}
        under={out === undefined ? title : standingInRoom(space, snapshot.model, out)}
        asking={
          out === undefined
            ? leaveAsking(title)
            : takeOutAsking({ name: nameOf(snapshot.directory, out), room: title })
        }
        testID={out === undefined ? "room-sheet-leave-asks" : "room-sheet-takeout-asks"}
        onConfirm={() => (out === undefined ? leaving() : takingOut(out))}
        onCancel={() => go({ kind: "who" })}
      />
    );
  };
  // The room's project (ADR 0222): Files and Changes, a change, a file; back from a change or a
  // file goes to the project, which holds them all.
  const project = projectActions(store, space.id);
  const projectPage = (shown: Extract<Page, { readonly kind: "project" | "change" | "file" }>) =>
    shown.kind === "project" ? (
      <ProjectPage
        space={space}
        directory={snapshot.directory}
        project={project}
        onBack={() => go({ kind: "who" })}
        onChange={(commit) => go({ kind: "change", commit })}
        onFile={(path) => go({ kind: "file", path })}
      />
    ) : shown.kind === "change" ? (
      <ChangePage
        space={space}
        directory={snapshot.directory}
        commit={shown.commit}
        guest={space.roles[selfId] === "guest"}
        project={project}
        onBack={() => go({ kind: "project" })}
        onDone={() => go({ kind: "project" })}
        onFile={(path) => go({ kind: "file", path })}
      />
    ) : (
      <ProjectFilePage
        path={shown.path}
        directory={snapshot.directory}
        project={project}
        onBack={() => go({ kind: "project" })}
        onChange={(commit) => go({ kind: "change", commit })}
      />
    );
  // See all on Media & files: down, and then the space's own Media (ADR 0165).
  const seeAll =
    onOpenMedia === undefined
      ? undefined
      : () => {
          media.current = true;
          onClose();
        };
  // The pages that come off the first: Lead, Spend per job, Media & files and those that put an agent in
  // the room.
  const further = (
    shown: Exclude<
      Page,
      {
        readonly kind:
          | "who"
          | "icon"
          | "notify"
          | "takeout"
          | "leave"
          | "project"
          | "change"
          | "file"
          | "agent"
          | "history";
      }
    >,
  ) =>
    shown.kind === "spend" ? (
      <SpendPage
        space={space}
        spend={spend}
        busy={busy}
        onBack={() => go({ kind: "who" })}
        onSave={(usd) => void spending(usd)}
      />
    ) : shown.kind === "lead" ? (
      <Lead
        snapshot={snapshot}
        space={space}
        busy={busy}
        onBack={() => go({ kind: "who" })}
        onChoose={(agentId) => void leading(agentId)}
      />
    ) : shown.kind === "media" ? (
      <MediaFilesPage
        space={space}
        lanes={snapshot.model.lanes}
        directory={snapshot.directory}
        selfId={selfId}
        files={files}
        read={filesRead}
        onBack={() => go({ kind: "who" })}
        onSeeAll={seeAll}
        onGoTo={(lineId) => {
          onClose();
          onGoTo?.(lineId);
        }}
      />
    ) : (
      <Adding
        page={shown}
        store={store}
        snapshot={snapshot}
        space={space}
        title={title}
        selfId={selfId}
        busy={busy}
        go={go}
        stay={stay}
        kept={kept}
        onKeep={(id) => setKept((now) => (now.includes(id) ? now : [...now, id]))}
        asked={asked}
        onAsked={(ask) => setAsked((now) => [...now, ask])}
        onRemove={removing}
        workspace={workspace}
      />
    );
  // An agent's card, or its history, inside the column beside the room.
  const agentPage = ({ kind, agentId }: Extract<Page, { readonly kind: "agent" | "history" }>) => (
    <AgentPage
      store={store}
      snapshot={snapshot}
      agentId={agentId}
      selfId={selfId}
      history={kind === "history"}
      onBack={() => go(kind === "history" ? { kind: "agent", agentId } : { kind: "who" })}
      onHistory={() => go({ kind: "history", agentId })}
      onOpenAgent={(other) => go({ kind: "agent", agentId: other })}
      onOpenRoom={(id) => (id === space.id ? go({ kind: "who" }) : onOpenSpace?.(id))}
      onDeleted={() => go({ kind: "who" })}
    />
  );
  // The first page: who is here, and the rows that open the others.
  const first = () => (
    <Who
      snapshot={snapshot}
      space={space}
      title={title}
      selfId={selfId}
      icon={snapshot.spaceIcons.get(space.id)}
      onIcon={() => go({ kind: "icon" })}
      onAdd={() => go({ kind: "add" })}
      // Its card inside the column; or down, and then its card over the room, where Back lands.
      onAgent={(agentId) => {
        if (docked) return go({ kind: "agent", agentId });
        opening.current = agentId;
        onClose();
      }}
      onRemove={removing}
      onTakeOut={(participantId) => go({ kind: "takeout", participantId })}
      onLeave={() => go({ kind: "leave" })}
      hidden={hidden}
      onHide={hiding}
      onRename={renaming}
      onMoveBack={(agentId) => void moving(agentId)}
      files={filesRead.listed}
      service={files}
      onMedia={() => go({ kind: "media" })}
      onLead={() => go({ kind: "lead" })}
      spend={spend}
      onSpend={() => go({ kind: "spend" })}
      notify={level}
      onNotify={() => go({ kind: "notify" })}
      onLock={locking}
      onProject={() => go({ kind: "project" })}
    />
  );
  const view = (shown: Exclude<Page, { readonly kind: "agent" | "history" }>) => {
    if (shown.kind === "who") return first();
    if (shown.kind === "icon") return iconPage();
    if (shown.kind === "notify") {
      return <NotifyPage level={level} onBack={() => go({ kind: "who" })} onChoose={notifying} />;
    }
    if (shown.kind === "takeout" || shown.kind === "leave") return asks(shown);
    if (shown.kind === "project" || shown.kind === "change" || shown.kind === "file") {
      return projectPage(shown);
    }
    return further(shown);
  };
  return (
    <Sheet
      open={open}
      // Closing from the Icon page saves what was typed there, as its own sheet's close does.
      onClose={() => {
        picker.current?.flush();
        onClose();
      }}
      // Back to the first page once it has gone, so it next opens there without turning to it,
      // and the card of the agent whose row closed it.
      onGone={() => {
        setPage({ kind: "who" });
        const agentId = opening.current;
        opening.current = undefined;
        if (agentId !== undefined) onOpenAgent(agentId);
        if (media.current) {
          media.current = false;
          onOpenMedia?.();
        }
        if (left.current) {
          left.current = false;
          onLeft?.();
        }
      }}
      sizing="bounded"
      cap={0.8}
      // Its first page's title is a field (ADR 0112), as is New agent's name; on every page, so
      // that leaving one with the keys up lets the sheet down with them.
      keyboard
      from={from}
      testID="room-sheet"
    >
      <SheetPages
        page={page}
        keyOf={keyOf}
        render={(shown) => (isAgentPage(shown) ? agentPage(shown) : view(shown))}
      />
      {failed === undefined ? null : <Failed words={failed} />}
    </Sheet>
  );
}

/** A new agent asked for from Add while the sheet has been up: who makes it, and its name. */
interface Asked {
  readonly harnessId: string;
  readonly name: string;
}

/**
 * The pages that put an agent in the room: Add, New agent (ADR 0108), In other rooms and Move, with
 * what each does once picked. Each goes through the sheet's `stay`, which keeps it up and turns
 * back to Add (ADR 0148), or says why the server would not.
 */
function Adding({
  page,
  store,
  snapshot,
  space,
  title,
  selfId,
  busy,
  go,
  stay,
  kept,
  onKeep,
  asked,
  onAsked,
  onRemove,
  workspace,
}: {
  readonly page: Extract<Page, { readonly kind: "add" | "elsewhere" | "new" | "invite" | "move" }>;
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly title: string;
  readonly selfId: string;
  readonly busy: boolean;
  readonly go: (next: Page) => void;
  readonly stay: (work: () => Promise<void> | void, then: () => void) => Promise<void>;
  readonly kept: readonly string[];
  readonly onKeep: (participantId: string) => void;
  readonly asked: readonly Asked[];
  readonly onAsked: (ask: Asked) => void;
  readonly onRemove: (participantId: string) => void;
  readonly workspace: string;
}) {
  // Kept first, so the row it was picked from stays where it is as it ticks.
  const adding = (participantId: string, kind: "agent" | "person") => {
    onKeep(participantId);
    void stay(
      () => store.addMember({ spaceId: space.id, participantId, kind }),
      () => undefined,
    );
  };
  const back = () => go({ kind: "add" });
  if (page.kind === "invite") {
    return (
      <InviteHere
        store={store}
        space={space}
        title={title}
        selfId={selfId}
        workspace={workspace}
        onBack={back}
      />
    );
  }
  if (page.kind === "add") {
    return (
      <Add
        snapshot={snapshot}
        space={space}
        title={title}
        selfId={selfId}
        kept={kept}
        asked={asked}
        onBack={() => go({ kind: "who" })}
        onAgent={(agent) =>
          agent.room === null
            ? adding(agent.agentId, "agent")
            : go({ kind: "move", agentId: agent.agentId })
        }
        onPerson={(personId) => adding(personId, "person")}
        onRemove={onRemove}
        onNew={() => go({ kind: "new" })}
        onElsewhere={() => go({ kind: "elsewhere" })}
        onInvite={
          mayInviteToSpace(space, snapshot.model, selfId) ? () => go({ kind: "invite" }) : undefined
        }
      />
    );
  }
  if (page.kind === "elsewhere") {
    return (
      <Elsewhere
        snapshot={snapshot}
        space={space}
        selfId={selfId}
        onBack={() => go({ kind: "add" })}
        onAgent={(agent) => go({ kind: "move", agentId: agent.agentId })}
      />
    );
  }
  if (page.kind === "new") {
    return (
      <NewAgent
        snapshot={snapshot}
        space={space}
        selfId={selfId}
        busy={busy}
        onBack={back}
        onAsk={(harnessId, name) => {
          // The name it is to have, as the page showed it: typed, or its harness's next free one.
          const called = newAgentName(snapshot.directory, harnessId, name);
          void stay(
            () => store.askAgent(harnessId, space.id, name),
            () => {
              onAsked({ harnessId, name: called });
              back();
            },
          );
        }}
      />
    );
  }
  const { agentId } = page;
  return (
    <Move
      snapshot={snapshot}
      space={space}
      agentId={agentId}
      selfId={selfId}
      busy={busy}
      onMove={() =>
        void stay(
          () => store.moveAgent(agentId, space.id),
          () => {
            onKeep(agentId);
            back();
          },
        )
      }
      onFork={() => void stay(() => store.forkAgent(agentId, space.id), back)}
      onCancel={() => go({ kind: "elsewhere" })}
    />
  );
}

/** A face: an agent's own, or a circle for a person. */
function Face({
  directory,
  id,
  faded = false,
}: {
  directory: Directory;
  id: string;
  faded?: boolean;
}) {
  return (
    <View style={faded ? styles.faded : undefined}>
      <Avatar name={nameOf(directory, id)} {...faceProps(directory, id)} size="md" decorative />
    </View>
  );
}

/** One row: a face, a name, and a line under it; pressable when it does something. */
function Row({
  face,
  name,
  under,
  onPress,
  trailing,
  testID,
  solid = false,
  onRemove,
  checked,
}: {
  readonly face: ReactNode;
  readonly name: string;
  readonly under?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly trailing?: ReactNode;
  readonly testID?: string | undefined;
  /** A row that ticks (Add, ADR 0148): a checkbox, ticked or not. */
  readonly checked?: boolean | undefined;
  /** On the card's own colour, for a row that slides over the buttons behind it (`SwipeRow`). */
  readonly solid?: boolean;
  /** Remove, as a screen reader is offered it: it cannot swipe to the button (ADR 0111). */
  readonly onRemove?: (() => void) | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <Pressable
      accessibilityRole={
        checked !== undefined ? "checkbox" : onPress === undefined ? undefined : "button"
      }
      aria-checked={checked}
      accessibilityLabel={under === undefined ? name : `${name}, ${under}`}
      accessibilityActions={onRemove === undefined ? undefined : [REMOVE_ACTION]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === REMOVE_ACTION.name) onRemove?.();
      }}
      // A person's row opens nothing, and still offers Remove to a screen reader (JR-7).
      disabled={onPress === undefined && onRemove === undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        solid
          ? { backgroundColor: pressed ? on.pressed : on.fill }
          : pressed
            ? { backgroundColor: palette.surface2 }
            : null,
      ]}
    >
      {face}
      <View style={styles.words}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {name}
        </Text>
        {under === undefined ? null : (
          <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
            {under}
          </Text>
        )}
      </View>
      {trailing}
    </Pressable>
  );
}

/** What a screen reader is offered on an agent's row for the swipe's Remove. */
const REMOVE_ACTION = { name: "remove", label: "Remove from space" } as const;

/** A card of rows, parted by hairlines. */
function Card({ children }: { readonly children: ReactNode[] }) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={[styles.card, { backgroundColor: on.fill }]}>
      {children.map((child, at) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows are in a fixed order.
          key={at}
          style={at === 0 ? undefined : [styles.part, { borderTopColor: palette.line }]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

function Heading({ children }: { readonly children: string }) {
  const palette = usePalette();
  return <Text style={[styles.heading, { color: palette.ink3 }]}>{children}</Text>;
}

function Who({
  snapshot,
  space,
  title,
  selfId,
  icon,
  onIcon,
  onAdd,
  onAgent,
  onRemove,
  onTakeOut,
  onLeave,
  hidden,
  onHide,
  onRename,
  onMoveBack,
  files,
  service,
  onMedia,
  onLead,
  spend,
  onSpend,
  notify,
  onNotify,
  onLock,
  onProject,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly title: string;
  readonly selfId: string;
  /** The room's face as you have it (ADR 0174), and its Icon row's page. */
  readonly icon: SpaceIcon | undefined;
  readonly onIcon: () => void;
  readonly onAdd: () => void;
  /** An agent's row: its card (ADR 0111's addendum). */
  readonly onAgent: (agentId: string) => void;
  /** The red Remove an agent's row slides left on: at once. */
  readonly onRemove: (agentId: string) => void;
  /** The same Remove on a person's row: the page that asks first. */
  readonly onTakeOut: (participantId: string) => void;
  /** Leave, the last row of who is here: the page that asks first. */
  readonly onLeave: () => void;
  /** The reader hid the room from their list (ADR 0205). */
  readonly hidden: boolean;
  /** Hide, or Unhide on a hidden room: at once. */
  readonly onHide: () => void;
  /** The title, renamed where it stands (ADR 0112). */
  readonly onRename: (title: string) => void;
  readonly onMoveBack: (agentId: string) => void;
  /** The room's files, once the server has said (ADR 0100): how many the Media & files card says. */
  readonly files: readonly RoomFileOf[] | undefined;
  /** What the card's pictures are fetched with. */
  readonly service: FileService | undefined;
  /** The Media & files page (ADR 0202). */
  readonly onMedia: () => void;
  /** Who leads the room's page (ADR 0104). */
  readonly onLead: () => void;
  /** What the room's job has spent, once the server has said (ADR 0117). */
  readonly spend: JobSpend | undefined;
  /** What the room allows a job's page (ADR 0117). */
  readonly onSpend: () => void;
  /** What this room sends this phone, and its page (ADR 0198). */
  readonly notify: SpaceNotifications;
  readonly onNotify: () => void;
  /** Lock the room's changes or let them go (ADR 0156): whether the server took it. */
  readonly onLock: (locked: boolean) => Promise<boolean>;
  /** The room's project's page (ADR 0222). */
  readonly onProject: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const { directory, model } = snapshot;
  const agents = roomAgents(space, directory);
  const lead = leadOf(space, directory);
  // Who leads the room (ADR 0104): not a Main room's Main agent, which is that room's own.
  const leads = lead === undefined ? roomLeadOf(space) : undefined;
  const people = space.members.filter((id) => directory[id]?.kind === "person");
  const hint = whoIsHere(space, directory);
  // One row open on its Remove at a time: another coming open closes it, as on Spaces.
  const open = useRef<SwipeableMethods | undefined>(undefined);
  const rows = [
    ...agents.here.map((id) => {
      const may = mayRemoveMember(space, directory, selfId, id, model);
      const remove = may ? () => onRemove(id) : undefined;
      return (
        <SwipeRow
          key={id}
          acts={may ? (["remove"] as const) : []}
          palette={palette}
          onCard
          onAct={() => remove?.()}
          onOpen={(row) => {
            if (open.current !== row) open.current?.close();
            open.current = row;
          }}
          onClose={(row) => {
            if (open.current === row) open.current = undefined;
          }}
          testID={`room-sheet-swipe-${id}`}
        >
          <Row
            face={<Face directory={directory} id={id} />}
            name={nameOf(directory, id)}
            // Whose it is where it is somebody else's, then its harness, "Dana's agent ·
            // Hermes" (ADR 0234); to a guest whose it is alone (ADR 0196).
            under={
              id === lead
                ? `Main agent · ${roomByline(model, directory, selfId, id)}`
                : roomByline(model, directory, selfId, id)
            }
            onPress={() => onAgent(id)}
            onRemove={remove}
            solid
            testID={`room-sheet-member-${id}`}
            trailing={
              <View style={styles.count}>
                {id === leads ? <LeadMark /> : null}
                <Icon name="next" size={18} color={palette.ink4} />
              </View>
            }
          />
        </SwipeRow>
      );
    }),
    ...agents.elsewhere.map(({ agentId, spaceId }) => (
      <Row
        key={agentId}
        face={<Face directory={directory} id={agentId} faded />}
        name={nameOf(directory, agentId)}
        under={`In ${roomName(model, spaceId, directory)}`}
        testID="room-sheet-elsewhere"
        trailing={
          mayMove(model, directory, selfId, agentId) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${nameOf(directory, agentId)} back`}
              onPress={() => onMoveBack(agentId)}
              style={[styles.pill, { backgroundColor: palette.surface3 }]}
            >
              <Text style={[styles.pillWords, { color: palette.ink }]}>Move back</Text>
            </Pressable>
          ) : undefined
        }
      />
    )),
    ...people.map((id) => {
      // A person swipes to Remove as an agent does, for whoever may take them out (JR-7): the
      // room's owner, or a workspace owner or admin in it; never yourself, who leaves by Leave.
      // It asks first, on a page of its own.
      const may = id !== selfId && mayRemoveMember(space, directory, selfId, id, model);
      const remove = may ? () => onTakeOut(id) : undefined;
      const row = (
        <Row
          key={id}
          face={<Face directory={directory} id={id} />}
          name={id === selfId ? "You" : nameOf(directory, id)}
          under={standingInRoom(space, model, id)}
          onRemove={remove}
          solid={may}
          testID={`room-sheet-member-${id}`}
        />
      );
      if (!may) return row;
      return (
        <SwipeRow
          key={id}
          acts={["remove"] as const}
          palette={palette}
          onCard
          onAct={() => remove?.()}
          onOpen={(swiped) => {
            if (open.current !== swiped) open.current?.close();
            open.current = swiped;
          }}
          onClose={(swiped) => {
            if (open.current === swiped) open.current = undefined;
          }}
          testID={`room-sheet-swipe-${id}`}
        >
          {row}
        </SwipeRow>
      );
    }),
    // Leave, last: it is about being here, and it scrolls with who is. Hide is a tile now, beside
    // Lock changes (ADR 0202's addendum of 23 October 2026).
    ...(mayLeave(space, directory, selfId, model)
      ? [<LeaveRow key="leave" title={title} onPress={onLeave} />]
      : []),
  ];
  const tiles = roomTiles({
    snapshot,
    space,
    selfId,
    lead,
    leads,
    spend,
    notify,
    hidden,
    onLead,
    onSpend,
    onNotify,
    onProject,
  });
  // Core's rule, as a swipe has it: Unhide on a hidden room, Hide on an open one, and none where
  // the reader has nothing to hide it from.
  const hides = hideAct(space, selfId, snapshot.hiddenSpaces ?? NONE_HIDDEN) !== undefined;
  const foot = footTiles({ space, selfId, title, hidden, hides, onLock, onHide });
  return (
    <View style={styles.page}>
      <Head
        space={space}
        directory={directory}
        title={title}
        hint={hint}
        shared={isShared(space, directory, selfId)}
        icon={icon}
        may={mayRename(space, selfId)}
        onIcon={onIcon}
        onRename={onRename}
      />
      {/* Everything under the head is one scroll (ADR 0202's addendum, 23 October 2026): who is
          here is laid out whole, so it never gives its height to the tiles under it. */}
      <SheetScroll style={styles.scroll} testID="room-sheet-who">
        <Section
          name="In this space"
          count={agents.here.length + people.length}
          trailing={
            mayAddToRoom(space, model, selfId) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={addWords(lead !== undefined)}
                onPress={onAdd}
                hitSlop={SPACE.xs}
                testID="room-sheet-add"
                style={({ pressed }) => [
                  styles.add,
                  { backgroundColor: pressed ? on.pressed : on.fill },
                ]}
              >
                <Icon name="plus" size={16} color={palette.ink} weight={2} />
                <Text style={[styles.addWords, { color: palette.ink }]}>Add</Text>
              </Pressable>
            ) : null
          }
        />
        {/* The rows slide on their Remove (ADR 0111), inside the root a gesture needs that the
            sheet has (ADR 0175). */}
        <Card>{rows}</Card>
        <View style={styles.media}>
          <MediaCard
            media={newestFilesOf(space, model.lanes)}
            files={service}
            fileCount={files?.length}
            onPress={onMedia}
          />
        </View>
        <Tiles foot={foot}>{tiles}</Tiles>
      </SheetScroll>
    </View>
  );
}

/**
 * The first page's head (ADR 0202): the room's face, with a palette at its corner, which opens the
 * Icon page; beside it the name, renamed where it stands, and who is here.
 */
function Head({
  space,
  directory,
  title,
  hint,
  shared,
  icon,
  may,
  onIcon,
  onRename,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly title: string;
  readonly hint: string;
  /** Somebody besides the reader reads it: the Spaces row's tag, before who is here (ADR 0234). */
  readonly shared: boolean;
  readonly icon: SpaceIcon | undefined;
  readonly may: boolean;
  readonly onIcon: () => void;
  readonly onRename: (title: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={styles.head}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Icon, ${faceWords(icon)}`}
        accessibilityHint="Changes the space's icon"
        onPress={onIcon}
        testID="room-sheet-icon"
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <RowAvatar space={space} directory={directory} title={title} icon={icon} size="row" />
        <View style={[styles.badge, { backgroundColor: on.fill, borderColor: on.ground }]}>
          <Icon name="palette" size={13} color={palette.ink2} />
        </View>
      </Pressable>
      <View style={styles.headWords}>
        <RoomTitle space={space} title={title} may={may} onRename={onRename} />
        <View style={styles.headLine}>
          {shared ? <SharedTag /> : null}
          <Text style={[styles.headHint, { color: palette.ink3 }]} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The room's settings as tiles (ADR 0202): its Project once it has one (ADR 0222), then in the
 * order the rows were: Lead where the room has no
 * Main agent to lead it and Spend per job, in a room with agents; Notifications. Lock changes and
 * Hide are the foot's (`footTiles`).
 */
function roomTiles({
  snapshot,
  space,
  selfId,
  lead,
  leads,
  spend,
  notify,
  hidden,
  onLead,
  onSpend,
  onNotify,
  onProject,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly selfId: string;
  readonly lead: string | undefined;
  readonly leads: string | undefined;
  readonly spend: JobSpend | undefined;
  readonly notify: SpaceNotifications;
  /** Hidden by the reader (ADR 0205): Notifications says Off while hidden. */
  readonly hidden: boolean;
  readonly onLead: () => void;
  readonly onSpend: () => void;
  readonly onNotify: () => void;
  readonly onProject: () => void;
}): ReactNode[] {
  return [
    // The room's project once it has had a change (ADR 0222), for anybody in the room.
    ...(space.project === undefined
      ? []
      : [<ProjectTile key="project" files={space.project.files} onPress={onProject} />]),
    ...(roomAgents(space, snapshot.directory).here.length > 0
      ? agentTiles({ snapshot, space, selfId, lead, leads, spend, onLead, onSpend })
      : []),
    <NotifyTile
      key="notify"
      level={notify}
      icon={hidden ? "hide" : LEVEL_ICONS[notify]}
      hidden={hidden}
      onPress={onNotify}
    />,
  ];
}

/**
 * The tiles' last row (ADR 0202's addendum of 23 October 2026): Lock changes for anybody but a
 * guest, and Hide beside it for whoever may hide the room (ADR 0205), half the width each.
 */
function footTiles({
  space,
  selfId,
  title,
  hidden,
  hides,
  onLock,
  onHide,
}: {
  readonly space: Space;
  readonly selfId: string;
  readonly title: string;
  readonly hidden: boolean;
  readonly hides: boolean;
  readonly onLock: (locked: boolean) => Promise<boolean>;
  readonly onHide: () => void;
}): ReactNode[] {
  return [
    ...(mayLock(space, selfId)
      ? [
          <LockTile
            key="lock"
            locked={space.locked === true}
            onLock={onLock}
            hint="Stops the space being renamed, archived or deleted"
          />,
        ]
      : []),
    ...(hides ? [<HideTile key="hide" title={title} hidden={hidden} onPress={onHide} />] : []),
  ];
}

/**
 * A room with agents' tiles: who leads it, where it has no Main agent to, and Spend per job. Each
 * opens its page for whoever may change it (ADR 0196): the lead anybody but a guest, the spend the
 * workspace's owner alone; a guest has no Spend, and a member is told who sets it.
 */
function agentTiles({
  snapshot,
  space,
  selfId,
  lead,
  leads,
  spend,
  onLead,
  onSpend,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly selfId: string;
  readonly lead: string | undefined;
  readonly leads: string | undefined;
  readonly spend: JobSpend | undefined;
  readonly onLead: () => void;
  readonly onSpend: () => void;
}): ReactNode[] {
  const { model, directory } = snapshot;
  const spends = maySetSpend(space, model, selfId);
  return [
    ...(lead === undefined
      ? [
          <LeadTile
            key="lead"
            leads={leads === undefined ? undefined : nameOf(directory, leads)}
            onPress={mayChooseLead(space, model, selfId) ? onLead : undefined}
          />,
        ]
      : []),
    ...(maySeeSpend(space, model, selfId)
      ? [
          <SpendTile
            key="spend"
            ceiling={spendCeilingOf(space)}
            spend={spend}
            words={spentWords(spend, spends ? undefined : workspaceOwnerName(model, directory))}
            onPress={spends ? onSpend : undefined}
          />,
        ]
      : []),
  ];
}

/** Leave, as who is here's last row: in red, with the room's name. */
function LeaveRow({ title, onPress }: { readonly title: string; readonly onPress: () => void }) {
  const palette = usePalette();
  const on = useGround();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Leave ${title}`}
      onPress={onPress}
      testID="room-sheet-leave"
      style={({ pressed }) => [styles.leave, { backgroundColor: pressed ? on.pressed : on.fill }]}
    >
      <Text style={[styles.leaveWords, { color: palette.red }]} numberOfLines={1}>
        Leave {title}
      </Text>
    </Pressable>
  );
}

/** None hidden, for a snapshot made without the store. */
const NONE_HIDDEN: ReadonlySet<string> = new Set();

/**
 * A page of the sheet that asks first: who it is about, as their row is, then core's words, the
 * act in red and Cancel under it, which turns back. Taking a person out of the room and leaving it
 * ask here (Arjun, 14 October 2026), as Move asks on its page.
 */
function Asks({
  snapshot,
  who,
  under,
  asking,
  testID,
  onConfirm,
  onCancel,
}: {
  readonly snapshot: Snapshot;
  readonly who: string;
  readonly under: string;
  readonly asking: Asking;
  readonly testID: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const { directory } = snapshot;
  return (
    <View style={styles.page} testID={testID}>
      <View style={[styles.who, { backgroundColor: on.fill }]}>
        <Face directory={directory} id={who} />
        <View style={styles.words}>
          <Text style={[styles.name, { color: palette.ink }]}>{nameOf(directory, who)}</Text>
          <Text style={[styles.under, { color: palette.ink3 }]}>{under}</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[styles.ask, { color: palette.ink }]}>
        {asking.title}
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>{asking.body}</Text>
      {asking.note === undefined ? null : (
        <Text style={[styles.body, { color: palette.ink3 }]}>{asking.note}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={asking.confirm}
        onPress={onConfirm}
        testID="room-sheet-confirm"
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: palette.red, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.goWords, { color: "#ffffff" }]}>{asking.confirm}</Text>
      </Pressable>
      <Button label="Cancel" onPress={onCancel} style={styles.done} />
    </View>
  );
}

/** How long a name just saved stands in the title before the room's own is shown again. */
const SENT_MS = 3000;

/**
 * The room's name at the top of the sheet, which whoever may rename the room edits where it
 * stands (ADR 0112, Arjun's B). A tap turns it into a field with the keys up, and the sheet rides
 * them with the title in sight (`Sheet`'s `keyboard`); the keyboard's done saves it, and a tap
 * anywhere else puts the old name back. A room with no name of its own, called by its agents,
 * starts the field empty with that under it.
 *
 * Saved, the name stands in the title until the room's own changes, which is the server taking
 * it. One turned away goes back to the old name after a moment, and the room's notice says why.
 */
function RoomTitle({
  space,
  title,
  may,
  onRename,
}: {
  readonly space: Space;
  readonly title: string;
  readonly may: boolean;
  readonly onRename: (title: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  // The words in the field while the title is one.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  // The name just saved, and the room's name it was saved over.
  const [sent, setSent] = useState<{ readonly title: string; readonly over?: string } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (sent === undefined) return;
    const gone = setTimeout(() => setSent(undefined), SENT_MS);
    return () => clearTimeout(gone);
  }, [sent]);
  if (draft !== undefined) {
    const save = () => {
      const next = draft.trim();
      if (next === "" || next === space.title) return;
      setSent({ title: next, ...(space.title === undefined ? {} : { over: space.title }) });
      onRename(next);
    };
    return (
      <TextInput
        accessibilityLabel="The space's name"
        testID="room-sheet-title-field"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={save}
        onBlur={() => setDraft(undefined)}
        autoFocus
        returnKeyType="done"
        autoCorrect={false}
        maxLength={200}
        placeholder={title}
        placeholderTextColor={palette.ink3}
        style={[
          styles.title,
          styles.titleField,
          { color: palette.ink, backgroundColor: on.fill, borderColor: palette.blue },
        ]}
      />
    );
  }
  const shown = sent !== undefined && sent.over === space.title ? sent.title : title;
  return (
    <Pressable
      accessibilityRole={may ? "button" : "header"}
      accessibilityLabel={shown}
      accessibilityHint={may ? "Renames the space" : undefined}
      disabled={!may}
      onPress={() => setDraft(space.title ?? "")}
      hitSlop={SPACE.sm}
      testID="room-sheet-title"
      style={({ pressed }) => [styles.titleLine, pressed ? styles.pressed : null]}
    >
      {/* Two lines: in the iPad's 320-point column beside the room one cut "Birthday dinn...". */}
      <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
        {shown}
      </Text>
      {may ? <Icon name="pen" size={16} color={palette.ink4} /> : null}
    </Pressable>
  );
}

/**
 * Who leads the room (ADR 0104): the room's agents, and No lead, with a tick on the one that does.
 * Choosing one says so in the room and closes the sheet, as adding somebody does.
 */
function Lead({
  snapshot,
  space,
  busy,
  onBack,
  onChoose,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onChoose: (agentId: string | null) => void;
}) {
  const palette = usePalette();
  const { directory } = snapshot;
  const leads = roomLeadOf(space);
  const tick = (on: boolean) =>
    on ? <Icon name="check" size={20} color={palette.blue} /> : undefined;
  const rows = [
    <Row
      key="nobody"
      face={<RowMark ground="lead" icon="x" testID="room-sheet-lead-nobody-mark" />}
      name="No lead"
      under="Words for nobody stay with nobody"
      onPress={busy || leads === undefined ? undefined : () => onChoose(null)}
      testID="room-sheet-lead-nobody"
      trailing={tick(leads === undefined)}
    />,
    ...roomAgents(space, directory).here.map((id) => (
      <Row
        key={id}
        face={<Face directory={directory} id={id} />}
        name={nameOf(directory, id)}
        under={nameOf(directory, harnessOf(directory, id))}
        onPress={busy || leads === id ? undefined : () => onChoose(id)}
        testID={`room-sheet-lead-${id}`}
        trailing={tick(leads === id)}
      />
    )),
  ];
  return (
    <View style={styles.page}>
      <PageBack title="Lead" onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>
        The lead hands out the work. Chips gives it what is nobody's turn.
      </Text>
      <SheetScroll style={styles.scroll}>
        <Card>{rows}</Card>
      </SheetScroll>
    </View>
  );
}

/**
 * Each level's mark: the bell rings for everything, a person for people, a line for you, and off
 * is muted.
 */
const LEVEL_ICONS = { all: "bell", people: "user", mentions: "chat", none: "mute" } as const;

/**
 * What this room sends this phone (ADRs 0198, 0216): every message, people's messages, only what
 * @s you, or nothing but decisions. A tap saves and turns back, as Lead's does.
 */
function NotifyPage({
  level,
  onBack,
  onChoose,
}: {
  readonly level: SpaceNotifications;
  readonly onBack: () => void;
  readonly onChoose: (level: SpaceNotifications) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.page}>
      <PageBack title="Notifications" onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>
        What this space sends this phone. The space shows everything either way.
      </Text>
      <SheetScroll style={styles.scroll}>
        <Card>
          {LEVELS.map((each) => (
            <Row
              key={each}
              face={
                <RowMark
                  ground="notify"
                  icon={LEVEL_ICONS[each]}
                  testID={`room-sheet-notify-${each}-mark`}
                />
              }
              name={LEVEL_WORDS[each].name}
              under={LEVEL_WORDS[each].under}
              onPress={each === level ? undefined : () => onChoose(each)}
              testID={`room-sheet-notify-${each}`}
              trailing={
                each === level ? <Icon name="check" size={20} color={palette.blue} /> : undefined
              }
            />
          ))}
        </Card>
      </SheetScroll>
    </View>
  );
}

function Add({
  snapshot,
  space,
  title,
  selfId,
  kept,
  asked,
  onBack,
  onAgent,
  onPerson,
  onRemove,
  onNew,
  onElsewhere,
  onInvite,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly title: string;
  readonly selfId: string;
  /** Put in from here since the sheet came up: kept in place, ticked (ADR 0148). */
  readonly kept: readonly string[];
  /** New agents asked for from here since the sheet came up. */
  readonly asked: readonly Asked[];
  readonly onBack: () => void;
  readonly onAgent: (agent: Addable) => void;
  readonly onPerson: (personId: string) => void;
  /** A tick taken off: out of the room again. */
  readonly onRemove: (participantId: string) => void;
  readonly onNew: () => void;
  /** The agents in other rooms, on a page of their own. */
  readonly onElsewhere: () => void;
  /** A link into this room for somebody new (ADR 0168): an owner's, so absent for anybody else. */
  readonly onInvite?: (() => void) | undefined;
}) {
  const palette = usePalette();
  const { directory, model } = snapshot;
  const offered = addableAgents(space, directory, { model, selfId });
  const free = addableKept(space, directory, kept, { model, selfId });
  const makers = newAgentHarnesses(model, directory, selfId, space);
  // Nobody here already, and no guest who is in a space already (ADR 0034): the server would
  // refuse them a second (finding PP-2). And whoever was put in from here, ticked where they were.
  const people = Object.values(model.people).filter(
    (person) =>
      (!space.members.includes(person.participantId) &&
        person.role !== undefined &&
        !guestElsewhere(directory, person.participantId)) ||
      (kept.includes(person.participantId) && space.members.includes(person.participantId)),
  );
  // A row that is in the room now is ticked; a tap takes it out again where that may be done, and
  // does nothing where it may not.
  const ticked = (id: string, add: () => void) => {
    const here = space.members.includes(id);
    if (!here) return { checked: false, onPress: add };
    const may = mayRemoveMember(space, directory, selfId, id, model);
    return { checked: true, onPress: may ? () => onRemove(id) : undefined };
  };
  const ways = [
    ...(makers.length === 0
      ? []
      : [
          <Row
            key="new"
            face={<NewFace />}
            name="New agent"
            under={`${listOf(makers.map((each) => each.displayName))} makes it for this space`}
            onPress={onNew}
            testID="room-sheet-new"
            trailing={<Icon name="next" size={18} color={palette.ink4} />}
          />,
        ]),
    // Each new agent asked for from here, ticked: the room says when it joins.
    ...asked.map((ask, at) => (
      <Row
        // biome-ignore lint/suspicious/noArrayIndexKey: asks are only ever added, in order.
        key={`asked-${at}`}
        face={<NewFace />}
        name={ask.name}
        under={`Asked of ${nameOf(directory, ask.harnessId)}`}
        checked
        testID={`room-sheet-asked-${at}`}
        trailing={<Tick on />}
      />
    )),
    ...(offered.elsewhere.length === 0
      ? []
      : [
          <Row
            key="elsewhere"
            face={
              <View style={[styles.filesMark, { backgroundColor: palette.surface3 }]}>
                <Icon name="chat" size={20} color={palette.ink3} />
              </View>
            }
            name="In other spaces"
            under="Moves here from the space it's in"
            onPress={onElsewhere}
            testID="room-sheet-other-rooms"
            trailing={
              <View style={styles.count}>
                <Text style={[styles.countWords, { color: palette.ink3 }]}>
                  {offered.elsewhere.length}
                </Text>
                <Icon name="next" size={18} color={palette.ink4} />
              </View>
            }
          />,
        ]),
  ];
  return (
    <View style={styles.page}>
      <PageBack title={`Add to ${title}`} onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>
        {space.home === true
          ? "A Main space takes people, and no other agent."
          : "An agent is in one space at a time."}
      </Text>
      <SheetScroll style={styles.scroll}>
        {ways.length === 0 ? null : <Card>{ways}</Card>}
        {free.length === 0 ? null : (
          <>
            <Heading>Free</Heading>
            <Card>
              {free.map((agent) => {
                const tick = ticked(agent.agentId, () => onAgent(agent));
                return (
                  <Row
                    key={agent.agentId}
                    face={<Face directory={directory} id={agent.agentId} />}
                    name={agent.name}
                    under={agent.harness}
                    onPress={tick.onPress}
                    checked={tick.checked}
                    testID={`room-sheet-agent-${agent.agentId}`}
                    trailing={<Tick on={tick.checked} />}
                  />
                );
              })}
            </Card>
          </>
        )}
        <Heading>People</Heading>
        <Card>
          {[
            ...(people.length === 0
              ? [
                  <Row
                    key="nobody"
                    face={<Icon name="user" size={22} color={palette.ink3} />}
                    name={nobodyToAddWords(space, model.people, selfId)}
                  />,
                ]
              : people.map((person) => {
                  const tick = ticked(person.participantId, () => onPerson(person.participantId));
                  return (
                    <Row
                      key={person.participantId}
                      face={<Face directory={directory} id={person.participantId} />}
                      name={nameOf(directory, person.participantId)}
                      under={person.role === "guest" ? "Guest" : "Member"}
                      onPress={tick.onPress}
                      checked={tick.checked}
                      testID={`room-sheet-person-${person.participantId}`}
                      trailing={<Tick on={tick.checked} />}
                    />
                  );
                })),
            ...(onInvite === undefined
              ? []
              : [<InviteRow key="invite" title={title} onPress={onInvite} />]),
          ]}
        </Card>
      </SheetScroll>
    </View>
  );
}

/** A row's tick: an empty circle, or the gold one with its check once it is in the room. */
/** The last row under People, an owner's: a link that brings somebody new into this room. */
function InviteRow({ title, onPress }: { readonly title: string; readonly onPress: () => void }) {
  const palette = usePalette();
  const said = inviteSomeoneNew(title);
  return (
    <Row
      face={
        <View style={[styles.filesMark, { backgroundColor: palette.surface3 }]}>
          <Icon name="mail" size={20} color={palette.ink2} />
        </View>
      }
      name={said.title}
      under={said.under}
      onPress={onPress}
      testID="room-sheet-invite"
      trailing={<Icon name="next" size={18} color={palette.ink4} />}
    />
  );
}

/**
 * Invite to this room (ADR 0168): the form You's Invite someone has, for this room. The link it
 * makes comes in under the form, below the fold on a phone, so the page glides down to it
 * (`useScrollGlide`): its QR code is what somebody beside you scans.
 */
function InviteHere({
  store,
  space,
  title,
  selfId,
  workspace,
  onBack,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly title: string;
  readonly selfId: string;
  readonly workspace: string;
  readonly onBack: () => void;
}) {
  const glide = useScrollGlide();
  return (
    <View style={styles.page} testID="room-sheet-invite-page">
      <PageBack title={`Invite to ${title}`} onBack={onBack} />
      <SheetScroll
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        testID="room-sheet-invite-list"
        {...glide.list}
      >
        <InviteForm
          store={store}
          selfId={selfId}
          workspace={workspace}
          space={{ id: space.id, name: title }}
          onShown={glide.down}
        />
        <View style={styles.inviteFoot} />
      </SheetScroll>
    </View>
  );
}

function Tick({ on = false }: { readonly on?: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.tick,
        on
          ? { backgroundColor: palette.gold, borderColor: palette.gold }
          : { borderColor: palette.ink4 },
      ]}
    >
      {on ? <Icon name="check" size={15} color="#231a00" /> : null}
    </View>
  );
}

/** An agent that may be added: free, with its harness under it; or in a room, with which. */
function AgentRow({
  snapshot,
  agent,
  onPress,
}: {
  readonly snapshot: Snapshot;
  readonly agent: Addable;
  readonly onPress: (agent: Addable) => void;
}) {
  const palette = usePalette();
  const { directory, model } = snapshot;
  const moves = agent.room !== null;
  return (
    <Row
      face={<Face directory={directory} id={agent.agentId} />}
      name={agent.name}
      under={
        moves ? `${agent.harness} · in ${roomName(model, agent.room, directory)}` : agent.harness
      }
      onPress={() => onPress(agent)}
      testID={`room-sheet-agent-${agent.agentId}`}
      trailing={moves ? <Icon name="next" size={18} color={palette.ink4} /> : undefined}
    />
  );
}

/**
 * The agents in other rooms, from Add's row (Arjun, 4 October 2026). Each is in a room now, so a
 * pick goes to Move, which asks first and says what the move does to the room it leaves.
 */
function Elsewhere({
  snapshot,
  space,
  selfId,
  onBack,
  onAgent,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly selfId: string;
  readonly onBack: () => void;
  readonly onAgent: (agent: Addable) => void;
}) {
  const palette = usePalette();
  const offered = addableAgents(space, snapshot.directory, { model: snapshot.model, selfId });
  return (
    <View style={styles.page}>
      <PageBack title="In other spaces" onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>
        An agent is in one space at a time. Picking one asks before it moves it here.
      </Text>
      <SheetScroll style={styles.scroll}>
        <Card>
          {offered.elsewhere.map((agent) => (
            <AgentRow key={agent.agentId} snapshot={snapshot} agent={agent} onPress={onAgent} />
          ))}
        </Card>
      </SheetScroll>
    </View>
  );
}

/** "Jacobian", "Jacobian or OpenClaw", "Jacobian, OpenClaw or Scout". */
function listOf(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/** The face of an agent not made yet: a dashed outline the size of a row's face, with a +. */
function NewFace() {
  const palette = usePalette();
  return (
    <View style={[styles.newFace, { borderColor: palette.ink3 }]}>
      <Icon name="plus" size={20} color={palette.ink2} />
    </View>
  );
}

/**
 * A new agent for this room (ADR 0108): who makes it, by face, and what it is called. The name
 * may be left empty: the line under it says what it will be then, or that a name typed is taken
 * and what it will be instead. Add asks, and the sheet closes on the room, which shows the ask.
 */
function NewAgent({
  snapshot,
  space,
  selfId,
  busy,
  onBack,
  onAsk,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly selfId: string;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onAsk: (harnessId: string, name: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const { directory, model } = snapshot;
  const makers = newAgentHarnesses(model, directory, selfId, space);
  // One to choose from is chosen: the faces are there to say who, not to ask.
  const [picked, setPicked] = useState<string | undefined>(
    makers.length === 1 ? makers[0]?.id : undefined,
  );
  const [typed, setTyped] = useState("");
  const field = useRef<TextInput>(null);
  const chosen = picked === undefined ? undefined : directory[picked];
  const name = picked === undefined ? undefined : newAgentName(directory, picked, typed);
  const ask = () => {
    if (picked !== undefined && !busy) onAsk(picked, typed.trim());
  };
  return (
    <View style={styles.page}>
      <PageBack title="New agent" onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>
        Who makes it. It starts with the space's last lines, and nothing from elsewhere.
      </Text>
      <Pick
        harnesses={makers}
        picked={chosen === undefined ? [] : [chosen]}
        onChoose={(harnessId) => {
          setPicked(harnessId);
          field.current?.focus();
        }}
        inset={SPACE.lg}
        says={false}
        testID="room-sheet-new-pick"
      />
      <Text style={[styles.label, { color: palette.ink3 }]}>Name</Text>
      <View
        style={[
          styles.field,
          { backgroundColor: on.fill, opacity: picked === undefined ? 0.45 : 1 },
        ]}
      >
        <TextInput
          ref={field}
          accessibilityLabel="Name"
          testID="room-sheet-new-name"
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={ask}
          editable={picked !== undefined}
          autoFocus={makers.length === 1}
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={120}
          placeholder={picked === undefined ? "" : newAgentName(directory, picked)}
          placeholderTextColor={palette.ink3}
          style={[styles.fieldWords, { color: palette.ink }]}
        />
      </View>
      <Text style={[styles.fieldHint, { color: palette.ink3 }]} testID="room-sheet-new-hint">
        {picked === undefined ? "Pick who makes it first." : newAgentHint(directory, picked, typed)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name === undefined ? "Add" : `Add ${name}`}
        accessibilityState={{ busy, disabled: busy || picked === undefined }}
        disabled={busy || picked === undefined}
        onPress={ask}
        testID="room-sheet-new-add"
        style={({ pressed }) => [
          styles.go,
          {
            backgroundColor: picked === undefined ? on.fill : palette.gold,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.goWords, picked === undefined ? { color: palette.ink4 } : null]}>
          {name === undefined ? "Add" : `Add ${name}`}
        </Text>
      </Pressable>
    </View>
  );
}

function Move({
  snapshot,
  space,
  agentId,
  selfId,
  busy,
  onMove,
  onFork,
  onCancel,
}: {
  readonly snapshot: Snapshot;
  readonly space: Space;
  readonly agentId: string;
  readonly selfId: string;
  readonly busy: boolean;
  readonly onMove: () => void;
  readonly onFork: () => void;
  readonly onCancel: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const { directory, model } = snapshot;
  const name = nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const from = roomName(model, directory[agentId]?.room, directory);
  const may = mayMove(model, directory, selfId, agentId);
  const fork = mayForkInto(model, directory, selfId, agentId, space);
  return (
    <View style={styles.page}>
      <View style={[styles.who, { backgroundColor: on.fill }]}>
        <Face directory={directory} id={agentId} />
        <View style={styles.words}>
          <Text style={[styles.name, { color: palette.ink }]}>{name}</Text>
          <Text style={[styles.under, { color: palette.ink3 }]}>
            {harness} · in {from}
          </Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[styles.ask, { color: palette.ink }]}>
        {may ? `Move ${name} here?` : `${name} is in ${from}`}
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>
        {may
          ? `It leaves ${from}, which says so, and keeps what it remembers.`
          : `An agent is in one space at a time. Ask the owner of ${harness} to move it.`}
      </Text>
      {may ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Move"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onMove}
          testID="room-sheet-move"
          style={({ pressed }) => [
            styles.go,
            { backgroundColor: palette.gold, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.goWords}>Move</Text>
        </Pressable>
      ) : null}
      {fork ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fork here"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onFork}
            testID="room-sheet-fork"
            style={({ pressed }) => [
              styles.fork,
              { backgroundColor: palette.goldSoft, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.forkWords, { color: palette.ink }]}>Fork here</Text>
          </Pressable>
          <Text style={[styles.forkHint, { color: palette.ink3 }]}>
            A copy joins {roomName(model, space.id, directory)}, remembering everything up to now.{" "}
            {name} stays where it is.
          </Text>
        </>
      ) : null}
      <Button label="Cancel" onPress={onCancel} disabled={busy} style={styles.done} />
    </View>
  );
}

function Failed({ words }: { readonly words: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.failed, { backgroundColor: palette.redSoft }]} testID="room-sheet-failed">
      <Icon name="alert" size={17} color={palette.redInk} />
      <Text style={[styles.failedWords, { color: palette.redInk }]}>{words}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3, flexShrink: 1 },
  // Short of the sheet's X, which stands at the right of this line (ADR 0169), as do the first
  // lines of the other pages: their way back, and the card of who a question is about.
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    alignSelf: "flex-start",
    marginRight: CLOSE_ROOM,
  },
  // The title as a field: where it stood, in its own size, on a well with the caret's blue round it.
  titleField: {
    // In the page's column, where the title's own shrink would be its height: the list gives way.
    flexShrink: 0,
    marginLeft: -SPACE.sm,
    marginRight: CLOSE_ROOM,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  hint: { fontSize: TEXT.sm, marginTop: 2, marginBottom: SPACE.md },
  // The first page's head (ADR 0202): the room's face, and its name and who is here beside it.
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginBottom: SPACE.md + 2 },
  headWords: { flex: 1, minWidth: 0 },
  headLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  headHint: { fontSize: TEXT.sm, flexShrink: 1 },
  // The palette at the face's corner, ringed in the sheet's ground so it stands off the face.
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingLeft: SPACE.sm + 1,
    paddingRight: SPACE.md,
    borderRadius: RADIUS.pill,
  },
  addWords: { fontSize: TEXT.md, fontWeight: "600" },
  media: { marginTop: SPACE.md },
  leave: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.md,
  },
  leaveWords: { fontSize: TEXT.body, fontWeight: "600" },
  // A page is a column the sheet bounds, and its list is what gives: it scrolls in what is left.
  page: { flexShrink: 1, minHeight: 0 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  inviteFoot: { height: SPACE.lg },
  card: { borderRadius: RADIUS.xl, overflow: "hidden" },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  heading: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 58,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.body, fontWeight: "500" },
  under: { fontSize: TEXT.sm },
  faded: { opacity: 0.4 },
  pill: { borderRadius: 999, paddingHorizontal: SPACE.md, paddingVertical: 6 },
  pillWords: { fontSize: TEXT.sm, fontWeight: "600" },
  flat: {
    minHeight: 50,
    borderRadius: RADIUS.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    marginTop: SPACE.md,
  },
  flatWords: { fontSize: TEXT.body, fontWeight: "600" },
  files: { marginTop: SPACE.md },
  // The Icon row's card: the room's own, before who is in it.
  icon: { marginBottom: SPACE.md },
  filesMark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  countWords: { fontSize: TEXT.md, fontVariant: ["tabular-nums"] },
  dollar: { fontSize: TEXT.lg, fontWeight: "600" },
  done: { marginTop: SPACE.sm },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  who: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.xxl,
    marginTop: SPACE.sm,
    marginBottom: SPACE.lg,
    marginRight: CLOSE_ROOM,
  },
  ask: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3, marginBottom: SPACE.xs },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
  go: {
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.xl,
  },
  // Gold is the same in both themes, so the ink on it is too: the unread count's.
  goWords: { fontSize: TEXT.body, fontWeight: "600", color: "#14161b" },
  fork: {
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.sm,
  },
  forkWords: { fontSize: TEXT.body, fontWeight: "600" },
  forkHint: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    textAlign: "center",
    marginTop: SPACE.xs,
  },
  failed: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    marginTop: SPACE.md,
  },
  failedWords: { flex: 1, fontSize: TEXT.sm, fontWeight: "600" },
  pressed: { opacity: 0.7 },
  newFace: {
    width: avatarSide("md"),
    height: avatarSide("md"),
    borderRadius: avatarCorner("md", "agent"),
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    marginTop: SPACE.lg,
    marginBottom: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
  field: { borderRadius: RADIUS.xl, minHeight: 52, justifyContent: "center" },
  fieldWords: { fontSize: TEXT.body, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  fieldHint: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    marginTop: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
});
