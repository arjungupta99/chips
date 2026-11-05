/**
 * What only a desk has of a harness (ADR 0273, Arjun's B of the mock "Where a harness page's desk
 * parts go"): a Connection group under Set up of four rows, each saying what it holds, and the pages
 * they open over the harness's page. Who owns it, which the people who may hand it on change
 * (M5.2); what it sends, the connection checklist lit as event types arrive (M1.6); what it may do,
 * a switch each (ADR 0046); and its tokens (ADR 0023). The phone has none of these: issuing a
 * credential is a desk job. Until ADR 0273 they stood open under History, the checklist's nine
 * lines first, and What it may do and Tokens unfolded in place.
 *
 * Tokens are the owner's (ADR 0023). The page shows what a harness holds without ever showing a
 * token, because Chips keeps only digests; it issues another, once, on screen; and it withdraws
 * one, which takes effect at the harness's next request and closes the socket it is holding. A
 * rotation is those two in that order, which is what the page's wording says.
 */

import {
  type Directory,
  type HarnessConnection,
  type HarnessToken,
  type IssuedHarnessToken,
  mayDoValue,
  nameOf,
  OFFERED,
  ownerValue,
  sendsValue,
  type WorkspaceModel,
} from "@chipschat/core";
import { CONNECTION_CHECKLIST } from "@chipschat/protocol";
import { Button, Icon } from "@chipschat/ui";
import { useCallback, useEffect, useState } from "react";
import { Fold } from "../Arrive.tsx";
import { GroupRow } from "../GroupRow.tsx";
import { CapabilityRow } from "../Join.tsx";
import { relativeTime } from "../time.ts";
import { useLands } from "../Waiting.tsx";
import { Face } from "../you/PeopleParts.tsx";
import type { HarnessPart } from "./parts.ts";

export interface TokenService {
  readonly list: (harnessId: string) => Promise<HarnessToken[]>;
  readonly issue: (harnessId: string, name: string) => Promise<IssuedHarnessToken>;
  readonly revoke: (harnessId: string, tokenId: string) => Promise<void>;
}

/**
 * The Connection group: Owner, with who; What it sends, with how much of the checklist has lit and
 * when it was last heard; What it may do, with how many of its switches are on, for whoever may hand
 * it on; and Tokens, with nothing at its right, since its list is asked for only when it is opened.
 * Owner opens its picker only for whoever may hand it on, and says who to anybody else.
 */
export function DeskGroup(props: {
  readonly harnessId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  /** Whoever may hand it on: its owner, or a workspace owner or admin (M5.2). */
  readonly handsOn: boolean;
  /** Whether this surface manages its tokens. */
  readonly tokens: boolean;
  readonly onOpenPart: (part: HarnessPart) => void;
}) {
  const { harnessId, directory, handsOn } = props;
  const owner = ownerValue(directory, directory[harnessId]?.ownerId, props.selfId);
  return (
    <section className="ctx hp-desk" aria-label="Connection" data-testid="harness-desk">
      <div className="ctx-h">
        <h3 className="agents-h">Connection</h3>
      </div>
      <ul className="ctx-group">
        {(owner !== undefined || handsOn) && (
          <GroupRow
            label="Owner"
            value={owner}
            mark={{ icon: "user", ground: 2 }}
            onClick={handsOn ? () => props.onOpenPart("owner") : undefined}
            testId="harness-owner-row"
          />
        )}
        <GroupRow
          label="What it sends"
          value={sendsValue(props.model.connections[harnessId], Date.now())}
          mark={{ icon: "pulse", ground: 7 }}
          onClick={() => props.onOpenPart("sends")}
          testId="harness-sends-row"
        />
        {handsOn && (
          <GroupRow
            label="What it may do"
            value={mayDoValue(directory[harnessId]?.capabilities)}
            mark={{ icon: "bolt", ground: 13 }}
            onClick={() => props.onOpenPart("may")}
            testId="harness-may-row"
          />
        )}
        {props.tokens && (
          <GroupRow
            label="Tokens"
            mark={{ icon: "key", ground: 14 }}
            onClick={() => props.onOpenPart("tokens")}
            testId="harness-tokens-row"
          />
        )}
      </ul>
    </section>
  );
}

/**
 * Who owns a harness, as a page of the people who may: everyone in the workspace who is not a guest,
 * a tick on its owner. A click hands it on; the tick moves when the directory is read again, and the
 * rows are still until the server has answered. Without the right to hand it on, the rows say who
 * and do nothing.
 */
export function OwnerPart(props: {
  readonly harnessId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly onTransfer: ((harnessId: string, ownerId: string) => Promise<void>) | undefined;
}) {
  const { harnessId, directory, onTransfer } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const ownerId = directory[harnessId]?.ownerId;
  const people = Object.values(props.model.people).filter((person) => person.role !== "guest");
  const choose = async (to: string) => {
    if (onTransfer === undefined || to === ownerId) return;
    setBusy(true);
    setError(undefined);
    try {
      await onTransfer(harnessId, to);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hp-part" data-testid="owner-picker">
      <p className="hp-lede">
        Its asks go to its owner on any device, unless it names someone else in the space.
      </p>
      <Fold open={error !== undefined}>
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      </Fold>
      <ul className="ctx-group" aria-label={`${nameOf(directory, harnessId)}'s owner`}>
        {people.map((person) => {
          const id = person.participantId;
          const inner = (
            <>
              <Face directory={directory} id={id} size="sm" />
              <span className="ctx-row-words">
                <span className="ctx-row-title">{personWords(directory, id, props.selfId)}</span>
              </span>
              {id === ownerId && (
                <span className="sheet-picked" aria-hidden="true">
                  <Icon name="check" size={15} />
                </span>
              )}
            </>
          );
          return (
            <li key={id}>
              {onTransfer === undefined ? (
                <span className="ctx-row hp-row" data-testid={`owner-${id}`}>
                  {inner}
                </span>
              ) : (
                <button
                  type="button"
                  className="ctx-row hp-row"
                  aria-current={id === ownerId ? "true" : undefined}
                  disabled={busy}
                  onClick={() => void choose(id)}
                  data-testid={`owner-${id}`}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A person on the Owner page: their name, and "(you)" after the reader's, unless it says so. */
function personWords(directory: Directory, id: string, selfId: string | undefined): string {
  const name = nameOf(directory, id);
  return id === selfId && name !== "You" ? `${name} (you)` : name;
}

/** What it sends: the checklist, whole, with a line on what it is. */
export function SendsPart(props: { readonly connection: HarnessConnection | undefined }) {
  return (
    <div className="hp-part hp-sends" data-testid="harness-sends">
      <p className="hp-lede">
        Each part of Chips lights up once the harness sends the event that draws it.
      </p>
      <Checklist connection={props.connection} />
    </div>
  );
}

/** Which rows have lit: a harness that has sent the event type has earned that part of the UI. */
export function Checklist({ connection }: { readonly connection: HarnessConnection | undefined }) {
  const seen = new Set(connection?.seen ?? []);
  return (
    <ul className="checklist" aria-label="Connection checklist">
      {CONNECTION_CHECKLIST.map((row) => {
        const lit = row.types.some((type) => seen.has(type));
        return (
          <li
            key={row.label}
            data-lit={lit ? "true" : "false"}
            data-testid={`check-${row.types[0]}`}
          >
            <span className="checklist-mark" aria-hidden="true">
              {lit ? "●" : "○"}
            </span>
            <b>{row.label}</b>
            <span className="checklist-gives">
              {lit ? `sent ${row.types[0]}` : `send ${row.types[0]} for ${row.gives}`}
            </span>
          </li>
        );
      })}
      {connection?.lastSeenAt !== undefined && (
        <li className="checklist-seen">Last heard {relativeTime(connection.lastSeenAt)}</li>
      )}
    </ul>
  );
}

/**
 * What a harness may do, said again (ADR 0046): every capability Chips draws something for, a
 * switch each, as a link offers them. A flip sends the whole list, keeping whatever else the
 * harness declared that is no switch here (its tools); the switches follow the directory read after.
 */
export function MayDoPart(props: {
  readonly harnessId: string;
  readonly capabilities: readonly string[] | undefined;
  readonly onDeclare: (harnessId: string, capabilities: readonly string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const capabilities = props.capabilities ?? [];
  const flip = async (name: string, on: boolean) => {
    const others = capabilities.filter((each) => each !== name);
    setBusy(true);
    setError(undefined);
    try {
      await props.onDeclare(props.harnessId, on ? [...others, name] : others);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hp-part" data-testid="may-do">
      <p className="hp-lede">
        Chips draws a control only for what a harness takes. One that is connected hears a change
        when it next connects.
      </p>
      {error !== undefined && (
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      )}
      <fieldset className="join-switches">
        {OFFERED.map((name) => (
          <CapabilityRow
            key={name}
            name={name}
            on={capabilities.includes(name)}
            disabled={busy}
            onChange={(on) => void flip(name, on)}
          />
        ))}
      </fieldset>
    </div>
  );
}

/**
 * What a harness holds, and the two things its owner can do about it. The list is asked for when
 * the page opens rather than with the harness's page: a workspace of twenty harnesses should not
 * make twenty requests to draw pages nobody has asked a question of yet.
 */
export function TokensPart(props: { readonly harnessId: string; readonly service: TokenService }) {
  const { harnessId, service } = props;
  const [tokens, setTokens] = useState<readonly HarnessToken[] | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedHarnessToken | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const land = useLands(tokens === undefined && error === undefined);

  const load = useCallback(async () => {
    try {
      setTokens(await service.list(harnessId));
      setError(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [harnessId, service]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (what: () => Promise<void>) => {
    setBusy(true);
    try {
      await what();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hp-part" data-testid="tokens">
      <p className="hp-lede">
        Chips keeps only a digest, so a token cannot be shown again. To rotate: issue a new one,
        point the harness at it, then revoke the old.
      </p>
      {/* What comes above the list opens to its size, so the list moves down rather than jumps. */}
      <Fold open={error !== undefined}>
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      </Fold>
      <Fold open={issued !== undefined}>
        <dl className="harness-new-facts hp-issued" data-testid="issued-token">
          <dt>New token, shown once</dt>
          <dd>
            <code>{issued?.token}</code>
          </dd>
        </dl>
      </Fold>
      {tokens === undefined && error === undefined && (
        // The list's place, held at a row's height while it is asked for, so nothing under it moves
        // when it comes: it lands where this stood (`useLands`).
        <section ref={land.blank} className="ctx wait" aria-busy="true" aria-label="Tokens">
          <ul className="ctx-group">
            <li className="ctx-row wait-row" data-testid="tokens-waiting">
              <span className="ctx-row-words">
                <i className="wait-bar wait-label" style={{ width: "30%" }} />
                <i className="wait-bar wait-sub" style={{ width: "58%" }} />
              </span>
            </li>
          </ul>
        </section>
      )}
      {tokens !== undefined && (
        <section ref={land.copy} className={land.lands ? "ctx lands" : "ctx"} aria-label="Tokens">
          <ul className="ctx-group hp-tokens">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="ctx-row hp-row"
                data-testid="token-row"
                data-revoked={token.revokedAt !== undefined}
              >
                <span className="ctx-row-words">
                  <span className="ctx-row-title">{token.name}</span>
                  <span className="ctx-row-line">{tokenLife(token)}</span>
                </span>
                {token.revokedAt === undefined && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(() => service.revoke(harnessId, token.id))}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
            {tokens.length === 0 && (
              <li className="ctx-row hp-row">
                <span className="ctx-row-line">None. This harness cannot connect.</span>
              </li>
            )}
          </ul>
        </section>
      )}
      <div className="hp-part-acts">
        <Button
          disabled={busy}
          data-testid="issue-token"
          onClick={() =>
            void act(async () => {
              setIssued(await service.issue(harnessId, "rotated"));
            })
          }
        >
          Issue a new token
        </Button>
      </div>
    </div>
  );
}

/** When a token was made and last used, or when it was revoked. */
function tokenLife(token: HarnessToken): string {
  if (token.revokedAt !== undefined) return `revoked ${relativeTime(token.revokedAt)}`;
  const used =
    token.lastUsedAt === undefined
      ? ", never used"
      : `, last used ${relativeTime(token.lastUsedAt)}`;
  return `made ${relativeTime(token.createdAt)}${used}`;
}
