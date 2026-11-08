/**
 * The harnesses' shelf at the head of the Agents page (ADR 0185), as the phone's Agents tab has it:
 * a tile for each harness, its face, its name and one line, in a row that scrolls sideways; and
 * View all under it, which opens every harness's card in a page of its own. The cards stood under
 * every agent until 17 October 2026, three screens down on Arjun's server.
 *
 * Which harnesses, in what order, and the words that are not state are core's (`harnessShelf`), as
 * the phone's are. The line is why the harness can't answer, in amber; or what it is doing, in the
 * sidebar's own word and tone (`FleetWord`); or how many agents it has.
 *
 * Connect a harness is the last tile, as on the phone (ADR 0261): Arjun, 17 October 2026, "I do
 * not expect connect a harness to be use a whole lot, so let's keep it as the last tile".
 */

import {
  agentCountWords,
  agentsTab,
  connectTileWords,
  type Directory,
  fleetDoing,
  type HarnessTile,
  harnessShelf,
  type JoinRequest,
  joinCardOf,
  type WaitingLink,
  type WorkspaceModel,
  waitingLink,
} from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import { createContext, useContext } from "react";
import { useArrivals } from "./Arrive.tsx";
import { OpenedPage } from "./context/pages.ts";
import { FleetWord, STATUS_TONE, saysStatus } from "./Sidebar.tsx";
import { Swap } from "./Swap.tsx";
import { useNarrow } from "./useNarrow.ts";
import { useNow } from "./useNow.ts";

/** Connect a harness is open beside the list (ADR 0284's addendum): its tile is the one chosen. */
export const ConnectShown = createContext(false);

export function HarnessShelf({
  model,
  directory,
  selfId,
  onOpen,
  onAll,
  onConnect,
  waitsOn,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** Its page: its card alone, over the Agents page. */
  readonly onOpen: (harnessId: string) => void;
  /** Every harness's card, in a page of its own. */
  readonly onAll: () => void;
  /** Connect a harness, grown out of the tile. Absent, as in the demo, there is no tile. */
  readonly onConnect?: ((from: HTMLElement) => void) | undefined;
  /** The request of a link a card made that still waits: the tile counts it down (ADR 0271). */
  readonly waitsOn?: JoinRequest | undefined;
}) {
  const tiles = harnessShelf(agentsTab(model, directory, selfId), directory);
  // A harness that connects while the page is open grows into its place on the shelf.
  const arriving = useArrivals(tiles.map((tile) => tile.id));
  if (tiles.length === 0 && onConnect === undefined) return null;
  return (
    <section className="shelf" aria-label="Harnesses" data-testid="harness-shelf">
      <ul className="shelf-tiles">
        {tiles.map((tile) => (
          <li key={tile.id} data-arrive={arriving.has(tile.id) ? "true" : undefined}>
            <Tile tile={tile} model={model} onOpen={onOpen} />
          </li>
        ))}
        {onConnect !== undefined && (
          <li>
            {waitsOn === undefined ? (
              <ConnectTile onConnect={onConnect} />
            ) : (
              <WaitingTile
                request={waitsOn}
                model={model}
                directory={directory}
                onConnect={onConnect}
              />
            )}
          </li>
        )}
      </ul>
      {tiles.length > 0 && (
        <button
          type="button"
          className="shelf-all"
          aria-label="View all harnesses"
          data-testid="view-all-harnesses"
          onClick={onAll}
        >
          View all <span aria-hidden="true">›</span>
        </button>
      )}
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
  // Named by what it shows, its name then its line ("Scout 1 agent"), so a voice that says what it
  // sees finds it; the face says the name again and is left out of it.
  const opened = useContext(OpenedPage);
  const chosen = opened?.kind === "harness_page" && opened.harnessId === tile.id;
  return (
    <button
      type="button"
      className="shelf-tile"
      data-testid={`harness-tile-${tile.id}`}
      data-chosen={chosen ? "true" : undefined}
      aria-current={chosen ? "page" : undefined}
      onClick={() => onOpen(tile.id)}
    >
      <span className="shelf-face" aria-hidden="true">
        <Avatar name={tile.name} kind="harness" cantAnswer={tile.trouble !== undefined} />
      </span>
      <span className="shelf-name">{tile.name}</span>{" "}
      <span className="shelf-line" data-tone={tone}>
        {/* Its line crossfades as the harness starts, stops or can't answer. */}
        <Swap
          id={tile.trouble ?? (busy ? `busy ${entry?.status}` : agentCountWords(tile.agents))}
          className="shelf-words"
        >
          {tile.trouble ??
            (busy ? (
              <FleetWord harness={entry} doing={fleetDoing(model.spaces, entry)} />
            ) : (
              agentCountWords(tile.agents)
            ))}
        </Swap>
      </span>
    </button>
  );
}

/**
 * The shelf's last tile: Connect a harness, or, while a link a card made waits, Waiting with the
 * minutes it has left and then Connecting once its harness has taken its key, as the phone's tile
 * (core's `connectTileWords`). It opens on that card again.
 */
function ConnectTile(props: {
  readonly waiting?: WaitingLink | undefined;
  readonly onConnect: (from: HTMLElement) => void;
}) {
  const words = connectTileWords(props.waiting);
  const chosen = useContext(ConnectShown);
  // A dialog at a phone's width; beside the list, a page in the second column.
  const phone = useNarrow();
  return (
    <button
      type="button"
      className="shelf-tile shelf-add"
      aria-haspopup={phone ? "dialog" : undefined}
      data-testid="harness-connect"
      data-chosen={chosen ? "true" : undefined}
      aria-current={chosen ? "page" : undefined}
      data-waiting={props.waiting === undefined ? undefined : "true"}
      onClick={(event) => props.onConnect(event.currentTarget)}
    >
      <span className="shelf-add-mark" aria-hidden="true">
        <Icon name="plus" size={20} />
      </span>
      {/* Connect, Waiting and Connecting crossfade; the minutes left simply count. */}
      <span className="shelf-name">
        <Swap id={words.name} className="shelf-words">
          {words.name}
        </Swap>
      </span>{" "}
      <span className="shelf-line">
        <Swap id={words.name} className="shelf-words">
          {words.line}
        </Swap>
      </span>
      {/* Named by what it shows ("Connect a harness", "Waiting 14:59"), and while a link waits, what
          for, unseen. */}
      {props.waiting !== undefined && (
        <>
          {" "}
          <span className="ui-visually-hidden">{connectTileFor(props.waiting)}</span>
        </>
      )}
    </button>
  );
}

/**
 * What a waiting tile is for, said after what it shows: its name then starts with the words on it,
 * as voice control needs, rather than with core's `label`, which the phone speaks.
 */
function connectTileFor(waiting: WaitingLink): string {
  return waiting.taken ? "to connect a harness" : "left, to connect a harness";
}

/** The tile while a link waits: a clock of its own, so only it is drawn again each second. */
function WaitingTile(props: {
  readonly request: JoinRequest;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly onConnect: (from: HTMLElement) => void;
}) {
  const nowMs = useNow(1000);
  const card = joinCardOf(props.request, props.model, props.directory, nowMs);
  return (
    <ConnectTile waiting={waitingLink(props.request, card, nowMs)} onConnect={props.onConnect} />
  );
}
