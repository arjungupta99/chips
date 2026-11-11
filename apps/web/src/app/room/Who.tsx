/**
 * The room sheet's first page (ADR 0151), the phone's `Who`, laid out as the phone's is since ADR
 * 0202 (its addendum, Arjun's 2, 18 October 2026): the room's face beside its name, renamed where it
 * stands (ADR 0112), and who is here under it; *In this room* and how many, with Add at its right
 * (agents or people; never for a guest); who is in it, scrolling in what the page leaves it and
 * fading at its foot while there is more, Leave its last row; one Media & files card, which turns
 * to its page; Project, Lead and Spend per job as tiles two to a row, Lock changes (ADR 0156) and
 * Hide on a row of their own under them, as the phone's; and at the foot Pin, Archive and Delete. While the room's changes are locked its name has no pen and the foot has no
 * Archive or Delete, as core says; who is in it and the tiles but Lock are not locked. An agent's
 * row opens its page in Agents once the sheet has gone (ADR 0111's addendum); Remove stands beside
 * a row for whoever may take it out, where the phone swipes; for a person it asks first, as Leave
 * does (people review, Phase 1).
 */

import {
  addWords,
  type CarriedFile,
  type Directory,
  harnessOf,
  isShared,
  lastJobWords,
  leadOf,
  mayAddToRoom,
  mayChooseLead,
  mayLeave,
  mayLock,
  mayMove,
  mayRemoveMember,
  mayRename,
  maySeeSpend,
  maySetSpend,
  nameOf,
  type RoomFileOf,
  roomAgents,
  roomByline,
  roomLeadOf,
  roomName,
  type Space,
  spendCeilingOf,
  spentWords,
  standingInRoom,
  type WorkspaceModel,
  whoIsHere,
  workspaceOwnerName,
} from "@chipschat/core";
import type { RoomSpend } from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FileService } from "../files.ts";
import { SharedTag } from "../SharedTag.tsx";
import type { SpaceActions } from "./actions.ts";
import { Chev, CloseX, Face, Group, Row } from "./parts.tsx";
import {
  HideTile,
  LeadTile,
  LockTile,
  MediaCard,
  ProjectTile,
  Section,
  SpendTile,
  Tiles,
} from "./RoomTiles.tsx";

export function Who(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly title: string;
  readonly directory: Directory;
  readonly selfId: string;
  readonly model: WorkspaceModel | undefined;
  readonly actions: SpaceActions;
  /** The room's face, as its row in the rail wears it (ADR 0202). */
  readonly face: ReactNode;
  /**
   * The face pressed: the Icon page (ADR 0264's addendum), as the phone's sheet head opens it.
   * Without it the face opens nothing.
   */
  readonly onIcon?: (() => void) | undefined;
  /** What the room's lines carry, newest first: the Media & files card's (ADR 0202). */
  readonly media: readonly CarriedFile[];
  /** The room's files, once the server has said (ADR 0100): how many the card says. */
  readonly listed: readonly RoomFileOf[] | undefined;
  /** What the card's pictures are fetched with; no card without it, as nothing could open. */
  readonly files: FileService | undefined;
  readonly spend: RoomSpend | undefined;
  /** Something asked of the server and not yet answered. */
  readonly busy: boolean;
  readonly onAgent: ((agentId: string) => void) | undefined;
  readonly onMoveBack: (agentId: string) => void;
  /**
   * Lock the room's changes or let them go (ADR 0156): whether the server took it. One it turned
   * away is said under the page.
   */
  readonly onLock: (locked: boolean) => Promise<boolean>;
  readonly onRenaming: (renaming: boolean) => void;
  readonly onPage: (page: "add" | "lead" | "spend" | "media" | "project") => void;
  readonly onPutAway: (asking: "archive" | "delete") => void;
  /** Ask before a person is taken out of the room (his call of 14 October 2026), then do it. */
  readonly onTakeOut: (participantId: string) => void;
  /** Ask before leaving the room, then leave it: the members' last row. */
  readonly onLeave: () => void;
  /** Hide the room from the reader's list, or put it back (ADR 0205). */
  readonly onHide: (hidden: boolean) => void;
  /** Pin the room to the top of the reader's list, or let it go (ADR 0240). */
  readonly onPin: (pinned: boolean) => void;
}) {
  const { space, directory, selfId, actions, model } = props;
  const main = leadOf(space, directory);
  // Anybody in the room but a guest adds to it, as the door has it (rule 7).
  const adds =
    model === undefined ? space.roles[selfId] !== "guest" : mayAddToRoom(space, model, selfId);
  const listed = hereIn(space, directory);
  const here = listed.agents.here.length + listed.harnesses.length + listed.people.length;
  return (
    <>
      <div className="sheet-head">
        <RoomFace face={props.face} onIcon={props.onIcon} />
        <div className="sheet-head-words">
          <RoomTitle
            titleId={props.titleId}
            space={space}
            title={props.title}
            may={mayRename(space, selfId)}
            onRename={actions.rename}
            onRenaming={props.onRenaming}
          />
          <div className="sheet-head-line">
            {/* Somebody besides the reader reads it, as its row in the list says (ADR 0234). */}
            {isShared(space, directory, selfId) && <SharedTag />}
            <p className="sheet-hint">{whoIsHere(space, directory)}</p>
          </div>
        </div>
        <CloseX />
      </div>
      <Section
        name="In this space"
        count={here}
        trailing={
          adds && (
            <button
              type="button"
              className="sheet-add"
              onClick={() => props.onPage("add")}
              aria-label={addWords(main !== undefined)}
              data-testid="room-sheet-add"
            >
              <Icon name="plus" size={14} />
              Add
            </button>
          )
        }
      />
      <Fading>
        <Members {...props} leaves={mayLeave(space, directory, selfId, props.model)} />
      </Fading>
      {props.files !== undefined && (
        <MediaCard
          media={props.media}
          files={props.files}
          fileCount={props.listed?.length}
          onOpen={() => props.onPage("media")}
        />
      )}
      <Settings {...props} />
      <Foot space={space} actions={actions} onPutAway={props.onPutAway} onPin={props.onPin} />
    </>
  );
}

/**
 * Who is here, scrolling in what the page leaves it, its foot fading into the sheet while there is
 * more of it below (ADR 0202): the cards under it are what say the list goes on.
 */
function Fading({ children }: { readonly children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const measure = () =>
      setMore(element.scrollHeight - element.clientHeight - element.scrollTop > 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    for (const child of element.children) watch.observe(child);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      watch.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);
  return (
    <div className="sheet-members">
      <div ref={box} className="sheet-scroll" data-testid="room-sheet-members">
        {children}
      </div>
      {more && (
        <span
          className="sheet-members-fade"
          aria-hidden="true"
          data-testid="room-sheet-members-fade"
        />
      )}
    </div>
  );
}

/**
 * Who the sheet lists as here, which *In this room* counts: the room's agents (and the ones an
 * archive took out, listed apart), its people, and a harness in it as itself, from before its
 * agents took its place (ADR 0087), which the phone's sheet has none of and the desktop's still
 * names.
 */
function hereIn(space: Space, directory: Directory) {
  return {
    agents: roomAgents(space, directory),
    people: space.members.filter((id) => directory[id]?.kind === "person"),
    harnesses: space.members.filter((id) => directory[id]?.kind === "harness"),
  };
}

/** The room's face at the sheet's head: with a pen on it where a press changes it, as on the phone. */
function RoomFace(props: { readonly face: ReactNode; readonly onIcon: (() => void) | undefined }) {
  if (props.onIcon === undefined) {
    return (
      <span className="sheet-room-face" data-testid="room-sheet-icon">
        {props.face}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="sheet-room-face"
      aria-label="Change icon"
      title="Changes the space's icon"
      onClick={props.onIcon}
      data-testid="room-sheet-icon"
    >
      {props.face}
      <span className="sheet-room-face-pen" aria-hidden="true">
        <Icon name="pen" size={11} />
      </span>
    </button>
  );
}

/**
 * Who is here: the room's agents, the ones an archive took out that are elsewhere, its people, and
 * last, Leave, in red, for whoever may leave from here: somebody else is in the room to add them
 * back.
 */
function Members(props: Parameters<typeof Who>[0] & { readonly leaves: boolean }) {
  const { space, directory, selfId, model, actions } = props;
  const { agents, people, harnesses } = hereIn(space, directory);
  const main = leadOf(space, directory);
  // Who leads the room (ADR 0104): not a Main room's Main agent, which is that room's own.
  const leads = main === undefined ? roomLeadOf(space) : undefined;
  const removable = (id: string) =>
    mayRemoveMember(space, directory, selfId, id, model) ? () => actions.remove(id) : undefined;
  // Whose it is where it is somebody else's, then its harness, "Dana's agent · Hermes" (ADR 0234);
  // to a guest whose it is alone (ADR 0196). Its harness until the model says who is reading.
  const byline = (id: string) =>
    model === undefined
      ? nameOf(directory, harnessOf(directory, id))
      : roomByline(model, directory, selfId, id);
  const { onAgent } = props;
  return (
    <Group>
      {agents.here.map((id) => (
        <Row
          key={id}
          participant={id}
          face={<Face directory={directory} id={id} />}
          name={nameOf(directory, id)}
          under={id === main ? `Main agent · ${byline(id)}` : byline(id)}
          {...(onAgent === undefined
            ? {}
            : { onClick: () => onAgent(id), label: `Open ${nameOf(directory, id)}'s page` })}
          testId={`room-sheet-member-${id}`}
          onRemove={removable(id)}
          trailing={
            <>
              {id === leads && (
                <span className="sheet-lead" data-testid="member-lead">
                  Lead
                </span>
              )}
              {onAgent !== undefined && <Chev />}
            </>
          }
        />
      ))}
      {agents.elsewhere.map(({ agentId, spaceId }) => (
        <Row
          key={agentId}
          faded
          face={<Face directory={directory} id={agentId} faded />}
          name={nameOf(directory, agentId)}
          under={model === undefined ? undefined : `In ${roomName(model, spaceId, directory)}`}
          testId="room-sheet-elsewhere"
          trailing={
            model !== undefined && mayMove(model, directory, selfId, agentId) ? (
              <button
                type="button"
                className="sheet-pill"
                onClick={() => props.onMoveBack(agentId)}
                aria-label={`Move ${nameOf(directory, agentId)} back`}
              >
                Move back
              </button>
            ) : undefined
          }
        />
      ))}
      {harnesses.map((id) => (
        <Row
          key={id}
          participant={id}
          face={<Face directory={directory} id={id} />}
          name={nameOf(directory, id)}
          under={roleWords(space, model, id)}
          onRemove={removable(id)}
        />
      ))}
      {people.map((id) => (
        <Row
          key={id}
          participant={id}
          face={<Face directory={directory} id={id} />}
          name={id === selfId ? "You" : nameOf(directory, id)}
          under={roleWords(space, model, id)}
          onRemove={
            id !== selfId && mayRemoveMember(space, directory, selfId, id, model)
              ? () => props.onTakeOut(id)
              : undefined
          }
        />
      ))}
      {props.leaves && (
        <li className="sheet-li">
          <button
            type="button"
            className="ctx-row sheet-leave"
            onClick={props.onLeave}
            data-testid="leave-space"
          >
            Leave {props.title}
          </button>
        </li>
      )}
    </Group>
  );
}

/**
 * How somebody stands in the room: the room's owner, or an owner or admin of the workspace, named
 * as such (core's `standingInRoom`); without the workspace to hand, the room's own role.
 */
function roleWords(space: Space, model: WorkspaceModel | undefined, id: string): string {
  if (model !== undefined) return standingInRoom(space, model, id);
  const role = space.roles[id];
  return role === "owner" ? "Owner" : role === "guest" ? "Guest" : "Member";
}

/**
 * What the reader may do with the room's settings. Who does what here is the workspace's word as
 * well as the room's (ADR 0196): until the model is in, the room's own roles stand in, and nobody
 * but the workspace's owner is offered the spend; whoever sees it and doesn't set it is told who does.
 */
function standingIn(
  space: Space,
  directory: Directory,
  selfId: string,
  model: WorkspaceModel | undefined,
) {
  const notGuest = space.roles[selfId] !== "guest";
  if (model === undefined)
    return { chooses: notGuest, sees: notGuest, spends: false, setBy: undefined };
  const spends = maySetSpend(space, model, selfId);
  return {
    chooses: mayChooseLead(space, model, selfId),
    sees: maySeeSpend(space, model, selfId),
    spends,
    setBy: spends ? undefined : workspaceOwnerName(model, directory),
  };
}

/** How many files the room's project has, once it has had a change (ADR 0222): for anybody in the room. */
function projectFiles(props: Parameters<typeof Who>[0]): number | undefined {
  if (props.actions.project === undefined) return undefined;
  return props.space.project?.files;
}

/**
 * The room's settings as tiles (ADR 0202), in the order the rows were: the Project once it has had
 * a change; Lead where the room has no Main agent to lead it and Spend per job, in a room with
 * agents and for whoever may see it. Under them, on a row of their own as on the phone, Lock
 * changes for anybody but a guest and Hide for whoever may hide the room. Nothing at all for a
 * guest in a Main room.
 */
function Settings(props: Parameters<typeof Who>[0]) {
  const tiles = roomTiles(props);
  const foot = footTiles(props);
  if (tiles.length + foot.length === 0) return null;
  return <Tiles foot={foot}>{tiles}</Tiles>;
}

/** The tiles above the foot: the Project, Lead and Spend per job, each where the room has it. */
function roomTiles(props: Parameters<typeof Who>[0]): ReactNode[] {
  const { space, directory, selfId, model } = props;
  const agents = roomAgents(space, directory).here.length;
  const leads = roomLeadOf(space);
  const { chooses, sees, spends, setBy } = standingIn(space, directory, selfId, model);
  const project = projectFiles(props);
  const tiles: ReactNode[] = [];
  if (project !== undefined) {
    tiles.push(
      <ProjectTile key="project" files={project} onClick={() => props.onPage("project")} />,
    );
  }
  if (leadOf(space, directory) === undefined && agents > 0) {
    tiles.push(
      <LeadTile
        key="lead"
        leads={leads === undefined ? undefined : nameOf(directory, leads)}
        onClick={chooses ? () => props.onPage("lead") : undefined}
      />,
    );
  }
  if (agents > 0 && sees) {
    tiles.push(
      <SpendTile
        key="spend"
        ceiling={spendCeilingOf(space)}
        spend={props.spend}
        words={spentWords(props.spend, setBy)}
        last={lastJobWords(props.spend)}
        onClick={spends ? () => props.onPage("spend") : undefined}
      />,
    );
  }
  return tiles;
}

/** The foot's tiles, as the phone's `footTiles`: Lock changes and Hide, each where it may be used. */
function footTiles(props: Parameters<typeof Who>[0]): ReactNode[] {
  const { space, selfId, actions } = props;
  const foot: ReactNode[] = [];
  if (mayLock(space, selfId)) {
    foot.push(
      <LockTile
        key="lock"
        locked={space.locked === true}
        busy={props.busy}
        onLock={props.onLock}
      />,
    );
  }
  if (actions.mayHide) {
    foot.push(<HideTile key="hide" hidden={actions.hidden} onHide={props.onHide} />);
  }
  return foot;
}

/**
 * Pin or Unpin, Archive or Unarchive, and Delete. The phone keeps them on the Spaces swipe; the
 * desktop has no swipe, so they stand quietly at the sheet's foot, and each but Pin, its undoing
 * and Unarchive asks first in the phone's words. Pin is the reader's own (ADR 0240): pinned, the
 * room stands at the top of their rail, and nothing changes for anybody else. Hide, the reader's
 * own too (ADR 0205), stood here until it became a tile beside Lock changes, as the phone's is.
 * While the room's changes are locked core offers neither Archive nor Delete, so Pin stands alone,
 * with Unarchive beside it for a locked room that was archived: that only puts it back (ADR 0156). Leave stood here too until it became the members' last row (ADR
 * 0202).
 */
function Foot(props: {
  readonly space: Space;
  readonly actions: SpaceActions;
  readonly onPutAway: (asking: "archive" | "delete") => void;
  readonly onPin: (pinned: boolean) => void;
}) {
  const { space, actions } = props;
  const archived = space.state === "closed";
  return (
    <div className="sheet-foot">
      {actions.mayPin && (
        <button
          type="button"
          className="sheet-quiet"
          onClick={() => props.onPin(!actions.pinned)}
          data-testid={actions.pinned ? "unpin-space" : "pin-space"}
        >
          {actions.pinned ? "Unpin" : "Pin"}
        </button>
      )}
      {actions.mayArchive &&
        (archived ? (
          <button
            type="button"
            className="sheet-quiet"
            onClick={actions.reopen}
            data-testid="unarchive-space"
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            className="sheet-quiet"
            onClick={() => props.onPutAway("archive")}
            data-testid="archive-space"
          >
            Archive
          </button>
        ))}
      {actions.mayErase && (
        <button
          type="button"
          className="sheet-quiet"
          data-tone="red"
          onClick={() => props.onPutAway("delete")}
          data-testid="delete-space"
        >
          Delete space…
        </button>
      )}
    </div>
  );
}

/** How long a name just saved stands in the title before the room's own is shown again. */
const SENT_MS = 3000;

/**
 * The room's name at the top of the sheet, which whoever may rename the room edits where it stands
 * (ADR 0112, Arjun's B): a click makes it a field, Return saves, and Escape or a click anywhere
 * else puts the old name back. Saved, the name stands until the room's own changes, which is the
 * server taking it; one turned away goes back after a moment, and the room's notice says why.
 * Nobody may while the room's changes are locked (ADR 0156), so the name stands without its pen.
 */
function RoomTitle(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly title: string;
  readonly may: boolean;
  readonly onRename: (title: string) => void;
  readonly onRenaming: (renaming: boolean) => void;
}) {
  const { space, title, onRenaming } = props;
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState<{ readonly title: string; readonly over?: string } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (sent === undefined) return;
    const gone = setTimeout(() => setSent(undefined), SENT_MS);
    return () => clearTimeout(gone);
  }, [sent]);
  useEffect(() => onRenaming(draft !== undefined), [draft, onRenaming]);
  if (draft !== undefined) {
    const save = () => {
      const next = draft.trim();
      if (next !== "" && next !== space.title) {
        setSent({ title: next, ...(space.title === undefined ? {} : { over: space.title }) });
        props.onRename(next);
      }
      setDraft(undefined);
    };
    const keys = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        // The old name back, and the sheet stays.
        event.preventDefault();
        event.stopPropagation();
        setDraft(undefined);
      } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        save();
      }
    };
    return (
      <input
        className="sheet-title-field"
        aria-label="The space's name"
        data-testid="room-sheet-title-field"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={keys}
        onBlur={() => setDraft(undefined)}
        // biome-ignore lint/a11y/noAutofocus: the field is what the click on the name asked for.
        autoFocus
        maxLength={200}
        placeholder={title}
      />
    );
  }
  const shown = sent !== undefined && sent.over === space.title ? sent.title : title;
  if (!props.may) {
    return (
      <h2 id={props.titleId} className="sheet-title">
        {shown}
      </h2>
    );
  }
  return (
    <h2 id={props.titleId} className="sheet-title">
      <button
        type="button"
        className="sheet-title-button"
        onClick={() => setDraft(space.title ?? "")}
        aria-label={`${shown}, rename`}
        data-testid="room-sheet-title"
      >
        {shown}
        <Icon name="pen" size={13} />
      </button>
    </h2>
  );
}
