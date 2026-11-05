/**
 * The person's devices and passkeys, on You (ADR 0034, ADR 0085, ADR 0265).
 *
 * Devices answer one question — *which of these is still mine* — so each wears a mark for its
 * kind, says when it was last seen, and can be signed out from here; this one leads and cannot
 * be (its own Sign out is at the foot of the list), and those not seen for a month are folded
 * under one row that signs them all out at once, after asking. The order and the fold are
 * core's (`sortDevices`), shared with the phone. Pair another device, last, opens the code as a
 * form, as the phone's Pair a computer opens its sheet.
 *
 * Passkeys are drawn only where one can work (Shell decides): a passkey is a browser's, on one
 * named address, so the desktop app and a bare IP address never show the card at all.
 */

import {
  type DeviceKind,
  deviceKind,
  lastSeenOf,
  type PairedDeviceRecord,
  sortDevices,
} from "@chipschat/core";
import { Button } from "@chipschat/ui";
import QRCode from "qrcode";
import { type ReactNode, useEffect, useState } from "react";
import { browserDeviceName } from "../browserName.ts";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { NotInDemo, useNotInDemo } from "../demo/NotInDemo.tsx";
import { relativeTime } from "../time.ts";
import { Problem, reasonOf } from "./controls.tsx";
import { FormPage } from "./Form.tsx";
import { Group, ListRow, RowMark } from "./list.tsx";
import type { IssuedCode, PeopleService } from "./services.ts";
import { useList } from "./useList.ts";

/** "Seen now", "Seen 2h ago", "Seen 12 Sep": when a device was last heard from. */
export function seenWords(prefix: string, at: string, now: number = Date.now()): string {
  const when = relativeTime(at, now);
  if (when === "now") return `${prefix} now`;
  return /^\d/.test(when) ? `${prefix} ${when} ago` : `${prefix} ${when}`;
}

export function Devices(props: {
  readonly service: PeopleService;
  /** Whether the connection is open: the list is read then, and again each time it opens. */
  readonly connected: boolean;
  /** Inside the desktop app: this device is a computer, not a browser. */
  readonly desktop: boolean;
}) {
  const { service } = props;
  const { items, busy, error, act, reload } = useList(service.devices, props.connected);
  const [now] = useState(() => Date.now());
  const [pairing, setPairing] = useState<HTMLElement | null | undefined>(undefined);
  // In the demo there is no server to pair a device with (ADR 0213, point 7).
  const setUp = useNotInDemo();
  const { recent, stale } = sortDevices(items ?? [], now);
  return (
    <Group
      heading="Devices"
      label="Devices"
      testId="devices"
      foot={error}
      failed={error !== undefined}
    >
      {items === undefined && error === undefined && (
        <ListRow label="Reading…" mark={<span className="you-mark is-blank" />} />
      )}
      {recent.map((device) => (
        <DeviceRow
          key={device.deviceId}
          device={device}
          here={props.desktop ? "computer" : "browser"}
          now={now}
          busy={busy}
          onSignOut={() => void act(() => service.revokeDevice(device.deviceId))}
        />
      ))}
      {stale.length > 0 && (
        <StaleDevices
          devices={stale}
          now={now}
          busy={busy}
          onSignOut={(deviceId) => void act(() => service.revokeDevice(deviceId))}
          onSignOutAll={async () => {
            try {
              await Promise.all(stale.map((device) => service.revokeDevice(device.deviceId)));
            } finally {
              await reload();
            }
          }}
        />
      )}
      <ListRow
        label="Pair another device"
        tone="accent"
        mark={<RowMark icon="plus" tint="var(--gold-soft)" ink="var(--accent)" />}
        trailing={setUp === undefined ? undefined : <NotInDemo onSetUp={setUp} />}
        onOpen={setUp === undefined ? setPairing : undefined}
        bare
        testId="issue-code"
      />
      {pairing !== undefined && (
        <PairForm
          from={pairing}
          issueCode={service.issuePairingCode}
          onGone={() => {
            setPairing(undefined);
            void reload();
          }}
        />
      )}
    </Group>
  );
}

function DeviceRow(props: {
  readonly device: PairedDeviceRecord;
  /** What this one is, said beside it when it is the current device. */
  readonly here?: "computer" | "browser";
  readonly now: number;
  readonly busy: boolean;
  readonly onSignOut: () => void;
}) {
  const { device } = props;
  return (
    <div className="you-lrow" data-testid="device-row" data-current={device.current}>
      <KindMark kind={deviceKind(device.name)} />
      <span className="you-lrow-lab">
        <span>{device.name}</span>
        <small>
          {device.current
            ? `${seenWords("Paired", device.pairedAt, props.now)} · this ${props.here ?? "browser"}`
            : seenWords("Seen", lastSeenOf(device), props.now)}
        </small>
      </span>
      {device.current ? (
        <span className="you-tag">This one</span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={props.busy}
          onClick={props.onSignOut}
          aria-label={`Sign out ${device.name}`}
        >
          Sign out
        </Button>
      )}
    </div>
  );
}

/**
 * The devices not seen for a month, under one row, as the phone folds them: opened, each can be
 * signed out; or all of them at once, after asking, since a device signed out has to be paired
 * again to come back.
 */
function StaleDevices(props: {
  readonly devices: readonly PairedDeviceRecord[];
  readonly now: number;
  readonly busy: boolean;
  readonly onSignOut: (deviceId: string) => void;
  readonly onSignOutAll: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const count = props.devices.length;
  return (
    <div className="you-stale" data-testid="stale-devices">
      <button
        type="button"
        className="you-lrow you-fold"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="stale-fold"
      >
        <span className="you-mark is-blank" />
        <span className="you-lrow-lab">
          <span>{count} not seen in a month</span>
        </span>
        <span className="you-lrow-val">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <>
          {props.devices.map((device) => (
            <DeviceRow
              key={device.deviceId}
              device={device}
              now={props.now}
              busy={props.busy}
              onSignOut={() => props.onSignOut(device.deviceId)}
            />
          ))}
          <ListRow
            label={`Sign out all ${count}`}
            tone="danger"
            mark={<span className="you-mark is-blank" />}
            onOpen={() => setAsking(true)}
            disabled={props.busy}
            bare
            testId="sign-out-stale"
          />
        </>
      )}
      {asking && (
        <ConfirmDialog
          asking={{
            title: count === 1 ? "Sign out 1 device?" : `Sign out ${count} devices?`,
            body: `${count === 1 ? "It has" : "None of them has"} been seen for a month. Signed out, a device is refused from its next request, and has to be paired again to come back.`,
            confirm: `Sign out all ${count}`,
          }}
          danger
          tooOld="Not signed out: the server would not do it."
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await props.onSignOutAll();
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

/** A small flat mark for the kind of device: a phone, a computer, a browser, a terminal. */
export function KindMark(props: { readonly kind: DeviceKind }) {
  return (
    <span className="you-kind" data-kind={props.kind}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        {KIND_PATHS[props.kind]}
      </svg>
    </span>
  );
}

const KIND_PATHS: Readonly<Record<DeviceKind, ReactNode>> = {
  phone: (
    <>
      <rect x="6.5" y="2" width="11" height="20" rx="2.6" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  tablet: (
    <>
      <rect x="3.5" y="2" width="17" height="20" rx="2.4" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  computer: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.6" />
      <path d="M1.5 19h21" />
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19M12 2.5c2.8 3 2.8 16 0 19M12 2.5c-2.8 3-2.8 16 0 19" />
    </>
  ),
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M6.5 9.5l3 2.5-3 2.5M12 15h5" />
    </>
  ),
  other: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
};

/** A code for another device, and the QR a phone's camera opens (M4.1). */
export interface Pairing {
  readonly issued: IssuedCode | undefined;
  readonly qr: string | undefined;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly issue: () => Promise<void>;
}

export function usePairing(issueCode: () => Promise<IssuedCode>): Pairing {
  const [issued, setIssued] = useState<IssuedCode | undefined>(undefined);
  const [qr, setQr] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const issue = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const code = await issueCode();
      setIssued(code);
      setQr(await QRCode.toString(code.url, { type: "svg", margin: 1 }));
    } catch (problem) {
      setError(reasonOf(problem, "Could not issue a code."));
    } finally {
      setBusy(false);
    }
  };
  return { issued, qr, busy, error, issue };
}

/**
 * Pair another device, as the phone's Pair a computer sheet: a code is made as the form opens, with
 * its QR for a phone's camera and its link for a computer, and Another code makes a fresh one.
 */
function PairForm(props: {
  readonly from: HTMLElement | null;
  readonly issueCode: () => Promise<IssuedCode>;
  readonly onGone: () => void;
}) {
  const pairing = usePairing(props.issueCode);
  const { issue } = pairing;
  // biome-ignore lint/correctness/useExhaustiveDependencies: one code as the form opens
  useEffect(() => {
    void issue();
  }, []);
  return (
    <FormPage
      title="Pair another device"
      from={props.from}
      testId="pair-form"
      onGone={props.onGone}
    >
      {() => (
        <>
          <Problem error={pairing.error} />
          {pairing.issued === undefined ? (
            <p className="you-form-foot">{pairing.busy ? "Making a code…" : ""}</p>
          ) : (
            <IssuedCodeView issued={pairing.issued} qr={pairing.qr} />
          )}
          <p className="you-form-foot">
            On a phone, open Chips and choose Scan a QR code. On a computer, open Chips and paste
            the code, or send it the link.
          </p>
          <div className="you-form-actions">
            <Button disabled={pairing.busy} onClick={() => void issue()}>
              Another code
            </Button>
          </div>
        </>
      )}
    </FormPage>
  );
}

/**
 * What `chips pair --issue` prints, on the screen: the code to type, and the same code as a QR a
 * phone's camera opens, carrying the relay and the server's key so the phone reaches the server
 * from anywhere.
 */
export function IssuedCodeView(props: {
  readonly issued: IssuedCode;
  readonly qr: string | undefined;
}) {
  const { issued } = props;
  const minutes = Math.max(1, Math.round((Date.parse(issued.expiresAt) - Date.now()) / 60_000));
  return (
    <div className="pair-issued" data-testid="issued-code">
      <div className="pair-issued-code">
        <code data-testid="pairing-code">{issued.code}</code>
        <span className="token-life">
          good for {minutes} minute{minutes === 1 ? "" : "s"}, once
          {issued.relay === undefined
            ? ". On this network only: the server has no relay."
            : `. Scanned by a phone, it reaches this server anywhere, through ${new URL(issued.relay).host}.`}
        </span>
        <code className="pair-issued-url" data-testid="pairing-link">
          {issued.url}
        </code>
        {issued.link !== undefined && (
          <ComputerLink link={issued.link} relayed={issued.relay !== undefined} />
        )}
      </div>
      {props.qr !== undefined && (
        <img
          className="pair-qr"
          alt={`A QR code that opens ${issued.url}`}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(props.qr)}`}
        />
      )}
    </div>
  );
}

/**
 * The same code as one link for a computer (ADR 0210): the relay's `/pair` page, which opens on
 * any network and hands the code to Chips for Mac, so one computer can pair another as the phone
 * does. The server makes it; this only shows it and copies it.
 */
function ComputerLink(props: { readonly link: string; readonly relayed: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pair-computer" data-testid="pair-computer-link">
      <span className="token-life">
        For a computer, send this link.{" "}
        {props.relayed ? "It opens on any network." : "It opens on this server's network."}
      </span>
      <code className="pair-issued-url" data-testid="pair-link">
        {props.link}
      </code>
      <Button
        onClick={() => {
          navigator.clipboard.writeText(props.link).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
        data-testid="copy-pair-link"
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

/**
 * Passkeys: how a person comes back on a new browser without a code from this one. Theirs alone;
 * nobody else in the workspace can see or remove one. The web's own: no phone has them.
 */
export function Passkeys(props: { readonly service: PeopleService; readonly connected: boolean }) {
  const { service } = props;
  const { items, busy, error, act } = useList(service.passkeys, props.connected);
  const live = (items ?? []).filter((each) => each.revokedAt === undefined);
  return (
    <Group
      heading="Passkeys"
      label="Passkeys"
      testId="passkeys"
      foot={
        error ??
        "How you come back in another browser without a code from this one. Yours alone: nobody else in the workspace can see or remove one."
      }
      failed={error !== undefined}
    >
      {live.map((passkey) => (
        <ListRow
          key={passkey.passkeyId}
          label={passkey.name}
          sub={`${seenWords("Made", passkey.createdAt)}${
            passkey.lastUsedAt === undefined
              ? " · never used"
              : ` · ${seenWords("used", passkey.lastUsedAt)}`
          }`}
          mark={<RowMark icon="key" />}
          trailing={
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void act(() => service.revokePasskey(passkey.passkeyId))}
            >
              Remove
            </Button>
          }
          testId="passkey-row"
        />
      ))}
      {items !== undefined && live.length === 0 && (
        <ListRow
          label="None yet"
          sub="A new browser needs a pairing code."
          mark={<RowMark icon="key" />}
        />
      )}
      <ListRow
        label="Add a passkey"
        tone="accent"
        mark={<RowMark icon="plus" tint="var(--gold-soft)" ink="var(--accent)" />}
        onOpen={() => void act(() => service.addPasskey(browserDeviceName()))}
        disabled={busy}
        bare
        testId="add-passkey"
      />
    </Group>
  );
}
