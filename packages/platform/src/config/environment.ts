/**
 * The one file in Chips that reads `process.env` (technical-plan 6.1). Everything else
 * takes an `Environment` as an argument, which is what makes configuration testable and
 * keeps a stray `process.env.SOMETHING` from appearing three layers down.
 *
 * A lint rule holds the line: `style/noProcessEnv` is an error everywhere but here.
 */

export type Environment = Readonly<Record<string, string | undefined>>;

/** A snapshot of the process environment. */
export function processEnvironment(): Environment {
  // biome-ignore lint/style/noProcessEnv: this is the single reader the rule protects.
  return { ...process.env };
}
