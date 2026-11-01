/**
 * One of everything, with the golden scenario's names and numbers. Rendered twice by the
 * kitchen sink, once per theme.
 */

import type { Attachment } from "@chipschat/core";
import type { AutonomyLevel } from "@chipschat/protocol";
import {
  ApprovalCard,
  AttachmentChip,
  AutonomyDial,
  Avatar,
  Button,
  Card,
  ChipMark,
  Composer,
  ContextRing,
  Dot,
  HARNESS_STATUSES,
  ICON_NAMES,
  Icon,
  Pill,
  QuestionCard,
  Receipt,
  RouteCard,
  StatusPill,
  TaskCard,
  TIERS,
  TierBadge,
  Timeline,
} from "@chipschat/ui";
import { type ReactNode, useState } from "react";
import { Attachments } from "../app/Attachments.tsx";
import type { FileService } from "../app/files.ts";

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="sink__component" data-component={id}>
      <h2>{title}</h2>
      <div className="sink__examples">{children}</div>
    </section>
  );
}

function Labelled({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="sink__example">
      {children}
      <span className="sink__caption">{label}</span>
    </div>
  );
}

const PREVIEW = {
  format: "markdown" as const,
  body: "Hi Dana, confirming PO #4471: 120 units at $48.20, delivery by Sep 19. Please reply with the signed acknowledgment.",
};

const RISK = ["external_communication", "irreversible"] as const;

const STEPS = [
  {
    id: "read-po",
    title: "Read PO #4471",
    status: "done" as const,
    source: "Drive",
    durationMs: 1840,
  },
  {
    id: "contact",
    title: "Found the vendor contact: dana@northwind.com",
    status: "done" as const,
    source: "CRM",
  },
  {
    id: "draft",
    title: "Drafted the confirmation email",
    status: "done" as const,
    source: "draft v2",
  },
];

const QUESTION_OPTIONS = [
  { value: "19", label: "19 September", description: "The date on the PO." },
  { value: "26", label: "26 September", description: "A week later, but a full pallet." },
];

const TRAIL = [
  { name: "Arjun", kind: "person" as const },
  { name: "Scout", kind: "harness" as const },
  { name: "Ledger", kind: "harness" as const },
];

const HOUR = 3_600_000;

function LiveDial({
  initial,
  max,
}: {
  readonly initial: AutonomyLevel;
  readonly max?: AutonomyLevel;
}) {
  const [level, setLevel] = useState<AutonomyLevel>(initial);
  return <AutonomyDial value={level} onChange={setLevel} {...(max === undefined ? {} : { max })} />;
}

function LiveComposer() {
  const [value, setValue] = useState("");
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSend={() => setValue("")}
      onAttach={() => undefined}
      label="Message Scout"
      placeholder="Message Scout, or type / to steer, pause, or hand off…"
      chips={[{ id: "steer", label: "Steer", icon: "bolt" }]}
      attachments={[
        { id: "po", name: "PO-4471.pdf", meta: "212 KB · 2 pages", onRemove: () => undefined },
      ]}
    />
  );
}

/**
 * Longer than the sixty lines a function is allowed (technical-plan 6.1), on purpose: this is
 * a catalogue, one of everything in the order the plan lists them, and it reads best as one
 * page from top to bottom. Nothing in it branches.
 */
export function Gallery() {
  return (
    <>
      <Section id="mark" title="Mark">
        <Labelled label="16">
          <ChipMark size={16} label="Chips" />
        </Labelled>
        <Labelled label="24">
          <ChipMark size={24} label="Chips" />
        </Labelled>
        <Labelled label="48">
          <ChipMark size={48} label="Chips" />
        </Labelled>
      </Section>

      <Section id="icon" title="Icon">
        {ICON_NAMES.map((name) => (
          <Labelled label={name} key={name}>
            <Icon name={name} label={name} />
          </Labelled>
        ))}
      </Section>

      <Section id="avatar" title="Avatar">
        <Labelled label="Person">
          <Avatar name="Priya Raman" />
        </Labelled>
        <Labelled label="Harness, working">
          <Avatar name="Scout" kind="harness" status="working" />
        </Labelled>
        <Labelled label="Harness, waiting on you">
          <Avatar name="Scout" kind="harness" status="waiting" />
        </Labelled>
        <Labelled label="Harness, blocked">
          <Avatar name="Muse" kind="harness" status="blocked" />
        </Labelled>
        <Labelled label="Harness, done">
          <Avatar name="Atlas" kind="harness" status="done" />
        </Labelled>
        <Labelled label="Harness, idle">
          <Avatar name="Ledger" kind="harness" status="idle" />
        </Labelled>
        <Labelled label="Channel">
          <Avatar name="#procurement" kind="channel" />
        </Labelled>
        <Labelled label="Small">
          <Avatar name="Arjun Gupta" size="xs" />
        </Labelled>
        <Labelled label="Large">
          <Avatar name="Scout" kind="harness" size="lg" status="waiting" />
        </Labelled>
      </Section>

      <Section id="ring" title="Context ring">
        <Labelled label="Fresh">
          <ContextRing percent={12} size="lg" />
        </Labelled>
        <Labelled label="Working">
          <ContextRing percent={41} size="lg" />
        </Labelled>
        <Labelled label="Checkpoint soon">
          <ContextRing percent={78} size="lg" />
        </Labelled>
        <Labelled label="Hand off">
          <ContextRing percent={93} size="lg" />
        </Labelled>
        <Labelled label="Beside a name">
          <span className="sink__inline">
            <ContextRing percent={41} /> 41%
          </span>
        </Labelled>
      </Section>

      <Section id="pill" title="Pill and status">
        {HARNESS_STATUSES.map((status) => (
          <Labelled label={status} key={status}>
            <StatusPill
              status={status}
              {...(status === "working" ? { verbPhrase: "Drafting the reply…" } : {})}
            />
          </Labelled>
        ))}
        <Labelled label="Count">
          <Pill tone="amber" dot="solid">
            3 need you
          </Pill>
        </Labelled>
        <Labelled label="Label">
          <Pill>Lead</Pill>
        </Labelled>
        <Labelled label="Dots">
          <span className="sink__inline">
            <Dot tone="blue" kind="pulse" />
            <Dot tone="blue" kind="hollow" />
            <Dot tone="amber" />
            <Dot tone="red" />
            <Dot tone="green" />
            <Dot />
          </span>
        </Labelled>
      </Section>

      <Section id="button" title="Button">
        <Labelled label="Default">
          <Button>Details</Button>
        </Labelled>
        <Labelled label="Primary">
          <Button variant="primary">Approve</Button>
        </Labelled>
        <Labelled label="Danger">
          <Button variant="danger">Deny</Button>
        </Labelled>
        <Labelled label="Ghost">
          <Button variant="ghost">Later</Button>
        </Labelled>
        <Labelled label="With an icon">
          <Button icon="pause">Pause</Button>
        </Labelled>
        <Labelled label="Icon only">
          <Button icon="clip" iconOnly aria-label="Attach a photo or file" />
        </Labelled>
        <Labelled label="Medium">
          <Button size="md" variant="primary">
            Grant access
          </Button>
        </Labelled>
        <Labelled label="Large">
          <Button size="lg" icon="pause">
            Pause Scout
          </Button>
        </Labelled>
        <Labelled label="Disabled">
          <Button disabled>Edit</Button>
        </Labelled>
      </Section>

      <Section id="card" title="Card">
        <Labelled label="Plain">
          <Card>
            <b>Confirmation email</b> · draft v2
          </Card>
        </Labelled>
        <Labelled label="Elevated">
          <Card elevated>Weekly reconciliation done</Card>
        </Labelled>
        <Labelled label="A decision">
          <Card tone="ask">Needs a yes</Card>
        </Labelled>
        <Labelled label="Approved">
          <Card tone="approved">Approved</Card>
        </Labelled>
        <Labelled label="Denied">
          <Card tone="denied">Denied</Card>
        </Labelled>
      </Section>

      <Section id="tier" title="Tier">
        {TIERS.map((tier) => (
          <Labelled label={tier} key={tier}>
            <TierBadge tier={tier} />
          </Labelled>
        ))}
      </Section>

      <Section id="attachment" title="Attachment">
        <Labelled label="File">
          <AttachmentChip name="PO-4471.pdf" meta="212 KB · 2 pages" />
        </Labelled>
        <Labelled label="A link">
          <AttachmentChip name="tracker.csv" meta="4 KB" href="#tracker" />
        </Labelled>
        <Labelled label="In a composer">
          <AttachmentChip
            name="warehouse.jpg"
            kind="image"
            meta="2.1 MB"
            onRemove={() => undefined}
          />
        </Labelled>
        <Labelled label="Voice note">
          <AttachmentChip name="note.m4a" kind="audio" meta="0:42" />
        </Labelled>
      </Section>

      <Section id="receipt" title="Receipt">
        <Labelled label="Collapsed">
          <Receipt steps={STEPS} durationMs={12_000} costUsd={0.04} />
        </Labelled>
        <Labelled label="Open">
          <Receipt steps={STEPS} durationMs={12_000} costUsd={0.04} open />
        </Labelled>
        <Labelled label="With a failure">
          <Receipt
            steps={[
              ...STEPS.slice(0, 2),
              {
                id: "send",
                title: "Send the confirmation email",
                status: "failed",
                error: "SMTP refused the connection",
              },
              { id: "retry", title: "Trying again", status: "started" },
            ]}
            durationMs={31_000}
            open
          />
        </Labelled>
      </Section>

      <Section id="timeline" title="Timeline">
        <Labelled label="A run in progress">
          <Timeline
            items={[
              { id: "1", title: "Read PO #4471", status: "done" },
              { id: "2", title: "Found the vendor contact", status: "done" },
              { id: "c", title: "Compacted context · 88% → 31%", kind: "tick" },
              {
                id: "3",
                title: "Send the confirmation email",
                status: "now",
                note: "needs your approval",
              },
              { id: "4", title: "Update the PO tracker" },
              { id: "5", title: "Post a summary" },
            ]}
          />
        </Labelled>
        <Labelled label="A run that failed">
          <Timeline
            items={[
              { id: "1", title: "Read PO #4471", status: "done" },
              {
                id: "2",
                title: "Send the confirmation email",
                status: "failed",
                note: "SMTP refused the connection",
              },
              { id: "3", title: "Update the PO tracker" },
            ]}
          />
        </Labelled>
      </Section>

      <Section id="dial" title="Autonomy dial">
        <Labelled label="Read-only">
          <AutonomyDial value={2} />
        </Labelled>
        <Labelled label="A control">
          <LiveDial initial={2} />
        </Labelled>
        <Labelled label="Capped at L2 by the workspace">
          <LiveDial initial={1} max={2} />
        </Labelled>
      </Section>

      <Section id="approval" title="Approval card">
        <Labelled label="Waiting on you">
          <ApprovalCard
            harnessName="Scout"
            title="Scout wants to send an email"
            subtitle="To dana@northwind.com · Subject: PO #4471 confirmation"
            icon="mail"
            preview={PREVIEW}
            risk={RISK}
            sources={[{ kind: "external", label: "vendor website" }]}
            remainingMs={58 * 60_000}
            editable
            scope="once"
            onScopeChange={() => undefined}
            onApprove={() => undefined}
            onEdit={() => undefined}
            onDeny={() => undefined}
          />
        </Labelled>
        <Labelled label="Approved and sent">
          <ApprovalCard
            harnessName="Scout"
            title="Scout wants to send an email"
            subtitle="To dana@northwind.com · Subject: PO #4471 confirmation"
            icon="mail"
            preview={PREVIEW}
            risk={RISK}
            resolution={{ decision: "approved", by: "Arjun", at: "10:45", executed: "executed" }}
          />
        </Labelled>
        <Labelled label="Denied">
          <ApprovalCard
            harnessName="Scout"
            title="Scout wants to delete 14 files"
            subtitle="In Drive · Q2 quotes"
            icon="doc"
            risk={["destructive", "irreversible"]}
            resolution={{
              decision: "denied",
              by: "Arjun",
              at: "10:45",
              reason: "Keep the quotes until the audit",
            }}
          />
        </Labelled>
        <Labelled label="Expired">
          <ApprovalCard
            harnessName="Atlas"
            title="Atlas wants to pay an invoice"
            subtitle="$1,240 to Northwind"
            icon="bolt"
            risk={["financial", "irreversible"]}
            resolution={{ decision: "expired", by: "deny", at: "11:42" }}
          />
        </Labelled>
        <Labelled label="Inside a lane, with a diff">
          <ApprovalCard
            harnessName="Ledger"
            title="Ledger wants to change the tracker"
            subtitle="tracker.csv · 1 row"
            icon="grid"
            preview={{
              format: "diff",
              title: "tracker.csv",
              body: "- PO-4471,120,48.20,pending\n+ PO-4471,120,48.20,confirmed",
            }}
            risk={["irreversible"]}
            sources={[{ kind: "internal", label: "Drive" }]}
            remainingMs={2 * HOUR}
            trail="Arjun → Scout → Ledger"
            onApprove={() => undefined}
            onDeny={() => undefined}
          />
        </Labelled>
      </Section>

      <Section id="question" title="Question card">
        <Labelled label="Open, with a default">
          <QuestionCard
            harnessName="Scout"
            prompt="Northwind can ship on the 19th or the 26th. Which should I confirm?"
            options={QUESTION_OPTIONS}
            allowFreeText
            defaultValue="19"
            remainingMs={58 * 60_000}
            onAnswer={() => undefined}
          />
        </Labelled>
        <Labelled label="Answered">
          <QuestionCard
            harnessName="Scout"
            prompt="Northwind can ship on the 19th or the 26th. Which should I confirm?"
            options={QUESTION_OPTIONS}
            answer={{ values: ["26"], by: "Arjun", at: "10:50" }}
          />
        </Labelled>
        <Labelled label="Nobody answered">
          <QuestionCard
            harnessName="Scout"
            prompt="Northwind can ship on the 19th or the 26th. Which should I confirm?"
            options={QUESTION_OPTIONS}
            answer={{ values: ["19"], timedOut: true }}
          />
        </Labelled>
      </Section>

      <Section id="composer" title="Composer">
        <Labelled label="With an attachment and a chip">
          <div className="sink__wide">
            <LiveComposer />
          </div>
        </Labelled>
      </Section>

      <Section id="route" title="Route card">
        <Labelled label="The lead's view of a lane">
          <RouteCard
            from={{ name: "Scout" }}
            to={{ name: "Ledger", status: "done" }}
            goal="Check the three quotes against last quarter"
            status="done"
            contextPercent={23}
            costUsd={0.03}
            replyPlaceholder="Reply to Ledger…"
          >
            <div className="sink__message">
              <Avatar name="Ledger" kind="harness" size="xs" />
              <div>
                <b>Ledger</b> <span className="sink__time">11:04</span>
                <p>All three are within 2% of Q2. Northwind is lowest at $48.20 a unit.</p>
              </div>
            </div>
          </RouteCard>
        </Labelled>
      </Section>

      <Section id="task" title="Task card">
        <Labelled label="The specialist's view of the same lane">
          <TaskCard
            trail={TRAIL}
            title="Check the three Northwind quotes against last quarter's prices"
            quote="Are the Northwind quotes in line with last quarter?"
            constraints={["Use the finance warehouse, not the CRM"]}
            deadline="today, 6pm"
            attachments={[{ id: "po", name: "PO-4471.pdf", meta: "212 KB", href: "#po" }]}
            openHref="#scout"
            openLabel="Open in Scout's chat"
          />
        </Labelled>
      </Section>
      <Section id="media-viewer" title="Media viewer">
        <Labelled label="At rest: the counter, the caption, the filmstrip and the actions">
          <ViewerSink />
        </Labelled>
        <Labelled label="Zoomed: the filmstrip goes, and the stage is the picture's">
          <ViewerSink zoomed />
        </Labelled>
        <Labelled label="A video, while the copy that plays everywhere is being made">
          <ViewerSink video />
        </Labelled>
      </Section>

      <Section id="album" title="Album">
        <Labelled label="Two, side by side">
          <SinkAlbum attachments={[sinkPhoto(1), sinkPhoto(2)]} />
        </Labelled>
        <Labelled label="One tall beside two, a clip among them">
          <SinkAlbum attachments={[sinkPhoto(1), SINK_CLIP, sinkPhoto(2)]} />
        </Labelled>
        <Labelled label="Six: two by two, and +2 on the fourth">
          <SinkAlbum
            attachments={[
              sinkPhoto(1),
              sinkPhoto(2),
              SINK_CLIP,
              sinkPhoto(3),
              sinkPhoto(4),
              sinkPhoto(5),
            ]}
          />
        </Labelled>
        <Labelled label="A clip alone">
          <SinkAlbum attachments={[SINK_CLIP]} />
        </Labelled>
      </Section>
    </>
  );
}

/**
 * The media viewer's chrome on a stage, for the eye and for the visual suite (ADR 0057, §4.3).
 * The real one is a `<dialog>` opened with `showModal()`, which would cover the gallery and every
 * component under it, so what is drawn here is the same markup and the same classes at a size. What
 * it cannot show is the platform's own backdrop and top layer, and the gestures: those are
 * `e2e/viewer.spec.ts`'s, in a browser.
 */
function ViewerSink({
  zoomed = false,
  video = false,
}: {
  readonly zoomed?: boolean;
  readonly video?: boolean;
}) {
  const of = video ? 1 : 4;
  return (
    <div className="viewer viewer-sink" data-chrome="on" data-zoomed={zoomed ? "yes" : "no"}>
      <div className="viewer-stage">
        <div className="viewer-track">
          <div className="viewer-page">
            <div
              className="viewer-picture"
              // A video is letterboxed higher, as one is on a full stage, so the line saying its
              // copy is being made sits clear of the bar rather than under it.
              style={{
                inset: video ? "7% 18% 31%" : "8% 20%",
                ...(zoomed ? { transform: "translate(18px, -6px) scale(2.5)" } : {}),
              }}
            >
              <img className="viewer-image" src={video ? SINK_POSTER : SINK_PHOTO} alt="" />
              {video && (
                <>
                  <p className="viewer-caption">
                    Playing the original · the copy that plays everywhere is being made
                  </p>
                  {/* The browser's own controls, which the real stage leaves the video to draw. */}
                  <span className="viewer-sink-controls" aria-hidden="true" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* `data-kind` is the component's own: it lifts the bottom bar clear of a video's controls. */}
      <div className="viewer-chrome" data-hidden="no" data-kind={video ? "video" : "photo"}>
        <div className="viewer-bar viewer-top">
          <span className="viewer-count">{video ? "" : `2 of ${of}`}</span>
          <span className="viewer-name">{video ? "IMG_4410.MOV" : "receipt.jpg"}</span>
          <span className="viewer-close" aria-hidden="true">
            <Icon name="x" size={16} />
          </span>
        </div>
        <span className="viewer-arrow viewer-back" aria-hidden="true">
          ‹
        </span>
        <span className="viewer-arrow viewer-next" aria-hidden="true">
          ›
        </span>
        <div className="viewer-bar viewer-bottom">
          <p className="viewer-caption-line">Arjun · 11:26</p>
          {!zoomed && !video && (
            <div className="viewer-filmstrip">
              <ul>
                {[0, 1, 2, 3].map((at) => (
                  <li key={at}>
                    <span className="viewer-thumb" data-current={at === 1 ? "yes" : "no"}>
                      <img src={SINK_PHOTO} alt="" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="viewer-actions">
            <span>Download</span>
            <span>Copy image</span>
            <span>Details</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A message's album, as the room draws it (`Attachments`, decision 7): the real component and the
 * room's own classes, at a room column's width, over a file service that hands back the pictures
 * below. The album asks it for nothing but thumbnails, and outside a room there is no viewer for a
 * tile to open.
 */
function SinkAlbum({ attachments }: { readonly attachments: readonly Attachment[] }) {
  return (
    <div style={{ width: 300 }}>
      <Attachments attachments={attachments} files={SINK_FILES} lineId="lin_sink" />
    </div>
  );
}

function sinkPhoto(n: number): Attachment {
  return {
    id: `att_sink_photo_${n}`,
    filename: `site-0${n}.jpg`,
    mimeType: "image/jpeg",
    byteSize: 2_516_582,
    width: 4032,
    height: 3024,
  };
}

const SINK_CLIP: Attachment = {
  id: "att_sink_clip",
  filename: "IMG_4410.MOV",
  mimeType: "video/quicktime",
  byteSize: 38_000_000,
  width: 1920,
  height: 1080,
  durationMs: 42_500,
};

const SINK_FILES = {
  thumb: async (id: string) => (id === SINK_CLIP.id ? SINK_STILL : SINK_PHOTO),
} as unknown as FileService;

/** Two stand-in pictures, drawn here rather than fetched: the gallery reaches no server. */
const SINK_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#f7c431"/><stop offset="1" stop-color="#1d6aff"/>` +
      `</linearGradient></defs><rect width="320" height="240" fill="url(#g)"/>` +
      `<circle cx="96" cy="84" r="34" fill="#fbfbf8" opacity="0.85"/>` +
      `<path d="M0 240 L120 132 L208 200 L262 160 L320 214 L320 240 Z" fill="#14161b" opacity="0.5"/></svg>`,
  );

const SINK_POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">` +
      `<rect width="320" height="180" fill="#20232a"/>` +
      `<path d="M136 66 L190 90 L136 114 Z" fill="#fbfbf8" opacity="0.9"/></svg>`,
  );

/** A clip's poster without a mark of its own: the album's tile draws the play mark. */
const SINK_STILL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs>` +
      `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#3a4a5c"/><stop offset="1" stop-color="#16181d"/>` +
      `</linearGradient></defs><rect width="320" height="180" fill="url(#s)"/>` +
      `<rect x="40" y="96" width="240" height="84" fill="#5b6b4a" opacity="0.8"/></svg>`,
  );
