/**
 * Faces in a line, for what People, a person's page and Invite someone say about who (ADR 0209).
 *
 * `FaceStack` overlaps a few faces, each in a ring of the ground they stand on, and says how many
 * more there are; they pop in one after another the first time it is drawn. `FacesShown` keeps a
 * face for everybody who might be seen and grows the ones that are while it folds the rest away,
 * so the invite's card changes as the role and the room change rather than redrawing: the faces
 * stay mounted, and only their width, scale and fade move (a view leaving the tree mid-animation
 * is the exit trap the Read all count found).
 */

import type { Directory } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { Avatar, type AvatarSize, avatarSide } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { usePalette } from "../ui/theme";
import { TEXT } from "../ui/tokens";
import { Folding, PopIn } from "./PeopleMotion";

const RING = 2;

/** A participant's face as every list draws it: a person's circle, an agent's outline. */
export function Face({
  directory,
  id,
  size,
}: {
  readonly directory: Directory;
  readonly id: string;
  readonly size: AvatarSize;
}) {
  return (
    <Avatar name={nameOf(directory, id)} {...faceProps(directory, id)} size={size} decorative />
  );
}

/** A few faces overlapping, and how many more: You's People row, a line of what somebody sees. */
export function FaceStack({
  directory,
  ids,
  size = "xs",
  most = 4,
  testID,
}: {
  readonly directory: Directory;
  readonly ids: readonly string[];
  readonly size?: AvatarSize;
  readonly most?: number;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const { ground } = useGround();
  const side = avatarSide(size);
  const shown = ids.length > most ? ids.slice(0, most - 1) : ids;
  const more = ids.length - shown.length;
  return (
    <View style={styles.stack} testID={testID} accessible={false}>
      {shown.map((id, index) => (
        <PopIn
          key={id}
          delay={120 + index * 70}
          style={[
            styles.ringed,
            {
              backgroundColor: ground,
              borderRadius: side,
              marginLeft: index === 0 ? 0 : -side * 0.3,
            },
          ]}
        >
          <Face directory={directory} id={id} size={size} />
        </PopIn>
      ))}
      {more > 0 ? (
        <View
          style={[
            styles.ringed,
            styles.more,
            {
              width: side + RING * 2,
              height: side + RING * 2,
              borderRadius: side,
              marginLeft: -side * 0.3,
              backgroundColor: palette.surface3,
              borderColor: ground,
            },
          ]}
        >
          <Text style={[styles.moreWord, { color: palette.ink2 }]}>{`+${more}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A face for each of `all`, grown where it is in `shown` and folded away where it is not, with
 * how many are shown at the end. Nothing shown says `none`.
 */
export function FacesShown({
  face,
  all,
  shown,
  none,
  size = "sm",
  testID,
}: {
  /** How each id is drawn: a person's or an agent's face, or a room's. */
  readonly face: (id: string) => ReactNode;
  readonly all: readonly string[];
  readonly shown: readonly string[];
  readonly none: string;
  readonly size?: AvatarSize;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const count = all.filter((id) => shown.includes(id)).length;
  return (
    <View style={styles.shownLine} testID={testID}>
      <View style={styles.shownFaces}>
        {all.map((id, index) => (
          <Folding key={id} on={shown.includes(id)} width={avatarSide(size) + 4} order={index}>
            {face(id)}
          </Folding>
        ))}
        {count === 0 ? (
          <Text style={[styles.none, { color: palette.ink4 }]} numberOfLines={1}>
            {none}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: "row", alignItems: "center" },
  ringed: { padding: RING },
  more: { alignItems: "center", justifyContent: "center", borderWidth: RING, padding: 0 },
  moreWord: { fontSize: TEXT.xs, fontWeight: "600" },
  shownLine: { flex: 1, minWidth: 0 },
  shownFaces: { flexDirection: "row", alignItems: "center", overflow: "hidden", minHeight: 30 },
  none: { fontSize: TEXT.md },
});
