/**
 * The room sheet's pages that put somebody in the room (ADR 0151), as the phone has them: Add, In
 * other rooms, New agent (ADR 0108) and Move (ADR 0087). Add stays up while several are put in
 * (ADR 0148): a row ticks where it stands, a tick taken off takes it out again where that may be
 * done, an agent moved here or asked for comes back to it ticked, and Done puts the sheet away.
 * What is offered, and to whom, is core's (`addableAgents`, `addableKept`, `newAgentHarnesses`,
 * `mayMove`), so both clients offer the same agents in the same words.
 */

import {
  type Addable,
  addableAgents,
  addableKept,
  addableTo,
  cantAnswer,
  type Directory,
  guestElsewhere,
  harnessOf,
  inviteSomeoneNew,
  mayForkInto,
  mayMove,
  mayPutIn,
  mayRemoveMember,
  nameOf,
  newAgentHarnesses,
  newAgentHint,
  newAgentName,
  nobodyToAddWords,
  type Participant,
  type Reader,
  roomName,
  type Space,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { useState } from "react";
import { NOT_IN_DEMO, SetUpOwnButton, useNotInDemo } from "../demo/NotInDemo.tsx";
import { Back, Chev, Face, Group, Heading, type Pick, Row, Tick, Tile } from "./parts.tsx";

/** A new agent asked for from Add while the sheet has been up: who makes it, and its name. */
export interface Asked {
  readonly harnessId: string;
  readonly name: string;
}

interface Common {
  readonly titleId: string;
  readonly space: Space;
  readonly directory: Directory;
  readonly selfId: string;
  readonly model: WorkspaceModel | undefined;
  readonly busy: boolean;
}

/**
 * A harness with no agents of its own yet, whose first is made as it joins, never in a Main room;
 * and one put in from here, ticked where it was. To a reader, only one they may put in a room
 * (`mayPutIn`): a member, only a harness of their own.
 */
function bareHarnesses(
  space: Space,
  directory: Directory,
  kept: readonly string[],
  reader: Reader | undefined,
): Participant[] {
  if (space.home === true) return [];
  const keptHere = kept.flatMap((id) => {
    const each = directory[id];
    return each !== undefined && space.members.includes(id) ? [each] : [];
  });
  const mayPut = (id: string) =>
    reader === undefined || mayPutIn(reader.model, directory, reader.selfId, id);
  return [...addableTo(directory, space.members), ...keptHere].filter(
    (each) =>
      each.kind === "harness" &&
      !Object.values(directory).some((agent) => agent.harnessId === each.id) &&
      mayPut(each.id),
  );
}

/** Who reads Add's lists, for `showsAgent`: nobody yet while the model is on its way. */
function readerOf(model: WorkspaceModel | undefined, selfId: string): Reader | undefined {
  return model === undefined ? undefined : { model, selfId };
}

export function AddPage(
  props: Common & {
    readonly title: string;
    /** Put in from here since the sheet came up: kept in place, ticked. */
    readonly kept: readonly string[];
    readonly asked: readonly Asked[];
    readonly onBack: () => void;
    readonly onAdd: (participantId: string, kind: "agent" | "person" | "harness") => void;
    readonly onRemove: (participantId: string) => void;
    readonly onNew: () => void;
    readonly onElsewhere: () => void;
    /** Invite someone new into this room (ADR 0168); an owner's alone, so absent for the rest. */
    readonly onInvite?: (() => void) | undefined;
  },
) {
  const { space, directory, selfId, model, kept } = props;
  const reader = readerOf(model, selfId);
  const offered = addableAgents(space, directory, reader);
  const free = addableKept(space, directory, kept, reader);
  const makers = model === undefined ? [] : newAgentHarnesses(model, directory, selfId, space);
  const bare = bareHarnesses(space, directory, kept, reader);
  // Nobody here already, and no guest who is in a space already (ADR 0034); and whoever was put in
  // from here, ticked where they were.
  const people = Object.values(model?.people ?? {}).filter(
    (person) =>
      (!space.members.includes(person.participantId) &&
        person.role !== undefined &&
        !guestElsewhere(directory, person.participantId)) ||
      (kept.includes(person.participantId) && space.members.includes(person.participantId)),
  );
  // A row in the room now is ticked; a click takes it out again where that may be done.
  const ticked = (id: string, add: () => void): Pick => {
    if (!space.members.includes(id)) return { type: "checkbox", checked: false, onPick: add };
    const may = mayRemoveMember(space, directory, selfId, id, model);
    return {
      type: "checkbox",
      checked: true,
      disabled: !may,
      onPick: () => props.onRemove(id),
    };
  };
  const ways = makers.length > 0 || props.asked.length > 0 || offered.elsewhere.length > 0;
  return (
    <>
      <Back
        titleId={props.titleId}
        title={`Add to ${props.title}`}
        onBack={props.onBack}
        pageTestId="room-sheet-add-page"
      />
      <p className="sheet-hint">
        {space.home === true
          ? "A Main space takes people, and no other agent."
          : "An agent is in one space at a time."}
      </p>
      <div className="sheet-scroll">
        {ways && (
          <Group>
            {makers.length > 0 && (
              <Row
                face={<NewFace />}
                name="New agent"
                under={`${listOf(makers.map((each) => each.displayName))} makes it for this space`}
                onClick={props.onNew}
                testId="room-sheet-new"
                trailing={<Chev />}
              />
            )}
            {props.asked.map((ask, at) => (
              <Row
                // biome-ignore lint/suspicious/noArrayIndexKey: asks are only ever added, in order.
                key={`asked-${at}`}
                face={<NewFace />}
                name={ask.name}
                under={`Asked of ${nameOf(directory, ask.harnessId)}`}
                testId={`room-sheet-asked-${at}`}
                trailing={<Tick on />}
              />
            ))}
            {offered.elsewhere.length > 0 && (
              <Row
                face={
                  <Tile>
                    <Icon name="chat" size={16} />
                  </Tile>
                }
                name="In other spaces"
                under="Moves here from the space it's in"
                onClick={props.onElsewhere}
                testId="room-sheet-other-rooms"
                trailing={
                  <>
                    <span className="sheet-end">{offered.elsewhere.length}</span>
                    <Chev />
                  </>
                }
              />
            )}
          </Group>
        )}
        {free.length + bare.length > 0 && (
          <>
            <Heading>Free</Heading>
            <Group>
              {bare.map((each) => (
                <Row
                  key={each.id}
                  face={<Face directory={directory} id={each.id} />}
                  name={each.displayName}
                  under="Makes its first agent as it joins"
                  pick={ticked(each.id, () => props.onAdd(each.id, "harness"))}
                  testId={`room-sheet-harness-${each.id}`}
                  trailing={<Tick on={space.members.includes(each.id)} />}
                />
              ))}
              {free.map((agent) => {
                const tick = ticked(agent.agentId, () => props.onAdd(agent.agentId, "agent"));
                return (
                  <Row
                    key={agent.agentId}
                    face={<Face directory={directory} id={agent.agentId} />}
                    name={agent.name}
                    under={agent.harness}
                    pick={tick}
                    testId={`room-sheet-agent-${agent.agentId}`}
                    trailing={<Tick on={tick.checked} />}
                  />
                );
              })}
            </Group>
          </>
        )}
        <Heading>People</Heading>
        <Group>
          {people.length === 0 ? (
            <Row
              face={
                <Tile>
                  <Icon name="user" size={16} />
                </Tile>
              }
              name={nobodyToAddWords(space, model?.people ?? {}, selfId)}
            />
          ) : (
            people.map((person) => {
              const tick = ticked(person.participantId, () =>
                props.onAdd(person.participantId, "person"),
              );
              return (
                <Row
                  key={person.participantId}
                  face={<Face directory={directory} id={person.participantId} />}
                  name={nameOf(directory, person.participantId)}
                  under={person.role === "guest" ? "Guest" : "Member"}
                  pick={tick}
                  testId={`room-sheet-person-${person.participantId}`}
                  trailing={<Tick on={tick.checked} />}
                />
              );
            })
          )}
          {props.onInvite !== undefined && (
            <InviteRow title={props.title} onInvite={props.onInvite} />
          )}
        </Group>
      </div>
    </>
  );
}

/** Somebody new, by a link that brings them straight into this room (ADR 0168). */
function InviteRow(props: { readonly title: string; readonly onInvite: () => void }) {
  const words = inviteSomeoneNew(props.title);
  // In the demo a link would bring nobody to a server of yours (ADR 0213, point 7).
  const setUp = useNotInDemo();
  if (setUp !== undefined) {
    return (
      <Row
        face={
          <Tile>
            <Icon name="mail" size={16} />
          </Tile>
        }
        name={words.title}
        under={NOT_IN_DEMO}
        testId="room-sheet-invite"
        trailing={<SetUpOwnButton onSetUp={setUp} />}
      />
    );
  }
  return (
    <Row
      face={
        <Tile>
          <Icon name="mail" size={16} />
        </Tile>
      }
      name={words.title}
      under={words.under}
      onClick={props.onInvite}
      testId="room-sheet-invite"
      trailing={<Chev />}
    />
  );
}

/** "Jacobian", "Jacobian or OpenClaw", "Jacobian, OpenClaw or Scout". */
function listOf(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/** The face of an agent not made yet: a dashed outline the size of a row's face, with a +. */
function NewFace() {
  return (
    <span className="sheet-new-face" aria-hidden="true">
      <Icon name="plus" size={15} />
    </span>
  );
}

/**
 * The agents in other rooms, from Add's row (Arjun, 4 October 2026). Each is in a room now, so a
 * pick goes to Move, which asks first and says what the move does to the room it leaves.
 */
export function ElsewherePage(
  props: Common & { readonly onBack: () => void; readonly onAgent: (agent: Addable) => void },
) {
  const { space, directory, model, selfId } = props;
  const reader = readerOf(model, selfId);
  return (
    <>
      <Back titleId={props.titleId} title="In other spaces" onBack={props.onBack} />
      <p className="sheet-hint">
        An agent is in one space at a time. Picking one asks before it moves it here.
      </p>
      <div className="sheet-scroll">
        <Group>
          {addableAgents(space, directory, reader).elsewhere.map((agent) => (
            <Row
              key={agent.agentId}
              face={<Face directory={directory} id={agent.agentId} />}
              name={agent.name}
              under={`${agent.harness} · in ${model === undefined ? "another space" : roomName(model, agent.room, directory)}`}
              onClick={() => props.onAgent(agent)}
              testId={`room-sheet-agent-${agent.agentId}`}
              trailing={<Chev />}
            />
          ))}
        </Group>
      </div>
    </>
  );
}

/**
 * A new agent for this room (ADR 0108): who makes it, by face, as the + window shows them, and what
 * it is called. The name may be left empty: the line under it says what it will be then, or that a
 * name typed is taken and what it will be instead.
 */
export function NewAgentPage(
  props: Common & {
    readonly onBack: () => void;
    readonly onAsk: (harnessId: string, name: string) => void;
  },
) {
  const { space, directory, selfId, model, busy } = props;
  const makers = model === undefined ? [] : newAgentHarnesses(model, directory, selfId, space);
  // One to choose from is chosen: the faces are there to say who, not to ask.
  const [picked, setPicked] = useState<string | undefined>(
    makers.length === 1 ? makers[0]?.id : undefined,
  );
  const [typed, setTyped] = useState("");
  const name = picked === undefined ? undefined : newAgentName(directory, picked, typed);
  return (
    <form
      className="sheet-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked !== undefined && !busy) props.onAsk(picked, typed.trim());
      }}
    >
      <Back titleId={props.titleId} title="New agent" onBack={props.onBack} />
      <p className="sheet-hint">
        Who makes it. It starts with the space's last lines, and nothing from elsewhere.
      </p>
      <fieldset className="new-space-faces sheet-makers" aria-label="Who makes it">
        {makers.map((each) => {
          const unable = cantAnswer({ [each.id]: each }, each.id) !== undefined;
          return (
            <label
              key={each.id}
              className="new-space-face"
              data-on={picked === each.id ? "true" : undefined}
              data-testid={`room-sheet-new-${each.id}`}
            >
              <input
                type="radio"
                name="maker"
                checked={picked === each.id}
                aria-label={unable ? `${each.displayName}, Can't answer now` : each.displayName}
                onChange={() => setPicked(each.id)}
              />
              <span className="new-space-face-ring">
                <Avatar name={each.displayName} kind="harness" cantAnswer={unable} />
                <span className="new-space-check" aria-hidden="true">
                  <Icon name="check" size={11} />
                </span>
              </span>
              <span className="new-space-face-name">{each.displayName}</span>
            </label>
          );
        })}
      </fieldset>
      <label className="sheet-label" data-off={picked === undefined ? "true" : undefined}>
        Name
        <input
          type="text"
          className="sheet-input"
          value={typed}
          maxLength={120}
          disabled={picked === undefined}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={picked === undefined ? "" : newAgentName(directory, picked)}
          data-testid="new-agent-name"
        />
      </label>
      <p className="sheet-hint sheet-field-hint" data-testid="new-agent-hint">
        {picked === undefined ? "Pick who makes it first." : newAgentHint(directory, picked, typed)}
      </p>
      <button
        type="submit"
        className="sheet-go"
        disabled={busy || picked === undefined}
        data-testid="new-agent-add"
      >
        {busy ? "Asking…" : name === undefined ? "Add" : `Add ${name}`}
      </button>
    </form>
  );
}

/**
 * Before an agent busy elsewhere comes here (ADR 0087, point 4): who it is and where, and what the
 * move does to the room it leaves; Fork here where its harness makes copies; Cancel.
 */
export function MovePage(
  props: Common & {
    readonly agentId: string;
    readonly onMove: () => void;
    readonly onFork: () => void;
    readonly onCancel: () => void;
  },
) {
  const { space, directory, selfId, model, busy, agentId } = props;
  const name = nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const from =
    model === undefined ? "another space" : roomName(model, directory[agentId]?.room, directory);
  const may = model !== undefined && mayMove(model, directory, selfId, agentId);
  const fork = model !== undefined && mayForkInto(model, directory, selfId, agentId, space);
  return (
    <div className="sheet-form">
      <div className="sheet-who">
        <Face directory={directory} id={agentId} />
        <span className="ctx-row-words">
          <span className="ctx-row-title">{name}</span>
          <span className="ctx-row-line">
            {harness} · in {from}
          </span>
        </span>
      </div>
      <h2 id={props.titleId} className="sheet-ask">
        {may ? `Move ${name} here?` : `${name} is in ${from}`}
      </h2>
      <p className="sheet-body">
        {may
          ? `It leaves ${from}, which says so, and keeps what it remembers.`
          : `An agent is in one space at a time. Ask the owner of ${harness} to move it.`}
      </p>
      {may && (
        <button
          type="button"
          className="sheet-go"
          disabled={busy}
          onClick={props.onMove}
          data-testid="room-sheet-move"
        >
          Move
        </button>
      )}
      {fork && model !== undefined && (
        <>
          <button
            type="button"
            className="sheet-go"
            data-tone="soft"
            disabled={busy}
            onClick={props.onFork}
            data-testid="room-sheet-fork"
          >
            Fork here
          </button>
          <p className="sheet-hint sheet-field-hint">
            A copy joins {roomName(model, space.id, directory)}, remembering everything up to now.{" "}
            {name} stays where it is.
          </p>
        </>
      )}
      <div className="sheet-foot">
        <Button className="sheet-done" onClick={props.onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
