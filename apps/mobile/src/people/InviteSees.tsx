/**
 * What an invite lets somebody see, under the choices that make it (ADR 0209): the people, the
 * agents and the room they'll find, as faces that grow in and fold away as the role and the room
 * change, and core's sentence under them. And the card they'll see when they open the link, as the
 * phone's join card draws it (ADR 0164), so the maker reads it before sending.
 */

import {
  type Directory,
  invitedWords,
  inviteSees,
  inviteSeesWords,
  joinFacts,
  joinTitle,
  nameOf,
  roleMeansFor,
  type Snapshot,
  type Space,
  spaceTitle,
  type WorkspaceRole,
} from "@chipschat/core";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RowAvatar } from "../spaces/RowAvatar";
import { Avatar } from "../ui/Avatar";
import { Group } from "../ui/Group";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Face, FacesShown } from "./Faces";
import { RisesIn } from "./PeopleMotion";

/** Who and what a link's newcomer will see, as faces and a sentence. */
export function InviteSees({
  snapshot,
  selfId,
  workspace,
  role,
  space,
  rooms,
}: {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly workspace: string;
  readonly role: WorkspaceRole;
  /** The room the link brings them into. */
  readonly space: Space | undefined;
  /** Every room the form could name, for the faces that fold in and out. */
  readonly rooms: readonly Space[];
}) {
  const palette = usePalette();
  const { model, directory } = snapshot;
  const seen = inviteSees(model, directory, role, space?.id);
  const everybody = inviteSees(model, directory, "owner");
  const roomIds = uniq([
    ...rooms.map((each) => each.id),
    ...(space === undefined ? [] : [space.id]),
  ]);
  const names = (ids: readonly string[]) => ids.map((id) => nameOf(directory, id));
  const room = (id: string) => model.spaces.find((each) => each.id === id);
  return (
    <Group testID="invite-sees">
      <Line label="People">
        <FacesShown
          face={(id) => <Face directory={directory} id={id} size="sm" />}
          all={uniq([...everybody.people, ...seen.people])}
          shown={seen.people}
          none="Nobody yet"
          testID="sees-people"
        />
      </Line>
      <Line label="Agents">
        <FacesShown
          face={(id) => <Face directory={directory} id={id} size="sm" />}
          all={uniq([...everybody.agents, ...seen.agents])}
          shown={seen.agents}
          none="None yet"
          testID="sees-agents"
        />
      </Line>
      <Line label="Spaces">
        <FacesShown
          face={(id) => {
            const found = room(id);
            return found === undefined ? null : (
              <RowAvatar
                space={found}
                directory={directory}
                title={spaceTitle(found, directory, selfId)}
                icon={snapshot.spaceIcons.get(id)}
                size="sm"
              />
            );
          }}
          all={roomIds}
          shown={seen.spaces}
          none="None yet"
          testID="sees-spaces"
        />
      </Line>
      <Text style={[styles.says, { color: palette.ink2 }]} testID="invite-role-means">
        {inviteSeesWords({
          role,
          workspace,
          space: space === undefined ? undefined : spaceTitle(space, directory, selfId),
          people: names(seen.people),
          agents: names(seen.agents),
        })}
      </Text>
    </Group>
  );
}

function Line({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.line}>
      <Text style={[styles.label, { color: palette.ink3 }]}>{label}</Text>
      {children}
    </View>
  );
}

/** The card a link opens to, as the phone's join card says it: what the maker is about to send. */
export function JoinPreview({
  directory,
  selfId,
  workspace,
  role,
  spaceName,
}: {
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  readonly role: WorkspaceRole;
  readonly spaceName: string | undefined;
}) {
  const palette = usePalette();
  const said = {
    workspaceName: workspace,
    role,
    invitedByName: nameOf(directory, selfId),
    spaceName,
  };
  return (
    <RisesIn
      style={[styles.card, { borderColor: palette.line2, backgroundColor: palette.surface }]}
      testID="join-preview"
    >
      <Avatar
        name={nameOf(directory, selfId)}
        kind="person"
        size="lg"
        icon={directory[selfId]?.face}
        decorative
      />
      <Text style={[styles.title, { color: palette.ink }]}>{joinTitle(said)}</Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>{invitedWords(said)}</Text>
      <Text style={[styles.means, { color: palette.ink3 }]}>{roleMeansFor(role, spaceName)}</Text>
      {joinFacts(said).map((fact) => (
        <View key={fact} style={styles.fact}>
          <View style={[styles.dot, { backgroundColor: palette.green }]} />
          <Text style={[styles.factWords, { color: palette.ink2 }]}>{fact}</Text>
        </View>
      ))}
    </RisesIn>
  );
}

function uniq(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 46,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xs,
  },
  label: { width: 60, fontSize: TEXT.sm },
  says: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  card: {
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.xxl,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    gap: SPACE.sm,
  },
  title: { fontSize: TEXT.xl, fontWeight: "700", textAlign: "center" },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, textAlign: "center" },
  means: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, textAlign: "center" },
  fact: { flexDirection: "row", gap: SPACE.sm, alignSelf: "stretch", alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  factWords: { flex: 1, fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
});
