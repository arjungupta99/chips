/**
 * What a person says about a line a harness said (M3.4, ADR 0031). It becomes a `feedback` event
 * the harness hears, and is folded back onto the line from the log — so what a space shows is
 * what everybody in it sees, the person who wrote it included, once the server has it.
 *
 * The phone says one thing now: Not right?, a note on a page of the line's sheet (`LinePages.tsx`,
 * ADR 0200). The thumbs and the form that stood under the bubble went with it. A reaction is still
 * on the wire, and one already on a line still draws (`Said`, in `Line.tsx`).
 */

export type Given =
  | { readonly kind: "reaction"; readonly reaction: string }
  | { readonly kind: "correction"; readonly text: string };
