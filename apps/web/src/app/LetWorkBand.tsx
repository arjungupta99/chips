/**
 * The band under a room's head while an agent works there without asking (ADR 0281, ADR 0286):
 * `Jiro is working without asking`, until when for a yes given for an hour, Stop and ×. Its words
 * open the agent's Permissions.
 *
 * Stop ends the yes (`approval.held_stopped`): the band says `Stopped. Jiro asks again from its
 * next step.` for a moment and folds away, and the agent's next ask comes to a person as usual.
 *
 * × only puts the band away, on all this person's devices, until the agent is given a new yes. The
 * band says `Hidden for now` for five seconds first, with Disable banner and Undo, and a hairline
 * counts them; then it folds. Disable banner says the person doesn't want it for this agent at all.
 * The agent goes on working through all of it. The words are core's, as the phone's are.
 */

import {
  BANNER_DISABLE_WORDS,
  BANNER_HIDDEN_MS,
  BANNER_HIDDEN_WORDS,
  BANNER_OFF_MS,
  BANNER_UNDO_WORDS,
  bannerClosed,
  bannerOffWords,
  bannerWanted,
  type Directory,
  type LetWork,
  lettingWork,
  NO_BANNERS,
  nameOf,
  type Space,
  STOP_WORDS,
  STOPPED_MS,
  stoppedWords,
  workingWords,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useState } from "react";
import type { BannerService } from "./agent/bannerService.ts";

type After =
  // `back`: Undo was pressed. It holds the band up until the store's word has caught up, so it
  // doesn't go for a frame and fold in again.
  | { readonly kind: "hidden" | "off" | "back"; readonly until: number }
  | { readonly kind: "stopped"; readonly until: number; readonly name: string };

/** Long enough for the store's next draw to say the band is wanted again. */
const BACK_MS = 800;

export function LetWorkBand(props: {
  readonly space: Space;
  readonly directory: Directory;
  readonly now: number;
  /** Stop the agent working without asking here; absent, the band offers no Stop. */
  readonly onStop?: ((asker: string) => void) | undefined;
  /** Closing it and choosing it (ADR 0286); absent, it can't be put away. */
  readonly service?: BannerService | undefined;
  /** Opens an agent's Permissions, or a harness's asks when it has no agents. */
  readonly onOpenPermissions?: ((asker: string) => void) | undefined;
}) {
  const { space, directory, onStop, service } = props;
  const banners = service?.banners ?? NO_BANNERS;
  const [after, setAfter] = useState<Readonly<Record<string, After>>>({});
  const say = (asker: string, next: After | undefined) =>
    setAfter(({ [asker]: _was, ...others }) =>
      next === undefined ? others : { ...others, [asker]: next },
    );
  useEffect(() => {
    const timers = Object.entries(after).map(([asker, each]) =>
      setTimeout(
        () => setAfter(({ [asker]: _gone, ...others }) => others),
        Math.max(0, each.until - Date.now()),
      ),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [after]);
  if (space.state !== "open") return null;
  const holding = lettingWork(space, props.now);
  const shown = holding.filter(
    (held) =>
      after[held.asker] !== undefined ||
      (bannerWanted(banners, directory, held.asker) && !bannerClosed(banners, space.id, held)),
  );
  const stoppedAlone = Object.entries(after).filter(
    ([asker, each]) => each.kind === "stopped" && !holding.some((held) => held.asker === asker),
  );
  if (shown.length === 0 && stoppedAlone.length === 0) return null;

  const acts = (held: LetWork, name: string): BandActs => ({
    stop:
      onStop === undefined
        ? undefined
        : () => {
            onStop(held.asker);
            say(held.asker, { kind: "stopped", name, until: Date.now() + STOPPED_MS });
          },
    close:
      service === undefined
        ? undefined
        : () => {
            service
              .closeBanner({ spaceId: space.id, asker: held.asker, since: held.since })
              .catch(() => undefined);
            say(held.asker, { kind: "hidden", until: Date.now() + BANNER_HIDDEN_MS });
          },
    undoClose: () => {
      service?.reopenBanner({ spaceId: space.id, asker: held.asker }).catch(() => undefined);
      say(held.asker, { kind: "back", until: Date.now() + BACK_MS });
    },
    disable: () => {
      // Off says all of it, so turning it back on later shows the band at once.
      service?.setAgentBanner(held.asker, false).catch(() => undefined);
      service?.reopenBanner({ spaceId: space.id, asker: held.asker }).catch(() => undefined);
      say(held.asker, { kind: "off", until: Date.now() + BANNER_OFF_MS });
    },
    undoOff: () => {
      service?.setAgentBanner(held.asker, true).catch(() => undefined);
      say(held.asker, { kind: "back", until: Date.now() + BACK_MS });
    },
    open:
      props.onOpenPermissions === undefined
        ? undefined
        : () => props.onOpenPermissions?.(held.asker),
  });

  return (
    <div className="letwork-bands" data-testid="let-work-bands">
      {shown.map((held) => {
        const name = nameOf(directory, held.asker);
        return (
          // The same band, by the same key, its words crossing over as it changes.
          <HeldBand
            key={held.asker}
            words={workingWords(name, held)}
            name={name}
            after={after[held.asker]}
            mayDisable={service?.keepsBanners !== false}
            acts={acts(held, name)}
          />
        );
      })}
      {stoppedAlone.map(([asker, each]) => (
        <Band
          key={asker}
          words={each.kind === "stopped" ? stoppedWords(each.name) : ""}
          state="stopped"
        />
      ))}
    </div>
  );
}

interface BandActs {
  readonly stop: (() => void) | undefined;
  readonly close: (() => void) | undefined;
  readonly undoClose: () => void;
  readonly disable: () => void;
  readonly undoOff: () => void;
  readonly open: (() => void) | undefined;
}

function HeldBand(props: {
  readonly words: string;
  readonly name: string;
  readonly after: After | undefined;
  readonly mayDisable: boolean;
  readonly acts: BandActs;
}) {
  const { after, acts, name } = props;
  if (after?.kind === "stopped") return <Band words={stoppedWords(after.name)} state="stopped" />;
  if (after?.kind === "off") {
    return (
      <Band words={bannerOffWords(name)} state="off">
        <button
          type="button"
          className="letwork-text"
          onClick={acts.undoOff}
          data-testid="let-work-undo-off"
        >
          {BANNER_UNDO_WORDS}
        </button>
      </Band>
    );
  }
  if (after?.kind === "hidden") {
    return (
      <Band words={BANNER_HIDDEN_WORDS} state="hidden">
        {props.mayDisable && (
          <button
            type="button"
            className="letwork-stop"
            data-solid="true"
            aria-label={`Disable the banner for ${name}`}
            onClick={acts.disable}
            data-testid="let-work-disable"
          >
            {BANNER_DISABLE_WORDS}
          </button>
        )}
        <button
          type="button"
          className="letwork-text"
          onClick={acts.undoClose}
          data-testid="let-work-undo-close"
        >
          {BANNER_UNDO_WORDS}
        </button>
      </Band>
    );
  }
  return (
    <Band
      words={props.words}
      onOpen={acts.open}
      openLabel={`${props.words}. Opens ${name}'s permissions`}
    >
      {acts.stop !== undefined && (
        <button
          type="button"
          className="letwork-stop"
          aria-label={`Stop ${name} working without asking`}
          onClick={acts.stop}
          data-testid="let-work-stop"
        >
          {STOP_WORDS}
        </button>
      )}
      {acts.close !== undefined && (
        <button
          type="button"
          className="letwork-close"
          aria-label="Close this banner"
          title="Hides it until this agent is given a new yes. The agent keeps working."
          onClick={acts.close}
          data-testid="let-work-close"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </Band>
  );
}

function Band(props: {
  readonly words: string;
  /** What it is saying after a click on it. Absent, it is working. */
  readonly state?: "hidden" | "off" | "stopped" | undefined;
  readonly onOpen?: (() => void) | undefined;
  readonly openLabel?: string | undefined;
  readonly children?: ReactNode;
}) {
  // Its arrival only plays once: Undo must not fold it in again from nothing.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (props.state !== undefined) setSettled(true);
  }, [props.state]);
  const said = (
    <>
      <span className="letwork-dot" aria-hidden="true" />
      <span className="letwork-words" key={props.words}>
        {props.words}
      </span>
    </>
  );
  return (
    <div
      className="letwork"
      role="status"
      data-settled={settled ? "true" : undefined}
      data-state={props.state}
      data-stopped={props.state === "stopped" ? "true" : undefined}
      data-testid="let-work-band"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setSettled(true);
      }}
    >
      <div className="letwork-in">
        {props.onOpen === undefined ? (
          <span className="letwork-said">{said}</span>
        ) : (
          <button
            type="button"
            className="letwork-said"
            aria-label={props.openLabel}
            onClick={props.onOpen}
            data-testid="let-work-open"
          >
            {said}
          </button>
        )}
        {props.children}
      </div>
      {(props.state === "hidden" || props.state === "off") && (
        <i className="letwork-hair" aria-hidden="true" />
      )}
    </div>
  );
}
