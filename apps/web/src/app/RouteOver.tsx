/**
 * Where a person's message went, over it (ADR 0081, A2): the lane's route — an arrow and the face
 * or faces it was for, after your own face on your messages. Another person's message has their
 * face beside it already, so its route starts at the arrow. Drawn only where it changed, so it
 * marks exactly where the capsule's default moved; on the bubble's side, as the words are.
 *
 * A button since ADR 0113: a click lists every agent it went to, and every person (ADR 0204), under it. A route draws faces and
 * never names, and from four agents it is one mark and a number (`FaceGroup`), so the list is
 * where the names are. The phone's is a sheet (`apps/mobile/src/spaces/RouteSheet.tsx`).
 *
 * The faces are spans rather than a `Trail`, whose list cannot stand inside a button, drawn with
 * the trail's own classes so they look the same. Escape, a click elsewhere, or the route again
 * closes the list.
 */

import {
  countedWords,
  type Directory,
  type Line,
  type MessageTrail,
  nameOf,
  plainWords,
} from "@chipschat/core";
import { FACES_UP_TO, FaceGroup } from "@chipschat/ui";
import { useId, useRef, useState } from "react";
import { facesOf, useOutside } from "./AddressInField.tsx";
import { clockTime } from "./time.ts";

/** A route as the room draws it: the field's words for it, and the room's lead (ADR 0113). */
export interface RouteMark extends MessageTrail {
  readonly words: string;
  readonly lead?: string | undefined;
}

/** As much of the message as the list's line has room for. */
const QUOTED = 40;

/**
 * "17 agents · “Hello all” at 13:38": how many, and which message, by its words without marks.
 * People are counted as people (ADR 0204): "1 person, 1 agent".
 */
export function routeHint(route: RouteMark, line: Line, directory: Directory): string {
  const count = countedWords(route.to, directory);
  const words = plainWords(line.text);
  const quoted = words.length > QUOTED ? `${words.slice(0, QUOTED - 1).trimEnd()}…` : words;
  return quoted === "" ? count : `${count} · “${quoted}” at ${clockTime(line.ts)}`;
}

export function RouteOver({
  route,
  line,
  mine,
  directory,
}: {
  readonly route: RouteMark | undefined;
  readonly line: Line;
  readonly mine: boolean;
  readonly directory: Directory;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  useOutside(button, list, open, () => setOpen(false));
  if (route === undefined) return null;
  // "Went to", where the field's faces say "To": where a message went, not where the next goes.
  const many =
    route.words === "Everyone" && route.to.length > FACES_UP_TO
      ? `, ${countedWords(route.to, directory)}`
      : "";
  return (
    <div className="msg-route" data-testid="message-route" data-mine={mine ? "true" : undefined}>
      <button
        ref={button}
        type="button"
        className="msg-route-button ui-trail"
        aria-label={`Went to ${route.words}${many}`}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {mine && (
          <span className="ui-trail__hop">
            <FaceGroup faces={facesOf([route.from], directory)} />
          </span>
        )}
        <span className="ui-trail__hop">
          <span className="ui-trail__arrow" aria-hidden="true">
            →
          </span>
          <FaceGroup faces={facesOf(route.to, directory)} />
        </span>
      </button>
      {open && (
        <div
          ref={list}
          id={listId}
          className="route-list"
          role="dialog"
          aria-label={`To ${route.words}`}
          data-testid="route-list"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            button.current?.focus({ preventScroll: true });
          }}
        >
          <p className="route-list-title">To {route.words}</p>
          <p className="route-list-hint">{routeHint(route, line, directory)}</p>
          <ul className="route-list-rows">
            {route.to.map((id) => (
              <li key={id} className="route-list-row" data-testid={`route-list-${id}`}>
                <FaceGroup faces={facesOf([id], directory)} />
                <span className="route-list-words">
                  <span className="route-list-name">{nameOf(directory, id)}</span>
                  {harnessName(directory, id) !== undefined && (
                    <small>{harnessName(directory, id)}</small>
                  )}
                </span>
                {id === route.lead && <span className="aim-lead">Lead</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The harness an agent is of, by name; nothing for anybody else. */
function harnessName(directory: Directory, id: string): string | undefined {
  const known = directory[id];
  return known?.kind === "agent" && known.harnessId !== undefined
    ? nameOf(directory, known.harnessId)
    : undefined;
}
