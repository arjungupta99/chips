/**
 * What this build knows about itself, baked in when it was bundled. The one place the app reads
 * the environment: Metro writes each `process.env.EXPO_PUBLIC_…` read out as the value it had at
 * build time, and only a read spelled in full, so it is spelled once here.
 */

/** The commit the build was made from, set by `pnpm phone` (`tools/phone/stamp.mjs`, ADR 0085). */
// biome-ignore lint/style/noProcessEnv: the bundler inlines this read, and this is its one home
export const BUILD_COMMIT: string | undefined = process.env.EXPO_PUBLIC_CHIPS_COMMIT;

/** Whether this is the web export `pnpm film` renders the films from (ADR 0217). */
// biome-ignore lint/style/noProcessEnv: the bundler inlines this read, and this is its one home
export const FILM_SOURCE_BUILD: boolean = process.env.EXPO_PUBLIC_FILM_SOURCE === "1";

/**
 * A build that draws You's Send feedback row while the switch is off (`FEEDBACK_SHOWN`, ADR 0237):
 * the e2e suite's, and a simulator's for a look. Never a build that ships.
 */
// biome-ignore lint/style/noProcessEnv: the bundler inlines this read, and this is its one home
export const FEEDBACK_BUILD: boolean = process.env.EXPO_PUBLIC_CHIPS_FEEDBACK === "1";
