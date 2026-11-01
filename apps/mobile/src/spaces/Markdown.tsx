/**
 * The words of a message, as core parsed them (`packages/core/src/markdown.ts`): paragraphs,
 * headings, lists, quotes, rules, tables, fenced code and pictures, and in them bold, italic,
 * inline code, links and @mentions. HTML stays out: a chat that draws it is a chat where a
 * harness can draw anything it likes on a person's screen.
 *
 * A table (ADR 0184) runs edge to edge in its bubble, a size down from the words around it, its
 * heading row tinted and a line under each row. Its columns are laid out by `tableLayout`: one
 * that fits shares the bubble's width out as a browser would, and one that does not scrolls
 * sideways inside the bubble, so the room never does. A heading is one size, a step up from the
 * words and bold; a bubble is not a document, and has no outline for levels to show.
 *
 * A picture (`![alt](src)`, ADR 0068) is laid out as a photo the message carried would be
 * (`Attachments`): one alone at its own shape and no wider than a thumbnail, more than one as
 * square tiles two to a row. It is fetched from where it lives, by the phone, and a tap opens
 * it — or what it links to — in the phone's browser. One that will not load is its words as a
 * link, so a message never shows an empty frame.
 *
 * A link opens in the phone's browser and nowhere else. `safeHref` has already thrown away
 * anything that is not http, https or mailto; `Linking.openURL` is then the phone's own
 * decision about what to do with it, and no `javascript:` or `data:` URL can reach it.
 *
 * Dynamic Type carries these words up to half again and no further (`BUBBLE.maxScale`, WP5).
 * It is set on the paragraph and on the code block, which every run inside them inherits, so
 * the cap is said twice in this file and holds for bold, links, mentions and all the rest.
 *
 * A message a search opened marks the words searched for, for a moment (ADR 0133, `marks`): in
 * its plain, bold and italic runs and its mentions, split by core's `wordMarks` — the words the
 * server found it by — and drawn as a result row draws them (`MarkedParts`). Code and links are
 * left as they are: the one is words kept exactly as written, and the other is already blue.
 */

import type { Align, Block, Cell, Inline, Picture, Table } from "@chipschat/core";
import { markedParts, parseMarkdown, safeHref, wordMarks } from "@chipschat/core";
import { createContext, Fragment, type ReactNode, useContext, useMemo, useState } from "react";
import {
  Image,
  type ImageLoadEvent,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MarkedParts } from "../ui/Marked";
import { usePalette } from "../ui/theme";
import { BUBBLE, LEADING_PHONE, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { TILE_MAX, tileShape } from "./Attachments";
import { CELL_PAD, type Column, EDGE_PAD, type TableLayout, tableLayout } from "./tableLayout";
import { WideTable } from "./WideTable";

/**
 * The ink of the bubble these words are in, when it is not the page's.
 *
 * Your own bubble is the ground inverted, and text the colour of the page is invisible on it.
 * A context rather than a prop through every run: a link four levels down a parsed document
 * needs the same answer as the paragraph around it, and the alternative is threading one string
 * through five components that have no other use for it.
 */
const BubbleInk = createContext<string | undefined>(undefined);
const Selection = createContext(false);
/** The words a search looked for, as core folds them (`searchTerms`), while they are marked. */
const Marks = createContext<readonly string[] | undefined>(undefined);
/** Prose a size down, where the words are detail under something else: an approval's preview. */
const Small = createContext(false);
/** Words in a quotation, which take the quieter ink. */
const Quoted = createContext(false);
/**
 * What holding the message does, where it does something (`Line`'s `Hold`). A table that scrolls
 * sideways has to take a touch inside itself, or the press round the bubble keeps it and the table
 * never moves, so the table answers a hold itself with this.
 */
export const HoldLine = createContext<(() => void) | undefined>(undefined);

type List = Extract<Block, { readonly type: "list" }>;

export function Markdown({
  text,
  ink,
  selectable = false,
  marks,
  small = false,
}: {
  readonly text: string;
  /** The colour these words take, where the bubble is not the page's own ground. */
  readonly ink?: string | undefined;
  readonly selectable?: boolean;
  /** Words to mark where they are said: a search's terms, on the line it opened (ADR 0133). */
  readonly marks?: readonly string[] | undefined;
  /** Prose a size down, for words that are detail under a headline (ADR 0142's card). */
  readonly small?: boolean;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <BubbleInk.Provider value={ink}>
      <Selection.Provider value={selectable}>
        <Marks.Provider value={marks?.length === 0 ? undefined : marks}>
          <Small.Provider value={small}>
            <Blocks blocks={blocks} />
          </Small.Provider>
        </Marks.Provider>
      </Selection.Provider>
    </BubbleInk.Provider>
  );
}

function Blocks({ blocks }: { readonly blocks: readonly Block[] }) {
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => (
        // The AST has no ids and its order is the document's, so the index is the identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed block is only ever itself.
        <BlockView key={index} block={block} first={index === 0} />
      ))}
    </View>
  );
}

function BlockView({ block, first }: { readonly block: Block; readonly first: boolean }) {
  switch (block.type) {
    case "pictures":
      return <Pictures pictures={block.pictures} />;
    case "code":
      return <CodeBlock text={block.text} />;
    case "heading":
      return <Heading runs={block.children} first={first} />;
    case "list":
      return <ListView list={block} />;
    case "quote":
      return <Quote blocks={block.blocks} />;
    case "rule":
      return <Rule />;
    case "table":
      return <TableView table={block} />;
    default:
      return <Paragraph runs={block.children} />;
  }
}

/** The ink words take where they stand: the bubble's own, or the quieter one in a quotation. */
function useInk(): string {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  const quoted = useContext(Quoted);
  return ink ?? (quoted ? palette.ink2 : palette.ink);
}

function Paragraph({ runs }: { readonly runs: readonly Inline[] }) {
  const selectable = useContext(Selection);
  const small = useContext(Small);
  return (
    <Text
      selectable={selectable}
      maxFontSizeMultiplier={BUBBLE.maxScale}
      style={[styles.paragraph, small ? styles.small : null, { color: useInk() }]}
    >
      <Runs runs={runs} />
    </Text>
  );
}

/** A step up and bold, with a little more room above it than between paragraphs. */
function Heading({ runs, first }: { readonly runs: readonly Inline[]; readonly first: boolean }) {
  const selectable = useContext(Selection);
  const small = useContext(Small);
  return (
    <Text
      accessibilityRole="header"
      selectable={selectable}
      maxFontSizeMultiplier={BUBBLE.maxScale}
      style={[
        small ? styles.headingSmall : styles.heading,
        first ? null : styles.headingAfter,
        { color: useInk() },
      ]}
    >
      <Runs runs={runs} />
    </Text>
  );
}

/** Each item beside its bullet or number, which hang in a gutter of their own. */
function ListView({ list }: { readonly list: List }) {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  const small = useContext(Small);
  const { fontScale } = useWindowDimensions();
  const last = list.start + list.items.length - 1;
  const gutter = (list.ordered ? 10 * String(last).length + 16 : 12) * scaled(fontScale);
  return (
    <View style={styles.list}>
      {list.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed item is only ever itself.
        <View key={index} style={styles.item}>
          <Text
            maxFontSizeMultiplier={BUBBLE.maxScale}
            style={[
              small ? styles.small : styles.paragraph,
              list.ordered ? styles.number : null,
              { width: gutter, color: ink ?? palette.ink2 },
            ]}
          >
            {list.ordered ? `${list.start + index}.` : "•"}
          </Text>
          <View style={styles.itemWords}>
            <Blocks blocks={item} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Quote({ blocks }: { readonly blocks: readonly Block[] }) {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  return (
    <View style={styles.quote}>
      <View style={[styles.quoteBar, faint(ink, palette.line2, 0.5)]} />
      <View style={styles.quoteWords}>
        <Quoted.Provider value>
          <Blocks blocks={blocks} />
        </Quoted.Provider>
      </View>
    </View>
  );
}

function Rule() {
  const palette = usePalette();
  return <View style={[styles.rule, faint(useContext(BubbleInk), palette.line2, 0.4)]} />;
}

/**
 * A line in the page's own colour, or in the bubble's ink and faded where the bubble has one: a
 * page's grey is lost on your own bubble's teal.
 */
function faint(ink: string | undefined, line: string, opacity: number) {
  return ink === undefined ? { backgroundColor: line } : { backgroundColor: ink, opacity };
}

/** Dynamic Type's scale, held where the words are (`BUBBLE.maxScale`). */
function scaled(fontScale: number): number {
  return Math.min(fontScale, BUBBLE.maxScale);
}

/**
 * The most a bubble may be on this screen: nine tenths of the room inside its margins (`Line`).
 * An estimate from the window, which only decides whether a table fits (`tableLayout`).
 */
function bubbleRoom(width: number): number {
  return (width - 2 * SPACE.md) * 0.9;
}

/**
 * A table, edge to edge in its bubble (ADR 0184), whose rows share the bubble's width out or
 * scroll sideways when they cannot, saying so as they do (`WideTable`, ADR 0186). A bubble
 * holding one is drawn at its widest (`holdsTable`, `Line`): a bubble that hugs its words
 * measured a table's rows wrongly and grew thousands of points tall, blank below its words.
 */
function TableView({ table }: { readonly table: Table }) {
  const small = useContext(Small);
  const ink = useContext(BubbleInk);
  const { width, fontScale } = useWindowDimensions();
  // The bubble's width, once it is known; the window's estimate of it until then, which on a phone
  // is the same number, so only an iPad's pane draws the table twice.
  const [measured, setMeasured] = useState<number>();
  const size = (small ? TEXT.sm : TEXT.md) * scaled(fontScale);
  const room = measured ?? bubbleRoom(width);
  const layout = useMemo(() => tableLayout(table, size, room), [table, size, room]);
  const rows = (
    <View style={styles.rows}>
      <Row cells={table.head} align={table.align} layout={layout} head />
      {table.rows.map((cells, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed row is only ever itself.
        <Row key={index} cells={cells} align={table.align} layout={layout} />
      ))}
    </View>
  );
  return (
    <View
      style={styles.table}
      testID="md-table"
      onLayout={(event) => {
        const at = event.nativeEvent.layout.width;
        if (Math.abs(at - (measured ?? 0)) > 1) setMeasured(at);
      }}
    >
      {layout.scrolls ? (
        <WideTable layout={layout} room={room} ink={ink}>
          <Swiped>{rows}</Swiped>
        </WideTable>
      ) : (
        // A table that fits is no scroller: a sideways one's content is not held to its width,
        // and the columns would never give any up.
        <View testID="md-table-fits">{rows}</View>
      )}
    </View>
  );
}

/**
 * A scrolling table's rows, taking the touch that lands on them: while the press round the bubble
 * holds a touch, the table cannot be swiped. A hold here is the bubble's hold all the same.
 */
function Swiped({ children }: { readonly children: ReactNode }) {
  const hold = useContext(HoldLine);
  if (hold === undefined) return <View onStartShouldSetResponder={() => true}>{children}</View>;
  return (
    <Pressable accessible={false} onPress={() => Keyboard.dismiss()} onLongPress={hold}>
      {children}
    </Pressable>
  );
}

function Row({
  cells,
  align,
  layout,
  head = false,
}: {
  readonly cells: readonly Cell[];
  readonly align: readonly Align[];
  readonly layout: TableLayout;
  readonly head?: boolean;
}) {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  const last = cells.length - 1;
  return (
    <View style={styles.row}>
      {head ? (
        <View pointerEvents="none" style={[styles.tint, { backgroundColor: ink ?? palette.ink }]} />
      ) : null}
      {cells.map((cell, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: a parsed cell is only ever itself.
          key={index}
          style={[
            styles.cell,
            columnStyle(layout, index, index === last),
            index === 0 ? styles.firstCell : null,
            index === last ? styles.lastCell : null,
          ]}
        >
          <CellWords cell={cell} align={align[index]} head={head} />
        </View>
      ))}
      <View
        pointerEvents="none"
        style={[styles.rowLine, head ? styles.headLine : null, faint(ink, palette.line2, 0.35)]}
      />
    </View>
  );
}

/** A cell's words: the heading row's bold in the quieter ink, the rest as the bubble's. */
function CellWords({
  cell,
  align,
  head,
}: {
  readonly cell: Cell;
  readonly align: Align;
  readonly head: boolean;
}) {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  const selectable = useContext(Selection);
  const small = useContext(Small);
  return (
    <Text
      selectable={selectable}
      maxFontSizeMultiplier={BUBBLE.maxScale}
      style={[
        small ? styles.cellSmall : styles.cellWords,
        head ? styles.headWords : null,
        { color: ink ?? (head ? palette.ink2 : palette.ink), textAlign: align ?? "left" },
      ]}
    >
      <Runs runs={cell} />
    </Text>
  );
}

/**
 * A column's width: fixed when the table scrolls; when it fits, its most, given up toward its
 * least in proportion to what it has to give (a shrink scaled by its basis is that), the last
 * taking whatever the bubble has over.
 */
function columnStyle(layout: TableLayout, index: number, last: boolean) {
  const column = layout.columns[index] as Column;
  if (layout.scrolls) return { width: column.width };
  return {
    flexBasis: column.most,
    flexShrink: column.most > 0 ? (column.most - column.least) / column.most : 0,
    flexGrow: last ? 1 : 0,
    minWidth: column.least,
  };
}

/**
 * A fenced block: mono, on a ground of its own. An approval's diff, JSON or table preview is
 * drawn as one too, since those are the same kind of words — kept exactly as they were written.
 */
export function CodeBlock({ text }: { readonly text: string }) {
  const palette = usePalette();
  return (
    // A code block keeps the platform's own long press, which offers Copy: getting the block
    // out is most of why it is a block. Prose does not — the long press there belongs to the
    // line's menu, and two things on one gesture is neither.
    <View style={[styles.code, { backgroundColor: palette.surface2, borderColor: palette.line }]}>
      <Text
        selectable
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.mono, { color: palette.ink }]}
      >
        {text}
      </Text>
    </View>
  );
}

function Runs({ runs }: { readonly runs: readonly Inline[] }) {
  return (
    <>
      {runs.map((run, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed run is only ever itself.
        <Fragment key={index}>
          <Run run={run} />
        </Fragment>
      ))}
    </>
  );
}

function Run({ run }: { readonly run: Inline }) {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  switch (run.type) {
    case "text":
      return (
        <Text>
          <Words text={run.text} />
        </Text>
      );
    case "strong":
      return (
        <Text style={styles.strong}>
          <Runs runs={run.children} />
        </Text>
      );
    case "em":
      return (
        <Text style={styles.em}>
          <Runs runs={run.children} />
        </Text>
      );
    case "code":
      return <Text style={[styles.mono, { color: ink ?? palette.ink2 }]}>{run.text}</Text>;
    case "mention":
      return (
        <Text style={[styles.mention, { color: ink ?? palette.blueInk }]}>
          @<Words text={run.handle} />
        </Text>
      );
    default:
      return <Link href={run.href} text={run.text} />;
  }
}

/** A run's words, with any a search looked for marked while they are (`Marks`). */
function Words({ text }: { readonly text: string }) {
  const terms = useContext(Marks);
  if (terms === undefined) return text;
  return <MarkedParts parts={markedParts(text, wordMarks(text, terms))} />;
}

function Link({ href, text }: { readonly href: string; readonly text: string }) {
  const palette = usePalette();
  const ink = useContext(BubbleInk);
  const safe = safeHref(href);
  if (safe === undefined) return <Text>{text}</Text>;
  return (
    <Text
      accessibilityRole="link"
      // A link keeps its underline where it cannot keep its blue, so it is still a link.
      style={[styles.link, { color: ink ?? palette.blue }]}
      onPress={() => {
        void Linking.openURL(safe);
      }}
    >
      {text}
    </Text>
  );
}

/**
 * The shape each picture came out, by its address: a room drawn again — scrolled back to, or
 * reopened — draws it at its shape at once, rather than as a placeholder that then jumps.
 */
const shapes = new Map<string, number>();

/** Before a picture has come, its frame is a photo's usual shape. */
const UNKNOWN_SHAPE = 4 / 3;

/** Two to a row, the gap between them taken out of the thumbnail's width. */
const SQUARE = (TILE_MAX - SPACE.xs) / 2;

function Pictures({ pictures }: { readonly pictures: readonly Picture[] }) {
  const alone = pictures.length === 1;
  return (
    <View style={styles.pictures} testID="md-pictures">
      {pictures.map((picture, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed picture is only ever itself.
        <PictureTile key={index} picture={picture} alone={alone} />
      ))}
    </View>
  );
}

function PictureTile({ picture, alone }: { readonly picture: Picture; readonly alone: boolean }) {
  const palette = usePalette();
  const [shape, setShape] = useState(() => shapes.get(picture.src));
  const [failed, setFailed] = useState(false);
  const words = picture.alt || "Image";
  if (failed) {
    return (
      <Text maxFontSizeMultiplier={BUBBLE.maxScale} style={styles.paragraph}>
        <Link href={picture.href} text={words} />
      </Text>
    );
  }
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={words}
      testID="md-picture"
      onPress={() => {
        void Linking.openURL(picture.href);
      }}
      style={[
        styles.picture,
        alone ? { width: TILE_MAX, aspectRatio: tileShape(shape ?? UNKNOWN_SHAPE) } : styles.square,
        { backgroundColor: palette.surface3 },
      ]}
    >
      <Image
        source={{ uri: picture.src }}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        style={styles.pictureImage}
        testID="md-picture-image"
        onLoad={(event) => {
          const measured = shapeOf(event);
          if (measured === undefined) return;
          shapes.set(picture.src, measured);
          setShape(measured);
        }}
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
}

/**
 * Wide over tall, as the picture came. The phone says so in the event's `source`; the web target
 * hands over the browser's own event, whose image knows its natural size.
 */
function shapeOf(event: ImageLoadEvent): number | undefined {
  const native = event.nativeEvent as {
    readonly source?: { readonly width?: number; readonly height?: number };
    readonly target?: { readonly naturalWidth?: number; readonly naturalHeight?: number };
  };
  const width = native.source?.width ?? native.target?.naturalWidth ?? 0;
  const height = native.source?.height ?? native.target?.naturalHeight ?? 0;
  return width > 0 && height > 0 ? width / height : undefined;
}

const CELL_WORDS = TEXT.md;
const CELL_WORDS_SMALL = TEXT.sm;

const styles = StyleSheet.create({
  blocks: { gap: SPACE.sm },
  heading: {
    fontSize: TEXT.lg,
    lineHeight: Math.round(TEXT.lg * LEADING_PHONE),
    fontWeight: "700",
  },
  headingSmall: {
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * LEADING_PHONE),
    fontWeight: "700",
  },
  headingAfter: { marginTop: SPACE.xs },
  list: { gap: SPACE.xs },
  item: { flexDirection: "row" },
  number: { textAlign: "right", paddingRight: 6, fontVariant: ["tabular-nums"] },
  // From the words' own width, given up to the bubble's: `flex: 1` would start them at nothing.
  itemWords: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingLeft: SPACE.xs },
  quote: { flexDirection: "row", gap: SPACE.md },
  quoteBar: { width: 3, borderRadius: 1.5 },
  quoteWords: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  rule: { height: 1, marginVertical: SPACE.xs },
  // Out to the bubble's edges, through its padding.
  table: { marginHorizontal: -BUBBLE.padX, marginVertical: SPACE.xs },
  rows: { flexGrow: 1 },
  row: { flexDirection: "row" },
  tint: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: 0.06 },
  rowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth * 2,
  },
  headLine: { height: 1 },
  cell: { paddingVertical: SPACE.sm, paddingHorizontal: CELL_PAD },
  firstCell: { paddingLeft: EDGE_PAD },
  lastCell: { paddingRight: EDGE_PAD },
  cellWords: { fontSize: CELL_WORDS, lineHeight: Math.round(CELL_WORDS * LEADING_PHONE) },
  cellSmall: {
    fontSize: CELL_WORDS_SMALL,
    lineHeight: Math.round(CELL_WORDS_SMALL * LEADING_PHONE),
  },
  headWords: { fontWeight: "700" },
  pictures: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACE.xs,
    maxWidth: TILE_MAX,
  },
  // Rounded as a photo under a message is, and never wider than the bubble it is in.
  picture: { borderRadius: RADIUS.md, overflow: "hidden", maxWidth: "100%" },
  square: { width: SQUARE, aspectRatio: 1 },
  pictureImage: { width: "100%", height: "100%" },
  // One weight for every message, whoever sent it and whatever ground it sits on. A summary that
  // stood alone was set at 600 throughout until 11 September 2026 (Arjun, reading a long one on
  // the phone): a whole reply in semibold is a reply shouted, and the desktop never did it — its
  // summary takes the green ground and nothing else. Bold is what the words themselves ask for.
  paragraph: { fontSize: TEXT.body, lineHeight: Math.round(TEXT.body * LEADING_PHONE) },
  small: { fontSize: TEXT.md, lineHeight: Math.round(TEXT.md * LEADING_PHONE) },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  mention: { fontWeight: "600" },
  link: { textDecorationLine: "underline" },
  code: { borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACE.md },
  mono: { fontFamily: "Menlo", fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
});
