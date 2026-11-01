/** A route's JSON body, read through a schema of `@chipschat/protocol`. */

import { HttpError } from "../errors.js";

/** What a schema of `@chipschat/protocol` answers, without the server taking zod itself. */
export interface Schema<T> {
  readonly safeParse: (value: unknown) =>
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly {
            readonly path: readonly PropertyKey[];
            readonly message: string;
          }[];
        };
      };
}

export function body<T>(schema: Schema<T>, raw: string, what: string): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(
      "invalid_event",
      what,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}
