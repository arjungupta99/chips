/**
 * You → Permissions (ADR 0299, simplified by ADR 0300): every harness at once. The agents let work
 * without asking just now, each with Stop, while any are; then each harness, its line saying what
 * its own settings let through, marked where Chips's rules are on. A row opens the harness's own
 * Permissions, where both are set.
 */

import {
  CHIPS_RULES_TITLE,
  HARNESSES_HEADING,
  type Snapshot,
  type Store,
  WORKING_HEADING,
  workingWithoutAsking,
  workspaceHarnesses,
  YOU_HARNESSES_FOOT,
  youPermissions,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOwnRulesOf } from "../harnesses/permissions/ownRules";
import { BandIn } from "../spaces/LetWorkMotion";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Group, GroupFoot, GroupHeading } from "../ui/Group";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useNow } from "../ui/useNow";

/** The page and what stands over its scroll: the dust, and Undo after a removal. */
export function useYouPermissions({
  store,
  snapshot,
  selfId,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
}): { readonly body: ReactNode; readonly over: ReactNode } {
  const router = useRouter();
  const palette = usePalette();
  const { directory } = snapshot;
  const owns = useOwnRulesOf(
    store,
    snapshot,
    workspaceHarnesses(directory).map((harness) => harness.id),
  );
  const you = youPermissions(
    { model: snapshot.model, directory, keepsHarnessRules: snapshot.keepsHarnessRules },
    selfId,
    owns,
  );
  const body = (
    <View style={styles.body} testID="you-permissions">
      <Working store={store} snapshot={snapshot} />
      <View>
        <GroupHeading>{HARNESSES_HEADING}</GroupHeading>
        <Group testID="perms-harnesses">
          {you.harnesses.map((row, at) => (
            <View
              key={row.harnessId}
              style={
                at === 0
                  ? null
                  : { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth }
              }
              testID={`perms-harness-${row.harnessId}`}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, ${row.line}${row.chipsOn ? `, ${CHIPS_RULES_TITLE} on` : ""}`}
                accessibilityHint="Opens its permissions"
                onPress={() => {
                  feel.tap();
                  router.push({
                    pathname: "/harnesses/[id]/[part]",
                    params: { id: row.harnessId, part: "asks" },
                  });
                }}
                style={({ pressed }) => [styles.harness, { opacity: pressed ? 0.6 : 1 }]}
                testID={`perms-open-${row.harnessId}`}
              >
                <Avatar name={row.name} kind="harness" size="sm" decorative />
                <View style={styles.grow}>
                  <Text style={[styles.title, { color: palette.ink }]}>{row.name}</Text>
                  <Text
                    style={[
                      styles.note,
                      {
                        color: row.gold
                          ? palette.goldDeep
                          : row.warn
                            ? palette.amberInk
                            : palette.ink3,
                      },
                    ]}
                    testID={`perms-line-${row.harnessId}`}
                  >
                    {row.line}
                  </Text>
                  {row.chipsOn ? (
                    <Text
                      style={[styles.tag, { color: palette.accent }]}
                      testID={`perms-chips-on-${row.harnessId}`}
                    >
                      {CHIPS_RULES_TITLE}
                    </Text>
                  ) : null}
                </View>
                <Icon name="next" size={14} color={palette.ink4} weight={2.4} />
              </Pressable>
            </View>
          ))}
        </Group>
        <GroupFoot>{YOU_HARNESSES_FOOT}</GroupFoot>
      </View>
    </View>
  );
  return { body, over: null };
}

/** The agents let work without asking now (ADR 0281), each with where, until when, and Stop. */
function Working({ store, snapshot }: { readonly store: Store; readonly snapshot: Snapshot }) {
  const palette = usePalette();
  const now = useNow(snapshot.model.spaces.some((space) => space.letWork !== undefined));
  const rows = workingWithoutAsking(snapshot.model, snapshot.directory, now);
  if (rows.length === 0) return null;
  return (
    <View testID="perms-working">
      <GroupHeading>{WORKING_HEADING}</GroupHeading>
      <Group>
        {rows.map((row, index) => (
          <BandIn
            key={`${row.spaceId} ${row.held.asker}`}
            style={[
              styles.working,
              index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth },
              { borderColor: palette.line },
            ]}
            testID={`perms-working-${row.held.asker}`}
          >
            <View style={styles.grow}>
              <Text style={[styles.title, { color: palette.ink }]}>{row.name}</Text>
              <Text style={[styles.note, { color: palette.ink3 }]}>{row.line}</Text>
            </View>
            <Button
              label="Stop"
              onPress={() => store.stopLetWork({ spaceId: row.spaceId, asker: row.held.asker })}
              testID={`perms-working-stop-${row.held.asker}`}
            />
          </BandIn>
        ))}
      </Group>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg, paddingBottom: SPACE.xxl },
  // Groups keep their own margin from the edge; cards here keep the same.
  inset: { marginHorizontal: SPACE.lg },
  grow: { flex: 1, gap: 2 },
  title: { fontSize: TEXT.md, fontWeight: "600" },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  snoozeHead: { flexDirection: "row", gap: SPACE.md, alignItems: "flex-start" },
  mark: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: { fontSize: TEXT.xs, fontWeight: "700", paddingTop: 2 },
  harness: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  open: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.md },
  working: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.lg,
  },
});
