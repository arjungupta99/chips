/**
 * People, from You (people review, Phase 1; ADR 0209): everyone in the workspace, the longest here
 * first. Each row says who they are, the spaces the reader shares with them, when they joined, and
 * their role as a tag in its own colour, so the list reads by role at a glance; chips over it narrow
 * it to those who run it, the members or the guests. A row opens the person's page, which says what
 * they can do and lets an owner or an admin change it. Only an owner or an admin reaches it: You's
 * row is theirs alone.
 */

import {
  inFilter,
  nameOf,
  type PeopleFilter,
  peopleFilters,
  peopleOf,
  ROLE_WORDS,
  type Store,
  selfLabel,
  spacesLine,
  spacesShared,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSnapshot } from "../store/provider";
import { avatarSide } from "../ui/Avatar";
import { Group, GroupFoot, GroupRow } from "../ui/Group";
import { UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { Face } from "./Faces";
import { FilterChips } from "./FilterChips";
import { Glides } from "./PeopleMotion";
import { RoleTag } from "./RoleTag";
import { shortDayWords } from "./words";

export function People({
  store,
  selfId,
  workspace,
  onOpen,
  selected,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** The workspace as a sentence names it. */
  readonly workspace: string;
  /** Open a person's page: pushed, unless beside You's list on an iPad (ADR 0256). */
  readonly onOpen?: ((personId: string) => void) | undefined;
  /** The person whose page stands beside the list, whose row wears the chosen ground (ADR 0276). */
  readonly selected?: string | undefined;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  const palette = usePalette();
  const column = useColumn();
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const { directory, model } = snapshot;
  const people = peopleOf(model);
  const chips = peopleFilters(people);
  // A filter whose last person left falls back to everybody.
  const chosen = chips.some((each) => each.key === filter) ? filter : "all";
  const shown = people.filter((each) => inFilter(each, chosen));
  return (
    <UnderName contentContainerStyle={[styles.list, column]} testID="people-list">
      <Text style={[styles.note, { color: palette.ink3 }]}>
        {people.length} in {workspace}, the longest here first.
      </Text>
      {chips.length > 2 ? (
        <FilterChips
          chips={chips}
          chosen={chosen}
          onChoose={setFilter}
          label="Show"
          testID="people-filters"
        />
      ) : null}
      <Group testID="people" inset={SPACE.lg + avatarSide("md") + SPACE.md}>
        {shown.map((person) => {
          const id = person.participantId;
          const self = id === selfId;
          const name = nameOf(directory, id);
          const where = spacesLine(spacesShared(model, directory, id, selfId));
          const joined = shortDayWords(person.joinedAt);
          return (
            <Glides key={id}>
              <GroupRow
                mark={<Face directory={directory} id={id} size="md" />}
                label={self ? selfLabel(name) : name}
                sub={where === undefined ? `Joined ${joined}` : `${where} · joined ${joined}`}
                subLines={1}
                trailing={<RoleTag role={person.role} />}
                onPress={() => (onOpen ? onOpen(id) : router.push(`/people/${id}`))}
                selected={selected === undefined ? undefined : id === selected}
                accessibilityLabel={`${self ? selfLabel(name) : name}, ${ROLE_WORDS[person.role]}`}
                testID={`person-row-${id}`}
              />
            </Glides>
          );
        })}
      </Group>
      <GroupFoot>
        {shown.length === 0
          ? "Nobody here yet."
          : "The spaces named are the ones you're in too. Tap somebody for what they can do."}
      </GroupFoot>
      <View style={styles.room} />
    </UnderName>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: SPACE.xxl * 2 },
  note: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.md,
  },
  room: { height: SPACE.lg },
});
