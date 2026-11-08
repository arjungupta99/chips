/**
 * Who is in a room, and what a person may do about it, as the phone's room sheet (ADR 0151, on
 * Arjun's "go with B", 11 October 2026). Until then the desktop drew it as a panel inside the page
 * that pushed the messages down and went away only when its own button was pressed again.
 *
 * It grows out of what opened it (the room's name, or *N members*) and folds back into it, the way
 * the + window does (`GrowingDialog`), and Escape, a click outside it and Done each put it away. Its
 * pages are the phone's: who is here, laid out in tiles as the phone's is (ADR 0202), Add, In other
 * rooms, New agent, Move, Lead, Spend per job and Media & files, each fading in where it stands
 * while the sheet's height glides to it (ADR 0110). It sits under the room's header, over the room
 * rather than in it.
 *
 * Everything but the delete is an event the store sends; the sheet draws the space as the fold has
 * it and asks. Archive and Delete ask first in the phone's words (`ConfirmDialog`), and so do
 * taking a person out and leaving (people review, Phase 1); Unarchive only puts a room back. What is offered, and to whom, is core's, so both clients say the same.
 */

import {
  type Addable,
  type Asking,
  archiveAsking,
  type Directory,
  eraseAsking,
  type Lane,
  leaveAsking,
  mayInviteToSpace,
  nameOf,
  newAgentName,
  newestFilesOf,
  type Space,
  spaceFace,
  spaceTitle,
  takeOutAsking,
  type WorkspaceModel,
  whoIsHere,
} from "@chipschat/core";
import type { RoomSpend, SpaceIcon } from "@chipschat/protocol";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import type { FileService } from "../files.ts";
import { GrowingDialog } from "../GrowingDialog.tsx";
import { useRoomFiles } from "../RoomFiles.tsx";
import { spaceAvatar } from "../Sidebar.tsx";
import { AddPage, type Asked, ElsewherePage, MovePage, NewAgentPage } from "./Adding.tsx";
import type { SpaceActions } from "./actions.ts";
import { IconPage } from "./IconPage.tsx";
import { InvitePage } from "./InvitePage.tsx";
import { ProjectPages } from "./Project.tsx";
import { Failed, Pages, SheetClose } from "./parts.tsx";
import { MediaFilesPage } from "./RoomMedia.tsx";
import { LeadPage, SpendPage } from "./Settings.tsx";
import { UniversePage } from "./Universe.tsx";
import { Who } from "./Who.tsx";

export type Page =
  | { readonly kind: "who" }
  | { readonly kind: "add" }
  | { readonly kind: "elsewhere" }
  | { readonly kind: "media" }
  | { readonly kind: "lead" }
  /** Spend per job; from the banner's Raise the limit, its Save lets the agents carry on too. */
  | { readonly kind: "spend"; readonly carryOn?: boolean }
  | { readonly kind: "new" }
  | { readonly kind: "invite" }
  | { readonly kind: "move"; readonly agentId: string }
  | { readonly kind: "project" }
  | { readonly kind: "universe" }
  | { readonly kind: "icon" }
  | { readonly kind: "change"; readonly commit: string }
  | { readonly kind: "file"; readonly path: string };

export interface RoomSheetProps {
  readonly space: Space;
  /** What the room is called on this screen. */
  readonly title: string;
  readonly directory: Directory;
  readonly selfId: string;
  readonly actions: SpaceActions;
  /** The workspace, for which agents may move, what their rooms are called and who may be added. */
  readonly model?: WorkspaceModel | undefined;
  /** What the room's files are opened with (ADR 0100); no Media & files without it. */
  readonly files?: FileService | undefined;
  /** The lanes anchored in the room, whose files Media & files shows with its lines' (ADR 0202). */
  readonly lanes?: readonly Lane[] | undefined;
  /** The face the person chose for the room (ADR 0174), which the sheet's head wears. */
  readonly icon?: SpaceIcon | undefined;
  /** An agent's row: its page in Agents, opened once the sheet has gone. */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /** What opened it, which it grows out of and folds back into. */
  readonly from: HTMLElement | null;
  /**
   * The page it comes up on: its first, or Add, for a room waiting for agents (ADR 0148), or
   * Universe, from the four rings at the header's right (ADR 0227), or Icon, from Change icon on
   * the room's row in the rail (ADR 0264's addendum), or Spend per job to carry on with, from the
   * banner's Raise the limit (ADR 0282).
   */
  readonly opensOn: "who" | "add" | "project" | "universe" | "icon" | "raise";
  /** A change to open on instead, from under the reply that made it (ADR 0222). */
  readonly opensChange?: string | undefined;
  /** Gone, the fold finished. */
  readonly onGone: () => void;
  /** A job's row on Spend per job: the room, at its reply, once the sheet has gone (ADR 0282). */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}

/** The page the sheet comes up on: a change asked for from under its reply, or its first or Add. */
function firstPage(props: RoomSheetProps): Page {
  if (props.opensChange !== undefined) return { kind: "change", commit: props.opensChange };
  return props.opensOn === "raise" ? { kind: "spend", carryOn: true } : { kind: props.opensOn };
}

/** What a page is called, for `Pages`: Move per agent, a change and a file each their own. */
function pageKey(page: Page): string {
  if (page.kind === "move") return `move:${page.agentId}`;
  if (page.kind === "change") return `change:${page.commit}`;
  if (page.kind === "file") return `file:${page.path}`;
  return page.kind;
}

export function RoomSheet(props: RoomSheetProps) {
  const { space, directory, actions } = props;
  const titleId = useId();
  const [page, setPage] = useState<Page>(() => firstPage(props));
  // Back from a change opened from its reply goes to the project, which holds every change.
  const project = actions.project;
  const guest = space.roles[props.selfId] === "guest";
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // What Add has put in the room since the sheet came up, kept where it was, ticked; and the new
  // agents asked for from it, with the names they are to have (ADR 0148).
  const [kept, setKept] = useState<readonly string[]>([]);
  const [asked, setAsked] = useState<readonly Asked[]>([]);
  const [asking, setAsking] = useState<Ask | undefined>(undefined);
  // The name is a field: Escape puts the old name back rather than the sheet away.
  const renaming = useRef(false);
  const onRenaming = useCallback((on: boolean) => {
    renaming.current = on;
  }, []);
  // The agent whose page opens once the sheet has gone, and the line the room goes to then.
  const opening = useRef<string | undefined>(undefined);
  const goingTo = useRef<string | undefined>(undefined);
  const place = usePlace(props.from);
  const spend = useJobSpend(actions.roomSpend, space);
  const filesRead = useRoomFiles(space, actions);

  // Where every agent is now, read once as the sheet comes up: Add offers them by it.
  const refresh = useRef(actions.refresh);
  refresh.current = actions.refresh;
  useEffect(() => {
    void refresh.current();
  }, []);

  const leave = () => {
    if (!renaming.current && !busy) setLeaving(true);
  };
  const go = (next: Page) => {
    setFailed(undefined);
    setPage(next);
  };
  const reasonOf = (error: unknown) =>
    error instanceof Error ? error.message : "The server would not do it.";
  // Done, then `then`; or what the server would not do, said under the page. Whether it was done.
  const work = async (doing: () => Promise<void> | void, then?: () => void): Promise<boolean> => {
    setBusy(true);
    setFailed(undefined);
    try {
      await doing();
      then?.();
      return true;
    } catch (error) {
      setFailed(reasonOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const putAway = () => setLeaving(true);
  const keep = (id: string) => setKept((now) => (now.includes(id) ? now : [...now, id]));
  // A link into this room, an owner's alone (ADR 0168).
  const invite =
    actions.invite !== undefined &&
    props.model !== undefined &&
    mayInviteToSpace(space, props.model, props.selfId)
      ? actions.invite
      : undefined;
  const onInvite = invite === undefined ? undefined : () => go({ kind: "invite" });
  const invitePage = () =>
    invite === undefined || props.model === undefined ? null : (
      <InvitePage
        titleId={titleId}
        title={props.title}
        spaceId={space.id}
        model={props.model}
        directory={directory}
        selfId={props.selfId}
        invite={invite}
        withdraw={actions.withdrawInvite}
        workspace={actions.workspace ?? "the workspace"}
        onBack={() => go({ kind: "add" })}
      />
    );
  // The face the reader gives the room (ADR 0264's addendum): pressed at the head, or asked for
  // from the rail's Change icon.
  const { icon } = actions;
  const onIcon = icon === undefined ? undefined : () => go({ kind: "icon" });
  const iconPage = () =>
    icon === undefined ? null : (
      <IconPage
        titleId={titleId}
        title={props.title}
        hint={whoIsHere(space, directory)}
        kind={spaceFace(space, directory).kind}
        chosen={props.icon}
        save={icon}
        onBack={() => go({ kind: "who" })}
      />
    );
  const common = {
    titleId,
    space,
    directory,
    selfId: props.selfId,
    model: props.model,
    busy,
  };
  // Spend per job. From Raise the limit the agents carry on with what is saved, and the sheet goes
  // so the room shows them going on; a job's row goes to its reply once it has (ADR 0282).
  const { onGoTo } = props;
  const spendPage = (carryOn: boolean) => (
    <SpendPage
      {...common}
      spend={spend}
      carryOn={carryOn}
      onBack={() => go({ kind: "who" })}
      onSave={(usd) =>
        carryOn
          ? void work(() => actions.spend(usd, { carryOn: true }), putAway)
          : void work(
              () => actions.spend(usd),
              () => go({ kind: "who" }),
            )
      }
      onGoTo={
        onGoTo === undefined
          ? undefined
          : (lineId) => {
              goingTo.current = lineId;
              putAway();
            }
      }
    />
  );

  const view = (shown: Page) => {
    switch (shown.kind) {
      case "who":
        return (
          <Who
            {...common}
            title={props.title}
            actions={actions}
            face={spaceAvatar(space, directory, props.title, props.icon, false, "lg")}
            media={newestFilesOf(space, props.lanes ?? [])}
            listed={filesRead.listed}
            files={props.files}
            spend={spend}
            onAgent={
              props.onOpenAgent === undefined
                ? undefined
                : (agentId) => {
                    opening.current = agentId;
                    putAway();
                  }
            }
            onMoveBack={(agentId) => void work(() => actions.move(agentId), putAway)}
            onLock={(locked) => work(() => actions.lock(locked))}
            onRenaming={onRenaming}
            onIcon={onIcon}
            onPage={(kind) => go({ kind })}
            onPutAway={(kind) => setAsking({ kind })}
            onTakeOut={(participantId) => setAsking({ kind: "takeout", participantId })}
            onLeave={() => setAsking({ kind: "leave" })}
            // Hidden, the sheet goes, as the room has gone from the rail into Hidden (ADR 0205);
            // unhidden, it stays. A refusal is said under the page.
            onHide={(now) => void work(() => actions.hide(now), now ? putAway : undefined)}
            // Pinned or let go, the sheet stays: the room is still in the rail, in a new place
            // (ADR 0240).
            onPin={(now) => void work(() => actions.pin(now))}
          />
        );
      case "lead":
        return (
          <LeadPage
            {...common}
            onBack={() => go({ kind: "who" })}
            onChoose={(agentId) => void work(() => actions.lead(agentId), putAway)}
          />
        );
      case "spend":
        return spendPage(shown.carryOn === true);
      case "icon":
        return iconPage();
      case "universe":
        return (
          <UniversePage
            {...common}
            title={spaceTitle(space, directory)}
            project={project}
            files={props.files}
            onBack={() => go({ kind: "who" })}
          />
        );
      case "project":
      case "change":
      case "file":
        return (
          <ProjectPages
            {...common}
            page={shown}
            project={project}
            files={props.files}
            guest={guest}
            go={go}
          />
        );
      case "media":
        return props.files === undefined ? null : (
          <MediaFilesPage
            {...common}
            lanes={props.lanes ?? []}
            read={filesRead}
            files={props.files}
            onBack={() => go({ kind: "who" })}
          />
        );
      case "add":
        return (
          <AddPage
            {...common}
            title={props.title}
            kept={kept}
            asked={asked}
            onBack={() => go({ kind: "who" })}
            onAdd={(participantId, kind) => {
              // Kept first, so the row it was picked from stays where it is as it ticks.
              keep(participantId);
              actions.add(participantId, kind);
            }}
            onRemove={actions.remove}
            onNew={() => go({ kind: "new" })}
            onElsewhere={() => go({ kind: "elsewhere" })}
            onInvite={onInvite}
          />
        );
      case "invite":
        return invitePage();
      case "elsewhere":
        return (
          <ElsewherePage
            {...common}
            onBack={() => go({ kind: "add" })}
            onAgent={(agent: Addable) => go({ kind: "move", agentId: agent.agentId })}
          />
        );
      case "new":
        return (
          <NewAgentPage
            {...common}
            onBack={() => go({ kind: "add" })}
            onAsk={(harnessId, name) => {
              // The name it is to have, as the page showed it: typed, or its harness's next one.
              const called = newAgentName(directory, harnessId, name);
              void work(
                () => actions.ask(harnessId, name),
                () => {
                  setAsked((now) => [...now, { harnessId, name: called }]);
                  go({ kind: "add" });
                },
              );
            }}
          />
        );
      case "move":
        return (
          <MovePage
            {...common}
            agentId={shown.agentId}
            onMove={() =>
              void work(
                () => actions.move(shown.agentId),
                () => {
                  keep(shown.agentId);
                  go({ kind: "add" });
                },
              )
            }
            onFork={() =>
              void work(
                () => actions.fork(shown.agentId),
                () => go({ kind: "add" }),
              )
            }
            onCancel={() => go({ kind: "elsewhere" })}
          />
        );
    }
  };

  return (
    <>
      <GrowingDialog
        from={props.from}
        labelledBy={titleId}
        className="room-sheet"
        testId="room-sheet"
        // What takes the keyboard: on the first page the sheet itself, so nothing in it is lit until
        // Tab (WebKit lights a button focused by script, whatever opened it); on Add, the first
        // thing to pick (ADR 0148).
        focus={
          props.opensOn === "add"
            ? ".sheet-scroll :is(button, input:not(:disabled))"
            : ".sheet-card"
        }
        leaving={leaving}
        onLeave={leave}
        onGone={() => {
          // The keyboard back where it was: on what opened the sheet.
          props.from?.focus();
          props.onGone();
          const agentId = opening.current;
          opening.current = undefined;
          if (agentId !== undefined) props.onOpenAgent?.(agentId);
          const lineId = goingTo.current;
          goingTo.current = undefined;
          if (lineId !== undefined) props.onGoTo?.(lineId);
        }}
        style={place}
      >
        <div className="sheet-card" tabIndex={-1}>
          <SheetClose.Provider value={leave}>
            <Pages page={pageKey(page)}>{view(page)}</Pages>
          </SheetClose.Provider>
          {failed !== undefined && <Failed words={failed} />}
        </div>
      </GrowingDialog>
      {asking !== undefined && (
        <ConfirmDialog
          asking={askingFor(asking, space, props.title, directory, props.selfId)}
          danger={asking.kind !== "archive"}
          onCancel={() => setAsking(undefined)}
          onConfirm={async ({ too }) => {
            if (asking.kind === "takeout") {
              // The sheet stays: the row goes, and the room says so.
              actions.remove(asking.participantId);
              setAsking(undefined);
              return;
            }
            if (asking.kind === "archive") actions.close();
            else if (asking.kind === "leave") actions.leave();
            else await actions.erase({ deleteAgent: too });
            setAsking(undefined);
            setLeaving(true);
          }}
        />
      )}
    </>
  );
}

/** What the sheet is asking before it does it. */
type Ask =
  | { readonly kind: "archive" | "delete" | "leave" }
  | { readonly kind: "takeout"; readonly participantId: string };

function askingFor(
  ask: Ask,
  space: Space,
  title: string,
  directory: Directory,
  selfId: string,
): Asking {
  switch (ask.kind) {
    case "archive":
      return archiveAsking(space, title, directory);
    case "delete":
      return eraseAsking(space, title, directory, selfId);
    case "leave":
      return leaveAsking(title);
    case "takeout":
      return takeOutAsking({ name: nameOf(directory, ask.participantId), room: title });
  }
}

/**
 * Where the sheet stands: under the room's header, its left edge at what opened it as far as the
 * window lets it, so it comes down from the name it was opened from, as a menu does. Read as it
 * opens, and again as the window changes size, so it never stands outside it.
 */
function usePlace(from: HTMLElement | null): CSSProperties {
  const [place, setPlace] = useState<CSSProperties>(() => placeUnder(from));
  useEffect(() => {
    const again = () => setPlace(placeUnder(from));
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [from]);
  return place;
}

function placeUnder(from: HTMLElement | null): CSSProperties {
  if (from === null || typeof window === "undefined") return {};
  const head = from.closest(".conv")?.querySelector(".conv-h") ?? null;
  const opener = from.getBoundingClientRect();
  const top = Math.round((head ?? from).getBoundingClientRect().bottom + 6);
  // As wide as the stylesheet says, or the window less its gutters on a phone (JR-15): measured
  // against the full width, a narrow window put the sheet's left edge off the screen.
  const width = Math.min(WIDTH, window.innerWidth - 32);
  const left = Math.round(Math.min(Math.max(opener.left - 8, 16), window.innerWidth - width - 16));
  // A modal dialog stands in the middle by its margins; this one stands where it is put.
  return {
    top,
    left,
    right: "auto",
    bottom: "auto",
    margin: 0,
    maxHeight: `calc(100vh - ${top + 16}px)`,
  };
}

/** The sheet's width, the stylesheet's. */
const WIDTH = 420;

/** What the room's job has spent, read again as the room moves on or its ceiling changes. */
function useJobSpend(read: () => Promise<RoomSpend>, space: Space): RoomSpend | undefined {
  const [spend, setSpend] = useState<RoomSpend | undefined>(undefined);
  const last = space.lines.at(-1)?.id;
  const latest = useRef(read);
  latest.current = read;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again as the room moves on, or its ceiling changes.
  useEffect(() => {
    let live = true;
    latest.current().then(
      (answer) => {
        if (live) setSpend(answer);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [space.id, last, space.spendCeiling]);
  return spend;
}
