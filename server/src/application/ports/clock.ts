/**
 * Time and identifiers are ports so tests are deterministic (technical-plan 6.1). The
 * application layer names what it needs; infrastructure supplies the system clock and a
 * monotonic ULID generator.
 */

export type { Clock } from "@chipschat/platform";
export type { IdGenerator, IdKind } from "@chipschat/protocol";
