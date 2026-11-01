/**
 * Invite to a room, from Add's "Invite someone new" (ADR 0168), an owner's alone: a link that
 * brings somebody new into the workspace and straight into this room, as a guest of it or as a
 * member who starts in it. As what, then who and what they'll see, the faces growing in and folding
 * away as the role changes (ADR 0209); once or by several, and for how long, each a segmented
 * control as You's Invite someone has them; then the link, shown once with its QR, Copy and
 * Withdraw, and the card it opens to. Whoever opens it lands here. The parts are You's and the
 * words core's, so the phone's sheet, which shares You's form, says the same.
 */

import {
  type Directory,
  type IssuedInvite,
  inviteToSpaceHint,
  inviteUsesMeans,
  myRole,
  nameOf,
  ROLE_WORDS,
  SPACE_INVITE_ROLES,
  type WorkspaceModel,
  type WorkspaceRole,
} from "@chipschat/core";
import { FIRST_PERSON_NAME } from "@chipschat/protocol";
import { Button } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { Segmented } from "../you/controls.tsx";
import { InviteSeesView, IssuedInviteView } from "../you/PeopleParts.tsx";
import type { SpaceActions } from "./actions.ts";
import { Back, stillMotion } from "./parts.tsx";

const USES = [
  ["once", "Once"],
  ["open", "By several"],
] as const;

export function InvitePage(props: {
  readonly titleId: string;
  /** What the room is called on this screen. */
  readonly title: string;
  readonly spaceId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly invite: NonNullable<SpaceActions["invite"]>;
  readonly withdraw: SpaceActions["withdrawInvite"];
  readonly workspace: string;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const [role, setRole] = useState<WorkspaceRole>("guest");
  const [uses, setUses] = useState<"once" | "open">("once");
  const [issued, setIssued] = useState<IssuedInvite | undefined>(undefined);
  // What the page is waiting on the server for, if anything: the button says Making… for a link.
  const [doing, setDoing] = useState<"make" | "withdraw" | undefined>(undefined);
  const busy = doing !== undefined;
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  // Still called what the server first called them: whoever opens the link would read "You
  // invited you" (JR-17), so the page asks for a name first.
  const unnamed = nameOf(props.directory, props.selfId) === FIRST_PERSON_NAME;

  // The link just made is below the button, and the sheet is short: it scrolls up into sight.
  useEffect(() => {
    if (issued === undefined) return;
    box.current
      ?.querySelector('[data-testid="issued-invite"]')
      ?.scrollIntoView?.({ block: "nearest", behavior: stillMotion() ? "auto" : "smooth" });
  }, [issued]);

  const work = async (what: "make" | "withdraw", act: () => Promise<void>) => {
    setDoing(what);
    setFailed(undefined);
    try {
      await act();
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : "The server would not do it.");
    } finally {
      setDoing(undefined);
    }
  };
  const make = () =>
    work("make", async () => {
      setIssued(await props.invite({ role, singleUse: uses === "once" }));
    });
  const withdraw = (inviteId: string) =>
    work("withdraw", async () => {
      await props.withdraw(inviteId);
      setIssued(undefined);
    });

  return (
    <form
      className="sheet-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void make();
      }}
      data-testid="room-sheet-invite-page"
    >
      <Back titleId={props.titleId} title={`Invite to ${props.title}`} onBack={props.onBack} />
      <p className="sheet-hint">{inviteToSpaceHint(props.workspace, props.title)}</p>
      {unnamed && (
        <p className="sheet-hint sheet-warn" data-testid="name-first">
          Give yourself a name first, in You: whoever opens your link sees who sent it.
        </p>
      )}
      <div ref={box} className="sheet-scroll sheet-invite">
        <div className="sheet-label">
          As
          <Segmented
            label="Invite role"
            value={role}
            options={SPACE_INVITE_ROLES.map((each) => [each, ROLE_WORDS[each]] as const)}
            onChange={setRole}
          />
        </div>
        <InviteSeesView
          model={props.model}
          directory={props.directory}
          workspace={props.workspace}
          role={role}
          spaceId={props.spaceId}
          room={props.title}
        />
        <div className="sheet-label">
          Can be used
          <Segmented label="Invite uses" value={uses} options={USES} onChange={setUses} />
          <span className="sheet-field-hint" data-testid="invite-uses-means">
            {inviteUsesMeans(uses)}
          </span>
        </div>
        <button type="submit" className="sheet-go" disabled={busy} data-testid="make-invite">
          {doing === "make" ? "Making…" : "Make a link"}
        </button>
        {failed !== undefined && (
          <p className="sheet-failed" role="alert" data-testid="room-sheet-failed">
            {failed}
          </p>
        )}
        {issued !== undefined && (
          <IssuedInviteView
            key={issued.inviteId}
            issued={issued}
            busy={busy}
            model={props.model}
            directory={props.directory}
            selfId={props.selfId}
            workspace={props.workspace}
            room={props.title}
            onWithdraw={() => void withdraw(issued.inviteId)}
            owner={myRole(props.model, props.selfId) === "owner"}
          />
        )}
      </div>
      <div className="sheet-foot">
        <Button className="sheet-done" onClick={props.onDone} data-testid="room-sheet-invite-done">
          Done
        </Button>
      </div>
    </form>
  );
}
