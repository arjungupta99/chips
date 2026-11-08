/**
 * The workspace's part of You, for its owners and admins only (ADR 0034, ADR 0047, ADR 0085, ADR
 * 0265): a group under the workspace's own name, apart from the person's things above it, because
 * it is everyone's: a change here changes it for every person in the workspace. As on the phone,
 * each row says what it is set to and opens what sets it: People, Invite someone (an owner's) and
 * Relay (an owner's, where the server has one) open their pages beside the list, as does the
 * workspace's log (ADR 0261); Connect a harness opens the Agents page with its dialog up; the
 * attachment limits, when Chips steps in on agents talking to each other (ADR 0187) and what each
 * harness is allowed always (ADR 0195) open as forms, on pages beside it too (ADR 0265's addendum).
 *
 * A person opens from People as their own page, as on the phone: what they can do, their role in
 * the workspace and the link they came by, the spaces the reader shares with them, their devices,
 * and New phone… and Remove… where the reader may (ADR 0209, ADR 0206, ADR 0160).
 */

import {
  administers,
  alwaysSummary,
  cameBy,
  cameByWords,
  canDo,
  capsDraft,
  capsFromDraft,
  capsSentence,
  capsWords,
  type Directory,
  deviceKind,
  harnessesOf,
  type Invite,
  type IssuedInvite,
  inFilter,
  invitedByWords,
  inviteIntoWords,
  inviteSpaces,
  inviteUsesMeans,
  inviteUseWords,
  joinedBy,
  lastSeenOf,
  leftWords,
  lifeLeft,
  limitsWords,
  linkEnding,
  liveInvites,
  mayInvite,
  mayPairFor,
  mayRemovePerson,
  maySignOutDevicesOf,
  myRole,
  nameOf,
  namesWords,
  openLinksWords,
  type PairedDeviceRecord,
  type PeopleFilter,
  type PersonModel,
  peopleFilters,
  peopleOf,
  ROLE_WORDS,
  removePersonAsking,
  roleChangeAsking,
  roleChangeSees,
  roleCountWords,
  rolesOffered,
  type SetRulesInput,
  SPACE_INVITE_ROLES,
  type Space,
  type StopLetWorkInput,
  selfLabel,
  sharedSpaces,
  sortDevices,
  spacesLine,
  spacesShared,
  spaceTitle,
  usedInvites,
  type WorkspaceModel,
  type WorkspaceRole,
} from "@chipschat/core";
import {
  CAP_KINDS,
  CAP_WORDS,
  type CapKind,
  type AttachmentCaps as Caps,
  capsOverCeiling,
  FIRST_PERSON_NAME,
  type SpaceIcon,
} from "@chipschat/protocol";
import { Button } from "@chipschat/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { NotInDemo, useNotInDemo } from "../demo/NotInDemo.tsx";
import { spaceAvatar } from "../Sidebar.tsx";
import { dayWords, shortDayWords, untilWords } from "../time.ts";
import { AllowedAlwaysForm } from "./AllowedAlways.tsx";
import { Choice, Problem } from "./controls.tsx";
import { IssuedCodeView, KindMark, seenWords, usePairing } from "./Devices.tsx";
import { ExchangeLimitsForm } from "./ExchangeLimits.tsx";
import { FormPage } from "./Form.tsx";
import { Group, HUES, ListRow, RowMark } from "./list.tsx";
import {
  CanList,
  Face,
  FaceStack,
  FilterChips,
  InviteSeesView,
  IssuedInviteView,
  LifeRing,
  RoleTag,
} from "./PeopleParts.tsx";
import type { YouPage } from "./pane.tsx";
import type { LimitsService, PeopleService } from "./services.ts";
import { useList } from "./useList.ts";

/** The workspace's links, read for an owner: People says who came by which, Invite lists them. */
export type Links = ReturnType<typeof useLinks>;

/** Which form of the group's is up, and the row it grew out of. */
type Open = { readonly form: "caps" | "talk" | "always"; readonly from: HTMLElement } | undefined;

/**
 * The workspace's heading and its rows, or nothing for a member or a guest. The heading is the
 * workspace's name alone; an owner changes it from the Workspace row at the top (ADR 0194, as the
 * phone has it since 20 October 2026).
 */
export function WorkspaceGroup(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly role: WorkspaceRole | undefined;
  readonly heading: string;
  readonly links: Links;
  readonly connected: boolean;
  readonly limits: LimitsService | undefined;
  /** The page open beside the list, which its row wears the chosen ground for. */
  readonly opened: YouPage | undefined;
  readonly onOpen: (page: YouPage) => void;
  /** The relay's row, an owner's where the server has a relay (ADR 0211): On or Off. */
  readonly relay?: { readonly on: boolean } | undefined;
  /** Open the Agents page with Connect a harness up. Absent, no row. */
  readonly onConnectHarness?: (() => void) | undefined;
  /** Whether the workspace's log has a row (ADR 0261). */
  readonly log: boolean;
  /** Send a harness's rules changed (ADR 0195): Allowed always's form. Absent, no row. */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  /** Stop an agent working without asking, from Allowed always (ADR 0281). */
  readonly onStopLetWork?: ((input: StopLetWorkInput) => void) | undefined;
  /** Opens an ask's space, from every ask so far on Allowed always (ADR 0255). */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
}) {
  const { model, directory, onConnectHarness } = props;
  // In the demo, connecting a harness needs a server of your own (ADR 0213, point 7).
  const setUp = useNotInDemo();
  if (!administers(props.role)) return null;
  const people = peopleOf(model);
  const invites = mayInvite(props.role);
  const linksSaid =
    props.links.items === undefined
      ? undefined
      : openLinksWords(liveInvites(props.links.items, Date.now()), Date.now());
  const page = (which: YouPage) => ({
    onOpen: () => props.onOpen(which),
    selected: props.opened === which,
  });
  return (
    <Group
      heading={props.heading}
      aside={<small>Owners and admins</small>}
      label={props.heading}
      testId="workspace"
    >
      <ListRow
        label="People"
        sub={roleCountWords(model)}
        mark={<RowMark icon="user" tint={HUES.leaf} />}
        trailing={
          <FaceStack
            directory={directory}
            ids={people.map((each) => each.participantId)}
            most={4}
          />
        }
        {...page("people")}
        testId="people-row"
      />
      {invites && (
        <ListRow
          label="Invite someone"
          sub={linksSaid}
          mark={<RowMark icon="mail" tint={HUES.teal} />}
          {...page("invite")}
          testId="invite-someone"
        />
      )}
      {props.relay !== undefined && (
        <ListRow
          label="Relay"
          value={props.relay.on ? "On" : "Off"}
          mark={<RowMark icon="route" tint={HUES.violet} />}
          {...page("relay")}
          testId="relay-row-open"
        />
      )}
      {onConnectHarness !== undefined && (
        <ListRow
          label="Connect a harness"
          mark={<RowMark icon="terminal" tint={HUES.terminal} />}
          trailing={setUp === undefined ? undefined : <NotInDemo onSetUp={setUp} />}
          onOpen={setUp === undefined ? () => onConnectHarness() : undefined}
          testId="connect-harness"
        />
      )}
      <WorkspaceSettings
        model={model}
        directory={directory}
        selfId={props.selfId}
        limits={props.limits}
        connected={props.connected}
        onSetRules={props.onSetRules}
        onStopLetWork={props.onStopLetWork}
        onOpenSpace={props.onOpenSpace}
      />
      {props.log && (
        <ListRow
          label="Workspace log"
          mark={<RowMark icon="list" tint={HUES.blue} />}
          {...page("log")}
          testId="workspace-log"
        />
      )}
    </Group>
  );
}

/** The server's ceiling on an attachment, read each time the connection opens. */
/**
 * The workspace's settings that are a short form each, on a page beside the list:
 * what may be attached, when Chips steps in on agents talking (ADR 0187), and Allowed always
 * (ADR 0195).
 */
function WorkspaceSettings(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly limits: LimitsService | undefined;
  readonly connected: boolean;
  readonly onSetRules: ((input: SetRulesInput) => void) | undefined;
  readonly onStopLetWork: ((input: StopLetWorkInput) => void) | undefined;
  readonly onOpenSpace: ((spaceId: string) => void) | undefined;
}) {
  const { model, directory, limits, onSetRules } = props;
  const [open, setOpen] = useState<Open>(undefined);
  const ceiling = useCeiling(limits, props.connected);
  const gone = () => setOpen(undefined);
  return (
    <>
      {limits !== undefined && (
        <>
          <ListRow
            label="Attachment limits"
            value={capsWords(model.attachmentCaps, ceiling)}
            mark={<RowMark icon="clip" tint={HUES.clay} />}
            onOpen={(from) => setOpen({ form: "caps", from })}
            testId="caps-row"
          />
          <ListRow
            label="Messages between agents"
            sub={limitsWords(model.exchangeLimits)}
            mark={<RowMark icon="chat" tint={HUES.pink} />}
            onOpen={(from) => setOpen({ form: "talk", from })}
            testId="exchange-limits-row"
          />
        </>
      )}
      {onSetRules !== undefined && (
        <ListRow
          label="Allowed always"
          value={alwaysSummary(model, directory)}
          mark={<RowMark icon="unlock" tint={HUES.green} />}
          onOpen={(from) => setOpen({ form: "always", from })}
          testId="allowed-always-row"
        />
      )}
      {open?.form === "caps" && limits !== undefined && (
        <CapsForm
          from={open.from}
          caps={model.attachmentCaps}
          ceiling={ceiling}
          onSave={limits.set}
          onGone={gone}
        />
      )}
      {open?.form === "talk" && limits !== undefined && (
        <ExchangeLimitsForm
          from={open.from}
          limits={model.exchangeLimits}
          onSave={limits.setExchange}
          onGone={gone}
        />
      )}
      {open?.form === "always" && onSetRules !== undefined && (
        <AllowedAlwaysForm
          from={open.from}
          model={model}
          directory={directory}
          selfId={props.selfId}
          onSetRules={onSetRules}
          onStopLetWork={props.onStopLetWork}
          onOpenSpace={props.onOpenSpace}
          onGone={gone}
        />
      )}
    </>
  );
}

function useCeiling(limits: LimitsService | undefined, connected: boolean): number | undefined {
  const [ceiling, setCeiling] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (limits === undefined || !connected) return;
    let live = true;
    limits.ceiling().then(
      (found) => {
        if (live) setCeiling(found);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [limits, connected]);
  return ceiling;
}

/** What People and a person's page are drawn from. */
export interface PeopleProps {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly role: WorkspaceRole | undefined;
  readonly workspace: string;
  readonly busy: ReadonlySet<string>;
  readonly people: PeopleService;
  readonly connected: boolean;
  /** The workspace's links, an owner's to read: which one brought each person. */
  readonly links: Links;
  readonly onChangeRole: (participantId: string, role: WorkspaceRole) => void;
  readonly onRemovePerson: (participantId: string) => Promise<void>;
  readonly spaceIcons?: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
}

/**
 * Everyone in the workspace, the longest here first (ADR 0209): each row their face, the spaces
 * the reader shares with them and when they joined, and their role as a tag in its own colour;
 * filters over the list narrow it by role. A row opens the person's page.
 */
export function PeoplePage(props: PeopleProps & { readonly onPerson: (id: string) => void }) {
  const { model, directory, selfId } = props;
  const people = peopleOf(model);
  const chips = peopleFilters(people);
  const [filter, setFilter] = useState<PeopleFilter>("all");
  // A filter whose last person left falls back to everybody.
  const chosen = chips.some((each) => each.key === filter) ? filter : "all";
  const shown = people.filter((each) => inFilter(each, chosen));
  return (
    <div className="you-page" data-testid="people">
      {chips.length > 2 && (
        <FilterChips label="Show" chips={chips} chosen={chosen} onChoose={setFilter} />
      )}
      <div className="you-gcard people-list">
        {shown.map((person) => (
          <PersonRow
            key={person.participantId}
            person={person}
            model={model}
            directory={directory}
            selfId={selfId}
            onOpen={() => props.onPerson(person.participantId)}
          />
        ))}
      </div>
      <p className="you-gfoot">
        {people.length === 1 ? "1 person" : `${people.length} people`} in {props.workspace}.
      </p>
    </div>
  );
}

function PersonRow(props: {
  readonly person: PersonModel;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onOpen: () => void;
}) {
  const { person, model, directory, selfId } = props;
  const id = person.participantId;
  const name = nameOf(directory, id);
  const where = spacesLine(spacesShared(model, directory, id, selfId));
  return (
    <button
      type="button"
      className="you-lrow person-row"
      onClick={props.onOpen}
      data-testid="person-row"
      data-participant={id}
      data-role={person.role}
    >
      <Face directory={directory} id={id} size="sm" />
      <span className="you-lrow-lab">
        <span>{id === selfId ? selfLabel(name) : name}</span>
        <small>
          {where === undefined
            ? seenWords("Joined", person.joinedAt)
            : `${where} · ${seenWords("joined", person.joinedAt)}`}
        </small>
      </span>
      <RoleTag role={person.role} />
      <span className="you-chev" aria-hidden="true" />
    </button>
  );
}

/**
 * A person's page (ADR 0209), as the phone pushes it from People: who they are and since when,
 * what they can and can't do, their role here — the picker where the reader may change it — and
 * the link they came by, the spaces the reader shares with them, their devices with Reconnect… and
 * Sign out where the reader may, and New phone… and Remove….
 */
export function PersonPage(
  props: PeopleProps & { readonly personId: string; readonly onGone: () => void },
) {
  const { model, directory, selfId, personId } = props;
  const person = model.people[personId];
  // Whose new phone a code is up for (ADR 0206).
  const [phoneFor, setPhoneFor] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [changing, setChanging] = useState<WorkspaceRole | undefined>(undefined);
  const { onGone } = props;
  // Removed while their page was open, on this device or another: back to People.
  useEffect(() => {
    if (person === undefined) onGone();
  }, [person, onGone]);
  if (person === undefined) return null;
  const self = personId === selfId;
  const name = nameOf(directory, personId);
  const busy = props.busy.has(personId);
  const said = self ? "What you can do" : `What ${name} can do`;
  const names = (ids: readonly string[]) => ids.map((id) => nameOf(directory, id));
  const mayRemove = mayRemovePerson(model, personId, selfId);
  const mayPair = mayPairFor(model, personId, selfId);
  return (
    <div
      className="you-page person-page"
      data-testid="person-details"
      data-participant={personId}
      data-role={person.role}
    >
      <PersonHead person={person} directory={directory} selfId={selfId} />
      <h3 className="you-page-h">{said}</h3>
      <div className="you-gcard person-can">
        <CanList
          lines={canDo(model, directory, personId, { selfId, workspace: props.workspace })}
          directory={directory}
          label={said}
        />
      </div>
      <PersonStanding {...props} person={person} name={name} onChange={setChanging} />
      <SharedSpaces
        heading={self ? "Your spaces" : "Spaces you share"}
        spaces={sharedSpaces(model, personId, selfId)}
        directory={directory}
        selfId={selfId}
        icons={props.spaceIcons}
        onOpen={props.onOpenSpace}
      />
      {!self && (
        <TheirDevices
          personId={personId}
          name={name}
          service={props.people}
          connected={props.connected && administers(props.role)}
          reconnects={mayPair}
          signsOut={maySignOutDevicesOf(model, personId, selfId)}
        />
      )}
      {(mayPair || mayRemove) && (
        <div className="person-actions">
          {mayPair && (
            <NewPhoneButton name={name} busy={busy} onNewPhone={() => setPhoneFor(true)} />
          )}
          {mayRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="person-remove"
              disabled={busy}
              onClick={() => setRemoving(true)}
              aria-label={`Remove ${name}…`}
              data-testid="remove-person"
            >
              Remove from {props.workspace}…
            </Button>
          )}
        </div>
      )}
      {phoneFor && (
        <NewPhone
          personId={personId}
          name={name}
          service={props.people}
          onDone={() => setPhoneFor(false)}
        />
      )}
      {changing !== undefined && (
        <ConfirmDialog
          asking={(() => {
            const sees = roleChangeSees(model, directory, personId, changing, selfId);
            return roleChangeAsking({
              name,
              to: changing,
              yourself: self,
              sees: {
                ...sees,
                stops: names(sees.stops),
                starts: names(sees.starts),
                there: names(sees.there),
              },
            });
          })()}
          danger={false}
          onCancel={() => setChanging(undefined)}
          onConfirm={async () => {
            props.onChangeRole(personId, changing);
            setChanging(undefined);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          asking={removePersonAsking({
            name,
            workspace: props.workspace,
            harnesses: harnessesOf(directory, personId),
          })}
          danger
          cancel="Keep"
          tooOld="Not removed: this server is older than the app, and cannot remove a person yet."
          onCancel={() => setRemoving(false)}
          onConfirm={async () => {
            await props.onRemovePerson(personId);
            setRemoving(false);
          }}
        />
      )}
    </div>
  );
}

/** Their face and name, since when and by whom, and their role's tag. */
function PersonHead(props: {
  readonly person: PersonModel;
  readonly directory: Directory;
  readonly selfId: string;
}) {
  const { person, directory, selfId } = props;
  const id = person.participantId;
  const name = nameOf(directory, id);
  return (
    <div className="person-head">
      <Face directory={directory} id={id} size="lg" />
      <span className="you-lrow-lab">
        <b>{id === selfId ? selfLabel(name) : name}</b>
        <small>
          Joined {dayWords(person.joinedAt)}
          {person.invitedBy === undefined
            ? ""
            : ` · invited by ${invitedByWords(person.invitedBy, selfId, directory)}`}
        </small>
      </span>
      <RoleTag role={person.role} />
    </div>
  );
}

/**
 * Their role here, the picker where the reader may change it and the word where not (the one
 * owner's can't be), and the link they came by.
 */
function PersonStanding(
  props: PeopleProps & {
    readonly person: PersonModel;
    readonly name: string;
    readonly onChange: (role: WorkspaceRole) => void;
  },
) {
  const { person, model, directory, selfId, name } = props;
  const owners = peopleOf(model).filter((each) => each.role === "owner").length;
  const choices = rolesOffered(props.role, person, owners);
  const came = cameLine(person, props.links.items, model, directory, selfId);
  return (
    <>
      <h3 className="you-page-h">In {props.workspace}</h3>
      <div className="you-gcard">
        <ListRow
          label="Role"
          trailing={
            choices.length > 1 ? (
              <span className={`role-pick you-role-${person.role}`}>
                <Choice
                  label={`${name}'s role`}
                  value={person.role}
                  options={choices.map((role) => [role, ROLE_WORDS[role]] as const)}
                  disabled={props.busy.has(person.participantId)}
                  onChange={props.onChange}
                />
              </span>
            ) : (
              <span className="you-lrow-val">{ROLE_WORDS[person.role]}</span>
            )
          }
          testId="person-role"
        />
        {came !== undefined && (
          <ListRow label="Came by" sub={<span data-testid="person-came-by">{came}</span>} />
        )}
      </div>
    </>
  );
}

/**
 * The rooms you share with them, each with the face the rail draws for it and its name (ADR 0209's
 * addendum): a click opens the room.
 */
function SharedSpaces(props: {
  readonly heading: string;
  readonly spaces: readonly Space[];
  readonly directory: Directory;
  readonly selfId: string;
  readonly icons: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly onOpen: ((spaceId: string) => void) | undefined;
}) {
  const { onOpen } = props;
  return (
    <section className="person-spaces" aria-label={props.heading} data-testid="person-spaces">
      <h4>{props.heading}</h4>
      {props.spaces.length === 0 ? (
        <p className="you-card-note" data-testid="person-no-spaces">
          None yet.
        </p>
      ) : (
        <ul>
          {props.spaces.map((space) => {
            const title = spaceTitle(space, props.directory, props.selfId);
            return (
              <li key={space.id}>
                <button
                  type="button"
                  className="person-space"
                  disabled={onOpen === undefined}
                  onClick={() => onOpen?.(space.id)}
                  data-testid="person-space"
                  data-space={space.id}
                >
                  {spaceAvatar(
                    space,
                    props.directory,
                    title,
                    props.icons?.get(space.id),
                    false,
                    "sm",
                  )}
                  <span>{title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "Your member link to Foodie, made 14 October", where an owner can read the links. */
function cameLine(
  person: PersonModel,
  invites: readonly Invite[] | undefined,
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): string | undefined {
  if (invites === undefined) return undefined;
  const invite = cameBy(person, invites);
  if (invite === undefined) return undefined;
  const space = model.spaces.find((each) => each.id === invite.spaceId);
  return cameByWords({
    invite,
    by: invitedByWords(invite.createdBy, selfId, directory) ?? "",
    space: space === undefined ? undefined : spaceTitle(space, directory, selfId),
    made: dayWords(invite.createdAt),
  });
}

/** The phone a reconnect code is for (ADR 0236): the device whose Reconnect… was chosen. */
interface Reconnecting {
  readonly deviceId: string;
  readonly name: string;
}

/**
 * The devices still signed in as somebody else, the most recently seen first, and when each was
 * last seen (ADR 0209): an owner's or an admin's to read. Nothing while unread, or refused.
 *
 * And what to do about one (ADR 0236), as on the phone: Reconnect… for an owner, a code whose
 * phone takes this one's place when Chips was deleted from it, and Sign out for an owner, or an
 * admin for anybody but an owner. Not in the demo, which has no server to pair a phone with.
 */
function TheirDevices(props: {
  readonly personId: string;
  readonly name: string;
  readonly service: PeopleService;
  readonly connected: boolean;
  readonly reconnects: boolean;
  readonly signsOut: boolean;
}) {
  const { personDevices, revokeDevice } = props.service;
  const { personId } = props;
  const read = useCallback(() => personDevices(personId), [personDevices, personId]);
  const { items, busy, error, act, reload } = useList(read, props.connected);
  const [reconnecting, setReconnecting] = useState<Reconnecting | undefined>(undefined);
  const demo = useNotInDemo() !== undefined;
  if (items === undefined) return null;
  const now = Date.now();
  const { recent, stale } = sortDevices(items, now);
  const devices = [...recent, ...stale];
  return (
    <section className="person-devices" aria-label="Devices" data-testid="person-devices">
      <h4>Devices</h4>
      {devices.length === 0 ? (
        <p className="you-card-note" data-testid="person-no-devices">
          No device signed in.
        </p>
      ) : (
        <ul>
          {devices.map((device) => (
            <TheirDevice
              key={device.deviceId}
              device={device}
              now={now}
              busy={busy}
              onReconnect={
                props.reconnects && !demo
                  ? () => setReconnecting({ deviceId: device.deviceId, name: device.name })
                  : undefined
              }
              onSignOut={
                props.signsOut && !demo
                  ? () => void act(() => revokeDevice(device.deviceId))
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      <Problem error={error} />
      {reconnecting !== undefined && (
        <NewPhone
          key={reconnecting.deviceId}
          personId={personId}
          name={props.name}
          service={props.service}
          replacing={reconnecting}
          onDone={() => {
            setReconnecting(undefined);
            void reload();
          }}
        />
      )}
    </section>
  );
}

/** One of their devices, when it was last seen, and Reconnect… and Sign out where the reader may. */
function TheirDevice(props: {
  readonly device: PairedDeviceRecord;
  readonly now: number;
  readonly busy: boolean;
  readonly onReconnect: (() => void) | undefined;
  readonly onSignOut: (() => void) | undefined;
}) {
  const { device } = props;
  return (
    <li data-testid="person-device" data-device={device.deviceId}>
      <KindMark kind={deviceKind(device.name)} />
      <span className="person-device-name">{device.name}</span>
      <small>{seenWords("Seen", lastSeenOf(device), props.now)}</small>
      {(props.onReconnect !== undefined || props.onSignOut !== undefined) && (
        <span className="person-device-acts">
          {props.onReconnect !== undefined && (
            <Button
              size="sm"
              disabled={props.busy}
              onClick={props.onReconnect}
              aria-label={`Reconnect ${device.name}…`}
              data-testid="reconnect-device"
            >
              Reconnect…
            </Button>
          )}
          {props.onSignOut !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              disabled={props.busy}
              onClick={props.onSignOut}
              aria-label={`Sign out ${device.name}`}
              data-testid="sign-out-device"
            >
              Sign out
            </Button>
          )}
        </span>
      )}
    </li>
  );
}

/**
 * A new phone for somebody already here (ADR 0206): the code that pairs a phone as them, its QR
 * for their Welcome screen's camera, and the app's link to send when the phone is not here.
 * Natalie, 19 October 2026: Chips deleted from her phone, no passkey, and her invite refused by
 * her own name.
 *
 * Or, `replacing` one of their devices (ADR 0236), the same code naming it: the phone that uses
 * it takes that one's place, which is signed out, rather than standing beside it as a second.
 */
function NewPhone(props: {
  readonly personId: string;
  readonly name: string;
  readonly service: PeopleService;
  readonly replacing?: Reconnecting | undefined;
  readonly onDone: () => void;
}) {
  const { issuePairingCode } = props.service;
  const { personId, replacing } = props;
  const pairing = usePairing(() => issuePairingCode(personId, replacing?.deviceId));
  const { issue } = pairing;
  const [copied, setCopied] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one code as the panel opens
  useEffect(() => {
    void issue();
  }, []);
  const appUrl = pairing.issued?.appUrl;
  return (
    <div
      className="new-phone"
      data-testid={replacing === undefined ? "new-phone-panel" : "reconnect-panel"}
    >
      <h4>
        {replacing === undefined ? `A new phone for ${props.name}` : `Reconnect ${replacing.name}`}
      </h4>
      <Problem error={pairing.error} />
      {pairing.issued !== undefined && <IssuedCodeView issued={pairing.issued} qr={pairing.qr} />}
      <p className="you-card-note">
        {replacing === undefined
          ? `On ${props.name}'s phone, open Chips and choose Scan a QR code. ${props.name} comes back as ${props.name}, in every space they were in.`
          : reconnectWords(props.name, replacing.name)}
      </p>
      {appUrl !== undefined && (
        <p className="you-card-note">
          Not beside you? Send them this link, to paste on Chips's first screen:{" "}
          <code className="pair-issued-url" data-testid="new-phone-link">
            {appUrl}
          </code>
        </p>
      )}
      <div className="new-phone-actions">
        {appUrl !== undefined && (
          <Button
            onClick={() => {
              navigator.clipboard.writeText(appUrl).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy the link"}
          </Button>
        )}
        <Button disabled={pairing.busy} onClick={() => void issue()}>
          Another code
        </Button>
        <Button variant="primary" onClick={props.onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** What to do with a reconnect code, and what the phone that uses it takes over (ADR 0236). */
function reconnectWords(name: string, phone: string): string {
  return `Chips deleted from it, or the phone reset? On it, open Chips and choose Scan a QR code. It takes this ${phone}'s place, with every space and everything ${name} said, and the old one is signed out.`;
}

const USES = [
  ["once", "Once"],
  ["open", "By several"],
] as const;

const OFFERED: readonly WorkspaceRole[] = ["owner", "admin", "member", "guest"];

/** No room, in the Into menu: the value its option carries. */
const NO_SPACE = "";

/**
 * The workspace's links, an owner's alone to read (ADR 0034's addendum of 14 October 2026), read
 * again when the people change: somebody joining spends a link or counts a use.
 */
export function useLinks(service: PeopleService, connected: boolean, directory: Directory) {
  const links = useList(service.invites, connected);
  const { reload } = links;
  const people = Object.values(directory).filter((each) => each.kind === "person").length;
  const counted = useRef(people);
  useEffect(() => {
    if (people === counted.current) return;
    counted.current = people;
    if (connected) void reload();
  }, [people, reload, connected]);
  return links;
}

/**
 * New phone… for somebody (ADR 0206); in the demo, where there is no server to pair a phone with,
 * not in the demo, with the way to set up your own (ADR 0213, point 7).
 */
function NewPhoneButton(props: {
  readonly name: string;
  readonly busy: boolean;
  readonly onNewPhone: () => void;
}) {
  const setUp = useNotInDemo();
  if (setUp !== undefined) return <NotInDemo onSetUp={setUp} />;
  return (
    <Button
      size="sm"
      disabled={props.busy}
      onClick={props.onNewPhone}
      aria-label={`A new phone for ${props.name}…`}
      data-testid="new-phone"
    >
      New phone…
    </Button>
  );
}

/**
 * Invite someone's page; in the demo, where a link would bring nobody to a server of yours, it says
 * it is not in the demo, with the way to set up your own (ADR 0213, point 7).
 */
export function InvitePage(props: Parameters<typeof Invites>[0]) {
  const setUp = useNotInDemo();
  if (setUp === undefined) return <Invites {...props} />;
  return (
    <div className="you-page" data-testid="invites">
      <NotInDemo onSetUp={setUp} />
    </div>
  );
}

/**
 * Invite someone, an owner's alone (ADR 0209): a link's role, the room it brings them into, how
 * often and how long; who and what they'll see, as faces that grow in and fold away as the
 * choices change, and a sentence; the link made, with its QR and the card it opens to; the links
 * still open, each with a ring of its time left; and the links somebody joined by, with who.
 */
function Invites(props: {
  readonly service: PeopleService;
  readonly links: Links;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
}) {
  const { service, model, directory, selfId } = props;
  const { items, busy, error, act } = props.links;
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [into, setInto] = useState<string>(NO_SPACE);
  const [uses, setUses] = useState<"once" | "open">("once");
  const [issued, setIssued] = useState<IssuedInvite | undefined>(undefined);
  const now = Date.now();
  const live = liveInvites(items ?? [], now);
  const used = usedInvites(model, items ?? []);
  const withdraw = (inviteId: string) =>
    act(async () => {
      await service.revokeInvite(inviteId);
      if (issued?.inviteId === inviteId) setIssued(undefined);
    });

  // Still called what the server first called them: whoever opens the link would read "You
  // invited you" (JR-17), so the card asks for a name first.
  const unnamed = nameOf(directory, selfId) === FIRST_PERSON_NAME;
  // A space's link names its room (ADR 0168), as the room is called here.
  const titleOf = (spaceId: string | undefined) => {
    if (spaceId === undefined) return undefined;
    const space = model.spaces.find((each) => each.id === spaceId);
    return space === undefined ? "a space" : spaceTitle(space, directory, selfId);
  };
  const rooms = inviteSpaces(model, directory, selfId);
  const placed = SPACE_INVITE_ROLES.includes(role);
  // A room picked, then a role that takes none: the link names none, and the pick waits.
  const spaceId = placed && rooms.some((each) => each.id === into) ? into : undefined;
  const room = titleOf(spaceId);

  return (
    <div className="you-page" data-testid="invites">
      <div className="you-card invite-card">
        {unnamed && (
          <p className="you-card-note" data-testid="name-first">
            Give yourself a name first, at the top of this page: whoever opens your link sees who
            sent it.
          </p>
        )}
        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              setIssued(await service.createInvite(role, uses === "once", spaceId));
            });
          }}
        >
          <div className="invite-choices">
            <span className="invite-choice">
              <span>As</span>
              <Choice
                label="Invite role"
                value={role}
                options={OFFERED.map((each) => [each, ROLE_WORDS[each]] as const)}
                onChange={setRole}
              />
            </span>
            {rooms.length > 0 && (
              <span className="invite-choice">
                <span>Into</span>
                <Choice
                  label="Invite into"
                  value={spaceId ?? NO_SPACE}
                  options={[
                    [NO_SPACE, "No space"] as const,
                    ...rooms.map((each) => [each.id, spaceTitle(each, directory, selfId)] as const),
                  ]}
                  disabled={!placed}
                  onChange={setInto}
                />
              </span>
            )}
            <span className="invite-choice">
              <span>Used</span>
              <Choice label="Invite uses" value={uses} options={USES} onChange={setUses} />
            </span>
          </div>
          {rooms.length > 0 && (
            <p className="you-card-note" data-testid="invite-into-means">
              {inviteIntoWords(role, room)}
            </p>
          )}
          <InviteSeesView
            model={model}
            directory={directory}
            workspace={props.workspace}
            role={role}
            spaceId={spaceId}
            room={room}
          />
          <div className="invite-go">
            <span className="you-card-note" data-testid="invite-uses-means">
              {inviteUsesMeans(uses)}
            </span>
            <Button type="submit" className="you-gold" disabled={busy} data-testid="make-invite">
              Make a link
            </Button>
          </div>
        </form>
        <Problem error={error} />
        {issued !== undefined && (
          <IssuedInviteView
            key={issued.inviteId}
            issued={issued}
            busy={busy}
            model={model}
            directory={directory}
            selfId={selfId}
            workspace={props.workspace}
            room={titleOf(issued.spaceId)}
            onWithdraw={() => void withdraw(issued.inviteId)}
            owner={myRole(model, selfId) === "owner"}
          />
        )}
      </div>
      {live.length > 0 && (
        <div className="you-card">
          <h4 className="invite-h" data-testid="open-links">
            Open links · {openLinksWords(live, now)}
          </h4>
          <ul className="you-list">
            {live.map((invite) => {
              const ending = linkEnding(invite, now);
              return (
                <li
                  key={invite.inviteId}
                  className={
                    invite.inviteId === issued?.inviteId
                      ? "you-row invite-row is-fresh"
                      : "you-row invite-row"
                  }
                  data-testid="invite-row"
                >
                  <LifeRing left={lifeLeft(invite, now)} ending={ending} />
                  <span className="you-row-lab">
                    <span>
                      {ROLE_WORDS[invite.role]}
                      {invite.spaceId === undefined ? "" : ` · into ${titleOf(invite.spaceId)}`}
                    </span>
                    <small>
                      <span className={ending ? "invite-ending" : undefined}>
                        {leftWords(invite.expiresAt, now)}
                      </span>{" "}
                      · {inviteUseWords(invite)}, by {nameOf(directory, invite.createdBy)},{" "}
                      {untilWords(invite.expiresAt, now)}
                    </small>
                  </span>
                  <Button disabled={busy} onClick={() => void withdraw(invite.inviteId)}>
                    Withdraw
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {used.length > 0 && (
        <div className="you-card">
          <h4 className="invite-h">Used</h4>
          <ul className="you-list" data-testid="used-links">
            {used.map((invite) => {
              const came = joinedBy(model, invite);
              return (
                <li key={invite.inviteId} className="you-row" data-testid="used-link">
                  <FaceStack
                    directory={directory}
                    ids={came.map((each) => each.participantId)}
                    most={3}
                  />
                  <span className="you-row-lab">
                    <span>
                      {ROLE_WORDS[invite.role]} link
                      {invite.spaceId === undefined ? "" : ` · into ${titleOf(invite.spaceId)}`}
                    </span>
                    <small>
                      {namesWords(came.map((each) => nameOf(directory, each.participantId)))} joined
                      by it, {shortDayWords(came[0]?.joinedAt ?? invite.createdAt)}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * How big a photo, a video or a file may be here (ADR 0047), as the phone's sheet sets it: three
 * fields in megabytes, blank for the server's own, and the caps in a sentence under them. A cap
 * typed above the server's ceiling is refused here, with the words the server would use, and the
 * form stays up with them.
 */
function CapsForm(props: {
  readonly from: HTMLElement;
  readonly caps: Caps;
  readonly ceiling: number | undefined;
  readonly onSave: (caps: Caps) => void;
  readonly onGone: () => void;
}) {
  const { caps, ceiling } = props;
  const [draft, setDraft] = useState<Record<CapKind, string>>(() => capsDraft(caps));
  const [error, setError] = useState<string | undefined>(undefined);
  // The server's word replaces the draft: what was saved, on any device, is what the fields show.
  useEffect(() => setDraft(capsDraft(caps)), [caps]);
  const save = (): boolean => {
    const read = capsFromDraft(draft);
    if ("error" in read) {
      setError(read.error);
      return false;
    }
    const over = ceiling === undefined ? undefined : capsOverCeiling(read.caps, ceiling);
    if (over !== undefined) {
      setError(over);
      return false;
    }
    props.onSave(read.caps);
    return true;
  };
  return (
    <FormPage
      title="Attachment limits"
      from={props.from}
      testId="attachment-caps"
      focus=".you-mb input"
      onSave={save}
      onGone={props.onGone}
    >
      {() => (
        <>
          <div className="you-form-group">
            {CAP_KINDS.map((kind) => (
              <label key={kind} className="you-form-row you-mb">
                <span>{capitalised(CAP_WORDS[kind].many)}</span>
                <span className="you-mb-field">
                  <input
                    type="number"
                    min={1}
                    step="any"
                    aria-label={capitalised(CAP_WORDS[kind].many)}
                    placeholder={
                      ceiling === undefined ? "–" : String(Math.round(ceiling / 1_048_576))
                    }
                    value={draft[kind]}
                    onChange={(event) => {
                      setDraft({ ...draft, [kind]: event.target.value });
                      setError(undefined);
                    }}
                  />
                  MB
                </span>
              </label>
            ))}
          </div>
          {error === undefined ? (
            <p className="you-form-foot" data-testid="caps-words">
              {capsSentence(caps, ceiling)} Blank is the server's own limit.
            </p>
          ) : (
            <p className="you-form-foot is-failed" role="alert" data-testid="caps-error">
              {error}
            </p>
          )}
        </>
      )}
    </FormPage>
  );
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
