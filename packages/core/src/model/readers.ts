/**
 * Questions asked of a folded workspace.
 *
 * Pure functions over what the fold produced — where a message would go, who may answer, what a
 * person may edit — so a screen asks them without a store and a test asks them with a literal.
 */

import {
  type Mentionable,
  mentionsEveryone,
  noteHandle,
  resolveAddress,
  resolveMentions,
  type WorkspaceRole,
} from "@chipschat/protocol";
import { stepWords, verbWords } from "../doingWords.js";
import {
  type Directory,
  isAgent,
  isRemoved,
  membersName,
  nameOf,
  participantKind,
} from "../events.js";
import { plainWords } from "../markdown.js";
import { readTaskBubble, type TaskBubble } from "../taskWords.js";
import { TERMINAL } from "./state.js";
import type {
  Approval,
  Lane,
  LetWork,
  Line,
  MessageRoute,
  Run,
  Session,
  Space,
  SpaceRole,
  WorkspaceModel,
} from "./types.js";

/**
 * Where a message typed here would go, by the same rule the harness uses to deliver it: a live
 * session if there is one, and otherwise the most recent that closed — which is started again
 * where it left off. Nothing at all means there is nowhere to put it, and the composer says so
 * rather than letting a person talk to a room that cannot hear.
 */
export function sessionToAddress(space: Space): Session | undefined {
  return space.sessions[0];
}

/**
 * The latest run of each visit to a space, in the order the visits are listed — live first
 * (ADR 0024: the run panel offers one run per live session). Two terminals open in one worktree
 * are two runs going at once, and without this the panel would show whichever spoke last.
 */
export function runsBySession(space: Space): readonly { session: Session; run?: Run }[] {
  return space.sessions.map((session) => {
    const run = [...space.runs].reverse().find((each) => each.sessionRef === session.sessionRef);
    return run === undefined ? { session } : { session, run };
  });
}

/**
 * Where a message goes, given what the person pinned (ADR 0040). A pin that names a visit this
 * space no longer has is `gone` rather than quietly ignored: falling back would send the message
 * to a terminal they did not mean, and an answer from the wrong one reads exactly like an answer
 * from the right one.
 */
export function messageRoute(
  model: WorkspaceModel,
  space: Space,
  pinnedRef?: string | undefined,
): MessageRoute {
  if (pinnedRef !== undefined) {
    const pinned = space.sessions.find((each) => each.sessionRef === pinnedRef);
    if (pinned === undefined) return { how: "gone", sessionRef: pinnedRef };
    return { how: pinned.live ? "live" : "resume", session: pinned, pinned: true };
  }
  const session = sessionToAddress(space);
  if (session !== undefined) {
    return { how: session.live ? "live" : "resume", session, pinned: false };
  }
  // No visit here ever. Whether that is a problem depends on who is in the room: a harness that
  // works by sessions has nowhere to be reached, and one that does not is simply being messaged.
  const bySessions = new Set(
    model.fleet.filter((each) => each.sessionCount > 0).map((each) => each.harnessId),
  );
  const harnessId = space.members.find((member) => bySessions.has(member));
  return harnessId === undefined ? { how: "chat" } : { how: "nowhere", harnessId };
}

/**
 * The lanes anchored in a space: the route cards of a lead space it is linked into, and the task
 * card of a specialist's home. A `route` or `task` line names its lane by id; this is how a view
 * of a space finds the lanes those lines draw.
 */
export function lanesInSpace(model: WorkspaceModel, spaceId: string): Lane[] {
  return model.lanes.filter(
    (lane) => lane.homeSpaceId === spaceId || lane.linkedSpaceIds.includes(spaceId),
  );
}

/**
 * What a run's lanes have cost, all the way down the chain (ADR 0029: cost rolls up the trail,
 * context does not). A run's own cost is on the panel already; this is what to add for the work
 * it handed on. Bounded — lanes never cycle and nest at most three deep — and guarded regardless.
 */
export function laneChainCostUsd(model: WorkspaceModel, runId: string): number | undefined {
  let total = 0;
  let found = false;
  const seen = new Set<string>();
  const walk = (leadRunId: string) => {
    for (const lane of model.lanes) {
      if (lane.leadRunId !== leadRunId || seen.has(lane.laneId)) continue;
      seen.add(lane.laneId);
      if (lane.costUsd !== undefined) {
        total += lane.costUsd;
        found = true;
      }
      if (lane.runId !== undefined) walk(lane.runId);
    }
  };
  walk(runId);
  return found ? total : undefined;
}

/**
 * Whether this person may answer an approval: anyone, when Chips named nobody in particular,
 * and otherwise only who it named (M3.3). The door refuses the rest; this keeps the buttons off.
 */
export function mayAnswer(approval: Approval, participantId: string): boolean {
  return approval.approvers.length === 0 || approval.approvers.includes(participantId);
}

/**
 * What an approval card is headed with (ADR 0142): the question the harness asked, else the
 * preview's own title, else the action's kind and who it is to. The kind is the policy engine's
 * word for the action, `shell.exec`, and a person reads it only when the harness gave nothing
 * better.
 */
export function askHeadline(approval: Approval): string {
  if (approval.question !== undefined) return approval.question;
  if (approval.previewTitle !== undefined) return approval.previewTitle;
  return approval.actionKind + (approval.to === undefined ? "" : ` to ${approval.to}`);
}

/**
 * The line after the headline where one line is all there is, a notification's body: what a yes
 * does when the harness said, else the preview's words.
 */
export function askDetail(approval: Approval): string | undefined {
  const detail = approval.effect ?? approval.preview;
  return detail === "" ? undefined : detail;
}

/**
 * Whether a line is harness-to-harness traffic: a harness said it to harnesses, or the guard held
 * it (ADR 0081) — for a line from before Chips said who a message is for, a harness said it and
 * it names only harnesses (M3.3). A room with two harnesses in it folds a run of these into one
 * row, open on a tap — collapsed by default, always inspectable, never gone (blueprint, the
 * eleven calls).
 */
export function betweenHarnesses(line: Line, isHarness: (id: string) => boolean): boolean {
  if (line.authorKind !== "harness" || line.kind !== "text") return false;
  if (line.held === true) return true;
  if (line.addressedTo !== undefined) return line.addressedTo.length > 0;
  const mentions = line.mentions ?? [];
  return mentions.length > 0 && mentions.every(isHarness);
}

/**
 * The harnesses in a room a message can be for (ADR 0081): members that are harnesses and have
 * not been removed, in the order they joined: who takes a turn on it.
 */
export function harnessesIn(space: Space, directory: Directory): string[] {
  return space.members.filter((id) => isAgent(directory, id) && !isRemoved(directory, id));
}

/** The people in a room (ADR 0204): members that are people and have not been removed. */
export function peopleIn(space: Space, directory: Directory): string[] {
  return space.members.filter(
    (id) => participantKind(directory, id) === "person" && !isRemoved(directory, id),
  );
}

/**
 * Who in a room a message can be for (ADR 0204): its agents, then its people. Somebody who writes
 * there is one of them, and never who their own message is for.
 */
export function addressablesIn(space: Space, directory: Directory): string[] {
  return [...harnessesIn(space, directory), ...peopleIn(space, directory)];
}

/**
 * Who a message this person writes here can be for (ADR 0204): everybody in the room but them.
 * With two or more the field says who, and the room draws where each message went. It was the
 * room's agents alone until 19 October 2026, so in Foodie, one agent and two people, nothing
 * said who a message was for, and Natalie's "How's it going?" for Arjun went to the agent.
 */
export function othersIn(space: Space, directory: Directory, selfId: string): string[] {
  return addressablesIn(space, directory).filter((id) => id !== selfId);
}

/**
 * What a participant's newest line here that says was for, `all` for everyone: rule 5's `last`
 * (ADR 0081).
 */
function lastAddressedBy(
  lines: readonly Line[],
  authorId: string,
): readonly string[] | "all" | undefined {
  return addressOfLine(
    lines.findLast(
      (line) =>
        line.kind === "text" && line.authorId === authorId && line.addressedTo !== undefined,
    ),
  );
}

/** Where a line went, as rule 5 reads it: `all` for everyone, else its harnesses. */
function addressOfLine(line: Line | undefined): readonly string[] | "all" | undefined {
  return line?.addressedToAll === true ? "all" : line?.addressedTo;
}

/** Whether two addresses are the same: everyone is only everyone; harnesses as a set. */
function sameAddress(a: readonly string[] | "all", b: readonly string[] | "all"): boolean {
  return a === "all" || b === "all" ? a === b : sameSet(a, b);
}

/** Where a line went, its people too (ADR 0204): its agents or everyone, and the people it named. */
interface Place {
  readonly agents: readonly string[] | "all";
  readonly people: readonly string[];
}

function placeOfLine(line: Line): Place | undefined {
  const agents = addressOfLine(line);
  return agents === undefined ? undefined : { agents, people: line.addressedPeople ?? [] };
}

function samePlace(a: Place, b: Place): boolean {
  return sameAddress(a.agents, b.agents) && sameSet(a.people, b.people);
}

/**
 * Where a message this person sends here goes when they say nothing of it (ADR 0081, ADR 0204):
 * where their last message here went when it was for somebody by name — its people, and its
 * agents still here — else the server's own rule (`nextAddress`). So a person picked stays picked,
 * as an agent picked does; in a room of one agent the server's rule alone would go back to the
 * agent. Everyone is everybody here but them.
 */
export function nextAim(
  space: Space,
  directory: Directory,
  selfId: string,
): { readonly ids: readonly string[]; readonly all?: true } {
  const others = othersIn(space, directory, selfId);
  const last = space.lines.findLast(
    (line) => line.kind === "text" && line.authorId === selfId && line.addressedTo !== undefined,
  );
  const people = (last?.addressedPeople ?? []).filter((id) => others.includes(id));
  if (last !== undefined && people.length > 0) {
    const agents = (last.addressedTo ?? []).filter((id) => others.includes(id));
    return { ids: [...agents, ...people] };
  }
  const address = resolveAddress({
    sender: { id: selfId, kind: "person" },
    mentioned: [],
    everyone: false,
    agents: harnessesIn(space, directory),
    last: lastAddressedBy(space.lines, selfId),
  });
  return address.addressed_to_all === true
    ? { ids: others, all: true }
    : { ids: address.addressed_to };
}

/**
 * Where a message this person sends here goes when it names nobody (ADR 0081): the server's own
 * rule over what this client holds — the room's only harness, else where their last message here
 * went, else every harness.
 */
export function nextAddress(space: Space, directory: Directory, selfId: string): string[] {
  return resolveAddress({
    sender: { id: selfId, kind: "person" },
    mentioned: [],
    everyone: false,
    agents: harnessesIn(space, directory),
    last: lastAddressedBy(space.lines, selfId),
  }).addressed_to;
}

/**
 * A room's members as an @ reads them, as the server does (ADR 0091): in the room's order, less
 * anybody removed, and an agent known by its harness's name too where it is that harness's one
 * agent here (ADR 0087's addendum), so `@Jacobian` reaches Jacobian's agent.
 */
export function mentionablesIn(space: Space, directory: Directory): Mentionable[] {
  const here = space.members.filter(
    (id) => directory[id] !== undefined && !isRemoved(directory, id),
  );
  const harnessOfAgent = (id: string) => {
    const participant = directory[id];
    return participant?.kind === "agent" ? participant.harnessId : undefined;
  };
  return here.map((id) => {
    const harness = harnessOfAgent(id);
    const alone =
      harness !== undefined && here.filter((each) => harnessOfAgent(each) === harness).length === 1;
    const harnessName = harness === undefined ? undefined : directory[harness]?.displayName;
    // A harness waiting under the name held for its agent (ADR 0150) answers to its own too.
    const waiting = directory[id]?.harnessName;
    return {
      id,
      displayName: directory[id]?.displayName ?? "",
      ...(alone && harnessName !== undefined ? { also: [harnessName] } : {}),
      ...(waiting === undefined ? {} : { also: [waiting] }),
    };
  });
}

/**
 * The handle that reaches each member of a room, with its @ (ADR 0091): `@OpenClaw2`, its whole
 * name without spaces, or its first word where only that is a handle. What the field's list shows
 * under an agent, so the handle is learnt where it is used. A member no handle reaches has none.
 */
export function roomHandles(space: Space, directory: Directory): Readonly<Record<string, string>> {
  const members = mentionablesIn(space, directory).map((each) => ({
    id: each.id,
    kind: directory[each.id]?.kind === "person" ? ("person" as const) : ("agent" as const),
    name: each.displayName,
  }));
  return Object.fromEntries(
    members.flatMap((member) => {
      const handle = noteHandle(member, members);
      return handle === undefined ? [] : [[member.id, handle]];
    }),
  );
}

/**
 * Where an @ in a draft sends it, while it is typed (ADR 0081): the harnesses it names, every one
 * for `@all`, none when it names only people, and `undefined` when no @ decides.
 */
export function draftAddress(
  text: string,
  space: Space,
  directory: Directory,
): string[] | undefined {
  const everyone = mentionsEveryone(text);
  const mentioned = resolveMentions(text, mentionablesIn(space, directory));
  if (!everyone && mentioned.length === 0) return undefined;
  return resolveAddress({
    sender: { id: "", kind: "person" },
    mentioned,
    everyone,
    agents: harnessesIn(space, directory),
  }).addressed_to;
}

/**
 * Where a message typed now goes, as the capsule over the field says (ADR 0081), and why: an @ in
 * the text, the person's pick from its menu, or the room's default. Its ids are agents and people
 * (ADR 0204).
 */
export interface Aim {
  readonly ids: readonly string[];
  /** What decided it: an @, a reply to an agent's message (ADR 0219), a pick, or the room's default. */
  readonly by: "at" | "reply" | "pick" | "default";
  /**
   * For everybody here: Everyone picked, `@all`, the room's default, or a list that holds all of
   * them (ADR 0113, ADR 0114). It goes as `all`, so whoever is here when it goes has it, and the
   * field says Everyone; a list somebody built keeps its rows checked (`aimsAtEveryone`).
   */
  readonly all?: true | undefined;
}

/**
 * What a person picked from the field's list: some agents and people (ADR 0204), or `all`, which
 * is whoever is in the room when the message goes (ADR 0113). Everyone picked was its ids until 4
 * October 2026, and an agent who joined before the send was left out of it.
 */
export type AimPick = readonly string[] | "all";

/**
 * The field's aim for a draft, or nothing in a room where the writer has only one other or none,
 * where the field says nobody (ADR 0204: two or more others, people or agents). An @ decides over
 * a reply to an agent's message (ADR 0219), a reply over a pick, and a pick over the default; a
 * pick of those who have all left the room is no pick. `replying` is the line the draft replies
 * to, while the reply decides: the field passes none once an agent is picked after it.
 */
export function aimOf(
  text: string,
  pick: AimPick | undefined,
  space: Space,
  directory: Directory,
  selfId: string,
  replying?: string,
): Aim | undefined {
  const others = othersIn(space, directory, selfId);
  if (others.length <= 1) return undefined;
  const at = draftAim(text, space, directory, selfId);
  if (at !== undefined)
    return at.all === true ? { ids: others, by: "at", all: true } : { ...at, by: "at" };
  const answered = replying === undefined ? undefined : replyAgent(space, directory, replying);
  if (answered !== undefined) return { ids: [answered], by: "reply" };
  if (pick === "all") return { ids: others, by: "pick", all: true };
  const picked = pick?.filter((id) => others.includes(id)) ?? [];
  if (picked.length > 0) {
    return sameSet(picked, others)
      ? { ids: picked, by: "pick", all: true }
      : { ids: picked, by: "pick" };
  }
  return { ...nextAim(space, directory, selfId), by: "default" };
}

/**
 * The agent a reply to `lineId` is for (ADR 0219; the server's rule 3, `answered`): the message's
 * author, when that is an agent still in the room. A reply to a person's message, or to your own,
 * is for nobody new, and nor is one to a message this device doesn't hold.
 */
export function replyAgent(space: Space, directory: Directory, lineId: string): string | undefined {
  const line = space.lines.find((each) => each.id === lineId);
  if (line === undefined) return undefined;
  return harnessesIn(space, directory).includes(line.authorId) ? line.authorId : undefined;
}

/**
 * Who an @ in a draft makes it for, agents and people (ADR 0204), or nothing when no @ decides:
 * the server's own rule, as `draftAddress` asks it for the agents.
 */
function draftAim(
  text: string,
  space: Space,
  directory: Directory,
  selfId: string,
): { readonly ids: readonly string[]; readonly all?: true } | undefined {
  const everyone = mentionsEveryone(text);
  const mentioned = resolveMentions(text, mentionablesIn(space, directory));
  if (!everyone && mentioned.length === 0) return undefined;
  const address = resolveAddress({
    sender: { id: selfId, kind: "person" },
    mentioned,
    everyone,
    agents: harnessesIn(space, directory),
    people: peopleIn(space, directory),
  });
  if (address.addressed_to_all === true) return { ids: [], all: true };
  return { ids: [...address.addressed_to, ...(address.addressed_people ?? [])] };
}

/**
 * Whether the field says Everyone as Everyone, rather than as a list that happens to hold all of
 * them (ADR 0114): picked as Everyone, or the room's default, or an @ for everyone. A list the
 * person built stays a list, its rows checked, though it holds everybody here.
 */
export function aimsAtEveryone(aim: Aim, pick: AimPick | undefined): boolean {
  return aim.all === true && !(aim.by === "pick" && Array.isArray(pick));
}

/**
 * The pick once somebody is added to what the field says, or taken out of it (ADR 0114, ADR
 * 0204): a tap on their row's circle in the field's list. Adding starts from who the field says,
 * or afresh where it says Everyone, so the first tapped under Everyone is them alone. A list stays
 * a list, everybody in it or not; none is no pick, which puts the field back on its default.
 */
export function addedTo(
  aim: Aim,
  pick: AimPick | undefined,
  id: string,
  space: Space,
  directory: Directory,
): AimPick | undefined {
  const here = addressablesIn(space, directory);
  const now = aimsAtEveryone(aim, pick) ? [] : aim.ids.filter((each) => here.includes(each));
  const next = now.includes(id) ? now.filter((each) => each !== id) : [...now, id];
  return next.length === 0 ? undefined : next;
}

/**
 * What a send says of its aim on the wire, as `to` (ADR 0081, ADR 0204): nothing when an @ or a
 * reply decides (ADR 0219: Chips makes a reply to an agent's message that agent's, and a `to`
 * would outrank it), or it is for nobody, `all` for everybody here, and the ids otherwise, people's
 * included. Sending the default too keeps the field honest: the message goes where it said,
 * whatever arrived meanwhile.
 */
export function wireTo(aim: Aim | undefined): readonly string[] | "all" | undefined {
  if (aim === undefined || aim.by === "at" || aim.by === "reply") return undefined;
  if (aim.all === true) return "all";
  return aim.ids.length === 0 ? undefined : aim.ids;
}

/**
 * Who a send for `aim` says it is for, as its line will until Chips says: its agents, and its
 * people unless it is Everyone, which pushes nobody new (ADR 0204) and so names nobody new.
 */
export function aimedAt(
  aim: Aim,
  directory: Directory,
): { readonly agents: readonly string[]; readonly people: readonly string[] } {
  const people = aim.ids.filter((id) => participantKind(directory, id) === "person");
  return {
    agents: aim.ids.filter((id) => !people.includes(id)),
    people: aim.all === true ? [] : people,
  };
}

/** What the field says of its aim: "Everyone" for everybody here, else as `aimWords`. */
export function aimWordsOf(aim: Aim, space: Space, directory: Directory): string {
  return aim.all === true ? "Everyone" : aimWords(aim.ids, space, directory);
}

/**
 * The words for who a message is for: "No agent" for nobody, the names for up to three, "A and
 * B", and from four how many, "4 agents" (ADR 0114): beside the mark that stands for them, "A, B
 * and 2 more" was cut short to "A, B and …". Four people are "4 people", and four of both "2
 * people, 2 agents" (ADR 0204). Everyone is the aim's to say (`aimWordsOf`) or the route's.
 */
export function aimWords(ids: readonly string[], _space: Space, directory: Directory): string {
  if (ids.length === 0) return "No agent";
  return ids.length <= 3
    ? listed(ids.map((id) => nameOf(directory, id)))
    : countedWords(ids, directory);
}

/** Who a message went from and to, drawn with the lane's route over it (ADR 0081). */
export interface MessageTrail {
  readonly from: string;
  readonly to: readonly string[];
  /** It went to everyone in the room, whoever that was then (ADR 0113). */
  readonly all?: true | undefined;
}

/**
 * The words for where a message went, as the field said them when it was sent: "Everyone" for a
 * message to everyone, though the room has had agents come and go since, else as `aimWords`.
 */
export function routeWords(trail: MessageTrail, space: Space, directory: Directory): string {
  return trail.all === true ? "Everyone" : aimWords(trail.to, space, directory);
}

/**
 * The routes a room draws over its people's messages (ADR 0081, A2), by line id: over a message
 * whose address differs from the same person's message before it here, or that is their first
 * that says. A message that went where the last one did changed nothing, and gets none; so the
 * routes mark exactly where each person's default moved. Everyone after everyone is no move, a
 * harness added between them or not. Who a message is for holds its people too (ADR 0204). A room
 * of two, where nobody has a second to aim at, draws none, nor does a message for nobody.
 */
export function routesIn(space: Space, directory: Directory): ReadonlyMap<string, MessageTrail> {
  const routes = new Map<string, MessageTrail>();
  if (addressablesIn(space, directory).length <= 2) return routes;
  const last = new Map<string, Place>();
  for (const line of space.lines) {
    if (line.kind !== "text" || line.authorKind !== "person") continue;
    const place = placeOfLine(line);
    if (place === undefined) continue;
    const to = [...(line.addressedTo ?? []), ...place.people];
    const before = last.get(line.authorId);
    if (to.length > 0 && (before === undefined || !samePlace(before, place))) {
      routes.set(line.id, trailOf(line.authorId, to, place.agents));
    }
    last.set(line.authorId, place);
  }
  return routes;
}

/** A route, marked as everyone's where it went to everyone (ADR 0113). */
function trailOf(
  from: string,
  to: readonly string[],
  address: readonly string[] | "all",
): MessageTrail {
  return address === "all" ? { from, to, all: true } : { from, to };
}

/** Whether two lists hold the same ids, in any order. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** How many, by kind (ADR 0204): "1 agent", "4 people", "1 person, 3 agents". */
export function countedWords(ids: readonly string[], directory: Directory): string {
  const people = ids.filter((id) => participantKind(directory, id) === "person").length;
  const agents = ids.length - people;
  const ofPeople = `${people} ${people === 1 ? "person" : "people"}`;
  const ofAgents = `${agents} ${agents === 1 ? "agent" : "agents"}`;
  if (people === 0) return ofAgents;
  return agents === 0 ? ofPeople : `${ofPeople}, ${ofAgents}`;
}

/**
 * Whether a line takes feedback — a thumb or a note about what went wrong (M3.4): something a
 * harness said, a message or the summary that ends a run, already in the log and not taken
 * back. A person's own words, a card, a line still on its way take none; the rest have no
 * message id yet.
 *
 * Both kinds are the harness's to read. A thumb on a colleague's message would be a chat
 * reaction, which is a different feature with a different shape, and offering one everywhere
 * put four controls under every bubble in the room for the sake of two that meant anything.
 * The door is the wider of the two and still accepts a reaction on anybody's message; this is
 * what the screens offer.
 */
export function takesFeedback(line: Line): boolean {
  if (line.authorKind !== "harness") return false;
  return takesReaction(line);
}

/**
 * Whether a line takes a reaction (M5.4): anyone's words already in the log — a person's or a
 * harness's message, or a run's summary — and not taken back.
 */
export function takesReaction(line: Line): boolean {
  if (line.authorKind === "system" || line.pending === true || line.deleted === true) return false;
  return line.kind === "text" || line.kind === "summary";
}

/** Whether the reader may change a line's words (M5.4): their own, in the log, not taken back. */
export function mayEdit(line: Line, selfId: string): boolean {
  return line.kind === "text" && line.authorId === selfId && takesReaction(line);
}

/**
 * Whether the reader may take a line back (M5.4): their own, or anyone's when they own the
 * space or run the workspace. The door says the same.
 */
export function mayDelete(
  line: Line,
  selfId: string,
  standing: {
    readonly inSpace: SpaceRole | undefined;
    readonly inWorkspace: WorkspaceRole | undefined;
  },
): boolean {
  if (line.kind !== "text" || line.pending === true || line.deleted === true) return false;
  if (line.authorId === selfId) return true;
  return standing.inSpace === "owner" || administers(standing.inWorkspace);
}

/**
 * Whether the reader may delete a line for themselves (ADR 0167): any message in the log, anyone's,
 * one taken back too. Nobody else's room changes, so no standing is asked. The door says the same.
 */
export function mayHide(line: Line): boolean {
  if (line.authorKind === "system" || line.pending === true) return false;
  return line.kind === "text" || line.kind === "summary";
}

/** Whether the reader may pin in a space (M5.4): anyone in it but a guest. */
export function mayPin(inSpace: SpaceRole | undefined): boolean {
  return inSpace !== undefined && inSpace !== "guest";
}

/** The space a thread grew in, when the space is one: where its members and standing come from. */
export function parentOf(model: WorkspaceModel, space: Space): Space | undefined {
  return space.parentSpaceId === undefined
    ? undefined
    : model.spaces.find((each) => each.id === space.parentSpaceId);
}

/** The reader's standing in a space — a thread's is the parent's (M5.4). */
export function standingIn(
  model: WorkspaceModel,
  space: Space,
  selfId: string,
): SpaceRole | undefined {
  const room = parentOf(model, space) ?? space;
  return room.roles[selfId];
}

/**
 * Whether the lines in a room wear their author's name.
 *
 * In a room of two, every line is either mine or theirs, and the side it sits on says which; a
 * name over each one labels a room with two chairs (Arjun, 9 September 2026, looking at a
 * column of "Jacobian" and "You"). A third participant makes the question real, and then the
 * name goes inside the bubble at its top left — where Telegram, WhatsApp and Signal put it, and
 * where the blueprint's phone frame draws Priya — rather than in a header above every message.
 *
 * A thread has no members of its own; the room's are its (ADR 0035), so ask it of the room,
 * which `parentOf` finds.
 */
export function namesAuthors(space: Space): boolean {
  return space.members.length > 2;
}

/**
 * The lines a space draws: everything but an empty system line, and a lane's task card where the
 * route card for the same lane is already in this space — one lane, one card, in the space that
 * did the routing. A room and the media viewer's deck read the same lines, so a photo the room
 * draws is one the viewer can page to, and none it does not.
 */
export function visibleLines(space: Space, lanes: readonly Lane[]): readonly Line[] {
  const once = new Set(
    lanes
      .filter((lane) => lane.homeSpaceId === space.id && lane.linkedSpaceIds.includes(space.id))
      .map((lane) => lane.laneId),
  );
  return space.lines.filter(
    (line) =>
      (line.kind !== "system" || line.text !== "") &&
      !(line.kind === "task" && line.laneId !== undefined && once.has(line.laneId)),
  );
}

/** The lines pinned in a space, in the order they were pinned, still there to draw. */
export function pinnedLines(space: Space): readonly Line[] {
  return space.pins.flatMap((pin) => {
    const line = space.lines.find((each) => each.id === pin.lineId);
    return line === undefined ? [] : [line];
  });
}

/** The reader's standing in the workspace, or nothing when their joining has not folded yet. */
export function myRole(model: WorkspaceModel, selfId: string): WorkspaceRole | undefined {
  return model.people[selfId]?.role;
}

/** An owner or an admin: somebody who runs the workspace rather than just working in it. */
export function administers(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** The agents let work in a space without asking that still are (ADR 0281), against the clock. */
export function lettingWork(
  space: Space | undefined,
  now: number = Date.now(),
): readonly LetWork[] {
  return (space?.letWork ?? []).filter(
    (held) => held.until === undefined || Date.parse(held.until) > now,
  );
}

/**
 * Whether the reader may turn a harness's dial: an owner or an admin, as the server's door has it
 * (SEC-1). A `policy.updated` sets a harness's autonomy and the workspace's cap, which is the
 * approval gate for everyone, so the dial is theirs alone; everybody else sees the level and
 * cannot move it. Nobody may until the reader's own joining has folded.
 */
export function mayTurnDial(model: WorkspaceModel, selfId: string | undefined): boolean {
  return selfId !== undefined && administers(myRole(model, selfId));
}

/**
 * The face a space wears in a list is the name it goes by. A space called after its harness —
 * an untitled direct space — wears the harness, squircle and ring, the ring saying what its
 * latest run is doing; a channel wears a hash; a space with a title of its own wears the
 * title's initials in the title's hue, and so does a room named after the people in it.
 */
export type SpaceFace =
  | {
      readonly kind: "harness";
      readonly harnessId: string;
      readonly status: "idle" | "working" | "waiting";
    }
  | { readonly kind: "person" | "channel" };

/**
 * The name decides, not whether a run has happened there yet. Choosing by the run put the
 * harness's face on the two titled spaces it had worked in and the titles' initials on the
 * fifty it had not, in one list — and the initials were the right ones, because a title is what
 * tells fifty spaces of one harness apart (Arjun, 9 September 2026, twice: once for the split,
 * once when a first cut of this put the harness on all fifty-two). A harness that ran in an
 * untitled space with no membership row of its own — a lane's ephemeral child, a replay still
 * missing the row — is still whose room it is, so the run stands in when the members name
 * nobody.
 */
export function spaceFace(space: Space, directory: Directory): SpaceFace {
  if (space.kind === "channel") return { kind: "channel" };
  if (space.title !== undefined) return { kind: "person" };
  const harnesses = space.members.filter((id) => isAgent(directory, id));
  const harnessId = harnesses.length === 0 ? space.run?.harnessId : harnesses[0];
  if (harnessId === undefined || harnesses.length > 1) return { kind: "person" };
  const run = space.run?.harnessId === harnessId ? space.run : undefined;
  return { kind: "harness", harnessId, status: ringStatus(run) };
}

/** What the ring on a space's face says: waiting on somebody, at work, or nothing at all. */
function ringStatus(run: Run | undefined): "idle" | "working" | "waiting" {
  if (run?.state === "waiting") return "waiting";
  return run?.state === "running" || run?.state === "queued" ? "working" : "idle";
}

/**
 * The line under a room's name in a list, the phone's and the desktop's alike: "Needs a yes" while
 * its run waits on somebody, else its last line as plain words. The line itself may be Markdown,
 * and a list row has room for a sentence, not the source (`\`\`\`text Sun Sep 27…`). A fork's ask
 * (ADR 0087, Fork) is said by name, given who is who: the copy that joined, or the agent asked for;
 * and so is an ask for a new agent (ADR 0108): the agent that joined, or the harness and name asked.
 *
 * A queued turn's message is said as work rather than quoted (`taskWords`, ADR 0090): read out
 * as it arrives, the row read `💭 Working… ▸ browser · https://…`, which is the harness's own
 * markup for Telegram and Slack standing in a Chips list (Arjun, 1 October 2026).
 *
 * It is the start of the line, never all of it (`lineWords`).
 */
export function lastWords(space: Space, directory?: Directory): string {
  if (space.run?.state === "waiting") return "Needs a yes";
  const last = space.lines.at(-1);
  if (last === undefined) return "";
  if (last.fork !== undefined && directory !== undefined) {
    const copy = space.forked?.[last.id];
    return copy === undefined
      ? `Asked for a copy of ${nameOf(directory, last.fork.agentId)}`
      : `${nameOf(directory, copy)} joined`;
  }
  if (last.newAgent !== undefined && directory !== undefined) {
    const made = space.made?.[last.id];
    return made === undefined
      ? `Asked ${nameOf(directory, last.newAgent.harnessId)} for ${last.newAgent.name}`
      : `${nameOf(directory, made)} joined`;
  }
  const task = readTaskBubble(last.text);
  return task === undefined ? lineWords(last.text) : taskWords(task);
}

/**
 * How much of a message a row's one line is handed: more than the widest row shows, and no more.
 * A text view lays out all it is given to truncate it to a line, and one room's last reply was
 * 11,673 characters: laying its row out again took 30 to 50 ms each time, where a row with a
 * sentence took 3 (the phone's simulator, 16 October 2026, picking spaces, ADR 0181).
 */
const LINE_CHARS = 200;
/** How much of a message is read for it: the words come out of Markdown, so more than the line. */
const LINE_SOURCE = 4000;

/** The start of a message as a line's plain words, cut short of a split character. */
function lineWords(text: string): string {
  const words = plainWords(text.slice(0, LINE_SOURCE));
  if (words.length <= LINE_CHARS) return words;
  const code = words.charCodeAt(LINE_CHARS - 1);
  // A character outside the basic plane is two halves: a cut between them would end on half.
  return words.slice(0, code >= 0xd8_00 && code <= 0xdb_ff ? LINE_CHARS - 1 : LINE_CHARS);
}

/**
 * A queued turn in a row's width: what it is thinking and the call it has in hand, or the
 * receipt once the turn is over. The headline stays in the room — a row has one line, and what
 * the turn is doing now is the news in it.
 */
function taskWords(task: TaskBubble): string {
  const said = task.thought === undefined ? task.worked : verbWords(task.thought);
  return [said, stepWords(task.steps.at(-1))].filter((part) => part !== undefined).join(" · ");
}

/**
 * Who leads a room (ADR 0104): the agent last chosen, while it is still there. One that left leads
 * it no more, whatever was chosen. With nobody chosen, the harness the room was asked of, while it
 * is there and has not yet claimed it: its agent leads once it has (the server's `leadFromClaim`),
 * so the lead picked in the + is marked from the start and not only after the first message (ADR
 * 0149's addendum). Not the Main agent of a Main room (ADR 0069), which `leadOf` names.
 */
export function roomLeadOf(space: Space): string | undefined {
  const lead = space.lead ?? space.askedOf;
  return lead !== undefined && space.members.includes(lead) ? lead : undefined;
}

/**
 * What the room says beneath a message that turns working there heard, said for somebody else
 * (ADR 0106): "J1 heard this while working", "J1 and O1 heard this while working". Nothing for
 * a message no working turn heard.
 */
export function heardWords(line: Line, directory: Directory): string | undefined {
  const names = (line.heardBy ?? []).map((id) => nameOf(directory, id));
  if (names.length === 0) return undefined;
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who} heard this while working`;
}

/**
 * Whether a room has work going in it now, which is what the light running round its face in a
 * list says (ADR 0090). Two ways a room can be working, and they do not overlap: a run of its
 * own, which is what the room draws as a thinking bubble; or a turn out of the harness's own
 * queue, which has no run and shows as the one message it edits as it goes. A turn that has
 * ended says so in its own message — a receipt, no thought — and the light stops.
 *
 * Waiting is not working: a room that needs an answer says so in words, with the amber dot
 * beside them.
 */
export function spaceWorking(space: Space): boolean {
  if (space.run?.state === "running" || space.run?.state === "queued") return true;
  const last = space.lines.at(-1);
  return last !== undefined && readTaskBubble(last.text)?.thought !== undefined;
}

/**
 * Whether a run is still going: queued, running, or waiting on someone. The desktop's run panel
 * stands beside a room only then (ADR 0268); what an ended run did is asked of its reply.
 */
export function runGoing(run: Run): boolean {
  return !TERMINAL.includes(run.state);
}

/**
 * A run's goal as words to put beside the room — its header and the run panel — or nothing.
 * A goal with a `goal_from` is a person's words already in the room: a message they sent here
 * (`chips`), or their prompt at the harness, which the fold draws as their message (`harness`).
 * Saying it again there put the same message on screen two and three times (Arjun, 2 October
 * 2026). A goal nobody typed has nowhere else to be read.
 */
export function goalWords(run: Run): string | undefined {
  return run.goalFrom === undefined && run.goal !== "" ? run.goal : undefined;
}

/** Each model's spaces by id, made the first time one is looked up in it. */
const SPACES_BY_ID = new WeakMap<WorkspaceModel, ReadonlyMap<string, Space>>();

/**
 * A space of a model by its id, at the cost of a lookup rather than a walk of every room. A model
 * is never changed, only replaced (`Fold.model` freezes it), so its index is made once and goes
 * with it. A row that names its room — every agent's on the Agents tab and in search — walked
 * every room to find it, which is ten million steps for a thousand agents in ten thousand rooms.
 */
export function spaceById(model: WorkspaceModel, id: string): Space | undefined {
  let byId = SPACES_BY_ID.get(model);
  if (byId === undefined) {
    const made = new Map<string, Space>();
    for (const space of model.spaces) if (!made.has(space.id)) made.set(space.id, space);
    SPACES_BY_ID.set(model, made);
    byId = made;
  }
  return byId.get(id);
}

/** What a room a person asked a harness for goes by while it waits to be named. */
export const NEW_SPACE_NAME = "New space";

/**
 * What an untitled room a person asked a harness for is called, and nothing for any other room:
 * a display rule, with nothing stored. It is "New space" while the harness has done nothing with
 * it yet, because it may still name it. Once the harness has claimed the room or answered in it
 * without a name, it is not going to, and the person's first words stand in, which say what the
 * room is for better than anything else to hand: as plain words, so a list row, a room's bar and
 * the desktop's rail all say them alike.
 */
export function askedName(space: Space): string | undefined {
  if (space.askedOf === undefined || space.title !== undefined) return undefined;
  const answered =
    space.keyed === true || space.lines.some((line) => line.authorId === space.askedOf);
  if (!answered) return NEW_SPACE_NAME;
  const first = space.lines.find(
    (line) => line.kind === "text" && line.authorKind === "person" && line.deleted !== true,
  );
  // The start of the message, as a row's line is read (SEC-3): a name is a sentence, and the
  // list draws it on every render, so a 64 KB first message is not parsed whole for it.
  const words = first === undefined ? "" : plainWords(first.text.slice(0, LINE_SOURCE));
  return words === "" ? NEW_SPACE_NAME : words;
}

/**
 * What a space is called: its title; else, for a room a person asked a harness for, "New space"
 * or its first words (`askedName`); else its harness, else who is in it, the reader as "You"
 * (`membersName`, ADR 0082). An untitled space is named after whoever is in it, because a person
 * opening the app to a list of "Untitled" has learned nothing. The phone, the desktop and search
 * all call a room this.
 */
export function spaceTitle(
  space: Space,
  directory: Directory,
  selfId?: string | undefined,
): string {
  if (space.title !== undefined) return space.title;
  const asked = askedName(space);
  if (asked !== undefined) return asked;
  const harnessId = space.run?.harnessId;
  if (harnessId !== undefined) return nameOf(directory, harnessId);
  return membersName(space.members, directory, selfId);
}

/**
 * The spaces a list shows: the top-level ones this device is in, open before closed and the most
 * recently active first. A thread is not one — it belongs to the line it grew from — and neither
 * is a glimpse, a space known only through an ask that named the reader (ADR 0042): it holds one
 * card, which reaches the reader by push and opens on the ask's own screen.
 */
export function spaceList(model: WorkspaceModel): readonly Space[] {
  const spaces = model.spaces.filter(
    (space) => space.parentSpaceId === undefined && !space.glimpse,
  );
  const byActivity = (a: Space, b: Space) =>
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
  return [
    ...spaces.filter((space) => space.state !== "closed").sort(byActivity),
    ...spaces.filter((space) => space.state === "closed").sort(byActivity),
  ];
}
