/**
 * An agent's Heartbeat group on its card (ADR 0143, the phone's on the desktop): whether its
 * harness wakes it every so often to look over what it is doing, and how often. The switch saves
 * when it is flipped; while it is on, an Every row under it offers the harness's intervals in the
 * platform's own menu, as You's choices are, and picking one saves it. Only the people who run its
 * harness see it, and only for an agent its harness sends a heartbeat for.
 *
 * A change is laid over the copy while it waits, so the rows say "Saving to …" at once, and the
 * harness's answer replaces it. One that fails or isn't answered says so under the switch a moment.
 */

import {
  type Directory,
  everyChoices,
  type HeartbeatReads,
  harnessOf,
  heartbeatFoot,
  heartbeatRows,
  heartbeatWords,
  mayChangeHeartbeat,
  nameOf,
  notSharedWords,
  saveHeartbeatChange,
  settingLook,
  type WorkspaceModel,
} from "@chipschat/core";
import type { AgentHeartbeatView, HeartbeatChangeAsk } from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { type Dispatch, type Ref, type SetStateAction, useEffect, useRef, useState } from "react";
import { recall, remember } from "../context/memory.ts";
import { HarnessMark } from "../context/rows.tsx";
import { NotShared, useLands, WaitingGroup } from "../Waiting.tsx";
import { Choice, Switch } from "../you/controls.tsx";

/** How long a save's trouble stays under the switch. */
const SAID_MS = 4000;

const keyOf = (agentId: string) => `heartbeat:${agentId}`;

interface HeartbeatProps {
  readonly reads: HeartbeatReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
}

/**
 * The harness's copy: kept from before at once, then read; whether the first read is still on its
 * way (ADR 0238).
 */
function useHeartbeatCopy(reads: HeartbeatReads | undefined, agentId: string, may: boolean) {
  const [view, setView] = useState<AgentHeartbeatView | undefined>(() =>
    may ? recall<AgentHeartbeatView>(keyOf(agentId)) : undefined,
  );
  const [reading, setReading] = useState(true);
  useEffect(() => {
    if (!may || reads === undefined) {
      setView(undefined);
      return;
    }
    let current = true;
    reads
      .readAgentHeartbeat(agentId)
      .then(
        (read) => {
          remember(keyOf(agentId), read);
          if (current) setView(read);
        },
        // Not sent yet, or not declared any more: the last copy stands, or there is no group.
        () => undefined,
      )
      .finally(() => current && setReading(false));
    return () => {
      current = false;
    };
  }, [reads, agentId, may]);
  return { view, setView, reading };
}

export function HeartbeatGroup(props: HeartbeatProps) {
  const { reads, model, directory, agentId, agentName, selfId } = props;
  const may = reads !== undefined && mayChangeHeartbeat(model, directory, agentId, selfId);
  const { view, setView, reading } = useHeartbeatCopy(reads, agentId, may);
  const land = useLands(may && view === undefined && reading);
  if (settingLook(model, directory, agentId, selfId, "heartbeat") === "not_shared") {
    return (
      <NotShared
        group="heartbeat"
        words={notSharedWords("heartbeat", directory, agentId)}
        testID="heartbeat-not-shared"
      />
    );
  }
  if (!may || reads === undefined) return null;
  if (view !== undefined) {
    return (
      <Heartbeat
        {...props}
        reads={reads}
        view={view}
        setView={setView}
        place={land.copy}
        lands={land.lands}
      />
    );
  }
  if (!reading) return null;
  return (
    <WaitingGroup
      group="heartbeat"
      harnessName={nameOf(directory, harnessOf(directory, agentId))}
      agentName={agentName}
      rows={[
        { mark: true, label: 34, sub: 12, trailing: "switch" },
        { label: 22, trailing: "value" },
      ]}
      foot={[94, 90, 58]}
      testID="heartbeat-waiting"
      place={land.blank}
    />
  );
}

function Heartbeat({
  reads,
  directory,
  agentId,
  agentName,
  view,
  setView,
  place,
  lands,
}: HeartbeatProps & {
  readonly reads: HeartbeatReads;
  readonly view: AgentHeartbeatView;
  readonly setView: Dispatch<SetStateAction<AgentHeartbeatView | undefined>>;
  /** Where it lands, and whether a blank stood for it (`useLands`). */
  readonly place: Ref<HTMLElement>;
  readonly lands: boolean;
}) {
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const [said, setSaid] = useState<string | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rows = heartbeatRows(view, harness);
  const busy = rows.quiet || rows.saving !== undefined;

  const ask = async (change: HeartbeatChangeAsk) => {
    setSaid(undefined);
    setView((was) =>
      was === undefined
        ? was
        : {
            ...was,
            change: {
              change_id: "chg_asking",
              state: "waiting",
              on: change.on,
              every: change.every ?? was.every,
              asked_at: new Date().toISOString(),
            },
          },
    );
    const outcome = await saveHeartbeatChange(reads, agentId, change, {
      alive: () => alive.current,
    });
    if (!alive.current) return;
    const now = outcome.view ?? (await reads.readAgentHeartbeat(agentId).catch(() => undefined));
    if (!alive.current) return;
    if (now !== undefined) {
      remember(keyOf(agentId), now);
      setView(now);
    }
    if (outcome.state !== "saved") {
      setSaid(heartbeatWords(outcome.state, harness, outcome.message));
      setTimeout(() => alive.current && setSaid(undefined), SAID_MS);
    }
  };

  const lit = rows.on && !rows.quiet;
  const choices = everyChoices(view);
  return (
    <section
      ref={place}
      className={lands ? "ctx hb lands" : "ctx hb"}
      aria-label="Heartbeat"
      data-testid="heartbeat-group"
    >
      <div className="ctx-h">
        <h2 className="agents-h">Heartbeat</h2>
        <span className="ctx-from" data-testid="heartbeat-from">
          <HarnessMark name={harness} side={14} />
          {harness}
        </span>
      </div>
      <ul className="ctx-group">
        <li className="ctx-row" data-testid="heartbeat-row">
          <span className="ctx-tile hb-tile" data-lit={lit} aria-hidden="true">
            <Icon name="pulse" size={19} />
          </span>
          <span className="ctx-row-words">
            <span className="ctx-row-title">Heartbeat</span>
            <span className="ctx-row-line" data-testid="heartbeat-sub">
              {said ?? rows.sub}
            </span>
          </span>
          <Switch
            label="Heartbeat"
            checked={rows.on}
            disabled={busy}
            onChange={(on) => void ask({ on })}
          />
        </li>
        {rows.every.shows && (
          <li className="ctx-row hb-every" data-testid="heartbeat-every" title={rows.hint}>
            <span className="ctx-row-words">
              <span className="ctx-row-title">Every</span>
              {rows.saving === "every" && <span className="ctx-row-line">{rows.every.value}</span>}
            </span>
            <Choice
              label="Every"
              value={String(rows.every.minutes)}
              options={choices.map((choice) => [String(choice.minutes), choice.label] as const)}
              disabled={busy}
              onChange={(minutes) => {
                const every = Number(minutes);
                if (every !== rows.every.minutes) void ask({ on: true, every });
              }}
            />
          </li>
        )}
      </ul>
      <p className="ctx-foot" data-testid="heartbeat-foot">
        {heartbeatFoot(view, agentName, harness)}
      </p>
    </section>
  );
}
