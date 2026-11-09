/**
 * A person's say over the gold banner a space shows while an agent works there without asking (ADR
 * 0286): which agents and harnesses they want it for, and which they closed for now. Theirs and
 * not a device's, so a banner closed on the iPhone is closed on the iPad and the Mac too.
 *
 * Kept at the server beside the log, as how far a person has read is. `GET /v1/me/banners` reads
 * the caller's, the routes under it change one thing at a time, and each change goes to the
 * person's sockets as a `banners` frame. Not on the log: no event says it, and nobody else is told.
 *
 * Hiding a banner changes what a person sees. It never changes what an agent may do.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most closed banners a read or a frame carries: one per agent in a space, with room to spare. */
export const CLOSED_BANNERS_MAX = 1000;

const who = z.string().min(1).max(120);

/** Who a choice is about: an agent, or a harness, whose choice its agents follow. */
export const bannerChoices = z
  .record(who, z.boolean())
  .describe(
    "Whether this person wants the banner, by agent or harness. An agent with no choice of its own follows its harness, and a harness with none shows it.",
  );
export type BannerChoices = z.infer<typeof bannerChoices>;

export const closedBanner = z.object({
  space_id: id("space"),
  asker: who.describe("Whose banner: the agent, or a harness without agents."),
  since: isoTimestamp.describe(
    "When the yes this banner stood for was given. A later yes is a new one, and shows its banner.",
  ),
});
export type ClosedBanner = z.infer<typeof closedBanner>;

export const closedBanners = z
  .array(closedBanner)
  .max(CLOSED_BANNERS_MAX)
  .describe("The banners this person closed for now.");

/** What `GET /v1/me/banners` answers. */
export const bannersView = z.object({ choices: bannerChoices, closed: closedBanners });
export type BannersView = z.infer<typeof bannersView>;

/** What `PUT /v1/me/banners/choices/:target` takes. */
export const bannerChoiceBody = z.object({ shown: z.boolean() });

/** What `PUT /v1/me/banners/closed/:spaceId/:asker` takes. */
export const closedBannerBody = z.object({ since: isoTimestamp });

export const bannersFrame = z
  .object({
    frame: z.literal("banners"),
    choices: bannerChoices,
    closed: closedBanners,
  })
  .describe(
    "A person changed what they want of the banner, on one of their devices (ADR 0286). The whole of it, sent to that person's sockets that said `banners` in their `hello`.",
  );
export type BannersFrame = z.infer<typeof bannersFrame>;
