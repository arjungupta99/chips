/**
 * Pairing, in a browser and in the desktop shell.
 *
 * In a browser the server is the one that served the page, so there is nothing to choose and
 * the screen is a code and a button, as it has been since M0.6. In the shell the page came from
 * the app, so the first question is *which server* — and the answer is usually already on the
 * network, advertising itself, which is why the list comes before the box you can type into.
 *
 * The code itself is the same either way: short-lived, single-use, and the only thing that
 * turns a key this device made into a key the server knows (ADR 0006).
 */

import {
  DEAD_INVITE,
  type Device,
  type InvitePeek,
  joinTitle,
  type Link,
  PairingError,
  pairDevice,
  passkeysSupported,
  roleMeansFor,
  type ServerReach,
  signInWithPasskey,
  waitForAllow,
} from "@chipschat/core";
import {
  APP_STORE_LINK,
  appPairingUrl,
  type InviteLink,
  inviteFromLink,
  MAC_DOWNLOAD,
  type PairingPayload,
  pairingFromLink,
  pairingFromUrl,
} from "@chipschat/protocol";
import { Button, ChipMark } from "@chipschat/ui";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { Desktop, FoundServer, UpAnswer } from "../native.ts";
import { browserDeviceName } from "./browserName.ts";
import { welcomedByInvite } from "./firstRun.ts";
import {
  appLinkForInvite,
  type InviteReach,
  joinBy,
  mayHaveTheApp,
  NOT_VALID,
  type Opened,
  openInvite,
  reachOf,
} from "./invite.ts";
import { type Way, WelcomeTop } from "./Welcome.tsx";

export interface PairProps {
  /** Paired, and for a space's link (ADR 0168) the space it brought them into, to open. */
  readonly onPaired: (device: Device, spaceId?: string) => void;
  /** Present in the desktop shell, where a server has to be found before it can be paired with. */
  readonly desktop?: Desktop | undefined;
  /** Why pairing is being asked for again, when it is not the first time. */
  readonly reason?: string | undefined;
  /** Pairing with another server while one is already in front (M5.3): the way back to it. */
  readonly onCancel?: (() => void) | undefined;
  readonly cancelLabel?: string | undefined;
  /**
   * Look around (ADR 0213): with it, a newcomer's page opens on the first screen, the film playing
   * before anything is asked for (ADR 0217's addendum of 26 October), and the ways in below it on
   * That's Chips' Set up my own Chips.
   */
  readonly onLookAround?: (() => void) | undefined;
  /** The way the page opens on: the demo's end card sends the person to one (ADR 0213). */
  readonly opensOn?: Way | undefined;
}

/** The first screen, as a page draws it, and which of its ways is open (ADR 0213, point 9). */
interface Top {
  readonly way: Way;
  readonly onWay: (way: Way) => void;
  readonly onLookAround: () => void;
}

/** Whether the ways in are drawn: always without the welcome's top, else on Set up my own Chips. */
function waysShown(top: Top | undefined): boolean {
  return top === undefined || top.way === "own";
}

/**
 * The welcome's top for this page, or none (ADR 0213, point 9): a newcomer's page, with nothing
 * being asked for again and no workspace to go back to, unless the demo sent them here on purpose.
 */
function useTop(props: PairProps): Top | undefined {
  const { onLookAround, reason, onCancel, opensOn } = props;
  const [way, setWay] = useState<Way>(opensOn ?? "welcome");
  if (onLookAround === undefined || reason !== undefined) return undefined;
  if (onCancel !== undefined && opensOn === undefined) return undefined;
  return { way, onWay: setWay, onLookAround };
}

/**
 * A pairing page's card with the welcome's top over its ways in, which are drawn on Set up my own
 * Chips and brought into view as they come; without the top, the ways in as they always were.
 */
function WelcomeCard(props: {
  readonly top: Top | undefined;
  readonly onPasted: (text: string) => ReactNode;
  /** The way back to a workspace, offered while the ways in are folded away. */
  readonly onCancel?: (() => void) | undefined;
  readonly cancelLabel?: string | undefined;
  readonly testId?: string | undefined;
  /** What comes up from the foot under the top while the ways in are folded: Chips on this Wi-Fi. */
  readonly folded?: ReactNode;
  readonly children: ReactNode;
}) {
  const { top } = props;
  const ways = useRef<HTMLDivElement>(null);
  const opened = top?.way === "own";
  useEffect(() => {
    if (opened) ways.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [opened]);
  return (
    <div
      className="pair"
      data-testid={props.testId}
      data-welcome={top === undefined ? undefined : "true"}
    >
      {top !== undefined && (
        <WelcomeTop
          way={top.way}
          onWay={top.onWay}
          onLookAround={top.onLookAround}
          onPasted={props.onPasted}
        />
      )}
      {waysShown(top) ? (
        <div className="pair-ways" ref={ways}>
          {props.children}
        </div>
      ) : (
        <>
          {props.folded}
          <Cancel onCancel={props.onCancel} cancelLabel={props.cancelLabel} />
        </>
      )}
    </div>
  );
}

/** Back to the workspace in front, when there is one. */
function Cancel(props: {
  readonly onCancel?: (() => void) | undefined;
  readonly cancelLabel?: string | undefined;
  readonly busy?: boolean;
}) {
  if (props.onCancel === undefined) return null;
  return (
    <Button
      variant="ghost"
      onClick={props.onCancel}
      disabled={props.busy}
      data-testid="pair-cancel"
    >
      {props.cancelLabel ?? "Back"}
    </Button>
  );
}

/** The welcome's top over a code page, unless a code is on its way or no key can be made here. */
function codeless(
  top: Top | undefined,
  payload: PairingPayload | undefined,
  keyless: boolean,
): Top | undefined {
  // A page that can make no key can make no demo either: its device signs with one.
  return payload === undefined && !keyless ? top : undefined;
}

/**
 * The pairing code from the address the QR carries. `chips serve` prints
 * `http://…/#pair=ABC-234`, and a link somebody sends might use a query instead; both are the
 * same code arriving the same way, so both are read. Since M4.1 the fragment may carry the
 * relay and the server's key beside the code (ADR 0038); `payloadFromUrl` reads all of it.
 */
export function codeFromUrl(url: { search: string; hash: string }): string {
  return pairingFromUrl(url)?.code ?? "";
}

/** The whole payload, when the address has one. */
export function payloadFromUrl(url: {
  readonly origin?: string | undefined;
  readonly search: string;
  readonly hash: string;
}): PairingPayload | undefined {
  return pairingFromUrl(url);
}

/**
 * How to reach the server beside its address, as a payload names it (ADR 0191): the key every
 * tunnel to it is a handshake against, and the relay to go through when its network is out of
 * reach. Nothing without a key, since a relay cannot be asked for a server without one.
 */
export function reachInPayload(payload: PairingPayload | undefined): ServerReach | undefined {
  if (payload?.key === undefined) return undefined;
  return {
    serverKey: payload.key,
    ...(payload.relay === undefined ? {} : { relayUrl: payload.relay }),
  };
}

/**
 * Where the server is, for a device paired by this payload: the network address the payload
 * names when it is not this page's own origin, else what the screen was given.
 */
export function serverUrlOf(
  payload: PairingPayload | undefined,
  given: string,
  origin: string | undefined,
): string {
  if (payload?.lan === undefined || payload.lan === origin) return given;
  return payload.lan;
}

/**
 * Whether this page can make a device key at all. WebCrypto is there only in a secure context —
 * HTTPS, or loopback — and a server's plain-HTTP address on a home network or a tailnet is
 * neither. The page says so before anyone types a code, rather than after.
 */
export function canMakeKeys(): boolean {
  return typeof crypto !== "undefined" && crypto.subtle !== undefined;
}

/**
 * The same offer as a link the Chips app opens, for a phone that scanned the QR with its camera
 * and landed here in Safari instead of in the app. Nothing without a code to carry.
 */
export function appLinkFor(
  payload: PairingPayload | undefined,
  serverUrl: string,
): string | undefined {
  if (payload === undefined) return undefined;
  const server = payload.lan ?? serverUrl;
  if (server === "") return undefined;
  return appPairingUrl(server, payload.code, { relay: payload.relay, key: payload.key });
}

/** Where this page would work: the same server, from the machine it runs on. */
function loopbackOf(where: { readonly protocol: string; readonly port: string }): string {
  const port = where.port === "" ? (where.protocol === "https:" ? "443" : "80") : where.port;
  return `http://127.0.0.1:${port}`;
}

export function Pair(props: PairProps) {
  const { onPaired, desktop, reason, onCancel, cancelLabel } = props;
  const [server, setServer] = useState<string | undefined>(desktop === undefined ? "" : undefined);
  const top = useTop(props);
  // A pairing link the app was opened with (`pnpm desktop`, or a page that could not pair): the
  // server and the code both, so there is nothing to find and nothing to type, as on the phone.
  const [offered, setOffered] = useState<PairingPayload | undefined>(undefined);
  useEffect(() => {
    if (desktop === undefined) return;
    let live = true;
    let stop: (() => void) | undefined;
    void desktop
      .onOpen((link) => {
        // An invite opened in the app (ADR 0164): the card for it, on the server it names.
        if (link.kind === "join") setInvite(link.invite);
        if (link.kind !== "pair") return;
        setOffered(link.payload);
        setServer(link.payload.lan);
      })
      .then((unlisten) => {
        if (live) stop = unlisten;
        else unlisten();
      });
    return () => {
      live = false;
      stop?.();
    };
  }, [desktop]);
  // A link somebody sent: `#invite=…` on the page's own address. The server it names is the one
  // that served the page, so there is nothing to choose (ADR 0034). In the app, a `chips://join`
  // link or one pasted in names its server itself (ADR 0164).
  const [invite, setInvite] = useState<InviteLink | undefined>(() =>
    typeof location === "undefined" || desktop !== undefined
      ? undefined
      : inviteFromLink(location.href),
  );
  // And one opened in a tab that is on this screen already: only the address's hash changes, so
  // the page is not loaded again, and the link would otherwise do nothing (found on the walk,
  // 14 October 2026: a person removed, given a new link, pasted it where the old tab was).
  useEffect(() => {
    if (typeof window === "undefined" || desktop !== undefined) return;
    const read = () => {
      const sent = inviteFromLink(location.href);
      if (sent !== undefined) setInvite(sent);
    };
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [desktop]);
  if (invite !== undefined) {
    return (
      <Join
        invite={invite}
        inShell={desktop !== undefined}
        onPaired={onPaired}
        onGiveUp={() => {
          setInvite(undefined);
          // "I have a pairing code instead": the ways in, open, not the welcome over them.
          top?.onWay("own");
          if (typeof history !== "undefined" && desktop === undefined) {
            history.replaceState(null, "", location.pathname);
          }
        }}
      />
    );
  }
  if (server === undefined && desktop !== undefined) {
    return (
      <ChooseServer
        desktop={desktop}
        onChoose={setServer}
        onInvite={setInvite}
        onPairLink={(payload) => {
          // A pairing link that reached this Mac but not the app (ADR 0210): the server and the
          // code both, with the relay and the key, so it pairs from wherever it is.
          setOffered(payload);
          setServer(payload.lan);
        }}
        onStarted={(answer) => {
          // Chips just started here (ADR 0173): its code, paired with at once, over loopback.
          const payload = pairingFromUrl(new URL(answer.pair_link));
          if (payload === undefined) return;
          setOffered({ ...payload, lan: answer.url });
          setServer(answer.url);
        }}
        top={top}
        {...(onCancel === undefined ? {} : { onCancel, cancelLabel })}
      />
    );
  }
  return (
    <EnterCode
      // A new link is a new screen, with its code in the box and on its way.
      key={offered?.code ?? ""}
      offered={offered}
      onPaired={onPaired}
      serverUrl={server ?? ""}
      onBack={() => setServer(undefined)}
      showBack={desktop !== undefined}
      // A server chosen in the shell has been chosen: its code is what is asked for now.
      top={desktop === undefined ? top : undefined}
      onInvite={setInvite}
      {...(reason === undefined ? {} : { reason })}
      {...(onCancel === undefined ? {} : { onCancel, cancelLabel })}
    />
  );
}

/**
 * An invite pasted in a browser (ADR 0213's Paste an invite link). The server it names is the
 * one that served this page, as a link opened here would be (ADR 0034), or another, which serves
 * its own: that one is a link to open, not a card here.
 */
export function pastedInBrowser(
  text: string,
  origin: string,
  onInvite: (invite: InviteLink) => void,
): ReactNode {
  const invite = inviteFromLink(text);
  if (invite === undefined) return "That isn't an invite link. It has #invite= in it.";
  if (invite.lan !== undefined && invite.lan !== origin) {
    const href =
      text
        .trim()
        .split(/\s+/)
        .find((word) => word.includes("invite=")) ?? "";
    const host = hostOf(invite.lan);
    return (
      <>
        That invite is for Chips at {host}.{" "}
        <a href={href} data-testid="welcome-invite-open">
          Open it there
        </a>
        .
      </>
    );
  }
  onInvite(invite);
  return null;
}

/**
 * An invite or a pairing link pasted in the Mac app, which names its server itself (ADR 0164,
 * ADR 0210): its card, or the pairing it carries.
 */
function pastedInShell(
  text: string,
  onInvite: (invite: InviteLink) => void,
  onPairLink: (payload: PairingPayload) => void,
): ReactNode {
  const sent = inviteFromLink(text);
  if (sent?.lan !== undefined) {
    onInvite(sent);
    return null;
  }
  const pairing = pairingFromLink(text);
  if (pairing?.lan !== undefined) {
    onPairLink(pairing);
    return null;
  }
  return "That isn't an invite link. It has #invite= in it.";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Joining by an invite: the link says who sent it, which workspace and which role before the
 * person has a name here; then a name, and the device that opened the link is paired for them. A
 * link that is no good says so, and what to do (JR-3).
 */
function Join(props: {
  readonly invite: InviteLink;
  /** In the Mac app, where the server is the one the link names rather than the page's. */
  readonly inShell: boolean;
  readonly onPaired: (device: Device, spaceId?: string) => void;
  readonly onGiveUp: () => void;
}) {
  const { invite: link, inShell } = props;
  // A plain-HTTP page away from loopback can make no key, so it can't join: said before a name is
  // typed, not after Join (the onboarding audit, item 3). The Mac app makes its keys its own way.
  const [keyless] = useState(() => !inShell && !canMakeKeys());
  const [opened, setOpened] = useState<Opened>({ kind: "asking" });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const reach = reachOf(link, inShell);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the link by its token, read once a page
  useEffect(() => {
    let live = true;
    void openInvite(link.token, reach).then((found) => {
      if (live) setOpened(found);
    });
    return () => {
      live = false;
    };
  }, [link.token]);

  // The one thing to do is type a name: the cursor is there as soon as the field is (JR-14).
  const ready = opened.kind === "ready";
  useEffect(() => {
    if (ready) field.current?.focus();
  }, [ready]);

  const failed = (problem: unknown) => {
    const message = problem instanceof PairingError ? problem.message : "Joining failed.";
    // Spent while the name was being typed: the link is no good now, and the card says so.
    if (message === NOT_VALID) setOpened({ kind: "dead" });
    else setError(message);
    setBusy(false);
    // A name somebody has is put right where it was typed (JR-1).
    field.current?.focus();
    field.current?.select();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (opened.kind !== "ready") return;
    setBusy(true);
    setError(undefined);
    try {
      const device = await joinHere(link.token, name, inShell, reach, opened.link, {
        inviter: opened.invite.invitedByName,
        place: opened.invite.spaceName ?? opened.invite.workspaceName,
      });
      welcomedByInvite(device.deviceId);
      // A space's link lands them in its room (ADR 0168).
      props.onPaired(device, opened.invite.spaceId);
    } catch (problem) {
      failed(problem);
    }
  };

  if (opened.kind === "dead") {
    return (
      <div className="pair" data-testid="join-dead">
        <ChipMark size={40} state="failed" />
        <h2>{DEAD_INVITE.title}</h2>
        <p>{DEAD_INVITE.body}</p>
        <div className="pair-actions">
          <Button variant="ghost" onClick={props.onGiveUp}>
            I have a pairing code instead
          </Button>
        </div>
      </div>
    );
  }

  const invite = opened.kind === "ready" ? opened.invite : undefined;
  return (
    <form className="pair" onSubmit={submit} data-testid="join">
      {!inShell && <AppOffer invite={link} />}
      <ChipMark size={40} />
      <h2>{invite === undefined ? "An invite" : joinTitle(invite)}</h2>
      {invite !== undefined && <Invited invite={invite} />}
      {keyless && <KeylessJoin />}
      {opened.kind === "trouble" && (
        <p className="pair-error" role="alert">
          {opened.message}
        </p>
      )}
      {error !== undefined && (
        <p className="pair-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={field}
        aria-label="Your name"
        className="pair-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        autoComplete="name"
        enterKeyHint="go"
        disabled={invite === undefined || keyless}
      />
      <div className="pair-actions">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy || keyless || invite === undefined || name.trim() === ""}
        >
          {busy ? "Joining…" : "Join"}
        </Button>
        <Button variant="ghost" onClick={props.onGiveUp} disabled={busy}>
          I have a pairing code instead
        </Button>
      </div>
    </form>
  );
}

/** Join by a link as this browser or the Mac app, and take the link out of the address. */
async function joinHere(
  token: string,
  name: string,
  inShell: boolean,
  reach: InviteReach,
  via: Link,
  about: Parameters<typeof joinBy>[5],
): Promise<Device> {
  const named = inShell ? "Chips for Mac" : browserDeviceName();
  const device = await joinBy(token, name, named, reach, via, about);
  if (typeof history !== "undefined" && !inShell) history.replaceState(null, "", location.pathname);
  return device;
}

/** Where to get Chips on this device: the App Store on an iPhone or iPad, the Mac download else. */
function getChips(agent: string): { readonly href: string; readonly words: string } {
  return /iPhone|iPad/.test(agent)
    ? { href: APP_STORE_LINK, words: "Get it on the App Store" }
    : { href: MAC_DOWNLOAD, words: "Get Chips for Mac" };
}

/**
 * Why this page can't join, and the ways that can (the onboarding audit, item 3): the Chips app,
 * or this server's own address on the machine that runs it.
 */
function KeylessJoin() {
  const here = loopbackOf(location);
  return (
    <p className="pair-error" data-testid="join-keyless">
      This page is plain HTTP at {location.host}, and a browser will not make a key on an address
      like that, so it can't join here. Open the invite in the Chips app instead, or on the machine
      that runs Chips, open <a href={here}>{here}</a>.
    </p>
  );
}

/**
 * The same invite handed to the Chips app, on a device that may have it: an iPhone, an iPad or a
 * Mac (ADR 0164). The page can't tell whether the app is there, so it asks, and says where to get
 * it (the onboarding audit, item 3).
 */
function AppOffer(props: { readonly invite: InviteLink }) {
  if (typeof navigator === "undefined" || !mayHaveTheApp(navigator.userAgent)) return null;
  const get = getChips(navigator.userAgent);
  return (
    <div className="pair-app" data-testid="join-in-app">
      <p>
        <b>Have the Chips app?</b> Open the invite there. No Chips yet?{" "}
        <a href={get.href} data-testid="join-get-chips">
          {get.words}
        </a>
        .
      </p>
      <a
        className="ui-button"
        data-variant="primary"
        data-size="sm"
        href={appLinkForInvite(props.invite, location.origin)}
        data-testid="join-app-link"
      >
        Open in Chips
      </a>
    </div>
  );
}

/** Who sent the link, where to and as what (JR-13); then, quieter, why there is no password. */
function Invited(props: { readonly invite: InvitePeek }) {
  const { invite } = props;
  const article = invite.role === "owner" || invite.role === "admin" ? "an" : "a";
  // A space's link names the space first (ADR 0168): "Bakery in Demo".
  const where =
    invite.spaceName === undefined
      ? invite.workspaceName
      : `${invite.spaceName} in ${invite.workspaceName}`;
  return (
    <>
      <p data-testid="join-role">
        {invite.invitedByName === undefined ? (
          <>You have been invited to {where} </>
        ) : (
          <>
            <b>{invite.invitedByName}</b> invited you to {where}{" "}
          </>
        )}
        as {article} <b>{invite.role}</b>.
      </p>
      {invite.spaceName !== undefined && (
        <p className="pair-note" data-testid="join-role-means">
          {roleMeansFor(invite.role, invite.spaceName)}
        </p>
      )}
      <p className="pair-note">
        Chips has no password: this browser makes a key it keeps to itself, and the invite tells the
        server whose key it is.
      </p>
    </>
  );
}

/**
 * Where a code comes from, under the box it is typed in: nothing said it, so somebody who ran
 * `chips up` in Terminal and then opened the Mac app had an empty box and no idea (the onboarding
 * audit, Part 2, item 13).
 */
export const CODE_FROM =
  "A code comes from a device already paired: You → Devices → Pair another device in Chips there, or chips pair --issue in Terminal on the computer Chips runs on.";

/** Where Chips answers on this Mac when it runs here: `chips up`'s own port. */
export const HERE = "http://127.0.0.1:4431";

/** Whether a Chips already answers on this Mac. One that does is never offered to be run again. */
export async function answersHere(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const answered = await fetcher(`${HERE}/v1/health`, { signal: AbortSignal.timeout(1500) });
    return answered.ok;
  } catch {
    return false;
  }
}

/** What the shell can do here: whether Chips answers on this Mac, and whether it could run it. */
interface Here {
  readonly answers: boolean;
  readonly canRun: boolean;
}

function ChooseServer(props: {
  readonly desktop: Desktop;
  readonly onChoose: (url: string) => void;
  /** An invite link pasted here, which names its server itself (ADR 0164). */
  readonly onInvite: (invite: InviteLink) => void;
  /** A pairing link pasted here, the relay's `/pair` page or the app's own (ADR 0210). */
  readonly onPairLink: (payload: PairingPayload) => void;
  /** Chips was started on this Mac from the app's own copy, and said this (ADR 0173). */
  readonly onStarted: (answer: UpAnswer) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly cancelLabel?: string | undefined;
  /** The welcome's top, for a Mac with no server yet (ADR 0213). */
  readonly top?: Top | undefined;
}) {
  const [found, setFound] = useState<readonly FoundServer[] | undefined>(undefined);
  const [here, setHere] = useState<Here | undefined>(undefined);
  const [typed, setTyped] = useState("");
  const [pasted, setPasted] = useState("");
  const [looking, setLooking] = useState(true);

  const look = () => {
    setLooking(true);
    void Promise.all([
      props.desktop.discover().catch(() => []),
      // Only a shell that could run Chips asks whether one already answers here.
      (props.desktop.canRunHere?.() ?? Promise.resolve(false)).then(async (canRun) => ({
        canRun,
        answers: canRun && (await answersHere()),
      })),
    ])
      .then(([servers, found]) => {
        setFound(servers);
        setHere(found);
      })
      .finally(() => setLooking(false));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: one look on arrival; the button is the way to look again
  useEffect(look, []);

  // Nothing here and nothing on the network: running Chips on this Mac is the question. With a
  // server to connect to, it is a quiet second choice.
  const offer = here?.canRun === true && !here.answers;
  const lead = offer && !looking && found?.length === 0;
  const cancel = <Cancel onCancel={props.onCancel} cancelLabel={props.cancelLabel} />;
  return (
    <WelcomeCard
      top={props.top}
      testId="choose-server"
      onPasted={(text) => pastedInShell(text, props.onInvite, props.onPairLink)}
      onCancel={props.onCancel}
      cancelLabel={props.cancelLabel}
      folded={
        found !== undefined && found.length > 0 ? (
          <OnThisWifi servers={found} onChoose={props.onChoose} />
        ) : undefined
      }
    >
      {lead ? <RunHere desktop={props.desktop} lead onStarted={props.onStarted} /> : <FindHead />}
      {looking && <p className="pair-looking">Looking…</p>}
      {found !== undefined && found.length === 0 && !looking && !lead && (
        <NoneAdvertised here={here?.answers === true} onUse={() => props.onChoose(HERE)} />
      )}
      {lead && <h3 className="pair-or">Or connect to Chips on another computer</h3>}
      <ul className="pair-servers">
        {found?.map((server) => (
          <li key={server.url}>
            <Button variant="ghost" onClick={() => props.onChoose(server.url)}>
              {server.name}
              <span className="pair-server-url">{server.url}</span>
            </Button>
          </li>
        ))}
      </ul>
      <label className="pair-address">
        Or an address
        <input
          type="url"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="http://mini.local:4431"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="pair-address">
        Or a link somebody sent you
        <input
          type="url"
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value);
            const sent = inviteFromLink(event.target.value);
            if (sent?.lan !== undefined) return props.onInvite(sent);
            const pairing = pairingFromLink(event.target.value);
            if (pairing?.lan !== undefined) props.onPairLink(pairing);
          }}
          placeholder="An invite, or a link from Pair a computer"
          autoComplete="off"
          spellCheck={false}
          data-testid="pair-invite-link"
        />
      </label>
      <div className="pair-actions">
        <Button onClick={() => props.onChoose(typed.trim())} disabled={typed.trim() === ""}>
          Use this address
        </Button>
        <Button variant="ghost" onClick={look} disabled={looking}>
          Look again
        </Button>
        {cancel}
      </div>
      {offer && !lead && !looking && (
        <RunHere desktop={props.desktop} lead={false} onStarted={props.onStarted} />
      )}
    </WelcomeCard>
  );
}

/**
 * Chips found on this Wi-Fi (ADR 0172, ADR 0213), under the welcome's top while the ways in are
 * folded: it slides up from the foot once something answers, and a press connects to it, as the
 * same server's row among the ways in does.
 */
function OnThisWifi(props: {
  readonly servers: readonly FoundServer[];
  readonly onChoose: (url: string) => void;
}) {
  return (
    <section className="pair-wifi" aria-label="On this Wi-Fi" data-testid="pair-wifi">
      <h3 className="pair-wifi-h">On this Wi-Fi</h3>
      <ul className="pair-servers">
        {props.servers.map((server) => (
          <li key={server.url}>
            <Button variant="ghost" onClick={() => props.onChoose(server.url)}>
              {server.name}
              <span className="pair-server-url">{server.url}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Nothing on the network says it is Chips. One that answers on this Mac all the same, for this Mac
 * alone, is offered, with where its code comes from; else how to start one.
 */
function NoneAdvertised(props: { readonly here: boolean; readonly onUse: () => void }) {
  if (!props.here) {
    return (
      <p className="pair-error">
        Nothing is advertising itself here. Start one with <code>chips up</code>, or type its
        address.
      </p>
    );
  }
  return (
    <>
      <p data-testid="pair-runs-here">
        Chips is running on this Mac. To use it, pair with a code from{" "}
        <code>chips pair --issue</code> in Terminal.
      </p>
      <div className="pair-actions">
        <Button variant="primary" onClick={props.onUse} data-testid="pair-use-here">
          Use Chips on this Mac
        </Button>
      </div>
    </>
  );
}

function FindHead() {
  return (
    <>
      <ChipMark size={40} />
      <h2>Find your server</h2>
      <p>
        Chips is looking for one on this network. If it is somewhere else — a different network, or
        through a tunnel — type the address instead.
      </p>
    </>
  );
}

/** What `chips up` says for a Mac with no home network to be reached on. */
const NO_HOME_NETWORK = /--reach local/;

/**
 * "Run Chips on this Mac?" (ADR 0173): the app's own copy of Chips, started by `chips up` as a
 * login service your phone on this Wi-Fi can reach; on a Mac with no home network, this Mac
 * alone. Then the code it printed is paired with, and the welcome follows.
 */
function RunHere(props: {
  readonly desktop: Desktop;
  readonly lead: boolean;
  readonly onStarted: (answer: UpAnswer) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const start = async () => {
    const run = props.desktop.runHere;
    if (run === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const answer = await run("lan").catch((first: unknown) => {
        if (NO_HOME_NETWORK.test(String(first))) return run("local");
        throw first;
      });
      props.onStarted(answer);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };
  const button = (
    <Button
      variant={props.lead ? "primary" : "ghost"}
      size={props.lead ? "lg" : "md"}
      onClick={() => void start()}
      disabled={busy}
      data-testid="run-here"
    >
      {busy ? "Starting Chips…" : props.lead ? "Run Chips here" : "Run Chips on this Mac instead"}
    </Button>
  );
  const said =
    error === undefined ? null : (
      <p className="pair-error" role="alert" data-testid="run-here-error">
        {error}
      </p>
    );
  if (!props.lead) {
    return (
      <div className="pair-actions">
        {button}
        {said}
      </div>
    );
  }
  return (
    <section className="pair-here" data-testid="run-here-offer">
      <ChipMark size={40} {...(busy ? { state: "working" as const } : {})} />
      <h2>Run Chips on this Mac?</h2>
      <p>
        Your agents and your phone connect to it here. It starts when you log in, and{" "}
        <code>~/.local/bin/chips down</code> in Terminal stops it.
      </p>
      {said}
      <div className="pair-actions">{button}</div>
    </section>
  );
}

/**
 * What a page that cannot make a key says, before anyone types: where this would work, and the
 * same code as a link the phone's app opens.
 */
function Keyless({
  keyless,
  payload,
  serverUrl,
}: {
  readonly keyless: boolean;
  readonly payload: PairingPayload | undefined;
  readonly serverUrl: string;
}) {
  if (!keyless) return null;
  const appLink = appLinkFor(payload, serverUrl === "" ? location.origin : serverUrl);
  const here = loopbackOf(location);
  return (
    <p className="pair-error" data-testid="pair-keyless">
      This page is plain HTTP at {location.host}, and a browser will not make a key on an address
      like that. On the machine that runs the server, open <a href={here}>{here}</a> instead. On a
      phone, use the Chips app
      {appLink === undefined ? (
        "."
      ) : (
        <>
          :{" "}
          <a href={appLink} data-testid="pair-app-link">
            open this code in it
          </a>
          .
        </>
      )}
    </p>
  );
}

function EnterCode(props: {
  readonly onPaired: (device: Device) => void;
  readonly serverUrl: string;
  /** A pairing link the app was opened with, which pairs as soon as the screen is up. */
  readonly offered?: PairingPayload | undefined;
  readonly onBack: () => void;
  readonly showBack: boolean;
  readonly reason?: string;
  readonly onCancel?: (() => void) | undefined;
  readonly cancelLabel?: string | undefined;
  /** The welcome's top, for a newcomer (ADR 0213). */
  readonly top?: Top | undefined;
  /** An invite pasted under it, for this page's server. */
  readonly onInvite: (invite: InviteLink) => void;
}) {
  const [payload] = useState(() => props.offered ?? payloadFromUrl(location));
  const [code, setCode] = useState(() => payload?.code ?? "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // A browser names itself by what it is and where, so You can tell it from the others (ADR 0085).
  const deviceName = props.serverUrl === "" ? browserDeviceName() : "Chips for Mac";
  // The QR's payload (M4.1): the server's network address when it is not this page's, and the
  // relay to reach it through from anywhere.
  const serverUrl = serverUrlOf(payload, props.serverUrl, location.origin);
  const reach = reachInPayload(payload);
  // A plain-HTTP page away from loopback cannot make a key, and no code will change that.
  const [keyless] = useState(() => !canMakeKeys());
  const top = codeless(props.top, payload, keyless);

  const pairWith = async (typed: string) => {
    setBusy(true);
    setError(undefined);
    // A code that asks waits for whoever made it, showing its six digits (ADR 0232).
    const wait = waitForAllow("pairing");
    try {
      props.onPaired(await pairDevice(typed, deviceName, serverUrl, reach, undefined, wait));
    } catch (problem) {
      setError(problem instanceof PairingError ? problem.message : "Pairing failed.");
      setBusy(false);
    } finally {
      wait.done();
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void pairWith(code);
  };

  // A link's code goes at once, and only once: a code is single-use, so a second try with it
  // would only say it is not valid. That is the desktop app's link, and the address `chips up`
  // opens this page at (ADR 0121), whose fragment is taken out of the address and the history as
  // it is read, so a back button never shows it again.
  const sent = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival; a new link is a new screen
  useEffect(() => {
    if (payload === undefined || keyless || sent.current) return;
    sent.current = true;
    if (props.offered === undefined && typeof history !== "undefined") {
      history.replaceState(null, "", location.pathname + location.search);
    }
    void pairWith(payload.code);
  }, []);

  // A passkey made on another device pairs this one without a code (ADR 0034).
  const withPasskey = async () => {
    setBusy(true);
    setError(undefined);
    try {
      props.onPaired(await signInWithPasskey(deviceName, props.serverUrl));
    } catch (problem) {
      setError(problem instanceof PairingError ? problem.message : "That passkey did not work.");
      setBusy(false);
    }
  };

  return (
    <WelcomeCard
      top={top}
      onPasted={(text) => pastedInBrowser(text, location.origin, props.onInvite)}
      onCancel={props.onCancel}
      cancelLabel={props.cancelLabel}
    >
      <form className="pair-ways-in" onSubmit={submit}>
        <ChipMark size={40} />
        <h2>{serverUrl === "" ? "Pair this browser" : "Pair with your server"}</h2>
        {props.reason !== undefined && <p className="pair-error">{props.reason}</p>}
        <p>
          Chips has no password. This device makes a key it keeps to itself, and the code below is
          what tells the server whose key it is.
          {serverUrl !== "" && (
            <>
              {" "}
              <span className="pair-server-url">{serverUrl}</span>
            </>
          )}
          {reach?.relayUrl !== undefined && (
            <>
              {" "}
              <span className="pair-server-url" data-testid="pair-relay">
                Through {new URL(reach.relayUrl).host} when that network is out of reach.
              </span>
            </>
          )}
        </p>
        <Keyless keyless={keyless} payload={payload} serverUrl={serverUrl} />
        <p className="pair-note" data-testid="pair-where-a-code">
          {CODE_FROM}
        </p>
        <input
          aria-label="Pairing code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="ABC-234"
          autoComplete="off"
          spellCheck={false}
        />
        {error !== undefined && <p className="pair-error">{error}</p>}
        <div className="pair-actions">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={busy || keyless || code.trim().length < 6}
          >
            {busy ? "Pairing…" : "Pair"}
          </Button>
          {passkeysSupported() && (
            <Button
              variant="ghost"
              onClick={() => void withPasskey()}
              disabled={busy}
              data-testid="sign-in-passkey"
            >
              Sign in with a passkey
            </Button>
          )}
          {props.showBack && (
            <Button variant="ghost" onClick={props.onBack} disabled={busy}>
              A different server
            </Button>
          )}
          <Cancel onCancel={props.onCancel} cancelLabel={props.cancelLabel} busy={busy} />
        </div>
      </form>
    </WelcomeCard>
  );
}
