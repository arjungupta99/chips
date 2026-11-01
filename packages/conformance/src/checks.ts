/**
 * A check for each capability a harness declares beyond the golden scenario (open-source
 * harnesses plan, Phase 7), played from the person's chair as the others are: what the capability
 * promises a person, asked for, and what the harness must do within a beat. A harness that does
 * not declare a capability is not asked. Three capabilities can't be seen from outside the
 * harness: whether it reads the dial (`autonomy`), carries an archive to its own side
 * (`follows_rooms`), or reads `for` rather than answering as itself (`agents`). These are reported as
 * declared and not checked.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import type { FakeChips } from "./fake-chips.js";
import type { Finding } from "./report.js";
import { ACCEPTS, type SettingKind } from "./settings.js";
import { until, within } from "./waiting.js";

type Log = (line: string) => void;

const seconds = (ms: number): number => Math.round(ms / 1000);

/** A person asks for a new agent in a room of theirs (ADR 0108): one registered for it joins. */
export async function askForANewAgent(
  chips: FakeChips,
  beatMs: number,
  findings: Finding[],
  log: Log,
): Promise<void> {
  const spaceId = await chips.openRoom("Fresh eyes");
  const { askId, name } = await chips.askForAgent(spaceId, "Nova");
  log(`You asked for a new agent, ${name}, in another space.`);
  const joined = await within(
    chips,
    (event) => event.type === "membership.added" && event.payload["made_for"] === askId,
    beatMs,
  );
  if (joined === undefined) {
    findings.push({
      severity: "error",
      message: `the harness declares new_agents but no new agent joined the space it was asked for within ${seconds(beatMs)} s`,
    });
    return;
  }
  log("The new agent joined the space.");
}

/** What each settings capability is, in the report's words, and the copies that carry it. */
const SETTINGS: Readonly<
  Record<
    string,
    {
      readonly words: string;
      readonly kinds: readonly SettingKind[];
      /** Whose it is, in the findings: an agent's, or the harness's own. */
      readonly whose?: string;
    }
  >
> = {
  [HARNESS_CAPABILITIES.contextFiles]: {
    words: "context files",
    kinds: ["context", "harness-context"],
  },
  [HARNESS_CAPABILITIES.models]: { words: "model", kinds: ["model"] },
  [HARNESS_CAPABILITIES.heartbeats]: { words: "heartbeat", kinds: ["heartbeat"] },
  [HARNESS_CAPABILITIES.contextWindows]: { words: "context window", kinds: ["context-window"] },
  [HARNESS_CAPABILITIES.jobs]: { words: "jobs", kinds: ["jobs"], whose: "its own" },
};

export const SETTINGS_CAPABILITIES: readonly string[] = Object.keys(SETTINGS);

/**
 * A setting a person changes from an agent's page (ADRs 0134, 0140, 0143, 0146), or a harness's own
 * job from the harness's (ADR 0252). The harness must
 * have sent its copy, and must answer a change asked of it, made or refused, within a beat. The
 * change asked is to what the copy already says, so answering it changes nothing.
 */
export async function askForAChange(
  capability: string,
  chips: FakeChips,
  beatMs: number,
  findings: Finding[],
  log: Log,
): Promise<void> {
  const setting = SETTINGS[capability];
  if (setting === undefined) return;
  const error = (message: string) => findings.push({ severity: "error", message });
  const whose = setting.whose ?? "an agent's";
  const copies = await until(() => {
    const found = setting.kinds.flatMap((kind) =>
      chips.settings.copiesOf(kind).map(([id]) => [kind, id] as const),
    );
    return found.length > 0 ? found : undefined;
  }, beatMs);
  if (copies === undefined) {
    error(
      `the harness declares ${capability} but sent no copy of ${whose} ${setting.words} within ${seconds(beatMs)} s`,
    );
    return;
  }
  const asked = copies
    .map(([kind, id]) => ({ kind, id, ask: chips.askToChange(kind, id) }))
    .find((each) => each.ask !== undefined);
  if (asked?.ask === undefined) {
    findings.push({
      severity: "note",
      message: `every copy of the ${setting.words} it sent is read-only, so no change was asked of it`,
    });
    return;
  }
  const word = ACCEPTS[asked.kind];
  if (asked.ask.heard === 0) {
    error(
      `the harness declares ${capability} but no socket of it said \`${word}\` in its hello, so a person's change can't reach it`,
    );
    return;
  }
  const changeId = String(asked.ask.frame["change_id"] ?? asked.ask.frame["edit_id"]);
  log(`You changed ${whose} ${setting.words} from its page.`);
  const answer = await until(() => chips.settings.answerTo(changeId), beatMs);
  if (answer === undefined) {
    error(
      `the harness did not answer a person's change of ${whose} ${setting.words} within ${seconds(beatMs)} s`,
    );
    return;
  }
  if (answer.made) log(`It saved the ${setting.words}.`);
  else {
    log(`It refused the change of ${setting.words}.`);
    findings.push({
      severity: "note",
      message: `the harness refused a change of ${setting.words} to what it already was${answer.message === undefined ? "" : `: ${answer.message}`}`,
    });
  }
}

/** How many beats a restart is given: a harness starting what is behind it again takes a while. */
const RESTART_BEATS = 3;

/**
 * A person asks the harness to restart (ADR 0094). It must come back within three beats: a new
 * connection, or saying it is fine. Saying it is in trouble instead is a restart that failed.
 */
export async function askForARestart(
  chips: FakeChips,
  beatMs: number,
  findings: Finding[],
  log: Log,
): Promise<void> {
  const hellos = chips.hellos();
  const said = chips.statuses().length;
  const heard = chips.askToRestart();
  if (heard === 0) {
    findings.push({
      severity: "error",
      message:
        "the harness declares restarts but no socket of it said `restart` in its hello, so a person's Restart can't reach it",
    });
    return;
  }
  log("You asked the harness to restart.");
  const waitMs = beatMs * RESTART_BEATS;
  const back = await until(() => {
    const status = chips.statuses().slice(said).at(-1);
    if (status !== undefined) return status.state === "ok" ? "ok" : `trouble: ${status.reason}`;
    return chips.hellos() > hellos && chips.connections() > 0 ? "reconnected" : undefined;
  }, waitMs);
  if (back === undefined) {
    findings.push({
      severity: "error",
      message: `the harness did not come back within ${seconds(waitMs)} s of a person's Restart: no new connection, and nothing said of how it is`,
    });
  } else if (back.startsWith("trouble")) {
    findings.push({
      severity: "error",
      message: `the harness says its restart did not work: ${back.slice("trouble: ".length)}`,
    });
  } else
    log(back === "ok" ? "It restarted and said it is fine." : "It restarted and connected again.");
}
