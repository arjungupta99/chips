/**
 * The harnesses' shelf at the head of the Agents page (ADR 0185), as the phone's Agents tab has it:
 * a tile for each harness, its face, its name and one line, in a row that scrolls sideways; and
 * View all under it, which opens every harness's card in a page of its own. The cards stood under
 * every agent until 17 October 2026, three screens down on Arjun's server.
 *
 * Which harnesses, in what order, and the words that are not state are core's (`harnessShelf`), as
 * the phone's are. The line is why the harness can't answer, in amber; or what it is doing, in the
 * sidebar's own word and tone (`FleetWord`); or how many agents it has.
 */

import {
  agentCountWords,
  agentsTab,
  type Directory,
  fleetDoing,
  type HarnessTile,
  harnessShelf,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar } from "@chipschat/ui";
import { FleetWord, STATUS_TONE, saysStatus } from "./Sidebar.tsx";

export function HarnessShelf({
  model,
  directory,
  selfId,
  onOpen,
  onAll,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** Its page: its card alone, over the Agents page. */
  readonly onOpen: (harnessId: string) => void;
  /** Every harness's card, in a page of its own. */
  readonly onAll: () => void;
}) {
  const tiles = harnessShelf(agentsTab(model, directory, selfId), directory);
  if (tiles.length === 0) return null;
  return (
    <section className="shelf" aria-label="Harnesses" data-testid="harness-shelf">
      <ul className="shelf-tiles">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Tile tile={tile} model={model} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="shelf-all"
        aria-label="View all harnesses"
        data-testid="view-all-harnesses"
        onClick={onAll}
      >
        View all <span aria-hidden="true">›</span>
      </button>
    </section>
  );
}

/** One harness: its face, its name, and its line. */
function Tile({
  tile,
  model,
  onOpen,
}: {
  readonly tile: HarnessTile;
  readonly model: WorkspaceModel;
  readonly onOpen: (harnessId: string) => void;
}) {
  const entry = model.fleet.find((each) => each.harnessId === tile.id);
  const busy = tile.trouble === undefined && entry !== undefined && saysStatus(entry);
  const tone =
    tile.trouble !== undefined ? "amber" : busy ? STATUS_TONE[entry?.status ?? ""] : undefined;
  return (
    <button
      type="button"
      className="shelf-tile"
      aria-label={tile.name}
      data-testid={`harness-tile-${tile.id}`}
      onClick={() => onOpen(tile.id)}
    >
      <Avatar name={tile.name} kind="harness" cantAnswer={tile.trouble !== undefined} />
      <span className="shelf-name">{tile.name}</span>
      <span className="shelf-line" data-tone={tone}>
        {tile.trouble ??
          (busy ? (
            <FleetWord harness={entry} doing={fleetDoing(model.spaces, entry)} />
          ) : (
            agentCountWords(tile.agents)
          ))}
      </span>
    </button>
  );
}
