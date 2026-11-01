/** A native reader inside its caller's sheet: one modal, fixed controls, selectable formatted words. */
import { markdownPage } from "@chipschat/core";
import * as Clipboard from "expo-clipboard";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Button, IconButton } from "../ui/Button";
import { useGround } from "../ui/ground";
import { SheetScroll } from "../ui/Sheet";
import { CLOSE, CLOSE_RISE, CLOSE_ROOM } from "../ui/SheetClose";
import { SCROLL_TOP } from "../ui/SheetScroll";
import { usePalette, useScheme } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { Markdown } from "./Markdown";
import { hasPageView, PAGE_FADE_MS, PAGE_WAITS_MS } from "./pages";

// Required only once a reply is read as a page, for the reason `pages.ts` gives.
const PageView = lazy(async () => ({
  default: (require("./PageView") as typeof import("./PageView")).PageView,
}));

/** Copy the original Markdown, including code indentation. Never copy a rendered/truncated preview. */
export function CopyText({
  text,
  label = "Copy text",
  cancelable,
}: {
  readonly text: string;
  readonly label?: string;
  /** False where it stands fixed beside words that scroll, so they cannot take its press. */
  readonly cancelable?: boolean | undefined;
}) {
  const [receipt, setReceipt] = useState<{ text: string; result: string }>();
  const result = receipt?.text === text ? receipt.result : undefined;
  const palette = usePalette();
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setReceipt({ text, result: "Copied" });
      AccessibilityInfo.announceForAccessibility("Copied");
    } catch {
      setReceipt({ text, result: "Could not copy. Select the text to copy it." });
    }
  };
  return (
    <View style={styles.copy}>
      <Button
        label={result === "Copied" ? "Copied" : label}
        onPress={() => void copy()}
        cancelable={cancelable}
      />
      {result === undefined || result === "Copied" ? null : (
        <Text accessibilityRole="alert" style={{ color: palette.redInk }}>
          {result}
        </Text>
      )}
    </View>
  );
}

/**
 * Formatted words are a `Text` a paragraph, and a phone's selectable `Text` keeps a selection
 * inside itself. On iOS it is one block whose press offers *Copy* for all of it, with no handles,
 * so a press copied one paragraph whole; on Android the handles take a range, but stop at the
 * paragraph's end. So a phone reads the words as a page instead (`ReplyPage`), where the web
 * view's own selection — handles, the loupe, the edit menu — runs across paragraphs, lists and
 * code. On the web target the words are already the page's own, and the browser selects across
 * them.
 */
const selectsAcrossAsAPage = () => Platform.OS !== "web";

/**
 * A message's words drawn formatted, to select part of; Copy takes the Markdown as it was
 * written. The message menu's Select text and a hand-off's full reply are the same reader. Select
 * text used to show the Markdown itself, `**` and all, until Arjun asked for it formatted
 * (18 October 2026).
 *
 * Back and Copy keep a press while the words coast, as the page's Done does (`PageSheet`): the
 * reader stands in a sheet opened from a line or a hand-off in the room's list, so in React's tree
 * that list is still around it, and a scroll it hears would take the finger from either.
 */
export function TextReader({
  title,
  text,
  onBack,
}: {
  readonly title: string;
  readonly text: string;
  readonly onBack: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.reader} testID="text-reader">
      <View style={styles.bar}>
        <IconButton
          icon="previous"
          label="Back"
          tone="quiet"
          size={CLOSE}
          onPress={onBack}
          cancelable={false}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
      </View>
      <Words text={text} title={title} />
      <CopyText text={text} cancelable={false} />
    </View>
  );
}

function Words({ text, title }: { readonly text: string; readonly title: string }) {
  const [paged, setPaged] = useState(() => selectsAcrossAsAPage() && hasPageView());
  if (paged) return <ReplyPage text={text} title={title} onFailed={() => setPaged(false)} />;
  return (
    <SheetScroll
      style={styles.scroll}
      contentContainerStyle={styles.words}
      testID="text-reader-scroll"
    >
      <Markdown text={text} selectable />
    </SheetScroll>
  );
}

/**
 * A formatted reply as one document, made as a Markdown file's page is (ADR 0123) and drawn in
 * the page view (ADR 0059), so a finger selects from a word in one paragraph to a word in the
 * next, across a list or a code block, as in Safari. It fades in once drawn, as a page does
 * (`PageSheet`); one that cannot be drawn is the bubble's words again. It stands on the sheet's
 * own ground, with code a step down from it as code is a step down from the paper (ADR 0192):
 * on the paper's colour it was a lighter band across a light sheet.
 *
 * It shares a finger with the sheet's pull as a list on a sheet does (`SheetScroll`, ADR 0175): at
 * its top a pull down takes the sheet, and off its top a drag down scrolls the page back. On
 * Android the pull took every drag down, so a page scrolled down could not be scrolled back up
 * (the emulator, 18 October 2026); there the page keeps the finger while it stands off its top
 * (`keepsFinger`). iOS's page is left as it was walked.
 */
function ReplyPage({
  text,
  title,
  onFailed,
}: {
  readonly text: string;
  readonly title: string;
  readonly onFailed: () => void;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const { ground, sunk } = useGround();
  const html = useMemo(
    () => markdownPage(text, { ...palette, bg: ground, surface2: sunk, scheme, size: TEXT.body }),
    [text, palette, ground, sunk, scheme],
  );
  const fade = useRef(new Animated.Value(0)).current;
  const draw = useCallback(() => {
    Animated.timing(fade, { toValue: 1, duration: PAGE_FADE_MS, useNativeDriver: true }).start();
  }, [fade]);
  useEffect(() => {
    const waited = setTimeout(draw, PAGE_WAITS_MS);
    return () => clearTimeout(waited);
  }, [draw]);
  const [top, setTop] = useState(true);
  const android = Platform.OS === "android";
  return (
    <Animated.View style={[styles.page, { opacity: fade }]} testID="text-reader-scroll">
      <Suspense fallback={null}>
        <PageView
          html={html}
          title={title}
          ground={ground}
          keepsFinger={android && !top}
          onScrolled={android ? (y) => setTop(y < SCROLL_TOP) : undefined}
          onReady={draw}
          onFailed={onFailed}
        />
      </Suspense>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  reader: { flex: 1, minHeight: 0, gap: SPACE.md },
  // Back at the left and the sheet's X at the right, the two the same size on the same line.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    flexShrink: 0,
    marginTop: -CLOSE_RISE,
    paddingRight: CLOSE_ROOM,
  },
  title: { flex: 1, fontSize: TEXT.lg, fontWeight: "600" },
  scroll: { flex: 1, minHeight: 0 },
  // The page keeps its own margins, so it takes the sheet's full width.
  page: { flex: 1, minHeight: 0, marginHorizontal: -SPACE.lg },
  words: { paddingVertical: SPACE.md },
  copy: { flexShrink: 0, gap: SPACE.sm },
});
