/**
 * ADR 0054: a voice note is transcribed when it arrives, by whisper under the media limits.
 *
 * One column on the `uploads` registry: what was said in a sound, as the server heard it. Null for
 * anything that is not sound, and for sound nobody spoke in, too long to be a voice note, or kept
 * where nothing transcribes. `duration_ms` has been a column since 0004 and is filled for sound
 * now too.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0020-voice-transcripts";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("uploads").addColumn("transcript", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("uploads").dropColumn("transcript").execute();
}
