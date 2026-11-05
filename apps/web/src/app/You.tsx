/**
 * You: the person this device speaks as, and what is theirs (ADR 0034), as a settings list (ADR
 * 0085), and on the Mac and the web the iPad's split (ADR 0265, Arjun's A of 3 November 2026): the
 * list in a column, and beside it the page its row opens, as Settings stands a page beside its own.
 * Where You is too narrow for both, the list is alone and a row opens its page in its place, with
 * the way back at its top.
 *
 * The list is the phone's, in its order (ADR 0085's addendum of 20 October 2026): you and the
 * workspace you are in, in one card; Notifications; Appearance; under the workspace's name and only
 * for its owners and admins, what is everyone's; This computer; Send feedback (ADR 0237); Devices;
 * and at the foot Sign out, with Delete your account under it (ADR 0243). Passkeys, which no phone
 * has, stand under Devices where a passkey can work. Every row wears a mark, so the words of every
 * row start at one edge, says what it is set to, and opens what sets it on a page beside the list:
 * People, a person, Invite someone, Relay, Connection, the workspace's log, your face's picker from
 * the face itself (ADR 0272), and the short settings the phone opens in sheets, as forms on pages
 * of their own (the addendum of 3 November 2026). Only the short yes or no before what can't be
 * undone is a dialog.
 *
 * Every list is fetched when the screen opens, and again each time the connection does, rather
 * than kept in the fold: passkeys, devices and invites are registry rows, not events, so nothing
 * streams them.
 */

import {
  type Directory,
  FACE_PICKER_WORDS,
  feedbackAgent,
  guestStandingWords,
  mayInvite,
  mayRenameWorkspace,
  myRole,
  nameOf,
  type SetRulesInput,
  standingWords,
  WAY_VALUE,
  type WorkspaceModel,
  type WorkspaceRole,
  wayOf,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Log } from "./Audit.tsx";
import { YourFace } from "./face/YourFace.tsx";
import { Turns, type Way } from "./Turns.tsx";
import { ConnectionPage, type WayFacts } from "./you/ConnectionCard.tsx";
import { DeleteAccountRow } from "./you/DeleteAccount.tsx";
import { Devices, Passkeys } from "./you/Devices.tsx";
import { FeedbackRow, type FeedbackService } from "./you/Feedback.tsx";
import { Group, ListRow, RowMark } from "./you/list.tsx";
import { moveOf, useViewMotion } from "./you/motion.ts";
import { Notifications } from "./you/Notifications.tsx";
import { Appearance, type HeldWorkspace, MeGroup } from "./you/Profile.tsx";
import { FormHostContext, Pane, PaneEmpty, useForms, useSplit, type YouPage } from "./you/pane.tsx";
import { RelayPage, useRelayRow } from "./you/Relay.tsx";
import type {
  LimitsService,
  NotificationsService,
  PeopleService,
  RelayService,
} from "./you/services.ts";
import {
  InvitePage,
  PeoplePage,
  type PeopleProps,
  PersonPage,
  useLinks,
  WorkspaceGroup,
} from "./you/Workspace.tsx";

export type { FeedbackService } from "./you/Feedback.tsx";
export type { HeldWorkspace } from "./you/Profile.tsx";
export type {
  IssuedCode,
  LimitsService,
  NotificationsService,
  PeopleService,
  RelayService,
} from "./you/services.ts";

export interface YouProps {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspaceName: string | undefined;
  /**
   * Whether a passkey can work here: a browser with WebAuthn, on a secure address that is a
   * name rather than an IP, and not the desktop app. Where one cannot, the group is not drawn.
   */
  readonly passkeysWork: boolean;
  /** Inside the desktop app: "this computer" rather than "this browser". */
  readonly desktop: boolean;
  /** The server this device talks to, as This computer's Server row says it. */
  readonly serverHost: string;
  readonly busy: ReadonlySet<string>;
  /** Whether the connection is open: the lists are read then, and again each time it opens. */
  readonly connected: boolean;
  readonly people: PeopleService;
  readonly onChangeRole: (participantId: string, role: WorkspaceRole) => void;
  /** Take a person out of the workspace (ADR 0160). */
  readonly onRemovePerson: (participantId: string) => Promise<void>;
  /** Forget this device's key, after withdrawing it, and go back to pairing. */
  readonly onSignOut: () => void;
  /** Delete the person's own account (ADR 0243). Absent, the row is not drawn. */
  readonly onDeleteAccount?: (() => Promise<void>) | undefined;
  /** Notifications for this workspace on this device (M5.3): off, and nothing reaches a banner. */
  readonly muted?: boolean | undefined;
  readonly onMute?: ((muted: boolean) => void) | undefined;
  /** Tiers, quiet hours and a word per harness (M5.6). Absent, those rows are not drawn. */
  readonly notifications?: NotificationsService | undefined;
  /** What may be attached here (ADR 0047). Absent, the rows are not drawn. */
  readonly limits?: LimitsService | undefined;
  /** Open the Agents page with Connect a harness up (ADR 0185's addendum). Absent, no row. */
  readonly onConnectHarness?: (() => void) | undefined;
  /** Send a harness's rules changed, from Allowed always (ADR 0195). Absent, no row. */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  /** The faces this person chose for rooms, which a person's spaces wear (ADR 0209's addendum). */
  readonly spaceIcons?: ReadonlyMap<string, SpaceIcon> | undefined;
  /** Open a room from a person's spaces, or from the log. Absent, the rooms are only listed. */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  /** Which way this device reaches its server (ADR 0211). Absent, no Connection row. */
  readonly way?: WayFacts | undefined;
  /** The owner's relay switch (ADR 0211, Phase 4). Absent, no Relay row. */
  readonly relay?: RelayService | undefined;
  /**
   * Send feedback (ADR 0237): absent while its switch is off, until the repository is public, and
   * then the row is not drawn.
   */
  readonly feedback?: FeedbackService | undefined;
  /** The workspaces this device holds, which the Workspace row switches between. */
  readonly workspaces?: readonly HeldWorkspace[] | undefined;
  readonly onSwitch?: ((deviceId: string) => void) | undefined;
}

/** "Chips 0.0.0 · b888e96": the build, as `vite.config.ts` wrote it in. */
export const BUILD = `Chips ${__CHIPS_VERSION__} · ${__CHIPS_COMMIT__}`;

/** What is open beside the list: a page, and on People a person's. */
interface Opened {
  readonly page?: YouPage | undefined;
  readonly person?: string | undefined;
}

export function You(props: YouProps) {
  const { model, directory, selfId } = props;
  const role = myRole(model, selfId);
  const { workspace, heading } = workspaceWords(props.workspaceName);
  const here = useRef<HTMLElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const split = useSplit(here);
  useViewMotion(here, ghosts);
  const { opened, show, forms, host } = useOpened(split);
  const links = useLinks(props.people, props.connected && mayInvite(role), directory);
  const relay = useRelayLine(props, role, () => show({ page: "relay" }));
  const open = (page: YouPage) => show({ page });
  const peopleProps: PeopleProps = {
    model,
    directory,
    selfId,
    role,
    workspace,
    busy: props.busy,
    people: props.people,
    connected: props.connected,
    links,
    onChangeRole: props.onChangeRole,
    onRemovePerson: props.onRemovePerson,
    spaceIcons: props.spaceIcons,
    onOpenSpace: props.onOpenSpace,
  };
  // Beside the list, the row whose page is open wears the chosen ground; in its place, none does.
  const shown = split ? opened.page : undefined;
  const standing = standingOf(model, directory, selfId, heading);

  const list = (
    <div
      className="you-list-col"
      hidden={!split && (opened.page !== undefined || forms.open)}
      data-view=""
    >
      <div className="you-list">
        <MeGroup
          name={nameOf(directory, selfId)}
          face={directory[selfId]?.face}
          standing={standing}
          rename={props.people.rename}
          workspace={heading}
          onRenameWorkspace={mayRenameWorkspace(role) ? props.people.renameWorkspace : undefined}
          workspaces={props.workspaces}
          onSwitch={props.onSwitch}
          onFace={() => open("face")}
          faceOpen={shown === "face"}
        />
        {(props.notifications !== undefined || props.onMute !== undefined) && (
          <Notifications
            service={props.notifications}
            directory={directory}
            workspace={workspace}
            desktop={props.desktop}
            muted={props.muted === true}
            onMute={props.onMute}
          />
        )}
        <Appearance
          desktop={props.desktop}
          me={{ name: nameOf(directory, selfId), face: directory[selfId]?.face }}
        />
        <WorkspaceGroup
          model={model}
          directory={directory}
          selfId={selfId}
          role={role}
          heading={heading}
          links={links}
          connected={props.connected}
          limits={props.limits}
          opened={shown}
          onOpen={open}
          relay={relay}
          onConnectHarness={props.onConnectHarness}
          log
          onSetRules={props.onSetRules}
          onOpenSpace={props.onOpenSpace}
        />
        <ThisDevice
          desktop={props.desktop}
          serverHost={props.serverHost}
          way={props.way}
          chosen={shown === "connection"}
          onConnection={() => open("connection")}
        />
        {props.feedback !== undefined && (
          <FeedbackRow
            agent={feedbackAgent(model, directory, selfId)}
            directory={directory}
            version={versionWords(props.desktop)}
            service={props.feedback}
          />
        )}
        <Devices service={props.people} connected={props.connected} desktop={props.desktop} />
        {props.passkeysWork && <Passkeys service={props.people} connected={props.connected} />}
        <SignOut {...props} heading={heading} workspace={workspace} />
      </div>
    </div>
  );

  const page = pageOf(opened, {
    split,
    peopleProps,
    onPerson: (person) => show({ page: "people", person }),
    onBack: () => show({}),
    ...pagesOf(props, links, workspace, standing),
  });

  return (
    <FormHostContext.Provider value={host}>
      <main ref={here} className="conv you" data-split={split ? "true" : "false"} aria-label="You">
        <h1 className="ui-visually-hidden">You</h1>
        {list}
        <PaneColumn
          split={split}
          page={page}
          at={viewAt(opened, page !== undefined, forms.open)}
          form={forms.open}
          slot={forms.setSlot}
        />
        {/* Where a view going is drawn as it goes (`motion.ts`): React never draws in it. */}
        <div ref={ghosts} className="you-ghosts" aria-hidden="true" />
      </main>
    </FormHostContext.Provider>
  );
}

/**
 * What is open beside the list, a page or a form, and the host a form finds. A form a row opens
 * stands where a page does: one opening, the page steps aside, and the other way about.
 */
function useOpened(split: boolean) {
  const [opened, setOpened] = useState<Opened>({});
  const forms = useForms(split ? undefined : "You", "", () => setOpened({}));
  const show = (next: Opened) => {
    forms.close();
    setOpened(next);
  };
  // Beside the list, the row whose form is open wears the chosen ground; in its place, none does.
  const lit = split ? forms.host.lit : null;
  const host = useMemo(() => ({ ...forms.host, lit }), [forms.host, lit]);
  return { opened, show, forms, host };
}

/** You's moves as the column's turns take them: deeper pushes, back pops, anything else is across. */
const YOU_WAYS = { deeper: "push", back: "pop", across: "across" } as const;
const YOU_WAY = (from: string, to: string): Way => YOU_WAYS[moveOf(from, to)];

/** The path of what the column shows: a person's page, a page, a form open from the list, or none. */
function viewAt(opened: Opened, page: boolean, form: boolean): string {
  if (page && opened.page === "people" && opened.person !== undefined) {
    return `people/${opened.person}`;
  }
  if (page && opened.page !== undefined) return opened.page;
  return form ? "form" : "~";
}

/**
 * The column beside the list: the page open, or a form's (drawn into the slot), or Nothing open;
 * in the list's place, only while something is open.
 */
function PaneColumn(props: {
  readonly split: boolean;
  readonly page: ReactNode;
  /** Which view the column shows, by its path (`motion.ts`): the page, a form's, or Nothing open. */
  readonly at: string;
  readonly form: boolean;
  readonly slot: (element: HTMLElement | null) => void;
}) {
  const { split, page, form } = props;
  const empty = page === undefined && !form;
  return (
    <div className="you-pane-col" hidden={!split && empty}>
      {/* A page swapped for another turns (`Turns`): pushed, popped, or across, as the iPad's do. */}
      <Turns at={props.at} depth={0} way={YOU_WAY} name="you">
        {split && empty ? <PaneEmpty /> : page}
      </Turns>
      <div ref={props.slot} className="you-pane-slot" />
    </div>
  );
}

/** The workspace as a sentence names it, and as its heading does: the name alone (ADR 0194). */
function workspaceWords(name: string | undefined) {
  return { workspace: name ?? "this workspace", heading: name ?? "This workspace" };
}

/** The version box's words for feedback: "Chips 0.0.0 · b888e96 · Mac". */
function versionWords(desktop: boolean): string {
  return `${BUILD} · ${desktop ? "Mac" : "web"}`;
}

/** Owner · Demo, or a guest's one space: what the reader is here, under their name. */
function standingOf(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  heading: string,
): string {
  const role = myRole(model, selfId);
  const guest = role === "guest" ? guestStandingWords(model, directory, selfId) : undefined;
  return guest ?? standingWords(role, heading);
}

/**
 * The owner's Relay row, where the server has a relay: the workspace's word on it wins once
 * anybody has turned it, on any device. Sent here by the setup card's Away from home (ADR 0245),
 * Relay opens, and lights.
 */
function useRelayLine(
  props: YouProps,
  role: WorkspaceRole | undefined,
  onReveal: () => void,
): { readonly on: boolean } | undefined {
  const owner = role === "owner";
  const read = useRelayRow(owner ? props.relay : undefined, props.connected);
  const reveal = props.relay?.reveal ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each ask opens it once
  useEffect(() => {
    if (reveal !== 0) onReveal();
  }, [reveal]);
  if (!owner || props.relay === undefined || read?.configured !== true) return undefined;
  return { on: props.model.relay?.on ?? read.on };
}

/** This computer, or this browser: the server it talks to, the way it goes, and the build. */
function ThisDevice(props: {
  readonly desktop: boolean;
  readonly serverHost: string;
  readonly way: WayFacts | undefined;
  readonly chosen: boolean;
  readonly onConnection: () => void;
}) {
  const { way } = props;
  const name = props.desktop ? "This computer" : "This browser";
  return (
    <Group heading={name} label={name} testId="about">
      <ListRow
        label="Server"
        sub={props.serverHost}
        mark={<RowMark icon="globe" />}
        testId="about-server"
      />
      {way !== undefined && (
        <ListRow
          label="Connection"
          value={WAY_VALUE[wayOf(way.connection, way.link)]}
          mark={<RowMark icon="pulse" />}
          onOpen={props.onConnection}
          selected={props.chosen}
          testId="about-connection"
        />
      )}
      <ListRow
        label="Version"
        sub={`${__CHIPS_VERSION__} · ${__CHIPS_COMMIT__}`}
        mark={<RowMark icon="info" />}
        testId="build"
      />
    </Group>
  );
}

/** At the foot, as the phone has it: Sign out, and Delete your account under it (ADR 0243). */
function SignOut(props: YouProps & { readonly heading: string; readonly workspace: string }) {
  const thisHere = props.desktop ? "this computer" : "this browser";
  const several = (props.workspaces?.length ?? 0) > 1;
  return (
    <Group
      label="Sign out"
      testId="your-account"
      foot={
        several
          ? `Only ${props.heading} leaves ${thisHere}. The other workspaces here stay.`
          : "Sign out leaves the workspace as it is."
      }
    >
      <ListRow
        label={`Sign out of ${thisHere}`}
        tone="danger"
        onOpen={() => props.onSignOut()}
        bare
        testId="sign-out"
      />
      {props.onDeleteAccount !== undefined && (
        <DeleteAccountRow
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          workspace={props.workspace}
          people={props.people}
          onDelete={props.onDeleteAccount}
        />
      )}
    </Group>
  );
}

/** The pages other than People's, each where this device has what it needs. */
function pagesOf(
  props: YouProps,
  links: ReturnType<typeof useLinks>,
  workspace: string,
  standing: string,
) {
  const { model, directory, selfId, way } = props;
  return {
    face: (
      <YourFace
        name={nameOf(directory, selfId)}
        standing={standing}
        face={directory[selfId]?.face}
        save={props.people.setMyFace}
      />
    ),
    invite: (
      <InvitePage
        service={props.people}
        links={links}
        model={model}
        directory={directory}
        selfId={selfId}
        workspace={workspace}
      />
    ),
    relay:
      props.relay === undefined ? undefined : (
        <RelayPage service={props.relay} directory={directory} selfId={selfId} />
      ),
    connection:
      way === undefined ? undefined : <ConnectionPage way={way} desktop={props.desktop} />,
    log: (
      <Log model={model} directory={directory} onOpen={(spaceId) => props.onOpenSpace?.(spaceId)} />
    ),
  };
}

const TITLES: Readonly<Record<YouPage, string>> = {
  face: FACE_PICKER_WORDS.yourFace,
  people: "People",
  invite: "Invite someone",
  relay: "Relay",
  connection: "Connection",
  log: "Workspace log",
};

/**
 * The page open, in its pane: under its name, with the way back where there is one — to People
 * from a person, and to You from any page where it stands in the list's place.
 */
function pageOf(
  opened: Opened,
  parts: {
    readonly split: boolean;
    readonly peopleProps: PeopleProps;
    /** A person's page from People, or back to People's list. */
    readonly onPerson: (id: string | undefined) => void;
    readonly onBack: () => void;
    readonly face: ReactNode;
    readonly invite: ReactNode;
    readonly relay: ReactNode | undefined;
    readonly connection: ReactNode | undefined;
    readonly log: ReactNode;
  },
): ReactNode {
  const { page, person } = opened;
  if (page === undefined) return undefined;
  const toYou = parts.split ? {} : { back: "You", onBack: parts.onBack };
  if (page === "people" && person !== undefined) {
    const { directory } = parts.peopleProps;
    return (
      <Pane
        key={`person-${person}`}
        path={`people/${person}`}
        title={nameOf(directory, person)}
        back="People"
        onBack={() => parts.onPerson(undefined)}
        testId="you-pane"
      >
        <PersonPage
          {...parts.peopleProps}
          personId={person}
          onGone={() => parts.onPerson(undefined)}
        />
      </Pane>
    );
  }
  const body =
    page === "people" ? (
      <PeoplePage {...parts.peopleProps} onPerson={parts.onPerson} />
    ) : (
      parts[page]
    );
  if (body === undefined) return undefined;
  return (
    <Pane key={page} path={page} title={TITLES[page]} testId="you-pane" {...toYou}>
      {body}
    </Pane>
  );
}
