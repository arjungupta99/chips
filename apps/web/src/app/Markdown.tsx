/**
 * Renders the safe Markdown tree from `@chipschat/core` as React elements — never HTML, so there is
 * nothing to inject. An `@handle` becomes a chip for whoever the server found it names
 * (`mentions`), by the protocol's rule (whole names first, ADR 0091), so beside OpenClaw 2,
 * `@OpenClaw` is OpenClaw's chip; words with no server's answer (a lane's summary, an approval)
 * resolve against everybody. A handle nobody answers to stays plain text.
 *
 * Headings, lists, quotes, rules and tables (ADR 0184) are the elements they are. A table sits in
 * a box of its own that scrolls sideways when the bubble is narrower than the table, so the room
 * never does, and says there is more of it as the phone does (ADR 0186). A heading is one size whatever its level: a bubble is not a document, and its
 * headings are not part of the page's outline, so they say their level to a screen reader below
 * the room's own.
 *
 * A picture (`![alt](src)`, ADR 0068) is laid out as a photo the message carried would be
 * (`Attachments`, the same `photo-grid`), fetched from where it lives with no referrer, and a
 * click opens it — or what it links to — in a new tab. One that will not load is its words as a
 * link, so a message never shows an empty frame.
 *
 * A message a search opened marks the words searched for, for a moment (ADR 0133, `marks`): in
 * its plain, bold and italic runs and its mentions, split by core's `wordMarks` — the words the
 * server found it by — and drawn as a result row draws them (`Marked`). Code and links are left
 * as they are: the one is words kept exactly as written, and the other is already a colour.
 */

import {
  ALONE_TILE_WIDTH,
  type Block,
  type Cell,
  capsule,
  columnsInView,
  type Directory,
  dotShown,
  edgeStrength,
  type Inline,
  markedParts,
  type Picture,
  parseMarkdown,
  runsWords,
  type Table,
  tileShape,
  wordMarks,
} from "@chipschat/core";
import { EVERYONE_HANDLE, handleMap } from "@chipschat/protocol";
import { Fragment, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GRID_MAX } from "./Attachments";
import { Marked } from "./Marked.tsx";

export interface MarkdownProps {
  readonly text: string;
  readonly directory: Directory;
  /** The participants the server found the words mention, when it said. */
  readonly mentions?: readonly string[] | undefined;
  /** Words to mark where they are said: a search's terms, on the line it opened (ADR 0133). */
  readonly marks?: readonly string[] | undefined;
}

/** What every run of a document is drawn with: who a handle names, and any words to mark. */
interface Drawing {
  readonly handles: Map<string, string>;
  readonly terms: readonly string[] | undefined;
}

export function Markdown({ text, directory, mentions, marks }: MarkdownProps) {
  const drawing: Drawing = {
    handles: handleIndex(directory, mentions),
    terms: marks === undefined || marks.length === 0 ? undefined : marks,
  };
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="md">{renderBlocks(blocks, drawing)}</div>;
}

function renderBlocks(blocks: readonly Block[], drawing: Drawing): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, index, drawing));
}

/** A run's words, with any a search looked for marked while they are. */
function words(text: string, terms: readonly string[] | undefined): ReactNode {
  return terms === undefined ? text : <Marked parts={markedParts(text, wordMarks(text, terms))} />;
}

/**
 * A lookup from each handle to the name its chip shows: the protocol's rule, the same one the
 * server resolves `mentions` with, among the participants it found or else everybody.
 */
function handleIndex(directory: Directory, mentions?: readonly string[]): Map<string, string> {
  const among = (mentions ?? Object.keys(directory)).flatMap((id) => {
    const participant = directory[id];
    return participant === undefined ? [] : [{ id, displayName: participant.displayName }];
  });
  const handles = new Map<string, string>();
  for (const [handle, id] of handleMap(among)) {
    handles.set(handle, directory[id]?.displayName ?? handle);
  }
  return handles;
}

function renderBlock(block: Block, key: number, drawing: Drawing): ReactNode {
  switch (block.type) {
    case "pictures":
      return <Pictures key={key} pictures={block.pictures} />;
    case "code":
      return (
        <pre className="md-code" key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case "heading":
      return <Heading key={key} level={block.level} runs={block.children} drawing={drawing} />;
    case "list":
      return block.ordered ? (
        <ol className="md-list" start={block.start} key={key}>
          {renderItems(block.items, drawing)}
        </ol>
      ) : (
        <ul className="md-list" key={key}>
          {renderItems(block.items, drawing)}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="md-quote" key={key}>
          {renderBlocks(block.blocks, drawing)}
        </blockquote>
      );
    case "rule":
      return <hr className="md-rule" key={key} />;
    case "table":
      return <TableBlock key={key} table={block} drawing={drawing} />;
    default:
      return <p key={key}>{renderRuns(block.children, drawing)}</p>;
  }
}

/** Under the room's own headings, whatever level the words gave it: an h3 to an h6. */
function Heading({
  level,
  runs,
  drawing,
}: {
  readonly level: number;
  readonly runs: readonly Inline[];
  readonly drawing: Drawing;
}) {
  const Tag = `h${Math.min(level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
  return <Tag className="md-heading">{renderRuns(runs, drawing)}</Tag>;
}

function renderRuns(runs: readonly Inline[], drawing: Drawing): ReactNode[] {
  return runs.map((inline, index) => renderInline(inline, index, drawing));
}

function renderItems(items: readonly (readonly Block[])[], drawing: Drawing): ReactNode[] {
  // biome-ignore lint/suspicious/noArrayIndexKey: a parsed item is only ever itself.
  return items.map((item, index) => <li key={index}>{renderBlocks(item, drawing)}</li>);
}

/** A cell with more to say than this many characters is long, and is not squeezed to a word. */
const LONG_CELL = 24;

/**
 * A table in a box of its own, which scrolls sideways when the bubble is narrower than it. A
 * column with long words in it keeps a few words' width (`md-long`), as the phone's does
 * (`tableLayout`), so a narrow bubble scrolls the table rather than wrapping it a word a line.
 * One that scrolls fades where it has more and lights its columns in view (`useWideTable`).
 */
function TableBlock({ table, drawing }: { readonly table: Table; readonly drawing: Drawing }) {
  const long = table.head.map((_, index) =>
    table.rows.some((row) => runsWords(row[index] ?? []).length > LONG_CELL),
  );
  // A block in the cell holds the width: a browser does not hold a table cell to its min-width.
  const words = (cell: Cell, index: number) =>
    long[index] === true ? (
      <div className="md-long">{renderRuns(cell, drawing)}</div>
    ) : (
      renderRuns(cell, drawing)
    );
  const { box, scroller, wide } = useWideTable(table);
  return (
    <div className="md-table-box" ref={box} data-wide={wide ? "" : undefined}>
      {wide ? <TableDots count={table.head.length} /> : null}
      <div className="md-table" data-testid="md-table" ref={scroller}>
        <table>
          <thead>
            <tr>
              {table.head.map((cell, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a parsed cell is only ever itself.
                <th key={index} style={{ textAlign: table.align[index] }}>
                  {words(cell, index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a parsed row is only ever itself.
              <tr key={at}>
                {row.map((cell, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a parsed cell is only ever itself.
                  <td key={index} style={{ textAlign: table.align[index] }}>
                    {words(cell, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A dot the capsule is clear of, faint, as the phone's (`WideTable`). */
const DOT_REST = 0.3;

/**
 * Whether a table is wider than its box and, as it scrolls, how much of it is past each side and
 * which columns are in view (core's `tableDots`, ADR 0186), set straight on the box as custom
 * properties: the fade and the dots' capsule follow a scroll without React drawing anything.
 */
function useWideTable(table: Table) {
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new table is new columns to measure, and dots once drawn are dots to paint.
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = scroller.current;
    if (outer === null || inner === null) return;
    const paint = () => {
      const x = inner.scrollLeft;
      const far = inner.scrollWidth - inner.clientWidth;
      const widths = [...inner.querySelectorAll<HTMLElement>("thead th")].map(
        (th) => th.offsetWidth,
      );
      const view = columnsInView(widths, x, inner.clientWidth);
      const { left, width } = capsule(view.from, view.to);
      outer.style.setProperty("--md-l", String(edgeStrength(x)));
      outer.style.setProperty("--md-r", String(edgeStrength(far - x)));
      outer.style.setProperty("--md-cap-left", `${left}px`);
      outer.style.setProperty("--md-cap-width", `${width}px`);
      outer.querySelectorAll<HTMLElement>(".md-dots i").forEach((dot, index) => {
        dot.style.opacity = String(DOT_REST * dotShown(index, left, width));
      });
    };
    const measure = () => {
      setWide(inner.scrollWidth - inner.clientWidth > 1);
      paint();
    };
    measure();
    inner.addEventListener("scroll", paint, { passive: true });
    const resized = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    resized?.observe(inner);
    if (inner.firstElementChild !== null) resized?.observe(inner.firstElementChild);
    return () => {
      inner.removeEventListener("scroll", paint);
      resized?.disconnect();
    };
  }, [table, wide]);
  return { box, scroller, wide };
}

/** A dot per column over a wide table's far corner, and the capsule lighting those in view. */
function TableDots({ count }: { readonly count: number }) {
  return (
    <div className="md-dots" aria-hidden="true" data-testid="md-table-dots">
      <span>
        {Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a column's dot is only ever its own.
          <i key={index} />
        ))}
        <b />
      </span>
    </div>
  );
}

function renderInline(inline: Inline, key: number, drawing: Drawing): ReactNode {
  switch (inline.type) {
    case "text":
      return <Fragment key={key}>{words(inline.text, drawing.terms)}</Fragment>;
    case "strong":
      return (
        <strong key={key}>{inline.children.map((c, i) => renderInline(c, i, drawing))}</strong>
      );
    case "em":
      return <em key={key}>{inline.children.map((c, i) => renderInline(c, i, drawing))}</em>;
    case "code":
      return (
        <code className="md-inline-code" key={key}>
          {inline.text}
        </code>
      );
    case "link":
      // Opened in a new tab, and told not to hand the opener a reference back.
      return (
        <a href={inline.href} key={key} target="_blank" rel="noreferrer noopener">
          {inline.text}
        </a>
      );
    case "mention": {
      // `@all` names every harness in the room (ADR 0081), and nobody answers to it, so it is a
      // chip without being anyone's name.
      if (inline.handle.toLowerCase() === EVERYONE_HANDLE) {
        return (
          <span className="md-mention" key={key}>
            @{EVERYONE_HANDLE}
          </span>
        );
      }
      const name = drawing.handles.get(inline.handle.toLowerCase());
      if (name === undefined)
        return <Fragment key={key}>{words(`@${inline.handle}`, drawing.terms)}</Fragment>;
      return (
        <span className="md-mention" key={key}>
          @{words(name, drawing.terms)}
        </span>
      );
    }
  }
}

function Pictures({ pictures }: { readonly pictures: readonly Picture[] }) {
  const alone = pictures.length === 1;
  return (
    <div
      className="photo-grid md-pictures"
      data-count={Math.min(pictures.length, GRID_MAX)}
      data-testid="md-pictures"
    >
      {pictures.map((picture, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a parsed picture is only ever itself.
        <PictureTile key={index} picture={picture} alone={alone} />
      ))}
    </div>
  );
}

/**
 * The shape each picture came out, by its address: a room drawn again — scrolled back to, or
 * reopened — draws it at its shape at once, rather than as a placeholder that then grows (the
 * phone's `Markdown.tsx`, ADR 0268 addendum).
 */
const shapes = new Map<string, number>();

/** Before a picture has come, its frame is a photo's usual shape. */
const UNKNOWN_SHAPE = 4 / 3;

/**
 * A picture alone is the phone's: as wide as a tile alone, at its own shape within reason once it
 * has come, and a photo's usual shape until then. Until 3 November it stood as tall as its picture,
 * up to 360, from a placeholder 120 tall.
 */
function PictureTile({ picture, alone }: { readonly picture: Picture; readonly alone: boolean }) {
  const [state, setState] = useState<"loading" | "shown" | "failed">("loading");
  const [shape, setShape] = useState(() => shapes.get(picture.src));
  const words = picture.alt || "Image";
  if (state === "failed") {
    return (
      <a href={picture.href} target="_blank" rel="noreferrer noopener" className="md-picture-words">
        {words}
      </a>
    );
  }
  return (
    <a
      className="photo md-picture"
      href={picture.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={words}
      data-testid="md-picture"
      style={
        alone
          ? { width: ALONE_TILE_WIDTH, aspectRatio: tileShape(shape ?? UNKNOWN_SHAPE) }
          : undefined
      }
    >
      <img
        src={picture.src}
        alt={picture.alt}
        referrerPolicy="no-referrer"
        data-loading={state === "loading" ? "" : undefined}
        data-decoded={state === "shown"}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            shapes.set(picture.src, naturalWidth / naturalHeight);
            setShape(naturalWidth / naturalHeight);
          }
          setState("shown");
        }}
        onError={() => setState("failed")}
      />
    </a>
  );
}
