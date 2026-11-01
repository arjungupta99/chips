/**
 * The parts You's People and Invite someone cards are drawn from on the web and the Mac (ADR 0209),
 * in the phone's words, which are core's: a role as a tag in its own colour; a few faces
 * overlapping; the filters with the ink sliding to the one picked; what a person can and can't do,
 * a tick or a cross a line; a link's time left as a ring that draws itself in; who and what a
 * link's newcomer will see, the faces growing in and folding away as the choices change; the link
 * made, with its QR; and the card the link opens to. A room's sheet makes its link from the last
 * three too, as the phone's sheet shares its form. Flat, every one: the motion is where the life
 * is, and all of it is CSS, which `prefers-reduced-motion` stills.
 */

import {
  type CanDo,
  type Directory,
  faceKind,
  faceOf,
  INVITE_ASKS_WORDS,
  INVITE_TURN_ON_RELAY,
  type IssuedInvite,
  invitedWords,
  inviteOpensAnywhere,
  inviteRelayOffWords,
  inviteSees,
  inviteSeesWords,
  joinFacts,
  joinTitle,
  linkUsedWords,
  nameOf,
  ROLE_WORDS,
  roleMeansFor,
  type WorkspaceModel,
  type WorkspaceRole,
} from "@chipschat/core";
import { Avatar, type AvatarSize, Button } from "@chipschat/ui";
import QRCode from "qrcode";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { untilWords } from "../time.ts";
import { useOpenRelay } from "./openRelay.ts";

/** A person's role, as a small tag in the role's own soft colour. */
export function RoleTag(props: { readonly role: WorkspaceRole }) {
  return (
    <span className={`you-tag you-role-tag you-role-${props.role}`} data-testid="role-tag">
      {ROLE_WORDS[props.role]}
    </span>
  );
}

/** A participant's face, as every list draws it: a person's circle, an agent's outline. */
export function Face(props: {
  readonly directory: Directory;
  readonly id: string;
  readonly size?: AvatarSize;
}) {
  const icon = faceOf(props.directory, props.id);
  return (
    <Avatar
      name={nameOf(props.directory, props.id)}
      kind={faceKind(props.directory, props.id)}
      size={props.size ?? "xs"}
      {...(icon === undefined ? {} : { icon })}
    />
  );
}

/** A few faces overlapping, popping in one after another, and how many more. */
export function FaceStack(props: {
  readonly directory: Directory;
  readonly ids: readonly string[];
  readonly most?: number;
}) {
  const most = props.most ?? 4;
  const shown = props.ids.length > most ? props.ids.slice(0, most - 1) : props.ids;
  const more = props.ids.length - shown.length;
  return (
    <span className="face-stack" aria-hidden="true">
      {shown.map((id, index) => (
        <span key={id} className="face-stack-one" style={{ "--i": index } as CSSProperties}>
          <Face directory={props.directory} id={id} />
        </span>
      ))}
      {more > 0 && <span className="face-stack-more">+{more}</span>}
    </span>
  );
}

/**
 * Filters in a row, each with how many, the ink sliding to the one picked: a tab list, so the
 * arrow keys move along it as anywhere.
 */
export function FilterChips<K extends string>(props: {
  readonly label: string;
  readonly chips: readonly { readonly key: K; readonly label: string; readonly count: number }[];
  readonly chosen: K;
  readonly onChoose: (key: K) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; width: number } | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the chips' widths follow their counts.
  useLayoutEffect(() => {
    const on = row.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (on !== null && on !== undefined) setThumb({ x: on.offsetLeft, width: on.offsetWidth });
  }, [props.chosen, props.chips]);
  return (
    <div className="people-filters" role="tablist" aria-label={props.label} ref={row}>
      {thumb !== undefined && (
        <span
          className="people-filters-ink"
          style={{ width: thumb.width, transform: `translateX(${thumb.x}px)` }}
          aria-hidden="true"
        />
      )}
      {props.chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          role="tab"
          aria-selected={chip.key === props.chosen}
          className="people-filter"
          data-testid={`filter-${chip.key}`}
          onClick={() => props.onChoose(chip.key)}
        >
          {chip.label} <span className="people-filter-n">{chip.count}</span>
        </button>
      ))}
    </div>
  );
}

/** What a person can and can't do: a tick or a cross a line, and the faces each is about. */
export function CanList(props: {
  readonly lines: readonly CanDo[];
  readonly directory: Directory;
  readonly label: string;
}) {
  return (
    <ul className="can-list" aria-label={props.label}>
      {props.lines.map((line, index) => (
        <li
          key={line.words}
          className={line.can ? "can-yes" : "can-no"}
          style={{ "--i": index } as CSSProperties}
        >
          <span className="can-mark" aria-hidden="true">
            {line.can ? "✓" : "✕"}
          </span>
          <span className="can-words">
            <span className="ui-visually-hidden">{line.can ? "Can: " : ""}</span>
            {line.words}
          </span>
          {line.faces !== undefined && line.faces.length > 0 && (
            <FaceStack directory={props.directory} ids={line.faces} />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * How much of a link's time is left, as a ring: full as it is made, empty as it runs out, amber
 * near its end (`linkEnding`). It draws itself in from empty, and a dashed ghost of a face sits inside: the
 * person the link waits for.
 */
export function LifeRing(props: { readonly left: number; readonly ending: boolean }) {
  const radius = 13;
  const round = 2 * Math.PI * radius;
  const target = round * (1 - Math.max(0.03, Math.min(1, props.left)));
  return (
    <svg
      className={props.ending ? "life-ring life-ending" : "life-ring"}
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden="true"
      style={{ "--round": round, "--left": target } as CSSProperties}
    >
      <circle className="life-track" cx="16" cy="16" r={radius} />
      <circle className="life-left" cx="16" cy="16" r={radius} transform="rotate(-90 16 16)" />
      <circle className="life-ghost" cx="16" cy="16" r="8.5" />
    </svg>
  );
}

/**
 * A face for each of `all`, grown where it is in `shown` and folded away where it is not, so a
 * line changes in place as the choices change. Nothing shown says `none`.
 */
export function FacesShown(props: {
  readonly all: readonly string[];
  readonly shown: readonly string[];
  readonly face: (id: string) => ReactNode;
  readonly none: string;
  readonly testId: string;
}) {
  const count = props.all.filter((id) => props.shown.includes(id)).length;
  return (
    <span className="faces-shown" data-testid={props.testId}>
      {props.all.map((id, index) => {
        const on = props.shown.includes(id);
        return (
          <span
            key={id}
            className={on ? "faces-shown-one is-on" : "faces-shown-one"}
            style={{ "--i": index } as CSSProperties}
            aria-hidden={!on}
          >
            {props.face(id)}
          </span>
        );
      })}
      {count === 0 && <span className="faces-shown-none">{props.none}</span>}
    </span>
  );
}

/** The card a link opens to, in the join card's words: what the maker is about to send. */
export function JoinPreview(props: {
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  readonly role: WorkspaceRole;
  readonly spaceName: string | undefined;
}) {
  const said = {
    workspaceName: props.workspace,
    role: props.role,
    invitedByName: nameOf(props.directory, props.selfId),
    spaceName: props.spaceName,
  };
  return (
    <section className="join-preview" data-testid="join-preview" aria-label="When they open it">
      <Face directory={props.directory} id={props.selfId} size="lg" />
      <h4>{joinTitle(said)}</h4>
      <p>{invitedWords(said)}</p>
      <p className="join-preview-means">{roleMeansFor(props.role, props.spaceName)}</p>
      <ul>
        {joinFacts(said).map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Who and what a link's newcomer will see: everybody's faces, those they'd see grown and the rest
 * folded away, so the line changes in place as the role and the room change; and core's sentence.
 */
export function InviteSeesView(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly workspace: string;
  readonly role: WorkspaceRole;
  readonly spaceId: string | undefined;
  readonly room: string | undefined;
}) {
  const { model, directory } = props;
  const seen = inviteSees(model, directory, props.role, props.spaceId);
  const everybody = inviteSees(model, directory, "owner");
  const names = (ids: readonly string[]) => ids.map((id) => nameOf(directory, id));
  const face = (id: string) => <Face directory={directory} id={id} size="sm" />;
  return (
    <section className="invite-sees" aria-label="What they'll see" data-testid="invite-sees">
      <h4>What they'll see</h4>
      <div className="sees-line">
        <span>People</span>
        <FacesShown
          all={[...new Set([...everybody.people, ...seen.people])]}
          shown={seen.people}
          face={face}
          none="Nobody yet"
          testId="sees-people"
        />
      </div>
      <div className="sees-line">
        <span>Agents</span>
        <FacesShown
          all={[...new Set([...everybody.agents, ...seen.agents])]}
          shown={seen.agents}
          face={face}
          none="None yet"
          testId="sees-agents"
        />
      </div>
      <p data-testid="invite-role-means">
        {inviteSeesWords({
          role: props.role,
          workspace: props.workspace,
          space: props.room,
          people: names(seen.people),
          agents: names(seen.agents),
        })}
      </p>
    </section>
  );
}

/**
 * The link just made, shown once: its QR for a phone beside you, the link with Copy, Withdraw for
 * one made by mistake, where it opens, and the card it opens to, rising in after it. A link made
 * once that somebody has joined by shows as used, with nothing left to copy or withdraw.
 */
export function IssuedInviteView(props: {
  readonly issued: IssuedInvite;
  readonly busy: boolean;
  /** The workspace as this device holds it: who has joined by the link. */
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  /** The room it brings them into, as it is called here. */
  readonly room: string | undefined;
  readonly onWithdraw: () => void;
  /** An owner, who is offered the relay when the link opens only at home. */
  readonly owner?: boolean | undefined;
}) {
  const { issued } = props;
  const used = linkUsedWords(props.model, props.directory, issued);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    QRCode.toString(issued.url, { type: "svg", margin: 1 }).then(
      (svg) => {
        if (live) setQr(svg);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [issued.url]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div
      className={used === undefined ? "invite-issued" : "invite-issued is-used"}
      data-testid="issued-invite"
    >
      <div className="invite-issued-link">
        {qr !== undefined && used === undefined && (
          <img
            className="pair-qr invite-qr"
            alt={`A QR code that opens ${issued.url}`}
            src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`}
            data-testid="invite-qr"
          />
        )}
        <dl className="harness-new-facts you-issued">
          {used === undefined ? (
            <>
              <dt>Link, shown once: only you have it</dt>
              <dd>
                <code data-testid="invite-url">{issued.url}</code>{" "}
                <Button size="sm" variant="ghost" onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onWithdraw}>
                  Withdraw
                </Button>
              </dd>
            </>
          ) : (
            <>
              <dt data-testid="invite-used">{used}</dt>
              <dd>
                <code data-testid="invite-url">{issued.url}</code>
              </dd>
            </>
          )}
          <dt>Joins as</dt>
          <dd>
            {ROLE_WORDS[issued.role]}
            {props.room === undefined ? "" : ` in ${props.room}`},{" "}
            {issued.singleUse ? "once" : "by several"}, {untilWords(issued.expiresAt)}
          </dd>
        </dl>
      </div>
      {used === undefined && <WhereItOpens url={issued.url} owner={props.owner === true} />}
      <JoinPreview
        directory={props.directory}
        selfId={props.selfId}
        workspace={props.workspace}
        role={issued.role}
        spaceName={props.room}
      />
    </div>
  );
}

/**
 * Under a link, where it opens. One that isn't the relay's opens only where the server's own
 * address does: the relay is off, or was never turned on (ADR 0245), and the link says so, whatever
 * the switch says, with the relay offered to an owner. The relay's asks (ADR 0232): whoever opens
 * it waits for the maker's Allow, and the maker is told where that comes up.
 */
function WhereItOpens(props: { readonly url: string; readonly owner: boolean }) {
  const openRelay = useOpenRelay();
  if (inviteOpensAnywhere(props.url)) {
    return (
      <p className="you-card-note" data-testid="invite-asks">
        {INVITE_ASKS_WORDS}
      </p>
    );
  }
  return (
    <>
      <p className="you-card-note" data-testid="invite-relay-off">
        {inviteRelayOffWords(props.url)}
      </p>
      {props.owner && openRelay !== undefined && (
        <Button size="sm" onClick={openRelay} data-testid="invite-turn-on-relay">
          {INVITE_TURN_ON_RELAY}
        </Button>
      )}
    </>
  );
}
