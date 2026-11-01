/**
 * You: the person this device speaks as, and what is theirs (ADR 0034), as a settings list (ADR
 * 0085) — one column of cards, in the phone's order. The person's own things first: their face,
 * name and role, and signing out; this computer's appearance; their notifications; their
 * devices, and which way this one reaches the server (ADR 0211); their passkeys, where a passkey
 * can work; and deleting their account (ADR 0243). Then, under the workspace's name and only
 * for its owners and admins, what is everyone's: the people, the invites, the relay (an owner's),
 * Connect a harness, the attachment limits. Send feedback stands over that heading, after this
 * device's own cards, once the repository is public (ADR 0237). A quiet line at the foot says which
 * build this is, and which server it talks to.
 *
 * Every list is fetched when the screen opens, and again each time the connection does, rather
 * than kept in the fold: passkeys, devices and invites are registry rows, not events, so nothing
 * streams them.
 */

import {
  type Directory,
  feedbackAgent,
  mayRenameWorkspace,
  myRole,
  nameOf,
  type SetRulesInput,
  type WorkspaceModel,
  type WorkspaceRole,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { ConnectionCard, type WayFacts } from "./you/ConnectionCard.tsx";
import { DeleteAccount } from "./you/DeleteAccount.tsx";
import { Devices, Passkeys } from "./you/Devices.tsx";
import { FeedbackCard, type FeedbackService } from "./you/Feedback.tsx";
import { Notifications } from "./you/Notifications.tsx";
import { Appearance, Profile } from "./you/Profile.tsx";
import type {
  LimitsService,
  NotificationsService,
  PeopleService,
  RelayService,
} from "./you/services.ts";
import { Workspace } from "./you/Workspace.tsx";

export type { FeedbackService } from "./you/Feedback.tsx";
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
   * name rather than an IP, and not the desktop app. Where one cannot, the card is not drawn.
   */
  readonly passkeysWork: boolean;
  /** Inside the desktop app: "this computer" rather than "this browser". */
  readonly desktop: boolean;
  /** The server this device talks to, for the foot of the screen. */
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
  /** Delete the person's own account (ADR 0243). Absent, the card is not drawn. */
  readonly onDeleteAccount?: (() => Promise<void>) | undefined;
  /** Notifications for this workspace on this device (M5.3): off, and nothing reaches a banner. */
  readonly muted?: boolean | undefined;
  readonly onMute?: ((muted: boolean) => void) | undefined;
  /** Tiers, quiet hours and a word per harness (M5.6). Absent, those rows are not drawn. */
  readonly notifications?: NotificationsService | undefined;
  /** What may be attached here (ADR 0047). Absent, the card is not drawn. */
  readonly limits?: LimitsService | undefined;
  /** Open the Agents page with Connect a harness up (ADR 0185's addendum). Absent, no card. */
  readonly onConnectHarness?: (() => void) | undefined;
  /** Send a harness's rules changed, from the Allowed always card (ADR 0195). Absent, no card. */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  /** The faces this person chose for rooms, which a person's spaces wear (ADR 0209's addendum). */
  readonly spaceIcons?: ReadonlyMap<string, SpaceIcon> | undefined;
  /** Open a room from a person's spaces. Absent, the rooms are only listed. */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  /** Which way this device reaches its server (ADR 0211). Absent, the card is not drawn. */
  readonly way?: WayFacts | undefined;
  /** The owner's relay switch (ADR 0211, Phase 4). Absent, the card is not drawn. */
  readonly relay?: RelayService | undefined;
  /**
   * Send feedback (ADR 0237): absent while its switch is off, until the repository is public, and
   * then the card is not drawn.
   */
  readonly feedback?: FeedbackService | undefined;
}

/** "Chips 0.0.0 · b888e96": the build, as `vite.config.ts` wrote it in. */
export const BUILD = `Chips ${__CHIPS_VERSION__} · ${__CHIPS_COMMIT__}`;

export function You(props: YouProps) {
  const { model, directory, selfId } = props;
  const role = myRole(model, selfId);
  // The workspace as a sentence names it, and as its heading does: the name alone, which is the
  // field an owner changes it in (ADR 0194).
  const workspace = props.workspaceName ?? "this workspace";
  const heading = props.workspaceName ?? "This workspace";
  return (
    <main className="conv you" aria-label="You">
      <h1 className="ui-visually-hidden">You</h1>
      <div className="you-body">
        <div className="you-column">
          <Profile
            name={nameOf(directory, selfId)}
            face={directory[selfId]?.face}
            role={role}
            workspace={workspace}
            desktop={props.desktop}
            rename={props.people.rename}
            onSignOut={props.onSignOut}
          />
          <Appearance
            desktop={props.desktop}
            me={{ name: nameOf(directory, selfId), face: directory[selfId]?.face }}
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
          <Devices service={props.people} connected={props.connected} desktop={props.desktop} />
          {props.way !== undefined && <ConnectionCard way={props.way} desktop={props.desktop} />}
          {props.passkeysWork && <Passkeys service={props.people} connected={props.connected} />}
          {props.onDeleteAccount !== undefined && (
            <DeleteAccount
              model={model}
              directory={directory}
              selfId={selfId}
              workspace={workspace}
              people={props.people}
              onDelete={props.onDeleteAccount}
            />
          )}
          {props.feedback !== undefined && (
            <FeedbackCard
              agent={feedbackAgent(model, directory, selfId)}
              directory={directory}
              version={`${BUILD} · ${props.desktop ? "Mac" : "web"}`}
              service={props.feedback}
            />
          )}
          <Workspace
            model={model}
            directory={directory}
            selfId={selfId}
            role={role}
            workspace={workspace}
            heading={heading}
            onRename={mayRenameWorkspace(role) ? props.people.renameWorkspace : undefined}
            busy={props.busy}
            people={props.people}
            connected={props.connected}
            limits={props.limits}
            onConnectHarness={props.onConnectHarness}
            onSetRules={props.onSetRules}
            onChangeRole={props.onChangeRole}
            onRemovePerson={props.onRemovePerson}
            spaceIcons={props.spaceIcons}
            onOpenSpace={props.onOpenSpace}
            relay={props.relay}
          />
          <p className="you-foot" data-testid="build">
            {BUILD} · {props.serverHost}
          </p>
        </div>
      </div>
    </main>
  );
}
