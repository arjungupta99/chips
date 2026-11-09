/**
 * An agent's own Permissions page (ADR 0286), one level deeper than its card, in the third column
 * beside it. The phone's (`apps/mobile/src/agents/Permissions.tsx`) in the desktop's terms, with the
 * same words from core (`agentPermissions`).
 *
 * At the top, what it may do right now and the one thing to do about it: Stop, or Let it work…,
 * which opens in place to say what it will do before anything changes. Then the banner, a little
 * picture of it over a switch; what its harness lets it do always; what it has asked; and its
 * harness, where the banner is switched for all its agents.
 */

import {
  ASKS_SO_FAR,
  agentPermissions,
  BANNER_FOOT,
  BANNER_HEADING,
  BANNER_ROW_WORDS,
  type Directory,
  type AgentPermissions as Facts,
  HARNESS_LINK_LINE,
  LET_IT_WORK_WORDS,
  NOTHING_IN_SPACE_WORDS,
  nameOf,
  REMOVED_WORDS,
  type SetRulesInput,
  SHOW_AGAIN_WORDS,
  STOP_WORDS,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { AlwaysList } from "../AlwaysList.tsx";
import { Count, Dots, Hero, UNDO_TITLE } from "../Asking.tsx";
import { AsksDialog } from "../AsksDialog.tsx";
import { UndoPill } from "../room/UndoPill.tsx";
import { useAlways } from "../useAlways.ts";
import { useNow } from "../useNow.ts";
import { Switch } from "../you/controls.tsx";
import type { BannerService } from "./bannerService.ts";

/** How long a yes just sent stands before the button comes back, if the server never said it. */
const SENT_MS = 8000;

export function AgentPermissions(props: {
  readonly agentId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly service: BannerService;
  /** Send a scope's rules changed; absent, Allowed always is read only. */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  readonly onOpenSpace: (spaceId: string) => void;
  readonly onOpenHarness: (harnessId: string) => void;
}) {
  const { directory, service } = props;
  const always = useAlways(props.model, props.onSetRules);
  const now = useNow();
  const view = agentPermissions(
    {
      model: always.model,
      directory,
      banners: service.banners,
      keepsBanners: service.keepsBanners,
      keepsHeldStart: service.keepsHeldStart,
    },
    props.agentId,
    props.selfId,
    now,
  );
  const removed = always.removed;
  return (
    <section className="perm" aria-label="Permissions" data-testid="permissions">
      <Top view={view} directory={directory} service={service} />
      {view.banner.mayChoose && <BannerGroup view={view} service={service} />}
      <section className="ctx" aria-label="Allowed always">
        <div className="ctx-h">
          <h3 className="agents-h">Allowed always</h3>
          <Count rules={view.rules} />
        </div>
        <div className="perm-always">
          <AlwaysList
            rules={view.rules}
            always={always}
            may={view.mayChangeRules && props.onSetRules !== undefined}
            testId="permissions-always"
          />
        </div>
        <p className="ctx-foot">{view.rulesFoot}</p>
      </section>
      <AsksGroup view={view} {...props} />
      <section className="ctx" aria-label="Harness">
        <div className="ctx-h">
          <h3 className="agents-h">Harness</h3>
        </div>
        <ul className="ctx-group">
          <li>
            <button
              type="button"
              className="ctx-row hp-row"
              onClick={() => props.onOpenHarness(view.harnessId)}
              data-testid="permissions-harness"
            >
              <Avatar name={view.harnessName} kind="harness" size="xs" />
              <span className="ctx-row-words">
                <span className="ctx-row-title">{view.harnessName}</span>
                <span className="ctx-row-line">{HARNESS_LINK_LINE}</span>
              </span>
              <span className="ctx-row-chev" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        </ul>
      </section>
      <UndoPill
        undoing={removed === undefined ? undefined : { lineId: removed.key, at: removed.at }}
        onUndo={always.undo}
        onGone={always.settled}
        words={REMOVED_WORDS}
        title={UNDO_TITLE}
        page
      />
    </section>
  );
}

function Top(props: {
  readonly view: Facts;
  readonly directory: Directory;
  readonly service: BannerService;
}) {
  const { view, directory, service } = props;
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const working = view.held !== undefined;
  useEffect(() => {
    if (working) {
      setConfirming(false);
      setSent(false);
    }
  }, [working]);
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), SENT_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  const owner = directory[view.harnessId]?.ownerId;
  const spaceId = view.space?.id;
  const face = directory[view.agentId]?.face;
  return (
    <section className="perm-top" data-testid="permissions-top">
      <Hero
        harness={view.name}
        person={view.to}
        personName={owner === undefined ? "?" : nameOf(directory, owner)}
        face={owner === undefined ? undefined : directory[owner]?.face}
        own={
          <Avatar
            name={view.name}
            kind="agent"
            size="lg"
            {...(face === undefined ? {} : { icon: face })}
          />
        }
        working={working}
      />
      <p className="asking-headline" data-testid="permissions-headline">
        {view.headline}
      </p>
      <p className="asking-sub" data-testid="permissions-sub">
        {view.sub}
      </p>
      {view.mayStop && spaceId !== undefined && (
        <button
          type="button"
          className="perm-act"
          onClick={() => service.stopLetWork({ spaceId, asker: view.agentId })}
          data-testid="permissions-stop"
        >
          {STOP_WORDS}
        </button>
      )}
      {view.mayLetWork && !confirming && (
        <button
          type="button"
          className="perm-act"
          disabled={sent}
          onClick={() => setConfirming(true)}
          data-testid="permissions-let-work"
        >
          {LET_IT_WORK_WORDS}
        </button>
      )}
      <div className="perm-fold" data-open={confirming && view.mayLetWork ? "true" : undefined}>
        <div>
          {confirming && view.mayLetWork && spaceId !== undefined && (
            <div className="perm-confirm" data-testid="permissions-confirm">
              <p>{view.confirmWords}</p>
              <div className="perm-confirm-acts">
                <button
                  type="button"
                  className="perm-act"
                  data-quiet="true"
                  onClick={() => setConfirming(false)}
                  data-testid="permissions-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="perm-act"
                  data-gold="true"
                  onClick={() => {
                    service.letAgentWork({ spaceId, asker: view.agentId });
                    setConfirming(false);
                    setSent(true);
                  }}
                  data-testid="permissions-confirm-yes"
                >
                  {view.confirmButton}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BannerGroup(props: { readonly view: Facts; readonly service: BannerService }) {
  const { view, service } = props;
  const { banner } = view;
  const shows = banner.shown && banner.closed === undefined;
  const spaceId = view.space?.id;
  return (
    <section className="ctx" aria-label={BANNER_HEADING} data-testid="permissions-banner">
      <div className="ctx-h">
        <h3 className="agents-h">{BANNER_HEADING}</h3>
        <span className="perm-owner">
          <Avatar name={view.harnessName} kind="harness" size="xs" />
          {view.harnessName}
        </span>
      </div>
      <ul className="ctx-group">
        <li className="perm-preview" aria-hidden="true" data-testid="permissions-preview">
          <span className="perm-capsule">
            <b>{view.space?.name ?? "Its space"}</b>
            <small>{view.name}</small>
          </span>
          <div className="perm-fold" data-open={shows ? "true" : undefined}>
            <div>
              <span className="perm-little">
                <i />
                <span>{banner.preview}</span>
                <em>{STOP_WORDS}</em>
                <Icon name="x" size={10} />
              </span>
            </div>
          </div>
          <div className="perm-fold" data-open={shows ? undefined : "true"}>
            <div>
              <p className="perm-nothing" data-testid={shows ? undefined : "permissions-nothing"}>
                {NOTHING_IN_SPACE_WORDS}
              </p>
            </div>
          </div>
        </li>
        <li className="ctx-row hp-row" data-testid="permissions-banner-row">
          <span className="ctx-tile hp-mark perm-mark" aria-hidden="true">
            <Icon name="banner" size={17} />
          </span>
          <span className="ctx-row-words">
            <span className="ctx-row-title">{BANNER_ROW_WORDS}</span>
            <span className="ctx-row-line">{banner.sub}</span>
          </span>
          <Switch
            label={`${BANNER_ROW_WORDS} for ${view.name}`}
            checked={banner.shown}
            onChange={(on) => {
              service.setAgentBanner(view.agentId, on).catch(() => undefined);
            }}
            testId="permissions-banner-switch"
          />
        </li>
        <li className="perm-fold" data-open={banner.closed === undefined ? undefined : "true"}>
          <div>
            {banner.closed !== undefined && spaceId !== undefined && (
              <div className="ctx-row hp-row" data-testid="permissions-closed">
                <span className="ctx-row-words">
                  <span className="ctx-row-title">{banner.closed.title}</span>
                  <span className="ctx-row-line">{banner.closed.line}</span>
                </span>
                <button
                  type="button"
                  className="perm-act"
                  data-small="true"
                  onClick={() => {
                    service.reopenBanner({ spaceId, asker: view.agentId }).catch(() => undefined);
                  }}
                  data-testid="permissions-show-again"
                >
                  {SHOW_AGAIN_WORDS}
                </button>
              </div>
            )}
          </div>
        </li>
      </ul>
      <p className="ctx-foot">{BANNER_FOOT}</p>
    </section>
  );
}

function AsksGroup(props: {
  readonly view: Facts;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly onOpenSpace: (spaceId: string) => void;
}) {
  const { view } = props;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (view.history === undefined) return null;
  return (
    <section className="ctx" aria-label={ASKS_SO_FAR}>
      <div className="ctx-h">
        <h3 className="agents-h">{ASKS_SO_FAR}</h3>
      </div>
      <ul className="ctx-group">
        <li>
          <button
            type="button"
            ref={button}
            className="ctx-row hp-row perm-asks"
            aria-haspopup="dialog"
            aria-label={`${ASKS_SO_FAR}. ${view.history.line}`}
            onClick={() => setOpen(true)}
            data-testid="permissions-asks"
          >
            <span className="ctx-row-words">
              <Dots dots={view.history.dots} />
              <span className="ctx-row-line">{view.history.line}</span>
            </span>
            <span className="ctx-row-chev" aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      </ul>
      {open && (
        <AsksDialog
          model={props.model}
          directory={props.directory}
          harnessId={view.harnessId}
          selfId={props.selfId}
          from={button.current}
          onOpenSpace={props.onOpenSpace}
          onClosed={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      )}
    </section>
  );
}
