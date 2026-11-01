/**
 * A person's role as a small tag (ADR 0209): its own soft colour, so a list of people reads by role
 * at a glance. Flat: a tint and its ink, no edge and no gloss. Gold is an owner's, as the app's gold
 * is the workspace's; blue an admin's, green a member's, amber a guest's.
 */

import { ROLE_WORDS, type WorkspaceRole } from "@chipschat/core";
import { StyleSheet, Text } from "react-native";
import { usePalette } from "../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";

/** The tag's ground and ink for a role, in this palette. */
export function roleTone(palette: Palette, role: WorkspaceRole) {
  return {
    owner: { ground: palette.goldSoft, ink: palette.goldDeep },
    admin: { ground: palette.blueSoft, ink: palette.blueInk },
    member: { ground: palette.greenSoft, ink: palette.greenInk },
    guest: { ground: palette.amberSoft, ink: palette.amberInk },
  }[role];
}

export function RoleTag({
  role,
  testID,
}: {
  readonly role: WorkspaceRole;
  readonly testID?: string | undefined;
}) {
  const tone = roleTone(usePalette(), role);
  return (
    <Text
      style={[styles.tag, { backgroundColor: tone.ground, color: tone.ink }]}
      testID={testID}
      accessibilityLabel={ROLE_WORDS[role]}
    >
      {ROLE_WORDS[role]}
    </Text>
  );
}

const styles = StyleSheet.create({
  tag: {
    fontSize: TEXT.xs,
    fontWeight: "600",
    paddingHorizontal: SPACE.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
  },
});
