/**
 * The search index as the application sees it (Gate 5): something that falls behind the tables
 * it follows by the length of a queue, and is brought up to date on request. The read model
 * drains it before a search, so a hit is never stale; the sweep drains it on its timer, so the
 * queue never grows long. Which is what Appendix G means by keeping heavy work off the request
 * path: the append pays for a queue row, and the index is written in batches.
 */

export interface SearchIndex {
  /** Bring the index up to date with everything queued. Answers how many rows were drained. */
  readonly drain: () => Promise<number>;
}
