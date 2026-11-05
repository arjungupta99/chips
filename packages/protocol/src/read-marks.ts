/**
 * How far a person has read (ADR 0262): the `seq` each room is read up to, theirs and not a
 * device's, so a room read on the iPhone is read on the iPad and the Mac too, and a device paired
 * for somebody already here starts where they are.
 *
 * Kept at the server and moved only forward. `GET /v1/me/read` reads the caller's, `PUT
 * /v1/me/read` moves some of them, and each mark that moved goes to the person's other sockets as
 * a `read` frame. Not on the log: no event says it, and nobody else is told.
 */

import { z } from "zod";
import { id } from "./primitives.js";

/** The most rooms one write or frame carries: Read all on a long list, with room to spare. */
export const READ_MARKS_MAX = 1000;

export const readMarks = z
  .record(id("space"), z.int().nonnegative().describe("The `seq` the room is read up to."))
  .refine((marks) => Object.keys(marks).length <= READ_MARKS_MAX, {
    message: `at most ${READ_MARKS_MAX} rooms`,
  })
  .describe("How far each room is read, by room id.");
export type ReadMarks = z.infer<typeof readMarks>;

/** What `GET /v1/me/read` answers and `PUT /v1/me/read` takes. */
export const readMarksBody = z.object({ spaces: readMarks });

export const readFrame = z
  .object({
    frame: z.literal("read"),
    spaces: readMarks.describe("The rooms whose marks moved, and where to."),
  })
  .describe(
    "A person read further in some rooms, on one of their devices (ADR 0262). Sent to that person's sockets that said `reads` in their `hello`, never to anyone else's, now or never: `GET /v1/me/read` reads them again.",
  );
export type ReadFrame = z.infer<typeof readFrame>;
