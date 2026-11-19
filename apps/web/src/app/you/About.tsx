/**
 * About Chips on the Mac and the web (ADR 0295), as the phone and the iPad have it: a row under Send
 * feedback with the chip for its mark and the version as its value, and the page it opens beside
 * the list. The page opens on the chip, whose pins go round once as it comes in and again when it
 * is clicked; then the name, the build in a capsule that copies a line for a bug report, and one
 * sentence on what Chips is. Then Updates (ADR 0296): on the Mac, Chips for Mac and its version;
 * the computer and the Chips it runs; and where a newer version waits, its Install or Update
 * button, which the update dot flies into when it was clicked and which glows while it shows
 * (ADR 0296, addendum of 17 November 2026). What waits for the
 * computer when it is behind this app is said under them. Then the Update dot switch; what the
 * release changed; the links; the licence and the open-source code Chips is built on; and who
 * made it. What's new, Licence and Acknowledgements open in its place,
 * with ‹ About, as a person opens from People.
 */

import {
  ABOUT_LINK_ROWS,
  ABOUT_LINKS,
  ABOUT_ROW,
  aboutBlurb,
  BUILD_COPIED,
  bugReportLine,
  buildCapsule,
  CHIPS_HEADING,
  COMPUTER_UNREACHED,
  type ComputerFacts,
  computerBehind,
  computerLine,
  computerRow,
  DOT_SWITCH,
  dotFoot,
  INSTALL_BUTTON,
  LEGAL_HEADING,
  LICENCE_WORDS,
  MAC_DOWNLOAD,
  MADE_BY,
  type MacUpdate,
  macUpdateLine,
  macUpdatesItself,
  NAMED_FOR,
  NEEDS_UPDATE_FOOT,
  NEEDS_UPDATE_HEADING,
  type NeedsUpdateRow,
  NIGHT_SWITCH,
  NOTICE_NO_TEXT,
  NOTICES_TITLE,
  nightFoot,
  noticeLicence,
  noticesLead,
  type PackageNotice,
  RELEASES,
  RESTART_NOW,
  releaseDay,
  releaseOf,
  SELF_UPDATE_COMMAND,
  type SelfUpdateFacts,
  UPDATE_BUTTON,
  UPDATE_NOW_HEADING,
  UPDATES_HEADING,
  type UpdateWaiting,
  updateNowNote,
  whatsNewRow,
} from "@chipschat/core";
import { ChipMark, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CopyBox } from "../ConnectBridge.tsx";
import { useMissWithoutButton } from "../flight.tsx";
import { NeedsDot, UpdateButton, useUpdates } from "../updates.tsx";
import { Switch } from "./controls.tsx";
import { Group, HUES, ListRow, RowMark } from "./list.tsx";

/** What About asks of the shell. */
export interface AboutService {
  /** The computer as `GET /v1/server` names it. */
  readonly computer: () => Promise<ComputerFacts>;
  /** Open a link outside Chips: a new tab, or on the Mac the browser. */
  readonly openLink: (url: string) => void;
  /** Asks from outside to open About, as the Mac's About Chips: a count, 0 for none. */
  readonly reveal?: number | undefined;
  /** A harness's own page, which a bridge's row in Needs update opens (ADR 0297). */
  readonly openHarness?: ((harnessId: string) => void) | undefined;
}

/** The pages a level under About. */
export type AboutSub = "whats-new" | "licence" | "notices";

/** This build: the version and the commit `vite.config.ts` wrote in. */
const VERSION = __CHIPS_VERSION__;
const COMMIT = __CHIPS_COMMIT__;

/**
 * About Chips's row, under Send feedback, with a small gold dot on the chip while something waits
 * that asks somebody: not Chips for Mac getting its update itself, nor the computer that comes
 * with it (ADR 0298). The rule is core's, so the phone's row says the same.
 */
export function AboutRow(props: { readonly chosen: boolean; readonly onOpen: () => void }) {
  const { rowLit: lit } = useUpdates();
  return (
    <ListRow
      label={ABOUT_ROW}
      value={VERSION}
      ariaLabel={lit ? `${ABOUT_ROW} ${VERSION}, an update waits` : undefined}
      mark={
        <span className="you-mark about-row-mark" aria-hidden="true">
          <ChipMark size={24} />
          {lit && <span className="about-row-dot" data-testid="about-row-dot" />}
        </span>
      }
      onOpen={props.onOpen}
      selected={props.chosen}
      testId="about-row"
    />
  );
}

/** The computer, read each time the page opens. */
type Computer =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly facts: ComputerFacts }
  | { readonly kind: "unreached" };

function useComputer(read: () => Promise<ComputerFacts>): Computer {
  const [computer, setComputer] = useState<Computer>({ kind: "reading" });
  useEffect(() => {
    let live = true;
    read().then(
      (facts) => {
        if (live)
          setComputer({ kind: "read", facts: { machine: facts.machine, version: facts.version } });
      },
      () => {
        if (live) setComputer({ kind: "unreached" });
      },
    );
    return () => {
      live = false;
    };
  }, [read]);
  return computer;
}

export function AboutPage(props: {
  readonly service: AboutService;
  readonly desktop: boolean;
  readonly sub: AboutSub | undefined;
  readonly onSub: (sub: AboutSub) => void;
}) {
  const { service, desktop } = props;
  const computer = useComputer(service.computer);
  const facts = computer.kind === "read" ? computer.facts : undefined;
  const here = desktop ? "this Mac" : "this browser";
  const release = releaseOf(VERSION);
  const open = (url: string) => () => service.openLink(url);
  // Opening About puts the update dot out for what it named, and reads what waits again.
  const { opened } = useUpdates();
  const openedNow = useRef(opened);
  useEffect(() => openedNow.current(), []);
  return (
    <div className="you-page about" data-testid="about-page">
      <Top facts={facts} desktop={desktop} here={here} />
      <Updates computer={computer} desktop={desktop} openLink={service.openLink} />
      <NeedsUpdate openHarness={service.openHarness} />
      <DotSwitch desktop={desktop} />
      {release !== undefined && (
        <Group label={whatsNewRow(release.version)} testId="about-whats-new">
          <ListRow
            label={whatsNewRow(release.version)}
            sub={release.line}
            mark={<RowMark icon="sparkle" tint={HUES.violet} />}
            onOpen={() => props.onSub("whats-new")}
            selected={props.sub === "whats-new"}
            testId="about-whats-new-row"
          />
        </Group>
      )}
      <Group heading={CHIPS_HEADING} label={CHIPS_HEADING} testId="about-links">
        <ListRow
          label={ABOUT_LINK_ROWS.website.label}
          value={ABOUT_LINK_ROWS.website.value}
          mark={<RowMark icon="globe" tint={HUES.blue} />}
          onOpen={open(ABOUT_LINKS.website)}
          testId="about-website"
        />
        <ListRow
          label={ABOUT_LINK_ROWS.docs.label}
          mark={<RowMark icon="list" tint={HUES.green} />}
          onOpen={open(ABOUT_LINKS.docs)}
          testId="about-docs"
        />
        <ListRow
          label={ABOUT_LINK_ROWS.support.label}
          mark={<RowMark icon="mail" tint={HUES.leaf} />}
          onOpen={open(ABOUT_LINKS.support)}
          testId="about-support"
        />
      </Group>
      <Group heading={LEGAL_HEADING} label={LEGAL_HEADING} testId="about-legal">
        <ListRow
          label={ABOUT_LINK_ROWS.privacy.label}
          mark={<RowMark icon="lock" tint="#5b6b7d" />}
          onOpen={open(ABOUT_LINKS.privacy)}
          testId="about-privacy"
        />
        <ListRow
          label={ABOUT_LINK_ROWS.licence.label}
          sub={ABOUT_LINK_ROWS.licence.sub}
          mark={<RowMark icon="doc" tint={HUES.clay} />}
          onOpen={() => props.onSub("licence")}
          selected={props.sub === "licence"}
          testId="about-licence"
        />
        <ListRow
          label={ABOUT_LINK_ROWS.notices.label}
          sub={ABOUT_LINK_ROWS.notices.sub}
          mark={<RowMark icon="heart" tint={HUES.pink} />}
          onOpen={() => props.onSub("notices")}
          selected={props.sub === "notices"}
          testId="about-notices"
        />
      </Group>
      <p className="about-made" data-testid="about-made">
        {MADE_BY}
        <br />
        {NAMED_FOR}
      </p>
    </div>
  );
}

/**
 * This app on the Mac, and the computer: the version each runs, and where a newer one waits, the
 * version and its button (ADR 0296). The download for Chips for Mac; the steps for the computer,
 * which only its owner is offered. A browser has no version of its own: the computer serves it.
 * The foot says what waits for the computer when it is behind this app (ADR 0295).
 */
function Updates(props: {
  readonly computer: Computer;
  readonly desktop: boolean;
  readonly openLink: (url: string) => void;
}) {
  const { computer, desktop, openLink } = props;
  const { waiting, asking, selfUpdate, setNightly, macUpdate, restartNow } = useUpdates();
  const [showNow, setShowNow] = useState(false);
  const machine = computer.kind === "read" ? computer.facts.machine : "Your computer";
  const behind =
    computer.kind === "read"
      ? computerBehind(VERSION, computer.facts, desktop ? "This Mac" : "This browser")
      : undefined;
  // A computer from the install line updates itself at night, with its owner's word (ADR 0297).
  const nightly = selfUpdate?.available === true ? selfUpdate : undefined;
  const foot = updatesFoot(nightly, machine, behind);
  const target = waiting.computer;
  const appButton = desktop ? appButtonOf(waiting.app, macUpdate) : undefined;
  // The dot flies into the first button; with none to show, it goes out where it is.
  useMissWithoutButton(appButton !== undefined || asking.computer !== undefined);
  return (
    <>
      <Group heading={UPDATES_HEADING} label={UPDATES_HEADING} testId="about-updates" foot={foot}>
        {desktop && (
          <AppRow
            waiting={waiting.app}
            update={macUpdate}
            openLink={openLink}
            restartNow={restartNow}
          />
        )}
        <ComputerRow
          computer={computer}
          line={computerLine(target, selfUpdate)}
          updates={asking.computer !== undefined}
          onUpdate={
            nightly === undefined
              ? () => openLink(ABOUT_LINKS.updating)
              : () => setShowNow((shown) => !shown)
          }
          order={appButton === undefined ? 0 : 1}
        />
        {nightly !== undefined && <NightRow on={nightly.automatic} onChange={setNightly} />}
      </Group>
      {nightly !== undefined && target !== undefined && showNow && (
        <Group heading={UPDATE_NOW_HEADING} label={UPDATE_NOW_HEADING} testId="about-update-now">
          <div className="about-update-now">
            <CopyBox text={SELF_UPDATE_COMMAND} testId="about-update-now-command" run />
            <p>{updateNowNote(machine, target.version)}</p>
          </div>
        </Group>
      )}
    </>
  );
}

/** Under Updates: how the last night went, or what waits for the computer when it is behind. */
function updatesFoot(
  nightly: SelfUpdateFacts | undefined,
  machine: string,
  behind: string | undefined,
): ReactNode {
  if (nightly !== undefined) {
    return <span data-testid="about-night-foot">{nightFoot(nightly, machine, Date.now())}</span>;
  }
  return behind === undefined ? undefined : <span data-testid="about-behind">{behind}</span>;
}

/** The night switch under a computer from the install line: off until its owner turns it on. */
function NightRow(props: { readonly on: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <ListRow
      label={NIGHT_SWITCH}
      mark={<RowMark icon="moon" tint={HUES.blue} />}
      trailing={
        <Switch
          label={NIGHT_SWITCH}
          checked={props.on}
          onChange={props.onChange}
          testId="about-night-switch"
        />
      }
      testId="about-night"
    />
  );
}

/**
 * Everything that needs someone, for the owner, under Updates (ADR 0297): a bridge that couldn't
 * update or needs a line where it runs, which opens its harness page, and the iPhones, iPads and
 * Macs older than what is out, by whose they are. Each wears the update dot at its end, clear of
 * the chevron. Gone when nothing needs an update.
 */
function NeedsUpdate(props: { readonly openHarness?: ((harnessId: string) => void) | undefined }) {
  const { needs } = useUpdates();
  if (needs.length === 0) return null;
  return (
    <Group
      heading={NEEDS_UPDATE_HEADING}
      label={NEEDS_UPDATE_HEADING}
      testId="about-needs"
      foot={<span>{NEEDS_UPDATE_FOOT}</span>}
    >
      {needs.map((row) => (
        <NeedsRow key={row.key} row={row} openHarness={props.openHarness} />
      ))}
    </Group>
  );
}

function NeedsRow(props: {
  readonly row: NeedsUpdateRow;
  readonly openHarness?: ((harnessId: string) => void) | undefined;
}) {
  const { row, openHarness } = props;
  const harnessId = row.harnessId;
  const opens = harnessId !== undefined && openHarness !== undefined;
  const tint =
    row.kind === "bridge"
      ? HUES.violet
      : row.app === "ipad"
        ? HUES.teal
        : row.app === "mac"
          ? undefined
          : HUES.pink;
  return (
    <ListRow
      label={row.label}
      sub={row.sub}
      mark={
        <RowMark
          icon={row.kind === "bridge" ? "terminal" : row.app === "mac" ? "mac" : "user"}
          tint={tint}
        />
      }
      trailing={
        <span className="needs-end">
          <NeedsDot />
          {/* A row that opens nothing keeps the chevron's room, so the dots stand in a column. */}
          {!opens && <span className="you-chev is-blank" aria-hidden="true" />}
        </span>
      }
      onOpen={opens ? () => openHarness(harnessId) : undefined}
      testId={`about-needs-${row.kind}`}
    />
  );
}

/**
 * Chips for Mac's row: its version, or how its own update stands (ADR 0298), with Restart now
 * once a release is ready. An app that doesn't update itself, or whose update failed, offers the
 * download with Install.
 */
function AppRow(props: {
  readonly waiting: UpdateWaiting | undefined;
  readonly update: MacUpdate | undefined;
  readonly openLink: (url: string) => void;
  readonly restartNow: () => void;
}) {
  const { waiting, update } = props;
  const sub = macUpdateLine(update, waiting, VERSION);
  return (
    <ListRow
      label="Chips for Mac"
      sub={sub}
      value={sub === undefined ? VERSION : undefined}
      mark={
        <span className="you-mark about-row-mark" aria-hidden="true">
          <ChipMark size={24} />
        </span>
      }
      trailing={<AppRowButton {...props} />}
      testId="about-app-row"
    />
  );
}

/** Restart now for a release ready; Install, the download, where the app can't update itself. */
function AppRowButton(props: {
  readonly waiting: UpdateWaiting | undefined;
  readonly update: MacUpdate | undefined;
  readonly openLink: (url: string) => void;
  readonly restartNow: () => void;
}) {
  const button = appButtonOf(props.waiting, props.update);
  if (button === "restart") {
    return (
      <UpdateButton label={RESTART_NOW} onClick={props.restartNow} testId="about-restart-app" />
    );
  }
  return button === "install" ? (
    <UpdateButton
      label={INSTALL_BUTTON}
      onClick={() => props.openLink(MAC_DOWNLOAD)}
      testId="about-update-app"
    />
  ) : null;
}

/** Which button Chips for Mac's row has: Restart now once a release is ready, the download where it can't update itself. */
function appButtonOf(
  waiting: UpdateWaiting | undefined,
  update: MacUpdate | undefined,
): "restart" | "install" | undefined {
  if (update?.state === "ready") return "restart";
  const downloads =
    update?.state === "failed" || (waiting !== undefined && !macUpdatesItself(update));
  return downloads ? "install" : undefined;
}

/** What the computer's row says beside its name while nothing waits for it. */
function computerValue(computer: Computer): string {
  if (computer.kind === "read") return computer.facts.version;
  return computer.kind === "unreached" ? COMPUTER_UNREACHED : "…";
}

/**
 * The computer's row: its version, or what waits for it. Its owner gets Update (the steps, or the
 * line to run) where the computer is theirs to update; one that comes with Chips for Mac, or is
 * starting again on its own, asks nothing of anyone and has no button (ADR 0298).
 */
function ComputerRow(props: {
  readonly computer: Computer;
  /** What waits for it, in words; none when nothing does. */
  readonly line: string | undefined;
  /** Whether its owner has an update to make. */
  readonly updates: boolean;
  /** The steps for a computer, or the line to run on one from the install line. */
  readonly onUpdate: () => void;
  readonly order: number;
}) {
  const { computer, line } = props;
  return (
    <ListRow
      label={
        computer.kind === "read" ? computerRow(computer.facts.machine) : "Chips on your computer"
      }
      sub={line}
      value={line === undefined ? computerValue(computer) : undefined}
      mark={<RowMark icon="mac" />}
      trailing={
        props.updates ? (
          <UpdateButton
            label={UPDATE_BUTTON}
            soft
            onClick={props.onUpdate}
            order={props.order}
            testId="about-update"
          />
        ) : undefined
      }
      testId="about-computer-row"
    />
  );
}

/** Whether the gold dot shows here (ADR 0296), and what it does. */
function DotSwitch(props: { readonly desktop: boolean }) {
  const { enabled, setEnabled } = useUpdates();
  const where = props.desktop ? "the top right of the window" : "the top of the sidebar";
  return (
    <Group
      label={DOT_SWITCH}
      testId="about-dot"
      foot={<span data-testid="about-dot-foot">{dotFoot(enabled, where)}</span>}
    >
      <ListRow
        label={DOT_SWITCH}
        mark={<RowMark icon="dot" tint="var(--gold)" ink="#231a00" />}
        trailing={
          <Switch
            label={DOT_SWITCH}
            checked={enabled}
            onChange={setEnabled}
            testId="about-dot-switch"
          />
        }
      />
    </Group>
  );
}

/** How long the capsule says it copied before it says the build again. */
const COPIED_MS = 1900;

/** The chip, the name, the capsule and the sentence. */
function Top(props: {
  readonly facts: ComputerFacts | undefined;
  readonly desktop: boolean;
  readonly here: string;
}) {
  // Each click on the chip draws it anew, which runs its light round again.
  const [round, setRound] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const capsule = buildCapsule(VERSION, undefined, COMMIT);
  const copy = () => {
    const line = bugReportLine({
      version: VERSION,
      build: undefined,
      commit: COMMIT,
      system: props.desktop ? "Mac" : "web",
      computer: props.facts,
    });
    void navigator.clipboard
      ?.writeText(line)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => undefined);
  };
  return (
    <div className="about-top">
      <button
        type="button"
        className="about-mark"
        onClick={() => setRound((n) => n + 1)}
        aria-label="The Chips mark"
        data-testid="about-mark"
      >
        <ChipMark key={round} size={84} state="once" />
      </button>
      <h3 className="about-name" data-testid="about-name">
        Chips
      </h3>
      <button
        type="button"
        className={copied ? "about-capsule is-copied" : "about-capsule"}
        onClick={copy}
        aria-label={`Version ${capsule}. Copies the version for a bug report.`}
        data-testid="about-capsule"
      >
        <span>{copied ? BUILD_COPIED : capsule}</span>
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>
      <p className="about-blurb">{aboutBlurb(props.here)}</p>
    </div>
  );
}

/** What's new: the release this app is, its day, and what it changed. */
export function WhatsNewPage(props: { readonly service: AboutService }) {
  const release = releaseOf(VERSION) ?? RELEASES[0];
  if (release === undefined) return null;
  const changes = release.changes ?? [release.line];
  return (
    <div className="you-page about-sub" data-testid="whats-new-page">
      <div className="about-rel">
        <h3>Chips {release.version}</h3>
        <span>{releaseDay(release.date)}</span>
      </div>
      <ul className="about-changes" data-testid="whats-new-changes">
        {changes.map((change) => (
          <li key={change}>
            <span className="about-change-mark" aria-hidden="true">
              <Icon name="sparkle" size={12} />
            </span>
            <span>{change}</span>
          </li>
        ))}
      </ul>
      <Group label={ABOUT_LINK_ROWS.releases.label} testId="whats-new-more">
        <ListRow
          label={ABOUT_LINK_ROWS.releases.label}
          mark={<RowMark icon="doc" />}
          onOpen={() => props.service.openLink(ABOUT_LINKS.releases)}
          testId="whats-new-releases"
        />
      </Group>
    </div>
  );
}

/** Licence, in plain words, and the ways to the licence and the map of it. */
export function LicencePage(props: { readonly service: AboutService }) {
  return (
    <div className="you-page about-sub" data-testid="licence-page">
      <div className="about-words">
        {LICENCE_WORDS.map((words) => (
          <p key={words}>{words}</p>
        ))}
      </div>
      <Group label="The licence" testId="licence-links">
        <ListRow
          label={ABOUT_LINK_ROWS.readLicence.label}
          mark={<RowMark icon="doc" />}
          onOpen={() => props.service.openLink(ABOUT_LINKS.licence)}
          testId="licence-read"
        />
        <ListRow
          label={ABOUT_LINK_ROWS.licensing.label}
          sub={ABOUT_LINK_ROWS.licensing.sub}
          mark={<RowMark icon="doc" />}
          onOpen={() => props.service.openLink(ABOUT_LINKS.licensing)}
          testId="licence-licensing"
        />
      </Group>
    </div>
  );
}

/** The list `pnpm notices` writes, loaded when Acknowledgements first opens. */
interface Notices {
  readonly app: string;
  readonly packages: readonly PackageNotice[];
}

/**
 * Acknowledgements: every open-source package the web app ships, with its licence, and its licence
 * text folded open in place when its row is clicked. The list is read when the page first opens,
 * so the app's first load doesn't carry it.
 */
export function NoticesPage() {
  const [list, setList] = useState<Notices | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void import("./notices.json").then((loaded) => {
      if (live) setList(loaded.default as Notices);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="you-page about-sub" data-testid="notices-page" aria-label={NOTICES_TITLE}>
      {list === undefined ? (
        <p className="about-lead" aria-busy="true">
          …
        </p>
      ) : (
        <>
          <p className="about-lead">{noticesLead(list.app)}</p>
          <div className="you-gcard about-notices">
            {list.packages.map((notice) => (
              <details
                key={`${notice.name}@${notice.version}`}
                data-testid={`notice-${notice.name}`}
              >
                <summary>
                  <span className="about-notice-name">
                    <span>{notice.name}</span>
                    <small>{notice.version}</small>
                  </span>
                  <span className="about-notice-licence">{noticeLicence(notice)}</span>
                  <span className="you-chev" aria-hidden="true" />
                </summary>
                <div className="about-notice-texts">
                  {notice.texts.length === 0 ? (
                    <p>{NOTICE_NO_TEXT}</p>
                  ) : (
                    notice.texts.map((each) => (
                      <figure key={each.file}>
                        <figcaption>{each.file}</figcaption>
                        <pre>{each.text.trim()}</pre>
                      </figure>
                    ))
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
