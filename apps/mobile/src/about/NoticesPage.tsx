/**
 * Acknowledgements (ADR 0295): every open-source package this app ships, with the licence its
 * manifest names, and its licence text folded open in place when its row is tapped. The list is
 * the packages in the app's iOS bundle, written by `pnpm notices` (`tools/notices`); Chips' own
 * packages are covered by Licence.
 */

import {
  NOTICE_NO_TEXT,
  NOTICES_TITLE,
  noticeLicence,
  noticesLead,
  type PackageNotice,
} from "@chipschat/core";
import { memo, useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../ui/Icon";
import { UnderNameList, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import LIST from "./notices.json";

const NOTICES: readonly PackageNotice[] = (LIST as { packages: PackageNotice[] }).packages;

export function NoticesPage() {
  const palette = usePalette();
  const column = useColumn();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((key: string) => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return (
    <UnderNameList
      data={NOTICES}
      keyExtractor={keyOf}
      contentContainerStyle={[styles.page, column]}
      ListHeaderComponent={
        <Text style={[styles.lead, { color: palette.ink2 }]}>
          {noticesLead((LIST as { app: string }).app)}
        </Text>
      }
      renderItem={({ item, index }) => (
        <NoticeRow
          notice={item}
          first={index === 0}
          last={index === NOTICES.length - 1}
          open={open.has(keyOf(item))}
          onToggle={toggle}
        />
      )}
      initialNumToRender={24}
      accessibilityLabel={NOTICES_TITLE}
      testID="notices-page"
    />
  );
}

function keyOf(notice: PackageNotice): string {
  return `${notice.name}@${notice.version}`;
}

const NoticeRow = memo(function NoticeRow({
  notice,
  first,
  last,
  open,
  onToggle,
}: {
  readonly notice: PackageNotice;
  readonly first: boolean;
  readonly last: boolean;
  readonly open: boolean;
  readonly onToggle: (key: string) => void;
}) {
  const palette = usePalette();
  const key = keyOf(notice);
  return (
    <View
      style={[
        styles.cell,
        { backgroundColor: palette.surface },
        first ? styles.first : null,
        last ? styles.last : null,
      ]}
    >
      {first ? null : <View style={[styles.line, { backgroundColor: palette.line }]} />}
      <Pressable
        onPress={() => onToggle(key)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${notice.name} ${notice.version}, ${noticeLicence(notice)}`}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: palette.surface2 } : null,
        ]}
        testID={`notice-${notice.name}`}
      >
        <View style={styles.words}>
          <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
            {notice.name}
          </Text>
          <Text style={[styles.version, { color: palette.ink3 }]}>{notice.version}</Text>
        </View>
        <Text style={[styles.licence, { color: palette.ink3 }]} numberOfLines={1}>
          {noticeLicence(notice)}
        </Text>
        <View style={open ? styles.turned : null}>
          <Icon name="next" size={16} color={palette.ink4} />
        </View>
      </Pressable>
      {open && (
        <View style={styles.texts} testID={`notice-text-${notice.name}`}>
          {notice.texts.length === 0 ? (
            <Text style={[styles.text, { color: palette.ink2 }]}>{NOTICE_NO_TEXT}</Text>
          ) : (
            notice.texts.map((each) => (
              <View key={each.file} style={styles.file}>
                <Text style={[styles.fileName, { color: palette.ink3 }]}>{each.file}</Text>
                <Text style={[styles.text, { color: palette.ink2 }]} selectable>
                  {each.text.trim()}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  page: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
  lead: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingBottom: SPACE.lg,
  },
  cell: { marginHorizontal: SPACE.lg, overflow: "hidden" },
  first: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  last: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  line: {
    position: "absolute",
    top: 0,
    left: SPACE.lg,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
  },
  words: { flex: 1, minWidth: 0 },
  name: { fontSize: TEXT.body },
  version: { fontSize: TEXT.sm, marginTop: 1 },
  licence: { fontSize: TEXT.md, maxWidth: "40%" },
  turned: { transform: [{ rotate: "90deg" }] },
  texts: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.md },
  file: { gap: SPACE.xs },
  fileName: { fontSize: TEXT.xs, fontWeight: "600" },
  text: { fontFamily: "Menlo", fontSize: TEXT.xs - 1, lineHeight: (TEXT.xs - 1) * 1.45 },
});
