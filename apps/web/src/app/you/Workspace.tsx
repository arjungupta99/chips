/**
 * The workspace's part of You, for its owners and admins only (ADR 0034, ADR 0047, ADR 0085):
 * who is in it and as what, the invites that bring more, how big an attachment may be, and when
 * Chips steps in on agents talking to each other (ADR 0187), and what each harness is allowed
 * always (ADR 0195). It
 * sits under the workspace's own name, apart from the person's things above it, because it is
 * everyone's: a change here changes it for every person in the workspace.
 */

import {
  administers,
  cameBy,
  cameByWords,
  canDo,
  capsDraft,
  capsFromDraft,
  capsSentence,
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
  rolesOffered,
  type SetRulesInput,
  SPACE_INVITE_ROLES,
  type Space,
  selfLabel,
  sharedSpaces,
  sortDevices,
  spacesLine,
  spacesShared,
  spaceTitle,
  usedInvites,
  type WorkspaceModel,
  type WorkspaceRole,
  workspaceHarnesses,
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
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { NotInDemo, useNotInDemo } from "../demo/NotInDemo.tsx";
import { spaceAvatar } from "../Sidebar.tsx";
import { dayWords, shortDayWords, untilWords } from "../time.ts";
import { AllowedAlwaysCard } from "./AllowedAlways.tsx";
import { Card, Choice, NameField, Problem, Row } from "./controls.tsx";
import { IssuedCodeView, KindMark, seenWords, usePairing } from "./Devices.tsx";
import { ExchangeLimitsCard } from "./ExchangeLimits.tsx";
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
import { RelayCard } from "./Relay.tsx";
import type { LimitsService, PeopleService, RelayService } from "./services.ts";
import { useList } from "./useList.ts";

/**
 * The workspace's heading and its cards, or nothing for a member or a guest: People for owners and
 * admins, Invite someone for owners alone, Connect a harness, and the attachment limits. For an
 * owner the heading is the workspace's name to change, edited where it stands as Your name is
 * (ADR 0194).
 */
export function Workspace(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  /** Who is reading: their own invites say "you", and nobody removes themselves. */
  readonly selfId: string;
  readonly role: WorkspaceRole | undefined;
  /** The workspace as a sentence names it, and as its heading does. */
  readonly workspace: string;
  readonly heading: string;
  /**
   * Name the workspace again (ADR 0194): an owner's, for whom the heading is the field. Absent,
   * the heading is only the name.
   */
  readonly onRename?: ((name: string) => Promise<void>) | undefined;
  readonly busy: ReadonlySet<string>;
  readonly people: PeopleService;
  /** Whether the connection is open: the invites are read then, and again each time it opens. */
  readonly connected: boolean;
  readonly limits: LimitsService | undefined;
  /** Open the Agents page with Connect a harness up. Absent, no card. */
  readonly onConnectHarness?: (() => void) | undefined;
  /** Send a harness's rules changed (ADR 0195): Allowed always's card. Absent, no card. */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  readonly onChangeRole: (participantId: string, role: WorkspaceRole) => void;
  /** Take a person out of the workspace (ADR 0160): resolves once the server has. */
  readonly onRemovePerson: (participantId: string) => Promise<void>;
  /** The faces this person chose for rooms, which a person's spaces wear (ADR 0209's addendum). */
  readonly spaceIcons?: ReadonlyMap<string, SpaceIcon> | undefined;
  /** Open a room from a person's spaces. Absent, the rooms are only listed. */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  /** The relay switch, an owner's where the server has a relay (ADR 0211). Absent, no card. */
  readonly relay?: RelayService | undefined;
}) {
  const links = useLinks(props.people, props.connected && mayInvite(props.role), props.directory);
  if (!administers(props.role)) return null;
  return (
    <>
      <div className="you-group-h">
        {props.onRename === undefined ? (
          <h2>{props.heading}</h2>
        ) : (
          <>
            <h2 className="ui-visually-hidden">{props.heading}</h2>
            <NameField
              label="Workspace name"
              name={props.heading}
              rename={props.onRename}
              className="you-workspace-name"
              testId="workspace-name"
            />
          </>
        )}
        <span>Owners and admins</span>
      </div>
      <People {...props} invites={mayInvite(props.role) ? links.items : undefined} />
      {mayInvite(props.role) && (
        <InviteCard
          service={props.people}
          links={links}
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          workspace={props.workspace}
        />
      )}
      {props.relay !== undefined && props.role === "owner" && (
        <RelayCard service={props.relay} directory={props.directory} selfId={props.selfId} />
      )}
      {props.onConnectHarness !== undefined && (
        <ConnectHarness directory={props.directory} onConnect={props.onConnectHarness} />
      )}
      {props.limits !== undefined && (
        <AttachmentCaps
          caps={props.model.attachmentCaps}
          service={props.limits}
          connected={props.connected}
        />
      )}
      {props.limits !== undefined && (
        <ExchangeLimitsCard limits={props.model.exchangeLimits} onSave={props.limits.setExchange} />
      )}
      {props.onSetRules !== undefined && (
        <AllowedAlwaysCard
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          onSetRules={props.onSetRules}
        />
      )}
    </>
  );
}

/**
 * Connect a harness, as the Agents page's button does (ADR 0185's addendum): it opens that page with
 * the dialog up, where the harness lands once it says hello. Arjun, 17 October 2026: "I do not expect
 * connect a harness to be use a whole lot, so let's keep it as the last tile. Also show it as an
 * option in the You section."
 */
function ConnectHarness(props: { readonly directory: Directory; readonly onConnect: () => void }) {
  const connected = workspaceHarnesses(props.directory).length;
  // In the demo, connecting one needs a server of your own (ADR 0213, point 7).
  const setUp = useNotInDemo();
  return (
    <Card
      label="Harnesses"
      testId="connect-harness"
      title="Harnesses"
      level={3}
      aside={
        setUp === undefined ? (
          <Button onClick={props.onConnect}>Connect a harness</Button>
        ) : (
          <NotInDemo onSetUp={setUp} />
        )
      }
    >
      <p className="you-card-note">
        {connected === 0
          ? "None connected yet. Each one runs agents on a computer."
          : `${connected} connected, each with its page on Agents.`}
      </p>
    </Card>
  );
}

/**
 * Everyone in the workspace, the longest here first (ADR 0209): each row their face, the spaces
 * the reader shares with them and when they joined, and their role as a tag in its own colour, or
 * the picker for one the reader may change; filters over the list narrow it by role. A row opens
 * under itself to say what the person can and can't do, the link they came by, their devices and
 * when each was last seen, with New phone… and Remove… where the reader may.
 */
function People(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly role: WorkspaceRole | undefined;
  readonly workspace: string;
  readonly busy: ReadonlySet<string>;
  readonly people: PeopleService;
  readonly connected: boolean;
  /** The workspace's links, an owner's to read: which one brought each person. */
  readonly invites: readonly Invite[] | undefined;
  readonly onChangeRole: (participantId: string, role: WorkspaceRole) => void;
  readonly onRemovePerson: (participantId: string) => Promise<void>;
  readonly spaceIcons?: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
}) {
  const { model, directory, selfId } = props;
  const people = peopleOf(model);
  const owners = people.filter((each) => each.role === "owner").length;
  const chips = peopleFilters(people);
  const [filter, setFilter] = useState<PeopleFilter>("all");
  // A filter whose last person left falls back to everybody.
  const chosen = chips.some((each) => each.key === filter) ? filter : "all";
  const shown = people.filter((each) => inFilter(each, chosen));
  // Whose row is open under itself.
  const [open, setOpen] = useState<string | undefined>(undefined);
  // Who is being asked about, while the dialog that asks first is up.
  const [removing, setRemoving] = useState<PersonModel | undefined>(undefined);
  // Whose new phone a code is up for (ADR 0206).
  const [phoneFor, setPhoneFor] = useState<string | undefined>(undefined);
  const [changing, setChanging] = useState<
    { readonly person: PersonModel; readonly to: WorkspaceRole } | undefined
  >(undefined);
  const names = (ids: readonly string[]) => ids.map((id) => nameOf(directory, id));
  return (
    <Card
      label="People"
      testId="people"
      title="People"
      level={3}
      aside={
        <span className="people-aside">
          <FaceStack directory={directory} ids={people.map((each) => each.participantId)} />
          <small>
            {people.length} in {props.workspace}
          </small>
        </span>
      }
    >
      {chips.length > 2 && (
        <FilterChips label="Show" chips={chips} chosen={chosen} onChoose={setFilter} />
      )}
      <ul className="you-list people-list">
        {shown.map((person) => (
          <PersonRow
            key={person.participantId}
            person={person}
            model={model}
            directory={directory}
            selfId={selfId}
            workspace={props.workspace}
            reader={props.role}
            invites={props.invites}
            service={props.people}
            connected={props.connected}
            spaceIcons={props.spaceIcons}
            onOpenSpace={props.onOpenSpace}
            open={open === person.participantId}
            onOpen={() => setOpen(open === person.participantId ? undefined : person.participantId)}
            choices={rolesOffered(props.role, person, owners)}
            busy={props.busy.has(person.participantId)}
            onChange={(to) => setChanging({ person, to })}
            onRemove={
              mayRemovePerson(model, person.participantId, selfId)
                ? () => setRemoving(person)
                : undefined
            }
            onNewPhone={
              mayPairFor(model, person.participantId, selfId)
                ? () => setPhoneFor(person.participantId)
                : undefined
            }
          />
        ))}
      </ul>
      {phoneFor !== undefined && (
        <NewPhone
          key={phoneFor}
          personId={phoneFor}
          name={nameOf(directory, phoneFor)}
          service={props.people}
          onDone={() => setPhoneFor(undefined)}
        />
      )}
      {changing !== undefined && (
        <ConfirmDialog
          asking={(() => {
            const id = changing.person.participantId;
            const sees = roleChangeSees(model, directory, id, changing.to, selfId);
            return roleChangeAsking({
              name: nameOf(directory, id),
              to: changing.to,
              yourself: id === selfId,
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
            props.onChangeRole(changing.person.participantId, changing.to);
            setChanging(undefined);
          }}
        />
      )}
      {removing !== undefined && (
        <ConfirmDialog
          asking={removePersonAsking({
            name: nameOf(directory, removing.participantId),
            workspace: props.workspace,
            harnesses: harnessesOf(directory, removing.participantId),
          })}
          danger
          cancel="Keep"
          tooOld="Not removed: this server is older than the app, and cannot remove a person yet."
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await props.onRemovePerson(removing.participantId);
            setRemoving(undefined);
          }}
        />
      )}
    </Card>
  );
}

function PersonRow(props: {
  readonly person: PersonModel;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  readonly reader: WorkspaceRole | undefined;
  readonly invites: readonly Invite[] | undefined;
  readonly service: PeopleService;
  readonly connected: boolean;
  readonly spaceIcons?: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly choices: readonly WorkspaceRole[];
  readonly busy: boolean;
  readonly onChange: (role: WorkspaceRole) => void;
  /** Asks first, then takes them out of the workspace; absent where this reader may not. */
  readonly onRemove?: (() => void) | undefined;
  /** A code for their new phone (ADR 0206): an owner's, for somebody else. */
  readonly onNewPhone?: (() => void) | undefined;
}) {
  const { person, model, directory, selfId } = props;
  const id = person.participantId;
  const self = id === selfId;
  const name = nameOf(directory, id);
  const shared = spacesShared(model, directory, id, selfId);
  const where = spacesLine(shared);
  const details = useId();
  return (
    <li
      className={props.open ? "you-row person-row is-open" : "you-row person-row"}
      data-testid="person-row"
      data-participant={id}
      data-role={person.role}
    >
      <button
        type="button"
        className="person-open"
        aria-expanded={props.open}
        aria-controls={details}
        onClick={props.onOpen}
        data-testid="person-open"
      >
        <Face directory={directory} id={id} size="sm" />
        <span className="you-row-lab">
          <span>{self ? selfLabel(name) : name}</span>
          <small>
            {where === undefined
              ? seenWords("Joined", person.joinedAt)
              : `${where} · ${seenWords("joined", person.joinedAt)}`}
          </small>
        </span>
        <span className="person-chev" aria-hidden="true" />
      </button>
      {props.choices.length > 1 ? (
        <span className={`role-pick you-role-${person.role}`}>
          <Choice
            label={`${name}'s role`}
            value={person.role}
            options={props.choices.map((role) => [role, ROLE_WORDS[role]] as const)}
            disabled={props.busy}
            onChange={props.onChange}
          />
        </span>
      ) : (
        <RoleTag role={person.role} />
      )}
      {props.open && <PersonDetails {...props} id={details} />}
    </li>
  );
}

/** What opens under a person's row: what they can do, how they came, their devices, and the acts. */
function PersonDetails(props: Parameters<typeof PersonRow>[0] & { readonly id: string }) {
  const { person, model, directory, selfId } = props;
  const id = person.participantId;
  const self = id === selfId;
  const name = nameOf(directory, id);
  const came = cameLine(person, props.invites, model, directory, selfId);
  const said = self ? "What you can do" : `What ${name} can do`;
  return (
    <div className="person-details" id={props.id} data-testid="person-details">
      <h4>{said}</h4>
      <CanList
        lines={canDo(model, directory, id, { selfId, workspace: props.workspace })}
        directory={directory}
        label={said}
      />
      <dl className="person-facts">
        <dt>Joined</dt>
        <dd>
          {dayWords(person.joinedAt)}
          {person.invitedBy === undefined
            ? ""
            : ` · invited by ${invitedByWords(person.invitedBy, selfId, directory)}`}
        </dd>
        {came !== undefined && (
          <>
            <dt>Came by</dt>
            <dd data-testid="person-came-by">{came}</dd>
          </>
        )}
      </dl>
      <SharedSpaces
        heading={self ? "Your spaces" : "Spaces you share"}
        spaces={sharedSpaces(model, id, selfId)}
        directory={directory}
        selfId={selfId}
        icons={props.spaceIcons}
        onOpen={props.onOpenSpace}
      />
      {!self && (
        <TheirDevices
          personId={id}
          name={name}
          service={props.service}
          connected={props.connected && administers(props.reader)}
          reconnects={mayPairFor(model, id, selfId)}
          signsOut={maySignOutDevicesOf(model, id, selfId)}
        />
      )}
      {(props.onNewPhone !== undefined || props.onRemove !== undefined) && (
        <div className="person-actions">
          {props.onNewPhone !== undefined && (
            <NewPhoneButton name={name} busy={props.busy} onNewPhone={props.onNewPhone} />
          )}
          {props.onRemove !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              className="person-remove"
              disabled={props.busy}
              onClick={props.onRemove}
              aria-label={`Remove ${name}…`}
              data-testid="remove-person"
            >
              Remove…
            </Button>
          )}
        </div>
      )}
    </div>
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
function useLinks(service: PeopleService, connected: boolean, directory: Directory) {
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
 * Invite someone; in the demo, where a link would bring nobody to a server of yours, the card says
 * it is not in the demo, with the way to set up your own (ADR 0213, point 7).
 */
function InviteCard(props: Parameters<typeof Invites>[0]) {
  const setUp = useNotInDemo();
  if (setUp === undefined) return <Invites {...props} />;
  return (
    <Card label="Invites" testId="invites" title="Invite someone" level={3}>
      <NotInDemo onSetUp={setUp} />
    </Card>
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
  readonly links: ReturnType<typeof useLinks>;
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
    <Card
      label="Invites"
      testId="invites"
      title="Invite someone"
      level={3}
      aside={<small data-testid="open-links">{openLinksWords(live, now)}</small>}
    >
      {unnamed && (
        <p className="you-card-note" data-testid="name-first">
          Give yourself a name first, at the top of this page: whoever opens your link sees who sent
          it.
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
      {live.length > 0 && (
        <>
          <h4 className="invite-h">Open links</h4>
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
        </>
      )}
      {used.length > 0 && (
        <>
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
        </>
      )}
    </Card>
  );
}

/**
 * How big a photo, a video or a file may be here (ADR 0047): the caps in a sentence, and three
 * fields in megabytes. The server's ceiling is fetched each time the connection opens and named in
 * the sentence; a cap typed above it is refused here, with the words the server would use.
 */
function AttachmentCaps(props: {
  readonly caps: Caps;
  readonly service: LimitsService;
  readonly connected: boolean;
}) {
  const { caps, service, connected } = props;
  const [ceiling, setCeiling] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState<Record<CapKind, string>>(() => capsDraft(caps));
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!connected) return;
    let live = true;
    service.ceiling().then(
      (found) => {
        if (live) setCeiling(found);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [service, connected]);
  // The server's word replaces the draft: what was saved, on any device, is what the fields show.
  useEffect(() => setDraft(capsDraft(caps)), [caps]);
  const saved = capsDraft(caps);
  const changed = CAP_KINDS.some((kind) => draft[kind] !== saved[kind]);

  const save = () => {
    const read = capsFromDraft(draft);
    if ("error" in read) {
      setError(read.error);
      return;
    }
    const over = ceiling === undefined ? undefined : capsOverCeiling(read.caps, ceiling);
    if (over !== undefined) {
      setError(over);
      return;
    }
    setError(undefined);
    service.set(read.caps);
  };

  return (
    <Card label="Attachments" testId="attachment-caps" title="Attachment limits" level={3}>
      {/* Our own words for a bad cap, not the browser's bubble: the server would say the same. */}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Row
          className="you-caps"
          label="Photos, videos and files"
          sub={<span data-testid="caps-words">{capsSentence(caps, ceiling)}</span>}
        >
          {CAP_KINDS.map((kind) => (
            <label key={kind} className="you-mb">
              <input
                type="number"
                min={1}
                step="any"
                aria-label={capitalised(CAP_WORDS[kind].many)}
                placeholder={ceiling === undefined ? "–" : String(Math.round(ceiling / 1_048_576))}
                value={draft[kind]}
                onChange={(event) => setDraft({ ...draft, [kind]: event.target.value })}
              />
              MB
            </label>
          ))}
          {changed && (
            <Button type="submit" data-testid="save-caps">
              Save
            </Button>
          )}
        </Row>
      </form>
      <Problem error={error} />
    </Card>
  );
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
