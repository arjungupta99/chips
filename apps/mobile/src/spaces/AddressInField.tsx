/**
 * Who a message goes to, in the field itself (ADR 0081, point 5), in a room where the writer has two
 * or more others, people or agents (ADR 0204). Arjun's A, 28 September 2026, from
 * `docs/proposals/address-in-the-bar-mocks.html`; people joined the list on 19 October 2026, after
 * Natalie's first day in Foodie, where one agent and two people had no list at all.
 *
 * It was a capsule of its own over the field, with a menu as a third piece of glass over that, and
 * "this pill and the list look disconnected from the rest". Now the faces lead the field, and the
 * field says who the words are for ("Message Everyone"). A tap on the faces opens the field itself
 * upward into the list: one piece of glass, which grows (`Capsule`'s `layout`), with the room rising
 * as it does for any line the field grows. A pick closes it back into the field. So does a tap on
 * the room, a key typed, or a send.
 *
 * Being the field's own glass, the list never stands on glass that fades. The menu's glass did, and
 * UIKit drew none behind it; nor is it a window of its own, as the menu was, which took the
 * keyboard as it came and gave it back as it went.
 *
 * The token says what core's `aimOf` says: an @ in the draft, marked with an @ in place of the
 * chevron, which goes again if the @ does; else the pick; else where your last message here went,
 * or Everyone before your first. Its arrow and faces are measured for a send, which flies them up
 * with the words to become the route (`SendFlight.tsx`) where the address changed.
 *
 * A room of many (ADR 0113, 4 October 2026): one face each ran past the field at fourteen agents,
 * and the list ran off the top of the screen, the lead first. Four or more are one mark and a
 * number (`Faces`). The list stands at most half the window, the field's words included, and
 * never past the room's bar (`listRoom`): the lead at its top, Everyone held at its foot by the
 * thumb, and the rest scrolling between, fading at the top while there is more above.
 *
 * Several, picked from the list (ADR 0114): a tap on an agent's name picks it alone and closes
 * the list, as it always did; a tap on the circle at its right adds it to who the message goes
 * to, or takes it out, and the list stays open (core's `addedTo`). Everyone is one tap, and closes
 * the list; the faces, a tap on the room or a key typed close it too. Arjun's way there: the name
 * for one and the circle for several, then "make tapping anywhere on the row add it", then "the
 * selection should happen with the check box only", then, the name doing nothing, "Name picks
 * one, closes".
 *
 * One, in one movement (ADR 0229): a finger that lands on the faces and slides up raises a column
 * of the same choices out of them, and letting go on a face picks it alone (`FaceColumn.tsx`).
 */

import type { Aim, AimPick, Directory, Space } from "@chipschat/core";
import {
  aimWordsOf,
  belongsTo,
  countedWords,
  harnessesIn,
  harnessUnder,
  nameOf,
  othersIn,
  peopleIn,
  roomHandles,
  roomLeadOf,
} from "@chipschat/core";
import MaskedView from "@react-native-masked-view/masked-view";
import { type Ref, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TOUCH_TARGET } from "../ui/Button";
import { Fades } from "../ui/Fades";
import { alpha } from "../ui/Glass";
import { Appearing } from "../ui/growing";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { Arrow, FACES_UP_TO, Faces, stepOf } from "./LaneChain";
import { LeadMark } from "./LeadMark";

/** The token's height: Send's, so one line of the field stays fifty points with both in it. */
export const TOKEN = 32;

/** One choice: an agent, a person (ADR 0204), or everybody here. */
export interface Choice {
  readonly ids: readonly string[];
  /** What picking it keeps: the harness, or `all`, whoever is here when the message goes. */
  readonly pick: AimPick;
  readonly name: string;
  readonly under?: string | undefined;
  /** Whether `under` is the handle that reaches it, drawn as a mention is. */
  readonly handle?: boolean | undefined;
  /** It leads the room (ADR 0104), and wears "Lead" beside its name as it does on the sheet. */
  readonly lead?: boolean | undefined;
  /** Its harness, where its name does not say it: "Milo" is Jacobian's (ADR 0150). */
  readonly harness?: string | undefined;
  /** Whose agent it is, where that is somebody else: "Dana's agent" (ADR 0234). */
  readonly owner?: string | undefined;
}

/**
 * Each agent in the room, the lead first (ADR 0113), with the @ that reaches it under its name
 * (ADR 0091) and the lead marked (ADR 0104); then each other person, with theirs (ADR 0204); then
 * Everyone, with who of them answers.
 */
export function choicesOf(space: Space, directory: Directory, selfId: string): Choice[] {
  const harnesses = harnessesIn(space, directory);
  const people = peopleIn(space, directory).filter((id) => id !== selfId);
  const handles = roomHandles(space, directory);
  const leads = space.home === true ? undefined : roomLeadOf(space);
  const first = leads !== undefined && harnesses.includes(leads) ? [leads] : [];
  const named = (id: string) => ({
    ids: [id],
    pick: [id],
    name: nameOf(directory, id),
    ...(handles[id] === undefined ? {} : { under: handles[id], handle: true }),
  });
  return [
    ...[...first, ...harnesses.filter((id) => id !== leads)].map((id) => ({
      ...named(id),
      ...(id === leads ? { lead: true } : {}),
      ...whose(directory, id, selfId),
      ...withHarness(directory, id),
    })),
    ...people.map(named),
    {
      ids: othersIn(space, directory, selfId),
      pick: "all" as const,
      name: "Everyone",
      under: answerWords(harnesses, people.length > 0, directory),
    },
  ];
}

/**
 * Who answers a message to Everyone, under its row: "Both answer" for two agents and "All answer"
 * for more, "Both agents answer" and "All agents answer" where people are listed too, the agent by
 * name where there is one, and "Everyone here reads it" where there is none (ADR 0204).
 */
function answerWords(agents: readonly string[], people: boolean, directory: Directory): string {
  const [only] = agents;
  if (only === undefined) return "Everyone here reads it";
  if (agents.length === 1) return `${nameOf(directory, only)} answers`;
  const who = people ? " agents" : "";
  return agents.length === 2 ? `Both${who} answer` : `All${who} answer`;
}

/** Whose an agent is, before its harness, where it is somebody else's (ADR 0234). */
function whose(directory: Directory, id: string, selfId: string): { owner?: string } {
  const owner = belongsTo(directory, id, selfId);
  return owner === undefined ? {} : { owner: `${owner}'s agent` };
}

/** The harness to say under an agent's name, where its name does not say it (ADR 0150). */
function withHarness(directory: Directory, id: string): { harness?: string } {
  const harness = harnessUnder(directory, id);
  return harness === undefined ? {} : { harness };
}

/**
 * What a reader hears for a choice: "J1, lead, @J1", "Milo, @Milo, Jacobian", "Theo, @Theo, Dana's
 * agent, Hermes", "Everyone, all answer".
 */
function labelOf(choice: Choice): string {
  const under =
    choice.under === undefined || choice.handle === true
      ? choice.under
      : choice.under.toLowerCase();
  return [
    choice.name,
    choice.lead === true ? "lead" : undefined,
    under,
    choice.owner,
    choice.harness,
  ]
    .filter((part) => part !== undefined)
    .join(", ");
}

/** What the empty field says for a draft aimed at `aim`: "Message Everyone", "Message Kay". */
export function messageWords(aim: Aim, space: Space, directory: Directory): string {
  return `Message ${aimWordsOf(aim, space, directory)}`;
}

/** The faces at the front of the field, which open the list. */
export function AddressToken({
  aim,
  space,
  directory,
  open,
  onPress,
  routeRef,
}: {
  readonly aim: Aim;
  readonly space: Space;
  readonly directory: Directory;
  /** Whether the list is open. */
  readonly open: boolean;
  readonly onPress: () => void;
  /** Its arrow and faces, which a send flies up to the route (`launchOf`). */
  readonly routeRef: Ref<View>;
}) {
  const palette = usePalette();
  const words = aimWordsOf(aim, space, directory);
  // How many, where the mark stands for Everyone (ADR 0113); "4 agents" says so already.
  const many =
    words === "Everyone" && aim.ids.length > FACES_UP_TO
      ? `, ${countedWords(aim.ids, directory)}`
      : "";
  return (
    <Pressable
      accessibilityRole="button"
      // "To", never "Send to": a button whose name holds "Send" is a second Send to anything that
      // finds buttons by a part of their name (the desktop's says the same).
      accessibilityLabel={`To ${words}${many}${BY_WORDS[aim.by]}`}
      accessibilityHint="Opens who to send to"
      accessibilityState={{ expanded: open }}
      hitSlop={4}
      onPress={onPress}
      style={[styles.token, { backgroundColor: alpha(palette.ink, open ? 0.11 : 0.06) }]}
      testID="address-capsule"
    >
      <View ref={routeRef} collapsable={false} style={styles.route}>
        <Arrow />
        {aim.ids.length === 0 ? null : (
          <Faces step={stepOf(directory, aim.ids)} size="xs" ground={palette.surface} />
        )}
      </View>
      <ByMark by={aim.by} open={open} />
    </Pressable>
  );
}

/** What the capsule says decided who a message is for, besides a pick or the room's default. */
const BY_WORDS: Readonly<Record<Aim["by"], string>> = {
  at: ", by @",
  reply: ", by reply",
  pick: "",
  default: "",
};

/**
 * The mark at the capsule's end: an @ when the words decide, the reply arrow when a reply to an
 * agent's message does (ADR 0219), and otherwise the chevron that opens the list.
 */
function ByMark({ by, open }: { readonly by: Aim["by"]; readonly open: boolean }) {
  const palette = usePalette();
  if (by === "at") {
    return (
      <Text style={[styles.at, { color: palette.ink3 }]} testID="address-by-at">
        @
      </Text>
    );
  }
  if (by === "reply") {
    return (
      <View testID="address-by-reply">
        <Icon name="reply" size={13} color={palette.ink3} weight={2.1} />
      </View>
    );
  }
  return (
    <View style={open ? styles.up : null}>
      <Icon name="down" size={12} color={palette.ink3} />
    </View>
  );
}

/** The list's own padding, over its rows and under them, for what the rows may have of its room. */
const LIST_PAD = 6 + 4 + 2;
/** What Everyone's row stands, before it has been measured: a name and the line under it. */
const EVERYONE_ROW = 52;
/** How far the rows fade in at the top while there are more above. */
const FADE = 24;
/** Between the list's top and the room's bar, where the list stops. */
const UNDER_BAR = SPACE.sm;

/**
 * How tall the list may stand (ADR 0113, Arjun: "up to 1/2 of screen height"): half the window
 * with the field's words, and never past the bar at the room's top, which matters with the keys
 * up, when there is less than half. From the words' row in the window and the bar's foot.
 */
export function listRoom(
  window: number,
  row: { top: number; height: number },
  bar: number,
): number {
  return Math.max(TOUCH_TARGET, Math.min(window / 2 - row.height, row.top - bar - UNDER_BAR));
}

/**
 * The list the field opens into: each agent, then each other person, then Everyone, with a check
 * on where it goes now. With `most`, the rows scroll in what it leaves after Everyone's row, which
 * stays put.
 */
export function AddressList({
  aim,
  space,
  directory,
  selfId,
  onPick,
  onAdd,
  whole,
  most,
}: {
  readonly aim: Aim;
  readonly space: Space;
  readonly directory: Directory;
  /** Who is writing: everybody else is listed, never them. */
  readonly selfId: string;
  readonly onPick: (pick: AimPick) => void;
  /** Whether the field says Everyone as Everyone (core's `aimsAtEveryone`), not as a list. */
  readonly whole: boolean;
  /** An agent's or a person's row: they join who it goes to, or leave, and the list stays open. */
  readonly onAdd: (id: string) => void;
  /** How tall it may stand (`listRoom`), once the field has been measured. */
  readonly most?: number | undefined;
}) {
  const palette = usePalette();
  const [above, setAbove] = useState(false);
  const [foot, setFoot] = useState(EVERYONE_ROW);
  const choices = choicesOf(space, directory, selfId);
  const everyone = choices.at(-1);
  // Under Everyone no circle is filled: the first one tapped starts afresh (`addedTo`).
  const rows = most === undefined ? undefined : Math.max(TOUCH_TARGET, most - foot - LIST_PAD);
  const scroll = (
    <ScrollView
      style={rows === undefined ? null : { maxHeight: rows }}
      // A row takes the first tap with the keys up, rather than the list putting them away.
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={32}
      onScroll={(event) => {
        const now = event.nativeEvent.contentOffset.y > 1;
        if (now !== above) setAbove(now);
      }}
      testID="address-scroll"
    >
      {choices.slice(0, -1).map((choice) => (
        <ChoiceRow
          key={choice.name}
          choice={choice}
          directory={directory}
          onPick={onPick}
          on={!whole && choice.ids.every((id) => aim.ids.includes(id))}
          onAdd={() => choice.ids.forEach(onAdd)}
        />
      ))}
    </ScrollView>
  );
  return (
    <Appearing style={[styles.list, { borderColor: palette.line }]} testID="address-menu">
      {Platform.OS === "web" ? (
        scroll
      ) : (
        <MaskedView maskElement={<Fades axis="y" start={above} end={false} length={FADE} />}>
          {scroll}
        </MaskedView>
      )}
      {everyone === undefined ? null : (
        <View
          style={[styles.everyone, { borderColor: palette.line }]}
          onLayout={(event) => setFoot(event.nativeEvent.layout.height)}
        >
          <ChoiceRow choice={everyone} on={whole} directory={directory} onPick={onPick} />
        </View>
      )}
    </Appearing>
  );
}

/** What a screen reader is offered on an agent's row for its circle (ADR 0114). */
const ADD = { name: "add", label: "Add to who it goes to" } as const;
const TAKE_OUT = { name: "add", label: "Take out of who it goes to" } as const;

/**
 * One row of the list: the faces, the name with the lead marked, the @ under it, and for an
 * agent its circle, filled while it is one of who the message goes to; Everyone's row has a check.
 * A tap on the row picks it alone and closes the list, Everyone's or an agent's (Arjun, 5 October
 * 2026: "Name picks one, closes"); a tap on an agent's circle adds it or takes it out and leaves
 * the list open, and a screen reader has the circle as the row's action.
 */
function ChoiceRow({
  choice,
  on,
  directory,
  onPick,
  onAdd,
}: {
  readonly choice: Choice;
  /** Its circle filled, or Everyone's check. */
  readonly on: boolean;
  readonly directory: Directory;
  readonly onPick: (pick: AimPick) => void;
  /** An agent's row: what a tap on its circle does, which is to add or take out. */
  readonly onAdd?: (() => void) | undefined;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={labelOf(choice)}
      accessibilityState={{ selected: on }}
      accessibilityActions={onAdd === undefined ? undefined : [on ? TAKE_OUT : ADD]}
      onAccessibilityAction={() => onAdd?.()}
      onPress={() => onPick(choice.pick)}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: alpha(palette.ink, 0.08) } : null,
      ]}
      testID={`address-choice-${choice.name}`}
    >
      <Faces step={stepOf(directory, choice.ids)} size="xs" ground={palette.surface} />
      <ChoiceWords choice={choice} />
      {onAdd === undefined ? (
        on ? (
          <Icon name="check" size={18} color={palette.blueInk} />
        ) : null
      ) : (
        <Circle on={on} onPress={onAdd} testID={`address-add-${choice.name}`} />
      )}
    </Pressable>
  );
}

/**
 * A row's words: the name with the lead marked, and the @ that reaches it, or Everyone's line. The
 * tag beside the column of faces says the same (`FaceColumn.tsx`), as wide as its words rather than
 * the rest of a row.
 */
export function ChoiceWords({
  choice,
  grows = true,
}: {
  readonly choice: Choice;
  readonly grows?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={grows ? styles.words : null}>
      <View style={styles.named}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
          {choice.name}
        </Text>
        {choice.lead === true ? <LeadMark /> : null}
      </View>
      {choice.under === undefined ? null : (
        <Text
          numberOfLines={1}
          style={[
            styles.under,
            choice.handle === true
              ? [styles.handle, { color: palette.blueInk }]
              : { color: palette.ink3 },
          ]}
        >
          {choice.under}
          {choice.owner === undefined ? null : (
            <Text style={[styles.harness, { color: palette.ink3 }]}>
              {" · "}
              <Text style={[styles.owner, { color: palette.ink2 }]}>{choice.owner}</Text>
            </Text>
          )}
          {choice.harness === undefined ? null : (
            <Text style={[styles.harness, { color: palette.ink3 }]}>{` · ${choice.harness}`}</Text>
          )}
        </Text>
      )}
    </View>
  );
}

/** Round the circle's target, past the target itself, for a thumb that lands near it. */
const CIRCLE_SLOP = { top: 6, bottom: 6, left: 10, right: 6 } as const;

/**
 * The circle at an agent's right, filled while it is one of who the message goes to: a tap on it
 * adds the agent or takes it out, and the list stays open. Its own press inside the row's, so the
 * row's tap still picks one alone. Its target is a thumb's square round it and then some (Arjun:
 * "increase it's touch area a bit"), where the circle alone was twenty-four points.
 */
function Circle({
  on,
  onPress,
  testID,
}: {
  readonly on: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessible={false}
      hitSlop={CIRCLE_SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.target, pressed ? styles.targetPressed : null]}
      testID={`${testID}-target`}
    >
      <View
        style={[
          styles.circle,
          on
            ? { backgroundColor: palette.blue, borderColor: palette.blue }
            : { borderColor: palette.ink4 },
        ]}
        testID={testID}
      >
        {on ? <Icon name="check" size={14} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  token: {
    height: TOKEN,
    borderRadius: TOKEN / 2,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.sm,
  },
  route: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  up: { transform: [{ rotate: "180deg" }] },
  at: { fontSize: TEXT.sm, fontWeight: "600" },
  // Six points round the rows, and a hairline between them and the words, as the mock has it.
  list: { padding: 6, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  // The circle's target: a thumb's square, reaching into the row's padding so the circle stays
  // where it was drawn, with `CIRCLE_SLOP` round it.
  target: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -SPACE.sm,
    marginRight: -(SPACE.sm + 2),
  },
  targetPressed: { transform: [{ scale: 0.9 }] },
  // An agent's circle: a check's width inside.
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  // Everyone, under the rows that scroll and parted from them, where the thumb is.
  everyone: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2, paddingTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm + 2,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: SPACE.sm + 2,
    paddingVertical: SPACE.xs,
    borderRadius: 14,
  },
  words: { flex: 1 },
  named: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  name: { fontSize: TEXT.md + 1, flexShrink: 1 },
  under: { fontSize: TEXT.xs },
  handle: { fontWeight: "600" },
  // The harness after the handle reads as the handle's note, not as part of it.
  harness: { fontWeight: "400" },
  // Whose agent it is: a step darker than the note it sits in, so it is read (ADR 0234).
  owner: { fontWeight: "600" },
});
