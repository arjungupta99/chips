/**
 * What the bundler writes into the app when it is built. Metro replaces each
 * `process.env.EXPO_PUBLIC_…` read with the value it had at build time, and only a read written
 * out in full, which is why these are declared rather than read by index.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** The commit a build was made from, which `pnpm phone` sets (ADR 0085). */
    readonly EXPO_PUBLIC_CHIPS_COMMIT?: string;
    /** "1" in the web export `pnpm film` renders the films from (ADR 0217); unset in any other. */
    readonly EXPO_PUBLIC_FILM_SOURCE?: string;
    /** "1" in a build that draws Send feedback before the switch is on (ADR 0237); unset in any other. */
    readonly EXPO_PUBLIC_CHIPS_FEEDBACK?: string;
  }
}
