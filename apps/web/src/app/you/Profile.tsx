/**
 * The top of You (ADR 0085, ADR 0265): one card holding who you are and where — your face, as you
 * chose it (ADR 0139) and with the phone's pen on it, which opens the face picker as a page beside
 * the list (ADR 0272), the name you go by, edited where it is shown, and the line the phone has
 * under it, "Owner · Demo" or a guest's one space — and under it the Workspace row, as on the phone.
 * The row opens the workspace's name, which an owner changes there (ADR 0194), and the other
 * workspaces this device holds, to switch to.
 *
 * Then how this computer looks, in one group (ADR 0176): light, dark or the system's, and under it
 * the colours the faces wear. Both are this computer's alone; the phone chooses its own.
 */

import { FACE_PICKER_WORDS } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, type FaceTheme, Icon, type Theme } from "@chipschat/ui";
import { useState } from "react";
import { chooseFaces, chooseTheme, storedFaces, storedTheme } from "../appearance.ts";
import "../face/face.css";
import { NameField, Segmented } from "./controls.tsx";
import { FaceThemes } from "./FaceThemes.tsx";
import { FormPage } from "./Form.tsx";
import { Group, ListRow, RowMark } from "./list.tsx";

/** One of the workspaces this device holds, as the sidebar's switcher lists them. */
export interface HeldWorkspace {
  readonly deviceId: string;
  readonly label: string;
  readonly current: boolean;
}

export function MeGroup(props: {
  readonly name: string;
  /** The face you chose (ADR 0139), when you chose one. */
  readonly face?: SpaceIcon | undefined;
  /** "Owner · Demo", or "Guest in Japan trip · invited by Arjun": core's `standingWords`. */
  readonly standing: string;
  readonly rename: (displayName: string) => Promise<void>;
  /** The workspace's name, at the right of its row. */
  readonly workspace: string;
  /** An owner's: name the workspace again (ADR 0194). */
  readonly onRenameWorkspace?: ((name: string) => Promise<void>) | undefined;
  /** The workspaces this device holds, and how to bring another to the front. */
  readonly workspaces?: readonly HeldWorkspace[] | undefined;
  readonly onSwitch?: ((deviceId: string) => void) | undefined;
  /** Open your face's page (ADR 0272). Absent, the face only shows. */
  readonly onFace?: (() => void) | undefined;
  /** Your face's page is the one open beside the list. */
  readonly faceOpen?: boolean | undefined;
}) {
  const [from, setFrom] = useState<HTMLElement | null | undefined>(undefined);
  const others =
    props.onSwitch === undefined ? [] : (props.workspaces ?? []).filter((each) => !each.current);
  // Nothing to change or switch to: the row only says which workspace this is.
  const opens = props.onRenameWorkspace !== undefined || others.length > 0;
  return (
    <Group label="You" testId="me">
      <div className="you-me" data-testid="profile">
        <YourFaceButton
          name={props.name}
          face={props.face}
          onOpen={props.onFace}
          open={props.faceOpen === true}
        />
        <div className="you-me-t">
          <NameField
            label="Your name"
            name={props.name}
            rename={props.rename}
            className="you-name"
            testId="your-name"
            autoComplete="name"
          />
          <span className="you-role" data-testid="my-role">
            {props.standing}
          </span>
        </div>
      </div>
      <ListRow
        label="Workspace"
        value={props.workspace}
        mark={<RowMark icon="chip" tint="var(--gold)" ink="#231a00" />}
        onOpen={opens ? setFrom : undefined}
        testId="you-workspace"
      />
      {from !== undefined && (
        <WorkspaceForm
          from={from}
          workspace={props.workspace}
          onRename={props.onRenameWorkspace}
          workspaces={props.workspaces ?? []}
          onSwitch={props.onSwitch}
          onGone={() => setFrom(undefined)}
        />
      )}
    </Group>
  );
}

/** Your face, which opens its page, with the phone's pen on it; or only your face. */
function YourFaceButton(props: {
  readonly name: string;
  readonly face: SpaceIcon | undefined;
  readonly onOpen: (() => void) | undefined;
  readonly open: boolean;
}) {
  const face = <Avatar name={props.name} kind="person" size="lg" icon={props.face} />;
  const { onOpen } = props;
  if (onOpen === undefined) return face;
  return (
    <button
      type="button"
      className="you-face"
      aria-label={FACE_PICKER_WORDS.yourFace}
      title={FACE_PICKER_WORDS.yourFaceHint}
      aria-current={props.open ? "page" : undefined}
      onClick={onOpen}
      data-testid="profile-face"
    >
      {face}
      <span className="you-face-pen" aria-hidden="true">
        <Icon name="pen" size={11} />
      </span>
    </button>
  );
}

/**
 * The Workspace row's form: the name, an owner's to change, and the workspaces this device holds,
 * one chosen to bring it to the front, as the phone's Workspaces sheet has them.
 */
function WorkspaceForm(props: {
  readonly from: HTMLElement | null;
  readonly workspace: string;
  readonly onRename: ((name: string) => Promise<void>) | undefined;
  readonly workspaces: readonly HeldWorkspace[];
  readonly onSwitch: ((deviceId: string) => void) | undefined;
  readonly onGone: () => void;
}) {
  const { onRename, onSwitch } = props;
  return (
    <FormPage
      title="Workspace"
      from={props.from}
      testId="workspace-form"
      focus={onRename === undefined ? undefined : ".you-workspace-name input"}
      onGone={props.onGone}
    >
      {({ close }) => (
        <>
          {onRename !== undefined && (
            <>
              <div className="you-form-group">
                <NameField
                  label="Workspace name"
                  name={props.workspace}
                  rename={onRename}
                  className="you-workspace-name"
                  testId="workspace-rename"
                />
              </div>
              <p className="you-form-foot">Everyone in it sees the new name, on every device.</p>
            </>
          )}
          {onSwitch !== undefined && props.workspaces.length > 1 && (
            <>
              <h3 className="you-form-h">On this device</h3>
              {/* Buttons, not a radio group: an arrow key passing over one would switch to it. */}
              <div className="you-choices" data-testid="workspace-switch">
                {props.workspaces.map((each) => (
                  <button
                    key={each.deviceId}
                    type="button"
                    className="you-choice"
                    aria-current={each.current ? "true" : undefined}
                    onClick={() => {
                      close();
                      if (!each.current) onSwitch(each.deviceId);
                    }}
                  >
                    <span className="you-choice-lab">
                      <span>{each.label}</span>
                    </span>
                    <span className="you-choice-tick" aria-hidden="true">
                      <Icon name="check" size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </FormPage>
  );
}

const THEME_WORDS = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
] as const satisfies readonly (readonly [Theme, string])[];

/**
 * How this computer looks, in one group (ADR 0176): light, dark or the system's, and under it the
 * colours the faces wear. Both are this computer's alone; the phone chooses its own.
 */
export function Appearance(props: {
  readonly desktop: boolean;
  /** Who you are, for your own face in the previews. */
  readonly me: { readonly name: string; readonly face: SpaceIcon | undefined };
}) {
  const [theme, setTheme] = useState<Theme>(() => storedTheme());
  const [faces, setFaces] = useState<FaceTheme>(() => storedFaces());
  return (
    <Group
      heading="Appearance"
      label="Appearance"
      testId="appearance"
      foot={`Set on ${props.desktop ? "this computer" : "this browser"} only. Soothing and Bright are the colours every face wears: spaces, agents and people.`}
    >
      <div className="you-look">
        <Segmented
          label="Appearance"
          value={theme}
          options={THEME_WORDS}
          onChange={(chosen) => {
            chooseTheme(chosen);
            setTheme(chosen);
          }}
        />
        <FaceThemes
          chosen={faces}
          onChoose={(chosen) => {
            chooseFaces(chosen);
            setFaces(chosen);
          }}
          me={props.me}
        />
      </div>
    </Group>
  );
}
